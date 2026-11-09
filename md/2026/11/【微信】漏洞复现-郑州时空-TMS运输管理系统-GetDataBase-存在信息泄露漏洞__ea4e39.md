---
title: 【微信】漏洞复现 | 郑州时空-TMS运输管理系统 GetDataBase 存在信息泄露漏洞
source: https://mp.weixin.qq.com/s/pESmftHg8DIHIWlQYKXcjw
source_host: mp.weixin.qq.com
clip_date: 2026-11-09T11:40:40+08:00
trace_id: 58462920-3923-47b8-9ec7-dbff319af6ab
content_hash: 5886268ce68455211485c319cca3e194692f8022e5a932e2482d11ee82a1778a
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 5
  succeeded: 5
  failed_urls: []
notion_page_id: 41375244-d011-81e7-8c8c-d9a91c595941
ioc: null
---

**实战安全研究** *2026年11月9日 10:00*

本文仅用于技术学习和安全研究，请勿使用本文所提供的内容及相关技术从事非法活动，由于传播和利用此文所提供的内容或工具而造成任何直接或间接的损失后果，均由使用者本人承担，所产生一切不良后果与文章作者及本账号无关。如内容有争议或侵权，请私信我们！我们会立即删除并致歉。谢谢！

1

**漏洞描述**

郑州时空-TMS运输管理系统 GetDataBase 接口存在信息泄露漏洞，未经身份验证攻击者可通过该漏洞读取系统内部数据库文件，泄露账号密码等重要凭证，导致网站处于极度不安全状态。

2

**影响版本**

郑州时空-TMS运输管理系统

3

**测绘语法**

fofa语法

```ini
body="/Images/ManLogin/name.png"
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/796bbf703ee7ee5b.png)

4

**漏洞复现**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/46ce01419d1a20c4.png)

获取信息

5

**检测POC**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/18e215da1f9daac0.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a96ea988cdc9dbfe.png)

nuclei

afrog

6

**漏洞修复**

1、建议联系厂商打补丁或升级版本。

2、增加Web应用防火墙防护。

3、关闭互联网暴露面或接口设置访问权限。

7

**内部圈子**

**现在已更新POC数量 2500+（中危以上）**

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
![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3425bcfa6046a8de.jpg)
