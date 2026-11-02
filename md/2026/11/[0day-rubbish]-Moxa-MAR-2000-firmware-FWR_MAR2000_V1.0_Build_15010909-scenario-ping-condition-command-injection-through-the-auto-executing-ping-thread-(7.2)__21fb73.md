---
title: "[0day-rubbish] Moxa MAR-2000 firmware FWR_MAR2000_V1.0_Build_15010909 scenario ping condition command injection through the auto-executing ping thread (7.2)"
source: https://seclists.org/fulldisclosure/2026/Oct/55
source_host: seclists.org
clip_date: 2026-11-02T14:43:11+08:00
trace_id: e0430189-8636-4d65-9b8a-381a0ac1a09d
content_hash: 221d64c4983d06b79c3203869cd302bf08f740a591f9cb078bef4a95e81440e4
status: synced
tags:
  - 漏洞分析
  - 命令注入
series: null
feed_source: Full Disclosure·漏洞披露
ai_summary: Moxa MAR-2000 工业路由器固件的 scenario ping 条件参数未经校验直接拼入 shell 命令，认证管理员一次配置写入即可获得周期性任意命令执行，发布评分 CVSS 7.2。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40c75244-d011-8119-b029-fbb93cd08f16
ioc:
  cves: []
  cwes:
    - CWE-20
    - CWE-78
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Moxa MAR-2000 工业路由器固件的 scenario ping 条件参数未经校验直接拼入 shell 命令，认证管理员一次配置写入即可获得周期性任意命令执行，发布评分 CVSS 7.2。
> 
> - **成因与入口：** 固件 `/home/model/scenario/scenario.py` 的 ping 条件线程将存储的 ip/interface 文本插值进 `ping %s -c 1 -w 5 -I %s` 后以 `shell=True` 交给 /bin/sh；PUT /api/v1/scenario 仅校验 data 非空，Express 中间件、MQTT、存储各层均不检查参数内容。
> - **有效载荷：** 实测仅命令替换 `$(...)` 与换行分隔两种形式可行；分号形式因插值点位于 `-c` 之前会产生无上限 ping，将监控线程阻塞，本身构成针对 scenario 机制的 DoS 手段。
> - **触发与持久化：** 登录后一次 PUT 写入即可，无需第二个请求；产品自带的 scenario watchdog 按周期评估条件并反复执行载荷，且载荷属存储配置、重启后存活，删除恶意条件是打补丁前的唯一常规处置。
> - **权限与评分：** 发布评分 7.2 High（PR:H，产品仅管理员单一角色）；若设备仍用出厂默认口令，前提崩塌、按 PR:N 计为 9.8 Critical；研究方原报 8.8（PR:L 算术），发布时逐向量重算下调 1.6 分。
> - **验证与修复：** 复现为隔离沙箱的 sink 级验证（marker 文件含 uid=0(root)），未做整机端到端引爆；修复应弃用 shell、改参数向量或库调用执行，并在写入边界校验 ip/interface/times，运维侧需改默认口令、管理口禁 WAN、排查含元字符的 ping 条件。

## Full Disclosure mailing list archives

## \[0day-rubbish\] Moxa MAR-2000 firmware FWR_MAR2000_V1.0_Build_15010909 scenario ping condition command injection through the auto-executing ping thread (7.2)

* * *

*From*: disclosure via Fulldisclosure <fulldisclosure () seclists org>  
*Date*: Tue, 27 Oct 2026 16:39:17 +0000  

* * *

````sql
0day Rubbish Research Team is publicly disclosing a vulnerability in the Moxa
MAR-2000 series industrial 4G/LTE cellular router, firmware image
FWR_MAR2000_V1.0_Build_15010909, from Moxa Inc. (Taiwan). An authenticated
administrator converts one saved monitoring-condition field into recurring,
product-scheduled arbitrary command execution, because the thread that
implements the scenario ping condition builds its command line from the
condition's stored parameter values and hands them to a shell, and no layer
of the backend inspects what those values hold. The delivery needs no second
request: the product's own scenario watchdog evaluates the condition on its
schedule, which also makes the payload recur on every evaluation cycle until
the condition is deleted. This is one of three independent command injection
findings documented for this product and released together as a set.

Type and root cause. CWE-78, OS command injection, with CWE-20 co-equal, in
the Scenario model at /home/model/scenario/scenario.py inside the ARM
Debian 6.0.8 root filesystem of the firmware, which runs the vendor's MIRF
(Mobile Intelligent Routing Framework) stack: a Node.js Express 4.0
management application on port 80 bound to all interfaces, the express-sanji
middleware bridging REST resources onto a local MQTT broker, and Python 2.6
model scripts that persist configuration and act on it. The scenario
facility is how an operator automates behaviour on a schedule; a condition
of type ping is the canonical connectivity check. A saved ping condition
carries a parameter object with ip (required), interface (defaulting to
eth0) and times (defaulting to 3). When the watchdog reaches the condition
it starts a background thread whose run method assembles

```
cmd = "ping %s -c 1 -w 5 -I %s " % (ip, interface)
subprocess.Popen(cmd, shell=True, stdout=PIPE, stderr=PIPE)
```

The interpolation is textual into a single string handed to /bin/sh, so the
stored bytes are parsed as command syntax, and both stored fields - ip and
interface - sit in operand positions of the same template, giving two
stored fields of one class inside one condition. The values got there
through PUT /api/v1/scenario, where the model's put handler validates only
that the submitted data object exists and is non-empty. No parameter value
is examined at any layer of the stack: not by the Express middleware, not
by the message translation, not on the broker leg, not at storage, and not
when the thread reads the condition back.

Two payload-engineering results are published with the finding because they
were measured, not intuited. The template places the stored ip value before
the -c 1 and -w 5 flags, so the naive semicolon form that works against
several other sinks does not fit here: it splits the line in front of the
count flag, leaves an unbounded ping in the foreground of the evaluating
thread, and in the replication record the marker never appeared before the
thread was torn down. The two verified forms are a command substitution,
which the shell expands during command expansion before the ping binary even
starts and whose expansion result is discarded into the ping operand, and a
newline separator, which leaves the ping its own line with the flags intact
and runs the injected text as a second command line. The failing form is
also a finding in its own right: the same unvalidated field, used with the
naive form, turns the monitoring thread into a blocked thread - a
denial-of-service lever against the product's scenario machinery.

The one-request chain looks like this after login:

```
PUT /api/v1/scenario
{"data": {"condition": [{
    "name": "connectivity_check",
    "type": "ping",
    "parameter": {
        "ip": "$(id > <marker>)",
        "interface": "eth0",
        "times": 3
    }}]}}
-> stored verbatim (the put handler checks only that data exists,
   is non-empty); the watchdog's next evaluation starts the thread
-> cmd = "ping $(id > <marker>) -c 1 -w 5 -I eth0 "
-> the shell expands the substitution before ping execs; the
   marker carries the proof, ping then exits quickly, and the
   condition re-evaluates on the next cycle
```

Authentication and reach. The validateUser middleware is the only
authentication check on the REST surface: it requires a server-side session
for every non-GET method, and login is POST /api/login compared against
bcrypt-hashed entries in the SQLite user table. The PUT that stores the
payload requires the session; past that check there is no second
authorisation layer, the broker leg carries no identity, and the model
implements no permission judgement, so the product's single documented
role, the device administrator, is the whole security boundary. The
listener binds all interfaces on port 80 in the shipped firmware; no WAN
exposure is assumed anywhere in the published rating.

Severity. The published score is 7.2 High,
CVSS:3.1/AV:N/AC:L/PR:H/UI:N/S:U/C:H/I:H/A:H, from ISS = 0.914816, impact
5.873119, exploitability 1.234708 and base 7.107826 rounded up to 7.2,
Privileges Required High being the product's single administrator role. A
labelled conditional and never the headline: where a deployment still runs
the factory default administrator pair carried by the shipped firmware's
SQLite user table, the prerequisite collapses and the chain reads 9.8
Critical on the PR:N vector (exploitability 3.887043, base 9.760161); a
changed credential removes it, and the default pair is disclosed as a
separate weakness, never folded into the published vector. A PR:L reading
of 8.8 High is published only as the arithmetic of the rejected variant.
The score provenance is disclosed in public: the research record behind
this advisory carried 8.8 for all three same-product findings, that figure
is the arithmetic of a PR:L vector, no artefact shows a lower-privileged
product role, and every published number was recomputed from its own
vector - which lowered the researchers' own figure by 1.6 points. A
Scope-Changed reading computes to 9.1 and is deliberately not published,
because the model process belongs to the same single-purpose appliance
authority, and running scheduled monitoring through the management plane
is the product's design rather than an escape.

Verification method, and its boundary. Two evidence classes carry the
finding, kept separate in the published advisory. The firmware's own
application sources establish the scenario write path, the write handler's
validation scope and the thread construction, read from the shipped files.
The dynamic layer is a sink-level replication on an isolated cloud Linux
sandbox: the exact template with the same shell=True launch and both pipes
captured, executed under the substitution form, the newline form, the naive
semicolon form and a benign control. Both verified forms produced a marker
file containing uid=0(root); the naive form produced no marker in the tested
window, for the unbounded-ping reason described above; the control ran a
normal bounded ping and produced nothing. The boundary is stated plainly:
end-to-end detonation against powered-on hardware, including the
watchdog's exact evaluation interval, is outside this research record, and
the on-device model process identity was neither measured nor claimed -
uid=0(root) is the replication sandbox's identity and nothing broader
rests on it.

Impact. Recurring arbitrary command execution as the identity of the
Python model process, begun by one authenticated configuration write and
delivered by the product's own periodic evaluation. The execution is not a
one-shot and needs no persistence work: the saved condition re-evaluates on
every cycle until deleted, and the payload survives reboots because it is
stored configuration, so deleting the malicious condition is the only
ordinary remediation short of a patch. The compromise yields the router's
complete configuration, control of the monitoring-as-automation features on
a device deployed as communication infrastructure, and availability at
will. Detection is structurally quiet - the executing process is the
product's own monitoring thread - so the readable signals are
content-level: a saved ping condition whose ip or interface contains a
dollar-parenthesis, semicolon, pipe, backtick or newline; ping processes
running with no count flag; unexpected child processes under the model
daemon. The web stack's separate property of answering unauthenticated GET
requests across the API surface - which lets an intruder enumerate saved
scenarios, including a poisoned one, without a login - is a read-exposure
issue reported on its own and is not part of this chain.

Remediation: run the connectivity check without a shell, as an argument
vector or library call, which removes the metacharacter question from the
thread entirely and eliminates the unbounded-ping failure mode; validate
condition parameters at the model's write boundary where they are stored -
address form for ip, interface selector form for interface, bounded numeric
for times; reject failing conditions rather than storing them for the
watchdog; give the evaluation machinery a failure budget, reaping threads
that outlive it and logging evaluations that produce unexpected process
trees; and treat the recurring property as a design rule: any value a
scheduled reaction will eventually consume must be validated at store
time, because the schedule converts a stored input into an automatically
repeated one. Operators until a patch exists: change the factory default
administrator credential at commissioning, keep the management listener
off WAN-facing addresses, sweep saved scenarios for ping conditions with
metacharacter-bearing parameters, and disable the scenario feature where
scheduled monitoring is not used.

Proof of concept. The published tool is a standard-library-only Python 3
client that drives the entry path: it logs in, reads the current scenario
configuration, saves a ping condition whose parameter.ip carries the
substitution-form payload, and reports what the condition will do on the
next evaluation. It takes target, credential, command and timeout
arguments; the default target is loopback; it verifies each response and
exits non-zero with an explicit message on failure. It deliberately does
not attempt to compute or drive the watchdog's interval. No persistence,
reverse shell or destructive step; the default command writes one marker
file. Use it only against systems you own or are authorised to test.

The vendor's product security team mailbox, published on the vendor's own
security advisories page, was used for the unconditional notification; no
report form was submitted and no individual was addressed by name. This
disclosure is unconditional: the research is published, no permission was
asked for, no embargo was requested, nothing is withheld pending a reply,
and remediation questions are answered at no cost. No vulnerability
identifier has been assigned to this finding.

Two companion advisories for the same product are published alongside this
one, independent findings that share only the entry architecture - a
different model file, REST resource, configuration field and sink each: an
Executer program-activation injection through the stored argument field of
a shell-interpreted program launch, and an IPsec tunnel address injection
through the route-management shell commands, both at the second and third
URLs below.

Full technical analysis and the reproducible proof of concept, published
unconditionally:
  https://0day-rubbish.com/blog/mar-2000-scenario-ping-command-injection

Companion advisories for the same product, independent findings:
  https://0day-rubbish.com/blog/mar-2000-executer-program-argument-command-injection
  https://0day-rubbish.com/blog/mar-2000-network-ipsec-command-injection

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
