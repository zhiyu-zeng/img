---
title: "Full Disclosure: [0day-rubbish] Dataedo Portal 26.2.8 with Dataedo Agent 26.2.8 unrestricted scheduler job-type deserialization to Agent-host command execution (8.1)"
source: https://seclists.org/fulldisclosure/2026/Oct/15
source_host: seclists.org
clip_date: 2026-10-15T16:22:20+08:00
trace_id: 5192a777-35ac-43a7-87c3-bb09ded329a1
content_hash: 3f3874998eac7333eeac5450538a9ea36cb030795119ef32ceff5161bb2e16b8
status: synced
tags:
  - 漏洞分析
  - .NET逆向
series: null
feed_source: Full Disclosure·漏洞披露
ai_summary: Dataedo Portal 26.2.8 与 Agent 26.2.8 组合链：用产品内硬编码 AES 密钥离线解出仓库库连接串（实测为 sa），向 `[Scheduler].Job` 写入一行反序列化作业，即可在 Agent 主机上以 SYSTEM 执行任意命令（CVSS 8.1）。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3fa75244-d011-813d-91f9-d1e43c1cb53f
ioc:
  cves: []
  cwes:
    - CWE-200
    - CWE-209
    - CWE-250
    - CWE-284
    - CWE-306
    - CWE-321
    - CWE-346
    - CWE-347
    - CWE-470
    - CWE-502
    - CWE-522
    - CWE-732
    - CWE-798
    - CWE-863
    - CWE-918
    - CWE-942
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Dataedo Portal 26.2.8 与 Agent 26.2.8 组合链：用产品内硬编码 AES 密钥离线解出仓库库连接串（实测为 sa），向 `[Scheduler].Job` 写入一行反序列化作业，即可在 Agent 主机上以 SYSTEM 执行任意命令（CVSS 8.1）。
> 
> - **入口为设计内行为：** `GET /api/repository/connection-string` 对持有仓库管理角色（RoleAction=11）者返回 `SimpleAES` 加密串，AES-256-CBC 的 32 字节密钥与 16 字节 IV 是 `Dataedo.Settings.dll` 中的字节数组字面量、跨版本一致，`GenerateEncryptionKey()` 无调用路径替代之，19 个程序集引用同一静态对。
> - **落点为 Hangfire 无约束类型解析：** `AddHangfireServer` 未注册 `ITypeResolver` 限制或调用白名单，`GlobalJobFilters.Clear()` 后四个过滤器均不校验调用类型；因此一条 `Type = System.Diagnostics.Process / Method = Start` 的作业即可执行，无需 gadget 链。写入时 `Arguments` 列与 `InvocationData.Arguments` 必须同时携带命令，`QUOTED_IDENTIFIER` 须为 ON，`JobQueue` 行须指向 Agent 实际轮询的队列。
> - **证据与身份边界：** 作业状态 Enqueued→Processing→Succeeded 且 `State.Result` 为"Can not serialize the return value"，即 `Process.Start` 返回的活对象导致的序列化失败，属调用证明；占位符令牌出现在 shell 报错中，证明参数来自数据库行而非 Agent 内部路径。观察到的 `nt authority\system` 来自其自建 SYSTEM 计划任务，生产服务账户未被最终确认。
> - **已撤回与未复现：** 早期"零点击匿名 SYSTEM"说法被撤销——Agent 只读自身配置文件里的仓库连接串，无远程配置端点，Portal 配置变更不会传播；`POST /api/repository/set` 对已配置实例返回 409。测试工具不执行破坏性命令、不碰下游数据源，并提供 `--control` 与 `--emit-cleanup` 模式。
> - **修复优先序：** 注册仅允许厂商 `ISchedulerTaskExecutor` 作业类型的服务端 `ITypeResolver` 与执行前白名单过滤器；停止向客户端回传连接串；以每实例密钥（DPAPI 或安装器随机密钥）取代固定密钥+固定 IV，并改用带认证加密；分离目录管理与调度写权限，Agent 服务改用最小权限专用账户。

## Full Disclosure mailing list archives

## \[0day-rubbish\] Dataedo Portal 26.2.8 with Dataedo Agent 26.2.8 unrestricted scheduler job-type deserialization to Agent-host command execution (8.1)

* * *

*From*: disclosure via Fulldisclosure <fulldisclosure () seclists org>  
*Date*: Tue, 13 Oct 2026 02:21:33 +0000  

* * *

```rust
0day Rubbish Research Team is publicly disclosing a vulnerability in Dataedo
Portal 26.2.8 together with Dataedo Agent 26.2.8, the closed-source enterprise
data-catalog and data-governance platform from Dataedo sp. z o.o. (Poland).
Both components are in scope because the chain crosses from one to the other:
the Portal discloses a database credential, and the separately installed Agent
executes an injected scheduler job on its own host. In the verified shape the
command ran as `nt authority\system`.

Type: deserialization of untrusted data by unrestricted invocation-type
resolution (CWE-502 primary, with CWE-470 an equally defensible
characterisation of the same mechanism), enabled by insufficiently protected
credentials (CWE-522) under a hard-coded cryptographic key (CWE-321), with
incorrect authorization and missing privilege separation (CWE-863 / CWE-284)
and execution with unnecessary privileges (CWE-250 / CWE-732) contributing.

The entry route works exactly as designed, which is the point. `GET
/api/repository/connection-string` returns the repository database connection
string to a caller holding a repository-management role, encrypted with
`SimpleAES` - an AES-256-CBC construction whose 32-byte key and 16-byte IV are
byte-array literals in the shipped `Dataedo.Settings.dll` and are
byte-identical across builds, with PKCS7 padding and every ciphertext byte
encoded as a three-digit decimal group. Anyone holding a copy of the product
therefore decrypts the response offline; both values are reproduced in the
published proof-of-concept. `GenerateEncryptionKey()` exists at
`Dataedo.Settings:116` and no call path was found that replaces the static
field with its output. A full census counted the same static pair referenced
from 19 assemblies. The recovered login in the tested deployments was `sa`, a
sysadmin-level principal on the repository database - and that database also
holds the Hangfire scheduler storage in the `[Scheduler]` schema.

The sink is on the Agent side. `AgentServiceRegistration.AddScheduler` calls
`AddHangfireServer` twice, once for the `default` queue with a worker count of
one and once for the `priority` queue, and registers no `ITypeResolver`
restriction and no invocation allowlist with either, so Hangfire's default type
resolver will resolve any type name the runtime can load. `FilterInitializer`
then runs `GlobalJobFilters.Clear()` and adds four filters, none of which
constrains execution: `ExecutionCreatingFilter` and `RequestUpdatingFilter` are
`IClientFilter` implementations, which run on the client-side job-creation path
rather than on server-side execution and additionally return early unless the
declaring type implements `ISchedulerTaskExecutor`; `JobCancellationFilter` is
an `IApplyStateFilter` that reacts only to transitions into `DeletedState`;
and `AutomaticRetry` is configured with `Attempts = 0`, which disables retries
and has no bearing on authorization. After `Clear()` nothing in the chain
inspects the invocation type, the declaring type, the method name or the
arguments at execution time. The producer is disciplined and the consumer is
not, and the consumer is the one that executes.

One row into `[Scheduler].Job` plus one row into `[Scheduler].JobQueue` is
therefore enough, and no gadget chain is needed because the invocation document
names the sink directly:

    {"Type":"System.Diagnostics.Process, System.Diagnostics.Process",
     "Method":"Start",
     "ParameterTypes":"[\"System.String\",\"System.String\"]",
     "Arguments":"[\"cmd.exe\",\"/c <payload>\"]"}

Three details are load-bearing and none of them is obvious. The `Arguments`
column and the `InvocationData.Arguments` member must both carry the command,
and the latter is a JSON array serialized as a string inside the outer JSON
object, so a Windows path appears with doubled backslashes in the outer
document and quadrupled backslashes in the inner one while the enclosing T-SQL
literal doubles every single quote. `QUOTED_IDENTIFIER` must be ON because the
scheduler schema uses filtered indexes. And the `JobQueue` row must name a
queue the Agent actually polls, otherwise the job exists and is never fetched.

Execution lands on the Agent host as the identity of the Agent process. Two
shapes were observed and both are recorded because they bound the claim:
`whoami` returned `<agent-host>\administrator` when the Agent was launched from
a console under an interactive administrative account, and `nt authority\system`
when it ran resident as a SYSTEM-privileged scheduled task, where filtered
`tasklist` output for PID 4 appended to the same file showed the System process
in session 0 under the Services session name, consistent with a service-context
execution environment. For production the Agent is installed as a Windows
service through `AddWindowsService` with an empty `ServiceConfiguration`, so
the identity is whatever that service is configured with: SYSTEM is what the
default service configuration yielded in the tested shape and is not a claim
about every deployment, and the installer's own service-registration table was
not inspected to finality, so the production service account is an inference
from the host configuration call rather than an artifact-confirmed value.

How confirmation works. The recorded job was assigned identifier 7 and its
state progression was read directly from the storage tables: Enqueued ->
Processing (with the fetching worker's own ServerId recorded) -> Succeeded,
with `PerformanceDuration` of 4 milliseconds and `State.Result` equal to "Can
not serialize the return value". That pair is proof of invocation rather than
of bookkeeping: `Process.Start` returns a live Process object which the
scheduler cannot serialize into its state column, so it records that string,
and a job that had been rejected or never fetched would not have reached
Succeeded at all. A marker file was written on the Agent host by the executed
command. The marker path and the marker token are command-line arguments of the
published tool, and neither the path nor the token from the recorded run is
reproduced here, because both are artefacts of one execution on one host rather
than evidence about the product.

The strongest single piece of evidence in the package is an argument-provenance
control. The first injection attempt wrote a placeholder token into the
`[Scheduler].Job.Arguments` column while the `InvocationData` document was
correct, and the Agent's run log recorded the shell complaining that the
placeholder was not recognized as an internal or external command. That
establishes that the executed arguments came from the database row and not from
any configuration, command line or code path inside the Agent, and it
identified the column mismatch in the same breath. Without it a reviewer could
reasonably ask whether the observed execution was an artefact of the test rig;
with it the causality is direct.

What was deliberately not reproduced. The published tool issues no destructive
command, creates no account, deletes no catalog data and touches no downstream
data source. The static key was validated in both cryptographic directions -
decrypting a production-shaped ciphertext, and building one offline that the
real Agent binary subsequently accepted into its own configuration file and
connected with, which confirms the key, the IV and the encoding independently
of the decryption direction - but no domain-controller or domain-administrative
outcome was attempted, downstream data sources were not accessed, and NetNTLMv2
capture through the outbound-SQL surface described in the adjacent group was
never demonstrated end to end.

Scoring. One score is published: 8.1 High,
CVSS:3.1/AV:N/AC:H/PR:H/UI:N/S:C/C:H/I:H/A:H. Computed from that vector with
CVSS 3.1 weights: ISS = 1 - (0.44 ^ 3) = 0.914816; Impact under Scope Changed =
7.52 * 0.885816 - 3.25 * (0.870207 ^ 13) = 6.127958; Exploitability = 8.22 *
0.85 * 0.44 * 0.50 * 0.85 = 1.306569, the PR weight being 0.50 precisely
because Scope is Changed; base = 1.08 * 7.434527 = 8.029289; 8.1 after the
ceiling-to-tenth Roundup.

A reading of this chain as zero-click and anonymous is withdrawn, and the
reversal argument is printed because it is more useful than the original claim
was. An earlier reading asserted that an unauthenticated attacker could switch
a running Portal's repository to an attacker-controlled database and that an
already-installed Agent would follow the Portal onto that repository and
execute injected jobs there - an anonymous, remote path to SYSTEM. The Agent
reads its repository connection string from its own configuration file, at
`Dataedo.Agent.Startup/ServicesConfigurator.cs:43`, and exposes no controller
and no remote-configuration endpoint of any kind, so nothing that happens to
the Portal's configuration propagates to an installed Agent. The propagation
leg of the claim does not exist. A second sub-claim fell with it: that a
healthy, already-configured instance can be silently switched to another
repository. `POST /api/repository/set` answers HTTP 409 with an explicit
"already configured" message, `create-on-existing-database` surfaces
`RepositoryAlreadyConfiguredException` through `lastOperation.error`, and the
validator's `IsConfigured` gate was confirmed by experiment; the HTTP 202 from
`connect-and-upgrade` is a fire-and-forget acknowledgement that carries no
information about whether any switch happened, and the subsequent state read
showed the configured repository unchanged. Every figure published here was
computed from the vector printed beside it, and no score built on the withdrawn
premise was carried over.

AC:H carries the two conditions that remain once PR:H is granted: a Dataedo
Agent must actually be attached to that repository database - the Agent is a
separately installed component, and with none attached the injected row is
never fetched and nothing executes - and the attacker must have a network path
to the repository listener. Both held in the verified shape and neither is a
property the product guarantees. PR:H because only a principal holding role
action 11 or above was demonstrated to reach the disclosure, and PR:L is
supported by no evidence in this package. UI:N because no victim click, page
visit or administrator action on the Agent host participates.

Scope is Changed, argued on component and host grounds. The vulnerable
component is the Portal web application, whose authority ends at its own
process, its application-pool or service identity and the set of resources its
role model governs; nothing in that model extends to a second machine. The
impacted component is the Dataedo Agent host - a separately installed
component, running as a separate process under a separate identity on a
separate machine - reached only through a third component, the repository
database, whose credentials are themselves the object of the confidentiality
failure. Two observations make the boundary concrete rather than merely
administrative: the attacker never authenticates to the Agent at all, and the
identity gained is not the Portal's identity in any shape, since the Portal
runs under a web-tier identity while the outcome is a machine-level identity on
a Windows host. What Scope does NOT rest on: it is not justified by the
anonymity of the adjacent group below, which is scored nowhere in this vector;
not by the CORS item or the signing-key item; and not by downstream data-source
compromise, which is a consequence of the Agent-host identity rather than an
independent scope change.

The rejected reading is printed so that the difference is auditable: 6.6
Medium, CVSS:3.1/AV:N/AC:H/PR:H/UI:N/S:U/C:H/I:H/A:H, where Impact = 6.42 *
0.914816 = 5.873095 and Exploitability = 8.22 * 0.85 * 0.44 * 0.27 * 0.85 =
0.705547 under the Scope-Unchanged PR weight of 0.27, summing to 6.578642. It
is rejected because the execution demonstrably occurs on another host under
another component's service identity, and scoring it Unchanged would understate
a cross-machine privilege boundary the verified evidence shows being crossed.

One conditional reading is published alongside the primary and is explicitly
not the headline: 9.1 High, CVSS:3.1/AV:N/AC:L/PR:H/UI:N/S:C/C:H/I:H/A:H, in
which Impact is unchanged at 6.127958 and Exploitability rises to 8.22 * 0.85 *
0.77 * 0.50 * 0.85 = 2.286496 for a base of 9.087611. It applies only to a
deployment where a Dataedo Agent is known to be attached to the repository and
the repository listener is reachable from the attacker's network position - the
ordinary topology of an installation that uses the product's scheduling
features at all, but a topology we did not prove to be universal, so it stays
conditional.

Nothing from the adjacent disclosure group contributed to any figure here and
no score is published for that group. Folding an unauthenticated
repository-registration primitive or a credentialed-CORS primitive into a
vector whose entry point is PR:H would inflate the published number by
borrowing reachability this chain does not have. The composition scenario in
which an anonymous party ends up holding an all-roles session is documented in
the advisory as an amplifier and was not used to lower the PR metric, because
that composition requires the victim to install a component during a window and
is therefore a different chain with different preconditions. No severity
inflation was taken from the privilege level of the recovered login either:
that it happened to be `sa` makes the chain trivially complete, but a scoped
login with write access to `[Scheduler]` would still yield execution, and no
metric was raised on account of it.

Authentication: post-authentication, repository-management role. The gate is
`Require().Role(RoleAction = 11)`, enforced through the MediatR
`PermissionBehavior` rather than through an MVC attribute, which has a
practical consequence for anyone probing this surface: `PermissionBehavior`
runs after `ValidationBehavior` (`Dataedo.Application:1271`), so a malformed
request produces HTTP 400 from the validator before any authorization decision
is made. A 400 is therefore not evidence of a gate where a 401 or 403 is. The
evidence for this one is two-sided: a principal holding every role received
HTTP 200 and 528 digits of ciphertext (176 bytes, exactly eleven AES blocks),
and a second SQL login with zero application permissions was refused a session
outright - HTTP 400 with `ACCESS_WITHOUT_ANY_PERMISSIONS` at the `HasWebAccess`
gate, no cookie issued. On the newer Portal build an entirely unauthenticated
request to the same path returned HTTP 401 while
`/api/repository/host-environment` returned HTTP 200 and `/api/users` returned
401, which places `connection-string` firmly on the authenticated side of a
live differential. How the administrative session was obtained is not part of
the claim: the authorizer enforces role action 11 regardless of provenance, and
the production equivalent is an ordinary administrative user of the catalog.
The route is one of exactly three `/api/repository` operations carrying a
method-level authorizer, which is why the counted chain starts
post-authentication while the adjacent group starts pre-authentication.

The unauthenticated surface was exhausted before this post-authentication
result was accepted. Symbol enumeration over the decompiled backend counted
1,353 endpoint attributes across 217 controllers - 836 HttpGet, 515 HttpPost,
2 HttpDelete. A class-level authorization census found `[Authorize]` on 205
controllers, no authorization attribute at all on 10, and `[AllowAnonymous]` on
2; source-wide searches for `FallbackPolicy`, `AuthorizeFilter` and
`RequireAuthenticatedUser` returned zero hits, so a missing attribute is not
compensated by a default policy and the surface fails open by construction. A
global primitive search across 23 assemblies and roughly 190,000 lines returned
zero hits in the Portal process for `Process.Start`,
`System.Diagnostics.Process`, `ProcessStartInfo`, `CSharpCodeProvider`,
`CSharpScript`, Roslyn scripting, `Assembly.Load`, `LoadFrom`, `LoadFile`,
`XslCompiledTransform`, `XslTransform`, `BinaryFormatter`, `SoapFormatter`,
`NetDataContractSerializer`, `JavaScriptSerializer`, `DataTable.Compute`,
`DataColumn.Expression`, `System.Linq.Dynamic`, `DynamicExpression`, non-None
`TypeNameHandling`, `XmlSerializer` with a user-controlled type, and Semantic
Kernel plugin registration. The execution primitive is not in the web
application at all. It was found by widening scope from "the web application"
to "every component that consumes the repository database" and following the
only cross-process channel that repository shares with another executable.

Every other candidate sink was rejected on evidence, and the rejections are as
informative as the hit. Custom connector XML must carry an XML signature
verified against two vendor RSA public keys from a hard-coded `PublicKeyStore`,
is then validated against `CustomConnectorSchema.xsd`, and its queries are
scanned by a case-insensitive word-boundary regex against 31 prohibited
keywords; with no `DtdProcessing`, no XML resolver and no `XslCompiledTransform`
in play, neither XXE nor XSLT execution applies. Scheduler job types on the
Portal side switch on a closed `JobType` enumeration into typed parameter
objects with no `TypeNameHandling` and no polymorphic resolution from input.
SQL against external data sources takes integer route parameters, loads the
connection string server-side by identifier and issues a fixed
metadata-discovery statement. Raw SQL against the repository is parameterized
through EF Core and Dapper arrays, and the single identifier concatenation -
`create login[EscapeSql(username, ']')]` - doubles both the bracket and the
quote, is admin-gated and uses a hard-coded account name. The only
`File.WriteAllText` in the product writes `appsettings.json` at a path that is
not user-controlled, is neither a web root nor an executable location, and
carries a connection-string value. Both LLM platform clients are HTTP wrappers
whose response text is stored as metadata and never evaluated, templated or
loaded. The license-file deserialization path does use `TypeNameHandling.All`,
but `VerifySignature` runs first against vendor public keys, so a malicious
`$type` cannot be supplied without the vendor's private key. Two revival
bridges were settled by experiment rather than by opinion: JSON key injection
into the configuration writer's escaping order, blocked over HTTP by
`SqlConnectionStringBuilder` normalization and never triggered, reported as
theoretical only; and driving the Agent through the scheduler-request
test-connection endpoint, which ends at HTTP 403 from the connections-management
authorizer.

An adjacent disclosure group is published inside the same advisory, kept
separate and unscored. It is real and reportable and was established during the
same work. It is published inside this advisory rather than as separate
advisories because each item lacks a complete independent artifact set of its
own - no separate published tool and no independent end-to-end verification
package each - and describing them there does not exhaust them. The items, with
their own status and their own proof levels:

  - A permanently ungated repository-management surface (CWE-306, CWE-284): 18
      ungated routes on `RepositoryController` and its PostgreSQL family, a
      17-entry `RepositoryCompatibilityMiddleware.ignoredUrls` allowlist that
      performs version-compatibility checking and no authorization whatsoever,
      and no global fallback policy. In a deployment window - installer
      finished but repository wizard pending, a container quickstart launched
      with an empty catalog, or a repository outage or migration period - an
      unauthenticated party can register its own repository database; the
      Portal migrates the full schema there (255 tables on 26.2.8, 263 on the
      newer build) and persists the switch into `appsettings.json`. Because the
      login validator checks supplied credentials against the repository
      database, the attacker's own SQL login validates, the user is
      auto-registered through the license path, and the empty sessions table
      makes the first-web-catalog-user test true, so all roles are assigned and
      the Portal is taken over. Demonstrated three times, including a window
      deliberately re-created by emptying the catalog configuration and
      restarting the process, and once on the newer build. A healthy configured
      instance answers HTTP 409, so the exposure is window-shaped, and that is
      reported as such rather than as a standing anonymous takeover.
  - Permanent anonymous tamper with the portal URL, plus SSRF and information
      disclosure (CWE-306, CWE-918, CWE-200, CWE-209), requiring no window:
      `POST /api/repository/connect-and-upgrade` catches
      `RepositoryAlreadyConfiguredException` and continues into the upgrade
      path, so against a running instance it returns HTTP 202 and rewrites
      `configuration[WEB_CATALOG_URL]` in the live repository - verified to an
      attacker-controlled value. That value is the base URL for SAML
      assertion-consumer redirects, for e-mailed links and for the front end,
      so a silent anonymous rewrite converts the product into a
      credential-phishing surface for its own users, persistently, and the same
      endpoint can trigger a schema upgrade which on a version-lagged instance
      is a destructive primitive. Alongside it: outbound TDS connections to an
      attacker-named host through `available-databases`, a genuine 94-byte
      pre-login packet of type 0x12 observed at the listening socket, implying
      internal port discovery and NetNTLMv2 exposure on Windows deployments,
      that exposure not demonstrated; SSRF through `/api/text-editor/link?url=`
      reaching an internal container service, an external host, the Portal's
      own Kestrel port, so the internal OpenAPI UI is reachable through that
      route alone because the reverse proxy does not forward `/swagger`, and
      the cloud instance metadata endpoint, which answered HTTP 200; HTTP 500
      with a full stack trace from `database-update-log`; service-account
      leakage from `identity` on Windows; a deployment-shape fingerprint from
      `host-environment`; a static `lastOperation` field acting as an anonymous
      error oracle; both OpenAPI documents served without an environment gate
      (118 public paths and 1,271 internal ones); and an anonymous
      registration endpoint without rate limiting. No IP-based trust exists
      anywhere to compensate: searches for `IsLocal`, `LocalIpAddress`,
      `RequireHost`, `InternalApi` and `AllowAnonymousToInternal` are empty.
  - Permissive CORS with credentialed cross-origin access (CWE-942, CWE-346):
      `SetIsOriginAllowed(_ => true)` with `AllowAnyHeader`, `AllowCredentials`
      and methods GET, POST, PUT, PATCH, DELETE, plus a session cookie
      configured `SameSite=None` with `SecurePolicy=Always`. Any website can
      issue credentialed cross-origin requests and read responses across the
      cookie-authenticated `/api/*` surface for a logged-in administrator, on a
      healthy production instance with no other weakness involved. This item
      was established by reversing the shipped configuration code; no
      browser-driven cross-site demonstration was performed and none is
      claimed.
  - A default JWT signing key with issuer and audience validation disabled
      (CWE-798, CWE-347): `TokensKey` is a shipped GUID used as ASCII bytes for
      HMAC-SHA256, with `ValidateIssuer = false`, `ValidateAudience = false`
      and `RequireHttpsMetadata = false`, so signature validity is the only
      protection. The scope is narrower than it first appears, and the
      narrowing is itself a correction: a `ForwardDefaultSelector` confines the
      JWT scheme to `/public/v1`, leaving `/api/*` on cookie or
      personal-access-token authentication, and within `/public/v1` a second
      gate requires the API status configuration row to be enabled and the raw
      token to equal the configured API token exactly. Demonstrated in the
      default-key shape, where a forged HS256 token moved `GET
      /public/v1/custom-fields` from HTTP 401 to HTTP 200 with real catalog
      data, and the accompanying stack trace placed the token-validation
      database comparison after signature verification, which is the proof that
      the static key produced an accepted signature. The Windows installer
      writes a fresh GUID for this value during its API-configuration step, so
      the item applies to container deployments, manual or copy-based
      deployments and upgrades preserving an older configuration file. Our own
      Portal instance was started from binaries extracted from the vendor
      installer rather than through the install wizard, which is why that key
      was still at its shipped default with us; survival in a specific
      marketplace template was not established and is not claimed.

Impact. Arbitrary operating-system command execution on every Dataedo Agent
host attached to the affected repository database, at the identity of the Agent
process - machine-level authority in the observed shape. The Agent host holds,
in ciphertext recoverable offline with the same static key, the `credentials`
and `ssh_configurations` entries for every downstream data source in the
catalog plus SSH tunnel secrets, so one compromised Agent host yields plaintext
credentials into the estate's data platform without a second vulnerability. The
recovered repository credential is a sysadmin-level principal over the database
that is the product's sole trust anchor - users, licenses, permissions,
single-sign-on configuration, login-method switches, one-time login codes,
sessions, the public-API switches and the entire catalog - so full
confidentiality loss and full integrity loss over the governance record follow
from it, which weighs differently on a product whose business purpose is being
the trusted record of the estate's data. Persistence is available in two
independent forms: the Windows service itself, and further scheduler rows that
survive Agent restarts and need only another database write to re-trigger. The
same write access halts imports, data-quality runs, exports, classification and
profiling refresh by consuming or corrupting their scheduler rows, on a product
whose purpose is keeping that pipeline current. And because the Agent is by
design permitted to reach every catalogued data source, from an Agent host with
machine-level authority and those credentials the path into warehouse and
analytical systems requires no further weakness. A deployment caveat belongs
beside the impact rather than after it: with no Agent attached, the injected row
is never fetched and nothing executes.

Verification boundary, stated plainly. The vendor's own binaries were extracted
from the vendor installers by parsing the .NET single-file bundle manifest and
were digest-reconciled against the downloaded installers. The Portal then ran as
a Kestrel-hosted Production instance on a private container network, HTTPS on
port 8443, not internet-exposed, with a SQL Server 2022 repository as a sibling
container on that same network; the Agent ran as a real product executable on
Windows Server 2025. Static analysis covered 23 assemblies and roughly 190,000
lines on the Portal side and about 5,600 decompiled C# files overall, with PDB
symbols on the API assembly. The Portal-phase repository listener was
loopback-bound, so the storage write during that phase was performed from the
container host rather than across a hostile network; the Agent phase used a
host-local SQL Express instance on port 1433 populated by backup and restore of
the container-side repository, which is the realistic shape for that hop.
Whether a given production deployment exposes its repository listener to an
attacker-reachable network segment is deployment-specific and is claimed in
neither direction. Note also the direction of the second network requirement:
it is the attacker who must reach the database, not the reverse. The Agent
initiates its own connection outbound and polls, so there is no callback, no
inbound port on the attacker's side, and no need to interact with the Agent's
own HTTP listener, which this chain never touches.

What our own harness supplied, rather than the product. The Agent ran resident
as a SYSTEM-privileged scheduled task with `rollForward = Major` - our shape,
not the product's own service installation - and that is the origin of the
`nt authority\system` observation, which is why the production service account
is listed as unestablished rather than as a finding. The all-roles session used
to reach the authorized read was produced by the product's own first-user path
against a repository database we controlled. The Agent's HTTP listener was bound
on all address families for testing only. And the Portal was started from
extracted binaries rather than through the install wizard, so any value the
wizard would have randomized - notably the JWT signing key in the adjacent
group - remained at its shipped default in our instance, a boundary the
advisory states wherever it matters.

Only 26.2.8 was executed end to end across both components, and no version
range is claimed. A newer Portal build obtained during this research, version
26.3.0, reproduced the Portal-side behaviour - same endpoint, ciphertext
decryptable with byte-identical key material whose presence in that build's own
`Dataedo.Settings.dll` was confirmed by a byte-level search of the shipped
assembly, and 263 migrated tables after anonymous window-state registration -
but the Agent binary was not re-executed against it, so the execution segment
on that build is an argument from the absence of change signals rather than a
verification. Also not exercised and not claimed: the negotiate-phase
authentication of the four registered SignalR hubs; SAML identity-provider
injection through a hijacked repository, for which the attacker-writability of
the configuration tables in that state is static evidence only; and any
production claim about which deployments attach an Agent at all.

The published proof-of-concept is standard library only, including a local
AES-256-CBC implementation whose S-box is derived at runtime and whose round
functions are written directly, validated against published known-answer
vectors on every run in `--self-test` mode together with a SimpleAES round trip
through the three-digit decimal encoding. Its modes are: the default mode
fingerprints the deployment anonymously, authenticates or replays a supplied
session cookie, issues the authorized GET, extracts the longest digit run,
decrypts offline and parses the connection string, reachability-probes the
repository listener with a plain TCP connect, and re-reads the storage;
`--control` performs every one of those steps identically and then substitutes
a non-executing invocation document (`System.String` / `Concat` with a
control-no-exec argument), omits the `JobQueue` row entirely so that no polling
worker can fetch it, waits through a poll interval and re-runs the same readback
to show zero executable job rows and no marker file; and `--self-test` runs the
cryptographic checks alone. Control mode exists so that a third party who does
not want to execute anything can still reproduce the disclosure and the
decryption, which are the parts that constitute the vulnerability, and satisfy
itself that the execution outcome is produced by the injected payload and
nothing else - the readback query is identical in both modes, so the difference
in its result is attributable only to the payload. One point of accuracy about
the database step: the tool implements no TDS protocol code locally. It emits
the exact T-SQL statement and, only when the operator supplies a client binary
path, executes it through that binary with `QUOTED_IDENTIFIER` on; it prints
the statement rather than writing anything when no client binary is supplied.
With `--emit-cleanup` it emits an idempotent statement deleting the rows it
wrote by matching the marker token in the `Arguments` column, so a test can be
fully retracted. It never defaults to a remote host, never uses the recovered
database endpoint unless `--use-recovered-endpoint` is passed, and does not
reach for a production database host discovered from the response by accident.

Detection notes, including one caveat that will otherwise produce false
positives. The Portal-side step is a single authorized, successful,
ordinary-looking GET: no anomaly in the access log, no failed request, no error
path. An account with the repository-management role reading the repository
connection string is the feature working. The decisive event is a database
insert on a different host, into a schema the Portal itself writes to during
normal operation, so generic auditing on `[Scheduler].Job` inserts fires for
legitimate activity as well and must not form a rule on its own. The
discriminating signals are specific: an `InvocationData` value whose `Type`
names anything outside the vendor's scheduler job namespace and especially
`System.Diagnostics.Process`; a `State.Result` of "Can not serialize the return
value", which is what a live object returned from a non-vendor method produces;
`PerformanceDuration` in the low single-digit milliseconds for a row whose type
is not a scheduler task, since the vendor's own job types do meaningful work;
shell binaries in `Arguments`; a `JobQueue` row whose `FetchedAt` is never
populated, indicating a write into a repository nobody is consuming, which is
the signature of a preparation step rather than of an execution; and on the
Agent host an unexpected child process of the Agent service, a written marker or
payload file, or outbound connections to hosts that are not catalogued data
sources. None of these is alerted on by the product. For the adjacent group the
indicators are POST traffic to the repository registration and
`connect-and-upgrade` routes from unauthenticated clients, a change in
`configuration[WEB_CATALOG_URL]`, a change in `appsettings.json` on a Portal
host, and any `Access-Control-Allow-Origin` reflection carrying
`Access-Control-Allow-Credentials: true`.

Mitigation summary, ordered by root cause. Constrain the invocation type at
execution time: register a custom Hangfire `ITypeResolver` on both Agent
servers that resolves only the vendor's own scheduler job types implementing
`ISchedulerTaskExecutor`, and add a server-side filter that transitions any job
whose declaring type is not on that allowlist into a failed state before
execution; replace `GlobalJobFilters.Clear()` with a cleared-then-restricted
filter set rather than an empty one, validate the `InvocationData` shape
explicitly, and reject the `System.*` namespace with
`System.Diagnostics.Process` as a named test case. Stop returning the
connection string to clients - host and catalog at most, login masked,
password never transmitted - because no
transport encryption keyed by material the client already possesses protects the
secret. Replace the static key and IV with per-installation key material
(DPAPI on Windows, a managed key service elsewhere, or an installer-generated
random key stored outside the assembly), make the existing
`GenerateEncryptionKey()` an actual code path, refuse to start while the factory
key is still in use, rotate on upgrade, and move to authenticated encryption
without a fixed IV, since a fixed key with a fixed IV in CBC mode is
deterministic and leaks plaintext equality even where confidentiality nominally
holds. Separate catalog administration from scheduler write authority - the
credential read by an administrator workflow must not be able to insert into
`[Scheduler]`, and the Agent's credential should be scoped to that schema - and
better still make job dispatch non-reflective, storing a job-type identifier
from a closed enumeration resolved through a factory so that storage content
selects a behaviour instead of naming a type. Run the Agent service under a
dedicated least-privilege account and record the chosen identity explicitly in
the installer rather than relying on the empty `ServiceConfiguration` default;
isolate Agent hosts and restrict their egress to catalogued data sources. Add
regression tests for both halves: a stored job row whose `InvocationData.Type`
is `System.Diagnostics.Process` must never execute and must record an allowlist
failure with no child process created, and an unauthenticated POST to every
repository-management route must return 401 in every product state except the
token-bearing setup window. Until a patch exists, operators should restrict
network access to the repository listener to Portal and Agent hosts only and
treat any principal able to write `[Scheduler]` as holding command execution on
every attached Agent host; enable database auditing on `[Scheduler].Job` and
`[Scheduler].JobQueue` inserts and alert on the discriminating signals above;
complete first-run repository configuration immediately after installation and
never expose an unconfigured Portal to an untrusted network, since the
registration window is genuinely anonymous; monitor `appsettings.json` on
Portal hosts and `configuration[WEB_CATALOG_URL]` in the repository for change;
rotate the repository credential and treat every prior copy as exposed, since
any repository-management principal can recover it on demand; inventory
installer-produced `Dataedo-Web-backup-*.zip` artifacts and store or destroy
them as credential material, because they carry ciphertext the static key
decrypts offline; strip reflected `Access-Control-Allow-Origin` values at the
reverse proxy; rotate the JWT signing key where the deployment did not pass
through the installer's API-configuration step; and treat the Agent host as a
crown-jewel system for the duration of the exposure, since it holds in
decryptable form the credentials for every data source in the catalog.

Full technical analysis and a reproducible proof-of-concept:
  https://0day-rubbish.com/blog/dataedo-portal-repository-connection-string-scheduler-job-agent-rce

Project archive (ongoing disclosure series):
  https://github.com/Exploit-Garbage/0day-Rubbish

Dataedo has been notified through the support mailbox its own contact page
publishes, with the same technical content and the same verification boundary
as this post. The vendor publishes no RFC 9116 security.txt; its security page
is an assurance and marketing page carrying certifications and a claim of
regular independent penetration testing with rapid remediation, but no
reporting address and no vulnerability-disclosure policy, and its privacy page
publishes a data-protection mailbox only, which is the wrong channel for this
and was not used. The mailbox we used was verified before use: it returned a
positive SMTP acceptance on four of five attempts while a deliberately nonsense
address at the same domain and an intuitive security mailbox at the same domain
each returned a permanent rejection on five attempts of five, so we chose the
published support address over a plausible address that demonstrably does not
exist. The notification requests nothing in return and asks for no permission:
this disclosure is unconditional, the research is already public, no embargo was
offered or accepted, and nothing is being withheld pending a reply. No
vulnerability identifier has been assigned to this finding yet.

--
0day Rubbish Research Team
disclosure () 0day-rubbish com
https://0day-rubbish.com
_______________________________________________
Sent through the Full Disclosure mailing list
https://nmap.org/mailman/listinfo/fulldisclosure
Web Archives & RSS: https://seclists.org/fulldisclosure/
```
