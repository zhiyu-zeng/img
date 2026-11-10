---
title: 【微信】【工具】netgap 网闸 循环检查网络出口
source: https://mp.weixin.qq.com/s/GPRkeyMQ1KaBKvKF59ecQQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-10T14:55:50+08:00
trace_id: 0f36837c-c9ec-44f7-99d2-46caa29a2c99
content_hash: 61be7f0e145827a6489efe9651d3236cdae8ac47f0080301ae7f23cf0d684fef
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 41475244-d011-81a0-80a3-fb440f087eb3
ioc: null
---

**NOVASEC** *2026年11月10日 10:34*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9a4063caa84d6bf7.png)

**0x00 前言**

**\].**

*****注：本文属于推荐系列文章，所推荐内容部分为外部优质项目，并非全部由本团队开源实现。文章旨在分享各类优质项目，提升其关注度与影响力，文中观点仅代表作者个人看法。若您有更合适的替代项目，欢迎在留言区推荐分享，共同推荐优质项目资源。*****

## NetGap

NetGap 用于检查代理出口 IP 是否仍处于预期网络区域。

项目提供命令行版和图形界面版：命令行版适合脚本和终端操作，图形界面版提供可视化配置、状态和日志。

****两个程序都会检测系统代理配置，并依次使用可用的 IP 查询 API 获取出口 IP，再通过本地 IPv4/IPv6 数据库查询归属地。****

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/14965366cd7a1ce8.png)

项目地址

```bash
https://github.com/winezer0/netgap
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b22bac29ecb94633.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6f42f3dcbd941c42.jpg)

NOVASEC

WINEZER0

渗透测试工具 · 目录

作者提示: 内容由AI生成
