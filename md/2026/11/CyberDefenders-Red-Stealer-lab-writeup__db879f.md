---
title: CyberDefenders Red Stealer lab writeup
source: https://zx41r.dev/posts/red-stealer/
source_host: zx41r.dev
clip_date: 2026-11-02T10:44:46+08:00
trace_id: ffd84a97-4375-46d6-8cfe-42c598b50e76
content_hash: 6e7e1c05521e0abfaab2518311012047ad45b1952fc6923f347c5bf559b52ecb
status: synced
tags:
  - 恶意样本
  - 威胁情报
series: null
feed_source: zx41r·恶意软件/逆向
ai_summary: 仅凭哈希在 VirusTotal、MalwareBazaar、ThreatFox 做 IOC 查询，即可确认样本为 RedLine Stealer，C2 为 77.91.124.55:19071。
ai_summary_style: key-points
images_status:
  total: 9
  succeeded: 9
  failed_urls: []
notion_page_id: 40c75244-d011-81bc-acc8-f5b612a88f01
ioc:
  cves: []
  cwes: []
  hashes:
    - 18cbe55c3b28754916f1cbf4dfc95cf9
    - 248fcc901aff4e4b4c48c91e4d78a939bf681c9a1bc24addc3551b32768f907b
    - 7ccfb7678c34d6a2bedc040da04e2b5201be453b
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 仅凭哈希在 VirusTotal、MalwareBazaar、ThreatFox 做 IOC 查询，即可确认样本为 RedLine Stealer，C2 为 77.91.124.55:19071。
> 
> - **样本归属：** Microsoft 判定为 `Trojan:Win32/Redline!rfn`，62/72 引擎检出；文件名 `Wextract` 是 IExpress 自解压 stub 的名字，说明窃密木马打包在 IExpress 安装包内（1.83 MB Win32 EXE），也解释了后文 `%TEMP%\IXP00X.TMP` 目录。
> - **时间陷阱：** VT 首次提交时间为 2023-10-06 04:41 UTC；而 2022-05-24 的创建时间只是 Wextract stub 的 PE 时间戳，并非内部窃密木马的编译时间。
> - **行为画像：** ATT&CK 收集战术对应 T1005（Data from Local System），窃取浏览器凭据、Cookie、加密钱包及 FTP/VPN 登录；提权利用的是 `advapi32.dll`（导出 OpenProcessToken、AdjustTokenPrivileges 等），`advpack.dll` 只是 IExpress 解压辅助。
> - **C2 定位：** IP 流量中三条为 443 端口指向 Facebook/Bing 的正常解析，唯一的裸 IP 非标准端口 TCP `77.91.124.55:19071` 即 C2；DNS 解析中社交媒体域名为 `facebook.com`。
> - **情报关联：** ThreatFox 确认该 IOC 属 RedLine Stealer，别名 `RECORDSTEALER`，威胁类型 botnet_cc、置信度 100%；MalwareBazaar 上有 Varp0s 编写的 YARA 规则 `detect_Redline_Stealer`（TLP:CLEAR）可检测该样本。

## Overview

|     |     |
| :--- | :--- |
| **Platform** | CyberDefenders |
| **Category** | Threat Intelligence |
| **Difficulty** | Easy |
| **Focus** | IOC extraction, C2, ATT&CK mapping, classification |
| **Lab Link** | [Red Stealer](https://cyberdefenders.org/blueteam-ctf-challenges/red-stealer/) |

The scenario: an executable turned up on a colleague’s machine and might be talking to a C2. You get its hash and nothing else. Everything here comes from VirusTotal, MalwareBazaar and ThreatFox, no sample handling.

```plaintext
248fcc901aff4e4b4c48c91e4d78a939bf681c9a1bc24addc3551b32768f907b
```

## Q1: malware category

> What category has Microsoft identified for that malware in VirusTotal?

Search the hash on VirusTotal, Detection tab, find Microsoft’s row:

![VirusTotal Detection](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/352b16ac58781405.png)

Microsoft: Trojan:Win32/Redline!rfn

```plaintext
Trojan:Win32/Redline!rfn
```

The category is the first part of the name.

**Answer:** `Trojan`

## Q2: file name

> What is the file name associated with this malware? (no extension)

It’s on the main VirusTotal page for the sample:

![VirusTotal Filename](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1acc3a5249c8485f.png)

62/72 detections, filename Wextract

| Property | Value |
| --- | --- |
| Detection | 62/72 vendors flagged |
| Size | 1.83 MB (1,917,440 bytes) |
| File Type | Win32 EXE |

`Wextract` is the name of the IExpress self-extractor stub, so the stealer is wrapped in an IExpress package. That also explains the `IXP00X.TMP` folders in Q9.

**Answer:** `Wextract`

## Q3: first submission

> What is the UTC timestamp of the malware’s first submission to VirusTotal? (YYYY-MM-DD HH:MM)

Details tab, History section:

![VirusTotal History](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/09f5f2a35985d435.png)

Submission history

| Event | Timestamp (UTC) |
| --- | --- |
| Creation Time | 2022-05-24 22:49:06 |
| **First Submission** | **2023-10-06 04:41:50** |
| First Seen In Wild | 2023-10-07 07:20:23 |
| Last Submission | 2025-11-07 12:05:39 |

Don’t read much into the 2022 creation time. It’s the PE timestamp of the Wextract stub, not of the stealer inside it.

**Answer:** `2023-10-06 04:41`

## Q4: ATT&CK collection technique

> What is the MITRE ATT&CK technique ID for the malware’s data collection from the system before exfiltration?

Behavior tab, MITRE ATT&CK section, Collection tactic:

![MITRE ATT&CK Collection](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3da515eb14ff97ab.png)

Collection techniques

| Technique ID | Name |
| --- | --- |
| **T1005** | Data from Local System |
| T1056 | Input Capture |
| T1119 | Automated Collection |

The question is about pulling data off the box before exfil, which is what RedLine does with browser credentials, cookies, wallets and saved FTP/VPN logins. That’s T1005.

**Answer:** `T1005`

## Q5: social media domain

> Following execution, which social media-related domain names did the malware resolve via DNS queries?

Behavior tab, DNS Resolutions:

![DNS Resolutions](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0366d2a06f2e6616.png)

DNS resolutions

-   business.bing.com
-   connect.facebook.net
-   facebook.com
-   fbcdn.net
-   fbsbx.com
-   static.xx.fbcdn.net
-   [www.facebook.com](http://www.facebook.com/)

Everything else on that list is a Facebook CDN or Bing.

**Answer:** `facebook.com`

## Q6: C2 address

> Can you provide the IP address and destination port the malware communicates with?

Behavior tab, IP Traffic:

![IP Traffic C2](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e8cb657348d3e9c2.png)

77.91.124.55:19071

| Protocol | Destination | Note |
| --- | --- | --- |
| **TCP** | **77.91.124.55:19071** | C2  |
| TCP | 31.13.67.35:443 | [www.facebook.com](http://www.facebook.com/) |
| TCP | 13.107.6.158:443 | business.bing.com |
| TCP | 31.13.88.13:443 | static.xx.fbcdn.net |

Three of the four map to Facebook or Microsoft on 443. The odd one is a bare IP on port 19071. ThreatFox confirms it in Q8.

**Answer:** `77.91.124.55:19071`

## Q7: YARA rule

> Using MalwareBazaar, what’s the name of the YARA rule created by “Varp0s” that detects the identified malware?

Search the hash on MalwareBazaar:

```plaintext
sha256:248fcc901aff4e4b4c48c91e4d78a939bf681c9a1bc24addc3551b32768f907b
```

YARA Signatures section:

![MalwareBazaar YARA](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e31211fefcad2438.png)

detect_Redline_Stealer by Varp0s

| Property | Value |
| --- | --- |
| Rule Name | detect_Redline_Stealer |
| Author | Varp0s |
| TLP | CLEAR |

**Answer:** `detect_Redline_Stealer`

## Q8: ThreatFox alias

> Can you provide the different malware alias associated with the malicious IP address according to ThreatFox?

Search ThreatFox for `ioc:77.91.124.55`:

![ThreatFox Results](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/db5925cdd8923cea.png)

RECORDSTEALER alias

| Property | Value |
| --- | --- |
| IOC | 77.91.124.55:19071 |
| IOC Type | ip:port |
| Threat Type | botnet_cc |
| Malware | RedLine Stealer |
| **Malware Alias** | **RECORDSTEALER** |
| Confidence | 100% |

**Answer:** `RECORDSTEALER`

## Q9: privilege escalation DLL

> Can you provide the DLL utilized by the malware for privilege escalation?

Behavior tab, Modules loaded:

![Modules Loaded](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1d735efc811e5a5b.png)

advapi32.dll among loaded modules

-   APPHELP.DLL
-   advapi32.dll
-   advpack.dll
-   dropped executables under `%TEMP%\IXP00X.TMP\`

Of these, `advapi32.dll` is the one that exports the token and privilege APIs: `OpenProcessToken`, `LookupPrivilegeValue`, `AdjustTokenPrivileges`, `ImpersonateLoggedOnUser`. `advpack.dll` is just the IExpress extraction helper.

**Answer:** `advapi32.dll`

## Answers

| Q   | Answer |
| --- | --- |
| 1   | `Trojan` |
| 2   | `Wextract` |
| 3   | `2023-10-06 04:41` |
| 4   | `T1005` |
| 5   | `facebook.com` |
| 6   | `77.91.124.55:19071` |
| 7   | `detect_Redline_Stealer` |
| 8   | `RECORDSTEALER` |
| 9   | `advapi32.dll` |

## IOCs

| Type | Value |
| --- | --- |
| SHA256 | `248fcc901aff4e4b4c48c91e4d78a939bf681c9a1bc24addc3551b32768f907b` |
| MD5 | `18cbe55c3b28754916f1cbf4dfc95cf9` |
| SHA-1 | `7ccfb7678c34d6a2bedc040da04e2b5201be453b` |
| C2  | `77.91.124.55:19071` (TCP) |
