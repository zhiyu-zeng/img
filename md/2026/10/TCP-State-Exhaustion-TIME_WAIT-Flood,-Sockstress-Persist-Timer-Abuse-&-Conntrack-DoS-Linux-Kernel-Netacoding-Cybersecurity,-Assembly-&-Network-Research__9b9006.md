---
title: "TCP State Exhaustion: TIME_WAIT Flood, Sockstress Persist Timer Abuse & Conntrack DoS | Linux Kernel | Netacoding | Cybersecurity, Assembly & Network Research"
source: https://netacoding.com/posts/tcp-state-exhaustion/
source_host: netacoding.com
clip_date: 2026-10-01T10:20:29+08:00
trace_id: 79ce5c81-8dcc-4d19-b55a-d6d9a72de1e2
content_hash: a416431215ead943bb17d77292f40d5cfc694b09bfb2eec5377178c156521f70
status: synced
tags:
  - 协议分析
  - 漏洞分析
series: null
feed_source: Netacoding·协议/逆向
ai_summary: TCP 连接上限由内核状态（socket、fd、conntrack、四元组）决定而非 65536 端口数；TIME_WAIT 堆积与 Sockstress 零窗口持久计时器滥用是两类仍有效的状态耗尽攻击。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ec75244-d011-819e-9ecd-de66202e54c6
ioc:
  cves:
    - CVE-2023-44487
  cwes:
    - CWE-290
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> TCP 连接上限由内核状态（socket、fd、conntrack、四元组）决定而非 65536 端口数；TIME_WAIT 堆积与 Sockstress 零窗口持久计时器滥用是两类仍有效的状态耗尽攻击。
> 
> - **核心纠错：** 连接由 `(源IP,源端口,目的IP,目的端口)` 四元组唯一标识，单一客户端到单目标端口可用源端口约 28000 个（`ip_local_port_range=32768 60999`），加一个 IP 即再加 28000，真正瓶颈是 socket 表、fd、conntrack 与内核内存。
> - **TIME_WAIT 机制：** 主动关闭方进入 TIME_WAIT，Linux 硬编码 `TCP_TIMEWAIT_LEN (60*HZ)` 即 60 秒且无法用 sysctl 调；代价按四元组计，单后端场景约 466 连接/秒即耗尽源端口报 `EADDRNOTAVAIL`。
> - **废弃参数警告：** `tcp_tw_recycle` 在 NAT 下静默丢包，已于 Linux 4.12 移除；应使用仅作用于出向连接的 `tcp_tw_reuse`。
> - **Sockstress 原理：** 完成正常握手（绕过 SYN cookie）后通告窗口 0，使服务器卡在 Persist Timer 直到 `tcp_retries2` 耗尽（默认约 15 分钟/连接），攻击者几乎零成本，服务器每连接消耗 struct sock、fd、conntrack、sk_buff。
> - **缓解配置：** `tcp_retries2=5`、`somaxconn=4096+`、调 `nf_conntrack_max`，关键规则 `iptables -m connlimit --connlimit-above 100 --connlimit-mask 32 -j REJECT`，并以 `ss -s` 监控状态表；同族 L7 变体包括 Slowloris、HTTP/2 Rapid Reset（CVE-2023-44487）与 CONTINUATION flood。

There is a popular framing of TCP connection limits that goes something like this:

> *“There are only 65,536 ports, so a host can handle 65,536 connections.”*

This is wrong on both counts — wrong about what’s limited, and wrong about what the limit means. The actual capacity ceiling has very little to do with how many port numbers exist. It has to do with **kernel state**: socket structures, file descriptors, conntrack entries, and the geometry of 4-tuple uniqueness.

When that state runs out, the host stops accepting new connections — not because it has no port numbers left, but because it has no memory of connections left. Two attack families weaponize this directly: **TIME_WAIT exhaustion** (a passive accumulation problem) and **Sockstress** (an active state-pinning attack). Both are conceptually simple. Both are still operationally relevant in 2026, on the systems where they shouldn’t be.

* * *

## The 4-Tuple, Not the Port

The kernel identifies a TCP connection by a tuple of four values:

```
(source_ip, source_port, destination_ip, destination_port)
```

Two connections sharing three of those values can coexist as long as the fourth is different. This means a single client IP, connecting to a single server IP on a single port (say `10.0.0.5:443`), is limited only by its own ephemeral port range — on Linux, typically:

```
$ sysctl net.ipv4.ip_local_port_range
net.ipv4.ip_local_port_range = 32768 60999
```

That gives roughly **28,000 usable source ports** per `(src_ip, dst_ip, dst_port)` combination. Add a second destination IP and you have another 28,000. Add another source IP and you have another 28,000.

The “65,536 port limit” is a property of the port number field width, not a property of how many connections a host can hold. A busy server with thousands of clients regularly holds millions of simultaneous TCP sockets without bumping into the port ceiling at all — because each connection is differentiated by the *client* tuple, not by anything on the server side.

The real limits sit elsewhere: socket table size, file descriptor caps, conntrack entry limits, and the kernel memory budget for `struct sock` allocations.

* * *

## TIME_WAIT: Who Pays the Cost

TIME_WAIT is the state a TCP socket enters after **actively closing** a connection — that is, after sending the first FIN. The socket sits in TIME_WAIT for a period defined in Linux as `TCP_TIMEWAIT_LEN`, hardcoded in `include/net/tcp.h`:

```c
#define TCP_TIMEWAIT_LEN (60*HZ)
```

That’s **60 seconds**, and it’s not tunable via sysctl — you have to recompile the kernel to change it. RFC 793 specifies `2 * MSL` (Maximum Segment Lifetime), which is theoretically up to 4 minutes; Windows defaults to 120 seconds, BSD variants are similar.

The purpose of TIME_WAIT is correctness: it prevents stale segments from a closed connection from being misinterpreted as belonging to a new connection that happens to reuse the same 4-tuple. It also ensures the final ACK reaches the peer before the socket is fully released.

**The key fact**: TIME_WAIT is incurred by the side that *initiates the close*. This matters enormously for who bears the cost.

### Where TIME_WAIT Hurts

Consider a reverse proxy fronting a backend pool. If the proxy uses HTTP/1.0 or sends `Connection: close` on each request, the proxy is the active closer. Every short request leaves a TIME_WAIT socket on the proxy, occupying a (src_ip, src_port) slot toward that specific backend (dst_ip, dst_port).

If the proxy is hitting one backend on `:8080` from one source IP, the math is:

```
28,000 ephemeral ports / 60s TIME_WAIT ≈ 466 new connections per second
```

Beyond that rate, `connect()` calls start failing with `EADDRNOTAVAIL`. Not because the backend is overloaded. Not because the network is saturated. Because the proxy’s own kernel has no source ports left that aren’t pinned in TIME_WAIT.

### TIME_WAIT as an Attack Surface

Pure TIME_WAIT exhaustion as a deliberate attack is awkward, for a structural reason: the side that initiates close pays the cost. An attacker opening and closing connections accumulates TIME_WAIT on themselves, not the victim.

The attack becomes meaningful only when the **server initiates close**, which happens in several real scenarios:

-   HTTP/1.0 without keep-alive
-   HTTP/1.1 with `Connection: close` headers
-   Idle timeouts on the server side
-   HTTPS configurations that close after each request for performance reasons
-   Misconfigured WebSocket gateways closing on heartbeat failure

In these cases, an attacker pounding short requests at the server forces server-side TIME_WAIT accumulation. But — and this is critical — the limit is **per-4-tuple**, not global. The server only runs out of state for *that specific (attacker_ip, server_ip, server_port)* combination. Other clients are unaffected.

So pure TIME_WAIT exhaustion as a DoS is weak. What it really is, is a **capacity ceiling** that operators of proxies, load balancers, and high-turnover services routinely hit during legitimate load.

* * *

## The Deprecated Footgun: tcp_tw_recycle

For years, the most common “fix” recommended on Stack Overflow and operator blogs was:

```bash
sysctl -w net.ipv4.tcp_tw_recycle=1
```

This setting accelerated TIME_WAIT cleanup using per-host timestamps. It worked beautifully in lab environments. It catastrophically broke production whenever clients sat behind NAT.

The mechanism: `tcp_tw_recycle` tracked the most recent TCP timestamp per source IP and rejected incoming SYNs with older timestamps as “duplicates from a TIME_WAIT connection.” When multiple clients shared a NAT public IP (every mobile network, every corporate gateway), their per-host timestamp clocks were independent. Whichever client had the lower clock would be silently blocked — packets dropped, connections refused, no logs.

The flag was **removed entirely in Linux 4.12** (July 2017, commit `4396e46187`). It does not exist in any modern kernel. If you see a guide still recommending it, the guide is older than puberty.

The correct setting is `tcp_tw_reuse`, which allows reuse of TIME_WAIT sockets for *outgoing* connections only, using TCP timestamps (RFC 6191) to disambiguate. It is safe with NAT because it operates on the outbound side.

* * *

## Sockstress: The Real Attack

Sockstress was disclosed in 2008 by Robert E. Lee and Jack Louis of Outpost24. Unlike TIME_WAIT, it is a deliberate, asymmetric, and devastating attack — and the underlying mechanism has never been fully closed.

The mechanism, step by step:

1.  Attacker initiates a **fully legitimate** TCP handshake (SYN, SYN-ACK, ACK). Crucially, this passes SYN cookie defenses, because SYN cookies only protect the half-open queue.
2.  The connection reaches ESTABLISHED state.
3.  The attacker sends a TCP segment advertising **window size 0**. This is a legitimate flow-control signal meaning “I cannot accept data right now, hold off.”
4.  If there is data the server wants to send (typical for HTTP responses, banners, anything server-initiated), the server enters the **TCP Persist Timer** state. It cannot transmit, it cannot close, it must wait.
5.  The Persist Timer sends “zero window probes” at exponentially increasing intervals, asking “can I send yet?” The attacker keeps replying with window 0.
6.  On Linux, the connection is held open until `tcp_retries2` exhaustion — by default, **up to ~15 minutes per connection**.

The attacker now multiplies this across thousands of connections and source ports. Each held connection consumes:

-   A `struct sock` allocation in kernel memory
-   A file descriptor in the server process
-   A conntrack table entry (if a stateful firewall sits in the path)
-   An `sk_buff` queue for buffered send data

The asymmetry is brutal. The attacker holds essentially zero state per connection (just remember to reply with window 0 occasionally). The server holds full per-connection kernel state for 15 minutes.

### Why Standard Defenses Don’t Apply

-   **SYN cookies**: Useless. The handshake is real and completes normally.
-   **Connection rate limiting**: Partially effective, but attacker can pace the openings slowly.
-   **Per-IP connection limits (iptables `connlimit`)**: Effective *if configured*. Most production systems aren’t.
-   **Application-layer timeouts**: Don’t apply. The TCP stack is stuck in Persist mode, the application never gets the chance to react.

### The Linux-Specific Tuning Lever

Two sysctl knobs control how aggressively Linux gives up on stalled connections:

```toml
net.ipv4.tcp_retries2     = 15   # default, ~15 min for ESTABLISHED
net.ipv4.tcp_orphan_retries = 0  # special: 0 means use default (8 retries)
```

Lowering `tcp_retries2` to 5 or 6 cuts the per-connection lifetime to 1–2 minutes. This reduces but does not eliminate Sockstress impact. It’s a tradeoff: legitimate clients on flaky networks may also be killed prematurely.

* * *

## Where These Attacks Still Hit in 2026

Both attack families are well-known. Both have published mitigations. Neither is fully solved in practice, because the gap between “documented mitigation exists” and “mitigation is deployed everywhere” is enormous. The systems still vulnerable today fall into recognizable categories.

### TIME_WAIT exhaustion is still hitting:

-   **High-churn reverse proxies and API gateways** running default sysctls. Operators tune cache headers and TLS ciphers obsessively but leave `ip_local_port_range` at the defaults and forget `tcp_tw_reuse=1`.
-   **Carrier-grade NAT (CGNAT) devices**. When tens of thousands of subscribers share a public IP pool, the NAT box itself runs out of source ports toward popular destinations. This is not theoretical — it’s a daily operational issue for mobile carriers.
-   **Kubernetes pods with default `net.ipv4.ip_local_port_range`** doing frequent outbound calls to a small set of services. Service mesh sidecars (Envoy, Istio) make this worse by adding another connection layer.
-   **Database connection pools** that don’t pool. If your app opens a new connection per query against PostgreSQL on `:5432`, you will hit the 466/sec wall before you hit the database.
-   **Egress proxies** in regulated environments where every outbound HTTPS goes through one or two corporate proxy IPs.

### Sockstress and its descendants still hit:

-   **Embedded device admin interfaces**. Routers, printers, IP cameras, building management systems, industrial controllers. Their TCP stacks are often unmaintained for years. Per-IP connection limits? Almost never configured.
-   **SCADA / ICS / OT systems**. Notoriously bad TCP stacks, often running on Windows CE or stripped Linux variants. A successful Sockstress against a PLC’s HMI interface can interrupt physical processes.
-   **Legacy enterprise applications** behind perimeter firewalls but lacking internal `connlimit` rules. Once an attacker is inside (compromised laptop, malicious insider), Sockstress against an internal Oracle DB or SAP frontend is wide open.
-   **Network appliances with web management UIs**. Firewalls, switches, load balancers — many vendors expose admin UIs with no per-IP socket caps. This is one of those uncomfortable cases where the *security device itself* is vulnerable to a 2008 attack.
-   **Misconfigured cloud workloads** where the security team focused on L7 (WAF, rate limiting at the LB) but never tuned `nf_conntrack` limits or `somaxconn` on the actual EC2/GCE instances.

### Modern L7 variants — same idea, different layer

The Sockstress pattern — *complete a handshake, then pin state by not making progress*— recurred at higher protocol layers because the kernel-level fix is hard, so attackers moved the attack into the application protocol where the same trick still works:

-   **Slowloris** (2009): pin Apache worker threads by sending HTTP headers one byte at a time. Mitigated in Apache by `mod_reqtimeout` and the switch to event MPM, but still effective against unmaintained Apache instances, embedded web servers, and many IoT admin panels.
-   **HTTP/2 Rapid Reset** (CVE-2023-44487, October 2023): open HTTP/2 streams, immediately RST them, repeat. Forces server to allocate stream state but never process anything. Patched broadly but unpatched HTTP/2 implementations still in production. Caused the largest DDoS observed at the time of disclosure (398 million RPS at Google).
-   **HTTP/2 CONTINUATION flood** (April 2024, Bartek Nowotarski): send CONTINUATION frames without ending the header block. Server accumulates header state indefinitely. Multiple HTTP/2 libraries were vulnerable; patches are uneven across implementations.

The thread connecting all of these is identical to Sockstress: **the server commits resources on handshake/setup, the attacker withholds the progress signal that would let those resources be reclaimed**. The protocol changes, the mechanism doesn’t.

* * *

## Defense: What Actually Works

A defense stack that handles connection-state exhaustion needs layers, because no single setting catches all variants.

| Layer | Control | What it stops |
| --- | --- | --- |
| Kernel | `net.ipv4.tcp_tw_reuse=1` | TIME_WAIT exhaustion (outbound) |
| Kernel | `net.ipv4.tcp_retries2=5` | Sockstress connection lifetime |
| Kernel | `net.core.somaxconn=4096+` | Accept-queue saturation |
| Kernel | `nf_conntrack_max` tuning | Conntrack table exhaustion |
| Firewall | `iptables -m connlimit --connlimit-above N` | Per-IP socket cap (kills Sockstress at source) |
| Firewall | `iptables -m hashlimit` | Rate-based new-connection limiting |
| App | Per-connection idle timeout | Slowloris and HTTP-layer slow attacks |
| App | HTTP/2 stream/frame limits | Rapid Reset, CONTINUATION flood |
| LB/Proxy | Connection pooling to backend | Avoid creating the TIME_WAIT problem in the first place |
| Ops | Monitor `ss -s` and conntrack usage | Detect exhaustion before it causes outages |

The most operationally important of these is `connlimit`. A simple rule like:

```bash
iptables -A INPUT -p tcp --syn --dport 443 \
  -m connlimit --connlimit-above 100 --connlimit-mask 32 -j REJECT
```

caps any single source IP at 100 concurrent connections to port 443. This single rule defeats classical Sockstress entirely and costs nothing. It is missing from a startling number of production firewall configurations.

* * *

## Conclusion

TCP connection-state exhaustion is older than most engineers reading this post and it still works in 2026, because the gap between known and deployed defenses is still wide. The reasons are unglamorous: default sysctls, unmaintained appliances, “we have a WAF so we’re fine” thinking, and the persistent belief that the limit is 65,536 ports.

The reframing that actually helps is this: TCP capacity is about **state**, not numbers. The 4-tuple is the unit of identity. The kernel state tables are the unit of cost. Every attack in this family — TIME_WAIT, Sockstress, Slowloris, Rapid Reset, CONTINUATION flood — is a variation on the same theme: *find a way to make the server allocate state, then refuse to let it deallocate*.

Knowing that, the defenses pick themselves: limit state per source, time state out aggressively, and monitor the tables that matter (`ss -s`, `nf_conntrack` counts) before they overflow.

* * *

## Further Reading

-   Outpost24, “Sockstress” original disclosure (2008)
-   RFC 793 — Transmission Control Protocol
-   RFC 6191 — Reducing the TIME-WAIT State Using TCP Timestamps
-   RFC 7323 — TCP Extensions for High Performance
-   CVE-2023-44487 — HTTP/2 Rapid Reset
-   Bartek Nowotarski, HTTP/2 CONTINUATION Flood (April 2024)
-   Linux kernel: `include/net/tcp.h`, `Documentation/networking/ip-sysctl.rst`

## ⚠️ Legal Disclaimer

This article is written for educational and defensive security research purposes only. The techniques described are publicly documented for the purpose of building more resilient systems. Unauthorized testing against systems you do not own or have explicit permission to assess is illegal.

**MITRE ATT&CK:** [T1499.001](https://attack.mitre.org/techniques/T1499/001/) · [T1498.001](https://attack.mitre.org/techniques/T1498/001/)

## Related

-   [CWE-290 at Layer 3: IP Source Spoofing and uRPF Failure in Enterprise Wireless Infrastructure](https://netacoding.com/posts/cwe-290/)
-   [DNS State Exhaustion: From TCP Slot Starvation to NXNS Amplification](https://netacoding.com/posts/dns-state-exhaustion/)
-   [Solving IP Endianness in x64 Assembly: A Single-Pass Algorithm](https://netacoding.com/posts/algorithmforprinting-ip_addresses/)
-   [Defying Python: Building a Bare-Metal HTTP Server in x86_64 Assembly](https://netacoding.com/posts/assembly-httpserver/)
-   [ICMP-Ghost: Fileless C2 with ICMP & DNS Tunneling in Pure x64 Assembly](https://netacoding.com/posts/icmp-ghost/)
