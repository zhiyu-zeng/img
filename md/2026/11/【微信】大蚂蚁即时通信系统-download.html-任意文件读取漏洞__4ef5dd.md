---
title: 【微信】大蚂蚁即时通信系统 download.html 任意文件读取漏洞
source: https://mp.weixin.qq.com/s/Jby9SL9FAY-nvqSdmPXRmQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-10T14:54:37+08:00
trace_id: 38c32110-83ab-4f17-b5ea-c9c8900cde94
content_hash: 4f22f291b778951b81df0fe82724928238c24b56817da11b0dc241f204ece1bf
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 9
  succeeded: 9
  failed_urls: []
notion_page_id: 41475244-d011-81ec-8224-e5bd1a810649
ioc: null
---

**Nday Poc** *2026年11月10日 10:16*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/44ad08ffbb519461.webp)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/77be41dad9935140.webp)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a186c4f5d9d52347.webp)

内容仅用于学习交流自查使用，由于传播、利用本公众号所提供的POC信息及POC对应脚本而造成的任何直接或者间接的后果及损失，均由使用者本人负责，公众号Nday Poc及作者不为此承担任何责任，一旦造成后果请自行承担！

**01**

**漏洞概述**

大蚂蚁即时通信系统 download.html 接口处存在任意文件读取漏洞,未经身份验证的远程攻击者通过漏洞可以获取到服务器敏感信息，导致系统处于极不安全的状态。

**02**

****搜索引擎**  
**

fofa:

```ini
product="即时通讯系统"
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e089977576ea63da.png)

**03**

**漏洞复现**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/36a29c9e6064811b.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7de81bab672424f3.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a16e1d78695efdf4.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2fc6f9342c36ee58.png)

获取密码

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

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3a8c26bbed887383.webp)

文件读取 · 目录
