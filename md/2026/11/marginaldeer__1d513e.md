---
title: marginaldeer
source: https://www.marginaldeer.com//blog/suitecrm-order-by-sql-injection/
source_host: www.marginaldeer.com
clip_date: 2026-11-19T08:23:21+08:00
trace_id: df56c7fa-c374-4cf3-925c-89ec415fc46b
content_hash: 02d70b9f7ca7c3c0126a4da216d0c72dc59e1fc14cec68bbe2d07ecda6900cf5
status: synced
tags: []
series: null
feed_source: marginaldeer·Android逆向
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41d75244-d011-81bc-abc0-f634d05c2909
ioc:
  cves:
    - CVE-2026-100365
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

1.  [Modern Web App Testing: JWT Abuse, GraphQL, Race Conditions, and Prototype Pollution](https://www.marginaldeer.com/blog/modern-web-app-testing-techniques/)
2.  [Abliterated Models for Web App Bug Bounty Hunting](https://www.marginaldeer.com/blog/abliterated-models-web-bug-bounty/)
3.  Blind SQL Injection in SuiteCRM Reports, Through ORDER BY

A normal SuiteCRM user, with no admin flag, could save a report and read the rest of the database. I confirmed it on 7.15.0 and 8.9.2. The sort label on a grouped report was concatenated into `ORDER BY`, and the only filter in front of it was an XSS filter. From there a time-based blind injection walked out the administrator’s bcrypt hash. No shell on the server, no admin session.

The fix shipped in **7.15.2** and **8.10.2** on July 31, 2026. Anything older on the 7.x line through 7.15.1, and on the 8.x line through 8.10.1, is affected. The CVE is [CVE-2026-100365](https://nvd.nist.gov/vuln/detail/CVE-2026-100365) (CVSS 3.1 **8.8**, `AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H`). The advisory is [GHSA-6c7r-7g6m-29f9](https://github.com/SuiteCRM/SuiteCRM/security/advisories/GHSA-6c7r-7g6m-29f9). If you run SuiteCRM, upgrade. The [7.15.2 release notes](https://docs.suitecrm.com/admin/releases/7.15.x/) credit this report.

## Where the query was built

Grouped reports are assembled in `build_group_report()` in `modules/AOR_Reports/AOR_Report.php`. On 8.x the same file lives at `public/legacy/modules/AOR_Reports/AOR_Report.php`. I diffed the two and the vulnerable lines matched.

Before the fix, a field label was stored from the report form, read back later, and dropped straight into the sort clause:

```php
$field_label = str_replace(' ', '_', (string) $field->label);

if ($field->sort_by != '') {
    $query_array['sort_by'][] = $field_label . ' ' . $field->sort_by;
}

foreach ($query_array['sort_by'] as $sort_by) {
    $query_sort_by .= ($query_sort_by == '' ? 'ORDER BY ' : ', ') . $sort_by;
}
$query .= ' ' . $query_sort_by;
$result = $this->db->query($query);
```

That is a second-order bug. The value is saved with the report, then executed when the report runs. The label was never checked against the module’s real columns. Replacing spaces with underscores does not make a string safe to concatenate into SQL.

`AOR_Reports` is an ordinary user module, so a low-privileged account can create the report. Running it does not require the admin role.

## Why the XSS filter did not matter

SuiteCRM runs request data through `securexss()`, which HTML-encodes quotes, angle brackets, and backticks. That is the right filter for a page, and the wrong one for a query. An `ORDER BY` expression is not a bound parameter in MySQL. Prepared statements bind values. They do not bind the column or the expression you sort by. If a user controls that text, the only sound check is an allowlist of real column names and the two sort directions.

The label reached the database as part of the statement structure. Encoding it for HTML left the SQL syntax intact.

## What 7.15.2 changed

The patched `build_group_report()` reduces the label to an identifier and forces the direction to one of two literals. The 7.x change is [d6bca97](https://github.com/SuiteCRM/SuiteCRM/commit/d6bca97a0159ec019a969b86eca32affab3beb7c). The 8.x legacy tree has the same change in [a11f501](https://github.com/SuiteCRM/SuiteCRM-Core/commit/a11f50180d939f639cc468b5d536e8ad714dfb68).

```php
$field_label = str_replace(' ', '_', (string) $field->label);
$field_label = preg_replace('/[^A-Za-z0-9_]/', '', $field_label);

if ($field->sort_by != '' && in_array(strtoupper($field->sort_by), getAorAllowedSortDirections(), true)) {
    $sort_direction = strtoupper((string) $field->sort_by) === 'DESC' ? 'DESC' : 'ASC';
    $query_array['sort_by'][] = $field_label . ' ' . $sort_direction;
}
```

Parentheses, comments, commas, and operators do not survive that regular expression, so the label can no longer change the shape of the query. The same release also rejects a report field whose name is not in the module’s field definitions. That is the right shape of fix for a clause you cannot parameterize: map user input onto a known-safe identifier, and do it when the query is built, not only when the form is submitted.

## Impact

Anyone who could save a report could:

-   Read password hashes for every user, including administrators, and crack them offline.
-   Read anything else the SuiteCRM database account can read: session material, API keys, mail, CRM records.
-   Hold database connections open with a slow query and degrade the instance.

The hash I recovered on the lab instance was a 60-character bcrypt hash, which is what SuiteCRM stores for current passwords. Offline cracking is the realistic follow-on. I am not publishing the hash or the extractor in this post.

## Disclosure

Internal tracking id on the SuiteCRM side was SCRMBT-320. They graded it Important.

-   **March 12, 2026**— Opened [GHSA-6c7r-7g6m-29f9](https://github.com/SuiteCRM/SuiteCRM/security/advisories/GHSA-6c7r-7g6m-29f9), accepted the reporter credit, and opened a private fork for a patch.
-   **March 18, 2026**— jack7anderson7 acknowledged the report and sent it to the internal security team.
-   **March 23 and May 18, 2026**— I asked for status.
-   **May 19, 2026**— SuiteCRM said the review was still in progress because of report volume.
-   **May 20, 2026**— clemente-raposo accepted the report. They said a fix would ship soon, that release notes would credit the find, and that a CVE would follow once the issue was resolved on GitHub.
-   **July 31, 2026**— Fix released in 7.15.2 and 8.10.2. CVE requested. They asked that the details stay private until the advisory was published, and that blog posts wait at least 30 days after publication so people could upgrade.
-   **September 25, 2026**— GitHub assigned CVE-2026-100365. The record stays off the public CVE list until the advisory is published.
-   **October 12, 2026**— SuiteCRM published the advisory.
-   **November 5, 2026**— [CVE-2026-100365](https://nvd.nist.gov/vuln/detail/CVE-2026-100365) showed up on the CVE list.
-   **November 10, 2026**— This post.

## Takeaways

`ORDER BY` cannot be parameterized. If a user picks a sort column, map that choice to a column you already know, and accept only `ASC` and `DESC` for the direction.

An XSS encoder is not a SQL control. When the same string is stored and later concatenated into a query, the check that matters is the one at the query, against the grammar of that clause.

Reporting modules are a standing place to look. Sorting is a normal feature, the code that implements it often predates prepared statements, and the permission required is “can this person run a report,” which is almost everyone.

For pulling Java backends apart when the target is not PHP, see [decompiling with CFR](https://www.marginaldeer.com/blog/java-decompilation-cfr/).

Upgrade to 7.15.2 or 8.10.2, or anything newer. That is the whole remediation.

If you enjoyed this post please consider subscribing to the [feed](https://www.marginaldeer.com/feed/)!
