---
title: 【看雪】jadx如何加载脚本？
source: https://bbs.kanxue.com/thread-291851.htm
source_host: bbs.kanxue.com
clip_date: 2026-07-02T11:42:49+08:00
trace_id: d1441af5-3ff7-4c3d-8a7e-0e21dc4a11db
content_hash: e06646581a99d2f2b953e12763c6bd01642874c893ab44065b44f7da78106173
status: summarized
tags:
  - 看雪
series: null
feed_source: 看雪·Android安全
ai_summary: 要解密字符串加密的App，但jadx 1.5.5版本界面中找不到脚本加载入口。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 39175244-d011-8164-86cd-ee67ede7cb4a
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 要解密字符串加密的App，但jadx 1.5.5版本界面中找不到脚本加载入口。
> 
> - **脚本功能入口：** 在较新版本的jadx中，脚本功能通常位于左侧导航栏的“脚本”选项卡内。
> - **版本建议：** 当前使用的1.5.5版本可能缺失该功能，建议升级到更新版本以启用脚本加载。
> - **替代方案：** 若仍无法解决，可考虑使用JEB反编译工具，其脚本支持较为成熟。

最近遇到一个字符串加密的app，想写个jadx脚本解密一下，找了半天没找到jadx在哪加载脚本，请问有佬知道jadx在哪加载脚本吗，jadx版本是1.5.5

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/d8244623678a5b17.webp)

* * *

## 评论

> **逆向小玖 · 2 楼**
> 
> 你版本有点旧吧，左边 输入底下应该还有个脚本的，你这没有，用新的

> **小黄鸭爱学习 · 3 楼**
> 
> 换JEB
