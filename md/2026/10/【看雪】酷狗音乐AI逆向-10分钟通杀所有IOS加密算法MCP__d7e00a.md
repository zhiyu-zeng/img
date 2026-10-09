---
title: 【看雪】酷狗音乐AI逆向-10分钟通杀所有IOS加密算法MCP
source: https://bbs.kanxue.com/thread-293076.htm
source_host: bbs.kanxue.com
clip_date: 2026-10-10T00:01:47+08:00
trace_id: 433dbb3b-7256-4516-9a9f-af4717f922c3
content_hash: 1b1d999d33d087648aa34e8d03b528c594d675626065629a2be860593ad6e4c8
status: synced
tags:
  - 看雪
series: null
feed_source: 看雪·iOS安全
ai_summary: 用 IDH 越狱插件把酷狗音乐算法日志接入 MCP，AI 一句话提示、约 10 分钟即可完成 iOS 登录加密算法逆向并交付脚本与报告。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 3f475244-d011-810c-b673-f85f6036bf48
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 用 IDH 越狱插件把酷狗音乐算法日志接入 MCP，AI 一句话提示、约 10 分钟即可完成 iOS 登录加密算法逆向并交付脚本与报告。
> 
> - **前置工具：** 安装开源越狱插件 IOSDecryptHub（越狱源 ios.decrypthub.com），开启对酷狗音乐的注入，APP 内出现悬浮窗即注入成功，再从 web 面板确认状态正常。
> - **MCP 配置：** 执行 `pip install ios-decrypt-hub`，再用 `idh connect 192.168.200.162:8088` 连接设备；随后把分析工作交给 AI。
> - **核心提示词：** 只需一句「调用 MCP 分析 iPhone 上酷狗音乐 APP 的登录算法，我已经完成了登录，可以直接看日志」，AI 即可自动读日志、还原算法。
> - **结果产出：** 约十分钟后交付可用的加密算法脚本与分析报告，官方称可通杀该 APP 的所有算法且完全可复现。
> - **理念与作者：** 作者把这种「无需多余配置、直接对话完成逆向」的方式称为氛围逆向（vibe reversing），完整对话记录分享在公众号「R逆向」。

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
