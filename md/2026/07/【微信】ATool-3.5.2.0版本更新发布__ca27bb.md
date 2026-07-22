---
title: 【微信】ATool 3.5.2.0版本更新发布
source: https://mp.weixin.qq.com/s/NdE6AONzcaJzFIgcqEeoUg
source_host: mp.weixin.qq.com
clip_date: 2026-07-22T16:31:59+08:00
trace_id: dc5c8f45-78ac-488d-9ce6-fd4c1d4bf5ca
content_hash: 023ce9fe78d90321e42e5697806f3d08efce299b99fefd352480d4f1ceb98809
status: summarized
tags:
  - 微信
  - 安全工具
  - AI应用
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: "TL;DR: ATool 发布 3.5.2.0 版本，新增 MCP 管理以联动智能体，改进进程树视图和数据导出功能，提升系统安全分析效率。"
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 3a575244-d011-81fe-8060-f0f2a739ff1a
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> TL;DR: ATool 发布 3.5.2.0 版本，新增 MCP 管理以联动智能体，改进进程树视图和数据导出功能，提升系统安全分析效率。
> 
> - **MCP管理：** 新增本地管理界面，支持与智能体（如 AVL Code）交互，包括身份验证连接、任务管理和系统快照读取。
> - **进程与启动项改进：** 引入进程树和启动项树视图，补全进程详细信息如发行商、描述、基址等，默认通过内核接口获取数据。
> - **数据导出优化：** 支持导出为 JSON、JSON Lines 和 CSV 格式，增加进度显示、终止处理和错误修复。

**安天垂直响应平台** *2026年7月22日 16:10*

系统安全分析与反 Rootkit 工具 ATool 更新至 3.5.2.0 版本，建议各位用户 访问 尽快下载使用新版本，以获取新功能与优化内容。

软件名称： ATool

版本号： 3.5.2.0

更新时间： 2026-07-21 08:36:00

本次更新主要内容：

1.**【添加】 MCP 管理，实现与智能体联动**

\- 现在您可以让 AVL Code 与 ATool 进行交互了！

\- 新增本地 MCP 管理和监控界面。

\- 支持经过身份验证的本地连接、任务管理、结果查询及系统快照读取。

2.**【改进】进程与启动项**

\- 新增进程树、启动项树及列表视图，层级关系和项目状态更直观。

\- 补全进程发行商、描述、修改时间、文件大小、 EPROCESS 、 PEB 、基址、 CPU 、用户名和命令行等信息。

\- 进程、模块、线程和句柄默认通过内核接口获取，提高受保护对象的识别能力。

3.**【优化】文件管理**

\- 重构文件管理界面，改善大目录浏览、文件选择和窗口缩放体验。

\- 增强文件属性、数字签名、信誉分析、定位及批量处理功能 。

4.**【改进】数据导出**

\- 支持导出当前类别或全部类别，并新增 JSON 、 JSON Lines 和 CSV 格式。

\- 增加导出进度、终止处理和已完成数据保留机制。

\- 修复 “ 导出全部 ” 崩溃、虚拟 Idle 进程导致四个类别误报失败等问题。

5.**【优化】分析与钩子检查**

\- 优化数字签名、信誉分析、 MD5 和可信验证的进度显示及取消响应。

\- 修复程序钩子反汇编、 Ring3 Hook 和内核 Hook 显示及修复相关问题。

\- 完善进程、端口、计划任务、服务、驱动等页面的数据展示。

6.**【改进】界面与稳定性**

\- 优化最大化及高分辨率布局，减少多余滚动条。

\- 改善长时间枚举、批量分析和导出时的界面响应。

\- 修复多项空白字段、异常弹窗、内存访问错误和资源加载问题。

检查更新或下载 欢迎 ） 。如在使用过程中有问题或建议，欢迎前往安天论坛交流反馈： [https://bbs.antiy.cn/forum.php?mod=forumdisplay&fid=24](https://bbs.antiy.cn/forum.php?mod=forumdisplay&fid=24) 。

用微信扫一扫，加入【安天免费工具用户交流群】，获取工具动态、提交反馈。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/7ae2f049e07db9ef.png)

安天免费工具用户交流群二维码
