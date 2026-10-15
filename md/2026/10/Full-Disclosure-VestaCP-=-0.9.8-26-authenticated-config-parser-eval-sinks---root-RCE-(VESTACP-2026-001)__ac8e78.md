---
title: "Full Disclosure: VestaCP <= 0.9.8-26: authenticated config-parser eval sinks -> root RCE (VESTACP-2026-001)"
source: https://seclists.org/fulldisclosure/2026/Oct/26
source_host: seclists.org
clip_date: 2026-10-15T16:45:30+08:00
trace_id: a1280da6-8053-48bd-854a-6435f1ea535e
content_hash: 9805d982a4ed489e7510b1d2e32657f65c0288b05d361f7e7f1c33e23934dd65
status: synced
tags: []
series: null
feed_source: Full Disclosure·漏洞披露
ai_summary: VestaCP ≤0.9.8-26 的配置解析器用 eval 处理用户可控的 KEY='value' 行，普通面板账号即可注入命令，在 root 执行的 v-* 脚本中触发提权 RCE，且上游已废弃无补丁。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3fa75244-d011-819c-839c-cdf1d0ff3ca6
ioc:
  cves: []
  cwes:
    - CWE-78
    - CWE-95
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> VestaCP ≤0.9.8-26 的配置解析器用 eval 处理用户可控的 KEY='value' 行，普通面板账号即可注入命令，在 root 执行的 v-* 脚本中触发提权 RCE，且上游已废弃无补丁。
> 
> - **漏洞概要：** VestaCP ≤0.9.8-26，CVSS 3.1 评分 9.9（AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:H），归为 CWE-78 命令注入与 CWE-95 eval 注入，项目自 2019-09 起停止维护。
> - **根因：** func/main.sh 被所有以 root 运行的 v-* 脚本 source，其中用 `object=$(grep ... $USER_DATA/$1.conf); eval "$object"` 解析配置；值中出现未转义单引号即可逃出引号注入 shell。同类 sink 还包括 get/update_object_value、search_objects、sync_cron_jobs、`eval echo \$${I}`、`eval arg=\$$arg_name`，以及 v-add-cron-job 中未加引号的 `$7` 导致 crontab 注入。
> - **利用链：** 攻击者只需普通认证账号或任何能写入 ~/conf/*.conf 的路径（面板字段绕过 %quote%、备份恢复、API/导入），写入如 `CMD='x'; id > /tmp/pwned; #` 的值，在下次 root 调用解析该对象时执行，实现租户到宿主机的逃逸。
> - **缓解措施：** 无官方修复，建议改用非 eval 的键值解析器（仓库提供 drop-in 的 parse_object_kv_list 及迁移配方）、在所有 v-* 入口强制 %quote%/%dots% 转义并对展开加引号、用防火墙/IP 白名单限制面板端口并监控配置写入、迁移到受维护的控制面板。
> - **附带发现：** 原 `eval echo $4` 路径存在 glob 展开缺陷，字段中的字面 `*` 会被展开为目录列表；非 eval 解析器可正确返回 `*`（经 1165 项字段比对验证等价）。

## Full Disclosure mailing list archives

## VestaCP <= 0.9.8-26: authenticated config-parser eval sinks -> root RCE (VESTACP-2026-001)

* * *

*From*: Bryan Ramirez via Fulldisclosure <fulldisclosure () seclists org>  
*Date*: Tue, 06 Oct 2026 19:23:03 -0400  

* * *

```sql
Advisory ID:   VESTACP-2026-001 / GHSA-m2mc-xwq7-pw72
Product:       Vesta Control Panel (VestaCP)
Versions:      <= 0.9.8-26 (unmaintained since 2019-09; no upstream fix exists)
Severity:      Critical - CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:H = 9.9
CWE:           CWE-78 (OS Command Injection), CWE-95 (Eval Injection)
Reporter:      Bryan Ramirez - SYSDOP LLC <security () sysdop com>

SUMMARY
-------
VestaCP stores per-account objects (domains, cron jobs, DNS, mail, users) as
KEY='value' lines under $USER_DATA/*.conf. The shared shell library
func/main.sh - sourced by every v-* administration script, all of which run
as root - parses those lines with `eval`, so the assignments land in the
calling shell's environment.

Values in those files are controllable by an authenticated panel user (cron
command fields, domain/alias fields, DNS and mail records, names/comments).
Any value that lands with an unescaped single quote breaks out of the quoted
assignment and injects arbitrary shell, executed as root the next time any
v-* script parses that object - which happens on routine panel operations
and on cron-driven sync jobs, without further interaction.

This is the same sink class published for VestaCP's downstream fork HestiaCP
as GHSA-w3mx-xq85-8qqc (config parser eval -> root RCE, fixed in 1.9.5),
GHSA-cr7q-frhq-xw4v and GHSA-5fpv-c8rg-x6r3 (unquoted cron argument ->
crontab injection). Hestia patched the class in the fork; VestaCP itself
never received an advisory or a fix and remains deployed worldwide - notably
in VPS templates (e.g. Virtualizor images) still offered by hosting
providers today.

AFFECTED SINKS (func/main.sh, 0.9.8-26)
-------------------------------------
is_object_value_empty, is_object_value_exist, get_object_value,
update_object_value, add_object_key: eval "$object" over a grep'd conf line.
search_objects, sync_cron_jobs: eval $line per matching line.
ARGUMENTS builder: eval echo \$${I} (also a latent glob-expansion bug).
is_format_valid: eval arg=\$$arg_name.
bin/v-add-cron-job: echo $7 unquoted -> raw newlines land in the crontab
(GHSA-5fpv class).

The central pattern (verbatim shape in stock 0.9.8-26):

    object=$(grep "$2='$3'" $USER_DATA/$1.conf)
    eval "$object"

EXPLOITATION
------------
1. Attacker holds an ordinary authenticated VestaCP account (hosting
   customer) or any write path landing data in ~/conf/*.conf (panel fields
   bypassing %quote% escaping, backup/restore, API/import paths).
2. A crafted value containing an unescaped ' is stored, e.g. a cron CMD:
   CMD='x'; id > /tmp/pwned; #
3. On the next root-run v-* invocation parsing the object, the eval runs
   the injected commands as root.

Impact: tenant-to-host escape - full root on the node, exposing every site,
mailbox and database of every account it hosts.

A self-contained PoC simulating the vulnerable parse and the hardened parser
neutralizing it is published in the repository (poc/poc-eval-sink.sh).

ADDITIONAL FINDING
------------------
While certifying equivalence of the hardened parser (1,165 field comparisons
against real confs): the stock `eval echo $4` path performs glob expansion -
a literal `*` in a field expands to a directory listing instead of returning
verbatim. The non-eval parser returns `*` correctly: the replacement is
equivalent and fixes a latent parsing bug.

MITIGATION
----------
No upstream fix exists (abandonware). Operators still running VestaCP should:

1. Replace the eval parser with a non-eval key/value parser - the repository
   includes a drop-in parse_object_kv_list (strict KEY='value' regex +
   `declare -g` assignment; values become literals, never executed) plus a
   porting recipe for all eval sites (mitigation/non-eval-parser.sh).
2. Enforce %quote%/%dots% escaping on every v-* entry point ingesting user
   data; quote every expansion (echo "$7" in v-add-cron-job).
3. Restrict the panel port by firewall/IP allow-list; monitor
   $USER_DATA/*.conf for unexpected writes.
4. Migrate to a maintained control panel.

TIMELINE
--------
2019-09    Last upstream VestaCP release (0.9.8-26); project abandoned.
2026-08    Sinks identified, PoC confirmed and remediation developed during
           a defensive security audit of production hosting infrastructure.
2026-10-06 Public disclosure (GitHub Security Advisory + this post);
           CVE requested via MITRE.

VENDOR CONTACT
--------------
None possible - no active maintainer, no published security contact,
inactive community. Disclosed publicly for the install base still running
VestaCP in production.

REFERENCES
----------
GHSA: https://github.com/sysdopllc/vestacp-config-eval-rce/security/advisories/GHSA-m2mc-xwq7-pw72
Repository (advisory, PoC, mitigation):
  https://github.com/sysdopllc/vestacp-config-eval-rce
Related HestiaCP advisories (same class, fixed downstream):
  https://github.com/hestiacp/hestiacp/security/advisories/GHSA-w3mx-xq85-8qqc
  https://github.com/hestiacp/hestiacp/security/advisories/GHSA-cr7q-frhq-xw4v
  https://github.com/hestiacp/hestiacp/security/advisories/GHSA-5fpv-c8rg-x6r3

--
Bryan Ramirez
SYSDOP LLC
security () sysdop com
_______________________________________________
Sent through the Full Disclosure mailing list
https://nmap.org/mailman/listinfo/fulldisclosure
Web Archives & RSS: https://seclists.org/fulldisclosure/
```
