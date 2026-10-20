---
title: "Full Disclosure: [0day-rubbish] Edimax BR-6478AC firmware v2.20 authenticated command injection in the formWlanMP manufacturing-test handler, root command execution (7.2)"
source: https://seclists.org/fulldisclosure/2026/Oct/28
source_host: seclists.org
clip_date: 2026-10-21T03:13:39+08:00
trace_id: 94276656-8256-47df-ba02-7f353212c7e4
content_hash: 81cfa5213076f9ddfbcd7c5cfad738bb956ae82e3fe088c7d4b87e37cf368620
status: synced
tags:
  - 漏洞分析
  - 固件安全
series: null
feed_source: Full Disclosure·漏洞披露
ai_summary: "**TL;DR：** Edimax BR-6478AC v2.20 固件的 formWlanMP 处理器把 30 个请求字段不加引号拼进 system()，持有效管理凭据者只需发送一个 POST 请求，就能以 root 身份执行任意命令（CVSS 7.2），但证据来自二进制分析与本地 shell 语义复现，而非真机验证。"
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ff75244-d011-8167-8fa3-e544d67dd86a
ioc:
  cves: []
  cwes:
    - CWE-250
    - CWE-78
    - CWE-798
  hashes:
    - ec39c0f9332361e37ab92f1999ac5f00f5742dd6db75f7cb26c0652cfedb32a1
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> **TL;DR：** Edimax BR-6478AC v2.20 固件的 formWlanMP 处理器把 30 个请求字段不加引号拼进 system()，持有效管理凭据者只需发送一个 POST 请求，就能以 root 身份执行任意命令（CVSS 7.2），但证据来自二进制分析与本地 shell 语义复现，而非真机验证。
> 
> - **根因：** 在 bin/webs（MIPS 32 位大端、uClibc、stripped）中，0x477a1c 处注册的 `POST /goform/formWlanMP` 会经 websGetVar 读取 ateFunc、e2pTxPower1~7 等 30 个字段，由 0x462fd0 的 sprintf 将它们按三十个 `%s` 格式原样拼成 `rftest_old.sh` 命令行，再交给 0x46308c 的 system() 执行；整条链路上没有 atoi、strchr、长度检查或引号包裹，空字段也只是被替换成字面量 `null`，只是为了占位，并非过滤。
> - **绕过细节：** 镜像内并不存在 `/bin/rftest_old.sh`，shell 会退出并返回 127，但这不构成缓解：`$(...)`、反引号、管道和换行在命令查找之前就已完成展开或解析，注入的命令早已执行；因此任何采用黑名单的思路都必然失败。
> - **权限与暴露面：** webs 以 root 身份运行（boa.conf 中声明了 `User root`），系统只有一个账号（管理账号，采用 Basic 认证），没有低权限角色；该路由也不受启动后 600 秒内才能访问的上限限制，在设备运行期间随时可以访问。同类构造中，91 个 `/goform/form*` 处理器里约有 85 个能到达 system()/popen()。
> - **验证边界：** 研究环境跑不起这套用户态：QEMU 用户态模拟触发 SIGBUS，全系统模拟未搭建成功。作者改为逐字节重建 sprintf 的输出，再交给 `/bin/sh -c` 执行复现，得到由 root 所有的 marker 文件（内容为 `uid=0(root)`），并用无元字符的 `ateFunc=11b` 做阴性对照，验证不会误报；setup 向导免认证状态属于静态推断，并未实际触发。
> - **检测与修复：** 最可靠的单一指标，是 shell 报出 `/bin/rftest_old.sh` 不存在。修复应按类别处理：从发布版本中移除该注册，用 `execve` 加 argv 或环境变量替代 sprintf+system，对字段做 strtol 严格取值域校验，让 webs 降低权限，出厂密码强制修改，并添加回归测试（提交 `$(id)` 断言被拒绝，同时 `11b` 仍能走通）。

## Full Disclosure mailing list archives

## \[0day-rubbish\] Edimax BR-6478AC firmware v2.20 authenticated command injection in the formWlanMP manufacturing-test handler, root command execution (7.2)

* * *

*From*: disclosure via Fulldisclosure <fulldisclosure () seclists org>  
*Date*: Tue, 20 Oct 2026 02:30:16 +0000  

* * *

````sql
0day Rubbish Research Team is publicly disclosing a vulnerability in the
Edimax BR-6478AC, firmware image BR6478AC_v2.20.bin, the dual-band AC1750 SOHO
wireless router from Edimax Technology Co., Ltd. (Taiwan). A single
authenticated POST to a manufacturing radio-calibration route that is still
registered in production firmware reaches system() with thirty raw request
fields interpolated into one command line, and the web server process that
executes it runs as root.

Type and root cause. CWE-78, OS command injection, in the formWlanMP handler
of bin/webs, the embedded GoAhead-style HTTP server that serves the management
interface on TCP port 80. The binary is ELF 32-bit big-endian MIPS, MIPS-I,
uClibc, stripped, 762904 bytes, SHA256
ec39c0f9332361e37ab92f1999ac5f00f5742dd6db75f7cb26c0652cfedb32a1, from a
SquashFS root filesystem of roughly 2.3 MB with an internal build timestamp
from 2015. The registration websFormDefine("formWlanMP", ...) at 0x477a1c
publishes POST /goform/formWlanMP, whose handler at 0x462a24 reads thirty
radio automatic-test-equipment and EEPROM calibration fields through
websGetVar at 0x412a7c, reached via the function-pointer table entry at
0x4c6b18: ateFunc, ateGain, ateTxCount, ateChan, ateRate, ateMacID,
e2pTxPower1 through e2pTxPower7, e2pTx2Power1 through e2pTx2Power7,
ateTxFreqOffset, ateMode, ateBW, ateAntenna, e2pTxFreqOffset, e2pTxPwDeltaB,
e2pTxPwDeltaG, e2pTxPwDeltaMix, e2pTxPwDeltaN and readE2P, plus a submit-url
field. Every one of them is formatted, raw, into a single command line by
sprintf at 0x462fd0 using the format string at 0x4a0d98,

/bin/rftest_old.sh %s %s ...    (thirty %s conversions)

and the result is handed to system(buf) at 0x46308c, whose PLT stub sits at
0x490020 with relocation 0x18b. Between websGetVar and system there is no
validation of any kind: no atoi, no inet_aton, no strchr, no isdigit, no
strcspn, no character filter, no length check beyond buffer capacity, no
argument quoting and no switch to an argv-style exec. The only transformation
on the path is cosmetic: an empty field is replaced with the literal word null
so that argument positions stay aligned. That is filler, not a filter, and it
removes no shell metacharacter.

system() is not an exec of the named program; it is fork plus execl of /bin/sh
with -c, so the entire shell grammar is available to the payload and no
quoting exists to escape out of. Command substitution with $(...) is evaluated
during expansion, before the simple command is looked up, which is the payload
used here; backticks are equivalent; a semicolon terminates the current
command; a pipe or an ampersand turns the line into a pipeline or a background
job, with a trailing hash neutralising the rest of the format string; and an
embedded newline is a command separator that websGetVar does not strip,
because it removes only a trailing one. A field value of ateFunc=$(id >
/tmp/marker) therefore runs id first.

The shipped root filesystem contains rftest.sh but not rftest_old.sh, so the
command word in the constructed line does not resolve and the shell exits 127.
This looks like a mitigation and is not one: expansion precedes program
lookup, so the injected command has already executed by the time the shell
reports the missing script. The replication run reproduced exactly that exit
status alongside a correctly written marker file. The practical consequence
for anyone auditing this handler family is that no deny-list approach can
succeed here, because the payload space is the whole shell grammar and the
interpolation is unquoted; only removing the interpolation or removing the
shell helps.

Authentication and reach. The route requires a valid administrative session in
normal operation. The gate auth_authorize at 0x404d00 reads configuration
object 0x1bc, the setup-wizard flag, through apmib_get; once the device is
past setup the security store at 0x4c7004, a single / entry of type Basic
registered from the directive "Auth / /etc/boa/boa.passwd" by the Auth handler
at 0x40814c, covers every /goform/ path with HTTP Basic authentication. The
product has no second, lower-privileged role: one realm entry, one password
file, one account, an Allow directive handler in this build that is a
non-functional stub answering "This version of Boa doesn't support access
controls", and a shipped configuration carrying one Auth directive and no
Allow directive. Privileges Required is therefore High, not Low.
/goform/formWlanMP is not one of the four routes carrying a post-boot uptime
gate (/mp.asp, /goform/mp, /advanced_management.asp and
/goform/formAdvManagement, which redirect to /index.asp once /proc/uptime
exceeds 600 seconds), so unlike the neighbouring manufacturing route it is
reachable at any time while the device is running.

Execution identity. The calling process is webs and webs is root, because the
shipped etc/boa/boa.conf declares User root, the same file whose AddType
application/x-httpd-cgi asp entry binds .asp pages as CGI. The server is
started by the boot path cleanlog.sh:131 invoked from init.sh:1115 during
early init, writes /var/run/webs.pid, which on this root filesystem requires
root to create, and performs no setuid, chroot, namespace or capability drop.
The landing identity is uid=0(root) and no privilege escalation is involved:
the executing process is already root.

Scope of the pattern. This is one instance of a broad construction rather than
an isolated slip. A count of the shipped registration table found 91
/goform/form* handlers, of which roughly 85 reach a system() or popen() call.
Two further sinks were examined and are reported without a score: the
uptime-gated manufacturing route /goform/mp, which is exploitable in principle
but confined to a 600-second post-boot window and carries the same
factory-test character, and the miniigd UPnP IGD daemon on UDP and TCP port
52869, whose SOAP surface has a command sink that is unauthenticated but
LAN-only under the shipped firewall policy. Four candidates that yielded no
established request-controlled path to command execution are named as excluded
rather than dropped silently: formrefresh, formAutoFWupgrade,
formPreventionSetup and wscd.

Severity. The published score is 7.2 High,
CVSS:3.1/AV:N/AC:L/PR:H/UI:N/S:U/C:H/I:H/A:H, from ISS = 1 - 0.44^3 =
0.914816, Impact at S:U = 6.42 x 0.914816 = 5.873119, Exploitability = 8.22 x
0.85 x 0.77 x 0.27 x 0.85 = 1.234708 and Base = Roundup(5.873119 + 1.234708) =
Roundup(7.107826) = 7.2. The provenance of that number is disclosed because it
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
High, from Exploitability 0.705547 and Base Roundup(6.578666), because nothing
about success depends on a condition outside the attacker's control: no race,
no window, no memory layout, no gadget, no user-specific state. An
adjacent-only reading is published as an alternative rather than rejected
outright, at 6.8 High on AV:A from Exploitability 0.900610 and Base
Roundup(6.773729), and it is the honest description of a stock device whose
WAN-side input policy drops new connections: the shipped firewall script sets
a default DROP input policy at firewall.sh:187, drops WAN-originated SYN at
firewall.sh:180 and accepts input on other interfaces at firewall.sh:189. AV:N
is retained because the service is bound to the device's own network stack and
is addressable over IP by every host on the segment the router serves,
including guest wireless clients and anything bridged or compromised behind
it, and because two ordinary documented product features, remote management on
the WAN side and forwarding port 80, move an attacker to the open internet.
Default internet exposure is not claimed anywhere.

Two readings at 9.8 Critical are published as explicitly labelled conditionals
and are never the headline. The first applies where a deployment still accepts
the factory credential shipped in the firmware, and it is reasoned rather than
demonstrated: no physical device was authenticated against, so the path is an
inference from the shipped password file plus the injection proven at the
sink, and its Scope Changed variant, which computes to 10.0, is deliberately
not published for the Scope reason above. The second applies to a device still
in its pre-configuration setup state: when configuration object 0x1bc reads
zero, auth_authorize returns success without issuing a challenge for any path
outside /mp.asp, /index.asp and /, at 0x4052d0, while /generate_204 answers
204, which is captive-portal behaviour. Three shipped artefacts identify that
state as the setup wizard rather than normal operation: formwizResetDefault at
0x44cdbc resets the device and displays Resettowizard, formWizSetup prints NO
- LOGIN-WEB when the flag is set to 1, and management pages such as
web/inter_wan.asp:214 and web/admin_timezone.asp:95 read the same flag to
switch their interface. That branch is structural inference only, read from
the binary and never exercised, and the state ends when setup completes; an
early pass of this research misread it as an unauthenticated post-setup state,
and the correction downgraded the finding to PR:H. If the window has to be
contested rather than simply found open, the reading is 8.1 High from
Exploitability 2.221167 and Base 8.094286.

The factory credential is a separate weakness and not the vector. The image
contains a populated /etc/boa/boa.passwd in a read-only SquashFS filesystem,
referenced by the single Auth directive in etc/boa/boa.conf, and the model's
published factory login is admin:1234. It is reported as CWE-798 in its own
right, without a score, because scoring it inside this advisory would
double-count it against the first conditional reading. Two limits are stated
rather than smoothed over. First, no cryptographic match between the shipped
digest and any specific password is claimed: the digest string captured during
analysis was recorded incompletely, so no comparison was published, and the
weakness rests on the artefact, a pre-populated shared credential store inside
the firmware image, plus the widely published factory login. The digest
algorithm is MD5-crypt. Second, the single account entry in the image examined
is recorded under the name root while the model's published management login
is admin; because no device was ever authenticated against, which user name
the HTTP realm accepts was not established, and no specific username is
asserted as verified. Nothing rated here turns on that detail. Absence of
privilege separation is likewise reported separately as CWE-250: bin/webs
serves untrusted HTTP input while running as root, which is what converts
every injection in the handler population into full-device takeover.

Verification method, and its boundary. This is the load-bearing limitation of
the research and it is published prominently rather than buried. No physical
device was powered on and no end-to-end HTTP request was ever accepted by the
product. The HTTP leg, being request parsing, the authentication gate, form
registration, handler dispatch and the complete absence of validation between
source and sink, is evidenced at instruction level from the shipped binary,
its configuration and its boot scripts, and was confirmed by two independent
review passes: one re-deriving the sink from the binary without reference to
the original analysis, and one attempting to refute it by searching for a
missed validation function, a second sanitising branch inside the handler, or
evidence that the registration is inert or the path is not dispatched. The
refutation attempt returned no refuting evidence. The execution leg is
evidenced dynamically by replication of the sink semantics rather than by
detonation. The firmware targets MIPS 32-bit big-endian with a uClibc C
library and a board-specific bootloader, and that userspace could not be
booted end to end in the research environment: running the extracted binaries
under the available user-mode translator faulted with SIGBUS and full-system
emulation of the board was not brought up. Rather than publish a static-only
claim, the operation the vulnerability consists of was replicated. The
question under test is not the device but whether a shell evaluates a command
substitution inside the argument list of a command whose program word does not
resolve, when that string is handed to /bin/sh -c. That is a question about
POSIX shell semantics, which are architecture independent, combined with the
exact format string and argument order read out of the shipped binary. The
string that sprintf produces at 0x462fd0 for a request whose ateFunc field is
$(id > /tmp/marker_fwmp) and whose other twenty-nine fields are empty, hence
null, was reconstructed byte for byte and handed to /bin/sh -c in an isolated
POSIX sandbox in which the invoking shell ran as root.

The request that reaches the sink looks like this, line-wrapped for reading
and transmitted as one URL-encoded string:

```
POST /goform/formWlanMP HTTP/1.1
Host: <target>
Authorization: Basic <a valid credential for the realm>
Content-Type: application/x-www-form-urlencoded
Connection: close

ateFunc=$(id>/tmp/marker)&ateGain=&ateTxCount=&ateChan=&ateRate=&ateMacID=&
e2pTxPower1=&...&e2pTxPwDeltaN=&readE2P=&submit-url=/wlan_mp.asp
```

That run produced a 39-byte marker file owned by root:root containing
uid=0(root) gid=0(root) groups=0(root), alongside the shell diagnostic
"/bin/sh: line 1: /bin/rftest_old.sh: No such file or directory" and an exit
status of 127. A benign control, ateFunc=11b, a two-character calibration
token containing no shell metacharacter, ran through the identical code path
and produced no marker with the same exit status, which establishes that
status 127 and marker creation are independent facts and that the harness does
not emit false positives. The same replication was then run on a workstation
under an ordinary unprivileged user account and reproduced the semantics at
that account's identity, which rules out the alternative explanation that
something about running as root caused the marker to appear. Three properties
remove the remaining explanations for a marker appearing: the benign value
produces none, the harness removes any pre-existing marker before each run and
deletes its scratch directory afterwards, and the two independent runs
produced different ownership on the marker, which is what a genuinely executed
id would do and what a harness artefact would not. The on-device landing
identity of uid=0(root) is inferred from the shipped User root directive plus
the root-identity replication and is not an observation from hardware. No
radio or calibration behaviour was tested, no setup-state request was sent,
and no dictionary or credential attack was attempted.

Impact. Arbitrary root command execution from a single request, with no
payload upload, no race and no second vulnerability required. Root on this
device means every stored secret: the administrator password file, wireless
pre-shared keys and per-station key material, PPP / PPTP / L2TP credentials
kept in the configuration store, VPN parameters and any certificate or key on
the filesystem. It means control of the configuration and routing plane:
firewall and NAT rules, the DNS resolver handed out to clients, DHCP leases
and a malicious default gateway, port forwards, wireless SSIDs and channels,
and the WAN uplink itself, which is enough to redirect, drop or silently
forward traffic for every host behind the router and to turn one compromised
router into a credential and browser-hijack primitive for all of them. It
means firmware-level persistence, since root can write the flash-backed
configuration area and install a boot-time startup mechanism, so a compromise
survives reboots and can survive a partial configuration reset, and recovery
then requires a full reflash of a known-good image. And it means availability
at will over wireless, routing, DHCP, DNS and the management service. There is
no rate limit on the handler and no lockout was found in the Basic realm, so
the route is repeatable and idempotent and leaves no alert behind, which also
means an operator who has rotated away from the factory password still faces
dictionary pressure on a single-account realm.

Detection is poor by construction. A POST to /goform/formWlanMP carrying
thirty ATE fields and submit-url=/wlan_mp.asp is exactly what the vendor's own
shipped management page sends, so the request alone is not anomalous; the
anomalies are that a non-factory user is submitting a factory form, and that
one field of a numeric-only form contains $( or a backtick or a semicolon or a
pipe or a newline. The most reliable single indicator is a shell diagnostic
reporting that /bin/rftest_old.sh does not exist, which is the fingerprint of
this payload reaching this specific sink, because the shipped image does not
contain that script. Marker files under /tmp are volatile on a router, since
/tmp is a tmpfs that does not survive a reboot, so a reboot is also an
anti-forensic step available to an attacker. New outbound connections from the
router, or a change in the DNS resolver being handed out by DHCP, are
post-exploitation indicators rather than request-level ones.

Remediation, in the order that removes the class rather than the instance:
drop the websFormDefine("formWlanMP", ...) registration at 0x477a1c from
release builds, or gate it behind a factory-only build target or a signed
local token read from the serial console, because a field that names a shell
script and takes thirty unvalidated parameters should never be exposed on a
management port; replace the sprintf and system pair at 0x462fd0 / 0x46308c
with a direct execve where each request field becomes one argv element, or
pass values through the child's environment, since neither has a shell in the
loop, and apply the same change across the roughly 85 command-execution
instances in bin/webs; validate the thirty ATE fields against their real
domains with strtol or strtoul plus an explicit range check, or a strict
allowlist, rejecting the request rather than blacklisting characters; drop
privileges in the web server rather than declaring User root; separate
manufacturing and diagnostic handlers behind a distinct role or a
serial-console-only path so that a stolen management credential does not also
buy a factory tool; force a password change on first session or provision a
unique per-unit password at manufacturing, store it with a memory-hard digest,
and add rate limiting and lockout to the Basic challenge; keep WAN-side
management off by default as a documented product decision rather than as a
side effect of a firewall script; and ship a regression test that submits
ateFunc=$(id) and the semicolon, pipe and backtick variants to the route and
asserts a validation rejection, no marker file and no spawned shell, while
also asserting that a benign ateFunc=11b still reaches the calibration path so
the fix cannot be satisfied by silently disabling the handler.

Operator measures until firmware exists: change the factory password
immediately; never expose the management interface to a WAN address, a reverse
proxy or a port forward, and turn remote management off; place the management
address on a dedicated VLAN or restrict it to named hosts at the upstream
firewall; keep guest wireless clients on their own segment away from the
management subnet, because a guest client that holds a management credential
is the most likely starting position; and treat a device still running
firmware of this vintage as end of support and plan replacement, since the
vendor's ability to ship a fix for a build this old is limited. The vendor's
own published material is consistent with that framing: a public security
notice for its legacy BR-series router models states that because of the age
of those hardware platforms and their discontinued status it will not be
developing new firmware updates or security patches for them, and a public
end-of-service announcement names discontinued models and states that firmware
updates, technical support and services are no longer available for them. The
image analysed here identifies itself as BR-6478AC_v2.20, which by its naming
is a different firmware line from the separately marketed BR-6478AC V2 and V3
hardware revisions, so the vendor's coverage statement for this exact build is
an open question that was put to the vendor rather than assumed either way.

Proof of concept. The published tool is Python 3 using only the standard
library, with no third-party dependency and no hardcoded target, and it is
deliberately built so that it cannot be used accidentally against a live
network. Its default mode is replication: it reconstructs the exact string the
device's sprintf would produce at 0x462fd0 and hands it to /bin/sh -c locally,
asserts that the injected command substitution executes by finding a marker
file containing uid=, runs a benign field value as a negative control and
asserts that nothing executes, and prints RESULT: PASS only when both
assertions hold. It is that replication mode, not a device run, that produced
the evidence described above. A --send mode additionally POSTs the request to
a --target argument and is refused for any non-loopback target unless
--allow-remote is given; --print-request prints the exact HTTP request that
--send would transmit and makes no connection at all. It takes --username and
--password for the Basic realm, --field to choose which of the thirty
calibration fields carries the payload, --cmd for a single non-destructive
command defaulting to id, --marker for the marker path, --submit-url
defaulting to /wlan_mp.asp, --user-agent and --timeout. Safety rails are
loopback-only by default, one non-destructive marker command, no callback
listener, no reverse shell, no persistence, no configuration change beyond
what the product itself performs for this form, and removal of every local
marker file the run created. The factory password appears in it only as a
placeholder default so that the request shape is self-documenting; the
injection does not depend on it. Use it only against systems you own or are
authorised to test.

A second, independent command injection on the same product and the same
firmware image is published alongside this one, in the WAN-configuration
handler setWAN, which reaches sprintf at 0x441ee8 and system() at 0x441f1c
through POST /goform/setWAN with a single-character semicolon filter that a
pipe-and-hash payload defeats completely. It is a different handler, a
different format string, a different sink address and a different sanitiser,
so a patch to one does not close the other. It also carries a static
comparison against a second Edimax firmware image whose setWAN implementation
matches instruction for instruction, reported as evidence that the defect
lives in a shared software component rather than in one product's build. That
advisory is at the second URL below and neither finding is a variant of the
other.

Edimax Technology Co., Ltd. was notified through the technical-support mailbox
its own public end-of-service announcement publishes, which is the only
channel used. No RFC 9116 security.txt is served on the vendor's primary web
host, the request returning a redirect into the site's own index rather than a
document; the vendor does publish a Security Notice page for its legacy
BR-series routers, whose stated route for questions from users is a consumer
support form requiring a personal name and telephone number with a
problem-category list containing no security option, and that form was
deliberately not used for this report. No product security team address,
security response statement or vulnerability reporting policy was found on the
vendor's live hosts, and no individual was addressed by name. The vendor was
asked where security reports on its firmware belong and was told that the
published advisory would be amended to record whatever it publishes about
model coverage and support status. This disclosure is unconditional: the
research is published, no permission was asked for, no embargo was requested,
nothing is withheld pending a reply, and remediation questions are answered at
no cost. No vulnerability identifier has been assigned to this finding.

Full technical analysis and the reproducible proof of concept, published
unconditionally:
  https://0day-rubbish.com/blog/edimax-br-6478ac-formwlanmp-command-injection-root-rce

Companion advisory for the same product, different handler:
  https://0day-rubbish.com/blog/edimax-br-6478ac-setwan-command-injection-root-rce

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
