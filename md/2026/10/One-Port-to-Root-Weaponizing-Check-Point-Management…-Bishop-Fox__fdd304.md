---
title: "One Port to Root: Weaponizing Check Point Management… | Bishop Fox"
source: https://bishopfox.com/blog/weaponizing-check-point-management-cve-2026-93616
source_host: bishopfox.com
clip_date: 2026-10-02T14:25:35+08:00
trace_id: a3ece072-eeaf-432b-8093-9ec3bf9e5e30
content_hash: eccfb7877bc7e00bf5d153af5676f2684cfa6603dcab8f14276095bfabc19a41
status: synced
tags:
  - 漏洞分析
  - 安全工具
series: null
feed_source: Bishop Fox
ai_summary: Check Point 管理服务器上的 CVE-2026-93616（9.8 分、已被在野利用）可让未认证攻击者经单个 TCP 19009 端口以 root 身份写文件并执行代码，最终完全接管持有防火墙策略与内部 CA 的主机。
ai_summary_style: key-points
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 3ed75244-d011-8193-86c5-d917b34f77bf
ioc:
  cves:
    - CVE-2026-91843
    - CVE-2026-93616
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Check Point 管理服务器上的 CVE-2026-93616（9.8 分、已被在野利用）可让未认证攻击者经单个 TCP 19009 端口以 root 身份写文件并执行代码，最终完全接管持有防火墙策略与内部 CA 的主机。
> 
> - **根因三处：** 修复不止公告所述——`upgrade_web_services.jar` 的 `targetVersion` 目录穿越与 `FileSvcRemote` 上传的任意 root 写，加上 `dleserver.jar` 中 `loginNew`/`authenticateRemoteApplication` 把调用方自报的 `CN=` 字符串当作证书 DN，使服务端"认证攻击者为自身"。
> - **利用链四步：** 读 19009 端口证书上的 SIC 名冒充服务器自身拿到 READ_WRITE 会话 → 任意路径写入 → 覆写 `/etc/cron.d/raid-check`（需覆写既有 root 属主文件，非新建）由 cron 每分钟触发 → 输出落到 `SMC_Files`，再用 `downloadRawFile` 经 MTOM 取回；实测 R81.10、R82.10 均返回 `uid=0(admin)`。
> - **修补与缓解：** Jumbo Hotfix R82.10 Take 45、R82 Take 127、R81.20 Take 170、R81.10 Take 192 及 R82.20 安全补丁；LivePatch Take 28/29 不覆盖；同时把 19009 限制到受信管理主机，注意 Trusted Clients 属权限设置而非规则库条目。
> - **检测方式：** 发送单个非法字符 `!` 探针到 `loginAsApplicationReadOnlyPublicSession`，按是否返回 `targetVersion contains illegal characters` 区分已修/未修，工具支持 PATCHED/VULNERABLE/UNAFFECTED/INCONCLUSIVE 与退出码。
> - **排查建议：** 厂商基于 `cpm.elg` 关键字与 `../` 的 IOC 对本文路径无效；应靠文件完整性监控盯 `/etc/cron.d`、`authorized_keys`、`/opt/CPupgrade-tools-*/jars/`、`$FWDIR/conf/log4j2.xml`、`SMC_Files`，并配合 CPM 进程拉 shell 的执行告警；曾暴露未修补的主机需轮换凭据与证书。

> **
> 
> ##### TL;DR
> 
> **
> 
> -   *The Check Point management server is the brain of a Check Point firewall estate: it holds the policy every gateway enforces, the administrator credentials, and the certificate authority the whole deployment trusts. A flaw already used in real attacks lets anyone who can reach that server take it over completely without logging in.*
> -   [*CVE-2026-93616*](https://nvd.nist.gov/vuln/detail/CVE-2026-93616)*, scored 9.8 and exploited in the wild, lets an unauthenticated attacker write files as root on the Check Point Security Management and Multi-Domain Management servers, then turn that write into root code execution. Every step runs over one port, TCP 19009. We reproduced the attack end to end against unpatched R81.10 and R82.10 lab servers, confirming execution as root on both. Our* *[detection tool](https://github.com/BishopFox/CVE-2026-93616-check)* *reports patch state from outside with one benign request*

## Summary

On September 22, 2026, Check Point published [sk1000171](https://support.checkpoint.com/results/sk/sk1000171), describing CVE-2026-93616 as a “directory traversal and file upload vulnerability \[that\] allows an unauthenticated attacker to upload and execute arbitrary scripts on the Check Point Management Server.” That description names two defects. The hotfix closes three (see *The Patch*). The flaw is rated 9.8 Critical and exploited in the wild against a handful of customers. Check Point is the CNA and credited no external finder. The same hotfix also fixes CVE-2026-91843 ([sk1000155](https://support.checkpoint.com/results/sk/sk1000155)), whose crash signature, an over-long username next to a core dump, is the advisory’s first indicator, not evidence of this traversal.

Bishop Fox compared vulnerable and patched builds, traced the root cause through the shipped bytecode, and validated impact against three lab servers: an unpatched R81.10, an unpatched R82.10, and an R82.10 on Take 45. One exploit ran end to end against both unpatched hosts, confirming root on each, self-contained over the exposed port. We also built a tool that reads patch state from the server’s behavior, since the chain we validated does not touch the code path the vendor’s indicators watch.

## What Defenders Should Do

-   **Patch the management server.** The fix ships in Jumbo Hotfix Accumulator R82.10 Take 45, R82 Take 127, R81.20 Take 170, and R81.10 Take 192, and in the R82.20 Security Hotfix. Every earlier take is affected, as are R82.20 and all of R80 through R81 (end of support). LivePatch Take 28/29 does **not** cover it.
-   **Restrict TCP 19009 to trusted management hosts.** Check Point’s primary mitigation, and sound practice regardless of patch state. The advisory gives two levers: a gateway in front of the server, and the Trusted Clients list under Manage & Settings > Permissions & Administrators, which emits an implied rule where those are enabled. The second is a permissions setting, not a rule base entry, so a rule base audit alone can miss it. A network that is merely “internal” is not the same as one reachable only by your management stations. This bug lives in the gap between them.
-   **Hunt beyond the vendor’s indicator.** Check Point’s second indicator greps `cpm.elg` for an `ERROR ... ReflectionUtils ... Failed to load allResourceFiles` line and has an analyst eyeball it for `../`. It fires only when an upgrade-tools load fails, which makes it a weak net both ways. The route in this post never calls that service, so it leaves neither the ERROR line nor a `../`. A genuine upgrade can trip the grep on its own. The primitive underneath is an arbitrary root write, so what catches this is file-integrity monitoring rather than a log grep. Hunting IoCs covers the paths and why a scheduled hash alone will not settle it.
-   **Assume the server, not just the software, was reached.** Execution runs as root inside the process that holds your policy and internal CA. On any box that was exposed and unpatched, plan for credential and certificate rotation, not only a patch.
-   **Sweep the fleet from outside.** The patch-state check below is safe at scale and separates patched from vulnerable in a single request.

## Background

The Security Management Server (along with its Multi-Domain sibling) is the policy authority for a Check Point deployment: it compiles the rule bases built in SmartConsole, pushes them to the gateways, and runs the internal certificate authority (CA) that issues the Secure Internal Communication (SIC) identities components use to trust each other. Code execution here is more than just a foothold; it provides authority over the entire management control plane.

The vulnerable surface is the CPM server, a Java process exposing SOAP web services over Apache CXF on TCP 19009, under `/cpmws/`. This listener answers before authentication for a specific set of login methods, on an interface that by default is the network rather than localhost.

We located the bug by diffing the patched and unpatched builds. Check Point ships each fix as replacement jars (a jar is a Java archive of compiled classes), with a bundle manifest recording the change tickets behind every one. Most jars cite many, bundling unrelated fixes into noise; `upgrade_web_services.jar` cited a single ticket, which pointed straight at the jar that declares the vulnerable parameter, though not, it turned out, at the whole fix (see The Patch).

Reading it meant recovering strings that the jar’s built-in obfuscation decrypts only at class load. One was `Failed to load allResourceFiles map from`, the log line Check Point publishes as an indicator of compromise, confirming we were reading the right code.

## The Vulnerability

The advisory pairs two defects, a directory traversal and a file upload, neither of which is particularly dangerous by itself. `FileSvcRemote.uploadFileToServerFileSystem` takes its destination filename from a SOAP header and concatenates it onto a temporary directory with no canonicalization. An ordinary filename lands in that temporary directory, but one containing `../` walks the concatenation out of it, turning the upload into an unauthenticated arbitrary file write as root. The write is gated by a session, but the server hands one to an attacker impersonating it (see Weaponizing).

We confirmed several ways to get from that root write to code execution. This post follows the simplest, which is also the one that ran unchanged on both branches we tested: the write lands in `/etc/cron.d`, and the system cron daemon does the rest. That attack path is provided by the base install and never touches the Check Point service the advisory’s indicators watch. A second traversal in the upgrade service, rather than in the file upload, provides another path to root. We do not walk through it here, but the parameter behind it, `targetVersion`, is the fingerprint our detection reads.

## Detecting It Safely

The safe test is whether the fix’s input validation is present, without sending a traversal payload. The fix adds a character allow-list to `targetVersion`, so the probe sends one illegal character, `!`, and reads the response.

-   Patched: Bean Validation rejects the value with `targetVersion contains illegal characters`, so the method body never runs.
-   Vulnerable: the value is accepted and dispatched, then fails harmlessly on a path that does not exist (“No such file or directory”).

The probe only has one side effect on a vulnerable host: a benign failed execution attempt on a non-existent path which is captured in the server log.

Two details make the result reliable:

1.  Probe a login method, `loginAsApplicationReadOnlyPublicSession`, not a session-gated one like `logout`. A session-gated call is rejected before validation ever runs, so the message never appears and a patched box reads as vulnerable.
2.  Match the full method name in the fault, `UpgradeSvcRemote.loginAsApplicationReadOnlyPublicSession`, not the bare `UpgradeSvcRemote`. Every CPM fault lists every service in a namespace map, so the bare name shows up whether or not this method ran.

Our [detection tool](https://github.com/BishopFox/CVE-2026-93616-check) runs exactly this probe and reports `PATCHED`, `VULNERABLE`, `UNAFFECTED`, or `INCONCLUSIVE`, with distinct exit codes. The hotfix changes `upgrade_web_services.jar` on disk, so patch state is observable from outside.

Builds older than R81.10 take fewer parameters on the login method, so the server rejects the probe while the XML is still being parsed. Nothing reaches the validation the check reads, leaving no patch-state signal to report. A rejection at that stage points to a legacy build, so the tool follows up with a call in the matching parameter format. If the method dispatches, the build is affected and out of support. Check Point published no fix for those trains. Upgrading is the only remediation.

Because the write and login fixes ship in the same bundle (see The Patch), the validation probe is a reliable proxy for the whole remediation. Point it at management servers on 19009. A host that answers without ever dispatching is reported inconclusive. Read that as a gap in coverage, since a server behind a filter may still be unpatched.

## Weaponizing It

The attack rests on two primitives: a session the server hands to an impersonator and an arbitrary root write. The chain consists of four steps:

1.  Mint a session by spoofing the server’s own identity. The server normally identifies a caller from a TLS client certificate signed by its internal certificate authority, taking the caller’s identity from that certificate’s distinguished name. Sessions are issued by `loginNew` on `LoginSvcRemote`, which the server therefore answers without one. In its `FwmAuthenticationInfo` variant, `loginNew` accepts the caller’s identity as a plain string: `<application>,CN=<distinguished-name>`. `authenticateRemoteApplication` reads the `CN=` half as the distinguished name it would otherwise have taken from a certificate, without checking that a certificate was presented at all. The name the server trusts is its own SIC name, which it publishes in the certificate it presents on 19009. The exploit reads that name off the wire, pairs it with the name of a privileged application, and gets a `READ_WRITE` session. The server authenticates the attacker as itself.
2.  Write the payload as root. With the session, the `FileSvcRemote` write drops a file at any absolute path, as The Vulnerability described.
3.  Turn the write into execution with a scheduled task. `/etc/cron.d/raid-check` is a weekly RAID maintenance task inherited from the Linux `mdadm` tool rather than anything Check Point ships. Overwriting it with a crontab fragment runs an attacker’s command as root on the next minute boundary. Cron requires a root-owned file that is not world-writable, so to get the permissions correct the file upload must overwrite an existing file rather than create a new one. No trigger request is needed since the cron daemon fires on its own. We chose this file over the other scheduled tasks on the box because a weekly RAID scrub is the least disruptive thing on it to borrow.
4.  Read the output back. The payload writes its `stdout` and `stderr` into the server’s `SMC_Files` directory, named by absolute path because a cron job inherits none of the CPM process’s environment. That path is the one place the chain must know the product release. `FileSvcRemote.downloadRawFile`, over the same session, then retrieves the file as an attachment under MTOM, the SOAP Message Transmission Optimization Mechanism for carrying binary data beside the XML envelope.

Our proof-of-concept script returned `uid=0(admin) gid=0(root)` on both of our unpatched lab servers, R81.10 and R82.10. `loginNew` minted the session that gated the file upload, proving the chain needed only CVE-2026-93616’s own primitives. Between the two runs, the only thing that changed was the release string in the output path. A command payload returns its output; a detached reverse shell gives an interactive root session.

We confirmed additional attack vectors from the same write primitive, spanning the Check Point application and the operating system beneath it:

-   **Class loading in the upgrade service.** Filling the directory that service loads its components from lets an attacker supply the configuration it parses, which spawns a process as root while the application context initializes. Nothing runs as a file, so the executable bit never matters. This vector only adds to a directory that is normally empty, which made it the one we could reverse in place. Its limit is that the directory has to exist, which holds only on servers with an upgrade history.
-   **A configuration file re-read on a timer.** Overwriting it runs the command as root at the next reload, with no trigger request at all. Its limit is the release, since only the newer ones re-read that file.

They differ in what they need, what they leave behind, and how fast they fire, but not in the outcome. Closing any single one would leave the others standing.

## Hunting IoCs

Every vector we confirmed ends with a file appearing where the server does not normally write one, which is what makes file-integrity monitoring the control most likely to catch this.

The paths, roughly in priority order:

-   `/etc/cron.d` and the other scheduled-task directories, the route this post walks.
-   `authorized_keys` and the usual startup paths, which any root write reaches.
-   `/opt/CPupgrade-tools-*/jars/`, normally empty on a server that has the tree at all.
-   `$FWDIR/conf/log4j2.xml`, the other CPM configuration files, and the rest of the CPM program tree.
-   Anything new under `$FWDIR/conf/SMC_Files`, where command output can be staged on its way out.

A scheduled hash check can miss the change entirely. These are stock operating-system files whose contents are identical on every build, so an attacker can restore the originals byte for byte. Pair file checks with execution telemetry, cron reload events, and an alert on the CPM Java process spawning a shell.

## The Patch

Take 45 ships as a 2.4 GB Jumbo Hotfix Accumulator, 17 nested packages containing 63 replacement jars. We diffed those jars against the versions they replace, first the one the manifest pointed at, then the rest of them.

Our first pass found a single change, `@Pattern` validation added to the `UpgradeSvcRemote` interface:

```java
public static final String VERSION_PARAM_PATTERN = "^[A-Za-z0-9._-]*$";
public static final String MODE_PARAM_PATTERN    = "^[A-Za-z0-9_]*$";
```

The version pattern permits letters, digits, dot, underscore, and hyphen, but not `/`, so `targetVersion` can no longer contain a path separator and the traversal is closed. It is applied to all seven methods that take `targetVersion`, plus a stricter pattern on `mode`, a second caller-controlled parameter on the same interface.

That closes the upgrade-service traversal. The vendor’s second indicator watches for traces of it, and its parameter is the fingerprint our patch-state check reads. Our exploit uses neither, taking a more direct route to root. Two primitives are still open: the session `loginNew` mints for anyone who claims the right name, and the arbitrary root write that session unlocks. Diffing every jar in the bundle shows Take 45 closes both, in two additional jars:

-   `dleserver.jar`: `LoginSvcImpl.authenticateRemoteApplication` now derives the certificate DN from the real TLS client certificate instead of the caller-supplied `CN=` string and throws an exception when a remote caller presents none. That kills the `loginNew` session mint.
-   `java_is.jar`: a new `FileUtils.validateFileName`, now called by the upload methods, rejects `/`, `\`, and `..` and requires a bare filename contained in the temp directory. That kills the arbitrary root write.

Either fix alone breaks the chain; Take 45 ships both, plus the `targetVersion` validation. On the patched lab host the chain dies at step one: `loginNew` returns `Remote authentication failed for peer`, so no session is minted and the write never happens.

A note for anyone locating the fix from the manifest, as we did: the single tracking ID that pointed at `upgrade_web_services.jar` found the traversal, but the login and write fixes sit in shared jars containing dozens of other tickets, invisible to that heuristic. A single-ID row locates a tracked change, not necessarily the whole fix.

Similarly, the advisory names a traversal and an upload, which is two of the three fixes. The third is the forged login, the defect that makes the other two reachable without credentials. The description leaves it out; “unauthenticated” appears there as a property of the attacker rather than a flaw in its own right. Check Point remediated more than it described.

## Conclusion

CVE-2026-93616 is an unauthenticated remote root code execution vulnerability on the Check Point management server over a single TCP port, against the host that holds an organization’s firewall policy and internal CA. It is exploited in the wild. Patch to Take 45 or your branch’s equivalent and restrict TCP 19009 to the stations that need it.

Whether you’re exposed depends on the build you’re running and on who can reach it. Our detection tool settles the build question from outside, but reachability is a matter of configuration. Check the firewall rule in front of the management server, then the Trusted Clients list, which generates a rule of its own. If a user network can reach an unpatched management server, treat it as though it’s already compromised.

The defects the advisory names are real, but what made them a clean unauthenticated root shell was a login method that spoofs the server’s own identity from a string and a file service that writes anywhere as root. Check Point’s fix reflects that: it closes the forged login and the unbounded write, not just the traversal. When an advisory and a patch disagree about scope, scope from the patch. Audit your own management planes for more than input validation: ask what an unauthenticated caller can become, and what that identity can then reach.

Cosmos customers were notified about this vulnerability research shortly after the vendor advisory published. If you are interested in learning more about managed services delivered through our Cosmos platform, visit [https://bishopfox.com/services/continuous-threat-exposure-management](https://bishopfox.com/services/continuous-threat-exposure-management).

Our detection tool is available on GitHub: [github.com/BishopFox/CVE-2026-93616-check](https://github.com/BishopFox/CVE-2026-93616-check).

For more vulnerability intelligence insights, visit the [Bishop Fox Blog](https://bishopfox.com/blog/technology).

![Jon Williams](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a025cbec07db3b32.jpg)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a10729e6ade629c7.svg)

Subscribe to our blog

Be first to learn about latest tools, advisories, and findings.
