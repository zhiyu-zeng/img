---
title: 【微信】漏洞预警 | Apache Ofbiz远程代码执行漏洞
source: https://mp.weixin.qq.com/s/0fX4vyFtqadWmX0xpVSoWQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-19T11:35:54+08:00
trace_id: 4ea0280d-7531-4bcc-adf2-0a8238fa9b35
content_hash: 36b41dbb54b5d23980244b42a755fb67905b61121df3872c04887644753557ea
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
notion_page_id: 41d75244-d011-81ed-bc0b-ebf01db8cfd0
ioc:
  cves:
    - CVE-2026-83542
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

**浅安安全** *2026年11月18日 07:50*

**0x00 漏洞编号**

-   ## CVE-2026-83542
    

**0x01 危险等级**

-   高危
    

**0x02 漏洞概述**

Apache OFBiz是Apache的一套企业资源计划系统，提供了一整套基于Java的Web应用程序组件和工具。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2c5584b805a4b825.webp)

**0x03 漏洞详情**

**CVE-2026-83542**

**漏洞类型：** 远程代码执行

**影响：** 执行任意代码

**简述：** Apache OFBiz存在远程代码执行漏洞，由于系统在处理JSON请求时，未对请求体中的属性进行有效校验，导致攻击者能够覆盖应用程序原有的Widget装饰器配置，并通过构造恶意XML文件触发Groovy表达式执行。未经身份验证的远程攻击者可利用Multipart文件上传及进程文件描述符等机制，将恶意XML加载至Widget引擎执行，进而执行任意操作。

**0x04 影响版本**

-   Apache OFBiz < 24.09.08
    

**0x05 POC状态**

-   未公开
    

**0x06 修复建议**

******目前官方已发布漏洞修复版本，建议用户升级到安全版本**** ****：******

https://ofbiz.apache.org/

漏洞预警三 · 目录
