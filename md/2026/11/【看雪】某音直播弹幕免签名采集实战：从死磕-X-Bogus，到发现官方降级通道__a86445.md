---
title: 【看雪】某音直播弹幕免签名采集实战：从死磕 X-Bogus，到发现官方降级通道
source: https://bbs.kanxue.com/thread-293648.htm
source_host: bbs.kanxue.com
clip_date: 2026-11-24T10:16:51+08:00
trace_id: 968e9936-2e98-457e-ab45-34a88d9be157
content_hash: b71f49d38a06b80beab03f32117076e10635ac3c54112a4f39993b49820d4f08
status: synced
tags:
  - 看雪
  - 协议分析
  - 风控对抗
series: null
feed_source: 看雪·逆向工程
ai_summary: 某音直播弹幕采集卡在 X-Bogus 签名（JSVMP 加固）上两天无解，最终靠页面 URL 里的 `im_path` 参数找到官方降级通道 `webcast/im/fetch`，免签名即可拉取弹幕。
ai_summary_style: key-points:weak
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 42275244-d011-81b0-b420-e251f2409a21
ioc: null
---

> 💡 **AI 总结（key-points:weak）**
>
> 某音直播弹幕采集卡在 X-Bogus 签名（JSVMP 加固）上两天无解，最终靠页面 URL 里的 `im_path` 参数找到官方降级通道 `webcast/im/fetch`，免签名即可拉取弹幕。
> 
> - **主通道死路：** WebSocket 握手要求 `signature = frontierSign({"X-MS-STUB": md5(13参)})["X-Bogus"]`，frontierSign 在 webmssdk 里做了 JSVMP 加固；Node 补全 DOM/cookie/crypto.subtle/ttwid 环境后仍返回 415 DEVICE_BLOCKED。
> - **降级通道：** `POST https://live.douyin.com/webcast/im/fetch/` 是网页端 WS 失败后的兜底长轮询接口，不校验 signature，用纯 requests 即可，风险控制最弱。
> - **设备自洽才是真门槛：** UA、ttwid、屏幕、CPU、内存须来自同一设备；做法是从 cookie 回读 `device_web_cpu_core`、`device_web_memory_size` 而非写死，保证与 ttwid 同源。
> - **协议解析：** 弹幕为 protobuf 二进制，手写 varint / length-delimited 解析，结构为 PushFrame → Response（messages/cursor）→ Message（method/payload）→ ChatMessage（user/content/create_time）。
> - **工程实测：** aiohttp 每房间一条长轮询，14 房间约占 200–250MB 内存；MySQL 落库 + INSERT IGNORE 去重。成果：4 小时单主播抓到 1330 条询价，尺码问题占 44%（580 条）；12 个女装直播间聚合显示大衣 138 次居首，绿/燕麦/蓝为热色。
> - **方法论：** 高可用系统必有降级路径，优先级依次为兜底通道 → 换端（H5/小程序/App）→ URL 参数线索 → 数据免费副本（HTML/SSR）→ 响应头风控信号 → 开源先例，硬啃加密应放最后。

一个两天没啃下来的 JSVMP 签名，最后被 URL 里的一个参数解决了。

一、想做的事

抓某音直播间弹幕，做「询价复盘 / 选品洞察」——把卖货直播间里"多少钱""有L码吗""包邮吗"这类购买意图弹幕捞出来，给主播或供应链做分析。

听起来简单，真动手才发现：某音的弹幕主通道，卡在一道签名上。

二、整体架构

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c7e0672bf2db71a8.webp)

三、难点一：WebSocket 签名是死路（X-Bogus）

某音弹幕正常走 wss://webcast\*/webcast/im/push/v2/，握手需要 signature 参数：

signature = byted_acrawler.frontierSign({"X-MS-STUB": md5(13个参数)})\["X-Bogus"\]

## X-Bogus 签名与 JSVMP 加固

我逆出了 13 个参数的拼接规则、MD5 逻辑，但 frontierSign 来自 webmssdk（JSVMP 加固）。

Node 补环境试了个遍——DOM shim、document.cookie、crypto.subtle、ttwid 全补上，服务端依然 415 DEVICE_BLOCKED。

死磕两天，没过去。

四、难点二：发现官方降级通道 im/fetch

回头翻页面 URL 参数时，发现了一个一直被当噪音的东西：

im_path=/webcast/im/fetch/

## 官方降级通道 im/fetch

顺着它找到一条 HTTP 长轮询通道：POST https://live.douyin.com/webcast/im/fetch/

完全不校验 signature，纯 requests 就能收弹幕。 这是网页端 WS 连不上时的官方兜底通道，反而保护最弱。

resp = session.post(

"https://live.douyin.com/webcast/im/fetch/",

params={\*\*设备参数, "room_id": rid, "user_unique_id": uid,

"cursor": cursor, "internal_ext": ext,

"resp_content_type": "protobuf"},

data=b"", timeout=25)

五、难点三：设备参数自洽（真正的门槛）

## 设备参数自洽

免签之后，第一道真正的门槛不是签名，是设备自洽——UA、ttwid、屏幕、CPU、内存必须来自同一台设备，否则照样被风控。

关键做法：从 cookie 回读设备参数，而不是写死：

\# cookie 里有 device_web_cpu_core / device_web_memory_size

profile = device_profile(cookie_str) # 回读，保证和 ttwid 同一来源

六、难点四：protobuf 手写 wire 解析

弹幕是 protobuf 二进制，手写 varint / length-delimited 解析，确认了字段号：

PushFrame → Response(含 messages/cursor) → Message(method/payload)

→ ChatMessage(user/content/create_time)

七、难点五：多房间并发 + 落库

aiohttp 异步，每房间一条长轮询。实测 14 房间 ≈ 200-250MB 内存，MySQL 落库 + INSERT IGNORE 去重。

八、成果：从弹幕里挖出"钱"

询价复盘（单主播）

4 小时直播，抓到 1330 条询价，其中：

\- 尺码问题占 44%（580 条）

\- "有运费险吗"被问 37 遍、"裤子几号链接"36 遍

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/76fdc2898cf9c7fd.webp)

选品洞察（12 个女装直播间聚合）

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7d17e399468f94c8.webp)

一句话结论：11 月女装直播，大衣是绝对主力（138 次），绿/燕麦/蓝是当季热色；库存焦虑和尺码是两大成交拦路虎。

九、经验总结：先找"官方留的门"，别死磕加密

这次最大的教训不是技术，是方法论：

## 方法论：先找兜底通道

任何要保证高可用的系统，都一定留了降级/兜底路径——WS 连不上就切 im/fetch，接口要签名但 HTML 里明文。这些"为了任何时候都能用"而留的门，保护天然比主路弱。

遇到新目标，先按这个顺序过一遍，再决定要不要硬啃加密：

1\. 降级/兜底通道（主通道挂时页面切哪）

2\. 换端（Web 要签，H5/小程序/App 要不要）

3\. URL 参数当线索（im_path 早就在明示备用通道）

4\. 数据有没有"免费副本"（接口要签，HTML/SSR 明文）

5\. 响应头/风控信号（X-Ms-Token 回读）

6\. 开源先例

死磕加密，是"没找到门"之后的最后手段，不是默认选项。

\---

数据/代码/报告均为本地实测。
