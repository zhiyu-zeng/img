---
title: 【先知】AI逆向：基于Qoder与自研MCP实现VMP壳自动化脱壳
source: https://xz.aliyun.com/news/92856
source_host: xz.aliyun.com
clip_date: 2026-09-20T17:42:16+08:00
trace_id: 69b5d3b3-07e6-4033-8d4b-4f75245e65f5
content_hash: 61e457fd04632c228211eeaad38d3f9db2b72f49428ae07cc929e5bce77946c6
status: synced
tags:
  - 先知
  - AI辅助逆向
  - 脱壳与加固
series: null
feed_source: 先知安全技术社区
ai_summary: Qoder 当 AI 控制台，配合自研 vm-mcp/od-mcp 连接器与 od-find-oep 技能，可自动完成 UPX 及 VMP2.x/VMP3.x（仅开内存保护）壳的脱壳并定位 OEP。
ai_summary_style: key-points
images_status:
  total: 25
  succeeded: 25
  failed_urls: []
notion_page_id: 3e175244-d011-81b2-a4c4-efaa1a49b647
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Qoder 当 AI 控制台，配合自研 vm-mcp/od-mcp 连接器与 od-find-oep 技能，可自动完成 UPX 及 VMP2.x/VMP3.x（仅开内存保护）壳的脱壳并定位 OEP。
> 
> - **环境架构：** 联网宿主机部署 Qoder 工作台负责与模型交互并调度工具，断网虚拟机存放样本与调试器避免恶意外联；vm-mcp 负责远程执行程序、读写文件，od-mcp 负责操控 OllyDbg 脱壳。
> - **工具选型：** 实测 x64dbg 在 VMP 内存保护/调试器检测场景下异常，OD 同配置正常；现成 ollydbg-mcp 不支持按 API 名下断、其 olly_run 基于 OD 脚本会被 VMP 检测，故基于其源码二次开发 od-mcp（mcpbridge.dll 插件 + server.py）。
> - **VMP 取巧策略：** 在 CRT 初始化 API 下断再回溯调用链——MSVC 断 `GetSystemTimeAsFileTime`（`__security_init_cookie` 内），MinGW-w64 断 `SetUnhandledExceptionFilter`（`__mingw_CRTStartup` 内）；首个乃至前几个命中多来自壳运行时（计时、解密种子），须按返回地址的节归属校验，壳内命中直接放行续跑。
> - **反检测要点：** VMP 完整性校验会还原 INT3，表现为断点不触发或异常退出，此时删除软件断点改用 DR0–DR3 硬件断点（仅 4 个名额、每个 ≤4 字节），下完用 `od_list_hwbreakpoints` 确认。
> - **技能与交付：** SKILL 必须先人工跑通再交给 AI；实测 UPX、MSVC 与 MinGW-w64 构建的 remcos/nc.exe 均可成功脱壳，定位到 OEP 即为终点，不主动 dump 或重建导入表。

## 概述

大家好，我是T0daySeeker。

有一段时间没更新了，其实一直在憋个大活。这段时间AI发展太快，能玩的东西实在太多，笔者决定第一时间把AI拽进自己的老本行里蹚一趟，看看它到底能把逆向这件事推进到什么程度，于是有了这一篇。

本期算是AI逆向系列的开篇，先拿脱壳练手。整体思路用一句话概括，Qoder当AI控制台，配上自研的MCP服务操控断网虚拟机，再加一个自定义SKILL，拿UPX、VMP两类壳实测验证。先剧透一下结果，连公认的硬骨头VMP壳，AI也啃下来了，具体怎么做到的，往下看。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/58eaf11fb8ac4d6c.png)

## 构建AI逆向环境

笔者在网络中看了很多关于逆向的MCP、SKILL，发现其使用场景基本都是本机分析，和自己常用的逆向分析场景对不上。

因此，笔者琢磨了一套符合自己逆向分析场景的AI逆向环境：

-   联网宿主机：部署Qoder工作台，负责和AI模型交互、调度虚拟机中的MCP工具；
-   断网虚拟机：样本和调试器都丢在里面，避免木马触发恶意外联；
-   vm-mcp：让AI能远程控制虚拟机，执行程序、操作文件等；
-   od-mcp：让AI能直接操控OllyDbg，执行脱壳等操作。

## Qoder工作台

为了实现对虚拟机的远程操控，笔者选用了阿里的Qoder工作台（ `https://qoder.cn/` ）。

与千问办公相比，Qoder工作台提供的模型要更丰富一些，除了官方Qwen3.8、Qwen3.7模型外，还内置了Kimi K3、GLM-5.3、DeepSeek-v4-pro等模型。

### 技能

Qoder中的技能可通过工作台创建或者自行上传。

在实际使用过程中，笔者认为简单的技能可以通过工作台辅助构建，但与实际业务相关的技能，最好还是先自行构建好框架，然后AI优化。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/eda7ff399648b6a2.png)

### 连接器

Qoder中配置连接器的窗口比较清爽，直接按照提示添加即可。

配置成功后，Qoder工作台后台会自行刷新工具集。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b28d811adee9978e.png)

## MCP：vm-mcp

为了实现对虚拟机的控制，笔者调研了多个适用于Windows平台的MCP服务，但在实际使用过程中却遇到了或多或少的问题。

-   winremote-mcp

-   项目地址： `https://github.com/dddabtc/winremote-mcp`
-   优势：支持远程桌面控制和自动化
-   问题：不支持启动程序工具，启动程序只能通过AI打开cmd执行

-   openssh server windows

-   部署：windows主机中添加openssh服务器即可
-   优势：复用成熟SSH安全体系，不用额外部署
-   问题：配置麻烦，笔者测试时感觉通信不是很稳定

基于上述问题，于是，笔者就干脆自己动手用AI辅助开发了一套vm-mcp服务。

### 构建思路

有了AI，像这种小脚本，直接甩给AI即可。

所以，笔者在这里只是同步一下构建思路：

-   使用FastMCP，构建一套虚拟机Agent服务，通过Streamable HTTP传输对外暴露工具集，供宿主机上的MCP客户端（Qoder / WorkBuddy / Claude等任何支持HTTP MCP的客户端）远程调用。

工具集要求如下：

|     |     |     |
| --- | --- | --- |  
| 工具  | 功能  | 关键参数 |
| `upload_file` | 上传文件到虚拟机 | `path` (绝对路径), `content_b64` (base64 内容), `overwrite` |
| `download_file` | 读取虚拟机文件返回 base64 | `path` (绝对路径) |
| `delete_file` | 删除文件 | `path` (绝对路径) |
| `list_files` | 列出目录内容 | `path` (目录绝对路径) |
| `search_files` | 目录下递归按通配符搜索文件名 | `root` (搜索根), `pattern` (glob, 默认 `*`), `limit` (默认100, 上限1000) |
| `execute_program` | 执行命令 | `command`, `args` (列表), `cwd`, `timeout` (默认30s, 上限600s), `background` (true=立即返回PID, 输出写日志) |
| `terminate_process` | 按 PID 或进程名终止进程 | `pid` 与 `name` 二选一 |
| `list_process` | 列出进程，支持关键字过滤 | `name` (过滤关键字), `limit` (默认100, 上限1000) |

安全机制上，写入类操作（upload/delete/download）的路径必须为绝对路径，且位于允许的根目录内。

### 配置 MCP

成功构建后的项目内容如下：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/dd8434aec022f6e2.png)

虚拟机中，成功运行后的mcp服务截图如下：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3661995fe8a36c13.png)

宿主机中，Qoder工作台成功连接后的截图如下：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/cb1a9a1c6a72ad61.png)

## MCP：od-mcp

为了实现AI脱壳，笔者最开始使用的是x64dbg，毕竟网络中x64dbg的mcp服务更多一些。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b736cfae73e09b17.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/322e671ef5f8acfb.png)

在实际测试过程中，笔者发现，使用AI操作x64dbg脱壳样本时，简单的UPX壳是没问题的，但遇到像开启内存保护、调试器检测的VMP壳时，x64dbg会出现一些意想不到的异常。

针对上述问题，笔者尝试找了不少资料，同时还使用OD调试器进行了对比，对比发现，相同配置下的OD调试器是可以正常AI脱壳的，所以，笔者判断，可能是x64dbg调试器本身的问题，只能暂时转战OD。

进一步尝试过程中，笔者又发现，网络中的ollydbg-mcp工具虽然能用，但在某些脱壳场景下，却会出现使用不方便的问题：

-   不支持API断点：ollydbg-mcp仅支持按地址下断点，不支持按API函数名下断点，导致在下断点过程中，AI会花费大量时间获取API函数地址；
-   触发olly_run工具会被VMP壳检测： `olly_run` 功能是基于OD脚本实现的，会被VMP壳的内存保护机制检测；

好吧，那我们还是自己来构建od-mcp服务吧。

### 构建思路

借助AI能力，想构建符合我们心意的od-mcp服务，肯定要比以前简单多了。

笔者的构建思路就是让AI结合实际分析过程中遇到的问题，基于ollydbg-mcp源码进行二次升级。

成功构建后的项目运行逻辑与ollydbg-mcp工具运行逻辑差不多，也是分为两部分：

-   mcpbridge.dll插件
-   server.py服务

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/13d5073caabfbcdb.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/08e46e7f14d2b680.png)

### 配置 MCP

虚拟机中，OD插件截图如下：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/032888b76674b736.png)

虚拟机中，成功运行后的mcp服务截图如下：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/329147c0fa2ba996.png)

宿主机中，Qoder工作台成功连接后的截图如下：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d8616271bb4208bd.png)

## SKILL：find-oep

成功构建MCP连接器后，接下来就是想办法让AI按照我们的思路进行AI脱壳。

### 构建思路

为了能够让AI尽可能按照我们设想的逻辑执行，写好SKILL至关重要。

如何验证自己的SKILL能否按照自己设想的逻辑执行，笔者最大的感受就是一定要自己先手动跑通逻辑。如果自己都无法按照SKILL逻辑复现操作，那要让AI复现，可能要么需要花费AI大量的思考成本，要么就无法执行成功。

在这里，为了实现AI脱壳效果，笔者基于网络中x64dbg调试器的（ `https://github.com/dariushoule/x64dbg-skills/blob/main/skills/find-oep/SKILL.md` ）SKILL内容，结合笔者的实际分析环境及场景，进行了一系列修改：

-   添加了在虚拟机中执行AI脱壳的强制规则；
-   添加了VMP脱壳的取巧策略；
-   为了避免英译中导致部分关键名词的语义变化，笔者尽可能保留了SKILL内容中的原始英文内容；

### SKILL内容

笔者所构建的SKILL完整内容如下：

```plain
---
name: od-find-oep
description: Smart trace-based OEP finder for packed/protected PE executables. Traces through packer stubs using intelligent stepping, and heuristic OEP detection, then captures original entry point. Includes a VMP-specific shortcut strategy (breakpoint on CRT-init APIs such as GetSystemTimeAsFileTime for MSVC or SetUnhandledExceptionFilter for MinGW-w64, then walk up the call chain to OEP). Note the first breakpoint hit(s) usually come from the VMP runtime itself (timing checks, seed generation); verify the caller's section each hit and keep running until the caller belongs to CRT initialization. When VMP's memory protection detects/neutralizes INT3 software breakpoints, switch to hardware breakpoints (od_hardware_breakpoint_set) and verify with od_list_hwbreakpoints.
allowed-tools(vm-mcp连接器): upload_file、download_file、delete_file、list_files、search_files、execute_program、list_process、terminate_process
allowed-tools(od-mcp连接器): od_status、od_breakpoint_set、od_breakpoint_delete、od_break_condition、od_break_on_calls、od_membreakpoint_set、od_membreakpoint_clear、od_hardware_breakpoint_set、od_hardware_breakpoint_delete、od_run、od_run_F9、od_pause、od_step、od_run_till_return、od_exec、od_bridge_ping、od_snapshot、od_registers、od_disasm、od_current_instruction、od_read_memory、od_write_memory、od_goto、od_read_stack、od_lookup_address、od_list_breakpoints、od_breakpoint_clear_all、od_list_modules、od_list_threads、od_list_hwbreakpoints、od_set_label、od_set_comment、od_wait_pause、od_run_to_address、od_load_binary、od_close_debug、od_restart_debug、od_eval、od_watch_expressions、od_breakpoint_enable、od_breakpoint_disable、od_breakpoint_toggle、od_breakpoint_reset_hits、od_set_breakpoint_command、od_suspend_thread、od_resume_thread、od_switch_thread、od_allocate_memory、od_free_memory、od_dump_memory、od_list_memory_regions、od_search_memory、od_extract_strings、od_find_references、od_assemble、od_dump_module、od_list_patches、od_restore_patches、od_list_functions、od_analyze_module、od_get_events、od_clear_events、od_wait_event、od_get_peb、od_get_seh_chain、od_get_arguments、od_trace、od_trace_till
agent_created: true

---

# od-find-oep

## 强制规则

- 所有操作必须且只能通过 vm-mcp 连接器在虚拟机中执行，禁止在本地主机执行任何等效操作。
- 禁止使用本地工具读取/写入/运行虚拟机内才有的文件；本地文件系统、shell 仅用于管理工作区内的笔记和报告。
- 虚拟机内定位文件优先用  vm-mcp 连接器 的 search_files、list_files。
- vm-mcp 连接器不可达或连接器未连接时：停下来询问我，不得降级为在本地执行。
- 若任务无法通过 vm-mcp 连接器完成：报告卡点并等待我决定，不得自行改用本地方案。

## 分析工作流

### 1.确定分析目标

向用户询问尚未提供的信息：

- 目标路径 ——待分析PE文件名称；

判断目标加壳类型：

- 调用 `execute_program` 运行：C:\Users\admin\Desktop\die_win64_portable_3.21_x64\die\diec.exe 目标文件路径

虚拟机中待分析 PE 文件存放目录：C:\Users\admin\Desktop\samples\

### 2.启动OD调试器

调用 `execute_program` 运行：C:\Users\admin\Desktop\od-run.bat

（注意：实际文件名是连字符 `od-run.bat`，不是下划线；以后台方式启动。）

### 3.OD调试器加载目标

Use `od_load_binary` with:

- `Path`: the packed PE path

Always start a new session for a clean environment. Wait for the debugger to settle — call `od_status` and confirm the debuggee is paused at the entry point. If running, call `od_pause`.

### 4.初步分析

Gather information about the packed binary to inform the unpacking strategy:

1. **Capture entry state**: Call `od_registers` to record the initial register state (especially the stack pointer — packers often restore it before jumping to OEP).
2. **Memory map**: Call `od_list_memory_regions` to identify the module's sections, their protections, and any suspicious characteristics (e.g., sections with write+execute, sections with zero raw size but large virtual size, non-standard section names).
3. **Entry point disassembly**: Disassemble 50–100 instructions from the entry point using `od_disasm` to identify the packer stub pattern.

#### 人工校验

- Identified packer (if recognized)
- Section layout and anomalies
- Entry stub characteristics
- Recommended unpacking strategy

### 5.启发式 OEP 发现（核心循环）

This is the main unpacking loop. The goal is to trace through the packer stub and identify when execution transfers to the original, unpacked code.

#### 启发式算法

The OEP is likely reached when several of these conditions align:

| Heuristic               | Description                                                  |
| ----------------------- | ------------------------------------------------------------ |
| **Section transition**  | CIP moves from a packer section (e.g., `.rsrc`, `.aspack`, last section) into the original code section (usually `.text` or the first section) |
| **Stack restoration**   | ESP/RSP returns to (or near) its initial value from step 3   |
| **Common OEP patterns** | Disassembly shows typical compiler entry sequences: `push ebp; mov ebp, esp`, `sub rsp, N`, `call __security_init_cookie`, MSVC/GCC/Delphi/Borland CRT init patterns |
| **Large code region**   | After writes settle, a large contiguous region of valid-looking code exists in the original code section |
| **IAT populated**       | The import table region contains valid pointers to API functions |

#### 步进策略

1. **Start at the packed entry point**. Disassemble the current location.
2. **Identify the current phase**:
   - *Decode loop*: Repetitive instruction patterns (xor, mov byte, loop/dec+jnz). Set a breakpoint after the loop (on the first instruction following the loop exit) and `go`. If you cannot determine the loop exit, use `od_break_condition` with a `break_condition` that detects leaving the loop (e.g., a CIP range check).
   - *API resolution*: Calls to `GetProcAddress`, `LoadLibrary*`, hash-based API resolution. Step over these — they are building the IAT.
   - *Anti-debug check*: See step 6 for detection and evasion.
   - *Inter-module call*: Calls into system DLLs. Step over unless they appear suspicious.
   - *Tail jump / OEP transfer*: A `jmp` or `push+ret` that lands in a different section — potential OEP. Verify with the heuristics above.
   - *Multi-stage transition*: Decoded stub that itself decodes another layer. Repeat the process.
3. **When in a repetitive region** (same addresses appearing repeatedly):
   - Use `od_break_condition` with a `break_condition` like `cip < <loop_start> || cip > <loop_end>` to escape the loop efficiently.
   - Alternatively, identify the loop counter and set a conditional breakpoint: `od_breakpoint_set` with an appropriate condition.
4. **At each significant transition**, disassemble 20–30 instructions at the new location, check the memory section it belongs to, and evaluate the OEP heuristics.
5. **Label and comment** key addresses as you go: decode loop entries, API resolution routines, anti-debug checks, stage transitions, and the final OEP. Use `od_set_comment` .

> 若初步分析判定为 VMP 壳（典型特征：单一代码节被虚拟化、指令流进入 VM dispatcher 循环、字节码解释器模式），逐条步进代价极高。此时跳过上述步进循环，直接使用下文 VMP 取巧策略。

### 6.VMP壳取巧策略

VMP 虚拟化保护下，VM dispatcher 循环庞大且指令被虚拟化，常规步进几乎不可行。利用 CRT 初始化的确定性调用链直接逼近 OEP：

**原理**：VMP 解壳后跳转到 OEP，OEP 处的 CRT 初始化会确定性地调用特定 API。在该 API 上下断，即可在 CRT 执行时刻精准断下，从调用链向上定位 OEP。断点 API 按工具链选择：

- **MSVC**：`__security_init_cookie` 内部调用 `GetSystemTimeAsFileTime`（以及 `QueryPerformanceCounter`、`GetCurrentProcessId` 等）生成 cookie 随机数。
- **MinGW-w64（gcc/g++）**：CRT 启动函数 `__mingw_CRTStartup` 初始化时调用 `SetUnhandledExceptionFilter` 注册默认异常过滤器 `_gnu_exception_handler`。

#### 步骤

1. **按工具链选择 API 并下断点**：
   - MSVC 目标：用 `od_lookup_address` 定位 `kernel32.GetSystemTimeAsFileTime`。
   - MinGW-w64 目标：用 `od_lookup_address` 定位 `kernel32.SetUnhandledExceptionFilter`。
   - `od_breakpoint_set` 的 address 参数支持 `kernel32.GetSystemTimeAsFileTime` 这类表达式，直接下断（`od_lookup_address` 解析不了该格式）；若残留旧断点可先 `od_list_breakpoints` 检查。`od_run` 运行，`od_wait_pause` 等待命中。
2. **判定调用者是否属于 CRT 初始化代码**：断下后读取栈顶返回地址（`od_read_stack` 取 `[esp]` / `[rsp]`），用 `od_lookup_address` + `od_disasm` 检查返回地址所在函数：
   - MSVC：返回地址位于 `__security_init_cookie` 内部（特征：`call GetSystemTimeAsFileTime` 之后紧跟 cookie 的异或/移位混合初始化序列）。
   - MinGW-w64：返回地址位于 `__mingw_CRTStartup`（或其调用的 CRT 初始化代码）内部。
   - 命中任一特征即说明 CRT 初始化已启动，OEP 已经执行或近在咫尺。
   - **预期首个（乃至前几个）命中来自壳代码**：VMP 运行时在解壳阶段自身会调用这些时间/系统 API（反调试计时、解密种子、完整性校验），首个断点命中通常并非样本载荷。判定依据是返回地址的节归属：用 `od_list_memory_regions` 确认返回地址落在 VMP/壳节（非标准节名、高熵、通常为最后一个节）即判定为壳内命中，本次无效。处置：`od_run` 放行，`od_wait_pause` 等待下一次命中，重复上述判定循环，直到调用者满足 CRT 初始化特征。无效命中期间不修改、不删除断点。
3. **向上查找 OEP 入口**：通过栈回溯（扫描栈上的返回地址链）或 `od_trace` 逐层向上，找到 CRT 启动函数，再向上一层的函数头通常就是 OEP：
   - MSVC 调用链：`GetSystemTimeAsFileTime` ← `__security_init_cookie` ← `__scrt_common_main_seh` / `__tmainCRTStartup` ← **OEP**。
   - MinGW-w64 调用链：`SetUnhandledExceptionFilter` ← `__mingw_CRTStartup` ← `__tmainCRTStartup` ← **OEP**（比 MSVC 多一层 `__mingw_CRTStartup`，回溯时须越过）。
   - OEP 候选判定：第一个符合编译器入口模式（`push ebp; mov ebp, esp`（x86）或 `sub rsp, N`（x64））且位于原始代码节内的函数入口。
4. **验证**：按「确认OEP」一节的判定条件复核（代码节归属、栈平衡、反汇编特征）；清理断点；除非用户明确要求，**不主动执行 dump / 导入表重建**——找到并定位 OEP 即为交付终点。

#### 注意事项

- **首命中即当作样本载荷是高频误判**：`GetSystemTimeAsFileTime`、`QueryPerformanceCounter` 等断点 API 在壳阶段就会被 VMP 运行时频繁调用，首个乃至前几个命中大概率来自壳代码。每次命中必须做调用者节归属校验，调用者位于原始代码节 / CRT 初始化函数内才算有效命中；壳内命中直接 `od_run` 放行续跑，等待下一次命中。
- **可选优化（条件断点自动过滤壳内命中）**：若 OD 版本支持复杂断点条件，可对 CRT API 断点附加条件表达式，比较栈顶返回地址（x86 为 `[esp]`）是否落在原始代码节地址区间内，命中壳内调用时自动放行，减少手动 `od_run` 次数。条件表达式语法以所用 OD 版本实测为准，先手动验证一次再依赖。
- **fallback API 按工具链严格区分**：`QueryPerformanceCounter`、`GetCurrentProcessId`、`GetCurrentThreadId`、`GetSystemTimeAsFileTime` 的组合是 MSVC `__security_init_cookie` 专属播种逻辑，仅对 MSVC 目标作 fallback。**MinGW-w64 的 CRT 启动路径不调用这些 API**（已核对 crtexe.c 源码），MinGW 目标的确定性断点只有 `SetUnhandledExceptionFilter`。
- MinGW 目标若 `SetUnhandledExceptionFilter` 断点未命中：a) 若二进制启用了 `-fstack-protector`（libssp），可尝试 `CryptAcquireContextW` / `CryptGenRandom`（现代 GCC 的 `__guard_setup` 构造器播种 canary 时调用，OEP 后立即执行）；b) 或利用 CRT 调用 msvcrt `__getmainargs` 的事实——在 `GetStartupInfoA/W` 下断，但注意调用者位于 msvcrt.dll 内部，需沿栈再向上一层（返回地址链第二级）才能到达目标自身 CRT。
- VMP 加壳程序的 IAT 通常被重定向，"IAT populated" 启发式在此场景需放宽判定标准，以代码特征和调用链回溯为主。
- **VMP 内存保护会检测软件断点（INT3）**：VMP 带有代码完整性校验 / 页面保护机制，运行期会扫描被保护代码节与关键 API 入口的 `0xCC` 字节。软件断点被检测到的典型症状：a) 断点永不触发（`0xCC` 被运行期还原）；b) 目标异常退出或行为异常（反调试逻辑被触发）；c) 断点命中位置无规律漂移。**一旦发现断点失效，立即删除该软件断点（`od_breakpoint_delete`），改用硬件断点（`od_hardware_breakpoint_set`）**：硬件断点通过 DR0–DR3 调试寄存器实现，不修改任何代码字节，对完整性校验不可见。注意 DR 寄存器仅 4 个名额、每个断点最大 4 字节，适合下在 API 入口（如 `GetSystemTimeAsFileTime`、`SetUnhandledExceptionFilter`）这类单地址断点；下完后用 `od_list_hwbreakpoints` 确认已实际写入。

### 7.确认OEP

When you believe you've reached the OEP:

1. **Disassemble** 50+ instructions and verify the code looks like a real program entry (not packer stub code).
2. **Check section**: Confirm CIP is in the expected code section (`.text` or first section).
3. **Check stack**: Compare ESP/RSP to the initial value from step 3.
4. **Check IAT**: Read a few pointers from the import section — they should point to valid API functions in loaded DLLs. 

#### 人工校验

- The OEP address
- The section it's in
- A disassembly listing of the first ~30 instructions
- Confidence level and reasoning
```

## AI脱壳实测

为了能够真实测试AI脱壳效果，笔者尝试构建了多种AI脱壳场景对其进行实测：

-   使用符合真实场景下的最新版remcos远控，结合UPX进行了AI脱壳实测；
-   使用符合真实场景下的最新版remcos远控，结合VMP壳（只开启内存保护）进行了AI脱壳实测；

-   备注：remcos木马基于MSVC工具链构建；

-   使用nc.exe，结合VMP壳（只开启内存保护）进行了AI脱壳实测；

-   备注：nc.exe程序基于MinGW-w64工具链构建；

通过在Qoder工作台 + 断网虚拟机 + OD的组合环境下进行AI脱壳测试，实测发现：

-   可成功对UPX壳进行AI脱壳；
-   可成功对基于MSVC、MinGW-w64构建的VMP2.x、VMP3.x壳进行AI脱壳；

### 实测UPX脱壳

使用Qoder工作台调用od-find-oep技能的任务截图如下：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ab5ac512e4fdc32d.png)

AI脱壳的实际反馈结果如下：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c412ec80291d6c85.png)

虚拟机中，OD调试器的驻留断点如下：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/283113200ff6eac7.png)

未加壳remcos程序的程序代码入口截图如下：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/68ad140276de8752.png)

### 实测VMP脱壳1

使用Qoder工作台调用od-find-oep技能的任务截图如下：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ddf85c7cc718118c.png)

AI脱壳的实际反馈结果如下：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9ca7631c7b9b4c38.png)

虚拟机中，OD调试器的驻留断点如下：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e635e01426ed2b3e.png)

未加壳remcos程序的程序代码入口截图如下：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/68ad140276de8752.png)

### 实测VMP脱壳2

使用Qoder工作台调用od-find-oep技能的任务截图如下：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7f77969415423052.png)

AI脱壳的实际反馈结果如下：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/62772b065608298d.png)

虚拟机中，OD调试器的驻留断点如下：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/10c3be7958c060c8.png)

未加壳nc.exe程序的程序代码入口截图如下：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/14f0850754900b96.png)
