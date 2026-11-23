---
title: 【微信】Vite 远程代码执行漏洞通告【已复现】
source: https://mp.weixin.qq.com/s/HWsQm8a6wc9aTJoUBmrJzw
source_host: mp.weixin.qq.com
clip_date: 2026-11-24T02:56:25+08:00
trace_id: cd8367d5-2d82-4d40-9bab-712cd3283002
content_hash: e1f3fe6f2e4e53c38ae3708972dcbbd592a4fe65ac360e2f998ebafa0468c13b
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 13
  succeeded: 13
  failed_urls: []
notion_page_id: 42175244-d011-812d-96d6-eaff89c1d2ea
ioc: null
---

**新华三主动安全** *2026年11月20日 17:31*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8b6bace9b21c36ba.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3d7e34872e44824a.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/912a19e24aa7d2ec.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d2cd6564022e71bd.png)

PART 01

漏洞综述

漏洞背景

Vite 是一个基于原生 ES 模块的极速前端构建工具，支持快速启动、按需编译和热更新，专为现代前端框架（如 Vue、React）设计。近日，新华三盾山实验室监测到Vite披露了一个远程代码执行漏洞，利用该漏洞可以在暴露网络的Vite开发服务器上实现任意代码执行。

漏洞详情

该漏洞源于Vite的 resolver 插件提供的虚拟模块在嵌入由 URL 派生的模块 ID 时未进行转义，部分可为任意值，导致攻击者能够在该虚拟模块中注入任意代码。又由于 Vite 默认信任模块代码，一方面被虚拟模块引用的文件可绕过允许列表检查，另一方面 Vite 在处理 new Worker 与 import.meta.glob 时会使用 eval 提取模块代码中的值，攻击者可借此让 Vite 在服务端执行注入的代码，并通过 globalThis.process.getBuiltinModule 等方式绕过对 exports、require 等变量的限制，最终在暴露于网络的Vite 开发服务器上实现任意代码执行。

漏洞复现

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f0daaa733a521ede.png)

PART 02

影响范围

-   vite >=4.0.0，<=6.4.5
    
-   vite >=7.0.0，<=7.3.7
    
-   vite >=8.0.0，<=8.1.6
    
-   vite >=8.2.0，<=8.2.4
    
-   vite >=8.3.0，<=8.3.6
    
-   vite-plus <=1.5.0
    

PART 03

严重等级

|     |     |
| --- | --- |
| 威胁等级 | 高   |
| 影响程度 | 中等  |
| 利用价值 | 高   |
| 利用难度 | 低   |
| 漏洞评分 | 9.1 |

PART 04

处置方法

官方补丁

官方已发布修复补丁，请更新至最新版本：https://github.com/vitejs/vite/releases

缓解措施

1.  停止将Vite开发服务器暴露在公网或只允许信任的主机连接；
    
2.  排查开发服务器的权限情况，开发服务器不应该运行在高权限账户下。
    

新华三解决方案

1.  新华三安全设备防护方案  
    新华三IPS规则库将在1.0.431版本支持对该漏洞的识别，新华三全系安全产品可通过升级IPS特征库识别该漏洞的攻击流量，并进行主动拦截。
    
2.  新华三态势感知解决方案  
    新华三态势感知已支持该漏洞的检测，通过信息搜集整合、数据关联分析等综合研判手段，发现网络中遭受该漏洞攻击及失陷的资产。
    
3.  新华三云安全能力中心解决方案
    

新华三云安全能力中心知识库已更新该漏洞信息，可查询对应漏洞产生原理、升级补丁、修复措施等。

PART 05

参考链接

https://github.com/vitejs/vite/security/advisories/GHSA-p4f5-76q4-ffq7
