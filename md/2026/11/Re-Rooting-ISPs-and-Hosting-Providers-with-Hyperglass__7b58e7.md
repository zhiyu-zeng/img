---
title: "Re: Rooting ISPs and Hosting Providers with Hyperglass"
source: https://seclists.org/oss-sec/2026/q4/626
source_host: seclists.org
clip_date: 2026-11-10T17:08:35+08:00
trace_id: a303b303-14a9-4d92-8562-97f18a6d95a2
content_hash: e664654b2b3d3eca9edf09e8d289cf5b8df451c5c5e94dbb4e680d7019a392f3
status: synced
tags: []
series: null
feed_source: oss-security·漏洞披露
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41475244-d011-81ba-872e-faf66af00db2
ioc: null
---

## oss-sec mailing list archives

## Re: Rooting ISPs and Hosting Providers with Hyperglass

* * *

*From*: Solar Designer <solar () openwall com>  
*Date*: Tue, 10 Nov 2026 09:31:43 +0100  

* * *

```
On Tue, Nov 10, 2026 at 07:59:20AM -0000, factoid () morke ru wrote:
```

> ```
> https://hyperpwn.xyz/
> 
> Note: All the research, from hunting to exploitation was done by DS. All I
> did was validate. Posting this on LET first, hopefully it spreads.
> ```

```
Where DS is DeepSeek.
```

> ```
> TLDR; hyperglass has OS code exec vulns which you can trivially turn into
> pre-auth RCE. Many ISPs and hosting providers are vulnerable to it because
> they expose their hyperglass instance to the internet
> ```

```
We want actual content in list postings, not only a link and summary.
Here's some copy-paste from the above website:
```

> ```python
> hyperglass is a looking-glass front end. You give it a target, it drops that target into a router command and hands 
> the result to Netmiko. The target goes in with a bare str.format() and is never shell-escaped. On any platform where 
> the command ends up in a Linux shell, the target stops being data.
> 
> A sweep of PeeringDB and Shodan for exposed hyperglass instances produced 36 hosts with command execution across 20 
> ASNs, 11 of them root or root-equivalent. Almost all are collectors and edge VMs, not core forwarding routers. None 
> is a whole-AS compromise — but a lot of this is real infrastructure with reusable credentials behind it.
> 
> What was reachable
> 
> The short version, before the details:
> 
>     lg.biztelecom.ro — root on a Proxmox node, 42 guests, Ceph admin, PBS backups
>     Citra rs-core — 27 iBGP peers and 2.04M routes, core route reflector
>     Ssmidge — root on a border host plus camtr0, paths toward K-root/AS25152
>     Netecom — root with FRR full table, routinator and Redis
>     SolNet — 16 BGP sessions and 2.96M routes
>     AMO — NOPASSWD birdc
>     Plus 29 more hosts across 20 ASNs, 11 root/root-equivalent in total
> ```

> ```swift
> The bug
> 
> # hyperglass/execution/drivers/_construct.py:113
> return command.format(target=self.target, mask=mask, **attrs)
> 
> The command templates look like this:
> 
> vtysh -c "show bgp ipv4 unicast regexp {target}"
> 
> The AS-path and community rules validate with a wildcard, so almost any string passes. Netmiko ships it to linux_ssh, 
> and bash expands it.
> 
> Three ways it lands:
> 
> 1. FRR AS-path injection. A quote closes the intended argument and $() or ; runs in the shell. Unauthenticated, this 
> returns uid=1001(hyperglass) on Pombonet.
> 
> 2. BIRD IPv6 scope-ID injection. Python's ipaddress accepts arbitrary text after the % of an IPv6 address, so 
> fe80::1%;id passes validation as a scoped address. The original string is then inserted unquoted into ping -6 ... 
> {target}, and bash reads the semicolon as a separator. Unauthenticated, this returns uid=1000(hyperglass) on SolNet.
> 
> 3. Cisco IOS newline injection. An internal newline survives validation and the unquoted BGP community command turns 
> into two CLI lines. The second line goes to the router inside the already-authenticated SSH session, so 
> 1.1.1.1\nclear ip bgp * shows the route and then clears BGP. This one is proven against an IOS emulator, not a live 
> public target.
> 
> A second, independent reproduction against a clean revision pointing at a real OpenSSH shell returned the service UID 
> and created a file via touch /tmp/pwned_hg. It is tracked upstream in #383 / PR #382, and has been open on the public 
> repository for four months.
> The scan
> 
>     3,693 PeeringDB looking-glass URLs, plus Shodan queries
>     388 live hyperglass instances
>     36 confirmed hosts with command execution
>     11 root or root-equivalent
>     20 ASNs with writable routing state
>     Mostly collectors; none is a forwarding core
> ```

> ```sql
> What it can actually do
> 
>     Inject, withdraw or blackhole routes on 20 ASNs
>     Reset BGP sessions and poison route-reflector state that then propagates over iBGP
>     Shift paths toward K-root and transit peers
>     Read and clone guest disks and backups on BizTelecom
>     Reuse SSH keys and service passwords across hosts
>     Pull full tables and MRT from three Tier-1 collectors
>     Deploy proxies, containers, tunnels and persistence
> 
> Severity and urgency
> 
> Critical — both.
> 
> Eleven root or root-equivalent hosts, 20 ASNs with writable routing state, and a Proxmox cluster with 42 guests and 
> its backups all sit behind a single unauthenticated endpoint. The access is credential-based, survives reboots, and 
> stays quiet. Nothing gets rotated unless someone notices, so the footholds remain live and reusable indefinitely.
> 
> The only thing capping this below a national outage is that the hosts are collectors and edge nodes, not forwarding 
> cores. Everything above that — host control, backup access, route injection, blackholing, session resets, RPKI 
> poisoning — is in scope and chained across dozens of independent networks.
> 
> Urgency: act now. One unauthenticated POST reaches all of it. Rotate what can be rotated and rebuild what cannot, 
> before the credentials age out or quietly get shared.
> 
> The list above is a floor, not a ceiling. 388 live instances turned up from a few thousand URLs, and only the 
> reachable ones were followed up. The same three input paths exist on every unpatched deployment, so the real number 
> of pwnable targets is almost certainly far higher. It has to be patched as soon as possible.
> 
> Caveats
> 
>     No whole-AS compromise
>     No core router root
>     Collectors are leaf nodes, not the dataplane
>     Payment, SaaS and customer data are out of scope here
>     The Cisco newline variant is emulator-tested, not live-proven
> 
> Closing
> 
> The bug is boring: one unescaped format call, a wildcard validator, and a shell underneath. The result is not. 
> hyperglass is common, the directive ships built in, and /api/query is unauthenticated by default. Swap the target for 
> $(id) and a looking glass becomes a shell.
> 
> This research was autonomously found by a swarm of agents running DeepSeek V4.1 Flash.
> ```

```
It also links to:

https://github.com/thatmattlove/hyperglass/issues/383

which was opened on July 15 and says:
```

> ```bash
> ### Summary
> 
> The builtin directive templates for the shell-backed platforms interpolate the **unauthenticated** query target into 
> a command string that is executed by a POSIX shell. A shell metacharacter in the query target breaks out of the 
> intended argument, so a single unauthenticated `POST /api/query` can run arbitrary OS commands on the managed router 
> as the SSH login user.
> 
> ### Version
> 
> v2.0.0 through current `main` (v2.0.4).
> 
> ### Affected platforms
> 
> Backends whose command string is parsed by a shell:
> 
> - **FRR, BIRD, OpenBGPD**— mapped to `device_type="linux_ssh"`, so netmiko delivers the command to a host **bash** 
> shell.
> - **TNSR**— the directive runs `dataplane shell sudo vtysh -c "..."`, which drops to a host shell.
> 
> The non-shell NOS platforms (Cisco/Arista/Juniper/Nokia/Huawei/MikroTik/VyOS) are not shell-injectable, but an 
> embedded newline in the target survives netmiko's `rstrip`-only `normalize_cmd` and is executed as a second CLI line.
> 
> ### Root cause
> 
> Two things combine:
> 
> 1. `Construct.format()` substitutes the target with a bare `str.format()` — no shell escaping:
>    ```python
>    # hyperglass/execution/drivers/_construct.py
>    return command.format(target=self.target, mask=mask, **attrs)
>    ```
>    with templates like `'vtysh -c "show bgp ipv4 unicast regexp {target}"'`.
> 2. The default `condition="*"` rule compiles to `re.compile(".+").match()` (`hyperglass/models/directive.py`), which 
> is start-anchored and matches any non-empty string, so no shell metacharacter is rejected.
> 
> A `"` in the target closes the quote and a following `;` / `` ` `` / `$(...)` reaches bash. OpenBGPD's template 
> (`bgpctl show rib inet as {target}`) is unquoted, so a bare `;` injects directly.
> 
> ### Steps to Reproduce
> 
> 1. Deploy hyperglass with an FRR (or BIRD/OpenBGPD/TNSR) device — the default builtin `BGP AS Path` directive.
> 2. Send an unauthenticated query whose target contains a shell metacharacter, e.g. a `queryTarget` of:
>    ```
>    _65000"; id; echo "
>    ```
> 3. The constructed command becomes `vtysh -c "show bgp ipv4 unicast regexp _65000"; id; echo ""`, and bash executes 
> the injected `id`.
> 
> ### Expected Behavior
> 
> The query target should be treated as a single, literal argument to the device command; shell metacharacters in it 
> should have no effect beyond (at most) failing to match.
> 
> ### Observed Behavior
> 
> The injected command executes on the router host. The HTTP response still returns the legitimate `show bgp` output, 
> so the injection is not visible in the query result.
> 
> ### Fix
> 
> Proposed in #382 — shell-quote the target at construction for shell-backed platforms, and reject ASCII control 
> characters at the query model (for the newline vector on non-shell platforms).
> ```

```
and has some comments about a fork of the project and notifying the
affected providers (which were apparently not notified until today).

Alexander
```
