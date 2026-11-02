---
title: "[0day-rubbish] Raritan PX3 PDU G4 firmware 4.3.14 command injection in the ping and traceroute diagnostics through an inverted hostname-validation return check (8.8)"
source: https://seclists.org/fulldisclosure/2026/Oct/54
source_host: seclists.org
clip_date: 2026-11-02T14:45:48+08:00
trace_id: 26987179-4217-484e-9306-7a97120a9266
content_hash: 504ae5667bf595b2396f0f8a5ae9a19d69c8c15850b648423356b168abeb066e
status: synced
tags:
  - 漏洞分析
  - 命令注入
series: null
feed_source: Full Disclosure·漏洞披露
ai_summary: TL;DR：Raritan PX3 PDU G4 固件 4.3.14 的 ping/traceroute 诊断因主机名校验返回值被“严格大于”误读，被拒主机名仍拼入 shell 命令，低权限认证用户即可命令注入（CVSS 8.8）。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40c75244-d011-81e8-a5eb-f97f8f963a9f
ioc:
  cves: []
  cwes:
    - CWE-20
    - CWE-78
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：Raritan PX3 PDU G4 固件 4.3.14 的 ping/traceroute 诊断因主机名校验返回值被“严格大于”误读，被拒主机名仍拼入 shell 命令，低权限认证用户即可命令注入（CVSS 8.8）。
> 
> - **根因：** /lib/libisys.so 中 validateAndResolveHostName()（0x5a3f4）所有拒绝路径统一返回常量 3，而 ping（0x5a988）与 traceRoute（0x5ab64）用无符号“严格大于”比较判定，3 不大于 3 即放行，被拒主机名原样拼入命令模板经 /bin/sh 执行。
> - **利用：** 向 net.Diagnostics.ping 传入 "1.1.1.1;id>/tmp/marker;#" 这类主机名，分号会被字符校验拦截或解析失败，但拦截/未解析的主机名照样流入命令；模板尾部的 2>&1 使注入命令输出经同一响应通道回传，无需带外渗出。
> - **权限面：** 厂商自带 /etc/clish/netdiag.xml 中 ping/traceroute 未设 access 属性（对所有认证用户开放，netstat 才是 admin），故每个监控/集成账号均可达；镜像内 libnetwork.so 有严格 FQDN 校验器但未被引用。影响含读取配置与凭据、借插座控制面让所接机器断电。
> - **评级：** 公布 8.8 High（PR:L）；9.8 因未实测认证绕过被拒；仅两个标注的条件读取成立——叠加出厂默认凭据（另案披露）为 9.8，全员管理员部署为 7.2。
> - **验证与修复：** 基于固件指令级静态分析加隔离主机命令级复现（分号、子 shell、traceroute 三种形态），未在真机端到端利用（仿真受配置守护与 flash 依赖阻断）；修复首选绕开 shell 用 argv 数组派生，一行遏制是将判定改为仅接受文档化成功返回值，另需移除默认凭据并审计校验函数的其他消费方。

## Full Disclosure mailing list archives

## \[0day-rubbish\] Raritan PX3 PDU G4 firmware 4.3.14 command injection in the ping and traceroute diagnostics through an inverted hostname-validation return check (8.8)

* * *

*From*: disclosure via Fulldisclosure <fulldisclosure () seclists org>  
*Date*: Tue, 27 Oct 2026 16:39:44 +0000  

* * *

````rust
0day Rubbish Research Team is publicly disclosing a vulnerability in the
Raritan PX3 PDU G4, firmware version 4.3.14, the intelligent rack power
distribution unit from Raritan, a Legrand company (United States). A
low-privilege authenticated session converts one diagnostics request into
operating-system command execution in the product's web-service context,
because the hostname validation that is supposed to gate the ping and
traceroute commands produces the correct rejection verdict and the caller then
executes on it anyway.

Type and root cause. CWE-78, OS command injection, with CWE-20 co-equal,
in the diagnostics service of /lib/libisys.so.1.0. The firmware is an aarch64
embedded Linux image whose web tier is a custom 1.8 MB C++ daemon, /bin/httpd,
built on an IDL-RPC framework: an authentication subsystem the binary refers
to as pp::aaa, a JSON-RPC name service, and seventy-five service namespaces,
all behind per-method authentication. The two diagnostics implementations,
isys::net::diag::ping at 0x5a988 and isys::net::diag::traceRoute at 0x5ab64,
do not perform network operations themselves: they assemble shell command
strings from the operator-supplied hostname and execute them through /bin/sh,
via pp::BackgroundCommand::open(bgCmd, "/bin/sh", argv) at 0x36170, reached
through runShellCommandAndGetResults() at 0x36094, which logs the command it
is about to run. The templates are ping -c <count> -W <timeout> <HOST> 2>&1
and traceroute -w <timeout> -m 30 <HOST> 2>&1, with ping6 and traceroute6
variants; the neighbouring string table carries "ping", "ping6", "traceroute",
"traceroute6", "2>&1" and the source file name "DiagnosticsImpl.cpp".

The defect is a returned verdict consumed with the wrong comparison. The
validation function, validateAndResolveHostName() at 0x5a3f4, is not a stub:
it walks the hostname character by character, explicitly rejects the percent
sign and every character above the ASCII colon, cross-checks that the host
resolves through the resolver service, and returns one constant, three, on
every rejection path - the rejection block converges at the load of that
constant and returns at 0x5a54c. Both consumers evaluate the verdict with an
unsigned strictly-greater branch: a return of three is not strictly greater
than three, so it falls through, and the rejected hostname is spliced into the
shell template verbatim. The result is an injection whose success condition is
the validator working exactly as designed: a semicolon is caught by the
character loop, a dollar or parenthesis survives the loop but fails
resolution, and all of them - caught or unresolved - flow into the command
template. A host value of 1.1.1.1;id>/tmp/marker;# keeps the ping segment
syntactically complete, runs the injected statement as a second shell
statement, and the trailing hash comments out the template's 2>&1 suffix; the
subshell form and a newline-separated form ride the same rejection path; the
traceroute template arms the second entry point identically. The image
contains a strict fully-qualified-hostname validator in libnetwork.so, but
the web daemon does not import it and the diagnostics library neither links
nor loads it on this code path.

The request that reaches the sink looks like this, transmitted as one JSON
body over the authenticated RPC channel:

```
{
  "jsonrpc": "2.0",
  "method": "net.Diagnostics.ping",
  "params": {
    "host": "1.1.1.1;id>/tmp/marker;#",
    "count": 1,
    "timeout": 1
  },
  "id": 2
}
```

The same attacker string rides the hostname argument of the corresponding CLI
commands. The 2>&1 merge suffix is an amplifier the attacker inherits for
free: whatever the injected command prints on either stream is captured by the
same mechanism that returns ping output, so the response channel doubles as
the command-output channel and no out-of-band exfiltration is needed.

Reach and privileges. The web methods sit behind the framework's per-method
authentication and no bypass of that boundary was measured. The load-bearing
privilege artifact is the shipped CLI configuration, /etc/clish/netdiag.xml:
ping and traceroute are defined with no access attribute - available to every
authenticated CLI user in this framework's grammar - while the neighbouring
netstat command carries access="admin". The vendor's own artifact therefore
documents that these two functions were deliberately placed in the
all-authenticated-users class, presumably on the theory that a ping is
harmless. On a rack PDU, management is a network service at a datacenter's
softest point, and the finding's effective audience is every monitoring
account, operations automation role and integration credential granted "just
to poll".

Severity. The published score is 8.8 High,
CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H: ISS = 1 - (1 - 0.56) x (1 -
0.56) x (1 - 0.56) = 0.914816, impact = 6.42 x 0.914816 = 5.869119,
exploitability = 8.22 x 0.85 x 0.77 x 0.62 x 0.85 = 2.835255, base =
5.869119 + 2.835255 = 8.704374, rounded up to 8.8. A PR:N reading of 9.8
Critical (impact 5.869119 plus exploitability 3.887043, total 9.756162) is
rejected: no authentication bypass was measured. Two conditional readings are
published as explicitly labelled conditionals and never as the headline. The
first applies where a deployment still carries the factory default
administrative credential pair recorded in the image's configuration default
area for first-boot access: the same PR:N vector computes to 9.8 Critical for
the chain of that adjacent weakness plus this injection, and a changed
credential removes it; the default pair is disclosed as a separate weakness
and is not folded into the published vector. The second applies only to
deployments in which no low-privilege account is provisioned and every caller
holds administrator privileges: the PR:H vector computes to 7.2 High
(exploitability 1.234708 plus 5.869119, total 7.103826), and it is not the
headline because the vendor's own shipped CLI artifact grants diagnostics to
all authenticated users.

Verification method, and its boundary. Every static claim is measured from the
firmware image at instruction level: the templates, the character loop, the
converging rejection blocks, the consumers' compare-and-branch sequences, the
shell open, and the two import facts. The dynamic layer is a command-level
replication of the recovered sink semantics on an isolated research host: the
exact reconstructed templates were executed through a shell under the
semicolon, subshell and traceroute injection shapes, and each produced the
marker command's output, while a metacharacter-free control produced nothing
and the marker path was confirmed absent afterwards. What was not done: no
end-to-end exploitation through the management interface of a physical unit.
No physical unit was available, and full-system emulation was blocked by the
management daemon's dependency on the configuration daemon and the flash
storage layer, which an image-only extraction does not provide. Appliance-side
execution identity was therefore not measured at runtime and is not claimed;
the replication's shell ran under the research host's privileged account,
which is a property of the research environment, and the published claims are
written against the web service's account, whichever that is.

Impact. One authenticated request converts into command execution in the
process context of the web management daemon, with command output returned
through the same response channel. The service's read reach includes the
product's configuration and state stores, so configuration data, recorded
credentials and network information can be exfiltrated in the same channel
that ping output arrives in. Both methods accept repeated calls with fresh
hostnames, so staging, reading results and cleanup are one request each, and
no persistence inside the product is needed. On a power distribution product,
availability is the physical machine state: the injected command executes in
the daemon that hosts the outlet control surface, so the ability to cycle
outlet power, and thereby hard-stop, every machine fed by the unit, follows
from the product's own function. That consequence is a labelled inference.
sink level was measured. Detection is poor by construction: the triggering
request is a legitimate diagnostics call that the product logs as the
assembled shell command, and the strongest available signal is shell-command
log review for the two templates.

Remediation, in the order that removes the class: perform ping and traceroute
without a shell, through their library or raw-socket interfaces or an
argv-array spawn, which removes the CWE-78 class from this handler entirely;
correct the verdict consumption - accept only the documented success returns
and reject everything else - as a one-line containment that can ship
immediately; centralize hostname admission for both entry channels on a
literal-or-strict-name allow-list that runs before any command text is
assembled, using the strict validator already present in the image; audit
every other consumer of the shared validation function for the same
strictly-greater consumption of the rejection constant; remove the factory
default credential and force a first-login change, which closes the
conditional unauthenticated chain; add injection regression suites for both
channels covering the full character-class table; and make the shell-template
log line an alertable event. Operator measures until firmware is fixed: change
the factory default immediately, restrict management access to the operations
network, prefer monitoring roles that need no diagnostics, and alert on
diagnostics shell lines whose host segment is not a literal address or strict
name.

Proof of concept. The published tool is a standard-library-only Python 3
client that drives the entry path against an explicit target with explicit
credentials or a pre-established session token, a configurable command and
explicit timeouts; it attempts the two candidate session-establishment routes
observed in this framework generation's front ends and degrades to a supplied
token, and it embeds no addresses, credentials or state of the verification
environment. Safety rails: loopback default, no persistence steps, one
non-destructive marker command by default, and no configuration change beyond
what the described request performs. Use it only against systems you own or
are authorised to test.

The vendor's parent company product security team, whose signed RFC 9116
contact file on the parent's primary web host names the intake mailbox used,
was notified through that documented security mailbox, which is the only
channel used; no security intake of the router brand itself exists, no
pre-publication intake form was submitted, and no individual was addressed by
name. This disclosure is unconditional: the research is published, no
permission was asked for, no embargo was requested, nothing is withheld
pending a reply, and remediation questions are answered at no cost. No
vulnerability identifier has been assigned to this finding.

Full technical analysis and the reproducible proof of concept, published
unconditionally:
  https://0day-rubbish.com/blog/raritan-px3-pdu-g4-diag-ping-traceroute-command-injection

Project archive (ongoing disclosure series):
  https://github.com/Exploit-Garbage/0day-Rubbish

--
0day Rubbish Research Team
disclosure () 0day-rubbish com
https://0day-rubbish.com
_______________________________________________
Sent through the Full Disclosure mailing list
https://nmap.org/mailman/listinfo/fulldisclosure
Web Archives & RSS: https://seclists.org/fulldisclosure/

````

* * *

### Current thread:

-   **\[0day-rubbish\] Raritan PX3 PDU G4 firmware 4.3.14 command injection in the ping and traceroute diagnostics through an inverted hostname-validation return check (8.8)** *disclosure via Fulldisclosure (Oct 28)*
