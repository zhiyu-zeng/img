---
title: Back Button
source: https://www.rapid7.com/blog/post/etr-cve-2026-123890-critical-authentication-bypass-vmware-vcenter
source_host: www.rapid7.com
clip_date: 2026-11-20T05:44:28+08:00
trace_id: 34081fd9-e963-48c4-9618-e53ab154dfec
content_hash: cbd8a706ee86c47982db3ed66977ac10958996e969c0ef33bd1bd46ae8389d3e
status: synced
tags: []
series: null
feed_source: Rapid7 Blog
ai_summary: null
ai_summary_style: null
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 41d75244-d011-812c-a415-fdde1d56d87d
ioc:
  cves:
    - CVE-2026-123890
    - CVE-2026-59309
  cwes:
    - CWE-288
  hashes: []
  domains: []
  tools: []
  techniques: []
---

## Overview

On November 19, 2026, Broadcom [published VMware Security Advisory VMSA-2026-0009](https://support.broadcom.com/web/ecx/support-content-notification/-/external/content/SecurityAdvisories/0/39495), addressing five vulnerabilities in VMware products. The most severe of these, [CVE-2026-123890](https://www.cve.org/CVERecord?id=CVE-2026-123890), is an authentication bypass using an alternate path or channel ([CWE-288](https://cwe.mitre.org/data/definitions/288.html)) in the VMware Directory Service component of vCenter. Broadcom assigned the vulnerability a critical CVSSv3 score of [9.8](https://www.first.org/cvss/calculator/3.1#CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H).

A malicious actor with network access to an affected vCenter deployment may exploit CVE-2026-123890 without credentials to bypass authentication and gain unauthorized access to the system as the Administrator user. Mandiant privately reported the issue to Broadcom. Also, [Mandiant/Google Threat Intelligence](https://cloud.google.com/blog/topics/threat-intelligence/armory-castle-exploits-vsphere) confirmed in-the-wild exploitation of CVE-2026-123890 by Chinese state-linked threat actor ARMORY CASTLE as early as September 2026.

![Rapid7](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f89feb53c668b828.svg)

CVE-2026-123890 is distinct from the vCenter authentication bypass vulnerability CVE-2026-59309 that Broadcom addressed earlier in 2026. The [vendor FAQ](https://github.com/vmware/vcf-security-and-compliance-guidelines/blob/main/security-advisories/vmsa-2026-0009/README.md) states that all vCenter systems below the versions fixed by VMSA-2026-0009 require the new update, including systems that already received the earlier fix. Broadcom characterizes the vCenter update as an emergency change requiring prompt action.

## Mitigation guidance

Vendor-provided updates are available for CVE-2026-123890. Broadcom lists no workaround, and the patches cannot be applied using vCenter Quick Patch. Organizations should prioritize upgrading vCenter on an emergency basis, outside of normal patch cycles, using the standard update mechanism for their deployment.

| **VMware Product** | **Affected Version** | **Fixed Version / Patch** |
| --- | --- | --- |
| VMware Cloud Foundation / vSphere Foundation | 9.1.x.x | [9.1.1.0200](https://techdocs.broadcom.com/bin/gethidpage?appid=vcf-9-1&format=rendered&language=en&ux-context-string=vcenter-9-1-1-2) |
| VMware Cloud Foundation / vSphere Foundation | 9.0.x.x | [9.0.2.0200](https://techdocs.broadcom.com/bin/gethidpage?appid=vcf-9-0&format=rendered&language=en&ux-context-string=vcenter-9-0-2-0-2) |
| VMware vCenter Server | 8.0 | [8.0 U3m](https://techdocs.broadcom.com/us/en/vmware-cis/vsphere/vsphere/8-0/release-notes/vcenter-server-update-and-patch-release-notes/vsphere-vcenter-server-80u3m-release-notes.html) |
| VMware vCenter Server | 7.0 | Contact Broadcom Support (extended-support customers) |
| VMware Cloud Foundation | 5.x | [5.2.5](https://techdocs.broadcom.com/us/en/vmware-cis/vcf/vcf-5-2-and-earlier/5-2/vcf-release-notes/vmware-cloud-foundation-525-release-notes.html) |
| VMware Telco Cloud Platform | 3.0, 4.x, 5.0.x, 5.1.x, 5.2 | [8.0 U3m — KB463116](https://knowledge.broadcom.com/external/article/463116) |
| VMware Telco Cloud Infrastructure | 3.0 | [8.0 U3m — KB463116](https://knowledge.broadcom.com/external/article/463116) |

The fixes are cumulative. The vCenter 8.0 U3m and 9.0.2.0200 updates introduce a “Back-in-Time” restriction that blocks upgrades to VMware Cloud Foundation 9.1.1; Broadcom advises customers in an active upgrade to review the vendor FAQ and interoperability matrix. Updating vCenter temporarily makes its management interfaces unavailable, but Broadcom states that running virtual machine and container workloads continue to operate.

For the latest affected-version and mitigation guidance, please refer to [Broadcom's security advisory](https://support.broadcom.com/web/ecx/support-content-notification/-/external/content/SecurityAdvisories/0/39495) and [supplemental FAQ](https://github.com/vmware/vcf-security-and-compliance-guidelines/blob/main/security-advisories/vmsa-2026-0009/README.md).

## Rapid7 customers

### Exposure Command, Vulnerability Management, and Nexpose

Exposure Command, InsightVM, and Nexpose customers can assess exposure to CVE-2026-123890 on VMware vCenter Server with an unauthenticated vulnerability check expected to be available in the Nov 20, 2026 content release.

## Updates

-   **November 19, 2026**: Initial publication.
