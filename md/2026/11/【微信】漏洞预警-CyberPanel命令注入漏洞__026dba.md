---
title: 【微信】漏洞预警 | CyberPanel命令注入漏洞
source: https://mp.weixin.qq.com/s/iAV9sgZIiffEga_utLA_mg
source_host: mp.weixin.qq.com
clip_date: 2026-11-09T09:32:50+08:00
trace_id: cbd8bd47-778f-4e3f-992e-0486ee0bebc5
content_hash: b2d444110987f6007a4c86cced80e56698cb3fcf719e9f41016c5604bf1c379d
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
notion_page_id: 41375244-d011-813b-bea4-fdb5ddbb778d
ioc:
  cves:
    - CVE-2026-78818
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

**浅安安全** *2026年11月9日 07:50*

**0x00 漏洞编号**

-   ## CVE-2026-78818
    

**0x01 危险等级**

-   高危
    

**0x02 漏洞概述**

CyberPanel是一个开源的Web控制面板，它提供了一个用户友好的界面，用于管理网站、电子邮件、数据库、FTP账户等。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/42e0a62e10e36258.webp)

**0x03 漏洞详情**

**CVE-2026-78818**

**漏洞类型：** 命令注入

**影响：** 执行任意代码

**简述：** CyberPanel存在命令注入漏洞，由于changePHP()函数在处理phpSelection参数时，未进行任何验证或清理，经过身份验证的攻击者可通过发送特制的POST请求触发该漏洞，进而以root身份执行任意系统命令。

**0x04 影响版本**

-   CyberPanel <= 2.4.7
    

**0x05 POC状态**

-   已公开
    

**0x06 修复建议**

********目前官方已发布漏洞修复版本，建议用户升级到安全版本****** ****：******

https://github.com/usmannasir/cyberpanel

漏洞预警三 · 目录
