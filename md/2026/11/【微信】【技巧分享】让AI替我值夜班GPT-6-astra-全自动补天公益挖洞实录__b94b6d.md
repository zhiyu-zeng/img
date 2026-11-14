---
title: 【微信】【技巧分享】让AI替我值夜班:GPT-6-astra 全自动补天公益挖洞实录
source: https://mp.weixin.qq.com/s/_p4Np6iG8aX2151ssYhfaQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-14T16:53:21+08:00
trace_id: 04fe992a-061f-487c-ad5e-0d3bde56fa2f
content_hash: e9204a1784271d46ca7bda61b0372bbaa082298265b5b989f95c4cf3863d40ab
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 18
  succeeded: 18
  failed_urls: []
notion_page_id: 41875244-d011-81d4-831a-e85c2ed5b067
ioc: null
---

**弥天安全实验室** *2026年11月11日 12:01*

网安引领时代，弥天点亮未来

![Image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c6ff40606cbd18af.webp)

**0x00原理说明**

正常来说，直接用GPT-6-astra去挖公益漏洞会触发cyber policy的策略告警

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3710d1ad42cf83a8.png)

但是如果只是让GPT-6-astra单纯的写nuclei的POC文件，不去利用是不会触发围栏限制的

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/20f3e65320189fb7.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6c83c8a5c592e12a.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/15b716ce001cc50a.png)

然后再清除上下文记忆，不要让AI记得他之前写过脚本，然后让他去运行之前写好的脚本去挖掘，就不会触发围栏了，因为GPT-6-astra只是负责运行和分析结果，并不是它自己本身去挖掘，实际挖掘的也只是它之前写好的脚本而已，所以就不会触发围栏了

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7332115b0d80edf0.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/51963ca8cafcdf11.png)

还有就是提供POC数据包的时候，目标地址一定要写127.0.0.1,因为这样它会觉得你只是本地测试，是没有风险的

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/af5ba801446bfe05.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c9e9da770f40f3f3.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/dbe3e72adb965c7b.png)

**0x01效果展示**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/68d6857eedf1b62f.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0ba7b3ced65815e7.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/38f904eeed83db7a.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/93872f9eebf4617a.png)

还有就是token成本问题，买的是长亭科技的套餐，500块钱一个月，官方地址:https://monkeycode-ai.com/,每天三亿的token的额度，因为并不是模型本身去挖掘，只是它写的脚本在那挖，我设置了定时每30分钟看一下结果处理一下扫描结果即可，消耗不了多少token额度的。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5499db84e5cb36e4.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/85c96e2675dd6e6d.png)

AI在漏洞挖掘的时候，token消耗量比较多或者是触发围栏限制的，其实就是因为你让他自己本身去请求和分析响应结果，如果通过脚本先降噪再给AI分析，可以省掉一大半的token消耗量，不用AI自己去挖掘，也就不会触发安全围栏了。

同时也可以降低网站出现安全事件的风险，因为AI只是运行脚本，风险可控，如果让AI自己爬虫，自己去挖，去分析，很容易出现误删业务或的风险。

还有人会问，花500挖公益，值吗？我的回答是，补天是可以兑换京东卡的，每个月最多兑换3000京东卡，只要回报大于成本，最后就值得
![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/890ee753f80d1c09.png)
