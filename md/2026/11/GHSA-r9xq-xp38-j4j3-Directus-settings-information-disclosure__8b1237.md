---
title: "GHSA-r9xq-xp38-j4j3: Directus settings information disclosure"
source: https://kamil-sawicki.github.io/posts/ghsa-r9xq-xp38-j4j3/
source_host: kamil-sawicki.github.io
clip_date: 2026-11-24T10:48:46+08:00
trace_id: bc2abd4b-fe04-40d4-afb1-bcc089d0fa93
content_hash: ce56f2da4b4e00cc51a3b7ed19780598becce708d41ef63728456f9002733ddc
status: synced
tags: []
series: null
feed_source: Kamil Sawicki·漏洞研究
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 42275244-d011-81aa-9558-f9d81db401a2
ioc:
  cves: []
  cwes:
    - CWE-1220
    - CWE-200
    - CWE-522
  hashes: []
  domains: []
  tools: []
  techniques: []
---

I reported a Directus settings disclosure issue, published as **GHSA-r9xq-xp38-j4j3**. The [public advisory](https://github.com/directus/directus/security/advisories/GHSA-r9xq-xp38-j4j3) credits me as the reporter.

## Advisory

-   CVE: No known CVE as of September 8, 2026
-   GitHub Advisory: `GHSA-r9xq-xp38-j4j3`
-   Package: `directus` (npm)
-   Published: August 20, 2026
-   Affected versions: `>= 11.15.0, < 12.2.0`
-   Patched version: `12.2.0`
-   Severity: Moderate 6.5/10
-   CVSS: `CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N`
-   Weaknesses: `CWE-200`, `CWE-522`, `CWE-1220`

## Impact

Sensitive AI and MCP configuration was exposed to authenticated users with minimal app access. This included credentials stored as custom backend authorization headers. Encrypted provider API key fields remained masked.

## Remediation

Upgrade to a fixed release and review existing policies for unrestricted read access to `directus_settings`. Remove that permission or restrict the allowed fields.

Policies created through Data Studio before **12.3.0** may retain stored permissions after upgrading. Version 12.3.0 prevents the dialog from creating those permission rows; existing policies still need review.

The advisory also recommends removing and rotating credentials stored in `ai_openai_compatible_headers` and avoiding sensitive content in AI and MCP system prompts.
