---
title: 【看雪】R8 DEX Guard
source: https://bbs.kanxue.com/thread-292915.htm
source_host: bbs.kanxue.com
clip_date: 2026-09-11T13:32:08+08:00
trace_id: 558ecba9-bd38-453f-b557-4ab3cf78e4ac
content_hash: 50638618037ba9dba2991cf9248cc9f250b939e7938562ed11cf417fb7f482f0
status: synced
tags:
  - 看雪
  - 脱壳与加固
  - Android逆向
series: null
feed_source: 看雪·Android安全
ai_summary: R8 DEX Guard 2.0 是面向 DEX 的代码混淆工具，核心混淆独立生效，另有部分能力须配合 DEX 优化才能起效。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3d875244-d011-8133-a917-f4db9db51a46
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> R8 DEX Guard 2.0 是面向 DEX 的代码混淆工具，核心混淆独立生效，另有部分能力须配合 DEX 优化才能起效。
> 
> - **核心混淆（独立生效）：** 控制流平坦化与符号混淆均为五星强度，前者打乱控制流结构，后者重命名类/方法/字段去除可读性；逻辑混淆四星（插入等价逻辑变换）；全局状态耦合三星（把方法状态耦合到全局以抬高分析成本）。
> - **需配合 DEX 优化生效：** 花指令、扁平化 2.0、数字混淆、指令替换，四项均在优化阶段起作用。
> - **基础选项：** 去除调试信息、加密资源 ID、只读取规则内类、不处理接口类、字符串加密、DEX 优化。
> - **隐身保护：** 提供合并开关（五星），并含插入虚假分支、字符串多层加密两项。
> - **获取方式：** 通过其 GitHub 仓库的 releases 页面发布。

DEX Guard2.0

核心混淆（独立生效）

选项 强度 说明

控制流平坦化 ★★★★★ 打乱控制流结构，显著提升逆向难度

符号混淆 ★★★★★ 重命名类、方法、字段，去除可读性

逻辑混淆 ★★★★☆ 插入等价逻辑变换

全局状态耦合 ★★★☆☆ 将方法状态耦合至全局，增加分析成本

需配合 DEX 优化生效

· 花指令（优化时）

· 扁平化 2.0（优化时）

· 数字混淆（优化时）

· 指令替换（优化时）

基础选项

· 去除调试信息

· 加密资源 ID

· 只读取规则内类

· 不处理接口类

· 字符串加密

· DEX 优化

隐身保护

· 隐身保护（合并开关）★★★★★

· 插入虚假分支

· 字符串多层加密

[R8 DEX Guard](https://github.com/cvbzzz/R8-DEX-Guard/releases)
