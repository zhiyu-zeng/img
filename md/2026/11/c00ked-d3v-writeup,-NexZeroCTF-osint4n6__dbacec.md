---
title: c00ked d3v writeup, NexZeroCTF osint/4n6
source: https://zx41r.dev/posts/c00ked-d3v/
source_host: zx41r.dev
clip_date: 2026-11-02T10:48:51+08:00
trace_id: d3cb02e3-ca4e-42b2-843b-8d33ca5ef86a
content_hash: a53420e8dd40baccca306ca6d075b519adfba72f301ba7dc75935aed27bfdd21
status: synced
tags:
  - CTF
  - OSINT
series: null
feed_source: zx41r·恶意软件/逆向
ai_summary: CTF 取证题完整链条：从 GitHub 隐藏的 GHCR 镜像层中挖出被删除的 favicon，经哈希反查与存档服务定位已下线主机，再循删除评论、GitLab 镜像、DNS TXT 逐级跳转拿下两个 flag。
ai_summary_style: key-points
images_status:
  total: 11
  succeeded: 11
  failed_urls: []
notion_page_id: 40c75244-d011-8121-9871-d1b7466ca154
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> CTF 取证题完整链条：从 GitHub 隐藏的 GHCR 镜像层中挖出被删除的 favicon，经哈希反查与存档服务定位已下线主机，再循删除评论、GitLab 镜像、DNS TXT 逐级跳转拿下两个 flag。
> 
> - ** Packages 隐藏线索：** 账号 `kojirou825` 无公开仓库和动态，但 Packages 页发布了一个公开 GHCR 镜像 `ronins-hash-studio`。
> - **镜像层取证：** 不运行容器，直接解包 `docker save` 的 tar；早期层存有 `favicon.ico`，后续层用 `.wh.favicon.ico`（whiteout）将其删除，但旧层文件仍在。按 Shodan/FOFA 方式（base64 后 mmh3）算出哈希 `-1359010016`，FOFA 反查到唯一存活主机 `172.236.204.62`。
> - **死主机取证：** 拿到 IP 时主机已下线，URLScan 的历史存档保留了 DOM；截图无信息，但 DOM 视图里 "Operator Cache" 面板的 HTML 注释中藏着 flag 1。
> - **删除评论复活：** GitHub 网页上看不到的 issue 评论仍留在公开 events API（`/users/kojirou825/events/public`）的 `IssueCommentEvent` 载荷里，泄露三件事：`orange mirror` 指 GitLab、新 handle 为 `yifan471`、GitHub 仓库已废弃。
> - **DNS TXT 收尾：** GitLab 上 `yifan471` 的镜像仓库源码注释暴露子域 `ronins-data.estin.pro`；该子域无 HTTP 服务，其 TXT 记录是 base64，解码得到 Gist URL，执行其中代码获得 flag 2。

## Overview

|     |     |
| :--- | :--- |
| **Event** | NexZeroCTF |
| **Category** | Ronins \[OSINT/4n6\] |
| **Challenge** | `c00ked d3v [1/2 & 2/2]` |
| **Initial Lead** | `kojirou825` |
| **Pivot Chain** | GHCR -> Docker layers -> favicon hash -> FOFA -> URLScan -> GitHub Events -> Git mirror -> DNS TXT -> Gist |

The dev in this story tried to clean up after himself. The first host is already offline when you find it, and the GitHub comment you need was deleted. Both are still recoverable if you know where GitHub, Docker and URLScan keep old data.

## Part 1: the package

The prerequisite challenge, `Vagabond behind laptophada`, gives you one thing: the handle `kojirou825`.

The profile has no public repos and no activity. The tab people skip is **Packages**, and that’s where the lead is.

![GitHub Packages Pivot](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e4e291924bbe479e.png)

One published package: ronins-hash-studio.

The package is a public GHCR image:

![GHCR Package Versions](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c10a033e9e7ab793.png)

The ronins-hash-studio image and its tags.

The tag that matters:

```text
ghcr.io/kojirou825/ronins-hash-studio:2026.02.24-r1
```

## Part 2: layers, whiteouts, favicon

Pull the image and look at the layers one by one instead of running it. A file deleted in a later layer is still inside the earlier one.

```bash
docker pull ghcr.io/kojirou825/ronins-hash-studio:2026.02.24-r1
docker save ghcr.io/kojirou825/ronins-hash-studio:2026.02.24-r1 -o ronins.tar
mkdir extracted_image
tar -xf ronins.tar -C extracted_image
cd extracted_image
```

Loop over the layer tarballs and grep for the favicon:

```bash
for blob in blobs/sha256/*; do
  tar -tf "$blob" 2>/dev/null | grep -E 'favicon\.ico|\.wh\.favicon\.ico' && echo "[+] $blob"
done
```

Two hits:

-   `app/static/favicon.ico`
-   `.wh.favicon.ico`

A lower layer has the real icon and a later layer has a whiteout for the same path, meaning the icon was in an early build and got deleted afterwards. Run the container and you won’t see it, but it’s sitting right there in the older layer’s tarball.

Pull the icon out and hash it the way Shodan and FOFA do (mmh3 over the base64):

```bash
python3 - <<'PY'
import base64
import mmh3

with open("favicon.ico", "rb") as f:
    print(mmh3.hash(base64.b64encode(f.read())))
PY
```

```text
-1359010016
```

Shodan knows the hash but won’t show the host on a free account:

![Shodan Paywall](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/579ce761c12df830.png)

Shodan has the hash, host details are paywalled.

FOFA does:

![FOFA Hit](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/04c018fd8d4acb66.png)

FOFA: one deployment with that favicon.

```text
172.236.204.62
```

The page title and service on that hit match Ronins Hash Studio, so it’s the right box and not a hash collision.

## Part 3: the host is dead, URLScan isn’t

By the time you get the IP the box is down, so you need a scanner that saw it while it was still up. Search the IP on URLScan and there’s a capture from back then:

![URLScan DOM Tree](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8ba7f1728671b86a.png)

URLScan kept the DOM and source of the dead host.

The screenshot shows nothing interesting. Open the DOM view and scroll, there’s an HTML comment inside the `Operator Cache` panel:

![Flag in Archived DOM](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b6f4c7edfaaaece9.png)

Flag 1, in a comment in the archived DOM.

```text
nexus{70uch1n9_9r455_4nd_cur471n9_1mm4cul473_fuck1n9_v1b35_bl3553d_rn}
```

First half done: package -> image -> deleted favicon -> IP -> archived page.

## Part 4: the deleted comment

After flag one, `kojirou825` looks empty again: no contribution graph, no public activity, and a staging repo that leads nowhere. There’s an issue thread on `ZX41R/ronins-staging-repo`, but the comment you want was deleted, so the web UI shows nothing.

The public events API still has it:

```bash
curl -s https://api.github.com/users/kojirou825/events/public
```

![GitHub Events API](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5ae4da12c444f80a.png)

IssueCommentEvent from kojirou825 on ZX41R/ronins-staging-repo.

When I checked, the event payload still had the full comment body:

> bro I told you the orange mirror uses a different namespace for the new staging pipeline. i used yifan471 to push the final commits. stop opening issues here, this repo is dead.

What you take from it:

-   `orange mirror`: GitLab (orange logo), not GitHub
-   `yifan471`: the new handle
-   `this repo is dead`: stop digging on GitHub

## Part 5: the mirror

Search `yifan471` on GitLab and there’s another `ronins-staging-repo`:

![Mirror Repository](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3418d9809f8e4b9e.png)

ronins-staging-repo under yifan471.

Not much history in it. Read the staged HTML instead. There’s a comment block in the source that names the next host:

![Staging Source Leak](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/76a3b8d0839828c2.png)

The staged source names ronins-data.estin.pro.

```text
ronins-data.estin.pro
```

## Part 6: DNS TXT

`ronins-data.estin.pro` serves nothing useful over HTTP. When a subdomain exists but has no site, check its records. TXT first:

```bash
dig TXT ronins-data.estin.pro
```

![DNS TXT Record](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8de10aebb28c0692.png)

One base64 TXT record.

Decode it:

```bash
base64 -d <(echo -n "aHR0cHM6Ly9naXN0LmdpdGh1Yi5jb20vWlg0MVIvZWRlNjdhMjBjOGViNDE0ZGE5OWZiZDE0ZmY5NmJlOTI=")
echo
```

![Decoded Gist URL](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b20610590053c09d.png)

The TXT record decodes to the Gist URL.

```text
https://gist.github.com/ZX41R/ede67a20c8eb414da99fbd14ff96be92
```

Open the Gist and run the code in it to get the last flag:

```text
nexus{l37_h1m_c00k_7h3_dn5_r3c0rd5_4r3_5p1cy_4f}
```

## Chain

-   GitHub Packages -> GHCR image
-   image layers -> deleted favicon
-   favicon hash -> FOFA -> IP
-   URLScan capture of the dead host -> flag 1
-   public events API -> deleted comment -> `yifan471`
-   GitLab mirror -> `ronins-data.estin.pro`
-   DNS TXT -> Gist -> flag 2
