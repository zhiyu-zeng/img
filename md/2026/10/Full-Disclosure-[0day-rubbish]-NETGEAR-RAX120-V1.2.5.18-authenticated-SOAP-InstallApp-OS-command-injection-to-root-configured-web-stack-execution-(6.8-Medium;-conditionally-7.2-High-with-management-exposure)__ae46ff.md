---
title: "Full Disclosure: [0day-rubbish] NETGEAR RAX120 V1.2.5.18 authenticated SOAP InstallApp OS command injection to root-configured web-stack execution (6.8 Medium; conditionally 7.2 High with management exposure)"
source: https://seclists.org/fulldisclosure/2026/Oct/57
source_host: seclists.org
clip_date: 2026-10-31T03:29:02+08:00
trace_id: a4182195-e48d-4f4e-b0f6-72c3da39f59a
content_hash: 14e9996127cb278c679721d347118a6888a2ed6c69f8529409d62fc6896a4609
status: synced
tags:
  - 漏洞分析
  - 命令注入
series: null
feed_source: Full Disclosure·漏洞披露
ai_summary: NETGEAR RAX120 SOAP InstallApp 的参数黑名单漏掉 `$` 与括号，认证管理员可用 `x$(cmd)` 完成命令注入，以 root 配置的 web 栈身份执行，R7800 同源受影响。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40975244-d011-8183-801b-c03b8f5a91a9
ioc:
  cves: []
  cwes:
    - CWE-20
    - CWE-306
    - CWE-426
    - CWE-78
    - CWE-862
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> NETGEAR RAX120 SOAP InstallApp 的参数黑名单漏掉 `$` 与括号，认证管理员可用 `x$(cmd)` 完成命令注入，以 root 配置的 web 栈身份执行，R7800 同源受影响。
> 
> - **根因：** 校验器（apname 模式）仅拒绝 @、反引号、分号、单双引号、反斜杠六个字符，未拦 `$` 和圆括号这一命令替换语法全集；应用名未加引号拼入 system()/popen() 的 rm/mkdir/tar 命令，经 `/bin/sh -c` 二次解析，注入命令在 rm 报错与否均会触发。
> - **执行身份与波及面：** 固件自带 lighttpd 配置显示 web 栈以 root 运行，sink 级复现三个向量均产出 uid=0 标记；同一根因确认存在于 R7800 V1.0.2.68（32 位 ARM，校验器仅拒引号与反斜杠，更宽松）。
> - **认证定位：** 需绑定 MAC 的合法管理员 SOAP 会话，fail-closed，非未认证或默认口令问题；全镜像约 150+ system() 与约 54 个 popen() 点中，仅此一个 handler 将攻击者可控 SOAP 参数拼入 shell 命令行。
> - **验证边界与评分：** 全程未触碰真机，结论基于反汇编与云端沙箱复现（含良性对照组）；发布 CVSS 6.8（AV:A/PR:H），管理面外露时条件性 7.2 High，并公开纠正内部记录中误用的 8.8。
> - **修复建议：** 改用 `[A-Za-z0-9][A-Za-z0-9._-]*` 白名单；以 unlink()/mkdir()/execve 参数数组替代 shell 拼接；web 栈降权为非 root；建立构建规则，任何 system()/popen() 插值请求数据即阻断发布。

## Full Disclosure mailing list archives

## \[0day-rubbish\] NETGEAR RAX120 V1.2.5.18 authenticated SOAP InstallApp OS command injection to root-configured web-stack execution (6.8 Medium; conditionally 7.2 High with management exposure)

* * *

*From*: disclosure via Fulldisclosure <fulldisclosure () seclists org>  
*Date*: Tue, 27 Oct 2026 16:39:59 +0000  

* * *

```sql
0day Rubbish Research Team is publicly disclosing a vulnerability in NETGEAR
RAX120 (Nighthawk AX12) firmware V1.2.5.18, the WiFi 6 consumer router from
NETGEAR (United States), built on the Qualcomm IPQ8074 platform. The
administrative web plane of this firmware generation is a lighttpd server
fronting the vendor's DNI-framework CGI handler /usr/sbin/net-cgi (an
aarch64, musl, stripped image; the handler binary measures 1,042,120 bytes
and its recorded image digest begins d7035dd3), and the SOAP control plane
dispatches every action through /soap/server_XMLresp.cgi. Among those
actions is the app-installation control InstallApp of the service
urn:NETGEAR-ROUTER:service:AppSystem:1, which requires the router
administrator's session.

Type and root cause. OS command injection (CWE-78 primary, with CWE-20
co-equal for the blocklist-style improper input validation, and CWE-426
recorded as contributing without raising any metric). The operation takes a
NewAppName argument and passes it through a blocklist validator whose
"apname" mode (the routine at fcn.000407d8 in the stripped image, mode
string at 0xc3058) rejects six characters chosen with shell injection in
mind: the at-sign, the backtick, the semicolon, the double quote, the
single quote and the backslash. That set covers the classic
statement-separator and quote-context breakouts. It does not reject the
dollar sign or either parenthesis, which are the entire grammar of command
substitution. The handler then embeds the validated name, unquoted, into two
working paths (/tmp/<name>_tmp and /sw-apps/<name>, both built by direct
snprintf interpolation) and then into three shell command lines:

    system("rm -rf /sw-apps/<name>/version.txt > /dev/console")
    system("rm -rf /sw-apps/<name> > /dev/console")
    popen("rm -rf /tmp/<name>_tmp; mkdir /tmp/<name>_tmp;
          tar -zxf /tmp/<tarball> -C /tmp/<name>_tmp", "r")

Each sink executes through /bin/sh -c, so a second parse happens inside a
shell the validator never modeled. A name of the shape x$(cmd) substitutes
attacker-chosen command text before the rm words ever run, and the shell's
parser walks the whole command line with a substitution pass before
executing any word of it, so the injected command fires whether or not the
surrounding rm errors out. An intermediate string processor in the handler
walk (recorded at fcn.00079060) rewrites carriage returns and line feeds to
spaces and performs no other transformation, so no downstream mitigation
exists: the dollar sign, pipe, ampersand and every other metacharacter pass
untouched. Two gates sit ahead of the validator, a 255-character length cap
on the name and a value gate on the companion NewUpdate element, and both
are compatible with the payload, which is under 30 characters.

Execution identity. system() and popen() children inherit the identity of
the web stack that calls them, and the research record identifies, from the
firmware image's own lighttpd configuration, the server's configured
runtime user as root, so command text supplied through this handler
inherits device-root authority by product configuration. The dynamic
verification measured exactly that identity in a sink-level replication:
markers carrying uid=0(root) gid=0(root) groups=0(root) from all three
vectors, and none from a benign control name.

Authentication, credited plainly. This is not an unauthenticated finding
and no unauthenticated variant of it is claimed. The gate is identified from
the artifacts as the administrative SOAP login bound to the requesting
station's MAC address, failing closed; the chain consumes a legitimate
administrator session and neither bypasses nor forges it. It is also not a
default-credential finding: the same request succeeds whatever the
administrator password is. No second web-account tier with reach into this
service exists in any artifact examined, which is what fixes Privileges
Required at High. The product gets the gate right and the argument
construction wrong; this is a CWE-78/CWE-20 defect, not CWE-306 and not
CWE-862.

Why this handler and not a hundred others. The DNI framework also contains
an exec helper (recorded at fcn.000779f0) that runs commands through
vfork() plus execve() with an argument vector, architecturally immune to
shell injection, and large parts of the firmware use it. A census of the
shell-mediated remainder classified on the order of 150+ system() sites,
almost all of them fixed string constants loaded by address arithmetic with
no substitution, and about 54 popen() sites. The app-installation handler
is the single family in the analysed image that interpolates an
attacker-controlled SOAP argument into a shell command line, so the defect
is one handler rather than a platform-wide sloppy pattern.

The sibling platform. The same root cause was confirmed on the NETGEAR
R7800 (Nighthawk X4S), firmware V1.0.2.68: a different SoC generation
(Broadcom BCM4709), a different instruction set (32-bit ARM), a different
handler binary (recorded digest beginning c5a9f2b3) and a different
validator function whose reject set is only the double quote, the single
quote and the backslash, which is strictly more permissive than the main
model's six. The identical x$(cmd) payload passed that validator and
executed through the same handler family in that platform's own sink-level
replication, with three root markers of its own and a clean control. The
merge is argued at the level of root cause, not build identity, and the
platform differences are stated rather than smoothed over. Other models
shipping this framework's app-system code were not audited, and the vendor's
older R6700/R7000/R8000 generation runs a different self-built httpd lineage
that does not contain this handler, so no claim is made about it.

Verification boundary, stated in full, because it defines what is and is not
being claimed. No physical router was driven during verification and no
live SOAP request was fired at device hardware, at any point, in any phase
of this work. The request path, the session gate and the parameter
extraction are established at disassembly level from the shipped image. The
injection behaviour at the sink is established by a sink-level replication:
on an isolated cloud-hosted sandbox, a natively compiled C program
re-implemented the disassembled validator logic, the CRLF-normalising string
processor and all three command constructions, run with the root privilege
model the image's lighttpd configuration records for the web stack. Three
vectors, one per sink, each carrying x$(id>/tmp/<marker>) through the
replicated validator and construction, each produced a marker containing
uid=0(root) gid=0(root) groups=0(root); a benign control name traversing
the identical code path produced none. The control is the load-bearing
negative: it makes the marker creation attributable to the substitution
content alone, not to the surrounding construction or the harness. Not
performed and not claimed: any end-to-end HTTP round trip against device
hardware, any cross-station or cross-network detonation, any persistence
mechanism, any radio-firmware or hardware-adjacent effect, and any memory
corruption. There is none in the chain, which is metacharacter-class gap
and nothing else. The landing-identity mapping rests on the image's own
configuration artifact read as text, not on a live-device observation.

Scoring. One score is published: 6.8 Medium,
CVSS:3.1/AV:A/AC:L/PR:H/UI:N/S:U/C:H/I:H/A:H. The arithmetic is printed so
any reader can reproduce it under the CVSS 3.1 base algorithm and its
round-up-to-the-tenth rule: ISS = 1 - (0.44 x 0.44 x 0.44) = 0.914816;
Impact for Scope Unchanged = 6.42 x 0.914816 = 5.873119; Exploitability =
8.22 x 0.62 (adjacent) x 0.77 x 0.27 x 0.85 = 0.900610; sum = 6.773729;
Roundup = 6.8. Attack Vector is Adjacent because the SOAP control plane
belongs to the router's local administrative service and no shipped
artifact examined establishes that the action answers on the wide-area side
of an unmodified deployment; the reading is argued from the product's
transport and the recovered session model, not demonstrated between two
hosts.

Two alternative readings are published, each labelled. A conditional
reading at 7.2 High (CVSS:3.1/AV:N/AC:L/PR:H/UI:N/S:U/C:H/I:H/A:H, from
Exploitability 1.234708 and sum 7.107827) applies where the management
plane is deliberately exposed beyond the adjacent network, by enabled
remote administration, by a port forward directed at the SOAP responder, or
by a management relay; it is conditional on a deployment choice this
research did not measure, and it is not the headline. Two further readings
are published as rejected with their arithmetic: a hypothetical
lower-privilege web tier at PR:L computes to 8.8 with AV:N (Exploitability
2.835255, sum 8.708374) and to 8.0 with AV:A, and both are rejected because
the app-installation control plane is administrator-only on this firmware
and no artifact documents a secondary account class with web access to this
service, so no principal exists to justify Low privileges.

One correction to the researchers' own record is published rather than
quietly made. The internal research ledger behind this advisory carried 8.8
for this chain. Recomputation rejects it: 8.8 is the arithmetic of the same
impact profile read at Low privilege, and the documented chain requires the
device administrator, so no vector supported by this evidence computes to
the recorded figure. The published score is 6.8, computed from the vector,
with the discrepancy recorded in the advisory rather than silently
overwritten, because a number that was quietly changed is a number nobody
downstream can audit. Correcting it lowered the published figure.

Impact. Command execution as the root-configured web stack, from a position
of an administrator credential the holder was never meant to convert into an
operating-system shell. Concretely: the complete configuration store
including credentials retained by the firmware; creation or modification of
accounts, startup scripts and scheduled tasks within the writable
filesystem; reconfiguration of interfaces, routes and the DNS resolver the
LAN depends on; redirection or observation of LAN traffic according to the
platform's own capabilities, turning the network's chokepoint device into an
interior attack position; and degradation of service at will, including
through the very rm -rf constructions this chain lives in. The chain is
silent in product terms: one authenticated POST inside a legitimate
management action, with no log-relevant traffic pattern beyond ordinary
app-management use. Persistence was not tested and is not claimed; what
survives a factory reset or reflash was not tested and is not claimed.

Mitigation summary: replace the blocklist with an allowlist for the
application name, [A-Za-z0-9][A-Za-z0-9._-]* with the existing length cap;
stop interpolating the name into shell command lines at all, implementing
cleanup, directory creation and extraction with unlink(), mkdir() and
argument-array execve()-family calls or the framework's own exec helper,
which closes the class for every caller pattern rather than enumerating
today's metacharacters; if a shell-based implementation must survive one
release cycle, single-quote every interpolated value with literal
single-quote escaping and assert post-construction that the compiled
command contains no dollar sign, failing the request otherwise; drop
web-stack privileges so lighttpd and its CGI handlers run as a dedicated
non-root identity; patch the sibling model in the same pass, its validator
being strictly more permissive, with one cross-model regression test
submitting $(true) as an application name and asserting no shell-out; adopt
a build rule failing the release on any system() or popen() site that
interpolates request data, rather than another manual audit of on the order
of 54 popen() sites in one binary; and for operators until a patch ships,
keep the management plane local, disable remote administration and unused
app-installation surfaces, and treat a suspicious app-install request in
device logs as an arbitrary-code-execution indicator.

The published proof of concept is Python 3 using only the standard library.
It is a single-request client: target address, port, administrator password
and command are explicit arguments, a pre-flight check refuses any command
containing the six characters the validator rejects so that a mistyped
payload fails loudly on the operator's own machine, one request is performed
and the raw response printed, and the default command is a non-destructive
identity capture under /tmp on the target. It does not guess or collect
credentials, installs no persistence and opens no interactive channel, and
it keeps to the intended lab use of an operator's own equipment. An operator
should treat the first live run as the first real exercise of the request
leg, for the reason stated in the verification boundary: the research's own
verification never drove that leg at all.

Full technical analysis and the reproducible proof of concept, published
unconditionally:
  https://0day-rubbish.com/blog/soap-installapp-apname-command-injection-root-rce

PoC location in the public repository:
product/netgear/rax120-v1.2.5.18/soap-installapp-apname-command-injection-root-rce/exploit/netgear_installapp_apname_command_injection_poc.py

Project archive (ongoing disclosure series):
  https://github.com/Exploit-Garbage/0day-Rubbish

The vendor was notified through the mailbox published in the vendor's own RFC
9116 security.txt, whose policy pointer is the vendor's product security
page, which directs researchers to report findings to its Product Security
team at that address; that is the only channel used and no individual was
addressed by name. The vendor's page offers bug bounty awards for valid and
eligible reports; no bounty was claimed, the notification being unconditional
and the research already public. The vendor's mail gateway accepted delivery
probes for the published mailbox and for a same-domain control address that
cannot exist, identically, so the probe discriminates nothing from the
research team's position and is treated as evidence about neither delivery
nor non-delivery. This disclosure is unconditional: the research is already
public, no permission was asked for, no embargo was requested, and nothing
is withheld pending a reply. No vulnerability identifier has been assigned
to this finding yet.

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

-   **\[0day-rubbish\] NETGEAR RAX120 V1.2.5.18 authenticated SOAP InstallApp OS command injection to root-configured web-stack execution (6.8 Medium; conditionally 7.2 High with management exposure)** *disclosure via Fulldisclosure (Oct 28)*
