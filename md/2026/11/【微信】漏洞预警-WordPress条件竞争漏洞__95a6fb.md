---
title: 【微信】漏洞预警 | WordPress条件竞争漏洞
source: https://mp.weixin.qq.com/s/jtpFzM2a8EMDn6iYaeZ7jQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-09T09:33:11+08:00
trace_id: fa88a1d7-ac60-4156-ba08-6d7aec790129
content_hash: 3b0fe00f41bb7585a1ba87ad670df3b07ac46cec1d23a866f610b79e10f06a96
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
notion_page_id: 41375244-d011-8118-8698-c4ea675de16e
ioc:
  cves:
    - CVE-2026-119977
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

**浅安安全** *2026年11月9日 07:50*

**0x00 漏洞编号**

-   ## CVE-2026-119977
    

**0x01 危险等级**

-   高危
    

**0x02 漏洞概述**

WordPress是一款使用PHP语言开发的开源内容管理系统，提供了丰富的主题和插件生态系统，支持博客、企业官网、电商平台等多种场景。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/16ded37f2012842b.webp)

**0x03 漏洞详情**

**CVE-2026-119977**

**漏洞类型：** 条件竞争

**影响：** 执行任意代码

**简述：** WordPress存在条件竞争漏洞，由于完整包核心升级过程中，升级程序将更新包解压至wp-content/upgrade/下基于包名生成的可预测、Web可访问临时目录。临时目录包含安装程序setup-config.php，且在升级窗口期间可被外部HTTP请求直接执行。攻击者可利用该漏洞，在升级窗口内通过竞争条件注入恶意配置，最终实现任意代码执行，导致服务器完全沦陷。

**0x04 影响版本**

-   4.7.0 <= WordPress <= 4.7.38
    
-   4.8.0 <= WordPress <= 4.8.33
    
-   4.9.0 <= WordPress <= 4.9.34
    
-   5.0.0 <= WordPress <= 5.0.30
    
-   5.1.0 <= WordPress <= 5.1.27
    
-   5.2.0 <= WordPress <= 5.2.29
    
-   5.3.0 <= WordPress <= 5.3.26
    
-   5.4.0 <= WordPress <= 5.4.24
    
-   5.5.0 <= WordPress <= 5.5.23
    
-   5.6.0 <= WordPress <= 5.6.22
    
-   5.7.0 <= WordPress <= 5.7.20
    
-   5.8.0 <= WordPress <= 5.8.18
    
-   5.9.0 <= WordPress <= 5.9.19
    
-   6.0.0 <= WordPress <= 6.0.17
    
-   6.1.0 <= WordPress <= 6.1.15
    
-   6.2.0 <= WordPress <= 6.2.14
    
-   6.3.0 <= WordPress <= 6.3.13
    
-   6.4.0 <= WordPress <= 6.4.13
    
-   6.5.0 <= WordPress <= 6.5.13
    
-   6.6.0 <= WordPress <= 6.6.10
    
-   6.7.0 <= WordPress <= 6.7.10
    
-   6.8.0 <= WordPress <= 6.8.11
    
-   6.9.0 <= WordPress <= 6.9.10
    
-   7.0.0 <= WordPress <= 7.0.7
    
-   7.1.0 <= WordPress <= 7.1.3
    

**0x05 POC状态**

-   已公开
    

**0x06 修复建议**

******目前官方已发布漏洞修复版本，建议用户升级到安全版本**** ****：******

https://cn.wordpress.org/

漏洞预警三 · 目录
