---
title: 【微信】我们是怎么通过 AI 做到一边睡觉一边获得 0day/1day 的？
source: https://mp.weixin.qq.com/s/YWKfZcJdp-uHDirvQq1KJg
source_host: mp.weixin.qq.com
clip_date: 2026-11-09T10:57:47+08:00
trace_id: be452ed6-5699-4c7f-b1fc-71a5a816cddc
content_hash: 60b89561269d8d46acd5dca38c1be280409328f962e05212dde5becd5d6755cb
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 16
  succeeded: 16
  failed_urls: []
notion_page_id: 41375244-d011-810d-ac79-cc121d4d5016
ioc: null
---

**知攻善防实验室** *2026年11月9日 09:16*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a16ce33b781f7c8f.gif)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/92e156dd2ee574a4.gif)

前言

原理：监控 commit 来进行漏洞情报监测

这个想法源于哪个技术沙龙，我忘了，某个议题提的，我们也把它实现了，效果比较好。

大概是这样实现的：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d83913f4e1f68222.png)

作为一名安全工程师，你需要先去学习基础的 git 和 commit 是什么，不然很难理解 23333333

简而言之，在源代码管理中，90% 的人都是使用 git 进行的管理，Github或者私有化的 git 服务等等，commit 是什么呢？就是每次更新代码提交的内容。

那么什么是 diff 呢，简而言之就是提交代码前和提交代码后的文件变化等等。

两者同时我们就可以实现监听 commit 提交，让 LLM 来判断是否为安全更新，如果是则记录，自动提交工程开始复现漏洞或者人工审批来复现。

如何使用

你可以在“情报”->“开源情报”，里面一键导入 Github 链接.

该功能兼容的是 Github REST API，公司如果有自己私有化的 git 仓库，也可以自定义。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b12f34ad9ccb17d5.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/be784b51265f932a.png)

检测到安全更新 commit 你可以自行选择自动提交工程进行全自动漏洞复现，也可以进行手动提交工程队列，总之爽的很

0day/1day按斤批发

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4c3819ec6e40254d.png)

注意，这些漏洞全都是在睡梦中或者其他摸鱼中产出的（看后面的时间）

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/de7a72a2a41eb695.png)

实战效果

随便截点图，不可否认的是，经过我们的一段时间监测，你可以获取到的漏洞情报非常多，但是确实是可以实打实的第一时间获取开源漏洞情报，你可以在监控策略里面仅复现 RCE、文件上传、SQL 注入这种单项的，方便第一时间获取 1day/0day 漏洞。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/50dfcf745dd16080.png)

项目介绍

全链哨兵，是集Web 渗透、安卓 App 安全测试、iOS APP安全测试、攻防批量打点、自动化应急响应、开源漏洞监测为一体的网络安全 Agent，用于安全服务交付自动化辅助，禁止用于非法用途。

https://github.com/zgsfsec/Full-Chain-Sentinel-System

希望大家多多帮忙 star🌟 转发，您的 star 是作者更新最大的动力。

全链哨兵交流群

加群条件

1.Github 帮我们点一个 star

2.扫描下方，加好友“打招呼”：发送“全链哨兵”

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a814fa61789fdc61.webp)
![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/60d0bed0bc93a2b3.webp)
