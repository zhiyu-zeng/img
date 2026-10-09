---
title: 【看雪】酷狗音乐AI逆向-10分钟通杀所有IOS加密算法MCP
source: https://bbs.kanxue.com/thread-293076.htm
source_host: bbs.kanxue.com
clip_date: 2026-10-09T18:58:53+08:00
trace_id: a8077efe-e3a4-4f34-ae5f-82512592bc7b
content_hash: 154887c947668b2de518992171193f715d7b12dc17d96b6f18c70297bc226b78
status: synced
tags:
  - 看雪
  - iOS逆向
  - AI辅助逆向
series: null
feed_source: 看雪·iOS安全
ai_summary: 酷狗音乐 iOS 加密算法可借 AI + 越狱插件在约 10 分钟内自动完成分析与脚本交付，全程无需人工定位。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 3f475244-d011-81e5-8254-e0a4b2ab04a9
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 酷狗音乐 iOS 加密算法可借 AI + 越狱插件在约 10 分钟内自动完成分析与脚本交付，全程无需人工定位。
> 
> - **核心概念：** 作者把"无需多余配置、直接与 AI 对话完成逆向"的方式称为"氛围逆向"（vibe reversing）。
> - **工具链：** 越狱端安装开源插件 IOSDecryptHub（越狱源 ios.decrypthub.com），电脑端 `pip install ios-decrypt-hub` 后执行 `idh connect 192.168.200.162:8088` 接入 MCP。
> - **注入确认：** 开启酷狗音乐的注入并启动 App，出现悬浮窗即表示注入成功；随后打开插件的 Web 面板查看状态。
> - **提示词：** 把任务直接交给 AI，例如“调用 MCP 分析 iPhone 上酷狗音乐 APP 的登录算法，我已登录，可以直接看日志”，由 AI 读取日志自动吐出的算法。
> - **结果：** 约十分钟后 AI 交付可用的逆向脚本和分析报告；原帖后半部分需回复/点赞才能查看。

## 氛围逆向

什么是氛围逆向，就是你无需多余配置，直接和AI对话就能完成逆向工程，我将其称之为 vibe reversing

主角是酷狗音乐，AI使用IDH的MCP分析加密算法自吐，一句话+10分钟分析所有算法

完全可复现

### 整个对话记录我会分享到公众号：R逆向

## 插件安装

安装开源越狱插件：  
https://github.com/decrypthub/IOSDecryptHub  
越狱源也是官网：  
https://ios.decrypthub.com/

## 使用

安装好之后直接开启酷狗音乐的注入，然后打开酷狗音乐，出现了悬浮窗就是注入成功了  
![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/856da709560b3920.webp)

打开web面板，一切正常  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4fcb04122da9a00c.webp)

这个时候就可以配置mcp：  
pip install ios-decrypt-hub  
idh connect 192.168.200.162:8088

然后直接交给AI  
`调用 MCP 分析 iPhone 上酷狗音乐 APP 的登录算法。我已经完成了登录，你可以直接看日志了。`

## 十分钟之后，完成逆向，交付给我脚本和报告

IOS逆向如此简单  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/02c833f9e10b8aed.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3e4850c6d66a7600.webp)
  

> 原帖后半部分需回复/点赞可见，未解锁
