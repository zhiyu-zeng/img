---
title: "The iOS sandbox: profiles, Seatbelt and sandbox escapes"
source: https://sigreturn.com/blog/ios-sandbox/
source_host: sigreturn.com
clip_date: 2026-09-23T10:09:55+08:00
trace_id: 4ffbbeb5-5235-4df9-9dc0-f17480f121a8
content_hash: 43b9dab3aa52b0920357ff2ec26addfcebdcb1cf583c41f1272f32ccaa557f44
status: synced
tags:
  - iOS逆向
  - 内核
series: null
feed_source: Sigreturn Labs·Apple internals
ai_summary: iOS 沙箱是每进程一份 deny-by-default 的编译策略，由 Sandbox.kext 在每次敏感操作时求值；逃逸几乎全靠读策略找逻辑漏洞，而不是破坏内存。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3e475244-d011-81f7-82e5-d5cd4c889983
ioc:
  cves:
    - CVE-2018-4280
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> iOS 沙箱是每进程一份 deny-by-default 的编译策略，由 Sandbox.kext 在每次敏感操作时求值；逃逸几乎全靠读策略找逻辑漏洞，而不是破坏内存。
> 
> - **架构：** Sandbox.kext 是与 AMFI 结构相同的 MACF 策略模块，读同一 `cr_label`；平台 profile 编在 kext 内、对所有进程生效并设上限，每进程 profile 只能收窄，两者都允许才放行。`mach-lookup` 不走 MACF，由 launchd 经策略 syscall 查询。
> - **语言与编译：** 规则形如 `(action operation filter modifier)`，操作为 `file-read*`、`mach-lookup`、`iokit-open` 等层级通配名。macOS 在 spawn 时编译 SBPL 并附带可读 `.sb` 源码；iOS 的平台与命名服务 profile 预编译进 kext、锁在内存，只能靠 `sandbox_check`/`sbtool` 运行时查询或 SandBlaster 反编译恢复。
> - **实战读法：** `/System/Library/Sandbox/Profiles/quicklook-thumbnail.sb` 显示其允许的 `mach-lookup` 仅二十余个服务（tccd、SecurityServer、windowserver.active、cvmsServ 等），这就是缩略图解析漏洞的全部一阶攻击面；`sandbox-exec` 加 `(deny network*)` 可复现拒绝（curl 退出码 6）。
> - **逃逸类别：** confused deputy（借可达的更高权限服务，如 blanket/CVE-2018-4280 链到无沙箱 root 且持 `task_for_pid-allow` 的 ReportCrash）、欠沙箱服务、求值器与 regex/扩展令牌 HMAC 缺陷、`temporary-exception` 授权过宽、未覆盖操作与路径过滤的 TOCTOU 竞态。
> - **2026 现状：** 逐 syscall 过滤成熟、可达服务集持续收缩（Safari 改为绕经 GPU 进程）、launch constraints 与 DER entitlement 封堵相邻路径；策略页受 KTRR/SPTM 保护，`struct label` 自 iOS 15.2 起置于只读 zone，内核读写需走分配器特权路径；摄像头/麦克风迁入 Exclaves，profile 允许已不再充分。

[The previous post](https://sigreturn.com/blog/ios-code-signing-pipeline/) ended on `cr_label`, the Mandatory Access Control Framework label on a process’s credentials. AMFI, Apple Mobile File Integrity, writes its verdict there at exec time, entitlements and sandbox exceptions included. A second policy module, the sandbox, reads the same slot and asks the question that follows: with the process now running, what may it reach?

The answer is not a check scattered through the kernel. It is a single compiled document, one per process, that the kernel consults on every sensitive operation: open this file, resolve that Mach service name, call this IOKit method. That document is the process’s **sandbox profile**: the exact list of what a confined process can reach, and therefore the list of everything an attacker who lands in it will try next. Escaping a sandbox is far more often a matter of reading the profile than of corrupting anything.

Note

Everything here is public: Apple’s open-source XNU, the Apple Platform Security documentation, published research from Dionysus Blazakis, the SandBlaster authors and Brandon Azad, and the sandbox profiles shipped on every Mac. It contains no exploit, private detail, or 0day.

## The sandbox is built like AMFI

The sandbox is `Sandbox.kext`, a kernel extension (bundle id `com.apple.security.sandbox`) and a MACF policy module structurally identical to AMFI. It registers a callback at each sensitive operation: a file open, a memory mapping, an IOKit user-client open, a raw syscall. MACF invokes every registered policy there, and a deny from any one denies the operation. That is the deny-wins property from the last post: a single refusal from either module ends the operation, so switching one off buys nothing from the other.

A `mach-lookup`, resolving a Mach service name to a port, takes a different route. There is no MACF hook for it: launchd asks the sandbox through the policy syscall before it hands out the send right, and the answer comes out of the same profile.

AMFI’s central verdict is taken at exec and is about code identity. The sandbox runs for the rest of the process’s life and filters every sensitive operation it attempts. Both read the same `cr_label`: AMFI’s verdict sits in one slot, and a pointer to this process’s compiled profile sits in a second slot, which the kernel pulls out and evaluates against at each hook.

The model is **deny by default**. A profile begins with `(deny default)`, and every capability the process has is an explicit `allow` written against it. Nothing the profile did not name is permitted.

Two profiles apply to essentially every process, and an operation is allowed only if **both** allow it:

-   The **platform profile** is a single mandatory base policy compiled into the kext (`_platform_profile_data`) and evaluated for *every* process, root daemons included. It is the iOS analogue of SIP (System Integrity Protection) at the MAC layer: even uid-0 code is confined. Because both profiles have to allow an operation, what the platform profile permits is the maximum any process on the system gets, and a per-process profile can only narrow it.
-   The **per-process profile** is `container` for third-party apps (every App Store app gets the identical container profile; what differentiates them is Apple-signed entitlements plus the per-app parameters bound in at spawn, `HOME`, the bundle id, App Group UUIDs) or one of the named service profiles: `com.apple.WebKit.WebContent`, `mediaserverd`, `quicklook-thumbnail`, and the rest.

The offensive consequence is the one from the last post: once you have [kernel read/write](https://sigreturn.com/blog/xnu-under-the-hood/), what confines the process is that pointer. Overwrite it, swap in an unrestricted profile or `NULL`, and the process is no longer confined, without ever touching the policy itself.

## Containers: every process in its own tree

Much of what the profile enforces is expressed in terms of the container. `containermanagerd`, itself a sandboxed daemon, creates each app’s data container at `/var/mobile/Containers/Data/Application/<UUID>/`, where the UUID is a random per-install identifier no other app ever learns, and records ownership out of the app’s reach. The profile binds a variable, `HOME`, to that path at spawn, so a `file-read*` or `file-write*` rule written against `(subpath (param "HOME"))` resolves into the app’s private tree and nowhere else.

The sanctioned way out of that isolation is an **App Group**: a shared directory under `/var/mobile/Containers/Shared/AppGroup/<UUID>/`, gated by the `com.apple.security.application-groups` entitlement, that several of a developer’s apps can share. On macOS the same machinery puts each sandboxed app under `~/Library/Containers/<bundle-id>/`. The container is the filesystem half of confinement; the IPC, IOKit, and syscall half is in the profile.

## SBPL, and the profile the kernel actually reads

Profiles are authored in **SBPL**, the Sandbox Profile Language, a small dialect of Scheme. A rule is `(action operation filter... modifier...)`:

-   **action** is `allow` or `deny`.
-   **operation** is hierarchical and wildcarded: `file-read*` covers `file-read-data`, `file-read-metadata`, `file-read-xattr`; alongside it sit `file-write*`, `mach-lookup`, `network*`, `iokit-open` (opening a driver’s user client), `process-exec*`, `sysctl-read`, `syscall-unix`, and a few dozen more. `default` sets the base verdict.
-   **filter** narrows the rule to specific arguments: path filters (`literal`, `subpath`, `prefix`, `regex`), the Mach `global-name` / `local-name` (the service name being looked up), `require-entitlement`, `iokit-user-client-class`, network `socket-domain` / `remote`. Filters combine with `require-all` / `require-any` / `require-not`.
-   **modifier** tweaks the outcome: `report`, a specific `errno` to return on deny, `send-signal` to kill on violation, and `no-sandbox`, which lets a child run unconfined.

So a single line like `(allow mach-lookup (global-name "com.apple.tccd"))` reads as it looks: this process may resolve the name of TCC, the Transparency, Consent, and Control daemon, and no other name.

On macOS, `libsandbox` compiles SBPL to bytecode at spawn, and a dynamic profile can even run Scheme to *generate* its rules from the process’s entitlements. On iOS none of that happens at runtime: the platform profile and every named-service profile ship **pre-compiled inside the kext**, in memory the kernel is not allowed to rewrite. No source on the device to read, no compiler to invoke.

The kernel never sees SBPL text; it walks a compiled decision graph. As recovered by SandBlaster, a compiled profile is a header plus an array of fixed **8-byte nodes**, indexed by an operation table: entry *i* is the root node for operation *i*. A node is either non-terminal, testing one filter against the operation’s context with an argument taken from the profile’s string, regex, or literal tables, and jumping to one of two other nodes on match or mismatch; or terminal, carrying the verdict and its modifier flags.

To decide a `mach-lookup` of `com.apple.foo`, the evaluator starts at the `mach-lookup` root and tests `global-name` against the first allowed name. A miss threads to the next candidate, and so on down the chain of allowed names, until a match reaches an allow terminal or the last mismatch lands on the `default` terminal, a deny. Traversal is `O(depth)` and the only attacker input is the argument being compared, which is why bugs in the *interpreter* are scarce and the productive attack is on the *content* of the policy.

## Hands-on: reading a profile off a stock Mac

You do not have to decompile anything to learn this on a Mac. Unlike iOS, macOS ships a large set of first-party profiles as readable SBPL text, right in the filesystem.

```bash
ls /System/Library/Sandbox/Profiles/*.sb | head
```

```swift
/System/Library/Sandbox/Profiles/accessorysensormgrd.sb
/System/Library/Sandbox/Profiles/airlock.sb
/System/Library/Sandbox/Profiles/application.sb
/System/Library/Sandbox/Profiles/appsandbox-common.sb
/System/Library/Sandbox/Profiles/apsd.sb
/System/Library/Sandbox/Profiles/ASPCarryLog.sb
/System/Library/Sandbox/Profiles/AudioAccessoryAssetManagementXPCService.sb
/System/Library/Sandbox/Profiles/betaenrollmentagent.sb
/System/Library/Sandbox/Profiles/betaenrollmentd.sb
/System/Library/Sandbox/Profiles/blastdoor.sb
```

Two of those first ten already matter: `blastdoor.sb` is BlastDoor, the sandbox Apple built around iMessage parsing, and `application.sb` the base every third-party app inherits. `quicklook-thumbnail.sb` covers the QuickLook thumbnail generator, which is where an attacker lands for free: the OS parses a file to draw a thumbnail, with no user interaction, on bytes an attacker chose, as soon as it is downloaded, AirDropped, or opened in a Finder window. A memory-safety bug in one of those parsers gives you code execution *inside this profile*, so its allowed set is exactly what that bug can reach.

Skip the Apple banner at the top, which warns that these rules are private interface and auto-generated, and read the head of the policy:

```bash
sed -n '9,12p' /System/Library/Sandbox/Profiles/quicklook-thumbnail.sb
```

```
(version 1)
(deny default file-link)
(import "system.sb")
(import "appsandbox-common.sb")
```

Deny by default, then two imports: `system.sb`, the common base every process pulls in, and `appsandbox-common.sb`, the shared App Sandbox layer. The effective policy is this file plus whatever those two allow. Now the allowed Mach services:

```bash
grep -nE 'global-name|mach-lookup' /System/Library/Sandbox/Profiles/quicklook-thumbnail.sb
```

```javascript
153:(allow mach-lookup
154:       (global-name "com.apple.containermanagerd")
155:       (global-name "com.apple.CoreServices.coreservicesd")
156:       (global-name "com.apple.coreservices.quarantine-resolver")
157:       (global-name "com.apple.cvmsServ")
158:       (global-name "com.apple.distributed_notifications@1v3")
159:       (global-name "com.apple.distributed_notifications@Uv3")
160:       (global-name "com.apple.FileCoordination")
161:       (global-name "com.apple.FontObjectsServer")
162:       (global-name "com.apple.fonts")
163:       (global-name "com.apple.gputools.service")
164:       (global-name "com.apple.mobileassetd")
165:       (global-name "com.apple.ocspd")
166:       (global-name "com.apple.securityd.xpc")
167:       (global-name "com.apple.SecurityServer")
168:       (global-name "com.apple.spindump")
169:       (global-name "com.apple.SystemConfiguration.configd")
170:       (global-name "com.apple.tailspind")
171:       (global-name "com.apple.tccd")
172:       (global-name "com.apple.tccd.system")
173:       (global-name "com.apple.TrustEvaluationAgent")
174:       (global-name "com.apple.windowserver.active"))
175:(allow mach-lookup
176:       (global-name "PurplePPTServer")
177:       (global-name "PurpleSystemEventPort")
178:       (global-name "com.apple.awdd")
179:       (global-name "com.apple.itunesstored.xpc")
180:       (global-name "com.apple.lskdd"))
```

That is the allowed set. Twenty-odd names, each one a service this profile may resolve into a send right; every other name on the system is unreachable, and `bootstrap_look_up`, the call that turns a service name into a port, returns nothing. It is the complete first-order attack surface of a thumbnailing bug, and the escape routes are visible in it: `com.apple.tccd` and `com.apple.tccd.system` decide whether code may reach your camera, microphone, and private files; `com.apple.SecurityServer` and `com.apple.securityd.xpc` front the keychain; `com.apple.windowserver.active` is WindowServer, historically one of the deepest escape surfaces on the platform; `com.apple.CoreServices.coreservicesd` is Launch Services, which can start other programs; `com.apple.cvmsServ` is the shader-compilation service, a long-standing target because it parses and compiles attacker-supplied shaders. The second block, the `Purple*` names (`Purple` is Apple’s internal codename for iOS), shows that these first-party profiles are shared source between iOS and macOS.

To watch a denial happen, write a profile that allows everything except one class, the network, and run a program under it:

```bash
cat > /tmp/nonet.sb <<'EOF'
(version 1)
(allow default)
(deny network* (with message "nonet-demo"))
EOF
sandbox-exec -f /tmp/nonet.sb /usr/bin/curl -sI https://www.apple.com ; echo "exit: $?"
```

```
exit: 6
```

`(allow default)` lets curl start normally; the later `(deny network*)` wins for that one class, so its first network move, resolving the hostname, is refused. curl exits 6, `CURLE_COULDNT_RESOLVE_HOST`: the DNS query never left the sandbox. Keep `log stream --predicate 'sender == "Sandbox"'` open in another terminal and the violation surfaces as the `nonet-demo` message, the same way the kernel logged the AMFI kill in the last post.

You can read this profile because it is a Mac, and macOS ships the sources. On the device there is no `quicklook-thumbnail.sb` to `cat`: the profile is compiled into `Sandbox.kext` and locked in memory. To get the same list on iOS you query it at runtime with `sandbox_check` or Levin’s `sbtool` against a live process, or you pull the kext out of the kernelcache and run it through SandBlaster to recover the SBPL. More work than a `cat`, same answer.

## What the profile tells an attacker

The allowed set is a target list, because sandbox escapes are dominated by logic bugs. A bug that reasons around the policy is unaffected by the kernel’s memory-safety hardening, for the reason the code-signing post gave: it never corrupts anything. The classes below are all visible from the profile we just read.

**Confused deputy via `mach-lookup`.** The most productive class by far. Each allowed `global-name` is a service running with *its own* profile, *its own* entitlements, and often a higher uid. Find a bug in one of them, memory-safety or logic, and you inherit its capabilities without ever attacking the sandbox itself. The method is invariant: enumerate the allowed services, rank them by privilege and entitlements, and audit each endpoint’s message handlers. Reachable is not exploitable, since a service may have its own tight profile and hardened handlers. And escaping into a service usually lands you in *another*, often wider, sandbox, so real chains stack escapes until they reach an unsandboxed or root deputy, or the kernel.

That last case is what Brandon Azad’s **`blanket`** (CVE-2018-4280) did on iOS: a Mach-service bug chained through reachable services to `ReportCrash`, which was unsandboxed, ran as root, and held `task_for_pid-allow`, so the confused deputy handed over the task port of any process on the device, amfid included. No memory was corrupted; the deputy did the privileged work on the attacker’s behalf.

**Unsandboxed or under-sandboxed services.** A reachable process with no profile at all, an `(allow default)`, or a `no-sandbox` grant on its children is an escape by construction, and the first thing to grep the decompiled policies for. `ReportCrash` was the classic; the macOS analogue today is the tail of XPC services (XPC is Apple’s IPC layer over Mach, the subject of the next post) that auto-register in one process’s launchd domain when a framework loads and skip the entitlement checks their system-wide siblings enforce.

**Bugs in the evaluation itself.** Rare, because the interpreter is small and sees data you only indirectly control, and total when they land: a flaw in the interpreter, the regex engine, or the check on extension tokens (the signed grants a broker hands a client for one specific path) applies to every profile at once. The realistic corners are the regex table, where a pattern matches a path it should not through `..`, UTF-8, or case-folding, and the HMAC (keyed hash) that authenticates those tokens.

**Entitlement and exception widening.** Entitlements *widen the profile* as well as unlocking AMFI capabilities, and the mechanism is at the bottom of the QuickLook file:

```
217:  "com.apple.security.temporary-exception.mach-lookup.global-name"
218:  (lambda (name) (allow mach-lookup (global-name name))))
220:  "com.apple.security.temporary-exception.mach-lookup.local-name"
221:  (lambda (name) (allow mach-lookup (local-name name))))
```

A process whose signature carries that entitlement gets to resolve *any* service name it lists, overriding its own profile’s deny-default, though still only up to what the platform profile allows. It is an escape class the moment an exception is over-broad, or a broker issues one on a client’s say-so without checking that the client should have it.

**Uncovered operations and filter races.** The gaps: an operation nobody wrote a rule for, which inherits a too-generous `default`, or a path filter defeated by a symlink, a `..`, or a rename race slipped between the `mpo_vnode_check_*` callout and the filesystem operation itself. These are TOCTOU (time-of-check to time-of-use) bugs, and they appear wherever a filter matches a name that a moment later points somewhere else.

## State in 2026

The model has not changed since 2021; the escape got narrower and better instrumented. The sandbox is still an in-XNU MACF kext, and unlike the code-signing verdict from the last post, which moved out to TXM (the Trusted Execution Monitor), sandbox evaluation did **not** migrate to TXM or to the Exclaves, the isolated domains that run outside XNU under the Secure Kernel. What changed is the surface around it.

-   **Per-syscall filtering matured.** `syscall-unix`, `syscall-mach`, and kernel MIG-routine filtering (MIG, the Mach Interface Generator, produces the RPC stubs behind Mach interfaces) let a profile allow *individual* BSD syscalls, Mach traps, and kernel routines. WebContent, the Safari renderer, and BlastDoor now run with short explicit lists, so much of the raw XNU trap surface that was implicitly reachable in 2021 is explicitly denied per profile. Reverse the syscall nodes before you assume a trap is even callable from where you stand.
-   **The reachable-service set keeps shrinking.** First-party profiles, WebContent above all, have had their `mach-lookup` lists cut repeatedly. From the modern Safari renderer the direct reach is minimal, principally the WebKit GPU and Networking processes, which is why the current browser escape pivots *through the GPU process* instead of messaging a daemon directly.
-   **Launch constraints and DER entitlements close adjacent attack paths.** Launch constraints (iOS 16 and later) bind *which* process may spawn a given binary, killing the old trick of relaunching a privileged Apple binary in your own context to inherit its wider profile. Entitlements are now DER-encoded (Distinguished Encoding Rules, a canonical binary form rather than a plist) and validated by TXM, so forging one to widen a profile is far harder than it was.
-   **The policy itself is out of reach of a kernel write.** The platform profile blob was always locked by KTRR/CTRR (the Kernel Text Read-only Region and its configurable successor), and on A15 and M2 silicon from iOS 17 and macOS 14 onward, the pages holding the compiled policy are, plausibly, owned by SPTM (the Secure Page Table Monitor) under its physical-frame retyping, so even full kernel read/write cannot patch a profile in place. The label is no longer reachable either: since iOS 15.2 and macOS 12.1 (xnu-8019.61.5), `struct label` is allocated from a read-only zone (`ZC_READONLY`, in `security/mac_label.c`) and its slots are written through `zalloc_ro_update_field()`, so the label edit that used to follow a kernel read/write now needs the allocator’s own privileged write path rather than a plain store.
-   **Sensitive resources are moving under Exclaves.** Camera and microphone capture, and the recording indicator, are migrating to sensor and indicator Exclaves reached only through SPTM-mediated paths. A `device-camera` or `device-microphone` allow in a profile is becoming necessary but not sufficient, because the actual capture path is gated below XNU. A sandbox escape, or even a kernel compromise, no longer silently disables the recording indicator.

Sandbox logic is untouched by all of it: confused deputies, extension-scoping bugs, an under-sandboxed daemon, a profile gap, a filter race. `kalloc_type` and MIE (Memory Integrity Enforcement, the synchronous memory tagging on A19 and the iPhone 17 line) only make the stage *after* the escape harder, and it is only on anything still running iOS 15 or older that the old flow survives, where kernel read/write plus a plain label edit is the whole desandbox.

## Where this leaves us

The sandbox is one compiled document per process, deny-by-default, walked by a small interpreter over a decision graph. The platform profile sets the maximum any process gets; a per-process profile and its entitlements narrow it further. You find its bugs by reading the profile: the allowed `mach-lookup` set is everything the process can reach, and therefore everything you can try.

Which is also the honest limit of this post. The profile tells you *which* drivers and services you may reach. It says nothing about *how* to talk to them, or what goes wrong when you do. [The next post](https://sigreturn.com/blog/iokit-attack-surface/) picks one `iokit-open` allowance and follows the user client behind it into the driver, down to the table that decides which function your call lands on.

## Notes and sources

Everything here is drawn from open source, vendor documentation, published research, and the profiles shipped on any Mac.

-   Dionysus Blazakis, [“The Apple Sandbox”](https://media.blackhat.com/bh-dc-11/Blazakis/BlackHat_DC_2011_Blazakis_Apple_Sandbox-wp.pdf) (Black Hat DC 2011), the original public reverse-engineering of the SBPL bytecode model, still the conceptual baseline.
-   Răzvan Deaconescu et al. (malus-security), [“SandBlaster: Reversing the Apple Sandbox”](https://arxiv.org/abs/1608.04303) and the [`sandblaster`](https://github.com/malus-security/sandblaster) decompiler (maintained fork at [cellebrite-labs](https://github.com/cellebrite-labs/sandblaster)); `reverse-sandbox/operation_node.py` documents the 8-byte node layout, the `0x00` non-terminal / `0x01` terminal type byte, and the operation table of 16-bit offsets behind the walk above.
-   Patroklos Argyroudis (CENSUS), [“Vs com.apple.security.sandbox”](https://census-labs.com/resources/vs-comapplesecuritysandbox-cansecwest-2019) (CanSecWest 2019), the hooks and the operation/filter internals from an offensive stance.
-   nsantoine, [“A Worm’s Look Inside: Apple’s Sandboxing Security Measures”](https://nsantoine.dev/SandboxPaper.pdf) (2024), a modern account of `cred_sb_evaluate`, `label_get_sandbox`, operation numbering, and the platform-profile-in-kext design.
-   Brandon Azad, [`blanket`](https://github.com/bazad/blanket) (CVE-2018-4280), the canonical `mach-lookup` confused-deputy escape to `ReportCrash`.
-   Apple, [XNU source](https://github.com/apple-oss-distributions/xnu): `security/mac_label.c` for the read-only zone holding `struct label` and the `zalloc_ro_update_field()` path its slots are written through.
-   Moritz Steffin and Jiska Classen, [“Modern iOS Security Features: A Deep Dive into SPTM, TXM, and Exclaves”](https://arxiv.org/abs/2510.09272) (2025), for the Exclaves and sensor/indicator domains behind the 2026 `device-*` changes.
-   Apple, [“Memory Integrity Enforcement”](https://security.apple.com/blog/memory-integrity-enforcement/) (2025), the primary source for synchronous memory tagging on A19 and the iPhone 17 line.
-   Jonathan Levin, *\*OS Internals, Volume III: Security & Insecurity* ([newosxbook.com](https://newosxbook.com/index.php)) and the `sbtool` utility, the reference for MACF, the sandbox internals, and querying a live process’s profile with `sandbox_check`.
-   Apple, [Apple Platform Security](https://support.apple.com/guide/security/welcome/web), for the app sandbox, data containers, and the privacy-indicator architecture at the vendor-documentation level.
