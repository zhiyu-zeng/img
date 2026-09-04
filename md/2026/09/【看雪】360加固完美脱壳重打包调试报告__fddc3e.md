---
title: 【看雪】360加固完美脱壳重打包调试报告
source: https://bbs.kanxue.com/thread-292864.htm
source_host: bbs.kanxue.com
clip_date: 2026-09-04T18:23:27+08:00
trace_id: ee2d3fb2-5828-470f-9a5a-468732c5f378
content_hash: d1db4377f49c01e9f824a49a6801e881d8ecd2ac512d1f527415651e39dce767
status: synced
tags:
  - 看雪
  - Android逆向
  - 脱壳与加固
series: null
feed_source: 看雪·Android安全
ai_summary: 360加固APK脱壳重打包并去除广告、修复兼容性后，需确保题库导入及四个搜题功能在新设备上正常可用。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3d175244-d011-81fc-ae98-df3e1ef82eb4
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 360加固APK脱壳重打包并去除广告、修复兼容性后，需确保题库导入及四个搜题功能在新设备上正常可用。
> 
> - **加固对象：** 对 360 加固的 APK 脱壳，提取真实 Dex 代码并重打包重签名，生成可安装 APK。
> - **功能改造：** 去除开屏广告、Banner 等所有应用内广告；保留题库导入及扫描/智能/录屏/便捷四个搜题功能。
> - **适配目标：** 解决华为 P30（鸿蒙 4.0）闪退、微信 SDK 崩溃及存储权限申请问题，要求权限自动申请并在授权后即时生效。
> - **验收标准：** 用 285 题的题库文件导入不报错，"我的下载"可见题库；四个搜题功能均能调用导入题库。
> - **附加验证：** 华为 P30（鸿蒙 4.0）无闪退，应用无广告展示。

核心目标

对 360 加固的 APK 进行脱壳，提取真实的 Dex 代码

重打包并重新签名，生成可安装的 APK

去除应用内所有广告（开屏广告、Banner 广告等）

保证核心功能可用：题库导入、四个搜题功能（扫描/智能/录屏/便捷）

解决兼容性问题：华为 P30（鸿蒙 4.0）闪退、微信 SDK 崩溃、存储权限申请等

优化用户体验：存储权限自动申请、授权后即时生效

验收标准

用"信息安规最新版题库.xlsx"（285 题）导入成功、不报错

主界面"我的下载"中能看到导入的题库

四个搜题功能（扫描搜题、智能搜题、录屏搜题、便捷搜题）点击后能看到用户导入的题库

华为 P30（鸿蒙 4.0）上不闪退

无广告展示

[#逆向分析](https://bbs.kanxue.com/forum-161-1-118.htm) [#NDK分析](https://bbs.kanxue.com/forum-161-1-119.htm) [#协议分析](https://bbs.kanxue.com/forum-161-1-120.htm) [#混淆加固](https://bbs.kanxue.com/forum-161-1-121.htm) [#脱壳反混淆](https://bbs.kanxue.com/forum-161-1-122.htm) [#HOOK注入](https://bbs.kanxue.com/forum-161-1-125.htm) [#工具脚本](https://bbs.kanxue.com/forum-161-1-128.htm)

## 附件

- [360加固完美脱壳重打包调试报告.pdf](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/attach/2026/09/ef3465d5b158b474.pdf) （573.73kb，2次下载）
