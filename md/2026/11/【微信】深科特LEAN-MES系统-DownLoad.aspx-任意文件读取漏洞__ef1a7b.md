---
title: 【微信】深科特LEAN MES系统 DownLoad.aspx 任意文件读取漏洞
source: https://mp.weixin.qq.com/s/vDVDHcW0PcSA0-eQmP-d_g
source_host: mp.weixin.qq.com
clip_date: 2026-11-02T15:48:34+08:00
trace_id: 8ec03c44-180e-4d06-80b2-9172b2af31a3
content_hash: 0c193543aeb6870eb4e7f9ba054180372e528ed5f1ed84e30724472fff15c61a
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 8
  succeeded: 8
  failed_urls: []
notion_page_id: 40c75244-d011-815d-92aa-dacbf6ee26b3
ioc: null
---

**Nday Poc** *2026年11月2日 15:13*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/44ad08ffbb519461.webp)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/77be41dad9935140.webp)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a186c4f5d9d52347.webp)

内容仅用于学习交流自查使用，由于传播、利用本公众号所提供的POC信息及POC对应脚本而造成的任何直接或者间接的后果及损失，均由使用者本人负责，公众号Nday Poc及作者不为此承担任何责任，一旦造成后果请自行承担！

**01**

**漏洞概述**

深科特LEAN MES系统 DownLoad.aspx 接口处存在任意文件读取漏洞,未经身份验证的远程攻击者通过漏洞可以获取到服务器敏感信息，导致系统处于极不安全的状态。

**02**

****搜索引擎**  
**

fofa:

```ini
title="LEAN MES - 用户登录" || body="Content/js/skt.utility.checkmobile.js" || body="../MobileApp/VerifyError.aspx" || body="Content/login/login2/multiplant_top.png"
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6c18f513f945e7e8.png)

**03**

**漏洞复现**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/719c53dff8313956.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/129de07e755ba76e.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/799938deedd33944.png)

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
