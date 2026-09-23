---
title: 【看雪】Z0BDbg,zerobuftools的调试器cli版本开源
source: https://bbs.kanxue.com/thread-293026.htm
source_host: bbs.kanxue.com
clip_date: 2026-09-23T11:24:20+08:00
trace_id: a3d81061-7bdb-4796-88d3-91e6d0ccbf29
content_hash: 86fdd203188724908a5ffee1803a021e4d9b44f661841c386ba99b579a04675f
status: synced
tags:
  - 看雪
  - 安全工具
  - AI应用
series: null
feed_source: 看雪·逆向工程
ai_summary: Z0BDbg 作者将自研 Windows 调试器做成 CLI 版本并完全开源，支持 WinDbg/OD 风格命令、Python/Lua 脚本与 MCP，可用于对接 AI 构建自动化调试流程。
ai_summary_style: key-points
images_status:
  total: 18
  succeeded: 18
  failed_urls: []
notion_page_id: 3e475244-d011-811b-a056-f05d98767d37
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Z0BDbg 作者将自研 Windows 调试器做成 CLI 版本并完全开源，支持 WinDbg/OD 风格命令、Python/Lua 脚本与 MCP，可用于对接 AI 构建自动化调试流程。
> 
> - **版本与开源：** 新项目 Z0BDbgCli 为命令行版本，包含 Python 脚本自动化与 MCP 相关代码全部开源。
> - **能力范围：** 支持 Win32、x64 调试，兼顾 py/lua 脚本与 mcp；调试速度被作者形容为与 OllyDbg 相当流畅。
> - **命令体系：** 兼容 WinDbg 与 OD 的输入习惯，如 attach/.attach pid 附加进程，db/dw/dq 看内存，bp/bu/bc/hp/mp 管断点，u 反汇编、r 寄存器、k 堆栈、si 单步，help 查参数。
> - **UI 输出：** 命令后追加 `--ui`（例如 `u --ui`）可改用独立窗口展示数据。
> - **自动化与 AI：** 提供 Python 桥接，可直接在命令行带参数运行 py 脚本（如自动化脱壳）；MCP 插件桥接与 server 代码一并开源，便于二次修改并对接 AI 实现全自动 Windows 调试器。

最近又在之前的 [\[原创\]8年前的自己代码继续优化完成模仿od调试器(完成上线了，可以在github下载)](https://bbs.kanxue.com/thread-291906.htm) 设计了cli版本的Z0BDbg调试器，

之前Z0BDbg已经完全可以调试没太大问题，优化后的速度堪比ollydbg一样丝滑，现在支持win32 ， x64 ，py脚本，lua脚本，mcp

[https://github.com/basketwill/Z0BDbg](https://github.com/basketwill/Z0BDbg)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/74f90fa62a204479.webp)

## CLI版开源与命令兼容

现在基于这个版本开发了cli版本，这个cli版本完全开源的，包括支持python脚本自动化以及mcp的代码都开源，当前cli版本支持windbg、od的命令行输入，可以在这代码的基础上开发对接AI 完全自动化的windows调试器

比如

attach 或者.attach pid 附加进程

db dw dq 等等查看内存数据

bp bu bc hp mp 等等断点命令

u 可以显示地址

r 显示寄存器

可以用help查看

开源地址： [https://github.com/basketwill/Z0BDbgCli](https://github.com/basketwill/Z0BDbgCli)

话不多说放图：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4fd9c4514c77a4de.webp)

附加进程：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5f2f909c10f749ac.webp)

显示汇编 u

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/96ec6d07ba51b2f4.webp)

显示堆栈 k

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c5f59dd58d93472e.webp)

寄存器 r

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/199bb6945c6044c1.webp)

单步 si

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/90571fec1db79d45.webp)

## --ui 独立窗口显示

如果想单独窗口 ui显示看下数据可以命令后面加上 --ui，比如 u --ui

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d21f57487d656e88.webp)

看下help的参数

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4c503e292011867e.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/15c551fc0e9366cd.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/cf444ed938fd7eb0.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/441491bf5577a45e.webp)

## Python 桥接与自动化

对python的对接能力，比如自动化脱壳，cli有对python的桥接

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/85e9db792f6ef50e.webp)

我们看一个python的实例

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/888751686aaf333a.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7e16a3430bccda5e.webp)

当我们在命令行输入 调试器直接带参数运行py脚本效果如下

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a831557fd5dfc2ef.webp)

## MCP 桥接与 server 开源

mcp插件桥接以及mcp server代码也放在开源项目里大家可以随意修改升级优化

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ed10c3cfe460ac36.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e6979c43fdf3785b.webp)
