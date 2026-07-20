---
title: 【微信】Fastjson 1.2.83 远程代码执行？rce？
source: https://mp.weixin.qq.com/s/fztSui3bqoQ9x4rxQCmbFQ
source_host: mp.weixin.qq.com
clip_date: 2026-07-20T23:41:17+08:00
trace_id: 7c63f67c-f0c6-4c99-b42c-44f9ae33e418
content_hash: 59fc123ae2f77a7b536b811b3d2151c38388dd106db6e33e08f6d1266a6f0acb
status: summarized
tags:
  - 微信
  - 漏洞分析
  - 安全工具
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: Fastjson 1.2.83 因 `autoType` 功能持续存在远程代码执行风险，升级或启用 `SafeMode` 是防御关键。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3a375244-d011-81bc-90ae-ff32d45a3150
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Fastjson 1.2.83 因 `autoType` 功能持续存在远程代码执行风险，升级或启用 `SafeMode` 是防御关键。
> 
> - **漏洞根源：** Fastjson 为支持复杂对象反序列化而引入的 `autoType` 功能，一直以来是攻击者利用其加载恶意类、实现远程代码执行的主要入口。
> - **防护措施：** Fastjson 1.2.83 版本是最后一个支持 `autoType` 的版本，官方建议在该版本及更早版本中设置 `safeMode` 来禁用此功能。
> - **实际风险：** 许多开发者在使用 Fastjson 1.2.83 时并未启用 `safeMode`，导致系统仍然暴露在通过精心构造的 JSON 数据进行的反序列化攻击风险之下。
> - **根本解决：** 要彻底规避此类反序列化漏洞，应升级到完全移除 `autoType` 功能的 Fastjson 2.x 或更新版本。

**微信扫一扫赞赏作者**

喜欢作者 其它金额

作品

暂无作品

喜欢作者

其它金额

最低赞赏 ¥0

**其它金额**

赞赏金额

¥

最低赞赏 ¥0

1

2

3

4

5

6

7

8

9

0

.
