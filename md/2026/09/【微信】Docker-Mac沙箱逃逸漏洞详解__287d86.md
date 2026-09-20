---
title: 【微信】Docker Mac沙箱逃逸漏洞详解
source: https://mp.weixin.qq.com/s/83nLAv_Lc7xIkIn5FF_Zmg
source_host: mp.weixin.qq.com
clip_date: 2026-09-20T14:49:02+08:00
trace_id: 65d92bc8-1a35-470f-8d72-592d22a81548
content_hash: 499463260584b000aed3c4c1a1659be0dda4c682cebab92aca1062518ac9702c
status: synced
tags:
  - 微信
  - 漏洞分析
  - 风控对抗
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: Docker 在 Mac hypervisor 中发现并修复沙箱逃逸漏洞 CVE-2026-77179：容器内三行 bash 即可读写宿主机任意文件。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 3
  failed_urls:
    - https://mmbiz.qpic.cn/sz_mmbiz_png/Kric7mM9eA5AwxQ0UzPv7IpAjWswmvFT5ic8N8u3ic0icr5TNJZpFRS5mvibeiap2cJkmES0rwyHokn928cCmVfG3AqzgPa3gzjfFhBj9D6QdTo8w/640?wx_fmt=png&from=appmsg&watermark=1#imgIndex=3
notion_page_id: 3e175244-d011-8135-aeff-c0993fcb5433
ioc:
  cves:
    - CVE-2026-77179
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Docker 在 Mac hypervisor 中发现并修复沙箱逃逸漏洞 CVE-2026-77179：容器内三行 bash 即可读写宿主机任意文件。
> 
> - **受影响范围：** Docker Desktop（仅开启 Docker VMM 时）与 Docker Sandboxes；VMM 原计划 2026 年 10 月底成为 Docker Desktop 默认选项。
> - **漏洞根因：** virtio-fs 文件服务端在客户机首次 lookup 后仅凭 nodeid 处理请求，查找依赖 volfs inode 与首次保存的路径字符串，后者的回退路径可被符号链接劫持。
> - **利用手法：** 创建同名文件并保持打开句柄 → 删除文件与文件夹使 volfs 路径消失 → 将父目录换成符号链接 → 经原句柄读写，路径解析落到挂载目录之外。
> - **PoC 命令：** `mkdir pv && : > pv/.canary && exec 9< pv/.canary`、`rm pv/.canary; rmdir pv; ln -s /Users/Shared pv`、`echo CONFIRMED > /proc/self/fd/9`。
> - **修复与验证：** 报告后约 31 小时提交修复 `9f348c0`；Docker Desktop 4.88.0（2026-08-24）与 Docker Sandboxes 0.42.0（2026-09-07）修复，可用 `sbx --version` 自查。

**云原生安全指北** *2026年9月20日 14:33*

> 注：本文翻译自 Accomplish 的文章《Guest to host: escaping Docker's hypervisor》，可点击文末“阅读原文”按钮查看英文原文。

## 一、引言

Docker 已修复我们报告的 Mac hypervisor 中的沙箱逃逸漏洞：容器运行三行 bash 即可获得对宿主机文件系统的完整读写权限。

Docker Desktop 和 Docker Sandboxes 均受影响。仅当在设置中开启 Docker VMM 时，Docker Desktop 才会受影响。幸好我们现在发现了它，因为 Docker VMM 计划于 2026 年 10 月底成为 Docker Desktop 的默认选项。

该漏洞已被分配为 **CVE-2026-77179**，并已在 Docker Sandboxes 0.42.0 和 Docker Desktop 4.88.0 中修复。

## 二、漏洞

当你将文件夹挂载到容器中时，Docker 的 VMM 会使用 virtio-fs，而提供该文件服务的文件服务器运行在宿主机上。客户机第一次访问某个路径时，会发送一次 lookup，服务端则返回一个 nodeid：这是服务端为自身记录而选定的编号。此后，客户机都通过 nodeid 发起请求，不再发送路径，因此服务端必须在每次请求时重新找到该文件。

它有两种方式找到该文件。首先通过 macOS volfs，按 inode 查找。如果失败，则回退到首次查找该文件时保存的路径字符串。

删除文件会移除 volfs 路径。保持文件打开状态，nodeid 会被保留。两者结合，服务端就只剩下那个文件路径字符串。然后客户机将父文件夹替换为符号链接。服务端读取该文件路径字符串，看到的是位于挂载文件夹内的路径，于是放行；但随后内核读取同一字符串，跟随符号链接，打开了宿主机上挂载文件夹之外的文件。

## 三、漏洞利用

客户机选择宿主机上想要读取或覆盖的文件。比如 `/Users/you/.zshenv` 。

1.  1\. 创建文件夹 `pv` ，并在其中创建一个与目标同名的文件 `pv/.zshenv` 。
    
2.  2\. 打开 `pv/.zshenv` 并保持打开。这次 lookup 让服务端获得了一个 nodeid，而打开的 handle 会阻止服务端将其丢弃。
    
3.  3\. 删除该文件，然后删除该文件夹。volfs 路径也随之消失，因此服务端只剩下文件路径字符串。
    
4.  4\. 创建一个名为 `pv` 的符号链接，指向 `/Users/you` 。
    
5.  5\. 通过第 2 步的 handle 进行读取或写入。
    

服务端会再次解析该字符串。现在 `pv` 是符号链接，且它不是路径中的最后一段，因此内核会跟随它。请求最终落到 `/Users/you/.zshenv` 。

![服务端在 lookup 时保存的字符串是 /Users/you/proj/pv/.zshenv。第一次请求时 pv 是文件夹，路径仍位于沙箱内。之后的请求中，pv 是指向 /Users/you 的符号链接，因此同一字符串会解析为 /Users/you/.zshenv，即宿主机上的任意位置。](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9d9fd658ddab42a7.png)

服务端在 lookup 时保存的字符串是 /Users/you/proj/pv/.zshenv。第一次请求时 pv 是文件夹，路径仍位于沙箱内。之后的请求中，pv 是指向 /Users/you 的符号链接，因此同一字符串会解析为 /Users/you/.zshenv，即宿主机上的任意位置。

在 bash 中也是如此：

```bash
mkdir pv && : > pv/.canary && exec 9< pv/.canary
rm pv/.canary; rmdir pv; ln -s /Users/Shared pv
echo CONFIRMED > /proc/self/fd/9
```

| 时间  | 事项  |
| --- | --- |
| 2026-08-12 14:46 UTC | 我们向 security@docker.com 报告。 |
| 2026-08-12 21:54 UTC | 他们回复并确认收到，距报告约七小时。 |
| 2026-08-13 22:16 UTC | Sailor 提交 `9f348c0` 。即修复方案。距报告约 31 小时。 |
| 2026-08-14 14:36 UTC | Docker 确认该漏洞，表示修复正在进行，并计划发布 CVE。 |
| 2026-08-24 | Docker Desktop 4.88.0 发布 sailor 0.118.0。 |
| 2026-09-07 | Docker Sandboxes 0.42.0 发布 CVE-2026-77179 的修复。 |

Sailor 是 Docker hypervisor 的内部名称。

Docker 安全团队反应迅速且专业。他们约七小时内回复，并在两天内确认漏洞。Docker Desktop 修复于 8 月 24 日发布，Docker Sandboxes 修复于 9 月 7 日在 0.42.0 中发布。

## 四、检查你是否受影响

如果你使用 Docker Sandboxes，运行 `sbx --version` 。确保运行的是 0.42.0 或更高版本。

如果你使用 Docker Desktop，需要 4.88.0 或更高版本。打开 Settings、General、Virtual Machine Manager。任何更早版本且选择了 Docker VMM 的都会受影响。

![⚠️ 图片托管失败 · 图片](https://mmbiz.qpic.cn/sz_mmbiz_png/Kric7mM9eA5AwxQ0UzPv7IpAjWswmvFT5ic8N8u3ic0icr5TNJZpFRS5mvibeiap2cJkmES0rwyHokn928cCmVfG3AqzgPa3gzjfFhBj9D6QdTo8w/640?wx_fmt=png&from=appmsg&watermark=1#imgIndex=3)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c19d0cf9f99f5dd4.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/cad7850d1297bc10.gif)

**交流群**

**知识库**

收录于云安全技术干货
