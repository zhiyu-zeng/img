---
title: "Old Wine in a New Bottle: A Decade-Old lxd-Group Root, Re-Armed"
source: https://bestwing.me/old-wine-in-a-new-bottle-lxd-group-root.html
source_host: bestwing.me
clip_date: 2026-11-04T10:28:52+08:00
trace_id: 93854d76-338b-494d-9950-11b264925498
content_hash: ea2f220ccf589a0bed3ac49b0e79809f1f0158af5ddbb049b58af3765ac03f33
status: synced
tags:
  - Linux安全
  - 漏洞分析
series: null
feed_source: Swings·漏洞/二进制
ai_summary: TL;DR：Ubuntu 默认把首个用户加入拥有近 root 权限的 `lxd` 组，配合 `lxd-installer` 可免 sudo 密码安装 LXD，最终拿到宿主机 root。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40e75244-d011-81bf-b0ee-ebfe71067545
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：Ubuntu 默认把首个用户加入拥有近 root 权限的 `lxd` 组，配合 `lxd-installer` 可免 sudo 密码安装 LXD，最终拿到宿主机 root。
> 
> - **默认配置埋雷：** Ubuntu Server 安装器默认将首个用户加入 `lxd` 组，组成员可控制 LXD、启动特权容器并访问宿主机文件系统，权限接近 root。
> - **利用链条：** Ubuntu 24.04 起 LXD 不再预装，但系统保留由 `root:lxd` 控制的 `lxd-installer` socket；`lxd` 组成员无需 sudo 密码即可借该 socket 按需安装并控制 LXD，随后启动特权容器挂载宿主机根文件系统，容器内 root 可直接改写宿主机文件，实现提权。
> - **验证范围：** 研究者逐版本核对了 Ubuntu 18.04 至 26.04 的默认镜像与交付机制，并在 20.04、22.04、24.04、26.04 上完整复现了利用链，附自包含 PoC。
> - **厂商态度：** Ubuntu 将该行为认定为设计选择，决定不修复，属于默认配置层面长期存在的风险而非代码漏洞。
> - **防护建议：** `lxd`、`incus`、`docker`、`libvirt` 等高权限组不应视作普通功能组，应定期审计成员并仅授权可信管理员；若无需按需安装 LXD，可移除 `lxd-installer` 或屏蔽其 socket。

BEGIN_PAYLOAD20260609

文章概览

这篇文章记录了我们在 Ubuntu Server 上重新验证的一条 LXD 本地提权路径。系统安装时会默认把首个用户加入 `lxd` 组，而这个组实际上拥有接近 root 的权限：组成员可以控制 LXD、启动特权容器，并访问宿主机文件系统。

这不是一个新发现的 LXD 漏洞。问题出在 Ubuntu 的默认用户组配置和新版 `lxd-installer` 的配合上。即使系统没有预装 LXD， `lxd` 组用户也能在不输入 sudo 密码的情况下完成安装，接着利用 LXD 获得宿主机 root 权限。

## 问题链条

-   Ubuntu Server 安装器默认将首个用户加入 `lxd` 组。
-   在 Ubuntu 24.04 及之后的版本中，LXD 不再预装，但系统保留了由 `root:lxd` 控制的 `lxd-installer` socket。
-   `lxd` 组成员可以通过该 socket 按需安装并控制 LXD。
-   启动特权容器并挂载宿主机根文件系统后，容器内的 root 可以直接修改宿主机文件，最终获得宿主机 root 权限。

研究对 Ubuntu 18.04 至 26.04 的默认镜像和交付机制进行了逐版本核对，并在 Ubuntu 20.04、22.04、24.04 与 26.04 上验证了完整利用链。厂商将这一行为认定为设计选择并决定不修复。

## 防护建议

`lxd` 、 `incus` 、 `docker` 与 `libvirt` 等高权限组都不应被当作普通的功能组。应定期审计组成员，仅向可信任的管理员授予权限；如果系统不需要按需安装 LXD，也可以移除 `lxd-installer` 或屏蔽其 socket。

## 阅读原文

完整的版本矩阵、技术分析、验证过程、披露时间线与 PoC 请阅读 STAR Labs 原文：

[Old Wine in a New Bottle: A Decade-Old lxd-Group Root, Re-Armed ↗](https://starlabs.sg/blog/2026/06-old-wine-in-a-new-bottle-a-decade-old-lxd-group-root-re-armed/)

研究报告与自包含 PoC：

[star-sg/lxd-group-privesc-report ↗](https://github.com/star-sg/lxd-group-privesc-report)

EOFCHECKSUM_OK
