---
title: "Full Disclosure: [0day-rubbish] Circutor LineEds 24.11.14-r0 unauthenticated pwrstudio events.xml shellExecute command injection (9.8)"
source: https://seclists.org/fulldisclosure/2026/Oct/4
source_host: seclists.org
clip_date: 2026-10-07T02:05:30+08:00
trace_id: 252577d0-8add-4452-acaa-a449a7260f2f
content_hash: 78a8da970f1b4f399e4105d9f730d81f1af9d1754bfbb12415bda9caf91db11f
status: synced
tags:
  - 漏洞分析
  - 协议分析
series: null
feed_source: Full Disclosure·漏洞披露
ai_summary: "TL;DR: Circutor LineEds 网关 pwrstudio 守护进程的 events.xml 未授权写入叠加 restart 重载，两条 HTTP 请求即可经 shellExecute 触发 9.8 分系统命令注入。"
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3f175244-d011-8144-9524-d21a71fe3af5
ioc:
  cves: []
  cwes:
    - CWE-20
    - CWE-250
    - CWE-269
    - CWE-285
    - CWE-306
    - CWE-78
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> TL;DR: Circutor LineEds 网关 pwrstudio 守护进程的 events.xml 未授权写入叠加 restart 重载，两条 HTTP 请求即可经 shellExecute 触发 9.8 分系统命令注入。
> 
> - **根因与利用：** command 与 parameter 经宽串格式 "%ls %ls" 拼接后直接交给 system()，全程无引号、过滤或白名单，参数只需语句分隔符；先写 events.xml 植入恒真条件事件（参数形如 `x ;id >/tmp/…#`），再请求 restart.xml 触发 LoadXml 与 Execute，中间态是产品自身持久化的文件，两步可任意间隔，无竞态与内存布局依赖。
> - **未授权依据：** 权限门 FUN_001a93cc 的 197 个调用点全部落在 0x1aexxx–0x1bfxxx，本链的 restart 处理器 0x1e3554 与 events 写入处理器 0x23ace0 均在其外，属结构性不受门控；restart 仅校验请求上下文两个指针非空。该门另有两条 fail-open 分支（权限常量非 0x15 即放行、开关关闭即放行）。
> - **评分取舍：** 主评 9.8（PR:N 依据由无据的出厂默认改为 handler 调用普查与两处反编译）；条件评分 8.8（需任一有效凭据时）；10.0（S:C）与 8.1（AC:H）两读法公开但不采纳。
> - **验证边界：** 仅用 qemu-arm-static 用户态加 gdb 直接调用真实 sink，并在 vtable 槽 2 植入 0x37510 的 bx lr 使 Execute 可达，返回 1 并写出 39 字节 root 属主标记，对照的良性参数无输出；HTTP 端到端请求与物理设备均未使用，条件求值器与权限门均未执行。
> - **修复：** 以 execve/posix_spawn 加显式参数向量取代 system()，写入时做 schema 校验，权限门对未知常量 fail closed，把授权移入 dispatcher 的按路由权限表，并让守护进程以最小权限运行。

## Full Disclosure mailing list archives

## \[0day-rubbish\] Circutor LineEds 24.11.14-r0 unauthenticated pwrstudio events.xml shellExecute command injection (9.8)

* * *

*From*: disclosure via Fulldisclosure <fulldisclosure () seclists org>  
*Date*: Mon, 5 Oct 2026 17:52:58 +0000  

* * *

```sql
0day Rubbish Research Team is publicly disclosing a vulnerability in the pwrstudio
daemon shipped in Circutor LineEds (Line Energy Data System) industrial energy gateway
firmware 24.11.14-r0, engine variant pss0. Circutor S.A. is in Spain; the appliance sits
between metering and power-quality instrumentation on one side and an energy-management
or SCADA back office on the other.

Type: operating-system command injection (CWE-78) reached without authentication
(CWE-306). Those two are the classes recorded in the research; the advisory's own
classification additionally maps CWE-285, because the permission gate fails open in two
independent ways, and CWE-20, because the events document is accepted with no schema
validation, as contributing weaknesses, with CWE-250/CWE-269 recorded as bearing on
remediation priority rather than on the defect.

Root cause: the daemon's event engine loads its configuration from events.xml, exposed at
/services/user/events.xml over the management HTTP interface. An event may carry a
shellExecute action whose command and parameter elements are concatenated by
XCEventActionShellExecute::Execute (FUN_00548414) with the wide-string format "%ls %ls"
stored at 0x7cc2d0, converted from wide to narrow, and passed to system() at call site
0x5484bc. Nothing between the socket and the sink neutralises shell metacharacters: no
quoting, no filtering, no allowlist. The format string is the whole reason the injection
works the way it does - two %ls conversions separated by a single space mean the sink
performs concatenation rather than argument separation, so command and parameter become one
shell word sequence with no quoting boundary between them; a payload needs only a statement
separator, not a quote escape. The defect is at that concatenation rather than in the XML
parser, which performs a pure element-to-field copy and is behaving correctly.

Exploitation is two HTTP requests with no delivery precondition of any kind. Step one
writes an event definition into /services/user/events.xml carrying an always-true
condition so it enters the live set on every evaluation pass, a deliberately invalid
command token so the first shell statement fails harmlessly, and a parameter of the form
semicolon, command, semicolon, hash - yielding a shell line such as
"x ;id >/tmp/circutor_eds_vuln_rce_marker;#". Step two requests the restart.xml route,
which makes the engine reload the document through XCEventDriver::LoadXml (FUN_0020acac),
build the action object, evaluate the condition and dispatch Execute. There is no race, no
memory-layout dependency, no file to pre-place on the target and no dependence on another
vulnerability, and because the intermediate state is a file the product itself persists,
the two steps can be separated in time arbitrarily. The binary is compiled with
CONFIG_NO_HASP, so no licence-dongle gate stands between a written event and the shell
action. The image is a non-PIE EXEC, so every offset quoted is a fixed file-and-memory
address reproducible against the same build with no relocation arithmetic.

Unauthenticated classification, and it does not rest on a configuration assumption. The
product implements authorization as a per-handler gate rather than as a dispatcher
middleware stage: the gate is one function, FUN_001a93cc, invoked with a permission
constant by whichever handler chooses to invoke it. A cross-reference census of that
function in the shipped binary records 197 call sites, all individual action handlers, all
inside the address range 0x1aexxx to 0x1bfxxx. Both handlers in this chain fall outside it:
the restart handler FUN_001e3554 at 0x1e3554 and the events write handler FUN_0023ace0 at
0x23ace0. The gate is therefore structurally incapable of authorizing either, because it is
never invoked on their paths. The restart handler's only guard is FUN_001a955c, a
three-instruction predicate testing that the request-context fields at +0x34 and +0x4c are
both non-null; those are the request and response object pointers installed
unconditionally by the dispatcher's own setup routine FUN_001add40, which the route entry
at 0x76a480 names at offset +0x0c, ahead of the handler at +0x10. It tests object presence,
not credentials. One honest tension is published rather than smoothed over: the events write
handler and its dispatcher contain no authorization call that we could find, yet the handler
is recorded as capable of both 401 and 200 outcomes and we could not determine what selects
the 401 branch - so a credential-required conditional score is carried alongside the
primary rating precisely to account for that unresolved path.

A second, configuration-independent defect is documented in the same advisory. The gate's
own logic returns success with no check of any kind when the permission constant is not
0x15, and returns success when enforcement is toggled off, so it fails open in two
independent ways for the 197 handlers that do call it. This chain does not depend on that
defect, and the advisory deliberately makes no claim that any specific other route is a
second path to command execution; it is reported as a separate finding for vendor review.

Two claims carried by the research record are deliberately NOT published as fact. First,
that security enforcement is off by default: no shipped artifact supports the default value
- nothing inside the image, no value read from the extracted root filesystem, not the
contents of the engine.xml package, and no vendor documentation of the factory setting. The
unauthenticated classification does not depend on it, because neither route in the chain
invokes the gate at all; the default matters only for the alternative reloadCfg.xml
trigger, whose reload action does call the gate with permission 0x15, and that variant is
treated as conditional. Second, that pwrstudio runs as root on a device: the observed
uid=0(root) is the privilege of the root-run emulation harness, and the device-side account
is inferred from the daemon's ownership of the restart, reload and upgrade routes, since no
init script or service unit was extracted. Neither caveat alters the impact metrics.

Scoring. Four readings were priced and all four are published, two of them as not adopted:
- PRIMARY, 9.8 Critical, CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H
- CONDITIONAL, 8.8 High, CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H, applying where a
  deployment rejects anonymous configuration writes - enforcement enabled, or the events
  handler's unresolved 401 branch active - so that any valid operator credential suffices.
  Nothing else in the chain changes.
- NOT ADOPTED, 10.0 Critical, CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H - the Scope
  Changed reading a reviewer who counts the appliance OS as a realm distinct from the
  management daemon would apply. We do not adopt it: the command executes inside the
  authority the vulnerable component already holds and no sandbox, container,
  virtualisation boundary or separate security realm is crossed. Published so the choice is
  visible and so the higher number is not mistaken for our claim.
- NOT ADOPTED, 8.1 High, CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:H - Attack Complexity
  raised despite the absence of any attacker-unsatisfiable precondition.
A PR:H reading of 7.2 is not carried, because nothing indicates the configuration write or
the restart route demands an administrator rather than any authenticated principal.

On scoring accuracy: the research record carried 9.8 with that primary vector and
recomputing it under the CVSS 3.1 base algorithm yields 9.8, so the recorded number is
arithmetically correct. The reconciliation that matters is the grounding rather than the
arithmetic: the record derived PR:N from an asserted factory default for the security
toggle, for which no shipped artifact exists, whereas the advisory derives PR:N from the
handler call census and the two handler decompilations, which are artifact evidence. The
score is unchanged and the reason for it has been replaced with one that survives scrutiny.
We note this because several earlier advisories in this repository carried recorded scores
that did not compute for their recorded vectors.

Impact: arbitrary command execution on an industrial energy gateway with the daemon's
privileges. Confidentiality High - every measurement record, configuration item, credential,
certificate and key on the appliance becomes readable, including whatever it holds to
authenticate to the energy-management back office, and a compromised gateway is an ideal
passive collection point because it sees the traffic it forwards. Integrity High -
measurement data can be altered in transit or at rest before reaching the back office, so
forged consumption, generation or power-quality figures propagate into reporting,
settlement, alarm thresholds and control decisions while arriving through the legitimate
path and are hard to distinguish from real data; event configuration can be rewritten and
firmware pushed through the same management plane, since the upgrade route is served by the
same daemon. Availability High - the attacker controls the very restart and reload
primitives this chain uses, and can reboot on demand, stop measurement collection, drop
configuration or wedge the engine, producing a data outage in the metering path.
Persistence and lateral movement are High in practice on the inference below: a foothold
inside the OT segment on a device that security tooling normally treats as trusted
instrumentation.

Verification boundary, stated plainly. Confirmation used the shipped binary extracted from
the firmware package, run under qemu-arm-static USER-MODE emulation with gdb - no
full-system emulation, so no kernel, device drivers, network stack or reverse-proxy front
end were present. No physical device was used at any point: nothing was powered, connected,
flashed or queried. The daemon's HTTP stack could not be started under emulation, for a
specific reason: its serial initialisation thread loops on an open of a Freescale i.MX
private serial device returning EACCES, the device does not exist under qemu-user and no
device model is provided, so the engine-ready futex is never signalled and the worker thread
that would accept connections is never scheduled. A listening socket on port 1500 does come
up with an accept backlog, but nothing ever issues accept or poll against it, so no request
can be delivered and no response produced.

The real shipped sink function was therefore invoked directly under debugger control with
the field values the documented XML schema produces, using a return-immediately instruction
planted at the sub-object's vtable slot 2 - a bx lr gadget at 0x37510 - to neutralise the
virtual copy so Execute could reach the concatenation and the system() call without a fully
constructed engine. It returned 1 and wrote a 39-byte root-owned marker containing
uid=0(root) gid=0(root) groups=0(root). Two arithmetic checks corroborate rather than
merely assert: the content line plus trailing newline is exactly 39 bytes, and the
wide-conversion lengths independently confirm the payload loaded into the object - 1 for
the single-character command, whose first wide character is 0x78, and 41 for the parameter,
whose first three wide characters are 0x3b, 0x69 and 0x64, i.e. semicolon, i, d - proving
the injection prefix survived the narrow-to-wide conversion intact rather than being
encoded or escaped. A control run with a benign 25-character parameter reached the same
sink, returned the same value and wrote nothing, which is what upgrades this from "we called
a function and a file appeared" to "the file appeared because of the injected statement".

END-TO-END HTTP EXPLOITATION WAS NOT PERFORMED, NO REQUEST WAS EVER DELIVERED TO
pwrstudio, AND NO PHYSICAL DEVICE WAS USED. The unauthenticated write and the unauthenticated
restart are proven statically, from the route table, the handler decompilations and the
caller census; they are not observed network behaviour. Everything upstream of the sink call
is static analysis, and we say that plainly rather than letting the dynamically-proven sink
imply more than it covers. Specifically not exercised: the XML parser, since the events
document was never loaded by the write handler, the writer or the action's LoadXml and the
harness populated the object's fields directly; the condition evaluator FUN_004ce47c, which
was identified but never run, so the assumption that an identity condition activates the
event rests on identification plus analogy with the vendor's sibling Windows engine rather
than on disassembly to sink depth or on execution; the event loader chain from the restart
handler to XCEventDriver::LoadXml, established by cross-reference only; the permission gate,
never executed with a real request context so both fail-open branches are a decompilation
reading rather than an observation; and the security-toggle default, never measured. Because
no engine restart was performed, no re-fire was observed, and the persistence property -
that a written event would fire on every later engine start, including operator restarts,
watchdog events and power cycles - is published as inference. A third, weaker independent
check handed the exact string system() receives to a real shell on a separate workstation
and printed a NON-root local identity, so it speaks only to shell re-parse semantics and
says nothing about device privileges.

Product scope, so nothing is over-read. Only firmware 24.11.14-r0, engine variant pss0, was
extracted, disassembled and executed, and every offset is specific to that build. Wider
applicability is inference and is labelled as such: the variant marker in the package name
implies sibling engine variants, and the class inventory recovered from the stripped binary
through C++ length-prefixed typeinfo records - five names whose prefix lengths all match
exactly - is an engine framework rather than a per-model implementation, so other LineEds
revisions, gateway models with a different variant and other appliances embedding this
engine should be assumed potentially affected until individually verified. No second image
was extracted and no second build was disassembled. Validate your own build.

This concerns the Linux ARM pwrstudio binary only. Circutor also sells a Windows platform,
PowerStudio SCADA WAVE, whose engine is a different binary on a different operating system
reaching process creation through Win32 APIs, and which is the subject of separate research
of our own that is already published. The shared format string and shellExecute action name
reflect one engine design carried across two platforms, not shared code, and this advisory
makes no claim about the Windows platform in either direction - it is neither asserted to be
affected by this defect nor re-assessed by it.

Network exposure for anyone triaging: the daemon's own HTTP listener on port 1500, behind the
nginx reverse proxy evidenced by the package in the same archive, exposing roughly 28 routes
including a login route, the user events service, event acknowledge/listener/producer
routes, the restart and configuration-reload routes and a firmware-upgrade CGI.

Remediation reduces to: remove the shell from the execution path by replacing system() with
execve or posix_spawn and an explicit argument vector, deleting the concatenation with it,
which removes the class rather than the instance; if shell execution must be retained,
allowlist both elements and reject statement separators and metacharacters in the parameter,
enforcing the check at construction and not only at load; validate the events document
against a schema at write time; make the permission gate fail closed on any permission value
it does not recognise; take administrative routes out of the security toggle's reach so they
require authentication unconditionally; move authorization into the dispatcher with an
explicit per-route permission table so a new handler cannot be unauthenticated by omission;
run the daemon with least privilege, split from the privileged action executor; and
reconsider whether a raw shell action belongs in a gateway build at all. Operators can
meanwhile confine the management plane to an out-of-band network, place it behind an
authenticating proxy or VPN, inspect events.xml on every appliance for any shellExecute
action whose command is not a known maintenance script or whose parameter contains a
separator, and monitor for a write to the events document followed within seconds by a
restart or reload request from the same source, which is this chain's signature.

Full technical analysis and a proof-of-concept:
  https://0day-rubbish.com/blog/circutor-lineeds-pwrstudio-shellexecute-unauth-command-injection

Project archive (ongoing disclosure series):
  https://github.com/Exploit-Garbage/0day-Rubbish

The vendor has been notified through the PSIRT contact published in its own security.txt.
No vulnerability identifier has been assigned to this finding yet.

--
0day Rubbish Research Team
disclosure () 0day-rubbish com
https://0day-rubbish.com
_______________________________________________
Sent through the Full Disclosure mailing list
https://nmap.org/mailman/listinfo/fulldisclosure
Web Archives & RSS: https://seclists.org/fulldisclosure/

```
