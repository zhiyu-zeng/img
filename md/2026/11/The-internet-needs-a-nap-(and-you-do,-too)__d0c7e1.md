---
title: The internet needs a nap (and you do, too)
source: https://blog.talosintelligence.com/the-internet-needs-a-nap-and-you-do-too/
source_host: blog.talosintelligence.com
clip_date: 2026-11-20T03:29:06+08:00
trace_id: f089261c-01e7-4fc4-bc3f-bd794defcb41
content_hash: 844fb89610b98e35a414593db92e41635f30249cc35464e7b21eafa1dbcec059
status: synced
tags: []
series: null
feed_source: Cisco Talos
ai_summary: null
ai_summary_style: null
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 41d75244-d011-8124-9942-cda6b3577eef
ioc:
  cves:
    - CVE-2026-114938
  cwes: []
  hashes:
    - 0cf0271c3564881fce95f44c649bd745
    - 2915b3f8b703eb744fc54c81f4a9c67f
    - 485055033bcddfde56325c0d2feea4f2
    - 73a25ff8893260418c2271b863c567e40e842adbab3c57023cb72de590ea377d
    - 7fc50b69b56bfdfa9fc0a3e088ff13904587d6336a51e9edcc7919cba83d4e3f
    - 95a6a4b638cfdfbe3afc883d593a1f87
    - 985c3972712218c62d2418b41056dba5fe883ca5104d8ec12041f8611db344f9
    - 9f1f11a708d393e0a4109ae189bc64f1f3e312653dcf317a2bd406f18ffcc507
    - cca616647db9370c88998ae25da6997f
    - f4b1f888f29faa7fbec180f42bdc78596e8a8b908c0a6e6c419933703c81df85
  domains: []
  tools: []
  techniques: []
---

![The internet needs a nap (and you do, too)](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5862b764f1150b7b.jpg)

“Not everything that is faced can be changed; but nothing can be changed until it is faced.” — James Baldwin

Welcome to this week’s edition of the Threat Source newsletter. I had planned to write about one thing. The week, apparently, had other plans.

I can start with conversation on the most viral cybersecurity news of the week. So obviously I had to go with PHP... oh wait, Java. Let’s type this up... wait, Outlook, Apple? The NSA? As soon as I start to type nginx comes pounding on my door. It’s the kind of news cycle that makes me wonder if the internet is trying to tell us something. I think it just wants everyone to stop asking it for things for a few hours, and can you blame it?

These are different events with different causes. A vulnerability is not an outage, and an outage is not automatically an attack. But they all arrive in the same place: someone’s queue, someone’s pager, someone’s overflowing calendar. The headlines might be viral and “new,” but the work they create is not.

For all of us, the work starts with knowing what is in the environment. Which systems run PHP or Java? Where is nginx deployed? Who owns those devices and services? Are they still supported? Are they properly admin’d? In every environment there is an application that everyone knows is important, and no one is quite sure how to patch it without breaking something else (or everything else). Isolating these devices and applications and getting them into the modern era is a challenging lift, but it’s beyond time and a big part of “know your environment.”

Then there’s the telemetry. A new vulnerability or a service disruption can make ordinary activity look strange, and strange activity can disappear into the noise when everyone is busy chasing the latest alert. Teams need time to understand what “normal” looks like in your own network and ensure that your tools are being leveraged to their full potential by your smart people. Because *people* still have to decide what it means and what to do next.

“Patch faster” isn’t an answer, and it’s not realistic for anyone.

The new normal is a steady stream of things that demand attention, each one landing on systems and people already carrying too much. The answer is still the same unglamorous work: Know your environment, keep it as up to date as possible and watch it carefully for the anomalies, and most importantly give the people doing the work enough room to do it well.

“Every quality that made a person more valuable than a database was a product of experience.” — Ted Chiang

## The one big thing

Cisco Talos is [tracking the disclosure of "Java4Shell"](https://blog.talosintelligence.com/java4shell/) (CVE-2026-114938), a critical vulnerability in OpenJDK with a CVSS 4.0 score of 9.2. This flaw can lead to unauthenticated remote code execution (RCE) when a malformed Base64 input is sent to affected Java Virtual Machines. The vulnerability impacts OpenJDK Java versions 17.0.6 and later running on x86-64 CPUs with AVX-512 VBMI support enabled. While we haven't observed in-the-wild exploitation yet, the vulnerability has already been successfully tested against a suite of Java applications.

### Why do I care?

This vulnerability requires a specific subset of processors that support AVX-512 VBMI, which includes commonly deployed hardware from both Intel and AMD. Because of this, there is a large potential attack surface of vulnerable systems spanning both on-premise and cloud environments. Furthermore, as additional targets are tested and confirmed, that attack surface is likely to grow, and we anticipate probing attempts may pick up soon after public disclosure.

### So now what?

Defenders should apply the software update for this vulnerability. If immediate patching is not possible, you can mitigate the threat by starting the JVM with AVX-512 support disabled using "=XX:UseAVX=2". Keep in mind this mitigation is only applicable for x86-64 systems, as ARM-based processors will not recognize the command and will likely fail to start.

Deploy the Snort rules and review the Splunk detections [mentioned in the blog](https://blog.talosintelligence.com/java4shell/) to help detect malformed Base64 data and suspicious post-exploitation indicators. We will continue to monitor for exploitation attempts and provide updates accordingly.

## Top security headlines of the week

**Optimizely hack turns world's biggest websites into malware dispensers**  
BBC, Zoom, HSBC, and GitLab among those caught up in supply chain attack targeting visitors' crypto wallets, credit cards, and iPhones. ([The Register](https://www.theregister.com/cyber-crime/2026/11/17/optimizely-hack-turns-worlds-biggest-websites-into-malware-dispensers/5310448))

**NGINX2Root: New remote code execution vulnerabilities in nginx require urgent patching**  
nginx2root is a collection of five critical CVEs, the most impactful of which allows an unauthenticated attacker to execute commands on an affected nginx server with HTTP/2 enabled. ([Xint](https://nginx2root.com/))

**NIST finalizes post-quantum cryptography guidance, GAO offers a reality check**  
NIST laid out a technical road map to guide organizations through the process in its recent "Transition to Post-Quantum Cryptography Standards" report. The U.S. Government Accountability Office (GAO) cautions that federal agencies are not prepared to meet deadlines. ([Dark Reading](https://www.darkreading.com/cyber-risk/nist-finalizes-post-quantum-cryptography-guidance-gao-offers-a-reality-check))

**Microsoft rules out cyber attack in outage, warns of phishing campaign**  
The outage disrupted access to Exchange Online mailboxes and Outlook, and possibly affected Teams, SharePoint Online, and Microsoft 365 Copilot. Phishing emails posing as Microsoft 365 service notices referenced the real outage incident and threatened to delete held messages. ([SecurityWeek](https://www.securityweek.com/microsoft-rules-out-cyberattack-in-outage-warns-of-phishing-campaign/))

**Criminals attack French postal operator subsidiary, grab contact details of 22M people**  
Customers use Maileva for hybrid post services. They upload the documents they need to send to Maileva, which then prints and posts the letters on behalf of the customer. According to Maileva, the service has more than 70,000 registered users and is trusted to send more than 180 million documents per year. ([The Register](https://www.theregister.com/cyber-crime/2026/11/16/criminals-attack-french-postal-operator-subsidiary-grab-contact-details-of-22m-people/5310070))

**Police arrest 15 over £1.5M “we'll recover your losses” scam targeting elderly**  
City of London Police said the victims were initially targeted by a range of investment scams related to art, carbon credits, land, whisky, wine, and pensions, and that some took place more than a decade prior to their re-victimization. ([The Register](https://www.theregister.com/cyber-crime/2026/11/18/police-arrest-15-over-15m-well-recover-your-losses-scam-targeting-elderly/5310745))

## Can’t get enough Talos?

[**Talos Takes: Using public blockchains for malware command and control**](https://www.buzzsprout.com/2018149/episodes/20132459)  
Attackers are moving away from centralized infrastructure that is easy to seize or block. By leveraging public blockchains, threat actors are building highly resilient C2 channels that operate on top of legitimate, decentralized networks.

[**The challenge of defending against bulletproof dead drops on public blockchains**](https://blog.talosintelligence.com/the-challenge-of-defending-against-bulletproof-dead-drops-on-public-blockchains)  
The evolution of malware command-and-control (C2) infrastructure has shifted away from fragile, centralized servers and hardcoded domains toward resilient, decentralized blockchain networks that eliminate single points of failure.

[**UAT-12643: Suspected North Korea-aligned actor blends blockchain resilience with targeted infostealing**](https://blog.talosintelligence.com/uat-12643-suspected-north-korea-aligned-actor-blends-blockchain-resilience-with-targeted-infostealing)  
The actor’s arsenal has several payloads including the Go-based Overlord remote access trojan (RAT), a Python-based infostealer internally labelled “Good Game,” and a multi-cryptocurrency clipboard hijacker.

## Upcoming events where you can find Talos

-   [COP31](https://cop31.tr/) (Nov. 9 – 20) Antalya, Türkiye
-   [CYBERWARCON](https://www.cyberwarcon.com/) (Nov. 20) Arlington, VA
-   [AVAR 2026](https://events.aavar.org/cybersecurity-conference/) (Dec. 2 – 4) Hyderabad, India
-   [Black Hat Europe](https://blackhat.com/europe/) (Dec. 7 – 10) London, U.K.
-   [JSAC2027](https://jsac.jpcert.or.jp/) (Jan. 19 – 22) Tokyo, Japan
-   [Insomni’hack](https://www.insomnihack.ch/) (Feb. 1 – 5) Lausanne, Switzerland

## Most prevalent malware files from Talos telemetry over the past week

**SHA256: 9f1f11a708d393e0a4109ae189bc64f1f3e312653dcf317a2bd406f18ffcc507**  
MD5: 2915b3f8b703eb744fc54c81f4a9c67f  
Talos Rep: [https://talosintelligence.com/talos_file_reputation?s=9f1f11a708d393e0a4109ae189bc64f1f3e312653dcf317a2bd406f18ffcc507](https://talosintelligence.com/talos_file_reputation?s=9f1f11a708d393e0a4109ae189bc64f1f3e312653dcf317a2bd406f18ffcc507)  
Example Filename: VID001.exe  
Detection Name: W32.9F1F11A708-100.SBX.TG

**SHA256: f4b1f888f29faa7fbec180f42bdc78596e8a8b908c0a6e6c419933703c81df85**  
MD5: 95a6a4b638cfdfbe3afc883d593a1f87  
Talos Rep: [https://talosintelligence.com/talos_file_reputation?s=f4b1f888f29faa7fbec180f42bdc78596e8a8b908c0a6e6c419933703c81df85](https://talosintelligence.com/talos_file_reputation?s=f4b1f888f29faa7fbec180f42bdc78596e8a8b908c0a6e6c419933703c81df85)  
Example Filename: f4b1f888f29faa7fbec180f42bdc78596e8a8b908c0a6e6c419933703c81df85.js  
Detection Name: W32.F4B1F888F2-95.SBX.TG

**SHA256: 7fc50b69b56bfdfa9fc0a3e088ff13904587d6336a51e9edcc7919cba83d4e3f**  
MD5: cca616647db9370c88998ae25da6997f  
Talos Rep: [https://talosintelligence.com/talos_file_reputation?s=7fc50b69b56bfdfa9fc0a3e088ff13904587d6336a51e9edcc7919cba83d4e3f](https://talosintelligence.com/talos_file_reputation?s=7fc50b69b56bfdfa9fc0a3e088ff13904587d6336a51e9edcc7919cba83d4e3f)  
Example Filename: cca616647db9370c88998ae25da6997f.exe  
Detection Name: W32.7FC50B69B5-95.SBX.TG

**SHA256:** **73a25ff8893260418c2271b863c567e40e842adbab3c57023cb72de590ea377d**  
MD5: 0cf0271c3564881fce95f44c649bd745  
Talos Rep: [https://talosintelligence.com/talos_file_reputation?s=73a25ff8893260418c2271b863c567e40e842adbab3c57023cb72de590ea377d](https://talosintelligence.com/talos_file_reputation?s=73a25ff8893260418c2271b863c567e40e842adbab3c57023cb72de590ea377d)  
Example Filename: KMSAuto++.exe  
Detection Name: HackTool:WZTeam-tpd

**SHA256:** **985c3972712218c62d2418b41056dba5fe883ca5104d8ec12041f8611db344f9**  
MD5: 485055033bcddfde56325c0d2feea4f2  
Talos Rep: [https://talosintelligence.com/talos_file_reputation?s=985c3972712218c62d2418b41056dba5fe883ca5104d8ec12041f8611db344f9](https://talosintelligence.com/talos_file_reputation?s=985c3972712218c62d2418b41056dba5fe883ca5104d8ec12041f8611db344f9)  
Example Filename: 485055033bcddfde56325c0d2feea4f2.exe  
Detection Name: W32.985C397271-95.SBX.TG
