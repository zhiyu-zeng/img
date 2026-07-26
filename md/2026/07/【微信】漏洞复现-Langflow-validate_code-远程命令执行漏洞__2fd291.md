---
title: 【微信】漏洞复现 | Langflow validate_code 远程命令执行漏洞
source: https://mp.weixin.qq.com/s/Oa9pVBMLUSGOzg0kV9y4tw
source_host: mp.weixin.qq.com
clip_date: 2026-07-26T09:17:35+08:00
trace_id: 78aec563-e994-4cb2-afb4-5a4ec72accb7
content_hash: 42d0ba1fe0fcef75c7db0c9f6d9cb8906b2e205c90074cf118c5b01d43db1ccf
status: summarized
tags:
  - 微信
  - 漏洞分析
  - 安全工具
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: Langflow的validate_code接口存在远程命令执行漏洞，攻击者可利用它执行任意命令，需立即修复。
ai_summary_style: key-points
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 3a975244-d011-81e5-b9fa-cfd7665d67a5
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Langflow的validate_code接口存在远程命令执行漏洞，攻击者可利用它执行任意命令，需立即修复。
> 
> - **漏洞影响：** Langflow作为低代码AI工作流平台，其`/api/v1/validate/code`接口存在RCE漏洞，可导致服务器被完全控制、敏感数据泄露。
> - **复现方法：** 通过获取access_token并构造恶意请求，即可在目标服务器上执行任意系统命令。
> - **检测方式：** 可使用nuclei或afrog扫描工具检测此漏洞，FOFA测绘语法为`product="LOGSPACE-LangFlow"`。
> - **修复措施：** 建议联系厂商打补丁或升级版本、增加Web应用防火墙防护、限制接口访问权限。

**实战安全研究** *2026年7月26日 09:00*

本文仅用于技术学习和安全研究，请勿使用本文所提供的内容及相关技术从事非法活动，由于传播和利用此文所提供的内容或工具而造成任何直接或间接的损失后果，均由使用者本人承担，所产生一切不良后果与文章作者及本账号无关。如内容有争议或侵权，请私信我们！我们会立即删除并致歉。谢谢！

1

**漏洞描述**

Langflow 是目前最流行的低代码 AI 工作流构建平台，支持拖拽式可视化界面，可接入 OpenAI、Anthropic、Azure 等主流大模型，并集成 Pinecone、Milvus 等向量数据库，被大量企业用于构建 RAG 应用、Agent 工作流和 MCP 工具服务。Langflow /api/v1/validate/code 接口存在远程命令执行漏洞。攻击者可通过构造恶意的请求，利用该漏洞在目标服务器上执行任意命令，从而可能导致服务器被完全控制、敏感数据泄露等严重后果。

2

**影响版本**

Langflow

3

**测绘语法**

fofa语法

```ini
product="LOGSPACE-LangFlow"
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/b6a337f6716366c2.png)

4

**漏洞复现**

获取access_token

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/bfe1cdcea6533a80.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/119c8e4541795fee.png)

执行命令

5

**检测POC**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/d1b9269641cbad45.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/580449b934456dcc.png)

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
