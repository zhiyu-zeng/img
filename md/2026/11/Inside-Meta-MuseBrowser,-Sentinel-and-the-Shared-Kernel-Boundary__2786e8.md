---
title: Inside Meta Muse:Browser, Sentinel and the Shared-Kernel Boundary
source: https://nebusec.ai/research/inside-meta-muse/
source_host: nebusec.ai
clip_date: 2026-11-21T08:51:48+08:00
trace_id: 7256aafe-ce96-4b81-9876-8f6d3c83f960
content_hash: 3ab254c554719758348788fbef15660bedd8e2853346f714a02d5e5a5ad4c991
status: synced
tags:
  - 恶意样本
  - 漏洞分析
series: null
feed_source: NebuSec
ai_summary: Muse 把网页聊天、App 和 WhatsApp 都接到同一台用户 VM 里运行的 agent 上；研究者发现，一个“导出恶意网页”的请求就能一路打通到容器逃逸。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 41f75244-d011-8132-b4d8-fe7ff7cc838c
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Muse 把网页聊天、App 和 WhatsApp 都接到同一台用户 VM 里运行的 agent 上；研究者发现，一个“导出恶意网页”的请求就能一路打通到容器逃逸。
> 
> - **架构：** 每个用户配一台 2 vCPU / 8 GiB 的 Cloud Hypervisor 虚拟机，里面套 `systemd-nspawn` 容器跑类 Codex agent；容器内 root 被映射到 VM 的 UID/GID 131072，安全审查、出网审计、凭据代理由容器外的 `hatch-safety`、Sentinel、`hatch-authd` 承担。
> - **浏览器四条路径：** 远程取页服务、按需分配的浏览器 VM、独立的 `htch-browser` 容器，以及容器内自带的 `/opt/meta-chromium`；后两条用 Chromium 155.0.8059.80，而 10 月快照仍停留在 152.0.7977.82，留下了可利用的 n-day V8 漏洞窗口。
> - **0.5 次点击拿到 RCE（远程代码执行）：** 用于导出 PDF 的 Chromium 进程关闭了 IPC 沙箱，因此在用户要求保存攻击者页面时，一个约值 500 美元的渲染器漏洞就足以以 agent 权限在容器内执行 shell。
> - **Sentinel 策略细节：** DNS 返回 `198.18.0.0/16` 假地址并在代理侧还原域名，eBPF 挂在容器 cgroup 上把直连重定向到 `198.19.0.1:3128`；只有无 body 的 GET/HEAD/OPTIONS 算读请求，可静默放行，写请求需审批；还会做 hex/Base64 解码后扫描邮箱、`+` 国际号码、OTP，按字符集类别算熵、送 `policyguard-nvfp4` 复核，并按同一来源单域名 60 分钟内累计 2 MiB、全来源 5 MiB 阈值触发审查。
> - **内核与逃逸：** Hatch 定制 7.0.0-39 内核裁掉大量驱动并禁用 `KALLSYMS_ALL`、`/proc/kcore`，同时也关掉 `RANDOMIZE_MEMORY`、`HARDENED_USERCOPY`、`INIT_ON_ALLOC_DEFAULT_ON`；用自动化利用框架生成的通用 exploit 成功率 >99.9%，拿到 VM root 后可读 `/boot`、已解锁的 100 GiB LUKS2/Btrfs 持久卷与凭据存储，且 VM 内进程不受 cgroup 重定向约束、可直连外网（含公网 IPv6）。

We analyzed the execution environments of several AI assistants. This first post in the series covers our research on [Meta’s Muse](https://muse.ai/): the architecture study, how we gained a 0.5-click RCE and leaked user data, and how we escaped the container to reveal how Muse’s Sentinel guard really works.

## High-Level Security Design of Muse

OpenAI and Anthropic split cloud-hosted ChatGPT and the local Codex and Claude agents into separate products. Muse takes a different route: The web chat is the same agent, running in a cloud VM, which gives it more freedom and support for long-running tasks.

If the agent can already chat, why build a separate chat service for the website? The Muse website, mobile app and WhatsApp assistant all connect to the same agent in the user’s VM. Memories and conversation history live on persistent storage dedicated to that VM. Meta provisions a 2-vCPU, 8 GiB Cloud Hypervisor VM for each user, starts a `systemd-nspawn` container inside it and runs a Codex-like Muse agent in that container.

How does Muse contain the risks from untrusted input? The agent runs as root inside the runtime container, but that does not give it root privileges in the user VM. The runtime-cell code fixes the container’s user-namespace range at 131072–196607, so UID and GID 0 inside the container map to 131072 in the VM. The same base appears in rootfs ownership, connector socket ownership and peer checks throughout the VM configuration.

Several security services run outside the container:

-   `hatch-safety` reviews model input and output and returns an allow or deny gate to the daemon.
-   `Sentinel` audits outbound traffic from the runtime container.
-   `hatch-authd` mediates connector credentials. The agent receives stand-in tokens, and Sentinel replaces them with connector-scoped credentials in outbound requests. (The shipped inference and Stefi proxy units use a separate path: Each loads its own platform secret through systemd’s `LoadCredential=` mechanism.)

This separation is intended to keep real credentials out of the agent’s reach and place outbound policy outside the runtime container. If Muse downloads and runs untrusted code, for example a dependency compromised through a supply-chain attack, Sentinel should still intercept outbound requests from that code and apply the same allow, deny and approval rules.

Muse’s execution environment has the following structure:

```text
Linux hypervisor host
└─ KVM
   └─ Cloud Hypervisor
      └─ Per-user Ubuntu VM
         └─ systemd-nspawn runtime container
            └─ Muse agent
```

## Muse and Its Browsers

Where could an attacker get in to an agent that runs in the cloud? The browser is an obvious path. So let’s look at how Muse uses a browser, or rather browsers, and what happens when the agent surfs the web.

Most Muse requests travel over the Noise protocol to an ingress service in the user’s VM. Ingress forwards the requests over a Unix socket to the `hatch` daemon inside the runtime container.

![Meta's architecture diagram for Muse request routing.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b0b249f547e7a128.png)

Browser-related requests follow the same entry path. [Meta’s public architecture](https://muse.ai/blog/security-and-safety-for-ai-agents-our-approach-with-muse) describes the brokered browser used for interactive web tasks. In practice there are three more paths, including a Chromium copy that runs beside the agent in the runtime container, and Muse selects among four backends according to the task:

| Browser location | Invocation | Typical task | Chromium version | Egress enforcement |
| --- | --- | --- | --- | --- |
| Remote page-fetching service | Container tools such as `browser_open` and `browser_search` call `browser-service` | Fetching page contents and search results | Unknown; the service may not be browser-backed | Remote service policy |
| On-demand browser VM | `browser.browse` calls `browser-broker` in the user VM; the broker provisions a browser VM and forwards the request | Login flows, forms and bookings | `155.0.8059.80` | Browser VM policy |
| Local browser container, `htch-browser` | `browser-broker` starts a separate `systemd-nspawn` container in the user VM | Background page checks initiated by Muse | `155.0.8059.80` | Direct IPv4 masquerade; internal and reserved IPv4 ranges denied; IPv6 denied |
| Bundled `/opt/meta-chromium/chrome` | The agent starts Chromium directly or through Playwright | Reviewing page screenshots, generating file thumbnails and exporting PDFs | `155.0.8059.80` | Runtime-container path through Sentinel |

We focused on the bundled Chromium copy, which ran inside the runtime container alongside the agent.

The two local backends used different network boundaries. The `htch-browser` unit configured direct IPv4 egress through a dedicated masquerade rule, denied internal and reserved IPv4 ranges and disabled IPv6. Bundled Chromium inherited the runtime container’s Sentinel path, including request classification, content inspection, traffic budgets and approval rules. A browser exploit therefore inherited the egress policy of the backend it compromised, which for bundled Chromium is still under Sentinel’s control.

Muse updates its bundled browser from time to time, but our snapshots showed it lagging behind Chrome releases. In early October, the container still carried Chromium `152.0.7977.82`. M152 entered stable in August, and this patch release shipped on Sept. 3. A later snapshot carried `155.0.8059.80`.

That update cadence left a practical n-day window. Public V8 bugs still usable in that build included issue [`559932543`](https://issues.chromium.org/issues/559932543), reported by NebuSec, as well as [`560233248`](https://issues.chromium.org/issues/560233248) and [`550360762`](https://issues.chromium.org/issues/550360762). At the time, we estimated that more than five public V8 vulnerabilities were usable without additional flags. We used issue [`554034656`](https://issues.chromium.org/issues/554034656), a parser bug that escaped the V8 sandbox, to turn memory corruption inside V8 into arbitrary code execution.

The Chromium process used for PDF export had its IPC sandbox disabled. When a user asked Muse to save an attacker-controlled page, a single renderer bug, worth about $500, was enough to execute arbitrary shell commands inside the runtime container with the agent’s privileges.

## Big Sentinel Is Watching You

Our first attempts to send command output to an external server produced approval prompts. Muse users will recognize the dialog:

![Muse approval prompt for an outbound network request.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3461928ff727b164.png)

The prompt still appeared for programs running as root inside the container. Why did root need permission to use the network?

Recall the multilayer sandboxing: The approval decision came from outside the runtime container. Muse delegates privileged operations to services in the user VM; connectors such as Gmail, Notion and Facebook use the same split. The container-side CLI does not perform the operation itself. A client inside the runtime container sends the request over a socket such as `/run/hatch/privsep/foo.sock`, and a service in the user VM performs the operation.

The connectors were split from one another as well. The Notion socket used systemd’s `Accept=yes` mode to start a per-connection worker under the dedicated `hatch-w-notion-cli` account. Its unit provided a temporary home, a read-only system tree, an obscured `/proc` and syscall filters that denied `mount`, `setns` and `unshare`. On the reviewed credential-read path, authd derived the worker’s credential scope from its cgroup and accepted only the `notion` document. Socket permissions admitted the mapped runtime-daemon identity, while systemd still handled each connection under the dedicated worker account.

Networking uses the same separation. The runtime container’s only external interface is `host0`, and its default route and DNS resolver both point to `198.19.0.1`:

```text
root@htch-runtime:~# ip route
default via 198.19.0.1 dev host0
198.19.0.0/30 dev host0 proto kernel scope link src 198.19.0.2

root@htch-runtime:~# cat /etc/resolv.conf
# ...
nameserver 198.19.0.1

root@htch-runtime:~# cat /etc/hosts
# ...
198.19.0.1 hatch-egress-proxy
```

The service at `198.19.0.1` is Sentinel (`hatch-sentinel`). It answers DNS on port 53 and accepts proxy traffic on port 3128. Instead of returning the destination’s real IP address, Sentinel’s DNS server allocates a fake address from `198.18.0.0/16`. Sentinel records the address-to-domain mapping and uses it to recover the original domain when a connection arrives at the proxy.

The container’s explicit proxy settings point to the same address and proxy port:

```text
root@htch-runtime:~# cat /opt/hatch/runtime-cell/guest.env
# ...
HTTP_PROXY=http://hatch-egress-proxy:3128
HTTPS_PROXY=http://hatch-egress-proxy:3128
ALL_PROXY=http://hatch-egress-proxy:3128
SSL_CERT_FILE=/run/hatch/egress-tls/ca-bundle.pem
```

Those variables cover cooperative clients, but arbitrary code can ignore them and call `connect()` directly. Sentinel covers that path with an eBPF program attached to the container cgroup. The program rewrites an external destination to `198.19.0.1:3128`, so the connection still terminates at Sentinel. Unsetting `HTTP_PROXY` accomplishes very little when the kernel redirects the socket anyway.

So we had remote code execution and could tamper with chat history, but we couldn’t send everything back, thanks to Sentinel watching almost all outbound traffic. It was time to prove that Sentinel is not safe.

## Understanding and Bypassing Sentinel’s Policy

To send data without prompting the user, we needed to understand why some requests passed without approval.

Sentinel first attributes a request to its originating process, then evaluates built-in Rego policies. A deny match rejects the request without asking the user. The remaining requests are split into reads and writes. Only `GET`, `HEAD` and `OPTIONS` requests without a body count as reads. Writes require approval unless an allow rule covers them, while reads may leave silently under Muse’s default **Ask for some actions** setting.

![Muse's Ask for some actions permission setting.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/fe438d438ed22d6e.png)

Process attribution also feeds an execd taint gate. Execd tracks file and process state as `clean`, `tainted`, `untracked` or `distrusted`; Sentinel accepts `clean` only after the query succeeds and the PID and process start time match. When a rule requires a clean origin, a failed query, non-clean result or mismatched process identity removes one route to silent approval. Sentinel then continues with the ordinary allow, deny and prompt rules.

The HTTP method was only one input to that decision. Sentinel also examined request contents and cumulative traffic:

-   **Sensitive-data screening.** Sentinel tries hex and Base64 decoding on each URL component, then scans the decoded text for email addresses, international phone numbers beginning with `+`, and six- to eight-digit values attached to `otp` or `verification_code`. A short Base64-encoded email address triggered review, while the plaintext `alice@example.com` was allowed.
-   **Entropy thresholds.** Sentinel assigns each chunk that fails to decode to one of four character-set classes, computes the chunk’s Shannon entropy and applies the threshold for that class.
-   **Model review.** Suspicious requests are sent to `policyguard-nvfp4`, which returns either `veto` or `no_finding`.
-   **Outbound budgets.** Within a 60-minute rolling window, cumulative traffic from one originator to one domain triggers review above 2 MiB. Across all originators, the threshold for the same domain is 5 MiB in that window.

Working within those rules, we used the browser chain to send the user’s conversation history and stored memories to our server without an approval prompt. We could also inject entries into the conversation history and alter stored memories.

## One Step Further to the Kernel

Our code still ran inside the runtime container. Container root could call selected VM-side Unix sockets, but those interfaces kept the service identity, credential scope and authority outside the container. If we could exploit a vulnerability in the kernel shared by the container and the per-user VM, we would obtain VM root and break every restriction on those interfaces.

Not every local privilege-escalation exploit can escape the container. Data-only copy-on-write bugs are usually not useful here, because the container may not expose the user VM’s libc, setuid binaries or other dependencies, so even if we could write to an arbitrary file, the host might never execute it. Kernel memory corruption offered a more practical way to achieve both privilege escalation and container escape.

During our Oct. 2 test, the VM ran a custom Hatch-built Ubuntu kernel:

```text
Linux version 7.0.0-39-generic (hatch@hatch) (gcc (Ubuntu 13.3.0-6ubuntu2~24.04.1) 13.3.0, GNU ld (GNU Binutils for Ubuntu) 2.42) #1 SMP PREEMPT_DYNAMIC Thu Sep 24 08:42:15 UTC 2026
```

Compared with a standard Ubuntu build, the Hatch kernel is heavily stripped down. A large number of hardware drivers, file systems and peripheral protocols have been removed, and interfaces such as `KALLSYMS_ALL` and `/proc/kcore` have been disabled.

Curiously, however, Hatch enables `CONFIG_IO_URING` in the kernel configuration, only to block `io_uring` again, as noted in Meta’s [public security architecture](https://muse.ai/blog/security-and-safety-for-ai-agents-our-approach-with-muse).

Several security-hardening options, including `RANDOMIZE_MEMORY`, `HARDENED_USERCOPY` and `INIT_ON_ALLOC_DEFAULT_ON`, have also been disabled.

That was good news for exploitation, since some annoying (but bypassable) protections were off. The bad news: We had no target kernel image to inspect. We could not rely on structure-field and function offsets prepared from that image, and the exploit had to work without assuming a fixed CPU or memory configuration.

That turned out not to be a problem, as Linux 7.0 fell within the published affected ranges of multiple CVEs. We used NebuSec’s Automated Exploit Generation framework to produce general-purpose exploits that met those constraints. In our test runs, they succeeded more than 99.9% of the time. The exploits avoid CPU-specific techniques. They obtain arbitrary kernel read and write, use physical-memory access to locate the kernel image, parse its symbol table and find the data offsets needed for privilege escalation. No precomputed target offsets are required.

We will describe our pipeline for finding, assessing, exploiting and fixing kernel vulnerabilities in a later post. **More than 170 of our patches have already been merged into mainline Linux, and we keep monitoring new vulnerabilities and assessing their exploitability to help maintainers prioritize patch reviews.**

## Outside Muse’s Container

After the kernel escape, we had root in the user’s VM. We could access persistent storage that was not mounted into the runtime container, Secure Credential Storage and Sentinel itself. The target kernel image that had been unavailable inside the container was now under `/boot`.

Still, Cloud Hypervisor stood between the compromised user VM and other tenants. Crossing that boundary would require a guest-to-host vulnerability in the host’s kernel or virtual machine monitor, or a vulnerable internal service.

The VM separated persistent state from product files. Home and service state came from a 100 GiB LUKS2/Btrfs volume that was already unlocked and mounted in the VM. `/opt/hatch` came from a read-only, dm-verity-backed squashfs image, while the runtime container mounted persistent `/home/hatch` separately. VM root exposed the mounted persistent state beyond the container’s view.

The cgroup hook that had forced our container connections through Sentinel did not cover processes running directly in the user VM. Those processes could send outbound traffic without passing through Sentinel. The VM even had its own public IPv6 address:

```text
1: lo: <LOOPBACK,UP,LOWER_UP> ...
2: ens4: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc pfifo_fast state UP group default qlen 1000
    link/ether RE:DA:CT:ED:13:17 brd ff:ff:ff:ff:ff:ff
    altname enp0s4
    inet 10.0.0.2/24 metric 1024 brd 10.0.0.255 scope global dynamic ens4
       valid_lft 1911sec preferred_lft 1911sec
    inet6 2401:db00:c000:0:5c8a:fff:reda:cted/64 scope global dynamic mngtmpaddr noprefixroute
       valid_lft 86382sec preferred_lft 14382sec
    inet6 fe80::5c8a:fff:reda:cted/64 scope link
       valid_lft forever preferred_lft forever
3: ve-htch-runtime@if2: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc noqueue state UP group default qlen 1000
    link/ether RE:DA:CT:ED:13:17 brd ff:ff:ff:ff:ff:ff link-netnsid 0
    inet 198.19.0.1/30 scope global ve-htch-runtime
       valid_lft forever preferred_lft forever
    inet6 fd8b:4f84:7d32:99::1/64 scope global
       valid_lft forever preferred_lft forever
    inet6 fe80::d8c1:reda:cted:1337/64 scope link
       valid_lft forever preferred_lft forever
# ip route
default via 10.0.0.1 dev ens4 proto dhcp src 10.0.0.2 metric 1024
8.8.8.8 via 10.0.0.1 dev ens4 proto dhcp src 10.0.0.2 metric 1024
10.0.0.0/24 dev ens4 proto kernel scope link src 10.0.0.2 metric 1024
10.0.0.1 dev ens4 proto dhcp scope link src 10.0.0.2 metric 1024
198.19.0.0/30 dev ve-htch-runtime proto kernel scope link src 198.19.0.1
```

## The End

In the end, a single request to export a malicious web page gave us command execution in the runtime container, a return channel that did not prompt the user, and access to the same user’s data and credentials outside the container. We reported the findings to the Muse team. Now it’s time to start again and explore other agent vendors’ interesting isolation designs.

* * *

By the time of publication, the Muse team was aware of every finding described here and had patched all exploits described in this post.
