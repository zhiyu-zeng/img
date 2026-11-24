---
title: "GHSA-95f8-mvw7-gpj9: Directus extension upload code execution"
source: https://kamil-sawicki.github.io/posts/ghsa-95f8-mvw7-gpj9/
source_host: kamil-sawicki.github.io
clip_date: 2026-11-24T10:51:44+08:00
trace_id: f27f0f89-dad2-4a9e-ab4d-444da037620b
content_hash: db027aaecd8c3304b55c4d101bc9abe5f6ef0a07f530a0389529902115fc4c13
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
notion_page_id: 42275244-d011-81cc-9903-de0f63b0c1b9
ioc:
  cves: []
  cwes:
    - CWE-434
    - CWE-73
  hashes: []
  domains: []
  tools: []
  techniques: []
---

I reported a Directus file upload issue, published as **GHSA-95f8-mvw7-gpj9**. The [public advisory](https://github.com/directus/directus/security/advisories/GHSA-95f8-mvw7-gpj9) credits me as the reporter.

## Advisory

-   CVE: No known CVE as of November 14, 2026
-   GitHub Advisory: `GHSA-95f8-mvw7-gpj9`
-   Package: `directus` (npm)
-   Published: October 30, 2026
-   Affected versions: `< 12.5.0`
-   Patched version: `12.5.0`
-   Severity: Moderate 6.6/10
-   CVSS: `CVSS:3.1/AV:N/AC:H/PR:H/UI:N/S:U/C:H/I:H/A:H`
-   Weaknesses: `CWE-73`, `CWE-434`

## Impact

An authenticated user with file creation or update permissions and writable `storage` and `filename_disk` fields could upload JavaScript into the extensions directory when it overlapped upload storage. Directus would execute it during extension loading, immediately when overwriting an active extension with `EXTENSIONS_AUTO_RELOAD` enabled, or on a subsequent restart or reload.

Default configurations were not affected.

## Remediation

Upgrade to **Directus 12.5.0 or later**. Restrict non-admin access to `storage` and `filename_disk`, separate extension directories and storage locations from uploads, and disable `EXTENSIONS_AUTO_RELOAD` in production.
