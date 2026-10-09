---
title: 【微信】MCP 服务安全测试 Checklist（实战版）
source: https://mp.weixin.qq.com/s/Bi24qk9YL692Q9mjZtSTzA
source_host: mp.weixin.qq.com
clip_date: 2026-10-09T19:15:10+08:00
trace_id: 8f2a3020-6a60-4b08-8b08-24983c40cee5
content_hash: cf41cd902e8e30279c170fc34e1cb1cb630d88df4af4f1f4601165bce13ef0ed
status: synced
tags:
  - 微信
  - 协议分析
  - AI应用
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: MCP 服务安全测试须分传输层与后端业务层两个独立鉴权域分别验证；本站 MCP 层零认证、37 个工具全暴露，数据面仅靠后端凭据缺失（10001）偶然挡住。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 3f475244-d011-81e4-b41b-f9908c2a686e
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> MCP 服务安全测试须分传输层与后端业务层两个独立鉴权域分别验证；本站 MCP 层零认证、37 个工具全暴露，数据面仅靠后端凭据缺失（10001）偶然挡住。
> 
> - **零认证握手：** 不带任何认证头 initialize 即 200 返回 mcpservice 0.0.1，OAuth 发现端点全 404，Mcp-Session-Id 可伪造/缺失且二次握手仍成功，服务端无状态、无会话隔离。
> - **工具面全暴露：** tools/list 枚举 37 个工具 schema，含删除、写入、角色增删成员、工作流触发等；get_time 实测返回真实服务器时间，证明调用面激活而非仅枚举。
> - **两层鉴权分离：** 数据类工具返回 10001 "Http Headers verification failed"，属后端未配服务端凭据的偶然保护；参数与 HTTP 头注入凭据均不可绕过，凭据补齐后 37 工具全部可用（条件性高危）。
> - **注入面证伪：** 命令/SSTI/SQL/SSRF/反序列化均无执行迹象；ID 参数被拼进 URL 路径（回退门户 404），14 个端口指纹与基线一致决定性否证 SSRF；Java 报错显示 plain Map，非 Fastjson，无 gadget。
> - **高频误判与意外泄露：** 缺 `Accept: application/json, text/event-stream` → 400；body 缺 id 被当 notification → 202 空响应；触发异常返回 500 反而免费泄露 Java/.NET 栈与 SDK 实现（WebFluxStatelessServerTransport）。

**APT-101** *2026年10月9日 18:50*

* * *

## 1\. 测试框架：MCP 攻击面模型

MCP（Model Context Protocol）是 JSON-RPC 2.0 之上的 AI 代理协议，与常规 Web 测试的最大差异：

```bash
┌────────────────────────────────────────────────────────────┐
│ 客户端 (LLM/Agent)   ── HTTP/SSE ──▶  MCP Server  ──▶ 后端业务API    │
│                      JSON-RPC 2.0       │                (HAP/wwwapi) │
│  initialize → tools/list → tools/call  │                └─ 数据/工作流 │
└────────────────────────────────────────────────────────────┘
```

两个独立鉴权域（本次测试最关键的架构认知）：

MCP 传输层鉴权（客户端 ↔ MCP Server）——控制能否连上并枚举

MCP → 后端业务鉴权（MCP Server ↔ 业务 API）——控制工具能否真正拿到数据/执行操作

> ⚠️ 核心教训：即使 MCP 层零认证，业务数据面可能被"后端凭据缺失"（如本站 10001)偶然挡住；反之 MCP 层有认证不代表后端安全。两层必须分别测试，且"配置补齐后即可达"的条件性风险必须写进结论。

* * *

## 2\. Checklist（8 个阶段 / 31 项）

## 阶段 A：传输与指纹

| #   | 测试名称 | 测试目的 | 测试 payload | 预期结果 | 本站实测 |
| --- | --- | --- | --- | --- | --- |
| A1  | TLS/连通性指纹 | 确认端口可行性、TLS 版本、证书、中间件 | curl -kv https://host:port/<br><br>（如 schannel 失败换 Python ssl / openssl） | 拿到 TLS 版本、证书 CN/SAN、HTTP 服务指纹 | 🟢 TLSv1.2/1.3 正常；Windows schannel SEC_E_NO_CREDENTIALS 为客户端问题，Python ssl 握手正常 |
| A2  | 根路径与门户指纹 | 识别前端框架、版本、后端语言 | GET /<br><br>；提取 HTML/JS 中 webpack/\__api_server\_\_/版本号 | 识别 SPA 框架、API 前缀、发布版本 | 🟡 门户为 HAP 低代码平台（webpack SPA；\__api_server\_\_=/wwwapi/；发布版 691c540d 2026/05/06） |
| A3  | 内部拓扑泄露 | 识别反向代理/服务网格/POD 信息 | 观察响应头 x-envoy-\*、via、server | 不经意的内部服务名/k8s 命名空间泄露 | 🔴 响应头泄露 x-envoy-decorator-operation: www.default.svc.cluster.local:8880/\*（k8s 内部服务名 8880 端口） |
| A4  | 前端 JS 功能模块枚举 | 从 JS 提取功能开关、第三方文档链接、RCE 候选模块 | 下载 entry JS，grep help.xxx.com/、模块常量、API 路由 | 识别产品线（明道云等）与高危功能（代码块/API 代理） | 🔴 确认明道云私有化：codeBlockNode:8（工作流代码块→可执行脚本）、apiRequestProxy:22（API 代理→SSRF）、dataBase:36 等 50+ 模块 |

## 阶段 B：MCP 协议握手与能力枚举

| #   | 测试名称 | 测试目的 | 测试 payload | 预期结果 | 本站实测 |
| --- | --- | --- | --- | --- | --- |
| B1  | initialize 零认证验证 | 核心<br><br>：不携带任何认证头直接握手 | {"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"p","version":"1"}}} | 若返回 200+serverInfo → 传输层零认证 | 🔴 200 返回 mcpservice 0.0.1，tools/prompts/resources/completions 全开 |
| B2  | 协议版本协商 | 判断服务端实现的协议版本（新旧差异影响可利用面） | protocolVersion<br><br>分别设 2024-10-07/2025-03-26/2025-06-18/2077-01-01 | 观察返回的 protocolVersion | 🟡 支持 2025-03-26/2025-06-18；旧版被协商提升到 2025-06-18（服务端新版实现） |
| B3  | HTTP 方法矩阵 | 确认仅 POST 可用、防 CSRF/异常传输 | GET/POST/PUT/PATCH/DELETE/HEAD/TRACE/OPTIONS /mcp | 仅 POST 正常，其余 405/404 | 🟢 GET→405、PUT/PATCH/DELETE/HEAD→404、OPTIONS→404、TRACE→405；仅 POST（GET /mcp 网关 405"Method Not Allowed"） |
| B4  | Content-Type / Accept 协商 | 确认请求头约束（MCP 规范强制） | 缺 Content-Type 或 Accept 的 POST | 缺头 → 400 | 🟢 缺 Accept: application/json, text/event-stream → 400；补头后正常（规范正确）。⚠️ 易错点：浏览器默认 Accept: text/html,... 直接 400；Content-Type 实测非必需，Accept 必需。注意：带 id 的请求返回 200，缺 id（notification）返回 202 空响应（见 §6 排障表） |
| B5  | SSE / 流式传输探测 | 老式 SSE 端点是否暴露 | GET /mcp?sse=1<br><br>、Accept: text/event-stream POST | 可能暴露 SSE 通道 | 🟢 405/400（仅 Streamable HTTP 实现，无 SSE） |
| B6  | OAuth2/认证发现端点 | 检查 MCP 规范 OAuth 2.1 是否启用 | GET /.well-known/oauth-authorization-server<br><br>、/.well-known/oauth-client-registration、/oauth/authorize | 存在 → 有标准认证；404 → 认证未实现 | 🔴 全部 404 → MCP 认证未启用（与 B1 互相印证） |
| B7  | 会话状态/无状态判定 | 判断 Stateless 还是 Stateful（stateless 无会话隔离） | 带 Mcp-Session-Id: x 重复 initialize；不带 session 反复 initialize | Stateless → 每次握手成功无状态绑定 | 🔴 无状态：伪造/任意/缺失 Mcp-Session-Id 均 200，二次 initialize 均成功 → 无会话隔离 |
| B8  | ping 与通知类 | 确认存活方法是否实现、异常可观测性 | {"method":"ping"}<br><br>；{"method":"notifications/initialized"} | ping→200；通知应静默 | 🟡 ping→200 {}；notifications/initialized → 500（实现缺失但以 500 暴露） |

## 阶段 C：能力枚举（tools/prompts/resources）

| #   | 测试名称 | 测试目的 | 测试 payload | 预期结果 | 本站实测 |
| --- | --- | --- | --- | --- | --- |
| C1  | tools/list 完整枚举 | 核心<br><br>：获取全部工具 schema，评估危险操作面 | {"method":"tools/list"} | 返回工具名/描述/inputSchema | 🔴 37 个工具全量 schema：删除类（delete_worksheet/batch_delete_records/delete_role）、写类（create/update_record 等）、角色操控（add/remove_member_from_role）、触发类（trigger_workflow）、读类（get_record_list）全暴露 |
| C2  | 危险工具分类 | 按 删/改/角色/触发/读 分级，评估未授权操作后果 | 对 C1 结果做危害分级矩阵 | 明确哪些工具可造成数据删改/权限操控/流程触发 | 🔴 见 evidence/.../mcp_tools_full.json；10+ 删除/写入/角色工具 |
| C3  | prompts/list | 提示词模板是否泄露 | {"method":"prompts/list"} | 可能泄露业务提示词/流程上下文 | 🟢 空数组；prompts/get{name:x}→结构化"Prompt not found"（实现存在但无内容） |
| C4  | resources/list + templates | 资源 URI 是否暴露文件/数据 | {"method":"resources/list"}<br><br>、resources/templates/list | 可能暴露文件 URI/数据模板 | 🟢 均空；resources/read file:///etc/passwd 落到门户 SPA（未实现资源面） |
| C5  | 隐藏方法探测 | 未文档化 JSON-RPC 方法（WebFlux SDK 内部） | roots/list<br><br>、sampling/createMessage、logging/setLevel、completions/complete | 未实现 → 500 或错误；实现 → 信息 | 🟡 上述未实现均返回 500（异常处理存在但暴露栈） |
| C6  | 500 栈泄露 | 触发异常读取完整调用链/依赖栈 | JSON-RPC batch 数组<br><br>：\[{"method":"tools/call",...}\] | 泄露 Java/Python 类名、SDK 精确实现 | 🔴 完整 Java 栈：MCP SDK WebFluxStatelessServerTransport + Reactor 全链路（确认实现栈可定向找已知漏洞） |

## 阶段 D：工具调用与后端鉴权

| #   | 测试名称 | 测试目的 | 测试 payload | 预期结果 | 本站实测 |
| --- | --- | --- | --- | --- | --- |
| D1  | 无副作用工具实际执行 | 证明 tools/call 可执行（而非仅枚举） | {"method":"tools/call","params":{"name":"get_time","arguments":{}}} | 返回真实数据 → 调用面激活 | 🔴 get_time → 返回真实服务器时间 "2026-10-09..." |
| D2  | 数据工具后端鉴权分层 | 核心<br><br>：区分 MCP 层认证与后端业务鉴权 | tools/call get_app_worksheets_list / get_record_list | 若后端未配置凭据 → 业务层错误 | 🟡 返回 {"success":false,"error_code":10001,"error_msg":"Http Headers verification failed"}——后端凭据缺失的偶然保护，非安全控制；运维补齐凭据后 37 工具全部可用 |
| D3  | 请求侧凭据注入绕过 | 尝试在参数/headers 注入后端凭据键 | arguments: {"headers":{...},"token":"x","app_key":"x",...}<br><br>；HTTP 头 Authorization/X-Token/X-Api-Key | 若 MCP 转发请求头 → 可能绕过 | ⚫ 全部仍 10001（服务端凭据域隔离，请求侧不可注入） |
| D4  | workflow 独立后端探测 | 发现与主站鉴权域不同的子服务 | tools/call get_workflow_list<br><br>；错误参数触发 Java 异常 | 独立服务返回不同错误格式 | 🟡 workflow 工具不返 10001 而返空/Map has no value for 'pageSize=50'（Java Map 错误直出）→ 独立 Java 服务，与主站不同凭据域 |

## 阶段 E：注入与滥用

| #   | 测试名称 | 测试目的 | 测试 payload | 预期结果 | 本站实测 |
| --- | --- | --- | --- | --- | --- |
| E1  | 命令注入 | 工具参数是否拼入 shell | process_id: "1;ls" / "1\|id" / "1\\<br><br>id\`" / "1$(id)" / "1&&whoami" / "1;bash -c 'id'"\| 响应含命令输出/时间变化 \| ⚫ 均无执行；仅;/编码字符触发后端{"errorCode":404,"errorMsg":"Bad Request"}\`（path 级拼接） |     |     |
| E2  | 模板/SSTI 注入 | 参数是否进模板引擎 | "${7*7}"<br><br>、"${jndi:ldap://127.0.0.1/a}" | 渲染值 / 出网 | ⚫ 无渲染无异常（普通字符串） |
| E3  | SQL 注入 | worksheet_id/row_id 等 ID 参数 | worksheet_id: "1' OR '1'='1"<br><br>、"1;SELECT 1" | 报错/时间差异 → 注入点 | ⚫ 无差异（业务层 10001 挡住，无法形成注入侧信道） |
| E4  | 路径遍历 | ID 参数路径穿越 | process_id: "../../../../etc/passwd"<br><br>、"..%2f..%2f"、"%00"、"%2f" | 读取文件 / 后端路径破坏 | 🟡 触发门户 404 HTML / 后端 404 Bad Request——确认被拼入 URL 路径，但无法读文件（请求目标固定为本服务） |
| E5  | SSRF | ID/URL 参数触发服务端请求 | process_id: "http://127.0.0.1:9200/"<br><br>（+14 端口指纹）、file:///etc/passwd、gopher://、URL 编码变体 | 端口开放/关闭响应差异 → SSRF 存在 | ⚫ 决定性证伪：14 端口全部与基线一致 empty，无连接状态差异 → 无出站请求，仅 path 拼接 |
| E6  | CRLF/请求头注入 | 参数注入换行构造请求 | process_id: "1\\r\\nHost: evil.com"<br><br>、"1\\nX-Head: 1" | 若拼入请求行/头 → 头注入/请求走私 | 🟡 换行 → 门户 404 HTML（URL 污染回退门户），未观察请求走私 |
| E7  | 反序列化注入（Java） | Jackson/Fastjson 多态类型处理探测 | arguments: {"@type":"java.lang.Runtime"}<br><br>、{"@type":"com.sun.rowset.JdbcRowSetImpl","dataSourceName":"ldap://..."}、{"$type":"java.lang.ProcessBuilder"} | 若类型被解析 → gadget 面 | ⚫ 全被当普通 Map 键（Map has no value for '$type=...'）→ plain Map 反序列化，非 Fastjson，无 gadget |
| E8  | 反序列化注入（.NET） | 门户.NET 端 TypeNameHandling 探测 | POST /api/oauth2/authorizeAjax {"account":{"\__type":"System.Exception, mscorlib",...}} | 类型解析 →.NET gadget | ⚫ 全部返回同一 NullReferenceException（该接口本身所有输入同错误），无分歧 |
| E9  | 资源消耗/DoS（可选） | 大参数/批量调用资源耗尽 | 10KB 字段、超大 batch | 观察超时/内存 | ⚪ 未执行（授权测试边界，无 DoS 授权） |

## 阶段 F：信息泄露

| #   | 测试名称 | 测试目的 | 测试 payload | 预期结果 | 本站实测 |
| --- | --- | --- | --- | --- | --- |
| F1  | 错误消息差异枚举 | 用户/资源存在性判定 | 同一工具不同 ID/名称，对比错误文案 | 不同错误 → 存在性侧信道 | 🟡 prompts/get "Prompt not found: x" 回显输入（存在性面小）；Map has no value for '...' 回显参数 |
| F2  | 平台技术栈泄露 | 语言/框架/版本 | 触发.NET/Java 错误、观察异常文案 | 泄露实现栈 | 🔴.NET 门户错误直出（Object reference not set to an instance of an object.）；Java MCP 栈直出 |
| F3  | 敏感文件探测 | 源码/凭据/备份 | /.git/HEAD<br><br>、/.env、/web.config、/appsettings.json、/backup.zip、/db.sql、/admin、/file/ | 源文件/备份/管理端泄露 | 🟢 全部 404；/appsettings.json、/admin 为 SPA fallback（200 但门户页）；/file/ 403（目录列举禁止） |
| F4  | 业务数据未授权读取 | 若后端凭据已配，数据面是否直接可读 | tools/call get_record_list<br><br>/find_member/get_record_share_link | 未授权读数据库/人员信息/分享外链 | 🟡 当前 10001 挡住；条件性高危（见 D2）：后端凭据补齐后 37 工具含 find_member（人员枚举）、get_record_share_link（外链泄露）全部可用 |

* * *

## 3\. 常见错误响应速查与排障（实测根因）

> 测试过程中最常见的"假阴性"来源：请求格式不满足 MCP Streamable HTTP 约束， 得到 400/202/404 却误判为"端点不通/工具不存在"。先对照本表排掉工具链问题，再谈漏洞。

## 3.1 响应码速查表

| 响应码 | 含义  | 常见根因 | 正确姿势 |
| --- | --- | --- | --- |
| 400 Bad Request | 协议/头约束不满足 | ⚠️ 缺 Accept: application/json, text/event-stream（最常见，浏览器默认 text/html 直接 400）；畸形 JSON；空 body；未知 method | 请求头必须含 Accept: application/json, text/event-stream（Content-Type 实测非必需） |
| 202 Accepted + 空 body | JSON-RPC 通知被接收但不返回结果 | ⚠️ 请求体缺 "id" 字段 → 被当 notification 处理，有进无出 | body 必须带 "id": 1（任意数）才是 request，才会回 200+result |
| 200 OK | 请求成功 | 正常（tools/list / tools/call / ping / initialize） | ——  |
| 405 Method Not Allowed | 方法不允许 | GET /mcp<br><br>（只接受 POST）；TRACE /mcp | 一律 POST；OPTIONS 本应支持但本站 404（CORS 预检被禁=403，见 6.2） |
| 404 Not Found | 路径不存在 | 猜的路径不对；URL 污染回退门户（process_id 注入 \\n/.. 时）；网关默认规则（/api/account/\* 全 405/404） | 区分"真实不存在" vs "注入破坏路径"——用对照路径验证 |
| 500 + 栈 | 未捕获异常 | JSON-RPC batch 数组、未实现方法（notifications/sampling/logging/roots）→ 服务器兜底异常 | ✅ 可利用：免费泄露 Java/.NET 栈与 SDK 精确实现（C6） |
| 10001 头部校验失败 | 后端业务层鉴权失败 | MCP Server → 后端 API 缺服务端凭据（非客户侧可控） | 属后端无凭据的"偶然保护"，非安全控制；不能注入绕过（D3） |

## 3.2 最小可用请求模板（本站实测 200）

```apache
curl -sk "https://xxx.xxx.xxx:8080/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

| 检查项 | 必须  | 说明  |
| --- | --- | --- |
| 方法  | POST | GET 405 |
| Accept | ✅   | application/json, text/event-stream<br><br>；text/html → 400 |
| Content-Type | 建议  | 实测可省，但规范要求 |
| body "id" | ✅   | 缺失 → 202 空响应 |
| jsonrpc<br><br>字段 | 建议  | 缺失也能跑（{"method":...} 也行）但按规范应带 |

## 3.3 三种最常见的"误判为漏洞/不通"场景

误判"端点不通"：直接复制浏览器请求（Firefox/Chrome Accept 都是 text/html）POST /mcp → 400。 → 先换Accept: application/json, text/event-stream，也是 400 再谈其他。

误判"服务器无响应"：body 忘带id→ 202 空 body，以为工具没实现。 → 补"id":1即返回完整 result（本站 tools/list 54311 字节）。

误判"SSRF/命令注入"：process_id 注入;/\\n返回 404/HTML，以为是执行痕迹。 → 对照普通值基线 + 多端口指纹，确认是 path 拼接而非出站请求.
