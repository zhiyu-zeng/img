---
title: 【看雪】iOS 免越狱砸壳、调试工具：Unfairplayed 一站式砸壳注入重签名和调试
source: https://bbs.kanxue.com/thread-293520.htm
source_host: bbs.kanxue.com
clip_date: 2026-11-18T13:00:23+08:00
trace_id: 72eb8d83-2f15-4ac8-ace1-83043fb44925
content_hash: 66e230cd39f1bfec79ea7dca286c5d14c210ec48ab6ace100fe3e3ffd58375a2
status: synced
tags:
  - 看雪
  - iOS逆向
  - Frida
series: null
feed_source: 看雪·iOS安全
ai_summary: Unfairplayed 是一款在未越狱 iOS 真机上一站式完成砸壳、dylib 注入、重签名安装和 LLDB/Frida 动态调试的 Mac 桌面工具。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 41c75244-d011-81fd-9310-db43dd512bb6
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Unfairplayed 是一款在未越狱 iOS 真机上一站式完成砸壳、dylib 注入、重签名安装和 LLDB/Frida 动态调试的 Mac 桌面工具。
> 
> - **环境要求：** Apple Silicon Mac + macOS 15+、完整 Xcode、开启开发者模式的 iPhone/iPad；手机系统版本不限（作者真机为 iOS 27.0.1），无需越狱；IPA 须与登录签名的 Apple ID 同一账号。
> - **流程：** 搜索/下载 IPA（接入 ipatool，支持 Apple ID 登录）→ 真机砸壳 → 按需注入 dylib → 重签名安装 → LLDB/Frida 调试；已有 IPA 或已脱壳包可跳步直接进入后续环节。
> - **砸壳原理：** 基于开源项目 FairPlayed，通过 `mremap_encrypted` 让 fairplayd 对加密可执行文件完成解密。
> - **签名与注入：** 支持选 Xcode 开发团队或导入 P12 + 描述文件；重装可复用辅助 App 的 Bundle ID 或指定新 ID 与原 App 并存（记住最近 10 个）；可注入多个自定义 dylib 并搭配 Substrate/libhooker 兼容库，新版模式仅 arm64，旧版含 arm64e（arm64e 兼容待补）。
> - **调试与产物管理：** LLDB 支持 Attach/Launch 且可 USB 或 Wi-Fi 连接，Frida 支持 Attach/Spawn 仅 USB，可指定 Conda 环境或 frida 可执行文件并自动匹配 Gadget 版本；产物统一归档在 `~/Downloads/Unfairplayed-Output/`，日志持续落盘、可恢复未完成任务，还支持砸壳导出后自动重签安装。

**欢迎给我的GitHub留下一个宝贵的star，这对我很有帮助！**

## 项目要求

-   必须要有iOS真机，版本没有限制，无需越狱
-   使用的IPA必须与签名的账号相同。

## 简介

做这个工具的想法很直接：平时分析一个 iOS App，一般需要一台越狱的手机，找 IPA、砸壳，注入动态库，到重签名安装，再接上 LLDB 或 Frida，中间有不少重复操作。

没越狱的手机也能完成，但是流程非常繁琐。因此做了这样一个工具，直接在 **没越狱的手机上** 一条龙完成所有流程。

不用越狱，就可以砸壳、动态调试，中间还能注入动态库。

**项目地址： [github.com/Lynnette177/Unfairplayed](https://github.com/Lynnette177/Unfairplayed)**

## 大概怎么用？

整个流程是这样的：

**搜索应用 → 下载 IPA → 真机砸壳 → 导出 → 按需注入 dylib → 重签名安装 → LLDB / Frida 调试。**

手里已经有 IPA，直接导入就行；已经脱壳的包，可以直接进入注入、重签名和安装这一步。

桌面端用 SwiftUI 写了原生界面。设备、证书、IPA 和调试入口都可以直接选，任务进度和日志也能在界面里看。

## 一站式下载脱壳，聚合了本地IPA

可以按应用名称或 Bundle ID 搜索 App Store，查看图标、版本和开发者。下载接入了 ipatool，Apple ID 登录在终端完成，回到界面就可以选择单独下载，或者下载后接着砸壳。

本地 IPA 按「已下载」和「已脱壳」分开展示，带图标、版本、包名和文件大小。之前处理过的包，下次从列表里选就行，支持搜索、拖入和批量添加。

![本地 IPA 列表](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ddb009fe0d2c8b8a.jpg)

## 签名、Bundle ID、导入证书的快速管理

签名支持两种方式：直接选 Xcode 里的开发团队，或者导入自己的 P12 和描述文件。手里有多套证书也可以一起导入，在下拉框里切换，界面会根据设备和有效期显示可用选项。

辅助 App 使用固定的 Bundle ID。脱壳后重新安装时，可以复用辅助 App 的 ID，也可以指定另外一个 ID，让安装副本和原 App 并存。

用过的 ID 会记住最近 10 个，下次直接选。需要新的 ID，也有集成的新建入口。复用 ID 安装时，会替换手机上对应 ID 的应用。

首次运行遇到证书需要信任，界面会给出操作指引，信任后直接重试启动。砸壳完成后，也会询问要不要卸载辅助 App。

## 砸完壳 注入dylib

在重新签名安装之前，可以添加多个自定义 dylib，并按需加入 Substrate / libhooker 兼容库。处理顺序就是： **脱壳、注入、签名、安装**，原始 IPA 和选中的 dylib 文件会保留原样。

内置 Hook 库提供两种兼容模式：新版模式只保留 arm64，旧版模式保留 arm64 和 arm64e。因为还没做新版本对arm64e的兼容，或许后续会补上。

![自定义动态库注入](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c3095b360e073301.jpg)

## 安装后用LLDB 或 Frida开始免越狱的动态调试

调试有单独的页面，可以选择这两种调试工具。

LLDB 支持 **Attach / Launch**。App 已经在运行时，Attach 会直接附加现有进程，保留当前 PID；想从启动阶段开始看，就选择 Launch。

Frida 支持 **Attach / Spawn**，也可以自己选择本机环境、Conda 环境或指定 frida 可执行文件。默认优先用 Conda base，匹配版本的 Gadget 会自动准备。

连接方式上， **LLDB 支持 USB 和 Wi-Fi，Frida 使用 USB**。把手机插上数据线，选择模式，点开对应调试器就能进入终端会话。

![LLDB 与 Frida 调试页面](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/59ea34902c5328e1.jpg)

## 日志和产物也整理好了

所有产物统一放在：

```
~/Downloads/Unfairplayed-Output/
```

下载的 IPA、脱壳结果、重签名安装包、调试会话和日志各自归档。任务运行时，完整日志会持续写入磁盘，过程中就能另存；重新打开工具，也可以恢复未完成任务的日志，方便接着分析。

还可以勾选「砸壳导出后自动重新安装」，把签名、注入和调试版安装接在导出之后，减少来回操作。

## 怎么上手？

准备一台 **Apple Silicon Mac，macOS 15 或更新版本，完整 Xcode，以及开启开发者模式的 iPhone / iPad**。砸壳时，手机登录拥有目标应用许可的 Apple ID；签名可以用 Xcode 开发团队，也可以导入自己的证书和描述文件。动态调试使用带 `get-task-allow` 权限的开发描述文件。

手机系统版本没有限制，我使用的真机是 **iOS 27.0.1**。

### 直接安装

从GitHub Release下载安装即可。

### 从源码构建

仓库里有中英文 README、界面截图和详细使用步骤，下载源码后可以直接构建安装：

```bash
./build_desktop.sh --install
open "$HOME/Applications/Unfairplayed.app"
```

## 工作原理

免越狱砸壳核心来自 [FairPlayed](https://github.com/morzelowski/FairPlayed) ，通过 `mremap_encrypted` 让fairplayd对加密的可执行文件解密。

平时有 iOS 逆向、动态调试需求的朋友，可以拿来试试。用着顺手的话欢迎点个 Star，有想加的功能也欢迎来提 Issue，一起把这套流程做得更顺手。

**GitHub： [Lynnette177/Unfairplayed](https://github.com/Lynnette177/Unfairplayed)**

[#逆向分析](https://bbs.kanxue.com/forum-166-1-189.htm) [#程序开发](https://bbs.kanxue.com/forum-166-1-191.htm) [#HOOK注入](https://bbs.kanxue.com/forum-166-1-192.htm) [#工具脚本](https://bbs.kanxue.com/forum-166-1-195.htm)

## 附件

- [debugging.jpg](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/attach/2026/11/a8cbae20abeaf1bc.jpg) （456.25kb，3次下载）
- [injection.jpg](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/attach/2026/11/c629e7ad98745439.jpg) （513.54kb，0次下载）
- [library.jpg](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/attach/2026/11/b005f01d023530d0.jpg) （452.41kb，0次下载）
- [signing.jpg](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/attach/2026/11/ea26c58df144cf53.jpg) （529.25kb，0次下载）
