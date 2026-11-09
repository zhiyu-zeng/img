---
title: 【微信】ssrf绕过过滤
source: https://mp.weixin.qq.com/s/BLfPk0SFC8WhrGt88vQLfw
source_host: mp.weixin.qq.com
clip_date: 2026-11-09T08:35:38+08:00
trace_id: eaebffbc-3e12-44f9-829e-ed956a651dee
content_hash: 68b587f765082a494ce330931407d3c3460118448bcfd1a2d4c89a137431515a
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
notion_page_id: 41375244-d011-81fe-b218-f8eed1da6f46
ioc: null
---

**安全渗透自学笔记** *2026年11月8日 11:06*

您的 SSRF 過濾器封鎖了 127.0.0.1 和 localhost。這沒問題！試試這些：

2130706433（十進制）

017700000001（八進制）

127.1（簡寫）

127.0.0.0（使用子網路技巧）

0x7f000001（十六進制）

它們都會解析為 localhost。許多封鎖清單無法全部攔截它們。
