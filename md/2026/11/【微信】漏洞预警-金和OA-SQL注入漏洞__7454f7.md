---
title: 【微信】漏洞预警 | 金和OA SQL注入漏洞
source: https://mp.weixin.qq.com/s/A46Fo0tF8W9RV4hbLg28Xw
source_host: mp.weixin.qq.com
clip_date: 2026-11-11T23:41:29+08:00
trace_id: 5df85303-5e04-4a70-b809-2a87c380001a
content_hash: 8cee29c1e324a479c93d66d68b0fc86e990f375c89119406f74ea7085189cf54
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
notion_page_id: 41575244-d011-8179-9edc-cb8269da09e4
ioc:
  cves:
    - CVE-2026-124331
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

**浅安安全** *2026年11月11日 07:50*

**0x00 漏洞编号**

-   ## CVE-2026-124331
    

**0x01 危险等级**

-   高危
    

**0x02 漏洞概述**

金和网络是专业信息化服务商,为城市监管部门提供了互联网+监管解决方案,为企事业单位提供组织协同OA系统开发平台,电子政务一体化平台,智慧电商平台等服务。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7d85dc3988c4e64f.webp)

**0x03 漏洞详情**

**CVE-2026-124331  
**

**漏洞类型：** SQL注入

**影响：** 获取敏感信息

**简述：** 金和OA C6的/C6/JHSoft.Web.Project/OfficeReadOnly/ProjectAfficheManage.aspx/ProjectManage接口存在SQL注入漏洞，未经身份验证的攻击者可以通过该漏洞执行任意SQL语句，从而获取数据库敏感信息。

**0x04 影响版本**

-   金和OA C6
    

**0x05 POC状态**

-   已公开
    

**0x06 修复建议**

********目前官方已发布漏洞修复版本，建议用户升级到安全版本****** ****：******

http://www.jinher.com/

漏洞预警三 · 目录
