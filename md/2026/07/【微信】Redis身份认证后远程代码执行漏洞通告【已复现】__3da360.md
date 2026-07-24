---
title: 【微信】Redis身份认证后远程代码执行漏洞通告【已复现】
source: https://mp.weixin.qq.com/s/B68WNHqi5RiBNiohd04b3w
source_host: mp.weixin.qq.com
clip_date: 2026-07-24T18:16:02+08:00
trace_id: 633577b4-1e60-4e61-9d30-43319cbd63e1
content_hash: 9c70504eedd26df9cfc9b315dc8514907d7c680bb52798193a72f3046aa7c99e
status: summarized
tags:
  - 微信
  - 漏洞分析
  - 安全工具
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: Redis 流数据类型内存缺陷允许认证后远程代码执行，影响多个版本，攻击者可完全控制服务器。
ai_summary_style: key-points
images_status:
  total: 8
  succeeded: 8
  failed_urls: []
notion_page_id: 3a775244-d011-81e3-9d5c-c5d28f1ae9e3
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Redis 流数据类型内存缺陷允许认证后远程代码执行，影响多个版本，攻击者可完全控制服务器。
> 
> - **漏洞根源：** Redis 流数据类型在恢复消费组状态时存在内存管理缺陷，导致记录被重复释放。
> - **攻击方式：** 攻击者通过身份认证后，利用 RESTORE、XGROUP 等命令导入特制数据，进而破坏进程内存并执行任意代码。
> - **影响版本：** 漏洞影响 Redis 6.2.22、7.4.9、8.6.4、8.8.0 等多个版本。
> - **严重等级：** 该漏洞被评为高危，利用价值高，但利用难度中等。
> - **修复措施：** 可应用官方补丁进行修复，或部署新华三安全设备进行防护和检测。

**新华三主动安全** *2026年7月24日 11:27*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/3200d3e59590f47f.gif)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/4a6a0ae01c6e60d4.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/8679657dc4d6c629.png)

01

漏洞综述

1.1漏洞背景

Redis 是一款开源的内存数据存储系统，支持字符串、哈希、列表、集合及流数据等多种数据结构，广泛应用于缓存、消息队列、会话存储和实时数据处理等场景。近日，新华三盾山实验室监测到安全研究人员公开了一个 Redis 身份认证后远程代码执行漏洞的完整利用代码，当前该漏洞暂无 CVE 编号。攻击者成功利用该漏洞后，可在 Redis 服务进程权限下执行任意命令，进而控制服务器。

1.2 漏洞详情

该漏洞源于 Redis 流数据类型在恢复消费组状态时的内存管理缺陷。消费组用于协调多个消息处理客户端分配任务，Redis 会为尚未确认的消息维护待处理记录。攻击者通过身份认证并取得 RESTORE、XGROUP 等命令权限后，可导入特制数据，使两个客户端错误地引用同一记录。删除客户端时，该记录会被重复释放，攻击者可进一步破坏进程内存并执行任意代码。

1.3 漏洞复现

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/77b10a9391ac73b2.png)

02

影响范围

Redis 6.2.22、7.4.9、8.6.4、8.8.0

03

严重等级

|     |     |
| --- | --- |
| 威胁等级 | 高危  |
| 影响程度 | 广泛  |
| 利用价值 | 高   |
| 利用难度 | 中   |
| 漏洞评分 | 暂无  |

04

处置方法

4.1 官方补丁

https://github.com/redis/redis/releases

4.2缓解措施

1.  新华三安全设备防护方案 新华三IPS规则库将在1.0.415版本支持对该漏洞的识别，新华三全系安全产品可通过升级IPS特征库识别该漏洞的攻击流量，并进行主动拦截。
    
2.  新华三态势感知解决方案 新华三态势感知已支持该漏洞的检测，通过信息搜集整合、数据关联分析等综合研判手段，发现网络中遭受该漏洞攻击及失陷的资产。
    
3.  新华三云安全能力中心解决方案
    

新华三云安全能力中心知识库已更新该漏洞信息，可查询对应漏洞产生原理、升级补丁、修复措施等。

05

参考链接

https://github.com/berabuddies/redis-poc

https://github.com/redis/redis

安全公告 · 目录
