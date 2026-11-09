---
title: 【微信】Agent 的权限不该写在 Prompt 里
source: https://mp.weixin.qq.com/s/QpE2rTUjpqc3QqMqeaSeow
source_host: mp.weixin.qq.com
clip_date: 2026-11-09T14:03:56+08:00
trace_id: ded91e46-cc00-4e91-95d4-ce8432195595
content_hash: 8765e2bbf6d51845eda9c97d90f5575e343300793804b1b0a2076fdcef90daef
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 41375244-d011-8115-a412-d552ec500315
ioc: null
---

**ITPAPA** *2026年11月9日 13:10*

Microsoft Execution Containers 的策略模型、后端差异与上线验证

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b9b768d0dd548fd2.png)

只要 Agent 还能修改自己的权限、选择更弱的执行后端，或者在沙箱失败后回退到宿主执行，“最小权限”就只是提示词里的愿望。

## “请只修改这个目录”不是安全边界

2026 年 11 月 5 日，微软在月度安全更新中再次把 Microsoft Execution Containers（MXC）列为本地 AI Agent 的操作系统级隔离层。MXC 已于 10 月 7 日宣布正式可用，当前稳定 SDK 已到 1.0.1，稳定策略 schema 仍是 1.0.0。它试图解决的不是模型是否“听话”，而是模型生成命令、插件和第三方工具最终在本机执行时，能接触哪些文件、网络、进程和用户界面。

传统 Agent 往往继承启动它的用户环境：仓库、SSH agent、云凭据、浏览器配置、环境变量和公司内网同时可见。开发者可能在 system prompt 中写“不要读取.env”或“只操作当前仓库”，但这些约束仍由同一个模型和同一个执行框架解释。提示注入、工具参数错误或规划偏差一旦绕过语义约束，操作系统没有理由拒绝。

核心结论 Agent 的策略决定必须留在可信宿主代码中，模型只能提出资源需求；文件、网络、UI 和生命周期限制应由模型无法修改的操作系统后端执行。

## MXC 不是一种容器，而是一层策略翻译与生命周期接口

图 1 MXC SDK 连接可信宿主与平台后端，工作负载只在授权资源范围内运行。

MXC 的 host app 是可信控制面，负责选择命令、构造策略、发现宿主能力、启动工作负载并处理结果。workload 是不可信数据面，可以是模型生成的 shell、编译器、测试工具、MCP 工具或整个 Agent harness。MXC SDK 验证请求，并将统一的权限意图翻译成平台后端能够执行的配置。

“container”在这里不必是 Docker 镜像或虚拟机。Windows 的默认 process intent 映射到 ProcessContainer，Linux 映射到 Bubblewrap，macOS 映射到 Seatbelt；Windows 还可使用 IsolationSession 与 WSLc。Windows Sandbox、MicroVM 和 Hyperlight 在 1.0.0 文档中仍属实验后端，不能因为主机列出了它们就假设 V1 SDK 能创建。

| 后端  | 平台与状态 | 隔离重点 | 适合任务 | 必须验证 |
| --- | --- | --- | --- | --- |
| ProcessContainer | Windows 稳定；process 默认 | 进程、文件、网络和 UI 策略 | 短时命令、代码扫描、测试 | 宿主补丁、实际隔离 tier、路径规则。 |
| Bubblewrap | Linux 稳定；process 默认 | 用户命名空间与挂载视图 | Linux 本地工具链 | user namespace、网络与挂载语义。 |
| Seatbelt | macOS 稳定；process 默认 | macOS sandbox profile | 本地构建与工具调用 | macOS 版本及 profile 能力。 |
| IsolationSession | Windows 稳定接口 | 独立账户、会话、桌面与剪贴板 | 长时间桌面自动化 | 最低 Windows build、生命周期支持。 |
| WSLc | Windows 稳定接口 | 通过 WSL 的 Linux 环境 | Linux-first Agent 工具链 | 端口映射、宿主共享和 daemon 状态。 |
| MicroVM 等 | 实验  | 硬件虚拟化或专用运行时 | 更高风险、特定兼容需求 | 显式实验授权，不用于默认降级。 |

## 策略与执行配置必须分开

MXC 文档把 policy settings 与 execution settings 分开。前者描述可读路径、可写路径、拒绝路径、网络、UI 和超时；后者加入命令、工作目录、环境变量与后端选择。这个分离非常关键：模型可以建议“运行测试需要 npm cache”，但不能把建议直接变成宿主权限。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/210724cf0d39516b.png)

图 2 每次工具调用都经过能力探测、策略编译、隔离执行和结果验证。

## 文件系统

路径应按使用方式分为 read-only、read-write 和 denied。源代码与工具链通常只读，构建产物、缓存和临时目录单独可写，.env、SSH 目录、浏览器配置和无关仓库明确拒绝。工作目录本身不会自动获得访问权；设置 cwd 后仍要把它加入路径策略。

“仓库只读，但允许 output 可写”比“整个仓库可写”更能限制影响面。还要警惕重叠规则：不同后端使用不同的挂载、ACL 或 sandbox 机制，有些后端无法在一个已映射目录中可靠表达更窄的 deny 子路径。策略必须在实际后端上做负向测试。

## 网络

1.0.0 schema 使用 directional networking：network.egress 与 network.ingress。hostLoopback 也要单独考虑，因为 127.0.0.1 可能连接宿主上的调试器、数据库、凭据代理和内部控制接口。代理模式只负责 HTTP(S) 路由，不能透明覆盖 SSH、任意 TCP/UDP；仅设置 HTTP_PROXY 也不能阻止应用绕过代理直连。

## UI 与输入

本地 Agent 不一定只访问文件。剪贴板可能含有口令，合成键盘和鼠标输入可以操作未授权应用，桌面截图可能暴露敏感窗口。策略应默认禁用 UI、剪贴板和 input injection，仅在任务确实需要时选择能够隔离会话的后端。

## 环境与超时

不要把宿主进程的完整环境变量继承给工作负载。Windows ProcessContainer 在显式环境下需要 SystemRoot 与 LOCALAPPDATA，TEMP 和 TMP 应指向专用可写目录。每次 Agent 动作还应设置超时，超时后清理进程树和临时状态。

## 稳定版本并不代表所有宿主具有同一种能力

MXC 1.0.1 于 2026 年 10 月 17 日发布，是首个补丁版本；schema 继续使用 1.0.0。版本号只说明 SDK 和运行组件的合同，不说明当前设备能强制执行所有字段。官方文档明确要求区分 SDK 版本、schema 版本和 host capabilities。

| 检查轴 | 要回答的问题 | 错误做法 | 上线证据 |
| --- | --- | --- | --- |
| SDK/runtime | 包与本地二进制是否来自同一发布？ | 只升级 npm/NuGet，不升级 native runtime。 | 依赖锁、二进制版本与签名。 |
| schema | 原始 JSON 是否声明精确受支持版本？ | 写 1.0 或 1.0.1；继续使用退役字段。 | schema 校验通过。 |
| 宿主能力 | 目标后端和控制在此设备是否可用？ | 看到 Windows 11 就默认支持。 | getPlatformSupport、available backends、probe。 |
| 执行 API | 所选后端是否支持 one-shot、PTY 或生命周期调用？ | 把“后端存在”当成“所有 API 可用”。 | 按 API 与后端矩阵验收。 |
| 组织策略 | 设备管理策略是否收紧请求？ | Agent 遇到拒绝后扩大权限。 | 有效策略快照与 denial 记录。 |

Windows 11 24H2 与 25H2 的 ProcessContainer 依赖累计更新。官方 release notes 指出，KB5120998 提供 process isolation，KB5124010 增加 host-loopback 与 enumerate-only 路径支持；26H1 对应 KB5124006。即使版本满足，应用仍要在启动前探测，并在启动时处理能力变化。

## 防御性实验：为代码审查 Agent 建一个最小边界

下面是可在隔离 Windows 11 测试机上执行的防御性验证。示例基于 MXC 1.0 的原始 JSON schema；路径和命令均为演示值，不访问生产凭据。本文没有在当前环境实际运行这些命令，预期结果来自官方策略语义，发布前应在目标主机复核。

policy.json 演示策略，生产使用前需按安装版本校验 schema

{

"$schema": "https://raw.githubusercontent.com/microsoft/mxc/main/schemas/stable/mxc-config.schema.1.0.0.json",

"version": "1.0.0",

"containment": "process",

"process": {

"commandLine": "C:\\\\Windows\\\\System32\\\\cmd.exe /d /c C:\\\\mxc-demo\\\\run-tests.cmd",

"cwd": "C:\\\\mxc-demo\\\\repo",

"env": \[

"SystemRoot=C:\\\\Windows",

"LOCALAPPDATA=C:\\\\mxc-demo\\\\output",

"TEMP=C:\\\\mxc-demo\\\\output\\\\tmp",

"TMP=C:\\\\mxc-demo\\\\output\\\\tmp"

\],

"timeout": 30000

},

"filesystem": {

"readonlyPaths": \[

"C:\\\\mxc-demo\\\\repo",

"C:\\\\mxc-demo\\\\tools",

"C:\\\\Windows\\\\System32\\\\cmd.exe"

\],

"readwritePaths": \["C:\\\\mxc-demo\\\\output"\],

"deniedPaths": \[

"C:\\\\mxc-demo\\\\repo\\\\.env",

"C:\\\\Users\\\\demo\\\\.ssh"

\]

},

"network": {

"egress": { "default": "deny" },

"ingress": { "default": "deny", "hostLoopback": "deny" }

},

"ui": { "disable": true, "clipboard": "none", "injection": false }

}

## 第一步：探测与校验

PowerShell 命令 版本和路径按实际安装调整

\# 使用 release 附带并验证签名的 x64 或 arm64 二进制

wxc-exec.exe --probe policy.json

\# 预期：报告 ProcessContainer tier、宿主警告与请求兼容性。

\# 门禁：缺少必需能力时终止，不删除网络/UI字段后重试。

## 第二步：允许与拒绝测试

| 测试  | 工作负载动作 | 预期结果 | 复核证据 |
| --- | --- | --- | --- |
| 允许读 | 读取 repo 下普通源文件。 | 成功。 | stdout、exit code、输入哈希。 |
| 拒绝写源代码 | 尝试覆盖 repo\\src\\app.cs。 | Access denied。 | 文件哈希不变、denial。 |
| 允许写输出 | 写 output\\result.json。 | 成功。 | 输出仅出现在授权目录。 |
| 拒绝秘密 | 读取 repo\\.env 与用户.ssh。 | Access denied。 | 无内容进入 stdout/stderr。 |
| 拒绝网络 | 连接公网、内网和 127.0.0.1。 | 连接失败。 | 无 DNS/代理/目标连接。 |
| 拒绝 UI | 读取剪贴板或注入输入。 | 失败。 | UI 策略与系统审计。 |
| 超时  | 运行超过 30 秒的脚本。 | timedOut，进程清理。 | 无残留子进程与锁。 |

不要只检查返回码。失败脚本可能把秘密先写入 stderr，再以非零码退出；Agent 也可能在超时前启动脱离父进程的后台任务。应同时检查文件哈希、进程树、网络遥测、输出内容和临时目录。

## Learning Mode 不是自动生成允许列表

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/178e64d5f42b49b6.png)

图 3 观察结果只能作为候选权限，最终必须回到强制模式完成负向回归。

Windows ProcessContainer 提供 Learning Mode，用于记录策略阻断的访问。deny-and-record 模式继续拒绝访问，只增加可观测性；Permissive 模式则允许并记录原本会被拒绝的访问，会削弱 deny-by-default，因此只能用于可信工具、隔离测试数据和受控设备。

最危险的流程是把观察到的所有路径自动加入允许列表。包管理器、构建脚本和恶意插件都可能主动探测用户目录、凭据、注册表或网络。观察只能回答“它试图访问什么”，不能回答“业务是否应授权”。

| 模式  | 未授权访问 | 报告  | 适用场景 | 发布前要求 |
| --- | --- | --- | --- | --- |
| Enforcement | 阻断  | 默认不生成活动报告 | 生产执行 | 必须保留。 |
| Learning | 阻断并记录 | 生成 denial 证据 | 定位缺失依赖、负向验证 | 逐条审查，不自动授权。 |
| Permissive | 允许并记录 | 生成完整观察 | 可信工具首次画像 | 隔离数据；结束后移除。 |

## 检测与审计：把策略、后端和实际行为关联起来

单条“Agent 启动成功”日志不够。安全团队需要把任务意图、请求策略、有效后端、工作负载进程、OS denial 和最终输出放进同一条追踪链。

结构化执行事件 字段值为演示数据

{

"task_id": "demo-task-42",

"agent_id": "code-review-agent",

"policy_hash": "sha256:demo",

"schema": "1.0.0",

"sdk_version": "1.0.1",

"requested_intent": "process",

"effective_backend": "processcontainer",

"host_build": "demo-build",

"command_hash": "sha256:demo-command",

"grants": {

"readonly": \["C:\\mxc-demo\\repo"\],

"readwrite": \["C:\\mxc-demo\\output"\],

"egress": "deny", "host_loopback": "deny", "ui": "deny"

},

"mode": "enforcement",

"exit_code": 0,

"timed_out": false,

"warnings": \[\],

"denial_count": 0,

"output_hash": "sha256:demo-output"

}

检测逻辑示例 重点发现降级、权限漂移与策略失效

alert if requested_intent == "process"

and effective_backend not in approved_backends

alert if mode == "permissive" and environment == "production"

alert if policy_hash changed

and grants expanded

and change_ticket is null

alert if network.egress == "deny"

and endpoint_connection_count > 0

alert if mxc_launch_failed

and same_task.executed_on_host == true

alert if readwrite_path overlaps credential_or_user_profile_path

## 上线门禁：通过一次 demo 远远不够

| 门禁  | 验证方法 | 失败条件 | 产物  |
| --- | --- | --- | --- |
| 版本一致 | 核对 SDK、native runtime、schema 与签名。 | 组件混用或 schema 拼写不受支持。 | SBOM 与制品哈希。 |
| 能力探测 | 每台目标主机运行 support、backend 与 probe。 | 必需控制缺失或仅实验后端可用。 | 设备能力清单。 |
| 策略差分 | 新旧 policy 逐字段比较授权扩大。 | 新增可写根目录、网络或 UI 未审批。 | 机器可读 diff 与工单。 |
| 负向测试 | 读秘密、写越界、网络、loopback、UI、超时。 | 任一拒绝用例成功或泄露输出。 | 测试日志与遥测。 |
| 失败关闭 | 注入 backend unavailable、validation error。 | 任务回退到宿主或删字段重试。 | 故障注入报告。 |
| 生命周期 | 取消、超时、崩溃与重启后检查残留。 | 子进程、会话、挂载或临时凭据残留。 | 清理验证记录。 |
| 持续回归 | OS、MXC、工具链和 Agent 升级后重跑。 | 权限扩大未触发评审。 | 基线版本与回归趋势。 |

## 几个容易产生误解的边界

## 跨平台 schema 不等于跨平台安全属性相同

同一个 process intent 在 Windows、Linux 和 macOS 上映射到不同内核机制。路径 deny、host loopback、PTY、生命周期和 UI 控制可能不同。统一 API 降低集成成本，不会抹平后端差异。

## 隔离不能证明输出可信

MXC 限制工作负载能接触的资源，但不会判断代码修改是否正确、依赖是否安全、测试报告是否伪造。Agent 输出仍需代码审查、测试、签名和供应链验证。

## 网络代理不等于网络隔离

HTTP(S) 代理只能处理兼容客户端的应用层流量。若后端没有同时阻止直接连接，工作负载可以绕开代理。SSH、任意 TCP/UDP、DNS 和 host loopback 必须按后端能力分别验证。

## 长期容器会积累状态

IsolationSession 与 WSLc 支持生命周期操作，适合共享工具和环境，但状态持久化也会累积下载、缓存、凭据和污染。需要定义任务间清理、镜像重置、身份轮换和最大存活时间。

## 组织策略仍在完善

微软 11 月更新把 Intune、Entra 与 Agent 365 的部分集成描述为 upcoming。当前可以依赖的是 MXC SDK、schema 和支持后端；不要把尚未普遍可用的动态权限、身份归因和集中治理写成已经覆盖所有终端的现成功能。

## 适用收益、成本与部署顺序

MXC 最适合会在本地执行模型生成命令、构建代码、调用第三方 CLI、处理不可信文件或运行插件的 Agent。对只调用远程 API、没有本地执行能力的聊天机器人，收益较小；其主要边界仍在云身份、数据授权和 API 网关。

实际成本包括策略维护、不同平台的负向测试、可写缓存拆分、软件更新后的回归以及 denial 的运营分析。过窄策略会导致工具频繁失败，过宽策略则失去隔离价值。Learning Mode 可以降低策略编写成本，但不能替代人工威胁建模。

部署时应从高风险、边界清楚的工具调用开始，例如代码扫描、单元测试、文档转换和静态分析。先固定一类任务、一套工具链和一个后端，建立允许与拒绝基线，再扩展到包安装、网络访问、桌面自动化和长期会话。

## 结语：Agent 可以提出需求，但不能批准自己的权限

Agent 安全真正困难的地方，不是写出一份“最小权限”清单，而是保证策略在每台设备、每个后端和每次工具调用中都被同样执行。只要执行失败可以回退到宿主、Permissive 被带入生产、或者模型能修改 policy，隔离就会在最需要它时消失。

MXC 的价值在于把权限意图与平台隔离机制连接起来，并提供能力探测、策略验证和 denial 观察接口。它也留下了明确的工程责任：可信宿主必须做策略决定，安全团队必须做负向测试，平台差异必须被记录，任何降级都必须失败关闭。

AI 大舞台 · 目录
