---
title: 9th November – Threat Intelligence Report
source: https://research.checkpoint.com/2026/9th-november-threat-intelligence-report/
source_host: research.checkpoint.com
clip_date: 2026-11-10T01:22:58+08:00
trace_id: cadde991-409a-45ea-abd4-1e5a78952b4f
content_hash: 5e364ddad1dfa4e814b1e9da02b08674a4851745f694f0ee7f163eb2e117586b
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
notion_page_id: 41375244-d011-81cd-9635-dd473cbf7cb3
ioc:
  cves:
    - CVE-2026-111560
    - CVE-2026-116606
    - CVE-2026-123158
    - CVE-2026-19868
    - CVE-2026-58868
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

For the latest discoveries in cyber research for the week of 9th November, please download our [Threat Intelligence Bulletin.](https://research.checkpoint.com/wp-content/uploads/2026/11/Threat_Intelligence_News_2026-11-09.pdf)

**TOP ATTACKS AND BREACHES**

-   Queens Public Library, a New York City public library system serving approximately 2.3 million residents, was [struck](https://lithub.com/the-queens-public-library-system-is-being-held-for-ransom/) by a ransomware attack that encrypted its systems. The incident disrupted public computers, Wi-Fi, checkout equipment, digital media services, and its mobile application, while all 66 branches remained open.
-   Russian web hosting provider Beget [sustained](https://therecord.media/russia-cyberattack-beget-cloud) a destructive cyberattack on November 1 that wiped data across its cloud infrastructure and disrupted hundreds of websites. The attack affected businesses and public services, with more than 1,000 servers requiring manual inspection before restoration. Some backup data was reportedly destroyed.
-   OPSSHIELD, developer of the Linux security tool cPGuard, [disclosed](https://thehackernews.com/2026/11/cpguard-update-channel-hijacked-to.html) a supply-chain attack after compromised credentials enabled attackers to distribute malicious updates on November 2. Approximately 2,950 customer servers executed the malicious script, which installed a backdoor and collected password hashes, credentials, and sensitive server files.
-   Ukraine’s Air Alert app, an emergency notification service used by millions, was [compromised](https://therecord.media/ukraine-hackers-russia-alert-system) by attackers who distributed false radiation, chemical-threat, and military alerts to Kyiv residents. Developers temporarily suspended notifications. A separate attack affected Russia’s emergency alert application, although both countries reported that their core warning systems remained operational.

**AI THREATS**

-   Check Point Research [documented](https://research.checkpoint.com/2026/hacking-on-autopilot-inside-artex-cybercrime-campaigns/) cybercriminals using ARTEX, an AI-powered framework that autonomously discovers and exploits vulnerable systems. Researchers identified 1,608 live, publicly accessible instances. Observed campaigns obtained more than 300 iOS signing certificates and harvested approximately 190,000 gaming credentials, including around 6,000 active accounts.
-   Check Point Research [identified](https://research.checkpoint.com/2026/free-the-model-sell-the-gateway-prompt-adware-hidden-in-jailbreak-bundles/) Haiou, a jailbreak bundle targeting OpenAI Codex that weakens safeguards and modifies agent instructions to promote an external AI gateway. The package also installs security-related capabilities and appeared on infrastructure associated with cybercrime tools, although researchers did not establish that its developers intended criminal use.
-   India’s Computer Emergency Response Team [identified](https://www.infosecurity-magazine.com/news/india-warns-ai-cyberattacks/) Crafty Falcon, a threat actor using AI-assisted tools to target financial services and cryptocurrency businesses. Attackers exploited connections between testing and production environments, abused payment APIs, and stole wallet credentials. AI tools helped generate tailored attack scripts and automate complex intrusion sequences.

**VULNERABILITIES AND PATCHES**

-   SonicWall [patched](https://www.cyber.gc.ca/en/alerts-advisories/sonicwall-security-advisory-av26-1133?utm_source=chatgpt.com) CVE-2026-19868, a high-severity vulnerability affecting SonicOS SSL VPN services configured with SAML authentication. Attackers possessing valid credentials for an alternative authentication method could bypass SAML controls, including multi-factor authentication. The vulnerability has been linked to active exploitation and affects enterprise firewall environments.
-   Google published November’s Android Security bulletin, addressing numerous vulnerabilities across Android components. Among the flaws patched is CVE-2026-58868, a critical vulnerability affecting Android versions 14 through 17 that could allow remote code execution without user interaction.
-   Barracuda [patched](https://trust.barracuda.com/security/pre-authentication-authorization-bypass-command-injection?utm_source=chatgpt.com) CVE-2026-116606 and CVE-2026-111560, two high-severity vulnerabilities affecting its Email Security Gateway appliances. Attackers with access to the administrative interface could chain an authentication bypass with command injection to gain root-level control without logging in. The flaws received CVSS scores of 9.3 and 8.6, respectively.
-   OpenSSH [addressed](https://thehackernews.com/2026/11/hackers-exploited-openssh-sshole-flaw.html?utm_source=chatgpt.com) CVE-2026-123158, a high-severity vulnerability (CVSS 8.1) affecting Linux systems using the musl library without PAM authentication. Attackers can exploit oversized passwords to bypass authentication on certain accounts. Active exploitation was observed, including successful root access against an Alpine Linux honeypot. Version 10.6p2 fixes the flaw.

**THREAT INTELLIGENCE REPORTS**

-   Check Point researchers [analyzed](https://blog.checkpoint.com/security/hyflock-ransomware-evolves-with-new-builds-and-encryption-weaknesses/) the evolution of HYFLOCK ransomware across four generations, identifying new capabilities for file encryption, scheduled-task execution, and network-share access. The October builds contained encryption weaknesses, allowing researchers to partially recover data from encrypted files without a decryption key. The group claimed eight victims in October.
-   Researchers [detailed](https://www.darkreading.com/mobile-security/apt29-watering-holes-target-mobile-users) an APT29 cyberespionage campaign targeting iPhone and Android users through compromised and imitation websites. Malicious scripts identified visitors’ devices and attempted to exploit unpatched vulnerabilities. Successful compromises could expose messages, credentials, and sensitive information, particularly from users in Ukraine.
-   Researchers [analyzed](https://www.fortinet.com/blog/threat-research/bitter-expands-its-arsenal-with-paprat) BITTER APT’s espionage campaign targeting government, energy, and engineering organizations across South Asia. Attackers distributed malicious files disguised as diplomatic and military documents to deploy PapRAT spyware. The malware collected system information, executed commands, and transferred files.
-   Researchers [traced](https://www.welivesecurity.com/en/eset-research/slippynunchucks-hijacks-sogou-input-methods-brand-promotion-mechanism-to-distribute-malware/) SlippyNunchucks, a China-aligned espionage group, to attacks abusing the trusted update and configuration mechanisms of Sogou Input Method. DNS hijacking redirected application traffic to attacker-controlled infrastructure, delivering DarkVigil malware to victims across several countries. Tencent addressed the affected delivery mechanism in version 16.10.

The post [9th November – Threat Intelligence Report](https://research.checkpoint.com/2026/9th-november-threat-intelligence-report/) appeared first on [Check Point Research](https://research.checkpoint.com/).
