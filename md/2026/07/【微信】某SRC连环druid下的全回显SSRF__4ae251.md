---
title: 【微信】某SRC连环druid下的全回显SSRF
source: https://mp.weixin.qq.com/s/R0N2Poeb-H-DravhW2InAw
source_host: mp.weixin.qq.com
clip_date: 2026-07-27T13:54:16+08:00
trace_id: fee3f15a-6b4e-4cd3-b0fd-9222a803b46d
content_hash: f6d8f854b7b96e9955c5835a440196f8d1d15dab3e967bf269ce2820a84ee138
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3aa75244-d011-817b-a436-db7371c774d6
ioc: null
---

**福Us1r** *2026年7月27日 13:30*

开局经典登录框入口，常规 `F12` 审计 `JS`

通过任意路由触发后端请求如登录，拿到 `base：/video_promotion_web/`

递归 `fuzz` 该微服务，发现 `druid` 未授权, 但在 `url` 监控中未发现可利用信息，依托业务理解，前置 `base` 微服务往往有多个

**随即定向** `fuzz` **微服务** 下的 `druid：/video_promotion_{fuzz}/druid` ；拿到第二个 `druid`

```
druid：/video_promotion_{fuzz}/druid
```

在第二个 `druid` 当中，回溯 `uri.htm` 出现了后端接口地址，将 `uri` 提取并作为微服务字典进行第三轮 `fuzz`

继续 `fuzz` 其他 `druid` ，成功拿到 `log_spider` 下的 `druid` ，出现新的 `url` 监控信息

观察监控面板发现接口： `/proxy/request` 根据接口语义很明显是代理请求相关，联想到 `ssrf`

提取该站点所有接口进行分割制作字典，丢给 `AI` 构造参数和自行发散思维，最终构造完整参数读取内网 `K8s` 集群拿到全回显 `SSRF`

* * *

欢迎加入纷传圈学习更多实战报告小思路
