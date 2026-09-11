---
title: Linux Detection Engineering - Local Privilege Escalation
source: https://www.elastic.co/security-labs/threat-command/linux-privilege-escalation-detection-framework
source_host: www.elastic.co
clip_date: 2026-09-11T23:44:34+08:00
trace_id: 91d3de3c-268d-47ca-8e5b-7452b2a45e9d
content_hash: e16af0cfea6dceee9d3081dbb4e2cd6b6a0c4c89386236cac7912e7aebe94d5f
status: synced
tags:
  - Linux安全
  - 漏洞分析
series: null
feed_source: Elastic Security Labs
ai_summary: Linux 本地提权检测应放弃按 CVE 逐个写规则，改用以“可写路径执行→变为 root”的通用行为层加 bug 类技术层。
ai_summary_style: key-points
images_status:
  total: 15
  succeeded: 15
  failed_urls: []
notion_page_id: 3d875244-d011-81a0-95fd-d35a3c84b0ce
ioc:
  cves:
    - CVE-2026-31431
    - CVE-2026-31635
    - CVE-2026-43284
    - CVE-2026-43500
    - CVE-2026-43503
    - CVE-2026-46243
    - CVE-2026-46300
    - CVE-2026-46331
    - CVE-2026-46333
    - CVE-2026-64531
    - CVE-2026-64600
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Linux 本地提权检测应放弃按 CVE 逐个写规则，改用以“可写路径执行→变为 root”的通用行为层加 bug 类技术层。
> 
> - **披露趋势：** 2026 年 4–7 月跟踪的 13 个提权披露中 7 个属同一类——本应先复制的数据被 copy-on-write/零拷贝路径原地写入；Copy Fail、DirtyFrag、Fragnesia、DirtyDecrypt、DirtyClone、pedit COW、RefluXFS 均属此类，且部分研究借助 LLM 批量挖掘同源新实例。
> - **通用检测骨干：** 非 root 进程从 `/tmp`、`/dev/shm`、`/var/tmp`、`/home/*`、`/run/user/*` 等可写路径启动，随后同一 lineage 出现 `uid_change` 到 0；可用父进程 entity_id 关联、`descendant of` 跨多层进程、或追加 `id`/`whoami`/`logname` 确认阶段（公开 PoC 误报最低）。
> - **SUID/SGID 层：** 先匹配 `user.id==0 且 real_user.id!=0`（或 group 同理），再叠加低参数量的 su/sudo/pkexec/passwd、`stringcontains(process.executable, process.command_line)` 识别名单外的冷门 SUID、以及把 helper 路径放在 `process.args` 中捕获 binfmt_misc 式代理执行；最后用大型 GTFOBins 名单和排除项收敛误报。
> - **unshare/命名空间层：** 先 `unshare(CLONE_NEWUSER)` 获得命名空间内 capability 再打内核路径（CIFSwitch、pedit COW、OverlayFS 类、DirtyClone 等），因此既要关联 unshare 与根转换，也要单独立规则告警异常 unshare（容器逃逸场景无 uid 0）。
> - **验证与局限：** 用 11 个公开 PoC 加 2 个 SUID 配置错误实测；Copy Fail 有 AF_ALG 原语告警，DirtyClone 仅靠“Python 提权”一条通用规则命中，说明结果导向层必须独立成立。框架不声称覆盖 100%，EDR 规则重低误报、检测规则少排除。

[Local privilege escalation](https://attack.mitre.org/tactics/TA0004/) (LPE) is the step that turns a foothold into full control of a host. An attacker who lands as an unprivileged user rarely stops there. They want root, and Linux keeps offering new ways to get it.

In this edition of our "Linux Detection Engineering" series, we’ll cover:

-   The default flow that a Linux LPE produces on the host and the general rules that detect it.
    
-   The recurring LPE patterns behind the most recent LPEs and how each works, along with how each looks through the lens of Elastic Defend.
    
-   The Elastic detection and endpoint rules that fire on each.
    

Over the past year, the pace of publicly disclosed Linux LPEs has picked up sharply, and the shape of those disclosures has changed with it.

![Timeline of 17 Linux local privilege escalation CVEs from 2016 to 2025, grouped into four bug classes](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/07bb296d6a88233e.png)

For most of the last decade, escalations arrived steadily but from all over the map, including from trusted helpers like `sudo`, `pkexec`, and `polkit`; kernel bugs scattered across Executable and Linkable Format (ELF) loading, `ptrace`, eBPF, and packet sockets; and user namespaces widening what an ordinary account could reach. That variety kept the workload manageable. Each bug had its own subsystem and write-up, so reading each advisory as it landed and adding a rule for that technique worked.

Then came 2026.

![Timeline of 13 Linux privilege escalation disclosures from April to July 2026, colour-coded by bug class](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7876854d4353d86f.png)

Seven of the 13 disclosures that we track here share one bug class: a copy-on-write or zero-copy path that writes into data that it was supposed to copy first. Copy Fail opened in April 2026, and DirtyFrag, Fragnesia, DirtyDecrypt, and DirtyClone pushed the identical idea through ESP, RxRPC, and the socket-buffer fragment helpers within weeks. pedit COW moved it into traffic control. RefluXFS took it back to the filesystem in July 2026. Neither figure is a census, so read them as a picture of how the work changed rather than a count of every bug.

[Qualys](https://blog.qualys.com/vulnerabilities-threat-research/2026/07/22/refluxfs-a-linux-kernel-local-privilege-escalation-to-root-in-xfs-cve-2026-64600) attributes RefluXFS to a research effort with Anthropic, pointing Claude Mythos Preview at the kernel's memory-management and filesystem code to hunt for a DirtyCOW-style race and then reproducing and verifying the result before disclosure. [The author of OVSwrap](https://heyitsas.im/posts/ovswrap/) credits a comparable large language model-assisted (LLM-assisted) workflow. Both teams kept humans on validation and disclosure, and LLMs are unlikely to be the only factor here. What the two write-ups show is the loop itself: hand a model a known bug class, ask for a new instance, repeat. When one idea can be aimed at a dozen kernel interfaces in a quarter, a detection rule written per Common Vulnerabilities and Exposures (CVE) keeps arriving late.

The good news is that most LPEs, however novel the trigger, share a single detectable flow, and beyond it, they fall into a small number of bug classes. So we detect in two layers: a general layer keyed on the flow every escalation produces (an unprivileged process becoming root), and a per-technique layer that adds signal specific to a bug class.

## Setting up Elastic Defend and Auditd to detect Linux privilege escalation

To follow along and generate the telemetry shown here, enable the prebuilt rules and reproduce the techniques in a lab:

1.  In Kibana, navigate to **Security** -> **Rules** -> **Detection rules (SIEM)**, and install the Elastic prebuilt rules. Enable the Linux privilege escalation rules (by filtering on tags `OS: Linux` and `Tactic: Privilege Escalation`).
    
2.  Deploy [Elastic Defend](https://www.elastic.co/docs/solutions/security/configure-elastic-defend) on a Linux test host for endpoint (behavioral) coverage.
    
3.  For syscall-level visibility, enable the [Auditd Manager](https://www.elastic.co/docs/reference/integrations/auditd_manager) integration. The page-cache class, in particular, relies on `socket`, `splice`, and `bind` auditing, as well as `execve`. The [Copy Fail and DirtyFrag research](https://www.elastic.co/security-labs/copy-fail-dirtyfrag-linux-page-bugs-in-the-wild) lists the exact auditd rules to add.
    
4.  Reproduce each technique safely in a disposable virtual machine (VM) using the relevant public proof of concept (PoC). Treat all exploit code as lab-only, and never run it against systems that you don’t own.
    

All of the rules mentioned in the blog are available as a detection and/or endpoint rule. Detection rules live in Elastic’s [detection-rules](https://github.com/elastic/detection-rules/tree/main) repository, while endpoint rules live in Elastic’s [protections-artifacts](https://github.com/elastic/protections-artifacts) repository.

## The limitations of this Linux privilege escalation detection framework

This post is built around the public PoC for each vulnerability. We’re aware that a PoC can be modified: swap the targeted setuid binary, change paths, or reshape the exploit to sidestep a specific match. That’s exactly why the detection is layered and outcome-oriented rather than tied to any one implementation. The goal is a general LPE detection framework that holds up across reimplementations and covers the shared flow that every escalation produces.

We aren’t claiming to detect 100% of Linux LPEs, and certainly not an LPE custom-built to evade these detections. What we aim for is broad, durable coverage of the way that escalations actually behave on a host, with LPE technique-specific rules covering the foundations and bug class-specific rules to catch those that were missed.

## How Linux privilege escalation detection works: The flow that every exploit produces

Almost every local privilege escalation, whatever the underlying bug, produces the same skeleton of activity on the host:

1.  An unprivileged user (`uid != 0`) runs something, usually a freshly dropped or compiled binary, a script, or a shell one-liner, from a location that they can write to (for example, `/tmp`, `/dev/shm`, `/var/tmp`, `/home`, or `/run/user/`).
    
2.  Moments later, a process in that lineage is running as root: a `uid_change` to `0`, an effective `uid` or `guid` of `0`, or an interactive root shell.
    
3.  In certain PoCs, the exploit then confirms success by running `whoami`, `id`, or `logname`.
    

That "exec from a writable path and become root" skeleton is the backbone of our general detection. Because these rules key on the outcome and its immediate context rather than on any exploit-specific artifact, they cover a broad class of LPEs, including ones that we’ve never seen. They’re also what catch the page-cache family and the no-userland-tell kernel bugs, where there’s nothing implementation-specific to match.

### Detecting SUID and SGID helper abuse

Setuid-root binaries and helpers are the single most common final step in a Linux LPE, because they’re the sanctioned way for an unprivileged user to run something as root, so any slip in how one of them behaves hands over that privilege. What ties the subcases together is the privilege shape: a process running with effective `uid 0` while the real user (and usually the parent) is not, launched with minimal arguments from an interpreter, a shell one-liner, or a writable path. We split the coverage by how the abused binary is chosen, from the handful of helpers that appear in almost every write-up, out to the long tail and the proxying tricks that a name-based rule misses. This category maps to the Abuse Elevation Control Mechanism: Setuid and Setgid ([T1548.001](https://attack.mitre.org/techniques/T1548/001/)) technique on the MITRE ATT&CK matrix.

#### Detecting abuse of su, sudo, pkexec, and passwd

A short list of setuid helpers (`su`, `sudo`, `pkexec`, `passwd`) accounts for the overwhelming majority of real-world SUID abuse, whether as the finishing move of a memory-corruption exploit or a plain misconfiguration. A dedicated, tightly scoped rule for these keeps false positives near zero while covering the common case, so it’s the first thing to reach for.

Let’s begin by covering the different building blocks relevant to building a strong yet general SUID LPE detector, one by one. The following logic looks for instances where either the user or group ID is 0, while the real user/group ID is not. This is a default and benign SUID behavior and would trigger on typical `sudo` usage by a user.

( (process.user.id == 0 and process.real_user.id!= 0) or (process.group.id == 0 and process.real_group.id!= 0) )

This logic is followed by the execution of a commonly abused SUID helper with a low process argument count. This already cuts down the false positive rate drastically. For example, in a benign use case, the `sudo` command is generally used with additional arguments, making a `sudo` invocation with an argument count of 1 rare. However, just relying on these two building blocks isn’t strong enough to be a detection on its own, as this activity still happens too frequently in benign scenarios.

( (process.name == "su" and process.args_count <= 2) or (process.name == "sudo" and process.args_count == 1) or (process.name == "pkexec" and process.args_count == 1) or (process.name == "passwd" and process.args_count <= 2) )

The euid-0 / non-root-real-user shape is paired with an interpreter, writable-path, or shell one-liner parent, which is what separates exploitation from a user legitimately typing `sudo`.

( process.parent.name like ( ".\*", "python\*", "perl\*", "ruby\*", "lua\*", "php\*", "node", "deno", "bun", "java" ) or process.parent.executable like ( "./\*", "/tmp/\*", "/var/tmp/\*", "/dev/shm/\*", "/run/user/\*", "/var/run/user/\*", "/home/\*/\*" ) or ( process.parent.name in ( "bash", "dash", "sh", "tcsh", "csh", "zsh", "ksh", "fish", "mksh" ) and process.parent.args in ("-c", "-cl", "-lc", "--command", "-ic", "-ci") and process.parent.args_count <= 4 ) )

And it’s followed by a bunch of known legitimate exclusion activity. Combining these three building blocks makes for a strong general SUID/SGID helper LPE detection. This logic maps to [Suspicious SUID/SGID Utility Execution](https://github.com/elastic/protections-artifacts/blob/main/behavior/rules/linux/privilege_escalation_suspicious_suid_sgid_utility_execution.toml).

#### Detecting uncommon SUID binaries without a name list

Not every abused SUID binary is on that short list. This variant drops the hard-coded names entirely and keys on the privilege shape plus a self-referential command line (the process was invoked as itself), which is what a freshly abused, less common setuid binary looks like on the wire. We still check beforehand to see whether we’re dealing with a SUID binary:

( (process.user.id == 0 and process.real_user.id!= 0) or (process.group.id == 0 and process.real_group.id!= 0) )

But this is quickly followed by the main logic differentiator between these different rules, which is displayed below:

( stringcontains(process.executable, process.command_line) or stringcontains(process.name, process.command_line) )

Instead of relying on allowlisting a list of known SUID binaries, we use a clever [stringcontains](https://www.elastic.co/docs/reference/query-languages/eql/eql-function-ref#eql-fn-stringcontains) Event Query Language (EQL) trick. By using the `stringcontains` function, we can compare the `process.executable` to the `process.command_line` value (or `process.name` to `process.command_line`), effectively matching on instances where an unknown SUID binary (which we established through the `user.id` versus `real_user.id` comparison) is executed directly. The gap it fills is the long tail: because there’s no name list, there’s no blind spot for whichever setuid binary a given system happens to ship, at the cost of a broader exclusion list for legitimate helpers.

We follow this rule with an exclusion of known SUID helpers, to minimize coverage overlap with the previous (and other) rules. This maps to [Potential Privilege Escalation via a SUID/SGID Binary](https://github.com/elastic/protections-artifacts/blob/4f957cd61fa2b85a2bce53b28c583e07ba020a94/behavior/rules/linux/privilege_escalation_potential_privilege_escalation_via_a_suid_sgid_binary.toml).

#### Detecting SUID helper proxy execution via process arguments

Some abuse doesn’t run the helper as the process itself; it hands the helper as an argument to another privileged binary, proxying the execution so a name-based rule sees the wrong thing. The tell is a process whose command line starts with its own executable, a single-argument parent, and a known setuid helper path sitting in the arguments.

process.args in ( "/bin/su", "/usr/bin/su", "/bin/umount", "/usr/bin/umount", "/bin/chfn", "/usr/bin/chfn", "/bin/chsh", "/usr/bin/chsh", "/bin/gpasswd", "/usr/bin/gpasswd", "/bin/newgrp", "/usr/bin/newgrp", "/usr/bin/newuidmap", "/usr/bin/newgidmap", "/usr/lib/dbus-1.0/dbus-daemon-launch-helper", "/usr/libexec/dbus-daemon-launch-helper", "/usr/lib/openssh/ssh-keysign", "/usr/libexec/openssh/ssh-keysign", "/usr/bin/pkexec", "/usr/libexec/pkexec", "/usr/lib/polkit-1/pkexec", "/usr/lib/snapd/snap-confine" ) and process.args_count <= 2

The proxy execution rule differs from the two rules above by looking at the helper in `process.args` rather than `process.name`, so it catches the proxying pattern ([binfmt_misc style](https://dfir.ch/posts/today_i_learned_binfmt_misc/) and similar) that name-based matching would miss entirely. Although not exhaustive, the argument list does target the most commonly available SUID helpers on a default Linux system. This maps to [Potential Privilege Escalation via SUID/SGID Proxy Execution](https://github.com/elastic/protections-artifacts/blob/main/behavior/rules/linux/privilege_escalation_potential_privilege_escalation_via_suid_sgid_proxy_execution.toml).

#### Further SUID and SGID privilege escalation rules

We didn’t get into every SUID-based LPE rule that we created to cover this attack vector. We encourage anyone interested in digging deeper to take a look at our other public rules related to SUID/SGID LPE, which can be found here:

-   [Suspicious SUID Binary Execution](https://github.com/elastic/detection-rules/blob/main/rules/linux/privilege_escalation_suspicious_suid_binary_execution.toml) (and its [Auditd variation](https://github.com/elastic/detection-rules/blob/main/rules/linux/privilege_escalation_suspicious_suid_binary_execution_auditd_sequence.toml))
    
-   [Privilege Escalation via SUID/SGID](https://github.com/elastic/detection-rules/blob/main/rules/linux/privilege_escalation_potential_suid_sgid_exploitation.toml)
    
-   [Potential Privilege Escalation via SUID/SGID](https://github.com/elastic/detection-rules/blob/main/rules/linux/privilege_escalation_potential_suid_lpe_via_process_args.toml)
    
-   [Suspicious SUID/SGID Utility Execution](https://github.com/elastic/protections-artifacts/blob/main/behavior/rules/linux/privilege_escalation_suspicious_suid_sgid_utility_execution.toml)
    
-   [Potential Privilege Escalation via SUID/SGID Proxy Execution](https://github.com/elastic/detection-rules/blob/main/rules/linux/privilege_escalation_potential_suid_sgid_proxy_execution.toml) (and its [Elastic Defend](https://github.com/elastic/protections-artifacts/blob/main/behavior/rules/linux/privilege_escalation_potential_privilege_escalation_via_suid_sgid_proxy_execution.toml) counterpart)
    
-   [Potential Privilege Escalation via a Known SUID/SGID Binary](https://github.com/elastic/protections-artifacts/blob/4f957cd61fa2b85a2bce53b28c583e07ba020a94/behavior/rules/linux/privilege_escalation_potential_privilege_escalation_via_a_known_suid_sgid_binary.toml)
    
-   [Potential Privilege Escalation via a SUID/SGID Binary](https://github.com/elastic/protections-artifacts/blob/4f957cd61fa2b85a2bce53b28c583e07ba020a94/behavior/rules/linux/privilege_escalation_potential_privilege_escalation_via_a_suid_sgid_binary.toml)
    

### Self-elevation: Exec from a writable path and then a UID change to root

Many kernel and logic exploits never touch a helper; the exploit process, or something in its lineage, simply becomes root. The observable is always the same pair: a non-root process execs from a writable path (`/tmp`, `/dev/shm`, `/var/tmp`, `/home/*`, `/run/user/*`), and shortly after, a process in that lineage emits a `uid_change` to `0`. The subcases differ only in how tightly we can tie the exec to the elevation and in whether the exploit politely confirms its own success.

#### Detecting exec and then elevating by correlating on the parent process

The most general form correlates the two events by their shared parent: a non-root, interactive exec from a writable path, followed by a `uid_change` to `0` under the same parent, within a short window.

sequence by process.parent.entity_id with maxspan=15s \[process where event.type == "start" and event.action == "exec" and user.id!= 0 and process.parent.user.id!= 0 and process.parent.group.id!= 0 and ( process.executable like ( ".\*", "/tmp/\*", "/dev/shm/\*", "/var/tmp/\*", "/run/user/\*", "/var/run/user/\*", "/home/\*/\*" ) or process.parent.executable like ( ".\*", "/tmp/\*", "/dev/shm/\*", "/var/tmp/\*", "/run/user/\*", "/var/run/user/\*", "/home/\*/\*" ) )\] \[process where event.type == "change" and event.action == "uid_change" and user.id == 0 and process.parent.user.id!= 0 and process.parent.group.id!= 0\]

It needs no recon command and no known binary, just the exec-then-elevate pair from a world-writable location, so it fires on self-elevating exploits that give nothing else away. Given that this activity is also known to fire on false positives (edge cases where benign precompiled binaries in `/tmp` or `/home` directories elevate), this rule requires slightly more tuning to fit in well with your environment. For static server environments, the rule should generally be plug and play. This maps to [Potential Privilege Escalation via a Parent Process Sequence](https://github.com/elastic/detection-rules/blob/main/rules/linux/privilege_escalation_potential_privesc_via_general_sequence_parent.toml).

#### Using descendant-of to catch root transitions several processes deep

The root transition doesn’t always land in the immediate child. When a web server or interpreter running as a service account spawns a chain that ends in an interactive root process several hops down, a direct parent/child correlation breaks. To combat this, we added another layer, using the `descendant of` functionality.

In this query, we target interactive executions where the `user.id` is 0, while the parent user is a nonsystem user (`uid >= 1000`).

process where event.type == "start" and event.action == "exec" and process.interactive == true and user.id == 0 and ( process.parent.user.id >= 1000 or process.parent.user.name in ( "apache", "www-data", "httpd", "nginx", "lighttpd", "tomcat", "tomcat8", "tomcat9", "ftp", "ftpuser", "ftpd" ) )

The interactive-root match is then followed by `descendant of` logic, where the descendant is an executable launched from a world-/user-writable location.

descendant of \[ process where event.type == "start" and event.action == "exec" and user.id!= 0 and process.executable like ( ".\*", "/tmp/\*", "/dev/shm/\*", "/var/tmp/\*", "/home/\*/\*", "/run/user/\*", "/var/run/user/\*" ) \]

Using `descendant of` instead of a fixed parent link accommodates any depth of intermediate processes, and folding in service accounts (`uid >= 1000`, or `www-data`, `nginx`, `tomcat`) covers the web-shell-to-root path that the sequence rules can miss. This maps to [Potential Local Privilege Escalation via a Suspicious Descendant Process](https://github.com/elastic/protections-artifacts/blob/4f957cd61fa2b85a2bce53b28c583e07ba020a94/behavior/rules/linux/privilege_escalation_potential_local_privilege_escalation_via_a_suspicious_descendant_process.toml).

#### Detecting the exec, elevate, and confirm sequence

When the exploit verifies its own success (the near-universal habit of running `id`, `whoami`, or `logname` right after getting root), we can require all three stages: the writable-path exec, the `uid_change` to `0`, and then the privilege check as root.

sequence with maxspan=10s \[process where event.type == "start" and event.action == "exec" and user.id!= 0 and process.executable like ( ".\*", "/tmp/\*", "/dev/shm/\*", "/var/tmp/\*", "/home/\*/\*", "/run/user/\*", "/var/run/user/\*" )\] by process.entity_id \[process where event.type == "change" and event.action == "uid_change" and user.id == 0\] by process.entity_id \[process where event.type == "start" and event.action == "exec" and process.name in ("whoami", "id", "logname") and user.id == 0\] by process.parent.entity_id

The confirm stage is what makes this the lowest-false-positive, highest-true-positive signal of the group for public PoCs, which frequently check their work, so it’s the rule to lead an investigation with. This maps to [General Privilege Escalation Sequence Detected](https://github.com/elastic/protections-artifacts/blob/main/behavior/rules/linux/privilege_escalation_general_privilege_escalation_sequence_detected.toml).

#### Detecting a Python interpreter escalating to root

A growing share of public PoCs finish with a one-line interpreter payload, and Python is the workhorse. Rather than matching an exact one-liner, we key on a `uid_change` to `0` where the responsible process is a Python interpreter running from a world-/user-writable working directory with a non-root parent.

event.category:process and event.type:change and event.action:uid_change and user.id:0 and not process.parent.user.id:0 and not process.parent.group.id:0 and process.name:python\* and process.working_directory:( /tmp\* or /var/tmp\* or /dev/shm\* or /home/\* or /run/user\* or /var/run/user\* or /var/www\* ) and process.parent.working_directory:( /tmp\* or /var/tmp\* or /dev/shm\* or /home/\* or /run/user\* or /var/run/user\* or /var/www\* ) and process.command_line:\*

As this activity is also known to hit on false positives, the [new terms rule type](https://www.elastic.co/docs/solutions/security/detect-and-alert/new-terms) was used to only alert on instances where the `process.command_line` hasn’t been seen on the host.id in the last five days.

With so many 2026 PoCs (Copy Fail, DirtyClone, CIFSwitch among them) shipped as Python, this catches the interpreter-driven finish generically, independent of the specific exploit. This maps to [Suspicious UID Change to Root via Python](https://github.com/elastic/detection-rules/blob/main/rules/linux/privilege_escalation_potential_privesc_via_python.toml) and its Elastic Defend counterpart, which is slightly more restricted in terms of logic: [Potential Privilege Escalation via Python Exploit](https://github.com/elastic/protections-artifacts/blob/4f957cd61fa2b85a2bce53b28c583e07ba020a94/behavior/rules/linux/privilege_escalation_potential_privilege_escalation_via_python_exploit.toml).

#### More exec and elevate rules for Linux privilege escalation detection

We just described the most common exec and elevate relationships. However, several LPEs don’t trigger on the parent/descendant relationship, but require keying on parent → child or process → process relationships. You can find the whole list of public detection and endpoint rules below:

-   [General Privilege Escalation Sequence Detected](https://github.com/elastic/protections-artifacts/blob/main/behavior/rules/linux/privilege_escalation_general_privilege_escalation_sequence_detected.toml)
    
-   [UID Change to 0 from Unusual Process Executable](https://github.com/elastic/protections-artifacts/blob/main/behavior/rules/linux/privilege_escalation_uid_change_to_0_from_unusual_process_executable.toml)
    
-   [UID Elevation from Previously Unknown Executable](https://github.com/elastic/detection-rules/blob/main/rules/linux/privilege_escalation_uid_elevation_from_unknown_executable.toml)
    
-   [Potential Privilege Escalation via a Parent Process Sequence](https://github.com/elastic/protections-artifacts/blob/4f957cd61fa2b85a2bce53b28c583e07ba020a94/behavior/rules/linux/privilege_escalation_potential_privilege_escalation_via_a_parent_process_sequence.toml)
    
-   [Potential Privilege Escalation via a Parent/Child Process Sequence](https://github.com/elastic/protections-artifacts/blob/4f957cd61fa2b85a2bce53b28c583e07ba020a94/behavior/rules/linux/privilege_escalation_potential_privilege_escalation_via_a_parent_child_process_sequence.toml)
    
-   [Potential Privilege Escalation via a Suspicious UID Change](https://github.com/elastic/detection-rules/blob/1eaa12aa6d2f2047a680d2260fa75e635dd4b9f6/rules/linux/privilege_escalation_potential_privesc_via_general_sequence_child.toml#L18)
    
-   [Potential Local Privilege Escalation via a Suspicious Descendant Process](https://github.com/elastic/protections-artifacts/blob/4f957cd61fa2b85a2bce53b28c583e07ba020a94/behavior/rules/linux/privilege_escalation_potential_local_privilege_escalation_via_a_suspicious_descendant_process.toml)
    
-   [Suspicious UID Change to Root via Python](https://github.com/elastic/detection-rules/blob/main/rules/linux/privilege_escalation_potential_privesc_via_python.toml)
    
-   [Potential Privilege Escalation via Python Exploit](https://github.com/elastic/protections-artifacts/blob/4f957cd61fa2b85a2bce53b28c583e07ba020a94/behavior/rules/linux/privilege_escalation_potential_privilege_escalation_via_python_exploit.toml)
    

The main difference between the detection and endpoint rule logic is the scope. Our endpoint detection and response (EDR) ruleset is generally optimized for a low false positive rate, over a high true positive rate. Because this can lead to false negatives, we “duplicate” the endpoint rule logic to detection rules with fewer to zero exclusions.

### Detecting unshare and user namespace privilege escalation

Not every escalation runs straight at a setuid binary or a kernel bug in the host context. A large family of Linux LPEs first calls `unshare(CLONE_NEWUSER)` to gain capabilities inside a new user namespace and then uses that borrowed power to reach code paths (filesystems, mounts, networking) that were never meant to take untrusted input. Because that `unshare` step is shared across CIFSwitch, pedit COW, DirtyClone, and container escapes, we detect it independently of whichever bug follows.

We detect two behavioral red flags: correlating the namespace creation to a root transition, and flagging anomalous `unshare` usage on its own.

#### Detecting unshare followed by a root transition

The high-confidence form correlates a non-root `unshare` that creates a user namespace with a `uid_change` to `0` shortly after, under the same lineage.

sequence by process.parent.entity_id with maxspan=60s \[process where event.action == "exec" and event.type == "start" and process.name == "unshare" and process.args in ("-r", "-rm", "-m", "-U", "--user") and user.id!= 0\] \[process where event.action == "uid_change" and event.type == "change" and user.id == 0 and process.parent.user.id!= 0\]

Match the namespace flags by substring rather than by exact token, so the combined short form is caught alongside the split `-U -r -m` form. This maps to [Potential Local Privilege Escalation via Unshare](https://github.com/elastic/protections-artifacts/blob/9a00306e5cccfb553949aae393a5cacfdedbda4c/behavior/rules/linux/privilege_escalation_potential_local_privilege_escalation_via_unshare.toml#L9).

The auditd variant additionally keys on the `unshare` syscall's namespace-flag argument, which is independent of how the flags were spelled on the command line.

sequence by host.id, process.parent.pid with maxspan=30s \[process where host.os.type == "linux" and ( ( auditd.data.syscall == "unshare" and auditd.data.class == "namespace" and auditd.data.a0 in ( "10000000", "50000000", "70000000", "10020000", "50020000", "70020000" ) ) or ( process.name == "unshare" and ( process.args in ("--user", "--map-root-user", "--map-current-user") or process.args like ("-\*U\*", "-\*r\*") ) ) ) and user.id!= "0" and user.id!= null\] \[process where host.os.type == "linux" and user.id == "0" and user.id!= null and ( process.name in ( "su", "sudo", "pkexec", "passwd", "chsh", "newgrp", "doas", "run0", "sg", "dash", "sh", "bash", "zsh", "fish", "ksh", "csh", "tcsh", "ash", "mksh", "busybox", "rbash", "rzsh", "rksh", "tmux", "screen", "node" ) or process.name like ("python\*", "perl\*", "ruby\*", "php\*", "lua\*") )\]

Tying the `unshare` to the subsequent `uid_change` keeps false positives low; sandboxing and container tooling call `unshare` constantly but rarely transition to root in the same lineage. This maps to [Potential Privilege Escalation via unshare Followed by Root Process](https://github.com/elastic/detection-rules/blob/3a0fda14e932ab7423fb350a2901e5c93d1db72f/rules/linux/privilege_escalation_unshare_to_root_process_auditd_sequence.toml#L24).

#### Detecting anomalous unshare usage without a root transition

Some namespace abuse is worth surfacing before any root transition, in particular, container escapes, where the goal is the host rather than `uid 0`. This form keys on `unshare` execution itself, filtered down to the parents that don’t legitimately use it.

process where host.os.type == "linux" and event.type == "start" and event.action in ("exec", "exec_event", "start", "executed") and process.name: "unshare"

The standalone unshare rule differs from the sequence rules by needing no root transition at all, which makes it a broader hunting and triage signal (and a noisier one), useful for the escape-to-host case that the correlation rules would never see. This maps to [Namespace Manipulation Using Unshare](https://github.com/elastic/detection-rules/blob/3a0fda14e932ab7423fb350a2901e5c93d1db72f/rules/linux/privilege_escalation_unshare_namespace_manipulation.toml#L10).

### GTFOBins abuse: Privilege escalation from a misconfigured SUID bit

The last category is the plain misconfiguration end of the spectrum: a binary that shouldn’t be setuid-root is, and dropping to a root shell is a one-liner straight out of [GTFOBins](https://gtfobins.github.io/). There’s no CVE or exploit chain, just a privilege that was granted and then abused.

#### Detecting known GTFOBins binaries running as root

A large, curated set of interactive-capable binaries (`find`, `gdb`, `vim`, `dd`, `nmap`, and many more) can spawn a shell or run a command, and when any of them ships setuid-root, that’s instant root. As this is a known list, we can use a large allowlist to detect this activity. We again use the ID versus real ID correlation to detect the execution of the SUID binary, in conjunction with a known SUID binary and a set of known noisy exclusions. The process listing is ordered from A-Z.

process where event.type == "start" and event.action == "exec" and ( (process.user.id == 0 and process.real_user.id!= 0) or (process.group.id == 0 and process.real_group.id!= 0) ) and process.name in ( "aa-exec", "ab", "agetty", "alpine", "ar", "arj", "arp", "as", "ascii-xfr", "ash", "aspell", "atobm", "base32", "base64", "basenc", "basez", "bc", "bridge", "busctl", "busybox", \[...\] "xdotool", "xmodmap", "xmore", "xxd", "xz", "yash", "zsh", "zsoelim" )

This is the highest-volume, best-understood class, and a maintained name list keeps it cheap to run. It maps to [Potential Privilege Escalation via SUID Binary](https://github.com/elastic/detection-rules/blob/main/rules/linux/privilege_escalation_potential_suid_sgid_exploitation.toml).

#### Detecting GTFOBins edge cases: Capabilities and copied shells

While having this one allowlisted rule catches a lot of known bad behavior, it doesn’t suffice in scenarios where a capability, such as `cap_setuid` bit, is set instead of just a `+s` bit, or when a shell is copied to another directory and run from there. To catch some of these edge cases, we have several other rules in place:

-   [Potential Privilege Escalation via SUID Binary](https://github.com/elastic/protections-artifacts/blob/main/behavior/rules/linux/privilege_escalation_potential_privilege_escalation_via_suid_binary.toml)
    
-   [Shell Privileged Mode from Non-Standard Path with Root Effective User](https://github.com/elastic/protections-artifacts/blob/main/behavior/rules/linux/privilege_escalation_shell_privileged_mode_from_non_standard_path_with_root_effective_user.toml)
    
-   [Potential Root Effective Shell from Non-Standard Path via Auditd](https://github.com/elastic/detection-rules/blob/main/rules/linux/privilege_escalation_auditd_euid_root_shell_from_non_standard_path.toml)
    
-   [Potential Privilege Escalation via Python cap_setuid](https://github.com/elastic/detection-rules/blob/main/rules/linux/privilege_escalation_suspicious_cap_setuid_python_execution.toml)
    

With this general layer in place, we’ll now take a look at some of 2026’s LPEs. For each showcased technique, we explain how it works, run and validate the detection of the public PoC, and note the rules that fire (the general-flow rules above, plus anything technique-specific).

## Testing the framework against 11 public proof-of-concept exploits

To test whether this model survives changes in implementation, we ran 11 public exploit PoCs and two SUID misconfiguration cases. The summary records the first useful signal from each run, the privileged effect the test reached, and the rules that best explain the chain.

“No distinct precursor alert” means that the run produced no alert identifying the kernel primitive before the privileged effect. It does not mean that the PoC generated no userland activity.

## Testing the framework against 13 public LPE test cases

To test whether this model survives changes in implementation, we ran 11 public exploit PoCs and two SUID misconfiguration cases. The summary records the first useful signal from each run, the privileged effect the test reached, and the rules that best explain the chain.

“No distinct precursor alert” means that the run produced no alert identifying the kernel primitive before the privileged effect. It does not mean that the PoC generated no userland activity.

## Testing the framework against 13 public LPE test cases

To test whether this model survives implementation changes, we ran 11 public exploit PoCs and two SUID misconfiguration cases. The summary records the first useful signal from each run, the privileged effect the test reached, and the rules that best explain the chain.

“No distinct precursor alert” means that the run produced no alert identifying the kernel primitive before the privileged effect. It does not mean that the PoC generated no userland activity.

### Page-cache and zero-copy corruption

#### Copy Fail: CVE-2026-31431 · AF_ALG AEAD page-cache corruption

Observed path: AF_ALG `socket()` and `splice()` burst → cached `/usr/bin/su` corrupted → `su` executes with root effective UID.

Key alerts: [Potential Copy Fail (CVE-2026-31431) Exploitation via AF_ALG Socket](https://github.com/elastic/detection-rules/blob/main/rules/linux/privilege_escalation_potential_copy_fail_cve_2026_31431_exploitation_via_af_alg_socket.toml); [Suspicious SUID/SGID Utility Execution](https://github.com/elastic/protections-artifacts/blob/main/behavior/rules/linux/privilege_escalation_suspicious_suid_sgid_utility_execution.toml).

#### DirtyFrag: CVE-2026-43284 / CVE-2026-43500 · ESP or RxRPC page-cache corruption

Observed path: No distinct primitive alert in this run → shared page-cache fragments reach in-place processing → `/bin/su` executes with root effective UID.

Key alerts: [Potential Privilege Escalation via a Parent/Child Process Sequence](https://github.com/elastic/detection-rules/blob/main/rules/linux/privilege_escalation_potential_privesc_via_general_sequence_parent_child.toml); [Suspicious SUID Binary Execution](https://github.com/elastic/detection-rules/blob/main/rules/linux/privilege_escalation_suspicious_suid_binary_execution.toml); [Suspicious SUID/SGID Utility Execution](https://github.com/elastic/protections-artifacts/blob/main/behavior/rules/linux/privilege_escalation_suspicious_suid_sgid_utility_execution.toml).

#### Fragnesia skb_segment() variant: related to CVE-2026-46300 · GRO/GSO fragment-marker loss

Observed path: Local compilation and network activity → `skb_segment()` loses the shared-fragment marker → ESP-in-TCP modifies cached `/usr/bin/su` and the corrupted image executes.

Key alerts: [Potential Privilege Escalation via Recently Compiled Executable](https://github.com/elastic/detection-rules/blob/main/rules/linux/privilege_escalation_uid_change_post_compilation.toml); [Network Connection via Recently Compiled Executable](https://github.com/elastic/detection-rules/blob/main/rules/linux/execution_network_event_post_compilation.toml); [UID Elevation from Previously Unknown Executable](https://github.com/elastic/detection-rules/blob/main/rules/linux/privilege_escalation_uid_elevation_from_unknown_executable.toml).

#### DirtyDecrypt / DirtyCBC: CVE-2026-31635 · RxGK in-place decryption

Observed path: Local compilation; PoC creates user and network namespaces internally → AF_RXRPC and `splice()` place file-backed pages in the decrypt path → `/usr/bin/su` produces the privileged shell in this test.

Key alerts: [General Privilege Escalation Sequence Detected](https://github.com/elastic/protections-artifacts/blob/main/behavior/rules/linux/privilege_escalation_general_privilege_escalation_sequence_detected.toml); [Potential Privilege Escalation via Recently Compiled Executable](https://github.com/elastic/detection-rules/blob/main/rules/linux/privilege_escalation_uid_change_post_compilation.toml); [Potential Privilege Escalation via SUID/SGID Proxy Execution](https://github.com/elastic/detection-rules/blob/main/rules/linux/privilege_escalation_potential_suid_sgid_proxy_execution.toml).

#### pedit COW: CVE-2026-46331 · tc act_pedit partial COW

Observed path: PoC calls `unshare()` internally and configures `act_pedit` through Netlink → write extends beyond the copied region → cached `su` entry point is replaced and execution yields a root shell.

Key alerts: [UID Elevation from Previously Unknown Executable](https://github.com/elastic/detection-rules/blob/main/rules/linux/privilege_escalation_uid_elevation_from_unknown_executable.toml); [Potential Privilege Escalation via a Suspicious UID Change](https://github.com/elastic/detection-rules/blob/main/rules/linux/privilege_escalation_potential_privesc_via_general_sequence_child.toml); [Potential Privilege Escalation via SUID/SGID Proxy Execution](https://github.com/elastic/detection-rules/blob/main/rules/linux/privilege_escalation_potential_suid_sgid_proxy_execution.toml).

#### DirtyClone Python port: CVE-2026-43503 · TEE clone and ESP page-cache corruption

Observed path: Python PoC executes from a user-controlled directory → cloned socket buffer loses `SKBFL_SHARED_FRAG` → Python `uid_change` to 0 observed.

Key alerts: [Potential Privilege Escalation via Python Exploit](https://github.com/elastic/protections-artifacts/blob/4f957cd61fa2b85a2bce53b28c583e07ba020a94/behavior/rules/linux/privilege_escalation_potential_privilege_escalation_via_python_exploit.toml); public SIEM counterpart: [Suspicious UID Change to Root via Python](https://github.com/elastic/detection-rules/blob/main/rules/linux/privilege_escalation_potential_privesc_via_python.toml).

For DirtyClone, confirm whether the observed `uid_change` represented host root or namespace-mapped root before describing it as completed host escalation.

### Namespace and trusted-helper exploitation

#### CIFSwitch:CVE-2026-46243 · CIFS origin validation and trusted helper

Observed path: `unshare` creates a hostile mount namespace → forged `cifs.spnego` request launches root-owned `cifs.upcall` → helper loads attacker-controlled NSS code and writes a sudoers rule.

Key alerts: [Namespace Manipulation Using Unshare](https://github.com/elastic/detection-rules/blob/main/rules/linux/privilege_escalation_unshare_namespace_manipulation.toml); [Suspicious Path Mounted](https://github.com/elastic/detection-rules/blob/main/rules/linux/defense_evasion_suspicious_path_mounted.toml); [Sudoers File Activity](https://github.com/elastic/detection-rules/blob/main/rules/cross-platform/privilege_escalation_sudoers_file_mod.toml).

#### OVSwrap:CVE-2026-64531 · OVS nested Netlink length truncation

Observed path: `unshare -Urn` provides namespace-local `CAP_NET_ADMIN` → wrapped `nla_len` enables kernel read and decrement primitives → host writer creates a passwordless sudo rule and launches `sudo -n bash`.

Key alerts: [Namespace Manipulation Using Unshare](https://github.com/elastic/detection-rules/blob/main/rules/linux/privilege_escalation_unshare_namespace_manipulation.toml); [Passwordless Sudo Probing](https://github.com/elastic/detection-rules/blob/main/rules/linux/discovery_passwordless_sudo_probing.toml); [Suspicious UID Change to Root via Python](https://github.com/elastic/detection-rules/blob/main/rules/linux/privilege_escalation_potential_privesc_via_python.toml).

#### Ptrace_may_dream: CVE-2026-46333 · Exit-time FD theft and AccountsService abuse

Observed path: `busctl --system call` triggers AccountsService activity → `pidfd_getfd()` race duplicates a root-authenticated D-Bus socket → account shell, password, and administrator status are changed before `su` / `sudo` yields root.

Key alerts: [Potential Privilege Escalation via Busctl System Call](https://github.com/elastic/protections-artifacts/blob/main/behavior/rules/linux/privilege_escalation_potential_privilege_escalation_via_busctl_system_call.toml); [File Creation in World-Writable Directory by Unusual Process](https://github.com/elastic/detection-rules/blob/main/rules/linux/defense_evasion_file_creation_world_writeable_dir_by_unusual_process.toml).

### Privileged file-descriptor theft

#### Ssh-keysign-pwn:CVE-2026-46333 · Exit-time FD theft

Observed path: Recently compiled PoC repeatedly starts SUID-root `ssh-keysign` → races `pidfd_getfd()` during process exit → duplicates and reads one SSH host private-key descriptor; no root shell.

Key alerts: [Suspicious SUID Binary Execution](https://github.com/elastic/detection-rules/blob/main/rules/linux/privilege_escalation_suspicious_suid_binary_execution.toml); [Potential Privilege Escalation via a Parent/Child Process Sequence](https://github.com/elastic/detection-rules/blob/main/rules/linux/privilege_escalation_potential_privesc_via_general_sequence_parent_child.toml); [Potential Privilege Escalation via Recently Compiled Executable](https://github.com/elastic/detection-rules/blob/main/rules/linux/privilege_escalation_uid_change_post_compilation.toml).

#### Chage_pwn:CVE-2026-46333 · Exit-time FD theft

Observed path: PoC repeatedly starts `chage -l` → races `pidfd_getfd()` after privilege drop → duplicates the open `/etc/shadow` descriptor and reads the file; no root shell.

Key alerts: [Potential Shadow Read via Unprivileged User](https://github.com/elastic/protections-artifacts/blob/4f957cd61fa2b85a2bce53b28c583e07ba020a94/behavior/rules/linux/privilege_escalation_potential_shadow_read_via_unprivileged_user.toml).

### SUID misconfiguration

#### SUID find -exec: No CVE · SUID misconfiguration

Observed path: Root-owned SUID `find` executes `/bin/sh -p` through `-exec` → shell retains root effective UID.

Key alert: [Privilege Escalation via SUID/SGID](https://github.com/elastic/detection-rules/blob/main/rules/linux/privilege_escalation_potential_suid_sgid_exploitation.toml).

#### Privileged Bash with -p: No CVE · SUID misconfiguration

Observed path: System Bash is copied to a non-standard path and configured SUID-root → `bash -p` preserves the elevated effective UID → root-capable shell.

Key alerts: [System Binary Copied or Moved](https://github.com/elastic/protections-artifacts/blob/main/behavior/rules/linux/defense_evasion_system_binary_copied_or_moved.toml); [Shell Privileged Mode from Non-Standard Path with Root Effective User](https://github.com/elastic/protections-artifacts/blob/main/behavior/rules/linux/privilege_escalation_shell_privileged_mode_from_non_standard_path_with_root_effective_user.toml).

With the general layer in place, the public PoCs become a validation set. We don’t need every exploit to look the same. We need the alerts to tell the same story: an unprivileged process prepares the ground and crosses a trust boundary, and then a root process appears.

Sometimes the earliest signal is a kernel primitive, such as `AF_ALG` plus `splice()`, and other times it’s namespace setup with `unshare`. Sometimes the trigger is quiet, and the only clean signal is the finish: a SUID helper, a Python process, or a shell suddenly running with effective uid 0. That’s the point of layering. Each PoC enters through a different door, but the investigation keeps folding back into the same model: precursor, root transition, and privileged execution.

## Kernel page-cache and zero-copy corruption: The Copy Fail bug class

The page-cache corruption variants are the clearest example of why per-CVE detection is too narrow. Linux uses zero-copy paths, such as `splice()` and `sendfile()`, to move file-backed page-cache pages through kernel subsystems without copying them. When one of those subsystems writes in place without first honoring copy-on-write, an unprivileged user can corrupt the in-memory image of a privileged file. The file on disk may remain clean, but the cached version of `/usr/bin/su`, `/bin/su`, or another privileged target is no longer the version that the system administrator expects.

The lineage runs from DirtyCOW and Dirty Pipe into the 2026 wave: Copy Fail, DirtyFrag, DirtyClone, Fragnesia, pedit COW, and related variants. The interfaces differ, but the defender’s problem is the same. We want to catch the primitive where it’s stable, and we want to catch the privileged outcome when the primitive isn’t visible enough.

### Copy Fail (CVE-2026-31431)

Copy Fail is the cleanest place to start because it gives us both sides of the story. The public PoC chains an `AF_ALG` socket with `splice()` to land a controlled write into a page-cache page and then uses that corruption against a privileged file. Public technical write-ups describe the vulnerable path as the `authencesn` AEAD implementation mishandling input manipulated through `splice()`, producing page-cache corruption through the crypto API.

In Kibana, this gives us a rare luxury: detection of the primitive and of the finish. The auditd layer can catch the non-root process producing a burst of `socket(AF_ALG)` calls interleaved with `splice()`, while Elastic Defend catches the behavioral outcome when the corrupted privileged file is executed.

![Kibana alerts for Copy Fail CVE-2026-31431: AF\_ALG socket exploitation plus SUID/SGID privilege escalation](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a294da7640effa57.png)

The screenshot shows the expected mix: [Potential Copy Fail (CVE-2026-31431) Exploitation via AF_ALG Socket](https://github.com/elastic/detection-rules/blob/1eaa12aa6d2f2047a680d2260fa75e635dd4b9f6/rules/linux/privilege_escalation_potential_copy_fail_cve_2026_31431_exploitation_via_af_alg_socket.toml#L26) alongside multiple SUID/SGID detections spread across security information and event management (SIEM) and EDR, where [Suspicious SUID/SGID Utility Execution](https://github.com/elastic/protections-artifacts/blob/dfd6970f99043ceae15286689eff6d243630a04b/behavior/rules/linux/privilege_escalation_suspicious_suid_sgid_utility_execution.toml#L8) is the main EDR rule that fires when `su` runs with elevated effective privileges. This is the ideal case for layered detection; the kernel-specific signal tells us which exploit family we’re probably looking at, and the general-flow rules confirm that the host actually crossed into root.

### DirtyFrag (CVE-2026-43284)

DirtyFrag is a useful counterexample. It reaches the same page-cache corruption outcome, but it doesn’t look like Copy Fail on the wire. Public research describes DirtyFrag as chaining the `xfrm-ESP Page-Cache Write` issue (CVE-2026-43284), with the `RxRPC Page-Cache Write` issue (CVE-2026-43500). The common failure is that shared socket-buffer fragments can reach in-place writers without the kernel first forcing a safe copy.

That changes the detection story. We shouldn’t expect the `AF_ALG` rule to fire, because this is no longer the Copy Fail primitive. What remains stable is the finish. In the lab run, the exploit process drives the corruption, and then `/bin/su` appears with root effective privileges, while the real user remains non-root.

![Kibana alerts for DirtyFrag CVE-2026-43284 showing /bin/su run as root by the ./exp exploit process](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/cc0155d9ebdee896.png)

The screenshot shows the general layer doing the work: [Suspicious SUID Binary Execution](https://github.com/elastic/detection-rules/blob/1eaa12aa6d2f2047a680d2260fa75e635dd4b9f6/rules/linux/privilege_escalation_suspicious_suid_binary_execution.toml#L25), [Potential Privilege Escalation via a Parent/Child Process Sequence](https://github.com/elastic/detection-rules/blob/1eaa12aa6d2f2047a680d2260fa75e635dd4b9f6/rules/linux/privilege_escalation_potential_privesc_via_general_sequence_parent_child.toml#L10), and the Elastic Defend [Suspicious SUID/SGID Utility Execution](https://github.com/elastic/protections-artifacts/blob/dfd6970f99043ceae15286689eff6d243630a04b/behavior/rules/linux/privilege_escalation_suspicious_suid_sgid_utility_execution.toml#L8) alert. The trigger changed, but the host still had to execute a privileged binary in a suspicious lineage.

The full auditd configuration and queries for the AF_ALG and DirtyFrag primitive coverage are in the [Copy Fail and DirtyFrag research](https://www.elastic.co/security-labs/copy-fail-dirtyfrag-linux-page-bugs-in-the-wild). The next variants keep the same page-cache finish but move the trigger into different kernel interfaces.

### Fragnesia (CVE-2026-46300)

Fragnesia is close enough to DirtyFrag that it belongs right next to it, but it adds a useful detection angle because the public PoC leaves more endpoint exhaust. The PoC targets `skb_segment()` in `net/core/skbuff.c`. During Generic Segmentation Offload (GSO) segmentation, `skb_segment()` propagates `SKBFL_SHARED_FRAG` from the head skb but not from a `frag_list` member that carries page-cache-backed fragments. Once that marker is lost, the resulting skbs can pass the ESP `skip_cow` guard and be decrypted in place over page-cache pages. The trigger is networking-heavy, namespaces, veth pairs, `send()`, `splice()`, Generic Receive Offload (GRO) coalescing, GSO segmentation, and an ESP-in-TCP receiver, but the primitive is the same shape we keep seeing: a controlled page-cache write that’s iterated until a SUID binary is corrupted and a root shell appears.

![Fragnesia CVE-2026-46300 alerts: recently compiled skb\_segment\_exploit, network connection and SUID/SGID](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/297d8b26ae32f132.png)

In Kibana, this one is louder than DirtyClone and more endpoint-friendly than a pure syscall primitive. The screenshot shows `./skb_segment_exploit` driving the setup, followed by `/usr/bin/su` as the privileged finish. The alerts line up with that story. Two unique rules that triggered are related to the compilation of this exploit on the host, right before execution, and the fact that this exploit makes local network connections:

-   [Potential Privilege Escalation via Recently Compiled Executable](https://github.com/elastic/detection-rules/blob/1eaa12aa6d2f2047a680d2260fa75e635dd4b9f6/rules/linux/privilege_escalation_uid_change_post_compilation.toml#L18)
    
-   [Network Connection via Recently Compiled Executable](https://github.com/elastic/detection-rules/blob/1eaa12aa6d2f2047a680d2260fa75e635dd4b9f6/rules/linux/execution_network_event_post_compilation.toml#L18)
    

This is followed by similar SIEM and EDR rules triggering on the general LPE process:

-   [UID Elevation from Previously Unknown Executable](https://github.com/elastic/detection-rules/blob/1eaa12aa6d2f2047a680d2260fa75e635dd4b9f6/rules/linux/privilege_escalation_uid_elevation_from_unknown_executable.toml#L18)
    
-   [Potential Privilege Escalation via SUID/SGID Proxy Execution](https://github.com/elastic/detection-rules/blob/1eaa12aa6d2f2047a680d2260fa75e635dd4b9f6/rules/linux/privilege_escalation_potential_suid_sgid_proxy_execution.toml#L10) (EDR and SIEM)
    
-   [Privilege Escalation via SUID/SGID](https://github.com/elastic/detection-rules/blob/1eaa12aa6d2f2047a680d2260fa75e635dd4b9f6/rules/linux/privilege_escalation_potential_suid_sgid_exploitation.toml#L20)
    
-   [Potential Privilege Escalation via a Suspicious UID Change](https://github.com/elastic/detection-rules/blob/1eaa12aa6d2f2047a680d2260fa75e635dd4b9f6/rules/linux/privilege_escalation_potential_privesc_via_general_sequence_child.toml#L18)
    
-   [Potential Privilege Escalation via a Parent Process Sequence](https://github.com/elastic/detection-rules/blob/1eaa12aa6d2f2047a680d2260fa75e635dd4b9f6/rules/linux/privilege_escalation_potential_privesc_via_general_sequence_parent.toml#L10)
    
-   [File Creation in World-Writable Directory by Unusual Process](https://github.com/elastic/detection-rules/blob/1eaa12aa6d2f2047a680d2260fa75e635dd4b9f6/rules/linux/defense_evasion_file_creation_world_writeable_dir_by_unusual_process.toml#L23)
    

That’s the right detection outcome for this variant. We don’t need a narrow rule named after `skb_segment()` to get useful coverage. The kernel trigger is specialized and timing-sensitive, but the exploit still has to stage from a user-controlled context, exercise an unusual local networking path, corrupt a privileged target, and pivot through a SUID helper. The general-flow rules capture the root transition, while the recently compiled executable, world-writable file, network, and SUID/SGID alerts provide the analyst with sufficient context to recognize the Fragnesia-style path.

### DirtyDecrypt / DirtyCBC (CVE-2026-31635)

DirtyDecrypt, also called DirtyCBC by the PoC authors, is another Copy Fail–style page-cache write, but the abused interface moves into RxRPC. The repository describes it as an `rxgk` page-cache write caused by a missing copy-on-write guard in `rxgk_decrypt_skb()`. The PoC comments spell out the failure mode: `rxgk_decrypt_skb()` builds an skb scatterlist and calls into Kerberos decryption without first forcing a safe copy, while the `krb5enc` AEAD template decrypts in place before the HMAC check. When the skb fragments are backed by page-cache pages, the failed decrypt still corrupts the cached file data.

In practice, this looks like a sibling of DirtyFrag rather than of Copy Fail. There’s no `AF_ALG` burst to lean on. The PoC sets up user and network namespaces, drives the RxRPC path over loopback, splices file-backed pages into the packet path, and repeatedly fires the decrypt primitive until the target bytes land. The checked PoC then targets a readable SUID-root binary, such as `/usr/bin/su`, backs it up under `/tmp`, corrupts the in-memory image with a tiny `setuid(0)` plus `/bin/sh` payload, and executes the target.

![DirtyDecrypt CVE-2026-31635 alerts: ./dirtydecrypt escalating to /usr/bin/su via SUID/SGID proxy execution](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/288d1060290f94b3.png)

The screenshot shows the same layered outcome that we’ve seen across the page-cache family. The exploit process is `./dirtydecrypt`, launched from a user-controlled working directory, and the privileged finish is `/usr/bin/su`. Coverage comes from the general-flow and SUID layers:

-   [General Privilege Escalation Sequence Detected](https://github.com/elastic/protections-artifacts/blob/dfd6970f99043ceae15286689eff6d243630a04b/behavior/rules/linux/privilege_escalation_general_privilege_escalation_sequence_detected.toml#L9)
    
-   [Potential Privilege Escalation via SUID/SGID Proxy Execution](https://github.com/elastic/protections-artifacts/blob/dfd6970f99043ceae15286689eff6d243630a04b/behavior/rules/linux/privilege_escalation_potential_privilege_escalation_via_suid_sgid_proxy_execution.toml#L4) (EDR and SIEM)
    
-   [Potential Privilege Escalation via Recently Compiled Executable](https://github.com/elastic/detection-rules/blob/1eaa12aa6d2f2047a680d2260fa75e635dd4b9f6/rules/linux/privilege_escalation_uid_change_post_compilation.toml#L18)
    
-   [File Creation in World-Writable Directory by Unusual Process](https://github.com/elastic/detection-rules/blob/1eaa12aa6d2f2047a680d2260fa75e635dd4b9f6/rules/linux/defense_evasion_file_creation_world_writeable_dir_by_unusual_process.toml#L23)
    
-   [Potential Privilege Escalation via a Suspicious UID Change](https://github.com/elastic/detection-rules/blob/1eaa12aa6d2f2047a680d2260fa75e635dd4b9f6/rules/linux/privilege_escalation_potential_privesc_via_general_sequence_child.toml#L18)
    
-   [Potential Privilege Escalation via a Parent Process Sequence](https://github.com/elastic/detection-rules/blob/1eaa12aa6d2f2047a680d2260fa75e635dd4b9f6/rules/linux/privilege_escalation_potential_privesc_via_general_sequence_parent.toml#L10)
    
-   [UID Elevation from Previously Unknown Executable](https://github.com/elastic/detection-rules/blob/1eaa12aa6d2f2047a680d2260fa75e635dd4b9f6/rules/linux/privilege_escalation_uid_elevation_from_unknown_executable.toml#L18)
    
-   [Privilege Escalation via SUID/SGID](https://github.com/elastic/detection-rules/blob/1eaa12aa6d2f2047a680d2260fa75e635dd4b9f6/rules/linux/privilege_escalation_potential_suid_sgid_exploitation.toml#L20)
    

DirtyDecrypt moves the primitive into RxRPC and Kerberos-style in-place decrypt, but the endpoint story is still familiar: a recently compiled local PoC stages from a writable path, corrupts a privileged file-backed page, and pivots through a SUID helper.

### pedit COW (CVE-2026-46331)

pedit COW moves the same failure mode into traffic control. Instead of crypto sockets or ESP/RxRPC paths, the abused interface is the `tc` packet-editing action, `act_pedit`. The kernel computes a copy-on-write range before the edit loop, but that calculation can miss the runtime offset used by typed keys, leaving part of the write region outside the copied area. The result is another page-cache corruption path. NVD describes the issue as `net/sched: fix pedit partial COW leading to page cache corruption`, where `tcf_pedit_act()` computes the COW range once before the key loop and can leave part of the write region un-COW’d.

pedit COW looks nothing like Copy Fail in telemetry. There’s no `AF_ALG` burst. The PoC needs the traffic-control path and typically begins by obtaining namespace-local networking capability, such as `CAP_NET_ADMIN`, through `unshare`. From the detection side, that means we lean on the namespace precursor and the root outcome.

![pedit COW CVE-2026-46331 alerts: ./packet\_edit\_meme UID elevation and SUID/SGID proxy execution to /bin/su](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/aa91efa0302b5233.png)

The screenshot shows this clearly. Some of the interesting alerts are the broader signals: [file creation in a world-writable directory](https://github.com/elastic/detection-rules/blob/1eaa12aa6d2f2047a680d2260fa75e635dd4b9f6/rules/linux/defense_evasion_file_creation_world_writeable_dir_by_unusual_process.toml), [UID elevation from a previously unknown executable](https://github.com/elastic/detection-rules/blob/1eaa12aa6d2f2047a680d2260fa75e635dd4b9f6/rules/linux/privilege_escalation_uid_elevation_from_unknown_executable.toml), [suspicious UID change](https://github.com/elastic/detection-rules/blob/1eaa12aa6d2f2047a680d2260fa75e635dd4b9f6/rules/linux/privilege_escalation_potential_privesc_via_general_sequence_child.toml#L18), [parent-process escalation](https://github.com/elastic/detection-rules/blob/1eaa12aa6d2f2047a680d2260fa75e635dd4b9f6/rules/linux/privilege_escalation_potential_privesc_via_general_sequence_parent.toml), and [SUID/SGID proxy execution](https://github.com/elastic/protections-artifacts/blob/dfd6970f99043ceae15286689eff6d243630a04b/behavior/rules/linux/privilege_escalation_potential_privilege_escalation_via_suid_sgid_proxy_execution.toml). There’s currently no per-CVE `tc` rule, but the layered model still catches the behavior that matters: a user-controlled process sets up the path, corrupts the privileged image, and pivots into root execution.

### DirtyClone (CVE-2026-43503)

DirtyClone is the quietest of the page-cache examples in the endpoint view. The bug sits in the Linux networking stack, where socket-buffer fragment transfer helpers fail to preserve the `SKBFL_SHARED_FRAG` marker. When that marker is lost, later in-place writers can treat shared, file-backed memory as private and write into page-cache-backed data. NVD describes CVE-2026-43503 as missing propagation of `SKBFL_SHARED_FRAG` through helpers such as `__pskb_copy_fclone()` and `skb_shift()`, which can let an unprivileged user write into the page cache of a root-owned read-only file through later in-place writers.

In our run, the public PoC doesn’t give us a loud, stable userland primitive to key on. It’s Python-driven, runs from a user-controlled working directory, and crosses into root. That makes it a perfect test for the general-flow layer.

![DirtyClone CVE-2026-43503 detected by a single alert: Potential Privilege Escalation via Python Exploit](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1d1e147a69c2f03e.png)

The screenshot shows one alert: [Potential Privilege Escalation via Python Exploit](https://github.com/elastic/protections-artifacts/blob/4f957cd61fa2b85a2bce53b28c583e07ba020a94/behavior/rules/linux/privilege_escalation_potential_privilege_escalation_via_python_exploit.toml). That may look sparse compared to Copy Fail, but it’s an important result. It means that the framework still produced a signal when the implementation didn’t expose a useful per-CVE tell. We can enrich later if a stable syscall or interface pattern emerges, but we don’t need to wait for that to detect the root transition.

Taken together, the page-cache examples show the full range. Copy Fail gives us primitive-plus-outcome. DirtyFrag and Fragnesia show the same corruption model moving through networking paths, where SKB fragment handling, zero-copy, and in-place ESP processing do the damage. pedit COW moves the idea into traffic control. DirtyClone shows why the outcome layer has to stand on its own when the kernel trigger is quiet.

## Exploits that start with unshare: CIFSwitch and OVSwrap

The next set of PoCs looks different because the attacker first changes the privilege context around the process. A large family of Linux LPEs begins with `unshare(CLONE_NEWUSER)`, which gives an ordinary user capabilities inside a new namespace. Those namespace-local capabilities open kernel code paths in networking, filesystems, and mounts that weren’t designed with untrusted local users in mind.

This is also where kernel bugs and userspace helpers start to blur together. Some exploits use `unshare` to reach a kernel primitive. Others use it to build a hostile filesystem or mount namespace and then trick a privileged helper into trusting what it sees. For detection, `unshare` is valuable because it happens early and repeats across otherwise unrelated techniques.

### CIFSwitch (CVE-2026-46243)

CIFSwitch is a trusted-helper bug reached through the kernel. The PoC abuses a missing validation in the `cifs.spnego` key type: an attacker calls `request_key()` with a forged key description, causing the kernel to invoke the root-owned `cifs.upcall` helper with attacker-controlled fields. With `upcall_target=app`, the helper enters the attacker's mount namespace and performs a `getpwuid()` lookup before dropping privileges: loading an attacker-controlled Network Security Services (NSS) library and executing code as root.

The important part is the handoff. The exploit starts with `unshare` to build the hostile namespace and then relies on a privileged helper to finish the escalation. That gives us several detection opportunities before and during the root transition.

![CIFSwitch CVE-2026-46243 alerts: unshare namespace manipulation, suspicious mount and sudoers file activity](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/70479f132d5f6b27.png)

The screenshot shows the expected spread:

-   [Potential Privilege Escalation via a Parent Process Sequence](https://github.com/elastic/detection-rules/blob/1eaa12aa6d2f2047a680d2260fa75e635dd4b9f6/rules/linux/privilege_escalation_potential_privesc_via_general_sequence_parent.toml#L10)
    
-   [Namespace Manipulation Using Unshare](https://github.com/elastic/detection-rules/blob/main/rules/linux/privilege_escalation_unshare_namespace_manipulation.toml)
    
-   [Sudoers File Activity](https://github.com/elastic/detection-rules/blob/1eaa12aa6d2f2047a680d2260fa75e635dd4b9f6/rules/cross-platform/privilege_escalation_sudoers_file_mod.toml#L17)
    
-   [Potential Privilege Escalation via Python Exploit](https://github.com/elastic/protections-artifacts/blob/4f957cd61fa2b85a2bce53b28c583e07ba020a94/behavior/rules/linux/privilege_escalation_potential_privilege_escalation_via_python_exploit.toml)
    
-   [Potential Privilege Escalation via unshare and UID Change](https://github.com/elastic/detection-rules/blob/main/rules/linux/privilege_escalation_overlayfs_local_privesc.toml)
    
-   [Suspicious Path Mounted](https://github.com/elastic/detection-rules/blob/main/rules/linux/defense_evasion_suspicious_path_mounted.toml)
    
-   [Potential Local Privilege Escalation via Unshare](https://github.com/elastic/protections-artifacts/blob/main/behavior/rules/linux/privilege_escalation_potential_local_privilege_escalation_via_unshare.toml)
    

That’s the right shape for this technique. We aren’t depending on a rule named after CIFSwitch. We’re catching the setup, the suspicious namespace behavior, the mount activity, and the root transition. If the helper changes, the early namespace signal and the general escalation rules still give us coverage.

### OVSwrap (CVE-2026-64531)

OVSwrap is a good example of the other side of namespace-based privilege escalation. Unlike CIFSwitch, where the namespace is used to construct an environment that a privileged userspace helper later trusts, OVSwrap uses a private user and network namespace to reach a vulnerable kernel interface directly. An ordinary user can run `unshare -Urn`, gain `CAP_NET_ADMIN` over the newly created network namespace, and create a private Open vSwitch (OVS) datapath without needing host-level `CAP_NET_ADMIN`.

The vulnerability is in the kernel's OVS action handling. OVS accepts nested Netlink actions from userspace and expands them into an internal action stream, but the `nla_len` field describing an individual Netlink attribute is only 16 bits wide. Before the fix, a generated nested action could grow beyond 65,535 bytes without being rejected. The stored length would wrap, causing later OVS parsing to resume from attacker-controlled data inside the generated action stream. The public PoC uses this to construct kernel read and targeted decrement primitives, locate a host-side process and its credentials, and modify its `fsuid` and `fsgid` until the process can write as root.

The endpoint story is particularly useful for detection because the kernel primitive itself is complex, but the setup and finish are not. The PoC is Python-driven and creates a private namespace with `unshare`; after corrupting the host-side writer's credentials, it writes a passwordless sudo rule and executes `sudo -n bash`.

![OVSwrap CVE-2026-64531 alerts: unshare namespace manipulation, Python exploit and passwordless sudo probing](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c0b7ef3a2b078162.png)

In the lab run, this produced the following alerts:

-   [Potential Privilege Escalation via Python Exploit](https://github.com/elastic/protections-artifacts/blob/4f957cd61fa2b85a2bce53b28c583e07ba020a94/behavior/rules/linux/privilege_escalation_potential_privilege_escalation_via_python_exploit.toml)
    
-   [Namespace Manipulation Using Unshare](https://github.com/elastic/detection-rules/blob/a9208f465f486bf87dd614c463eb5e790d559a52/rules/linux/privilege_escalation_unshare_namespace_manipulation.toml)
    
-   [Passwordless Sudo Probing](https://github.com/elastic/detection-rules/blob/a9208f465f486bf87dd614c463eb5e790d559a52/rules/linux/discovery_passwordless_sudo_probing.toml)
    
-   [Suspicious UID Change to Root via Python](https://github.com/elastic/detection-rules/blob/main/rules/linux/privilege_escalation_potential_privesc_via_python.toml)
    
-   [Potential Shadow File Read via Command Line Utilities](https://github.com/elastic/detection-rules/blob/a9208f465f486bf87dd614c463eb5e790d559a52/rules/linux/privilege_escalation_shadow_file_read.toml) (manual validation activity)
    

This is exactly the kind of exploit where the layered approach pays off. We don’t need an endpoint rule that understands malformed OVS `CLONE` actions, conntrack expansion, forged tunnel metadata, or the kernel decrement primitive. Instead, we see the stable behavior around it: a Python PoC enters a new namespace, `unshare` exposes a privileged kernel networking path, the process crosses from an ordinary user context into host-root capabilities, and the exploit finishes through passwordless `sudo`.

OVSwrap therefore complements CIFSwitch nicely. Both begin with an unprivileged user creating namespaces, but what happens next is very different: CIFSwitch hands control to a privileged helper, while OVSwrap attacks the kernel's OVS datapath and directly corrupts host credentials. The implementation changes; the namespace precursor and root-transition layer remain useful.

## Privileged D-Bus and policy helpers

Not every helper-based LPE starts with a namespace. Some go straight at the services that grant controlled root access: `sudo`, `polkit` / `pkexec`, and privileged services reachable over D-Bus. These components are heavily used and well-audited, but they sit directly on the privilege boundary. One logic slip can turn a normal user request into root execution.

The upside for defenders is that the actors are named. We can key on specific binaries, services, and command-line shapes, in addition to the general root-transition layer.

### ptrace_may_dream (busctl abuse)

`ptrace_may_dream` is a good example of a helper path that’s precise in telemetry. The technique talks to a privileged D-Bus system service directly with `busctl`. The escalation is driven by an unprivileged user invoking `busctl --system call` against a service that then performs a privileged action on the user’s behalf.

Because the tell is specific and rarely legitimate in normal workstation or server activity, detection can be tight.

![ptrace\_may\_dream alerts: six busctl system call privilege escalation detections on a CentOS Stream 9 host](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7620bdf0fea30a10.png)

The screenshot shows repeated [Potential Privilege Escalation via Busctl System Call](https://github.com/elastic/protections-artifacts/blob/dfd6970f99043ceae15286689eff6d243630a04b/behavior/rules/linux/privilege_escalation_potential_privilege_escalation_via_busctl_system_call.toml#L9) alerts, plus [File Creation in a World-Writable Directory by Unusual Process](https://github.com/elastic/detection-rules/blob/1eaa12aa6d2f2047a680d2260fa75e635dd4b9f6/rules/linux/defense_evasion_file_creation_world_writeable_dir_by_unusual_process.toml#L23). That’s a different detection shape from the page-cache examples, but the same investigation logic applies: suspicious precursor, privileged service interaction, and a path toward root-controlled behavior.

## Privileged file-descriptor theft from trusted helpers

The previous examples all end in something easy to recognize: a process becomes root, a privileged service acts, or a SUID binary hands the user a shell. This pattern is slightly different. The attacker doesn’t need the helper to execute a command. They need it to open something privileged, drop credentials, and die slowly enough that the file descriptor can be stolen.

That’s the core of CVE-2026-46333. The bug sits in the kernel’s `__ptrace_may_access()` path. During process exit, there’s a short window when a task has already dropped its memory image but still has open file descriptors. Paired with `pidfd_getfd()`, that window lets an unprivileged process duplicate descriptors from a dying privileged process when the credential checks line up. Qualys described the impact as both credential disclosure and root-code-execution potential, with case studies against `chage`, `ssh-keysign`, `pkexec`, and `accounts-daemon`.

For defenders, this is an important variation on the normal LPE flow. A successful exploit may never create an obvious root shell. Instead, root-only material leaves the boundary: SSH host private keys, `/etc/shadow`, or an authenticated privileged IPC connection. The detection strategy, therefore, has to widen slightly. We still care about suspicious SUID/SGID execution and parent-child escalation, but we also care about non-root processes entering sensitive group context, especially from user-writable or freshly compiled paths.

### ssh-keysign-pwn (CVE-2026-46333)

`ssh-keysign-pwn` targets OpenSSH’s `ssh-keysign` helper. The helper is interesting because it opens SSH host private keys before dropping privileges. The public PoC repeatedly spawns `ssh-keysign`, opens a pidfd for the child, races `pidfd_getfd()` across likely file descriptors, and checks whether any duplicated descriptor points to an `ssh_host_*_key` file. The repository describes the target directly: `sshkeysign_pwn` pulls SSH host private keys, while `chage_pwn` pulls `/etc/shadow`.

![ssh-keysign-pwn CVE-2026-46333 alerts: ssh-keysign run as root by a recently compiled ./sshkeysign\_pwn](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1de67e609171b4c7.png)

In the screenshot, the parent process is the user-controlled `./sshkeysign_pwn` binary, and the privileged child is `/usr/lib/openssh/ssh-keysign`. The privilege shape is exactly what the SUID/SGID layer is built for: `ssh-keysign` runs with `user.id:0`, while the real user remains `1000`, and the parent is a recently compiled executable in the user’s working directory. This results in the following rules triggering:

-   [Suspicious SUID Binary Execution](https://github.com/elastic/detection-rules/blob/a9208f465f486bf87dd614c463eb5e790d559a52/rules/linux/privilege_escalation_suspicious_suid_binary_execution.toml)
    
-   [Potential Privilege Escalation via SUID/SGID](https://github.com/elastic/detection-rules/blob/a9208f465f486bf87dd614c463eb5e790d559a52/rules/linux/privilege_escalation_potential_suid_lpe_via_process_args.toml)
    
-   [Potential Privilege Escalation via a Parent/Child Process Sequence](https://github.com/elastic/detection-rules/blob/a9208f465f486bf87dd614c463eb5e790d559a52/rules/linux/privilege_escalation_potential_privesc_via_general_sequence_parent_child.toml)
    
-   [Potential Privilege Escalation via Recently Compiled Executable](https://github.com/elastic/detection-rules/blob/a9208f465f486bf87dd614c463eb5e790d559a52/rules/linux/privilege_escalation_uid_change_post_compilation.toml)
    

That’s enough to make the alert useful, even though the payload is a stolen descriptor, not a shell. The endpoint doesn’t have to prove that the SSH host key was printed to stdout. The host already showed the suspicious relationship that matters: a local PoC repeatedly drove a SUID-root helper that briefly held root-only secrets.

### chage_pwn (CVE-2026-46333)

`chage_pwn` uses the same kernel primitive against a different helper and a more directly dangerous file. `chage -l <user>` opens account-aging data, including `/etc/shadow`, and then drops privileges. The PoC forks chage, opens a pidfd for the child, races `pidfd_getfd()` over candidate descriptors, looks for a duplicated descriptor pointing at `/etc/shadow`, and then reads from that descriptor.

![chage\_pwn CVE-2026-46333 alerts: ten Potential Shadow Read via Unprivileged User detections in Kibana](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3afa0f673a13464a.png)

This one is useful because it validates a slightly different detection idea. The screenshot shows repeated [Potential Shadow Read via Unprivileged User](https://github.com/elastic/protections-artifacts/blob/4f957cd61fa2b85a2bce53b28c583e07ba020a94/behavior/rules/linux/privilege_escalation_potential_shadow_read_via_unprivileged_user.toml) alerts on `./chage_pwn root`. The process is still running as the unprivileged user, but the meaningful transition is group-based: the process enters `shadow` context from a user-controlled executable path.

## Plain SUID and SGID misconfiguration

The last examples are deliberately simple. A binary that shouldn’t be SUID-root is SUID-root, and the user runs it in the way that GTFOBins has documented for years. It’s the same finish we saw in the page-cache family, just without the corruption step. Copy Fail, DirtyFrag, pedit COW, and similar bugs often end by making a privileged binary behave like an attacker-controlled SUID helper. GTFOBins abuse starts there.

### SUID abuse example: Root shell via find -exec

`find` can execute commands with `-exec`. When `find` is SUID-root, that executed command inherits the elevated context.

![GTFOBins SUID abuse alert: SUID-root find spawning a shell with -exec, real user 1000 and effective UID 0](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b3e5b88c385e1871.png)

The screenshot shows that `find` runs with root effective privileges, while the real user is non-root, and the command line includes the shell execution path. The alert is [Privilege Escalation via SUID/SGID](https://github.com/elastic/detection-rules/blob/1eaa12aa6d2f2047a680d2260fa75e635dd4b9f6/rules/linux/privilege_escalation_potential_suid_sgid_exploitation.toml#L20).

### Privileged-mode shell: Root from bash -p

Shells usually drop elevated privileges unless told not to. The `-p` flag keeps the privileged effective identity. If a SUID-root shell exists, or if a root-owned copy of `bash` is placed somewhere unusual with the SUID bit set, launching it with `-p` drops the caller directly into a root-capable shell.

![Privileged-mode shell alerts: /bin/bash copied to /var/tmp/rootbash then run with -p as root](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/99c875d6034156de.png)

The screenshot shows two useful detections: [System Binary Copied or Moved](https://github.com/elastic/protections-artifacts/blob/dfd6970f99043ceae15286689eff6d243630a04b/behavior/rules/linux/defense_evasion_system_binary_copied_or_moved.toml#L8), followed by [Shell Privileged Mode from Non-Standard Path with Root Effective User](https://github.com/elastic/protections-artifacts/blob/dfd6970f99043ceae15286689eff6d243630a04b/behavior/rules/linux/privilege_escalation_shell_privileged_mode_from_non_standard_path_with_root_effective_user.toml#L9). First, a system binary was copied into an unusual location (which is specific to how we set up this technique). Then the copied shell was executed in privileged mode.

This is the simplest form of the same pattern that we’ve been following throughout the section. A user-controlled path, a privileged execution context, and a root-capable process. Whether the attacker got there through `AF_ALG`, ESP/RxRPC, `act_pedit`, `unshare`, D-Bus, or a bad SUID bit, the endpoint story is still recognizable.

## What this Linux privilege escalation detection framework covers

In this edition of our "Linux Detection Engineering" series, we built a layered framework for Linux local privilege escalation. The first layer detects the default flow every escalation shares: an unprivileged process executing from a writable path and becoming root, whether through a SUID helper, a self-elevating exploit, a suspicious descendant reaching root, a full exec-elevate-confirm sequence, a root shell from a nonstandard path, or an interpreter one-liner. The second layer adds bug-class coverage across the kernel page-cache corruption family, namespaces and capabilities, trusted-helper abuse, `sudo` and `polkit`, privileged D-Bus services, and plain SUID/SGID misconfiguration.

The value of this framework is durability. The 2026 surge produced many new CVEs, but they largely reused a handful of ideas and all ended in the same observable root transition, so outcome-oriented detection held up as the PoCs multiplied. It doesn’t claim to catch every possible LPE, but it gives defenders broad, resilient coverage of how escalations actually behave and a clear place to slot in each new technique as it appears.
