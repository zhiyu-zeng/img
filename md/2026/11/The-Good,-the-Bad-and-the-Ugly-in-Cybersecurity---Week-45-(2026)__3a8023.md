---
title: The Good, the Bad and the Ugly in Cybersecurity - Week 45 (2026)
source: https://www.sentinelone.com/blog/the-good-the-bad-and-the-ugly-in-cybersecurity-week-45-8
source_host: www.sentinelone.com
clip_date: 2026-11-09T11:03:47+08:00
trace_id: 36b2b64a-ff02-437a-bbe4-744b57c4383f
content_hash: 6717f718bb48096f5592be24ff4d48e2fa87b8335c54645f8ed131d6fdd0291c
status: synced
tags: []
series: null
feed_source: SentinelOne Blog
ai_summary: null
ai_summary_style: null
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 41375244-d011-810f-a259-e5a01bae74a2
ioc: null
---

## The Good | Global Authorities Dismantle Investment Scams & VasyGrek Infrastructure, Indict University System Hackers

Law enforcement in Europe, supported by Europol and Eurojust, [arrested](https://www.europol.europa.eu/media-press/newsroom/news/investment-scams-potential-victims-in-least-50-countries-over-100-servers-seized) seven suspects and seized over 100 servers targeting a crime-as-a-service (CaaS) investment fraud infrastructure. Operating from Cyprus and Israel, an unnamed vendor supplied [fraudulent](https://www.sentinelone.com/cybersecurity-101/threat-intelligence/spoofing/?utm_medium=direct) trading websites to criminal call centers across Albania, Kosovo, North Macedonia, and more.

Following a four-year investigation initiated after victims reported missing funds, investigators linked the infrastructure to fake foreign currency, stock, and cryptocurrency schemes affecting victims in at least 50 countries. Scammers used fake online account profits to coerce larger transfers before cutting contact, leaving victims unable to recover their funds.

In the U.S., a federal grand jury [indicted](https://www.justice.gov/usao-wdny/pr/canadian-man-extradited-us-his-role-computer-hacking-scheme-targeting-universities) two Canadian nationals, Ryan James Roach and Mathiew James Stubbings, for conspiring to breach multiple American universities to mine for cryptocurrency. Between June 2016 and December 2019, the co-conspirators deployed virtual private servers to infect academic networks across Massachusetts, New York, North Carolina, and Tennessee with malware.

Once inside, the defendants stole [user log-ins](https://www.sentinelone.com/cybersecurity-101/threat-intelligence/what-is-credential-theft/?utm_medium=direct) and data, deployed cryptocurrency mining software, and hijacked high-performance campus supercomputers to conduct unauthorized network vulnerability research. Both men face up to ten years in prison and $250,000 fines following formal extradition proceedings from Canada.

Russian law enforcement authorities [arrested](https://mvdmedia.ru/news/ofitsialnyy-predstavitel/sotrudnikami-mvd-rossii-presechena-deyatelnost-khakerskoy-gruppy-atakovavshey-rossiyskie-kompanii-ch/) three suspected members of the VasyGrek threat group (*aka* Fluffy Wolf) and dismantled its operational infrastructure. Active since 2016, the financially-motivated group was known for targeting organizations across metallurgy, energy, healthcare, and finance sectors in Russia, Belarus, and Kazakhstan.

Attackers would send [phishing](https://www.sentinelone.com/cybersecurity-101/threat-intelligence/phishing-scams/?utm_medium=direct) emails with malicious accounting attachments to drop remote access trojans and steal corporate funds. Police seized computer equipment and server assets after uncovering a broad network of fake financial domains, [dark web](https://www.sentinelone.com/cybersecurity-101/threat-intelligence/what-is-the-dark-web/?utm_medium=direct) remote administration tools, and Golang backdoors used to execute unauthorized commands.

## The Bad | Impersonators Abuse Microsoft Teams and Active Directory Certificate Services

According to a new [report](https://www.microsoft.com/en-us/security/blog/2026/10/30/help-desk-impersonation-ad-cs-abuse-investigating-esc1-esc8-intrusion-paths/), threat actors have been posing as IT help desk staff on Microsoft Teams to message and call corporate employees and leverage external support-themed tenants to trick users into handing over workstation access.

Once connected, attackers [instructed](https://www.sentinelone.com/cybersecurity-101/threat-intelligence/what-is-social-engineering/?utm_medium=direct) victims to launch Quick Assist, a built-in Windows remote-help tool, and read back connection codes to grant full remote desktop control. The intruders then dropped malicious software archives into Downloads folders, unpacking and executing payloads via portable Python, Bun, or Java runtimes disguised as legitimate Windows system updates.

After establishing initial persistence, the attackers abused weak configuration templates within Active Directory Certificate Services (AD CS) to request digital authentication certificates for privileged domain accounts. In one documented intrusion, threat actors exploited an ESC1 misconfiguration to obtain certificates for three highly privileged identities—access that persisted even after password resets or workstation wipes. The attacker used one of those certificates to compromise a domain controller, execute DCSync credential dumping, and exfiltrate internal corporate files to an external server via Rclone.

In a second intrusion, attackers targeted an ESC8 configuration by deploying the ‘PetitPotam’ technique to force a domain controller to authenticate against an attacker-controlled endpoint. The relayed NTLM authentication allowed the actors to request a certificate directly for the domain controller without credentials, securing a persistent Kerberos ticket-granting ticket. The customer isolated the affected workstation, and no further attack progression was observed.

Because these intrusions exploit misconfigured certificate enrollment policies rather than underlying software vulnerabilities, Microsoft [advises](https://support.microsoft.com/en-us/servicing/os/windows-server/2021/07/kb5005413-mitigating-ntlm-relay-attacks-on-active-directory-certificate-services-ad-cs) organizations to confirm unexpected support requests via internal channels, enforce Extended Protection for Authentication on web enrollment endpoints, and audit certificate issuance rules.

## The Ugly | Threat Actors Disrupt European Refrigeration Systems Across Retail and Healthcare Sectors

Threat actors have targeted internet-exposed refrigeration control systems across Europe this week, altering temperature settings and activating defrost cycles across facilities just three weeks after similar attacks on hundreds of refrigeration systems in French supermarkets.

So far, this second wave has impacted retail chains across Belgium, Estonia, Ireland, Luxembourg, the Netherlands, and Sweden. In several stores, attackers set cooling units to generate heat or raised temperature setpoints to [50°C](https://apnews.com/article/europe-supermarkets-freezers-cyberattacks-a8ea5b30d67da47957769f29101fe686).

The activity extended into critical healthcare infrastructure when a cyberattack on refrigeration supplier [Coolworld Rentals](https://www.coolworld-rentals.com/news/cybersecurity-update) raised temperature thresholds at [French Blood Establishment](https://presse.efs.sante.fr/actualites/l-efs-confirme-l-incident-de-cybersecurite-impactant-un-de-ces-prestataires-d-equipement-frigorifique-2c07c-08a0a.html) (EFS) cold-storage facilities managing vital blood supplies. However, automated monitoring alarms enabled staff to relocate stored blood products before any inventory was lost.

SentinelLABS’s breakdown [notes](https://www.sentinelone.com/labs/defrost-and-disrupt-an-assessment-of-europe-s-refrigeration-attacks/?utm_medium=direct) that similar attacks targeted Israeli and Russian facilities in 2022, a Los Angeles meat processor in 2024, and U.S. military commissaries in August 2026. The intrusions primarily targeted commercial supervisory platforms, such as Danfoss AK-SM, AK-SC, and Copeland Dixell XWEB controllers, that centralize site cooling operations.

![Refrigeration\_Attacks\_Chronology.jpeg](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/cd3f1b3d27b0205e.jpg)

At the time, ANSSI [indicated](https://redir.gslb.senat.fr/compte-rendu-commissions/20261019/etran.html) that adversaries gained control by exploiting publicly accessible administration interfaces and weak default credentials rather than executing novel software [zero-days](https://www.sentinelone.com/cybersecurity-101/threat-intelligence/zero-day-vulnerabilities-attacks/?utm_medium=direct).

While Russian-aligned hacktivist collectives including CARR, [NoName057(16)](https://www.sentinelone.com/labs/noname05716-the-pro-russian-hacktivist-group-targeting-nato/?utm_medium=direct), and Z-Pentest claimed responsibility for specific disruptions, law enforcement authorities have not formally confirmed attribution. Opportunistic scanning against unhardened building management systems allows multiple threat groups to execute similar disruptions.

To mitigate ongoing operational risks, government advisories from CERT-FR [instruct](https://cert.cyber.gouv.fr/alerte/CERTFR-2026-ALE-012/) operators to immediately disconnect exposed control panels from the public internet, restrict remote maintenance access to secure virtual private networks, enforce strong authentication controls, and replace legacy end-of-life hardware.
