---
title: 16th November – Threat Intelligence Report
source: https://research.checkpoint.com/2026/16th-november-threat-intelligence-report/
source_host: research.checkpoint.com
clip_date: 2026-11-19T09:00:25+08:00
trace_id: 5c4782bc-b0a4-4f9c-b7aa-64f38c4f357a
content_hash: 76138a13107fa63f3653cb81d6ed6dde3193ba30a0bbdfd3622c21eca8f4829c
status: synced
tags: []
series: null
feed_source: Check Point Research
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41d75244-d011-8152-86f2-d0f9ad6e9188
ioc:
  cves:
    - CVE-2026-116928
    - CVE-2026-119618
    - CVE-2026-123039
    - CVE-2026-124194
    - CVE-2026-125350
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

For the latest discoveries in cyber research for the week of 16th November, please download our [Threat Intelligence Bulletin](https://research.checkpoint.com/wp-content/uploads/2026/11/Threat_Intelligence_News_2026-11-16.pdf).

**TOP ATTACKS AND BREACHES**

-   TSMC, a major Taiwanese semiconductor manufacturer, has [confirmed](https://therecord.media/tsmc-confirms-employee-data-breach-cloud-provider) a data breach at an unnamed cloud provider that exposed information about current and former employees. A hacker advertised 6.9 GB of allegedly stolen employee data on a cybercrime forum. According to the company, TSMC’s own systems and customer data were unaffected.
-   Danish shipping and logistics giant Maersk [confirmed](https://www.bleepingcomputer.com/news/security/maersk-confirms-data-breach-as-whitearmor-ransomware-demands-5-million/) unauthorized access and data theft from a legacy system inherited through an acquisition. The WhiteArmor extortion group claimed to have stolen approximately 100GB of information and demanded $5 million. Maersk stated that its other systems and customer operations remained unaffected.
-   Japan’s Osaka city government [disclosed](https://therecord.media/city-of-osaka-japan-email-data-breach) a data breach exposing more than one million email addresses after attackers compromised a third-party email distribution service. The November 2 attack affected nearly 400 customers of the provider, exposing approximately 77 million addresses and enabling the distribution of fraudulent emails.
-   ConnectWise, a US-based IT management software provider, [disclosed](https://cyberscoop.com/connectwise-screenconnect-sckit-attack/) attacks targeting its ScreenConnect remote access platform. Attackers compromised managed service provider environments and deployed malicious remote access tools on at least 288 endpoints across 48 organizations. The campaign may have involved the abuse of third-party extensions.

**AI THREATS**

-   Researchers [analyzed](https://www.security.com/threat-intelligence/ai-assisted-attack-us-retailer) a suspected AI-assisted intrusion targeting a US retailer. After security tools blocked the attacker’s initial commands, the intruder switched to apparently AI-generated scripts. The attacker extracted credentials from SolarWinds Orion monitoring software configuration files and accessed another server within minutes, demonstrating rapid adaptation during the intrusion.
-   Researchers [revealed](https://unit42.paloaltonetworks.com/cairn-framework-ai-autonomous-attacks/) an autonomous intrusion campaign in which attackers used DeepSeek and Zhipu GLM AI agents against at least 19 organizations during 25 operations. The campaign compromised 10 targets, including semiconductor, defense, and civil-society organizations, exposing credentials and sensitive information, including more than one million personal records.
-   Researchers [uncovered](https://www.cloudsek.com/blog/off-the-rails-inside-an-exposed-silent-lynx-server) an exposed server belonging to Silent Lynx, a cyberespionage group targeting Central Asian governments. The attackers used a DeepSeek-powered AI agent to automate reconnaissance, data collection, and evidence removal. Compromised systems included Tajikistan’s railway network and government document infrastructure containing thousands of sensitive files.

**VULNERABILITIES AND PATCHES**

-   Check Point Research has [traced](https://research.checkpoint.com/2026/php2shell-exploitation-on-check-point-gateway/) attacks exploiting PHP2Shell through the Mobile Access portals of unpatched Check Point Security Gateways. Attackers then exploited CVE-2026-123039 to escalate privileges, achieved persistence, and in some cases wiped a VMware ESXi host. The first wave of attacks targeted Israeli organizations before expanding worldwide, and the tooling shows similarities to China-linked malware.
-   Microsoft [released](https://www.malwarebytes.com/blog/bugs/2026/11/microsoft-patch-tuesday-fixes-outlook-flaw-already-under-attack) November security updates fixing more than 1,000 vulnerabilities, including an actively exploited Outlook flaw, CVE-2026-124194, that can expose authentication data and enable user impersonation. The release also fixes 48 critical code-execution flaws, including CVE-2026-116928, which could let malicious email attachments run code without being opened.
-   Google [patched](https://www.malwarebytes.com/blog/bugs/2026/11/update-chrome-now-to-fix-a-flaw-attackers-are-exploiting) CVE-2026-125350, a high-severity vulnerability affecting Chrome’s XML processing component that has been exploited in active attacks. The November security update addresses nine vulnerabilities across supported platforms, including Windows, macOS, Linux, and Android. The fixes address security weaknesses that could enable code execution or bypass existing protections.

*Check Point IPS provides protection against this threat* *(Google Chrome Use After Free (CVE-2026-125350))*

-   Apache has [fixed](https://httpd.apache.org/security/vulnerabilities_24.html#CVE-2026-119618) CVE-2026-119618, a critical vulnerability affecting HTTP Server versions 2.4.55 through 2.4.70 when HTTP/2 is enabled. The flaw carries a CVSS score of 9.8 and allows unauthenticated attackers to execute arbitrary code remotely. Successful exploitation could compromise vulnerable servers. Version 2.4.71 addresses the issue.

**THREAT INTELLIGENCE REPORTS**

-   Check Point Research has [identified](https://research.checkpoint.com/2026/not-all-that-glitters-is-gold-tracking-copperdragons-sparrow-framework-around-the-globe/) cyberespionage campaigns linked to CopperDragon, a suspected digital quartermaster to China-nexus threat actors. The campaigns targeted government, military, telecom, and critical infrastructure organizations worldwide. Attackers compromised internet-facing systems and legitimate websites to distribute backdoors and steal sensitive information.
-   Check Point Research has [published](https://blog.checkpoint.com/research/october-2026-cyber-threat-landscape-record-ransomware-rising-genai-risk-and-an-ai-powered-newcomer/) its October 2026 threat landscape. Organizations faced an average of 2,550 weekly attacks, down 9% from September but up 32% year over year, while one in every 35 enterprise GenAI prompts posed a high risk of sensitive data leakage. Ransomware reached a record of 1,063 reported
-   Check Point Research has [summarized](https://blog.checkpoint.com/security/from-water-systems-to-supermarket-refrigerators-inside-shahid-kaveh-and-cyberav3ngers-ot-attacks/) the activity of Shahid Kaveh, an IRGC-affiliated cyber unit that France blamed for the October sabotage of refrigeration controllers at around 700 retail sites, causing widespread food losses and fires. The unit operates the CyberAv3ngers persona.
-   Researchers [analyzed](https://securityaffairs.com/202800/apt/russia-linked-apt-turla-turned-exchange-servers-into-their-own-control-room.html) Russia-linked Turla’s Cereal toolset, a cyberespionage platform discovered on compromised government Microsoft Exchange servers in Kazakhstan and Romania. The malware enables operators to extract emails, credentials, and system information. Romanian operations reportedly targeted communications involving NATO and European Union organizations.

The post [16th November – Threat Intelligence Report](https://research.checkpoint.com/2026/16th-november-threat-intelligence-report/) appeared first on [Check Point Research](https://research.checkpoint.com/).
