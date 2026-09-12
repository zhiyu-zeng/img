---
title: 【看雪】ReArk v1.0.0 全新发布！Android APK/AAB 逆向支持
source: https://bbs.kanxue.com/thread-292931.htm
source_host: bbs.kanxue.com
clip_date: 2026-09-12T11:48:43+08:00
trace_id: cd59032e-a252-4791-8e9f-73e41c5d4c7b
content_hash: 29328326827dc3e17784ccb132e5e03103b53807e41c5bb4e7fae8057ab1f163
status: synced
tags:
  - 看雪
  - Android逆向
  - 安全工具
series: null
feed_source: 看雪·Android安全
ai_summary: |-
  ReArk v1.0.0 在原有鸿蒙逆向能力基础上新增 Android APK/AAB 逆向支持，并首次支持 macOS。
  - **平台扩展：** 新版本加入 macOS 支持，已支持文件类型可关联 HAP、APP、ABC、APK、AAB。
  - **Android 逆向链路：** 支持 Manifest、资源、应用图标、签名、入口点、DEX/模块证据、反汇编与类 Java 反编译分析。
  - **设备控制能力：** 涵盖设备发现、应用安装/启动/卸载、Shell 执行、UI 自动化、截屏、录屏、诊断，以及实时投屏与远程控制（自适应缩放、旋转、全屏、独立窗口、电源控制、系统音频、剪贴板同步、音量静音）。
  - **输入与 Agent：** 支持 PC 键盘直输设备、常用编辑快捷键与剪贴板协同；Agent 提供语义路由、渐进式能力发现、按需证据访问、Android 分析工作流及 Python/宿主命令执行和授权流程。
  - **架构与体验：** 统一 Android 与 HarmonyOS 包体后端，新增 Java/XML 语法高亮、源码导航、签名检查、资源符号化；并修复投屏稳定性、安装签名、Agent 工作流与界面多平台问题。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 3d975244-d011-81f3-99f9-edef9eac0154
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> ReArk v1.0.0 在原有鸿蒙逆向能力基础上新增 Android APK/AAB 逆向支持，并首次支持 macOS。
> - **平台扩展：** 新版本加入 macOS 支持，已支持文件类型可关联 HAP、APP、ABC、APK、AAB。
> - **Android 逆向链路：** 支持 Manifest、资源、应用图标、签名、入口点、DEX/模块证据、反汇编与类 Java 反编译分析。
> - **设备控制能力：** 涵盖设备发现、应用安装/启动/卸载、Shell 执行、UI 自动化、截屏、录屏、诊断，以及实时投屏与远程控制（自适应缩放、旋转、全屏、独立窗口、电源控制、系统音频、剪贴板同步、音量静音）。
> - **输入与 Agent：** 支持 PC 键盘直输设备、常用编辑快捷键与剪贴板协同；Agent 提供语义路由、渐进式能力发现、按需证据访问、Android 分析工作流及 Python/宿主命令执行和授权流程。
> - **架构与体验：** 统一 Android 与 HarmonyOS 包体后端，新增 Java/XML 语法高亮、源码导航、签名检查、资源符号化；并修复投屏稳定性、安装签名、Agent 工作流与界面多平台问题。

![Image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/74c10f869f038762.jpg)

前三个小版本基本完善了鸿蒙逆向，反汇编、反编译、应用信息、实时投屏、交叉引用、智能分析等等功能均已支持。

本版本新增安卓逆向， 大多功能已和鸿蒙功能对齐，正式发布 v1.0.0 版。

发布地址：

https://github.com/lkimuk/ReArk/releases/tag/v1.0.0

本版本新支持 macOS 系统。

新功能

-   新增 Android APK/AAB 逆向支持，并统一 Android 与 HarmonyOS 的包体后端架构。
    
-   新增 Android Manifest、资源、应用图标、签名、入口点、DEX/模块证据、反汇编和类 Java 反编译分析。
    
-   新增 Android 设备发现、应用安装、启动、卸载、Shell 执行、UI 自动化、截屏、录屏和诊断。
    
-   新增 Android 实时投屏和远程控制，支持自适应缩放、旋转、全屏模式、独立窗口、显示电源控制、系统音频、剪贴板同步、音量和静音控制。
    
-   扩展 Android 设备输入能力，支持 PC 键盘直接输入、常用编辑快捷键，以及面向设备输入框的剪贴板协同。
    
-   新增对 HarmonyOS 7.0.0 实时投屏的支持，内置专用的兼容投屏运行时。
    
-   新增 ReArk Agent 语义路由、渐进式能力发现、按需证据访问、Android 分析工作流、Python 与宿主命令执行，以及宿主和设备操作的明确授权流程。
    
-   新增 Java/XML 语法高亮、Android 源码选择、签名检查、资源符号化、应用图标提取和可调节宽度的源码导航。
    
-   新支持 macOS 平台。
    
-   新增已支持文件类型的可选关联：HAP、APP、ABC、APK 和 AAB。
    
-   优化分析工作区、按能力显示分析视图的逻辑、源码导航、包体图标、跨平台快捷键显示和 Agent 消息流。
    

问题修复

-   改进已有实时投屏的稳定性，修复投屏启动与停止、重连、视频解码、录制和多设备资源清理相关问题。
    
-   改进已有安装与签名流程，完善设备授权检查、打包工具诊断、重写包校验和兼容性错误提示。
    
-   修复已有 Agent 工作流中的续接、目标感知路由回退、可选运行时路径、运行时锁和知识服务恢复问题。
    
-   修复已有界面中的独立设备控制、macOS 原生窗口控制、跨平台快捷键格式化、修饰键显示和窗口呈现问题。
    
-   修复已有文件提示和设备运行时状态文本的语言刷新问题。
    
-   加固发布打包、运行时依赖检测、产物校验和可移植性检查流程。
    

一些界面。

智能分析：

反编译：

实时投屏：

更多功能，大家自己探索吧。
