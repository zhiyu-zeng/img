---
title: Close search modal
source: https://unit42.paloaltonetworks.com/europes-refrigeration-systems-attacks/
source_host: unit42.paloaltonetworks.com
clip_date: 2026-11-07T08:20:02+08:00
trace_id: 56f99d03-25db-42ca-886a-3a2ec0c84e33
content_hash: 7246bb8c7efe41d30b6829cc287a5733029c1abd28907d49b8c53888ce2cfc01
status: synced
tags: []
series: null
feed_source: Unit 42
ai_summary: null
ai_summary_style: null
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 41175244-d011-8157-b33b-eebebdfd4111
ioc: null
---

## Introduction

Unit 42 has been actively monitoring for new developments related to the cyberattacks targeting refrigeration systems in Europe since at least October 2026. The unidentified threat actors gained unauthorized access to refrigeration controllers and set them to defrost mode, resulting in hundreds of supermarkets across the region having to throw away spoiled food. The time of year when this activity has occurred is particularly concerning since retailers need to maintain adequate inventory levels as shoppers ramp up spending during holiday periods.

Here we provide a high-level overview of the attacks based on public reporting and explore insights on device exposure by country, based on our findings using [Cortex Xpanse](https://www.paloaltonetworks.com/cortex/cortex-xpanse). It also explores how Palo Alto Networks customers can leverage existing products and Unit 42 services to reduce their attack surface to mitigate similar threat activity in the future.

## Background

The first wave of these attacks occurred overnight between Oct. 11–12, 2026, primarily targeting approximately 700 supermarkets in France. Since that time, another wave occurred overnight between Nov. 1–2, 2026, expanding across at least 10 additional European countries and impacting over 100–115 retail locations.

In addition to the aforementioned activity, French authorities recently disclosed that refrigeration systems used by medical facilities were impacted by the attacks. At this time, there’s no evidence to suggest blood products were spoiled as a result.

According to multiple sources, the threat actors behind the supermarket activities raised the temperature of the targeted refrigeration units as high as 50°C (122°F). In some cases, the activity resulted in fires. The initial access vector currently remains unconfirmed. However, there is widespread speculation that impacted devices were potentially running vulnerable versions of software and/or used default credentials provided by the manufacturers that attackers easily identified.

### Unit 42 Insights

From Nov. 5–6, 2026, we identified the presence of over 5,000 devices exposed to the internet that were manufactured by companies listed in the [CERT-FR advisory](https://cert.cyber.gouv.fr/alerte/CERTFR-2026-ALE-012) last month. These statistics do not necessarily mean that the devices are running vulnerable versions of software that could’ve been exploited. Figure 1 below illustrates these findings based on device count by the top 10 countries.

![Bar chart showing total device count by country. United States leads with 740, followed by China with 625, and Italy with 370. Other countries include Germany (262), France (234), Spain (220), Greece (177), Turkey (153), and Brazil (137). "Palo Alto Networks" and "Unit 42" logos are at the bottom right.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/555eadde09fc1f07.png)

Figure 1. Graph of internet exposed devices by country, top 10 results - Nov. 5–6 2026. Source: Cortex Xpanse.

Given the impact of this malicious activity primarily affected devices in France, we decided to explore the trend of internet-exposed devices since October 1, 2026. Figure 2 below illustrates these findings where we identified a significant decline over three distinct time periods:

-   October 1-15, 2026: 1,853
-   October 16-31, 2026: 558
-   November 1-6, 2026: 316

![Line graph titled "Number of Exposed Devices" shows a decreasing trend over three dates: October 15, 2026 (1,853 devices), October 31, 2026 (558 devices), and November 6, 2026 (316 devices). Palo Alto Networks Unit 42 logo is at the bottom right.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/85bce73e6e68cfd7.png)

Figure 2. Graph of internet exposed devices in France by date since Oct.1, 2026. Source: Cortex Xpanse.

[Censys has also reported](https://censys.com/blog/european-refrigeration-controller-exposure-sitrep/) extensively on the trends in device exposures in Europe as well.

## Conclusion

On Nov. 3, 2026, the pro-Russian hacktivist groups NoName057(16) and Z-Pentest [claimed responsibility for the attacks](https://cybernews.com/security/russian-hackers-hacked-european-refrigeration-systems/) via Telegram posts, although their allegations remain unverified at this time. The Cybersecurity and Infrastructure Security Agency (CISA) also released an [advisory](https://www.cisa.gov/resources-tools/resources/us-government-partners-urge-hardening-industrial-refrigeration-and-cold-chain-monitoring-systems) on Nov. 5, 2026 warning of potential exploitation via authentication bypass, arbitrary code injection, and weak configurations.

Palo Alto Networks customers can leverage several products and Unit 42 services to identify and defend against potential exploitation and unauthorized access to exposed devices.

[Cortex Xpanse](https://www.paloaltonetworks.com/cortex/cortex-xpanse) can identify exposed devices on the public internet and escalate these findings to defenders.

[Device Security](https://docs.paloaltonetworks.com/iot/getting-started/iot-security-solution) is designed to provide continuous discovery, risk assessment, and protocol-level visibility across OT and IoT infrastructure, identifying weak configurations, default credentials, exposed administrative interfaces and anomalous control-plane traffic. Complementing this visibility, [Frontier Virtual Patching](https://www.paloaltonetworks.com/network-security/advanced-threat-prevention) with [Advanced Threat Prevention](https://docs.paloaltonetworks.com/advanced-threat-prevention/administration) inspects network traffic inline to block exploit attempts, command-and-control communication, and arbitrary code injection in real time. Together, these capabilities allow organizations to enforce adaptive access controls around vulnerable controllers and virtually shield unpatched firmware from unauthorized modification without disrupting critical physical operations.

[Unit 42 Continuous Frontier AI Defense](https://www.paloaltonetworks.ca/unit42/prepare-for-emerging-risks/continuous-frontier-ai-defense) is an offensive security service designed to assist organizations with continuously discovering hidden and unknown exposures in dynamic environments, validate real-world exploitability across attack paths through agentic testing and expert analysis, and provide prioritized remediation and virtual patching guidance to accelerate risk mitigation.

Organizations can access tailored adversary intelligence, direct analyst consultations, and specialized exposure tracking through [Unit 42 Threat Intel Services](https://www.paloaltonetworks.com/unit42/threat-intelligence) and its [Deep and Dark Web Service](https://www.paloaltonetworks.com/resources/datasheets/unit-42-deep-and-dark-web-service).

The [Unit 42 Incident Response team](https://start.paloaltonetworks.com/contact-unit42.html) can also be engaged to help with a compromise or to provide a proactive assessment to lower your risk.

## Additional Resources

![Learn icon](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4ebde671ada7d2d6.svg)

-   [French blood banks hacked in latest cyber-attack on Europe](https://www.theguardian.com/technology/2026/nov/04/france-national-blood-service-hack-cyber-attack-europe) – The Guardian
-   [Hackers Crank the Heat on Europe’s Supermarket Freezers to Above 120 Degrees](https://www.wsj.com/tech/cybersecurity/hackers-crank-the-heat-on-europes-supermarket-freezers-to-above-120-degrees-73597a8a?mod=Searchresults&pos=1&page=1) – WSJ
-   [Over 100 European Stores Hit as Supermarket Fridge Attacks Return](https://www.securityweek.com/over-100-european-stores-hit-as-supermarket-fridge-attacks-resume/) – SecurityWeek
-   [Hackers disrupt refrigeration systems at European supermarkets](https://www.bleepingcomputer.com/news/security/hackers-disrupt-refrigeration-systems-at-european-supermarkets/) – BleepingComputer
-   [The French Supermarket Attack Is Another Wake-Up Call for Every Critical Industry](https://www.paloaltonetworks.com/blog/network-security/the-french-supermarket-attack-is-another-wake-up-call-for-every-critical-industry/) – Palo Alto Networks

[Threat Research Center](https://unit42.paloaltonetworks.com/ "Threat Research") [Next: Unit 42 Threat Intelligence Highlights - Nov. 2, 2026](https://unit42.paloaltonetworks.com/u42-threat-intelligence-highlights-oct-2026/ "Unit 42 Threat Intelligence Highlights - Nov. 2, 2026")
