---
title: Close search modal
source: https://unit42.paloaltonetworks.com/com-affiliate-vishing-attacks/
source_host: unit42.paloaltonetworks.com
clip_date: 2026-11-21T08:29:05+08:00
trace_id: b0da9078-bc70-4f3d-828c-55dabca51b70
content_hash: 88d9f1918816e08d0e8bdb0341df36796fab2e97be7dc75ec09b0d1ccb23d826
status: synced
tags: []
series: null
feed_source: Unit 42
ai_summary: null
ai_summary_style: null
images_status:
  total: 5
  succeeded: 5
  failed_urls: []
notion_page_id: 41f75244-d011-8111-9fb8-e9fd19a5d264
ioc:
  cves: []
  cwes: []
  hashes:
    - 930898e8b65e9cf4e2595ac4092042a707cca8922751e723ad8b86260655154a
    - ea8d30c42e758559e78bd1fe97f8849011beb7f24c7f092a066a5a62fa7fbe6f
  domains: []
  tools: []
  techniques: []
---

## Executive Summary

Unit 42 has tracked and responded to numerous waves of vishing attacks conducted by Com-affiliated threat actors in recent months. The attacks have led to data theft and extortion attempts. This activity has targeted data-rich industries, such as financial services, healthcare and legal services. Targeted organizations were primarily located in the U.S., UK and Australia.

Attribution for this broad activity includes:

-   Named actors such as [Bling Libra (aka ShinyHunters)](https://unit42.paloaltonetworks.com/tag/bling-libra/)
-   Activity clusters [CL-CRI-1116 (aka Redact, formerly BlackFile)](https://rhisac.org/threat-intelligence/extortion-in-the-enterprise-defending-against-blackfile-attacks/), [CL-CRI-1147 (aka Pink)](https://github.com/PaloAltoNetworks/Unit42-timely-threat-intel/blob/main/2026-06-03-Pink-Extortion-Brand-Activity.txt?utm_campaign=tti_pinkextortion), [CL-CRI-1182 (aka Falcon)](https://github.com/PaloAltoNetworks/Unit42-timely-threat-intel/blob/main/2026-07-15-CL-CRI-1182-activity.txt), CL-CRI-1192 (aka Helix)
-   The newly uncovered CL-CRI-1264 (aka Vortex) and CL-CRI-1274 (aka Cinder), which overlap with activity Google tracks as UNC6671

This article details:

-   Our observations of persistent Com-affiliated threat activity since August 2026 based on unique telemetry analysis and incident response engagements
-   The different named actors and activity clusters we track, including unique observations not previously disclosed
-   Insights on victimology
-   Review of attacker tactics, techniques and procedures (TTPs)
-   Allusions to future activity as we head into 2027

Palo Alto Networks customers are better protected from the threats discussed above through the following products and services:

-   [Advanced WildFire](https://docs.paloaltonetworks.com/wildfire)
-   [Advanced URL Filtering](https://docs.paloaltonetworks.com/advanced-url-filtering), [Advanced DNS Security](https://docs.paloaltonetworks.com/dns-security) and [Advanced IP Defense](https://www.paloaltonetworks.com/network-security/advanced-ip-defense)
-   [Cortex XDR](https://www.paloaltonetworks.com/cortex/cortex-xdr) and [XSIAM](https://www.paloaltonetworks.com/resources/datasheets/cortex-xsiam-aag)
-   [Cortex Agentic Endpoint Security](https://www.koi.ai/product/endpoint)
-   [Prisma Browser](https://docs.paloaltonetworks.com/prisma-access-browser)
-   [Device Security](https://docs.paloaltonetworks.com/iot/getting-started/iot-security-solution)
-   [Idira Identity and Access Management (IAM)](https://www.paloaltonetworks.com/idira/human/identity-and-access-management)
-   [Idira Identity Threat Detection and Response (ITDR)](https://docs.cyberark.com/detect-and-respond/latest/en/content/get-started/what-is-detect-and-respond.htm)
-   [Idira Secure Web Sessions (SWS)](https://docs.cyberark.com/manage/latest/en/content/sws/getstarted/sws-introduction-2.htm)

Organizations can access tailored adversary intelligence, direct analyst consultations, and specialized exposure tracking through [Unit 42 Threat Intel Services](https://www.paloaltonetworks.com/unit42/threat-intelligence) and its [Deep and Dark Web Service](https://www.paloaltonetworks.com/resources/datasheets/unit-42-deep-and-dark-web-service).

If you think you might have been compromised or have an urgent matter, contact the [Unit 42 Incident Response team](https://start.paloaltonetworks.com/contact-unit42.html).

| **Related Unit 42 Topics** | [**Extortion**](https://unit42.paloaltonetworks.com/tag/extortion/), **[Vishing](https://unit42.paloaltonetworks.com/tag/vishing/)**, **[Social Engineering](https://unit42.paloaltonetworks.com/tag/social-engineering/)**, **[Bling Libra](https://unit42.paloaltonetworks.com/tag/bling-libra/)**, **[Browser Extensions](https://unit42.paloaltonetworks.com/tag/browser-extensions/)** |
| --- | --- |

## Background

Since early 2026, we have responded to numerous data theft and extortion attempts that we have attributed to Bling Libra and other Com-affiliated threat actors. More details on the typical playbook used by the attackers can be found in the [Tactics, Techniques and Procedures section](#post-189953-_i1krwwlb02i5) of this article.

We track these activities using the threat group and activity cluster naming conventions, which are noted in Table 1.

|     |     |     |     |     |
| --- | --- | --- | --- | --- |
| **Actor/Cluster** | **Alias** | **First Observed** | **TOX ID** | **Infra Observations** |
| Bling Libra | ShinyHunters | 2019 | Consistent | NiceNIC + Cloudflare;  <br>Report- and claims-themed domains |
| CL-CRI-1116 | Redact (formerly BlackFile) | January 2026 | Multiple | NiceNIC + Cloudflare |
| CL-CRI-1147 | Pink | May 2026 | Multiple | NiceNIC + Cloudflare |
| CL-CRI-1182 | Falcon | Mid-2026 | Consistent | NiceNIC + Cloudflare |
| CL-CRI-1192 | Helix | June 2026 | Multiple | NiceNIC + Cloudflare |
| CL-CRI-1264 | Vortex | September 2026 | Consistent | Cnobin + Cloudflare |
| CL-CRI-1274 | Cinder | September 2026 | Consistent | Internet Domain Service BS Corp + DDoS-Guard |

Table 1. Differentiation of Com-affiliated named actors and activity clusters.

## Latest Insights

### Emerging Activity Cluster CL-CRI-1264 (Vortex)

In September 2026, we identified a new activity cluster that we track as CL-CRI-1264. The tradecraft used by the attackers largely follows the wider playbook used by Com-affiliated threat actors, but a few traits set it apart. Most notably, we observed this activity primarily targeting healthcare, pharmaceutical and other medical organizations.

Attackers associated with CL-CRI-1264 establish initial access through vishing, where they pose as internal IT support and direct employees to servers using subdomains tailored to each targeted organization. These servers act as adversary-in-the-middle (AiTM) proxies that pass user credentials and multi-factor authentication (MFA) approvals to the attackers in real time. Attackers have targeted employees on both their corporate workstations and personal mobile devices.

We have observed attackers behind CL-CRI-1264 enrolling an unauthorized MFA device within minutes of authenticating to establish persistence. In multiple instances, the attackers have reused a single device named Pixel 10a across compromised accounts. They have also automated data exfiltration using Python scripts (python-httpx User Agent) to target Microsoft 365 mailbox, OneDrive and SharePoint content.

Following exfiltration, the attackers have sent Microsoft Teams messages directly to employees at victim organizations, claiming data theft and directing recipients to a Tor-hosted negotiation site.

### Emerging Activity Cluster CL-CRI-1274 (Cinder)

In September 2026, we identified another new activity cluster that we track as CL-CRI-1274. Similar to other activity detailed throughout this report, the attackers used vishing for initial access and avoided re-prompting for Duo MFA by replaying a persistent “keep me signed in” session token. They then replayed that same session token from proxy infrastructure.

From there, they used scripted access through python-requests (python-requests/2.34.2) and the Microsoft Graph software development kit (SDK) to collect and exfiltrate data from the victim’s SharePoint and OneDrive environments. Afterwards, the attackers used a compromised account to send extortion messages internally via email and Microsoft Teams, ultimately directing recipients to a Tor-hosted negotiation site.

### Malicious Browser Extension

During an investigation attributed to another activity cluster, CL-CRI-1192 (which Google tracks under UNC6671), we identified a [malicious browser extension](https://www.virustotal.com/gui/file/ea8d30c42e758559e78bd1fe97f8849011beb7f24c7f092a066a5a62fa7fbe6f) (manifest version 1.6.111) named Google Chrome.

The extension was not on the Chrome Web Store. It was downloaded from an attacker-controlled server at oskeysetup\[.\]com and required the victim to manually sideload it using Developer Mode. Naming the extension Google Chrome helps disguise the browser's built-in warning banner (Google Chrome started debugging this browser) when the extension is active.

This domain's registration information closely resembles attacker infrastructure previously disclosed by [Google](https://cloud.google.com/blog/topics/threat-intelligence/unc6671-targets-financial-services-and-enterprise-cloud-environments) and [ReliaQuest](https://reliaquest.com/blog/threat-spotlight-helix-new-name-in-data-extortion-ecosystem/) in relation to the activity that we track as CL-CRI-1192.

This browser extension performs several malicious actions:

-   Installs global keyloggers
-   Steals local/session storage and IndexedDB data across all sites
-   Harvests authentication cookies (targeting Microsoft and Google accounts)
-   Scans pages for QR codes to capture login/MFA tokens
-   Streams webcam feeds

Furthermore, this browser extension implements a full command-and-control (C2) remote control module via Chrome DevTools Protocol (chrome.debugger). It allows operators to perform the following activities:

-   Capture hidden screenshots
-   Dispatch input events
-   Steal clipboard contents
-   Allow remote site navigation

We pivoted on this file and identified [an additional browser extension](https://www.virustotal.com/gui/file/930898e8b65e9cf4e2595ac4092042a707cca8922751e723ad8b86260655154a) also masquerading as Google Chrome (version 1.6.112) that communicates with the same C2 server. Both files share the same hard-coded API key.

We assess with moderate confidence that the attackers associated with CL-CRI-1192 developed this malicious browser extension as an alternative method to extract credentials from desktop and laptop devices running Chromium-based browsers such as Google Chrome and Microsoft Edge. The extension might also be shared with and used by other Com-affiliated attackers, although we currently have no evidence to suggest this.

We recognize Kevin Pham for his detailed investigation into this browser extension in a [September 2026 write-up](https://deoxy.net/blog/inside-unc6671s-browser-implant/).

## Victimology

Our telemetry shows sustained campaigns by Com-affiliated threat actors accelerating significantly around August 2026. The victims share a common profile: they hold large volumes of high-impact corporate data where exposure carries severe regulatory, legal or market consequences. Financial services, healthcare and legal organizations were primary targets, though activity spans across other industries.

Rather than targeting generic mailboxes, actors systematically sought individuals or systems responsible for high-value files, documents and databases. These attacks focused on:

-   **Legal and corporate strategy:** Actors targeted partner communications, firm strategy, executive compensation and pending contracts. They explicitly threatened to publish client agreements and confidential casework.
-   **Financial and investment records:** Attackers prioritized private investment portfolios, deal pipelines and large-scale cloud data warehouses. They occasionally exfiltrated tens of millions of customer relationship management (CRM) and recruiting records.
-   **Healthcare and life sciences:** Attackers targeted cloud data platforms containing patient records and proprietary research. To maximize pressure, actors broadcast extortion notices across internal chat channels and threatened regulatory reporting.

The most targeted organizations have distributed workforces, centralized single sign-on (SSO) and extensive cloud collaboration platforms. They are also predominantly based in English-speaking countries. We have observed actors repeatedly targeting the same organization, sometimes returning weeks after a failed attempt.

### Who Is Being Targeted: Industries and Countries

![Financial Services icon](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8b7cae067847713d.svg)

Our monitoring of domains linked to Com-related activity showed that their targeting shifted from financial services to healthcare in early September 2026. Figure 1 shows that these attackers targeted financial services organizations about twice as often as healthcare organizations in August 2026, but healthcare overtook financial services in September, around when we first observed CL-CRI-1264 activity. Healthcare continued to be the most targeted industry in October 2026, alongside financial services. Attackers also frequently targeted construction, high technology and transportation and logistics organizations.

![Line chart showing the number of cyberattacks on various industries over time. Industries include Healthcare, Financial Services, Construction, High Technology, Transportation & Logistics, Professional & Legal Services, Manufacturing, Pharma & Life Sciences, Insurance, Real Estate. Lines fluctuate with spikes visible around early to mid-September. The horizontal axis represents dates, and the vertical axis shows the number of cyberattacks.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4802bc7e04266a28.png)

Figure 1. Industries of organizations targeted in subdomains between August and October 2026.

Figure 2 shows that between August and October 2026, most targeted organizations were based in the U.S. However, we observed increased targeting of Australian organizations beginning in late September 2026. Australian organizations made up less than 1% of observed subdomains in August and September, rising to about 13% in October. Organizations in Australia are now the second most targeted.

![Bar chart titled "Top Targeted Geographies by Percentage Share (Aug - Oct 2026)" with data for three months: August, September, October. Each bar is divided by country. United States leads with 95.3% in August, 91.9% in September, and 76.2% in October. Other countries include Australia, United Kingdom, Canada, Switzerland, and an "Other" category. Australia's share increases to 13.0% in October.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/06a33f38de1ef160.png)

Figure 2. Countries of organizations targeted in subdomains between August and October 2026.

## Tactics, Techniques and Procedures

### Infrastructure and Tooling

A key characteristic of Com-affiliated threat actors is their use of apex domains that pose as SSO portals, IT support pages and passkey configuration services. These domains often host short-lived subdomains that impersonate target organizations, such as {company}.mfaregister\[.\]com. We actively track this infrastructure, conduct threat hunting for identified domains and publish key findings as Timely Threat Intelligence (TTI) in our [GitHub repository](https://github.com/PaloAltoNetworks/Unit42-timely-threat-intel/tree/main).

Across Com-affiliated cases, we have identified similarities in hosting infrastructure, attack chains and victimology. In some cases, these actors also share tooling, such as Doko's Panel, an operator-controlled AiTM phishing kit.

As previously reported by [Push Security](https://pushsecurity.com/blog/inside-criminal-phishing-panel), some Okta-targeting variants of the kit replace the panel's default backend.php handler with the renamed endpoint api_FyekIDWY.php. We observed this endpoint on multiple domains associated with Com-affiliated cases.

In at least one financial services case, telemetry recorded a full AiTM sequence from credential entry to an MFA number-match prompt, indicating a likely successful session capture, as shown in Figure 3.

![Diagram showing credential and MFA capture process. It involves three entities: Victim, Adversary-in-the-middle proxy, and Operator. The sequences include steps like landing page lure, phishing kit activation, username submission, password submission, and MFA challenges. Final step shows authenticated session relayed to the operator. The process uses Cloudflare-fronted phishing kit and mentions Evilginx2 kit and Dokis Panel as components.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/102ae62a2c771ef0.png)

Figure 3. Flow chart describing an observed attack.

Domains consistent with Com-affiliated infrastructure have also been observed in campaigns that use different techniques to target victims. For example, [Microsoft](https://www.microsoft.com/en-us/security/blog/2026/09/09/passkey-themed-social-engineering-leads-identity-cloud-compromise/) reported oskeyregister\[.\]com in its research into passkey-themed social engineering.

Building on this reporting, we identified Cloudflare Pages URLs following the pattern connect-pages-{company}.pages\[.\]dev that redirect to company-specific subdomains such as {company}.oskeyregister\[.\]com. These findings reflect the broader Com ecosystem, which comprises several activity clusters that frequently share infrastructure but can vary slightly in their tradecraft.

Beyond shared infrastructure, recurring patterns in the registration and deployment of tooling associated with Com-affiliated threat actors provide additional opportunities to identify related domains. Table 2 shows common registration patterns observed across this activity.

|     |     |     |
| --- | --- | --- |
| **Category** | **Value** | **Examples** |
| Target Top-Level Domains (TLDs) | .com,.claims,.report | {company}.claims<br><br>{company}.report |
| Structural and Hyphenated Formats | claims-, report-, -claims, -report, -okta or okta- | {company}-report.com<br><br>claims-{company}.com<br><br>{company}-okta.com |
| Authentication and Access Keywords | sso, mfa, 2fa, okta, auth, signin, passkey, token, key, oskey, secure | settingsportal\[.\]com<br><br>ssosettings\[.\]com<br><br>mfapasskeysetup\[.\]com |
| System and Account Operations Keywords | enroll, activate, setup, create, enable, start, add, install, manage, connect, assign | authenroll\[.\]com<br><br>installpasskey\[.\]com |
| Internal and Support Infrastructure Keywords | it, support, helpdesk, portal, internal, apps, options, help, my, account | myaccountoptions\[.\]com<br><br>itkeyportal\[.\]com |
| Redirection Lure | Redirections via Cloudflare Pages | connect-pages-{company}.pages.dev |
| Registrars | NiceNIC International Group Co., Limited  <br>Cnobin Information Technology Limited  <br>Tucows Domains Inc.Dominet (HK) Limited |     |
| Name Server | Cloudflare Inc. |     |

Table 2. Infrastructure registration patterns used by Com-affiliated threat actors.

### Attacker Playbook

We did not observe a standard playbook employed by Com-affiliated threat actors. Rather than employing custom tools, the threat actors primarily leveraged native cloud utilities and selectively limited executions and persistence deployments.

Intrusions typically begin with vishing, in which threat actors pose as IT staff resolving an authentication issue and direct the victim to a phishing page tailored to their organization. After the AiTM kit captures credentials and session tokens, the attackers quickly enroll their own MFA devices, misuse cloud utilities and, in some cases, deploy malicious browser extensions to exfiltrate data and extort victims.

Using the harvested authentication data, Com-affiliated threat actors authenticate to victim environments, typically routing through residential proxy networks and commercial VPNs. They then seek to establish multi-layered persistence, enumerate sensitive data and exfiltrate data from cloud platforms. We observed the following techniques across Com-affiliated threat actors:

**Persistence**

-   Enrolling unauthorized MFA devices and workstation objects
-   Generating cloud infrastructure temporary credentials
-   Authorizing unapproved third-party OAuth applications or data-sync utilities
-   Staging secondary accounts or harvesting redundant credentials

**Discovery and Defense Evasion**

-   Monitoring authentications, permissions and mailboxes
-   Modifying calendar settings and mailbox rules
-   Clearing security alert events
-   Rotating infrastructure

**Exfiltration**

-   Using open-source tools such as Rclone and cloud storage platforms
-   Exfiltrating via native SaaS and REST APIs or scripted HTTP-based exfiltration
-   Moving data via SaaS to SaaS transfers

## Conclusion

Earlier this year, our [2026 Unit 42 Global Incident Response Report](https://www.paloaltonetworks.com/resources/research/unit-42-incident-response-report) found that extortion incidents in 2025 not using encryption (at 78%) dropped below the 90% range for the first time in several years. This trend has continued into 2026 and we don’t expect a slowdown. Cybercriminals like Bling Libra and other Com-affiliated threat actors are pivoting away from encryption, enabling them to move at greater speed across their intrusion lifecycle while still achieving their objectives.

Another plausible motivation for the shift away from using encryption is to fly below the radar of law enforcement officials, given their crackdown on ransomware operators in recent years. However, shifting away from using encryption no longer seems to be enough to keep them under the radar. This is based on the reported arrests of suspected Bling Libra members such as “ [Rey](https://www.reuters.com/world/middle-east/key-shinyhunters-hacker-detained-jordan-is-cooperating-sources-say-2026-10-03/) ” and “ [Umbreon](https://krebsonsecurity.com/2026/09/dutch-police-arrest-reformed-hacker-in-shiny-hunters-investigation/) ” that occurred in proximity to the group’s claims of a breach of the [FBI](https://x.com/FBI/status/2102807819695071709).

Recent arrests also include a [person who allegedly ran Bling Libra’s extortion site](https://krebsonsecurity.com/2026/10/feds-suspect-ransom-negotiator-ran-shinyhunters-extortion-site/).

Going forward, organizations must:

-   Tighten help desk verification processes
-   Transition to phishing-resistant MFA (FIDO2/passkeys)
-   Implement browser extension allowlists
-   Establish visibility into identity actions
-   Alert on unauthorized data exports to mitigate the threat activity described in this article

Palo Alto Networks customers are better protected from the threats discussed above through the following products:

-   The [Advanced WildFire](https://docs.paloaltonetworks.com/wildfire) machine-learning models and analysis techniques have been reviewed and updated in light of the indicators shared in this research.
-   [Advanced URL Filtering](https://docs.paloaltonetworks.com/advanced-url-filtering), [Advanced DNS Security](https://docs.paloaltonetworks.com/dns-security) and [Advanced IP Defense](https://www.paloaltonetworks.com/network-security/advanced-ip-defense) identify known domains and URLs associated with this activity as malicious.
-   [Cortex XDR](https://www.paloaltonetworks.com/cortex/cortex-xdr) and [XSIAM](https://www.paloaltonetworks.com/resources/datasheets/cortex-xsiam-aag) are designed to help protect against the threats described in this article using a multi-layer approach that defends across the entire attack lifecycle. By combining advanced capabilities such as [Behavioral Threat Protection](https://www.paloaltonetworks.com/products/secure-the-network/subscriptions/threat-prevention), [Advanced WildFire](https://docs.paloaltonetworks.com/wildfire), and [Credential Gathering Protection](https://docs-cortex.paloaltonetworks.com/r/Cortex-XDR/Cortex-XDR-3.x-Documentation/Endpoint-protection-capabilities), these platforms detect and prevent malicious behavior — including credential stealing, unauthorized persistence, and script-based execution — before threat actors can achieve their objectives.
-   [Cortex Agentic Endpoint Security](https://www.koi.ai/product/endpoint) is designed to help discover every AI artifact and AI agent’s activity across the agentic endpoint, assess its risk, enforce prevention and runtime controls, and remediate violations.
-   [Prisma Browser](https://docs.paloaltonetworks.com/prisma-access-browser) is designed to prevent extension-based attacks like the one uncovered in our research.
-   [Device Security](https://docs.paloaltonetworks.com/iot/getting-started/iot-security-solution) is designed to proactively protect the specialized device attack surface of operational environments, providing deep visibility into industrial protocols, actionable risk insights and adaptive security enforcement across all OT and IoT assets.
-   [Idira Identity and Access Management (IAM)](https://www.paloaltonetworks.com/idira/human/identity-and-access-management) can help enable secure, unified access across human, machine, and AI identities, balancing granular control with a seamless user experience. Powered by SSO, phishing-resistant MFA, passwordless login, and enterprise password management, Idira IAM extends intelligent privilege controls and session security across the broader workforce.
-   [Idira Identity Threat Detection and Response (ITDR)](https://docs.cyberark.com/detect-and-respond/latest/en/content/get-started/what-is-detect-and-respond.htm) can help enable security teams to counter identity-based attacks targeting Idira Next Generation Identity (NGI) Platform and the identities it secures. Using near real-time detection, powered by CORA AI, and leveraging Idira’s visibility across multiple contexts (like PAM, authentication, SSO, cloud, endpoints, browsers, and more), Idira ITP can apply automated, tailored non-disruptive in-session response to contain and minimize potential identity-based threats.
-   [Idira Secure Web Sessions (SWS)](https://docs.cyberark.com/manage/latest/en/content/sws/getstarted/sws-introduction-2.htm) is designed to provide client-side protection (blocking clipboards/downloads) and step-by-step audit logging for highly sensitive SaaS application sessions.

Organizations can access tailored adversary intelligence, direct analyst consultations, and specialized exposure tracking through [Unit 42 Threat Intel Services](https://www.paloaltonetworks.com/unit42/threat-intelligence) and its [Deep and Dark Web Service](https://www.paloaltonetworks.com/resources/datasheets/unit-42-deep-and-dark-web-service).

If you think you may have been compromised or have an urgent matter, get in touch with the [Unit 42 Incident Response team](https://start.paloaltonetworks.com/contact-unit42.html) or call:

-   North America: Toll Free: +1 (866) 486-4842 (866.4.UNIT42)
-   UK: +44.20.3743.3660
-   Europe and Middle East: +31.20.299.3130
-   Asia: +65.6983.8730
-   Japan: +81.50.1790.0200
-   Australia: +61.2.4062.7950
-   India: 000 800 050 45107
-   South Korea: +82.080.467.8774

Palo Alto Networks has shared these findings with our fellow Cyber Threat Alliance (CTA) members. CTA members use this intelligence to rapidly deploy protections to their customers and to systematically disrupt malicious cyber actors. Learn more about the [Cyber Threat Alliance](https://www.cyberthreatalliance.org/).

## Indicators of Compromise

### SHA-256 Hashes

-   930898e8b65e9cf4e2595ac4092042a707cca8922751e723ad8b86260655154a (folderextension.crx)
-   ea8d30c42e758559e78bd1fe97f8849011beb7f24c7f092a066a5a62fa7fbe6f (folderextension.zip)

### URLs

-   hxxps\[:\]//oskeysetup\[.\]com/files/folderextension.crx (hosts 930898e8b65e9cf4e2595ac4092042a707cca8922751e723ad8b86260655154a)
-   hxxps\[:\]//oskeysetup\[.\]com/files/folderextension.zip (hosts ea8d30c42e758559e78bd1fe97f8849011beb7f24c7f092a066a5a62fa7fbe6f)

### IP Addresses

-   31.42.184\[.\]213 (hosted oskeysetup\[.\]com)
-   193.149.176\[.\]62 (accessed compromised accounts)

### Fully Qualified Domain Names (FQDNs)

-   add-mfa\[.\]com
-   login-options\[.\]com
-   apply-passkey\[.\]com
-   auth-sso\[.\]com
-   authenroll\[.\]com
-   configkeys\[.\]com
-   configurekey\[.\]com
-   editmysso\[.\]com
-   enableoskey\[.\]com
-   enrollmfa\[.\]com
-   enrollmfamethods\[.\]com
-   enrollssopasskey\[.\]com
-   fastpasskeys\[.\]com
-   hostsso\[.\]com
-   installpasskey\[.\]com
-   installsso\[.\]com
-   itkeyenroll\[.\]com
-   itkeyportal\[.\]com
-   itkeyupdate\[.\]com
-   keyconfiguration\[.\]com
-   keyenrollos\[.\]com
-   keyosregister\[.\]com
-   mfa-options\[.\]com
-   mfa-passkey\[.\]com
-   mfa-registry\[.\]com
-   mfaoptions\[.\]com
-   mfapasskeysetup\[.\]com
-   mfaregister\[.\]com
-   mfasettings\[.\]com
-   my-passkey\[.\]com
-   my-passkeys\[.\]com
-   myaccountapps\[.\]com
-   myaccountoptions\[.\]com
-   myapps2fa\[.\]com
-   mypasskeyapp\[.\]com
-   myssoapps\[.\]com
-   myssoauth\[.\]com
-   myssosettings\[.\]com
-   new-passkey\[.\]com
-   nowsso\[.\]com
-   onboardpasskey\[.\]com
-   oskeysetup\[.\]com
-   oursso\[.\]com
-   passkey-mfa\[.\]com
-   passkeyconnect\[.\]com
-   register-mfa\[.\]com
-   register-passkeys\[.\]com
-   registermymfa\[.\]com
-   registersso\[.\]com
-   settingsportal\[.\]com
-   signinoptions\[.\]com
-   ssokeyportal\[.\]com
-   ssosettings\[.\]com
-   startmypasskey\[.\]com
-   configuresso\[.\]com
-   makepasskey\[.\]com

### MFA Device Names

Observed across investigations (standard phone models, not standalone indicators of compromise)

-   Pixel 10a
-   Pixel 9 Pro XL

### User-Agent Strings

-   kiota-dotnet/1.17.1
-   Microsoft.Graph.Client/6.2.0
-   python-requests/2.34.2

## Additional Resources

![Learn icon](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4ebde671ada7d2d6.svg)

-   [Inside UNC6671's Browser Implant](https://deoxy.net/blog/inside-unc6671s-browser-implant/) - Deoxy
-   [Passkey-themed social engineering leads to identity and cloud compromise](https://www.microsoft.com/en-us/security/blog/2026/09/09/passkey-themed-social-engineering-leads-identity-cloud-compromise/) - Microsoft
-   [Urgent Threat Alert: ShinyHunters Vishing Campaigns and Domain Impersonation](https://health-isac.org/urgent-threat-alert-shinyhunters-vishing-campaigns-and-domain-impersonation/) - Health-ISAC
-   [A Social Engineering Attempt Against ReliaQuest: What We Found](https://reliaquest.com/blog/threat-spotlight-social-engineering-attempt-against-reliaquest-what-we-found/) - ReliaQuest
-   [UNC6671 Rebrands: Multi-Brand Vishing Extortion Targets Financial Services and Enterprise Cloud Environments](https://cloud.google.com/blog/topics/threat-intelligence/unc6671-targets-financial-services-and-enterprise-cloud-environments) - Google
-   [Behind the scenes of a vishing operation](https://www.okta.com/blog/threat-intelligence/behind-the-scenes-of-a-vishing-operation/) - Okta
-   [Helix, a New Name in the Data Extortion Ecosystem?](https://reliaquest.com/blog/threat-spotlight-helix-new-name-in-data-extortion-ecosystem/) - ReliaQuest
-   [Vishing actors target Entra passkey enrollment](https://www.okta.com/blog/threat-intelligence/vishing-actors-target-microsoft-entra-passkey-enrollment-/) - Okta
-   [Out of the Crypt: The Evolving Cyber Extortion Economy](https://unit42.paloaltonetworks.com/cyber-extortion-economy/) - Unit 42, Palo Alto Networks
-   [Welcome to BlackFile: Inside a Vishing Extortion Operation](https://cloud.google.com/blog/topics/threat-intelligence/blackfile-vishing-extortion-operation/) - Google
-   [We infiltrated a criminal phishing panel: here’s what we found](https://pushsecurity.com/blog/inside-criminal-phishing-panel) - Push Security
-   [Extortion in the Enterprise: Defending Against BlackFile Attacks](https://rhisac.org/threat-intelligence/extortion-in-the-enterprise-defending-against-blackfile-attacks/) - RH-ISAC
-   [Vishing for Access: Tracking the Expansion of ShinyHunters-Branded SaaS Data Theft](https://cloud.google.com/blog/topics/threat-intelligence/expansion-shinyhunters-saas-data-theft) - Google

[Threat Research Center](https://unit42.paloaltonetworks.com/ "Threat Research") [Next: Borrowed Code, Real Consequences: What OPTIMJACK Teaches Us](https://unit42.paloaltonetworks.com/optimjack-supply-chain-attack/ "Borrowed Code, Real Consequences: What OPTIMJACK Teaches Us")
