---
title: "[Coordinated disclosure] sblim-sfcb: pre-auth remote DoS (and latent OOB NUL write) via unbounded quoted-attribute scan in CIM-XML parser (cimXmlParser.c getValue)"
source: https://seclists.org/oss-sec/2026/q4/627
source_host: seclists.org
clip_date: 2026-11-10T17:09:08+08:00
trace_id: 1093184b-f523-468b-8a06-16e387893ee5
content_hash: 6bdc05efcfa4458311bbe5d27b16d0fad8df5588553aea74a663608084fdccfe
status: synced
tags: []
series: null
feed_source: oss-security·漏洞披露
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41475244-d011-81a4-b2c6-e44d5083eb99
ioc:
  cves:
    - CVE-2010-1937
    - CVE-2010-2054
    - CVE-2015-5185
    - CVE-2026-73583
    - CVE-2026-73584
  cwes:
    - CWE-125
    - CWE-787
  hashes:
    - 3190102b9250700b0561245b84f0b205238aed90
  domains: []
  tools: []
  techniques: []
---

## oss-sec mailing list archives

## \[Coordinated disclosure\] sblim-sfcb: pre-auth remote DoS (and latent OOB NUL write) via unbounded quoted-attribute scan in CIM-XML parser (cimXmlParser.c getValue)

* * *

*From*: Eun0us / Espilon <eun0us () espilon net>  
*Date*: Tue, 10 Nov 2026 08:20:35 +0000 (UTC)  

* * *

```sql
To the MITRE CNA team and the sblim-sfcb distribution security teams,

Espilon VR reports a remote, pre-authentication denial-of-service defect (with a latent,
weak out-of-bounds write side effect) in the CIM-XML request parser of SBLIM SFCB. Upstream
is abandoned (last release 1.4.9 in 2017), so we are requesting a CVE from MITRE and
notifying the distributions that still ship sfcb, which are the realistic remediation path.
A one-line fix accompanies this report. We propose a 90-day timeline expiring 2027-02-07,
adjustable. A 17-byte PoC and a faithful harness are available on request.

Important: this is DISTINCT from the recent CVE-2026-73583 (sfcb OOB read in the
provider-manager IPC OperationHdr path). Our sink is the CIM-XML request parser getValue(),
a different function and code path. Please re-confirm the getValue loop against the exact
packaged source before closing, since the sfcb package was recently touched for
CVE-2026-73583.

Full report follows inline.

=== FULL REPORT ===

Title: sblim-sfcb unbounded quoted-attribute scan in the CIM-XML parser (getValue),
pre-auth remote DoS plus latent OOB NUL write.
Component: SBLIM SFCB (Small-Footprint CIM Broker, a WBEM server), cimXmlParser.c,
function getValue() (quoted attribute-value reader). Entry: scanCimXmlRequest() from the
httpAdapter.c CIM-XML request handler, TCP/5988 (WBEM) and TLS/5989.
Designated target / HEAD: github.com/kkaempf/sblim-sfcb HEAD
3190102b9250700b0561245b84f0b205238aed90 (default branch sles11_sp1). The same unbounded
loop is present on every branch/tag checked (master, kkaempf, master_1.3, kkaempf_1.3,
sles11_sp1/sp2, cimrs, v1.3.11/12/13) and in the SourceForge 1.4.9 lineage packaged by
distributions. Upstream effectively abandoned (last commit 2017-11-29, last release 1.4.9
2017-01).
Weakness: CWE-125 (Out-of-bounds Read, primary, proven) and CWE-787 (Out-of-bounds Write,
a single 0x00 byte, reachable but weak). Root cause: a missing bound check against the
buffer-end pointer xb->last in the attribute-value scan loop; sibling readers skipWS,
skipTag, getContent all check xb->last, getValue does not.

Abstract: SFCB tokenizes an inbound CIM-XML operation element-by-element. The request body
is duplicated into a heap buffer sized exactly to the body length. The attribute-value
reader, on seeing an opening quote delimiter, records the start and advances a cursor until
it finds a matching closing delimiter, but never checks the cursor against the end-of-buffer
pointer. A CIM-XML operation whose first attribute value is opened with a quote (" or ')
but never closed makes the cursor advance one byte at a time past the end of the allocation.
It stops only when it (a) reaches an unmapped page -> worker crash (proven, reliable DoS),
or (b) hits an adjacent heap byte equal to the opening delimiter -> the code writes a single
0x00 at that out-of-bounds address. In the default build (SFCB_CONF_DOBASICAUTH=false) the
body is parsed before any authentication, so the condition is reachable pre-auth over the
network. The condition is shallow (first element of any operation); a fuzzer rediscovered
the same crash from a protocol seed within a handful of executions.

Root cause (sink): the getValue scan loop, "while (*xb->cur != dlm) xb->cur++;", with no
"xb->cur < xb->last" bound; then "*xb->cur = 0;". ASan heap-buffer-overflow READ at
cimXmlParser.c:313, stack getValue -> attrsOk -> procCim -> yyparse -> scanCimXmlRequest.

Impact (honest): proven remote pre-auth (default config) DoS, broker worker crash,
reproducible. The OOB write is present and reachable but weak: fixed value (NUL),
heap-layout-dependent offset, no attacker-controlled target, no leak-back channel. It is
NOT demonstrated as a path to RCE or information disclosure; marked NEEDS-LEAK. Net: a
pre-auth DoS with a latent weak heap-corruption side effect.

CVSS 3.1: default build CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H = 7.5 (High); with
basic auth enabled PR:L -> 6.5 (Medium). The OOB NUL write is not scored into the headline.

Reproduction: printf '<CIM CIMVERSION="' > poc_min.xml (17 bytes), then run the harness on
it; deterministic. poc_getvalue.xml (20 bytes) is a second trigger.

Suggested fix (one line, drop-in): bound the scan loop against xb->last and treat an
unterminated value as a parse error:
  while (xb->cur < xb->last && *xb->cur != dlm) xb->cur++;
  if (xb->cur >= xb->last) return NULL;   /* malformed request */
  *xb->cur = 0; xb->cur++;
This removes both the over-read and the stray NUL write while preserving behaviour on
well-formed input.

Deduplication: no advisory references cimXmlParser.c, getValue, or CIM-XML attribute
parsing. CVE-2026-73583 (OOB read, provider-manager IPC OperationHdr, fixed Fedora
1.4.9-40) and CVE-2026-73584 (insecure temp file) are DISTINCT sinks. Historical sfcb CVEs
(CVE-2010-1937 / CVE-2010-2054 httpAdapter getPayload; CVE-2015-5185 providerMgr
lookupProviders) are different sinks. No OSS-Fuzz project.

Credit: Espilon VR. Prepared for coordinated disclosure; PoC on request.

=== END REPORT ===

We will coordinate on timing and are glad to help validate any distro backport. Thank you.

Regards,
Espilon VR (reply: eun0us () espilon net)

```
