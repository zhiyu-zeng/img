---
title: "Full Disclosure: [0day-rubbish] Auerswald COMmander 6000 / 6000R 8.6D unauthenticated provisioning import zip-slip to root binary hijack and root code execution (9.8)"
source: https://seclists.org/fulldisclosure/2026/Oct/13
source_host: seclists.org
clip_date: 2026-10-15T16:02:35+08:00
trace_id: 74c4498d-8d53-4ed9-95a5-9f3d608b44c6
content_hash: c307adb3c339f0bad07c4498a8b810026b6253630677b5836b234779094b1905
status: synced
tags:
  - 漏洞分析
  - 固件安全
series: null
feed_source: Full Disclosure·漏洞披露
ai_summary: "**TL;DR：** Auerswald COMmander 6000/6000R 固件 8.6D 存在未认证 zip-slip 路径穿越，可覆写 root 二进制并经诊断接口执行，直接取得 root。"
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3fa75244-d011-81e2-ae30-ebeae99c276f
ioc:
  cves: []
  cwes:
    - CWE-22
    - CWE-250
    - CWE-434
    - CWE-73
    - CWE-78
    - CWE-862
  hashes:
    - 0ba0ffbfa56bab00e7d12a4cb0b8fcd4
    - 36eb80de5ac55a8bbfc31e77c1d10e3d
    - afc33cdf96b060e636c463e622b6ae1b
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> **TL;DR：** Auerswald COMmander 6000/6000R 固件 8.6D 存在未认证 zip-slip 路径穿越，可覆写 root 二进制并经诊断接口执行，直接取得 root。
> 
> - **两跳漏洞链：** 未认证路由 `/provisioning_data_import` 接收 multipart 上传后以 root 调用 `miniunz -o -x` 解压至 `/data/provisioning/import/`，因不校验条目名，`../../../opt/auerswald/hping2` 可逃逸覆盖 root 所有的 0755 二进制；随后 `/netdiagnostic_execute` 以 root 执行该文件，回显 `uid=0(root)`。
> - **根因与误区：** 主因是 CWE-22 zip-slip，叠加 CWE-73/434/862/250，**不是**命令注入——参数白名单 `0-9A-Za-z.-:/` 工作正常，缺的是归档边界约束与路由鉴权；`-o` 标志把拒绝覆盖默认变为静默覆盖。
> - **认证缺失是系统性：** 路由表 750 条中仅 12 条经会话校验，其余 738 条无 Cookie 即返回 200；同一处理函数 `0x3b018` 以不同路由名注册时分别返回 200 与 401，说明鉴权绑定路由族而非操作本身。
> - **验证边界：** 只是 qemu-arm 用户态模拟 ARM rootfs（固件 8.6D build 128154），无真机、请求走 loopback；用"良性/穿越归档 × 原始/被劫持二进制"四象限交叉及写入管理员密码后的复测排除假阳性。
> - **修复与缓解：** 在解压边界拒绝 `..`、绝对路径与符号链接条目（同一助手另一调用方同样受用），停止传 `-o`，鉴权改默认拒绝并引入权限分离；临时措施为管理口 VLAN 隔离、校验 hping2 与 miniunz 摘要、告警未认证 POST 组合。

## Full Disclosure mailing list archives

## \[0day-rubbish\] Auerswald COMmander 6000 / 6000R 8.6D unauthenticated provisioning import zip-slip to root binary hijack and root code execution (9.8)

* * *

*From*: disclosure via Fulldisclosure <fulldisclosure () seclists org>  
*Date*: Tue, 13 Oct 2026 02:21:03 +0000  

* * *

```swift
0day Rubbish Research Team is publicly disclosing a vulnerability in Auerswald
COMmander 6000 and COMmander 6000R, firmware 8.6D build 128154, the
closed-source enterprise IP-PBX and unified-communications appliances from
Auerswald (Germany). Two unauthenticated HTTP requests, carrying no cookie and
no credential of any kind, yield uid=0(root) gid=0(root) groups=0(root) on an
appliance that holds extension credentials, SIP trunk credentials, call detail
records and voicemail for every user it serves.

Type and root cause. CWE-22, path traversal in the zip-slip form, inside a
root archive extraction; CWE-73, CWE-434, CWE-862 and CWE-250 contribute. The
finding is explicitly not classified as CWE-78, and this is worth stating
because it changes the fix: no command string is injected at either hop, and
every argument to every observed execve is either a compile-time constant or a
value that passed the product's own whitelist legitimately. Escaping and
character whitelisting are already implemented correctly in this product. The
missing controls are archive containment and route authorization, and a
command-injection patch would close nothing.

The chain has two hops and both are needed. Hop 1 is the write primitive: the
unauthenticated route /provisioning_data_import stores one multipart/form-data
part at /data/provisioning/import/<basename> and then spawns, as root,

    posix_spawn("../minizip/miniunz", "-o", "-x", <zip>, "-d",
                "/data/provisioning/import/")

captured verbatim from the syscall trace of the product's own process. Neither
the application nor the bundled extractor inspects archive entry names, so an
entry named ../../../opt/auerswald/hping2 escapes the extraction directory and
overwrites a root-owned mode-0755 binary with attacker bytes. Because the write
truncates an existing file, the original permission bits survive and the result
is immediately executable; there is no separate chmod primitive and none is
needed. The -o flag is what makes the replacement silent, converting the
extractor's refuse-to-clobber default into clobber-without-prompt. Hop 2 is the
consumer: a second unauthenticated request to /netdiagnostic_execute makes root
run

    /bin/sh -c "/opt/auerswald/hping2 -1 -I eth0  -c 3 <target> -p <port>"

The diagnostics handler validates the target argument against the charset
0-9A-Za-z.-:/ and that whitelist works as intended; what it cannot protect is
the bytes sitting at a path that appears as a compile-time constant in the
command. The kernel honours the attacker's #!/bin/sh shebang, and the payload's
stdout is captured into the HTTP response body, so the result is read back
directly and no out-of-band channel is involved. Both handlers live in the
vendor's own in-house FastCGI application, a 3,498,560-byte binary started by
init as root behind a stock lighttpd 1.4.64 on an ARM32 glibc embedded Linux
userland, which never drops privilege. The rootfs contains no suid or sgid
binary at all, so there is no privilege boundary between the web application
and the operating system.

How confirmation works. Request 1 is a multipart POST whose part name is equal
to the filename. That is the vendor's own client contract, recovered from the
shipped JavaScript, which appends the file object to a FormData under the
file's own name; requests built the conventional way with a fixed field name
are rejected by the application's parser, and that failure is indistinguishable
from "the server filters uploads" unless the client is read. Request 2 is an
ordinary urlencoded diagnostics POST. The payload echoes a run-unique token
plus the uid and user name to stdout, which the handler returns in the response
body, and appends the output of id to a marker file under /data/log. The
published advisory prints the identity string and the landing paths but
deliberately not the per-run token or a marker filename from a specific run,
since both are artefacts of one execution on one testbed.

What was deliberately not reproduced. No persistence was installed. The same
write primitive reaches the init-respawned service scripts under
/opt/auerswald/scripts/run-*, the lighttpd configuration and the web document
root; those targets are named as statically available so that a defender can
scope an incident, and none was fired. No configuration database, certificate,
private key, credential or call record was read or removed, and no destructive,
encrypting or exfiltrating payload is published. One elegant approach was tried
and does not work, which is recorded here because it is a reproduction trap:
overwriting the extractor itself so that the next import request executes the
payload. The slip write happens inside the currently executing extractor
process, the target file ends up zero bytes long, and the next invocation fails
with ENOEXEC. The doctrine that follows is to never overwrite a binary that is
executing the write.

A correction to our own earlier reading of this chain, published because it was
wrong and a maintainer could otherwise chase it. During this work we
hypothesised that the rejections of conventionally built uploads were caused by
the web server not spooling request bodies to an upload directory, rather than
by the part name. That hypothesis is withdrawn. mod_fastcgi forwards the body
to the backend over the FastCGI STDIN stream whether or not it spools to disk,
the application parses that stream itself, and once the part name matched the
filename the bytes were stored correctly on the first attempt. Nothing about
the web server configuration was blocking the upload, and a change that added
an upload directory directive would not have altered the outcome.

Scoring. One score is published: 9.8 Critical,
CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H. The Impact Sub-Score is
1 - 0.44^3 = 0.914816, Impact under Scope Unchanged is 6.42 * 0.914816 =
5.873119, Exploitability is 8.22 * 0.85 * 0.77 * 0.85 * 0.85 = 3.887043, and
the sum 9.760162 rounds up to 9.8 under the CVSS ceiling-to-tenth rule.

An alternative reading is argued in the advisory and not adopted as the
headline: Scope Changed. A network-facing management service yielding host-wide
root on an appliance that also holds call records, extension credentials and a
managed phone fleet is the kind of outcome Scope Changed was written to
express, and AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H computes to 10.0 - the
Scope-Changed impact term is 6.128026, exploitability is unchanged at
3.887043, the sum times 1.08 exceeds the maximum and is capped. We publish
Scope Unchanged because of one fact: the application is already uid 0 by
design, and the rootfs contains no suid or sgid binary because the vendor's
design never needed one, so there is no authority boundary between the web
component and the telephony component for the chain to cross. It exercises,
through a defect, an authority the vulnerable component already held.
Publishing 10.0 would attribute a boundary crossing this product's architecture
does not have, and would obscure the more useful message to the maintainer: the
privilege separation that would make Scope Unchanged the comfortable answer is
itself a fix worth making.

AC:L is a decision, not a default. There is no race, no timing window, no
memory-layout dependency, no on-path position, no brute force and no dependency
on the hardware abstraction layer, and the chain was demonstrated twice, in the
freshly initialised state and again in a tightened state described below. The
one non-obvious requirement, the part-name-equals-filename contract, is
attacker-side correctness recoverable from the vendor's own shipped client
rather than an environmental condition. Amplifier facts observed elsewhere in
the image - an empty root password field in /etc/passwd with no /etc/shadow in
this image, the telnet facility behind an AccessLevel 6 route, a site-wide
unsafe-inline CSP, an unenforced client certificate on the provisioning socket -
are kept out of the arithmetic and reported separately, because folding them in
would inflate the vector. No CVSS figure was recorded alongside the
verification, so there is no recorded number for this vector to disagree with.

Authentication: none, and that is proven rather than assumed. Both routes are
declared AccessLevel 2 in the product's own route table and both answered 200
to a request carrying no Cookie header and no Authorization header, not an
expired session but no session material at all. The route table in .data holds
750 named entries, and the product's gate - one session and credential
evaluator at 0x15958, which is the sole caller of the access check at 0xf5d68 -
covers the service-technician family (AccessLevel 4), the DAA/daemon family
(AccessLevel 6), the two packet-capture routes registered under those families
and one login route: twelve of 750. The remaining 738 answer 200 to a
cookie-less request, and more than forty of them were sampled during mapping,
each returning live configuration data or performing a state change. lighttpd
contributes nothing to authorization: its FastCGI configuration sends every URL
to the backend socket, and three probes with no referer, with the ip-editor
referer and with an unrelated referer produced no access difference.

The strongest internal evidence that this is a systemic coverage gap rather than
two unlucky omissions sits on a single shared handler. FUNC 0x3b018, which
streams a packet capture back to the caller, is registered three times under
three names: ethernettrace.pcap at declared level 2 answers 200, starts a root
tcpdump on eth0 with snaplen 9018 and streams the capture to the requesting
client, while servicetrace.pcap at level 4 and daemontools.pcap at level 6 both
answer 401. Same function address, same code, opposite outcome, so
authorization in this product is attached to route families rather than to the
operations those routes expose.

What was not broken is credited explicitly. The login route is fail-closed:
four password values across four parameter alias sets each produced an empty
cookie. The vendor service-technician challenge is not forgeable from the image
because verification is public-key only, against two DER SubjectPublicKeyInfo
blobs shipped in the firmware, and the device holds no private key; the
response space is also only 65536 wide with a four-attempt lockout, so it is
not brute-forceable either. The ForceAdmin and BEARER branches of the session
evaluator were not read instruction by instruction, so no claim is made about
them in either direction - unexamined is not disproved, and this chain does not
depend on them. The declared AccessLevel value in the route table is not the
enforced level, and the product's own data proves it: the DAA login route is
recorded at level 0 and answers 401. We do not claim that all 738 unguarded
routes are individually dangerous; we map the population and prove the two
members this chain needs.

Impact: complete control of a device that terminates and records every call it
serves. Root here means the SIP stack, the voicemail and voice-mail
distribution components, the DSP channel configuration, trunk configuration and
every extension the appliance serves, so calls can be placed, redirected,
recorded or dropped. The configuration database under /data/db/ carries fields
including cryptPasswd, passwd, passwdLdap, AdminPasswd, AdminPasswdHash,
passwordHash and remote_access_token; user certificate private keys sit under
/data/certs/user-certs; SIP trunk and gateway credentials live in the
provisioning data; and toll fraud is the standard real-world monetisation of
exactly this position, usually discovered on an invoice rather than through a
security alert. Call detail records, billing structures and voicemail content
for every user become readable - who called whom, when, for how long and at what
cost - which for an organisation whose calls carry customer, legal, medical or
financial content is a reportable data-breach event. The appliance auto-provisions
its phone fleet from templates under /opt/auerswald/provisioning/ and
/data/provisioning/, so root on the PBX becomes control of every managed
handset's configuration, including credentials and firmware locations.
Firmware, updater and boot paths are root-accessible, so the compromise can be
made to survive an update cycle. The image ships tcpdump, hping2 and pcap
tooling, which turns the appliance into a sniffing point and a pivot into
adjacent voice and management segments. Availability of the voice path, of the
configuration database and of the web document root is at the attacker's
discretion.

Verification boundary, stated plainly, and it is wider than a live-device test
would be. This is user-mode emulation of the shipped ARM rootfs, not a physical
appliance. No COMmander 6000 or 6000R hardware was used at any point. No
request in the verification came from a separate network host either: the HTTP
client and the appliance stack shared one machine and communicated over a
loopback-only host port, so no packet traversed a wire and remote reachability
was not measured from a second host. What the boundary does support, and all it
supports, is that nothing in the product distinguishes a loopback client from a
remote one at either hop - both requests are ordinary inbound HTTP to the
management listener and neither handler contains source-address logic.

What the harness supplied, and what it did not. The vendor binaries were
unmodified: the application binary, the vendor's own ARM lighttpd 1.4.64, the
bundled miniunz extractor (36eb80de5ac55a8bbfc31e77c1d10e3d, 63,260 bytes, mode
0755) and hping2 (afc33cdf96b060e636c463e622b6ae1b, 74,376 bytes, mode 0755),
each re-verified by digest at the conclusion of the work. The rootfs was
extracted from the shipped image 8_6D_000_COMmander60xx.rom - 60,719,362 bytes,
md5 0ba0ffbfa56bab00e7d12a4cb0b8fcd4, a single ext2 filesystem at offset 588
inside a u-boot uImage, volume label 8.6D_000_128154. /data was initialised by
the vendor's own data-setup routine rather than hand-seeded, producing the
105-table configuration database. The processes ran under unshare -n -m with
private propagation plus chroot into that rootfs, with the application started
as root under qemu-arm user-mode emulation and -d strace recording every
execve. The vendor's own http-parseopts and all four vendor FastCGI semantics
were preserved. Two directives were added to our minimal lighttpd
configuration, an upload directory setting and a request-body streaming
setting; they are harness detail, and the paragraph above is the record that
neither one is what makes the chain work. Nothing at the authorization layer,
the routing layer or the sink was widened, stubbed or patched, and every 401
quoted here is one the product produced on its own.

Consequences of that boundary that we publish rather than gloss over. Under
user-mode emulation the kernel is the host's while the userland is fully the ARM
rootfs, so uname inside the payload reports the emulation host's kernel string
with an armv7l machine field, and the hardware abstraction layer - the 25
vendor kernel modules, /proc/auer entries and the vendor logger device - is
absent. That absence disables application logging and makes the vendor
service-technician challenge channel unexercisable; neither hop of this chain
touches the abstraction layer, so the finding is not weakened, but the reader
should know that the appliance's own logs were not available during the run.
The IPv6 and TLS sockets were not configured in our minimal web server setup.
Only firmware 8.6D build 128154 was analysed and exercised: no other build,
firmware line, edition or Auerswald product family is claimed, the COMpact and
COMfortel lines are separate products, and no earlier image was available
offline to diff against.

Two controls were arranged as a four-quadrant cross over two independent
variables, the archive content and the state of the consumed binary, with each
quadrant measured as its own request pair rather than inferred from the others:

  - benign archive against the pristine binary: both requests 200, the response
    body carries genuine hping2 output, and no marker appears anywhere in the
    tree. This rules out the damaging alternative reading, that the diagnostics
    route by itself produced our proof and that we misattributed a plain
    unauthenticated command execution to the overwrite.
  - slipping archive against the pristine binary: the payload bytes land at the
    target path with the mode preserved and the digest changed, and nothing
    executes. This rules out the claim that the import alone is code execution;
    a consumer is required, which is why this is a two-hop chain and not a
    single-request one.
  - slipping archive against the hijacked binary: 200 on both requests, the
    response body carries the token and uid=0, and marker files appear on two
    independent non-tmpfs locations under /data/log and /opt/auerswald. This is
    the finding, and nothing is ruled out by it.
  - benign archive re-run after the original bytes were written back, with the
    digest re-verified: the proof line is gone and no marker exists. This rules
    out residual state from an earlier run and shows the appliance returns to
    its original behaviour, so the result is a property of file content rather
    than of anything our testing left behind.

Two further falsification probes sit behind that cross. A parameter-name change
on a sibling provisioning export route - one spelling answered 200 while two
other spellings of the same intent answered 500 - shows these handlers are
parameter-sensitive, so a blanket 200 cannot explain any quadrant. And a
distinctive string placed inside a benign archive was later found intact in the
extracted file at the path the handler documents, which proves the bytes our
client sends are the bytes the application stores and closes the alternative
explanation that some intermediary rewrote the body.

The obvious objection to an unauthenticated finding on a freshly initialised
image is that it only works because the device was virgin: no administrator
password set, no extension users, no provisioning data. That was closed
directly rather than argued about. A non-empty administrator password hash was
written into the configuration store - a tightening of the device state, never a
relaxation - both the application and the web server were restarted, and the
whole chain was re-run from a cookie-less starting point. The 401 control set
still returned 401, the level-0 information route still returned 200, both
chain requests still returned 200, and the marker again read uid=0(root)
gid=0(root) groups=0(root) with an inline uid=0. The conclusion drawn is the
narrow and defensible one: this chain does not depend on the administrator
password being unset. One honest limit on that control is published alongside
it - the administrator-account status route continued to echo empty password
fields afterwards, because the value was written at the database layer rather
than through the product's own account-save route, which as it happens returns
a success document without persisting anything. What establishes that the device
was in a configured state is therefore the behaviour, not the echo. Afterwards
the database was restored and its digest re-verified, and both hijacked binaries
were put back and re-verified by digest.

Detection notes. There is no failed login, no 401, no session creation and no
privilege-change event anywhere in the chain, because no authorization check
runs, and the product's own "run shell cmd:" log line records a completely
ordinary diagnostics command, because the command string is ordinary. What is
visible: a diagnostics response body carrying shell output that hping2 cannot
produce; /opt/auerswald/hping2 being a 256-byte text file with a leading #!
instead of 74,376 bytes, or the extractor being zero bytes long; root-owned
mode-0666 files under /data/log/ or /opt/auerswald/minizip/ or anywhere outside
/data/provisioning/; an extractor child of the application process carrying
overwrite and extract-directory arguments at a time when no administrator was
importing provisioning data, and a /bin/sh child whose command names
/opt/auerswald/hping2; and an unauthenticated client sending POST
/provisioning_data_import followed by POST /netdiagnostic_execute. Since neither
route is authenticated, both requests also occur in some legitimate
administrative flows, so it is the combination from a client carrying no session
that matters. The two halves need not be temporally adjacent either - the
overwrite persists on flash storage until something restores the binary - which
makes correlation by proximity unreliable.

Mitigation summary, ordered so that the first item alone closes this chain:
contain archive entries at the extractor boundary, rejecting .. components,
absolute names and symlink entries and requiring the resolved destination to be
a descendant of the resolved extraction directory, and fix it in the helper that
builds the extractor invocation so that both of its callers are covered - the
second caller is the provisioning configurator-download route, which invokes the
identical extraction form and therefore shares the defect by construction. Stop
passing the overwrite flag and extract into a fresh empty directory, letting the
application decide entry by entry whether a destination may be replaced.
Allowlist what a provisioning import may contain, since the legitimate entry
names are already compile-time constants in the binary. Hard-reject writes to
executable locations from any upload path - the /opt, /bin, /sbin, /usr, /etc and
/lib trees - as defence in depth that would have stopped this chain even with
the containment bug intact. Make the access check default-deny for every route
with an explicit allowlist of genuinely public routes, and enforce the
AccessLevel declared in the route table, which is what turns 738 anonymous
routes into a controlled set; the one handler that currently answers both 200
and 401 depending on the route name it was reached under is the cleanest
regression target. Introduce privilege separation, running the application as a
dedicated unprivileged user with minimum capabilities, confining the extraction
helper to the provisioning directory, and mounting /opt read-only or appraising
the vendor tree with dm-verity or IMA. Stop invoking mutable root-owned binaries
from a root shell, by verifying a digest before invocation, by moving the tool to
a read-only mount, or by preferring the argv form of posix_spawn the product
already uses at 39 call sites instead of the 16 sites of its shell-form wrapper.
Fix the administrator-account route that returns success without persisting, so
that operators cannot believe a password was set when it was not. And ship the
two regression tests the advisory specifies: an archive-import test posting
traversal, absolute and symlink entries and asserting rejection while a benign
archive still imports successfully, and an authorization census that walks the
whole route table with no cookies, asserts 401 for every declared level above
zero, and asserts that one handler registered under several names returns one
status code.

Until a patch exists, operators should restrict the management listener to a
dedicated management VLAN or named administration hosts, which is the single
most effective measure available because the chain needs nothing but network
reachability; front it with an authenticating reverse proxy that denies the
import, export, diagnostics, packet-capture, template-rename and locale routes
by path, requiring the proxy's own authentication since the appliance will not
ask for any; verify the digests of /opt/auerswald/hping2
(afc33cdf96b060e636c463e622b6ae1b) and /opt/auerswald/minizip/miniunz
(36eb80de5ac55a8bbfc31e77c1d10e3d), alerting on any change, any size reduction
or any zero-length file, and extend file-integrity monitoring to the whole of
/opt and to /data/provisioning/; watch for root-owned mode-0666 files outside
the data partitions and build request-telemetry alerts for unauthenticated POSTs
to the import and diagnostics routes, since neither produces an authentication
log event; treat the appliance as a tier-0 asset and log it to the SIEM the way
a domain controller is logged; and if compromise is suspected, do not stop at
restoring one binary - re-verify the whole vendor tree and the init scripts,
rotate every credential the device holds including administrator accounts,
extension passwords, SIP trunk credentials, LDAP bind credentials and syslog
credentials, and re-issue device certificates.

Adjacent items, none of them counted in this score. Seventeen further
unauthenticated defects in the same firmware build are being disclosed alongside
this one, including the root packet-capture route whose stream is returned to
the caller, the full configuration-package export, tampering with the phone
provisioning template library, a root mount and umount cycle on the live web
document root, the administrator-account route that reports false success, and
an information-disclosure set. On the configuration export we are explicit
rather than suggestive: the returned stream is encrypted by the product's own
encryption routine and we did not recover its key derivation, so whether an
exported configuration is decryptable by an attacker - and therefore whether
that route is a credential-disclosure defect or an adequately protected export -
is an open question and not a claim. It is the highest-value open item in the
adjacent set, and we name it as such rather than implying a result. Separately,
the unauthenticated information-disclosure facet of the published 2021 backdoor
item on the Auerswald COMpact line is still present in this build while the command-execution facet of that same 
published
item has been removed in the meantime: that is tracked as an adjacent,
already-public item, is not claimed as new, and is never folded into this
finding. The public Auerswald lineage from 2021 contains no item with this root
cause; the closest published relatives differ on the endpoint, the sink, the
traversal carrier and the privilege model. Residual cryptographic and hygiene
weaknesses - a device-wide shipped RSA private key, an expired CA certificate, a
suspected hardcoded LDAP bind string whose network reachability we did not
establish, cleartext syslog credentials, credentials carried in a URL query
string, an unenforced client certificate on the provisioning socket and a
site-wide unsafe-inline CSP - are listed for the vendor's benefit and are proved
no further than that. Nothing in this advisory identifies an individual.

The proof of concept is published in the repository at
product/auerswald/commander-6000-8.6d/provisioning-import-zip-slip-binary-hijack-root-rce/exploit/auerswald_commander_provisioning_zip_slip_binary_hijack_root_rce.py
and uses the Python standard library only. Host, port, scheme, command, both
route names, the target binary, the traversal depth and the marker directory are
all command-line arguments with loopback-safe defaults. It offers a control mode
that repeats the exchange with a benign archive and asserts that no marker
appears, and a restore mode that writes pristine bytes back to the hijacked path
through the same primitive, re-checks that the proof line is gone and compares
against the recorded digest, so that a legitimate operator can validate a test
on their own appliance and then undo it. It ships only the non-destructive
marker script used during verification and no obfuscation of any kind.

Full technical analysis and a reproducible proof-of-concept:
  https://0day-rubbish.com/blog/auerswald-commander-provisioning-import-zip-slip-binary-hijack-root-rce

Project archive (ongoing disclosure series):
  https://github.com/Exploit-Garbage/0day-Rubbish

Auerswald has been notified through the general contact mailbox it publishes
for enquiries and support, with the same technical content and the same
verification boundary as this post. The notification requests nothing in return
and asks for no permission: this disclosure is unconditional, the research is
already public, no embargo was offered or accepted, and nothing is being
withheld pending a reply. No vulnerability identifier has been assigned to this
finding yet.

--
0day Rubbish Research Team
disclosure () 0day-rubbish com
https://0day-rubbish.com
_______________________________________________
Sent through the Full Disclosure mailing list
https://nmap.org/mailman/listinfo/fulldisclosure
Web Archives & RSS: https://seclists.org/fulldisclosure/

```
