---
title: 【微信】一文看懂 AI 渗透的发展：从 LLM 辅助到自主多智能体红队-CSDN博客
source: https://mp.weixin.qq.com/s/84pN30qSLYTgzX3INqjD_g
source_host: mp.weixin.qq.com
clip_date: 2026-11-10T14:38:20+08:00
trace_id: 578ed8f0-423e-426a-8421-7130a54631d6
content_hash: 00de2f6628031f6bdb88a556912b9ecd34a5ac96bd2d0d76cc40cfb1052a6067
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 20
  succeeded: 20
  failed_urls: []
notion_page_id: 41475244-d011-8157-a39e-d0f6520a9eca
ioc: null
---

**网络安全民工** *2026年11月9日 23:32*

> **为了规避商业产品风险，本文讨论的是开源Ai渗透产品**

## 前言：

### （一）、AI渗透的几种技术路线

-   AI 自主渗透平台：能够自主规划攻击路径、调用工具、验证漏洞和生成报告。
    
-   AI Agent 安全平台：采用多智能体架构，将侦察、漏洞分析、利用验证等任务交给不同 Agent。
    
-   AI 辅助渗透工具：通过 LLM 提升传统扫描器、渗透工具和安全工作流的效率。
    
-   AI 红队与自动化攻击平台：模拟真实攻击者，开展持续自动化红队测试。
    
-   AI 安全运营平台：结合攻击面管理、漏洞验证、风险分析和整改闭环。
    

### （二）、AI 渗透技术在过去三年经历了明显的范式变化

-   2023：LLM 辅助渗透。 AI 帮助安全人员理解漏洞、生成命令、分析结果，仍以人工操作为主。
    
-   2024：AI 安全测试与红队自动化。 开始系统化测试大模型本身，出现任务拆解、攻击策略和多轮交互。
    
-   2025：自主渗透 Agent 爆发。 AI 开始接管信息收集、工具调用、漏洞验证和攻击链执行。
    
-   2026：多 Agent、白盒分析与工程化。 重点转向自主执行、真实漏洞验证、MCP 工具生态、CI/CD 集成和持续安全测试。
    

## 一、AI 渗透发展时间轴

### （一）、2023 年：LLM 辅助渗透萌芽——人主导、AI 辅助

1.  > 仓库创建：2023-02-27｜首次 PyPI 发布：2023-06-15｜最近可确认代码提交：2026-07-14
    > 
    > 早期代表性 LLM 渗透项目。通过任务树、上下文管理和交互式推理辅助渗透人员完成测试流程。
    
    GitHub 仓库：https://github.com/GreyDGL/PentestGPT?utm_source=chatgpt.com ·
    
    PyPI 发布记录：https://pypi.org/project/pentestgpt/?utm_source=chatgpt.com
    
2.  > 仓库创建：2023-04-28｜最近更新：2026-11-07｜最新 Release：0.125.1（2026-10-25）
    > 
    > 从 Prompt 和模型评估工具发展为 LLM 应用、Agent、RAG 的安全测试与红队框架，支持自动化测试和 CI/CD。
    
    GitHub 仓库：https://github.com/promptfoo/promptfoo?utm_source=chatgpt.com ·
    
    Release：https://github.com/promptfoo/promptfoo/releases?utm_source=chatgpt.com
    
3.  **2023-05-10｜NVIDIA garak**
    
    > 仓库创建：2023-05-10｜最近代码提交：2026-11-07｜最新 Release：v0.17.1（2026-10-16）
    > 
    > 面向大模型漏洞扫描，覆盖 Jailbreak、提示词注入、数据泄露、错误信息生成等风险。
    
    GitHub 仓库：https://github.com/NVIDIA/garak?utm_source=chatgpt.com
    

阶段判断： **AI 开始理解渗透任务，但主要还是“人操作工具，AI 提供建议”**。

### （二）、2024 年：AI 红队与多步攻击研究——自动化测试、任务规划

1.  **2024-02-22｜Microsoft PyRIT**
    
    > 首次公开发布：2024-02-22｜后续版本持续演进，2026 年版本记录见项目文档
    > 
    > Microsoft 开源的生成式 AI 风险识别工具，支持多轮攻击、目标适配、转换器、评分器和测试记忆管理。
    
    GitHub 仓库：https://github.com/microsoft/PyRIT?utm_source=chatgpt.com ·
    
    Microsoft 首发公告：https://www.microsoft.com/en-us/security/blog/2024/02/22/announcing-microsofts-open-automation-framework-to-red-team-generative-ai-systems/?utm_source=chatgpt.com
    
2.  **2024-02-29｜AgentDojo**
    
    仓库创建：2024-02-29｜最近可确认代码提交：2026-06-02
    
    重点不是完整渗透平台，而是研究使用工具的 LLM Agent 如何受到提示词注入攻击，以及防御机制如何评估。
    
    GitHub 仓库：https://github.com/ethz-spylab/agentdojo?utm_source=chatgpt.com
    

阶段判断： **AI 安全开始从普通漏洞检测扩展到模型、Agent、工具调用和提示词攻击。**

### （三）、2025 年：自主 AI 渗透平台集中出现——Agent 自主执行

1.  **2025-01-06｜PentAGI**
    
    > 仓库创建：2025-01-06｜首次 Alpha：2025-01-07｜最近代码提交：2026-10-22｜最新 Release：v2.2.0（2026-10-05）
    > 
    > 多 Agent 自主渗透系统，采用研究、开发、执行等角色分工，集成安全工具、记忆系统、知识存储和 Docker 执行环境。
    
    GitHub 仓库：https://github.com/vxcontrol/pentagi?utm_source=chatgpt.com ·
    
    Release：https://github.com/vxcontrol/pentagi/releases?utm_source=chatgpt.com
    
2.  **2025-03-31 / 04｜CAI（Cybersecurity AI）**
    
    > 仓库创建：2025-03-31｜公开发布：2025-04｜最后公开开源版本：0.5.10（2025-12）｜归档：2026-08-28
    > 
    > 面向 AI 网络安全攻防的通用框架，支持 Agent、工具、模型和安全研究工作流。注意：该仓库现已归档，不再维护。
    
    GitHub 仓库
    
3.  **2025-07-10｜HexStrike AI**
    
    > 仓库创建：2025-07-10｜最近可确认代码提交：2026-08-03
    > 
    > 通过 MCP 将 AI Agent 与 150+ 安全工具连接，强调工具发现、参数优化、任务编排和自动化执行。它更接近安全工具编排层，而非独立完成所有工作的完整渗透引擎。
    
    GitHub 仓库：https://github.com/0x4m4/hexstrike-ai?utm_source=chatgpt.com
    
4.  **2025-08-05｜Strix**
    
    > 仓库创建：2025-08-05｜最近代码提交：2026-11-06｜最新 Release：v1.7.0（2026-10-05）
    > 
    > 面向 Web 和 API 应用的 AI 渗透工具，结合浏览器、代码理解、多 Agent 协作和漏洞验证，强调发现并证明真实漏洞。
    
    GitHub 仓库：https://github.com/usestrix/strix?utm_source=chatgpt.com
    
5.  **2025-09-27｜Shannon**
    
    > 仓库创建：2025-09-27｜最近代码提交：2026-11-06｜最新 Release：v3.5.0（2026-10-27）
    > 
    > 以白盒 Web/API 渗透为核心，通过源码分析发现攻击面，再利用运行环境执行验证。2026 年持续扩展代码分析、报告、CI/CD 和工作区能力。
    
    GitHub 仓库：https://github.com/KeygraphHQ/shannon?utm_source=chatgpt.com ·
    
    Release：https://github.com/KeygraphHQ/shannon/releases?utm_source=chatgpt.com
    
6.  **2025-05｜DeepTeam**
    
    > 首次公开 Release：2025-05-23｜最近 Release：v1.0.10（2026-10-16）｜仓库更新记录：2026-10-23
    > 
    > 专门测试 LLM、RAG 和 AI Agent 的红队框架，覆盖 Jailbreak、提示词注入、多轮攻击和隐私泄露等场景。
    
    GitHub 仓库：https://github.com/confident-ai/deepteam?utm_source=chatgpt.com ·
    
    PyPI 发布记录：https://pypi.org/project/deepteam/?utm_source=chatgpt.com
    

阶段判断： **从“AI 给出建议”走向“AI 自主规划、调用工具、验证漏洞、输出结果”。**

### （四）、2026 年：多 Agent、白盒与工程化——自主红队与持续验证

1.  **2026-07-02｜T3MP3ST**
    
    > 仓库创建：2026-07-02｜最近可确认代码提交：2026-09-08
    > 
    > 将现有 AI 编码 Agent 包装成红队执行框架，尝试复用 Claude Code、Codex、Ollama 等现有 Agent 或本地模型，组织侦察、利用和报告流程。
    
    GitHub 仓库：https://github.com/elder-plinius/T3MP3ST?utm_source=chatgpt.com
    
2.  **2026 年持续演进｜Shannon 3.x、PentAGI 2.x、Strix 1.x**
    
    > 代表性方向包括白盒分析与动态验证融合、多 Agent 角色协作、模型适配、沙箱隔离、会话恢复、CI/CD、自动化报告和持续测试。
    

阶段判断： **竞争重点逐步从“能否调用工具”转向“能否稳定完成攻击链、产出可信证据并融入安全运营”。**

## 二、主要项目发布时间与最近更新时间汇总

以下按首次公开时间排序。日期尽量采用仓库创建日、官方发布公告或 Release 记录；“最近更新”优先指可核实的代码提交或正式版本，而不是第三方网站抓取页面的刷新时间。

| 项目  | 首次公开/创建 | 最近可核实更新 | 项目定位 |
| --- | --- | --- | --- |
| PentestGPT | 2023-02 | 2026-07 代码提交 | AI 辅助/自主渗透 |
| Promptfoo | 2023-04 | 2026-11-07 | LLM 红队 |
| garak | 2023-05 | 2026-11-07 | LLM 漏洞扫描 |
| PyRIT | 2024-02 | 2026-09 版本记录 | AI 红队框架 |
| AgentDojo | 2024-02 | 2026-06-02 | Agent 攻防基准 |
| PentAGI | 2025-01 | 2026-10-22 | 自主多 Agent 渗透 |
| CAI | 2025-03 | 2026-08-28 归档 | 安全 AI 框架 |
| DeepTeam | 2025-05 | 2026-10-23 | LLM/Agent 红队 |
| HexStrike AI | 2025-07 | 2026-08-03 | MCP 安全工具编排 |
| Strix | 2025-08 | 2026-11-06 | 自主应用渗透 |
| Shannon | 2025-09 | 2026-11-06 | 白盒 AI 渗透 |
| T3MP3ST | 2026-07 | 2026-09-08 | 多 Agent 红队编排 |

> 需要特别注意： PentestGPT 的 GitHub 仓库创建时间、PyPI 发布时间不是同一个日期；CAI 已归档；T3MP3ST 的仓库最近代码提交与第三方页面刷新时间也不是一回事。不能用“网页显示最近更新”替代 Git Commit 时间。

## 三、AI 渗透技术演进路线——从 Copilot 到 Autonomous Pentester

**2023｜AI Copilot——人操作，AI 辅助**

> 理解任务、解释命令、生成 POC、分析扫描结果。

**2024｜AI Red Team——AI 规划，自动测试**

> 多轮攻击、任务拆解、提示词注入、攻击效果评分。

**2025｜Autonomous Pentest Agent——AI 规划，Agent 执行**

> 多 Agent、MCP、工具调用、攻击链编排、漏洞验证。

**2026+｜AI Security Operations——自主测试，持续闭环**

> 白盒+黑盒融合、攻击图谱、风险量化、自动复测、持续验证。

## 四、值得重点研究的项目及可借鉴模块

| 项目  | 最值得拆解的能力 | 借鉴价值 |
| --- | --- | --- |
| PentestGPT | 任务树、交互式推理、上下文管理 | 渗透任务规划 |
| PentAGI | 多 Agent 分工、记忆、执行沙箱 | 云端指挥中心与本地执行 |
| CAI | 安全 Agent 框架、轨迹记录、评估 | Agent 运行时与效果评测 |
| HexStrike AI | MCP 工具封装、工具路由 | Skill/Tool/MCP 生态 |
| Strix | 浏览器 Agent、漏洞验证、报告 | Web/API 自主渗透 |
| Shannon | 源码分析、攻击面推导、动态利用 | 白盒与黑盒融合 |
| T3MP3ST | 复用外部编码 Agent、红队编排 | 模型解耦与本地化部署 |
| PyRIT / DeepTeam | AI 应用攻击、攻击策略和评分 | AI 大模型风险评估 |

## 五、AI 渗透平台整体技术格局

### （一）、第一梯队：自主渗透平台

**1、Strix：自主发现、利用验证、PoC**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d82d14778ea87f62.png)

**2、Shannon：白盒代码分析 + 动态验证**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7638e2b487e4f779.png)

**3、PentAGI：多 Agent + 工具编排**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/087e9fc2b881c919.png)

**4、PentestGPT：LLM 推理 + 渗透任务规划**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b936ac7e1269791e.png)

### （二）、第二梯队：AI 红队与工具编排

-   HexStrike AI：MCP + 大量安全工具。
    
-   CAI：模块化网络安全 Agent 框架。
    
-   CyberStrikeAI：AI 原生安全执行平台。
    
-   RedAmon：AI 红队自动化。
    
-   T3MP3ST：多 Agent 红队框架。
    

### （三）、第三梯队：AI 安全测试与辅助工具

-   promptfoo：AI 应用红队测试。
    
-   garak：大模型漏洞扫描。
    
-   Osmedeus：自动化攻击面工作流。
    
-   hackingBuddyGPT：LLM 辅助主机渗透。
    

> 参考的开源项目排行榜包括 DeepCyber AI Pentesting Landscape、AI Pentest Tools Leaderboard 和 Awesome AI Pentesting。它们对项目范围的定义并不完全一致，因此本报告将采用广义 AI 渗透技术生态口径。

## 六、GitHub 重点项目 Top 30

下面按研究价值、社区热度和技术相关性整理。

### A. 自主 AI 渗透平台

| 序号  | 项目  | 参考 Star | 核心定位 |
| --- | --- | --- | --- |
| 1   | Strix | 60k+ | 自主 Web/API 渗透 |
| 2   | Shannon | 47k+ | 白盒 AI 渗透 |
| 3   | PentAGI | 22k+ | 多 Agent 自主渗透 |
| 4   | PentestGPT | 15k+ | LLM 渗透任务规划 |
| 5   | HexStrike AI | 11k+ | MCP 安全工具编排 |
| 6   | Cybersecurity AI (CAI) | 9k+ | 模块化安全 Agent |
| 7   | RedAmon | 3k+ | AI 红队自动化 |
| 8   | METATRON | 4k+ | 离线本地 AI 渗透 |
| 9   | Raptor | 3k+ | 进攻性安全自动化 |
| 10  | CyberStrikeAI | 6k+ | AI 原生安全执行 |

### B. AI 红队、攻击面与自动化框架

| 序号  | 项目  | 参考 Star | 核心定位 |
| --- | --- | --- | --- |
| 11  | T3MP3ST | 5k+ | 多 Agent 红队 |
| 12  | Osmedeus | 6k+ | 自动化安全工作流 |
| 13  | hackingBuddyGPT | 1.2k+ | AI 主机渗透 |
| 14  | NeuroSploit | 1k+ | AI 自动化渗透 |
| 15  | Nebula | 1k+ | AI 安全测试 |
| 16  | Xalgorix | 800+ | AI Web DAST |
| 17  | Nettacker | 5k+ | 自动化网络安全扫描 |
| 18  | Deadend CLI | 300+ | AI 渗透命令行工具 |

### C. AI 安全测试、LLM 红队和底层能力

| 序号  | 项目  | 参考 Star | 核心定位 |
| --- | --- | --- | --- |
| 19  | promptfoo | 23k+ | LLM 红队与安全评估 |
| 20  | garak | 8k+ | LLM 漏洞扫描 |
| 21  | PyRIT | 5k+ | AI 红队测试框架 |
| 22  | Giskard | 5k+ | AI 模型安全测试 |
| 23  | FuzzyAI | 1k+ | LLM 对抗测试 |
| 24  | LLMFuzzer | 1k+ | 大模型模糊测试 |
| 25  | VulnHuntr | 2k+ | AI 漏洞挖掘 |
| 26  | AIxCC CRS | 项目集合 | AI 自动漏洞发现与修复 |
| 27  | Backslash | 1k+ | AI 应用安全测试 |
| 28  | ART | 5k+ | AI 对抗安全测试 |
| 29  | Mindgard | 社区数据不一 | AI 模型红队 |
| 30  | OWASP Nettacker | 5k+ | 自动化攻击面探测 |

排名解释：部分是 AI 应用安全测试基础设施，而非传统网络渗透 Agent；

## 七、核心平台深度分析：架构、功能与应用场景

以下重点分析真正具有产品化价值的项目。尤其关注：Agent 如何拆分、如何调用工具、如何形成攻击链、如何验证漏洞，以及如何控制 Token 成本。

### （一）、TOP级AI渗透工具/平台

#### 1\. Strix

> 重点推荐研究、Web/API、多智能体

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/03b8ac18a99c7344.png)

-   GitHub：usestrix/strix
    
-   参考 Star：约 4 万至 6 万以上，不同日期快照差异较大。
    
-   介绍： **开源自主 AI 渗透测试工具，通过 Agent 对 Web 应用和 API 进行安全测试，以真实执行和漏洞证据为核心。**
    
-   架构：
    

-   目标管理与测试范围定义
    
-   侦察 Agent
    
-   漏洞分析 Agent
    
-   浏览器与代码执行环境
    
-   漏洞利用及验证 Agent
    
-   报告和修复建议模块
    

-   功能清单：
    

-   Web 应用自动侦察
    
-   API 接口测试
    
-   浏览器自动化
    
-   动态漏洞验证
    
-   PoC 生成
    
-   多模型调用
    
-   漏洞报告
    
-   CI/CD 集成
    

-   使用场景： **企业 Web 系统、API 安全测试、开发阶段安全验证、授权漏洞赏金测试**。
    
-   发展方向：从单次渗透测试转向持续应用安全验证，强化业务逻辑、身份权限和自动修复。
    
-   优点：强调实际漏洞验证，而不只是输出 AI 推测；适合研究 AI 自主执行与验证闭环。
    
-   局限：主要聚焦应用安全，不能直接等同于覆盖企业全部内网、AD、云和终端的综合渗透平台。
    
-   Token 消耗：预计中等至高。复杂 Web 测试可达到数十万至数百万 Token，具体取决于页面数量、模型调用和上下文保留。
    

#### 2\. Shannon

> 白盒渗透方向重点研究

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f77c63004802cf20.png)

-   GitHub：KeygraphHQ/shannon
    
-   参考 Star：约 4.5 万以上。
    
-   介绍：以源代码分析为入口，结合动态应用测试和真实漏洞利用的 AI 渗透平台。
    
-   架构：
    

-   Source Code Analysis：源代码分析。
    
-   Recon Agent：运行环境侦察。
    
-   Vulnerability Analysis：漏洞候选识别。
    
-   Finding Reconciliation：发现合并与去重。
    
-   Exploitation Agent：实际利用验证。
    
-   Reporting：输出报告。
    

-   功能清单：
    

-   源代码结构分析
    
-   入口和数据流识别
    
-   SQL 注入、XSS、SSRF 测试
    
-   身份认证与授权检查
    
-   动态攻击验证
    
-   漏洞证据输出
    
-   PDF、Markdown、SARIF 报告
    
-   GitHub Actions、GitLab CI/CD
    

-   使用场景：代码审计、研发安全、上线前安全测试、DevSecOps。
    
-   发展方向：从单仓库渗透发展为企业级持续 AppSec，增强跨仓库分析、业务逻辑分析、修复和复测。
    
-   优点：代码分析与真实攻击相结合；明确区分推测性问题和实际利用成功的问题。
    
-   局限：开源版本偏白盒，需要源码和可运行目标环境；不能简单替代黑盒内网渗透。
    
-   Token 消耗：中高至高。代码规模、数据流复杂度和并行 Agent 数量是主要影响因素。
    

官方架构明确采用代码分析、动态侦察、发现合并、利用验证和报告的分阶段流程。

GitHub+1

#### 3\. PentAGI

> 综合型平台重点研究

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/91ec99b85beb24a4.png)

-   GitHhb：vxcontrol/pentagi
    
-   参考 Star：约 2 万以上。
    
-   介绍：基于多智能体架构的自主渗透测试系统，支持复杂安全任务的规划、执行和知识沉淀。
    
-   架构：
    

-   Web UI
    
-   Go 后端
    
-   多 Agent 调度层
    
-   LLM 推理层
    
-   Docker 隔离执行环境
    
-   PostgreSQL / pgvector
    
-   Neo4j 知识图谱（可选）
    
-   Langfuse / OpenTelemetry 可观测性组件
    

-   功能清单：
    

-   自然语言任务输入
    
-   自动任务分解
    
-   Agent 协作
    
-   工具调用
    
-   Nmap、Metasploit、sqlmap 等工具集成
    
-   执行结果记忆
    
-   知识图谱
    
-   任务执行追踪
    
-   Web 管理界面
    
-   REST / GraphQL API
    

-   使用场景：综合授权渗透、实验室攻击模拟、复杂网络安全任务研究。
    
-   发展方向：增强长期记忆、攻击图谱、Agent 协作和企业级任务治理。
    
-   优点：架构完整，基础设施比较丰富；适合研究完整 AI 渗透平台的系统设计。
    
-   局限：部署复杂，多个服务带来运维成本；自主执行需要严格隔离。
    
-   Token 消耗：高。多 Agent 协作、反复规划和历史记忆检索会增加消耗。
    

其官方架构将执行 Agent 与业务后端隔离，工具运行在独立 Docker Sandbox 中，知识图谱与可观测性可以作为扩展组件。

PentAGI+1

#### 4\. PentestGPT

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/211cf632d3f97de1.png)

-   GitHub：GreyDGL/PentestGPT
    
-   参考 Star：约 1.5 万。
    
-   介绍：较早期具有代表性的 LLM 渗透测试 Agent，核心思想是让大模型理解渗透任务、拆分步骤、根据执行结果持续调整策略。
    
-   架构：
    

-   用户交互层
    
-   推理与任务规划层
    
-   测试任务树
    
-   工具执行层
    
-   上下文记忆层
    
-   结果总结层
    

-   功能清单：
    

-   渗透测试任务规划
    
-   自动化任务拆分
    
-   命令生成与辅助执行
    
-   上下文维护
    
-   渗透过程推理
    
-   测试结果分析
    
-   CTF 辅助
    
-   人机交互
    

-   使用场景：渗透工程师辅助、CTF、安全研究和教学。
    
-   发展方向：更高自主性、多模型支持、可恢复任务执行。
    
-   优点：任务规划思路清晰，研究价值高。
    
-   局限：更偏 Agent 框架，不能认为安装后就具备完整商业渗透平台能力。
    
-   Token 消耗：中高。长对话、反复规划和历史上下文容易产生额外费用。
    

#### 5\. HexStrike AI

工具武器库方向重点研究

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/afa8ec07382f697b.png)

-   GitHub：0x4m4/hexstrike-ai
    
-   参考 Star：约 1 万以上。
    
-   介绍：通过 MCP 将大量安全工具接入 AI Agent，让通用大模型可以进行工具选择、参数决策和执行编排。
    
-   架构：
    

-   Claude / GPT 等客户端
    
-   MCP Server
    
-   智能决策引擎
    
-   专业 Agent
    
-   工具适配层
    
-   结果分析和展示
    

-   功能清单：
    

-   150+ 安全工具集成（项目自述）
    
-   工具自动选择
    
-   参数优化
    
-   漏洞情报
    
-   浏览器自动化
    
-   任务管理
    
-   工具执行
    
-   结果汇总
    

-   使用场景：安全工具 AI 化、渗透测试工具编排、研究人员的统一工具入口。
    
-   发展方向：MCP 生态扩展、工具调用治理、专业 Agent 分工。
    
-   优点：工具集成能力强，适合解决 AI 有推理能力但缺乏专业执行能力的问题。
    
-   局限：工具数量不等于自主渗透能力，仍需要解决执行顺序、结果判断和攻击链推理问题。
    
-   Token 消耗：中等。工具执行本身通常不消耗 Token，工具结果解释和多轮决策才消耗 Token。
    

其公开架构展示了 MCP、12+ 自主 Agent、智能决策引擎与 150+ 工具之间的关系。

GitHub

#### 6\. CAI

-   GitHub：aliasrobotics/cai
    
-   参考 Star：约 9,000–10,000。
    
-   介绍：模块化 Cybersecurity AI 框架，适合安全研究人员构建不同类型的安全 Agent。
    
-   架构：Agent Runtime → LLM Provider → 工具调用 → 任务记忆 → 执行反馈。
    
-   功能：多模型、Agent 开发、工具集成、红队实验、漏洞研究、任务编排。
    
-   场景：研究实验、定制化安全 Agent、AI 安全能力验证。
    
-   发展方向：模块化 Agent、专业安全模型、基准测试。
    
-   优点：灵活、研究生态丰富。
    
-   局限：需要特别注意：公开资料显示 CAI 于 2026 年 8 月归档，不建议未经维护评估就作为长期生产底座。
    
-   Token：中高，取决于 Agent 数量及模型调用次数。
    

#### 7\. CyberStrikeAI

-   GitHub：Ed1s0nZ/CyberStrikeAI
    
-   参考 Star：约 5,000–6,000。
    
-   介绍：Go 语言构建的 AI 原生网络安全测试平台。
    
-   架构：交互层 → AI 调度 → Agent → 工具执行 → 结果处理。
    
-   功能：安全任务管理、Agent 执行、工具调用、测试结果分析。
    
-   场景：AI 安全平台研发、自动化测试、工具集成。
    
-   发展方向：多 Agent、模型接入、企业化部署。
    
-   优点：Go 生态，适合研究服务化和工程化。
    
-   局限：需进一步通过实际测试验证漏洞覆盖和自主执行质量。
    
-   Token：中高。
    

#### 8\. RedAmon

-   GitHub：samugit83/redamon
    
-   参考 Star：约 2,000–3,000。
    
-   介绍：面向 AI 红队自动化的 Agent 框架。
    
-   架构：任务规划 → RAG/知识检索 → Agent 协作 → 工具执行 → 结果记录。
    
-   功能：红队任务编排、知识库、工具调用、自动化执行、结果整理。
    
-   场景：红队任务研究、自动化攻击流程实验。
    
-   发展方向：攻击知识图谱、任务记忆、工具调用标准化。
    
-   优点：适合研究红队 Agent 与知识库的结合。
    
-   局限：需要验证不同目标环境下的稳定性。
    
-   Token：中高至高。
    

#### 9\. METATRON

-   GitHub：sooryathejas/METATRON
    
-   参考 Star：约 4,000。
    
-   介绍：面向 Parrot OS 的离线 AI 渗透助手，强调本地模型和本地运行。
    
-   架构：本地 LLM → 渗透任务 Agent → 本地安全工具 → 结果分析。
    
-   功能：本地推理、渗透辅助、工具调用、安全任务分析。
    
-   场景：内网隔离环境、涉密安全研究、本地化部署。
    
-   发展方向：本地模型增强、离线知识库、多 Agent。
    
-   优点：降低云模型依赖，有利于数据不出域。
    
-   局限：本地模型性能、显存资源和工具调用准确性是主要制约。
    
-   Token：不产生云 API Token 费用，但仍消耗本地模型推理 Token 和 GPU 资源。
    

#### 10\. T3MP3ST

-   GitHub：elder-plinius/T3MP3ST
    
-   参考 Star：约 4,000–6,000。
    
-   介绍：自主红队元框架，能够利用 Claude Code、Codex、Ollama 等本地或外部 AI 编码 Agent。
    
-   架构：任务入口 → AI 编码 Agent → 安全技能 → 工具执行 → 结果分析。
    
-   功能：红队任务自动化、Agent 调用、漏洞研究、技能扩展。
    
-   场景：红队研究、AI 编码 Agent 的安全能力扩展。
    
-   发展方向：通用 Agent 与专业安全技能深度融合。
    
-   优点：可以复用成熟编码 Agent 的推理和工具能力。
    
-   局限：依赖外部 Agent 的能力和执行权限，平台自身不一定具备完整的渗透执行内核。
    
-   Token：中高至高，尤其取决于底层编码 Agent 的调用和上下文。
    

以上 10 个项目代表了目前最值得研究的几条技术路线：自主执行、白盒分析、多 Agent、MCP 工具调用 、本地模型和红队自动化。

GitHub+3

### （二）、11–30 名项目分析

这部分更适合研究特定能力、补充专业 Agent，或作为自研平台的组件。

| 项目 / GitHub | 架构与核心功能 | 使用场景及优点 | 局限及发展方向 |
| --- | --- | --- | --- |
| 11\. PyRIT | Python 风险识别框架；多轮对话、攻击策略、评分器、数据集 | AI 模型红队，适合多轮对抗测试 | 主要测试 AI 系统本身，不是传统网络渗透；向多模态和自动化评估发展 |
| 12\. GH05TCREW/pentestagent | 黑盒渗透 Agent；LLM、侦察、工具调用、结果分析 | Web 黑盒安全测试，适合研究自主测试 | 需要验证复杂业务场景下的准确率和执行稳定性 |
| 13\. VulnHuntr | LLM 驱动的代码漏洞发现与数据流分析 | 开源项目漏洞研究、代码审计 | 侧重漏洞发现，不是完整攻击执行平台 |
| 14\. DeepTeam | 多种 LLM 攻击模拟器、漏洞检测器和评估器 | Agent、RAG、LLM 应用安全测试 | 面向 AI 应用安全，不覆盖传统网络渗透 |
| 15\. Pentest-Swarm-AI | Go + 蜂群式 Agent + 黑板协作 + ReAct | 多 Agent 协作渗透、分布式任务研究 | 需要验证蜂群调度的成本和任务收敛性 |
| 16\. pentest-ai-agents | Claude Code SubAgent + 安全任务分工 | 将通用编码 Agent 扩展为安全研究助手 | 依赖底层编码 Agent，平台独立性有限 |
| 17\. Cairn | 状态空间搜索与 Agent 决策 | 自主渗透路径规划和搜索研究 | 需要关注搜索空间爆炸和模型决策效率 |
| 18\. agentic_security | Agent 工作流 + LLM 安全测试 | Agentic 应用的漏洞检测和安全评估 | 更偏 AI Agent 安全，而不是完整传统渗透 |
| 19\. guardian-cli | Gemini + LangChain + CLI | 命令行安全测试和 AI 渗透辅助 | 对模型供应商和工具接口有依赖 |
| 20\. Buttercup | AIxCC 相关 Cyber Reasoning System，代码分析、漏洞发现和修复 | 自动化漏洞挖掘、代码修复研究 | 更偏代码安全推理系统，不是通用网络渗透平台 |
| 21\. AutoPentestX | AI Agent + 自动化测试工作流 | 渗透测试流程自动化、报告生成 | 需要独立验证漏洞检测质量和实际利用能力 |
| 22\. pentest-ai | MCP + 多专业 Agent + 安全工具适配 | 通用 AI Agent 接入安全工具，适合 MCP 研发 | 工具数量和 Agent 数量不能直接代表实际攻击成功率 |
| 23\. promptmap | Prompt Injection 测试引擎 | LLM 应用提示词注入测试 | 专注 AI 应用攻击面，不属于传统网络渗透 |
| 24\. CyberStrike | AI Agent + 安全技能库 + 安全知识框架 | 安全技能调度、AI 安全工作流 | 需关注技能质量、授权边界和执行可靠性 |
| 25\. hackingBuddyGPT | 轻量 LLM Agent + SSH/命令行工具 | Linux 主机渗透、权限分析、安全研究 | 轻量研究框架，不是综合管理平台 |
| 26\. pentest-copilot | 浏览器端 AI 辅助工具 | 渗透工程师浏览器辅助、测试效率提升 | 更偏辅助交互，自动化执行能力有限 |
| 27\. Nebula | AI 渗透助手 + 自动侦察 + 笔记 + 漏洞分析 | 渗透测试过程辅助、信息整理 | 需要进一步评估自主攻击链能力 |
| 28\. LuaN1aoAgent | 自主 AI 渗透 Agent | 自主任务执行、XBOW 类基准研究 | 需要验证公开基准成绩的复现条件和实际环境泛化能力 |
| 29\. promptfoo | YAML 测试配置 + 模型调用 + 攻击插件 + 评分器 | LLM 红队、Prompt Injection、CI/CD 安全测试 | 不是传统网络渗透平台，适合 AI 应用风险评估 |
| 30\. garak | Probe 探针 + Generator 模型适配 + Detector 检测 | 大模型漏洞扫描、越狱、数据泄露测试 | 更像 AI 模型漏洞扫描器，而不是自主渗透 Agent |

补充说明：

-   PyRIT、DeepTeam、promptfoo、garak 主要解决的是如何攻击和评估 AI 系统。
    
-   PentestGPT、Pentest-Swarm-AI、Cairn 等主要研究如何利用 AI 执行安全测试任务。
    
-   VulnHuntr、Buttercup 主要关注如何利用 AI 发现代码漏洞。
    
-   HexStrike、pentest-ai 更值得研究如何把安全工具能力封装为 Agent 可以调用的标准接口。
    

这几条路线不应混为一谈。项目清单与 Star 快照参考 2026 年 7 月的 Offensive AI 项目索引，并结合近期项目资料补充。

GitHub+2

## 八、AI 渗透平台的架构对比

这是整个研究中最有价值的部分。30 个项目虽然定位不同，但可以归纳为六种典型架构。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/cb945280cb7ece65.png)

## 九、Token 消耗分析

这是 AI 渗透平台商业化时必须重点考虑的问题。

首先需要区分：

-   LLM Token：输入、输出、推理和工具结果进入模型时消耗。
    
-   工具执行资源：Nmap、浏览器、扫描器、POC 等本身通常不按 LLM Token 计费。
    
-   上下文成本：大量工具输出、历史对话和重复分析会增加 Token。
    
-   多 Agent 成本：Agent 之间的任务传递、重复分析和交叉验证会增加调用量。
    

### （一）、各类架构 Token 消耗对比

以下为研发预算估算，不是项目官方公布的实测账单。统一以一次中等规模授权测试为分析对象，目标为一个具有一定数量页面、API 和业务功能的 Web 应用。

| 架构类型 | 单次测试估计 Token | 消耗等级 |
| --- | --- | --- |
| 单 Agent 工具调用 | 5万–30万 | 低至中 |
| AI 辅助命令行 | 5万–40万 | 低至中 |
| MCP 工具编排 | 10万–50万 | 中   |
| 多 Agent 协同 | 30万–200万 | 高   |
| 白盒 + 黑盒融合 | 50万–300万 | 高   |
| 多 Agent 深度自主渗透 | 100万–500万以上 | 很高  |
| 本地模型 | 不计云 API Token 账单 | 计算资源成本 |

这些区间是规划用的情景估算，不能据此推断某个具体项目每次测试的实际用量。

### （二）、Token 成本计算公式

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/50a83744be7a8420.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0ad10163dbecc610.png)

其中：

假设一次任务：

| 指标  | 数量  |
| --- | --- |
| 输入 Token | 100 万 |
| 输出 Token | 20 万 |
| 输入价格（假设） | $1 / 百万 |
| 输出价格（假设） | $4 / 百万 |
| 单次成本 | $1.80 |

以上仅为计算演示，非任何模型的当前报价。

### （三）、 如何降低 Token 消耗

| 优化措施 | 实现方式 | 预期收益 |
| --- | --- | --- |
| 模型分层 | 小模型做分类，大模型做复杂推理 | 降低推理成本 |
| 工具结果压缩 | 输出结构化 JSON，而非完整日志 | 减少输入 Token |
| RAG 检索 | 只加载相关漏洞知识和 Skill | 控制上下文 |
| Agent 分工 | 只在必要时启动专业 Agent | 减少重复调用 |
| 任务状态持久化 | 保存进度，避免重复规划 | 降低重复消耗 |
| 缓存  | 缓存资产、指纹和历史结果 | 避免重复分析 |
| 确定性验证 | 使用脚本、规则和测试器验证结果 | 降低模型调用 |
| 失败终止机制 | 设置预算、重试次数和超时 | 避免无限循环 |

关键结论：AI 渗透平台不能只追求 Agent 数量，而要追求单位 Token 能够产生多少个真实、可复现、可整改的漏洞证据。

## 十、30 个项目的优缺点及发展方向总结

| 技术方向 | 代表项目 | 核心优势 | 主要短板 | 未来发展 |
| --- | --- | --- | --- | --- |
| 自主渗透 | Strix、PentAGI | 自动规划、执行、验证 | 复杂攻击链稳定性 | 长时间自主任务 |
| 白盒渗透 | Shannon、VulnHuntr | 代码和数据流分析 | 依赖源码及环境 | 代码与运行时融合 |
| 多 Agent | RedAmon、Pentest-Swarm | 专业分工 | 协作成本高 | Agent 自组织 |
| 工具编排 | HexStrike、pentest-ai | 工具生态丰富 | 工具结果质量不一 | MCP 标准化 |
| 本地化 | METATRON、PentestGPT 本地模型方案 | 数据自主可控 | 模型能力及硬件 | 专业安全模型 |
| AI 红队 | PyRIT、promptfoo | 测试方法和评估能力强 | 不覆盖传统网络渗透 | 多模态、Agent 安全 |
| 漏洞挖掘 | VulnHuntr、Buttercup | 代码漏洞发现 | 利用验证能力有限 | 漏洞发现到修复 |

#### （一）、 未来 AI 渗透平台的六大发展方向

**方向一：从单点漏洞检测走向攻击链推理**

从发现一个漏洞，升级到识别资产关系、权限关系、漏洞组合和攻击路径，形成 Attack Graph。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c8f85f233c1a9fd3.png)

**方向二：从单 Agent 走向多智能体协作**

Planner、Recon、Web、Network、AD、Exploit、Verifier 等专业 Agent 协同工作。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8a94b17e5ab80e89.png)

**方向三：从固定工具走向 Skill + MCP 生态**

工具标准化、技能化、知识化，让安全能力能够被不同 Agent 复用。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/15106eda8ace79e9.png)

**方向四：从云端模型走向云边端协同**

云端负责复杂推理，本地大脑负责数据分析，边缘 Agent 负责授权环境内的执行。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3f450200dc8ae4c2.png)

**方向五：从渗透测试走向持续安全验证**

风险发现、攻击验证、风险量化、整改、自动复测形成闭环。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/516bf7b093f56423.png)

**方向六：从模型调用走向 Token 经济管理**

模型路由、Token 预算、上下文压缩、任务缓存和成本收益分析成为平台核心能力。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1135bd937ca981ee.png)

## 附件：针对 AI 自主渗透平台的产品研发建议

结合上述项目，我认为不应该简单复制某一个开源产品，而应该吸收不同项目的优势，形成独立的产品架构。

### （一）、 建议对标关系

| 星海研发模块 | 对标项目 | 借鉴内容 |
| --- | --- | --- |
| AI 指挥中心 | PentAGI | 多 Agent 调度、任务管理 |
| AI 推理决策引擎 | PentestGPT | 任务规划、推理和状态管理 |
| 白盒分析引擎 | Shannon | 代码分析与运行时验证 |
| AI 工具武器库 | HexStrike | MCP、工具注册、参数适配 |
| AI 红队 Agent | Strix、RedAmon | 自主侦察、漏洞验证 |
| 离线本地大脑 | METATRON | 本地模型、离线推理 |
| AI 漏洞知识库 | VulnHuntr | 漏洞知识、代码分析 |
| AI 大模型安全评估 | PyRIT、garak | AI 应用和模型安全评估 |

### （二）、推荐的AI渗透平台总体架构

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2cc725bead36bb15.png)

### （三）、 建议的功能建设优先级

| 阶段  | 建设重点 | 目标  |
| --- | --- | --- |
| P1  | 多 Agent 调度、工具编排、任务状态机 | 建立可运行平台 |
| P2  | 攻击图谱、漏洞验证、证据管理 | 建立自主渗透能力 |
| P3  | 本地模型、Skill、MCP、Token 管理 | 建立规模化能力 |
| P4  | 持续自动化红队、自动整改复测 | 建立运营闭环 |
| P5  | 行业知识、专业 Agent、商业订阅 | 建立产品竞争壁垒 |

最值得投入的不是再增加 100 个安全工具，而是形成四个真正的核心能力：

1.  AI 能够正确理解目标环境。
    
2.  AI 能够自主规划合理的测试路径。
    
3.  AI 能够真实验证漏洞并形成证据。
    
4.  AI 能够持续跟踪风险整改并自动复测。
    

### （四）、 最终建议：优先拆解的 8 个项目

建议优先级

| 优先级 | 项目  | 重点研究内容 |
| --- | --- | --- |
| 1   | Strix | 自主渗透执行与验证 |
| 2   | PentAGI | 多 Agent 系统架构 |
| 3   | Shannon | 白盒 + 黑盒融合 |
| 4   | HexStrike AI | MCP 工具武器库 |
| 5   | PentestGPT | 任务规划与推理 |
| 6   | RedAmon | 红队 Agent 协作 |
| 7   | METATRON | 本地化 AI 渗透 |
| 8   | Pentest-Swarm-AI | 蜂群 Agent 协作 |

### （五）、AI自主渗透的启示

> 从整个开源生态来看，AI 渗透平台正在从传统的： **LLM + 安全工具**
> 
> 发展为： **多模型 + 多智能体 + 专业 Skill + MCP 工具生态 + 攻击知识图谱 + 漏洞验证闭环。**

对AI自主渗透来说，最有价值的产品路线是：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/fb658acaf914b029.png)

> **参考资料及排名口径**
> 
> -   DeepCyber AI Pentesting Landscape：项目能力和技术成熟度比较。
>     
> -   Offensive AI Agentic Landscape：56 个 Agent 项目、模型、Skill、MCP 和 Benchmark 索引。项目 Star 快照为 2026-07-20。
>     
> -   Ostorlab：9 Open-Source AI Pentesting Tools Compared：2026-10-06 项目快照及实际测试比较。
>     
> -   ParanoAI AI Pentest Tools Leaderboard：动态开源 AI 安全工具目录，按照 Star 和 Fork 加权排序。
>     

结合这些项目的演进，可以把下一阶段产品建设归纳为五个方向：

1.  统一任务规划引擎： 从单次命令执行转为目标驱动，自动生成侦察、验证、利用和复测任务树。
    
2.  多 Agent 专业分工： 资产发现 Agent、Web/API Agent、内网 Agent、代码审计 Agent、漏洞验证 Agent、报告 Agent。
    
3.  工具与 Skill 标准化： 将现有安全工具沉淀为标准 Skill，通过 MCP 统一调用、参数校验、执行审计。
    
4.  云端大脑 + 本地大脑 + 边缘 Agent： 云端负责任务规划和知识共享，本地负责敏感数据分析与工具执行，边缘节点负责授权范围内的任务执行。
    
5.  建立可量化的闭环能力： 不以 Agent 调用了多少工具作为核心指标，而以有效漏洞发现率、真实 POC 成功率、误报率、攻击链完成率、单位 Token 成本和自动复测成功率作为评价指标。
    

**数据严谨性说明：** 上述 30 项是广义 AI 渗透、红队和相关安全测试生态的筛选清单，并非 2026-11-08 经 GitHub API 实时核验后的严格 Star 排名。前述历史快照存在日期差异，部分项目的能力描述来自项目自述，Token 消耗均为估算。尤其是 CAI 的归档状态、项目维护活跃度、许可证及实际执行效果，应在正式选型前逐仓库核验。

### 后续文档：

商业AI自主渗透平台

AI渗透工具集合 · 目录
