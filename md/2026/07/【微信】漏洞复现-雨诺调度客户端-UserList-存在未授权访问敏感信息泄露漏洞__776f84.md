---
title: 【微信】漏洞复现 | 雨诺调度客户端 UserList 存在未授权访问敏感信息泄露漏洞
source: https://mp.weixin.qq.com/s/jFglwXUuGUwIxu-Olt7gRQ
source_host: mp.weixin.qq.com
clip_date: 2026-07-22T18:44:01+08:00
trace_id: f3d41a05-d990-4ca6-b890-c418e89b15b2
content_hash: 209b8bb751b765f4cb6a50a975abd15ac0973a915e10569dea673279a434485c
status: summarized
tags:
  - 微信
  - 漏洞分析
  - 企业应用漏洞
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 雨诺调度客户端的 UserList 接口存在未授权访问漏洞，攻击者无需认证即可获取敏感信息。
ai_summary_style: key-points
images_status:
  total: 5
  succeeded: 5
  failed_urls: []
notion_page_id: 3a575244-d011-8136-bd43-d348157ff4ee
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 雨诺调度客户端的 UserList 接口存在未授权访问漏洞，攻击者无需认证即可获取敏感信息。
> 
> - **漏洞影响：** 雨诺调度客户端（一款基于 ASP.NET Core 的企业级 ERP 调度管理系统）。
> - **检测方法：** 可使用 fofa 搜索引擎通过 `icon_hash=="1268292329"` 语法进行资产测绘。
> - **漏洞原理：** 系统的 `/UserList` 接口缺少必要的身份验证与授权机制，导致敏感信息泄露。
> - **修复建议：** 联系厂商更新、部署WAF防护、或限制该接口的互联网暴露与访问权限。

**实战安全研究** *2026年7月22日 18:24*

本文仅用于技术学习和安全研究，请勿使用本文所提供的内容及相关技术从事非法活动，由于传播和利用此文所提供的内容或工具而造成任何直接或间接的损失后果，均由使用者本人承担，所产生一切不良后果与文章作者及本账号无关。如内容有争议或侵权，请私信我们！我们会立即删除并致歉。谢谢！

1

**漏洞描述**

雨诺调度客户端是一款企业级 ERP 调度管理系统，基于 ASP.NET Core 开发，雨诺调度客户端 UserList 存在未授权访问敏感信息泄露漏洞。

2

**影响版本**

雨诺调度客户端

3

**测绘语法**

fofa语法

```ini
icon_hash=="1268292329"
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/c47a7434a59dc1b0.png)

4

**漏洞复现**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/ad256de558d009f6.png)

获取信息

5

**检测POC**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/993bffb18eb5c878.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/458829523052fe4a.png)

nuclei

afrog

6

**漏洞修复**

1、建议联系厂商打补丁或升级版本。

2、增加Web应用防火墙防护。

3、关闭互联网暴露面或接口设置访问权限。

7

**内部圈子**

**现在已更新POC数量 2450+（中危以上）**

🔥 **1day/Nday 漏洞实战圈上线** 🔥

还在到处找公开漏洞 POC？

这里专注整合全网公开1day/Nday漏洞POC和复现，一站式解决你的痛点！

🔍 圈子福利

✅ 整合全网 1day/Nday 漏洞POC，附带复现步骤，新手也能快速上手

✅ 每周更新 7-15 个POC测试脚本，经过实测验证，到手就能用

✅ 完美适配 Nuclei/Afrog 扫描工具，脚本无需额外修改，即拿即用

✅ 临时福利：免费 FOFA 高级会员查询，无需账号也能高效资产测绘

✅ 专属权益：提供指纹识别库，指纹库持续更新

💡 适合对象

渗透测试🔹攻防演练🔹安全运维🔹企业自查🔹SRC漏洞挖掘

⚠️ 重要提醒

仅限授权范围内的合法安全测试，严禁用于未授权攻击行为！

本服务为虚拟资源服务，一经购买概不退款，请按需谨慎购买！

目前圈子已满200人，价格由66.9调整为69.9元（交个朋友啦），250人后调整为71.9元。
![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/3425bcfa6046a8de.jpg)
