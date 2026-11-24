---
title: 23rd November – Threat Intelligence Report
source: https://research.checkpoint.com/2026/23rd-november-threat-intelligence-report/
source_host: research.checkpoint.com
clip_date: 2026-11-24T11:37:28+08:00
trace_id: 5bccb4cc-1c1a-44a2-981c-dfa8d635b03d
content_hash: 5cedb6920992d6bf0fc0b5d49c8a9851d5c800bfe168d46bae31c9d826bada54
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
notion_page_id: 42275244-d011-81da-8a91-ea615d285be9
ioc:
  cves:
    - CVE-2026-114938
    - CVE-2026-123007
    - CVE-2026-123633
    - CVE-2026-129289
    - CVE-2026-132165
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

For the latest discoveries in cyber research for the week of 23rd November, please download our [Threat Intelligence Bulletin](https://research.checkpoint.com/wp-content/uploads/2026/11/Threat_Intelligence_News_2026-11-23.pdf).

**TOP ATTACKS AND BREACHES**

-   The FBI has reportedly [experienced](https://www.bleepingcomputer.com/news/security/fbi-reportedly-hacked-again-this-time-targeting-nationwide-police-database/) a second cyber incident in recent months, this time targeting its National Crime Information Center (NCIC). The database shares records on fugitives, warrants, criminal histories, and missing persons among US law enforcement agencies. The attackers’ identities, entry method, and potential data exposure were not disclosed by the FBI.
-   Japan’s RIKEN research institute, which operates one the world’s strongest supercomputers ‘Fugaku’, [suspended](https://cybersecuritynews.com/japan-shuts-down-fugaku-supercomputer/) operations after attackers breached its operations network and tampered with servers between November 10 and 13. The intrusion potentially exposed account information belonging to 4,597 users, including credentials that could provide access to external systems.
-   The European Commission, the EU’s executive body, has [suffered](https://www.reuters.com/legal/litigation/eu-commission-targeted-cyberattack-politico-reports-2026-11-19/) a cyberattack that disrupted internal systems for more than ten days. Affected services included payroll, health insurance, and translation systems. Officials claimed that they contained most of the disruption, and that the attack was assisted by AI tools.
-   US-based cybersecurity and networking provider Infoblox has [confirmed](https://techcrunch.com/2026/11/16/cyber-giant-infoblox-confirms-security-incident-after-hackers-access-company-information/) unauthorized access to company information through a compromised third-party data migration vendor. The breach reportedly involved sensitive customer data stored in a migration environment. Infoblox stated that its products and services were unaffected and did not disclose the number of customers impacted.

**AI THREATS**

-   Check Point Research has [demonstrated](https://research.checkpoint.com/2026/30-years-of-gatekeeper-asymmetry-doom-the-paradox-that-makes-powerful-llms-more-vulnerable/) how differences in capability between AI security filters and underlying language models can enable attackers to bypass safeguards. The analysis describes this limitation as gatekeeper asymmetry, drawing on prompt injection research and examples of security systems failing to recognize malicious inputs.
-   Researchers [analyzed](https://aws.amazon.com/it/blogs/security/chinese-nexus-actors-cairn-ai-agents-found-a-zero-day-on-their-own/) a campaign involving a China-linked threat actor that used the AI-powered Cairn framework against East Asian universities. Autonomous agents discovered and exploited a previously unknown vulnerability in open-source medical imaging software, reportedly obtaining root privileges within approximately 11 minutes. The affected software has since been patched.
-   Researchers [examined](https://www.darkreading.com/perimeter/themailer-phishing-kit-ai-drivers-seat) TheMailer, an AI-powered phishing kit that uses language models to generate personalized emails and automatically rewrite messages to evade spam filters. Observed activity included a campaign involving nearly 25,000 emails and a target list exceeding 145,000 recipients. The effectiveness of these campaigns remains unverified.

**VULNERABILITIES AND PATCHES**

-   PHP has [released](https://blog.checkpoint.com/security/new-php-vulnerabilities-what-organizations-need-to-know-and-how-check-point-customers-are-protected/) security updates addressing seven critical vulnerabilities affecting PHP 8.2–8.5, including CVE-2026-129289 (CVSS 9.2). Under specific configurations, the flaws can enable unauthenticated remote code execution or privilege escalation. Fixed versions include 8.2.36, 8.3.37, 8.4.28, and 8.5.13. The issues affect PHP-FPM, session handling, and core runtime components.

*CVE-2026-129289 is prevented by the “HTTP Non Compliant” protocol anomaly protection. For full protection against this threat, make sure the “Non Compliant HTTP” inspection setting is active on the Gateway**.*

-   NGINX has [released](https://blog.checkpoint.com/security/two-critical-nginx-http-2-flaws-what-to-patch-first/) security updates addressing five high-severity vulnerabilities, including CVE-2026-123007, that could allow unauthenticated attackers to execute commands under certain configurations. Researchers estimated that approximately 8.8 million services may remain exposed. Proof-of-concept exploitation has been demonstrated, but no confirmed attacks were reported.

*Check Point IPS provides protection against these threats* *(NGINX Remote Code Execution (CVE-2026-123007, CVE-2026-123633))*

-   Oracle and OpenJDK maintainers have [released](https://www.cert.europa.eu/publications/security-advisories/2026-021/) fixes for CVE-2026-114938, a high-severity vulnerability affecting Java’s Base64 decoding functionality on certain x86-64 systems. The flaw could allow unauthenticated attackers to execute arbitrary code remotely or crash vulnerable applications.

*Check Point IPS provides protection against this threat* *(OpenJDK Base64 Decoder Memory Corruption PoC (CVE-2026-114938))*

-   Drupal has [released](https://www.bleepingcomputer.com/news/security/drupal-patches-critical-rce-flaw-warns-exploits-may-surface-quickly/) security updates addressing CVE-2026-132165, a critical vulnerability in its content management system. Under certain conditions, unauthenticated attackers could exploit the installation process to reinstall Drupal, take control of affected websites, or execute arbitrary code. Fixed versions include Drupal 10.6.22, 11.3.22, and 11.4.13.

**THREAT INTELLIGENCE REPORTS**

-   Check Point Research has [reported](https://blog.checkpoint.com/security/ransomware-reaches-record-highs-in-q3-2026-as-the-threat-landscape-fragments/) a record 2,830 ransomware victims in Q3 2026, claimed by 117 ransomware brands, up from 91 in the previous quarter. The ten largest groups accounted for just 49% of victims, while average ransom payments fell 45% to slightly over $1 million.
-   Check Point Research has [identified](https://blog.checkpoint.com/corporate/black-friday-cyber-crime-2026-attacks-on-retailers-surge-28-as-risky-domains-multiply/) a 28% increase in weekly cyberattacks against consumer goods and services organizations ahead of Black Friday 2026. Also, over 4,000 newly registered sales-related domains were found, alongside fake retail storefronts and delivery phishing websites.
-   Researchers [exposed](https://cloud.google.com/blog/topics/threat-intelligence/cold-relic-a-case-study-in-impersonation-and-compromise) how Russian cyberespionage group Cold Relic exploited a cloud compromise at one US organization to infiltrate another through trusted-contact impersonation. Across both intrusions, attackers stole employee directories, emails, cloud files, and credentials, using the information to develop convincing phishing messages targeting connected organizations.

The post [23rd November – Threat Intelligence Report](https://research.checkpoint.com/2026/23rd-november-threat-intelligence-report/) appeared first on [Check Point Research](https://research.checkpoint.com/).
