---
title: "Amazon AppSec CTF: HalCrypto - RORO's blog"
source: https://blog.rodolpheg.xyz/posts/halcrypto/
source_host: blog.rodolpheg.xyz
clip_date: 2026-10-02T10:31:41+08:00
trace_id: 970e0f35-f446-4242-bcac-f7fd85bd607b
content_hash: 20704759522b58def58ef9c9cb70bb24b1854325525d101cbacf68b0d2ba756a
status: synced
tags:
  - CTF
  - 漏洞分析
series: null
feed_source: RORO·AppSec审计
ai_summary: HalCrypto 利用 JWT 的 JKU 头校验缺陷：@ 符号造成 URL 解析混淆，服务端误信恶意域名，从而伪造管理员 JWT 拿 flag。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ed75244-d011-816a-bc1c-f6ed8e26e9e0
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> HalCrypto 利用 JWT 的 JKU 头校验缺陷：@ 符号造成 URL 解析混淆，服务端误信恶意域名，从而伪造管理员 JWT 拿 flag。
> 
> - **漏洞点：** AuthMiddleware 用 `lastIndexOf(str,0)` 仅检查 JKU 是否以 `http://127.0.0.1:1337` 等开头，未做标准 URL 解析。
> - **利用原理：** JKU 设为 `http://127.0.0.1:1337@attacker.com`，校验通过，HTTP 客户端却把 `@` 前视为凭据并连接 `attacker.com`。
> - **攻击链：** 恶意 JWKS 服务→伪造 JWT→`relais.dev` 隧道→访问 `/dashboard`，得到 `HTB{r3d1r3c73d_70_my_s3cr37s}`。
> - **修复启示：** 安全校验不能靠字符串操作；应解析 URL、限制 JKU 白名单与出网，并遵循 RFC 8725。

## Executive Summary

-   **Challenge**: HalCrypto
-   **Category**: Web Security
-   **Vulnerability**: JWT validation bypass via URL confusion with @ symbol
-   **Impact**: Authentication bypass leading to admin access
-   **Flag**: `HTB{r3d1r3c73d_70_my_s3cr37s}`

The vulnerability starts when the AuthMiddleware processes JWT tokens:

## 脆弱校验代码位置

The critical vulnerability lies in line 14 of `AuthMiddleware.js`:

**Why this is vulnerable:**

-   `lastIndexOf(searchString, 0)` only checks if the string starts with `searchString`
-   It’s a simple string comparison, not proper URL parsing
-   Doesn’t account for URL syntax like authentication credentials (`user:pass@host`)

## JKU 允许前缀

The application expects JKU URLs to start with either:

-   Production: `http://halcrypto.htb:1337`
-   Development: `http://127.0.0.1:1337`

The JWTHelper fetches the public key from the attacker-controlled URL:

The `nodeFetch` function that actually makes the HTTP request:

## @ 符号解析差异

**Key Insight**: The validation sees `127.0.0.1:1337` as part of the URL, but HTTP clients interpret it as authentication credentials and connect to `attacker.com` instead.

#### 1\. Malicious JWKS Server (solve.py)

#### 2\. Generated Malicious JWT Structure

#### 3\. Attack Execution

## 弱点归类

1.  **Weak URL Validation**
    
    -   Uses `lastIndexOf` string operation instead of proper URL parsing
    -   Doesn’t validate URL structure or components
2.  **URL Parsing Ambiguity**
    
    -   Different interpretation of `@` symbol between validator and HTTP client
    -   No sanitization of URL authentication components
3.  **JWKS Trust Model**
    
    -   Blindly trusts any JWKS from “validated” URL
    -   No certificate pinning or additional verification
4.  **Missing Security Controls**
    
    -   No egress filtering for JWKS fetching
    -   No allowlist of trusted JWKS endpoints
    -   Static configuration without runtime validation

## 攻击步骤时间线

1.  **Initial Reconnaissance** - Identified JWT-based authentication with JKU header
2.  **Source Code Analysis** - Found vulnerable `lastIndexOf` validation
3.  **URL Confusion Research** - Discovered `@` symbol bypass technique
4.  **Exploit Development** - Created malicious JWKS server and JWT generator
5.  **Tunnel Setup** - Established external access via `relais.dev`
6.  **Attack Execution** - Successfully bypassed authentication
7.  **Flag Retrieval** - Accessed admin dashboard and extracted flag

Successfully accessing `/dashboard` with the forged JWT revealed:

## 安全教训

1.  **URL Parsing Complexity** - URLs have many components that can be interpreted differently
2.  **String Operations ≠ Security** - Never use string operations for security validations
3.  **Trust Boundaries** - External resources should never be blindly trusted
4.  **Defense in Depth** - Multiple layers of validation are necessary
5.  **Standards Compliance** - Follow JWT security best practices (RFC 8725)
