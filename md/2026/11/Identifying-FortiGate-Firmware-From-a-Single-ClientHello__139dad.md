---
title: Identifying FortiGate Firmware From a Single ClientHello
source: https://www.vulncheck.com/blog/fortigate-firmware-clienthello
source_host: www.vulncheck.com
clip_date: 2026-11-19T09:37:20+08:00
trace_id: a662ffff-8647-4bbe-a12f-6a296c779f45
content_hash: 6150dad7fcf63e46a77e2c43c2ba54a71da00aa2767798ad84615156524f95cb
status: synced
tags: []
series: null
feed_source: VulnCheck·漏洞研究
ai_summary: null
ai_summary_style: null
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 41d75244-d011-8137-a9e1-d33a53ac223c
ioc:
  cves:
    - CVE-2018-13374
    - CVE-2018-13379
    - CVE-2018-13382
    - CVE-2018-13383
    - CVE-2019-5591
    - CVE-2019-6693
    - CVE-2020-12812
    - CVE-2021-44168
    - CVE-2022-41328
    - CVE-2022-41335
    - CVE-2022-42475
    - CVE-2023-27997
    - CVE-2024-21754
    - CVE-2024-21762
    - CVE-2024-23113
    - CVE-2024-47575
    - CVE-2024-55591
    - CVE-2025-24472
    - CVE-2025-24477
    - CVE-2025-25249
    - CVE-2025-25252
    - CVE-2025-59718
    - CVE-2025-61624
    - CVE-2025-62631
    - CVE-2025-68686
    - CVE-2026-24858
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

## Introduction

Between 14 October and 12 November 2026, our Target Intelligence dataset saw 375,904 internet-facing FortiGate hosts with an exposed FortiGate-to-FortiManager (FGFM) management port. Fortinet explicitly states not to expose this port to the internet, so that alone is concerning.

Separately, Target Intelligence identified 838,100 hosts as FortiOS over the same period, and only 269 of them (0.03%) advertise a version. Using the FGFM port, we found a way around this. Each exposed host sends a TLS ClientHello, and using JA4 fingerprinting, placed each host in one of six generations, each tied to a range of FortiOS versions and the CVEs that affect them.

Between 6.8% and 36.1% of these hosts run a FortiOS branch that is past end of support. The range is wide because one generation mixes the end-of-life 7.0 and 7.2 branches with the still-supported 7.4 and 7.6.

We were also able to show that at least 160,000 of these devices has a version with an associated CVE. That includes all 11,264 Gen 2 hosts, on FortiOS 5.4 to 6.0.4, every one of them on a version affected by [CVE-2022-42475](https://console.vulncheck.com/cve/CVE-2022-42475), a pre-authentication SSL-VPN heap overflow linked to ransomware.

## Data Discovery

This work began when I decided to spend some time looking our so-called call unknown data in Target Intelligence. It is full of banner grabs we do not currently identify.

In the past, we have used this pot of data to identify protocols we hadn't implemented yet. It has highlighted weird instances of protocols, which we have then subsequently enabled our scanners to parse, as well as helping to drive our Initial Access team's research.

## Unknown TLS ClientHellos

In a previous life, I was lucky enough to spend hundreds of hours staring at PCAP data. Analysing weird, wonderful, and woeful implementations of protocols was a favourite part of the job. The nerdiest of superpowers is staring at hex dumps and saying "hey, that looks like RFC X".

This superpower enabled me to spot a cluster of data beginning with "16 03 01 03 c8 01" and immediately say, "hey, that's a TLS ClientHello". This was exciting, as seeing a ClientHello in banner grabs means one of two things. The server has just sent back what you sent them. Or, it is attempting to start a TLS session. I was able to quickly rule out the former, as the rows weren't identical, and our TLS scanner uses a consistent ClientHello.

Finding them takes one query. It matches a TLS handshake record (`16 03`) whose first message is type `01`, a ClientHello, and counts hosts by port across 30 days of unknown data.

```sql
WITH ClientHellos AS (
  SELECT ip_int, port
  FROM target_intelligence.unknown_parsed
  WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
    AND STARTS_WITH(banner, 'FgM')
    AND SUBSTR(SAFE.FROM_BASE64(SUBSTR(banner, 1, 8)), 6, 1) = b'\x01'
)
SELECT port, COUNT(DISTINCT ip_int) AS hosts
FROM ClientHellos
GROUP BY port
ORDER BY hosts DESC
```

Of 376,794 hosts sending a ClientHello, 375,904 (99.8%) did it on port 541. Unless stated otherwise, host counts in this post cover the same 30 days, 2026-10-14 to 2026-11-12, queried on 2026-11-13.

## It's PCAP Time

The next job was to download a load of these, and use Scapy to insert them into a PCAP so I could use the nice Wireshark GUI, and rest my hex eyes. I got an instant win, immediately revealing a bunch of Fortinet SNIs.

Server Name Indication (SNI) is a TLS extension the client populates to inform the server which service it wants. This is used extensively with multihosted IPs, where hundreds of different websites can be hosted on the same IP.

![Wireshark view of ClientHellos arriving on port 541, each carrying a Fortinet SNI](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/bc0c2bc930832bc7.png)

*ClientHello arriving on port 541, each carrying a Fortinet SNI such as support.fortinet-ca2.fortinet.com.*

Further research at this point led me to FortiGate's FGFM management service, which runs over TCP port 541 (and port 542 for IPv6), which you can see is consistent with the port I was seeing.

Seeing port 541 open to the internet on a FortiGate is instantly worrying if you know about [CVE-2024-47575](https://console.vulncheck.com/cve/CVE-2024-47575) (FortiJump). FortiJump is a missing-authentication bug in the FGFM daemon that was exploited in the wild in 2024.

That first instinct turned out to be wrong. FortiJump is a FortiManager bug, and on port 541 a FortiManager answers as a TLS server. A FortiGate is the side that opens with a ClientHello. That is backwards for scan data: we are the client, so a host we connect to should never send us a ClientHello, and port 541 is the one place we see it happen, which is exactly why these banners landed in unknown data.

To check that this is a FortiGate behaviour and not a FortiManager one, I looked at the 30 hosts our scans identify as FortiManager from their TLS certificate. None of them sent us a ClientHello. The port-541 bug that does apply is [CVE-2024-23113](https://console.vulncheck.com/cve/CVE-2024-23113), a pre-auth remote code execution in FortiOS's FGFM daemon, which is on VulnCheck's Known Exploited Vulnerabilities (KEV) list. It affects FortiOS 7.0.0 to 7.0.13, 7.2.0 to 7.2.6, and 7.4.0 to 7.4.2.

Regardless of version, FGFM on port 541 is a device-management channel that should never be reachable from the internet ([Fortinet suggests removing fgfm access](https://www.fortiguard.com/psirt/FG-IR-24-029)). Every one of these hosts is exposing its FortiGate control plane to anyone who can open a socket.

## Version Discovery

At VulnCheck, we provide CPE to CVE lookups, which we utilise in Target Intelligence to tag hosts with CVEs. So my next goal was to attempt to see if I could use these ClientHellos to get a CPE with a version number, or even a range of versions exposed to [CVE-2024-23113](https://console.vulncheck.com/cve/CVE-2024-23113).

To group these ClientHellos, I used JA4, which is an algorithm made by [FoxIO](https://foxio.io/) which takes non-ephemeral features from the ClientHello, to create a string that is somewhat human readable. It is made up of three sections, JA4_a, JA4_b and JA4_c, which are delimited using an underscore.

If you look at the screenshot below, you'll notice that for the fourth and fifth ones, the JA4_a and JA4_b are identical, but the JA4_c differs. This difference is due to one extra signature algorithm, ML-DSA, a post-quantum cryptographic digital signature scheme, released in 2024. In other words, this is probably a newer version. That guess was only partly right. Row 4 turned out to be FortiOS 7.4.12, which pins its own TLS settings; see the [Fixed and Configurable TLS Settings appendix](#appendix-fixed-and-configurable-tls-settings).

![Wireshark view of the five JA4 fingerprints seen on port 541](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f22e0f3a30c4ec5f.png)

*The five JA4 fingerprints from the first pass. Rows 4 and 5 share JA4_a and JA4_b (t13d171100_a02ea570dccb) and differ only in JA4_c: row 5 adds ML-DSA, and row 4 turned out to be FortiOS 7.4.12's pinned TLS profile (Gen 5P).*

Further analysis of each of these five values is provided in the [JA4 Breakdown appendix](#appendix-ja4-breakdown), but the key insight is that each of these contains something newer in the SSL/TLS ecosystem than the last.

With this knowledge, I now believed that these five JA4 values represented different versions of FortiOS, with each one newer than the last. Measuring firmware later turned five into six: the tables below use Gens 1 to 5 plus Gen 5P, where the P stands for pinned, because FortiOS 7.4.12 and 7.4.13 pin their own TLS settings.

## OpenSSL Version Discovery

A quick bit of googling revealed that FortiOS packages OpenSSL. And looking at our JA4 values I was able to map each one to a newer version of OpenSSL, cool!

Using a tool called fortitool, ([https://github.com/mosajjal/fortitool](https://github.com/mosajjal/fortitool)), "A single static Go binary and library for decrypting and unpacking FortiNet firmware", I ran it on FortiOS version 7.6.7, identifying OpenSSL 3.5.5.

Some quick scripting and a small Claude skill enabled me to run this across several versions and get the table below, confirming my hypothesis of OpenSSL versions.

| Gen | FortiOS version(s) | OpenSSL | Full JA4 |
| --- | --- | --- | --- |
| 5P  | 7.4.12 · 7.4.13 (pin added in 7.4.12) | 3.5.5, pinned | `t13d171100_a02ea570dccb_9482eddbd848` |
| 5   | 7.4.9 · 7.4.11 · 7.6.7 · 8.0.0 · 8.0.1 | 3.5.0–3.5.7 | `t13d171100_a02ea570dccb_168ae6a8d753` |
| 4   | 7.4.8 · 7.6.1–7.6.4 | 3.4.0 | `t13d171100_a02ea570dccb_412547015303` |
| 3   | 6.0.5–6.0.11 · 6.2.0 · 7.0.13 · 7.2.4 · 7.4.0–7.4.7 · 7.6.0 | 1.1.1–3.1.4 | `t13d251000_d50cb0bd0c54_5ac7197df9d2` |
| 2   | 5.4.12 · 5.6.14 · 6.0.0–6.0.4 | 1.0.2k–1.1.0h | `t12d220700_ad4cf32d3c22_a8cc486ca5dc` |
| 1   | none measured\* | 1.0.2 or older | `t10i310400_9d330406ce80_282f11336259` |

\* No version we booted sent a Gen 1 ClientHello. 5.4.12, the oldest we could boot, sent TLS 1.2 (Gen 2). Earlier 5.4 builds were only available to us as hardware firmware, and every 5.4 build from 5.4.0 to 5.4.12 ships OpenSSL 1.0.2 with the same TLS client methods, so the firmware cannot tell us which, if any, sends TLS 1.0. Gen 1 is most likely 5.4 or older firmware, or a configuration we did not reproduce; our unlicensed 6.4 lab VMs also sent TLS 1.0. Its CVE figures assume 5.4.0.

What this table tells us is that if we see a JA4 using one of the above, we can give a range of FortiOS versions for that host.

In other words, older OpenSSL means an older FortiOS version. WIN!

Each generation is a family of JA4 variants, not a single value, and we could not measure every FortiOS version. See the [JA4 Breakdown](#appendix-ja4-breakdown) and [Versions We Could Not Measure](#appendix-versions-we-could-not-measure) appendices.

## Target Intelligence Data

We next recomputed the JA4 for every host in the port-541 FGFM cohort over a 30-day window and found 375,904 hosts leaking their version range.

Recomputing the JA4 from each raw banner places every host in a generation (the SQL is in the [JA4 Generation SQL appendix](#appendix-ja4-generation-sql)). The anchor versions are the FortiOS versions whose firmware we measured for that generation:

| Gen | OpenSSL era / release date | Anchor versions measured | End of support | Hosts | Share |
| --- | --- | --- | --- | --- | --- |
| 5P  | 3.5.x, pinned by FortiOS · late-2025 → 2026 | 7.4.12 · 7.4.13 | Supported | 98,797 | 26.3% |
| 5   | 3.5.x · late-2025 → 2026 | 7.4.9 · 7.4.11 · 7.6.7 · 8.0.0 · 8.0.1 | Supported | 102,560 | 27.3% |
| 4   | 3.2–3.4 · late-2024 → mid-2025 | 7.4.8 · 7.6.1–7.6.4 | Supported | 38,829 | 10.3% |
| 3   | 1.1.1–3.1 · 2019 → mid-2024 | 6.0.5–6.0.11 · 6.2.0 · 7.0.13 · 7.2.4 · 7.4.0–7.4.7 · 7.6.0 | Mixed: 6.0, 6.2, 7.0 and 7.2 EOL | 110,078 | 29.3% |
| 2   | 1.0.2k–1.1.0 · ~2017–2021 | 5.4.12 · 5.6.14 · 6.0.0–6.0.4 | EOL | 11,264 | 3.0% |
| 1   | 1.0.2 or older · ≤ ~2017 | none measured | EOL | 14,376 | 3.8% |
| **Total** |     |     | **6.8%–36.1% EOL** | **375,904** | **100%** |

End of support is as of 2026-11-13, from [Fortinet's product life cycle](https://support.fortinet.com/Information/ProductLifeCycle.aspx) (login required; a public summary is on [endoflife.date](https://endoflife.date/fortios)). Gen 2 is FortiOS 5.4, 5.6 and early 6.0, and Gen 1 older still, all long past end of support. Gen 3 mixes end-of-life branches, 6.0 (ended 2022-09-29), 6.2 (2023-09-28), 7.0 (2025-09-30) and 7.2 (2026-09-30), with 7.4 and 7.6, which are still supported. Its JA4 cannot tell them apart, which is why the end-of-life share is a range: 6.8% counts only Gens 1 and 2, and 36.1% counts all of Gen 3 as well. FortiCare Elite customers get extended support for 7.2 until 2028-03-31, so a small part of Gen 3 may still be covered. "Supported" means the branch is supported, not that the host is on its latest patch.

### How do we know these are all FortiGates?

95% of these hosts name Fortinet in the ClientHello itself, in the SNI or the list of trusted Fortinet CAs. The remaining 5% are older TLS 1.0 and 1.2 ClientHellos that carry no hostname at all. We verified those against our own scan data. Where they expose anything else, they look just like the confirmed FortiGates: 86% of those identified on another port are Fortinet by their HTTP and TLS banners (83% for the confirmed hosts), and they run the FortiGate SSL-VPN port 10443 at 15 times the internet-wide rate, close to the 14 times seen for the confirmed hosts.

The full evidence is in the [Checking the Cohort Is FortiGate appendix](#appendix-checking-the-cohort-is-fortigate).

Looking at the same 30 days of Target Intelligence reveals 838,100 hosts identified as FortiOS, and only 269 of them (0.03%) publicly advertise a version, all of them 7.2.1 to 7.2.3.

## CPE to CVE Lookup

Using this table of results and [VulnCheck's CPE to CVE data, we looked up the CVEs](https://docs.vulncheck.com/products/exploit-and-vulnerability-intelligence/cpe) for the anchor version(s) for each generation, and then intersected that with the KEV set.

A generation's CVE figure in the table below is the union across its anchor versions (Gen 3 spans fourteen versions, 216 distinct CVEs). The KEV and ransomware subsets intersect that union with VulnCheck KEV. For Gen 3, that leaves 21 known-exploited CVEs, 9 of them linked to ransomware.

CPE ranges and KEV both grow over time, so these figures are as of 2026-11-13. Because a JA4 pins a generation and not an exact version, these are generation-level exposure counts, not a per-host vulnerable verdict. Gen 1 has no measured version, so its figures assume 5.4.0, and CPE ranges for newer CVEs often omit end-of-life branches: 5.4.0 is not listed for CVE-2023-27997 or CVE-2024-21762, for example. Their counts are a floor, not a sign that older versions are safer.

| Gen | Hosts | CVEs (anchor versions) | FortiOS KEV CVEs | Ransomware-linked | FGFM RCE [CVE-2024-23113](https://console.vulncheck.com/cve/CVE-2024-23113) |
| --- | --- | --- | --- | --- | --- |
| 5P  | 98,797 | 10  | 0   | 0   | —   |
| 5   | 102,560 | 22  | 2   | 0   | —   |
| 4   | 38,829 | 51  | 7   | 1   | —   |
| 3   | 110,078 | 216 | 21  | 9   | **yes** |
| 2   | 11,264 | 100 | 12  | 10  | —   |
| 1   | 14,376 | 56  | 7   | 6   | —   |

The exact KEV CVEs each generation is exposed to:

| Gen | Known-exploited FortiOS CVEs affecting the anchor versions |
| --- | --- |
| 1   | [CVE-2018-13374](https://console.vulncheck.com/cve/CVE-2018-13374), [CVE-2018-13383](https://console.vulncheck.com/cve/CVE-2018-13383), [CVE-2019-5591](https://console.vulncheck.com/cve/CVE-2019-5591), [CVE-2019-6693](https://console.vulncheck.com/cve/CVE-2019-6693), [CVE-2020-12812](https://console.vulncheck.com/cve/CVE-2020-12812), [CVE-2021-44168](https://console.vulncheck.com/cve/CVE-2021-44168), [CVE-2022-42475](https://console.vulncheck.com/cve/CVE-2022-42475) |
| 2   | [CVE-2018-13374](https://console.vulncheck.com/cve/CVE-2018-13374), [CVE-2018-13379](https://console.vulncheck.com/cve/CVE-2018-13379), [CVE-2018-13382](https://console.vulncheck.com/cve/CVE-2018-13382), [CVE-2018-13383](https://console.vulncheck.com/cve/CVE-2018-13383), [CVE-2019-5591](https://console.vulncheck.com/cve/CVE-2019-5591), [CVE-2019-6693](https://console.vulncheck.com/cve/CVE-2019-6693), [CVE-2020-12812](https://console.vulncheck.com/cve/CVE-2020-12812), [CVE-2021-44168](https://console.vulncheck.com/cve/CVE-2021-44168), [CVE-2022-41328](https://console.vulncheck.com/cve/CVE-2022-41328), [CVE-2022-42475](https://console.vulncheck.com/cve/CVE-2022-42475), [CVE-2023-27997](https://console.vulncheck.com/cve/CVE-2023-27997), [CVE-2024-21762](https://console.vulncheck.com/cve/CVE-2024-21762) |
| 3   | [CVE-2019-5591](https://console.vulncheck.com/cve/CVE-2019-5591), [CVE-2019-6693](https://console.vulncheck.com/cve/CVE-2019-6693), [CVE-2020-12812](https://console.vulncheck.com/cve/CVE-2020-12812), [CVE-2021-44168](https://console.vulncheck.com/cve/CVE-2021-44168), [CVE-2022-41328](https://console.vulncheck.com/cve/CVE-2022-41328), [CVE-2022-41335](https://console.vulncheck.com/cve/CVE-2022-41335), [CVE-2022-42475](https://console.vulncheck.com/cve/CVE-2022-42475), [CVE-2023-27997](https://console.vulncheck.com/cve/CVE-2023-27997), [CVE-2024-21754](https://console.vulncheck.com/cve/CVE-2024-21754), [CVE-2024-21762](https://console.vulncheck.com/cve/CVE-2024-21762), [CVE-2024-55591](https://console.vulncheck.com/cve/CVE-2024-55591), [CVE-2025-24472](https://console.vulncheck.com/cve/CVE-2025-24472), [CVE-2025-24477](https://console.vulncheck.com/cve/CVE-2025-24477), [CVE-2025-25249](https://console.vulncheck.com/cve/CVE-2025-25249), [CVE-2025-25252](https://console.vulncheck.com/cve/CVE-2025-25252), [CVE-2025-59718](https://console.vulncheck.com/cve/CVE-2025-59718), [CVE-2025-61624](https://console.vulncheck.com/cve/CVE-2025-61624), [CVE-2025-62631](https://console.vulncheck.com/cve/CVE-2025-62631), [CVE-2025-68686](https://console.vulncheck.com/cve/CVE-2025-68686), [CVE-2026-24858](https://console.vulncheck.com/cve/CVE-2026-24858), **+** [**CVE-2024-23113**](https://console.vulncheck.com/cve/CVE-2024-23113) **(FGFM / port 541 RCE)** |
| 4   | [CVE-2025-24477](https://console.vulncheck.com/cve/CVE-2025-24477), [CVE-2025-25249](https://console.vulncheck.com/cve/CVE-2025-25249), [CVE-2025-25252](https://console.vulncheck.com/cve/CVE-2025-25252), [CVE-2025-59718](https://console.vulncheck.com/cve/CVE-2025-59718), [CVE-2025-61624](https://console.vulncheck.com/cve/CVE-2025-61624), [CVE-2025-68686](https://console.vulncheck.com/cve/CVE-2025-68686), [CVE-2026-24858](https://console.vulncheck.com/cve/CVE-2026-24858) |
| 5   | [CVE-2025-61624](https://console.vulncheck.com/cve/CVE-2025-61624), [CVE-2026-24858](https://console.vulncheck.com/cve/CVE-2026-24858) |
| 5P  | none in VulnCheck's CPE ranges yet |

## Mitigation

Do not expose TCP ports 541 and 542 to the internet. FGFM is a management channel between FortiGates and FortiManager; restrict it to the management network or the specific peer addresses that need it. Fortinet documents port 541 for FGFM over IPv4 and port 542 for FGFM over IPv6, with 541 also listed for IPv6 from FortiManager 7.4.1, so apply the restriction to both ports on both address families. Our scan data covers port 541 over IPv4 only. For defenders who want to find exposed FortiGates on their own network, the Suricata and Snort rules covering every JA4 we saw are in the [Detections appendix](#appendix-detections).

## Conclusion

About 376,000 internet-facing FortiGate hosts expose their FGFM management port, and each one answers a connection with a ClientHello that gives away its generation.

The unexplained blobs of hex from banner grabs, can now give a range of versions that the corresponding FortiOS device belongs to; and those versions resolve, through their CPEs, to CVEs, with KEV entries and the FGFM RCE CVE-2024-23113 among them.

Research like this is what goes into our Target Intelligence dataset, so that defenders can find and fix exposures they do not know they are advertising to the world.

## Appendix: JA4 Breakdown

| Gen | Full JA4 | JA4_a / JA4_b | JA4_c Details | OpenSSL | FortiOS version(s) |
| --- | --- | --- | --- | --- | --- |
| 5P  | `t13d171100_a02ea570dccb_9482eddbd848` | TLS 1.3, SNI, 17 ciphers, 11 exts | Pinned list: ECDSA-SHA1 first, Brainpool before EdDSA, no ML-DSA | 3.5.5 | 7.4.12 · 7.4.13 |
| 5   | `t13d171100_a02ea570dccb_168ae6a8d753` | TLS 1.3, SNI, 17 ciphers, 11 exts | +ML-DSA (0904-6) | 3.5.0–3.5.7 | 7.4.9 · 7.4.11 · 7.6.7 · 8.0.0 · 8.0.1 |
| 4   | `t13d171100_a02ea570dccb_412547015303` | TLS 1.3, SNI, 17 ciphers, 11 exts | +Brainpool-TLS1.3 (081a-c) | 3.4.0 | 7.4.8 · 7.6.1–7.6.4 |
| 3   | `t13d251000_d50cb0bd0c54_5ac7197df9d2` | TLS 1.3, SNI, 25 ciphers, 10 exts | +TLS1.3 exts, +PSS/EdDSA | 1.1.1–3.1.4 | 6.0.5–6.0.11 · 6.2.0 · 7.0.13 · 7.2.4 · 7.4.0–7.4.7 · 7.6.0 |
| 2   | `t12d220700_ad4cf32d3c22_a8cc486ca5dc` | TLS 1.2, SNI, 22 ciphers, 7 exts | sig_algs present, no PSS | 1.0.2k–1.1.0h | 5.4.12 · 5.6.14 · 6.0.0–6.0.4 |
| 1   | `t10i310400_9d330406ce80_282f11336259` | TLS 1.0, no SNI, 31 ciphers, 4 exts | no sig_algs extension | 1.0.2 or older | none measured\* |

\* No version we booted sent a Gen 1 ClientHello. 5.4.12, the oldest we could boot, sent TLS 1.2 (Gen 2). Earlier 5.4 builds were only available to us as hardware firmware, and every 5.4 build from 5.4.0 to 5.4.12 ships OpenSSL 1.0.2 with the same TLS client methods, so the firmware cannot tell us which, if any, sends TLS 1.0. Gen 1 is most likely 5.4 or older firmware, or a configuration we did not reproduce; our unlicensed 6.4 lab VMs also sent TLS 1.0. Its CVE figures assume 5.4.0.

Each generation is a family of JA4 values, not a single value. The table above lists the JA4 we measured from firmware for each generation, which is also its most common variant. The generation is set by markers in the signature algorithms the bundled OpenSSL offers (ML-DSA for Gen 5, Brainpool TLS 1.3 for Gen 4, and so on). Variants within a generation differ in their cipher list, an extra extension, or whether they send SNI, which likely reflects administrator crypto settings such as FGFM's encryption-strength option. There is one exception. FortiOS 7.4.12 and 7.6.7 both ship OpenSSL 3.5.5 but present different JA4s, because 7.4.12 (and 7.4.13) overrides OpenSSL's defaults with a pinned list of its own. Those hosts get their own generation, Gen 5P (see the [Fixed and Configurable TLS Settings appendix](#appendix-fixed-and-configurable-tls-settings)).

| Gen | JA4 variants (30 days) | Measured (most common) JA4 | Its share of the generation |
| --- | --- | --- | --- |
| 5P  | 7   | `t13d171100_a02ea570dccb_9482eddbd848` | 94% |
| 5   | 23  | `t13d171100_a02ea570dccb_168ae6a8d753` | 79% |
| 4   | 6   | `t13d171100_a02ea570dccb_412547015303` | 92% |
| 3   | 28  | `t13d251000_d50cb0bd0c54_5ac7197df9d2` | 44% |
| 2   | 12  | `t12d220700_ad4cf32d3c22_a8cc486ca5dc` | 61% |
| 1   | 17  | `t10i310400_9d330406ce80_282f11336259` | 35% |

## Appendix: JA4 Generation SQL

This is the full query behind the generation counts in Target Intelligence Data. Figures ran on 2026-11-13 over the 30 days from 2026-10-14 to 2026-11-12, so a re-run on another day will drift slightly. The window is 30 days because each port-541 host is scanned about once a month (the average host in this cohort was seen on 1.0 days), so a 7-day window sees only about a quarter of the population.

Each JA4 is assigned to a generation by the crypto markers in its raw (unhashed) form, so every variant lands somewhere without a lookup table: a signature_algorithms list starting 0203,0403,0503,0603,081a (ECDSA-SHA1 first, then Brainpool: the list FortiOS 7.4.12 pins) is Gen 5P, ML-DSA (0904-0906) is Gen 5, Brainpool TLS 1.3 (`081a` - `081c`) is Gen 4, any other TLS 1.3 ClientHello is Gen 3, TLS 1.2 is Gen 2, and TLS 1.0/1.1 is Gen 1. Each host is counted once, at the generation of its most recent observation.

```sql
WITH parsed AS (
  SELECT ip_int, timestamp, `target_intel.ja4_parts`(banner) AS p
  FROM target_intelligence.unknown_parsed
  WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
    AND port = 541 AND STARTS_WITH(banner, 'FgMB')
),
classified AS (
  SELECT ip_int, timestamp,
    CASE
      WHEN STARTS_WITH(SPLIT(p.ext_sigalg_string, '_')[SAFE_OFFSET(1)], '0203,0403,0503,0603,081a') THEN '5P'
      WHEN REGEXP_CONTAINS(SPLIT(p.ext_sigalg_string, '_')[SAFE_OFFSET(1)], r'090[456]') THEN '5'
      WHEN REGEXP_CONTAINS(SPLIT(p.ext_sigalg_string, '_')[SAFE_OFFSET(1)], r'081[abc]') THEN '4'
      WHEN STARTS_WITH(p.ja4_a, 't13') THEN '3'
      WHEN STARTS_WITH(p.ja4_a, 't12') THEN '2'
      WHEN STARTS_WITH(p.ja4_a, 't10') OR STARTS_WITH(p.ja4_a, 't11') THEN '1'
    END AS gen
  FROM parsed WHERE p IS NOT NULL
),
per_host AS (
  SELECT ip_int,
    ARRAY_AGG(gen ORDER BY timestamp DESC LIMIT 1)[OFFSET(0)] AS gen,
    COUNT(DISTINCT gen) AS gens_seen,
    COUNT(DISTINCT DATE(timestamp)) AS days_seen
  FROM classified GROUP BY ip_int
)
SELECT gen, COUNT(*) AS hosts,
  ROUND(100 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS share_pct,
  COUNTIF(gens_seen > 1) AS hosts_seen_in_2plus_gens,
  ROUND(AVG(days_seen), 2) AS avg_days_seen
FROM per_host GROUP BY gen ORDER BY gen DESC
```

Its output is shown in Target Intelligence Data above.

All 93 JA4s land in one of the six generations: 7 variants in Gen 5P, 23 in Gen 5, 6 in Gen 4, 28 in Gen 3, 12 in Gen 2 and 17 in Gen 1 (rare variants come and go as the window moves; one more came from a truncated capture and is left out). Only 387 hosts appeared in more than one generation over the month. Gen 4's most common variant, t13d171100_a02ea570dccb_412547015303 (35,908 hosts), is the ClientHello a live FortiOS 7.6.2 sends: we booted one and its JA4_c matched byte for byte.

## Appendix: Fixed and Configurable TLS Settings

A JA4 is only a firmware fingerprint if an administrator cannot change it. To check, we decrypted 52 FortiGate firmware images, from 5.4.0 to 8.0.1 (36 VM images, and 16 hardware images covering 5.4.0 to 5.4.11, 7.4.11, 7.6.3, 7.6.4 and 7.6.8), with fortitool, read the TLS configuration compiled into each one, compared it with Fortinet's documentation, and booted fifteen FortiOS KVM images (5.4.12, 5.6.14, 6.0.0, 6.0.2, 6.0.4, 6.0.5, 6.0.11, 6.2.0, 6.4.0, 6.4.15, 7.4.13, 7.6.2, 7.6.7, 8.0.0 and 8.0.1) to capture their ClientHellos directly.

**Fixed by the firmware:** the extensions and signature algorithms that make up JA4_c, and the key-exchange groups. Each version ships its own OpenSSL with its configuration directory compiled in as /ssl, and Fortinet documents no CLI option that sets TLS groups or signature algorithms for FGFM. Even its 7.6.5 note on post-quantum TLS for the admin GUI says there is no option to choose groups. So the generation a ClientHello falls into is decided by the FortiOS version.

**The exception, FortiOS 7.4.12 and 7.4.13:** at boot, both write an OpenSSL configuration file, /ssl/openssl.cnf, whose system-wide defaults pin both lists:

```md
[system_default_sect]
SignatureAlgorithms = ECDSA+SHA1:ECDSA+SHA256:ECDSA+SHA384:ECDSA+SHA512:ecdsa_brainpoolP256r1tls13_sha256:ecdsa_brainpoolP384r1tls13_sha384:ecdsa_brainpoolP512r1tls13_sha512:ed25519:ed448:rsa_pss_pss_sha256:rsa_pss_pss_sha384:rsa_pss_pss_sha512:RSA-PSS+SHA256:RSA-PSS+SHA384:RSA-PSS+SHA512:RSA+SHA1:RSA+SHA256:RSA+SHA384:RSA+SHA512:DSA+SHA1:DSA+SHA256:DSA+SHA384:DSA+SHA512
Groups = P-256:P-384:P-521:ffdhe2048:ffdhe3072:ffdhe4096:ffdhe6144:ffdhe8192:x25519:x448
```

Those two lines are exactly the signature algorithms and groups in the t13d171100_a02ea570dccb_9482eddbd848 family: ECDSA-SHA1 first, Brainpool ahead of EdDSA, no ML-DSA, and a P-256 key share with no ML-KEM, even though the library underneath is OpenSSL 3.5.5. The pin hides the OpenSSL version, which is why our first classifier put these hosts in Gen 4; they now have their own generation, Gen 5P. FortiOS 7.4.8 (OpenSSL 3.4.0) and 7.4.9 (OpenSSL 3.5.0) have no such section, and neither do 7.6.0 to 7.6.2 or 7.6.7 (7.6.0 to 7.6.2 do write /ssl/openssl.cnf, but only to load OpenSSL's FIPS provider; it sets no TLS options), and 7.4.11 (OpenSSL 3.5.0, checked on FortiGate 60E hardware firmware) has none either, so the pin arrived in 7.4.12, alongside the move to OpenSSL 3.5.5. 7.4.13 keeps it, with identical lists, while 7.6.7, 8.0.0 and 8.0.1 have none. FortiOS 7.6.8 goes further: it writes a system_default_sect whose CipherString, Ciphersuites, SignatureAlgorithms and Groups are filled in at runtime, and it adds settings named tls-groups and client-sigalgs. Fortinet publishes no 7.6.8 VM image, so we could not see what values it uses. If they turn out to be administrator-configurable, JA4_c stops being a pure firmware fingerprint from 7.6.8 onward. Our scan data fits that timeline: over the 90 days to 2026-11-12, 16,622 hosts moved from Gen 5 to Gen 5P and 4,648 from Gen 4 to Gen 5P, while about 1,500 moved out of Gen 5P, almost all of them into Gen 5.

**Configurable by an administrator:** the first two settings below change the cipher list and TLS version (JA4_a and JA4_b, not JA4_c); FIPS-CC mode is the one switch that can also change JA4_c.

-   `config system central-management`, `set enc-algorithm {default | high | low}` (default `high`): the cipher strength FGFM offers. This is the most likely reason each generation has several cipher-list (JA4_b) variants.
-   `config system global`, `set ssl-min-proto-version` (default `TLSv1-2`): the minimum TLS version for connections the FortiGate makes.
-   FIPS-CC mode: restricts the algorithm set (Fortinet notes post-quantum groups are unavailable in it), so a FIPS-CC host may land in a different generation.
-   `strong-crypto`, `admin-https-ssl-*` and `ssl-static-key-ciphers`: these govern admin HTTPS and SSH and the TLS sessions the FortiGate terminates, not the ClientHello it sends as a client.

**Verified on a live FortiGate:** we booted the FortiOS 7.6.2 KVM image and captured two ClientHellos: the one it sends when we connect to its port 541, and the one it sends when it connects out to a configured FortiManager. Both had the same JA4_c as the 35,908-host Gen 4 variant above, and the same SNI. We repeated this with 7.4.13, 7.6.7 and 8.0.1, and in each case both directions sent the same ClientHello, with the JA4_c the firmware predicts: 9482eddbd848 (Gen 5P) for 7.4.13, 168ae6a8d753 (Gen 5) for 7.6.7, and 1ca2267b4e11 (Gen 5) for 8.0.1. Older builds matched the most common variant of their generation exactly: 6.0.5, 6.0.11 and 6.2.0 sent t13d251000_d50cb0bd0c54_5ac7197df9d2 (Gen 3), and 5.6.14, 6.0.0, 6.0.2 and 6.0.4 sent t12d220700_ad4cf32d3c22_a8cc486ca5dc (Gen 2). The switch from Gen 2 to Gen 3 inside the 6.0 branch is the move from OpenSSL 1.1.0h (6.0.4) to 1.1.1 (6.0.5), the first OpenSSL release with TLS 1.3. 5.4.12 sent t12i220500_ad4cf32d3c22_a1e935682795, a Gen 2 variant without SNI that 1,995 hosts in our data send. 8.0.0 sent JA4_c 168ae6a8d753, so the certificate-compression variant starts with 8.0.1. The cipher lists (JA4_b) of our lab VMs did not match the most common variants: 7.4.13 and 7.6.7 offered only the three TLS 1.3 suites, a JA4_b seen on just 8 hosts in our data, which points to the settings of a fresh, unlicensed VM rather than the firmware. In the outbound direction the FortiGate is the client, so stock Suricata ja4.hash rules fire on it, which means the same lookup works passively on any network where FortiGates talk to a FortiManager.

## Appendix: Versions We Could Not Measure

We measured 52 firmware images statically and booted fifteen FortiOS KVM images. The versions below were either not available to us or would not run in our lab, so the generation they fall into is inferred from their ClientHello, not measured from firmware, and CVEs that affect only those versions are not in the generation figures above.

-   **FortiOS 6.4.x:** both the 6.4.0 and 6.4.15 KVM images sent a TLS 1.0 ClientHello with no signature algorithms, which our classifier puts in Gen 1, yet fewer than 30 hosts in our data send those JA4s. 6.4 ships OpenSSL 1.1.1, the same library 6.0.11 and 6.2.0 use to send TLS 1.3, so we think the unlicensed lab VM falls back to a weaker profile and real 6.4 hosts are most likely in Gen 3. We could not confirm it, so the generation figures do not include 6.4 CVEs.
-   **Gen 1 (TLS 1.0):** no version we could boot sends it. 5.4.12 is Gen 2, and 5.4.0 to 5.4.11 were only available to us as hardware firmware, which ships the same OpenSSL 1.0.2 and TLS client methods as 5.4.12. Gen 1 is most likely 5.4 or older firmware, or a configuration we did not reproduce, so its CVE figures assume 5.4.0.
-   **FortiOS 7.4.10:** not available to us. 7.4.9 and 7.4.11 both ship OpenSSL 3.5.0 without the pin, so 7.4.10 is very likely Gen 5.
-   **FortiOS 7.6.5 and 7.6.6:** not available to us. 7.6.4 still ships OpenSSL 3.4.0 (Gen 4) and 7.6.7 ships 3.5.5 (Gen 5), so the 7.6 branch moved to Gen 5 in 7.6.5 or 7.6.6.
-   **FortiOS 7.6.8:** only hardware images were available to us, and its system-wide TLS configuration is filled in at runtime (see the [Fixed and Configurable TLS Settings appendix](#appendix-fixed-and-configurable-tls-settings)), so we cannot say which generation it falls into.
-   **The Gen 5 variant with JA4_c 1ca2267b4e11 (about 16,800 hosts and rising):** its ClientHello adds the certificate-compression extension. A live FortiOS 8.0.1 sends exactly this JA4_c and 8.0.0 does not, so these hosts are very likely on 8.0.1 or later (released 2026-09-15, which fits the rising count), but we cannot rule out other versions sending it too. It is not a FortiOS feature: Fortinet's release notes do not mention certificate compression. 8.0.1's OpenSSL 3.5.7 is built with zlib, and 8.0.0's OpenSSL 3.5.5 is not, and OpenSSL 3.2 and later advertise certificate compression automatically for any compression library it was built with (here zlib only). Its signature algorithms are OpenSSL's defaults, so it stays in Gen 5.

## Appendix: Checking the Cohort Is FortiGate

Every JA4 on port 541 falls into one of two groups, and none are mixed:

| Evidence | Confirmed (Fortinet named in the ClientHello) | No hostname in the ClientHello |
| --- | --- | --- |
| JA4 variants | 76  | 17  |
| Hosts | 358,293 (95.3%) | 17,611 (4.7%) |
| Identified on another port | 23.8% | 28.2% |
| ...of which identified as Fortinet (HTTP/TLS banners) | 83.1% | 85.5% |
| Serving 10443 among hosts serving 443 | 10.8% | 12.1% |
| Internet-wide rate, 10443 among 443 | 0.79% | 0.79% |

The 15 to 17% of hosts identified as something else on another port is similar in both groups. These are typically web applications published through the FortiGate's SSL-VPN portal, not a different product. Four small JA4s (7 hosts in total) have no corroborating evidence and are included as-is.

## Appendix: Detections

**Detection:** neither Suricata nor Snort parses this ClientHello out of the box. A FortiGate sends its ClientHello as the listening side, while both tools expect the connecting client to start TLS. Suricata never treats these flows as TLS or computes a JA4. Snort tags them as SSL, but its SSL inspector never registers the ClientHello, so ssl_state:client_hello does not fire. [Suricata](https://docs.suricata.io/en/suricata-7.0.12/rules/ja-keywords.html) therefore cannot use its ja4.hash keyword here, so the rules below match each generation's markers in the raw bytes instead: FortiOS 7.4.12's pinned signature list, then ML-DSA, then Brainpool, then the TLS version. That also catches variants we have not seen. The Snort 3 rules match the same markers. A bare crypto marker is generic to OpenSSL, so every rule below also requires source port 541 or 542, which is the FortiGate answering a connection with its own ClientHello. We tested both rule sets (Suricata 7.0.12, Snort 3.10) against a capture of every variant: each host raised exactly one generation alert plus the port fallback (re-tested on 2026-11-11 with the Gen 5P rule, and on 2026-11-13 against live captures from FortiOS 7.4.13, 7.6.7 and 8.0.1).

### Suricata

```md
# FortiGate FGFM ClientHello, one rule per generation. The FortiGate sends the ClientHello as the listener, so Suricata's TLS parser (and ja4.hash) never sees it; these rules match the generation markers in the raw bytes instead.
alert tcp $HOME_NET [541,542] -> any any (msg:"FortiGate FGFM ClientHello, Gen 5P (FortiOS 7.4 pinned TLS config, OpenSSL 3.5.x)"; flow:established,to_client; content:"|16 03|"; depth:2; byte_test:1,=,1,5; content:"|02 03 04 03 05 03 06 03 08 1a|"; threshold:type limit, track by_src, count 1, seconds 3600; classtype:policy-violation; sid:4100007; rev:1;)
alert tcp $HOME_NET [541,542] -> any any (msg:"FortiGate FGFM ClientHello, Gen 5 (OpenSSL 3.5.x)"; flow:established,to_client; content:"|16 03|"; depth:2; byte_test:1,=,1,5; content:"|09 05 09 06 09 04|"; threshold:type limit, track by_src, count 1, seconds 3600; classtype:policy-violation; sid:4100001; rev:3;)
alert tcp $HOME_NET [541,542] -> any any (msg:"FortiGate FGFM ClientHello, Gen 4 (OpenSSL 3.2-3.4)"; flow:established,to_client; content:"|16 03|"; depth:2; byte_test:1,=,1,5; content:"|08 1a 08 1b 08 1c|"; content:!"|09 05 09 06 09 04|"; content:!"|02 03 04 03 05 03 06 03 08 1a|"; threshold:type limit, track by_src, count 1, seconds 3600; classtype:policy-violation; sid:4100002; rev:4;)
alert tcp $HOME_NET [541,542] -> any any (msg:"FortiGate FGFM ClientHello, Gen 3 (OpenSSL 1.1.1-3.1)"; flow:established,to_client; content:"|16 03|"; depth:2; byte_test:1,=,1,5; pcre:"/\x00\x2b\x00[\x03-\x0b][\x02-\x0a]\x03\x04/"; content:!"|08 1a 08 1b 08 1c|"; threshold:type limit, track by_src, count 1, seconds 3600; classtype:policy-violation; sid:4100003; rev:3;)
alert tcp $HOME_NET [541,542] -> any any (msg:"FortiGate FGFM ClientHello, Gen 2 (OpenSSL 1.0.2k-1.1.1)"; flow:established,to_client; content:"|16 03|"; depth:2; byte_test:1,=,1,5; byte_test:2,=,0x0303,9; pcre:!"/\x00\x2b\x00[\x03-\x0b][\x02-\x0a]\x03\x04/"; content:!"|08 1a 08 1b 08 1c|"; threshold:type limit, track by_src, count 1, seconds 3600; classtype:policy-violation; sid:4100004; rev:3;)
alert tcp $HOME_NET [541,542] -> any any (msg:"FortiGate FGFM ClientHello, Gen 1 (OpenSSL 1.0.2k)"; flow:established,to_client; content:"|16 03|"; depth:2; byte_test:1,=,1,5; byte_test:2,<,0x0303,9; threshold:type limit, track by_src, count 1, seconds 3600; classtype:policy-violation; sid:4100005; rev:3;)

# Port-only fallback: any TLS handshake record whose first message is a ClientHello, sent by a host listening on 541/542
alert tcp $HOME_NET [541,542] -> $EXTERNAL_NET any (msg:"FortiGate FGFM port exposed: ClientHello sent by listener"; flow:established,to_client; content:"|16 03|"; depth:2; byte_test:1,=,1,5; threshold:type limit, track by_src, count 1, seconds 3600; classtype:policy-violation; sid:4100006; rev:2;)
```

### Snort

The same generation markers in Snort 3 syntax. Snort raises one alert per flow, so unlike the Suricata rules these need no threshold:

```md
# FortiGate FGFM ClientHello, one rule per generation. The FortiGate sends the ClientHello as the listener, so Snort's SSL inspector never registers it as a ClientHello; these rules match the generation markers in the raw bytes instead.
alert tcp $HOME_NET [541,542] -> any any ( msg:"FortiGate FGFM ClientHello, Gen 5P (FortiOS 7.4 pinned TLS config, OpenSSL 3.5.x)"; flow:established,to_client; content:"|16 03|",depth 2; byte_test:1,=,1,5; content:"|02 03 04 03 05 03 06 03 08 1a|"; classtype:policy-violation; sid:4100007; rev:1; )
alert tcp $HOME_NET [541,542] -> any any ( msg:"FortiGate FGFM ClientHello, Gen 5 (OpenSSL 3.5.x)"; flow:established,to_client; content:"|16 03|",depth 2; byte_test:1,=,1,5; content:"|09 05 09 06 09 04|"; classtype:policy-violation; sid:4100001; rev:1; )
alert tcp $HOME_NET [541,542] -> any any ( msg:"FortiGate FGFM ClientHello, Gen 4 (OpenSSL 3.2-3.4)"; flow:established,to_client; content:"|16 03|",depth 2; byte_test:1,=,1,5; content:"|08 1a 08 1b 08 1c|"; content:!"|09 05 09 06 09 04|"; content:!"|02 03 04 03 05 03 06 03 08 1a|"; classtype:policy-violation; sid:4100002; rev:2; )
alert tcp $HOME_NET [541,542] -> any any ( msg:"FortiGate FGFM ClientHello, Gen 3 (OpenSSL 1.1.1-3.1)"; flow:established,to_client; content:"|16 03|",depth 2; byte_test:1,=,1,5; pcre:"/\x00\x2b\x00[\x03-\x0b][\x02-\x0a]\x03\x04/"; content:!"|08 1a 08 1b 08 1c|"; classtype:policy-violation; sid:4100003; rev:1; )
alert tcp $HOME_NET [541,542] -> any any ( msg:"FortiGate FGFM ClientHello, Gen 2 (OpenSSL 1.0.2k-1.1.1)"; flow:established,to_client; content:"|16 03|",depth 2; byte_test:1,=,1,5; byte_test:2,=,0x0303,9; pcre:!"/\x00\x2b\x00[\x03-\x0b][\x02-\x0a]\x03\x04/"; content:!"|08 1a 08 1b 08 1c|"; classtype:policy-violation; sid:4100004; rev:1; )
alert tcp $HOME_NET [541,542] -> any any ( msg:"FortiGate FGFM ClientHello, Gen 1 (OpenSSL 1.0.2k)"; flow:established,to_client; content:"|16 03|",depth 2; byte_test:1,=,1,5; byte_test:2,<,0x0303,9; classtype:policy-violation; sid:4100005; rev:1; )

# Port-only fallback: any TLS handshake record whose first message is a ClientHello, sent by a host listening on 541/542
alert tcp $HOME_NET [541,542] -> $EXTERNAL_NET any ( msg:"FortiGate FGFM port exposed: ClientHello sent by listener"; flow:established,to_client; content:"|16 03|",depth 2; byte_test:1,=,1,5; classtype:policy-violation; sid:4100006; rev:1; )
```

## About VulnCheck

VulnCheck's research team tracks internet-facing exposure and exploitation activity using our [Target Intelligence](https://www.vulncheck.com/product/target-intelligence) and [Canary Intelligence](https://www.vulncheck.com/product/canary-intelligence) datasets. For more research like this, check out our blog, *[From Canary Intelligence to C2 - Mapping an Attack Fleet with Target Intelligence](https://www.vulncheck.com/blog/meowproject)*.

Sign up for the VulnCheck community today to get free access to our [VulnCheck KEV](https://console.vulncheck.com/browse/kev), enjoy our comprehensive [vulnerability data](https://console.vulncheck.com/browse), and request a trial of our [Target Intelligence](https://www.vulncheck.com/product/target-intelligence), [Canary Intelligence](https://www.vulncheck.com/product/canary-intelligence), and [Exploit & Vulnerability Intelligence](https://www.vulncheck.com/product/exploit-intelligence) products.
