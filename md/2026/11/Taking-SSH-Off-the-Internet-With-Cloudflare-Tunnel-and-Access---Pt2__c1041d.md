---
title: Taking SSH Off the Internet With Cloudflare Tunnel and Access - Pt2
source: https://blog.zsec.uk/ssh-ghost-2/
source_host: blog.zsec.uk
clip_date: 2026-11-26T11:05:58+08:00
trace_id: 8d68418b-d081-4696-adb2-c34ce5a2a50b
content_hash: 283b1e347011c464a380c296aec001504ee535ff973dc3c090ab3d7fbd2e2f75
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
notion_page_id: 42475244-d011-81d0-8efd-d0afd728a43d
ioc: null
---

![Taking SSH Off the Internet With Cloudflare Tunnel and Access - Pt2](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5916540eaa29003c.jpg)

If you haven't read Part 1, check it out first, as this is a continuation and picks up more details feeding into fixing up SSH and my VPS lockdown as a three part series.

[Part 1](https://blog.zsec.uk/ssh-ghost-1/) closed the SSH port and moved everything behind Cloudflare Tunnel, so this part picks up the web side: locking the origin so only my Cloudflare zone can reach it, adding detection so I'd actually know if something went wrong, and sandboxing the services that sit behind it.

In this part I'm going to cover:

-   Locking the web origin so only my own Cloudflare zone can reach it
-   Detection and recovery: auditd, alerts, off-site backups, a cloud firewall and patching
-   Sandboxing the services with systemd
-   Fail2ban that actually works behind Cloudflare
-   Hardening the analytics container

![Taking SSH Off the Internet With Cloudflare Tunnel and Access - Pt2](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9a1ec8f9a2e16f65.png)

Only my Cloudflare zone gets through: a direct hit stops at the firewall, someone else's zone stops at nginx

## Step 4: Lock the Web Origin to Your Cloudflare Zone

Allowing only Cloudflare's IP ranges proves traffic came *through Cloudflare*, but not whose account sent it. Anyone can point their own Cloudflare zone at your origin IP and skip your WAF, rate limits and cache rules.

### 4a. Keep the Cloudflare IP List Current

A weekly systemd timer fetches Cloudflare's IP ranges and syncs them into nginx `set_real_ip_from`, ufw 443 rules, and fail2ban's `ignoreip`. A bad fetch must never empty your allowlist, so every sanity check runs before anything changes.

1.  The script tags its ufw rules with the comment `cloudflare` and only ever removes tagged rules. If your existing 443 rules have no comment, run the script once, check `ufw status` shows the tagged rules, then delete the old untagged ones by number (`ufw status numbered`, then `ufw delete <n>`, highest number first).
2.  If your site config already has `set_real_ip_from` lines, remove them so the generated file is the only list.

Add the service and timer:

```toml
# /etc/systemd/system/cf-ips-refresh.service
[Unit]
Description=Refresh Cloudflare IP ranges
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/cf-ips-refresh
```

```toml
# /etc/systemd/system/cf-ips-refresh.timer
[Unit]
Description=Weekly Cloudflare IP refresh

[Timer]
OnCalendar=weekly
RandomizedDelaySec=6h
Persistent=true

[Install]
WantedBy=timers.target
```

Save the script as `/usr/local/sbin/cf-ips-refresh` and `chmod 700` it:

```bash
#!/bin/bash
# /usr/local/sbin/cf-ips-refresh
set -euo pipefail
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# 1. Fetch both lists. awk drops blank lines and adds the missing final newline.
curl -fsS -m 20 https://www.cloudflare.com/ips-v4 | awk 'NF' > "$tmp/v4"
curl -fsS -m 20 https://www.cloudflare.com/ips-v6 | awk 'NF' > "$tmp/v6"

# 2. Sanity checks: enough ranges, and every line is a CIDR. Any failure exits
#    here, before anything on the server changes.
[ "$(wc -l < "$tmp/v4")" -ge 5 ] || { echo "too few v4 ranges" >&2; exit 1; }
[ "$(wc -l < "$tmp/v6")" -ge 3 ] || { echo "too few v6 ranges" >&2; exit 1; }
if grep -qvE '^[0-9.]+/[0-9]+$' "$tmp/v4"; then echo "bad v4 line" >&2; exit 1; fi
if grep -qvE '^[0-9a-f:]+/[0-9]+$' "$tmp/v6"; then echo "bad v6 line" >&2; exit 1; fi
cat "$tmp/v4" "$tmp/v6" > "$tmp/all"

# 3. nginx: trust CF-Connecting-IP only from Cloudflare. Roll back if nginx -t fails.
conf=/etc/nginx/conf.d/cloudflare-realip.conf
{ sed 's/.*/set_real_ip_from &;/' "$tmp/all"; echo 'real_ip_header CF-Connecting-IP;'; } > "$tmp/realip.conf"
[ -f "$conf" ] && cp "$conf" "$tmp/realip.old"
install -m 644 "$tmp/realip.conf" "$conf"
if ! nginx -t -q; then
  if [ -f "$tmp/realip.old" ]; then cp "$tmp/realip.old" "$conf"; else rm -f "$conf"; fi
  echo "nginx -t failed, rolled back" >&2; exit 1
fi
systemctl reload nginx

# 4. ufw: allow 443 from each range, then remove tagged ranges that have gone.
while read -r c; do
  ufw allow proto tcp from "$c" to any port 443 comment cloudflare > /dev/null
done < "$tmp/all"
ufw status | grep '# cloudflare' | grep -oE '[0-9a-f.:]+/[0-9]+' | sort -u |
while read -r c; do
  grep -qxF "$c" "$tmp/all" || ufw delete allow proto tcp from "$c" to any port 443 > /dev/null
done

# 5. fail2ban: never ban Cloudflare's own addresses (skipped until fail2ban is installed).
if [ -d /etc/fail2ban/jail.d ]; then
  { echo '[DEFAULT]'; echo "ignoreip = 127.0.0.1/8 ::1 $(tr '\n' ' ' < "$tmp/all")"; } \
    > /etc/fail2ban/jail.d/cloudflare-ignoreip.conf
  fail2ban-client reload > /dev/null
fi
```

With all three files in place, run it once by hand and enable the timer:

```bash
systemctl daemon-reload
systemctl start cf-ips-refresh.service && journalctl -u cf-ips-refresh -n 20
systemctl enable --now cf-ips-refresh.timer
systemctl list-timers cf-ips-refresh.timer
```

A failed run leaves the previous rules in place and shows up as a failed unit in `systemctl --failed`.

### 4b. Reject Hostnames You Don't Serve

If your site's server block is the `default_server`, any Host or SNI gets your site, so add a catch-all that refuses at the TLS handshake:

```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    return 444;
}
server {
    listen 443 ssl default_server;
    listen [::]:443 ssl default_server;
    server_name _;
    ssl_reject_handshake on;
}
```

**Before you do, find every name that really points at the box.** I found an old domain CNAMEd to the blog on a zone set to **Flexible SSL**, which meant Cloudflare was fetching it over plain HTTP on port 80, so closing 80 would have quietly broken it. The fix was a Cloudflare redirect rule on that zone (`concat("https://blog.example.com", http.request.uri.path)`, 301), which I confirmed by checking the origin access log for a unique marker path, and only after that could port 80 close.

To deploy the catch-all:

1.  Save the two `server` blocks as `/etc/nginx/conf.d/00-catch-all.conf`, which Debian and Ubuntu include inside the `http` block.
2.  Remove `default_server` from your site's own `listen` lines, because nginx refuses to start with two default servers on the same port.
3.  Close port 80 by deleting its allow rules: `ufw status numbered`, then `ufw delete <n>` for each port 80 rule, highest number first.

Apply and test from the server:

```bash
nginx -t && systemctl reload nginx
curl -sk --resolve wrong.example:443:127.0.0.1 https://wrong.example/ ; echo "exit $?"   # handshake refused, non-zero exit
curl -sk --resolve blog.example.com:443:127.0.0.1 -o /dev/null -w '%{http_code}\n' https://blog.example.com/   # 200
```

### 4c. Authenticated Origin Pulls with Your Own CA

This is the real fix for "someone else's zone": Cloudflare presents a client certificate to your origin, and nginx refuses any connection without it. **Use your own CA** though, because Cloudflare's shared certificate is presented for every customer and proves nothing about which zone sent the traffic.

```bash
D=/etc/nginx/ssl/aop; install -d -m 700 $D; cd $D
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -days 3650 \
  -subj "/CN=my origin-pull CA" -keyout ca.key -out ca.pem
openssl req -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes \
  -subj "/CN=cloudflare origin-pull" -keyout client.key -out client.csr
printf 'extendedKeyUsage=clientAuth\nkeyUsage=digitalSignature\n' > ext.cnf
openssl x509 -req -in client.csr -CA ca.pem -CAkey ca.key -CAcreateserial -days 3650 \
  -extfile ext.cnf -out client.pem
```

**Stage 1: log the certificate without enforcing.**

```nginx
# http block (a file in /etc/nginx/conf.d works)
log_format aop '$time_iso8601 $remote_addr $ssl_client_verify "$ssl_client_s_dn"';

# your site's server block for 443
ssl_client_certificate /etc/nginx/ssl/aop/ca.pem;
ssl_verify_client optional_no_ca;
access_log /var/log/nginx/aop.log aop;
access_log /var/log/nginx/access.log;   # keep the main log, see What Bit Me in Part 3
```

Run `nginx -t && systemctl reload nginx`, and the log will show `NONE` until Cloudflare starts sending the certificate. Use `optional_no_ca` rather than `optional` here (What Bit Me in Part 3 explains why), and if you want to test the origin directly, `curl --cert client.pem --key client.key --resolve host:443:127.0.0.1 https://host/` does the job (add `-k` if nginx serves a Cloudflare Origin CA cert).

Then switch Cloudflare over, in this order:

1.  **Set SSL/TLS to Full (strict)**, since origin pulls need Full or stricter, and Full (strict) only works if the origin already has a valid certificate (a Cloudflare Origin CA certificate is the easy option), otherwise visitors get 526 errors.
2.  **Upload the client certificate** under SSL/TLS → Origin Server → Authenticated Origin Pulls tab → Upload certificate (the zone-level section), paste `client.pem` and `client.key`, and switch it on.
3.  **Move `ca.key` off the server** (nginx only needs `ca.pem`).

**Watch the log until every request carries your certificate:**

```bash
tail -n 50 -f /var/log/nginx/aop.log
cut -d' ' -f3- /var/log/nginx/aop.log | sort | uniq -c   # summary of what the edge sent
```

You want `SUCCESS "CN=cloudflare origin-pull"` on every line; any `FAILED` lines with a different CN are Cloudflare's shared certificate, which the edge keeps sending for a few minutes after the upload shows `active`.

**Enforce.** Start a loop against the live site in a second terminal:

```bash
while sleep 1; do curl -s -o /dev/null -w '%{http_code}\n' https://blog.example.com/; done
```

Then change `ssl_verify_client optional_no_ca;` to `ssl_verify_client on;` and run `nginx -t && systemctl reload nginx`. If you see any status other than 200, roll back to `optional_no_ca` and look at the log again.

### 4d. Put Ghost Admin Behind Access

Ghost admin is at `/ghost/`, but the front end calls `/ghost/api/content/` for search and theme features, so blocking all of `/ghost` would break things for readers, and the way round it is two Access applications:

1.  **Path `/ghost`**: one *Allow* policy for your email, the same as the SSH app.
2.  **Path `/ghost/api/content`**: one *Bypass* policy for *Everyone*. Access applies the most specific path that matches, so readers reach the Content API without a login.

Anything that calls the Admin API outside a browser (deploy scripts, backups) needs an Access service token with a *Service Auth* policy, sending the `CF-Access-Client-Id` and `CF-Access-Client-Secret` headers. Test in a private window: `/ghost/` should bounce to Access while search and signup still work.

### 4e. HTTPS and HSTS at the Edge

With port 80 closed, turn on *Always Use HTTPS* (SSL/TLS → Edge Certificates) so plain-HTTP visitors get a redirect instead of an error.

For HSTS preloading ([hstspreload.org](https://hstspreload.org/?ref=blog.zsec.uk)), set `max-age` to at least 31536000 with `includeSubDomains` and `preload`. Check that nothing under the zone still needs plain HTTP, and treat preloading as permanent since removal takes months.

## Step 5: Detection and Recovery

None of that matters much if I can't tell when someone gets in, or can't get the blog back when something breaks.

**auditd with a small, high-signal ruleset.** Watch the files that control access and log every command run as root:

```bash
# /etc/audit/rules.d/50-host.rules
-w /etc/ssh/sshd_config -p wa -k sshd
-w /etc/ssh/sshd_config.d/ -p wa -k sshd
-w /etc/ssh/ca.pub -p wa -k sshd          # the Access CA from Part 3
-w /etc/ssh/principals/ -p wa -k sshd
-w /root/.ssh/ -p wa -k ssh-keys
-w /etc/sudoers -p wa -k sudoers
-w /etc/sudoers.d/ -p wa -k sudoers
-w /etc/passwd -p wa -k identity
-w /etc/shadow -p wa -k identity
-w /etc/cron.d/ -p wa -k cron
-w /var/spool/cron/ -p wa -k cron
-w /etc/systemd/system/ -p wa -k systemd
-w /etc/ld.so.preload -p wa -k preload
-w /etc/nginx/ -p wa -k nginx
-w /etc/ufw/ -p wa -k firewall
-w /etc/pam.d/ -p wa -k pam
-w /etc/cloudflared/ -p wa -k cloudflared
-a always,exit -F arch=b64 -S execve -F euid=0 -F auid>=0 -F auid!=unset -k root-cmd
-a always,exit -F arch=b32 -S execve -F euid=0 -F auid>=0 -F auid!=unset -k root-cmd
```

Add a watch on `~/.ssh/` for your login user, then install and load the rules:

```bash
apt install auditd
# save the rules above as /etc/audit/rules.d/50-host.rules, then:
augenrules --load
auditctl -l | head                       # rules are active
touch /etc/ssh/sshd_config.d/zz-test && rm /etc/ssh/sshd_config.d/zz-test
ausearch -k sshd -i --start recent | tail -n 5   # the test shows up
```

Keep the `b32` line even on 64-bit, otherwise a 32-bit binary runs as root unlogged. Cap the logs in `/etc/audit/auditd.conf` (`max_log_file = 50`, `num_logs = 8`, `max_log_file_action = ROTATE`). After that, `ausearch -k root-cmd -i` answers "who ran what, when" (What Bit Me in Part 3 has the night it paid off).

**Alerts.** There are two worth having, one on every successful SSH login and one for when the tunnel goes down, since the tunnel is now the only way in.

For logins, sshd's journal is the safest place to hook in, since a mistake there can't lock you out the way a broken PAM module can, and this script posts each login to a Slack-style webhook, building the JSON with `jq` (so `apt install jq` first if you don't have it):

```bash
#!/bin/sh
# /usr/local/bin/ssh-login-alert
WEBHOOK="$(cat /etc/ssh-login-alert/webhook)"   # root-only file, chmod 600
journalctl -u ssh -f -n0 -o cat |
grep --line-buffered 'Accepted publickey' |
while read -r line; do
  jq -n --arg t "$(hostname): $line" '{text: $t}' |
    curl -fsS -m 10 -H 'Content-Type: application/json' -d @- "$WEBHOOK"
done
```

```toml
# /etc/systemd/system/ssh-login-alert.service
[Unit]
Description=Post SSH logins to a webhook
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=/usr/local/bin/ssh-login-alert
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

`chmod 700` the script, then `systemctl enable --now ssh-login-alert`, and keep the webhook URL in a root-only file, the same as the tunnel token, before testing it by logging in through the tunnel.

For the tunnel, add a Cloudflare notification (Notifications → tunnel health alert) so it fires even when the server itself is down, and for a local check, pin `cloudflared` 's metrics port:

```bash
sed -i 's| tunnel run | tunnel --metrics 127.0.0.1:20241 run |' /etc/systemd/system/cloudflared.service
systemctl daemon-reload && systemctl restart cloudflared
curl -fsS http://127.0.0.1:20241/ready   # 200 with a JSON body while the tunnel is connected
```

A timer checks every five minutes and posts to the webhook on failure:

```bash
#!/bin/sh
# /usr/local/bin/tunnel-ready-check
curl -fsS -m 5 http://127.0.0.1:20241/ready > /dev/null && exit 0
jq -n --arg t "$(hostname): cloudflared is not ready" '{text: $t}' |
  curl -fsS -m 10 -H 'Content-Type: application/json' -d @- "$(cat /etc/ssh-login-alert/webhook)"
```

```toml
# /etc/systemd/system/tunnel-ready-check.service
[Service]
Type=oneshot
ExecStart=/usr/local/bin/tunnel-ready-check
```

```toml
# /etc/systemd/system/tunnel-ready-check.timer
[Timer]
OnBootSec=5min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
```

`chmod 700` the script, then `systemctl daemon-reload && systemctl enable --now tunnel-ready-check.timer`, and test it by stopping `cloudflared` from the provider's web console, bearing in mind this will end your tunnel session.

I send both of these to ntfy rather than a webhook, so they turn up as push notifications on my phone. It's the same scripts with the `curl` swapped for `curl -H "Title: SSH login" -d "$msg" https://ntfy.sh/<your-topic>`. Keep the messages free of IPs, names and certificate IDs though, because anyone who knows an ntfy.sh topic name can read it, so pick a long random topic or run your own ntfy server.

I also kept an older PAM hook (`pam_exec`, marked `optional`) that emails me when a new shell session opens, at most once every 10 minutes per user and source. It forks and always exits 0, so it can never block a login, and the email makes a handy record alongside the push. If you do go the PAM route, `optional` and a guaranteed exit 0 are the two things that keep it from locking you out.

**Backups, local and off-site.** A nightly dump on the same server catches mistakes but doesn't survive losing the disk, which is where `restic` comes in: it encrypts, deduplicates and ships everything to any S3-compatible bucket.

1.  **Create the bucket** with a credential limited to that bucket. To stop a compromised box wiping your history, use versioning with a lifecycle rule that expires old versions, or a retention lock shorter than your `--keep` policy, because a lock that outlives it makes `restic forget --prune` fail.
2.  **Initialise** once the env file below is in place: `apt install restic`, then `. /etc/restic/env && restic init`.
3.  **Schedule** with a daily timer (`ExecStart=/usr/local/sbin/blog-backup`, `OnCalendar=daily`, `RandomizedDelaySec=1h`), run once by hand and check `restic snapshots`.

**Test a restore on another machine**, using the same env file and passphrase:

```bash
restic snapshots
restic restore latest --target ./restore-test
gunzip -t ./restore-test/var/backups/blog/db.sql.gz && echo "dump ok"
```

**Backup script** (`/usr/local/sbin/blog-backup`, `chmod 700`):

```bash
#!/bin/bash
# /usr/local/sbin/blog-backup
set -euo pipefail
. /etc/restic/env
GHOST_DIR=/path/to/ghost          # your Ghost install directory
install -d -m 700 /var/backups/blog
# ghost_db = your Ghost database name (ghost-cli calls it <site>_prod; check config.production.json)
mysqldump --defaults-extra-file=/etc/restic/my.cnf --single-transaction --no-tablespaces ghost_db \
  | gzip > /var/backups/blog/db.sql.gz
restic backup --tag nightly \
  /var/backups/blog \
  "$GHOST_DIR/config.production.json" \
  "$GHOST_DIR/content" \
  /etc/nginx /etc/ssh /etc/systemd/system /etc/cloudflared
restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
```

The backup includes secrets (the tunnel token, the origin-pull key, Ghost's config), which is fine because restic encrypts everything before upload.

**Store the secrets in root-only files:**

```bash
install -d -m 700 /etc/restic
install -m 600 /dev/null /etc/restic/password   # put a long random passphrase in here
install -m 600 /dev/null /etc/restic/my.cnf     # [client] user=backup / password=...
install -m 600 /dev/null /etc/restic/env
```

```bash
# /etc/restic/env
export RESTIC_REPOSITORY="s3:https://<s3-endpoint>/<bucket>"
export RESTIC_PASSWORD_FILE=/etc/restic/password
export AWS_ACCESS_KEY_ID="<key id>"
export AWS_SECRET_ACCESS_KEY="<secret>"
```

**Save the restic passphrase in your password manager as well**, because without it the backups can't be decrypted, and the copy on the server goes when the server does.

**Create a read-only MySQL user for backups**, so the backup job never holds Ghost's own database password:

```sql
CREATE USER 'backup'@'localhost' IDENTIFIED BY '<long random password>';
GRANT SELECT, SHOW VIEW, TRIGGER, LOCK TABLES ON ghost_db.* TO 'backup'@'localhost';
-- ghost_db: your Ghost database name, as above
```

**Cloud firewall.** If your provider offers one, mirror the host rules at the network level with inbound TCP 443 from Cloudflare ranges only. It filters before packets ever reach the server, so a broken host rule or a container publishing a port can't expose anything, and since the tunnel connects outbound it doesn't need an inbound rule at all.

1.  Create the firewall with inbound TCP 443 from each Cloudflare range, nothing else inbound.
2.  Attach it, and if your console connects over SSH, practise adding a temporary rule for the console's source addresses.
3.  Run the outside checks in Step 6 (Part 3).
4.  Add a step to `cf-ips-refresh` that updates the firewall via the provider's API.

**Patching without babysitting.** Unattended upgrades with automatic reboots mean kernel and libc fixes actually get applied rather than sitting there waiting for you to remember them:

```bash
apt install unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades     # answer yes
```

```ruby
# /etc/apt/apt.conf.d/52unattended-upgrades-local
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "03:00";   // pick a quiet hour for your traffic, in the server's time zone
```

Check it with `unattended-upgrade --dry-run --debug`, and before relying on automatic reboots, reboot once by hand and confirm everything comes back (services, containers, tunnel).

## Systemd Hardening

Now the doors are locked and watched, next up is limiting what the services behind them can do if something does get in. Ghost runs as the `ghost` user, but the default systemd unit has no sandboxing at all, so a drop-in adds some defence in depth:

```toml
# /etc/systemd/system/ghost_blog-example-com.service.d/hardening.conf
# (ghost-cli names the unit ghost_<your-domain-with-dashes>; check with: systemctl list-units 'ghost_*')
[Service]
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=/var/www/ghost /tmp
PrivateTmp=true
NoNewPrivileges=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
```

A separate drop-in caps memory at 1GB (`MemoryMax=1G`, `MemoryHigh=900M`) so a runaway Node process can't OOM the host.

**Don't blindly copy this to MySQL.** I tried and broke `sd_notify`: `NoNewPrivileges=true` prevents the notification socket write, so systemd hangs in `activating` while MySQL is actually running quite happily. Ubuntu's upstream `mysql.service` already ships most of these directives anyway, so check what your upstream unit does before adding a drop-in of your own.

nginx is a different story, and I got this wrong in the first draft. I'd assumed the packaged unit was already sandboxed, but neither Ubuntu's nor nginx.org's ships `ProtectSystem` or any of the rest, so the `ReadWritePaths=/etc/nginx/conf.d` drop-in I'd added for fail2ban did nothing at all. `systemd-analyze security nginx` scored it 9.6, UNSAFE, and this drop-in gets it down to 2.6:

```toml
# /etc/systemd/system/nginx.service.d/hardening.conf
[Service]
# Validate config before start and before reload (nginx.org's unit just sends HUP,
# so a broken config would "reload" successfully and silently keep the old one).
ExecStartPre=/usr/sbin/nginx -t -q
ExecReload=
ExecReload=/usr/sbin/nginx -t -q
ExecReload=/bin/sh -c "/bin/kill -s HUP $(/bin/cat /run/nginx.pid)"

ProtectSystem=strict
ReadWritePaths=/var/log/nginx /var/cache/nginx /var/lib/nginx /run
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectKernelLogs=true
ProtectControlGroups=true
ProtectClock=true
ProtectHostname=true
ProtectProc=invisible
NoNewPrivileges=true
RestrictSUIDSGID=true
RestrictNamespaces=true
RestrictRealtime=true
LockPersonality=true
MemoryDenyWriteExecute=true
RemoveIPC=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
SystemCallArchitectures=native
SystemCallFilter=@system-service
SystemCallErrorNumber=EPERM
CapabilityBoundingSet=CAP_NET_BIND_SERVICE CAP_SETUID CAP_SETGID CAP_CHOWN CAP_DAC_OVERRIDE CAP_KILL
UMask=0027
```

The master process still runs as root, since it binds 443, opens logs owned by `www-data` and drops privileges for the workers, so the capability set is just the handful it needs. `CAP_KILL` is in there because root can't signal the `www-data` workers without it, and `CAP_DAC_OVERRIDE` because the logs belong to `www-data`. Writes are limited to logs, cache, temp files and the PID file. fail2ban writes its deny file into `conf.d/` from its own process, so nginx never needed write access there - the old drop-in was wrong twice over. The `ExecReload` lines put back the config test that nginx.org's unit dropped (more on the switch in Part 3), so `systemctl reload nginx` with a broken config now fails loudly instead of quietly carrying on with the old one.

Sandboxing needs a full `systemctl restart nginx` rather than a reload, and afterwards it's worth checking the things it could break: logs still reopen on `USR1`, the proxy cache still writes, a deliberately broken config gets refused on reload, and fail2ban still sees requests.

## Fail2ban with Cloudflare Edge Banning

Next up is fail2ban, which needed a bit of rethinking once everything sat behind Cloudflare. Standard fail2ban with iptables is useless there, since the real client IP is in the logs but never in a packet header the kernel can filter, so the fix has two layers:

### Layer 1: nginx deny

The `nginx-deny` action writes IPs into `/etc/nginx/conf.d/zz-fail2ban-deny.conf` and reloads nginx, which catches anything already inside the Cloudflare network (the rare request that somehow reaches the origin directly).

The action is my own rather than a stock one, and it validates with `nginx -t` before every reload, rolling the deny file back if it ever breaks the config, because a malformed deny file would otherwise take down every future reload:

```bash
# /etc/fail2ban/action.d/nginx-deny.conf
[Definition]
denyfile = /etc/nginx/conf.d/zz-fail2ban-deny.conf
_apply = if nginx -t >/dev/null 2>&1; then \
             systemctl reload nginx; \
         else \
             cp -f "<denyfile>.bak" "<denyfile>"; \
             echo "nginx-deny: config test FAILED, rolled back and did NOT reload" >&2; \
             exit 1; \
         fi
actionstart = touch "<denyfile>"
              chmod 644 "<denyfile>"
actionstop = cp -f "<denyfile>" "<denyfile>.bak"
             : > "<denyfile>"
             %(_apply)s
actioncheck =
actionban = cp -f "<denyfile>" "<denyfile>.bak"
            grep -qxF "deny <ip>;" "<denyfile>" || echo "deny <ip>;" >> "<denyfile>"
            %(_apply)s
actionunban = cp -f "<denyfile>" "<denyfile>.bak"
              grep -vxF "deny <ip>;" "<denyfile>.bak" > "<denyfile>" || :
              %(_apply)s
```

### Layer 2: Cloudflare Access Rules API

The `cloudflare-token` action pushes each ban to the Cloudflare zone's firewall access rules, so the request is blocked at the edge before it ever reaches the origin.

```
# In each jail:
action = nginx-deny
         cloudflare-token[cftoken="%(cftoken)s", cfzone="%(cfzone)s"]
```

The API token is scoped to `Zone.Firewall Services` for the single zone, stored in a mode-600 file in `jail.d/`.

**Gotcha: the stock unban action is broken.** The upstream `cloudflare-token.conf` uses `--data-urlencode` on a GET, which curl sends as a body rather than as query parameters, so the API ignores the filters, the unban silently fails and the rules just pile up, which this override fixes:

```bash
# /etc/fail2ban/action.d/cloudflare-token.local
[Definition]
actionunban = id=$(curl -s -X GET \
    "<_cf_api_url>?mode=<cfmode>&notes=Fail2Ban+<name>&configuration.target=<cftarget>&configuration.value=<ip>" \
    <_cf_api_prms> \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['result'][0]['id'] if d.get('result') else '')" 2>/dev/null)
    if [ -z "$id" ]; then echo "<name>: id for <ip> cannot be found"; exit 0; fi; \
    curl -s -X DELETE "<_cf_api_url>/$id" <_cf_api_prms> --data '{"cascade": "none"}'
```

A couple of other fail2ban traps:

-   `backend` MUST be set to `auto` (or `polling` / `inotify`) in the file-based nginx jails. Ubuntu's default is `systemd`, which makes those jails scan the journal and silently ignore `logpath`, so the jail starts, reports zero failures forever and looks healthy while protecting nothing. Leave the sshd jail on `systemd` though, especially on hosts without `/var/log/auth.log`, where switching it to a file backend stops it starting at all.
-   Cloudflare's edge IPs must be in `ignoreip`, because if `real_ip` ever stops applying, every request appears to come from a Cloudflare edge address, and without this your jails would ban the edges and take the site offline.

### The Jails

| Jail | What it catches | Threshold | Ban time |
| --- | --- | --- | --- |
| `nginx-secrethunt` | /.env, /.git, wp-config, phpinfo, graphql probes | 2 hits in 1h | 1 day |
| `nginx-limit-req` | Clients tripping the 30r/s rate limit 10+ times | 10 in 10m | 1 hour |
| `sshd` | SSH brute force on the console path (tunnel logins come from loopback and are ignored) | 5 in 10m | 1 hour |

The two web jails live in a `jail.d` file of their own, with the Cloudflare token and zone ID in a separate mode-600 file so the jail config itself holds no secrets:

```ruby
# /etc/fail2ban/jail.d/00-cloudflare-creds.local   (chmod 600)
[DEFAULT]
cftoken = <API token scoped to Zone.Firewall Services>
cfzone  = <zone ID>

# /etc/fail2ban/jail.d/zz-nginx-web.local
# ignoreip comes from the [DEFAULT] file the 4a script writes; setting ignoreip in a
# jail replaces that list rather than adding to it.
[nginx-secrethunt]
enabled  = true
backend  = auto
port     = http,https
filter   = nginx-secrethunt
logpath  = /var/log/nginx/access.log
maxretry = 2
findtime = 1h
bantime  = 1d
action   = nginx-deny
           cloudflare-token[cftoken="%(cftoken)s", cfzone="%(cfzone)s"]

[nginx-limit-req]
enabled  = true
backend  = auto
port     = http,https
filter   = nginx-limit-req
logpath  = /var/log/nginx/error.log
maxretry = 10
findtime = 10m
bantime  = 1h
action   = nginx-deny
           cloudflare-token[cftoken="%(cftoken)s", cfzone="%(cfzone)s"]
```

`nginx-secrethunt` is a custom filter for the usual probes after secrets, config files and admin panels, and it only counts a hit when the answer was a redirect or an error (any 3xx or 4xx), so a real page that happens to match never gets anyone banned:

```toml
# /etc/fail2ban/filter.d/nginx-secrethunt.conf
[Definition]
_secret = (?:\.env|\.git|\.aws|\.ssh|\.svn|\.hg|\.DS_Store|\.htpasswd|\.npmrc|\.netrc)
_conf   = (?:wp-config|wp-login|wp-admin|phpinfo|phpmyadmin|pma|mysqladmin|adminer|config\.json|configuration\.php|credentials|id_rsa|actuator|server-status)
_build  = (?:\.vite/|dist/|build/|_next/)?manifest\.json
_gql    = (?:v[0-9]+/|api/)?graphql
failregex = ^<HOST> \S+ \S+ \[[^\]]*\] "(?:GET|POST|HEAD|PUT|OPTIONS) [^"]*/%(_secret)s[^"]*" [34]\d\d
            ^<HOST> \S+ \S+ \[[^\]]*\] "(?:GET|POST|HEAD|PUT|OPTIONS) [^"]*/%(_conf)s[^"]*" [34]\d\d
            ^<HOST> \S+ \S+ \[[^\]]*\] "(?:GET|POST|HEAD|PUT|OPTIONS) [^"]*/%(_build)s[^"]*" [34]\d\d
            ^<HOST> \S+ \S+ \[[^\]]*\] "(?:GET|POST|HEAD|PUT|OPTIONS) /%(_gql)s[^"]*" [34]\d\d
            ^<HOST> \S+ \S+ \[[^\]]*\] "(?:GET|POST|HEAD|PUT|OPTIONS) [^"]*/admin/ajax\.php[^"]*" [34]\d\d
ignoreregex =
datepattern = ^[^\[]*\[({DATE})
              {^LN-BEG}
```

`nginx-limit-req` ships with fail2ban and reads nginx's error log, so it needs a rate limit to trip in the first place; mine allows 30 requests a second per IP with a burst of 60, which no real reader gets near:

```nginx
# http block (a file in /etc/nginx/conf.d works)
limit_req_zone  $binary_remote_addr zone=site:10m rate=30r/s;
limit_conn_zone $binary_remote_addr zone=siteconn:10m;
limit_req_status  429;
limit_conn_status 429;

# in the site's main location block
limit_req  zone=site burst=60 nodelay;
limit_conn siteconn 40;
```

## Docker Container Hardening

Last but not least is the analytics container, which runs in Docker bound to `127.0.0.1` with the image pinned by digest, but the default security posture is still too permissive for something that just proxies HTTP:

```yaml
# compose.yml additions
services:
  traffic-analytics:
    read_only: true
    tmpfs:
      - /tmp
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true
    mem_limit: 256m
```

`read_only: true` makes the root filesystem immutable, limiting writes to the named volume (`/data` for salt storage) and `/tmp`. `cap_drop: ALL` strips every Linux capability, which is fine here since the container only makes outbound HTTPS calls. `mem_limit: 256m` stops a leak from eating the host's RAM. The `tmpfs` mount is there because `read_only` breaks Node without it, since it needs somewhere to write temporary files and you'll get `EROFS` errors on startup otherwise.

By this point the origin only answers my own Cloudflare zone, auditd is keeping a record of everything run as root, the backups live off the box and are encrypted before they leave, and the services facing the internet are boxed in. Part 3 checks all of that from the outside, then goes further on SSH and into the OS itself, along with the mistakes that bit me on the way.

Quick recap, in this part we've:

-   Locked the origin to my own Cloudflare zone with authenticated origin pulls
-   Added auditd, login and tunnel alerts, off-site backups and a cloud firewall
-   Sandboxed Ghost and nginx with systemd
-   Made fail2ban ban at the Cloudflare edge
-   Boxed in the analytics container

**Next:** [Part 3: Going Further, OS Hardening and Housekeeping](https://blog.zsec.uk/ssh-ghost-3/)
