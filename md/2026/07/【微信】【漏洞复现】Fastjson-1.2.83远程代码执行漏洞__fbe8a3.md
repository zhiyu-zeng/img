---
title: 【微信】【漏洞复现】Fastjson 1.2.83远程代码执行漏洞
source: https://mp.weixin.qq.com/s/1DDz7VRYfNkmQMPF36xpPA
source_host: mp.weixin.qq.com
clip_date: 2026-07-22T07:18:29+08:00
trace_id: 482fa844-ee4e-4b6d-bc95-5af0acc55835
content_hash: 3948b256dc65ce7e725a3d0b09ab6eb9e606fb2be8c2988f86d699d1e8739586
status: summarized
tags:
  - 微信
  - 漏洞分析
  - 安全工具
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: Fastjson 1.2.83 及之前版本因 AutoType 机制存在远程代码执行漏洞，攻击者可借此执行任意代码，需紧急升级或启用安全模式修复。
ai_summary_style: key-points
images_status:
  total: 21
  succeeded: 21
  failed_urls: []
notion_page_id: 3a475244-d011-8126-a085-cab28580ad39
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Fastjson 1.2.83 及之前版本因 AutoType 机制存在远程代码执行漏洞，攻击者可借此执行任意代码，需紧急升级或启用安全模式修复。
> 
> - **影响范围：** 漏洞影响 Fastjson 1.2.66 至 1.2.83 版本。
> - **攻击原理：** 攻击者通过构造包含特定字段的 JSON 字符串，利用 AutoType 加载远程恶意文件实现代码执行。
> - **修复措施：** 升级到官方修复版本；或启用安全模式完全禁用 AutoType 功能。
> - **时间线：** 漏洞于 2026 年 7 月 19 日发现，7 月 20 日验证，7 月 21 日发布通告。

**数字人才创研院** *2026年7月22日 06:52*

漏洞预警

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/8104b6306618ef12.png)

01

漏洞基本概述

Vulnerability Overview

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/397619c59ff62a6a.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/cb6359766b301437.png)

01

Fastjson是阿里巴巴开源的一款高性能 Java JSON 解析库，以其出色的解析速度和简洁的 API 设计在国内Java生态系统中占据主导地位。

**【风险等级】** **极 危**

**【CVE编号】** **无**

2026年7月19日，禾盾安全应急响应中心监测到该漏洞，经分析，攻击者可通过构造包含特定字段的JSON字符串，利用Fastjson的AutoType支持机制加载远程恶意文件，从而在目标服务器上执行任意代码。建议受影响的用户尽快修复，与此同时，请做好资产自查以及预防工作，以免遭受黑客攻击。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/5322d70208fe292b.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/7400b61a647e849c.png)

02

漏洞影响范围

Vulnerability Impact

01

Fastjson 1.2.66-1.2.83

03

漏洞修复方案

Vulnerability Fixes

01

目前官方已发布修复版本，建议用户及时确认产品版本，尽快采取修补措施。

**注：其它建议**

1.启用安全模式 (SafeMode)，可以完全禁用 AutoType 功能。

2.Spring Boot 3.2 重写了嵌套 jar Loader，类名与 URL 处理变化，公开链结论需重新验证，不能直接套用。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/20545808d441e75f.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/d37ed0f38232918c.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/d30cb740d44fd012.png)

**下载链接：**

```

https://github.com/alibaba/fastjson
```

04

漏洞参考链接

Vulnerability Fixes Link

01

```javascript
https://github.com/alibaba/fastjson2
```

05

漏洞时间滚轴

Vulnerability Time

#发现时间#2026年07月19日

#验证时间#2026年07月20日

#通告时间#2026年07月21日

HD

禾盾安全应急响应中心

**以技术为驱动，以安全专家为核心，以诚信为本、以专业为先、以坚持为恒，围绕漏洞生态体系打造集漏洞监测、漏洞收集、漏洞挖掘、漏洞分析、漏洞管理、专家响应、漏洞预警、安全服务定制化于一体的漏洞安全一站式服务，帮助客户防患于未然，在降低资产风险的同时，大幅提升客户对漏洞感知、预警、分析等响应能力，为国家、政企客户、用户抢占风险预警处置先机，提升网络安全主动防护能力。**

HD

获取更多最新情报

**建议您订阅「禾盾安全-漏洞情报」服务，及时获取更多漏洞情报详情以及处置建议，让您的单位真正远离漏洞威胁。**

**电话：177-128-77993**

**邮箱：src@hedun.com.cn**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/abd9dbc3c4e5240e.jpg)
![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/d844561eb95dd822.jpg)
