---
title: 【微信】Plex2Shell 漏洞遭利用波及 Plex Media Server，QNAP 向 NAS 用户发出警告
source: https://mp.weixin.qq.com/s/6nZ7AqRalwy2ZGe3Pur8ug
source_host: mp.weixin.qq.com
clip_date: 2026-11-10T13:02:33+08:00
trace_id: e2c3d6a4-2f6d-4718-8c0c-2e9521217c29
content_hash: d4cb341e328cd8cff31abbdb735a2b3522f68be419c6935d570fa4f14410f1c9
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
notion_page_id: 41475244-d011-81d8-bf96-f42edd323a84
ioc:
  cves:
    - CVE-2026-96652
    - CVE-2026-96654
    - CVE-2026-96655
    - CVE-2026-96656
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

**sec随谈** *2026年11月10日 08:56*

**摘要**

2026 年 11 月 6 日，QNAP 针对 Plex Media Server 中的 Plex2Shell 漏洞发布了安全通告。Plex Media Server 是 QNAP NAS 设备上提供的一款第三方应用，攻击者已经在滥用这些漏洞。QNAP 表示，部分客户的 Plex 安装似乎已遭入侵，并敦促所有在 QNAP NAS 上使用 Plex 的用户立即更新。

Plex Media Server 1.43.2 及更早版本中存在四个可串联利用的漏洞，未经身份验证的攻击者可借此在服务器上执行代码。Plex 1.43.3（1.43.3.10861 或更高版本）修复了这些漏洞，现已上架 QNAP App Center。QNAP 表示，如果 Plex 曾可从互联网访问，应将该 NAS 视为可能已被入侵。

**为何重要**

这并非理论上的风险。根据 QNAP 的通告，"Plex 已确认这些漏洞正遭到积极且大范围的利用"。10 月 16 日有人公开了概念验证代码，此后，暴露在互联网上的未修补服务器"已遭到大范围攻击"。

目前攻击者想要的是算力。QNAP 指出，"被入侵的服务器被用来运行加密货币挖矿程序和代理软件"。此外，CISA 已于 10 月 20 日将这四个 CVE 全部加入其已知被利用漏洞（KEV）目录。

**QNAP 观察到的情况**

一些用户告诉 QNAP，他们的 Plex Media Server"似乎已通过这些漏洞遭到入侵"。QNAP 支持团队正在协助这些用户，并"已确认没有发生数据丢失"。重要的是，QNAP PSIRT 表示，QTS、QuTS hero 以及其他 QNAP 操作系统"本身不受影响"。

**攻击原理**

单独来看，每个 Plex2Shell 漏洞的风险都有限。但 QNAP 解释说，"串联起来后，未经身份验证的远程攻击者就能以 Plex Media Server 进程的权限执行任意代码"。CVE 记录描述了攻击链中的四个环节：

-   CVE-2026-96652（CVSS 4.3）：一个服务端请求伪造（SSRF）漏洞，可迫使服务器向攻击者指定的地址发送请求。
    
-   CVE-2026-96654（CVSS 6.5）：一个 URL 注入漏洞，攻击者可以用自己的参数调用其他插件的功能。
    
-   CVE-2026-96655（CVSS 4.3）：第二个 SSRF 漏洞，可访问任意内部或外部地址。
    
-   CVE-2026-96656（CVSS 7.2）：通过转码器设置实现任意文件写入。Plex 启动时会不加检查地加载攻击者植入的库文件。
    

组合起来，这些 Plex2Shell 漏洞能把一个简单的 Web 请求变成在 Plex 内部运行的代码。

**受影响版本**

-   任意平台上的 Plex Media Server 1.43.2 及更早版本
    
-   安装了受影响 Plex 版本的 QNAP NAS 设备
    

未安装 Plex 的 NAS 无需采取任何措施。

**修补与缓解措施**

**先更新 Plex**

进入 App Center，打开"我的应用"，把 Plex Media Server 更新到 1.43.3，然后确认版本为 1.43.3.10861 或更高。QNAP 补充说，后续还会有更新的 Plex 版本，但用户"不要等，现在就更新"。完整指导请参阅 QNAP 官方的 Plex2Shell 安全通告。Plex 也发布了自己的 Plex Media Server 安全更新公告。

**检查暴露在外的服务器**

对于暴露在外的系统，仅打补丁是不够的。QNAP 警告："仅更新并不能清除攻击者可能已安装的任何东西。"如果曾开启远程访问、转发过 32400 端口，或者 UPnP 自动打开过该端口，QNAP 的 Plex2Shell 检查与修复常见问题要求用户做三件事：

-   彻底重装，不要沿用旧的 Codecs 文件夹。
    
-   检查是否有未知的 Plex 进程、Codecs 中是否有可疑的库文件、是否有访问 proxystream.st 的流量，以及空闲时 CPU 占用是否异常偏高。
    
-   注销所有 Plex 设备，修改 Plex 密码，并更换 NAS 及其中存储的各项服务凭据。
    

**缩小暴露面**

最后，如果不需要，请关闭 Plex 远程访问，并停止转发 32400 端口。如需远程观看，请改用 VPN。同时保持 QTS 或 QuTS hero 以及所有应用为最新版本。由于这些 Plex2Shell 漏洞正遭到积极攻击，每一台未修补且暴露在互联网上的服务器都面临风险。

参考链接：

https://www.qnap.com/en/how-to/faq/article/plex2shell-check-and-remediation-faq-for-qnap-nas-users

https://forums.plex.tv/t/important-security-update-for-plex-media-server-v1-43-2-and-earlier/942319/3

https://www.qnap.com/en/security-news/2026/qnap-security-notice-plex-media-server-vulnerabilities-plex2shell-update-to-1-43-3-10861-or-later-immediately-no-data-loss-reported
