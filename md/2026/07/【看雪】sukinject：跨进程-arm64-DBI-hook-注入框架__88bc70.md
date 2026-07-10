---
title: 【看雪】sukinject：跨进程 arm64 DBI hook / 注入框架
source: https://bbs.kanxue.com/thread-291947.htm
source_host: bbs.kanxue.com
clip_date: 2026-07-10T11:46:00+08:00
trace_id: 72c09a4e-56b8-44a9-9783-22ebc58ed0c2
content_hash: 7f4cffb596226ec6eb9fe09dae2ec17a759e701c921513df133c9dd394c77c90
status: summarized
tags:
  - 看雪
series: null
feed_source: 看雪·Android安全
ai_summary: sukinject 是一个内核辅助的跨进程 arm64 动态二进制插桩框架，通过 PTE 翻转和 kprobe 实现无痕 hook，适用于 Linux 和 Android。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 39975244-d011-8139-88fd-edea3285e098
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> sukinject 是一个内核辅助的跨进程 arm64 动态二进制插桩框架，通过 PTE 翻转和 kprobe 实现无痕 hook，适用于 Linux 和 Android。
> 
> - **核心区别：** 区别于同进程 inline hook 工具（如 Dobby），sukinject 实现跨进程、内核辅助的 hook，利用地址空间隔离机制，不直接修改目标进程代码段。
> - **技术原理：** 通过 PTE 翻转 UXN 触发 instruction fault，使用 kprobe 将 PC 重定向到 ghost 页或重编译页，原始代码页字节尽量保持不变，以增强隐蔽性。
> - **Hook 方法：** 提供四种 hook 路径：DBI 整页重编译（默认主线）、指针换槽、硬件执行断点（HW-BP）和实验性的 PFN-swap，分别适用于不同场景和需求。
> - **依赖条件：** 需要 root 权限和加载匹配的内核模块（suk_step4.ko），且主要支持 AArch64 架构，不完整支持动态链接或 TLS 等复杂语义。
> - **使用方式：** 提供 C API（如 SukInjectHook 函数）和 CLI 工具（sukctl 和 sukagentctl），支持符号解析、hook 安装、agent 加载及 origin 回调管理。

看了网上很多关于 arm64 无痕 hook 的方法，然后自己理解下加上 ai 帮忙

整理并开源了一个自己在用的 Linux / Android arm64 跨进程 hook 框架：sukinject

仓库：https://github.com/PPKunOfficial/sukinject

\### 它是什么

sukinject 做的是跨进程、内核辅助的 hook，不是同进程 inline hook。

公开语义很简单：

\`\`\`text

target -> replacement -> origin

\`\`\`

\- target：目标进程里的函数地址

\- replacement：也在目标进程地址空间里的代码（内核生成的 ABI wrapper / 已有 VA / agent 装进去的代码）

\- origin：目标进程里可回调原函数的 trampoline（ghost 页入口）

调用方进程里的普通 C 函数指针，不能直接当 replacement——地址空间隔离决定了这一点。

和 Dobby 那类同进程 inline hook 是不同模型，不追求 Dobby 兼容。需要同进程改字节插跳的，继续用 Dobby 即可。

\### 技术路线（简要）

依赖 root + 匹配内核的 kmod（/proc/sukinject）。

大致思路：

1\. 目标代码页通过 PTE 翻转 UXN，执行会 instruction fault

2\. kprobe 挂在 fault 路径上，把 PC 重定向到 ghost / 重编译页

3\. 原始页字节尽量不改；执行走 shadow，读路径仍可对准原页（隐蔽性谱系更接近 wxshadow / 整页 DBI 那条线，而不是改.text 插 B）

能力边界也说清楚：

\- 主线 AArch64；compat32 会 fail closed

\- 需要自己能加载 suk_step4.ko（内核版本/树要对上）

\- 不是完整动态链接器，也不是「任意 C++ / TLS / 完整 so 语义」运行时

\- agent 路径支持受限 ELF / package 装进目标再绑入口，不是 ptrace+dlopen 主线

\### 2. 四条 hook 路径

┌───┬────────────────────────────┬───────────┬──────────────────────────────────────────────────────┬────────────────────────────────┐

│ # │ 路径 │ kmod 命令 │ 核心做法 │ 代价/限制 │

├───┼────────────────────────────┼───────────┼──────────────────────────────────────────────────────┼────────────────────────────────┤

│ 1 │ DBI 整页重编译（默认主线） │ dbi-hook │ UXN + fault 改 PC → ghost 重编译页；原页字节尽量不动 │ 复杂页/热页可能踩坑；有 origin │

├───┼────────────────────────────┼───────────┼──────────────────────────────────────────────────────┼────────────────────────────────┤

│ 2 │ 指针换槽 │ ptr-hook │ 只改 8B 槽，不改.text │ 只覆盖「过指针」调用 │

├───┼────────────────────────────┼───────────┼──────────────────────────────────────────────────────┼────────────────────────────────┤

│ 3 │ HW-BP persistent │ bp-hook │ 硬件执行断点，命中改 pc；可 origin island │ 每 hit 进内核；槽位少 │

├───┼────────────────────────────┼───────────┼──────────────────────────────────────────────────────┼────────────────────────────────┤

│ 4 │ PFN-swap │ pfn-hook │ 页帧/执行视图交换（实验） │ 非默认；隐蔽模型与 DBI 不同 │

└───┴────────────────────────────┴───────────┴──────────────────────────────────────────────────────┴────────────────────────────────┘

安装窗口还有 break-arm（oneshot 断点汇合）、task-hold、fork-watch 等，用来卡安装时机，本身不是第 3 条长期 hook。

主路径：业务上优先 DBI +（可选）agent 装载；能指针化的用 ptr；低频零改字节再考虑 bp-hook；pfn 当实验后端。

\### 你能直接用的东西

┌──────────────────────────────────────┬───────────────────────────────────────────────┐

│ 组件 │ 用途 │

├──────────────────────────────────────┼───────────────────────────────────────────────┤

│ include/sukinject.h + libsukinject.a │ C API：SukInjectHook / Unhook 等 │

├──────────────────────────────────────┼───────────────────────────────────────────────┤

│ sukctl │ resolve、dbi-hook、status、hold/break/fork 等 │

├──────────────────────────────────────┼───────────────────────────────────────────────┤

│ sukagentctl │ hook-elf：装 agent + 入口替换（可带 origin） │

├──────────────────────────────────────┼───────────────────────────────────────────────┤

│ 文档 │ docs/public-interfaces.md 起总览 │

└──────────────────────────────────────┴───────────────────────────────────────────────┘

最小库用法示意：

\`\`\`c

SukInjectOptions opt = SukInjectOptionsDefault();

opt.abi = "int-origin-add:7";

SukInjectRequest req = {0};

void \*origin = NULL;

req.pid = pid;

req.target = target_va_in_remote; /\* 目标进程 VA \*/

req.origin = &origin;

req.options = opt;

SukInjectInstallResult result;

char reason\[256\];

SukInjectHook(&req, &result, reason, sizeof(reason));

/\* origin 是目标进程内 VA，本进程不能当函数指针调用 \*/

\`\`\`

CLI 示例：

\`\`\`sh

\# 解析符号

sukctl --allow -p $PID --module libfoo.so --symbol bar resolve

\# 生成式 wrapper：调 origin 后整数返回值 +7

sukctl --allow -p $PID --module libfoo.so --symbol bar --origin-add 7 dbi-hook

\# agent 入口替换

sukagentctl hook-elf -p $PID \\

\--module token_cli --target-symbol validate_token \\

\--elf./token_agent.so --agent-symbol force_pass_token \\

\--preflight --stop --resume

\`\`\`

更完整的说明见仓库文档：

\- 接口总览：docs/public-interfaces.md

\- 库：docs/library-guide.md

\- Agent：docs/agent-guide.md

\- CLI / proc：docs/cli-reference.md、docs/proc-interface.md
