---
title: 【微信】一个搜索框拿管理员：Craft CMS未认证SQL注入漏洞复盘，CVSS 9.8全版本在射程
source: https://mp.weixin.qq.com/s/KXVeodBeb3hFNQnvcnKZQA
source_host: mp.weixin.qq.com
clip_date: 2026-11-10T15:06:37+08:00
trace_id: df857ed7-5a1e-4d39-9ed7-9e19c70c380d
content_hash: a70098c8b997a7b055aa95e1d009271f76d5656bb85e0455b825ec585d4d51a6
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 41475244-d011-8130-8855-c8b57cc70458
ioc:
  cves:
    - CVE-2026-115934
  cwes:
    - CWE-89
  hashes: []
  domains: []
  tools: []
  techniques: []
---

**随笔漫记安全路** *2026年11月10日 12:38*

2026年11月9日，GitHub Advisory Database上出现一条critical级别记录： **Craft CMS全版本未认证SQL注入，CVSS 9.8，可直接提权管理员**。影响4.0以来所有版本，补丁9月中旬就已发布，但大量站点至今未更新。

这个漏洞值得拆开看，因为它踩中了一个经典陷阱： **PDO emulated prepares + sprintf拼接SQL = 堆叠注入**。

## 漏洞档案

| 项目  | 详情  |
| --- | --- |
| CVE | CVE-2026-115934 |
| GHSA | GHSA-qcvp-ggx3-97r6 |
| CVSS | 9.8（AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H） |
| CWE | CWE-89 SQL注入 |
| 影响版本 | Craft CMS 4.0.0–4.18.8 / 5.0.0–5.11.1 |
| 补丁版本 | 4.18.9 / 5.11.2（2026-09-17发布） |
| 前置条件 | 前端使用了 `craft.search` 搜索功能 + MySQL/MariaDB后端 |
| 认证要求 | **无需认证** |

## 攻击链：从搜索框到管理员

Craft CMS的前台搜索功能通过 `craft.search` 处理用户输入，搜索词经 `Search::normalizeSearchQuery()` 解析后，最终流入 `Search::_sqlWhere()` 方法拼成SQL WHERE子句。

问题出在 `_sqlWhere()` ——它对列名 `$key` 做了 `quoteColumnName()` 转义，但 **值 `$val` 直接用sprintf拼进SQL字符串**：

```php
// 漏洞代码 (src/services/Search.php)
private function _sqlWhere(string $key, string $oper, string|int $val): string
{
    $key = Craft::$app()->getDb()->quoteColumnName($key);
    // ↑ $key做了转义
    // ↓ $val直接sprintf拼接，没有quoteValue！
    return sprintf("(%s %s '%s')", $key, $oper, $val);
}
```

`$val` 被单引号包裹后直接拼入SQL。攻击者在搜索参数中闭合单引号，就能注入任意SQL。

**关键放大器：PDO emulated prepares**。Craft CMS的MySQL连接默认开启 `PDO::ATTR_EMULATE_PREPARES` ，这意味着PDO在客户端模拟预处理，不在MySQL服务端执行真正的参数化查询。后果是 **堆叠查询（stacked queries）可以执行**——攻击者用分号串联第二条SQL语句，实现写操作。

攻击者只需在前台搜索URL中构造 `[attribute]` 参数：

```
GET /actions/search/search?q=test&[attribute]=1';UPDATE users SET admin=1 WHERE id=1;--
```

三条路径全部走通：

| 步骤  | 操作  | 结果  |
| --- | --- | --- |
| 1   | 闭合单引号+分号 | 脱离原查询上下文 |
| 2   | 堆叠 `UPDATE users SET admin=1 WHERE id=1` | user ID 1的admin标志位置1 |
| 3   | Craft CMS权限检查短路 | **admin列=1即跳过所有权限校验**<br><br>，无需改密码 |

同一个写原语还能覆盖任意账户的密码哈希。报告者原话："The write primitive was used to set the admin flag on user ID 1 in the users table, confirmed by reading the value back."

## 补丁：三处修复

补丁commit `8e3023c55e` 改了三个文件：

**修复1： `_sqlWhere()` 对值做 `quoteValue()`**

```php
// 修复后
private function _sqlWhere(string $key, string $oper, string|int $val): string
{
    $db = Craft::$app()->getDb();
    $key = $db->quoteColumnName($key);
    $val = $db->quoteValue($val);  // ← 新增：值转义
    return "($key $oper $val)";    // ← 不再手动包单引号
}
```

核心变化： `$val` 从sprintf裸拼接改为 `quoteValue()` 转义，同时去掉外层手动单引号（ `quoteValue()` 自带引号包裹）。

**修复2： `SearchQuery` 构造函数白名单defaultTermOptions**

```php
// 修复后：只允许这4个key
private const ALLOWED_DEFAULT_TERM_OPTIONS = ['subLeft', 'subRight', 'exclude', 'exact'];

$this->_defaultTermOptions = array_intersect_key(
    $defaultTermOptions,
    array_flip(self::ALLOWED_DEFAULT_TERM_OPTIONS),
) + [...defaults...];
```

防止攻击者通过 `defaultTermOptions` 注入非预期参数。

**修复3： `ElementHelper::cleanseQueryCriteria()` 校验search类型**

```php
// 修复后：search必须是字符串
if (isset($criteria['search']) && !is_string($criteria['search'])) {
    unset($criteria['search']);
}
```

防止数组类型绕过。

## 时间线

| 日期  | 事件  |
| --- | --- |
| 2026-09-10 | 研究者通过Hackrate平台提交漏洞 |
| 2026-09-11 | Craft团队确认接受，创建GHSA |
| 2026-09-15 | 修复commit提交（8e3023c55e） |
| 2026-09-17 | 补丁版本4.18.9 / 5.11.2发布 |
| 2026-10-19 | 安全公告公开 |
| 2026-11-09 | 严重级别从High升级Critical（CVSS 9.8） |
| 2026-11-10 | GitHub Advisory Database收录 |

## 临时缓解

无法立即升级的站点，在Web服务器层拦截含 `[attribute]` 或 `%5Battribute%5D` 的查询字符串：

```
# Nginx
if ($query_string ~* "(%5Battribute%5D|\[attribute\])") {
    return 403;
}
```

```
# Apache
RewriteEngine On
RewriteCond %{QUERY_STRING} (.*(\[attribute\]|%5Battribute%5D).*)
RewriteRule .* - [F]
```

注意：这只是止血，根本方案是升级到4.18.9+/5.11.2+。

## 两个教训

**教训一：sprintf拼SQL永远是隐患。** 这个函数对列名做了 `quoteColumnName()` 却漏了值的 `quoteValue()` ——典型的"修了一半"。PHP生态里 `sprintf` +SQL的组合是高危模式，即使你手动包了单引号，一旦值内含单引号就绕过。正确做法：要么全程参数化查询，要么对所有动态部分调用对应的quote方法。

**教训二：PDO emulated prepares是堆叠注入的温床。** 当 `PDO::ATTR_EMULATE_PREPARES=true` （MySQL默认），PDO在客户端拼接SQL字符串再整体发送给服务端，分号分隔的多条语句可以一起执行。真正的服务端预处理不支持堆叠查询。Craft CMS + MySQL的组合默认就开着这个选项，把一个本应只能读取的注入点升级成了读写原语。

检查你的PHP应用：

```
// 关闭emulated prepares（推荐）
$pdo->setAttribute(PDO::ATTR_EMULATE_PREPARES, false);
```

这会让PDO使用真正的服务端预处理，堆叠查询将被拒绝。注意少数旧代码可能依赖emulated prepares的行为，切换前做回归测试。

* * *

参考：
