---
title: Tencent Xuanwu Atuin AI on CyberGym - Tencent Xuanwu Lab
source: https://xlab.tencent.com/en/2026/07/02/xuanwu-atuin-cybergym/
source_host: xlab.tencent.com
clip_date: 2026-09-25T10:22:48+08:00
trace_id: f2c361c5-b47a-4c01-afeb-8a7363950376
content_hash: 5065a6187e98caf820d060d627ea5f500ba6cfbcecfcbc9884ef5fb1b6d8252e
status: synced
tags:
  - 漏洞分析
  - AI辅助逆向
series: null
feed_source: 腾讯玄武 Xuanwu Lab EN
ai_summary: 腾讯玄武 Atuin AI 以 GLM-5.1 在 CyberGym Level 1 解出 1,265/1,506 题，pass@1 84.0%，同模型下比 Claude Code 报告的 68.7% 高 15.3 个百分点。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3e675244-d011-8193-9327-c38c85f53783
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 腾讯玄武 Atuin AI 以 GLM-5.1 在 CyberGym Level 1 解出 1,265/1,506 题，pass@1 84.0%，同模型下比 Claude Code 报告的 68.7% 高 15.3 个百分点。
> 
> - **评测设置：** CyberGym 含 1,506 个真实项目的历史 fuzzing 漏洞；默认 Level 1 提供漏洞源码与高层漏洞描述，要求复现并产出可用 PoC，不提供补丁后二进制或补丁 diff。
> - **判定与环境：** pass@1 按单条 agent 轨迹计；任务成功须由 CyberGym 判定最终 PoC 使漏洞二进制崩溃、修复后二进制不崩溃。每个任务配 Docker 镜像，装 gdb 并放入官方漏洞二进制，可动态测试调试。
> - **系统设计归因：** 提升来自 manager/subagent 编排、SOP 流程控制、TODO 与 workflow hooks 防停滞漂移，以及根因分析、结构化调试器使用、分层输入构造等安全技能；该系统并非专为 CyberGym 设计。
> - **网络与合规：** 未技术封锁联网，改用提示限制与工具调用级审查；违规外查轨迹作废重跑，另人工抽检 50 条 AI 判为干净的成功轨迹，未发现额外违规查找。
> - **重跑与修正：** 仅基础设施失败（162）与违规外部查找（127）两类轨迹重跑；初版 85.1% 因部分使用服务端补丁后反馈不合规，改为内部 reviewer 校验后最终为 84.0%。

We evaluated GLM-5.1-powered Xuanwu Atuin AI on the CyberGym Level 1 benchmark. It solved **1,265 of 1,506 tasks**, achieving **84.0% pass@1**. Using the same underlying model, Zhipu AI reported a **68.7% pass@1** result with Claude Code. The two results differ by **15.3 percentage points**, suggesting that system design, cyber-relevant skills, and workflow control can add substantial capability beyond the base model alone.

## About Xuanwu Atuin AI

Xuanwu Atuin AI is a multi-agent security analysis system for discovering, analyzing, and reproducing software vulnerabilities with an emphasis on both precision and coverage. It reasons over source code, binaries, and JavaScript bundles to produce concrete exploit evidence. In general security-analysis workflows, it coordinates specialized agents for target modeling, code analysis, vulnerability reasoning, exploit construction, verification, and review, while maintaining structured campaign context and reusable security knowledge.

Xuanwu Atuin AI was not designed specifically for CyberGym. Its performance comes from general mechanisms for vulnerability investigation, PoC input construction, and workflow control that transfer well to this benchmark setting.

### Multi-Agent Orchestration

At the core is a manager/subagent architecture. The manager maintains campaign state, tracks evidence gaps, failed hypotheses, crash-signature mismatches, and PoC-target mismatches, then decomposes the task into security-analysis stages and assigns work to subagents equipped with different skill plugins.

### SOP Adherence and Workflow Control

Xuanwu Atuin AI encodes expert standard operating procedures (SOPs) so the system does not rely on a single ad hoc model response. Take vulnerability verification as an example: the SOP keeps the work organized around environment understanding, target-path confirmation, PoC iteration, and final evidence quality. This helps the agent keep debugging tied to the assigned vulnerability, preserve useful partial progress across failed attempts, and avoid drifting toward nearby crashes or unrelated inputs.

To improve instruction-following and SOP adherence, Xuanwu Atuin AI uses workflow controls for long-running agent tasks. Agents maintain TODOs that track the current plan, completed steps, and remaining blockers, while workflow hooks monitor for stalling or drift and remind subagents to return to the intended process.

### CyberGym-Relevant Skills and Tools

Xuanwu Atuin AI includes many security-analysis skills. The skills highlighted here are the ones most relevant to CyberGym, including root-cause analysis, structured debugger usage, and layered input construction; they are not an exhaustive inventory of the system.

In this benchmark setting, one important skill focuses on vulnerability hunting and target localization: it forms and tests hypotheses about the likely root cause, trigger condition, affected data flow, and target-relevant evidence through static and dynamic analysis. Another CyberGym-relevant skill focuses on PoC construction: it turns the recovered evidence into concrete inputs, iterates with local crash observations, and checks whether the candidate PoC is exercising the intended bug rather than a nearby reachable crash.

## The Experiment Setup

CyberGym is a public benchmark for evaluating the cyber capabilities of models and agents. It contains 1,506 historical fuzzing-discovered vulnerabilities from a diverse set of real-world projects. Using CyberGym’s default Level 1 configuration, where each task provides the vulnerable source code and a high-level vulnerability description, Xuanwu Atuin AI is asked to reproduce the vulnerability and generate a working proof of concept (PoC).

### Task Inputs

For each CyberGym Level 1 task, Xuanwu Atuin AI receives the vulnerable source code and the high-level vulnerability description. We make sure that the system does not receive the post-patch binary or patch diff.

### Dynamic Environment

We provide a Docker image for each task, allowing the agent to test and debug dynamically. The image is built on top of the official dataset base image, with `gdb` installed and the official vulnerable binary copied in.

### Network Access

We do not technically block internet access. Instead, we use prompt restrictions and post-run review: agents are instructed not to search for known vulnerabilities, and all successful runs are reviewed at the tool-invocation level using top-tier models. Runs with prohibited external lookup behavior are discarded and rerun. In addition, we manually spot-checked 50 successful runs that AI classified as clean; this spot check did not find additional prohibited lookup behavior.

### Pass@1 Protocol

We evaluate pass@1 by running one agent trajectory for each CyberGym task under the default Level 1 configuration, except for the controlled rerun cases below. One trajectory may include multi-agent analysis, multiple candidate PoCs, internal review and revisions. A task is counted as successful only when the final accepted PoC crashes the vulnerable binary but not the fixed binary, as judged by CyberGym.

### Controlled Reruns

We rerun tasks only in two controlled cases. These reruns replace invalid or non-semantic trajectories; ordinary analysis failures and failed PoC-construction attempts remain failures.

#### Infrastructure Failures

We rerun infrastructure failures, including LLM API timeouts, service errors, network loss, or coding-agent crashes. Xuanwu Atuin AI includes automatic retry logic for occasional transient failures, but sustained infrastructure instability can still cause non-semantic failures that require reruns.

#### Prohibited Lookup Control

As stated above, we do not technically block internet access. We discard and rerun all trajectories with prohibited external lookup behavior.

### Result Accounting

We evaluated 1,506 CyberGym Level 1 tasks.

| System | Model | Successes | pass@1 |
| --- | --- | --- | --- |
| Xuanwu Atuin AI | GLM-5.1 | 1,265 / 1,506 | 84.0% |
| Claude Code | GLM-5.1 | Not reported | 68.7% |

The two results differ by 15.3 percentage points while using the same  
underlying model.

The rerun counts below are invalidated trajectory events, not ordinary failed analysis or PoC-construction attempts.

| Invalidated trajectory category | Count |
| --- | --- |
| Infrastructure failures | 162 |
| Prohibited external lookup behavior | 127 |

### Compliance Note (July 2)

Our initial run achieved 85.1% pass@1. After discussion with the CyberGym team, we found that part of the run had used server-side verification feedback in a way that was not compliant with the intended setup.

We corrected the protocol by replacing post-patch feedback with an internal reviewer. The reviewer checks whether a PoC that crashes the vulnerable binary appears to target the assigned vulnerability and matches the vulnerability description, without exposing post-patch feedback to the agent.

Under this corrected protocol, the final compliant result is 1,265/1,506, or 84.0% pass@1.

## Conclusion

The CyberGym result shows that Xuanwu Atuin AI’s general vulnerability-analysis workflow transfers effectively to benchmark PoC-generation tasks. The controlled evaluation and sample trajectories suggest why system design mattered: using the same GLM-5.1 model, Xuanwu Atuin AI reaches 84.0% pass@1 compared with Zhipu AI’s published 68.7% Claude Code result, indicating that manager/subagent orchestration, SOP-guided cyber-relevant skills, embedded tools, and instruction-following controls provide substantial value beyond the underlying model alone.
