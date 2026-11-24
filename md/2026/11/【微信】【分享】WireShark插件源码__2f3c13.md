---
title: 【微信】【分享】WireShark插件源码
source: https://mp.weixin.qq.com/s/37sBLWQTatrtsgjIrjJvAA
source_host: mp.weixin.qq.com
clip_date: 2026-11-24T08:55:11+08:00
trace_id: c5339bc1-5517-4177-ad21-4fa4defc9448
content_hash: 0b0f15d88cc3a49d0d0dd0d7a0a53f47cc7a79242900397865bf2c9d3357053b
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 42275244-d011-81e8-8602-eaffd6b2c622
ioc: null
---

**MicroPest** *2026年11月22日 11:25*

在去年做的这个小功能（ [《开发WireShark插件过程中的困惑》](https://mp.weixin.qq.com/s?__biz=MjM5NDcxMDQzNA==&mid=2247489590&idx=1&sn=8d07e6b88b70f3292f0ff9d167e012ed&scene=21#wechat_redirect) 和 [《Claude解决“开发WireShark插件过程中的困惑”》](https://mp.weixin.qq.com/s?__biz=MjM5NDcxMDQzNA==&mid=2247489638&idx=1&sn=6f4a5893b8079ab9c057f8422eb9ca30&scene=21#wechat_redirect) ）基础上，现在又完善了一次，插件源码分享给大家。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a389e83a4eb52c3c.png)

如图，做成了wireshark的一个插件，这样浏览每一条流量包时可以在下面的窗口中清晰地看到，锦上添花的工作。

1、插件源码放在网盘中，分享使用。

网盘文件：521-capture_packet.lua

链接: https://pan.baidu.com/s/1gTHE7xKAAaUbV9DvNi8hVQ?pwd=8rk6 提取码: 8rk6

2、插件放置在wireshark\\plugins中，如下图位置处，

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1407943cc3a843f7.png)

如果，你在此基础上有什么新的创意和成果，请告诉我一声，共同高兴一下。
