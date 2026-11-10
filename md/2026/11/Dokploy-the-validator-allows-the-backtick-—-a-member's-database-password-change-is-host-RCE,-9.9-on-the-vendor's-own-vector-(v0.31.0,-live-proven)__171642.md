---
title: "Dokploy: the validator allows the backtick — a member's database password change is host RCE, 9.9 on the vendor's own vector (v0.31.0, live-proven)"
source: https://seclists.org/oss-sec/2026/q4/620
source_host: seclists.org
clip_date: 2026-11-11T02:08:16+08:00
trace_id: 5df39893-1771-44a4-b2fe-82e0ec009c7a
content_hash: 569f4a27dd48699f93b5277b674df18e2b9381f0c2d62490690957c581353d22
status: synced
tags:
  - 漏洞分析
  - 协议分析
series: null
feed_source: oss-security·漏洞披露
ai_summary: Dokploy v0.31.0 数据库密码/用户名修改流程存在命令注入，组织内成员即可获得容器内 root（可控制宿主 Docker socket），厂商对同类前置条件已评 9.9 分。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41475244-d011-8135-a9d6-c2169cc0e6dc
ioc:
  cves:
    - CVE-2026-72868
  cwes: []
  hashes:
    - 133883ab9f6ede5b9ba6b82e27bedaf0ce152f25
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Dokploy v0.31.0 数据库密码/用户名修改流程存在命令注入，组织内成员即可获得容器内 root（可控制宿主 Docker socket），厂商对同类前置条件已评 9.9 分。
> 
> - **漏洞根因：** `DATABASE_PASSWORD_REGEX`（utils.ts:51-52，v0.29.0 起存在）封禁 `$ ! 引号 反斜杠 斜杠 空格`，却放行反引号及 `; | & () >`；Postgres/MySQL 的 changePassword 将新密码嵌入双引号 shell 参数内的单引号中，bash 仍会执行命令替换。
> - **第二注入点：** databaseUser 字段无任何校验（仅 z.string().min(1)）且未加引号直达 Postgres，用户名含分号即可构成完整命令序列，创建和更新均可用。
> - **实测证据：** 官方 v0.31.0 镜像本地复现——`$(id)` 密码被 400 拒绝，反引号密码返回 200 并在服务器容器内留下 uid=0(root) 的金丝雀文件；MySQL 密码注入作为独立第二 sink 同样触发。
> - **权限边界：** 非未授权漏洞，需具备 service:create 权限及服务访问权的组织成员；但 Dokploy 产品定位是多租户托管，厂商已对同类前置条件给出 9.9 分（CVE-2026-72868）。
> - **修复现状：** 2026-11-09 厂商仅能在 canary 分支上用 shell-quote argv 数组重写五个 changePassword 命令；无任何发布版本包含该修复，v0.31.0（当前安装基数）仍为漏洞代码，校验器在所有分支均未改动。

## oss-sec mailing list archives

## Dokploy: the validator allows the backtick — a member's database password change is host RCE, 9.9 on the vendor's own vector (v0.31.0, live-proven)

* * *

*From*: theknell () duck com  
*Date*: Mon, 09 Nov 2026 21:11:41 -0500  

* * *

```sql
Dokploy's pitch is a self-hosted panel that holds the keys to everything
it manages: root on every server in the fleet, the Docker socket, and the
credentials of every database and application it deploys. 38,000 stars,
514 official templates. The panel is, by design, the most trusted process
on the host.

The validator allows the backtick. Tested against dokploy/dokploy
v0.31.0 (official image, digest sha256:f836f0ab…0953):

1. The database password validator (DATABASE_PASSWORD_REGEX,
packages/server/src/db/schema/utils.ts:51-52, in the code since v0.29.0)
bans $, !, both quotes, backslash, slash and space. It allows the
backtick — and ; | & ( ) > with it.

2. In the Postgres and MySQL changePassword procedures the new password
is placed in single quotes nested inside a double-quoted shell argument,
where bash still performs command substitution. A password consisting of
a backtick command and a redirect — no slash, no space, no banned
character — executes as the Dokploy server process: uid=0(root) in the
container that holds the host's Docker socket.

3. databaseUser carries no validator at all (z.string().min(1)) and
reaches Postgres unquoted. A semicolon in the username is a complete
command sequence — no substitution trick required — and the field is
settable both at creation and through update on a deployed service.

4. The MariaDB and Mongo changePassword sinks are source-identical in
shape to the fired pair; they are claimed at source-level confidence and
were not separately fired. The Redis sibling does not fire: its password
sits in top-level single quotes, and that control is what proves the
mechanism.

Live proof, against our own rig only (official v0.31.0 image,
localhost-bound): a benign password changed cleanly (200); a $(id)
password was rejected by the validator (400) — the control showing the
guard alive and incomplete; the backtick password returned 200 and left
a canary file reading uid=0(root) gid=0(root) inside the server
container. Replicated once from a clean container state. The backtick
and semicolon usernames fired the same way, and the MySQL password sink
fired as a second, distinct sink.

Scope, stated plainly: this is not unauthenticated, and it is not a
cross-organization failure. Every changePassword procedure first checks
checkServicePermissionAndAccess with the service: ["create"] permission;
the attacker is an organization member who holds that permission and
access to the service — in practice, the member who deployed the
database. In a single-admin install there is no boundary to cross.
Dokploy's product is multi-tenant hosting, and the vendor scored this
same precondition class 9.9 (CVE-2026-72868): the tenant who can deploy
a database should not thereby own the host and every other tenant's
secrets on it.

What held is credited at the same weight: a suspected cross-organization
rollback path was tested and did not fire — the service functions throw
before any effect, and the state is unreachable through product flows.
The validator's author clearly enumerated the dangerous characters; the
class that executes is the one the enumeration missed.

Canary, for the record: on 2026-11-09, after this measurement, the
vendor rebuilt all five changePassword commands on the canary branch
using shell-quote argv arrays. No release contains that rewrite;
v0.31.0 — the current release and the installed base — is the vulnerable
code, and the validator is unchanged on every branch.

Paper:
https://archive.org/details/knell-the-seventh-site

Key: 133883AB9F6EDE5B9BA6B82E27BEDAF0CE152F25 (knell)

Verify: gpg --import knell-public.asc, then
gpg --verify paper-dokploy-FINAL-2026-11-09.md.asc

— knell

More, signed and timestamped:
https://github.com/the-knell
```

* * *

### Current thread:

-   **Dokploy: the validator allows the backtick — a member's database password change is host RCE, 9.9 on the vendor's own vector (v0.31.0, live-proven)** *theknell (Nov 09)*
