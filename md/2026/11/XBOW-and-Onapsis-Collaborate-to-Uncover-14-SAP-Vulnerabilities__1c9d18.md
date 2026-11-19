---
title: XBOW and Onapsis Collaborate to Uncover 14 SAP Vulnerabilities
source: https://xbow.com/blog/xbow-and-onapsis-collaborate-to-uncover-14-sap-vulnerabilities
source_host: xbow.com
clip_date: 2026-11-19T08:27:21+08:00
trace_id: 9aa0cecb-cc96-4612-a314-519f440cd2da
content_hash: 1420c0cbe3384dd00b10fe5d783a38d21f7a88d7d9926abc5b90bb87927b6b83
status: synced
tags: []
series: null
feed_source: XBOW·漏洞利用研究
ai_summary: null
ai_summary_style: null
images_status:
  total: 5
  succeeded: 5
  failed_urls: []
notion_page_id: 41d75244-d011-8122-b4ec-eab1abef371b
ioc:
  cves:
    - CVE-2026-109803
    - CVE-2026-109810
    - CVE-2026-89114
    - CVE-2026-89128
    - CVE-2026-89129
    - CVE-2026-89131
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

14 vulnerabilities across 7 SAP security notes and one critical CVSS 9.9 finding.

* * *

As part of SAP’s November 2026 Security Patch Day, 36 vulnerabilities were patched with the help of Onapsis Research Labs (ORL). Of those, 14 were discovered in collaboration with XBOW, spanning seven SAP Security Notes and affecting multiple SAP NetWeaver components.

The findings range from critical code injection and missing authentication to server-side request forgery (SSRF), broken access controls, and cross-site request forgery (CSRF).

## The critical finding: XSL injection in Knowledge Management

CVE-2026-109803 (HotNews, CVSS 9.9) affects SAP NetWeaver Knowledge Management (XML Forms). An authenticated user can trigger an unauthorized XSL transformation. When an attacker controls the transformation, the XSLT processor itself becomes the path to code execution on the server. [SAP Note 3809153](https://me.sap.com/notes/3809153)

## Unauthenticated access to business data

CVE-2026-89114 (High, CVSS 7.5) is a missing authentication flaw in the SAP NetWeaver AS Java EDM application. It could let an unauthenticated user reach sensitive business data. SAP did not patch the application. It removed the application entirely. [SAP Note 3810485](https://me.sap.com/notes/3810485)

## Across the rest of the NetWeaver stack

-   **Information disclosure and missing authorization (multiple CVEs, CVSS 6.5):** These issues are in the NWDI Cockpit of SAP NetWeaver AS Java. [SAP Note 3839977](https://me.sap.com/notes/3839977)
-   **CSS injection (CVE-2026-109810, CVSS 6.1):** Theme-resource parameters in Web Dynpro Java are not validated, which enables UI redressing and limited content exfiltration. [SAP Note 3797108](https://me.sap.com/notes/3797108)
-   **SSRF (CVE-2026-89129, CVSS 5.8):** A crafted SOAP request to SAP NetWeaver AS Java Web Services makes the server send a SOAP fault to an attacker-controlled URL. That fault leaks details about connected systems. [SAP Note 3835738](https://me.sap.com/notes/3835738)
-   **Broken access control (CVE-2026-89128, CVSS 5.3):** The SAP NetWeaver Process Integration Test Tool allows unauthenticated users to invoke SOAP operations over HTTP. [SAP Note 3792447](https://me.sap.com/notes/3792447)
-   **CSRF (CVE-2026-89131, CVSS 4.3):** A crafted link can trigger server-side actions when a logged-in SAP NetWeaver Enterprise Portal user clicks it. [SAP Note 3801587](https://me.sap.com/notes/3801587)

## The pattern

Several of these findings share a root cause: functionality that was reachable without the authentication or authorization checks it needed. The EDM application, the PI Test Tool's SOAP operations and the NWDI Cockpit all fit this pattern. In large enterprise platforms, these gaps tend to sit in less-visible components that accumulate over years. XBOW is built to find this kind of attack surface systematically, and ORL's deep SAP expertise helped turn these findings into fixes.

## What to do

![Federico Kirschbaum](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/76c6f4de1c09406d.webp)

If you run affected SAP NetWeaver components, review the security notes above and apply the patches. Prioritize CVE-2026-109803 and CVE-2026-89114, then check your exposure for the rest.

For more, see [SAP's November 2026 security notes](https://support.sap.com/en/my-support/knowledge-base/security-notes-news/november-2026.html) and [ORL's full Patch Day breakdown](https://onapsis.com/blog/sap-security-patch-day-nov-2026/).

##### About Onapsis

[Onapsis](https://onapsis.com/) delivers complete SAP security for the autonomous enterprise, protecting critical SAP applications from AI-powered threats while securely accelerating SAP AI and RISE adoption. As the global leader in SAP cybersecurity and compliance, the SAP-endorsed Onapsis Platform leverages the unmatched threat intelligence from Onapsis Research Labs and our Agentic AI Fabric to proactively prevent breaches, automate continuous compliance, and secure custom code for a Clean Core across RISE with SAP, S/4HANA, and hybrid landscapes.

You have a business to run — Onapsis protects your core so you can transform with speed and conﬁdence without trade-offs.
