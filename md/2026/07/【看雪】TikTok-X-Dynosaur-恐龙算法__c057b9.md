---
title: 【看雪】TikTok X-Dynosaur 恐龙算法
source: https://bbs.kanxue.com/thread-292102.htm
source_host: bbs.kanxue.com
clip_date: 2026-07-21T17:59:01+08:00
trace_id: 120a2a45-3864-493c-aa9c-423f9040994f
content_hash: ef319a0ada2afe018a689e9506adc34c1704e9fa18ece1d404d0c360fe0a0dda
status: summarized
tags:
  - 看雪
  - 协议分析
  - 风控对抗
series: null
feed_source: 看雪·逆向工程
ai_summary: TikTok Web端已启用新的X-Dynosaur算法独立完成API签名，替代了之前的X-Bogus和X-Gnarly，其核心结构与前代算法相似。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3a475244-d011-8151-b852-f9e7cf775c52
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> TikTok Web端已启用新的X-Dynosaur算法独立完成API签名，替代了之前的X-Bogus和X-Gnarly，其核心结构与前代算法相似。
> 
> - **参数结构与类型：** payload参数包含多种类型，如常量标记、环境编码、SDK版本字符串，以及请求体、查询字符串、User-Agent的哈希值、时间戳和状态计数器等。
> - **关键检验点：** 校验逻辑主要依赖于对请求体、查询字符串和User-Agent进行相同的哈希函数（payload_43, payload_46, payload_48），确保这些传输数据未被篡改。
> - **时效与状态关联：** payload_39中的时间戳具有约半小时的有效期，用于防重放；payload_36的生成与时间戳、环境码等多个字段相互关联，增加了伪造难度。

最近看技术群里有人在问这个，今天有空用AI来试试。打开Web的达人作品列表页，触发接口：/api/post/item_list/ 加载达人作品列表数据。

接口测试：X-Bogus，X-Gnarly已经可以不传了，单带X-Dynosaur即可完成验签。

这个算法和X-Gnarly其实差不多，明文参数可以参考，仅供学习研究，具体细节就不说了：

```swift
payload_dict = {
    "payload_32": "P(55144) reads exBundleSeed/exBundleProof/computeExProof state; mock VM -> '\\xdf\\xd1', captured page -> '\\xdf\\xd4^'.",
    "payload_33": "constant marker '\\xdf'",
    "payload_34": "constant marker '\\xdf'",
    "payload_35": "constant '0'",
    "payload_36": "P(48086)(payload_39 timestamp_s, hidden payload36_seed, payload_38 envcode)", # 检测
    "payload_37": "request/session state counter tfr from P(58584)'s state object",
    "payload_38": "environment code from P(40262), encoded through P(31434)",
    "payload_39": "SDK timestamp seconds from Date/getTime path", # 时效性检测
    "payload_40": "constant '0'",
    "payload_41": "constant '0'",
    "payload_42": "SDK version string",
    "payload_43": "raw P(48464)(request body); GET/default body='' -> 811c9dc4",
    "payload_44": "P(8389)(false).data probe result; mock path returns -1",
    "payload_45": "constant '0'",
    "payload_46": "raw P(48464)(P(31424)(url).raw_unsigned_query) query hash",
    "payload_47": "request/session state counter ifr from P(58584)'s state object",
    "payload_48": "raw P(48464)(HTTP user-agent header)",
    "payload_49": "SCM/webmssdk version string, e.g. exScmVersion",
    "payload_50": "constant '0'",
    "payload_51": "constant '0'",
    "payload_52": "exBundleSeed/runtime seed payload field; not always the same value used by P(48086)",
    "payload_53": "constant '0'",
    "payload_54": "ubcode from P(34577), encoded through P(31434)",
    "payload_55": "constant '0'",
    "payload_56": "raw VM/runtime 4-byte hash-like field; mock VM uses P(48464) empty-string bytes",
}
```

检验点：

payload_43 = p48464_hash_bytes(body) # GET: body=""

payload_46 = p48464_hash_bytes(query)

payload_48 = p48464_hash_bytes(user_agent)

payload_39 时间戳 大概半小时左右失效

payload_36 相互影响
