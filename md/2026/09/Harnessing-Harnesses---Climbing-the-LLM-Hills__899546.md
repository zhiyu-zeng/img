---
title: Harnessing Harnesses - Climbing the LLM Hills
source: https://blog.zsec.uk/harnessing-harnesses/
source_host: blog.zsec.uk
clip_date: 2026-09-15T10:20:05+08:00
trace_id: 8d66ff72-765d-48cf-a0a4-e351860f69ab
content_hash: 02a95c507aee7aa97513e5338d52695f84c5dd32213ae272710503ac1094424d
status: synced
tags:
  - AI辅助逆向
  - 安全工具
series: null
feed_source: zsec·逆向安全
ai_summary: "**TL;DR：** LLM 的能力、成本与可靠性提升主要来自模型外的编排层（harness），而非模型选型或提示词工程。"
ai_summary_style: key-points
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 3dc75244-d011-819a-ac45-d394cf85ccc7
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> **TL;DR：** LLM 的能力、成本与可靠性提升主要来自模型外的编排层（harness），而非模型选型或提示词工程。
> 
> - **定义：** harness 是围绕 LLM 的编排层，控制输入、工具、提示词、模型、状态、验证门与输出；MCP 只是层内可调用工具，不决定调用时机、顺序或用哪种上下文。
> - **公开实例：** RAPTOR（静态+二进制+模糊测试，六阶段验证含 CVSS、ASLR/RELRO 检查与 Z3 求解）、Anthropic 参考 harness（ASAN Docker 内 recon/run/report/patch，须有可复现 PoC）、Baby Naptime（单 agent 运行时利用循环）、Evil Socket Audit（八阶段、按语言通用）、Visa VVAH（先威胁建模与污点流，结果仅视为 triage 候选）。
> - **上下文预算：** 单函数分析约 8K token，多发现综合约 32K；只检索与假设相关的代码路径，压缩扫描器/模糊测试日志至数百 token，保留滚动摘要并移除已完成任务。
> - **分阶段与模型路由：** 每阶段独立提示与结构化产物，典型流程 recon→hunt→validate→trace→report；廉价模型做分类汇总，强模型留给验证、追踪与综合。
> - **跨运行记忆：** 用 RAG 复用历史笔记、工具文档与语言知识，并在每次成功后发现后运行反馈回路，把新发现叠加到基线上。

![Harnessing Harnesses - Climbing the LLM Hills](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/27bc7a948251495b.jpg)

In my previous [LLM-themed post](https://blog.zsec.uk/bullyingllms/) I talked about the use of MCPs and how they have been useful for my offensive bug hunting pipeline. MCPs grant Large Language Models(LLMs) access to additional tools and allow them to gather additional context. This post will explore the creation and importance of harnesses for using LLMs to their full potential while maintaining effective token usage.

You'll find plenty of discussion about prompt engineering and model selection, but the orchestration layer around the model doesn't get nearly as much attention(until recently with a few open source projects being released as discussed later in the post). In my experience, that's where the biggest improvements in capability, cost and reliability come from. A highly capable model with no structure around it will still burn tokens like they're going out of fashion on redundant context and repeat work it's already done, producing results you can't verify or reproduce. Picking the right model and ignoring the harness is like buying a race engine and fitting it to a shopping trolley.

![Harnessing Harnesses - Climbing the LLM Hills](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a45da84211d69a35.png)

Harnessing Harnesses - Climbing the LLM Hills

### What is a Harness?

![Harnessing Harnesses - Climbing the LLM Hills](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0686087b4456fb3c.png)

Not that kind of harness

Before diving into the specifics, it is worth explaining what a harness actually is in the context of AI and LLMs and why it has become one of the most important components of my AI-assisted workflows.

A harness is the orchestration layer around an LLM. It controls the inputs, tools, prompts, models, state, validation gates and outputs for each stage of work.

If you've read the previous post, MCPs sit inside that layer as one type of tool. They give the model callable functions (run a command, decompile a binary, query a database), but they don't decide when those functions get called, in what order, with what context, or what to do with the result. That's the harness's job. You can have a full suite of MCP servers configured and still produce inconsistent, unverifiable output if nothing is coordinating how they are used.

![Harnessing Harnesses - Climbing the LLM Hills](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/cf48a4d8b4512cb5.png)

Harness Structure

For offensive security research, that orchestration layer is responsible for making decisions such as:

-   What data should be collected?
-   Which tools should execute and why?
-   Which model is best suited for this particular task?
-   How much context is actually required?
-   How can previous knowledge be reused instead of rediscovered?
-   And perhaps most importantly, when should the model stop thinking and hand control back to the operator?

More capable harnesses dynamically select between models, invoke external APIs, execute MCP tools and route between specialised agents. Breaking work into stages like this means the model doesn't need to solve the entire problem in a single pass. The harness provides only the context each stage actually needs, which means lower token burn (or at least that's the plan), more consistent reasoning and less duplicated effort across runs.

![Harnessing Harnesses - Climbing the LLM Hills](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/938481378b67f371.svg)

Harnessing Harnesses - Climbing the LLM Hills

Side note if you're curious about your token burn and you use Claude, I built TokenBurn for exactly that to map a Claude Max sub to relevant API spend:

Trying to coerce useful work out of LLMs without the harness and verification layer is like herding cats, now if you scale that up to multiple parallel agents and it's closer to supervising a room full of drunk toddlers, each convinced they're helping, none of them checking with each other and falling over the next.

I've got eight running in the setup from the previous post(MCPs not drunk toddlers), and the harness is what makes them function as a pipeline rather than a collection of disconnected tools.

### Before We Begin

Now that you're a little bit more up to speed with what a harness is, next up is to explore some of the publicly available ones out there. If you've never looked at harnesses before here are a few worth checking out, all of the ones documented below except Google's Nap Time are open source and mostly actively contributed to allowing you to scan codebases and hunt on security bugs. RAPTOR is the one I find myself using the most but the others certainly have their place if not as a baseline to start from.

### Harnesses in Practice: RAPTOR

While the idea of an LLM harness might sound abstract, frameworks such as RAPTOR provide a useful example of what this looks like in practice. Rather than relying on a single prompt and expecting a model to discover vulnerabilities on its own, RAPTOR builds a structured research pipeline around Claude Code. It orchestrates static analysis, binary analysis, fuzzing, vulnerability validation and exploit generation into a coherent workflow.

RAPTOR splits the work across two layers: a Python execution layer that runs the tools, and a Claude Code decision layer that determines what to run and how to interpret the results. The Python layer can be driven from CI and produce structured SARIF output without Claude Code involved, or used interactively as part of the wider agentic workflow. That separation is one of the parts I find most useful. The orchestration logic can be tested independently of the AI reasoning, which matters when iterating on a research pipeline.

The validation pipeline is where RAPTOR earns its keep. It runs across six stages. Stages A through D assess whether a vulnerability pattern is genuine, what an attacker would need to reach it, whether the code supports the finding line by line, and the final ruling with CVSS scoring. Stage E considers binary feasibility, including ASLR and RELRO checks, gadget availability, and Z3 SMT constraint solving for one-gadget applicability. Stage F performs a final contradiction check before anything is promoted.

I have RAPTOR integrated into my own setup as a Git submodule primarily for the static-analysis stages and some of the newer Frida functionality for dynamic Windows application exploration.

### Harnesses in Practice: Anthropic Code Reference

Where RAPTOR handles static analysis and agentic dynamic, Anthropic’s reference harness is aimed specifically at C/C++ targets where you want execution-verified findings. It runs an autonomous find, grade and patch pipeline inside AddressSanitizer (aka ASAN) instrumented Docker containers. Every finding includes a binary PoC that reproduces the crash against the instrumented build, so there is no ambiguity around whether the issue is reachable, that said however as with all things AI, nothing is 100% fool proof and I've unfortunately had it kick out some rubbish too.

The workflow starts with `vulnpipeline_recon`, which maps the attack surface and identifies focus areas. `vulnpipeline_run` then launches independent fuzzing agents against the ASAN build, collecting PoCs when crashes occur. `vulnpipeline_report` grades each unique crash as passed, borderline, DoS-only or low-impact, while `vulnpipeline_patch` produces a source fix, rebuilds the target and re-runs the PoC to confirm the issue has been resolved. It is deliberately limited to C/C++ projects with a Dockerfile, build script and an instrumentable ASAN build, but for targets that meet those requirements it provides a strong complement to static analysis.

### Harnesses in Practice: Project Zero Nap Time

While google never released Nap Time, there is an open source equivalent which I have played around with a little bit and it's pretty good:

Baby Naptime is a single-agent runtime exploitation loop for C/C++ binaries similar to the Anthropic harness detailed previously. The model works against a live running binary in a tight feedback loop. It proposes an approach, executes it, sees the produced output, and updates its theory from there. Doing that across dozens of iterations with real runtime data gets you somewhere different from asking a model to reason about a binary from static context alone. You're giving the model the same signal a human reverser has and then instructing it to act upon it.

### Harnesses in Practice: Evil Socket's Audit Framework

The framework hands off more of a pipeline than a harness but it offloads each stage to a different model.

Audit takes a different approach to the previous harnesses in that it is more flexible, working across languages and repositories that may not have a clean build system, Docker setup or runtime instrumentation.

It runs an eight-stage Claude Code pipeline that maps the codebase, identifies trust boundaries, reviews past security fixes, and launches parallel agents against focused investigation tasks. Findings are validated, deduplicated and passed through a trace stage that must show attacker-controlled input reaching a vulnerable sink before they are reported. This gives it more discipline than a simple multi-agent code review, even if it cannot offer the runtime certainty of a reproduced ASAN crash it does give some degree of useful output but like many things its not perfect and when I played around with it, I did need to tweak quite a few sections of it to get it to flow.

The quality of the output depends on the recon tasks, prompts, model selection and how the repository is divided into workstreams. Large or unusual codebases can otherwise create duplicated effort, shallow reviews or wasted time on low-value areas, so it is better treated as a configurable research pipeline than a tool that will produce flawless findings without adjustment.

### Harnesses in Practice: Visa's Vulnerability Agentic Harness

VVAH is closest to Audit, but puts more emphasis on threat modelling and taint-flow analysis before agents begin hunting. It inventories the repository, maps trust boundaries, assigns specialist review lenses, validates findings through an adversarial second pass, then produces SARIF and Markdown reports. Crucially, it treats results as triage candidates rather than confirmed vulnerabilities.

That makes it useful for broad coverage, including unusual languages and repositories without reliable builds, but it has the same limitations as other LLM-led source pipelines: the results still need human review and tuning. Its call graph is seeded by an LLM and reinforced with regex rather than built from a full AST, so dynamic dispatch, reflection and framework routing can be missed. Unlike Anthropic’s harness, it does not prove exploitability through runtime execution, and unlike RAPTOR it does not rely on external analysis tools and solver checks as heavily.

## Designing and Building Your Own Harness

One common mistake when building a harness is using one system prompt for the entire pipeline. Each stage needs a prompt designed for the job it is doing.

An agent mapping a codebase needs different instructions from one developing exploit hypotheses, and both need different framing from an agent reviewing a proposed PoC. The mapping stage might return structured JSON covering file paths, entry points and dependencies. A later stage can use that context to reason about attack surface, while a verification stage should be told to look for reasons a finding is wrong. The harness connects those outputs and makes sure each model receives only the context it needs.

I found [Scrutineer](https://github.com/alpha-omega-security/scrutineer?ref=blog.zsec.uk) the other day and its `revalidate` skill is a good example of this, when `security-deep-dive` produces a High or Critical finding, `revalidate` checks it against the git history and returns `true_positive`, `false_positive`, `already_fixed` or `uncertain`.

It does not run a PoC specifically and only findings marked `true_positive` move into the `verify` stage where the code is tested against the current HEAD. That keeps the more expensive validation work focused on the findings most likely to be real, it's something I need to play about with more but it certainly holds something worth looking at.

### Context Windows and Budgets

Think of your context window as a budget, and treat it that way instead of burning tokens like there is no tomorrow. A common failure mode in early harnesses is passing in raw files, scanner output and full conversation history at every stage; more context is not automatically better when most of it is irrelevant and having something to sort the output makes life 10x easier.

The harness should retrieve only the code paths relevant to the current hypothesis, summarise noisy tool output, retain a short rolling summary of completed work, and remove resolved tasks once their results are stored elsewhere. A single-function analysis can often work within roughly 8K tokens, while synthesis across several findings may need closer to 32K. Fuzzer output and scanner logs should usually be reduced to a few hundred useful tokens before entering a prompt. Set this strategy early, because adding context management later is painful.

### The Orchestration Layer

In my setup, the orchestration layer sits above the eight MCP servers, organising and calling specifics to pass to the broader tool control. The MCPs provide the tools, while the orchestration layer decides which tools to call, in what order, and how to handle the results. It is made up of Claude Code skills organised into experts and workers and a combination of MCPs linked together with spit and ductape.

Here's my harness kit I've put together and released, it's loosely based on my own pipeline but deliberately constrained:

In the harness kit, that workflow is deliberately simple:

`recon → hunt → validate → trace → report`

Each stage has its own prompt, input and output. Recon maps the target, Hunt investigates focused hypotheses, Validate looks for reasons a finding is wrong, and Trace proves whether attacker-controlled input reaches the vulnerable sink. Only findings that pass those gates reach reporting.

Rather than sharing one huge conversation, stages exchange structured artefacts. This makes the pipeline easier to inspect, rerun and replace, while allowing Hunt workers to run narrow tasks in parallel with defined context budgets.

Model routing and context management support the same design. Cheap models can classify, organise and summarise, while stronger models are reserved for validation, tracing and synthesis. The orchestration layer owns the state, gates, budgets and hand-offs; the model performs one focused piece of reasoning at a time.

## Harnesses Need Memories

Context management decides what a stage sees during one run. RAG decides what the harness can reuse from previous runs.

To build an effective harness another component that is very useful to have is a running memory of notes, while useful as a practitioner to have notes on things, how to run specific tools, what the syntax for commands looks like and various lessons learnt.

![Harnessing Harnesses - Climbing the LLM Hills](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/35c38a224ac017f5.png)

Harnessing Harnesses - Climbing the LLM Hills

It is just as important to have memories for your harness when it comes to a pipeline, this is whereRetrieval-Augmented Generation (RAG) becomes an incredibly useful function. I have built out a RAG as a central repo of many different topics including previous notes, blog posts, details about specific languages, documentation about tools and other content to allow the harness and underlying model to learn from things.

In addition to the knowledge base I also have a 360 feedback loop that runs after each successful run of findings so that newer findings can be built upon the baseline.

## Closing Thoughts

The useful part of an LLM workflow is rarely the model on its own. It is the structure around it: how work is split into stages, what context reaches each stage, which tools are available, how findings are challenged, and what gets remembered for the next run.

A good harness does not remove the need for judgement or validation. It gives you a repeatable way to apply both. The model should not be responsible for deciding the full workflow, retaining every detail, choosing every tool and trusting its own output. That is the orchestration layer’s job.

I have released a stripped-back version of this approach:

It is deliberately a template rather than a finished autonomous research platform. The aim is to show the structure: separate stages, structured artefacts, scoped context, validation gates, model routing and persistent state.
