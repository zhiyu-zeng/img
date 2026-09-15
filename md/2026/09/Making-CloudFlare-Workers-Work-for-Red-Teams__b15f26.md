---
title: Making CloudFlare Workers Work for Red Teams
source: https://blog.zsec.uk/capd/
source_host: blog.zsec.uk
clip_date: 2026-09-15T10:18:12+08:00
trace_id: 0e701ced-1cce-492a-b6a1-188daa0f5fea
content_hash: e826e110c746c07dc7716153108973232dfcabba70df4491e0f42f4785cca8e6
status: synced
tags:
  - 安全工具
  - 网络工具
series: null
feed_source: zsec·逆向安全
ai_summary: "**TL;DR：** 用 CloudFlare Workers + Pages 实现条件访问载荷投递（CAPD）：只有请求头带正确令牌才返回文件，否则统一 503，无源站、令牌可秒级轮换。"
ai_summary_style: key-points:weak
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 3dc75244-d011-8152-9d3d-fa26696c60b9
ioc:
  cves: []
  cwes: []
  hashes:
    - 6288f2e08c599e01fd28566e7aa38d54f37439c8a5a6c46cf08a2b8bdfad0b8a
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points:weak）**
>
> **TL;DR：** 用 CloudFlare Workers + Pages 实现条件访问载荷投递（CAPD）：只有请求头带正确令牌才返回文件，否则统一 503，无源站、令牌可秒级轮换。
> 
> - **拦截原理：** 项目 `functions/_middleware.ts` 中 `onRequest` 拦截全部请求，比对 `PRESHARED_AUTH_HEADER_KEY/VALUE`，通过后才由 Worker 自身经 `context.env.ASSETS.fetch(PAYLOAD_PATH)` 取回静态资源，客户端从不直接触达文件。
> - **部署与验证：** 用 Volta 装 Node，`npm install wrangler --save-dev`；文件放根目录并取不可猜的名字，`npx wrangler pages deploy . --project-name <id>` 一并推送静态资源与函数。带正确头 `curl -I` 得 200，缺失或错误则 503。
> - **安全加固：** 令牌存 Pages/Workers 环境变量以实现不重新部署即轮换；令牌比较改用 `crypto.subtle.timingSafeEqual` 并做等长处理以防时序攻击；多令牌映射多文件可隔离不同行动。
> - **可调行为：** 失败响应可换成 404 或无害 200 页避免固定指纹；二进制载荷加 `Content-Disposition: attachment`、`X-Content-Type-Options: nosniff`；上线前用 `npx wrangler pages dev .` 本地验证。
> - **蓝队检测：** 关注代理日志中发往 `*.pages.dev` 的授权头、单主机 503→200 的状态切换、`application/octet-stream` 类内容类型、非浏览器进程（certutil/curl/powershell）的出站连接、新出现的 Pages 子域解析及 JA3/JA4 指纹异常；文中附 Sigma 规则与多段 SIEM 查询。
> - **局限：** 需信任 CloudFlare 托管载荷，免费版每日 10 万请求上限，且加密头使被动监听难以取证，检测主要依赖 TLS 解密代理与终端可见性。

![Making CloudFlare Workers Work for Red Teams](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/555976c8b8c1e524.jpg)

There are situations when you want to deliver arbitrary content, be it a file, binary, picture or otherwise, and you need to be able to restrict access via some equally arbitrary means. It's easy enough to do this using an Apache server and some `mod_rewrite` rules but you can just as easily employ CloudFlare Workers to have a highly-available(when CF doesn't crash the world, they're 2/2 in recent times!), rapidly updatable delivery method. There's also a bunch of different names for this technique but I like the idea of Conditional Access Payload Delivery (CAPD).

## Why CloudFlare Workers?

CloudFlare Workers run at the edge across lots of locations with no origin required your payload is served from wherever is closest to the requesting host. Access key rotation is instant (environment variable change, no redeploy), there's no server to fingerprint, and you get CloudFlare's DDoS protection for free.

I love serverless architecture things and payload delivery is no different, you may already be aware of doing conditional access with an Apache `mod_rewrite` rule or a simple authenticated endpoint on your C2 redirector. Both work and both have pros and cons. Having something that sits without a server behind it tightens up the infrastructure profile, it makes it easier to maintain and gives geographic flexibility.

The downsides: you're trusting CloudFlare with your payload, there's a learning curve if you're not familiar with Workers, and the free tier has request limits (100k/day) that matter for high-volume ops. For most red team delivery scenarios, the availability and operational flexibility outweigh these.

## Prerequisites

You will want to use CloudFlare's CLI tool [wrangler](https://developers.cloudflare.com/workers/wrangler/?ref=blog.zsec.uk) to deploy your Pages content and integrate the Worker function. You cannot use the direct upload method if you want to have the automated function deployment. Wrangler is an `npm` package and, if you don't have a Node version manager installed already, I'd recommend using Volta.

```
curl https://get.volta.sh | bash
volta install node
node --version
```

or if you're on windows you can install it with winget:

```bash
winget install Volta.Volta
volta install node
node --version
```

## Project Structure

Create a new folder to work from and install wrangler.

```bash
mkdir capd && cd capd
npm install wrangler --save-dev
```

For storing your Worker function code, you'll need a subdirectory called functions. Then create a Typescript file in the subdirectory. I'll use an example called `_middleware.ts` which you'll find a little further on in the post.

```
mkdir functions
touch functions/_middleware.ts
```

In the root of the foo directory, you will want to put any file, binary, etc. that you wish to make available. If you don't want the files to be discoverable by exhaustive or common path search, you should give the file a long unguessable name. As a suggestion, you could use the hash digest of the file.

## Request Flow

Before exploring the code, here's how the process flow works:

![Making CloudFlare Workers Work for Red Teams](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f7cbdeaa23a63e50.png)

Making CloudFlare Workers Work for Red Teams

The client never touches the static asset directly. The Worker intercepts every request, validates the token, and only then fetches from Pages internally. Failed auth returns a generic error with no indication the asset exists. Now to better visualise multi token CAPD in use here's another diagram:

![Making CloudFlare Workers Work for Red Teams](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1feaee2f2d021474.png)

Making CloudFlare Workers Work for Red Teams

## The Middleware Function

Edit your Typescript file and add the following code. You will need to update the various constants with your respective values. `PRESHARED_AUTH_HEADER_KEY` is used as an HTTP header key name, to be supplied in the inbound request. `PRESHARED_AUTH_HEADER_VALUE` is the corresponding value. `PAYLOAD_PATH` is the full URL to the file you wish to deliver. This is used in the script to retrieve the asset directly. This request is made by the Worker itself so can bypass the gating.

```javascript
const PRESHARED_AUTH_HEADER_KEY = "Authorization";
const PRESHARED_AUTH_HEADER_VALUE = "Basic 6288f2e08c599e01fd28566e7aa38d54f37439c8a5a6c46cf08a2b8bdfad0b8a";
const PAYLOAD_PATH = "https://cloudflare_project_name.pages.dev/random_file_name"

const servePayload = async (context) => {
  if (context.request.headers.has(PRESHARED_AUTH_HEADER_KEY)) {
    const auth_token = context.request.headers.get(PRESHARED_AUTH_HEADER_KEY);
    if (PRESHARED_AUTH_HEADER_VALUE == auth_token) {
      try {
        const asset = await context.env.ASSETS.fetch(PAYLOAD_PATH);
        
        if (!asset.ok) {
          // Asset missing or inaccessible - fail silently
          return new Response("Service Unavailable", { status: 503 });
        }
        
        const newResponse = new Response(asset.body, asset);
        newResponse.headers.set("Cache-Control", "no-store");
        return newResponse;
      } catch (err) {
        // Don't leak stack traces or error details
        return new Response("Service Unavailable", { status: 503 });
      }
    }
  }

  return new Response("Service Unavailable", {
    status: 503
  });
};

export const onRequest = [servePayload];
```

The try/catch ensures that a missing file, network hiccup, or any other failure mode returns the same generic 503 as an invalid token; no stack traces, no differentiation for attackers to fingerprint.

This function will return the `PAYLOAD_PATH` in response to every request which passes the check for the header. It doesn't matter what URL path is in the inbound URL as the response is crafted from a constant value. If you want to enable multiple different files to be returned, you could use the path parameter of the URL to target files, or alternatively, use multiple different header values in combination with if conditions to return the specific file based on with value is in the header.

## Deployment

Once you've prepared the script and the files, head over to CloudFlare and create a new Pages instance. Get the project ID, which is the name you gave the Pages instance. When naming your Pages instance, I'd suggest using something subtle or relatively clandestine.

```
cd capd
ls
./random_file_name ./functions/_middleware.ts
npx wrangler pages deploy . --project-name <cloudflare_project_id>
```

This will push your static files up and also deploy the function code into a Worker.

## Verification

Once the deployment is finished, you can test it using cURL. If the function is working correctly, you'll get a 200 OK response if you pass the right header value.

```
curl -I -H "Authorization: Basic 6288f2e08c599e01fd28566e7aa38d54f37439c8a5a6c46cf08a2b8bdfad0b8a" https://cloudflare_project_name.pages.dev/

HTTP/2 200
```

Any request which doesn't include the valid header will return a 503 Service Unavailable response.

```
curl -I https://cloudflare_project_name.pages.dev/

HTTP/2 503
```

A particularly helpful feature of using this gated method is that you can easily swap out the content being delivered for any token without having to make any modifications to the client or binary that is requesting the content.

## Variations & Extensions

### Environment variables instead of hard-coding secrets

In a real deployment you shouldn't commit the token to source. Use a Pages/Workers environment variable instead:

```javascript
const key = "Authorization";

export const onRequest = async (context) => {
  const expected = context.env.PRESHARED_AUTH_HEADER_VALUE;
  const provided = context.request.headers.get(key) || "";

  if (provided === expected) {
    // serve payload
  }

  return new Response("Not Found", { status: 404 });
};
```

This lets you rotate tokens instantly without redeploying the whole project.

### Timing-safe Comparison

The basic `==` comparison is vulnerable to timing attacks-an attacker can statistically determine the correct token by measuring response times. In practice this is hard to exploit over the network, but if you want to harden the implementation:

```typescript
async function safeCompare(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  
  if (aBytes.length !== bBytes.length) {
    // Compare against self to maintain constant time
    await crypto.subtle.timingSafeEqual(aBytes, aBytes);
    return false;
  }
  
  return crypto.subtle.timingSafeEqual(aBytes, bBytes);
}

// Usage in your handler
const provided = context.request.headers.get(key) || "";
if (await safeCompare(provided, expected)) {
  // serve payload
}
```

This uses the Web Crypto API available in Workers. The length check branch still calls `timingSafeEqual` to avoid leaking length information through timing differences.

### Per-campaign or per-payload tokens

If you need several payloads or want token separation across different engagements, map multiple header values to different files:

```
const TOKENS = {
  "Basic tokenA": "https://…/payloadA",
  "Basic tokenB": "https://…/payloadB"
};
```

This allows you to maintain clean boundaries and retire access on a per-operation basis. A really good use-case for this is if you're delivering an initial access payload and want to evade detection you can switch out the payload being delivered in realtime with remote shellcode load and conditional access delivery.

### Adjusting the failure mode

Returning a `503` works, but depending on the environment you may prefer more generic responses:

-   404 Not Found to blend in with dead paths
-   200 OK returning a harmless HTML page
-   or a small rotation of innocent responses

This avoids creating a consistent signature for the blue team to fingerprint.

### Controlling file behaviour

For payloads you want to be downloaded directly rather than rendered:

```python
newResponse.headers.set("Content-Disposition", "attachment; filename=update.bin");
newResponse.headers.set("X-Content-Type-Options", "nosniff");
```

Useful when returning binaries or tools that shouldn't be displayed inline.

### Local testing with Wrangler

Before deploying, you can test the header protection locally:

```
npx wrangler pages dev .
```

This verifies the logic without pushing to CloudFlare and unnecessarily exposing tooling too early for your campaign.

### Minimal Logging Benefit

Workers can log which clients successfully fetch the payload-handy for deconfliction, timings, or tracking which token has actually been used. This keeps logs minimal and avoids storing anything sensitive; just timestamps and request metadata if needed.

## Blue Team Detection Angle

CAPD Workers leave patterns defenders can hunt for across network telemetry, endpoint logs, and proxy data. Understanding these indicators helps both sides red teams can refine their tradecraft, and blue teams know what to look for when spotted in the wild.

I'll preface with I'm not a detection engineer or blue team by day therefore some of the detections below might not be overly accurate, but I hope that they give the people much smarter than me, ideas of how to detect better.

### Network-Level Indicators

**Unusual Header Patterns**

Custom authentication headers stand out in proxy logs. Most legitimate CloudFlare Pages traffic doesn't require `authorization` headers for static content. Look for:

-   `Authorization` headers to `*.pages.dev` or custom domains fronting Pages
-   Non-standard header names appearing consistently across requests
-   Header values resembling tokens or hashes rather than standard Basic/Bearer auth

```sql
index=proxy sourcetype=bluecoat OR sourcetype=zscaler
| where like(dest, "%.pages.dev") OR like(dest, "%.workers.dev")
| where isnotnull(http_authorization)
| stats count by src_ip, dest, http_authorization, http_user_agent
| where count < 10
```

**Response Code Anomalies**

The conditional access logic creates a binary response patterned 503 for invalid tokens, 200 for valid ones. A host receiving 503s then suddenly getting 200s may indicate successful token use or staged payload fetch.

```python
index=proxy dest="*pages.dev*"
| bin _time span=5m
| stats values(http_status) as status_codes, count by src_ip, dest, _time
| where mvcount(status_codes) > 1 AND match(status_codes, "503") AND match(status_codes, "200")
```

**Content-Type Mismatches**

Cloudflare Pages typically serves web content. Binary payloads with `application/octet-stream` or `application/x-msdownload` warrant investigation:

```rust
CommonSecurityLog
| where DestinationHostName endswith ".pages.dev"
| where ResponseContentType in ("application/octet-stream", "application/x-msdownload", "application/x-executable")
| project TimeGenerated, SourceIP, DestinationHostName, RequestURL, ResponseContentType
```

### Endpoint Detection

**Process Network Connections**

Monitor for non-browser processes connecting to `*.pages.dev` or `*.workers.dev`, particularly LOLBins (certutil, curl, powershell, bitsadmin), recently-dropped executables or low prevelance exes.

```html
<!-- Sysmon Event ID 3 -->
<RuleGroup groupRelation="and">
  <NetworkConnect onmatch="include">
    <DestinationHostname condition="end with">.pages.dev</DestinationHostname>
    <Image condition="excludes">chrome.exe</Image>
    <Image condition="excludes">firefox.exe</Image>
    <Image condition="excludes">msedge.exe</Image>
  </NetworkConnect>
</RuleGroup>
```

**File Downloads with Suspicious Characteristics**

Watch for files from CF infrastructure landing in unusual directories (temp, appdata, public) that are immediately executed:

```sql
DeviceFileEvents
| where RemoteUrl endswith ".pages.dev"
| where FolderPath has_any ("temp", "appdata", "public")
| join kind=inner (DeviceProcessEvents | where Timestamp > ago(5m)) on FileName
| project Timestamp, DeviceName, FileName, FolderPath, RemoteUrl, ProcessCommandLine
```

### DNS and Traffic Analysis

**New Pages Subdomain Resolution**

Track DNS queries for Pages subdomains that don't match known business applications:

```kotlin
index=dns 
| where like(query, "%.pages.dev")
| stats earliest(_time) as first_seen, count by query, src_ip
| where first_seen > relative_time(now(), "-7d")
```

**JA3/JA4 Fingerprinting**

Custom tooling often has distinctive TLS fingerprints. Alert on unusual fingerprints connecting to CF Pages that don't match known browsers or applications.

### Sigma Rules

```sql
title: Potential Conditional Access Payload Delivery via Cloudflare Pages
status: experimental
description: Detects non-browser processes accessing Cloudflare Pages with authorization headers
logsource:
    category: proxy
detection:
    selection:
        c-uri|endswith:
            - '.pages.dev'
            - '.workers.dev'
        cs-authorization|contains: 
            - 'Basic'
            - 'Bearer'
    filter:
        cs-user-agent|contains:
            - 'Chrome'
            - 'Firefox'
            - 'Edge'
    condition: selection and not filter
level: medium
```

```sql
title: Binary Content Downloaded from Static Hosting Platform  
id: b2c3d4e5-f6a7-8901-bcde-f12345678901
status: experimental
description: Detects executable content downloaded from static hosting platforms
logsource:
    category: proxy
detection:
    selection_destination:
        c-uri|endswith:
            - '.pages.dev'
            - '.workers.dev'
            - '.netlify.app'
            - '.github.io'
    selection_content:
        rs-content-type:
            - 'application/octet-stream'
            - 'application/x-msdownload'
    condition: selection_destination and selection_content
level: high
```

### Hardening Recommendations

1.  **Proxy Policy** - Require explicit approval for `*.pages.dev` access or restrict to known business subdomains
2.  **DLP Rules** - Alert on executable content types from static hosting platforms
3.  **Endpoint Controls** - Application allowlisting prevents arbitrary binaries executing regardless of delivery method
4.  **DNS Filtering** - If you don't use CF Pages internally, consider monitoring the domain pattern

This technique is difficult to detect reliably because CF is legitimate infrastructure with massive footprint, HTTPS encrypts authorisation headers from passive observers, and CF edge IPs are shared across millions of sites. The best detection opportunities exist at TLS-terminating proxies and on endpoints. Without TLS inspection or endpoint visibility, these indicators become significantly harder to action.

## So with all this knowledge, please don't go doing crime now.

![Making CloudFlare Workers Work for Red Teams](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/492dacc425c6734e.png)

Making CloudFlare Workers Work for Red Teams
