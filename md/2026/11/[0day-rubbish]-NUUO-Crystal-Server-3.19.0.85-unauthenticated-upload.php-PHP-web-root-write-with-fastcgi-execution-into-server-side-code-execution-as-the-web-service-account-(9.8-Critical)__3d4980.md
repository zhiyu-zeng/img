---
title: "[0day-rubbish] NUUO Crystal Server 3.19.0.85 unauthenticated upload.php PHP web-root write with fastcgi execution into server-side code execution as the web service account (9.8 Critical)"
source: https://seclists.org/fulldisclosure/2026/Oct/56
source_host: seclists.org
clip_date: 2026-11-02T14:44:26+08:00
trace_id: 9ff32be1-899f-4786-836a-b7a23a9b32cc
content_hash: d1943e488b970c8c8719fb2c711d6572f10c9c449c495555de7516b4566dccac
status: synced
tags:
  - 漏洞分析
  - 漏洞利用
series: null
feed_source: Full Disclosure·漏洞披露
ai_summary: NUUO Crystal Server 3.19.0.85 的 upload.php 无需认证即可向 Web 根目录任意写文件并经 fastcgi 执行 PHP，两个请求、零凭据实现 RCE，CVSS 9.8 危急。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40c75244-d011-810c-a974-fc15280ea38d
ioc:
  cves: []
  cwes:
    - CWE-306
    - CWE-434
    - CWE-73
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> NUUO Crystal Server 3.19.0.85 的 upload.php 无需认证即可向 Web 根目录任意写文件并经 fastcgi 执行 PHP，两个请求、零凭据实现 RCE，CVSS 9.8 危急。
> 
> - **漏洞根因：** upload.php 仅三行，直接用客户端提供的 multipart filename 作为 copy() 目标写入 Web 根 /NU20/web/；无会话校验、无类型过滤、无路径限制，三缺陷叠加对应 CWE-306/434/73。
> - **架构缺陷：** lighttpd 配置未加载任何认证模块，认证由每个 PHP 文件各自 include 实现——任何“忘记”加会话校验的 handler 天生匿名可访问。
> - **验证方式：** 从 OVA 磁盘镜像 squashfs 提取 Web 根（575 个文件）与配置，在隔离主机复刻环境完成三次动态验证，含无上传阴性对照与绝对路径写入变体；仅声明 web 服务账户身份，未测得 root，拒绝 10.0 的 scope-changed 读法，分段网络部署下为条件性 8.8。
> - **影响与检测：** 代码执行叠加可跨重启存留的任意文件写，全程走产品自身合法路径与正常状态码，几乎无异常日志；防御主要靠 Web 根文件完整性监控。
> - **修复建议：** 删除 upload.php 或加认证门、服务端生成存储文件名、上传隔离到非可执行目录、认证上移到服务器层并 grep 审计其余 handler；补丁前运维应网段隔离管理面。

## Full Disclosure mailing list archives

## \[0day-rubbish\] NUUO Crystal Server 3.19.0.85 unauthenticated upload.php PHP web-root write with fastcgi execution into server-side code execution as the web service account (9.8 Critical)

* * *

*From*: disclosure via Fulldisclosure <fulldisclosure () seclists org>  
*Date*: Tue, 27 Oct 2026 16:39:30 +0000  

* * *

```sql
0day Rubbish Research Team is publicly disclosing a vulnerability in NUUO
Crystal Server 3.19.0.85, the video management and NVR server software from
NUUO Inc. of Taipei (Taiwan), distributed as the Crystal virtual-machine
appliance: an Ubuntu-based OVA whose web tier is a lighttpd server fronting
a PHP application, with .php requests dispatched to /usr/bin/php-cgi through
lighttpd's fastcgi mapping. The product sits in the management plane of
physical-security and critical-infrastructure video deployments, brokering
camera registration, recorder channels and the stored management credentials
of the surveillance estate.

Type and root cause. Inside the web root recovered from the appliance disk
image, upload.php is three lines long, and the brevity is the finding: it
echoes the client-supplied filename and calls copy() with a destination
taken from that same client-supplied filename. There is no session include,
no login check, no extension filter, no MIME check, no path restriction and
no storage directory of the product's own choosing. The web server
configuration recovered from the same disk image loads no authentication
module at all, because this product's architecture delegates authentication
to each PHP file individually, and upload.php is one of the files that
never asks. Three omissions stack into one chain, each independently
sufficient to make the write dangerous: missing authentication for a
critical function (CWE-306 primary), an upload accepted without type
restriction into an executable mapping (CWE-434 co-equal), and external
control of the destination file name or path (CWE-73 contributing).

The chain. An anonymous client on any network that can reach the management
interface posts a multipart body carrying a PHP payload whose disposition
filename is the destination of the write. copy() writes the file under the
attacker-chosen name into the served document root /NU20/web/, the HTTPS
listener of the recovered configuration binding :443 across addresses with
no restriction. One fetch of the written path then hands the file to the
product's own fastcgi mapping, and the chosen PHP executes in the product's
web service context. Two requests, no credential at any point, no memory
corruption, no deserialisation gadget, no default credential and no action
by any user of the product. The write and the execution are decoupled in
time, which makes the write primitive independently useful: served pages
can be replaced, configuration and application files inside the web root
can be overwritten, and a persistent implant can be dropped into a location
the product itself serves, surviving a service restart as an ordinary file
in the served tree until an operator finds it.

Everything in the chain is a shipped default, established from artifacts
rather than from lab state: the endpoint exists in the shipped web root
(squashfs extraction, byte-exact), the endpoint requires no authentication
(absent include plus absent server-layer gate, both artifacts), the
destination is client-controlled (the copy() second argument is the
multipart filename, from the endpoint source), the destination directory
is served and executable (document root and fastcgi mapping, both from the
recovered configuration), and the listener accepts connections from any
address.

The authentication model, named for what it is. The recovered lighttpd
configuration declares its module list explicitly and loads no
authentication module; a content search of the recovered configuration for
an authentication backend, an authentication module, a valid-user
requirement and an access-denial rule returns zero hits for all four
patterns. The gate, where it exists at all, is one include statement inside
each PHP file, so the product's authentication boundary is exactly as
strong as its most forgettable file, and upload.php is that file. The
boundary claim is deliberately conservative: this handler is established
as unauthenticated by the byte-exact source plus the absent server-layer
gate, and no claim is made about other handlers in the web root, which are
named in the advisory as an audit recommendation, not as findings.

Verification boundary, stated in full, because it defines what is and is not
being claimed. No physical Crystal VM was reachable during this study, so
the verification could not be a live drive against the product's own
listener. The static half is anchored in the appliance disk image: the
OVA's VMDK was converted to a raw image, the PHP web root was carved out of
its squashfs region (653 inodes, 575 files, including the byte-exact three-
line upload.php), and the server configuration was recovered from the same
disk and read in full. The dynamic half ran on a faithful replica: the
appliance's own extracted web root, all recovered files including the real
upload.php, served with the document-root behaviour and the
unauthenticated-execution semantics of the appliance's own extracted
configuration, on the loopback interface of an isolated research host.
Three independent runs uploaded the probe file without any credential,
confirmed the landing in the document root, and returned an execution
marker together with command output on one fetch; a no-upload negative
control produced no marker (and a fetch of never-uploaded names returned
404 with nothing); and an absolute-destination variant, writing to an
absolute path inside the served root, landed and executed identically, so
the write does not depend on a working-directory coincidence. The exact
working-directory resolution of a relative destination on a shipped
appliance is the one piece this work could not observe on physical hardware,
which is why the absolute-destination result exists and why the chain does
not rest on it.

On the executing identity, because it matters for what downstream readers
should and should not claim. The command output in the replica runs
identified the invoking account of the replica's PHP server process. That
measurement is a property of the replica environment and is reported as
such: it demonstrates that executed code inherits the identity of the PHP
service. The corresponding identity on a shipped appliance, the lighttpd
/ php-cgi service account of the VM, was not observed at runtime in this
work, and no superuser claim appears anywhere in the advisory. The
execution primitive, the score and the impact statements are written to be
true whichever account that turns out to be; a reader who sees a 9.8 vector
and starts writing "root on the appliance" is jumping past the published
evidence, and this disclosure says so plainly rather than benefiting from
the inflation.

Scoring. One score is published: 9.8 Critical,
CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H, re-derived rather than
inherited. The arithmetic is printed so any reader can reproduce it under
the CVSS 3.1 base algorithm and its round-up-to-the-tenth rule: ISS =
1 - (0.44 x 0.44 x 0.44) = 0.914816; Impact for Scope Unchanged = 6.42 x
0.914816 = 5.869119; Exploitability = 8.22 x 0.85 x 0.77 x 0.85 x 0.85 =
3.887043; the unrounded base is 9.756162 and Roundup gives 9.8. A
scope-changed reading that would compute to 10.0 is published as rejected:
no violation of an authority beyond the web service itself was
demonstrated, the uploaded file executing in the product's own PHP process
context, and whether that process's account additionally holds host
privileges is an unmeasured deployment property the advisory declines to
claim. A conditional reading at 8.8 High (from Exploitability 2.835255 and
sum 8.704374) applies to deployments that confine the appliance to a
segmented management network; the shipped recovered configuration
establishes no such confinement, so the published score uses the measured
network bind and the conditional is labelled, not measured.

Impact. Server-side code execution on the video management server through
the product's own fastcgi mapping, with no payload delivery beyond plain
HTTP or HTTPS and no credential at any point, plus an anonymous arbitrary
file write into the served tree that persists across service restarts.
What the web service account reaches is exposed to attacker-chosen code:
the application's own state, recorded media indices, camera trees, applied
configuration, and whatever the service account can read on the appliance
filesystem, with arbitrary modification of served content and complete
control of service availability. Detection is hard by construction: both the
write and the execution use the product's handled paths and ordinary
status codes, leaving file-integrity monitoring of the web root and
configuration-change review as the defenders' strongest signals. Two
consequence classes are plausible and explicitly not claimed, because they
were not measured: takeover of downstream cameras and recorders through
stored management credentials, and lateral movement through the camera
network. The amplifying architecture weakness is reported alongside the
finding and not folded into the score: authentication implemented
file-by-file means every PHP handler that forgets the session include is
unauthenticated by design, and upload.php is the one measured here.

Mitigation summary: remove upload.php or place its function behind the
product's authenticated session gate, which severs the chain at request
one; never build a storage destination from request data, generating the
stored name server-side from an allow-listed extension set and
canonicalising the resolved destination against an intended storage root;
store uploads outside the served tree in a non-executable quarantine
directory with randomized names; move authentication from the file level to
the server or framework level so one forgotten include cannot reopen an
anonymous handler, and while that migration is pending mechanically audit
every handler in the web root for the missing-include pattern, which in
this product is a grep-sized task; add a shipped-image manifest of the
document root reconciled at boot or on a schedule, a day-scale engineering
effort for an appliance that detects this class of implant; and add
regression tests expressing the three omissions as assertions: an
unauthenticated upload with a .php destination rejected, a session-less
write to any handler rejected, and the stored destination differing from
the client-supplied name. For operators until a patch ships: restrict
management reachability to a segmented network, run file-integrity
monitoring on the document root, and treat unexpected served-content
changes as a standing signal.

The published proof of concept is Python 3 using only the standard library.
It performs one credential-less multipart POST carrying the probe file with
a chosen destination name and one fetch of that name, printing the
response; the success criterion is an execution marker in the fetched body,
so a servable-but-not-executing write cannot false-positive. A control mode
performs no upload and asserts nothing executes, mirroring the negative
control used during verification. The command the probe runs is supplied by
the operator and the published default is a non-destructive identity query.
No reverse shell, no callback channel, no persistence installer and no
destructive command is provided or was run.

Full technical analysis and the reproducible proof of concept, published
unconditionally:
  https://0day-rubbish.com/blog/nuuo-crystal-server-unauth-upload-php-webroot-write-rce

PoC location in the public repository:
product/nuuo/crystal-server-3.19.0.85/unauth-upload-php-webroot-write-rce/exploit/nuuo_crystal_server_unauth_upload_php_webroot_write_rce.py

Project archive (ongoing disclosure series):
  https://github.com/Exploit-Garbage/0day-Rubbish

The vendor publishes no RFC 9116 security.txt: the well-known path returns
the site's own 404 on the www host and on the apex, as does the
non-well-known fallback path, and the vendor's own page index contains no
security, vulnerability-reporting or responsible-disclosure page. The only
mailbox the vendor publishes on its site is its general-contact address, and
that mailbox is the channel used; it was verified live before use, the
vendor's mail gateway accepting repeated delivery probes for it while
refusing an unpublished security-named variant and a nonexistent control
address in the same session, and that contrast is what was recorded rather
than an assumption. No individual was addressed by name. The vendor's web
request form for technical support was deliberately not submitted: this
research publishes under a team name with no individual attached, and the
form class requires a submitter's personal name, so submitting it would mean
fabricating a personal identity; the form was additionally unreadable to a
plain fetch behind an interactive browser challenge, which is recorded as
unread rather than guessed at. This disclosure is unconditional: the research
is already public, no permission was asked for, no embargo was requested,
and nothing is withheld pending a reply. No vulnerability identifier has
been assigned to this finding yet.

--
0day Rubbish Research Team
disclosure () 0day-rubbish com
https://0day-rubbish.com
_______________________________________________
Sent through the Full Disclosure mailing list
https://nmap.org/mailman/listinfo/fulldisclosure
Web Archives & RSS: https://seclists.org/fulldisclosure/

```

* * *

### Current thread:

-   **\[0day-rubbish\] NUUO Crystal Server 3.19.0.85 unauthenticated upload.php PHP web-root write with fastcgi execution into server-side code execution as the web service account (9.8 Critical)** *disclosure via Fulldisclosure (Oct 28)*
