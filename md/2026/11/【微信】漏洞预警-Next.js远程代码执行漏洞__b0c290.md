---
title: 【微信】漏洞预警 | Next.js远程代码执行漏洞
source: https://mp.weixin.qq.com/s/DwgTvBTzsmseGN9GFnvVKg
source_host: mp.weixin.qq.com
clip_date: 2026-11-19T11:36:15+08:00
trace_id: 5c615adf-06a3-4917-ada1-b1d046b9bed4
content_hash: d834abb0615572da011c37aa39e834129dde29d57482e5f8bc4efb9570c3ca48
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
notion_page_id: 41d75244-d011-81c6-8ac0-d75b28445e46
ioc:
  cves:
    - CVE-2026-126187
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

**浅安安全** *2026年11月18日 07:50*

**0x00 漏洞编号**

-   ## CVE-2026-126187
    

**0x01 危险等级**

-   高危
    

**0x02 漏洞概述**

Next.js是Node.js生态中基于React的开源Web框架，其通过Server Actions功能提供了后端开发能力。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9620d8b53da9fb97.webp)

**0x03 漏洞详情**

**CVE-2026-126187**

**漏洞类型：** 远程代码执行

**影响：** 执行任意命令

**简述：** Next.js存在远程代码执行漏洞，由于其Flight序列化器在处理多个TypedArray视图共享同一个ArrayBuffer的场景时存在逻辑缺陷，未经验证的攻击者可通过构造单个未认证请求触发服务端代码执行，进而执行任意代码。

**0x04 影响版本**

-   16.0.0 <= Next.js <= 16.4.0
    

**0x05 POC状态**

-   已公开
    

**0x06 修复建议**

********目前官方已发布漏洞修复版本，建议用户升级到安全版本****** ****：******

https://nextjs.org/

漏洞预警三 · 目录
