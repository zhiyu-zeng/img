---
title: Back Button
source: https://www.rapid7.com/blog/post/etr-rapid7-detected-exploitation-of-cve-2026-90436-against-atlassian-confluence-data-center-n-able-n-central-also-exploited
source_host: www.rapid7.com
clip_date: 2026-11-19T09:15:03+08:00
trace_id: ec83f79e-2cfc-451f-a112-12ef50bd04b2
content_hash: 5e7f2ebb0b311760774fb9dd61f4f0bbef1b056b144d7a250cc416e7928e870f
status: synced
tags: []
series: null
feed_source: Rapid7 Blog
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41d75244-d011-81cc-b003-d7471189b8ad
ioc:
  cves:
    - CVE-2026-90436
  cwes:
    - CWE-470
  hashes: []
  domains: []
  tools: []
  techniques: []
---

## Overview

On November 6, 2026, the Apache Software Foundation disclosed [CVE-2026-90436](https://www.cve.org/CVERecord?id=CVE-2026-90436), a critical unsafe reflection vulnerability ([CWE-470](https://cwe.mitre.org/data/definitions/470.html)) in Axis 1.x that allows for unauthenticated remote code execution (RCE). Apache [Axis](https://axis.apache.org/axis/) is a Simple Object Access Protocol (SOAP) implementation used for the creation of Java Web services. CISA has assigned CVE-2026-90436 a CVSS score of [9.8 Critical](https://nvd.nist.gov/vuln-metrics/cvss/v3-calculator?cveId=CVE-2026-90436&vector=CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H&version=3.1&sourceName=CISA-ADP).

Since the initial November 6 disclosure, it has transpired that some versions of Atlassian [Confluence Data Center](https://confluence.atlassian.com/security/cve-2026-90436-remote-code-execution-in-confluence-data-center-1874560038.html) and N-able N-central use the affected Axis library and are vulnerable to CVE-2026-90436. Both products require a non-default configuration in order to be vulnerable.

CVE-2026-90436 is now being actively exploited in the wild against both known affected products. **On November 13, 2026, Rapid7 MDR detected exploitation of CVE-2026-90436 against Atlassian Confluence Data Center in a customer environment.** Separately, on November 13, 2026, N-able [reported](https://uptime.n-able.com/event/202613/) exploitation in the wild against N-central for a vulnerability that strongly [correlates](https://www.acn.gov.it/portale/w/n-able-rilevate-due-ulteriori-catene-di-exploit-denominate-agent2shell-e-4everable2shell-) to CVE-2026-90436. A proof-of-concept exploit that leverages CVE-2026-90436 and targets N-central was published on November 12, 2026, as part of a [series](https://www.rapid7.com/blog/post/etr-critical-vulnerabilities-in-n-able-n-central-prompt-hosted-shutdown/) of public zero-day disclosures against N-central.

Rapid7 recommends remediating exposed systems on an emergency basis outside of normal patching cycles.

## MDR observed exploitation

On November 13, 2026, Rapid7's MDR team responded to a surge of alerts firing on the abnormal child processes launched by an Atlassian Confluence server. A review of the Confluence access logs revealed unauthenticated POST requests to /plugins/servlet/soap-axis1/confluenceservice-v2, each returning an HTTP 500 (Internal Server Error). Despite the error responses, endpoint telemetry showed Confluence's Java process launching Bash and curl as the dedicated confluence service account, within seconds of these requests. The attacker proceeded to run hundreds of hex-encoded shell commands and scripts fetched from temporary Pinggy and Cloudflare Tunnel domains. Each command wrapped its output in labeled delimiters, and carried sequential task IDs, a structure that suggests the use of AI-assisted automated tooling.

From this foothold, the attacker enumerated the host, network, Confluence configuration, encryption keys, and database settings. Just over three minutes after the first observed execution, the attackers were authenticating to MySQL with Confluence's own database credentials, querying page bodies, application links, and attachments with names associated with credentials, tokens, VPN configurations, and private keys. The attacker's scripts, likely AI-generated, then targeted files in Confluence's default location for uploaded page attachments (/var/atlassian/application-data/confluence/attachments/v4/), parsed Office documents, searched for credentials, and hunted for payment card numbers, using Luhn checks to filter out false positives.

The attacker continued extensive enumeration, mapping various internal services. They used a Confluence application credential to query the internal Atlassian Crowd API for users and group memberships, then ran Impacket's GetNPUsers.py against a domain controller, attempting an AS-REP roasting attack.

Although these attempts failed, the access we did observe relied on credentials stored in Confluence, and roughly four hours after the first exploit request, the attacker had acquired a service account credential and began querying a production cloud data warehouse. Approximately twelve hours after the first exploit request, the attacker signed in to Microsoft 365 as an integration service account using legacy authentication from 192.238.253\[.\]176. The same address appeared in the hostname of the Pinggy tunnel and in exploit requests observed earlier in the intrusion.

## Mitigation guidance

Prioritize internet-accessible instances with the relevant APIs enabled, and check internal deployments as well. Apply the product-specific actions below, then investigate systems that were exposed for evidence of compromise.

Axis 1.x through 1.4 is affected but has reached end of life (EOL) and Apache does not plan to publish a fixed Axis 1.x release. Apache recommends moving to another SOAP engine (for example, Apache Axis 2) or using an Axis 1.x build with this [patch](https://github.com/apache/axis-axis1-java/commit/41f3b4e8d04e310ca81f86b92630ab2c11d608bd) applied. Organizations using products that are affected by this issue should follow the product vendor's specific remediation instructions.

### Atlassian Confluence Data Center

Atlassian lists versions 1.x through to 9.x as affected when “Remote API (XML-RPC & SOAP)” is enabled. Version 9.2.28 is the fixed release. The setting has been off by default for new installations since version 3.0. Confluence version 10.x and later removed the feature so are not vulnerable, and Atlassian Cloud is unaffected.

Affected users should upgrade to version 9.2.28 or a current unaffected 10.x release. If patching must wait, an administrator can open “General Configuration” and “Further Configuration”, edit the settings, clear “Remote API (XML-RPC & SOAP)”, and save. The change takes effect without restarting Confluence, but integrations using the API may stop working.

Follow the [Confluence advisory](https://confluence.atlassian.com/security/cve-2026-90436-remote-code-execution-in-confluence-data-center-1874560038.html) for the latest fixes and mitigation instructions.

### N-able N-central

On-premises administrators should confirm that “Legacy API” is disabled, even on 2026.4 HF2. N-able states that it is off by default, and provides [instructions for disabling Legacy API](https://me.n-able.com/s/article/How-to-Disable-Legacy-API-settings-on-On-premise-N-central-servers). Its November 13 guidance says hosted environments received temporary protections directly; customers in both hosting models must still follow the vendor's Agent and Probe upgrade guidance. N-able also temporarily disabled the Intune integration as a precaution. Refer to the [N-able security update](https://www.n-able.com/blog/new-security-update-on-n-central) for these responsibilities.

**Update:** On November 16, 2026, N-able [released](https://status.n-able.com/2026/11/16/n-central-2026-4-hf3-release-notes/) N-central 2026.4 HF3 (2026.4.1.39) which addresses multiple issues including seventeen new CVEs. The “Legacy API” feature which exposed the vulnerable CVE-2026-90436 Axis attack surface has been disabled in this new release. N-central users should upgrade to N-central 2026.4 HF3 on an emergency basis outside of normal patching cycles.

Follow the [N-able advisory](https://status.n-able.com/2026/11/16/n-central-2026-4-hf3-release-notes/) for the latest fixes and mitigation instructions.

## IOCs

The presence of these IOCs in logs should prompt investigation, but the absence of these addresses does not confirm that an environment was unaffected.

### Atlassian Confluence Data Center

The following IP addresses and domains are associated with observed exploitation of CVE-2026-90436 against Atlassian Confluence Data Center:

-   192.238.253\[.\]176
    
-   5.133.47\[.\]243
    
-   163.182.68\[.\]109
    
-   104.13.106\[.\]166
    
-   \*.trycloudflare\[.\]com
    
-   wpefh-192-238-253-176.free.pinggy\[.\]net
    
-   webhook\[.\]site
    

### N-able N-central

N-able's [November 13 incident update](https://uptime.n-able.com/event/202613/) lists these IP addresses as IOCs for N-central customers who had not disabled Legacy API.

The vendor's update also lists associated URLs for use in compromise assessment.

## Updates

-   **November 16, 2026:** Initial publication.
    
-   **November 17, 2026:** Updated Remediation section for N-central.
-   **November 17, 2026:** Added the MDR observed exploitation section and updated IOCs.
