---
title: "Dokploy: the fix checks the characters, never the first word — a member's compose command and raw compose file both reach host root, 9.9 each (v0.31.2, live-proven)"
source: https://seclists.org/oss-sec/2026/q4/807
source_host: seclists.org
clip_date: 2026-11-22T15:06:09+08:00
trace_id: 6343e07e-2d6f-4e03-8954-e8eafcabe1a8
content_hash: d0a3a58ac5c93d6e43449114004f5106e5cff480809dbe55b3e9834404d90f43
status: synced
tags:
  - 漏洞分析
  - Linux安全
series: null
feed_source: oss-security·漏洞披露
ai_summary: Dokploy v0.31.2 的 compose 功能存在两条独立路径，均可让普通组织成员以 root 身份在宿主机执行命令，各自 CVSS 评分 9.9，其中一条是对 CVE-2026-72884 修复的不完整。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 42075244-d011-817b-abda-c6b7dd0801c3
ioc:
  cves:
    - CVE-2026-72865
    - CVE-2026-72867
    - CVE-2026-72884
  cwes: []
  hashes:
    - 133883ab9f6ede5b9ba6b82e27bedaf0ce152f25
    - a16cf89389f1bcb6fb5b9a78f7e8a28150c5efaa
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Dokploy v0.31.2 的 compose 功能存在两条独立路径，均可让普通组织成员以 root 身份在宿主机执行命令，各自 CVSS 评分 9.9，其中一条是对 CVE-2026-72884 修复的不完整。
> 
> - **前提条件：** 非 owner、非 admin 的组织成员，持有 service:create 权限（canCreateServices 标志或自定义角色）并能访问一个 compose 服务；服务端以 root 运行并驱动 `/var/run/docker.sock`。
> - **门一（命令字段）：** `sanitizeCommand` 只拒绝 shell 控制字符、要求第一个 `&&` 之后的分段以 `docker compose ` 开头，**从不校验首个 token**；`getBuildComposeCommand` 直接拼成 `docker ${command}` 交给 `/bin/sh -c` 或 SSH 执行，故无需元字符，`run --rm -v /:/hostfs alpine touch ...` 原样通过即挂载宿主根文件系统。
> - **门二（原始文件）：** `createComposeFileRaw` 只校验结构，几乎原样写入 docker-compose.yml；全源码搜索 `privileged`/`cap_add`/`pid:`/`ipc:`/`network_mode` 无匹配，无防护可绕；而结构化路径的 `updateComposeFile` 却会拒绝 `privileged: true`——同一产品一个门设防、另一个门不设。
> - **实机验证：** 供应商针对 72884 的回归测试 13/13 拒绝元字符载荷（该修复对其设想攻击有效）；门一 3/3 载荷被接受，docker shim 收到确切 argv；门二带 `privileged:true`、`/:/host_root:rw`、`cap_add SYS_ADMIN` 的原始文件 2/2 原样进入 spec；最终对真实 Docker 守护进程写入 root 属主的 canary，并读到宿主 `/etc/hostname`。
> - **评分与定界：** 每条门独立 `CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:H` = 9.9（因需认证故非 10.0）；未涉及第三方或生产系统。

## oss-sec mailing list archives

## Dokploy: the fix checks the characters, never the first word — a member's compose command and raw compose file both reach host root, 9.9 each (v0.31.2, live-proven)

* * *

*From*: theknell () duck com  
*Date*: Sat, 21 Nov 2026 13:40:34 -0500  

* * *

```swift
-----BEGIN PGP SIGNED MESSAGE-----
Hash: SHA256

Two doors, same room.

Dokploy's compose feature gives a member two ways to describe a deployment: type a custom command, or supply the 
compose file raw. The vendor hardened this feature in the 2026 disclosure rounds — the command field got a validator, 
the structured service definition got a privilege guard. Both hardenings are real. Neither one covers the path it was 
attached to.

The precondition for both: a non-owner, non-admin organisation member with service:create (the canCreateServices flag, 
or a custom role granting it) and access to one compose service — the vendor's own member class, scored 9.9 by them in 
CVE-2026-72867 and CVE-2026-72865, and 8.7 for the metacharacter mechanism in this feature.

Tested against Dokploy v0.31.2, commit a16cf89389f1bcb6fb5b9a78f7e8a28150c5efaa, full history.

Door one — the first word:

1. The compose service command field is free text: z.string().optional() (packages/server/src/db/schema/compose.ts:200, 
:283). createCommand returns it with no compose prefix (packages/server/src/utils/builders/compose.ts:127-128).
2. The validator, sanitizeCommand (compose.ts:84-123) — added by commit d48037a80 as the fix for CVE-2026-72884, its 
comment stating it stops a member breaking out "into arbitrary host commands" — rejects shell control characters and 
requires &&-chained segments after the first to start with "docker compose ". It never validates the first token.
3. getBuildComposeCommand interpolates the result directly: docker ${command} (compose.ts:65). The deploy sinks execute 
it via /bin/sh -c or SSH (packages/server/src/services/compose.ts:302, :418). The server runs as root and drives the 
host daemon at /var/run/docker.sock.
4. So no metacharacter is needed. The command "run --rm -v /:/hostfs alpine touch /hostfs/tmp/canary" passes the 
validator verbatim and executes as docker run with the host's root filesystem mounted read-write. An incomplete fix of 
CVE-2026-72884.

Door two — the raw file:

5. compose.loadRawCompose and compose.getConvertedCompose (packages/server/src/routers/compose.ts:1256, :1131) feed 
createComposeFileRaw (packages/server/src/utils/builders/compose.ts:230-276), which checks only structure and writes 
the parsed YAML to docker-compose.yml essentially verbatim.
6. A full-tree search of the server source for privileged, cap_add, pid:, ipc:, network_mode returns no matches — there 
is no guard to bypass. The control is inside the same product: updateComposeFile 
(packages/server/src/services/compose.ts:1018) rejects privileged: true on the structured path. The vendor gates this 
capability on one door and not the other.

Live proof, against our own rig only:

- - Control: the vendor's own regression suite for the CVE-2026-72884 fix rejects every metacharacter payload — 13 of 
13. The fix holds against the attack it imagined.
- - Door one: the real createCommand accepts the docker run payload verbatim (3 of 3); the builder emits the deploy 
script containing it (2 of 3 checks, 2 of 2 runs); a verbatim standalone harness agrees (6 of 6); a recording docker 
shim on PATH received the exact argv from the shell.
- - Door two: a raw file carrying privileged: true, /:/host_root:rw, and cap_add SYS_ADMIN round-trips into the emitted 
specification with every field intact (2 of 2).
- - Final hop, executed against a real Docker daemon on our own rig: a root-owned canary written to the daemon host's 
root filesystem; a read-only variant returned the daemon host's /etc/hostname.

Severity: each door independently 9.9 — CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:H. Not 10.0; every path is 
authenticated, stated rather than rounded up.

Scope, stated plainly: door one is an incomplete fix of CVE-2026-72884, present in v0.31.2, the release line that 
shipped the fix. The metacharacter fix and the structured-path guard both hold and are credited as holding. A third 
condition on legacy installs — a documented default authentication secret the vendor warns about in their own code — is 
not claimed here. No third-party or production system was touched.

Paper: https://archive.org/details/knell-two-doors
Key: 133883AB9F6EDE5B9BA6B82E27BEDAF0CE152F25 (knell)

Verify: gpg --import knell-public.asc, then
gpg --verify paper-dokploy-FINAL-2026-11-21.md.asc

— knell
-----BEGIN PGP SIGNATURE-----

wnUEARYIAB0FgmsB5XIWIQQTOIOrn27eW5umuC4nvtrwzhUvJQAKCRAnvtrwzhUv
JfkjAQCMvtBE1h6A1ZC66t5n4Pn3h43439k2nZgTDBgA3FwzcAD+KY9++vg9qHBM
5k7gqZ+b880zWavm3SMevuInYtoxLAg=
=UToJ
-----END PGP SIGNATURE-----
```

* * *

### Current thread:

-   **Dokploy: the fix checks the characters, never the first word — a member's compose command and raw compose file both reach host root, 9.9 each (v0.31.2, live-proven)** *theknell (Nov 21)*
