---
title: "Full Disclosure: [0day-rubbish] Advantech WebAccess Node 9.2.3 unauthenticated CrystalRpt.aspx file upload and path traversal to code execution in w3wp.exe (9.8)"
source: https://seclists.org/fulldisclosure/2026/Oct/2
source_host: seclists.org
clip_date: 2026-10-15T15:59:34+08:00
trace_id: fa8d6611-d7f3-45f8-b9f3-e94f6796f7e0
content_hash: bef14694aeb9b0100b26ce554cd4aa3b8711bb759e3df55c966ca0afa154599d
status: synced
tags:
  - 漏洞分析
  - Web安全
series: null
feed_source: Full Disclosure·漏洞披露
ai_summary: 未认证攻击者可经 Advantech WebAccess Node 9.2.3 的 CrystalRpt.aspx 路径穿越上传 ASPX 页面，在 w3wp.exe 中执行任意命令，评分为 9.8 严重。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3fa75244-d011-81a3-8a1c-ec4786635046
ioc:
  cves: []
  cwes:
    - CWE-22
    - CWE-250
    - CWE-269
    - CWE-306
    - CWE-434
    - CWE-73
    - CWE-862
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 未认证攻击者可经 Advantech WebAccess Node 9.2.3 的 CrystalRpt.aspx 路径穿越上传 ASPX 页面，在 w3wp.exe 中执行任意命令，评分为 9.8 严重。
> 
> - **漏洞根因：** bin\WaCrpt.dll 的 fileSubmit_Click 把 projName、nodeName 拼入 Server.MapPath("~/report/…")，仅凭 Directory.Exists 放行，随后无扩展名校验调用 FileUpload1.SaveAs，且该写入发生在尝试加载 Crystal Report 之前；仅调换这两步顺序即可断链。
> - **利用链：** 穿越参数走 nodeName 而非文件名，传 \..\..\ 使落点归一到 WaCrpt 应用根目录；深度上限恰为两级，三级及以上报 HttpException。请求 2 返回 HTTP 500 是假象（文件已写入），请求 3 触发编译并在 w3wp.exe 内起 cmd.exe；User-Agent 必须携带，否则 CrystalDecisions 控件抛 NullReferenceException 使链在第 1 步中断。
> - **认证与评分：** 应用内无任何授权判断，同模块 addTemplate.cs 强制 .RPT 校验而 CrystalRpt.cs 无校验；但 applicationHost.config 中匿名认证设置有否未获取，PR:N 基于结构性论证。主评 9.8，路径启用 IIS 认证时 8.8，8.1（AC:H）被否决。
> - **验证边界：** 1.9GB 安装包在 Session 0 挂起，未得到完整默认部署；站点配置为实验自建，/broadweb/WaCrpt/ 前缀属推断；SYSTEM 身份仅属实验池，不主张出厂值。两个独立客户端、510 与 450 字节载荷经目标文件系统与 IIS W3C 日志互证。
> - **修复要点：** SaveAs 前用共享助手做扩展名白名单、先校验后落盘、Page_Load 落实真正授权并终止请求、Web.config 拒绝匿名、对报表根做包含性校验、停止写入可执行目录、池账户按最小权限运行。另记录 WCF 移动服务 /Login 存在 SQL 注入，因后端为 Access .mdb 无法升级为命令执行。

## Full Disclosure mailing list archives

## \[0day-rubbish\] Advantech WebAccess Node 9.2.3 unauthenticated CrystalRpt.aspx file upload and path traversal to code execution in w3wp.exe (9.8)

* * *

*From*: disclosure via Fulldisclosure <fulldisclosure () seclists org>  
*Date*: Mon, 5 Oct 2026 17:52:23 +0000  

* * *

```sql
0day Rubbish Research Team is publicly disclosing a vulnerability in Advantech
WebAccess Node 9.2.3, the closed-source industrial SCADA/HMI web server from
Advantech (Taiwan).

Type: unrestricted file upload (CWE-434) compounded by path traversal (CWE-22), on
a page that performs no authorization decision at all (CWE-306). CWE-73 and CWE-862
also map; CWE-250/CWE-269 apply conditionally where the pool runs at high
privilege. In the WaCrpt ASP.NET Web Forms application served under
/broadweb/WaCrpt/, the fileSubmit_Click handler in bin\WaCrpt.dll concatenates two
attacker-supplied form fields into
Server.MapPath("~/report/" + projName + "_" + nodeName + "/"), gates the result on
nothing but Directory.Exists(rptDirPath), then calls FileUpload1.SaveAs(filePath)
with no extension validation - and does so before it attempts to open the file as a
Crystal Report. Reordering those two calls alone would break the chain.

The traversal rides in nodeName rather than in the uploaded filename, because
ASP.NET already strips any client-side directory from the multipart filename.
Sending nodeName = \..\..\ normalises the destination to the WaCrpt application
root, a directory that always exists, so the provisioning check is satisfied with no
report project created and no report directory present; ASP.NET request validation
inspects for HTML-dangerous sequences and not for backslash or dot-dot, so nothing
filters it. The bound is exactly two dot-dot levels - three or more are refused with
HttpException "Cannot use a leading .. to exit above the top directory".

The chain is three HTTP requests plus a follow-on GET. Request 1 harvests
__VIEWSTATE (1056 bytes) and __EVENTVALIDATION (92 bytes) while establishing the
traversed destination. Request 2 posts a 510-byte ASP.NET page as FileUpload1 with
fileSubmit=Upload; SaveAs writes it into the application root, ReportDocument.Load
then throws and the server returns HTTP 500 - a red herring, since the write already
completed. Request 3 GETs the written page, which the build manager compiles on first
request and executes inside w3wp.exe, running cmd.exe /c with captured stdout. No
credentials, no user interaction, no race window, no memory corruption, no prior
server state. A User-Agent header is mandatory: without one the CrystalDecisions
viewer control throws a NullReferenceException, the form never renders and the chain
stalls at step 1 - a trap that makes an unaffected conclusion easy to reach wrongly.

Authentication. No authorization decision exists anywhere in the application, and
that half is artifact-proven: Page_Load performs no session, cookie, token or
principal check and carries no auth filter, and its failure branch is a
Response.Redirect to the login page - a navigation aid, not an access denial. The
shipped WaCrpt Web.config declares an authentication mode but has no authorization
deny rule and no custom authentication module; there is no global.asax in the
directory; eight sibling files in the module call a session-existence check and
CrystalRpt.cs is not among them. The omission signature is decisive: addTemplate.cs,
the SECOND report-upload handler in the same module, enforces a case-insensitive
.RPT comparison while CrystalRpt.cs enforces nothing. The product has a working
mechanism - waconfig90 controllers carry an auth filter with session plus csrfToken
validation - and this page is not enrolled in it.

The one gap, stated as a gap: whether IIS delivers an anonymous request to the
WaCrpt application path lives in the site's applicationHost.config, and no such
excerpt, no installer-authored IIS fragment and no vendor documentation of that
factory setting was obtained. PR:N is published on a structural argument plus lab
reproduction, not on an extracted artifact - the product's own operator login page
cannot function unless the hosting site accepts anonymous requests, and it is served
by the same IIS site. An administrator who disabled anonymous authentication on that
path, or fronted it with an authenticating gateway, is not exposed on this vector,
and the conditional score below prices exactly that.

Scoring. All three readings the analysis priced are published:
- PRIMARY, 9.8 Critical, CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H
- CONDITIONAL, 8.8 High, CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H, applying
  where IIS authentication is enforced on the WaCrpt application path or an
  authenticating gateway fronts it; nothing else in the finding changes.
- REJECTED, 8.1 High, CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:H, considered
  because the traversal depth and the mandatory User-Agent are non-obvious and
  rejected because both are fixed constants under the attacker's control, which is
  not the CVSS 3.1 meaning of AC:H.
Scope is Unchanged deliberately: the compromise executes as the pool identity of the
vulnerable product's own web application, so the gain crosses a privilege level, not
a component's security scope. S:C on the same impact values would compute to 10.0
and is not claimed.

On scoring accuracy: the primary vector computes to ISS 0.914816, Impact under S:U of
5.873119, Exploitability 3.887043 and base 9.760161495, which the CVSS 3.1 Roundup
rule renders as 9.8. The figure the research record carried for this finding is the
figure its own vector computes, so no correction was required. We say so because
several earlier advisories in this repository carried recorded scores that did not
compute for their recorded vectors; those are being recomputed rather than copied.

Impact. Confidentiality High: full read of the product's configuration, the SCADA
project tree it serves and database connection material - these nodes routinely hold
the point list, alarm configuration and historian data for the monitored process.
Integrity High: a generic write primitive placing an attacker-named file with
attacker-chosen content into a served, script-executing directory, plus arbitrary
command execution, making product binaries, configuration, the report tree, tag and
alarm data and host state modifiable; manipulation of served HMI content, tag values
and alarm thresholds is why this is an operational-technology incident and not only
a web-application one. Availability High: the web tier, the SCADA runtime it fronts
and the host can be stopped or corrupted, removing operator visibility of the
monitored process even where the controlled process keeps running.

Execution identity caveat. The verified identity was nt authority\system with
SeTcbPrivilege, SeDebugPrivilege, SeImpersonatePrivilege and SeBackupPrivilege
enabled - the full SYSTEM set - but that was the VERIFICATION application pool,
configured in the lab as LocalSystem. No shipped pool identity is asserted: the
installer binds broadweb to DefaultAppPool and a separate helper writes the pool's
IdentityType at install time, a value that could not be resolved from static
strings. The rating does not depend on it, since C:H/I:H/A:H are assessed on the
code-execution primitive itself.

Relationship to previously published work. A previously published advisory covers an
unrestricted file upload on this product scored 8.8 with
AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H - PR:L, an authenticated caller - affecting
9.2.1 with a fix in 9.2.2, and it does not name the affected endpoint. This finding
is PR:N, and the unvalidated sink was confirmed by decompilation in 9.2.3, after that
fix. Two readings are consistent with the evidence and the advisory does not pretend
to settle between them: either the earlier fix addressed a different upload path and
CrystalRpt.aspx was never covered, making this an independent unauthenticated
variant, or the fix did not close the unauthenticated route into the same code,
making this an incomplete-fix variant. Without a byte-level diff between 9.2.2 and
9.2.3, overlap cannot be excluded to certainty, and the advisory says so rather than
claiming more novelty than the evidence carries.

Verification boundary, stated plainly. Everything dynamic was produced by deploying
the shipped WaCrpt application - CrystalRpt.aspx (2381 bytes), Web.config and
bin\WaCrpt.dll, the shipped files as documented in the research record, used without
modification - into a real IIS site and driving it over HTTP on loopback. The whole
request path is genuine: IIS request handling, the Web Forms pipeline, event
dispatch into fileSubmit_Click, Server.MapPath normalisation, FileUpload.SaveAs, the
build manager compiling a freshly written page and process creation in w3wp.exe.

A complete default installation of WebAccess Node 9.2.3 was NOT achieved: the 1.9 GB
self-extracting installer hung in Session 0 and never produced a stock,
vendor-configured deployment, so the test was surgical rather than end-to-end. Three
consequences are carried explicitly. First, the site configuration was authored in
the lab rather than read from the installer and the application was served at the
site root over loopback, so the /broadweb/WaCrpt/ prefix is derived from a literal
inside the decompiled Page_Load - the Response.Redirect to
/broadweb/user/signinonly.asp - plus the application's placement in the
distribution, and is strong inference rather than an observed request against a stock
install. Second, the SYSTEM identity was the lab pool's; the shipped site binding,
shipped pool identity and interaction with the rest of the product were never
observed at runtime. Third, the record documents the installer and its size and an
unpacked deployment archive holding those files and asserts they are the real
product's, but does not log the extraction step, so no end-to-end provenance chain is
claimed - what is asserted is that nothing in them was altered for the test. Three
accommodations modified the hosting environment, not the vulnerable code:
CrystalDecisions assembly redirects to match the lab host's GAC, a log4net copy from
the legacy GAC_32 location, and the LocalSystem pool identity.

Also not exercised: no interaction with the rest of the product; no network-path
test, every request having traversed loopback from one Windows host with no
firewall, reverse proxy, WAF or TLS terminator in between; no GET-only variant of
request 1; no overwrite test, no non-page payload and no persistence test; no
privilege enumeration under a restricted pool.

What is nevertheless established at strength: two independent client implementations
with two independently written payloads of different sizes (510 and 450 bytes) and
different leaf names produced the same result, corroborated from the target
filesystem and the IIS W3C log rather than from client responses alone - the written
page sat in the application root at exactly 510 bytes, byte-identical to what was
transmitted, with an on-disk timestamp matching the logged POST, and the log shows
the two POSTs returning 200 then 500 immediately followed by a 200 for the uploaded
file. An attacker-chosen marker was echoed and a second, unrelated binary invoked on
the same command line. An independent adversarial review attacked the chain from
seven angles and did not refute it; only the execution-identity angle returned
partially confirmed. A separate re-analysis pass over the same decompiled sources
independently returned CONFIRMED.

Also recorded in the advisory, from the same exhaustion pass over the web tier: a
genuine SQL injection in the unauthenticated /Login operation of the product's WCF
mobile service, which does NOT escalate to code execution because that path's
backend is a Microsoft Access .mdb offering no xp_cmdshell or comparable
OLE-automation primitive, and the SQL Server SQLEXPRESS instance elsewhere in the
product is not reached from it.

Affected-version statement: 9.2.3 is the only release whose binaries were decompiled
and exercised; other versions were not enumerated and no cross-version byte
comparison was performed. Validate your own build.

Remediation is set out in the advisory in priority order and reduces to: validate
the extension before SaveAs using the allowlist the sibling handler already has,
factored into one shared helper so the two upload points cannot drift apart again;
validate before writing rather than after; put a real authorization decision in
Page_Load that covers the postback path and terminates the request instead of
redirecting; deny anonymous users in WaCrpt's Web.config; confine the derived
directory with a containment test against the canonical report root, since
Server.MapPath bounding the result at the application root is not confinement; stop
writing uploads into a script-executing directory; and run the pool under a
least-privilege account without write access to the application root or bin\.

Full technical analysis and a reproducible proof-of-concept:
  https://0day-rubbish.com/blog/advantech-webaccess-crystalrpt-unauth-file-upload-rce

Project archive (ongoing disclosure series):
  https://github.com/Exploit-Garbage/0day-Rubbish

The vendor has been notified through the security contact published in its own
security.txt. No vulnerability identifier has been assigned to this finding yet.

--
0day Rubbish Research Team
disclosure () 0day-rubbish com
https://0day-rubbish.com
_______________________________________________
Sent through the Full Disclosure mailing list
https://nmap.org/mailman/listinfo/fulldisclosure
Web Archives & RSS: https://seclists.org/fulldisclosure/
```
