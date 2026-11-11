---
title: 【微信】漏洞预警 | Windows画图板越界读取漏洞
source: https://mp.weixin.qq.com/s/0pnfYVlJireNEUS0NRM0zQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-11T22:41:28+08:00
trace_id: 090d4772-ecd2-42d2-8b60-370e89089746
content_hash: 5ff9a02022aec749e9e56c6232187913d96bebc0404022d2a9e132554c065ef1
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
notion_page_id: 41575244-d011-8118-8675-c2c263e44ad9
ioc:
  cves:
    - CVE-2026-83844
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

**浅安安全** *2026年11月11日 07:50*

**0x00 漏洞编号**

-   ## CVE-2026-83844
    

**0x01 危险等级**

-   高危
    

**0x02 漏洞概述**

Microsoft Paint是Windows操作系统中内置的经典图像编辑应用程序。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/bfe6f06987b1defd.png)

**0x03 漏洞详情**

**CVE-2026-83844**

**漏洞类型：** 越界读取

**影响：** 执行任意代码

**简述：** Microsoft Paint存在越界读取漏洞，未经身份认证的攻击者可通过向受影响的服务发送特制数据包来触发该漏洞，进而执行任意代码。

**0x04 影响版本**

-   11.0.0.0 <= Microsoft Paint < 11.2609.401.0
    

**0x05 POC状态**

-   未公开
    

**0x06 修复建议**

******目前官方已发布漏洞修复版本，建议用户升级到安全版本**** ****：******

https://www.microsoft.com/zh-cn/windows/paint

漏洞预警三 · 目录
