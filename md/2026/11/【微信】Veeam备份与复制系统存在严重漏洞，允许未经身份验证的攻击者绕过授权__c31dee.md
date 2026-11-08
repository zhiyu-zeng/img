---
title: 【微信】Veeam备份与复制系统存在严重漏洞，允许未经身份验证的攻击者绕过授权
source: https://mp.weixin.qq.com/s/nO6OFJ430zdQFTmzLmwQdw
source_host: mp.weixin.qq.com
clip_date: 2026-11-08T08:21:32+08:00
trace_id: b475787f-02d9-411c-af1d-dbd8e2dfb947
content_hash: f48de2b44fe89945679c54032a8efbafef6f05eee18e2fea6e7b967c67522909
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 41275244-d011-81b4-a26c-d410e3b51067
ioc:
  cves:
    - CVE-2026-105477
    - CVE-2026-108140
    - CVE-2026-108141
    - CVE-2026-108142
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

**暗镜** *2026年11月8日 07:00*

Veeam 已发布安全更新，以 修复备份与复制功能中的一个严重授权绕过漏洞 。该漏洞编号为 CVE-2026-108142，允许未经身份验证的攻击者绕过 CDP 协调器服务的授权。该漏洞的 CVSS v4.0 评分为 9.1，会影响 Windows 部署和 Veeam 软件设备。该公司在 2026 年 10 月 27 日 发布的安全公告 (KB4948) 中披露了此问题。 该公告还概述了两个中等严重性的路径遍历漏洞和一个影响受管 Veeam Agent for Linux 安装的高严重性本地权限提升漏洞。

CVE-2026-108142 影响 Veeam Backup & Replication 13.1 分支中的 13.1.1.18 及更早版本，以及 13.0 分支中的 13.0.2.29 及更早版本。该漏洞公告指出，较早的产品版本（例如 12.x 版本）不受影响。

此漏洞与其他已披露的问题不同，因为它无需经过身份验证的帐户即可被利用。虽然 Veeam 的描述中提到了绕过授权，但并未明确指出该漏洞允许远程代码执行、备份删除或服务器完全被攻陷。已发布的版本说明中也没有提供详细的利用步骤，也没有指明受影响的具体服务端点。

Veeam 已将 Backup & Replication 版本 13.1.2.57 和 13.0.3.63 指定为修复此授权绕过漏洞的版本。管理员应注意特定分支的修复要求，切勿想当然地认为所有版本 13 的部署都需要相同的升级包。

此次更新还修复了 CVE-2026-108140 和 CVE-2026-108141，这两个漏洞的严重程度均为中等，CVSS v4.0 评分为 5.9。

这些漏洞需要具有“恢复操作员”角色的已认证用户才能访问，该用户能够控制备份的网络附加存储共享的内容。在这种情况下，相对路径遍历可能允许攻击者将受控文件写入备份服务器上的任意位置。

这些前提条件将这些缺陷与未经身份验证的 CDP 问题区分开来。Veeam 对这两个漏洞提供了类似的公开描述，但并未阐明它们底层实现方式的差异。这两个漏洞都在相同的 Backup & Replication 版本中得到了修复。

CVE-2026-105477 修复了Veeam Agent for Linux 中的 本地权限提升问题 ，该问题严重性较高，CVSS v4.0 评分为 7.3。仅受 Backup & Replication 管理的安装影响。

该安全公告指出，13.1 分支中的 Agent 版本 13.1.1.4 及更早版本存在漏洞，而 13.0.x 和 6.x 版本则不受影响。修复程序为 Agent 版本 13.1.2.11，该版本已包含在 Backup & Replication 版本 13.1.2 中。

对于升级到 13.1.2 版本的 Windows 部署，Veeam 需要完整的部署 ISO 镜像或内置更新程序；由于多个第三方组件的变更，没有独立的补丁 ISO 镜像或 ZIP 文件可用。设备升级可在内部执行，管理员应做好系统可能需要重启的准备。
