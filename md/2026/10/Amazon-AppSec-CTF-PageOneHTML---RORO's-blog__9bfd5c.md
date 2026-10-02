---
title: "Amazon AppSec CTF: PageOneHTML - RORO's blog"
source: https://blog.rodolpheg.xyz/posts/pageronehtlm/
source_host: blog.rodolpheg.xyz
clip_date: 2026-10-02T10:32:03+08:00
trace_id: b91305fe-509a-4778-b291-1b11fc803b7a
content_hash: 9481e3c851280326a373962fa4e0424a7f6db105b3bf3c674867f4e745d254ae
status: synced
tags:
  - 漏洞分析
  - 协议分析
series: null
feed_source: RORO·AppSec审计
ai_summary: Amazon AppSec CTF 的 PageOneHTML 题靠 `node-libcurl` 缺失协议校验，用 gopher:// 构造 SSRF 打通内部 `/api/dev` 接口并读取 flag。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ed75244-d011-81a2-b871-cacea6c4e32d
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Amazon AppSec CTF 的 PageOneHTML 题靠 `node-libcurl` 缺失协议校验，用 gopher:// 构造 SSRF 打通内部 `/api/dev` 接口并读取 flag。
> 
> - **漏洞入口：** `/api/convert` 接收用户提交的 markdown，其中 `ImageConverter` 会提取所有 `<img>` 标签的 `src` 交给 `ImageDownloader.js` 下载。
> - **根本原因：** `ImageDownloader.js` 调用 `curly.get(url)` 时未做 URL 校验或协议白名单，libcurl 支持的 http/https/ftp/gopher/dict/file 等协议全部可用，且非图片响应会被 base64 编码后原样返回，造成内容泄露。
> - **利用手法：** 把发往内部 `/api/dev` 的原始 HTTP 请求转成 gopher 格式 `gopher://host:port/_<data>`，空格编码为 `%20`、CRLF 编码为 `%0D%0A` 并加前导下划线，再嵌入 img 标签的 src 触发请求。
> - **防护缺陷：** 内部接口仅依赖来源 IP 与硬编码 API key 保护，无出口过滤、目标校验、限速和监控，属静态凭证 + 弱访问控制。
> - **修复建议：** 生产环境移除 `/api/dev`，改用 OAuth/JWT 等正规认证，对 URL 与协议做白名单校验，并补充限流与第三方依赖审计。

## Executive Summary

-   **Challenge**: PageOneHTML
-   **Category**: Web Security
-   **Vulnerability**: Server-Side Request Forgery (SSRF) via gopher:// protocol
-   **Impact**: Access to internal API endpoint leading to flag disclosure
-   **Flags**:

## 漏洞入口与数据流

The vulnerability starts at `/api/convert` endpoint which accepts user-controlled markdown content:

The `ImageConverter` extracts all `<img>` tags and processes their `src` attributes:

The critical vulnerability lies in `ImageDownloader.js` using `node-libcurl` without protocol validation:

**Key vulnerabilities:**

1.  `curly.get(url)` accepts ANY protocol supported by libcurl (http, https, ftp, gopher, dict, file, etc.)
2.  Non-image responses are base64-encoded and returned, leaking their content
3.  No URL validation or protocol allowlisting

The internal `/api/dev` endpoint is protected only by IP and API key:

#### Step 1: Craft the Raw HTTP Request

We need to send this HTTP request to the internal endpoint:

#### Step 2: Convert to Gopher URL

## Gopher 请求构造

The gopher protocol format: `gopher://host:port/_<data>`

-   URL-encode spaces as `%20`
-   URL-encode CRLF as `%0D%0A`
-   Prefix the data with `_`

#### Step 3: Embed in HTML Image Tag

1.  **Send the exploit payload:**

2.  **Extract and decode the base64 response:**

**Local Output:**

**Python exploit script:**

**Remote Output:**

## 漏洞要点归纳

1.  **Protocol Confusion** - `node-libcurl` accepts all protocols without validation
2.  **SSRF** - No egress filtering or destination validation
3.  **Response Leakage** - Non-image content encoded and returned
4.  **Weak Access Control** - Internal endpoint relies on source IP only
5.  **Static Credentials** - Hardcoded API key in source code

## 修复建议

-   Remove `/api/dev` endpoint in production
-   Use proper authentication mechanisms (OAuth, JWT)
-   Implement rate limiting and monitoring

1.  **Initial Analysis** - Code review reveals SSRF vector via `node-libcurl`
2.  **Protocol Testing** - Confirmed gopher:// protocol support
3.  **Payload Development** - Crafted gopher URL with HTTP request
4.  **Local Exploitation** - Retrieved test flag from Docker environment
5.  **Remote Exploitation** - Successfully extracted production flag

1.  **Never trust user input** - All URLs should be validated
2.  **Principle of least privilege** - Use minimal protocol support
3.  **Defense in depth** - Multiple security layers needed
4.  **Secure defaults** - Libraries should be configured securely
5.  **Regular security audits** - Third-party dependencies need review
