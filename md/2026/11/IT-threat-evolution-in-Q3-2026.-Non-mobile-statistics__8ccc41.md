---
title: IT threat evolution in Q3 2026. Non-mobile statistics
source: https://securelist.com/malware-report-q3-2026-pc-iot-statistics/121843/
source_host: securelist.com
clip_date: 2026-11-10T17:42:02+08:00
trace_id: 2745676d-283b-41b9-9878-66557db73fa6
content_hash: 322eb1eb009159bf208747c5edc586c03e7debb67b6d1376aaff85b0e4baea0c
status: synced
tags: []
series: null
feed_source: Kaspersky Securelist
ai_summary: null
ai_summary_style: null
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 41475244-d011-81fd-affb-eef2135c6103
ioc:
  cves:
    - CVE-2025-14733
    - CVE-2025-60710
    - CVE-2026-0257
    - CVE-2026-15409
    - CVE-2026-15410
    - CVE-2026-45659
    - CVE-2026-59310
    - CVE-2026-63077
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/abb87b32a19824ef.jpg)

IT threat evolution in Q3 2026. Non-mobile statistics  
[IT threat evolution in Q3 2026. Mobile statistics](https://securelist.com/malware-report-q3-2026-mobile-statistics/121844)

*The statistics in this report are based on detection verdicts returned by Kaspersky products unless otherwise stated. The information was provided by Kaspersky users who consented to sharing statistical data.*

## Quarterly figures

In Q3 2026:

-   Kaspersky products blocked more than 311 million attacks launched from online resources.
-   Web Anti-Virus responded to 47 million unique links.
-   File Anti-Virus blocked more than 23 million malicious and potentially unwanted objects.
-   There were 4470 new ransomware variants discovered.
-   More than 81,000 users experienced ransomware attacks.
-   15% of all ransomware victims whose data was published on threat actors’ data leak sites (DLSs) were victims of Qilin.
-   More than 217,000 users were targeted by miners.

## Ransomware

### Quarterly trends and highlights

#### Threat actor disruption

In August, the creator and lead administrator of the Ransom Cartel ransomware-as-a-service (RaaS) operation was [sentenced](https://www.bleepingcomputer.com/news/security/ransom-cartel-ransomware-creator-sentenced-to-16-years-in-prison/) to 16 years in prison. The convict developed the ransomware Trojan and at the time of his arrest played a central role in the RaaS operation: running the affiliate program, recruiting affiliates, supplying them with information and attack tools, working with initial access brokers, communicating with victims, and processing payments.

In September, a member of the Ryuk RaaS group was [sentenced](https://www.bleepingcomputer.com/news/security/ryuk-ransomware-member-sentenced-to-24-months-in-prison/) to two years in prison and three years of supervised release. In 2019 and 2020, he and his accomplices breached organizations’ networks and encrypted data with the Ryuk Trojan. According to public reports, hundreds of workstations and servers were compromised. According to the prosecution, the attacker received a total of about 1610 BTC in ransom payments from victims.

Also in September, a member of the Conti RaaS group was [sentenced](https://www.bleepingcomputer.com/news/security/conti-ransomware-gang-member-sentenced-to-four-years-in-prison/) to four years in prison. He was charged with attacking companies in 2021 and 2022. In addition to carrying out attacks, he developed part of the group’s malware toolkit.

#### Vulnerabilities and attacks

In July, researchers [published](https://arcticwolf.com/resources/blog/exploitation-of-cve-2026-0257-leads-to-qilin-ransomware/) a report on the Qilin group exploiting the CVE-2026-0257 vulnerability in Palo Alto Networks firewall software. The vulnerability allowed attackers to bypass authentication and compromise victims’ networks without valid accounts.

CISA published information in its Known Exploited Vulnerabilities Catalog (KEV) on several CVEs actively exploited by ransomware groups:

-   [CVE-2026-15409](https://www.cisa.gov/known-exploited-vulnerabilities-catalog?field_cve=CVE-2026-15409) / [CVE-2026-15410](https://www.cisa.gov/known-exploited-vulnerabilities-catalog?field_cve=CVE-2026-15410) in SonicWall SMA1000 remote access gateways. CISA doesn’t specify which groups exploited these vulnerabilities, but researchers have [linked](https://www.resecurity.com/blog/article/from-wsproxy-to-root-inc-ransomware-and-sonicwall-sma-exploit-chain) this activity to INC Ransom.
-   [CVE-2026-45659](https://www.cisa.gov/known-exploited-vulnerabilities-catalog?field_cve=CVE-2026-45659) in Microsoft SharePoint Server allowed an authenticated, low-privileged attacker to achieve remote code execution.
-   [CVE-2025-60710](https://www.cisa.gov/known-exploited-vulnerabilities-catalog?field_cve=CVE-2025-60710) in Microsoft Windows allowed attackers to escalate privileges locally.
-   [CVE-2026-59310](https://www.cisa.gov/known-exploited-vulnerabilities-catalog?field_cve=CVE-2026-59310) in VMware vCenter enabled unauthenticated remote code execution.
-   [CVE-2025-14733](https://www.cisa.gov/known-exploited-vulnerabilities-catalog?field_cve=CVE-2025-14733) in WatchGuard Firebox also enabled unauthenticated remote code execution.
-   [CVE-2026-63077](https://www.cisa.gov/known-exploited-vulnerabilities-catalog?field_cve=CVE-2026-63077) in JetBrains TeamCity allowed OS commands to run with the privileges of the TeamCity server process by way of an authentication bypass through the agent polling protocol. Command execution at that level could give access to configurations, credentials, CI/CD pipelines, and more.

### The most prolific groups

This section highlights the most prolific ransomware gangs by number of victims added to each group’s DLS. Qilin (15.39%) holds first place, as it did last quarter. Qilin is followed by The Gentlemen (7.89%), which was especially active in Q1 but did not make the list in Q2. A notable newcomer on the list is Deadlock (4.46%), a relatively young ransomware family first reported in July 2025.

*Number of each group’s victims according to its DLS as a percentage of all groups’ victims published on all the DLSs under review during the reporting period ([download](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/11/09170400/01-en-malware-report-charts.png))*

### Number of new ransomware variants

In Q3, Kaspersky products detected three new ransomware families and 4470 new variants, more than 1.5 times last quarter’s count.

*Number of new ransomware modifications, Q3 2025 – Q3 2026 ([download](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/11/09170506/02-en-ru-pt-br-malware-report-charts.png))*

### Number of users attacked by ransomware Trojans

During the reporting period, our products protected 81,556 unique users from ransomware attacks. Users encountered ransomware most often in September.

*Number of unique users attacked by ransomware Trojans, Q3 2026 ([download](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/11/09170617/03-en-malware-report-charts.png))*

### TOP 10 countries and territories attacked by ransomware Trojans

|     |     |     |
| --- | --- | --- |
|     | **Country/territory\*** | **%\*\*** |
| 1   | China | 0.83% |
| 2   | South Korea | 0.65% |
| 3   | Cameroon | 0.51% |
| 4   | Pakistan | 0.47% |
| 5   | Tajikistan | 0.45% |
| 6   | Iraq | 0.43% |
| 7   | Hong Kong | 0.41% |
| 8   | Uzbekistan | 0.40% |
| 9   | Bangladesh | 0.33% |
| 10  | Turkmenistan | 0.32% |

*\* Excluded are countries and territories with relatively few (under 50,000) Kaspersky users.  
\*\* Unique users whose computers were attacked by ransomware Trojans as a percentage of all unique Kaspersky users in the country/territory.*

### TOP 10 most common families of ransomware Trojans

|     |     |     |     |
| --- | --- | --- | --- |
|     | **Name** | **Verdict** | **%\*** |
| 1   | (generic verdict) | Trojan-Ransom.Win32.Gen | 32.48% |
| 2   | (generic verdict) | Trojan-Ransom.Win32.Crypren | 6.31% |
| 3   | WannaCry | Trojan-Ransom.Win32.Wanna | 4.90% |
| 4   | (generic verdict) | Trojan-Ransom.Win32.Encoder | 4.39% |
| 5   | (generic verdict) | Trojan-Ransom.Win32.Agent | 4.33% |
| 6   | (generic verdict) | Trojan-Ransom.Python.Agent | 3.09% |
| 7   | (generic verdict) | Trojan-Ransom.PowerShell.Agent | 2.79% |
| 8   | (generic verdict) | Trojan-Ransom.Win32.Phds | 2.73% |
| 9   | (generic verdict) | Trojan-Ransom.Win32.Phny | 2.20% |
| 10  | (generic verdict) | Trojan-Ransom.MSIL.Agent | 2.10% |

*\* Unique Kaspersky users attacked by the specific ransomware Trojan family as a percentage of all unique users attacked by this type of threat.*

## Miners

### Number of new miner variants

In Q3 2026, Kaspersky solutions detected 2197 new miner variants. After the spike in the second quarter, it’s fair to say the pattern has returned to the calmer one typical of last year.

*Number of new miner modifications, Q3 2026 ([download](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/11/09170751/04-en-malware-report-charts.png))*

### Number of users attacked by miners

In Q3, we detected miner attacks on the computers of 217,024 unique Kaspersky users worldwide.

*Number of unique users attacked by miners, Q3 2026 ([download](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/11/09170859/05-en-malware-report-charts.png))*

### TOP 10 countries and territories attacked by miners

|     |     |     |
| --- | --- | --- |
|     | **Country/territory\*** | **%\*\*** |
| 1   | Turkmenistan | 2.32% |
| 2   | Tanzania | 1.43% |
| 3   | Mali | 1.21% |
| 4   | Senegal | 1.05% |
| 5   | China | 1.03% |
| 6   | Bangladesh | 0.98% |
| 7   | Portugal | 0.7% |
| 8   | Côte d’Ivoire | 0.68% |
| 9   | Costa Rica | 0.65% |
| 10  | Ethiopia | 0.61% |

*\* Excluded are countries and territories with relatively few (under 50,000) Kaspersky users.  
\*\* Unique users whose computers were attacked by miners as a percentage of all unique Kaspersky users in the country/territory.*

## Attacks on macOS

### Quarterly highlights

At the beginning of the third quarter, Jamf researchers [discovered](https://www.jamf.com/blog/pamstealer-macos-infostealer-applescript-rust/) a new stealer, PamStealer. What sets it apart is its use of Pluggable Authentication Modules (PAM) to verify the administrator password the user enters.

During the quarter, Socket researchers discovered several supply chain attacks that compromised popular npm, PyPI and Cargo (the Rust package manager) packages. The malicious payloads in these packages targeted macOS systems along with others. For example, on July 11, an infected npm package, jscrambler, [was published](https://socket.dev/blog/jscrambler-supply-chain-attack). Its malicious module was an infostealer written in Rust. The infostealer targeted crypto wallets, secrets from various services and browsers, MCP server configurations, and API keys for AI agents. In August, [an attack was detected](https://socket.dev/blog/popular-rust-crates-compromised) on the arrayref, internment, and append-only-vec Rust crates; it delivered a Rust backdoor to the victim’s device. In September, malicious versions of the MemTensor npm and PyPI packages [were published](https://socket.dev/blog/memtensor-compromise). They delivered a Go backdoor that targeted secrets, configurations, and API tokens of various services.

In August, Jamf researchers also reported discovering a new backdoor, [Overlord](https://www.jamf.com/blog/fake-zoom-installer-delivers-overlord-rat-macos/). It was distributed as fake Zoom installers and had fairly broad spyware functionality, which is not often seen in macOS backdoors: it could eavesdrop through the microphone, watch the user through the camera, capture the screen, and log keystrokes.

In the third quarter, [we discovered](https://securelist.com/macsync-new-version/121383/) an updated version of the MacSync crypto stealer and backdoor with a significantly changed payload delivery method.

### TOP 20 threats to macOS

*Unique users who encountered this malware as a percentage\* of all attacked users of Kaspersky security solutions for macOS ([download](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/11/09171205/06-en-malware-report-charts-scaled.png))*

*\* Data for the previous quarter may differ slightly from previously published data due to certain verdicts being retrospectively revised.*

The share of Ngrok, a network tunneling tool suite with both legitimate and malicious uses, continued to grow, bringing it to the top of the list. We’re also seeing more detections of the well-known Amos malware, both the traditional stealer and a version with backdoor functionality.

### TOP 10 countries and territories by share of attacked users

|     |     |     |
| --- | --- | --- |
| **Country/territory** | **%\* Q2 2026** | **%\* Q3 2026** |
| Brazil | 1.14% | 1.13% |
| Hong Kong | 0.59% | 0.92% |
| China | 0.55% | 1.04% |
| India | 0.55% | 0.41% |
| Germany | 0.36% | 0.33% |
| Singapore | 0.30% | 0.85% |
| Russia | 0.21% | 0.24% |
| Japan | 0.18% | 0.21% |
| Netherlands | 0.16% | 0.31% |

*\* Unique users who encountered threats to macOS as a percentage of all unique Kaspersky users in the country/territory.*

## IoT threat statistics

*This section presents statistics on attacks targeting Kaspersky IoT honeypots. The geographic data on attack sources is based on the IP addresses of attacking devices.*

### Distribution by protocol

In Q3 2026, the share of devices attacking Kaspersky honeypots over SSH grew to 18.42%.

*Distribution of attacked services by number of unique IP addresses of attacking devices ([download](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/11/09171342/07-en-malware-report-charts.png))*

The distribution of attacks over the Telnet and SSH protocols shows the same trend.

*Distribution of cybercriminal sessions in Kaspersky honeypots ([download](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/11/09171502/08-en-malware-report-charts.png))*

### TOP 10 threats delivered to IoT devices

*Share of each threat delivered to an infected device as a result of a successful attack, out of the total number of threats delivered ([download](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/11/09171619/09-en-malware-report-charts.png))*

Mirai’s share of the overall IoT threat distribution declined, while other botnet threats that deliver malware grew.

### Attacks on IoT honeypots

In the distribution of SSH attacks, the Netherlands, Bulgaria, and the US accounted for the largest shares, with the share of attacks originating from Bulgaria having grown fourfold. Germany comes next, with its share down by about half.

|     |     |     |
| --- | --- | --- |
| **Country/territory** | **Q2 2026** | **Q3 2026** |
| Netherlands | 21.18% | 27.70% |
| Bulgaria | 5.50% | 20.05% |
| United States | 6.76% | 10.17% |
| Germany | 16.73% | 8.36% |
| Romania | 4.06% | 4.20% |
| India | 2.78% | 3.52% |
| Panama | 4.67% | 2.19% |
| Indonesia | 1.54% | 2.06% |
| Vietnam | 3.91% | 2.01% |
| Singapore | 1.99% | 1.42% |

Pakistan’s share of Telnet attacks kept growing, reaching 47.73%.

|     |     |     |
| --- | --- | --- |
| **Country/territory** | **Q2 2026** | **Q3 2026** |
| Pakistan | 36.60% | 47.73% |
| China | 35.62% | 33.83% |
| Russia | 8.75% | 4.65% |
| India | 4.19% | 2.77% |
| Taiwan | 0.47% | 1.64% |
| Argentina | 0.12% | 1.45% |
| Philippines | 0.95% | 1.08% |
| United States | 3.03% | 0.90% |
| Indonesia | 1.52% | 0.81% |
| Germany | 0.05% | 0.75% |

## Attacks via web resources

*The statistics in this section are based on detection verdicts by Web Anti-Virus, which protects users when suspicious objects are downloaded from malicious or infected web pages. These malicious pages are purposefully created by cybercriminals. Websites that host user-generated content, such as message boards, as well as compromised legitimate sites, can become infected.*

### TOP 10 countries and territories that served as sources of web-based attacks

*The following statistics show the distribution by country/territory of the sources of internet attacks blocked by Kaspersky products on user computers (web pages redirecting to exploits, sites containing exploits and other malware, botnet C&C centers, and so on). One or more web-based attacks could originate from each unique host.*

*To determine the geographic source of web attacks, we matched each domain name to the actual IP address hosting it, then geolocated that address (GeoIP).*

In Q3 2026, Kaspersky solutions blocked 311,083,655 attacks launched from online resources across the globe. Web Anti-Virus was triggered by 46,936,926 unique URLs.

*Web-based attacks by country/territory, Q3 2026 ([download](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/11/09171741/10-en-malware-report-charts.png))*

### Countries and territories where users faced the greatest risk of online infection

To assess the risk of malware infection via the internet for users’ computers in different countries and territories, we calculated the share of Kaspersky users in each location on whose computers Web Anti-Virus was triggered during the reporting period. The resulting data provides an indication of the aggressiveness of the environment in which computers operate in different countries and territories.

This ranked list includes only attacks by malicious objects classified as Malware. Our calculations leave out Web Anti-Virus detections of potentially dangerous or unwanted programs, such as RiskTool or adware.

|     |     |     |
| --- | --- | --- |
|     | **Country/territory\*** | **%\*\*** |
| 1   | Bangladesh | 12.03 |
| 2   | Taiwan | 8.06 |
| 3   | Venezuela | 7.92 |
| 4   | Vietnam | 7.71 |
| 5   | India | 7.61 |
| 6   | Belgium | 6.80 |
| 7   | France | 6.54 |
| 8   | Nepal | 6.48 |
| 9   | Greece | 6.22 |
| 10  | UAE | 6.13 |
| 11  | Portugal | 6.10 |
| 12  | Germany | 5.75 |
| 13  | China | 5.71 |
| 14  | Qatar | 5.70 |
| 15  | Serbia | 5.58 |
| 16  | Austria | 5.57 |
| 17  | Sri Lanka | 5.40 |
| 18  | Australia | 5.32 |
| 19  | Italy | 5.31 |
| 20  | Morocco | 5.27 |

*\* Excluded are countries and territories with relatively few (under 10,000) Kaspersky users.*  
*\*\* Unique users targeted by web-based Malware attacks as a percentage of all unique users of Kaspersky products in the country/territory.*

On average over the quarter, 4.34% of internet users’ computers worldwide were targeted by at least one web-based Malware attack.

## Local threats

Statistics on local infections of user computers are an important indicator. They include objects that penetrated the target computer by infecting files or removable media, or initially made their way onto the computer in non-open form. Examples of the latter are programs in complex installers and encrypted files.

Data in this section is based on analyzing statistics produced by anti-virus scans of files on the hard drive at the moment they were created or accessed, and the results of scanning removable storage media. The statistics are based on detection verdicts from the On-Access Scan (OAS) and On-Demand Scan (ODS) modules of File Anti-Virus and include detections of malicious programs located on user computers or removable media connected to the computers, such as flash drives, camera memory cards, phones, or external hard drives.

In Q3 2026, our File Anti-Virus recorded 23,733,652 malicious and potentially unwanted objects.

### Countries and territories where users faced the highest risk of local infection

For each country and territory, we calculated the percentage of Kaspersky users whose computers had the File Anti-Virus triggered at least once during the reporting period. These statistics reflect the level of personal computer infection in different countries and territories worldwide.

Note that this ranked list includes only attacks by malicious objects classified as Malware. Our calculations leave out File Anti-Virus detections of potentially dangerous or unwanted programs, such as RiskTool or adware.

|     |     |     |
| --- | --- | --- |
|     | **Country/territory\*** | **%\*\*** |
| 1   | Turkmenistan | 45.68 |
| 2   | Burundi | 31.54 |
| 3   | Yemen | 30.31 |
| 4   | China | 29.93 |
| 5   | Afghanistan | 29.41 |
| 6   | Mozambique | 26.61 |
| 7   | Tajikistan | 26.29 |
| 8   | Republic of the Congo | 25.51 |
| 9   | Uzbekistan | 25.25 |
| 10  | Cameroon | 24.08 |
| 11  | Democratic Republic of the Congo | 23.55 |
| 12  | Uganda | 21.81 |
| 13  | Cambodia | 21.74 |
| 14  | Chad | 21.60 |
| 15  | Syria | 21.43 |
| 16  | Nicaragua | 21.02 |
| 17  | South Sudan | 20.72 |
| 18  | Bangladesh | 19.78 |
| 19  | Mali | 19.59 |
| 20  | Angola | 18.25 |

*\* Excluded are countries and territories with relatively few (under 10,000) Kaspersky users.  
\*\* Unique users on whose computers Malware local threats were blocked, as a percentage of all unique users of Kaspersky products in the country/territory.*

On average worldwide, Malware local threats were detected at least once on 10.88% of users’ computers during Q3.

Russia scored 9.37% in these rankings.
