---
title: 【微信】强网杯 easytl Writeup
source: https://mp.weixin.qq.com/s/ePqVloWwGNO6WDkYEXzeLQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-09T11:58:57+08:00
trace_id: 08ab5ad9-5f2e-4971-a49b-322b09cc248d
content_hash: 74d29bd058500b420f05896cb849631b0fce181d201dff8559238ceb6e96c392
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
notion_page_id: 41375244-d011-8102-9463-f314aaa7be2e
ioc: null
---

**赛查查** *2026年11月9日 11:17*

定制 OpenSSL 里的栈溢出与 ROP\[图片\]今年强网杯 Pwn 方向有一道名叫 easytl 的题，分值 1000，题目描述只有一句“一个正常的服务器”。服务器确实在：1443 端口，规规矩矩跑着 TLS。但上手就会发现，它内嵌的 OpenSSL 被作者动过手脚，三个回调函...
