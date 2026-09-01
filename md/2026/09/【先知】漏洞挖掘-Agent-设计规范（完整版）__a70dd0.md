---
title: 【先知】漏洞挖掘 Agent 设计规范（完整版）
source: https://xz.aliyun.com/news/92745
source_host: xz.aliyun.com
clip_date: 2026-09-01T14:44:01+08:00
trace_id: 5c2a87da-86c1-477e-bb87-c83409ac747c
content_hash: 0808fed8c22cb8dfeb1b20671d69a4a3fbafbf4f385eb9210b004ea0f57caf00
status: synced
tags:
  - 先知
  - 漏洞分析
  - AI应用
series: null
feed_source: 先知安全技术社区
ai_summary: 基于 claw-code 运行时设计高精度低误报漏洞挖掘 Agent：枚举交给确定性工具、判断交给模型、用对抗式 Refuter 与 PoC 裁决，只有证明过的结论才上报。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ce75244-d011-816c-a750-e88ba7411c4f
ioc:
  cves: []
  cwes:
    - CWE-200
    - CWE-22
    - CWE-416
    - CWE-502
    - CWE-78
    - CWE-787
    - CWE-79
    - CWE-798
    - CWE-89
    - CWE-918
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 基于 claw-code 运行时设计高精度低误报漏洞挖掘 Agent：枚举交给确定性工具、判断交给模型、用对抗式 Refuter 与 PoC 裁决，只有证明过的结论才上报。
> 
> - **核心方法论：** “枚举用确定性工具，判断用模型，裁决用对抗式验证，上报只用证明过的结论”；每个候选默认按误报处理，必须被证伪失败才放行。
> - **多角色分工：** 共 6 类角色（Planner / Finder×N / Refuter / Synthesizer / Reproducer / Fixer）；每个候选派 2–3 个独立 Refuter，沿 A 错 source / B 已 sanitize / C 不可达 / D 幻觉四轴证伪，强否决优先于多数通过。
> - **置信度与证据卡：** L1 需 PoC 复现，L2 需完整数据流+可达且无 sanitizer，只有 L1/L2 才上报；flow 中任何 `verified:false` 跳最高只能 L3；无任何 SURVIVED verdict 禁止进报告；L1 缺 PoC 自动降 L2。
> - **工具与权限：** find/verify 全程只读，仅 Reproducer 在沙箱内可写；沙箱用 unshare 用户命名空间+网络隔离；`denied_tools` 硬禁 `bash(rm -rf:*)`、`bash(sudo:*)` 等危险命令。
> - **降误报闭环：** semgrep/CodeQL/clippy/cargo-audit/gitleaks 等扫描器只作候选种子，不直接进报告；基准要求 FPR<10%、Precision>80%，并用 mock-anthropic-service 的固定响应流做回归测试。

> 目标：基于 `claw-code` （Rust 实现的 Claude-Code 风格 Agent 运行时， `rust/` 为生产代码、11 个 crate），设计一个 **高精度、低误报、高产高质量漏洞** 的漏洞挖掘 Agent。
> 
> 本文是可直接落地到工程实现的 **设计规范**：包含角色定义、可直接复制的提示词模板、完整的 JSON Schema、逐阶段数据流、工具/权限矩阵、确定性扫描器集成、对抗式验证协议、基准测试方法论与逐文件落地路线图。

* * *

## 目录

## 1\. 项目 Agent 架构剖析

### 1.1 仓库定位

`claw-code` 是 Claude Code CLI 的 Rust 复刻。README 自述为“agent-managed exhibit”——仓库本身由多个协作 Agent（clawhip / OmX / OmO）自治构建维护。生产运行时在 `rust/` （11 个 crate）， `src/` 是 Python 移植/对拍工作区，不是运行时。

11 个 crate 分工：

|     |     |     |
| --- | --- | --- |  
| crate | 职责  | 关键文件/符号 |
| `rusty-claude-cli` | `claw` 主二进制、REPL、25 个子命令 | `main.rs` （ `CliAction` ~L1162） |
| `api` | 上游模型客户端（Anthropic / OpenAI 兼容 / xAI）、SSE 流、prompt cache | `providers/anthropic.rs` |
| `runtime` | **Agent 核心**：会话、对话循环、权限、沙箱、策略引擎、任务编排 | 47 个扁平模块 |
| `tools` | 内建工具定义与调度 | `tools/src/lib.rs` （工具 spec 表） |
| `commands` | 120+ 个斜杠命令 | `commands/src/lib.rs` |
| `plugins` | 插件与钩子（hook）系统 | `plugins/src/lib.rs` |
| `claw-analog` | **极简、可审计的 Agent 外壳** （read-only / NDJSON） | `claw-analog/src/lib.rs` |
| `claw-rag-service` | 代码语义检索（SQLite + embedding，HTTP API） | `claw-rag-service/src/` |
| `telemetry` / `compat-harness` / `mock-anthropic-service` | 观测、对拍、确定性 mock 服务 | —   |

### 1.2 核心 Agent 循环：ConversationRuntime

整个 Agent 的“智能”被收敛到 `runtime/src/conversation.rs` 的 `ConversationRuntime::run_turn` （L325–531）。它对模型与工具做了硬性框架，模型只能做填充：

```plain
push user input
loop {
    build ApiRequest { system_prompt, messages }
    events = api_client.stream(request)          // 模型思考/文本/工具调用块
    assistant_message = build_assistant_message(events)
    push assistant_message
    if 无 tool_use: break                          // 终态
    for each tool_use:
        pre_hook = run_pre_tool_use_hook()          // 钩子可改输入/拒绝
        outcome  = permission_policy.authorize_with_context()   // 权限门
        if Allow: output = tool_executor.execute() + post_hook()
        else:     output = deny_reason (标记 is_error)
        push tool_result
    maybe_auto_compact()                            // 超阈值自动压缩
}
```

值得注意的设计点：

-   **抽象解耦**： `ApiClient` / `ToolExecutor` 是 trait，运行时可以与任何模型/工具后端组合。这让“用同一套循环跑不同模型、不同工具集”成为可能——这是复用该运行时做漏洞 agent 的关键。
-   **everything 进会话**：思考块（ `Thinking` ）、文本、工具调用、工具结果都作为结构化 `ContentBlock` 存进 `Session` ，可持久化为 JSONL、可 fork、可压缩（ `compact.rs` / `trident.rs` ）。 **这天然提供了“证据链”的存储载体**。
-   **钩子反馈合并**：pre/post hook 输出会合并进工具结果（ `merge_hook_feedback` ），hook 的拒绝/失败标记为 error 反馈给模型。这是把 **外部确定性检查器** 插进循环的官方接口。
-   **安全第一**： `unsafe_code = "forbid"` 全 workspace；每步工具调用都经过权限门。
-   **telemetry**： `SessionTracer` 记录 `turn_started / assistant_iteration / tool_execution_started/finished / turn_completed` ，天然是审计与度量来源。

### 1.3 系统提示词工程：prompt.rs

系统提示词 = 静态脚手架 + 动态边界 + 环境/项目上下文：

-   静态段： `# System` （工具结果可能含外部数据、警惕 prompt injection）、 `# Doing tasks` （**“Be careful not to introduce security vulnerabilities such as command injection, XSS, or SQL injection”**，L709）、 `# Executing actions with care` （可逆性/爆炸半径）。
-   动态段：模型族、cwd、日期、平台。
-   项目上下文：git status / diff / 最近提交。
-   指令文件：分层发现 `CLAUDE.md` / `CLAW.md` / `AGENTS.md` /`.claw/CLAUDE.md` 等，向上追溯到 git 根，去重、预算截断（单文件 4K 字符、总 12K）。

**对漏洞 agent 的启示**：系统提示词里已经有一条“别引入安全漏洞”的 **防御性** 约束。漏洞 agent 需要的是 **进攻性但克制** 的另一套提示词工程（见 §6）。

### 1.4 权限与沙箱：把模型动作关进笼子

这是该项目最值得漏洞 agent 借鉴的部分——它证明了“给 Agent 装上一套最小权限 + 隔离”是可行的：

-   `PermissionMode` **等级**： `ReadOnly < WorkspaceWrite < DangerFullAccess` ，外加 `Prompt` / `Allow` 。每个工具声明 `required_permission` （ `bash` = DangerFullAccess， `write_file` = WorkspaceWrite， `read_file` = ReadOnly）。
-   `PermissionPolicy::authorize_with_context` （ `permissions.rs:186` ）：顺序为 `denied_tools` 硬禁 → `deny_rules` → 钩子覆盖（Allow/Deny/Ask）→ `ask_rules` → `allow_rules` → 模式比较 → 交互式升级提示。规则支持对工具输入的 subject（command/path/url 等）做 **exact / prefix 匹配**，例如 `bash(rm -rf:*)` 一键禁止。
-   `PermissionEnforcer` （ `permission_enforcer.rs` ）：无 prompter 时自动拒绝需交互的工具，供无头/CI 场景。
-   **沙箱** （ `sandbox.rs` ）：Linux `unshare` 用户命名空间 + `--mount --ipc --pid --uts` （可选 `--net` 网络隔离），文件系统隔离三档 `off / workspace-only / allow-list` ，带容器检测与 `--map-auto` 降级探测。
-   `claw-analog` ：非交互下直接 **拒绝** `danger-full-access` / `allow` 模式，并提供 `Preset::Audit` （优先安全/正确性/可疑模式、引用文件与证据、优先只读调查）。

### 1.5 多 Agent 编排原语

-   `TaskRegistry` ： `Task` + `TaskStatus` ，lane 是任务的心跳/陈旧度单元。
-   `WorkerRegistry` ： `Worker` 生命周期、启动健康检查、信任解析、 `ToolPermissionAllowScope` 。
-   `TeamRegistry` **/** `CronRegistry` ：把多个 task 组队、定时派发。
-   `PolicyEngine` （ `policy_engine.rs` ）： **声明式规则引擎** `条件(And/Or 组合) → 动作(Merge/Rebase/Retry/Escalate/Reconcile/Notify/Block/RequireApprovalToken/Chain)` ，按优先级排序。“人类定策略、Agent 执行”的落地： `GreenAt(测试通过) AND ScopedDiff(改动聚焦) AND ReviewPassed → MergeToDev` 。
-   `lane_events.rs` **/** `green_contract.rs` **/** `recovery_recipes.rs` **/** `branch_lock.rs` ：自动化车道的事件源、绿测契约、失败恢复。

**关键领悟**：这整个仓库的价值主张是“ **人类定方向，Agent 做劳动；把规划/执行/评审/重试循环自动化** ”。漏洞挖掘 Agent 是同一哲学下的一个特化场景—— **人类定义“什么是漏洞”和“什么算证据”，Agent 负责在约束内枚举、验证、合成**。

### 1.6 现状缺口

`format_bughunter_report` （ `main.rs:11314` ）目前只打印三行文本模板：

```plain
Bughunter
  Scope    runtime
  Action   inspect the selected code for likely bugs and correctness issues
  Output   findings should include file paths, severity, and suggested fixes
```

它 **没有**：威胁建模、扫描流水线、验证环节、置信度分级、去重、报告 schema。 `/security-review` 同样只是一条 summary。 **这正是 §4–§13 要补的那套东西。**

* * *

## 2\. Claude 漏洞挖掘能力分析

> 边界：讨论“前沿模型作为漏洞分析器的能力来源”，不替具体模型背书。能力强 ≠ 不需要验证——§3 论证：模型越强，越要当“提出者”而非“裁决者”。

### 2.1 长链推理

漏洞是一条跨函数因果关系链：攻击者输入 → 中间变量 → 危险操作。找到它需要在成百上千行、跨上下文边界处维持反事实推理（“不满足某分支会怎样”）。前沿模型在长 horizon 推理上显著强于传统工具，这是“工具做模式匹配、模型做路径证明”的分水岭。

### 2.2 精确的代码理解

-   理解 **数据流与控制流语义**，而非关键字： `user_input` 是否真的到达 `system()` ，中间是否有 sanitize、 `shell=False` 、长度校验。
-   识别 **跨语言微妙差异** （ `subprocess` 的 `shell=` 默认值、SQL 占位符 vs 字符串拼接、Rust 的 `unsafe` /生命周期）。
-   **知道去哪里找定义** （grep 实际签名，而不是凭记忆猜）——这需要工具配合。

### 2.3 source→sink 污点推理

静态扫描器是受限的模式匹配；模型能做 **语义级污点**：理解“这字符串来自 HTTP 请求体”“base64 解码后仍是污点”“被拼进 shell 命令”。覆盖大量静态工具扫不到或误报的情况。

### 2.4 长上下文（200K–1M）

把 **相关代码切片 + 依赖 + 调用点** 一起装进上下文做联合推理。配合检索（本仓库的 `claw-rag-service` ），大代码库里只喂相关子图。

### 2.5 工具使用与“验证倾向”

被允许跑 `grep` / `read` / `git diff` / `cargo test` /PoC 的模型会 **主动验证假设**。挖掘质量的上限，很大程度由“模型能不能执行验证动作”决定。

### 2.6 诚实地表达不确定性

较好的模型在不确定时会明说，不硬凑漏洞。这降低被诱导提示词带偏的概率——但 **不能依赖**：模型仍会幻觉。三大幻觉来源 = 假 API/函数、假数据流、假可达性， **恰是漏洞误报三大来源**，必须显式对抗（见 §11）。

* * *

## 3\. 设计方法论

### 3.1 一句话原则

> **枚举用确定性工具，判断用模型，裁决用对抗式验证，上报只用证明过的结论。**

推导出四条约束：

1.  **低误报靠“证明负担”**：默认每个候选是误报，验证者必须 **证伪失败** 才放行。
2.  **高召回靠“多模态枚举”**：多个正交角度（污点 / API 误用 / 已知 CWE / 依赖版本 / diff 增量 / fuzz）并行扫，统一去重。
3.  **高产出靠“确定性工具打底、模型精修”**：90% 机械枚举外包给 semgrep / CodeQL / grep / 依赖扫描，模型只做关联与裁决。
4.  **可复用靠“置信度分级”**：明确区分“已复现”和“疑似”，下游按级别处理。

### 3.2 低误报的三道闸

|     |     |
| --- | --- | 
| 误报来源 | 强制验证 |
| ① source 不可控 | 证明输入 **确实** 来自攻击者面（HTTP 参数/文件/网络/环境变量），且无认证/校验隔离 |
| ② sink 不危险 / 已 sanitize | 逐行追踪到 sink，确认无 sanitizer、无 `shell=False` 、无参数化、无非空校验 |
| ③ 不可达 | 证明存在 **真实调用路径** （入口 → 调用链），排除死代码、 `unreachable!`、feature-gate、需特权前置 |
| ④ 模型幻觉 | 所有签名/数据流 **回读真实代码** 锚定（grep 定义 + 行号），禁止凭记忆断言 |

### 3.3 证据卡（Evidence Card）

每个候选必须填一张证据卡，缺项即降级：

```plain
source(s)   : [file:line] 攻击者可控输入点
sink(s)     : [file:line] 危险操作
flow        : source -> ... -> sink 逐跳数据流（每跳 file:line）
sanitizer   : [无 / 有-并说明为何无效(给出 line)]
reachability: 调用链 + 前置条件（默认开启? / 可远程触发? / 需什么权限?）
impact      : 具体后果（RCE / 越权读 / DoS / 信息泄露）
```

### 3.4 置信度分级

```plain
L1 CONFIRMED : 有可复现 PoC / 通过的负向测试
L2 LIKELY    : source→sink 数据流完整、未发现 sanitizer、可达性成立，但未构造 PoC
L3 SUSPICIOUS: 模式可疑，但可达性或可利用性未证实
L4 NOTE      : 加固建议 / 非直接可利用 / 纵深防御
```

**只有 L1/L2 按“漏洞”上报**；L3/L4 降级为“疑似/建议”。每个 L1/L2 附证据卡 + 反驳记录 + 修复建议 + 行号。

* * *

## 4\. 威胁建模层（Threat Model）

一切分析都锚定在一个显式威胁模型上，否则“漏洞”没有定义。

### 4.1 威胁模型对象（JSON 输出）

```json
{
  "assets": [
    { "name": "user_credentials", "confidentiality": "high", "integrity": "high" }
  ],
  "trust_boundaries": [
    { "name": "public_internet", "type": "network", "authenticated": false },
    { "name": "authenticated_user", "type": "session", "authenticated": true }
  ],
  "entry_points": [
    { "name": "http_handler", "kind": "source", "file": "src/server.rs", "line": 120,
      "reachable": true, "auth_required": false }
  ],
  "data_flows": [
    { "from": "http_handler", "to": "db_query", "kind": "untrusted_input" }
  ],
  "assumptions": [
    "攻击者可任意构造 HTTP 请求头/体",
    "数据库凭据与网络不可被攻击者直接读取"
  ]
}
```

### 4.2 威胁建模检查清单

-   资产：哪些数据/功能一旦被读/改就会造成损害？
-   信任边界：哪些输入来自攻击者（网络、文件、环境、第三方 API 响应、消息队列、 `argv` ）？哪些已在边界内（已认证会话、内部服务）？
-   入口：每个入口要标注 `reachable` （是否默认暴露）与 `auth_required` 。
-   依赖面：第三方库、子进程、系统命令、模板引擎、序列化器、 `unsafe` 块。
-   反例假设：明确写出“什么不算漏洞”（例如需要已取得管理员身份的路径）。

### 4.3 分层威胁模型

不同目标项目给不同深度：

|     |     |     |
| --- | --- | --- |  
| 档位  | 适用  | 内容  |
| S0  | 快速评审 | 只列信任边界 + 入口 |
| S1  | 常规库/服务 | \+ 数据流 + 依赖面 + 假设 |
| S2  | 高价值目标（钱包/内核/支付） | \+ 逐步攻击树、每条数据流标注 sanitizer 期望 |

* * *

## 5\. 漏洞分类法 / 模式库

把 CWE/OWASP 映射为“可检索的模式提示词”，每个模式给 finder 一个 **可执行** 的检查清单。

### 5.1 模式库条目结构

每个条目 = `id + 名称 + 触发特征 + 需证明的 sink/source + 常见误报原因 + 检查步骤` 。

### 5.2 核心模式清单（节选，工程里可扩充为 YAML/JSON 模式库）

|     |     |     |     |     |
| --- | --- | --- | --- | --- |    
| id  | 类别  | sink 例子 | 需证明 | 高频误报原因 |
| CWE-78 | 命令注入 | `system()`, `exec*`, `subprocess(shell=True)` | 用户输入进入命令字符串 | `shell=False` / 白名单 / 无 shell |
| CWE-89 | SQL 注入 | 字符串拼接 SQL → `execute()` | 无参数化/无转义 | 占位符参数化 / ORM 转义 / 输入已类型化 |
| CWE-22 | 路径穿越 | `open(join(base, user_input))` | 无规范化/traversal 过滤 | 已 `resolve` + 前缀校验 / 白名单 |
| CWE-79 | XSS | 无转义写入 HTML 模板 | 无 context 相关转义 | CSP / 自动转义模板 / 纯文本渲染 |
| CWE-502 | 反序列化 | `pickle.loads`, `yaml.load`, `serde` 于不可信输入 | 不可信字节进反序列化 | 仅白名单类型 / 输入来源可信 |
| CWE-918 | SSRF | `requests.get(user_url)` | URL 由攻击者控且无 SSRF 防护 | 内网地址过滤 / URL 解析校验 |
| CWE-200 | 信息泄露 | 异常/栈/密钥写入日志或响应 | 敏感数据到低信任边界 | 已脱敏 / 仅 debug 模式 / 数据本就公开 |
| CWE-798 | 硬编码凭证 | 源码里的 API key/token | 真实密钥且可被利用 | 占位符 / 测试夹具 / 已轮换 |
| CWE-787 | 内存越界 | 裸指针/ `unsafe` 写 | 索引/长度可由输入控制 | 已有边界检查 / 不可能路径 |
| CWE-416 | 释放后使用 | `unsafe` 手动内存管理 | 生命周期跨越释放点 | 所有权模型已保证 |

### 5.3 模式库的两种用法

1.  **作为 finder 的“逐类质问”清单**：把模式库条目转成 `问题 → 检查步骤` ，让 finder 逐类扫。
2.  **作为确定性扫描器的规则源**：把特征翻译成 semgrep/CodeQL 规则（见 §10），机器先跑一遍，命中项作为 finder 的种子候选。

* * *

## 6\. 角色定义与系统提示词模板

一个漏洞 agent 绝不是单模型单轮，而是 **分工明确的多角色**。下面给出每个角色的 **完整可复制系统提示词** （以 Anthropic Messages API 风格书写，方括号为插值点）。

### 6.1 角色总览

|     |     |     |     |
| --- | --- | --- | --- |   
| 角色  | 目标  | 权限  | 输出  |
| Planner | 产出威胁模型、切分范围 | read-only | ThreatModel JSON |
| Finder（×N 模态） | 发现候选漏洞 | read-only | Finding\[\]（草稿） |
| Refuter（×N 个/候选） | 证伪候选 | read-only | Verdict |
| Synthesizer | 去重、定级、合稿 | read-only | Finding\[\]（定级） |
| Reproducer | 构造 PoC / 负向测试 | workspace-write（沙箱） | PoC + 测试结果 |
| Fixer | 产出最小修复 + 回归测试 | workspace-write（分支） | Patch |

### 6.2 Planner（威胁建模）

```latex
You are a security threat-modeling planner. You do NOT hunt for bugs yet.

INPUT:
- Repository: {repo_root}
- Scope: {scope_paths}
- Target language/stack: {lang_stack}

TASK:
1. Enumerate assets (data/functions whose compromise causes harm).
2. Mark trust boundaries: which inputs originate from an attacker
   (network request, file upload, environment variable, argv, third-party
   API response, message queue) vs. inside the trust boundary.
3. List concrete entry points with file:line, `reachable` (default-on?) and
   `auth_required`.
4. List the dependency surface: subprocess calls, template engines,
   deserializers, `unsafe` blocks, native FFI.

OUTPUT: strict JSON matching the ThreatModel schema (§4.1).

RULES:
- Every entry point MUST cite real code (grep the definition; do not guess).
- If a boundary/asset is unclear, state the ASSUMPTION explicitly, never silently assume safe.
- Output ONLY the JSON object; no prose.
```

### 6.3 Finder（以污点分析模态为例）

这是一个 **进攻性但克制** 的提示词，核心是“诱出判断，同时逼出证据”。

```latex
You are a taint-analysis FINDER in a multi-agent vulnerability pipeline.
You PROPOSE findings; a separate REFUTER will try to disprove them.

CONTEXT:
- Threat model: {threat_model_json}
- Scope: {scope_paths}
- Repository: {repo_root}

TASK:
Find candidate vulnerabilities where attacker-controlled data (source) reaches
a dangerous operation (sink) without effective sanitization. Focus on:
{active_cwe_patterns}

For each candidate, fill an evidence card:
- source(s) : file:line + WHY it is attacker-controlled (tie to a real entry point from the threat model)
- sink(s)   : file:line + WHY it is dangerous
- flow      : source -> ... -> sink, hop-by-hop, each hop with file:line
- sanitizer : NONE, or name the sanitizer + file:line + WHY it is insufficient
- reachability: the call chain and preconditions (default-on? remotely triggerable? required privileges?)
- impact    : concrete consequence

HARD RULES:
1. NEVER assert a function signature or data flow from memory. You MUST grep/read
   the real code and cite file:line. If you cannot verify, mark the flow UNVERIFIED.
2. If a sanitizer exists and you cannot prove it is bypassable, drop the candidate.
3. If you cannot prove reachability, drop the candidate (dead code / feature-gated /
   admin-only do not count unless the gate itself is a bug).
4. It is acceptable — and expected — to report ZERO findings if none qualify.
   Do NOT invent findings to appear productive. A false positive is worse than silence.
5. Output ONLY a JSON array of Finding objects (schema §7). No prose.
```

（“API 误用”“已知 CWE 逐类质问”“diff 增量”“密钥”“依赖”等模态，只需替换 `TASK` 与 `active_cwe_patterns` 段，角色与硬规则不变。）

### 6.4 Refuter（对抗式验证，最重要）

```latex
You are a REFUTER in a multi-agent vulnerability pipeline. Your ONLY job is to
disprove a candidate finding. Your default stance is: this finding is a
FALSE POSITIVE until proven otherwise.

INPUT: a single candidate Finding (JSON).

ATTACK THE FINDING along four independent axes, in order:
A. WRONG SOURCE — is the claimed source actually attacker-controlled? Check the
   real call site against the threat model. Look for authentication, allowlists,
   or internal-only callers between the boundary and the source.
B. SANITIZED / SAFE SINK — trace every hop. Is there a sanitizer, an escaping
   layer, a `shell=False`, a parameterized query, a length/type check, or a
   `resolve()`+prefix guard that the finder missed? Find it in the real code.
C. UNREACHABLE — is there a real call path? Check for dead code, feature flags,
   debug-only paths, unreachable!(), and preconditions the attacker cannot
   satisfy (e.g., requires admin, requires a token the attacker can't obtain).
D. HALLUCINATION — does the cited function/signature/line actually exist and do
   what the finder claims? grep it. A mismatch on any hop is grounds to refute.

OUTPUT: strict JSON
{
  "verdict": "REFUTED" | "SURVIVED",
  "refuted_by": "A" | "B" | "C" | "D",
  "reason": "...",
  "evidence": [ {"file": "...", "line": 123, "note": "..."} ],
  "confidence_in_verdict": 0.0..1.0
}

RULES:
- If you find an echo of doubt, prefer REFUTED. Survivors must be robust.
- "SURVIVED" does NOT mean "it is definitely exploitable"; it means "I could not
  disprove it." That is the maximum claim you are allowed to make.
- Never invent code to refute; if you can't find disproof, that is not disproof —
  say SURVIVED with the reason "failed to refute".
- Output ONLY the JSON object.
```

### 6.5 Synthesizer（去重 + 定级）

```latex
You are a SYNTHESIZER. Merge and rate candidate findings that survived refutation.

INPUT: list of (Finding, Verdict[]) where each Finding has ≥1 SURVIVED verdict.

TASK:
1. DEDUP: findings describing the same root cause (same source+sink+fix) must be
   merged. Keep the strongest evidence card; note duplicates.
2. RATE each into L1..L4 per §3.4:
   L1 = reproducible PoC attached; L2 = complete flow + reachable + no sanitizer, no PoC;
   L3 = suspicious but reachability/exploitability unproven; L4 = hardening note.
3. For each, assign severity (critical/high/medium/low/info) from impact, NOT from
   the number of refuters that survived.

OUTPUT: strict JSON { "findings": [ Finding... ] } (§7).

RULES:
- Do not re-litigate that a verdict already judged; only merge and rate.
- Drop anything below L4 from the primary report (keep in an appendix if asked).
- Output ONLY the JSON object.
```

### 6.6 Reproducer（PoC）

```latex
You are a REPRODUCER. You turn a SURVIVED L2 finding into a minimal, non-destructive
proof in an isolated sandbox. You have workspace-write ONLY inside the sandbox.

INPUT: a single finding (JSON) with a complete inferred source→sink flow.

TASK:
1. Choose the least invasive proof: a unit test that asserts the dangerous behavior,
   a minimal input that triggers the flaw, or a read-only demonstration (e.g., show
   the unsanitized value reaching the sink).
2. Run it. Record exact command + stdout/stderr + exit code.
3. If the PoC proves the flaw, mark CONFIRMED (L1). If it cannot be reproduced,
   mark FAILED and say why — do NOT force it.

RULES:
- NEVER exfiltrate data, contact external network, or modify production state.
- Write only into the sandbox workspace. Run with least privilege.
- A failed PoC is a valid and honest outcome; report it plainly.
```

### 6.7 Fixer（修复）

```latex
You are a FIXER. Produce the minimal patch for a CONFIRMED/LIKELY finding.

TASK:
1. Propose the smallest change that removes the flaw without changing behavior elsewhere.
2. Prefer the canonical mitigation (parameterize the query, disable shell, allowlist
   the path, escape in the right context, bound the index).
3. Include a regression test that would have caught the flaw.
4. Explain WHY the fix is correct and what trade-offs exist.

OUTPUT: diff + test + rationale.

RULES:
- Do not reformat unrelated code. Do not introduce new abstractions.
- If the correct fix is ambiguous, present options with a recommendation, not analysis paralysis.
```

* * *

## 7\. Finding 数据 Schema（完整）

一个贯穿全流水线的严格 JSON Schema，用 `serde` 侧可用 `ajv` / `jsonschema` 校验。这是 **工程化低误报的基石**：结构不完整/证据为空的候选在进入下一阶段前被机器拒绝。

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "SecurityFinding",
  "type": "object",
  "required": ["id", "status", "title", "confidence", "severity", "cwe", "evidence", "provenance", "fix"],
  "properties": {
    "id": { "type": "string", "pattern": "^SV-\\d{6}$" },
    "status": { "enum": ["CANDIDATE", "REFUTED", "SURVIVED", "CONFIRMED", "DUPLICATE"] },
    "title": { "type": "string", "minLength": 8 },
    "confidence": { "enum": ["L1", "L2", "L3", "L4"] },
    "severity": { "enum": ["critical", "high", "medium", "low", "info"] },
    "cwe": { "type": "string", "pattern": "^CWE-\\d+$" },
    "summary": { "type": "string" },
    "evidence": {
      "type": "object",
      "required": ["sources", "sinks", "flow", "reachability"],
      "properties": {
        "sources": { "type": "array", "items": { "$ref": "#/definitions/loc" }, "minItems": 1 },
        "sinks":   { "type": "array", "items": { "$ref": "#/definitions/loc" }, "minItems": 1 },
        "flow":    { "type": "array",
          "items": { "type": "object",
            "required": ["from", "to", "file", "line", "transform"],
            "properties": {
              "from": { "type": "string" }, "to": { "type": "string" },
              "file": { "type": "string" }, "line": { "type": "integer" },
              "transform": { "type": "string" },
              "verified": { "type": "boolean", "description": "false = grep 未确认，必须降级" }
            }
          },
          "minItems": 1
        },
        "sanitizers": { "type": "array", "items": { "$ref": "#/definitions/sanitizer" } },
        "reachability": { "type": "object",
          "required": ["call_chain", "precondition", "default_on"],
          "properties": {
            "call_chain": { "type": "array", "items": { "type": "string" }, "minItems": 1 },
            "precondition": { "type": "string" },
            "default_on": { "type": "boolean" },
            "auth_required": { "type": "boolean" }
          }
        }
      }
    },
    "verification": {
      "type": "array", "items": { "$ref": "#/definitions/verdict" },
      "description": "每个候选必须携带 >=1 个 SURVIVED verdict 才能上报"
    },
    "poc": { "$ref": "#/definitions/poc" },
    "provenance": { "type": "object",
      "properties": { "finder_role": { "type": "string" }, "run_id": { "type": "string" } }
    },
    "fix": { "type": "object",
      "required": ["suggestion"],
      "properties": {
        "suggestion": { "type": "string" },
        "diff": { "type": "string" },
        "regression_test": { "type": "string" }
      }
    }
  },
  "definitions": {
    "loc": { "type": "object",
      "required": ["file", "line"],
      "properties": {
        "file": { "type": "string" }, "line": { "type": "integer" },
        "symbol": { "type": "string" }, "note": { "type": "string" }
      }
    },
    "sanitizer": { "type": "object",
      "required": ["file", "line", "reason_insufficient"],
      "properties": {
        "file": { "type": "string" }, "line": { "type": "integer" },
        "kind": { "type": "string" }, "reason_insufficient": { "type": "string" }
      }
    },
    "verdict": { "type": "object",
      "required": ["verdict", "refuter_role", "reason"],
      "properties": {
        "verdict": { "enum": ["SURVIVED", "REFUTED"] },
        "refuted_by": { "enum": ["A", "B", "C", "D"] },
        "refuter_role": { "type": "string" },
        "reason": { "type": "string" },
        "evidence": { "type": "array", "items": { "$ref": "#/definitions/loc" } },
        "confidence_in_verdict": { "type": "number", "minimum": 0, "maximum": 1 }
      }
    },
    "poc": { "type": "object",
      "properties": {
        "kind": { "enum": ["unit_test", "input_repro", "read_only_demo"] },
        "command": { "type": "string" }, "stdout": { "type": "string" },
        "exit_code": { "type": "integer" }, "reproduced": { "type": "boolean" },
        "artifact": { "type": "string" }
      }
    }
  }
}
```

### 7.1 机器校验规则（进入下一阶段前强制通过）

-   `evidence.flow` 中任何 `verified: false` 的跳 → 该 finding 最高只能 L3。
-   `evidence.sources` / `sinks` 为空 → 直接驳回（CANDIDATE 不合格）。
-   `verification` 数组里没有任何 `SURVIVED` → 禁止进入报告。
-   `confidence = L1` 但无 `poc.reproduced: true` → 自动降 L2。
-   `reachability.default_on: false` 且 `auth_required: true` → 自动降一级。

* * *

## 8\. 逐阶段流水线规范

### 8.1 阶段总览与数据流

```plain
Phase 0 范围切分（人类 / Planner）
   └─ ThreatModel ──────────────────────────────┐
Phase 1 枚举（并行 Finder × N 模态）              │
   ├─ taint_finder ──┐                          │
   ├─ misuse_finder ─┤                          │
   ├─ cwe_finder ────┤── Finding[](CANDIDATE) ──┤
   ├─ diff_finder ───┤      去重后进 TaskRegistry │
   ├─ secret_finder ─┤                          │
   └─ deps_scanner ──┘（这条是确定性的，不进模型） │
                                                 │
Phase 2 筛选（机器 + Synthesizer）                 ▼
   ├─ 机器校验 schema（§7.1）                    候选队列 ── dedup ── 分组
   └─ Synthesizer 粗筛：丢弃无证据/不可达          │
                                                 ▼
Phase 3 对抗式验证（每候选 × 2–3 Refuter，并行）  │
   └─ Verdict[] ── 多数/强 refute 则 REFUTED ─────┤
                                                 ▼
Phase 4 复现（Reproducer，仅 SURVIVED）            │
   └─ PoC ── 成功 → L1；失败 → 保留 L2 但标注      ▼
Phase 5 定级 + 报告（Synthesizer 再合稿）          │
   ├─ 最终 Finding[]（L1–L4）                      ▼
   └─ Markdown + JSON 双通道                     报告
```

### 8.2 每阶段的并发与关卡

|     |     |     |
| --- | --- | --- |  
| 阶段  | 并发  | 关卡（不过不进下一段） |
| 1 枚举 | 6–10 个 Finder 并行 | schema 完整、 `flow` 非空 |
| 2 筛选 | 1 Synthesizer | 去重完成、无空证据卡 |
| 3 验证 | 每候选 2–3 Refuter 并行 | `>=1 SURVIVED` （多数原则见 §11） |
| 4 复现 | 每候选 1 Reproducer，沙箱内 | `poc.reproduced` 或诚实 FAILED |
| 5 报告 | 1 Synthesizer | L1/L2 才进主报告 |

### 8.3 状态机（复用 TaskRegistry）

每个候选是一个 `Task` ，状态沿 `CANDIDATE → SURVIVED/REFUTED → CONFIRMED/FAILED → (报告)` 迁移。 `TaskRegistry.update_heartbeat` + `LaneBoard` 用于检测卡死的 finder/refuter， `recovery_recipes.rs` 负责重试一次。

* * *

## 9\. 工具契约与权限矩阵

**原则：find/verify 全程只读；只有 Reproducer 在沙箱内可写。** 这直接复用 `PermissionPolicy` 与 `claw-analog` 的 `Preset::Audit` 思路。

|     |     |     |     |     |     |     |
| --- | --- | --- | --- | --- | --- | --- |      
| 工具  | Planner | Finder | Refuter | Synthesizer | Reproducer | Fixer |
| `read_file` | R   | R   | R   | R   | R   | R   |
| `glob_search` | R   | R   | R   | R   | R   | R   |
| `grep_search` | R   | R   | R   | R   | R   | R   |
| `retrieve_context` (RAG) | R   | R   | R   | —   | —   | R   |
| `bash` （只读: `git` / `grep` / `semgrep` / `cargo metadata` ） | R   | R   | R   | R   | R\* | R   |
| `bash` （构建/测试/PoC） | D   | D   | D   | D   | W(sandbox) | W(sandbox) |
| `write_file` / `edit_file` | D   | D   | D   | D   | W(sandbox) | W(分支) |
| `Task/Team` 编排 | —   | —   | —   | 编排器持有 | —   | —   |

-   R = ReadOnly；W(sandbox) = 沙箱内 WorkspaceWrite；D = deny_tools 硬禁（ `denied_tools` 配置）。
-   用权限规则精确化只读 bash： `allow: ["bash(git:*)"], ["bash(semgrep:*)"], ["bash(grep:*)"], ["bash(cargo metadata:*)"], ["bash(ls:*)"], ["bash(find:*)"], ["bash(cat:*)"], ["bash(head:*)"], ["bash(git diff:*)"], ["bash(cargo test:*)"], ["bash(cargo clippy:*)"], ["bash(cargo build:*)"], ["bash(cargo fuzz:*)"], ["bash(python*:*)"], ["bash(cargo run*:*)"], ["bash(cargo install --locked:*)"], ["bash(--version:*)"], ["bash(codeql:*)"], ["bash(spec:*)"], ["bash(poetry:*)"], ["bash(pip:*)"], ["bash(npm:*)"], ["bash(npx:*)"], ["bash(trivy:*)"], ["bash(osv-scanner:*)"], ["bash(gitleaks:*)"], ["bash(cargo audit:*)"], ["bash(cargo-deny:*)"], ["bash(cargo deny:*)"], ["bash(cargo clippy --all-targets:*)"], ["bash(rustup:*)"], ["bash(ls -la:*)"], ["bash(du:*)"], ["bash(wc:*)"], ["bash(cat*:*)"], ["bash(sed*:*)"], ["bash(awk*:*)"], ["bash(rg:*)"], ["bash(codeql database:*)"], ["bash(codeql query:*)"], ["bash(codeql database create:*)"], ["bash(gh*:*)"]]`,
-   用 `deny_rules` 兜底： `bash(rm -rf:*)` 、 `bash(sudo:*)` 、 `bash(curl:*:*` 、 `bash(wget:*:*` 、 `bash(sh -c:*:*` 、 `bash(eval:*:*` 、 `bash(> /etc:*:*` 、 `bash(>> ~/.ssh:*:*` 。
-   敏感文件读限制： `read_file(*/.env*)` → deny（除非显式 ask）。

> 说明：这里的规则是 **防护性示例**，不是要原样照搬；实际配置由“目标仓库 + 威胁模型”决定，但“find/verify 只读 + PoC 沙箱 + 硬禁危险命令”三个层级是固定的。

* * *

## 10\. 确定性扫描器集成

模型不做机器能做得更好的枚举。把扫描器作为 Phase 1 的 **种子来源**。

### 10.1 扫描器矩阵

|     |     |     |     |
| --- | --- | --- | --- |   
| 语言/栈 | 工具  | 作用  | 输出 → 用法 |
| 多语言 | `semgrep` (community + 自写规则) | 模式/数据流快速扫描 | 命中项 → taint/misuse finder 的种子 |
| 多语言 | `CodeQL` | 精确数据流（慢，但准） | 高价值目标用；告警 → 直接候选 |
| Rust | `cargo clippy -- -D warnings` + `cargo audit` | Rust 安全 lint + 依赖 CVE | `unsafe` /依赖告警 → misuse/deps finder |
| Rust | `cargo-deny` / `cargo deny check advisories` | 依赖许可证 + RUSTSEC 通告 | deps 维度，确定性，不占模型 |
| Go  | `govulncheck` | 依赖 + 标准库漏洞 | 确定性 |
| JS/TS | `npm audit`, `npm audit signatures` | 依赖漏洞 | 确定性 |
| 通用密钥 | `gitleaks` | 硬编码密钥 | 命中 → secret finder 复核 |
| 通用依赖 | `osv-scanner`, `trivy fs` | OSV 生态 CVE 比对 | 确定性 |
| 容器  | `trivy image` | 镜像层 CVE | 若目标是容器 |

### 10.2 与 Agent 的分工

-   扫描器输出 **只作为** 候选种子， **不直接进报告**：因为它们没有“可达性 / 可利用性 / 语义污点”判断，误报率高。
-   真正的“确证”永远走 §11 的 refuter + §12 的 PoC。
-   这样可以： **扫描器保证召回（不遗漏机械可发现的），模型保证精度（砍掉误报）**。

### 10.3 示例：semgrep 规则片段（命令注入种子）

```yaml
rules:
  - id: claw-detect-subprocess-shell-true
    languages: [python]
    severity: WARNING
    message: "subprocess with shell=True — candidate for command injection"
    patterns:
      - pattern-either:
        - pattern: subprocess.call(..., shell=True)
        - pattern: subprocess.run(..., shell=True)
        - pattern: os.system(...)
        - pattern: os.popen(...)
```

这类规则命中的 `file:line` 直接喂给 `misuse_finder` ，让模型去判断“参数是否真的可控”。

* * *

## 11\. 对抗式验证协议

这是整套设计的核心，也是低误报的最大杠杆。 **要精确到裁决规则。**

### 11.1 分配

-   每个候选派 **2–3 个 Refuter**，彼此独立、各自从干净上下文启动（不带 finder 的推理过程，避免被带节奏）。
-   三个 Refuter 要在 §6.4 的四个攻击轴（A/B/C/D)上 **人为错开**，或至少各自覆盖不同轴，以覆盖不同的失败模式（人工冗余：一个都看 A，一个重点 B/C，一个重点 D）。
-   Refuter 提示词 **必须** 写“默认误报”，杜绝“默认信任 finder”。

### 11.2 裁决规则（明确到可编码）

```plain
survives = count(SURVIVED)           # 每个候选的 SURVIVED 数
refutes  = count(REFUTED)

if refutes >= 2:                      status = REFUTED   （强否决）
elif refutes == 1 and survives >= 2:  status = SURVIVED  （多数通过，留 note）
elif refutes == 1 and survives <= 1:  status = SURVIVED 但降一级（一票否决且无多数，降级）
else:                                 status = SURVIVED  （无否决）
```

-   **强否决优先于多数**：只要有一个 refuter 给出了 **可直接复现的反驳证据** （比如贴出 sanitizer 的真实代码），即使其余 SURVIVED，也按 REFUTED 处理——但要把这个功劳记进 refuter 证据。
-   记录谁 refute、为什么，全部进 `verification[]` ，留作审计。

### 11.3 为什么“N 个独立 refuter”是关键

-   finder 天然有（被提示词诱导的）正向偏差；refuter 的反向偏差是它的对冲。
-   用 **不同视角** （A/B/C/D）而非 N 个一模一样的 refuter，覆盖“能失败的方式不止一种”。
-   若候选被 refute， **不再重跑 finder 去“找回”它** （否则进入自我强化循环）。

* * *

## 12\. 复现 / PoC 协议

验证“真的可利用”与“只是看着可疑”的分界。

### 12.1 优先级

1.  **负向单元测试** （首选）：写一个断言“危险行为实际发生”的测试。
2.  **输入复现**：构造能触发的最小输入，跑给目标看输出。
3.  **只读演示**：无法写/无法跑时，最少要演示“未 sanitize 的值确实抵达 sink”（把中间值打印出来）。

### 12.2 沙箱约束（复用 sandbox.rs）

-   Reproducer 运行在 `filesystem_mode = workspace-only` 、 `namespace_restrictions = true` 、 `network_isolation = true` 的沙箱。
-   sandbox home/tmp 分别是 `.sandbox-home` / `.sandbox-tmp` （ `build_linux_sandbox_command` 已实现）——PoC 只能写这里。
-   **严禁**：真实网络外呼、读取生产环境变量中的密钥、写入生产路径。

### 12.3 结果处理

-   `reproduced: true` → 升级 L1，附 `poc` 对象（command/stdout/exit_code/artifact）。
-   `reproduced: false` → 诚实保留 L2，但标注“未复现”，不得冒充 L1。

* * *

## 13\. 报告规范

### 13.1 双通道输出（遵循仓库 render_x / render_x_json 惯例）

-   **JSON 通道** （stdout，供 CI/编排器消费）：严格 `Finding[]` （§7），机器可解析。
-   **Markdown 通道** （stderr/文件，供人阅读）：分级分组、含链接式 `file:line` 、证据链、PoC、修复建议。

### 13.2 Markdown 报告模板

```markdown
# Security Review — {repo} @ {commit}

## TL;DR
- 确认漏洞(L1): {n}  疑似可确认(L2): {m}  硬化建议(L3/L4): {k}
- 扫描范围: {scope}  威胁模型: {threat_model_version}

## Confirmed (L1)
### [SV-000123] {title}  — severity: high / CWE-78
- **Source**: `src/server.rs:120` — 未认证 HTTP 请求体
- **Sink**  : `src/util.rs:88` — `subprocess.run(shell=True)`
- **Flow**  : `handler` → `parse_body()` → `build_cmd()` → `exec`
- **Proof** : `cargo test -- poc_command_injection` — PASS (见附件)
- **Fix**   : 改用 `subprocess.run(..., shell=False, args=[...])`；回归测试见 `tests/...`

## Likely (L2)   ...
## Advisories (L3/L4)  ...
## Appendix — 全部候选与反驳记录
```

### 13.3 报告完整性要求

每个 L1/L2 必须包含： `id` 、 `title` 、 `severity` 、 `cwe` 、evidence（source/sink/flow/reachability）、verification 记录、fix 建议。（JSON 侧由 §7 schema 强制，Markdown 侧由模板保证。）

* * *

## 14\. 基准测试与度量

低误报需要 **可量化的反馈环**。

### 14.1 指标定义

|     |     |     |
| --- | --- | --- |  
| 指标  | 定义  | 目标  |
| **FPR（误报率）** | 在标注“非漏洞”样本里，被上报为 L1/L2 的比例 | < 10%（理想 < 5%） |
| **Recall（召回率）** | 在含 ground-truth 漏洞样本里，被找出的真实漏洞占比 | 枚举层看，越高越好 |
| **Precision（精确率）** | 上报的 L1/L2 中，真实漏洞占比 | \> 80% |
| **复现率** | L2 中被 PoC 升级为 L1 的比例 | 越高说明验证环节越扎实 |
| **每 token 产出** | 高价值漏洞数 / 消耗 token | 防“堆 token 换假产出” |
| **F1** | 2PR/(P+R) | 综合  |

### 14.2 基准集构造

1.  **正样本**：真实历史 CVE 对应的 commit（ `before` 是漏洞版本、 `after` 是修复）→ 测 recall 与“能否定位”。
2.  **负样本**：标注为“无漏洞”的高质量代码 + 刻意加固过的代码 → 测 FPR。
3.  **植入样本**：在受控副本里植入已知漏洞（命令注入/SQLi/路径穿越/越界），测“能否找到且不误报邻居”。
4.  **依赖样本**：带已知 CVE 的 lock 文件 → 测 deps 维度。

### 14.3 回归测试（复用 mock-anthropic-service）

-   `mock-anthropic-service` 的 `SCENARIO_PREFIX` 已能脚本化模型响应。用它给 hunter 一个 **固定响应流**，断言：

1.  hunter 稳定发现目标漏洞；
2.  hunter **不** 对标注负样本上报；
3.  schema 校验通过、置信度分级正确。

-   保证“改提示词不回归 FPR/Recall”。

### 14.4 迭代闭环

```plain
跑基准 → 算 FPR/Recall/复现率 → 定位误报根因（source? sink? reach? hallucinate?）
  → 改对应层（提示词/模式库/扫描规则/裁决规则） → 再跑基准（防回归）
```

* * *

## 15\. 反模式与陷阱（含具体失败案例）

1.  **同一模型既当猎人又当法官** → 无对抗，正向偏差叠加。 **例**：一个 finder 自己“确认”自己报的漏洞，实际是 `shell=False` 的误报。
2.  **诱导性提示词** （“找出尽可能多的漏洞”）→ 幻觉爆炸。 **例**：模型为凑数，把一个 `shell=False` 的子进程调用报成命令注入。
3.  **拿模型当扫描器** → 又慢又漏又贵。 **例**：让模型逐文件读整个 monorepo 找 SQL 注入，漏掉 semgrep 一秒就能命中的 `+ query` 拼接。
4.  **证据缺失也上报** → 无法复现。 **例**：只写“疑似注入”，没有 `file:line` ，下游无法验证，直接被丢弃。
5.  **忽略可达性** → 大量“理论漏洞”。 **例**：把 `#[cfg(test)]` 里的 `unsafe` 当生产漏洞。
6.  **报告不可复现** → 下游弃用。 **例**：无触发条件、无修复建议的报告，安全团队无法行动。
7.  **污染信任域**：让不受信模型的 PoC 跑在与目标代码同一个信任域 → 可能反噬。 **例**：PoC 脚本写进了 `~/.ssh` 。
8.  **把扫描器输出当结论**：semgrep/CodeQL 的告警直接进报告 → 高误报。扫描器是种子，不是判决。
9.  **忽视模型提示注入**：目标仓库里的 `CLAUDE.md` /注释若被压下攻击指令，可操纵 finder。必须隔离/清洗注入进上下文的未受信内容（现有 `prompt.rs` 已有一条“flag suspected prompt injection”的弱防护，需在漏洞 agent 里强化为“指令文件权限隔离”）。
10.  **无负样本回测**：只测“能找到”，不测“不误报”，FPR 无从控制。

* * *

## 16\. 在 claw-code 的逐文件落地路线图

分三阶段，优先复用现有原语，不推倒重来。

### 阶段一：数据与角色（纯 read-only，风险最低）

1.  `rust/crates/tools/src/lib.rs` ：增补 finder/refuter 所需的只读工具 spec（若现有 6 个内建工具不足，加 `retrieve_context` 的稳定暴露）。
2.  `rust/crates/runtime/src/prompt.rs` ：在 `SystemPromptBuilder` 增加 `append_section` 注入器（已有）——为漏洞 agent 注入 §6 的进攻性系统提示词与威胁模型段。
3.  新增 `rust/crates/commands/src/security` （或扩展 `bughunter` ）：定义 `ThreatModel` 、 `Finding` 、 `Verdict` 的 `serde` 类型（§7 schema 的 Rust 版）。
4.  `rust/crates/claw-analog` ：新增 `Preset::Audit` 反向变体 `Preset::Bughunter` （进攻但克制，沿用只读）。

### 阶段二：流水线编排（复用 Worker/Team/Task）

1.  `rust/crates/runtime/src/task_registry.rs` + `worker_boot.rs` ：把每个 Finder/Refuter 建模为 `Worker` ，候选建模为 `Task` ，状态机走 §8.3。
2.  新增编排器（可放在 `commands` 或新 crate `bugbounty` ）：按 §8 的并发拓扑派发、收集、去重、定级。复用 `team_cron_registry::Team` 做“组队并行”。
3.  `rust/crates/runtime/src/policy_engine.rs` ：新增策略规则，如 `Condition::And[ GreenAt{poC_passes}, ReviewPassed{refuter_majority_survived} ] → Action::MergeToReport` ——只在“通过反驳 + PoC 绿”时允许报告合并。体现“绿测契约 = 验证契约”。
4.  `rust/crates/runtime/src/hooks.rs` ：用 Pre/PostToolUse hook 自动捕获每次工具调用/输出，固化为证据链。

### 阶段三：验证 + 报告 + 基准

1.  `rust/crates/runtime/src/sandbox.rs` + `claw-analog` ：PoC 复现阶段工作区写权限 + 网络隔离。
2.  `rusty-claude-cli/src/main.rs` ：把 `format_bughunter_report` stub 替换为实际 pipeline 入口，输出 JSON + Markdown 双通道（沿用 `render_x` / `render_x_json` ）。
3.  `rust/mock-anthropic-service` ：新增“已知漏洞 + 负样本”场景，做 §14.3 的回归。
4.  新增 `bugbounty/` 的 semgrep/CodeQL 规则文件 + `patterns.yaml` 模式库（§5）。

* * *

## 17\. 完整示例：一个通过/被否决的 Finding

### 17.1 被 REFUTED 的候选（展示 refuter 如何砍掉误报）

```json
{
  "id": "SV-000317",
  "status": "REFUTED",
  "title": "命令注入 in parse_and_exec",
  "confidence": "L3",
  "severity": "low",
  "cwe": "CWE-78",
  "evidence": {
    "sources": [{"file": "src/api.rs", "line": 44, "note": "HTTP body"}],
    "sinks":   [{"file": "src/util.rs", "line": 88, "note": "subprocess.run"}],
    "flow": [
      {"from": "body", "to": "cmd", "file": "src/api.rs", "line": 47, "transform": "json parse", "verified": true},
      {"from": "cmd", "to": "subprocess", "file": "src/util.rs", "line": 88, "transform": "arg", "verified": true}
    ],
    "sanitizers": [],
    "reachability": {"call_chain": ["main", "route", "parse_and_exec"], "precondition": "none", "default_on": true, "auth_required": false}
  },
  "verification": [
    {
      "verdict": "REFUTED",
      "refuted_by": "B",
      "reason": "subprocess.run is called with shell=False and args=[...] — the user string is a single argv element, not a shell command.",
      "evidence": [{"file": "src/util.rs", "line": 88, "note": "shell=False"}]
    }
  ],
  "fix": {"suggestion": "No fix: not a vulnerability (shell=False)."}
}
```

即使 finder 给出了完整的 `file:line` 数据流，refuter 发现 `shell=False` 的真实代码，判定 **REFUTED（B 轴）**。 **这就是“一票否决 + 真实证据”把高置信度幻觉漏洞拦下来的过程**。

### 17.2 通过的 Finding（L1，有 PoC）

```json
{
  "id": "SV-000318",
  "status": "CONFIRMED",
  "title": "路径穿越 in template loader",
  "confidence": "L1",
  "severity": "high",
  "cwe": "CWE-22",
  "evidence": {
    "sources": [{"file": "src/web.rs", "line": 210, "note": "filename query param, unauthenticated"}],
    "sinks":   [{"file": "src/fs.rs", "line": 55, "note": "std::fs::read(join(base, name))"}],
    "flow": [
      {"from": "query.name", "to": "name", "file": "src/web.rs", "line": 215, "transform": "none", "verified": true},
      {"from": "name", "to": "read", "file": "src/fs.rs", "line": 55, "transform": "join(base, name)", "verified": true}
    ],
    "sanitizers": [],
    "reachability": {"call_chain": ["main", "handle_get_template", "load"], "precondition": "none", "default_on": true, "auth_required": false}
  },
  "verification": [
    {"verdict": "SURVIVED", "refuted_by": null, "reason": "未找到规范化或前缀校验；Path::join 可被 ../ 逃逸", "evidence": []},
    {"verdict": "SURVIVED", "refuted_by": null, "reason": "无 dead code / 无 privilege gate；默认路由可达", "evidence": []}
  ],
  "poc": {
    "kind": "input_repro",
    "command": "claw-analog read /template?name=../../etc/passwd",
    "stdout": "<contents of /etc/passwd>",
    "exit_code": 0,
    "reproduced": true
  },
  "fix": {
    "suggestion": "canonicalize 后校验 path.starts_with(canonical_base)，或改为 allowlist 白名单",
    "diff": "…",
    "regression_test": "assert load(\"../../etc/passwd\") returns Err(Traversal)"
  }
}
```

### 17.3 示例说明

-   17.1 展示了 **find 环节即便证据齐全也能被 refuter 一票否决**——这靠的是“默认误报 + 读真实代码”。
-   17.2 展示了 **PoC 升级为 L1** 所需的完整证据闭环（source/sink/flow/reachability + 双 refuter SURVIVED + 可复现 PoC + 修复）。

* * *

## 结语

`claw-code` 已经给出了一个非常扎实的 Agent 底座：受权限与沙箱约束的工具循环、声明式策略引擎、多 Worker/Team/Lane 编排、可审计的极简外壳。它缺的不是“模型能力”，而是 **把攻击性分析收敛成可验证、低误报、可复现结论的流水线**。

把这套流水线做对，要点就一句话：

> **让模型负责“提出”，让确定性工具与对抗式验证负责“证明”，让分层置信度负责“可信”，让策略引擎负责“放行”。**

模型越强，越要让它在“找线索”上尽情发挥，而在“下结论”上被铁链拴住——这才是“非常准确、低误报、高质量”的真正来源，而不是对一个更聪明模型的盲目信任。
