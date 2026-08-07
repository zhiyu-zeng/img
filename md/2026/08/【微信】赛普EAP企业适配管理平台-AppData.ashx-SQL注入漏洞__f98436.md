---
title: 【微信】赛普EAP企业适配管理平台 AppData.ashx SQL注入漏洞
source: https://mp.weixin.qq.com/s/mzdFpgDEYH1XriH-C0Xtcw
source_host: mp.weixin.qq.com
clip_date: 2026-08-07T16:53:39+08:00
trace_id: ce513f2d-9e47-42ea-9d33-e6ab18e53ce4
content_hash: 28fcf07b5990320fd9124eb15f8ebe1bdb00eee698a0628ab6706a658910b3ba
status: synced
tags:
  - 微信
  - 漏洞分析
  - 安全工具
series: null
feed_source: null
ai_summary: 赛普EAP企业适配管理平台AppData.ashx接口存在SQL注入漏洞，可获取敏感数据甚至写入服务器木马，需限制暴露面并升级。
ai_summary_style: key-points
images_status:
  total: 8
  succeeded: 8
  failed_urls: []
notion_page_id: 3b575244-d011-81a8-92b5-f9475b860153
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 赛普EAP企业适配管理平台AppData.ashx接口存在SQL注入漏洞，可获取敏感数据甚至写入服务器木马，需限制暴露面并升级。
> 
> - **漏洞位置：** 赛普EAP企业适配管理平台 AppData.ashx 接口存在SQL注入漏洞，攻击者可借此获取数据库中的管理员密码、用户个人信息等敏感数据。
> - **危害等级：** 在数据库高权限情况下，攻击者可向服务器写入木马，进而获取系统权限。
> - **暴露面检索：** 可通过FOFA搜索 body="IDWebSoft/" 定位受影响系统。
> - **自查工具：** 可使用 nuclei 和 afrog 进行漏洞自查。
> - **修复建议：** 关闭互联网暴露面或设置接口访问权限，并升级至安全版本。

**Nday Poc** *2026年8月5日 10:52*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/44ad08ffbb519461.webp)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/77be41dad9935140.webp)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/a186c4f5d9d52347.webp)

内容仅用于学习交流自查使用，由于传播、利用本公众号所提供的POC信息及POC对应脚本而造成的任何直接或者间接的后果及损失，均由使用者本人负责，公众号Nday Poc及作者不为此承担任何责任，一旦造成后果请自行承担！

**01**

**漏洞概述**

赛普EAP企业适配管理平台 AppData.ashx 接口处存在SQL注入漏洞,攻击者除了可以利用 SQL 注入漏洞获取数据库中的信息（例如，管理员后台密码、站点的用户个人信息）之外，甚至在高权限的情况可向服务器中写入木马，进一步获取服务器系统权限。

**02**

****搜索引擎**  
**

fofa:

```ini
body="IDWebSoft/"
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/26e7c2bf54d7410c.png)

**03**

**漏洞复现**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/83ba5de1ec85b646.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/6cee28574a4ccf2c.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/629b452de49ab9cc.png)

**04**

**自查工具  
**

nuclei

afrog

**05**

**修复建议  
**

1、关闭互联网暴露面或接口设置访问权限

2、升级至安全版本

**06**

**内部圈子介绍  
**

### 【Nday漏洞实战圈】🛠️

专注公开1day/Nday漏洞复现 · 工具链适配支持  
✧━━━━━━━━━━━━━━━━✧

🔍 **资源内容**  
▫️ 整合全网公开1day/Nday漏洞POC详情  
▫️ 适配Afrog/Nuclei检测脚本  
▫️ 支持内置与自定义POC目录混合扫描

🔄 **更新计划**  
▫️ 每周新增7-10个实用POC（来源公开平台）  
▫️ 所有脚本经过基础测试，降低调试成本

🎯 **适用场景**  
▫️ 企业漏洞自查 ▫️ 渗透测试 ▫️ 红蓝对抗 ▫️ 安全运维

✧━━━━━━━━━━━━━━━━✧  
⚠️ **重要声明**

▫️仅限合法授权测试，严禁违规使用

**▫️虚拟资源服务，购买后不接受任何形式退款**

▫️付款前请评估需求，慎重考虑

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/3a8c26bbed887383.webp)

sql · 目录
