---
title: "Full Disclosure: [0day-rubbish] CloudPanel 2.5.4-3 site-settings rootDirectory nginx virtual-host injection to host root code execution (8.8)"
source: https://seclists.org/fulldisclosure/2026/Oct/14
source_host: seclists.org
clip_date: 2026-10-15T16:21:41+08:00
trace_id: 4783cc67-930d-4f28-88d9-9e8b251d1e9d
content_hash: 33d5a2b8f3b50a03c05c13c4a5805c64fc0c35fbf4d4f2ae8494d037af74ddbc
status: synced
tags:
  - 漏洞分析
  - Linux安全
series: null
feed_source: Full Disclosure·漏洞披露
ai_summary: CloudPanel 社区版 2.5.4-3 的站点设置 `rootDirectory` 字段缺少字符校验，具备最低角色 ROLE_USER 的用户一次表单保存即可向 nginx 虚拟主机注入指令，最终以主机 root 身份执行代码。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3fa75244-d011-819c-b2b3-c6ae48374656
ioc:
  cves: []
  cwes:
    - CWE-20
    - CWE-250
    - CWE-269
    - CWE-74
    - CWE-78
    - CWE-93
  hashes:
    - 24c36a4739ce065c5c188c89def06f29
    - 40621176f9df719abc43a35a08983631
    - 6727bffeb96cb3e03b85d00eac39c47c
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> CloudPanel 社区版 2.5.4-3 的站点设置 `rootDirectory` 字段缺少字符校验，具备最低角色 ROLE_USER 的用户一次表单保存即可向 nginx 虚拟主机注入指令，最终以主机 root 身份执行代码。
> 
> - **注入机制：** 值经 `sprintf("root /home/%s/htdocs/%s;", …)` 直接拼入 vhost，无 basename/realpath/白名单/长度检查，末尾 `rtrim` 是死代码；落盘用 `escapeshellarg` 包装的 `sudo tee`，故属配置语法注入（CWE-93），并非命令注入（CWE-78）。同表单其他字段（域名、控制台通道）都有校验或裁剪，只有该字段没有。
> - **提权来源：** 厂商自带 nginx.conf 第 1 行 `user root;`、File Manager 的 php-fpm 池 `user = root`（socket 无 open_basedir、disable_functions）、sudoers 免密 sudo。注入 `dav_methods PUT` + `alias /tmp/` 得匿名 WebDAV 写入，再注入 `fastcgi_pass` 到该 socket 得 root PHP 执行，回显身份 `uid=0(root) gid=1000(clp)`。
> - **利用前提与盲点：** 设置页不在 `^/admin`，只需 ROLE_USER；保存返回 302 且 reload 成功检查恒为真、后台执行，因此无语法校验、无回滚，非法值还会留下导致重启失败的配置（独立 DoS 项）。另附披露的 `X-Forwarded-For` 身份互换可成功但对本链无增益（`^/api` 无路由）。产品为零用户状态，无默认凭据，故不属默认口令类。
> - **评分：** 8.8 High（AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H）；PR 取 L 而非 H，因验证用的就是 ROLE_USER 会话；Scope 采 Unchanged，理由是跨租户影响属推断而非实测，Changed 形式被记录为被否决读法。
> - **缓解：** 对该字段加字符白名单（至少拒绝换行、分号、花括号、注释符、引号、空白与相对路径），在校验后再拼接；对渲染产物跑配置测试并走产品自带的回滚写入器；File Manager 池降权并限制 socket；模板随包发布；运维侧监控 sites-enabled 中出现 `dav_methods`、新增 0600 root 文件、同秒 reload 等指标。

## Full Disclosure mailing list archives

## \[0day-rubbish\] CloudPanel 2.5.4-3 site-settings rootDirectory nginx virtual-host injection to host root code execution (8.8)

* * *

*From*: disclosure via Fulldisclosure <fulldisclosure () seclists org>  
*Date*: Tue, 13 Oct 2026 02:21:18 +0000  

* * *

```sql
0day Rubbish Research Team is publicly disclosing a vulnerability in CloudPanel
Community Edition 2.5.4-3+clp-bookworm, the closed-source server-management panel
from cloudpanel.io (Germany) that provisions and supervises nginx, php-fpm,
MariaDB and hosted web sites from a Symfony application listening on port 8443.
The build under advisory is the vendor's own distribution package, 69,183,476
bytes, md5 24c36a4739ce065c5c188c89def06f29, on Debian bookworm x86_64. Only
this build was tested; no other version, edition or deployment target is
claimed, in either direction.

Type: injection of control characters into a configuration file that a second
parser then reads as syntax, CWE-93 primary, with CWE-20, CWE-74 and CWE-269 /
CWE-250 contributing. This is not command injection and we do not classify it as
CWE-78: the writer that puts the text on disk is
`echo %s | /usr/bin/sudo /usr/bin/tee %s` with both substitutions passed through
`escapeshellarg`, so the newlines travel inside a single-quoted shell argument as
data and no shell metacharacter reaches a command line. The sink is the virtual-host
renderer. `RootDirectory.php` owns the `{{root}}` placeholder and composes it at
label `b9892` as
`rtrim(sprintf("root /home/%s/htdocs/%s;", $siteUser, $rootDirectory), "/")`.
That `rtrim` is dead code, because the format string always ends with a semicolon
and so its result can never end with a slash. Between the value entering the
method and being composed into a directive there is no call of any kind - no
`basename`, no `realpath`, no `preg_match`, no allowlist, no blacklist, no length
check, no character check. The database value is the concatenated value. The
attacker therefore does not control the `root` directive's value but its tail,
which is sufficient: a leading semicolon terminates the already-started directive
cleanly and the injected blocks that follow land at server context ahead of the
template's own `location` blocks, where the `^~` prefix match outranks regex
locations. `{{root}}` appears twice in the hosting template, so the payload is
inserted twice, once per server block, which is consistent with the observed
file growth.

The double standard is the useful part for anyone auditing a similar form. The
same form family validates the domain name with a dedicated constraint whose
pattern excludes `/` and `\`; the command-line channel clamps the identical
root-directory value with `ltrim(rtrim($x,"/"),"/")`; and a neighbouring
free-text field on the same page has a four-step pre-submit normalization that
rewrites double quotes to single ones. The web-channel `rootDirectory` value
passes through none of these. Its only declared constraint is a not-null check,
and its entity setter performs no sanitization.

What turns a configuration write into host-root execution is vendor packaging,
not attacker choice. The vendor's own `nginx-common 1.30.4-1+clp-bookworm` ships
an `/etc/nginx/nginx.conf` whose line 1 is literally `user root;` and whose line
119 is `include /etc/nginx/sites-enabled/*.conf;` (md5
6727bffeb96cb3e03b85d00eac39c47c, 3,077 bytes, taken from the package payload
rather than transcribed from a note). The same package ships
`/home/clp/services/php-fpm/fpm/pool.d/file-manager.conf` declaring
`user = root` and `group = clp` on `/run/clp-fm-php-fpm.sock`, with no
`php_admin_value`, no `open_basedir`, no `disable_functions` and no
`security.limit_extensions` anywhere in its seventeen lines. So an injected
block carrying `dav_methods PUT; create_full_put_path on; alias /tmp/;` yields an
anonymous WebDAV write primitive, and a second injected block carrying
`root /tmp; include /etc/nginx/fastcgi_params; fastcgi_pass unix:/run/clp-fm-php-fpm.sock;`
hands anonymous PHP execution to a pool that runs as root.

The identity reached is host `uid=0(root) gid=1000(clp) groups=1000(clp),0(root)`,
corroborated in the same response body by `posix_getuid()` and `posix_geteuid()`
returning 0, by `whoami` returning `root`, by the uploaded file landing as
`-rw------- 1 root root`, and by a filesystem-type read showing the marker landed
on durable overlay storage rather than tmpfs. The exact shape of that identity
string matters and it is not decoration: `id` run from outside the container
prints `gid=0(root) groups=0(root)`, and a pool declaring only `user = root`
would print the same, so the `gid=1000(clp) groups=1000(clp),0(root)` that came
back over HTTP can only have been produced by the product's own execution path
through a pool declaring `user = root; group = clp;`. Labelled honestly, that is
a morphological inference from verbatim strings in two independent rounds plus a
packaged pool file whose bytes are on record; the reviewing pass did not itself
start a File Manager pool to observe the shape directly.

Confirmation and what was deliberately not reproduced. The save answers 302 with
no error text, and the product cannot report failure at all, because its reload
success check returns true unconditionally and the reload is backgrounded. So the
proof channel is the two anonymous requests plus the marker body, and four
requirements were defined in advance and checked in every round: a live `id`
containing `uid=0(root)` with no uid hardcoded in the uploaded script; device
self-attestation values in the body that are absent from our own payload and our
own script, with a positive control proving the search works and with two
witnesses downgraded honestly (the boot identifier is shared across containers on
one host kernel and the application secret is a factory constant, so the genuinely
device-unique witness is the container hostname, differing between the two sets
and independently embedded by `uname`); a fresh nonce per round appearing
simultaneously in the uploaded filename, in a comment line inside the written
virtual host and in the marker body, paired with the post-reload digest of that
specific file and a per-nonce `nginx -T` hit count that goes 0 to 1 for the
current round and back to 0 for the previous one; and evidence being response-body
content and size, never a status code, since 201 and 200 both occurred in failed
rounds too.

Deliberately not reproduced, and not claimed: cross-tenant impact, because no
second tenant was present; whether an illegal payload is rolled back under
vendor-native wiring, since both native sets used legal payloads and the
no-rollback behaviour was measured only under harness wiring; where injected text
lands in the PHP-site template, because that template is not in the package at all
and is imported at install time by a `git clone` of an external repository into a
database column; the second injection point of the same shape feeding the
`{{settings}}` placeholder, which static analysis says has the same exposure but
for which no dynamic round was run and no control was constructed; and whether a
local console invocation of the same sink, which the sudoers drop-in grants to any
local user, can inject this field. One measured anomaly carries no established
mechanism either: when the injected block omits the fastcgi parameter include the
execution leg returns a silent zero-byte body, the phenomenon was observed twice,
and two proposed mechanisms were both contradicted by the logs.

Scoring. One score is published: 8.8 High,
CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H, derived from first principles - ISS
0.914816, Unchanged impact 5.873119, exploitability 2.835255, base 8.708374,
ceiling-to-tenth Roundup 8.8. No correction to any recorded score is needed. No
conditional or higher reading is published: we identified no deployment state that
makes this chain unauthenticated, and publishing a hypothetical PR:N figure
conditioned on an unproven bypass would be inventing severity.

Privileges Required is the metric worth arguing hardest, so both directions are
given. It is PR:L and not PR:N, because no anonymous path reaches this sink: the
catch-all access-control rule requires full authentication, twelve URI-mismatch
variants against one protected route produced zero admissions, the anonymous
identity-swap primitive described below yields an identity with zero additional
capability confined to a route space that does not exist, and there is no factory
credential to use since the product ships with zero users. It is not PR:H, because
ROLE_ADMIN was never required - the settings page is not under `^/admin`, the
handler declares `ROLE_USER` exactly once, and the injection was performed with
`ROLE_USER` sessions and observed to take effect. Had only an administrator been
demonstrated, the correct metric would be High and the same impact weights would
produce 7.2, so getting this one metric wrong moves the score by 1.6 points.

Scope: Unchanged, and this is the reading a triage process will question first,
because the outcome is host uid=0 on a multi-tenant hosting panel. The temptation
to publish Changed is genuine and we state it accurately rather than dismissing
it: the vulnerable component is the panel application authorised to a tenant role,
while the achieved impact lands on the host operating system and, in a
multi-tenant deployment, on every other tenant's site - components outside the
panel's own authorisation boundary, impacted in their own right, by an action
authorised as "a tenant edits a setting on their own site". That is the textbook
argument for Changed and it is not strained. We publish Unchanged for three
reasons in increasing order of weight. First, the privilege ceiling is produced
entirely by the vendor's own shipped configuration - `user root;` in the vendor
nginx build, `user = root` in the vendor File Manager pool, and
`clp ALL=(ALL) NOPASSWD: ALL` in the vendor sudoers drop-in - so every step of
the escalation is performed by a component the product itself installed,
configured and invoked, and the product is the authority at each step. No second
product's exposed interface is being reached through the first product's flaw;
what is reached is the host, through identities the product established. Second,
the cross-tenant consequence is a capability inference and not a measurement: we
did not run the verification on a host with a second tenant installed and we
measured no impact on another tenant, and publishing Scope Changed on an untested
cross-tenant claim is precisely the class of overreach that produces public
corrections. Third, the conservative value already communicates the finding - 8.8
High reads as remote authenticated host-root code execution to every triage
process that consumes it, so nothing decision-relevant is lost by declining the
upgrade. The Changed-scope form of the same facts,
CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:H, is recorded in the analysis as a
rejected reading: it is not published as a headline and no number is attached to
it. If a triage process or an identifier-assigning authority prefers the Changed
reading on the grounds that a tenant-scope authorisation boundary is crossed to
affect the host and other tenants, the argument above is the complete case for it
and the only missing evidence is a two-tenant measurement.

Authentication: post-authentication, lowest panel role. Sessions are ordinary
Symfony sessions issued by a login POST carrying `userName`, `password` and
`_csrf_token`. The site-settings page is not under `^/admin`, so it falls to the
catch-all rule requiring full authentication; the singular `role:` key in that
rule is valid rather than a silent typo, because the framework's configuration
normalization folds it into the plural form, and the dynamic proof that the
catch-all is live is that an anonymous request for a deliberately nonexistent
path returns 302 to the login page rather than 404, meaning the access-control
check fires before route resolution. Fourteen sampled protected paths all
redirected, and twelve URI-mismatch variants - trailing slash, doubled slash,
encoded slash, matrix-semicolon path parameter, dot segments, percent-encoded
letters, a null byte, upper-case folding, an added query string - were fired at
one protected route with none admitted; the only non-redirect result was a 400
from nginx rejecting the null byte. And the principal was not merely argued, it
was used: four distinct `ROLE_USER` identities across two reproduction sets
performed five injection rounds, each measured at the HTTP layer, and every round
returned uid=0. Those accounts were created through the product's own
administrative user-creation form, which is the intended provisioning workflow
and is not part of the attack chain.

There is no factory panel credential, and the distinction is load-bearing.
CloudPanel ships in a zero-user state: no factory password, no built-in
administrator account with a published secret, no fallback credential anywhere.
The only route to the first administrator is the installation wizard, which is
public in the access-control list and is ordered ahead of the `^/admin` rule by
design, and which is gated by a count of existing users. We attacked that gate
and measured it closed twice: once a user exists, an anonymous GET and an
anonymous POST both redirect to the login page without ever yielding a CSRF
token, no administrator identity chosen by the attacker was persisted, the user
table afterwards still held its single pre-existing row, and a login attempt with
the chosen credentials failed. On a genuinely zero-user installation the wizard
page does answer 200, which is anonymous reachability of a credential-creation
surface, but exploiting it requires a host state that exists only between package
installation and first use, and we do not count an installation wizard as a
vulnerability. The panel account used for verification was seeded by us, through
the product's own wizard and then the product's own user form; it is not a factory
default, it does not exist in any shipped artifact, and its password is a
command-line argument to the reference exploit that appears nowhere in published
material. That is what keeps this finding in the post-authentication category
rather than the default-credential category.

The exhausted unauthenticated surface, and the honest negative. The most promising
anonymous route to this sink was the `X-Forwarded-For` header reaching the
API-token authenticator, and it deserves a complete answer because it nearly works
and then fails for a reason that is easy to state wrongly in either direction. The
authenticator holds a two-entry IP allowlist - the container bridge gateway
address and loopback - and its support gate requires an `Authorization` header
that merely exists and begins with `Bearer `, never inspecting its value. On an
allowlist match it issues a self-validating passport for the user identifier "api"
without reading the token and without querying the token repository, so this is an
IP-trust problem rather than a token-forgery problem. The transport is present in
the vendor's own configuration: the panel nginx `http` block carries
`set_real_ip_from 0.0.0.0/0;` alongside `real_ip_header X-Forwarded-For;` and
`real_ip_recursive on;`, both fastcgi parameter files pass `REMOTE_ADDR` through to
PHP, and Symfony declares no trusted proxies at all - searches for the trusted-proxy
identifier, the setter, `REMOTE_ADDR`, `X_FORWARDED_FOR` and `HTTP_X_FORWARDED`
across the source tree, the whole configuration tree, the front controller and
`bin` returned zero hits. With recursion on and every candidate inside
`0.0.0.0/0` there is no untrusted address at which to stop, so a single-entry
header naming loopback yields that address regardless of the recursive setting.
Note which allowlist entry this matches: loopback, not the container gateway. That
is what decouples the weakness from any container artifact - the value is written
into the vendor's own source and is present identically on bare metal, so a remote
client that can set a header does swap identity on a default installation.

It does not help, for four independent reasons each sufficient on its own. One,
the identity is scoped to an empty path space: the api firewall matches `^/api`
and there are zero routes under it, since the route file's entries are commented
out, no route attributes were found anywhere in the source tree, and the product's
own router listing shows no path beginning with `/api` even though a controller
class for it exists; this advisory's sink sits under the main firewall and the api
identity cannot reach it. Two, the role granted is `ROLE_USER`, and with no
`role_hierarchy` in the configuration that identity inherits nothing, so `^/admin`
stays closed. Three, the ownership gates stop it even inside its own reach: the
sites controller returns null for any domain requested by an account that owns no
sites, site creation is refused for `ROLE_USER` at all seven entry points, and of
the seven routes functionally reachable to such an identity the count of execution
sinks and root-write sinks is zero - a zero that carries a positive control, since
the same detection pattern finds four hits in the dashboard controller and zero in
two other front-end controllers of comparable size. Four, and stated as a
limitation rather than hidden: the dynamic observation genuinely does not decide
this, because a request to an `/api` path returns the same 302 with a 270-byte body
as a request to a deliberately nonexistent path, so the response cannot distinguish
identity-not-granted from no-route-here. The route-space non-existence decides the
question statically and arithmetically; the dynamic leg is corroborative only. A
four-shot control was run against one endpoint - no header at all, `Bearer` alone,
`Bearer` plus the loopback address, and `Bearer` plus a non-allowlisted address as
the negative leg - and all four response bodies were byte-identical. The correct
summary is therefore that the identity swap succeeds on a default installation and
yields an identity with zero additional capability. That is a real weakness,
because a request header should not control an authentication decision, and it is
disclosed as its own item; it is not a bypass into this sink and it contributes
nothing to this vector.

Deployment shapes are stated in both directions, because that argument depends on
the vendor's real-IP configuration. Removing or narrowing the
`set_real_ip_from 0.0.0.0/0;` entry, or removing `real_ip_header X-Forwarded-For;`,
removes the transport: the reflected address becomes the TCP peer, and reaching the
allowlist then requires a genuine on-box loopback position - the bridge gateway case
in a containerised deployment, or any local process for loopback. Conversely, a
shape that would weaken our reading is one we did not test: if another proxy or
load balancer sits in front of the panel and overwrites or appends to that header,
the entry nginx selects changes, and with recursion on and a mixed trusted-range
configuration the selected address can be one the outer proxy chose rather than one
the attacker chose. A default installation has no such layer, because the
maintainer script installs the unit directly, so we make no claim about a fronted
deployment in either direction; the vendor's changelog for an earlier version
mentions fixing server-IP disclosure behind a content-delivery network, which
indicates the real-IP trust model exists deliberately for that scenario and has
already been revisited. What does not change with any of it is reasons two and
three: the granted role, the empty `/api` route space and the ownership gates are
properties of the application and its routing table, not of the network path, so
hardening real-IP handling does not fix a remote code execution issue - it removes
an identity-swap primitive that was already capability-free. The corollary is worth
an operator's attention: the api firewall is declared today with an empty route
space, and on the day routes appear under `^/api` that primitive becomes
materially more serious. And nothing in the published chain depends on any of this,
because every round started from a legitimate panel session, never sent the header,
and reached the sink through the main firewall.

A correction to our own earlier reading, published because it was wrong. An
earlier statement in this research held that a `ROLE_USER` is inert - no SSH
access, no sudo, no shell - which would have made the escalation to host root the
entire story. That reading was disproved and withdrawn. The user-creation command
builder takes the login shell as a parameter, and the product ships site SSH user
forms and their manager, so a `ROLE_USER` can create a site SSH user with a shell
and log in as the site system account; the sudoers drop-in grants the clpctl command
set to any local user without a password on one line and grants the panel account
unrestricted passwordless sudo on another, so a local route to root already existed
and needs only a local shell. The consequence is that the gain from this finding
must be argued on remote reachability rather than on the weakness of the starting
role, which is not weak. Coverage is likewise stated without an exhaustiveness
claim: twenty-two of 119 Symfony routes were exercised anonymously, about eighteen
percent. The catch-all evidence is structural and strong for the question it
answers, but it says nothing about whether a second-layer check inside an
individual route body fails open, and those bodies were not individually tested.
Statements of the form "no second injection point exists" appear nowhere in the
advisory.

Impact: arbitrary OS command execution as host `uid=0` on the machine running the
panel, reached with one authenticated form save followed by two anonymous requests.
On a hosting server that is total compromise - every hosted site's document root,
every site system account and its SSH keys, the panel's SQLite database holding
password hashes and API tokens, session files, TLS private keys, MariaDB's data
directory, the sudoers tree, every systemd unit and every cron drop-in are inside
the achieved boundary, as is the ability to rewrite any virtual host on the box,
which is the practical route to persistence and to attacking hosted sites'
visitors. The observed identity read back the product's application secret from
its runtime environment file, the File Manager pool file confirming `user = root`
from inside rather than from a package listing, the first line of both nginx
configurations, the filesystem type under the marker, and the full sudoers drop-in
including the passwordless sudo line; in the authoritative round the marker body
returned the sudoers contents verbatim. That application secret is a static factory
constant identical across installations, and we checked it in three directions
before calling it a disclosure item rather than a key - CSRF tokens are
session-stored and not an HMAC of it, the product has no remember-me surface at
all, and the auto-login token is filename-addressed with file content as its
credential - so all three are negative. Because the start identity is the
tenant-level role on a multi-tenant panel, one tenant's single form save would
compromise every other site on the same host; that is stated as a capability
inference from what host root can do, not as a measurement. Steps after the save
are anonymous, so revoking the session or rotating the credential mid-attack does
not stop the second half once the first has landed: the directives are on disk and
loaded, inside a legitimate root-owned product-managed configuration file, and the
save handler logs nothing because it returns a redirect with success semantics.
Availability is total, and the injection surface carries a second, non-execution
consequence for free: a syntactically invalid value leaves a broken configuration
on disk with no rollback and no configuration test on this code path, so the next
nginx restart or host reboot fails to bring up hosted sites while the product
reports success regardless. That persistent denial-of-service condition is a real
and separately reportable consequence of the same missing validation, and scoring
it into the code-execution vector would double-count one root cause, so it is
reported as its own disclosure item and folded into nothing.

Verification boundary, stated plainly. All dynamic work ran inside a
single-container testbed built from the vendor `.deb`, with the vendor nginx,
MariaDB and sudo present, reached over the container's HTTPS listeners by a
pure-standard-library client driven from the container host, with published ports
bound to loopback addresses only; no request crossed a network boundary, so remote
reachability is argued from the product's own listener configuration rather than
measured from a separate host. Two reproduction sets are published and their
numbers are never mixed: set A is chain-authoritative, because it is the only set
in which the product's own reload, the vendor wiring, the anonymous write and the
anonymous execution all happened inside one container in one continuous run, and it
observed two rounds against a single site; set B is the one in which the delivered
reference script was actually executed, three rounds each against a brand-new site,
a brand-new virtual host and a brand-new low-privilege account so that no round
could contaminate another, with both configuration digests independently
re-measured at open and at close. Five end-to-end rounds were observed in total. A
third complementary round exists, wired by a harness symlink and with the reload
performed by signalling the master process; it produced the clearest
writer-versus-executor asymmetry and its numbers are quoted for that structural
point only, excluded from every set-A and set-B figure because its wiring was ours.

What the harness supplied is disclosed as harness state. The container had no init
system as PID 1, so first startup of MariaDB, both nginx instances and php-fpm was
a test-harness action, and the one file replaced on disk was `/bin/systemctl` - a
1,353,368-byte binary owned by the systemd package, md5
40621176f9df719abc43a35a08983631, replaced by a 35-line shim that reads
`ExecReload` from the vendor unit at run time and logs every invocation with its
argument vector, effective identity, parent pid, sudo environment, two levels of
ancestor process, the unit's reload line, the reload return code, the post-reload
worker set, the post-reload nonce presence in `nginx -T` and the post-reload digest
of every virtual-host file. Package verification afterwards reported only a runtime
log difference for the panel package, nothing at all for the vendor nginx package,
and only our shim for systemd, so no product file was modified. The reload hop is
the one place a laboratory could substitute for the product, so it is instrumented
rather than assumed: across both sets every recorded reload invocation carried
`SUDO_USER=clp` with the matching sudo uid, and zero carried an empty sudo user,
which is the count that would be non-zero for a harness-issued reload. Two honest
limits on that instrumentation. The ancestor chain terminates at the sudo process,
because the product wraps the reload in a shell that exits first and sudo is
reparented to PID 1, so the pool process was never captured directly; attribution
of the reload to the panel pool therefore rests on three things composed together -
the sudo environment matching the panel pool's identity, the reload timestamp
matching the save request to the second, and the archived product source line - and
that composite is strong but it is not a single measurement. And the reload's effect
is proven on observable state and never on a return code, because the product's own
success check is hardcoded: worker pid sets rotated in every round, the current
round's nonce went from 0 to 1 hits in `nginx -T` while the previous round's went
back to 0, the configuration test passed, and no `.bak` existed. For set A an
independent third-party corroboration exists, since the site's own error log
attributed the requests to the rotated worker numbers and nginx wrote those lines,
not us; set B's error logs were empty because every request succeeded, so that
corroboration is present for one set and absent for the other, which is recorded
rather than papered over.

Seven controls were run across both sets; six did what a control should and one is
reported as invalid. The control that matters most is the delivered script's
control mode, which repeats the entire authenticated flow - login, settings fetch,
form submission - with the root-directory value submitted exactly as it was read,
carrying no newlines and no directives, then performs the same two anonymous
requests against the same URL prefixes and asserts that the write primitive does
not appear. That isolates the injected newlines as the sole cause of the write
primitive, which is the whole causal claim. The others, each producing no marker
and no identity string: no injection at all against a site the product had already
created, answered by nginx's ordinary 404; a wrong execution path against an
injected site; the correct path with no upload against an injected site carrying a
fresh never-uploaded nonce, answered `File not found.` with the site error log
carrying a primary-script-unknown message, which is the control proving that
injection on disk is not execution and that the upload is a necessary hop rather
than a convenience; the execution path requested against the panel listener carrying
a real nonce, answered 404 with the panel's own error page, the empirical form of
the claim that the injection is inert against the panel's non-root nginx
configuration; a cross-virtual-host request naming another site's domain, answered
404, showing the injected blocks affect only their own server block; and a
non-executable extension in the same directory, answered 403, showing execution is
confined by the location pattern rather than granted to the whole directory. The
invalid control is reported as invalid: a host-substitution variant in the earliest
harness-wired round returned 200 and emitted the marker, but in that harness the
injected virtual host was the only server block on 443 and therefore the default
server, so any host value would have reached it. It could not distinguish "host
matching does not matter" from "there was nothing else to serve" and it is void.
Combined with a resolver mapping in both later sets that made the host header match
the configured server name, the only defensible statement is that reachability
depends on the `server_name` and default-server configuration and that reachability
by an arbitrary host value was never proven. All three attempts to isolate that
question failed, for different reasons each. Also not established, and not papered
over: the container's memory sizing, which is why no sizing advice is published;
the rendering target for PHP-type sites; and the exit code of one set-B round whose
output was truncated, for which zero is derivable from the implementation but
derived is not measured and is labelled as such.

The reference exploit takes the panel address, port, scheme, login path,
credentials, the site's virtual-host name (also used for SNI and host on the site
side), the injected location prefixes, the pool socket, the fastcgi parameter file,
the command to run, a round count and a verbosity flag as parameters. It defaults
to loopback, requires both credentials on the command line with no embedded
default, uses only the standard library, offers the control mode described above
plus repeatable rounds each with a fresh nonce, and performs no automatic cleanup -
it prints the manual restoration steps instead, because the injection is
persistent: the site's root-directory value must be restored to a plain directory
name, nginx reloaded, and the marker directory removed.

Detection notes worth carrying into a rule. The earliest and cheapest detector
needs no host access: a root-directory column value in the panel database
containing a newline, a semicolon, or the substrings `location`, `dav_methods`,
`fastcgi_pass` or `alias`. Then any growth in `/etc/nginx/sites-enabled/*.conf` not
explained by a legitimate change, and any occurrence of `dav_methods` at any line of
any file there, which the shipped templates never emit; `PUT`, `MKCOL` or
`PROPFIND` verbs in the site-facing access log for a hosting tenant, whose visitor
traffic should never contain WebDAV verbs; new files under `/tmp` with mode 0600
owned by root and a `.php` extension inside 0700 directories created through
`create_full_put_path`; rotated site-facing worker pid sets without a matching
administrative action, and reload invocations following a site-settings save within
the same second; and `directive "root" is not terminated by ";"` or any emergency
message at nginx startup, both of which mean a poisoned configuration is already on
disk and the next restart will fail. The caveats matter as much as the signals:
the product produces no log line for the injection itself, because the save handler
returns a redirect with success semantics and the reload reports success
unconditionally; there is no audit trail in the panel UI; and an attacker using a
marker file rather than a persistent shell leaves a 0600 root-owned file that
ordinary site-level monitoring has no reason to inspect.

Mitigation summary: add a character-level validator to the root-directory field,
mirroring what the same form family already does for the domain name - an allowlist
of alphanumerics, dot, underscore and hyphen is sufficient for a directory name, and
at an absolute minimum reject newline, carriage return, brace, semicolon, the comment
character, quotes, whitespace and any leading traversal sequence - and apply it on
the web channel, because the console channel already clamps the same value. Fix the
dead sanitization by operating on the input before composition rather than on the
composed string. Treat every virtual-host placeholder as a structured-configuration
sink and put one shared line-oriented allowlist normalization in front of all
processors, covering the root, page-speed settings and PHP settings placeholders.
Validate the rendered artifact rather than only the template: run the configuration
test against the rendered file in a temporary path and install only on success, and
route every write through the rollback writer that already exists in the product -
with its configuration-test command, copy command, backup artifact and
invalid-configuration exception - instead of the bare writer this path currently
calls. Make reload failure observable: the success check must not return true
unconditionally and the reload should not be backgrounded when the caller reports
success based on nothing. Separate privilege: do not run the File Manager pool as
root, drop it to the panel account or a dedicated unprivileged user, set
`security.limit_extensions` explicitly rather than relying on the compiled-in
default, restrict the pool socket so a site-facing worker cannot address it, and
lower the site-facing worker identity from root - neither change removes the
injection, but together they cap the outcome of any future configuration injection
at the panel account. Then audit the rest of the command-builder family for the same
category error (44 of 49 builders already escape their arguments, which is good
discipline for command lines and irrelevant for configuration text), ship the
virtual-host templates inside the package instead of cloning an external repository
into a database column that is later interpolated with user input, replace the
password generator's randomness source, and add regression tests asserting that a
hostile value is rejected and that no packaged pool file declares `user = root`.
Until a patch exists, operators should treat every panel account that owns a site as
holding host root, because that is what this finding proves; put the panel listener
behind VPN, single sign-on or a source allowlist; reconfigure the File Manager pool
away from root; diff the virtual-host directory against a known-good baseline after
every site-settings save; alert on the indicators above; validate configuration
independently rather than trusting panel-reported success; keep their own backup of
the virtual-host directory, since the product creates none on this path; and rotate
every credential ever produced by the panel's password generator.

Also disclosed alongside this finding and folded into no score: the weak randomness
in the panel's password generator, the `X-Forwarded-For` identity-swap primitive,
the silent reload failure and the absent syntax check and rollback on this write
path, the second unproven injection point of the same shape, a static factory
application secret and an expired static self-signed certificate, the database
listener bound to every interface with a hardcoded root password set by the
maintainer script, three anonymously reachable non-framework surfaces and two
distinct anonymous open-redirect conditions, an anonymous-to-database-administrator
condition that stops at the database, an unverified cross-tenant file read in the
File Manager's archive-compression action whose independence from an earlier
published archive issue could not be resolved, and development artifacts shipped in
the release package. The weak-randomness item deserves one line here because it is
easy to mis-file: the panel's password generator button derives credentials from a
non-cryptographic pseudorandom source, appearing twice in that file while the
cryptographic browser API appears zero times, and it is called from seventeen
templates covering site users, SSH users, FTP users, database users, panel users and
Basic-Auth credentials, with a matching server-side construction in the bundled
database-administration sign-on path. We label it a weak randomness source with
predictability not empirically demonstrated - no experiment reconstructed engine
state and no output was predicted - and it is a contributing weakness with its own
CWE class. It is never folded into this advisory's vector, it raises nothing here,
and the operator consequence is simply that credentials produced by that button
should be rotated.

Full technical analysis and a reproducible proof-of-concept:
  https://0day-rubbish.com/blog/cloudpanel-site-rootdirectory-nginx-vhost-injection-root-rce

Project archive:
  https://github.com/Exploit-Garbage/0day-Rubbish

cloudpanel.io has been notified at the contact address it publishes for the
product, on the same day this research is made public and with the same content.
No embargo was requested and none was offered, nothing is withheld pending a
reply, no permission to publish was asked for, and this disclosure is
unconditional. Public research and any commercial engagement are separate
channels and never conditioned on one another. No vulnerability identifier has
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
