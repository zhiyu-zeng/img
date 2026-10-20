---
title: "Full Disclosure: [0day-rubbish] Edimax BR-6478AC firmware v2.20 authenticated command injection in the setWAN WAN-configuration handler, root command execution (7.2)"
source: https://seclists.org/fulldisclosure/2026/Oct/29
source_host: seclists.org
clip_date: 2026-10-21T03:14:14+08:00
trace_id: 27a6100f-c095-4a8b-af6a-a2fb68bac67c
content_hash: d74a5a66431b6f299594cdc15366e2e1d17cb69d8d6bedfcebbc955e935214d4
status: synced
tags:
  - 漏洞分析
  - 硬件逆向
series: null
feed_source: Full Disclosure·漏洞披露
ai_summary: Edimax BR-6478AC 路由器 v2.20 固件的 setWAN 处理器存在 CWE-78 命令注入：认证后单次 POST 即可注入管道/注释符，以 root 身份执行命令，CVSS 3.1 评分 7.2（AV:N/AC:L/PR:H）。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ff75244-d011-814f-a892-f944c61852cd
ioc:
  cves: []
  cwes:
    - CWE-250
    - CWE-78
    - CWE-798
  hashes:
    - 3ad10a41d11c8cd59185eab6c9ce67b18cd2118942eb2201f48540d7846a0328
    - ec39c0f9332361e37ab92f1999ac5f00f5742dd6db75f7cb26c0652cfedb32a1
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Edimax BR-6478AC 路由器 v2.20 固件的 setWAN 处理器存在 CWE-78 命令注入：认证后单次 POST 即可注入管道/注释符，以 root 身份执行命令，CVSS 3.1 评分 7.2（AV:N/AC:L/PR:H）。
> 
> - **根因与位置：** webs 二进制（MIPS 大端、762904 字节、SHA256 ec39c0f9…）中 websFormDefine 注册了 `POST /goform/setWAN`；处理函数在 0x441cec，wanMode=2 时把 pppUserName 经 strcpy 复制、仅扫描分号（0x3b）后不加引号拼进 `echo %s > /tmp/UserName`，再交给 0x441f1c 的 system() 调用 `/bin/sh -c`。
> - **绕过验证：** 用户名 `|id > /tmp/marker #` 使井号成为 shell 注释，吞掉原重定向并执行 id；仅在 POSIX 沙箱复现出 39 字节 root 属主标记文件，且 `/tmp/UserName` 未被创建——该文件缺失即为注入成功的证明。
> - **无效防御：** 转义井号的循环位于 system() 之后（0x441f4c–0x441fb0），且写入的是存储缓冲（配置对象 0x6d）而非送入 shell 的缓冲，属"存的时候转义、执行时没转义"。
> - **同类与面：** 同一构造还存在于 wanMode 3（pptpUserName，0xf3）与 wanMode 6（L2TPUserName，0x128），仅修 PPP 分支会漏掉另两条；固件注册表中 91 个 /goform/form* 处理器里约 85 个可达 system()/popen()，setWAN 不受 600 秒 uptime 门禁限制。
> - **利用条件与局限：** 单一 Basic 认证域（`Auth / /etc/boa/boa.passwd`），无低权限角色、无 Allow 控制、服务以 User root 运行；出厂口令 admin:1234 按 CWE-798 单列；作者明确未上真机、未发 HTTP 请求，仅反汇编级与语义复现；厂商已停止该系列固件支持，建议改口令、关闭 WAN 侧管理并换机。

## Full Disclosure mailing list archives

## \[0day-rubbish\] Edimax BR-6478AC firmware v2.20 authenticated command injection in the setWAN WAN-configuration handler, root command execution (7.2)

* * *

*From*: disclosure via Fulldisclosure <fulldisclosure () seclists org>  
*Date*: Tue, 20 Oct 2026 02:30:31 +0000  

* * *

```swift
0day Rubbish Research Team is publicly disclosing a vulnerability in the
Edimax BR-6478AC, firmware image BR6478AC_v2.20.bin, the dual-band AC1750 SOHO
wireless router from Edimax Technology Co., Ltd. (Taiwan). A single
authenticated POST that looks like an ordinary WAN settings submission reaches
system() with a request-controlled username interpolated unquoted into a shell
command line, behind a sanitiser that inspects exactly one character, and the
web server process that executes it runs as root.

Type and root cause. CWE-78, OS command injection, in the setWAN
WAN-configuration handler of bin/webs, the embedded GoAhead-style HTTP server
that serves the management interface on TCP port 80. The binary is ELF 32-bit
big-endian MIPS, MIPS-I, uClibc, stripped, 762904 bytes, SHA256
ec39c0f9332361e37ab92f1999ac5f00f5742dd6db75f7cb26c0652cfedb32a1, from a
SquashFS root filesystem of roughly 2.3 MB with an internal build timestamp
from 2015. The registration websFormDefine("setWAN", ...) at 0x478484, handler
at 0x441cec and name string at 0x4a6250, publishes POST /goform/setWAN. Inside
the handler the WAN mode is read from the request and dispatched:
websGetVar(wp, "wanMode", "") at 0x441d3c, atoi at 0x441d44, apmib_set(0x102,
&wanMode) at 0x441d54, then addiu v1, zero, 2 at 0x441d60 and beq v0, v1,
0x441e74 at 0x441d6c. On the PPP branch, wanMode 2, the username field is
taken from the request by websGetVar for pppUserName, whose name string is at
0x4953f4, copied with strcpy at 0x441e94 into a fixed stack buffer, measured
with strlen at 0x441ea8, and scanned by an inline byte loop between 0x441ebc
and 0x441ee4 whose only comparison is addiu a0, zero, 0x3b, a semicolon.
Finding one, the loop writes a NUL and stops. That single-character scan is
the entire sanitisation on the path. The value then goes into sprintf at
0x441ee8 using the format string at 0x49a510,

    echo %s > /tmp/UserName

and from there into system(buf2) at 0x441f1c, reached through the PLT slot at
0x4c6d60, which hands the line to /bin/sh -c. A pipe, an ampersand, a
backtick, a dollar sign with parentheses and an embedded newline are never
inspected, so a username containing no semicolon reaches the shell untouched.
The verified payload is a username of |id > /tmp/marker #, which builds the
command line

    echo |id > /tmp/marker # > /tmp/UserName

The shell treats the hash as a comment that swallows the sink's own redirect
and runs id as the right-hand side of a pipeline, so the injected command
executes and the file the handler was supposed to write is never created.

The defence that arrives too late. An escape loop that replaces a hash with a
backslash-escaped hash does exist in this handler, running between 0x441f4c
and 0x441fb0. Two facts dispose of it. First, the instruction order: the loop
is after system() at 0x441f1c and there is no branch back to it. Second, the
buffer: the loop writes into the configuration buffer at sp+0x18, which is
what apmib_set(0x6d, ...) stores at 0x44200c, not the buffer handed to the
shell. The developer escaped the hash character for the value that gets stored
and escaped nothing for the value that gets executed, which is a defensible
priority if the threat model is a hash in a stored username breaking some
later script that reads the configuration, and no defence at all against this
sink. The dynamic replication confirms the consequence: the hash in the
injected username reaches the shell as a comment and the sink's own redirect
never fires.

The sanitiser audit, and one trap for anyone re-reading the decompilation.
Between websGetVar and system the only operations on the value are strcpy at
0x441e94, strlen at 0x441ea8, the inline immediate-0x3b scan and the unquoted
sprintf at 0x441ee8. No regex call, no inet_aton, no isdigit, no isalnum, no
strchr, no strcspn, no vendor validation helper and no custom validator
appears on that path. The inet_aton calls that do exist in this function, at
0x441dd0 and 0x441e14, belong to the static-IP branch, wanMode 1, reached via
the branch at 0x441d8c; the wanMode 2 comparison sends execution straight to
the PPP branch and never enters that code. A quick read of the decompilation
therefore misleads, because the function as a whole does contain address
validation while the path that matters contains none.

One root cause, three reachable parameters. The same construction appears
three times in this handler, each selected by a value the request supplies:
pppUserName on wanMode 2, with the sink region 0x441e74 to 0x441f1c and
configuration object 0x6d written after the sink; pptpUserName on wanMode 3,
from 0x4420d0 onward, configuration object 0xf3; and L2TPUserName on wanMode
6, from 0x44246c onward, configuration object 0x128. All three use the same
immediate-0x3b scan, the same echo format string and the same system() call
shape. The wanMode 2 path was verified instruction by instruction and
replicated dynamically; the other two are reported from reading the same
handler, which is a structural claim rather than a demonstrated one. A patch
confined to the PPP path leaves the PPTP and L2TP paths injectable.

A static comparison against a second model, offered as a lead and not as a
finding. A second Edimax firmware image, BR-6208AC_V2_1.03, carries a
different webs build, ELF 32-bit MSB MIPS-I, 816568 bytes, SHA256
3ad10a41d11c8cd59185eab6c9ce67b18cd2118942eb2201f48540d7846a0328, whose setWAN
implementation matches instruction for instruction: handler at 0x448710,
websGetVar for pppUserName at 0x4488b8, strcpy at 0x4488bc, the same inline
immediate-0x3b scan at 0x4488dc to 0x4488fc, the same sprintf into
/tmp/UserName at 0x448920 with its format string at 0x4a6954, system() at
0x448940, the same three parameters on the same three wanMode values, and the
same single-realm Basic authentication model behind the same configuration
flag. The differing addresses and binary size come from a different product
build; the vulnerable path itself does not differ. The reasonable inference is
a shared source component in the vendor's router software base. That model was
not tested, nothing was executed from that image, no score covers it, and it
is not an exploited finding on it.

Scope of the pattern. A count of the shipped registration table found 91
/goform/form* handlers, of which roughly 85 reach a system() or popen() call,
so the architectural root cause is a management server that builds shell
command lines by string interpolation rather than one careless field.
/goform/setWAN is not one of the four routes carrying a post-boot uptime gate
(/mp.asp, /goform/mp, /advanced_management.asp and /goform/formAdvManagement,
which redirect to /index.asp once /proc/uptime exceeds 600 seconds), so it is
reachable at any time the device is up.

Authentication and reach. The route requires a valid administrative session in
normal operation. The gate auth_authorize at 0x404d00 reads configuration
object 0x1bc, the setup-wizard flag, through apmib_get; once the device is
past setup the security store at 0x4c7004, a single / entry of type Basic
registered from the directive "Auth / /etc/boa/boa.passwd", covers every
/goform/ path with HTTP Basic authentication. The product has no second
lower-privileged role, so Privileges Required is High rather than Low: one
realm entry, one password file, one account, an Allow directive handler at
0x407688 that is a stub answering "This version of Boa doesn't support access
controls", a type-None string at 0x49070c that is never passed to auth_add,
and a shipped configuration carrying one Auth directive and no Allow
directive. The calling process is root because the shipped etc/boa/boa.conf
declares User root, the server performs no setuid, chroot, namespace or
capability drop, and it writes /var/run/webs.pid, which requires root on this
filesystem, so the landing identity is uid=0(root) and there is no escalation
step in the chain. Attack complexity is Low: the only branch to satisfy,
wanMode, is supplied by the attacker, and there is no race, timing window,
memory-layout requirement, gadget or user-specific state. The practical
network position on a stock device is a host on the wired LAN or an associated
wireless client, because the shipped firewall script drops WAN-originated SYN
at firewall.sh:180, installs a default DROP input policy at firewall.sh:187
and accepts input on other interfaces at firewall.sh:189; that position
includes guest wireless clients, any compromised device behind the router and
anything bridged onto the segment, and remote management or a port forward
moves it to the open internet.

Severity. The published score is 7.2 High,
CVSS:3.1/AV:N/AC:L/PR:H/UI:N/S:U/C:H/I:H/A:H, from ISS = 1 - 0.44^3 =
0.914816, Impact at S:U = 6.42 x 0.914816 = 5.873119, Exploitability = 8.22 x
0.85 x 0.77 x 0.27 x 0.85 = 1.234708 and Base = Roundup(5.873119 + 1.234708) =
Roundup(7.107826) = 7.2. The provenance of that number is published because it
is a correction: the research notes behind this work carried 8.8 written next
to a PR:H vector, and 8.8 is the arithmetic of PR:L rather than of PR:H, so
the figure was recomputed from the vector and published at 7.2, lowering the
researchers' own number by 1.6 points. Four further readings are printed with
their arithmetic. Privileges Required Low is rejected at 8.8 High, from
Exploitability 2.835255 and Base Roundup(8.708373), because the product has no
basic-user role for that metric to describe. Scope Changed is rejected at 9.1
High, from Impact at S:C = 6.128026, Exploitability 2.286496 and Base
Roundup(1.08 x 8.414522), because webs is root before the attack and root
after it and nothing is escaped. Attack Complexity High is rejected at 6.6
High, from Exploitability 0.705547 and Base Roundup(6.578666), because success
depends on no condition outside the attacker's control. An adjacent-vector
reading is published as a labelled alternative at 6.8 High, from
Exploitability 0.900610 and Base Roundup(6.773729), and it is the honest
description of a stock device whose WAN-side input policy drops new
connections; AV:N is retained because the service is bound to the device's own
network stack and addressable over IP by every host on the segment the router
serves, and because remote management and port forwarding are ordinary
documented product features. Default internet exposure is not claimed.

Two readings at 9.8 Critical are published as explicitly labelled conditionals
and are never the headline. The first applies where a deployment still accepts
the factory credential shipped in the firmware, and it is reasoned rather than
demonstrated: no device was authenticated against, so the path is an inference
from the shipped password file plus the injection proven at the sink, and its
Scope Changed variant, which computes to 10.0, is deliberately not published
for the Scope reason above. The second applies to a device still in its
pre-configuration setup state: when configuration object 0x1bc reads zero,
auth_authorize returns success without a challenge for paths outside /mp.asp,
/index.asp and /, at 0x4052d0, while /generate_204 answers 204, which is
captive-portal behaviour. Three shipped artefacts identify that state as the
setup wizard rather than normal operation: formwizResetDefault at 0x44cdbc
resets the device and displays Resettowizard, formWizSetup prints NO -
LOGIN-WEB when the flag is set to 1, and pages such as web/inter_wan.asp:214
and web/admin_timezone.asp:95 read the same flag to switch their interface.
That branch is structural inference only, read from the binary and never
exercised, and the state ends when setup completes; an early pass of this
research misread it as an unauthenticated post-setup state, and the correction
downgraded the finding to PR:H. If the window has to be contested rather than
found open, the reading is 8.1 High from Exploitability 2.221167 and Base
8.094286.

The factory credential is a separate weakness and not the vector. The image
contains a populated /etc/boa/boa.passwd in a read-only SquashFS filesystem,
referenced by the single Auth directive in etc/boa/boa.conf, and the model's
published factory login is admin:1234. It is reported as CWE-798 in its own
right, without a score, because scoring it inside this advisory would
double-count it against the first conditional reading. Two limits are stated
rather than smoothed over. No cryptographic match between the shipped
MD5-crypt digest and any specific password is claimed, because the digest
string captured during analysis was recorded incompletely and no comparison
was published; the weakness rests on the artefact, a pre-populated shared
credential store inside the firmware image, plus the widely published factory
login. And the single account entry in the image examined is recorded under
the name root while the model's published management login is admin; because
no device was ever authenticated against, which user name the realm accepts
was not established, so no specific username is asserted as verified. Absence
of privilege separation is likewise reported separately as CWE-250.

Two adjacent observations are published without a score. The strcpy at
0x441e94 copies attacker-controlled bytes with no length argument into a
fixed-size stack buffer, and the request parser does not clamp the field to
anything near that buffer's size; no overflow was developed, no capacity was
measured and no exploitability claim is made, and it is recorded so that a
bounded copy replaces it in the same pass. And because the semicolon scan
writes a NUL at the first semicolon, a legitimate username containing one is
silently truncated before storage, so the WAN link then authenticates with a
wrong credential and the owner sees no error explaining it, which is a
correctness defect existing independently of the injection and an argument for
rejecting rather than truncating.

Verification method, and its boundary. This is the load-bearing limitation and
it is published prominently rather than buried. No physical device was powered
on and no end-to-end HTTP request was ever accepted by the product. The HTTP
leg, being request parsing, the authentication gate, form registration, mode
dispatch and the PPP branch selection, is evidenced at instruction level from
the shipped binary, its configuration and its boot scripts. The execution leg
is evidenced dynamically by replication of the sink's semantics rather than by
detonation, because a MIPS big-endian uClibc userspace with a board-specific
bootloader could not be booted end to end in the research environment: the
extracted binaries faulted with SIGBUS under the available user-mode
translator and full-system emulation of the board was not brought up. The
question under test is not the device but whether a shell evaluates a pipeline
and honours a trailing comment in a string built by the vendor's own sprintf
and handed to /bin/sh -c, which is a question about POSIX shell semantics that
are architecture independent, combined with the exact format string read out
of the binary. The string sprintf produces at 0x441ee8 was reconstructed byte
for byte for a request whose pppUserName field is |id > /tmp/marker_sw # and
handed to /bin/sh -c in an isolated POSIX sandbox whose invoking shell ran as
root.

That run produced a 39-byte marker file owned by root:root containing
uid=0(root) gid=0(root) groups=0(root) with shell exit status 0, and
critically the sink's own /tmp/UserName destination was not created. That
absence is the proof that the trailing hash reached the shell as a comment
rather than being escaped, because had the handler's escape loop protected the
sink the file would exist. The benign control, an ordinary username, created
its destination containing that username and produced no marker. The same
replication was run again on a workstation under an ordinary unprivileged user
account and reproduced the semantics at that identity, ruling out the
alternative explanation that running as root caused the marker to appear. The
harness removes any pre-existing marker and destination before each run and
deletes its scratch files afterwards. Consequently the on-device landing
identity of uid=0(root) is inferred from the shipped User root directive plus
the root-identity replication rather than observed on hardware; AV:N is argued
from the product's transport and authentication model rather than measured
across a network; and no setup-state request was sent, no dictionary or
credential attack was attempted, and no overflow was developed. Only firmware
BR6478AC_v2.20.bin was examined, and only the wanMode 2 path was replicated.

Impact. Arbitrary root command execution on the router from a single
authenticated POST indistinguishable from a legitimate WAN settings
submission, since the payload travels in the PPP username field of the form
the product's own wan.asp page posts. Root on this device exposes every stored
secret, including precisely the PPP, PPTP and L2TP credentials this handler
writes into configuration objects 0x6d, 0xf3 and 0x128, so an attacker who
reaches the device can read the ISP or VPN account details the owner entered,
together with the administrator password file, wireless pre-shared keys and
per-station key material, VPN parameters and any certificate or key on the
filesystem. It grants control of the configuration and routing plane: firewall
and NAT rules, the DNS resolver handed to clients, DHCP, port forwards,
wireless SSIDs and the WAN uplink itself, including rewriting the WAN mode,
which is the configuration path this handler owns. It grants firmware-level
persistence, since root can write the flash-backed configuration area and
install a boot-time startup mechanism, so a compromise survives reboots and
can survive a partial configuration reset with recovery requiring a full
reflash. And it grants availability at will over wireless, routing, DHCP, DNS
and the management service. There is no rate limit on the handler and no
lockout in the Basic realm, so the route is repeatable and leaves no alert
behind.

Detection is poor by construction, but this sink leaves one usable anomaly. A
submitted WAN configuration produces ordinary product behaviour, and the
sink's visible effect, a username written into /tmp/UserName and then into the
configuration store, is exactly what a legitimate submission does. The
reliable indicator is the absence of the expected /tmp/UserName destination on
a submission that should have created it. An injection also corrupts stored
configuration in a way the owner may not notice: the semicolon scan truncates
at the first semicolon, and a payload using a pipe and a hash stores a
username the WAN link cannot authenticate with, a self-inflicted availability
event that doubles as a fingerprint. The fields worth logging on any surviving
build are those containing a pipe, a dollar sign, a backtick, a hash or a
newline. Marker files under /tmp are volatile since /tmp is a tmpfs that does
not survive a reboot, so a reboot is also an anti-forensic step available to
an attacker.

Remediation, in the order that removes the class rather than the instance:
stop writing configuration through a shell, since the sink exists because the
handler persists a value with echo into a temporary file instead of writing it
with a file API or storing it directly through apmib_set, which the same
function already calls at 0x44200c, and deleting the sprintf and system pair
at 0x441ee8 / 0x441f1c fixes all three isomorphic instances at once; where a
shell call must remain, use execve with one argv element per value or pass
values through the child's environment, and apply the same change across the
roughly 85 command-execution instances in bin/webs rather than extending a
character blacklist, since the single-character filter on this path is itself
the demonstration that a deny-list decays; validate the username fields
against their real domain with a bounded length and a character allowlist,
rejecting rather than truncating; move the existing hash escape to before the
sink and to the correct buffer if any character-level escaping is retained at
all, treating it as defence in depth rather than the primary control; bound
the stack copy; drop privileges in the web server rather than declaring User
root; force a password change on first session or provision a unique per-unit
credential at manufacturing, store it with a memory-hard digest and add rate
limiting plus lockout to the Basic challenge; keep WAN-side management off by
default as a documented product decision; and ship a regression test that
submits a pipe-and-trailing-comment username and the command-substitution,
backtick, ampersand and embedded-newline variants to POST /goform/setWAN for
each of wanMode 2, 3 and 6, asserting a validation rejection, no marker file
and no spawned shell, while also asserting that an ordinary username is still
stored so the fix cannot be satisfied by silently disabling WAN configuration.

Operator measures until firmware exists: change the factory password
immediately; never expose the management interface to a WAN address, a reverse
proxy or a port forward, and turn remote management off; keep guest wireless
clients on their own segment away from the management subnet, because a guest
client holding a management credential is the most likely starting position
for this handler specifically; and treat a device still running firmware of
this vintage as end of support and plan replacement. The vendor's own
published material is consistent with that framing: a public security notice
for its legacy BR-series router models states that because of the age of those
hardware platforms and their discontinued status it will not be developing new
firmware updates or security patches for them, and a public end-of-service
announcement names discontinued models and states that firmware updates,
technical support and services are no longer available for them. The image
analysed here identifies itself as BR-6478AC_v2.20, which by its naming is a
different firmware line from the separately marketed BR-6478AC V2 and V3
hardware revisions, so the vendor's coverage statement for this exact build
was put to the vendor as an open question rather than assumed either way. One
operational caution applies to anyone retesting: a successful submission
overwrites the stored WAN username and can break the uplink, which is what the
handler does on any successful submission, so the original WAN configuration
must be recorded and restored afterwards.

Proof of concept. The published tool is Python 3 using only the standard
library, with no third-party dependency and no hardcoded target, and it is
deliberately built so that it cannot be used accidentally against a live
network. Its default mode is replication: it reconstructs the exact string the
device's sprintf produces at 0x441ee8 and hands it to /bin/sh -c locally,
asserting both that the injected pipeline ran and that the sink's own redirect
target was not created, which is what proves the trailing hash reached the
shell as a comment, then running a benign username as a negative control and
asserting the opposite. It is that replication mode, not a device run, that
produced the evidence above. Arguments cover target host, Basic realm username
and password, the WAN mode to select, which of the three username fields
carries the payload, an option to iterate all three modes, a single
non-destructive command defaulting to id, the marker path, the submit-url
field value defaulting to /wan.asp, a user agent and a per-request timeout. A
send mode additionally POSTs the request to the target and is refused for any
non-loopback target unless an explicit allow-remote flag is given, and a
print-request mode emits the exact HTTP request that would be transmitted
while making no connection at all. Safety rails are loopback-only by default,
one non-destructive marker command, no callback listener, no reverse shell, no
persistence, and removal of every local file the run created, with the tool's
own documentation carrying the warning that sending against a real device does
change stored WAN configuration because that is what the handler does on any
successful submission. The model's published factory password appears in it
only as a placeholder default so the request shape is self-documenting; the
injection does not depend on it. Use it only against systems you own or are
authorised to test, and restore the device's WAN settings afterwards.

A second, independent command injection on the same product and the same
firmware image is published alongside this one, in the formWlanMP
manufacturing-test handler, which reaches sprintf at 0x462fd0 and system() at
0x46308c through POST /goform/formWlanMP with no sanitisation at all across
thirty radio-calibration fields. It is a different handler, a different format
string, a different sink address and no sanitiser rather than a one-character
one, so a patch to either sink does not close the other and neither finding is
a variant of the other. That advisory is at the second URL below.

Edimax Technology Co., Ltd. was notified through the technical-support mailbox
its own public end-of-service announcement publishes, which is the only
channel used. No RFC 9116 security.txt is served on the vendor's primary web
host, the request returning a redirect into the site's own index rather than a
document; the vendor does publish a Security Notice page for its legacy
BR-series routers whose stated route for questions from users is a consumer
support form requiring a personal name and telephone number with a
problem-category list containing no security option, and that form was
deliberately not used for this report. No product security team address,
security response statement or vulnerability reporting policy was found on the
vendor's live hosts, and no individual was addressed by name. The vendor was
asked where security reports on its firmware belong, was asked to confirm
which model and firmware line the analysed image belongs to, and was asked
whether the WAN-configuration code is a shared source component across its
router products, since a single change to such a component would close this
sink across every product line that uses it. This disclosure is unconditional:
the research is published, no permission was asked for, no embargo was
requested, nothing is withheld pending a reply, and remediation questions are
answered at no cost. No vulnerability identifier has been assigned to this
finding.

Full technical analysis and the reproducible proof of concept, published
unconditionally:
  https://0day-rubbish.com/blog/edimax-br-6478ac-setwan-command-injection-root-rce

Companion advisory for the same product, different handler:
  https://0day-rubbish.com/blog/edimax-br-6478ac-formwlanmp-command-injection-root-rce

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

```
