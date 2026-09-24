---
title: "A quartet of Linux local root vulns: DirtyAH6, PPPoEject, TUNderflow, and DiagSpill · Hey, it's Asim"
source: https://heyitsas.im/posts/lpe-quartet/
source_host: heyitsas.im
clip_date: 2026-09-24T10:21:11+08:00
trace_id: e434b1fe-ac60-4702-a26e-5500ea2a1129
content_hash: 7eb0ff4308816ef32dfc83d1115e712cd560f3d16a98a93fd2198dcd1fdd41db
status: synced
tags:
  - Linux安全
  - 漏洞分析
series: null
feed_source: Asim/heyitsas·Linux内核LPE
ai_summary: TL;DR：四个潜伏 10–21 年的 Linux 本地提权漏洞被公开，三个依赖非特权用户命名空间，DiagSpill 无需任何特权；补丁与 PoC 已发布，个别条件下可远程触发崩溃。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3e575244-d011-810a-95b3-f27d33acfbf8
ioc:
  cves:
    - CVE-2026-68121
    - CVE-2026-74469
    - CVE-2026-80844
    - CVE-2026-81000
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：四个潜伏 10–21 年的 Linux 本地提权漏洞被公开，三个依赖非特权用户命名空间，DiagSpill 无需任何特权；补丁与 PoC 已发布，个别条件下可远程触发崩溃。
> 
> - **漏洞清单：** DirtyAH6（CVE-2026-80844）、TUNderflow（CVE-2026-81000）、PPPoEject（CVE-2026-68121）、DiagSpill（CVE-2026-74469），均由 AI 辅助的对象图追踪+内存状态分析发现。
> - **根因：** DirtyAH6 的 `ipv6_rearrange_rthdr()` 未校验 `segments_left <= segments`，指针回退 4064 字节；TUNderflow 的 `tun->align` 存过大 headroom 致 `SKB_MAX_HEAD` 下溢、`skb->data` 越界 64 字节；PPPoEject 在 `dev_hard_header()` 期间 skb head 被 `pskb_expand_head()` 释放后仍用旧指针；DiagSpill 的 16 位 `transport_count` 在第 65536 个 transport 处回绕为 0，溢出约 8 MiB。
> - **远程可达性：** DirtyAH6 在目标作 IPv6 网关且启用传输模式 AH 时可远程 DoS，实验室中配合目标端内存布局可远程 root；DiagSpill 需启用 ASCONF/ADD-IP 及 AUTH 或 `addip_noauth_enable=1`（默认关闭）并经 sock_diag 触发，作者认为无法远程 root。
> - **修复：** 上游提交已在各稳定分支落地，含全部四项修复的首个版本为 5.10.270、5.15.221、6.1.188、6.6.157、6.12.109、6.18.50、7.2.4；无法打补丁时可禁用非特权用户命名空间（对前三个有效，DiagSpill 无效）或直接停用 AH6、TUN、PPPoE、SCTP/sctp_diag。
> - **利用难度：** 均需针对目标内核版本/发行版做内存布局微调，PoC 只发布针对少数目标调优的版本，应在专用虚拟机中运行；实测 AppArmor/SELinux 不阻断利用。

*TLDR: Four more Linux LPEs; two of the corruption bugs are reachable remotely under very specific circumstances, with one theoretically remote-groomable to remote root.*

## Background

This will be shorter than usual because a) I’m under a time crunch and b) we are covering 4 vulnerabilities at once.

These were discovered by combining the graph-based tracking of security-relevant objects/properties used in [CIFSwitch](https://heyitsas.im/posts/cifswitch/) with the tooling to enable agents to think ‘geometrically’ about the memory state, as seen in [OVSwrap](https://heyitsas.im/posts/ovswrap/). See those posts’ **Background** sections for more info.

The harness design is captured, in broad strokes, in [Getting LLMs Drunk to Find Remote Linux Kernel OOB Writes (and More)](https://heyitsas.im/posts/drinking-llms/), though it’s evolved considerably since.

## The vulnerabilities

The vulnerabilities are **DirtyAH6** ([CVE-2026-80844](https://nvd.nist.gov/vuln/detail/CVE-2026-80844)), **TUNderflow** ([CVE-2026-81000](https://nvd.nist.gov/vuln/detail/CVE-2026-81000)), **PPPoEject** ([CVE-2026-68121](https://nvd.nist.gov/vuln/detail/CVE-2026-68121)), and **DiagSpill** ([CVE-2026-74469](https://nvd.nist.gov/vuln/detail/CVE-2026-74469)).

The underlying bugs have been around for 10-21 years. The first three LPEs require unprivileged user namespaces\*; DiagSpill does *not*. In some *very specific* circumstances, **DirtyAH6** ’s and **DiagSpill** ’s corruption bugs are remotely exploitable (see below for further details).

I reported these to `security@kernel.org` mid-July, with the fixes landing over the past weeks. Per the coordinated embargo with `linux-distros@`, we agreed to publish the writeup/PoCs on September 18, 6am UTC, so the affected system owners can prioritize and apply the patches. Huge thanks to the many maintainers involved in the patching/coordination process: Stefan Klassert, Xin Long, Paolo Abeni, Willem de Bruijn, Greg KH, and many others.

### The basics

Some background on the kernel subsystems involved in each of the vulnerabilities:

**DirtyAH6**: `IPsec` ’s Authentication Header (`AH`) checks that packet data has not changed. Linux implements its IPv6 side in `AH6`, using the kernel’s `XFRM` code; before calculating or checking authentication data, `AH6` changes some IPv6 fields into the expected form, including addresses in a routing header.

**TUNderflow**: `TUN` and `TAP` are virtual network devices that move packets between the kernel and userspace through `/dev/net/tun`. Network devices built on top of other devices can pass down the receive headroom they need through `ndo_set_rx_headroom()`, and Open vSwitch can carry that value from another port to a `TUN` or `TAP` port.

**PPPoEject**: `PPPoE` carries `PPP` sessions in Ethernet frames. On send, `pppoe_sendmsg()` builds an `skb`, copies in the payload, and asks the lower network device to create its hardware header before filling in the `PPPoE` header.

**DiagSpill**: An `SCTP` association can have many peer transports, one for each peer address. `sctp_diag` reports `SCTP` socket and peer information through `sock_diag`, building a Netlink reply with one `sockaddr_storage` for each transport.

### Vulnerability details

**DirtyAH6**: `ipv6_rearrange_rthdr()` would get the number of addresses from `hdrlen`, then use `segments - segments_left` to move an address pointer without first checking that `segments_left <= segments`. So, a raw IPv6 `HDRINCL` packet with `hdrlen=2` and `segments_left=255` moved the pointer back 4,064 bytes and passed a 4,064-byte length to `memmove()`, causing an out-of-bounds access.

If a target is acting as an IPv6 router/gateway and adds `AH` in transport mode, the same bug can be turned into a remote crash/DoS; with memory grooming *on the target*, I was also able to turn it into remote root in my lab. Achieving root with remote-only grooming looks extremely difficult, but it isn’t a priori impossible.

**TUNderflow**: `tun_set_headroom()` stored receive headroom directly in `tun->align`, while `tun_get_user()` also used it to choose how much packet data to keep in the head. A `netkit` device with 4,096 bytes of configured headroom, under a `VXLAN` device and an Open vSwitch datapath, could pass 4,160 bytes to a raw `TUN` port. Then, `SKB_MAX_HEAD(4160)` would underflow. The negative `good_linear` value became a huge positive `size_t`; `prepad + linear` and `len - linear` then wrapped, and `tun_alloc_skb()` left `skb->data` 64 bytes beyond its 4,096-byte allocation. The packet processing afterward would then read/write outside the `skb` head.

**PPPoEject**: `pppoe_sendmsg()` kept a pointer into the `skb` head across `dev_hard_header()`, even though a device callback could call `pskb_expand_head()` and free that head. Blocking the payload copy on `FUSE` while adding the first `GRE` / `IP6GRE` port to an empty `team` or bonding device triggered the reallocation, effectively ejecting the old skb head while `PPPoE` still held a pointer into it. The subsequent header and length writes used that stale pointer.

**DiagSpill**: An `SCTP` association can have 65,536 peer transports, but `transport_count` is 16 bits – so the 65,536th transport wrapped it to 0. `sctp_diag` then reserved no peer payload but copied the full list, spilling about 8 MiB past the end of the Netlink response.

The corruption can be turned into a remote crash/DoS if `ASCONF` / `ADD-IP` are enabled with either `SCTP-AUTH` or `net.sctp.addip_noauth_enable=1` (all of these are disabled by default) – a malicious peer adds enough transports, and something on the target (e.g., `ss`) issues the `sock_diag` request that triggers the overwrite. I don’t see a path to full remote root, even assuming perfect remote memory grooming.

### The fixes

[**DirtyAH6**](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/commit/?id=7bad4bda74dc4713f398d3b7624ff05478e3a568): Check `segments_left` before changing the header or the address pointer, and pass `-EINVAL` through the existing `AH6` error paths:

```c
segments = rthdr->hdrlen >> 1;
if (segments_left > segments)
    return -EINVAL;

rthdr->segments_left = 0;
```

[**TUNderflow**](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/commit/?id=447c9303942c439a117d9b76ce6d6e2116b38ee7): Bound the headroom stored by `TUN` to the one-page `skb` -head budget and the largest allowed 16-bit header offset, while leaving enough data in the head for the raw- `TUN` protocol byte or a complete `TAP` Ethernet header. Then make sure those bytes are present before using them:

```c
max_headroom = min_t(size_t, SKB_MAX_HEAD(0), U16_MAX - 1);

if ((tun->flags & TUN_TYPE_MASK) == IFF_TAP)
    max_headroom -= ETH_HLEN + NET_IP_ALIGN;
else
    max_headroom -= 1;

tun->align = clamp_t(int, new_hr, NET_SKB_PAD, max_headroom);

...

case IFF_TUN:
    if (tun->flags & IFF_NO_PI) {
        u8 ip_version;

        if (!pskb_may_pull(skb, 1)) {
            err = -EINVAL;
            goto drop;
        }
        ip_version = skb->data[0] >> 4;

        ...
    }
    ...
    break;
case IFF_TAP:
    if (!pskb_may_pull(skb, ETH_HLEN)) {
        err = -ENOMEM;
        drop_reason = SKB_DROP_REASON_HDR_TRUNC;
        goto drop;
    }
```

[**PPPoEject**](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/commit/?id=e9c238f6fe42fb1b4dba3a578277de32cb487937): Reload the PPPoE header through the `skb` ’s network-header offset after device header creation; have `pskb_expand_head()` update that offset when it moves the head:

```c
dev_hard_header(skb, dev, ETH_P_PPP_SES,
                po->pppoe_pa.remote, NULL, total_len);

ph = pppoe_hdr(skb);
memcpy(ph, &hdr, sizeof(struct pppoe_hdr));
```

[**DiagSpill**](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/commit/?id=bd0e9289e2642f6a5c54faad304ce0f41e926d22): Reject a new unique peer once `transport_count == U16_MAX`. The check happens after looking for an existing peer, so an address already on the list still returns its existing transport at the limit:

```c
if (asoc->peer.transport_count == U16_MAX)
    return NULL;

peer = sctp_transport_new(asoc->base.net, addr, gfp);
```

The corresponding changelogs for the first upstream-fixed releases are:

DirtyAH6 TUNderflow PPPoEject DiagSpill

## The exploits

These are all memory bugs that require per-target grooming for to-root escalation, so the linked PoCs specify the distro/kernel/cpu/memory they’re tuned for (see the READMEs) – I’ve managed to repro across a range of distros with some tuning, but I’m releasing only the minimal couple-target-specific PoCs for simplicity.

While these are generally reliable on their targets, they may still corrupt the wrong memory, so run these in dedicated VMs/throwaway hosts only:

**DirtyAH6**: The [PoC](https://github.com/manizada/DirtyAH6) is a cousin of `DirtyFrag` ’s `ESP` variant: it corrupts `skb_shared_info` via a separate `AH6` routing-header `memmove()` OOB (not addressed by the `DirtyFrag` fix), then makes a later `ESP` decrypt write into a file-backed fragment, replacing `pam_rootok.so` with `pam_permit.so`, getting a root shell with `su`.

**TUNderflow**: The [PoC](https://github.com/manizada/TUNderflow) arranges file-backed pipe buffers next to the bad `TUN` packet. The Open vSwitch out-of-bounds write then sets `PIPE_BUF_FLAG_CAN_MERGE` on one of them, after which a pipe write replaces `pam_rootok.so` with `pam_permit.so` in `/etc/pam.d/su`, with `su` used again for the root shell.

**PPPoEject**: The [PoC](https://github.com/manizada/PPPoEject) races populated `fd` tables into the freed `skb` head and uses the `PPPoE` writes to redirect one live entry to an attacker-built fake `struct file`. Closing that `fd` calls a controlled kernel callback, installs root credentials, and opens a root shell.

**DiagSpill**: The [PoC](https://github.com/manizada/DiagSpill) grooms the `sock_diag` overwrite into page tables, uses the corrupted page tables to map host memory, finds and rewrites a credential object, installs a `sudoers` rule, and opens a root shell.

## Are you affected? + Mitigation

### The bug reachability pre-reqs

The below are the pre-reqs for *the actual bugs*, not full LPE chains (which are captured in full in the above-linked PoCs’ READMEs). Nevertheless, it’s a good idea to treat your kernel as vulnerable if it’s in the list of vulnerable versions below and has the relevant subsystems available:

**DirtyAH6**: Reachable on the affected kernels as long as `AH6` / `XFRM` support is available on the affected kernels below; unprivileged user namespaces\* are required for the specific LPE PoC above.

DirtyAH6 affected upstream kernels

| Kernel series | Affected releases | First fixed release |
| --- | --- | --- |
| 2.6.12–5.9 | All releases | EOL; no upstream stable fix |
| 5.10.y | 5.10.0–5.10.268 | 5.10.269 |
| 5.11–5.14 | All releases | EOL; no upstream stable fix |
| 5.15.y | 5.15.0–5.15.219 | 5.15.220 |
| 5.16–6.0 | All releases | EOL; no upstream stable fix |
| 6.1.y | 6.1.0–6.1.186 | 6.1.187 |
| 6.2–6.5 | All releases | EOL; no upstream stable fix |
| 6.6.y | 6.6.0–6.6.155 | 6.6.156 |
| 6.7–6.11 | All releases | EOL; no upstream stable fix |
| 6.12.y | 6.12.0–6.12.107 | 6.12.108 |
| 6.13–6.17 | All releases | EOL; no upstream stable fix |
| 6.18.y | 6.18.0–6.18.48 | 6.18.49 |
| 6.19–7.0 | All releases | EOL; no upstream stable fix |
| 7.1.y | 7.1.0–7.1.12 | 7.1.13 |
| 7.2.y | 7.2.0–7.2.2 | 7.2.3 |

**TUNderflow**: Reachable on the affected kernels if unprivileged user namespaces are enabled\* and `TUN` / `TAP` support is available, with *some* network-device path that can propagate oversized receive headroom to it.

TUNderflow affected upstream kernels

| Kernel series | Affected releases | First fixed release |
| --- | --- | --- |
| 4.6–5.9 | All releases | EOL; no upstream stable fix |
| 5.10.y | 5.10.0–5.10.269 | 5.10.270 |
| 5.11–5.14 | All releases | EOL; no upstream stable fix |
| 5.15.y | 5.15.0–5.15.220 | 5.15.221 |
| 5.16–6.0 | All releases | EOL; no upstream stable fix |
| 6.1.y | 6.1.0–6.1.187 | 6.1.188 |
| 6.2–6.5 | All releases | EOL; no upstream stable fix |
| 6.6.y | 6.6.0–6.6.156 | 6.6.157 |
| 6.7–6.11 | All releases | EOL; no upstream stable fix |
| 6.12.y | 6.12.0–6.12.108 | 6.12.109 |
| 6.13–6.17 | All releases | EOL; no upstream stable fix |
| 6.18.y | 6.18.0–6.18.49 | 6.18.50 |
| 6.19–7.0 | All releases | EOL; no upstream stable fix |
| 7.1.y | 7.1.0–7.1.13 | EOL; no upstream stable fix |
| 7.2.y | 7.2.0–7.2.3 | 7.2.4 |

**PPPoEject**: Reachable on the affected kernels as long as unprivileged user namespaces are enabled\* and `PPPoE` support is available, with a lower-device header callback that can reallocate the `skb` head during `dev_hard_header()`.

PPPoEject affected upstream kernels

| Kernel series | Affected releases | First fixed release |
| --- | --- | --- |
| 2.6.12–5.9 | All releases | EOL; no upstream stable fix |
| 5.10.y | 5.10.0–5.10.264 | 5.10.265 |
| 5.11–5.14 | All releases | EOL; no upstream stable fix |
| 5.15.y | 5.15.0–5.15.215 | 5.15.216 |
| 5.16–6.0 | All releases | EOL; no upstream stable fix |
| 6.1.y | 6.1.0–6.1.182 | 6.1.183 |
| 6.2–6.5 | All releases | EOL; no upstream stable fix |
| 6.6.y | 6.6.0–6.6.147 | 6.6.148 |
| 6.7–6.11 | All releases | EOL; no upstream stable fix |
| 6.12.y | 6.12.0–6.12.100 | 6.12.101 |
| 6.13–6.17 | All releases | EOL; no upstream stable fix |
| 6.18.y | 6.18.0–6.18.41 | 6.18.42 |
| 6.19–7.0 | All releases | EOL; no upstream stable fix |
| 7.1.y | 7.1.0–7.1.5 | 7.1.6 |

**DiagSpill**: Reachable on the affected kernels as long as `SCTP` and `sctp_diag` support is available (no unprivileged user namespace/CAP requirements).

DiagSpill affected upstream kernels

| Kernel series | Affected releases | First fixed release |
| --- | --- | --- |
| 4.7–5.9 | All releases | EOL; no upstream stable fix |
| 5.10.y | 5.10.0–5.10.264 | 5.10.265 |
| 5.11–5.14 | All releases | EOL; no upstream stable fix |
| 5.15.y | 5.15.0–5.15.215 | 5.15.216 |
| 5.16–6.0 | All releases | EOL; no upstream stable fix |
| 6.1.y | 6.1.0–6.1.182 | 6.1.183 |
| 6.2–6.5 | All releases | EOL; no upstream stable fix |
| 6.6.y | 6.6.0–6.6.150 | 6.6.151 |
| 6.7–6.11 | All releases | EOL; no upstream stable fix |
| 6.12.y | 6.12.0–6.12.102 | 6.12.103 |
| 6.13–6.17 | All releases | EOL; no upstream stable fix |
| 6.18.y | 6.18.0–6.18.43 | 6.18.44 |
| 6.19–7.0 | All releases | EOL; no upstream stable fix |
| 7.1.y | 7.1.0–7.1.7 | 7.1.8 |

AppArmor (except for the Ubuntu cases of blocking unprivileged user namespaces themselves)/SELinux do not block the exploits in my testing.

\* *A mouthful of a note:* the DirtyAH6 corruption trigger requires `CAP_NET_ADMIN` and `CAP_NET_RAW` in the user namespace that owns the attacker-controlled network ns. The TUNderflow and PPPoEject corruption triggers require only `CAP_NET_ADMIN` in the same user ns. In an appropriately-CAP'd container or a process in general, these paths can corrupt the host kernel (possibly leading to a container escape, etc.) with just the specified CAPs, without creating new user namespaces. Unprivileged user namespaces are just the most common path.

And so while a container escape is theoretically possible with these primitives, just as with [CIFSwitch](https://heyitsas.im/posts/cifswitch/) (see a [community example](https://raesene.github.io/blog/2026/06/03/do-containers-still-contain/)) and [OVSwrap](https://heyitsas.im/posts/ovswrap/), I did not pursue that direction with the PoC.

Finally, note that for DiagSpill no special CAPs or unprivileged user namespaces are required at all -- so long as SCTP and sctp_diag are available, the bug can corrupt the host kernel.

### Mitigation

Upgrade to a kernel containing all four fixes. The first stable releases with all four are `5.10.270`, `5.15.221`, `6.1.188`, `6.6.157`, `6.12.109`, `6.18.50`, and `7.2.4`.

If patching is not possible, disabling unprivileged user namespaces removes the ordinary-user path to the first three (but doesn’t protect against appropriately-CAP’d containers/other processes) – **DiagSpill** remains reachable. You can also disable the relevant functionality (if unused) to cut out the underlying bug: `AH6`, `TUN`, `PPPoE`, and `SCTP` / `sctp_diag`. I wouldn’t recommend disabling PoC-specific kmods only as a proper mitigation, as there could be other paths to root – as always, patching is much preferred.

## Outro

Given some personal/professional developments, this likely concludes the AI-assisted vulnerability hunting experiment – at least in its public form – for some while. Thanks for riding along!
