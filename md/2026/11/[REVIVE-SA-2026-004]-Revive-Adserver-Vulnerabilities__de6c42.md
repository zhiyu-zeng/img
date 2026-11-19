---
title: "[REVIVE-SA-2026-004] Revive Adserver Vulnerabilities"
source: https://seclists.org/fulldisclosure/2026/Nov/23
source_host: seclists.org
clip_date: 2026-11-19T08:19:54+08:00
trace_id: 3f5a89f9-5b1f-4e4a-af04-d8fbcdeed19e
content_hash: b52db8211eb629da99fa560ce048220bc7fa415676d6fbed265398b82ffa8b12
status: synced
tags: []
series: null
feed_source: Full Disclosure·漏洞披露
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41d75244-d011-8138-b94a-e2e90771114d
ioc:
  cves:
    - CVE-2026-107247
    - CVE-2026-107662
    - CVE-2026-108558
    - CVE-2026-108559
    - CVE-2026-108560
    - CVE-2026-108561
    - CVE-2026-108562
    - CVE-2026-108563
    - CVE-2026-108564
    - CVE-2026-108565
    - CVE-2026-68485
    - CVE-2026-68486
    - CVE-2026-77168
    - CVE-2026-82978
  cwes:
    - CWE-352
    - CWE-639
    - CWE-79
    - CWE-89
    - CWE-94
  hashes: []
  domains: []
  tools: []
  techniques: []
---

## Full Disclosure mailing list archives

## \[REVIVE-SA-2026-004\] Revive Adserver Vulnerabilities

* * *

*From*: Matteo Beccati <php () beccati com>  
*Date*: Thu, 12 Nov 2026 18:56:21 +0100  

* * *

```yaml
========================================================================
Revive Adserver Security Advisory                     REVIVE-SA-2026-004
------------------------------------------------------------------------
https://www.revive-adserver.com/security/revive-sa-2026-004
------------------------------------------------------------------------
Date:                  2026-11-11
Risk Level:            Medium to High
Applications affected: Revive Adserver
Versions affected:     <= 6.0.8
Versions not affected: >= 6.0.9
Website:               https://www.revive-adserver.com/
========================================================================

========================================================================
1. Blind SQL injection through inconsistent request precedence
========================================================================
Vulnerability Type:    CWE-89: SQL Injection
CVE-ID:                CVE-2026-107662
Risk level:            High
CVSS Base Score:       8.8
CVSS Vector:           CVSS:3.0/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H
------------------------------------------------------------------------

Description
-----------
```

HackerOne community member sh4d0byss reported blind SQL injection in the banner-zone and campaign-zone administration pages. Permission checks and database queries could use different values for the same request parameter. A restricted manager could exploit this mismatch to extract arbitrary database values, including password hashes and active session identifiers. Reusing an extracted, unexpired administrator session can grant administrative access and the ability to modify configuration or disrupt ad delivery.

```
Resolution
----------
```

The fix combines the request-precedence correction described in the authorization bypass finding with changes to the common input helpers. Global input registration and query-side helpers now both read POST values before GET values, ensuring that permission checks and database queries use the same identifiers. Cookies are excluded from this input path, removing dependence on the PHP request_order configuration. Both changes are required to close the reported input-source mismatch.

```
References
----------
https://hackerone.com/reports/3896779
https://github.com/revive-adserver/revive-adserver/commit/e301dbbb7
https://github.com/revive-adserver/revive-adserver/commit/0aa9d0124
https://cwe.mitre.org/data/definitions/89.html

========================================================================
2. Authorization bypass through inconsistent request precedence
========================================================================
```

Vulnerability Type: CWE-639: Authorization Bypass Through User-Controlled Key

```ruby
CVE-ID:                CVE-2026-107247
Risk level:            High
CVSS Base Score:       8.1
CVSS Vector:           CVSS:3.0/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:N
------------------------------------------------------------------------

Description
-----------
```

HackerOne community member kushbafti reported an authorization bypass affecting multiple administration pages in Revive Adserver 6.0.0 through 6.0.8. The regression was introduced in commit 156dee7bc during input-helper simplification. Version 5.5.3 retains the original POST-first behavior and is not affected by this regression. Object identifiers used for permission checks were read with GET precedence, while form submissions could select different objects through POST parameters. A manager could supply identifiers belonging to their own agency in the URL and another agency in the submitted form, allowing unauthorized changes, campaign reassignment and access to other agencies' inventory.

```
Resolution
----------
```

Global input registration now gives POST parameters precedence over GET parameters, so permission checks and submitted form values use the same object identifiers.

```swift
References
----------
https://hackerone.com/reports/3831102
https://github.com/revive-adserver/revive-adserver/commit/e301dbbb7
https://github.com/revive-adserver/revive-adserver/commit/156dee7bc
https://cwe.mitre.org/data/definitions/639.html

========================================================================
3. Reflected XSS in conversion statistics
========================================================================
Vulnerability Type:    CWE-79: Cross-site Scripting
CVE-ID:                CVE-2026-108558
Risk level:            Medium
CVSS Base Score:       6.1
CVSS Vector:           CVSS:3.0/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N
------------------------------------------------------------------------

Description
-----------
```

HackerOne community member Patrick Lang (7YR) reported a reflected XSS vulnerability in the conversion-statistics pages. An incorrect ownership check used the advertiser identifier in place of the website identifier, allowing crafted website input to reach the page output. An attacker can send a crafted URL to an authenticated user and execute JavaScript in that user's browser. A related hour-parameter output issue is addressed by the same fix.

```
Resolution
----------
```

Website ownership checks now validate the correct identifier, and the hour parameter is normalised to an integer before formatting.

```swift
References
----------
https://hackerone.com/reports/3878649
https://github.com/revive-adserver/revive-adserver/commit/b9fd9b04b
https://cwe.mitre.org/data/definitions/79.html

========================================================================
4. Reflected XSS in iframe invocation dimensions
========================================================================
Vulnerability Type:    CWE-79: Cross-site Scripting
CVE-ID:                CVE-2026-108559
Risk level:            Medium
CVSS Base Score:       6.1
CVSS Vector:           CVSS:3.0/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N
------------------------------------------------------------------------

Description
-----------
```

HackerOne community member Adam Rayyan Aryasatya (kannrisha) reported reflected XSS in the iframe invocation options. The frame_width and frame_height request parameters could be included in HTML attributes without appropriate encoding when generating invocation tags for an any-size zone. An attacker can send a crafted URL to an authenticated user to execute JavaScript in that user's browser.

```
Resolution
----------
```

Width and height values are now HTML-encoded when included in invocation-option form fields.

```sql
References
----------
https://hackerone.com/reports/3908050
https://github.com/revive-adserver/revive-adserver/commit/9643f44dc
https://cwe.mitre.org/data/definitions/79.html

========================================================================
5. Unauthenticated reflected XSS in update history
========================================================================
Vulnerability Type:    CWE-79: Cross-site Scripting
CVE-ID:                CVE-2026-108560
Risk level:            Medium
CVSS Base Score:       6.1
CVSS Vector:           CVSS:3.0/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N
------------------------------------------------------------------------

Description
-----------
```

HackerOne community member Matías López Pereira (HackerOne: @mlopez01) reported a reflected XSS vulnerability in 'updates-history.php'. The preliminary session check covered xajax POST requests but omitted GET requests. An unauthenticated attacker could therefore cause crafted input to be reflected into an XML/XHTML response before authentication. Visiting a crafted URL could execute JavaScript in the context of the Revive Adserver administration origin.

```
Resolution
----------
```

The preliminary session check now applies to xajax requests submitted through either GET or POST. XML command attribute values are also encoded in both response serializers, preventing crafted values from injecting markup into responses for authenticated users.

```sql
References
----------
https://hackerone.com/reports/4075098
https://github.com/revive-adserver/revive-adserver/commit/770130171
https://github.com/revive-adserver/revive-adserver/commit/8c449079d
https://cwe.mitre.org/data/definitions/79.html

========================================================================
6. Session-stored XSS in report date selection
========================================================================
Vulnerability Type:    CWE-79: Cross-site Scripting
CVE-ID:                CVE-2026-108561
Risk level:            Medium
CVSS Base Score:       6.1
CVSS Vector:           CVSS:3.0/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N
------------------------------------------------------------------------

Description
-----------
```

HackerOne community member Matías López Pereira (HackerOne: @mlopez01) reported stored XSS in the date-selection controls of standard reports. A crafted period_preset value could be saved in the victim's session and inserted into JavaScript without appropriate encoding. An attacker could supply a report URL retained through normal reauthentication; the payload could then execute on the initial report and subsequent report views using the stored defaults.

```
Resolution
----------
```

Date-selection values are now encoded with JSON encoding appropriate for their JavaScript context. The same encoding has also been applied to the audit date-selection field.

```swift
References
----------
https://hackerone.com/reports/4116433
https://github.com/revive-adserver/revive-adserver/commit/cce8a4081
https://cwe.mitre.org/data/definitions/79.html

========================================================================
7. Stored XSS in tracker maintenance
========================================================================
Vulnerability Type:    CWE-79: Cross-site Scripting
CVE-ID:                CVE-2026-108562
Risk level:            Medium
CVSS Base Score:       5.4
CVSS Vector:           CVSS:3.0/AV:N/AC:L/PR:L/UI:R/S:C/C:L/I:L/A:N
------------------------------------------------------------------------

Description
-----------
```

HackerOne community member flasks reported a stored XSS vulnerability in the 'maintenance-appendcode-check.php' tool. A manager can store a malicious tracker name and cause the tracker to appear in the maintenance results. When an administrator opens the affected page, the name is displayed without proper escaping and the embedded JavaScript executes in the administrator's browser.

```
Resolution
----------
```

Tracker names are now HTML-encoded when displayed by the append-code maintenance tool.

```
References
----------
https://hackerone.com/reports/3826207
https://github.com/revive-adserver/revive-adserver/commit/ae0bbc4b3
https://cwe.mitre.org/data/definitions/79.html

========================================================================
8. Campaign-zone linking without ownership validation
========================================================================
```

Vulnerability Type: CWE-639: Authorization Bypass Through User-Controlled Key

```ruby
CVE-ID:                CVE-2026-68486
Risk level:            Medium
CVSS Base Score:       5.4
CVSS Vector:           CVSS:3.0/AV:N/AC:L/PR:L/UI:N/S:U/C:L/I:L/A:N
------------------------------------------------------------------------

Description
-----------
```

HackerOne community member miauzxw reported a missing campaign ownership check in the bulk-linking operation of 'zone-include.php'. The single-link operation and XML-RPC API also lacked the corresponding check. A manager, or a trafficker with zone-linking permissions, could associate another agency's campaign with their own zone. Although agency filtering prevented foreign banners from being linked, the unauthorized association could expose the foreign campaign's name, type and identifier in the linked-campaign listing.

```
Resolution
----------
```

Campaign ownership is now checked in the bulk-linking and single-link operations and in the XML-RPC campaign-linking method.

```swift
References
----------
https://hackerone.com/reports/3958112
https://github.com/revive-adserver/revive-adserver/commit/8fc49ab1d
https://github.com/revive-adserver/revive-adserver/commit/f0ab01a02
https://cwe.mitre.org/data/definitions/639.html

========================================================================
9. Formula injection in conversion-report XLS exports
========================================================================
Vulnerability Type:    CWE-94: Code Injection
CVE-ID:                CVE-2026-108563
Risk level:            Medium
CVSS Base Score:       4.7
CVSS Vector:           CVSS:3.0/AV:N/AC:L/PR:N/UI:R/S:C/C:N/I:L/A:N
------------------------------------------------------------------------

Description
-----------
```

HackerOne community member BapToutatis reported spreadsheet formula injection in conversion-tracking report exports. An unauthenticated attacker can submit conversion values that are subsequently written as formulas rather than text in an XLS report. Opening the exported workbook in a spreadsheet application can evaluate attacker-supplied formulas. The confirmed impact is formula execution within the workbook; disclosure of information to the attacker has not been established.

```
Resolution
----------
```

Conversion values are sanitised before being written to the affected XLS report sections, preventing them from being interpreted as formulas.

```swift
References
----------
https://hackerone.com/reports/3859000
https://github.com/revive-adserver/revive-adserver/commit/1e4d48b18
https://cwe.mitre.org/data/definitions/94.html

========================================================================
10. Reflected XSS in direct-selection invocation options
========================================================================
Vulnerability Type:    CWE-79: Cross-site Scripting
CVE-ID:                CVE-2026-108564
Risk level:            Medium
CVSS Base Score:       4.7
CVSS Vector:           CVSS:3.0/AV:N/AC:H/PR:N/UI:R/S:C/C:L/I:L/A:N
------------------------------------------------------------------------

Description
-----------
```

HackerOne community member Umesh Paytode reported reflected XSS through the banner identifier in the invocation-tag generation interface. When Direct Selection is enabled, attacker-supplied input could be included in HTML form fields without proper encoding. Successful exploitation requires an attacker to persuade an authenticated user to visit a crafted URL. Direct Selection is disabled by default.

```
Resolution
----------
```

Banner identifier values are now HTML-encoded when included in invocation-option form fields.

```swift
References
----------
https://hackerone.com/reports/3942028
https://github.com/revive-adserver/revive-adserver/commit/cb8fdeddf
https://cwe.mitre.org/data/definitions/79.html

========================================================================
11. Reflected XSS in popup invocation options
========================================================================
Vulnerability Type:    CWE-79: Cross-site Scripting
CVE-ID:                CVE-2026-108565
Risk level:            Medium
CVSS Base Score:       4.7
CVSS Vector:           CVSS:3.0/AV:N/AC:H/PR:N/UI:R/S:C/C:L/I:L/A:N
------------------------------------------------------------------------

Description
-----------
```

HackerOne community member miauzxw reported reflected XSS in the popup invocation options. The top, left, timeout and delay request parameters could be included in HTML attributes without proper encoding. An attacker can send a crafted URL to an authenticated user to execute JavaScript in that user's browser. Exploitation requires an existing popup zone, a configuration that can be created through the administrator API but is not offered by the normal zone-creation interface.

```
Resolution
----------
```

Popup option values are now HTML-encoded when included in invocation-option form fields.

```
References
----------
https://hackerone.com/reports/3971985
https://github.com/revive-adserver/revive-adserver/commit/2275165e0
https://cwe.mitre.org/data/definitions/79.html

========================================================================
12. Cross-agency website-list disclosure
========================================================================
```

Vulnerability Type: CWE-639: Authorization Bypass Through User-Controlled Key

```ruby
CVE-ID:                CVE-2026-68485
Risk level:            Medium
CVSS Base Score:       4.3
CVSS Vector:           CVSS:3.0/AV:N/AC:L/PR:L/UI:N/S:U/C:L/I:N/A:N
------------------------------------------------------------------------

Description
-----------
```

HackerOne community member Shmulik Cohen reported an authorization bypass in 'website-index.php'. A restricted manager could change the agencyid request parameter to view another agency's website listing, including website names, identifiers and timestamps. Detailed website pages continued to enforce ownership checks.

```
Resolution
----------
```

The website listing now obtains the agency identifier from the authenticated account rather than the request.

```
References
----------
https://hackerone.com/reports/3883840
https://github.com/revive-adserver/revive-adserver/commit/42df0608e
https://cwe.mitre.org/data/definitions/639.html

========================================================================
13. Cross-agency delivery rule set creation
========================================================================
```

Vulnerability Type: CWE-639: Authorization Bypass Through User-Controlled Key

```ruby
CVE-ID:                CVE-2026-82978
Risk level:            Medium
CVSS Base Score:       4.3
CVSS Vector:           CVSS:3.0/AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:L/A:N
------------------------------------------------------------------------

Description
-----------
```

HackerOne community members Shmulik Cohen and Dang Hung Vi independently reported an authorization bypass in 'channel-edit.php'. An authenticated manager could change the submitted agencyid parameter to create a delivery rule set belonging to another agency. The server trusted the submitted agency identifier when inserting the new rule set, allowing unauthorized creation of objects in another agency's account.

```
Resolution
----------
```

New delivery rule sets now obtain their agency identifier from the authenticated account rather than submitted form data. The agency identifier has also been removed from the form's hidden fields.

```swift
References
----------
https://hackerone.com/reports/3929216
https://hackerone.com/reports/3883840
https://github.com/revive-adserver/revive-adserver/commit/cabeb2e53
https://cwe.mitre.org/data/definitions/639.html

========================================================================
14. Cross-site request forgery in tracker invocation
========================================================================
Vulnerability Type:    CWE-352: Cross-Site Request Forgery
CVE-ID:                CVE-2026-77168
Risk level:            Medium
CVSS Base Score:       4.3
CVSS Vector:           CVSS:3.0/AV:N/AC:L/PR:N/UI:R/S:U/C:N/I:L/A:N
------------------------------------------------------------------------

Description
-----------
```

HackerOne community member Abhishek Nandkumar Bhaskar (Abhi_Hackz) reported a leftover state-changing handler in 'tracker-invocation.php' that did not verify a CSRF token. The handler could modify a tracker name, description or advertiser assignment using the victim's permissions. It was not used by the normal invocation-tag interface. Exploitation requires an authenticated victim and a request path that carries the victim's session credentials.

```
Resolution
----------
```

The unused tracker-modification handler has been removed from the invocation-tag page.

```
References
----------
https://hackerone.com/reports/3981932
https://github.com/revive-adserver/revive-adserver/commit/a4593a679
https://cwe.mitre.org/data/definitions/352.html

========================================================================
Solution
========================================================================
```

We recommend updating to the most recent 6.0.9 version of Revive Adserver, or whatever happens to be the current release at the time of reading this security advisory.

```
========================================================================
Contact Information
========================================================================

The security contact for Revive Adserver can be reached at:
<security AT revive-adserver DOT com>.

Please review https://www.revive-adserver.com/security/ before doing so.

--
Matteo Beccati
On behalf of the Revive Adserver Team
https://www.revive-adserver.com/
_______________________________________________
Sent through the Full Disclosure mailing list
https://nmap.org/mailman/listinfo/fulldisclosure
Web Archives & RSS: https://seclists.org/fulldisclosure/
```
