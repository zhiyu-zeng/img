---
title: 【微信】FLARE Learning Hub 出品的 TTD 调试手册
source: https://mp.weixin.qq.com/s/oyhDGMuWJfV5boOz8Fik8w
source_host: mp.weixin.qq.com
clip_date: 2026-11-02T08:31:46+08:00
trace_id: 02875e99-7e0b-4c62-a7c4-74978e1f37c6
content_hash: 2da54346534a0609162559b880d69cea45035a93ccc08700abe3abd0319b0ad0
status: synced
tags:
  - 微信
  - Windows逆向
  - 恶意样本
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: TTD（时间旅行调试）可完整录制进程执行并支持前后回放，Mandiant FLARE 团队据此编写了面向 Windows 恶意软件分析的入门手册，用于加速威胁分类与逆向定位。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 40c75244-d011-81c4-8aab-dd7ca93413a0
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> TTD（时间旅行调试）可完整录制进程执行并支持前后回放，Mandiant FLARE 团队据此编写了面向 Windows 恶意软件分析的入门手册，用于加速威胁分类与逆向定位。
> 
> - **工具来源：** 手册《An Introduction to Time Travel Debugging》由 Google Cloud Mandiant FLARE 团队的 Josh Stroschein 与 Jae Young Kim 编写，面向 Windows 恶意软件分析场景，随文提供云盘下载的中英双语版本。
> 
> - **核心机制：** TTD 是微软随 WinDbg 提供的技术，通过透明层记录进程的完整执行路径与状态，生成可向前、向后回放的 trace 文件，且程序仍可与操作系统完全交互。
> 
> - **回滚优势：** 传统调试只能向前执行，TTD 的"回滚"能力让分析人员可随时间检查程序行为、快速定位恶意事件，显著加快威胁分类（triage）速度；前后逐步执行还有助于理解和绕过反分析与混淆技术。
> 
> - **协作与查询：** trace 文件保留完整执行记录，可分享给同事规避实时调试受环境差异影响的问题；特定执行点可用书签标记并共享。
> 
> - **LINQ 定位事件：** trace 内置调试器数据模型对象，用户可用 LINQ 查询跟踪记录，定位模块加载、shellcode 执行或进程注入等特定事件。

**赛博生存指南** *2026年11月2日 07:59*

https://docs.google.com/document/d/15gbXsTtWyxlUr5bxWO0wvWNHDZqxqh_LEqLanyZpdyw/

云盘下载地址：包含英文原文和wps机翻版本（很拉勉强看看）《2026-11-02 FLARE Learning Hub 出品的 TTD 调试手册》 https://pan.baidu.com/s/12N6d0MSvvYuMYC8XVfzr7Q?pwd=mysc 提取码: mysc

本文是 FLARE Learning Hub 出品的《时间旅行调试入门》（An Introduction to Time Travel Debugging），由 Google Cloud Mandiant FLARE 团队的 Josh Stroschein 与 Jae Young Kim 编写，中英双语排版，是一份面向 Windows 恶意软件分析场景的 TTD 技术教程。

核心概念：什么是 TTD

时间旅行调试（Time Travel Debugging，TTD）是微软随 WinDbg 提供的一项技术，它记录进程的完整执行过程，生成一个可以向前和向后回放的 trace（跟踪）文件。与只能向前执行跟踪的传统调试不同，TTD 的"回滚"能力在恶意软件分析和逆向工程中尤为强大，分析人员可以随时间检查程序行为、快速定位恶意事件，显著加快威胁分类（triage）速度；前后逐步执行的能力也有助于理解和绕过反分析与混淆技术。

TTD 通过一个透明层捕获程序的执行路径与状态，允许程序与操作系统完全交互。trace 文件保留了完整的执行记录，可以分享给同事协作分析，从而规避实时调试受环境差异影响的问题；执行中的特定点还可被书签标记并共享，直接引导同事的分析方向。此外，trace 中内置调试器数据模型对象，用户可用 LINQ 查询跟踪记录，定位模块加载、shellcode 执行或进程注入等特定事件。

工具技巧 · 目录
