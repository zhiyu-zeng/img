---
title: "Full Disclosure: [0day-rubbish] Maian Guardian 2.1 license generator projid command injection to www-data uid 33 code execution (7.2, PR:H)"
source: https://seclists.org/fulldisclosure/2026/Oct/16
source_host: seclists.org
clip_date: 2026-10-15T16:22:43+08:00
trace_id: 65d273e9-87ab-45b5-82d0-e9eb51d54b0c
content_hash: 2b98b55d7700dff15ffb1d96f15ae7ca9c2d29df7ed026a56663b4a45564e908
status: synced
tags:
  - 漏洞分析
  - 命令注入
series: null
feed_source: Full Disclosure·漏洞披露
ai_summary: Maian Guardian 2.1 的许可证生成功能因字符串拼接构造 shell 命令且净化函数为空操作，导致已认证管理员可通过 projid 等字段注入命令，以 www-data 身份执行任意系统命令。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3fa75244-d011-81e2-87d7-dced3fcc1832
ioc:
  cves: []
  cwes:
    - CWE-116
    - CWE-20
    - CWE-208
    - CWE-250
    - CWE-328
    - CWE-561
    - CWE-732
    - CWE-78
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Maian Guardian 2.1 的许可证生成功能因字符串拼接构造 shell 命令且净化函数为空操作，导致已认证管理员可通过 projid 等字段注入命令，以 www-data 身份执行任意系统命令。
> 
> - **漏洞位置：** `control/classes/class.licensing.php:261` 的 `guardianLicense::create()` 用字符串插值拼接命令行并传给 `shell_exec()`，projid、projkey、许可证键值对、encoder 字符串来自管理员 AJAX 操作 `POST /admin/index.php?ajax-ops=generate`，且被包在双引号内而非参数化引用，POSIX 命令替换（`$(...)`、反引号）仍然生效。
> - **根因（净化失效）：** `escape()` 与 `mswCD()` 都只是 `return $data;` 的空操作，且串联在通往 shell 的路径上；真正调用 `escapeshellarg()` 的 `escapeArg()` 在全部 308 个 PHP 文件中无任何调用点，属死代码；`escapeCmd()`（`escapeshellcmd()`）只用于 `head()`、`time_servers()`、`add_lic_info()`，从不覆盖 `lock()`/`properties()`。请求级唯一过滤是 `control/functions.php:342` 的 `mswMDAM('trim', $_POST)`。
> - **验证结果：** 命令以 `uid=33(www-data)` 执行，无沙箱或权限降级；一次已认证请求执行了六条命令（含管道 `cat /etc/passwd | head -3`），标记文件写入文档根并被 HTTP 读回；早期迭代还在文档根之外写入成功。响应始终为普通 HTTP 200 `{"status":"rdr"}`，故证明依靠带外回读。
> - **评分与影响：** 7.2 High（CVSS:3.1/AV:N/AC:L/PR:H/UI:N/S:U/C:H/I:H/A:H），9.8/8.8/9.1 三种更高读法均被标注并驳回；影响包括以服务账户写 Web 目录形成持久后门，并可据 `control/_cfg.php` 读取数据库凭据与 SECRET_KEY，伪造管理员会话。
> - **缓解与检测：** 首选改用 `proc_open()` 数组参数彻底移除 shell，否则对所有插值值用 `escapeshellarg()`、删除空操作 `escape()`/`mswCD()`、对生成字段加字符白名单与长度上限，并同时修补 `control/api/api-remote.php`（136-154 行同一 sink）。检测上建议对含 `$(` 或 `%24%28` 的 generate 请求体告警、监控内容目录文件完整性、审计无登录记录的 `guardian_access` 会话。

## Full Disclosure mailing list archives

## \[0day-rubbish\] Maian Guardian 2.1 license generator projid command injection to www-data uid 33 code execution (7.2, PR:H)

* * *

*From*: disclosure via Fulldisclosure <fulldisclosure () seclists org>  
*Date*: Tue, 13 Oct 2026 02:21:47 +0000  

* * *

```bash
0day Rubbish Research Team is publicly disclosing a vulnerability in Maian
Guardian 2.1, the self-hosted licensing system for PHP applications encoded
with SourceGuardian, distributed as a closed-source commercial PHP script by
Maian Script World (United Kingdom) and verified end to end against a real
installation of that version.

Type: OS command injection (CWE-78 primary; CWE-116, CWE-20 and CWE-561
contributing; CWE-250 and CWE-732 as environmental amplifiers of the same
event). The license-generation routine builds an operating-system command line
by string interpolation and passes it to shell_exec() at
`control/classes/class.licensing.php:261` inside `guardianLicense::create()`, in
order to invoke the external SourceGuardian generator binary. Several of the
interpolated fields arrive unvalidated from the body of the administrator AJAX
operation `POST /admin/index.php?ajax-ops=generate` - projid, projkey, the
license property key and value pairs, and the encoder string - and are placed
inside double quotes rather than argument-quoted, so POSIX command substitution
still applies:

    shell_exec(mswSGLicGenPath('"', $this->settings) . " $string $output");
    $lock[] = '--projid "'  . $this->projid  . '"';   // line 112
    $lock[] = '--projkey "' . $this->projkey . '"';   // line 113

The rendered command line is therefore
`"<licpath>" --projid "<PROJID>" --projkey "<PROJKEY>" --const "<KEY>=<VALUE>"
... <output>`, where PROJID is whatever an authenticated administrator posted.
PHP hands that text to `/bin/sh -c`, and inside a double-quoted word the shell
does not treat `$(`, a backtick or a backslash as literal. A projid of `$(id)`
spawns `id` in a subshell and substitutes its output into the argument, and it
does so during expansion, before the command word is resolved - which is why a
deployment with a missing or misconfigured generator binary is still fully
exploitable.

The decisive detail is the sanitizer arrangement, and it is the whole root
cause. Three sanitizer-shaped helpers ship with the product; two of them return
their input unchanged and sit in series on the path to the shell, and the one
that correctly wraps escapeshellarg has no call site anywhere in the product:

    private function escape($data) {     return $data; }   // lines 68-70
    private function escapeArg($data) { return escapeshellarg($data); }
                                                           // lines 72-74

`escape()` is the function actually called on the way to the shell, and it does
nothing. `mswCD()` at lines 152-154 is a second `return $data;`, applied to the
property key and value immediately before `escape()`, so two no-ops are stacked
in a row on the properties path. `escapeArg()` wraps exactly the right primitive
and is dead code: a sweep of all 308 PHP files in the shipped tree found no call
site for it, which reads as a completed remediation that never landed. A fourth
helper, `escapeCmd()` around `escapeshellcmd()`, is real and is invoked, but only
from `head()`, `time_servers()` and `add_lic_info()` - never from `lock()` or
`properties()` - so it guards the fields with the least attacker control and
never sees the two that carry project identifiers. Upstream of the class the
only request-wide filter is `mswMDAM('trim', $_POST)` at
`control/functions.php:342`, which applies trim() and nothing else; there is no
character allow-list, no length cap and no metacharacter rejection anywhere
between the POST body and the shell_exec() argument.

Commands execute as the web server service account, observed as
`uid=33(www-data) gid=33(www-data) groups=33(www-data)`. No setuid transition,
wrapper, privilege drop or sandbox sits between the web worker and the child
process. Root was not reached, was not attempted, and is not claimed.

How confirmation works, and what was deliberately not reproduced. The generate
operation does not echo command output into its HTTP response: it answered HTTP
200 with its ordinary `{"status":"rdr"}` body, the response shape it produces
when the generator creates no valid license file. Proof of execution is
therefore out-of-band by construction. The injected command writes a marker file
and the same installation serves it back over HTTP; one authenticated request
executed six distinct commands into that single file, including a pipeline,
`cat /etc/passwd | head -3`, which is what separates arbitrary command execution
from one hard-coded effect. An earlier iteration of the same chain wrote its
marker outside the document root and was confirmed there first, so write
capability is stated as observed both inside and outside the web tree. The
published advisory reproduces the identity string but elides the container
hostname and the kernel build-timestamp field of the `uname -a` line, since both
are artefacts of one execution on one host rather than evidence about the
product.

Scoring. One score is published: 7.2 High,
CVSS:3.1/AV:N/AC:L/PR:H/UI:N/S:U/C:H/I:H/A:H. That vector computes from first
principles to ISS = 1 - (0.44 x 0.44 x 0.44) = 0.914816, Impact(S:U) =
6.42 x 0.914816 = 5.87311872, Exploitability = 8.22 x 0.85 x 0.77 x 0.27 x 0.85
= 1.234707705, base 7.107826425, taken to 7.2 by the CVSS ceiling-to-tenth
Roundup - a calculator reporting 7.1 is disagreeing with the rounding rule and
with nothing else. AV:N describes the product's exposure and not our lab's: the
chain is three HTTP requests plus one read-back against the product's single
listener, and the loopback binding in our testbed was our own safety choice, not
a product property. AC:L because nothing outside the attacker's or a normal
deployment's control is needed - ENC_DEBUG is at its shipped value 0
(`control/options.php:37`), which selects the shell_exec() branch, and the
license-generator path is a setting a functioning installation already has.

PR:H is the metric carrying the weight, and the readings on either side of it
are printed with their own vectors so the arithmetic is inspectable. Published
reason: only an installer-provisioned administrator session was demonstrated
reaching the sink. The product does keep a `guard_staff` table, so a multi-user
deployment is possible, but our review found no role or permission column that
separates license generation from any other administrator operation and no
documented staff role with a narrower capability set; every path we traced to
`guardianLicense::create()` sat behind the administrator gate with the same
operation-level CSRF check. Three alternative readings are therefore labelled and
rejected rather than hidden:

  - Unauthenticated, AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H = 9.8. Rejected: no
      unauthenticated path reaches a sink. The remote license-issuing API at
      `control/api/api-remote.php` is gated by a key randomly generated at
      install time, which was not bypassed, and the product ships no factory
      credential because the installer sets the administrator account.
  - Lower-privileged operator, AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H = 8.8.
      Rejected: no role-separated principal was demonstrated reaching the
      generate operation, and the guard_staff role model was not established.
      Publishing this would rest on an unstudied possibility rather than on a
      demonstrated principal.
  - Scope Changed, AV:N/AC:L/PR:H/UI:N/S:C/C:H/I:H/A:H = 9.1. Rejected: the
      injected command runs as the same identity, on the same host, inside the
      same authority the product was granted at install time. No second
      authorization boundary was crossed and no cross-machine or cross-account
      outcome was demonstrated, so S:C would rate an outcome the evidence does
      not contain.

Two things are deliberately priced at zero in this vector. The remote API key
comparison `md5($apiKey) == md5($SETTINGS->apikey)` is reported as a separate
hardening weakness - CWE-328 with a CWE-208 aspect, since hashing both sides with
an unsalted MD5 adds nothing over comparing the raw key and `==` on two digests
is not a constant-time comparison - and it is folded into nothing. It was not
demonstrated to be exploitable, the strength of that gate rests on the entropy
of the install-time random key, and no leak path for it was found. Likewise the
six additional tainted fields on the same sink and the second entry point widen
the patch surface a vendor must cover without changing how hard the demonstrated
injection is to perform, so they contribute nothing to the score. No correction
notice accompanies this figure: our own notes carry no numeric CVSS value for
this finding, so 7.2 is derived from the vector above and nothing else.

Authentication: post-authentication administrator, and the gate held. Every
administrator page and every administrator AJAX operation passes through one
init-level gate at `admin/control/init.php:122`, which is a hard include-time
gate rather than a per-request filter that can be forgotten on one route, and the
generate case carries a second operation-level check that the submitted `cs_rf`
body field or `csrf` header matches the session-bound `csrf_token`. Eight
candidate bypasses were examined and all eight recorded as blocked: forging the
`guardian_access` session value (it embeds the per-install random SECRET_KEY),
omitting or replaying the CSRF token (session-bound, validated per operation,
rotated per page render), injecting the internal `$loginBypass` variable (no
external input reaches it), SQL injection in the login path (the staff lookup is
parameterised and the constant path compares salted SHA-1 digests), a timing
attack on that comparison (equal-length hex digests, no exploitable divergence
identified), a default-credential fallback (the installer forces the operator to
set it), hard-coded LG_USER or LG_PASS (written at install time from operator
input, not compiled in), and guessing the remote API key (randomly generated at
install). The unauthenticated surface was enumerated interface by interface and
parameter by parameter: roughly sixty-two interfaces were inventoried by three
independent methods that agreed, roughly nine answer without credentials (four
static asset trees, the buyer portal front page and its license-lookup
operation, the remote API endpoint refusing a keyless request, the
post-installation installer route, and the login operation itself), and zero of
those nine reach a command-execution, deserialization or file-write sink.
Every parameter of every unauthenticated interface was tested for traversal,
injection, type confusion, over-long input and encoding bypass. Unauthenticated
remote code execution was not reached and none is claimed.

One honesty point about the negative control, because the published exploit
carries a control mode that was never recorded. The script ships a --control
mode that repeats the identical authenticated sequence - same login, same fresh
CSRF token, same generate operation, same field set including a non-empty
licpath and a key/value pair - with a benign project identifier and project key,
points its read-back at a marker name it never injects, and asserts that the
marker URL does not answer. A passing control would rule out that the proof file
pre-existed, that the generate operation writes arbitrary attacker-named files
into the document root as a normal side effect, and that the read-back URL is
served by something other than the written file. What there is not, and what
this post does not pretend otherwise, is an archived control transcript: the
recorded verification output is the injection leg, the control leg is shipped so
that any reader can execute it against their own instance, and inventing a
transcript would be worse than saying so. The structural half of the control
does come from source: the only thing on this path that creates a file inside
the document root is the shell command assembled at `class.licensing.php:261`,
and no branch of the generate operation writes to the content tree on its own.

Impact: arbitrary OS command execution as the web server service account from a
single authenticated administrator POST, demonstrated with six distinct
commands including a pipeline and an output truncation. The same identity wrote
a file into the document root that the web server then served, which in a
deployment that executes PHP from that tree is a durable implant surviving
sessions and restarts - and a one-way door, since the buyer-facing write channel
does not exist but the persisted artefact is afterwards reachable by
unauthenticated visitors. By extension from the same identity, argued rather
than demonstrated in the recorded run: the PHP process must be able to read
`control/_cfg.php`, so the database credentials, SECRET_KEY and the
installer-provisioned LG_USER and LG_PASS values are readable; holding
SECRET_KEY is more damaging than it looks because the administrator session
value is SECRET_KEY concatenated with a timestamp, so reading it mints a valid
`guardian_access` session with no password and no login event in the logs; full
read and write access to the licensing database follows from those credentials,
covering license records, project identifiers and keys, buyer identities and
contact data, product inventory and staff rows - on a licensing server that is
the crown jewel, since an attacker can issue valid licenses for the customers'
encoded products and harvest the buyer list; and the remote API key in the
`guard_settings` table opens `control/api/api-remote.php`, which reaches the
same sink from outside the administrator back-end. Availability impact: the same
identity can corrupt or remove licensing data and application files, destroying
the server's function for every encoded product that depends on it. The ceiling
is stated as clearly as the impact - the host itself was not compromised, no
escalation path was pursued, and no root, no container escape, no other tenant
and no other machine are claimed.

Verification boundary, stated plainly. Dynamic work consisted of one end-to-end
run over HTTP against a two-container installation of the product built through
its own install wizard: a stock PHP 8.3 Apache image with the zip extension, a
MySQL 8 backend in a second container on a private bridge network, and the HTTP
listener bound to loopback on the research host. Four elements of that testbed
were ours rather than the product's and are called out as such: the loopback
listener binding, the administrator password chosen for the engagement (set
through the product's own install wizard, not a product default), the placeholder
generator path, and a document root writable by the service account. The
placeholder is the important one. The genuine SourceGuardian generator is
separately licensed and we did not possess it, so the installation was configured
with /bin/echo in the generator-path setting. That substitution is defensible for
a specific arithmetical reason: the shell expands command substitution during
argument expansion, before it resolves the command word, so a placeholder
command cannot suppress the injection. What it does mean is that no license file
was ever actually produced in our run, and that no run was performed against an
installation carrying the genuine binary. Established by source reading only and
never executed: the six additional tainted fields on the same sink (projkey, the
property key and value pair, the encoder string from POST-side licpath, and -
behind escapeshellcmd, so argument injection rather than command injection -
hblock and timeservers, plus expire_in which carries no escaping at all), the
remote API entry point into the same class, and the assertion that expansion
fires even when the generator path is empty or the binary is absent. Not tested
at all: a production installation with the real generator binary, a hardened
deployment where the service account cannot write to the document root, any
non-administrator or buyer-facing principal attempting the same operation, any
privilege escalation beyond the service account, and the remote API key gate
under attack. Only version 2.1 was obtained, installed and tested; no other
version, edition or bundle is claimed, and no other product from this seller was
audited.

Detection notes, including the two that would otherwise produce false negatives.
The triggering request is an ordinary administrator operation: in a default
combined-format access log it appears as `POST /admin/index.php?ajax-ops=generate`
with no payload detail, because request bodies are not logged and the
percent-encoded `$(` and `)` live in the body rather than the URL. The operation
answered HTTP 200 with no 4xx or 5xx and no application-level alert, so there is
no status code to correlate on. A narrow, cheap and product-specific rule that
would have caught our run: alert on any generate request whose body contains `$(`
or its percent-encoded form `%24%28`. On the host, the child appears as
`/bin/sh -c ...` descended from the web server, which is unusual for this product
because its normal generation path invokes the generator binary rather than a
shell whose argument list contains redirections and semicolons - but process
ancestry alone is weak, since a generation run legitimately does spawn a child.
File-integrity monitoring on the document root, specifically the content tree,
would flag the marker: a new interpreter-executable file there owned by the
service account is anomalous regardless of this vulnerability. And because the
session value derives from SECRET_KEY plus a timestamp, an administrator session
with no corresponding login request is a high-signal indicator that the
configuration has been read and sessions are being forged. Note finally that if
the deployment carries the genuine generator binary, a successful injection may
coincide with a valid license file being produced, making the request look
entirely legitimate in the application's own audit trail.

Mitigation summary, ordered by root cause: remove the shell from the path
entirely by replacing the shell_exec() call at `class.licensing.php:261` with an
argument-vector invocation such as proc_open() given an array, so the generator
path is element zero and every option and value is its own element and no shell
is spawned - this removes the class rather than the instance; if a shell
invocation must remain, quote every interpolated value with escapeshellarg()
including the license path currently wrapped in literal double quotes by
`mswSGLicGenPath()` (`control/functions.php:123-125`), and make lines 112-113
emit --projid and the quoted value as separate words rather than one
interpolated string; delete the no-op `escape()` and the no-op `mswCD()` and
resolve the dead code either way, since a function named escape() that returns
its argument is an active hazard that defeats review by its presence and will be
re-trusted by the next contributor; validate the license-generation fields at the
handler with a character allow-list and a length cap, alphanumeric being
sufficient for SourceGuardian project identifiers, and apply the rule the product
already uses for the staff user field at `admin/control/system/_ajax.php:432` to
project key, property keys and values, the encoder string, hblock, timeservers
and expire_in; validate the configured generator path before use by resolving it
and requiring an existing executable regular file with the expected basename,
which also stops the settings field from pointing the shell at an arbitrary
binary; patch both entry points together, because `control/api/api-remote.php`
lines 136-154 builds the same class from its own parameters and a fix limited to
the administrator AJAX operation leaves the sink reachable for API key holders;
introduce privilege separation around the generator by running it as a distinct
unprivileged user, keeping license output outside the document root and making
the web tree read-only for the service account; harden the API key comparison as
a separate change with hash_equals() on the raw configured key instead of
unsalted MD5 digests compared with `==`; and ship a regression test asserting
that a projid, projkey or property value containing `$(`, a backtick, a double
quote, `;`, `|` or `&` is either rejected or survives to the child process as
literal text, with no child process spawned on rejection. Until a patch exists,
operators should treat administrator credentials as equivalent to shell access on
the licensing host, expose the back-end only from a management network or an
authenticated reverse proxy or VPN, make the document root read-only for the
service account, enable file-integrity monitoring on the content tree, reject
generate bodies containing `$(` or `%24%28` at the proxy, audit active
`guardian_access` sessions against login events, and on suspicion of compromise
rotate SECRET_KEY, the API key, the administrator credential and the database
credentials - noting that rotating SECRET_KEY invalidates existing sessions,
which is the point.

The proof of concept, maian_guardian_license_generator_command_injection_rce.py
in the exploit directory of this advisory's repository tree, is pure
standard-library Python, takes every environment-specific value as a
command-line argument, embeds no lab address, and never modifies product files,
license data or configuration outside its own marker. The administrator
password is required on the command line and is not stored, because the product
ships no factory credential. It offers three modes: the injection run, --control
(the benign case with an assertion that no execution occurred), and --cleanup
(removal of the marker after a confirmed run). The advisory also documents two
reproduction details that are not security controls but do make a naive attempt
fail for an unrelated reason: the handler requires licfile, projid, projkey and
POST-side licpath to be non-empty or the case falls through without building the
object, and omitting key[] and value[] aborts before the sink because count() on
a non-array raises a TypeError under PHP 8.

Full technical analysis and a reproducible proof-of-concept:
  https://0day-rubbish.com/blog/maian-guardian-license-generator-command-injection

Project archive (ongoing disclosure series):
  https://github.com/Exploit-Garbage/0day-Rubbish

Maian Script World has been notified through the support mailbox it publishes for
its products, which is the only channel we could verify: we found no RFC 9116
security.txt and no product security page or vulnerability-disclosure policy for
this product, so there was no pre-publication intake for us to use. A separate
notice about a different product from the same seller was sent to the same
mailbox at the same time; the two are unrelated defects in unrelated products,
and we asked that both be routed to whoever maintains the software. This
disclosure is unconditional. No vulnerability identifier has been assigned to
this finding yet.

--
0day Rubbish Research Team
disclosure () 0day-rubbish com
https://0day-rubbish.com
_______________________________________________
Sent through the Full Disclosure mailing list
https://nmap.org/mailman/listinfo/fulldisclosure
Web Archives & RSS: https://seclists.org/fulldisclosure/

```
