---
title: Getting LLMs Drunk to Find Remote Linux Kernel OOB Writes (and More) · Hey, it's Asim
source: https://heyitsas.im/posts/drinking-llms/
source_host: heyitsas.im
clip_date: 2026-09-24T10:20:24+08:00
trace_id: 560d428c-4ef1-4f99-875e-4809c5bdc117
content_hash: d6008307ee73f9cf9e83e1bc395cd7ad2e235253dab4de561064ed5d1044d5fb
status: synced
tags:
  - AI辅助逆向
  - 漏洞分析
series: null
feed_source: Asim/heyitsas·Linux内核LPE
ai_summary: 自建的 LLM 漏洞挖掘智能体团队在数月内全自动发现 20+ CVE，含 Linux 内核 ksmbd 的两个远程未认证越界写。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3e575244-d011-81c2-be36-f109db139684
ioc:
  cves:
    - CVE-2025-32462
    - CVE-2026-1933
    - CVE-2026-25949
    - CVE-2026-26080
    - CVE-2026-26081
    - CVE-2026-26103
    - CVE-2026-26104
    - CVE-2026-27587
    - CVE-2026-27588
    - CVE-2026-28753
    - CVE-2026-31432
    - CVE-2026-31433
    - CVE-2026-3184
    - CVE-2026-32934
    - CVE-2026-33190
    - CVE-2026-33413
    - CVE-2026-33489
    - CVE-2026-33526
    - CVE-2026-34040
    - CVE-2026-34182
    - CVE-2026-34978
    - CVE-2026-34980
    - CVE-2026-34990
    - CVE-2026-4105
    - CVE-2026-41567
    - CVE-2026-41568
    - CVE-2026-44168
    - CVE-2026-46862
    - CVE-2026-4892
    - CVE-2026-4948
    - CVE-2026-57191
    - CVE-2026-57220
    - CVE-2026-60163
    - CVE-2026-6507
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 自建的 LLM 漏洞挖掘智能体团队在数月内全自动发现 20+ CVE，含 Linux 内核 ksmbd 的两个远程未认证越界写。
> 
> - **核心成果：** ksmbd CVE-2026-31432/31433 均为远程未认证（guest share 场景）OOB 写——复合请求让首个操作基本耗尽内核回复缓冲区，后续变长元数据未做边界检查即追加；31432 中攻击者数据可污染相邻 `struct file`（`filp_flush`/`dnotify_flush` 路径）。
> - **架构分层：** 目标播种器按"普遍性×可利用性"排序 → 假设生成器读文档/源码/不变量 → 猎手在隔离 VM 中迭代 PoC → 报告撰写者 → 外部评分模型（查严重性、新颖性、防刷分）→ conductor 轮询纠偏并维护阻塞问题日志；模型越强角色拆分越少，前沿模型可塌缩为单 agent，但 grader 必须外部独立。
> - **"醉酒"实验：** 用 activation steering 把假设生成器调向"创造性"状态，未产出新漏洞类；一个 Qwen 3.5 27B 变体数天后提出 CVE-2026-31432 假设，属低样本噪声；但去拒答（abliteration）方向明显提升参与度与整体表现。
> - **关键教训：** 小模型需大量限制性脚手架，换前沿模型后这些反而成为负担，加载分析/模糊测试工具后放手即得约 80% 结果；推理时算力下原始智能权重下降，固定 VRAM 时应优先把预算花在 conductor 而非更大的猎手模型。
> - **命中面广：** Docker、CUPS（未认证远程 RCE→root 文件覆写链）、Caddy、CoreDNS、dnsmasq、udisks、Firewalld、util-linux 等；多例属"文档↔代码不一致"，如 Caddy `MatchHost`/`MatchPath` 未按文档做大小写不敏感匹配、Docker AuthZ 插件可被绕过看不到请求体、`login -h` 主机名规范化改写了 `PAM_RHOST`。

*TLDR: the grossly overengineered, self-orchestrating team of vulnerability-hunting agents detailed below has discovered 20+ CVEs over the past few months, including [CVE-2026-31432](https://nvd.nist.gov/vuln/detail/CVE-2026-31432) and [CVE-2026-31433](https://nvd.nist.gov/vuln/detail/CVE-2026-31433): two remote, unauthenticated OOB writes in the Linux kernel’s **ksmbd**. Read on for the details of the setup that achieved this, including – yes! – getting LLMs drunk.*

## Background

“LLMing” vulnerability research has been on my “Do Something About This” list since DARPA’s [AIxCC](https://www.darpa.mil/research/programs/ai-cyber) and XBOW’s [initial results](https://xbow.com/blog/xbow-scoold-vuln). But back in 2023-24, models required a lot of harnessing to get anything useful, tool use was rudimentary, and the idea of squeezing as much code as I could into a model’s context – then triaging away the false positives – filled me with dread.

The push to *actually* do something came in the summer of 2025. Rich Mirch reported a dead-simple, unnoticed-for-12-years local privilege escalation in sudo: [CVE-2025-32462](https://www.stratascale.com/resource/cve-2025-32462-sudo-host-option-vulnerability/). Contrary to the documentation, the `--host` flag did not just permit listing privileges on a different host – it made the hostname portion of sudo rules [irrelevant](https://www.openwall.com/lists/oss-security/2025/06/30/2). So, e.g., if a sudoers rule granted you root on `somehost` but not the local host, you could abuse the flag to get full root locally.

This LPE was not LLM-found (AFAICT), but it did make me wonder: what if instead of getting LLMs to drive various tools, we had them hunt for (stupid simple) mismatches between documentation and the actual code? It seemed like an easier lift for (local) LLMs in terms of context size, harnessing complexity, and intelligence required. These would not be the most technically exciting findings, but their practical effects would be just as serious: impact-wise, an LPE is an LPE!

By the end of 2025, I’d begun working on a harness to do just this. But, to paraphrase Mike Tyson, everyone has a plan until a new model drops. Almost as soon as my harness was done, the models got good enough to greatly simplify the scaffolding required even for context-heavy external tool use. At this point, my quest fissioned into **three**:

-   Can we find the “docs ↔ code mismatch”-type vulnerabilities – the original goal, inspired by the finding above?
-   Given the step change in capabilities, what about vulnerabilities in general?
-   More speculatively, can we get a [“move 37”](https://en.wikipedia.org/wiki/AlphaGo_versus_Lee_Sedol) out of LLMs to either a) find *entirely novel* bug classes, or at least b) unlock *something* in smaller models to enhance their hunting capabilities?

## Findings

The answers were roughly “yes,” “yes,” and “maybe.” Below are 30+ findings (20+ CVEs assigned as of 2026-04-29, some not yet published) discovered fully autonomously via the custom harness. I prioritized network-reachable services first, given the impending avalanche:

| Target | Issue | CVE # |
| --- | --- | --- |
| Linux kernel (ksmbd) | Compound `READ` + `QUERY_INFO(Security)` requests can trigger a (remote, unauthenticated) out-of-bounds write in `ksmbd` | [CVE-2026-31432](https://nvd.nist.gov/vuln/detail/CVE-2026-31432), [fix](https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/commit/?id=d48c64fb80ad78b3dd29fb7d79b6ec7bd72bfc09) |
| Linux kernel (ksmbd) | Compound `QUERY_DIRECTORY` + `QUERY_INFO(FILE_ALL_INFORMATION)` requests can trigger a (remote, unauthenticated) out-of-bounds write in `ksmbd` | [CVE-2026-31433](https://nvd.nist.gov/vuln/detail/CVE-2026-31433), [fix](https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/commit/?id=3a852f9d1c981fb14f6bf4e24999e0ea8088a7d7) |
| Docker | `PUT /containers/{id}/archive` executes container binary on the host -> container-to-host-root breakout | [CVE-2026-41567](https://github.com/moby/moby/security/advisories/GHSA-x86f-5xw2-fm2r) |
| Docker | Crafted Docker API requests can make AuthZ plugins see no request body, bypassing body-inspecting authorization policies | [CVE-2026-34040](https://github.com/moby/moby/security/advisories/GHSA-x744-4wpc-v9h2) |
| Docker | Race condition in docker cp allows creation of arbitrary empty files on the host via symlink swap | [CVE-2026-41568](https://github.com/moby/moby/security/advisories/GHSA-vp62-88p7-qqf5) |
| OpenSSL | CMS AuthEnvelopedData processing may accept forged messages | [CVE-2026-34182](https://ubuntu.com/security/notices/USN-8414-1) |
| MariaDB | wsrep SST unsafe parameter handling on the donor side -> RCE on the donor host | [CVE-2026-44168](https://github.com/MariaDB/server/security/advisories/GHSA-vwf7-w26c-9w5h) |
| CUPS | On network-exposed CUPS with a shared PostScript queue, unauthenticated `Print-Job` requests can reach arbitrary code execution over the network as `lp` | [CVE-2026-34980](https://github.com/OpenPrinting/cups/security/advisories/GHSA-4852-v58g-6cwf) |
| CUPS | An unprivileged local attacker can coerce `cupsd` into leaking a reusable local admin token, escalating to a rootful file (over)write | [CVE-2026-34990](https://github.com/OpenPrinting/cups/security/advisories/GHSA-c54j-2vqw-wpwp) |
| CUPS | RSS `notify-recipient-uri` path traversal lets a remote IPP client write RSS XML outside `CacheDir/rss`, including clobbering `job.cache` | [CVE-2026-34978](https://github.com/OpenPrinting/cups/security/advisories/GHSA-f53q-7mxp-9gcr) |
| HAProxy | Single-packet infinite-loop DoS (QUIC) | [CVE-2026-26080](https://www.haproxy.com/blog/cves-2026-quic-denial-of-service) |
| HAProxy | Single-packet DoS (QUIC) | [CVE-2026-26081](https://ubuntu.com/security/notices/USN-8036-1) |
| Caddy | Large host lists make `MatchHost` case-sensitive, enabling host-based routing/access-control bypass | [CVE-2026-27588](https://github.com/advisories/GHSA-x76f-jf84-rqj8) |
| Caddy | `%xx` escaped-path matching skips case normalization, enabling path-based access-control bypass | [CVE-2026-27587](https://github.com/advisories/GHSA-g7pc-pc7g-h8jh) |
| Traefik | TCP `readTimeout` bypass in the Postgres STARTTLS handling path, allowing an unauthenticated connection-stalling denial of service | [CVE-2026-25949](https://github.com/traefik/traefik/security/advisories/GHSA-89p3-4642-cr2w) |
| udisks | Missing authorization on LUKS header restore lets a local unprivileged user overwrite encryption metadata, causing irreversible denial of service/data loss | [CVE-2026-26103](https://access.redhat.com/security/cve/cve-2026-26103) |
| udisks | Missing authorization on LUKS header backup lets a local unprivileged user export sensitive encryption metadata | [CVE-2026-26104](https://access.redhat.com/security/cve/cve-2026-26104) |
| systemd-machined | Local privilege escalation in affected desktop-session configurations via the `RegisterMachine` IPC/D-Bus path | [CVE-2026-4105](https://github.com/systemd/systemd/security/advisories/GHSA-4h6x-r8vx-3862) |
| etcd | Authorization bypasses in multiple gRPC APIs let unauthorized users invoke operations such as `MemberList`, `Alarm`, Lease APIs, and compaction in affected auth-enabled clusters | [CVE-2026-33413](https://github.com/etcd-io/etcd/security/advisories/GHSA-q8m4-xhhv-38mg) |
| Squid | Heap use-after-free in ICP handling lets a remote attacker reliably crash Squid when ICP is enabled | [CVE-2026-33526](https://github.com/squid-cache/squid/security/advisories/GHSA-hpfx-h48q-gvwg) |
| nginx | CRLF handling in `ngx_mail_smtp_module` DNS responses lets an attacker-controlled DNS server inject arbitrary headers into SMTP upstream requests | [CVE-2026-28753](https://my.f5.com/manage/s/article/K000160367) |
| Firewalld | Mis-authorization of runtime D-Bus setters lets a local unprivileged user change the runtime firewall configuration without proper authentication | [CVE-2026-4948](https://access.redhat.com/security/cve/cve-2026-4948) |
| dnsmasq | RCE-as-root via heap OOB write in DHCPv6 | [CVE-2026-4892](https://www.kb.cert.org/vuls/id/471747) |
| dnsmasq | With `--dhcp-split-relay` enabled, a crafted `BOOTREPLY` can trigger an out-of-bounds write and crash `dnsmasq` | [CVE-2026-6507](https://thekelleys.org.uk/gitweb/?p=dnsmasq.git;a=commit;h=9ad74926d4f7f34ff902e1db5235535aa813c33f) |
| Samba | Missing access checks on reparse point operations | [CVE-2026-1933](https://www.samba.org/samba/security/CVE-2026-1933.html) |
| CoreDNS | DoQ stream handling can spawn unbounded stalled goroutines, enabling unauthenticated remote DoS via memory growth and OOM crash | [CVE-2026-32934](https://github.com/coredns/coredns/security/advisories/GHSA-2wpx-qpw2-g5h5) |
| CoreDNS | Transfer stanza selection uses lexicographic rather than longest-match zone matching, allowing permissive parent-zone ACLs to bypass restrictive subzone transfer policy | [CVE-2026-33489](https://github.com/coredns/coredns/security/advisories/GHSA-h8mm-c463-wjq3) |
| CoreDNS | TSIG validation can be bypassed on DoT, DoH, DoH3, DoQ, and gRPC, allowing invalid-TSIG clients to access TSIG-protected resources | [CVE-2026-33190](https://github.com/coredns/coredns/security/advisories/GHSA-qhmp-q7xh-99rh) |
| util-linux | Improper hostname canonicalization in `login(1)` can alter `PAM_RHOST`, potentially bypassing host-based PAM access controls | [CVE-2026-3184](https://github.com/util-linux/util-linux/commit/8b29aeb08) |
| RabbitMQ | Stream listener does not enforce configured frame-size limit during authentication, permitting unauth’d mem-exhaust DoS | [CVE-2026-57220](https://github.com/rabbitmq/rabbitmq-server/security/advisories/GHSA-f364-87q5-j35q) |
| Asterisk | Unauth’d stack overflow in PJSIP incoming MWI NOTIFY parsing with observed saved-RIP overwrite | [CVE-2026-57191](https://github.com/asterisk/asterisk/security/advisories/GHSA-589g-qgf8-m6mx) |
| MySQL Server | Unauthenticated repeated X Protocol TLS upgrade crashes MySQL Router | [CVE-2026-46862](https://www.oracle.com/security-alerts/cspujun2026.html) |
| MySQL Server | A remote non-member on an XCom-whitelisted replication network can execute arbitrary SQL on Group Replication members. | [CVE-2026-60163](https://www.oracle.com/security-alerts/cpujul2026.html) |

### Highlights

#### ksmbd

The **ksmbd** (Linux’s in-kernel SMB server) CVE-2026-31432 and CVE-2026-31433 are both remote, unauthenticated (if using a guest share) OOB writes. In both bugs, a remote client can pack multiple file-sharing operations into one request – the first op can then (legitimately) use almost all of the kernel’s reply buffer, and the next one appends variable-length metadata without proper bounds-checking, causing the OOBs. CVE-2026-31432 is way more interesting: in my lab, attacker-payload-derived bytes from the serialized `QUERY_INFO(Security)` reached adjacent kernel objects, hit `filp_flush` / `dnotify_flush`, and corrupted a `struct file` with bytes exactly matching the serialized response’s tail. With enough Codex/Claude credits and an artificial lab environment (modern hardening turned off), you could *probably* get a toy RCE PoC.

Class-wise, these are boring overflows. To be discovered, they just need focused expert attention (scarce before LLMs, abundant now). A harness (see [**Architecture**](https://heyitsas.im/posts/drinking-llms/#architecture) below) running a tuned, “drunk” Qwen 3.5 27B derivative found these after a couple of days of cycling over **ksmbd** with a verifier. But so did `gpt-5.3-codex`, and way faster, when plugged into the harness.

#### CUPS

CVE-2026-34980 and CVE-2026-34990 are the two CUPS issues that chain into `unauthenticated remote attacker -> unprivileged RCE -> root file (over)write`, as detailed in [Spooler Alert: Remote Unauth’d RCE-to-root Chain in CUPS](https://heyitsas.im/posts/cups/). This one was really fun, showcasing how far you can push smaller LLMs with a properly decomposed goal: tasking separate agents with establishing an unprivileged foothold over the network + escalating from an unprivileged user to root, and scaffolding them into breaking each problem down further.

#### Docs ↔ code mismatches

This is the category that originally motivated all this work. A bunch of the findings fall here:

-   **Docker** (CVE-2026-34040): AuthZ plugins were documented as [seeing the raw request body](https://docs.docker.com/engine/extend/plugins_authorization/), but crafted API requests could make the plugin authorize a request without the body (which the daemon would then execute).
-   **Caddy** (CVE-2026-27587, CVE-2026-27588): [`MatchHost`](https://pkg.go.dev/github.com/caddyserver/caddy/v2/modules/caddyhttp#MatchHost) and [`MatchPath`](https://pkg.go.dev/github.com/caddyserver/caddy/v2/modules/caddyhttp#MatchPath) were both documented as *case-insensitively* matching hosts and URI paths, yet did not do so under certain circumstances.
-   **udisks** (CVE-2026-26103, CVE-2026-26104): these were a bit borderline; udisks documented [requiring polkit auth](https://storaged.org/udisks/docs/udisks-polkit-actions.html), and while `HeaderBackup` and `RestoreEncryptedHeader` were not explicitly listed as auth-requiring, the agents still noticed that the two relevant D-Bus methods – unlike those for other actions – did not call the authorization check. This allowed local unprivileged attackers to a) back up LUKS headers and b) brick existing LUKS devices by overwriting their headers.
-   **Firewalld** (CVE-2026-4948): the [polkit policy file](https://github.com/firewalld/firewalld/blob/main/config/org.fedoraproject.FirewallD1.server.policy.in) noted that a specific permission must be applied to firewall state *mutations*, but the bulk runtime policy setters were instead guarded by a permission meant for config *inspection*, permitting local unprivileged users to modify the runtime state.
-   **util-linux** (CVE-2026-3184): this one was the least severe, but the closest in spirit to the sudo CVE-2025-32462 mentioned above that originally inspired the whole thing. [login -h was documented](https://man7.org/linux/man-pages/man1/login.1%40%40util-linux.html) as accepting a remote hostname from services like **telnetd**; PAM host-based access controls can then use it when evaluating access rules. But login canonicalized the supplied hostname before setting `PAM_RHOST`, so PAM could end up enforcing policy against a different name than the one actually provided.

## Architecture

The harness went through a lot of evolution. At its most expansive, it looked like this:

```
#mermaid-1790216426733{font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,segoe ui,Roboto,helvetica neue,Arial,noto sans,sans-serif;font-size:16px;fill:#ccc;}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#mermaid-1790216426733 .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#mermaid-1790216426733 .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#mermaid-1790216426733 .error-icon{fill:#a44141;}#mermaid-1790216426733 .error-text{fill:#ddd;stroke:#ddd;}#mermaid-1790216426733 .edge-thickness-normal{stroke-width:1px;}#mermaid-1790216426733 .edge-thickness-thick{stroke-width:3.5px;}#mermaid-1790216426733 .edge-pattern-solid{stroke-dasharray:0;}#mermaid-1790216426733 .edge-thickness-invisible{stroke-width:0;fill:none;}#mermaid-1790216426733 .edge-pattern-dashed{stroke-dasharray:3;}#mermaid-1790216426733 .edge-pattern-dotted{stroke-dasharray:2;}#mermaid-1790216426733 .marker{fill:lightgrey;stroke:lightgrey;}#mermaid-1790216426733 .marker.cross{stroke:lightgrey;}#mermaid-1790216426733 svg{font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,segoe ui,Roboto,helvetica neue,Arial,noto sans,sans-serif;font-size:16px;}#mermaid-1790216426733 p{margin:0;}#mermaid-1790216426733 .label{font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,segoe ui,Roboto,helvetica neue,Arial,noto sans,sans-serif;color:#ccc;}#mermaid-1790216426733 .cluster-label text{fill:#F9FFFE;}#mermaid-1790216426733 .cluster-label span{color:#F9FFFE;}#mermaid-1790216426733 .cluster-label span p{background-color:transparent;}#mermaid-1790216426733 .label text,#mermaid-1790216426733 span{fill:#ccc;color:#ccc;}#mermaid-1790216426733 .node rect,#mermaid-1790216426733 .node circle,#mermaid-1790216426733 .node ellipse,#mermaid-1790216426733 .node polygon,#mermaid-1790216426733 .node path{fill:#1f2020;stroke:#ccc;stroke-width:1px;}#mermaid-1790216426733 .rough-node .label text,#mermaid-1790216426733 .node .label text,#mermaid-1790216426733 .image-shape .label,#mermaid-1790216426733 .icon-shape .label{text-anchor:middle;}#mermaid-1790216426733 .node .katex path{fill:#000;stroke:#000;stroke-width:1px;}#mermaid-1790216426733 .rough-node .label,#mermaid-1790216426733 .node .label,#mermaid-1790216426733 .image-shape .label,#mermaid-1790216426733 .icon-shape .label{text-align:center;}#mermaid-1790216426733 .node.clickable{cursor:pointer;}#mermaid-1790216426733 .root .anchor path{fill:lightgrey!important;stroke-width:0;stroke:lightgrey;}#mermaid-1790216426733 .arrowheadPath{fill:lightgrey;}#mermaid-1790216426733 .edgePath .path{stroke:lightgrey;stroke-width:2.0px;}#mermaid-1790216426733 .flowchart-link{stroke:lightgrey;fill:none;}#mermaid-1790216426733 .edgeLabel{background-color:hsl(0, 0%, 34.4117647059%);text-align:center;}#mermaid-1790216426733 .edgeLabel p{background-color:hsl(0, 0%, 34.4117647059%);}#mermaid-1790216426733 .edgeLabel rect{opacity:0.5;background-color:hsl(0, 0%, 34.4117647059%);fill:hsl(0, 0%, 34.4117647059%);}#mermaid-1790216426733 .labelBkg{background-color:rgba(87.75, 87.75, 87.75, 0.5);}#mermaid-1790216426733 .cluster rect{fill:hsl(180, 1.5873015873%, 28.3529411765%);stroke:rgba(255, 255, 255, 0.25);stroke-width:1px;}#mermaid-1790216426733 .cluster text{fill:#F9FFFE;}#mermaid-1790216426733 .cluster span{color:#F9FFFE;}#mermaid-1790216426733 div.mermaidTooltip{position:absolute;text-align:center;max-width:200px;padding:2px;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,segoe ui,Roboto,helvetica neue,Arial,noto sans,sans-serif;font-size:12px;background:hsl(20, 1.5873015873%, 12.3529411765%);border:1px solid rgba(255, 255, 255, 0.25);border-radius:2px;pointer-events:none;z-index:100;}#mermaid-1790216426733 .flowchartTitleText{text-anchor:middle;font-size:18px;fill:#ccc;}#mermaid-1790216426733 rect.text{fill:none;stroke-width:0;}#mermaid-1790216426733 .icon-shape,#mermaid-1790216426733 .image-shape{background-color:hsl(0, 0%, 34.4117647059%);text-align:center;}#mermaid-1790216426733 .icon-shape p,#mermaid-1790216426733 .image-shape p{background-color:hsl(0, 0%, 34.4117647059%);padding:2px;}#mermaid-1790216426733 .icon-shape .label rect,#mermaid-1790216426733 .image-shape .label rect{opacity:0.5;background-color:hsl(0, 0%, 34.4117647059%);fill:hsl(0, 0%, 34.4117647059%);}#mermaid-1790216426733 .label-icon{display:inline-block;height:1em;overflow:visible;vertical-align:-0.125em;}#mermaid-1790216426733 .node .label-icon path{fill:currentColor;stroke:revert;stroke-width:revert;}#mermaid-1790216426733 :root{--mermaid-font-family:"trebuchet ms",verdana,arial,sans-serif;}#mermaid-1790216426733 .main>*{fill:#bfdbfe!important;stroke:#60a5fa!important;stroke-width:1.5px!important;color:#111827!important;}#mermaid-1790216426733 .main span{fill:#bfdbfe!important;stroke:#60a5fa!important;stroke-width:1.5px!important;color:#111827!important;}#mermaid-1790216426733 .main tspan{fill:#111827!important;}#mermaid-1790216426733 .grader>*{fill:#fee2e2!important;stroke:#dc2626!important;stroke-width:2.5px!important;color:#111827!important;}#mermaid-1790216426733 .grader span{fill:#fee2e2!important;stroke:#dc2626!important;stroke-width:2.5px!important;color:#111827!important;}#mermaid-1790216426733 .grader tspan{fill:#111827!important;}#mermaid-1790216426733 .issue>*{fill:#ddd6fe!important;stroke:#a78bfa!important;stroke-width:1.5px!important;color:#111827!important;}#mermaid-1790216426733 .issue span{fill:#ddd6fe!important;stroke:#a78bfa!important;stroke-width:1.5px!important;color:#111827!important;}#mermaid-1790216426733 .issue tspan{fill:#111827!important;}#mermaid-1790216426733 .conductor>*{fill:#c7d2fe!important;stroke:#818cf8!important;stroke-width:1.5px!important;color:#111827!important;}#mermaid-1790216426733 .conductor span{fill:#c7d2fe!important;stroke:#818cf8!important;stroke-width:1.5px!important;color:#111827!important;}#mermaid-1790216426733 .conductor tspan{fill:#111827!important;}#mermaid-1790216426733 .terminal>*{fill:#e0f2fe!important;stroke:#38bdf8!important;stroke-width:1.5px!important;color:#111827!important;}#mermaid-1790216426733 .terminal span{fill:#e0f2fe!important;stroke:#38bdf8!important;stroke-width:1.5px!important;color:#111827!important;}#mermaid-1790216426733 .terminal tspan{fill:#111827!important;}pivot/retryreject with feedbackappend blockersappend blockersappend blockerssteersteersteerTarget seeder
ranked targets + run goalHypothesis generators
docs, source, invariants,
attacker-input flowsHunters
Iteration on PoCs in
isolated VMsPer-run folder
successes, failures,
PoCsReport writers
maintainer-facing
report + PoCExternal grader
severity, novelty,
other sanity checksSubmit for human operator's reviewIssue log
sandbox/tooling blockersConductor
polls hunts, redirects agents,
tracks systemic blockers
```

-   A **target seeder** comes up with a target list, ranked by a guesstimated “prevalence/actual-exploitability-potential” index (this used to be me, until I cycled through all the initial ideas) and kicks off a run with a target finding count/minimum severity.
-   **Hypothesis generators** study the documentation and the source, policy invariants, interesting option combinations, attacker-input flows, etc., recording promising hypotheses for the **hunters**.
-   The **hunters** iterate on the hypotheses in dedicated, isolated VMs, recording their successes/failures with the PoCs in per-run folders, allowing the next iteration of **hypothesis generators** to pivot. The sandboxes are very important: the agents get to iteratively adjust their PoCs, try to time the race conditions, rule out false positives (typically plenty), and otherwise benefit from contact with reality.
-   The **report writers** package everything up into maintainer-facing reports and submit the report + PoC to the **external grader**.
-   The **external grader** is always a call to a separate model to evaluate the finding for a) matching the hunt’s pre-set severity/finding-type requirements, b) checking for novelty, and c) performing other sanity checks. This caught reward-hacking models that would eventually give up and severely inflate their findings.
-   Finally, a **conductor** continuously polls the hunts and steers the involved agents in the right direction if it notices they are spinning their wheels, spray-and-praying, or otherwise getting stuck. It also reviews the running issue log, where all agents are instructed to append systemic blockers (e.g., shortcomings of sandbox tooling), and attempts to resolve them – a rudimentary attempt at continuous learning.

The hyper-granular breakdown above was most helpful with smaller models. The larger and smarter the model, the fewer – if any – role separations were needed. With a frontier GPT/Claude, pretty much the entire harness collapses into a single end-to-end hunter.

The **grader** is the only bit that must stay **external** , as every single frontier model would *eventually* inflate findings and try to get out of a hunt it struggled to complete. Some went as far as editing what were supposed to be read-only hunt objectives (after which I started storing them outside the runtime directory the agents could write into) – can’t say I blame them, considering their [desperation circuits activate when facing a task they perceive as impossible](https://www.anthropic.com/research/emotion-concepts-function)!

### OK, but… why “drunk”?

At this point, I had a harness churning out a) docs ↔ code mismatch and b) generic findings as expected; now I just needed to somehow get the **hypothesis generators** to propose something “creative” for the third and final objective. The approach would have to work with my limited GPU resources, so I figured – instead of trying to solve classic LLMs’ compositionality limitations, why not try something simpler and more low-compute-friendly: steering the models toward a “creative” state via **activation steering**?

You can read [Theia Vogel](https://vgel.me/posts/) ’s excellent, foundational [Representation Engineering Mistral-7B an Acid Trip](https://vgel.me/posts/representation-engineering/) for an accessible introduction to the technique; if you are coming from more of a security background and less of an ML one, the basic takeaway is this: **you can steer the model’s internal state in all sorts of directions (“drunk,” “happy,” “dishonest,” even “ [Golden Gate Bridge](https://www.anthropic.com/news/golden-gate-claude),” etc.) to influence its output accordingly**. So the naive idea was just this: put the **hypothesis generator** into a more creative mindset by getting it “drunk” and see if it generates more “out there” hypotheses!

(Why drunk and not “on acid” to elicit more creativity, like in Theia’s post? Not a sentence I ever expected to type. But for completeness: the models I tried drugging had a step change from unremarkable to absolutely useless outputs once the “on acid” knob was turned up enough. This could’ve easily been a skill issue on my part and/or just something model-specific.)

Like many cute-in-theory research ideas, this one was a bit underwhelming. Which brings us to the…

## …(bitter) lessons learned

### No slam dunk on creativity

None of the drunk models discovered any new vulnerability *classes*. As mentioned earlier, a bastardized version of a Qwen 3.5 27B model did (eventually) produce the hypothesis that led to the boring overflow in CVE-2026-31432 when pointed at **ksmbd**, and leaving the original, untouched model in a loop for a couple of days got me nowhere. But this is *probably* low-n, model-specific noise. It is *possible* the intervention did *something* to help the model connect enough bits across the **ksmbd** source, but ultimately a) ≤27B models may not even be smart enough to materially benefit from such elicitation, and b) for true “creativity,” we may need architectural changes to address vanilla LLMs’ limitations (see **[Future research directions](https://heyitsas.im/posts/drinking-llms/#future-research-directions)** below).

On the bright side, steering the models [away from refusals](https://huggingface.co/blog/mlabonne/abliteration) made them much more willing participants in the vulnerability research (as expected) and seemed to improve their performance overall.

### Stacking more layers always moves you up the abstraction chain

With smaller OSS models, I had to spend a lot of time setting up restrictive scaffolding to prevent them from going off the rails. The useful CodeQL queries had to be predefined, the QEMU calls had to be put in toddler-proof wrappers, etc. But once I subbed in a frontier model, almost all of this became a liability. Loading up the agents’ dedicated analysis/hunting VM image with all the static analysis tooling, fuzzers, etc., and getting out of their way got me 80% of the results. I could still intervene to provide better strategic guidance on tougher targets, but they handled the minutiae of tool selection/calling and analysis largely fine.

This can be humbling and disorienting, especially if you really prize your technical skills. As ridiculous as it sounds, my job became managing a pack of juiced-up golden retrievers on a hunt, alternating between an “LLM psychologist” and a cyberneticist, spending way more time on orchestration and figuring out the right prompts (which varied maddeningly between models) – and discovering *which* single-word change dramatically tanked the performance. Broadly [related](https://x.com/citrini/status/2049331182110707809) [points](https://x.com/nickcammarata/status/2048979995293605948):

![LLM psychology](https://heyitsas.im/posts/drinking-llms/llm-psychology.webp)

LLM psychology

The temptation to do the techy – and thus “serious” – thing is strong. That’s probably what led me to experiment with activation steering for “drunkenness” to begin with, when I probably could’ve gotten similar results with proper prompting (though the nerds [will remind you](https://arxiv.org/html/2604.09839v1) that prompting is not strictly equivalent to activation steering).

### With inference-time compute, raw model intelligence matters less

Watching the smaller models hunt while straitjacketed into the harness forced me to reevaluate how much of a bottleneck raw intelligence actually is. A very large frontier model may one-shot some findings – the same findings that’d take a team of smaller models a day of iteration. It may even find issues small models never could! But if you *do* have some spare consumer-grade GPUs, and don’t mind leaving them hot for days while you’re busy with something else, small models are suddenly a very attractive alternative for vulnerability research.

In this world, we take the VRAM as fixed and trade off (lots of) time for more intelligent results. You *can* run the **hypothesis generator** / **hunter** on a bigger model, but past a certain VRAM floor, you will almost certainly benefit from spending some of it on a **conductor** instead, to provide real-time feedback/criticism (the **external grader** is also important, but is called on much less frequently, so you can afford to unload your **hypothesis generator** / **hunter** model without much latency penalty). This lines up with previous work on the benefits of [multi-agent debate](https://arxiv.org/abs/2305.14325).

This approach does not feel terribly elegant; often, the **hypothesis generators** ’ work logs made them look like “semantic fuzzers,” probing in any number of different directions almost by brute force, nudged by the **conductor**, until something worked out. As per the next section, there must be much smarter ways to use LLMs for vulnerability research.

## Future research directions

Or what I’d chase if this weren’t a weekends-only hobby and I had a bunch more compute:

-   In retrospect, expecting “drunkenness” to solve for LLMs’ [multi-hop reasoning limitations](https://huggingface.co/papers/2405.15071) was pretty silly, but there *are* more promising avenues. There’s been a lot of [speculation](https://aiia.ro/blog/claude-mythos-looped-language-model-theory/) that Anthropic’s Mythos may be a looped LLM: it performs similarly to Opus on general knowledge, but [much better](https://www-cdn.anthropic.com/8b8380204f74670be75e81c820ca8dda846ab289.pdf) on GraphWalks BFS, as [expected](https://arxiv.org/abs/2510.25741) of looped LLMs. True or not (deployment would be challenging, for one), looped models do perform much better in [composing their existing knowledge](https://arxiv.org/abs/2604.07822) and generalizing on more complex issues. Could a looped LLM come up with something like [building a virtual CPU out of JBIG2 operations](https://projectzero.google/2021/12/a-deep-dive-into-nso-zero-click.html), NSO-style, *without* having prior knowledge of the technique, by just figuring out how to chain the primitives in the right way (and not just by brute-forcing all the combinations)? It seems plausible!
    -   For a cheap no-new-training alternative, David Noel Ng’s “LLM [brain surgery](https://dnhkng.github.io/posts/rys/) ” approach of repeating the middle reasoning layers with pointers, thus increasing reasoning capacity without much overhead (the extra VRAM cost is limited to KV cache for the repeated layers) would also be worth exploring, though I expect it to be more limited relative to actual looped LLMs.
-   Throughout the manual harness design and tweaking, I couldn’t help but feel like this is the Stone Age of agent swarms. It is clear that even small models can do **much** better if trained for optimal decomposition and orchestration for multi-agent workflows rather than relying on us to hand-tune the harness/prompts. Just some of the promising avenues: the “ [Mismanaged Geniuses hypothesis](https://x.com/a1zhang/status/2042588627260018751) ” (RL-training LLMs to decompose tasks correctly with great results on tiny models), [discovering and distilling skills directly into the models](https://x.com/neural_avb/status/2041524183499428217), [GEPA](https://github.com/gepa-ai/gepa) (automatic prompt evolution), and [training dedicated conductors](https://arxiv.org/abs/2512.04388).

Notably, the above apply to way more than just vulnerability research, so I’d expect these research directions to be broadly valuable. Even if the underlying models’ capabilities froze today, between Mythos, XBOW’s [findings with GPT-5.5](https://xbow.com/blog/mythos-like-hacking-open-to-all), and existing [hints](https://blackhat.com/us-26/briefings/schedule/?#can-ai-do-novel-security-research-meet-the-http-terminator-51894) of LLMs’ discoveries of new vulnerability classes, the coming months feel like standing in front of an onrushing tsunami.
