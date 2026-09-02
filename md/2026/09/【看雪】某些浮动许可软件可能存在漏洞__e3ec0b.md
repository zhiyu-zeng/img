---
title: 【看雪】某些浮动许可软件可能存在漏洞
source: https://bbs.kanxue.com/thread-292828.htm
source_host: bbs.kanxue.com
clip_date: 2026-09-02T09:29:17+08:00
trace_id: a5061e34-8c75-4420-9e0e-b9390664f7e6
content_hash: 7e13a61543ab946c67756b7bb4499eb8f8c5fdf27b7a9550ffdbf14baf6d1739
status: synced
tags:
  - 看雪
  - 漏洞分析
  - 许可绕过
series: null
feed_source: 看雪·逆向工程
ai_summary: FlexNet 11.x 早期部分浮动许可模块同时泄露 ECC 公私钥，可能被用来伪造许可、绕过授权，值得进一步验证与利用。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 3cf75244-d011-81a1-a329-c956aa1422ee
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> FlexNet 11.x 早期部分浮动许可模块同时泄露 ECC 公私钥，可能被用来伪造许可、绕过授权，值得进一步验证与利用。
> 
> - **受影响对象：** FlexNet 浮动许可软件 11.x 的早期版本。
> - **漏洞表现：** 某些模块中同时包含 ECC 公钥和私钥，可在截图中自行确认。
> - **可能成因：** 历史遗留问题，或 FlexNet 未通知厂商及时更换密钥。
> - **潜在风险：** 私钥泄露可能使攻击者伪造合法许可或绕过浮动许可校验。
> - **研究价值：** 帖子仅提示思路，未给完整利用方案，适合后续深入逆向与验证。

最后一篇帖子，给大伙留个坑，爱折腾的可以研究研究。

也许事历史遗留问题，亦或者flexnet公司没给厂商通知更换密钥，11.x的早些版本中某些模块同时包含ecc公、私钥。详见截图，可以自行验证。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d0d8a748fccf05ee.webp)
