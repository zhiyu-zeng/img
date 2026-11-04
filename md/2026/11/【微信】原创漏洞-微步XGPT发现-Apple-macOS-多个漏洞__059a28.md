---
title: 【微信】原创漏洞 | 微步XGPT发现 Apple macOS 多个漏洞
source: https://mp.weixin.qq.com/s/QcEMZ57Uibihet7lJCzL9w
source_host: mp.weixin.qq.com
clip_date: 2026-11-04T19:14:18+08:00
trace_id: e4b3dffb-17d8-4f27-9784-7aa3d0a4cb03
content_hash: f60847447a65ff5f0fbdb4a93f3432961924a01a95f23d694c610493dbb5a20b
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 40e75244-d011-81a0-a85b-fa32fabac48a
ioc:
  cves:
    - CVE-2026-84536
    - CVE-2026-84537
    - CVE-2026-84581
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

**微步在线研究响应中心** *2026年11月4日 17:51*

漏洞概况

近日，Apple 官方发布 macOS Golden Gate 27、macOS Sequoia 15.8 和 macOS Tahoe 26.7 安全更新，修复了 SMB、HFS 等多个组件中的安全漏洞。其中CVE-2026-84537、 CVE-2026-84536、CVE-2026-84581 由微步XGPT发现并报送Apple官方。 ![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b964fdcd9f42f947.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/23c4a867c0bf57f6.png)

CVE-2026-84537 是 macOS SMB 客户端文件读写处理逻辑中的内核内存破坏漏洞。当实际读写长度小于请求长度时，内核释放内存的大小与分配时不一致。本机应用对已建立的 SMB 连接发起读写，或本机作为客户端连接到返回过短数据的恶意 SMB 服务器时，可造成系统异常终止或内核内存破坏。

CVE-2026-84536 是 macOS SMB 客户端符号链接处理逻辑中的整数下溢漏洞。攻击者诱导用户连接恶意 SMB 服务器后，可导致系统异常终止。

CVE-2026-84581 是 macOS HFS 内核扩展中的堆缓冲区溢出漏洞。已登录的普通用户挂载恶意构造的 HFS+ 磁盘映像并读取其中文件后，可造成系统异常终止或内核内存损坏；满足特定利用条件时，可在内核中执行代码。

漏洞影响范围

|     |     |
| --- | --- |
| 受影响版本 | macOS Sequoia < 15.8、macOS Tahoe < 26.7、macOS Golden Gate < 27 |
| 有无修复补丁 | 有   |

修复方案

### 官方修复方案

Apple 建议所有用户尽快通过设置 > 通用 > 软件更新进行升级。

官方修复通告：

https://support.apple.com/en-us/149035

https://support.apple.com/en-us/149042

https://support.apple.com/en-us/149043

微步产品支撑

微步漏洞情报于 2026-09-15 收录上述漏洞。

微步下一代威胁情报平台NGTIP及X情报中心已于漏洞收录时向漏洞订阅用户推送该漏洞情报，并将持续推送后续更新；对于已经录入资产的用户，支持实时自动化排查受影响资产。

漏洞情报 · 目录
