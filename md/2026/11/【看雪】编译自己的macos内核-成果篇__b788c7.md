---
title: 【看雪】编译自己的macos内核-成果篇
source: https://bbs.kanxue.com/thread-293570.htm
source_host: bbs.kanxue.com
clip_date: 2026-11-19T08:57:18+08:00
trace_id: 939973e9-f8b6-4880-8450-779efdec5603
content_hash: 9fcb157b8ac03488c0e93e4cf0e945dc2d740261ef5585ca8250689b07d26de9
status: synced
tags:
  - 看雪
series: null
feed_source: 看雪·逆向工程
ai_summary: null
ai_summary_style: null
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 41d75244-d011-8129-8f0a-f3258ee45387
ioc: null
---

## 背景

macOS 是一款优秀的操作系统，很多 iOS/Macos 开发者对于操作系统的知识仅限于资料上的纸上谈兵，如何和macos内核源代码进行深入交互是一件困难和及其有挑战的事情，好在我有幸完成了这一工作，拥有了自己的macOS！

## 成果展示

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/bebea31582fe42e3.bin) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/aa3680644cd4f27b.png)

从图中可以看到我们在macos 根本无法修改的 /System/Library/CoreServices/boot.efi、/System/Library/KernelCollections/BootKernelExtensions.kc 已经被我修改为我自己编译的版本并成功运行在自定义内核上

### 项目完成情况

下面列出了目前已经实现的成果和下一步需要完成的工作。为避免误解，Apple 原版 macOS 的真机安装与自定义内核的真机安装分别列出。

| 状态  | 事项  | 说明  |
| --- | --- | --- |
| ✅   | 编译 macOS 11.4 的自定义 `boot.efi` | 已完成系统启动程序的编译、修改与调试。 |
| ✅   | 编译 macOS 11.4 的自定义 XNU 内核 | 已基于 macOS 11.4 对应的 XNU 源代码完成编译与调试。 |
| ✅   | 生成自定义内核缓存 | 已将自定义 XNU 内核及相关系统组件打包为 macOS 启动所需的内核缓存。 |
| ✅   | 修复自定义内核的启动问题 | 已解决多个导致系统无法继续启动的底层兼容性和数据校验问题。 |
| ✅   | 构建并配置 OpenCore 启动环境 | 已完成引导配置，使虚拟机能够加载自定义启动程序和内核。 |
| ✅   | 使用自定义启动程序和内核启动 macOS 11.4 | 已在虚拟机中成功启动系统并进入 macOS 桌面。 |
| ✅   | 制作包含自定义内核的 macOS 11.4 安装镜像 | 已将自定义启动程序、内核和内核缓存集成到安装镜像中。 |
| ✅   | 使用自定义安装镜像完成系统安装 | 已完成从安装镜像启动、磁盘安装到首次开机设置的完整流程。 |
| ✅   | 完成首次开机设置并进入桌面 | 已成功创建用户，并正常打开 Finder、Safari 等系统应用。 |
| ✅   | 验证安装后的自定义系统文件 | 已确认系统实际使用的启动程序和内核缓存与自定义编译结果一致。 |
| ✅   | 进入 macOS 恢复环境 | 已在虚拟机中成功启动 macOS 恢复环境。 |
| ✅   | 将 Apple 原版 macOS 11.4 安装到 Mac 真机 | 已在一台 2013 年末的 13 英寸 MacBook Pro 上完成原版系统安装并进入桌面；这不代表自定义内核已经在真机上运行。 |
| ❌   | 在 Mac 笔记本真机上安装并运行自定义内核 | 目前自定义启动程序和自定义内核只在虚拟机中完成验证，尚未在 Mac 真机上完成安装和启动。 |
| ❌   | 在 Windows PC 真机上安装并运行自定义 macOS | 尚未针对 PC 的处理器、显卡、主板、存储等硬件完成适配和安装验证。 |
| ❌   | 完成自定义系统的真机硬件驱动适配 | 显卡、声音、网络、USB、电源管理及睡眠唤醒等功能仍需在目标硬件上逐项验证。 |
| ❌   | 完成不同型号电脑的兼容性测试 | 尚未在多款 Mac 和 Windows PC 上进行完整的安装与稳定性测试。 |
