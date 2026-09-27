---
title: 【看雪】酷狗音乐AI逆向-10分钟通杀所有IOS加密算法MCP
source: https://bbs.kanxue.com/thread-293076.htm
source_host: bbs.kanxue.com
clip_date: 2026-09-27T23:58:32+08:00
trace_id: 55478264-d673-4c36-8b62-b8c2acc239fe
content_hash: a463bfe40e17dc516faf8501a4b8b6efb5209134421f10ea9baea18d61984153
status: synced
tags:
  - 看雪
  - iOS逆向
  - AI辅助逆向
series: null
feed_source: 看雪·iOS安全
ai_summary: 无需多余配置，直接与 AI 对话即可完成 iOS 逆向（作者称"氛围逆向"）；以酷狗音乐为例，一句提示词约 10 分钟产出登录加密算法脚本与报告。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 3e875244-d011-81a2-89f9-ffdf2c48d344
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 无需多余配置，直接与 AI 对话即可完成 iOS 逆向（作者称"氛围逆向"）；以酷狗音乐为例，一句提示词约 10 分钟产出登录加密算法脚本与报告。
> 
> - **核心工具：** 开源越狱插件 IOSDecryptHub（IDH），仓库 github.com/decrypthub/IOSDecryptHub，越狱源 ios.decrypthub.com。
> - **使用流程：** 安装插件后开启酷狗音乐注入并启动 App，出现悬浮窗即注入成功；打开 Web 面板确认状态正常。
> - **MCP 配置：** 执行 `pip install ios-decrypt-hub`，再运行 `idh connect 192.168.200.162:8088` 连接已注入设备。
> - **AI 提示词：** "调用 MCP 分析 iPhone 上酷狗音乐 APP 的登录算法。我已经完成了登录，你可以直接看日志了。"——由 AI 读取自吐日志完成分析。
> - **产出与主张：** 约十分钟后交付逆向脚本与报告，作者称该方法可"通杀所有 iOS 加密算法"，且流程完全可复现。

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
  

[回复或点赞可查看完整内容](#quick_reply_form)
