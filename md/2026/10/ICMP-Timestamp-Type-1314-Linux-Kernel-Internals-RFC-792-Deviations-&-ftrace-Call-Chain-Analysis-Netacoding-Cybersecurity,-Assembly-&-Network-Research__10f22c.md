---
title: "ICMP Timestamp Type 13/14 Linux Kernel Internals: RFC 792 Deviations & ftrace Call Chain Analysis | Netacoding | Cybersecurity, Assembly & Network Research"
source: https://netacoding.com/posts/icmp-timestamp-internals/
source_host: netacoding.com
clip_date: 2026-10-01T10:21:49+08:00
trace_id: 16e4a812-2d39-46d5-83ca-2ec6ea7e0b36
content_hash: b7252c70399bb87cb338366babecd990fae6f669f8400091964ffa53048fe69f
status: synced
tags:
  - 内核
  - 协议分析
series: null
feed_source: Netacoding·协议/逆向
ai_summary: Linux 6.17 内核对 ICMP Timestamp（Type 13/14）的实现比 RFC 792 更宽松也更严格：Code 字段从不读取，ts_ori 全 32 位无校验回显，不足 4 字节的载荷静默丢弃，每次交换还会创建 conntrack 表项。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ec75244-d011-8131-94b8-fd90e6033306
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Linux 6.17 内核对 ICMP Timestamp（Type 13/14）的实现比 RFC 792 更宽松也更严格：Code 字段从不读取，ts_ori 全 32 位无校验回显，不足 4 字节的载荷静默丢弃，每次交换还会创建 conntrack 表项。
> 
> - **调用链与耗时：** 以 `icmp_timestamp` 为根的 depth-8 ftrace 显示单包处理稳定在 29–33µs，时间戳采集（`ktime_get_real_ts64`，~0.2µs）不到总耗时 1%；主要开销为 `ip_route_output_flow`（5–6µs）与两处 netfilter 钩子（4–5µs）。首个包会先触发 `arch_irq_work_raise()` 自发 IPI，此后同 CPU 不再出现。
> - **4 字节阈值：** 载荷 0–3 字节的 Type 13 请求在 `icmp_rcv+0x1f5` 被 `sk_skb_reason_drop()` 以 `PKT_TOO_SMALL` 丢弃，根本进不了 `icmp_timestamp()`，不上线也不见于 PCAP，只能靠 `/proc/net/snmp` 的 `Icmp: InErrors` 与 `skb:kfree_skb` 追踪点计数。
> - **Code 字段从不读取：** `icmp_rcv()` 仅按 Type 分发，回包由 `icmp_reply()` 无条件写入 Code=0；实测 0/1/128/255 结果完全一致——不是校验通过，而是从不查看。
> - **ts_ori 无校验、ts_rx/ts_tx 被忽略：** `skb_copy_bits()` 只读前 4 字节并原样回填，`0xDEADBEEF`、`0xFFFFFFFF` 等超出 RFC 规定 [0, 86400000] 的值照收；发送方的 ts_rx/ts_tx 从不访问，内核改用本地 `ktime_get_real_ts64()` 毫秒值填入。
> - **固定回包与 conntrack 压力：** 大于 12 字节的载荷被静默截断，回包恒为 40 字节（20+8+12）；每个 Type 14 回包经 `nf_conntrack_in()` 新建条目（默认 30s 超时），在约 262144 条上限下 ~8738 包/秒即可打满；`icmpv4_xrlim_allow()` 只按目的地址限速，多源流量可绕过。

Most security tooling treats ICMP as a monolith: ping works, or it doesn’t. ICMP Timestamp (Type 13/14) sits in that overlooked middle ground — defined in RFC 792, implemented in every Linux kernel, but rarely scrutinized at the source level.

This post documents a depth-8 ftrace investigation of `icmp_timestamp()` on Linux kernel 6.17.13. Beyond cataloguing individual findings, the goal is to map the architectural reality of how the kernel processes ICMP Timestamp requests — every code path, every decision point, every place where the implementation diverges from what RFC 792 specifies.

What emerged was a set of concrete, reproducible behaviors: a silent payload threshold, a Code field that is never read, ts_ori that is echoed without any range check, and a netfilter pipeline that creates a conntrack entry for every single exchange.

* * *

## Test Environment

All tests were conducted on a VirtualBox guest running Parrot OS 7.1 KDE Security Edition, kernel 6.17.13 x86-64. The loopback interface (127.0.0.1) served as the target for all packet exchange — this eliminates network jitter and keeps the focus on kernel behavior rather than transport variables.

Three instrumentation layers ran concurrently throughout the investigation:

**ftrace (depth-8)** with `icmp_timestamp` as the root function, capturing the full call graph on every Type 13 request:

```bash
echo function_graph > /sys/kernel/debug/tracing/current_tracer
echo icmp_timestamp > /sys/kernel/debug/tracing/set_graph_function
echo 8 > /sys/kernel/debug/tracing/max_graph_depth
echo 1 > /sys/kernel/debug/tracing/events/skb/kfree_skb/enable
echo 1 > /sys/kernel/debug/tracing/tracing_on
```

**Raw socket fuzzer** built with `IP_HDRINCL` — no Scapy, no libpcap normalization. Every field in the IP and ICMP headers is set explicitly, giving full control over IHL, Code, payload length, and timestamp fields.

**SNMP counters** via `/proc/net/snmp` provided ground-truth drop accounting. After each test group, the delta in `Icmp: InErrors` confirmed exactly how many packets were silently dropped before reaching `icmp_timestamp()`.

Packet captures were taken with Wireshark on the loopback interface. Any packet absent from the PCAP but present in the ftrace output indicated a drop at or before the wire layer.

* * *

## The Call Chain: A Type 13 Packet’s Journey

A single ICMP Timestamp request touches more kernel subsystems than most practitioners expect. The depth-8 ftrace output reveals six distinct phases between `icmp_rcv()` and `ip_finish_output2()`. What follows is the complete map.

### Phase 1: Entry

After IP layer processing, `icmp_rcv()` dispatches incoming ICMP packets through a handler table indexed by type. Type 13 maps directly to `icmp_timestamp()` — there is no intermediate validation of the Code field at this stage. Whatever value Code carries, the kernel never inspects it here.

On the very first Type 13 request after kernel boot (or after a period of inactivity), `arch_irq_work_raise()` fires before any payload processing begins:

```
icmp_timestamp()
  arch_irq_work_raise()
    default_send_IPI_self()
      irq_enter_rcu()
      __sysvec_irq_work()
      irq_exit_rcu()
```

This is an inter-processor interrupt — the kernel raises an IPI to itself to process deferred irq_work before handling the packet. It appeared only on the first packet per CPU in all test runs. Subsequent packets on the same CPU skip this path entirely.

### Phase 2: Timestamp Acquisition

```
inet_current_timestamp()
  ktime_get_real_ts64()        ← ~0.2µs
```

Before reading a single byte of the incoming payload, the kernel captures the current wall clock time. This value will become both `ts_rx` and `ts_tx` in the reply — the kernel does not distinguish between receive and transmit timestamps for loopback or local replies. Resolution is 1 millisecond; the raw nanosecond value from `ktime_get_real_ts64()` is converted to milliseconds-since-midnight UTC before being written into the reply.

### Phase 3: Payload Read

```
skb_copy_bits()                ← ~0.15µs
```

This is the only read from the incoming packet’s ICMP payload. `skb_copy_bits()` copies exactly **4 bytes** starting at offset 0 — the `ts_ori` field. The remaining 8 bytes of the timestamp payload (`ts_rx` and `ts_tx` from the sender) are never accessed. They are not echoed, not validated, not logged. They simply remain in the skb until it is freed.

The implication is direct: the kernel has no knowledge of what the sender placed in `ts_rx` or `ts_tx`. Only `ts_ori` survives into the reply.

### Phase 4: Reply Construction

With timestamp and `ts_ori` in hand, `icmp_reply()` builds the outgoing packet:

```java
icmp_reply()
  __ip_options_echo()          ← copy IP options from request
  icmpv4_global_allow()        ← global ICMP rate limiter
  _raw_spin_trylock()          ← acquire ICMP socket lock
  fib_compute_spec_dst()       ← determine source address
  make_kuid()
  ip_route_output_flow()
    ip_route_output_key_hash_rcu()
      __ip_dev_find()
      fib_table_lookup()
        fib_lookup_good_nhc()
      find_exception()
    xfrm_lookup_route()
  icmpv4_xrlim_allow.isra.0()  ← per-destination rate limiter
  icmp_push_reply()
    ip_append_data()
      ip_setup_cork()
        ipv4_mtu()
      __ip_append_data()
        sock_alloc_send_pskb()
          alloc_skb_with_frags()
            __alloc_skb()      ← fresh slab allocation
        skb_put()
    csum_partial_copy_nocheck()
    ip_push_pending_frames()
      __ip_make_skb()
        __ip_select_ident()
          get_random_u32()     ← IP ID is randomized
        icmp_out_count()
        dst_release()
```

Two rate limiters sit in this path. `icmpv4_global_allow()` enforces a system-wide ICMP send limit. `icmpv4_xrlim_allow()` applies a per-destination bucket — separate accounting per target IP. Both must pass before `icmp_push_reply()` is called.

The IP Identification field is set via `get_random_u32()` on every packet. There is no sequential counter, no predictable pattern — the IP ID field carries no exploitable information.

A fresh `sk_buff` is allocated from the slab allocator for every reply (`__alloc_skb()`). There is no reply buffer reuse.

### Phase 5: Netfilter Pipeline

Every ICMP Timestamp reply passes through the full netfilter pipeline — twice. First on the local output path, then on the forward path:

```css
__ip_local_out()
  nf_hook_slow()                         ← OUTPUT chain
    ipv4_conntrack_defrag [nf_defrag_ipv4]
    ipv4_conntrack_local [nf_conntrack]
      nf_conntrack_in [nf_conntrack]     ← entry created here
    nf_nat_ipv4_local_fn [nf_nat]
      nf_nat_inet_fn [nf_nat]

ip_output()
  nf_hook_slow()                         ← POSTROUTING chain
    apparmor_ip_postroute                ← AppArmor LSM hook
    nf_nat_ipv4_out [nf_nat]
      nf_nat_inet_fn [nf_nat]
    nf_confirm [nf_conntrack]            ← entry confirmed
```

`nf_conntrack_in()` creates a new conntrack entry on every Type 13/14 exchange. This is not specific to ICMP Timestamp — all ICMP types that generate replies go through conntrack. The consequence is measurable: with a default `nf_conntrack_max` of approximately 65536 and an ICMP conntrack timeout of 30 seconds, a sustained rate of ~2185 packets per second from distinct source addresses would exhaust the conntrack table.

AppArmor’s `apparmor_ip_postroute` hook fires on every outgoing packet regardless of whether any AppArmor policy applies to ICMP traffic. It is present in the call chain even on a default Parrot OS installation with no custom AppArmor profiles loaded.

### Phase 6: Transmission

```
ip_finish_output()
  __ip_finish_output()
    ip_finish_output2()        ← ~2.7µs, hands off to driver
```

`ip_finish_output2()` resolves the next-hop neighbour entry and passes the skb to the network device driver. On loopback, this loops back into the receive path. The original request’s skb is freed via `consume_skb()` after `icmp_reply()` returns — clean path, no leak.

### Timing Profile

Across several hundred packets captured in this investigation, the complete `icmp_timestamp()` call consistently took between 29 and 33µs on a warm CPU with a populated routing cache. The dominant costs:

| Subsystem | Typical cost |
| --- | --- |
| `ip_route_output_flow` | ~5–6µs |
| `nf_hook_slow` (both) | ~4–5µs |
| `__alloc_skb` | ~0.5µs |
| `ip_finish_output2` | ~2.7µs |
| `ktime_get_real_ts64` | ~0.2µs |
| `skb_copy_bits` | ~0.15µs |

The timestamp acquisition itself — the core purpose of the entire function — accounts for under 1% of total execution time.

* * *

## Findings

### Finding 1: The 4-Byte Payload Threshold

The kernel silently drops any ICMP Timestamp request whose ICMP payload is shorter than 4 bytes. The drop occurs inside `icmp_rcv()` at offset `+0x1f5`, before `icmp_timestamp()` is ever called:

```
reason: PKT_TOO_SMALL
location: icmp_rcv+0x1f5/0x3c0
```

The threshold is exactly 4 bytes — the size of `ts_ori`. The kernel needs nothing else from the payload to construct a valid reply. Payloads of 0, 1, 2, or 3 bytes all hit `sk_skb_reason_drop()` with `PKT_TOO_SMALL` and increment `Icmp: InErrors` in `/proc/net/snmp`. Payloads of 4 bytes or more proceed to `icmp_timestamp()` regardless of how large they are.

This was verified against SNMP counters directly. After sending one packet each at 0B, 1B, 2B, and 3B payloads plus three packets at valid sizes, the `InErrors` delta was exactly +4 — no ambiguity.

Packets dropped at this stage never reach the wire. They are absent from packet captures entirely, leaving no trace outside of SNMP counters and the `skb:kfree_skb` tracepoint.

* * *

### Finding 2: The Code Field Is Never Read

RFC 792 defines Code as 0 for ICMP Timestamp. In practice, the kernel never checks this field at any point in the processing path. `icmp_rcv()` dispatches on Type alone. `icmp_timestamp()` never reads Code. The reply is constructed by `icmp_reply()` which writes Code=0 unconditionally regardless of what arrived.

Tested values: 0, 1, 128, 255 — all produced identical replies with Code=0. The incoming Code value is not echoed, not logged, not validated. It is overwritten before the reply packet leaves the kernel.

The distinction matters for how this is characterised: the kernel does not *accept* arbitrary Code values — it simply *never looks at them*. The sanitization is a side effect of reply construction, not an explicit check.

* * *

### Finding 3: ts_ori Is Echoed Without Validation

`skb_copy_bits()` reads exactly 4 bytes from the incoming payload at offset 0 and places them verbatim into the reply’s `ts_ori` field. No range check is performed. RFC 792 defines valid timestamp values as milliseconds since midnight UTC, bounded by \[0, 86400000\]. The kernel enforces none of this.

Tested values and their replies:

| Sent ts_ori | Received ts_ori | RFC 792 valid? |
| --- | --- | --- |
| `0x00000000` | `0x00000000` | ✓   |
| `0x0524DFFE` (86399998) | `0x0524DFFE` | ✓   |
| `0xDEADBEEF` | `0xDEADBEEF` | ✗   |
| `0x80000000` | `0x80000000` | ✗   |
| `0xFFFFFFFF` | `0xFFFFFFFF` | ✗   |

The full 32-bit space is usable as a data carrier. The kernel’s echo is unconditional.

* * *

### Finding 4: ts_rx and ts_tx from the Sender Are Ignored

The incoming ICMP Timestamp payload is 12 bytes: `ts_ori` (4), `ts_rx` (4), `ts_tx` (4). The kernel reads only the first 4 bytes. `ts_rx` and `ts_tx` from the sender are never accessed — no read, no copy, no echo.

In the reply, `ts_rx` and `ts_tx` are set by the kernel to the value captured by `ktime_get_real_ts64()` in Phase 2, converted to milliseconds since midnight UTC. Whatever the sender placed in those fields is permanently discarded when the incoming skb is freed via `consume_skb()`.

* * *

### Finding 5: Oversized Payloads Are Silently Truncated

Sending a Type 13 request with a payload larger than 12 bytes produces a reply of exactly 40 bytes (IP header 20B + ICMP header 8B + timestamp body 12B), every time. The extra bytes in the incoming packet are not echoed, not truncated at the ICMP layer — they simply never leave `icmp_timestamp()`. After `skb_copy_bits()` reads its 4 bytes, the remainder of the oversized payload stays in the original skb until `consume_skb()` frees it via `kmem_cache_free()`.

A 64-byte incoming payload produces the same 40-byte reply as a 4-byte payload. The reply size is structurally fixed by how `icmp_push_reply()` constructs the outgoing skb.

* * *

### Finding 6: Every Exchange Creates a Conntrack Entry

As documented in the call chain, `nf_conntrack_in()` runs on every outgoing Type 14 reply and creates a new conntrack table entry. ICMP conntrack entries expire after 30 seconds by default.

With a default `nf_conntrack_max` of approximately 262144 entries, the arithmetic is straightforward:

```
262144 entries / 30s timeout = ~8738 packets/second
```

Sustained traffic from distinct source addresses above this rate will exhaust the conntrack table, causing `nf_conntrack_in()` to drop new connections system-wide — not just ICMP. This is not a vulnerability specific to ICMP Timestamp; it applies to any ICMP type that generates a kernel reply. The relevant constraint here is that `icmpv4_xrlim_allow()` rate-limits per destination, not per source — traffic from many distinct sources bypasses this limiter entirely.

* * *

## Conclusion

The Linux kernel’s ICMP Timestamp implementation is correct by most practical measures — it replies when it should, drops malformed packets cleanly, and does not expose the machine to any direct exploitation through this path. But “correct” and “fully specified” are not the same thing.

The six findings documented here collectively describe an implementation that is looser than RFC 792 in some places and stricter in others. The Code field is neither validated nor echoed — it disappears. The `ts_ori` field accepts the full 32-bit range with no enforcement of the RFC’s \[0, 86400000\] constraint. The sender’s `ts_rx` and `ts_tx` are discarded without being read. Oversized payloads produce a fixed-size reply with no indication that truncation occurred.

None of this is a bug. It is the kernel doing the minimum necessary work to produce a valid reply — which is precisely what makes it interesting to document. The gap between what RFC 792 specifies and what the kernel actually enforces is where unexpected behaviors live.

A few practical observations follow from these findings:

**For defenders:** ICMP Timestamp replies are generated by the kernel regardless of whether any userspace application is listening. Blocking Type 13 at the firewall is the only reliable way to prevent replies — disabling it at the application layer has no effect because `icmp_timestamp()` runs entirely in kernel space. Every reply that does leave the kernel will have passed through the full netfilter pipeline and created a conntrack entry.

**For researchers:** The `skb:kfree_skb` tracepoint combined with `/proc/net/snmp` provides exact drop accounting with no false positives. Packets that never reach `icmp_timestamp()` are invisible to ftrace but visible in SNMP — the two sources together give a complete picture of what the kernel accepted versus what it silently discarded.

**For tooling authors:** `ts_ori` is the only field in an ICMP Timestamp request that the kernel reads and echoes. Any tool that attempts to fingerprint systems using `ts_rx` or `ts_tx` values from the request is testing a field the remote kernel never looks at.

The following examples illustrate representative packets from each test group, constructed with raw sockets using `IP_HDRINCL`:

```python
import socket, struct

def checksum(data):
    if len(data) % 2: data += b'\x00'
    s = 0
    for i in range(0, len(data), 2):
        s += (data[i] << 8) + data[i+1]
        s = (s & 0xFFFF) + (s >> 16)
    return ~s & 0xFFFF

# Group A — IHL anomaly (IHL=6, triggers ip_options_compile)
ip = struct.pack('>BBHHHBBH4s4s',
     0x66,          # version=4, IHL=6
     0, 44, 0, 0, 64, 1, 0,
     b'\x7f\x00\x00\x01', b'\x7f\x00\x00\x01')

# Group B — Undefined Type (Type=15, silent discard)
icmp = struct.pack('>BBHHH', 15, 0, 0, 0x1234, 1)

# Group C — ts_ori RFC violation (0xDEADBEEF)
icmp = struct.pack('>BBHHHIII',
       13, 0, 0, 0x1234, 1,
       0xDEADBEEF, 0, 0)   # ts_ori outside [0, 86400000]

# Group F — Payload threshold (3 bytes → PKT_TOO_SMALL)
icmp = struct.pack('>BBH', 13, 0, 0) + b'\x00\x00\x00'

# Group F — Payload threshold (4 bytes → accepted)
icmp = struct.pack('>BBHHHBBBB',
       13, 0, 0, 0x1234, 1,
       0x00, 0x00, 0x00, 0x00)

# Group G — Code field (Code=255 → reply always Code=0)
icmp = struct.pack('>BBHHHIII',
       13, 255, 0, 0x1234, 1,
       0, 0, 0)
```

Checksum fields are computed and patched before transmission. All packets were sent via:

```python
s = socket.socket(socket.AF_INET, socket.SOCK_RAW,
                  socket.IPPROTO_RAW)
s.setsockopt(socket.IPPROTO_IP, socket.IP_HDRINCL, 1)
s.sendto(ip + icmp, ('127.0.0.1', 0))
```

* * *

## Related Posts

-   [ICMP-Ghost v3.6.2: Fileless C2 with Dual-Channel Pivoting & DPI Evasion](https://netacoding.com/posts/icmp-ghost/)
-   [Smurf Amplification in 2026: Pre-Auth ICMP Reflection via L2 Broadcast](https://netacoding.com/posts/smurf-amplification/)
-   [EtherLeak: IP Total Length Over-read via Ethernet Frame Padding](https://netacoding.com/posts/etherleak-reloaded/)
-   [ArubaOS 8.13.2.0 Pre-Auth ICMP Buffer Over-read: Ghost Leak via TTL=0 + IP Total Length](https://netacoding.com/posts/ghost-leak/)
