---
title: "Full Disclosure: [0day-rubbish] South River Technologies Titan MFT Server 26.0.0 first-run administrator setup chained to job post-command injection, NT AUTHORITY\\SYSTEM (8.1)"
source: https://seclists.org/fulldisclosure/2026/Oct/20
source_host: seclists.org
clip_date: 2026-10-15T16:23:40+08:00
trace_id: 61092545-4b30-44df-8113-878630561b1f
content_hash: 9be6e67e5a0323bdefe177686037dccc63925f17b36e557835d2d753567f14f0
status: synced
tags:
  - 漏洞分析
  - .NET逆向
series: null
feed_source: Full Disclosure·漏洞披露
ai_summary: Titan MFT Server 26.0.0 首次运行管理员创建页无鉴权，攻击者可借此建号，再用作业 post-command 字段注入命令以 NT AUTHORITY\SYSTEM 执行。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3fa75244-d011-8148-8eaf-c1ccfebdb37c
ioc:
  cves: []
  cwes:
    - CWE-1188
    - CWE-200
    - CWE-209
    - CWE-250
    - CWE-269
    - CWE-306
    - CWE-78
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Titan MFT Server 26.0.0 首次运行管理员创建页无鉴权，攻击者可借此建号，再用作业 post-command 字段注入命令以 NT AUTHORITY\SYSTEM 执行。
> 
> - **暴露状态：** `/Login` 在 `nxUserParams` 表零行（安装后未建管理员）时对任意可达客户端渲染 "Initial Admin User Setup"，建出第一个管理员后即刻消失；窗口时长取决于部署流程，作者未测量其典型时长。
> - **起点无门槛：** 判定仅是行数（`AdminUserExists()` 与 `CreateAdminAtConsole` 的组合），无 bootstrap token、CAPTCHA、本机限制或通道绑定；1,880 个反编译文件中零个 `[Authorize]`，提交后同一进程内电路直接登录到 `/SvrHome`。
> - **注入点：** "Execute After File Transfer Task" 字段原样存入 `nxJobs.document.PostCommandText` 并由 `MxUtilSvrJobHandler` 执行；值以 `cmd` 开头时被改写成 `cmd.exe /c ...`，恢复完整 shell 语义，其余情况按首个空格切分且 `Arguments` 为字符串，无白名单、无元字符过滤。
> - **验证方式：** 注入 `cmd /c whoami` 生成 21 字节标记文件 `nt authority\system`，其修改时间晚于产品自己记录的任务完成时间 76 毫秒；对照组清空该字段重跑同一作业，任务成功但标记的字节长度与毫秒级时间戳均未变。
> - **评分与修复：** 主评分 8.1 High（AC:H，因首运行状态攻击者只能发现、不能制造），条件性 9.8 Critical 仅用于单个已在窗口内的主机；缓解按根因排序——建号移出网络面、未配置完成前不监听、用 `ArgumentList` 替代字符串参数并删除 `cmd` 特例、以非 LocalSystem 身份运行。

## Full Disclosure mailing list archives

## \[0day-rubbish\] South River Technologies Titan MFT Server 26.0.0 first-run administrator setup chained to job post-command injection, NT AUTHORITY\\SYSTEM (8.1)

* * *

*From*: disclosure via Fulldisclosure <fulldisclosure () seclists org>  
*Date*: Tue, 13 Oct 2026 02:22:46 +0000  

* * *

```swift
0day Rubbish Research Team is publicly disclosing a vulnerability chain in South
River Technologies Titan MFT Server 26.0.0.364, the NextGen generation of the
commercial managed file transfer server from South River Technologies (Annapolis,
Maryland, United States). The product runs as a single .NET 8 process,
titanmft.exe, registered as the Windows service SrtTitanMFTServerService under
LocalSystem, serves a Blazor Server administration application on 0.0.0.0:47443
over TLS, and drives transfers with EF Core over SQLite.

Before anything else, the framing. This is a first-run window, which is a
deployment state, and it is not an absence of authentication. The window opens
when installation completes and the service starts listening, and it closes the
instant the first administrator account exists. While the administration
database's nxUserParams table holds zero rows, the login route renders an
"Initial Admin User Setup" screen to any client that can reach the listener.
Once one administrator exists, that route renders a credential form instead and
this chain's account-creation half has no route whatsoever. The product has
three authentication planes and the message-level one is closed; we measured it
closed, in the same run, at the same time the setup screen was available. What
is exposed is a state, and no configured deployment is exposed to the half that
creates the account.

Type: CWE-306, Missing Authentication for Critical Function, on the first-run
administrator-creation path, chained with CWE-78, Improper Neutralization of
Special Elements used in an OS Command, on the job post-command path.
CWE-250/CWE-269 (LocalSystem execution with no privilege separation) and
CWE-209/CWE-200 (unauthenticated stack-trace echo and window-state leak) are
named as contributing and are deliberately not folded into the score. CWE-1188
is deliberately not used: no insecure default credential ships with this
product, and implying that rotating a password closes the exposure would be
false, because creating the first administrator closes it.

The gate is a row count and nothing else. MxSvrParams.cs:518-520 evaluates
`RunWizard = !nxUserParams.AdminUserExists() && !CreateAdminAtConsole`, and the
clearest form of the same predicate is in the legacy route:

    if (!nxUserParams.AdminUserExists())
        CreateAdminUser(li.user.NxDecryptAPI(), li.pass.NxDecryptAPI());

There is no bootstrap ticket, no CAPTCHA, no first-boot token, no localhost
restriction and no channel binding. We counted zero `[Authorize]` attributes
across the 1,880 decompiled files of the ServerCore assembly, so every
authorisation decision in the product lives in application logic, and for the
setup screen that logic is the empty-table test. Submitting the screen calls
`AppState.CreateAdminUser` followed by `AppState.Login` inside the same
in-process circuit and lands the anonymous client in the management console at
`/SvrHome/<guid>/<guid>`.

The sink is the job post-command. The field labelled `Execute After File
Transfer Task` is persisted verbatim into `nxJobs.document.PostCommandText` and
is executed by the transfer engine:

    // MxUtilSvrJobHandler.cs:970-972  trigger predicate
    if (P_0.IsSuccess() || Job.ExecuteCustomPostProcessOnFileTransferTaskFailure)
        return !string.IsNullOrWhiteSpace(Job.PostCommandText);

    // MxUtilSvrJobHandler.cs:979-982  call site
    LogMsg("Post Command: " + Job.PostCommandText);
    RunCustomProcessAsync(Job.PostCommandText, Job.PostWorkingDir, Job.PostTimeout)

    // MxUtilSvrJobHandler.cs:991 onward (a second pass over the same
    // decompilation records this routine at :996)
    if (command.TrimStart().StartsWith("cmd", OrdinalIgnoreCase)) {
        fileName  = "cmd.exe";
        arguments = "/c " + command.Substring(3).Trim();
    } else {
        int num = command.IndexOf(' ');
        fileName  = num > 0 ? command.Substring(0, num) : command;
        arguments = num > 0 ? command.Substring(num + 1) : "";
    }
    StartInfo = new ProcessStartInfo { FileName = fileName, Arguments = arguments,
        WorkingDirectory = workingDir, UseShellExecute = false, ... }

Four properties make this a command injection rather than a command launcher:
the `cmd`-prefix special case reconstitutes full shell semantics, so
redirection, chaining, percent-expansion and quoting are all live in the payload
space; otherwise the value is split on its first space with no quoting
discipline; `Arguments` is a string rather than a vector, so `ArgumentList`
never protects the value; and there is no allow-list, no path canonicalisation,
no executable-existence check, no metacharacter rejection and no server-side
re-validation between the write and the process start. The only inspection of
the value on the path is `IsNullOrWhiteSpace`, which answers "should I run
anything" and not "is this safe". `UseShellExecute = false` with no
impersonation, no restricted token, no job object and no integrity-level
downgrade means the child inherits the service token, which is LocalSystem.

Identity reached: `NT AUTHORITY\SYSTEM`. The proof is a marker file, 21 bytes,
content `nt authority\system`, written by the injected `cmd /c whoami` child;
its modification time sits 76 milliseconds after the job-completion timestamp
the product itself recorded in its own job-history table for that run. That
offset is the attribution evidence: at that precision the file was written by
the step that followed transfer completion in that job, not by anything else on
the host.

How confirmation works, and what was deliberately not reproduced. The control
leg repeated the entire pipeline with one variable removed: using the
administrator the exploit itself had created, the same job was re-opened, its
`PostCommandText` cleared (confirmed empty both in the field and in the job
document), saved, and run again. The job completed - a second job-history row,
Completed, successful, zero files transferred - and the marker was untouched:
same byte length, same modification time to the millisecond. The two runs were
111.6 seconds apart. That single leg removes every alternative explanation for
the marker that does not involve the injected field: it was not written by the
transfer engine or any pipeline stage, it is not a leftover artifact from
installation or from an earlier experiment, and it was not written by a
scheduled task, a service restart or a background process, because the only
difference between the two runs is one field's contents.

The payload was chosen to prove identity and nothing else. What we deliberately
did not do: no destructive action, no persistence, no lateral movement, no
domain compromise, no access to any partner system, and no second command shape
beyond the one successful-transfer run and its empty-command control. The
pre-transfer counterpart of the same field was not executed, so its
exploitability is inference from shared code shape and is not claimed. The
failing-transfer-with-payload combination was not executed either; the predicate
reading that makes it work at all comes from the code plus the control row's
semantics, and we do not claim that combination as measured. The published
advisory reproduces the identity string but not the per-run marker path or the
host names from the run.

Scoring. The primary published rating is 8.1 High,
CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:H. Arithmetic:
ISS = 1 - (0.44)^3 = 0.914816; Impact at S:U = 6.42 x 0.914816 = 5.87311872;
Exploitability = 8.22 x 0.85 x 0.44 x 0.85 x 0.85 = 2.2211673;
Base = min(5.87311872 + 2.2211673, 10) = 8.09428602; Roundup = 8.1, band High.

Why AC:H and therefore why 8.1 is the headline. The chain requires the target
to be inside a state the attacker cannot create: an installation that has not
yet completed first-time setup. The attacker can discover such targets cheaply
and cannot bring the condition about, cannot extend it and cannot re-open it
from the network; once the operator completes setup the first half is gone for
good. CVSS 3.1 places "the attack depends on conditions beyond the attacker's
control" in Attack Complexity High, and a transient deployment state that must
be found rather than caused is squarely that. We also never measured a typical
window duration in any environment, so claiming AC:L as the headline would
silently assume the very deployment fact we declined to measure.

Conditional reading, published as conditional and never as the headline: 9.8
Critical, CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H, Exploitability
8.22 x 0.85 x 0.77 x 0.85 x 0.85 = 3.887042775, Base 9.760161495, Roundup 9.8.
It applies to one installation confirmed to be inside its first-run window,
where the state condition is already satisfied and what remains is four form
submissions and a menu click. Use it when triaging a specific host; use 8.1
when triaging a fleet or a vendor. The two figures may not be swapped.

Rejected readings, named so the rejection is auditable.
  - Scope Changed: CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:C/C:H/I:H/A:H computes to 9.1,
    and the conditional under S:C would be 10.0. The argument is coherent - the
    host OS is governed by Windows rather than by the product's authorisation
    component - and we reject it, because the child is created by the service
    inside the service's own LocalSystem token on the service's own host, and
    executing as the same service identity on the same host does not change
    scope. Adopting Changed also puts a conditional 10.0 on the table, which
    invites exactly the "this product has no authentication" misreading that the
    framing above exists to prevent.
  - Sink only: CVSS:3.1/AV:N/AC:L/PR:H/UI:N/S:U/C:H/I:H/A:H computes to 7.2. The
    post-command field on its own is a documented administrator feature; an
    administrator reaching LocalSystem is a privilege-separation weakness rather
    than remote code execution, and publishing either half in isolation would
    misrepresent the finding.

No recorded score exists to correct here, and that is worth saying explicitly
because it is unusual: the material this analysis is built from carries no CVSS
vector and no base score for this finding, so both readings were derived from
the metric definitions and the measured facts, computed with the CVSS 3.1 base
formula, and rounded up to the tenth as that formula specifies. PR:N is a
property of the chain start, not of the sink in isolation: the least privileged
principal that reaches the sink by the documented path is a principal that did
not exist before the request.

Authentication, and the negative-control evidence behind the framing. The
counter-gate measurement is the load-bearing one, and its detail matters: within
the same service instance, in the same pass, an unauthenticated
`POST /WebApi/Process` returned 401 with an empty body while the first-run
wizard was simultaneously available to that same unauthenticated client, and
`POST /api/Authenticate/Login` returned 500 with an empty body because the REST
administration plane is gated by `RESTEnableAdminApi`, which has no row by
default and so makes the controller constructor throw. That is a counter-gate,
not a post-setup result: message-level authentication was demonstrably intact
and demonstrably irrelevant, because this chain never traverses it. We are also
correcting a detail of our own record rather than leaving it to be inferred: no
post-setup HTTP status sample was ever captured from the login route. Our
post-window evidence is exactly three observations - the setup screen is no
longer rendered, a credential form is rendered in its place, and the created
administrator's credentials were accepted through it. We are not going to invent
a 401 on that route.

The setup screen itself was measured as having zero preconditions: it submitted
successfully with the EULA checkbox untouched (present but non-blocking), with no
ticket parameter, with no CAPTCHA element in the DOM, with no first-boot token,
and from a client subject to no IP restriction (`IpAccess Enabled:0`, listener on
`0.0.0.0`). That rules out "the wizard is gated and we defeated the gate".

The unauthenticated surface was exhausted before we accepted this chain as the
result. Legacy `/WebApi/CreateAdmin` carries the same `AdminUserExists()`
predicate and is reachable unauthenticated, but it is functionally dead, and the
four-state characterisation is what proves dead rather than awkward: an empty or
null body yields a graceful login-failure result; a body carrying values, an
unknown field or an empty string yields a single-frame NullReferenceException
with a full stack trace and internal paths echoed to the unauthenticated caller;
an all-null body reaches deeper and produces an NxException carrying an
`E_POINTER` failure code. That route is a dead sibling, not an alternative
exploit path - and a vendor fix that repairs the model binding without fixing
the predicate would turn it into one. Elsewhere: the REST plane answers 500 by
default; the nxcli administrative port is localhost-restricted by a string check;
WebDAV requires authentication; the user-web faces are ticket-gated by design;
and we found no offline-forgeable ticket, no predictable session primitive, no
default or backdoor credential and no rows of any kind in the user table on a
fresh installation. Session-level defects published against the older generation
belong to the superseded 2.x code base and do not apply here.

What we do not claim about privilege: role enumeration found `ROLE_USERADMIN`,
`GROUPADMIN` and `SERVERADMIN` in the legacy access matrix, and this chain used a
full administrator created through the setup screen. We do not claim the sink is
reachable by any lower-privileged role; whether a user-administrator or
group-administrator can write a job's post-command was not tested, and if one
can, that is a separate finding about role separation rather than a change to
this chain's score.

Discovery cost is low and it is worth stating plainly: the setup screen renders
for any client, and a separately reported pre-authorised `ServerParams` read
family returns the window-running flag to unauthenticated callers, so exposed
installations can be enumerated at scale over one unauthenticated request. That
leak, together with the stack-trace echo described above, is reported as a
separate defect carrying no score attached to this finding, and neither is
needed by the chain.

Impact. The achieved identity is LocalSystem on the Windows host carrying the
file-exchange hub, which for this class of product is close to a worst case:
every trading partner's exchange credentials, since connector configuration,
SFTP/FTPS/WebDAV account material and the product's SSH and PGP key material sit
in the administration and domain databases, so a single host compromise becomes
the compromise of every exchange relationship the host participates in, with
parties who have no visibility into the incident; the files themselves in transit
and at rest, since connector source and destination directories are both
readable and writable from the service account, permitting interception, silent
substitution of content presented to partners and removal of evidence; transfer
configuration, since jobs, schedules, connector paths, notification settings and
audit configuration can all be rewritten, allowing a recurring partner transfer
to be redirected with no partner-visible change; host persistence and lateral
pivot, since LocalSystem permits creating accounts, installing services, writing
to startup locations and reading host credential stores, and MFT hosts are
routinely granted broad access to internal storage and domain resources so they
can collect and deliver files; and the availability of scheduled transfers,
since stopping the service, disabling jobs, corrupting the SQLite databases or
filling the connector volume halts every exchange, which for agreements carrying
delivery windows is a business-continuity event rather than a service outage.

Exposure is a race with deployment, not a permanent condition, and its length is
deployment-dependent - whether installation is scripted and unattended, whether
setup is part of the same change window or deferred, whether the listener is
published before configuration, whether the host is one of a batch configured
after the whole batch is up. We measured no typical duration and we do not
estimate one. The same build can be exposed for five minutes or for five days
depending on the operator's process.

Verification boundary, stated plainly, including what our own harness supplied.
Dynamic work ran on a Windows host with a fresh default installation of Titan MFT
Server 26.0.0.364 from the BitRock unattended package, driven over HTTP and the
Blazor circuit by a headless Chromium-family browser under the DevTools protocol,
with Python standard-library tooling only and a raw-socket WebSocket client. The
attack path is HTTP plus the product's own user interface: no direct database
writes and no direct API calls on the attack path, with database reads performed
read-only for forensic comparison. The whole sequence - window preparation, probe
set, account creation, job creation, injection, run, marker verification, control
run and teardown - executed inside one scripted pass whose stdout was captured,
so no step was proven on a machine that an earlier step's debugging had modified.
An earlier round on the same build returned the same identity through the same
path with a differently named administrator, a differently named job and an
independently named marker (also 21 bytes, also `nt authority\system`, also
immediately after its own job's completion timestamp), so the outcome is not a
property of one account or job name.

Two states were supplied by our harness rather than by the product, and both
belong in the reader's hands:
  - The first-run window was re-opened by an authorised local database reset:
    we deleted the administrator rows from the administration database and
    restarted the service, returning a previously configured host to its shipped
    zero-administrator state, because an earlier pass had completed setup. A
    never-configured installation lands in that same state by construction and
    the product's predicate reads only the row count, but we did not observe this
    chain on a machine that had never been touched.
  - The vantage point was loopback, with inbound firewall rules blocking remote
    TCP and UDP on 47443 and 37443 for the duration of the run (loopback exempt,
    so the run stayed on the host; rules removed afterwards, service left
    stopped). "Reachable from an untrusted network" is therefore a reading of the
    shipped `0.0.0.0` binding and the disabled IP restriction - both artifact
    facts - and not a measurement of an attack crossing one. No request in this
    verification crossed an untrusted network boundary. Reproducing it from a
    remote position would strengthen the finding, not contradict it.

Further limits. The second listed build, 26.0.0.348, had its first-run half
confirmed dynamically; its injection tail rests on a shared code base, which is
a structural argument rather than a separate replay, and no separate score is
published for it because that would imply a measurement we did not make. No
cloud-shaped installation was sampled, so the `CreateAdminAtConsole` branch and
its interaction with the legacy creation route remain uncharacterised - the
branch is unestablished rather than exempt. Nothing characterises a specific live
production installation. Only these two builds were tested: no other version,
edition or family product is claimed, including Titan FTP Server, WebDrive and
the older 2.x generation. One client-side requirement is real but ordinary: the
setup screen and console are Blazor Server surfaces whose content appears only
after a circuit boots, so an attacker needs a headless browser or an equivalent
circuit client rather than a bare `curl`, which is what the published proof of
concept implements.

Detection notes, including the trap that produces a false negative on an exposed
installation. Every step of this chain is a documented administrative action, so
there are no failed logins, no injection payloads and no exploitation signatures
to find. The operator self-check has to be done in a browser: load `/Login` and
read the rendered text. If the page says `Initial Admin User Setup` and offers a
`Create Initial Admin User` button with four inputs, the installation is inside
the window; if it says `Login to <server-name>` and offers `Login`, it is
outside. Do not use a plain HTTP fetch for that check, because a `GET /Login`
returns only the framework's host shell - 3,869 bytes containing none of the
setup text - since the Blazor component tree renders only after the circuit boots
client-side; grepping that response reports "no wizard" on a host that is in fact
exposed. This is the easiest way for a defender to reach the wrong conclusion
about their own installation. A third check from the host: count the rows in the
administration database's `nxUserParams` table, where zero rows means inside the
window, and repeat the check after any administrator deletion, restore or
re-image, since the window is a function of that table's contents and not a
one-time installation event.

High-signal indicators: administrator rows created outside change control with an
immediate first-login; a login circuit that goes from setup submission straight
to `/SvrHome` with no preceding credential exchange; the product's own
`Post Command: <text>` log line, whose text is preserved verbatim and which is
the highest-fidelity detection point available; any child process of
`titanmft.exe` running as `NT AUTHORITY\SYSTEM`, because the service has no
legitimate reason to spawn shells other than administrator-configured
post-commands; job-history rows for jobs no schedule references, including
successful runs with zero files transferred; and the classic injected-job shape -
a job whose source and destination are both the local filesystem, which transfers
zero or one file, and which carries a non-empty post-command. Alerting on any
child of the service process is cheap and effective. What will not detect it:
signature hunting, authentication-failure monitoring, and looking for SQL
injection or deserialization payloads. There are none, because the attacker never
needs to fail a login and the payload is a legitimate configuration field.

Mitigation summary, ordered by root cause. Move initial-administrator creation
off the network face: do it in the installer's console step, or require a
one-shot bootstrap token generated at install time - printed to the installer
transcript or written to a host-local file with a restrictive ACL - that is
single-use and expiring; the `CreateAdminAtConsole` branch already exists for
cloud-shaped deployments and is the natural home for this on all deployments. Do
not let the network listener start before setup is complete, or bind it to
loopback and the management interface until an administrator exists, which removes
the deployment race entirely and does not depend on operator timing. Constrain
the command field: construct the child process with `ProcessStartInfo.ArgumentList`
instead of a single `Arguments` string, remove the `cmd`-prefix special case that
reconstitutes shell semantics, enforce an allow-list of executables, reject the
shell metacharacters `&`, `|`, `<`, `>`, `%`, `^`, `(`, `)` and newlines unless
an explicit per-deployment switch enables them, validate the working directory
against the job's connector paths, and apply the same treatment to the
pre-transfer sibling. Separate the execution identity: do not run the transfer
engine, and therefore post-commands, as LocalSystem; use a virtual service account
or a per-job token granted only the connector paths, and note that
`CreateProcessAsUserW` already appears in the shipped legacy shim, so the plumbing
exists. Stop leaking window state and internals: remove the window-running flag
and any administrator-exists differential from unauthenticated responses, make
the response shape identical either way, and return a bare 400 instead of a .NET
stack trace when legacy model binding fails. Validate the predicate itself by
gating initial-administrator creation on a channel binding rather than on a row
count, so even a deferred deployment cannot be completed by a remote client.
Reduce the pre-authentication fingerprint on the FTP face. Ship regression tests
for all four layers, because three of these fixes silently regress: with zero
rows in the user table a network request to the setup route must not create a
user; a post-command of `cmd /c whoami > %TEMP%\x` must produce no file; the
documented supported configuration must not run the service as LocalSystem; and
`ServerParams` must never return window state to an unauthenticated caller.

Operator side, until a patch exists. Treat "installed but not configured" as an
open exposure rather than a pending task, and complete first-time setup from the
console in the same change window as the installation. Block inbound TCP 47443
(and 37443, 8080, 21, 80 and 443 as applicable) at the host firewall or upstream
until an administrator exists, and do not rely on the product's IP-restriction
feature being enabled, because the configuration we examined had it disabled. Put
the administration listener behind an authenticating reverse proxy or a VPN: this
is the single highest-value operator control precisely because it is indifferent
to the window's state. Do not run the service as LocalSystem where the deployment
permits otherwise. Audit every job whose `PostCommandText` is non-empty against
change control, restrict job-creation rights to named administrators, and alert on
the three high-signal events above. If the window was open on a reachable listener
at any point, treat the installation as potentially compromised rather than as
merely exposed: audit the administrator list for accounts nobody created, review
every job and its post-command, review connector credentials for unexplained
changes or access, and rotate partner credentials and SSH/PGP key material as the
risk assessment warrants.

The published proof of concept drives the product's own user interface through a
real browser and offers five modes: `gate`, a read-only window probe that is the
authoritative browser check described above and exits non-zero when the
installation is not inside the first-run window, exiting 3 when the window is
proven closed and 2 when the state cannot be proven at all; `exploit`, which
creates the initial administrator, builds a job, writes the post-command, runs the
job and reads the marker back, and refuses to run without an explicit confirmation
flag; `control`, which re-authenticates as the created administrator, clears the
post-command, re-runs the identical job and proves the marker did not change;
`cleanup`, which clears the post-command and marks the job do-not-run; and
`full`, all of the above in one pass. Its default payload redirects the output of
`whoami` into a marker file instead of doing anything destructive, it takes every
target-specific value as an argument with no address baked in, and it uses the
Python standard library plus a browser.

Full technical analysis and a reproducible proof-of-concept:
  https://0day-rubbish.com/blog/southriver-titan-mft-firstrun-admin-setup-job-command-injection

Project archive (ongoing disclosure series):
  https://github.com/Exploit-Garbage/0day-Rubbish

South River Technologies was notified on the same day this research went public,
through the general commercial mailbox that company publishes. The vendor
publishes no RFC 9116 security.txt, and its site map contains no security page,
vulnerability-disclosure policy or product-security intake, so there was no
pre-publication channel for us to use and we submitted nothing to any reporting
form. This disclosure is unconditional: the analysis, the proof of concept and the
two scores above are already public, we asked no permission, set no embargo and
withheld nothing pending a reply. No vulnerability identifier has been assigned to
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
