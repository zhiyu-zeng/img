---
title: 【微信】出海安全日报｜2026年11月6日：WordPress KEV 截止日到期
source: https://mp.weixin.qq.com/s/EiWn-N-XsKW4-hCiumDF_g
source_host: mp.weixin.qq.com
clip_date: 2026-11-07T12:12:25+08:00
trace_id: 20f96952-1e4e-4a07-beeb-715614251407
content_hash: fc183787819b2bbfd69c16d25440f5728fa20f97cee5e751cee73e8a2654bdcc
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
notion_page_id: 41175244-d011-8180-b0c9-cf02807e4e9d
ioc:
  cves:
    - CVE-2026-111497
    - CVE-2026-119977
    - CVE-2026-48356
    - CVE-2026-76418
    - CVE-2026-97229
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

**安世加** *2026年11月6日 18:00*

安世加 · 出海安全日报

2026年11月6日 星期五

今日看点：WordPress Core KEV 联邦修复截止日（2026-11-06）到期；Adobe Commerce／Magento 与 Google Brotli、GitLab 与 Cisco ASA／FTD 等近期 KEV 仍需闭环。

今日头条

美国 · 漏洞截止日

**WordPress Core KEV 修复截止日到期（CVE-2026-119977）**

CISA 于 **2026年11月3日** 将 CVE-2026-119977（WordPress Core TOCTOU 竞态，升级窗口相关）加入 KEV；目录列明 Due Date 为 。

官方摘要指出，未认证攻击者可能在完整核心升级窗口期间于服务器执行代码，与可预测、可被 Web 访问的升级暂存路径有关。联邦民机构须按 BOD 26-04 优先处置；CISA 同时鼓励所有组织按风险优先修复。本条为截止日提醒，非新披露。

来源：CISA｜发布日期：2026-11-03  
https://www.cisa.gov/news-events/alerts/2026/11/03/cisa-adds-one-known-exploited-vulnerability-catalog

**安世加观察**

这意味着：出海独立站／内容站应把「升级窗口暴露面」纳入当日变更门禁，确认核心版本与暂存路径不可匿名写入，并与 ISO 27001／SOC 2 Type II 变更证据并轨留痕。

◆ 全球监管与安全快讯

**01** 电商平台 · KEV

**Adobe Commerce／Magento 危险文件上传仍在 KEV 窗口**

2026年10月27日，CISA 将 **CVE-2026-48356** （Adobe Commerce and Magento Unrestricted Upload of File with Dangerous Type）加入 KEV。

这意味着：品牌独立站应核对官方修复版本、管理与上传入口暴露面，并把补丁验证纳入收单／支付尽调常备包。

来源：CISA｜发布日期：2026-10-27  
https://www.cisa.gov/news-events/alerts/2026/10/27/cisa-adds-two-known-exploited-vulnerabilities-catalog

**02** 依赖链 · KEV

**Google Brotli 解码缺陷入 KEV**

同日，CISA 将 **CVE-2026-111497** （Google Brotli Unchecked Return Value）加入 KEV。

这意味着：Brotli 可能嵌在 CDN、网关与应用依赖中；应用 SBOM／依赖扫描确认版本，避免「业务已发版、底层库未升」。

来源：CISA｜发布日期：2026-10-27  
同上警报

**03** 基础设施 · KEV

**GitLab 与 Cisco ASA／FTD：2026-10-29 入册后仍须闭环**

2026年10月29日，CISA 将 **CVE-2026-97229** （GitLab CE／EE）与 **CVE-2026-76418** （Cisco Secure Firewall ASA／FTD）加入 KEV。

这意味着：自建代码平台与边缘防火墙／远程接入设备应在本周完成补丁验证，避免「目录已加、生产未升」。

来源：CISA｜发布日期：2026-10-29  
https://www.cisa.gov/news-events/alerts/2026/10/29/cisa-adds-one-known-exploited-vulnerability-catalog

现在，是开始布局的最好时机

认证不是终点，而是出海征途的起跑线。越早获证，越早建立竞争优势，越早赢得海外市场信任。

安世加为中国出海企业全球数字信任安全合规先行者与深耕者，依托「1+N 控制项映射引擎」提供 SOC 2 Type II、ISO 体系、PCI DSS 等认证咨询。若你正在推进海外市场，或销售中遇到尽调与取证问题，欢迎交流，我们可以基于业务模型给出更有针对性的路径建议。

**关于我们**

https://www.anshijia.net.cn

手机：19121509707  
微信：z19121509707  
邮箱：esther.zhao@anshijia.net.cn

— 安世加 · 出海安全日报
