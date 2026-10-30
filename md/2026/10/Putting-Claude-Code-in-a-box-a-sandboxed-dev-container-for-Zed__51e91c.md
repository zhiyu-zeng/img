---
title: "Putting Claude Code in a box: a sandboxed dev container for Zed"
source: https://hnsecurity.it/blog/putting-claude-code-in-a-box-a-sandboxed-dev-container-for-zed/
source_host: hnsecurity.it
clip_date: 2026-10-31T03:30:01+08:00
trace_id: ab1dff37-ef6b-4aaf-abc6-1ce7f52b3b73
content_hash: 952f339a9a2c3d8c2eeb3d28b205f367003e8e207ebe2fc9afb307b0bef5df22
status: synced
tags:
  - AI应用
  - 开发工具
series: null
feed_source: HN Security·漏洞研究
ai_summary: 作者将 Trail of Bits 的 claude-code-devcontainer 移植为 Zed 可用的 zed-claude-devcontainer，让 Claude Code 在容器内以 YOLO 模式安全运行，主打安全审计与 Rust 开发。
ai_summary_style: key-points
images_status:
  total: 16
  succeeded: 16
  failed_urls: []
notion_page_id: 40975244-d011-81dc-a8b0-c2e1e33734a2
ioc:
  cves:
    - CVE-2026-109618
    - CVE-2026-109619
    - CVE-2026-111497
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 作者将 Trail of Bits 的 claude-code-devcontainer 移植为 Zed 可用的 zed-claude-devcontainer，让 Claude Code 在容器内以 YOLO 模式安全运行，主打安全审计与 Rust 开发。
> 
> - **动机：** `bypassPermissions` 有提示疲劳与提示注入风险，叠加 npm/crates.io 供应链攻击频发；容器文件系统隔离可限制爆炸半径，但容器不是强安全边界，不能当恶意软件分析沙箱用。
> - **Zed 兼容修复：** `postCreateCommand` 改用 exec 数组形式（Zed 会破坏字符串形式）；用 `core.checkStat=minimal` 和 `core.trustctime=false` 消除绑定挂载导致的幻影 git 变更与 100% CPU；修复重建后 `gh` 凭据助手失效；还查明 OrbStack 以 umask 0 启动 dockerd，使 `docker exec` 进程 umask 为 0000 产生全局可写文件。
> - **沙箱加固：** 上游对 `SYS_ADMIN` 的检查漏掉多数提权路径（`ALL`、privileged 等），fork 在启动前静态检查 `devcontainer.json` 危险配置，启动后校验容器实际权限；不可信仓库的 `.git/config` 和 `.git/hooks` 只读挂载，防止植入宿主执行的钩子。
> - **凭据建议：** 容器内代码可读取并滥用 `gh` token（可留存活 Wolverine 式的 deploy key/webhook），应改用限定仓库、短有效期、无 Administration/Webhooks 权限的细粒度 token，不信任的项目干脆不登录。
> - **实战检验：** Pwn Day（PHP2Shell CVE-2026-109618/109619、Node2Shell）后，作者用"每个 PoC 一个全新容器、容器内不登录 gh、宿主防火墙（Little Snitch/LuLu）管出网"的方式低风险验证 PoC——因容器有 `NET_ADMIN` 和 sudo 可自行撤销 iptables，网络限制必须放在宿主侧。

> *“Our robot overlords will use NUL-terminated strings.”  
> — Matthew Garrett*

## TL;DR

I’ve **forked** Trail of Bits’ excellent [claude-code-devcontainer](https://github.com/trailofbits/claude-code-devcontainer) to adapt it for the [Zed](https://zed.dev/) editor. The result is [zed-claude-devcontainer](https://github.com/0xdea/zed-claude-devcontainer), a **sandboxed dev container** for running [Claude Code](https://claude.com/product/claude-code) with `bypassPermissions` enabled, from Zed or from a terminal. It’s mainly designed for **security audits** and **Rust development**.

For a couple of weeks now, I’ve been doing most of my Rust development inside it. It also proved handy for **trying out the PoCs** that flooded in after the [PHP2Shell](https://calif.io/php2shell/) frenzy of October 21, 2026, which some are already calling [Pwn Day](https://pwn-day.wisp.place/).

*![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/9c319a54b119b025.webp)*

## Living dangerously, safely

If you use coding agents for development or code review, you know the drill: Claude Code asks for permission before running commands or editing files. After the hundredth “yes, you can run `cargo test` “, alert fatigue sets in and you become more likely to approve something you shouldn’t. It may also be tempting to skip the prompts altogether with `bypassPermissions` (affectionately known as **YOLO mode**). But an agent that never asks can mess with your shell configuration, `rm -rf` things outside the project, or abuse any credentials lying around. A prompt injection hidden in an untrusted repository would get the same privileges. Not exactly what I’d call a good idea during a security audit

![😬](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/9aa4a3e9dfe5a3a0.png)

The obvious solution is to **put the agent in a box**: run it in a disposable container that can only see your project directory, and let it go wild in there. That’s exactly what a dev container gives you. **Filesystem isolation** keeps the rest of your host out of reach, and if something goes wrong, you can just throw the container away and start over.

There’s another reason why I’ve grown fond of this setup, which has nothing to do with AI. We live in an era of **pervasive supply chain attacks**. Self-replicating [worms](https://www.cisa.gov/news-events/alerts/2025/09/23/widespread-supply-chain-compromise-impacting-npm-ecosystem) have torn through npm, and [malicious crates](https://blog.rust-lang.org/2026/08/20/supply-chain-attack-on-arrayref/) keep popping up on crates.io. Every `cargo build` of a project with a few hundred transitive dependencies runs a lot of code that I’ll never read. Doing my development in a container doesn’t make this problem go away, but it **limits the blast radius**. If a compromised dependency goes looking for my private keys or other sensitive information, at least it’ll only find what’s in the box.

## Standing on the shoulders of Trail of Bits

Luckily, to build my dev container template I didn’t have to start from scratch. The fine folks at [Trail of Bits](https://www.trailofbits.com/) created [claude-code-devcontainer](https://github.com/trailofbits/claude-code-devcontainer) for their own **security audit workflows**, and released it under the Apache License 2.0. It’s a solid Ubuntu-based image with Node.js, Python, and the usual command line goodies. A handy `devc` helper script installs the template into a project and manages the container’s lifecycle.

> How to run claude in YOLO mode safely: Use the [@trailofbits](https://x.com/trailofbits?ref_src=twsrc%5Etfw) devcontainer for full file and network isolation.[https://t.co/ERtfdYC5f9](https://t.co/ERtfdYC5f9)
> 
> — Dan Guido (@dguido) [January 30, 2026](https://x.com/dguido/status/2017302474952945922?ref_src=twsrc%5Etfw)

I also appreciate its candid **threat model**. A container doesn’t provide a strong security boundary: escape should be hard, not impossible. Code inside can plant files, in `.git` for example, that run on your host the next time you use them there. Outbound network access is unrestricted by default, and your `~/.gitconfig` is visible inside (read-only). VS Code’s Dev Containers extension also forwards your SSH agent, so code running inside can authenticate as you, even though your private keys never leave the host (Zed and the Dev Container CLI don’t do this). In other words, **this isn’t a malware analysis sandbox**.

For me, there was an additional catch: the upstream template targets VS Code and Cursor, while I’ve been a happy [Zed](https://zed.dev/) user for quite some time now. Zed [supports](https://zed.dev/docs/dev-containers) dev containers, so I figured it would be easy to make the two play nicely together. Famous last words

![😅](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/723bceeff120314b.png)

## Meet zed-claude-devcontainer

A few dozen commits later, here’s [zed-claude-devcontainer](https://github.com/0xdea/zed-claude-devcontainer). The full list of changes from upstream is in the `README.md`. Here are the highlights.

### Making Zed happy

Getting the template to work properly in Zed turned out to be a nice little bug hunt, and not all the bugs were Zed’s:

-   **When Zed created the container, the `postCreateCommand` never ran.** Zed mangles string-form lifecycle commands ([zed-industries/zed#62964](https://github.com/zed-industries/zed/issues/62964)), so the template’s `post_install.py` did nothing. The exec (array) form fixes it in Zed and works everywhere else, so I’ve proposed it upstream too (see below).
-   **World-writable files.** Some Docker engines, OrbStack among them, start `docker exec` processes with umask `0000`. In my fork, fish and zsh restore umask `022` in every shell, and bash does so in interactive shells. This doesn’t cover Zed’s remote server, though. More on this little rabbit hole below.
-   **Phantom git changes.** Bind-mounted files can look modified to git just because their inode or ctime metadata differs from what the host recorded. In my setup, this caused a race between host and container that resulted in 100% CPU usage. I added `core.checkStat=minimal` and `core.trustctime=false` to `~/.gitconfig.local`, and the CPU went back to idle (also proposed upstream).
-   **`gh` login across rebuilds.** `gh auth login` stores git’s credential helper in the global git config, which `post_install.py` rewrites upon every container creation, so after a rebuild git stopped using my `gh` login. The generated config now sets the helper itself (also proposed upstream).
-   **Project names.** My fork mounts each project at `/workspaces/<folder name>` instead of plain `/workspace`, so Zed’s GUI shows the projects under their own names.
-   **Housekeeping.** The VS Code customizations are gone from my fork, and `devcontainer.json` uses the base devcontainer schema, avoiding an unresolvable `vscode://` reference.

### Tightening the screws

A sandbox is only as good as its weakest wall, so I spent some time poking at the upstream template’s defenses. One of them in particular caught my attention: the project’s `.devcontainer/` folder is **mounted read-only** inside the container, so that code running in there can’t plant settings (`initializeCommand`, extra mounts, `runArgs`) that take effect on the host at the next rebuild. But the container user has passwordless sudo, and only the missing **`CAP_SYS_ADMIN` capability** stops root from remounting that folder as writable.

Upstream’s `devc` guards this with a simple check that refuses to start a container with `SYS_ADMIN`. However, this check misses most ways to grant `SYS_ADMIN`, `ALL`, or privileged mode. Each of them lets root remount the folder and write to the host directory. My fork **catches dangerous settings in `devcontainer.json` statically**, before anything starts. It also **inspects the running container’s actual privileges** after startup, and stops the container if anything got through. Both checks live in `devc`, so they only help if `devc` creates the container. Like the original, this is a guardrail against weakening the sandbox by accident, not a defense against someone who already controls `devcontainer.json` on your host.

The other thing worth hardening is what the container can do *outside* your machine: the `README.md` now has advice on **GitHub access**. Anything in the container can read and use your `gh` token, including the code you’re reviewing and its dependencies. A browser login or a classic token controls all your repositories. An attacker could use it to add deploy keys, collaborators, or webhooks that survive even after you revoke the token. Use a **fine-grained token** instead, limited to the repositories you need, with a short expiration and no Administration or Webhooks permission. Even better, don’t log in at all when working on projects you don’t trust.

### Batteries-included Rust development

The container image comes with everything I need for my daily Rust work:

-   The **Rust toolchain** via rustup.
-   **Rust and CI tools** such as `cargo-audit`, `cargo-deny`, `cargo-semver-checks`, `cargo-nextest`, `cargo-generate`, `cargo-dylint`, and [zizmor](https://github.com/zizmorcore/zizmor). [cargo-binstall](https://github.com/cargo-bins/cargo-binstall) installs the cargo tools **from each project’s own release binaries**, which cuts the build time considerably.
-   `libxdo-dev` and `xvfb`, to build mouse/keyboard automation crates and to run tests against a **virtual X display**.

I’ll add more as I complete the migration of my Rust projects to dedicated dev containers.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8fc641cc60ce9647.png)

Behold, my ultra-wide setup with Zed and sandboxed Claude Code via ACP.

### Making it $HOME

Since I’m planning to spend most of my days in there, I’ve made myself comfortable: **fish** is the default shell, and the build installs a recent **Neovim** and clones and stows a **dotfiles** repository. It’s mine by default, but you can point `DOTFILES_REPO` in the Dockerfile at your own, as long as it has `fish`, `nvim`, and `tmux` packages.

Finally, a CI workflow lints the template, builds the image, checks the container, and runs zizmor. Renovate keeps the pinned dependencies up to date, with a **10-day minimum release age**. Again, supply chain attacks are a thing

![🤷](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/eb91d0614bad6e39.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/76eb931dd695a746.jpg)

## Down the umask rabbit hole

Remember those world-writable files? They deserve a story of their own. Shortly after I started using the container, I noticed that some files created in my project folders were `-rw-rw-rw-` on my Mac host. Git doesn’t record these permissions (only the executable bit), so at least they never reached a remote. My first suspect was Zed, which starts its remote server and everything else via `docker exec`. That turned out to be only half of the story…

![🕵️‍♂️](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f61670211b093dbc.png)

A quick test with a plain Alpine container showed that every `docker exec` process got umask `0000`, whoever started it: Zed, `devc exec`, or a plain `docker exec` from my terminal. The container’s main process got the usual `0022`. Peeking at `/proc/<pid>/status` inside OrbStack’s VM revealed the culprit: OrbStack starts `dockerd`, `containerd`, and `containerd-shim` with **umask 0**. runc explicitly sets `0022` for a container’s init process, but `docker exec` processes inherit `0000` from the shim. As far as I could tell, no OrbStack setting, `daemon.json` option, or `docker exec` flag can change this, so I [reported it to OrbStack](https://github.com/orbstack/orbstack/issues/2759).

Restoring the umask in shell init files covers terminals and Claude Code’s Bash tool. It doesn’t cover Zed’s remote server, though, which saves your edits and launches language servers, `cargo check`, and git. I’ve asked the Zed folks to [reopen a related issue](https://github.com/zed-industries/zed/issues/57185), which they did, and suggested a fix that would cover both SSH and dev containers.

## Giving back

I always try to **contribute my fixes back** wherever they could help others. Here’s what came out of a couple of weeks of tinkering:

-   **Trail of Bits** [claude-code-devcontainer](https://github.com/trailofbits/claude-code-devcontainer): [#56](https://github.com/trailofbits/claude-code-devcontainer/pull/56) uses the exec form of `postCreateCommand` to make Zed happy. [#57](https://github.com/trailofbits/claude-code-devcontainer/pull/57) is a batch of bug fixes, such as a missing `jq` check and support for symlinked workspace paths. [#58](https://github.com/trailofbits/claude-code-devcontainer/pull/58) hardens the `SYS_ADMIN` check described above. [#59](https://github.com/trailofbits/claude-code-devcontainer/pull/59) fixes the phantom git changes and keeps the `gh` credential helper across rebuilds.
-   **RustSec** [cargo-audit](https://github.com/rustsec/rustsec): [#1731](https://github.com/rustsec/rustsec/pull/1731) adds the metadata that lets `cargo-binstall` find cargo-audit’s prebuilt release binaries, which it couldn’t do before because of the monorepo’s tag naming.
-   **OrbStack**: [#2759](https://github.com/orbstack/orbstack/issues/2759), the umask story above.
-   **Zed**: besides the [umask issue](https://github.com/zed-industries/zed/issues/57185), I added my findings to [#56576](https://github.com/zed-industries/zed/issues/56576). Zed keys remote connections on the container ID, which changes at every rebuild, so **agent threads vanish** from the list. The `README.md` documents a workaround until it’s fixed. I also reported a **security issue** to Zed privately; I’ll say more once it’s published.

All the public contributions were still open at the time of writing. Fingers crossed!

![🤞](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a6cacfd48ecadc57.png)

## Entering the container

To use the dev container, you’ll need a Docker runtime ([OrbStack](https://orbstack.dev/) is my choice on Apple Silicon), `jq`, Node.js, and npm. Zed is optional, but recommended. The following one-time setup installs the Dev Container CLI and the `devc` helper:

```bash
$ npm install -g @devcontainers/cli 
$ git clone https://github.com/0xdea/zed-claude-devcontainer ~/.claude-devcontainer 
$ ~/.claude-devcontainer/install.sh self-install
```

Then, pick the pattern that fits your workflow. You should give an **untrusted repository** a container of its own:

```bash
$ git clone <untrusted-repo> 
$ cd untrusted-repo 
$ devc .
```

In this case, the project’s `.git/config` and `.git/hooks` are mounted read-only, so code running in the container can’t plant git config or hooks that would later run on your host. For **related repositories you trust**, you can instead create a shared workspace: run `devc .` in it, and clone the repositories inside. Just keep in mind that the nested repositories don’t get the read-only `.git` protection.

Before you open anything in Zed, one **important warning**, especially for fellow auditors: only open projects whose `.devcontainer/` was installed by `devc`. A malicious `devcontainer.json` can **run commands on your host** via `initializeCommand`, mount host directories, weaken the container’s isolation, or install Zed extensions. If the repository already has a `.devcontainer/`, `devc .` asks before replacing it, and the right answer is `y`. Trusting config files that come with untrusted code, what could possibly go wrong?

![🙈](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b87d14b2d4368806.png)

After you open the project folder in Zed, choose **Open in Container** when prompted (or run **Project: Open Remote** and select **Connect Dev Container** from the command palette). Zed attaches to the container started by `devc`, and its terminal, language servers, and external ACP agents run inside it. If you prefer the terminal, `devc shell` drops you into a fish shell where you can run `claude` directly.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5f48495babe4d076.gif)

Is it done yet? Typey typey!

To keep things fresh, `devc rebuild --no-cache` rebuilds the image from scratch, picking up the latest Claude Code, Rust toolchain, cargo tools, and packages. `devc upgrade` updates Claude Code only (until the next rebuild), and `devc destroy` wipes the container, its volumes, and its image when you’re done.

## Putting it to the test

This container has become my daily driver: Claude Code runs with `bypassPermissions` enabled and does its thing, while `cargo` and friends run next to it, and my host stays clean. Not planning to look back anytime soon.

Then [Pwn Day](https://pwn-day.wisp.place/) hit on October 21, 2026, and my setup got its **trial by fire** In case you’ve been living under a rock, the [PHP2Shell](https://calif.io/php2shell/) vulnerabilities (**CVE-2026-109618** and **CVE-2026-109619**) are a pair of [nasty bugs](https://thephp.foundation/blog/2026/10/21/todays-php-security-release-and-how-were-strengthening-php-security/) in the PHP engine that can lead to **unauthenticated remote code execution**, with affected versions going back to PHP 5.4. On the very same day, Node.js shipped fixes for [Node2Shell](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases) (**CVE-2026-111497**), an out-of-bounds write in the bundled Brotli decoder that can also lead to remote code execution.

![🔥](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b0f4c358afcce0dd.png)

Meanwhile, a [malicious LiteLLM 1.107.0](https://docs.litellm.ai/blog/security-incident-oct-21-2026) with a credential stealer and a RAT landed on PyPI and Docker Hub. And [Railway](https://blog.railway.com/p/security-disclosure-wednesday-october-21st) asked all its users to rotate their secrets after a breach. The day before, the [eMudhra](https://emudhra.we-have-a-problem.com/) certificate authority turned out to have generated eight intermediate CA private keys so badly that anyone could recover them from the public certificates. One of them was [literally the number 4](https://scotthelme.co.uk/eight-bits-of-trust-emudhras-ca-keys-cracked-in-milliseconds/)

![🤯](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5a0faea28d801cea.png)

![](https://hnsecurity.it/wp-content/uploads/2026/10/meme_is_4_a_lot-1024x1014.jpg)

What a way to celebrate Cybersecurity Awareness Month, huh? I’d say everyone is very aware now

![🙃](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/76913e147f4c4193.png)

Needless to say, **PoCs** for the RCE vulnerabilities started flying around within hours. As I’ve learned the hard way over three decades of security research, **fake PoCs that drop malware** are a classic. The more hyped the vulnerability, the more of them you’ll see. My new dev container turned out to be a handy place to clone, read, build, and run them with **much less risk** to my host. It’s not a malware sandbox, though, so I took a few **extra precautions**: a fresh container for each PoC, wiped with `devc destroy` afterwards; no `gh` login inside; and reading the code before running it

![🤓](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/bf5a4edd87080ae8.png)

Restricting **network access** was the tricky part. Upstream’s [README](https://github.com/trailofbits/claude-code-devcontainer/blob/main/README.md) shows how to set up iptables rules, but the container has `NET_ADMIN` and passwordless sudo, so a malicious PoC can simply undo those rules. A firewall on the host, on the other hand, is out of its reach: solutions such as [Little Snitch](https://www.obdev.at/products/littlesnitch/) or [LuLu](https://objective-see.org/products/lulu.html) can see every outgoing connection attempt and ask before letting it through. That’s what I ended up using. Rules apply to all containers at once, so they’re coarse, but nothing inside the container can turn them off.

## To be continued…

There’s still some work to do. I’ll keep the fork in sync with upstream as my pull requests land, and I’m hoping that the OrbStack and Zed issues get fixed. I’ll also try to simplify the `DOTFILES_REPO` configuration and add a simple way to turn network isolation on and off.

In the meantime, grab [zed-claude-devcontainer](https://github.com/0xdea/zed-claude-devcontainer) and give it a spin. If you use VS Code or Cursor instead, the [upstream project](https://github.com/trailofbits/claude-code-devcontainer) has you covered. Either way, feedback, issues, and pull requests are welcome!

## Acknowledgments

Huge thanks to **Trail of Bits** for creating and open-sourcing the original [claude-code-devcontainer](https://github.com/trailofbits/claude-code-devcontainer), and to the **Zed** team for building a best-in-class editor that I enjoy using every day.

Stay safe, and keep your robots in a box!

![📦](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c26454afb9bbc2a6.png)

![🤖](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/3ee07ef63a271f85.png)

The post [Putting Claude Code in a box: a sandboxed dev container for Zed](https://hnsecurity.it/blog/putting-claude-code-in-a-box-a-sandboxed-dev-container-for-zed/) appeared first on [HN Security](https://hnsecurity.it/).
