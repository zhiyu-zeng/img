---
title: "Full Disclosure: [0day-rubbish] TRENDnet TV-IP302PI firmware 1.02.38 authenticated NTP server-address OS command injection to root command execution via a shell-form system() call (7.2 High, PR:H)"
source: https://seclists.org/fulldisclosure/2026/Oct/34
source_host: seclists.org
clip_date: 2026-10-21T03:30:49+08:00
trace_id: ad6ed26c-ac4c-43e1-a9f6-e5b53e34ffb0
content_hash: 6764eb24d48c91a801d284f57a125b4221134f669a330f136d7b3af752194298
status: synced
tags:
  - 漏洞分析
  - 模拟执行
series: null
feed_source: Full Disclosure·漏洞披露
ai_summary: TRENDnet TV-IP302PI 固件 1.02.38 中管理员可写的 NTP 服务器地址仅校验长度（HTTP 48 字节、ONVIF 64 字节）而不校验内容，被原样拼入 shell 形式的 system() 命令，可注入元字符获得 root 命令执行（CVSS 3.1 = 7.2）。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ff75244-d011-810d-95ba-d4cab96e61cf
ioc:
  cves: []
  cwes:
    - CWE-20
    - CWE-250
    - CWE-269
    - CWE-306
    - CWE-78
    - CWE-798
    - CWE-862
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> TRENDnet TV-IP302PI 固件 1.02.38 中管理员可写的 NTP 服务器地址仅校验长度（HTTP 48 字节、ONVIF 64 字节）而不校验内容，被原样拼入 shell 形式的 system() 命令，可注入元字符获得 root 命令执行（CVSS 3.1 = 7.2）。
> 
> - **根因与汇聚点：** 该值写入配置偏移 0x9c 的 `c64_Ntp_Server`，随后以 `%s` 无引号、不转义地格式化进 `/hunt/msntp -ts %d -r %s &` 并交给 `system()`，经 `/bin/sh -c` 二次解析，命令注入成立的关键在于用了 shell 形式而非 argv 形式调用。
> - **两条写入路径：** HTTP 的 apply.cgi / SetTime.cgi（POST 参数 NtpIP）与 ONVIF `tds:SetNTP`（0x286218–0x286264，直接调用 sink）写同一槽位，属同一漏洞两个入口；仅修 HTTP 表单会留下 ONVIF 缺口。设置回调 0x2b668c 对相同值提前返回，故重复提交同一 payload 不会二次触发，需变化内容。
> - **前提与评分：** 需管理员凭据，HTTP Digest 认证门槛为 fail-closed，明确不属 CWE-306/862；daemon 本身以 uid=0 运行、无降权，因此无提权阶段。7.2 为主评分，PR:L 的 8.8 与出厂口令叠加的 9.8 均标注为未验证的条件性读数，不得引用为本案得分。
> - **验证边界：** 全程未接触真机，仅在解出的 rootfs 内用 qemu-arm-static chroot 复现产品自身模板；分号、`$(...)`、反引号三种向量均生成 root 属主 marker，无害地址 1.1.1.1 对照无 marker。唯一替换是补入缺失的用户态 libc（GLIBC 2.4–2.8）。
> - **检测与修复：** 正常配置写入与合法时间设置无法区分，有效信号是值本身异常、`-r` 参数非主机名、连向非时间服务器的出站连接、web daemon 的非 msntp 子进程；建议在 set 回调统一做 inet_pton/主机名规范化与字符白名单，改用 fork+execv，实施权限分离并强制首次登录设置管理员口令。

## Full Disclosure mailing list archives

## \[0day-rubbish\] TRENDnet TV-IP302PI firmware 1.02.38 authenticated NTP server-address OS command injection to root command execution via a shell-form system() call (7.2 High, PR:H)

* * *

*From*: disclosure via Fulldisclosure <fulldisclosure () seclists org>  
*Date*: Tue, 20 Oct 2026 02:31:46 +0000  

* * *

```sql
0day Rubbish Research Team is publicly disclosing a vulnerability in TRENDnet
TV-IP302PI firmware 1.02.38, the closed-source IP surveillance camera from
TRENDnet (United States). The camera's application daemon is shipped at
/hunt/hunt_server: an ARM 32-bit EABI5 version 5TE soft-float binary,
dynamically linked against /lib/ld-linux.so.3, 4.5 MB and stripped. Its own
string pool carries hunt_camera, HuntAudioConverter, HuntDataDirect and
PPPoE_TV-IP302PI next to the TRENDnet brand identifier, which identifies the
image as built on a Hunt Electronic camera platform OEM'd into this model. That
provenance matters twice: it tells an operator that the same construction may
exist in other products built on the same platform, and it tells a reader that
this finding is specific to that platform's binary, its configuration-key name
and its command template rather than to a generic NTP client.

Type and root cause. OS command injection, CWE-78 primary, with CWE-20 improper
input validation, and CWE-250 and CWE-269 contributing for the privilege shape.
An authenticated administrator who sets the NTP server address has the value
stored verbatim into the configuration parameter c64_Ntp_Server, at offset 0x9c
inside the configuration structure. The only validation applied on the way in is
a length cap: 48 bytes (0x30, via func_0x002a9ae0) on the HTTP form path and 64
bytes on the ONVIF SOAP path. No character is rejected. That same offset is later
read back by the time-synchronisation path, formatted with %s, unquoted and
unescaped, into the command template

    /hunt/msntp -ts %d -r %s &

and handed to system(), which runs the string through /bin/sh -c. The shell
re-parses it, so a semicolon, a $(...) command substitution or a backtick pair
inside what is supposed to be a time-server address terminates the NTP client
invocation and starts an arbitrary command in the daemon's own context. That
context is uid=0(root): the web tier performs no privilege drop, the boa
configuration file shipped in the image declares none, and the runtime
configuration model recovered from the binary contains no unprivileged identity
for the web tier to switch to. There is therefore no privilege-escalation stage
in this chain and none is claimed or needed.

The chain, link by link, with the offsets from the shipped binary.

Link 1 is a configuration write. The parameter table maps the HTTP form field to
the key c64_Ntp_Server, whose set callback at 0x2b668c compares the incoming
value against the stored one, returns early if they match, and otherwise copies
it into the slot. The decompiled shape is a bare strcpy. On a change the callback
raises a configuration event, event 2, through func_0x001ecddc. That event is how
the rest of the daemon learns that time synchronisation needs re-doing, and it is
also why the write itself is the trigger: in the ordinary case no second request
and no wait for a scheduled resynchronisation is required.

Link 2 is command construction. The event handler at 0x371d88, registered inside
fcn.002b700c, and the builder at 0x2760d0, called from the call site at 0x286264,
both read the same offset config+0x9c that link 1 wrote, and format it:

    snprintf(buf, 0x100,
             *p_fmt_at_0x3ded60,  /* "/hunt/msntp -ts %d -r %s &" */
             *(cfg + 0xe4),       /* the -ts flag: server-derived */
             cfg + 0x9c);         /* the address: attacker-supplied */
    func_0x001efbac(handle, 10, buf);   /* enqueue for the worker */

There is no quoting of any kind around the %s. The -ts flag comes from cfg+0xe4
and is not attacker-controlled; the address argument is, completely. That the
write offset and the read offset are the same value is the load-bearing detail of
the static half of this work, because it is what ties the tainted input to the
tainted argument without anyone having to guess at a structure layout.

Link 3 is execution. The enqueue helper func_0x001efbac hands the finished string
to a queue worker that calls system(buf). The identification of system() as the
final executor is STATIC evidence and is reported as such: system is referenced
through the GOT entry at 0xc274, and that GOT slot is what distinguishes a
system() call site from an execve call site with a prepared argv. No dynamic
observation in this research watched the worker choose between the two forms.
Under an argv-form invocation the address would have reached msntp as one
argument element and every shell metacharacter inside it would have been inert
text passed to a resolver, which is exactly why that distinction is the whole
vulnerability rather than an implementation detail.

Two protocols write one slot, so this is one vulnerability with two sources rather
than two vulnerabilities. On the HTTP path the value arrives as POST parameter
NtpIP to apply.cgi or SetTime.cgi inside an authenticated session. On the ONVIF
path the same slot is written by the tds:SetNTP handler at 0x286218-0x286264,
which applies its own 64-byte length check, no content check, and then calls
fcn.002760d0 directly, so on that route the sink sits one call from the entry
point instead of being reached through the event dispatch. A fix applied only to
the HTTP form leaves the ONVIF entry point open, and the ONVIF path's larger cap
is the more comfortable carrier for a longer payload.

What validation is present and what is absent. Present: a length cap and nothing
else. Absent: any parse of the value as an address, no inet_aton or inet_pton, no
hostname-syntax check followed by re-serialisation of the resolved name; no
character allow-list, although for a time-server field the correct alphabet is
roughly [A-Za-z0-9._:-], which excludes every metacharacter in this chain; no
deny-list for the semicolon, pipe, ampersand, dollar sign, backtick, parentheses,
angle brackets, newline, carriage return or quote characters, so nothing rejects
even the crudest payload; no quoting or escaping at the interpolation site; and no
argv-form invocation of /hunt/msntp, which alone would have removed the shell from
the picture and made all four preceding items unnecessary. The shape of the defect
in one line: the value is checked for how long it is and never for what it is. A
length cap of that kind exists to protect a fixed-size configuration slot from
overrunning, and on that job it appears to work. Forty-eight bytes admits every
injection form used in this research several times over, the shortest of which is
17 bytes.

One sanitization-shaped behaviour that is not one is worth knowing before
reproducing this: the set callback's strcmp early-return suppresses the change
event when the new value is byte-identical to the stored one, so posting the same
payload twice does not re-fire the sink. Vary the payload between attempts, for
example by changing the marker filename, which costs one byte and changes nothing
about the finding.

Authentication, and what is credited. This is not an unauthenticated
vulnerability and no unauthenticated variant of it is claimed. Every .cgi request
passes a fail-closed HTTP Digest gate, with Basic also accepted: the challenge
generator at 0x26be70 emits WWW-Authenticate: Digest, the connection handler at
0x26ed54 calls it at entry, credentials are evaluated through fcn.00268afc, an
absent or wrong credential yields 401 and the handler does not fall through to the
request's business logic, and the .cgi dispatch runs its authentication check
through func_0026c248. The unauthenticated allow-list recovered from the binary is
a static-content extension list covering html, htm, jpg, css, js, png, gif, txt,
asp, avi, bmp, cab, exe, mov, swf and xpi, plus one snapshot path, CamImg*.jpg. No
member of it is a configuration write and none reaches this sink. Two .cgi routes
are genuinely unauthenticated, GetVer.cgi returning a version XML document and
GetLanguage.cgi returning a language pack; both were examined for execution sinks
and neither calls system() or popen(), so they are useful for fingerprinting only.
The unauthenticated surface was swept for a path into the sink and the sweep came
out negative, which is what makes the authentication statement here a finding
rather than an assumption. The product's gate is present, centralised and
fail-closed, and it is credited as such: this finding is explicitly not CWE-306
and not CWE-862. The camera gets the gate right and the argument construction
wrong.

The principal required is an administrator, and the evidence carries two different
weights that should not be conflated. The credential requirement is structural and
fail-closed, read out of the gate's own control flow. The role requirement
specifically is read out of the privilege model recovered from the image, which
defines five levels, i_UserPrivilege01 through i_UserPrivilege05, and places NTP
configuration behind the administrator role; it was not differentially tested,
because no account below administrator was available to test with and no
comparison was ever run between a low-privilege write and an administrative one.
The honest status of the PR:H rating is therefore "supported by the recovered
privilege model" and nothing stronger, which is why the PR:L reading is published
below as a labelled conditional rather than being papered over.

Verification boundary, stated in full and up front, because it defines what is and
is not being claimed. No physical camera was used at any point. No TV-IP302PI
hardware was driven, no firmware image was booted onto hardware, no hunt_server
process was started, no HTTP request was issued to the daemon during any phase of
this work, and no request came from a second host. Nothing here is a live-device
exploit and the research does not present itself as one.

What the dynamic half actually was: a replica of the vulnerable call run inside
the product's own extracted root filesystem. The vendor firmware image is an
unencrypted ZIP container with five streams and the root filesystem in the third;
that tree of 251 files was extracted, and on an isolated cloud sandbox the
researchers chrooted into it and ran the camera's own busybox shell under
qemu-arm-static user-mode ARM emulation, invoking the interpreter explicitly in
the form qemu-arm-static /lib/ld-linux.so.3 --library-path /lib /bin/busybox sh -c
"<command string>", with binfmt_misc registered for ARM ELF so that a shell inside
the chroot could fork and exec the external ARM binaries in the same tree, and
with /dev and /proc bind-mounted. What was executed under that harness was the
exact command string the product's own builder produces from the product's own
template, with attacker-chosen bytes in the address slot, run by the product's own
shell in the product's own root filesystem. Four runs were made, three injection
forms and one control:

    /hunt/msntp -ts 1 -r 1.1.1.1;/bin/busybox id > <marker>;# &
        marker content   uid=0(root) gid=0(root) groups=0(root)
        marker owner     root:root
    /hunt/msntp -ts 1 -r $(/bin/busybox id > <marker>) &
        marker content   uid=0(root) gid=0(root) groups=0(root)
        marker owner     root:root
    /hunt/msntp -ts 1 -r `/bin/busybox id > <marker>` &
        marker content   uid=0(root) gid=0(root) groups=0(root)
        marker owner     root:root
    /hunt/msntp -ts 1 -r 1.1.1.1 &
        marker           absent - no file created

Three metacharacter vectors each produced a root-owned marker; the benign control
address 1.1.1.1, containing no metacharacter, produced none. Marker filenames are
rendered here in shortened form because the recorded names carried an internal
stage prefix that means nothing to a reader; the ownership, content and presence
of each marker are reported exactly as recorded. The control is not decoration.
The command template already invokes an external binary, /hunt/msntp, so a chroot
harness is a place where a marker could in principle have been created by
something other than the injection: a leftover file, the harness's own tooling, or
a misattributed side effect of the msntp invocation. Running the identical
template with a benign address and finding no marker removes every one of those
readings at once with the harness held identical, same chroot, same interpreter,
same shell, same tree, one variable changed. Its second job is to bound the claim:
because the control shows the harness is not spontaneously creating markers, the
three positive runs can be read as "the metacharacter caused the execution" rather
than "the harness caused the execution". Without it the positives would be
unfalsifiable, and an unfalsifiable result is not evidence.

What those runs prove, and what they do not. Measured: that a shell re-parses
metacharacters out of a command string of exactly the shape this product builds;
that the parsing causes an external command to execute, established by injecting
/bin/busybox id, a separate ARM binary in the tree rather than a shell builtin,
and reading that binary's own output back out of the marker; that the execution
context in which it happens is uid 0, witnessed twice, once in the marker's
content and once in the marker's ownership; and that none of those three effects
occurs for a value containing no metacharacter. Argued rather than measured: that
the value travels from an HTTP request to that command string, which is the static
analysis of the shipped daemon described above, and the AV:N metric, which rests
on the product's transport and its recovered authentication model rather than on a
demonstration between two hosts. Reproducing this from a remote position would
strengthen the finding rather than contradict it.

The one substituted component, named so a reader can discount it. The firmware ZIP
ships no userspace /lib, only kernel modules under /lib/modules, so the harness had
to supply an ABI-compatible soft-float C library set into the tree:
/lib/ld-linux.so.3, libc.so.6, libm, libdl, libpthread and libgcc_s in the GLIBC
2.4 through 2.8 range, copied in from an ABI-matched donor root filesystem
belonging to another IP camera. That donor's vendor identity is deliberately
withheld because nothing in this finding implicates that product and naming it
would only misdirect a reader. The C library is the only substitution. No vendor
code was patched, stubbed, widened or replaced: not the daemon, not the
configuration model, not the authentication gate, not the sink, not the shell and
not the msntp client. Everything the image shipped was used as shipped.

Further limits, listed rather than glossed. The -ts flag value in the replicated
string is the value that flag takes for a resynchronisation, read from the
configuration slot, not observed on a device. The form-field contract of apply.cgi
and SetTime.cgi, meaning which accompanying fields the vendor's own web client
sends alongside NtpIP, was not confirmed empirically, because no request was ever
made to a running daemon. The ONVIF transport binding for tds:SetNTP, its endpoint
path and its security-token form, was not recovered at instruction level, so the
proof of concept ships that mode labelled as a statically derived starting point
rather than as verified working code. No memory-corruption primitive is claimed:
the set callback's copy is a bare strcpy, but the parameter table applies the
length cap first, the destination slot's declared size was not recovered and
nothing was tested with an over-length value, so whether an over-length NtpIP
could corrupt adjacent configuration state is an unexamined question and not a
claim in either direction. No second firing of a persisted payload was observed,
because no daemon ran at all and zero repeat firings were therefore observed. A
harness defect worth recording: before binfmt_misc was registered for ARM ELF
against the interpreter, external ARM binaries inside the chroot failed with an
exec format error, so an early negative result in this work was a property of the
harness and not evidence about the camera. Once the registration was in place the
binaries executed normally and the results above are what was obtained.

Scoring. One score is published: 7.2 High,
CVSS:3.1/AV:N/AC:L/PR:H/UI:N/S:U/C:H/I:H/A:H. The arithmetic is printed so any
reader can reproduce it under the CVSS 3.1 base algorithm and its
round-up-to-the-tenth rule: ISS = 1 - (0.44 x 0.44 x 0.44) = 0.914816; Impact for
Scope Unchanged = 6.42 x 0.914816 = 5.873119; Exploitability = 8.22 x 0.85 x 0.77
x 0.27 x 0.85 = 1.234708; sum = 7.107827; Roundup = 7.2. AC:L is Low because no
condition outside the attacker's control was found: one authenticated request, no
race, no timing window, no memory-layout dependency, no on-path position, no
hardware-layer dependency and no requirement that the camera be in any particular
state. The 48-byte cap is payload engineering on the attacker's side rather than
an environmental condition, and where a deployment only resynchronises
periodically, waiting is available to the attacker rather than imposed on them, so
that does not qualify as AC:H either. UI:N because no administrator action, no
browser session and no induced click is involved. C:H, I:H and A:H because root on
this camera is every stored account and network credential, the live and recorded
media paths, the filesystem and the boot image, plus complete control of
availability.

Scope: Unchanged. A vulnerable application daemon and an impacted operating system
would ordinarily be different components, but on this product no authority
boundary separates them: the daemon already runs as uid 0, the shipped boa
configuration declares no privilege drop, and the configuration model offers no
lower-privilege domain for the web tier to move into. The chain exercises, through
a defect, an authority the vulnerable component already held, moving from "a root
daemon that parses a configuration request" to "a root shell" with the same uid
granted by the same init in both cases.

Two labelled conditional readings are published alongside the score, both
explicitly undemonstrated, and neither is the headline. Conditional A, any valid
session rather than the administrator role,
CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H = 8.8 High, from Exploitability
2.835255 and sum 8.708374; it applies if a privilege level below administrator can
write c64_Ntp_Server, which was not demonstrated and which the recovered privilege
model argues against. Conditional B, a device still carrying the administrator
password it shipped with,
CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H = 9.8 Critical, from Exploitability
3.887043 and sum 9.760162; it applies only where a camera still holds its factory
credential, the separately disclosed weakness described below, it was never
demonstrated, and it is the compounded value of two defects rather than the value
of either on its own. That figure must never be quoted as the score of this
finding.

Three further readings are published as rejected with their arithmetic. Scope
Changed, CVSS:3.1/AV:N/AC:L/PR:H/UI:N/S:C/C:H/I:H/A:H = 9.1 High, from Impact
7.52 x (0.914816 - 0.029) - 3.25 x (0.914816 x 0.9731 - 0.02)^13 = 6.128026,
Exploitability with the Scope-Changed privilege weight 8.22 x 0.85 x 0.77 x 0.50 x
0.85 = 2.286496, and 1.08 x (6.128026 + 2.286496) = 9.087684 rounded up to 9.1;
rejected on the same-uid grounds above, and note that this rejection lowers the
published figure by 1.9 rather than raising it, so it is not a scoring maneuver in
the researchers' favour. Attack Vector Adjacent,
AV:A/AC:L/PR:H/UI:N/S:U/C:H/I:H/A:H = 6.8 Medium, from Exploitability 8.22 x 0.62
x 0.77 x 0.27 x 0.85 = 0.900610 and sum 6.773729; rejected because the delivery
transport is an IP-addressed application protocol with no adjacency requirement in
it, with the caveat that the daemon's configuration was not enumerated for a
source-address filter, so the rejection rests on the transport rather than on a
proven absence of every possible access control. Attack Complexity High,
CVSS:3.1/AV:N/AC:H/PR:H/UI:N/S:U/C:H/I:H/A:H = 6.6 Medium, from Exploitability
0.705547 and sum 6.578666; rejected because AC:H requires a condition beyond the
attacker's control and none was found, the change event being raised by the write
itself.

One correction to the researchers' own record is published rather than quietly
made. The verification record behind this research carried 8.8 next to a vector
reading PR:H with Scope Unchanged. That vector computes to 7.2, not 8.8; 8.8 is
the value of the same vector with PR:L. The recorded figure therefore belonged to
a different privilege reading than the vector written beside it. The published
score is 7.2, computed from the vector, with the discrepancy recorded in the
advisory instead of silently overwritten, because a number that was quietly
changed is a number nobody downstream can audit. Correcting it lowered the
published figure.

One fact about this product is a scoring trap and the research does not fall into
it. The release line also ships a factory administrator credential weakness,
disclosed alongside this advisory as its own item under CWE-798. It is a real
weakness and it materially changes the exposure profile of a fleet that never
rotated it, which is exactly why it is kept out of this finding's rating: folding
it in would let one number describe two defects and would obscure which one to fix
first. No step of the injection work used a factory credential, the published
rating assumes an attacker must obtain a valid administrator credential by some
other means, and the password value appears nowhere in the published research and
nowhere in the proof of concept, which requires credentials as explicit
command-line arguments with no default precisely so that it cannot be pointed at a
camera on an assumed factory value. The weakness enters the arithmetic only as
conditional B above, labelled undemonstrated and described as a compound.

Impact. Root command execution on the camera for anyone holding a valid
administrator credential, through the product's own configuration parameter as
the primitive and the product's own shell invocation of its own NTP client as the
sink. Time synchronisation is the setting that was proven; the practical
consequence is that every administrative setting reaching this daemon's shell
becomes a command-execution primitive. What root controls on this device: the
live and recorded video and audio feeds and the imaging parameters, which is
qualitatively worse than tampering with an ordinary embedded host because the
device's entire purpose is to produce evidence, so an attacker at root can blind,
loop, freeze, redirect or selectively record the feed with nothing in the product
distinguishing that from normal operation; the ONVIF and RTSP account data held by
the daemon, which is how an attacker keeps the stream after the injected
configuration value is removed and how they read other users' video; stored
network credentials, including wireless keys, the PPPoE credentials implied by the
platform's own PPPoE_TV-IP302PI string, and any FTP, mail or upload destination the
camera posts snapshots to; the whole filesystem and the boot image the device will
next boot, which is durability beyond anything a configuration payload provides;
and complete availability control. Position matters too: cameras are routinely
installed on flat office, retail and operational networks and routinely given
inbound reachability for remote viewing, so root on one is a foothold in a segment
with no reason to expect a camera to originate a scan. That is a statement about
how such devices are deployed rather than a claim about this product's default
configuration, and it is not folded into the score.

Persistence is stated as a structural inference and not as an observation. The
injected value is written into a persisted configuration parameter, so a payload
stored there is re-read whenever the synchronisation path runs again and survives
a reboot, making a single authenticated write a standing execution primitive
rather than a one-shot, and leaving the payload in place behind an operator who
closes the attacker's session without reading the NTP configuration. No daemon
ran, so zero repeat firings were observed. The claim is that the product's own
parameter model makes this possible; nobody should assume a one-shot impact, and
nobody should read this as a claim that a second execution was witnessed.

Detection notes, including the caution that will otherwise produce false
positives. The chain is quiet by construction, because every step in it is
ordinary product use: an administrator writing a supported setting through the
vendor's own interface with valid credentials. There is no failed login, no
session anomaly, no privilege change and no unusual response code to alert on. The
configuration write itself is indistinguishable from a legitimate one, so a rule
keyed on requests to apply.cgi or SetTime.cgi will fire on every ordinary
time-setting operation a camera's users perform. The usable anomaly is the value,
not the request. Content-shaped indicators: the stored NTP server address
containing shell syntax or simply not being an address, the cheapest detection
available and one an operator can check on every unit today; a msntp process whose
-r argument does not parse as a host or address; an outbound connection from the
camera to a host that is not a time server, which is what a callback payload
produces and what most real payloads need in order to report back or to fetch a
second stage; and unexpected children of the web daemon, since anything other than
msntp in its process ancestry is already anomalous on a camera. The blind output
cuts both ways for a defender. Because the template ends with a trailing
ampersand, the injected command is backgrounded and nothing in its standard output
returns to the HTTP client, so an attacker gets no confirmation in the response
and is pushed toward exactly the outbound callback that egress filtering would
surface. Restricting camera egress to the time servers actually in use therefore
has a detection benefit out of proportion to its cost.

Adjacent items disclosed with this finding and counted as none of it: the factory
administrator credential weakness under CWE-798; the predictable Digest nonce
construction, generated from gettimeofday plus a counter at 0x26be70, reported
with no exploitability opinion in either direction because the Digest verification
arithmetic was not analysed instruction by instruction; acceptance of Basic
alongside Digest, a credential-carrying scheme with no transport protection of its
own on a device whose management port is routinely reachable; no privilege
separation in the web tier, CWE-250 and CWE-269, the amplifier that makes every
injection in this daemon a root injection; and a second shell-form system() site
in the same daemon at 0x1efc80, whose command is echo %d >
/proc/asound/adda300_BTL_mode with a server-derived integer interpolated and no
user input at all, so it is the same construction with different arguments, is not
injectable and is not part of this finding. This daemon contains multiple
shell-form command sites; only the one consuming c64_Ntp_Server was proven
injectable and only that one is claimed.

Affected scope and version discipline. Only firmware 1.02.38 for the TV-IP302PI
was analysed and only that build is claimed. No other build of this model was
available to diff against, so nothing is said about earlier or later firmware in
either direction, and no other TRENDnet model and no other platform-derived
product was examined. Other camera models built on the same platform may carry the
same construction, on the basis of the platform strings, the configuration-key
naming convention and the daemon's structure, and that is offered as an inference
and as an auditing lead, never as a claim about any product that was not tested.
The build identity available to the researchers proves a firmware version rather
than a maintenance status: 1.02.38 is the release this model's own published
artifact names, no vendor download page was reachable from the research
environment, and nothing in the material available showed the line having advanced
past it. That is a patch-availability statement for operators, and the research
holds firmly to the rule that the age of a release line is never itself evidence
of a defect: every claim rests on the shipped binary and on the replicated sink,
not on the image's age.

Mitigation summary: validate the value at the storage boundary by parsing it with
inet_pton or resolving it as a hostname and re-serialising the canonical name,
placed in the c64_Ntp_Server set callback at 0x2b668c so that the HTTP form, the
ONVIF SetNTP handler and any future entry point all inherit the check rather than
each caller remembering it; add an explicit character policy alongside it,
allowing roughly [A-Za-z0-9._:-] and rejecting the metacharacter set outright,
since a length cap is not input validation; remove the shell from the invocation
by replacing the system() call fed by func_0x001efbac with fork plus the execv
family, passing the binary, the flag and the address as separate argv elements and
keeping the background semantics with the fork instead of a trailing ampersand in
a command string, which makes metacharacter injection structurally impossible at
this site regardless of how good the validation is; convert the remaining
shell-form sites in the daemon, the audio path becoming a direct write to its
sysfs file, and route every value interpolated into any shell invocation that
cannot be removed through one single-quoting escaping helper; introduce privilege
separation so the web and application tier runs as a dedicated unprivileged user
and a configuration-injection defect yields a service account rather than the
device; retire the factory credential weakness by requiring an administrator
password to be set at first login and refusing authenticated configuration
operations until one exists; harden the gate that is already correct in shape by
adding rate limiting, backoff and lockout on Digest and Basic failures and
preferring Digest or a TLS-terminated session over Basic; adopt a build rule that
fails the release on any system(), popen() or shell-form invocation whose format
string interpolates a value traceable to a configuration key or a request field,
since a mechanical rule generalises to the sites nobody has read yet in 4.5 MB of
stripped code; and ship a regression test posting a semicolon payload, a command
substitution, a backtick pair and single-metacharacter variants using a pipe, an
ampersand, an angle bracket, a newline and a double quote to both entry points,
asserting that each is rejected while a plain address and a plain hostname are
still accepted, that the accepted value reaches the msntp argument list intact,
and that no msntp invocation carries a -r argument containing any character
outside the field's alphabet.

Until a fixed firmware exists, operator measures are configuration and placement:
rotate the administrator password on every unit and treat any camera that ever ran
with the factory credential as potentially compromised, because nothing in the
product's logging would have shown it; keep the management interface off untrusted
networks on a dedicated management VLAN or behind a VPN, with no port-forward of
the management port from the internet, fronting remote viewing with an
authenticating proxy rather than publishing the camera itself; audit the stored NTP
server address on every unit and reject or alert on any value that is not a plain
address or hostname; restrict camera egress to the time servers and upload
destinations actually in use; prefer internal time sources; baseline the process
tree, since on a healthy unit the web daemon's only child in this path is msntp;
and if compromise is suspected, re-image the unit and rotate every credential it
holds rather than restoring one binary or one setting, because root on the camera
means both the filesystem and the boot image were writable.

The published proof of concept is Python 3 using only the standard library, with
no third-party dependency and no hardcoded target. It authenticates with HTTP
Digest and falls back to Basic, writes the injected address through apply.cgi or
SetTime.cgi or through the ONVIF SetNTP shape, and confirms execution through an
out-of-band request to a listener it can start itself. A form selector chooses
between the semicolon, command-substitution and backtick shapes, or shortest that
fits, and warns when a payload would exceed the 48-byte or 64-byte cap of the
entry point in use. A control mode posts the benign address 1.1.1.1 and asserts
that nothing fires, mirroring the negative control used during verification. A
restore mode writes a benign value back through the same primitive. A dry-run mode
renders every request without sending anything, which is how the tool's own
request shaping was validated: against a local stub server, never against a
camera. Both credential arguments are mandatory and carry no default, so the tool
cannot be pointed at a camera on an assumed factory value. It refuses a
non-loopback target unless an explicit override is given, and its device-side
default command is a non-destructive marker write. No reverse shell, no
persistence installer, no firmware-tampering payload, no credential dump and no
destructive command is provided or was run, and no credential-guessing capability
is included.

Full technical analysis and the reproducible proof of concept, published
unconditionally:
  https://0day-rubbish.com/blog/trendnet-tv-ip302pi-ntp-command-injection-root-rce

PoC location in the public repository:
  
product/trendnet/tv-ip302pi-1.02.38/ntp-command-injection-root-rce/exploit/trendnet_tv_ip302pi_ntp_command_injection_root_rce.py

Project archive (ongoing disclosure series):
  https://github.com/Exploit-Garbage/0day-Rubbish

TRENDnet was notified through the mailbox the vendor publishes on its own support
page, inside its bulletin on critical firmware updates for IP cameras, which is
the only published address on the vendor's site situated in an IP-camera security
context and is the only channel used. The vendor publishes no RFC 9116
security.txt: the request for /.well-known/security.txt on both the www host and
the apex, over both schemes, returns the vendor's own site error page, as do
/security.txt and /security. The vendor does publish a dedicated vulnerability
reporting page whose form asks for a first name, a last name, an email address, a
model number, a hardware version, a firmware version and reproduction steps, and
which offers TV-IP302PI among its model numbers; that page publishes no mailbox,
and the form was deliberately not submitted, because this research publishes under
a team name with no individual attached and is already public. The vendor's sales
mailbox and the website-administration address in its own site error page were not
used, neither being a security channel. No individual was addressed by name and no
employee of the vendor or of the platform originator was contacted directly.
Delivery of the notification could not be confirmed in advance: the vendor's mail
gateway returned an identical temporary refusal for six addresses probed on that
domain, including the published camera bulletin address, an unpublished support
variant, an unpublished security variant, the vendor's sales address and a
deliberately nonsense address that cannot exist, five probes each, which
discriminates nothing from the researchers' position and is therefore treated as
neither evidence of delivery nor evidence of non-delivery. This disclosure is
unconditional: the research is already public, no permission was asked for, no
embargo was requested, and nothing is withheld pending a reply. No vulnerability
identifier has been assigned to this finding yet.

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

-   **\[0day-rubbish\] TRENDnet TV-IP302PI firmware 1.02.38 authenticated NTP server-address OS command injection to root command execution via a shell-form system() call (7.2 High, PR:H)** *disclosure via Fulldisclosure (Oct 20)*
