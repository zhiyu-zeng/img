---
title: 【看雪】给自己的调试器z0bdbg写了一个专用agent可以自动化AI分析
source: https://bbs.kanxue.com/thread-293257.htm
source_host: bbs.kanxue.com
clip_date: 2026-10-17T20:38:01+08:00
trace_id: 2296e709-9876-443c-a59e-f892f5abafe4
content_hash: 54db925b7fa22d35fcda7c4ad625c8a77bc385d7b4357be413515f830798855f
status: synced
tags:
  - 看雪
  - AI辅助逆向
  - 安全工具
series: null
feed_source: 看雪·逆向工程
ai_summary: 为自研调试器 z0bdbg 配了专用 agent，让 AI 自主调用调试接口完成自动化逆向分析，目前效果初测可用。
ai_summary_style: key-points
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 3fc75244-d011-81a1-be34-c7561009afae
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 为自研调试器 z0bdbg 配了专用 agent，让 AI 自主调用调试接口完成自动化逆向分析，目前效果初测可用。
> 
> - **接口规模：** 这个 agent 向模型开放 101 个调试/分析接口，并整理成 101 项 tool list 供模型自主选择调用。
> - **运行方式：** AI 模型自行决定使用哪个工具函数，不再按固定脚本执行，以完成自动化分析流程。
> - **模型兼容：** 当前只在 glm 5.3 上做过试验，其他模型的接入仍在持续补充。
> - **优化状态：** 自动化运行的逻辑、tool list 的覆盖范围以及多模型支持都在继续迭代，作者评价整体效果不错。

最近REA比较火，决定给自己的调试器z0bdbg专门写一个专用agent以下是部分效果，目前支持101个接口以及101个 tool list给AI模型，让它自由选择工具函数去自动分析。目前仅仅试验了glm 5.3 ，其他模型还在不断支持，自动化运行的逻辑还在不断优化。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d62d479fff89c852.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/e07e342145e24b41.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/81fc957b521c0713.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/3a41c956a5645087.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/789fe94b2e5f1661.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/26dfa83a616a06e7.webp)

整体效果还不错还在不断优化支持各种tool list 以及支持更多模型。
