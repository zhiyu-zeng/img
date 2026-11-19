---
title: 【看雪】有关王者荣耀静态逆向解析的相关技术教学
source: https://bbs.kanxue.com/thread-293596.htm
source_host: bbs.kanxue.com
clip_date: 2026-11-19T11:19:01+08:00
trace_id: bb2b79f8-f88d-40d9-8f7f-7b012efcfd5b
content_hash: 00c0eb5979898b1c839dbc9d9edccdb867d0b4e26b5cc82ba8e001e34366ccc8
status: synced
tags:
  - 看雪
series: null
feed_source: 看雪·逆向工程
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41d75244-d011-8184-8107-fef5bc42ef7e
ioc: null
---

本文仅用于逆向技术教学

原文作者Zhan_Er QQ:3439859003

转载请注明原作者

开始之前，请确保你已经下载IDA工具并拥有一份王者dump.cs和王者安装包内的libil2cpp.so

如果不知道如何进行dump，请到互联网搜索相关教学

完成准备后，即可开始阅读教学

注意：教学内容字数过多（超出看雪的字数限制了），具体教学内容上传到附件里了，下载附件即可查看

* * *

## 评论

> **Zhan_Er · 2 楼**
> 
> 如果你是那种坚信只要能用内核AGG扫出偏移链就行，干嘛要学静态逆向的人，请别阅读此教学。  
> 好的文章留给好的人，璞玉若遇不识货的人，也不过蒙尘。  
> 天阶功法也只有天灵根的人才能读懂其中精妙！

> **Zhan_Er · 3 楼**
> 
> 前天闲来无事逆向了一下王者，逆向花了一天，编写教学花了一天半。学会此技术的人可以利用此技术训练AI，喂给ai人物的精确坐标，训练效果比喂给ai图像识别结果要好得多  
> 同时此文章可以帮助正向人员了解逆向工程师究竟是如何逆向的，可帮助正向人员进一步完善游戏反作弊系统。  
> 同时对于想转行做安全相关领域的人来说，这篇文章可以帮你一窥逆向的大门。  
> 之所以选择王者人物坐标，是因为我认为它对于初入安全领域的人而言难度适中，不至于像小游戏那么简单，但又不至于像逆向手机系统那么复杂，最关键的是趣味性十足但却又极具教学价值

## 附件

- [查找各英雄所在位置的x坐标.lua](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/attach/2026/11/e3ee4217454f9820.lua) （3.63kb，0次下载）
- [完整偏移链.txt](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/attach/2026/11/5b180b4ef3ea1aaf.txt) （1.33kb，0次下载）
- [说明.md](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/attach/2026/11/68d9f2f12c53e9fe.md) （0.17kb，0次下载）
- [完整思路解析.txt](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/attach/2026/11/59278df64756ccec.txt) （94.42kb，0次下载）
