---
title: 【微信】智能自动化漏洞挖掘平台 -- AutoHunter
source: https://mp.weixin.qq.com/s/-8C2V0a_pNmNfZXhcoxpgw
source_host: mp.weixin.qq.com
clip_date: 2026-07-27T11:54:34+08:00
trace_id: 23312d1e-93c9-4566-9f85-b5c5162d7495
content_hash: b43e1003bf9c0ef1d0a2f4ea50e9f49e998b5b12a86ec024e9a5c154a4092012
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
notion_page_id: 3aa75244-d011-8197-bc60-e03ef6dd1d58
ioc: null
---

**网络安全者** *2026年7月27日 11:31*

\===================================

请勿利用文章内的相关技术从事非法测试，由于传播、利用此文所提供的信息而造成的任何直接或者间接的后果及损失，均由使用者本人负责，作者不为此承担任何责任。工具来自网络，安全性自测，如有侵权请联系删除。个人微信：ivu123ivu

**0x01 工具介绍**

AutoHunter 把红队自动化和 AI 决策结合起来：你给它一个目标，它像一名渗透测试工程师那样， 自主决定"用哪个工具、打哪个面、查什么漏洞"，把 Burp、Xray、nuclei 这些工具串成攻击链， 最后给你一份对齐 OWASP、诚实标注覆盖盲区、去过误报的报告。核心不实现任何具体攻击——一切皆插件。用户可以零代码(YAML)或低代码(Python)不断接入新工具， 工具库越大，agent 能力越强。

**0x02 安装与使用**

常用命令：

```bash
pip install -r requirements.txt
# 内置 demo 插件 + 自带靶场，端到端跑通整条流水线
python -m autohunter scan --target http://demo-shop.local --type website --scope demo-shop.local
报告输出到 
reports/<任务ID>/report.html。想接真实工具？一条命令下载：
python scripts/fetch_tools.py         # 自动下载 Xray / nuclei
```

一定要在虚拟机运行，工具下载链接：

公众号后台回复：20260727

链接仅一天有效，每日更新

**·** **今 日 推 荐** **·**

|     |     |
| --- | --- |
| ![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/fcd23d386a051b6d.jpg) |     |
