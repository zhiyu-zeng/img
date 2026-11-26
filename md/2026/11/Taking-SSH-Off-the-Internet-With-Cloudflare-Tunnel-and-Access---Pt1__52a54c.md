---
title: Taking SSH Off the Internet With Cloudflare Tunnel and Access - Pt1
source: https://blog.zsec.uk/ssh-ghost-1/
source_host: blog.zsec.uk
clip_date: 2026-11-26T11:07:14+08:00
trace_id: d8af998c-eb2d-482a-a3e6-d747633c7f4b
content_hash: 49478ac9a114b9122cd4df8da2c0162c4beea47f973c96ffde05ce563890dbb5
status: synced
tags: []
series: null
feed_source: zsec·逆向安全
ai_summary: null
ai_summary_style: null
images_status:
  total: 5
  succeeded: 5
  failed_urls: []
notion_page_id: 42475244-d011-81bb-9fa6-c617b342eb79
ioc: null
---

![Taking SSH Off the Internet With Cloudflare Tunnel and Access - Pt1](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0fd9006087378aeb.jpg)

I've been wanting to write more about SSH lockdown for a while, in one evening I took my blog server from "SSH open to the world on port 22" to "no inbound ports except 443, and only from Cloudflare", with SSH now arriving through a Cloudflare Tunnel behind Zero Trust Access.

I've written about locking down SSH before in [Locking Down SSH the Right Way](https://blog.zsec.uk/locking-down-ssh-the-right-way/), but this time I've taken a different route and used Zero Trust, so the service is never exposed publicly at all. I'll go through it step by step, including the bits I got wrong along the way and some of the main lessons learnt.

The trigger was sshole, Özgün Kültekin's write-up of an OpenSSH bug on musl libc ([github.com/oz9un/sshole](https://github.com/oz9un/sshole?ref=blog.zsec.uk)). On `musl` -based hosts (Alpine, OpenWrt, many Docker images) without PAM, an account whose shadow entry is `*` accepts any password between 257 and 1,024 bytes, because musl's `crypt()` returns `"*"` on failure above 256 bytes and that matches the `*` meant to mean "never matches", and the fix is either OpenSSH 10.6p2 or `PasswordAuthentication no`.

My server wasn't affected, since Ubuntu builds OpenSSH against `glibc` rather than `musl` and password logins were already off, but it was a good prompt to ask why a password prompt faces the internet at all.

It ended up long enough that I've split it into three parts: this one takes SSH off the internet, Part 2 locks down the web origin and adds detection and recovery, and Part 3 checks it all from the outside, goes further, and owns up to the mistakes.

Across the three parts I'm going to cover:

1.  A clean sshd baseline and the config-ordering trap that silently undoes it
2.  SSH through Cloudflare Tunnel + Access, no open port
3.  Closing port 22 while keeping the provider's console as a way back in
4.  Locking the origin so only *your* Cloudflare zone can reach it, plus Ghost admin behind Access
5.  Detection and recovery: auditd, alerts, backups, cloud firewall, patching
6.  Checking the result from outside
7.  Further SSH hardening
8.  The mistakes, including a 16-second outage from one nginx setting

## Starting Point and Goal

The server is a single VPS running my GhostBlog behind Cloudflare, and origin-unmasking techniques turn up often enough that Step 4 treats its IP as already public.

It already had key-only SSH, a host firewall and web ports limited to Cloudflare's IP ranges, so the question was what was still reachable, by whom and from where.

As for cost and time: Cloudflare Tunnel, Access for a handful of users and authenticated origin pulls are all available on Cloudflare's free plan, so beyond the VPS itself none of this costs anything. The SSH side took one evening; the rest grew over the following couple of weeks as I wrote it up and kept finding things to tighten.

| Surface | Before | After |
| --- | --- | --- |
| TCP 22 (SSH) | Open to the internet, rate-limited | Blocked at the cloud firewall unless I open it for the provider's console; day-to-day logins arrive on loopback through Cloudflare Tunnel |
| TCP 80 | Open to Cloudflare ranges | Closed; redirects happen at the Cloudflare edge |
| TCP 443 | Open to Cloudflare ranges, any hostname | Cloudflare ranges + mutual TLS with my own CA, known hostnames only |
| Ghost admin | IP allowlist in nginx | IP allowlist **and** Access login |

The threat model is ordinary for a personal server: internet-wide scanning, credential stuffing, the next sshd bug, and someone pointing their own Cloudflare zone at my origin IP. "Done" means a scan of the origin IP finds nothing, and every way in requires an identity check plus a key or client certificate.

## Step 1: Building My sshd Baseline

While reviewing everything, I learnt that sshd uses the **first** value it reads for most options. On Ubuntu and Debian, `sshd_config` starts with `Include /etc/ssh/sshd_config.d/*.conf` and the drop-ins load in name order, so my hardening file, called `99-hardening.conf`, would only have worked until something dropped in a `50-cloud-init.conf` with `PasswordAuthentication yes`. cloud-init and some packages do exactly that, and because of the load order the `50-` file wins without sshd giving any warning.

**Decide who logs in.** This server has one administrator, so I log in as root, but only with a key or certificate, using `PermitRootLogin prohibit-password`, which means there is no root password for anyone to guess. If more than one person logs in, or you'd rather every root action went through `sudo`, create a named user first and copy your key across before you change anything:

```bash
adduser you                      # pick your own username; set a strong password for sudo
usermod -aG sudo you
install -d -m 700 -o you -g you /home/you/.ssh
install -m 600 -o you -g you /root/.ssh/authorized_keys /home/you/.ssh/authorized_keys
```

Check from a second terminal that `ssh you@your-host` works and that `sudo -v` accepts your password, then use `PermitRootLogin no` in place of `prohibit-password` below. Whichever route you take, keep your original session open until the end of this step so that a mistake doesn't lock you out.

Name your hardening file so it sorts first, and make public key the *only* method:

```yaml
# /etc/ssh/sshd_config.d/00-hardening.conf
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
AuthenticationMethods publickey
PermitEmptyPasswords no
PermitRootLogin prohibit-password
X11Forwarding no
MaxAuthTries 3
```

`AuthenticationMethods publickey` is the belt and braces: even if `PasswordAuthentication` gets flipped back on, no password path can complete a login. Check the syntax, apply it, then ask sshd what it will actually do rather than trusting the files:

```bash
sshd -t && systemctl reload ssh
sshd -T | grep -Ei '^(passwordauthentication|kbdinteractiveauthentication|authenticationmethods|permitrootlogin|usepam) '
```

![Taking SSH Off the Internet With Cloudflare Tunnel and Access - Pt1](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9ae5bfe16de7abc3.png)

sshd -T shows what sshd will actually do, not what the files say: no passwords, no keyboard-interactive, public key only

Then prove it from the outside, where a client that refuses to use keys should be told that only `publickey` is on offer:

```bash
ssh -o PubkeyAuthentication=no -o PreferredAuthentications=password,keyboard-interactive you@your-host
# you@your-host: Permission denied (publickey).
```

![Taking SSH Off the Internet With Cloudflare Tunnel and Access - Pt1](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b967fdfa643ecf90.png)

Refuse to use keys and there's nothing left to try: only publickey

One trap if you use a password manager as your SSH agent is that `MaxAuthTries 3` counts every key offered, so if the agent offers nine keys you're disconnected before it gets to the right one (which I've found several times recently and couldn't work it out). Pin the key per host with `IdentityFile` (the `.pub` is enough) and `IdentitiesOnly yes`.

## Step 2: SSH Through Cloudflare Tunnel and Access

Now the baseline is in place, next up is getting SSH off the open internet altogether. `cloudflared` on the server dials *out* to Cloudflare, so your laptop's SSH reaches the server through Cloudflare after Access has checked who you are. No inbound port needed, and sshd still checks your key, so you need both the identity and the key the diagram below details how it works in practice:

![Taking SSH Off the Internet With Cloudflare Tunnel and Access - Pt1](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/88f74e93a25c3730.png)

Two checks before a shell: an identity check at Cloudflare, then a key at sshd

A shell needs an Access login and then a key, while a direct connection to the origin IP finds no firewall rule and no listener.

Order matters here: **create the Access application before the DNS record**, so the hostname is never live without a login in front of it. Use a random-looking subdomain (`xxxxxxxxxx.example.com`), which isn't a security control on its own, but it costs nothing and keeps the name out of guessable lists.

1.  **Access application** (Zero Trust → Access → Applications → Self-hosted): set the domain to your SSH hostname, keep the session short, add one Allow policy for your email, and connect an MFA-capable identity provider if you can, since the built-in email PIN is only as strong as your email account.
2.  **Tunnel** (Networks → Tunnels → Create, Cloudflared type, remotely managed): map your SSH hostname to `ssh://localhost:22` with a catch-all of `http_status:404`.
3.  **DNS**: a proxied CNAME to `<tunnel-id>.cfargotunnel.com`, which the dashboard creates when you add the public hostname.

**Check it's locked before you use it.** An unauthenticated request should bounce straight to your Access login, so `curl -sI https://xxxxxxxxxx.example.com` should come back with a `302` to `<team>.cloudflareaccess.com`.

![Taking SSH Off the Internet With Cloudflare Tunnel and Access - Pt1](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b2643b8dd91a13a2.png)

No Access login, no SSH: an unauthenticated request bounces straight to the Cloudflare Access login

**Connector on the server**, from Cloudflare's signed apt repo:

```bash
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg -o /usr/share/keyrings/cloudflare-main.gpg
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" > /etc/apt/sources.list.d/cloudflared.list
apt update && apt install cloudflared
cloudflared service install <tunnel token>
```

`service install` writes the token into the unit's `ExecStart` line, where any local user can read it with `systemctl show cloudflared -p ExecStart`, so on cloudflared 2025.4.0+ move the token into a root-only file:

```bash
install -d -m 700 /etc/cloudflared
install -m 600 /dev/null /etc/cloudflared/token
printf '%s' '<tunnel token>' > /etc/cloudflared/token
sed -i 's|--token [^ ]*|--token-file /etc/cloudflared/token|' /etc/systemd/system/cloudflared.service
systemctl daemon-reload && systemctl restart cloudflared
systemctl show cloudflared -p ExecStart   # should show --token-file, no token
```

Type a space before the `printf` command to keep the token out of shell history (bash does this when `HISTCONTROL` includes `ignorespace`), and if the token has already been exposed, rotate it in the dashboard.

**Make cloudflared check the Access token too.** Turn on Protect with Access with your team name and application AUD tag, so that if the Access app were ever deleted, the tunnel itself would still refuse unauthenticated traffic. In the dashboard it lives under the public hostname's Additional application settings → Access, and through the API it's the `originRequest.access` block in the tunnel's configuration:

```json
{"ingress": [
  {"hostname": "xxxxxxxxxx.example.com", "service": "ssh://localhost:22",
   "originRequest": {"access": {"required": true, "teamName": "<your-team-name>",
                                 "audTag": ["<application AUD>"]}}},
  {"service": "http_status:404"}
]}
```

On the laptop, install `cloudflared` (`brew install cloudflared` on a Mac, or your package manager) and add:

```
Host blog-tunnel
  HostName xxxxxxxxxx.example.com
  User root                 # or your named user
  ProxyCommand cloudflared access ssh --hostname %h
  IdentityFile ~/.ssh/your-key.pub
  IdentitiesOnly yes
```

The first `ssh blog-tunnel` opens a browser for the Access login, and it's worth checking the host key fingerprint matches the one you already know for the server's IP. Access can also issue short-lived SSH certificates tied to your identity, which is what I moved to once the tunnel was working (see Short-Lived Certificates From Access in Part 3). If you do the same, that Host block gets replaced, because `IdentitiesOnly yes` with a fixed `IdentityFile` stops the certificate from ever being offered.

**Password manager** funtimes**.** My first tunnel login failed with `Permission denied (publickey)` even though Cloudflare and sshd were both working, because my laptop never offered the right key: my password manager's SSH agent matched keys to hosts, and the key was tied to the server's IP rather than the new hostname. Add the tunnel hostname to the key's host rules, or set `IdentityFile` by hand as above.

## Step 3: Close Port 22 Without Losing the Console

With the tunnel working, the last job in this part is closing port 22 for good, without cutting off your own way back in. Only do this once a tunnel login has worked, and check sshd's log to be sure, since tunnel logins show up as coming from `127.0.0.1`:

```bash
journalctl -u ssh | grep 'Accepted publickey for .* from 127.0.0.1'
```

The unit is `ssh` on Debian and Ubuntu and `sshd` on most other distributions. Before going further, make sure your provider's web console works, because it's your way back in if the tunnel breaks and you want to ensure nothing goes wrong to lock yourself out of SSH.

**Check how your provider's console connects.** Some providers use a serial console that never touches the network, while others, mine included, SSH into the server's public address, and removing the public listener on a provider like that breaks the console exactly when you need it most. So I kept it and moved the access decision to the cloud firewall:

-   The cloud firewall (see Step 5 in Part 2) has no rule for port 22, so nothing reaches it day to day. When I need the console, I add a temporary rule for the provider's console addresses and remove it again afterwards.
-   The host firewall keeps its rate-limited rule for 22 as a second layer, and fail2ban's sshd jail stays on to watch it.
-   Tunnel logins arrive on loopback, so they never depend on either rule.

One ordering catch: the cloud firewall itself doesn't get built until Step 5 in Part 2, so if you're working through this part on its own, create it now with inbound 443 from Cloudflare's ranges and nothing for 22, otherwise port 22 is still reachable from the internet behind nothing more than ufw's rate limit.

If your provider uses a serial console, remove the host rule too; the delete has to match the rule as it was added (`limit 22`, `limit 22/tcp` or `limit OpenSSH`), and existing sessions survive because ufw keeps established connections open:

```bash
ufw delete limit 22
ufw status   # no 22 left
```

**Then tell sshd exactly where to listen.** Loopback serves the tunnel and the public address is only there for the console, so leave that line out if your console doesn't need it:

```yaml
# appended to /etc/ssh/sshd_config.d/00-hardening.conf
ListenAddress 127.0.0.1
ListenAddress ::1
ListenAddress <origin-ip>     # only if your provider's console connects over SSH
AllowTcpForwarding no
AllowAgentForwarding no
AllowStreamLocalForwarding no
LoginGraceTime 30
```

**The socket-activation bug:** Ubuntu 22.10 and later start `sshd` through systemd's `ssh.socket`, which owns the listening socket, so `systemctl reload ssh` changes nothing about *where* it listens. A generator turns `ListenAddress` into the socket's `ListenStream` lines, and that only happens on a daemon reload:

```bash
sshd -t && systemctl daemon-reload && systemctl restart ssh.socket
ss -tlnp sport = :22    # expect 127.0.0.1:22, [::1]:22 and <origin-ip>:22 if you kept it
```

Only turn off TCP forwarding if you don't use `ssh -L` (for example, to reach a database). Every tunnel connection comes from loopback, so fail2ban can't tell tunnel users apart, but Access is the gate on that path anyway, so keep loopback in fail2ban's `ignoreip` (the refresh script in 4a does this), and if you went fully loopback, turn the sshd jail off:

```
# /etc/fail2ban/jail.local
[sshd]
enabled = false
```

Run `systemctl restart fail2ban` and check `fail2ban-client status` no longer lists `sshd`, but keep any nginx jails, since they still see real visitor IPs through `set_real_ip_from`.

That's SSH off the internet. The only way to a shell now is an Access login at Cloudflare plus a key at sshd, port 22 is shut at the cloud firewall, and the provider's console is still there if the tunnel ever falls over. The web side still trusts anything arriving from Cloudflare's IP ranges though, including someone else's Cloudflare zone pointed at my origin, which is where Part 2 picks up.

Quick recap, in this part we've:

-   Built an sshd baseline that a later drop-in can't quietly undo
-   Moved SSH behind Cloudflare Tunnel and Access, with no inbound port
-   Closed port 22 while keeping the provider's console as a way back in

**Next:** [Part 2: Origin Lockdown, Detection and Service Hardening](https://blog.zsec.uk/ssh-ghost-2/)
