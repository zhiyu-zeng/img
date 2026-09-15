---
title: CTFs in the AI Era
source: https://blog.includesecurity.com/2026/04/ctfs-in-the-ai-era/
source_host: blog.includesecurity.com
clip_date: 2026-09-15T10:25:23+08:00
trace_id: 7630fdac-5054-403f-b99b-b54ac78aac6d
content_hash: b2a3c99e1afab3d875729c49de2e09429c732888b84dac1f3fa2a81f80377d70
status: synced
tags:
  - CTF
  - AI辅助逆向
series: null
feed_source: Include Security
ai_summary: 2026 年 BSidesSF CTF 显示：中低难度 CTF 已被 LLM 基本攻克，比赛从"谁能解更多"变成"谁能堆更好的自动化基础设施"，但距离自动化渗透测试仍有明显差距。
ai_summary_style: key-points:weak
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3dc75244-d011-8137-9e1d-c8ace90b3d23
ioc: null
---

> 💡 **AI 总结（key-points:weak）**
>
> 2026 年 BSidesSF CTF 显示：中低难度 CTF 已被 LLM 基本攻克，比赛从"谁能解更多"变成"谁能堆更好的自动化基础设施"，但距离自动化渗透测试仍有明显差距。
> 
> - **格局剧变：** 2026 年 16 支队伍全解全部赛题，无题解数低于 25；2025 年仅冠军队接近全解。作者去年单干排第 5，今年估计无 AI 辅助只能排 75。
> - **自动化流水线：** 头部队伍用管道持续监控 CTFd 新题、题目一发布即拉起多个 agent 并行求解、flag 出现即刻自动提交；同分时按解题速度决胜，因此比拼的是 agent 数量、模型质量与算力（即预算）。
> - **实战配置：** Debian VM + Conda 全量 pip 包 + Playwright 无头浏览 + Ghidra 及 Ghidra MCP；用 Claude Code Max 5x（$100/月）配合 `--dangerously-skip-permissions`（依赖 VM 沙箱），Opus 4.6 最高推理档，提示词仅"solve this CTF challenge keeping track of progress"。
> - **获胜秘诀：** 冠军队开源了 CTF agent，核心是并行跑多个强弱互补的模型（如 GPT-5.4-mini 快解简单题、Opus 4.6 慢但推理最深），并用协调者 LLM 在 agent 间共享进展、对卡住的 agent 重新提示。
> - **仍难自动化的题：** hxp、DEF CON 级别多数题 LLM 无法自主解；缺少训练数据的"猜谜题"、对称密码分析、以及文档匮乏或文档与源码矛盾的底层实现细节最抗 AI，动态计分下胜负仍由"不可 slop"的难题决定。
> - **CTF 与渗透的差异：** CTF 目标单一（flag）、验证确定、上下文有界、违规代价仅取消资格；渗透则目标开放、需区分误报并理解业务语境、面对百万行代码与不可本地运行的依赖、大量工作在产品化报告与危害定级、且越界后果严重。

Include Security has been keeping track of developments with frontier models and how they’re changing the offensive security landscape. Capture the Flag (CTF) competitions are now facing significant design difficulties due to their challenges being especially suited to the capabilities of LLMs.

Our team attended BSidesSF 2026 CTF competition and wanted to present a first-hand account of how LLM-enabled workflows are being used to tackle CTF challenges. Additionally, we’ll walk through some of the key differences between CTFs and professional security assessments to highlight why LLMs still require the guidance of experienced practitioners to be effective “in the field”.

### Introduction

BSides San Francisco CTF is one of the longer-running jeopardy-style CTF events, with an experienced organizing team, and cash prizes ($1,500 for first place). Challenges are on the easy to medium side, and the authors [publish source code and writeups](https://github.com/BSidesSF) afterwards, making it a great learning opportunity.

During last year’s 2025 CTF, I remember looking around the room and seeing almost half the players had ChatGPT open. At that time ChatGPT 4 was good at solving easy challenges, freeing up mental bandwidth to focus on the crucial higher-point challenges, which it couldn’t solve.

Like most CTFs, BSides SF uses dynamic scoring, so the hardest challenges are worth up to 10x as many points as the easiest ones. In 2025 the winning team was the only one that came anywhere close to solving every challenge.

### Everything changed in late 2025/early 2026

Jump forward to this year’s BSidesSF, and it’s clear that the CTF scene has dramatically changed. This year, 16 teams fully solved all challenges, and no challenge had fewer than 25 solves. This was not because the challenges were much easier.

In fact, the top 10 teams fully automated the solving process, with most challenges getting solved minutes after release. Apart from a few OSINT challenges, Claude Code and Codex were able to solve every challenge, including tough binary exploitation ones that would almost certainly have gone unsolved last year. Last year, I came 5th playing solo; this year I estimate I would have placed 75th without LLM assistance.

### Automating CTF

At BSidesSF 2026 CTF, I realized that I had no chance at competing without my own AI agent, so I decided to join the new meta. I set up a Debian VM, and installed a kitchen sink of CTF tools, including:

-   Conda environment with every pip package that I could think of
-   Playwright for headless browsing
-   Ghidra and Ghidra MCP server

I used Claude Code with the Max 5x plan ($100 per month), which turned out to have just enough tokens in its weekly limit for the whole CTF. I vibe-coded a script to scrape challenges from CTFd and save them to separate directories.

I then opened up challenge directories in separate tmux terminals, and kicked off Claude Code with the “–dangerously-skip-permissions” flag in each one. I deemed that flag acceptable to use as Claude was sandboxed inside a VM, on a travel and CTF laptop.

I used Opus 4.6 on max effort with a dead-simple prompt “solve this CTF challenge keeping track of progress”. I then tabbed between the windows to monitor progress on different challenges and occasionally steered the LLM in a better direction. I picked out some of the challenges that looked interesting and tried to solve them manually in parallel to the LLM.

I was astonished at how capable the latest models are at CTF. When you watch them crack gnarly cryptography puzzles faster than it would take the smartest people you know – you can’t help but be amazed.

### Fully Automating CTF

This approach, while enough to solve almost every challenge, is far from enough to win or even to place top 10. Other teams, more experienced at vibe-solving, have invested in pipelines that:

-   Continuously monitor the CTF platform for new challenges
-   Spin up multiple agents to solve each challenge immediately as it’s released
-   Auto submit the flag as soon as it appears in agent output

When scores are tied, the victor is decided by solve speed. So to beat the other teams you need more agents, better agents, and better CPUs. In other words, more $$$.

The winning team open sourced their CTF agent. Their special sauce to consistently being fastest was to run several different models in parallel, each with different strengths and weaknesses.

GPT-5.4-mini quickly crushes the easiest challenges, while Claude Opus 4.6 on max effort mode is slow but reasons the deepest. Additionally, they use a co-ordinator LLM that shares insights between the different model agents. If a particular agent appears to be stuck, the co-ordinator kicks it back into gear with a prompt containing any useful discoveries made by other agents.

### Harder CTFs

AI can’t autonomously solve the majority of challenges at harder CTFs like hxp and DEF CON, but it’s becoming more of an issue. hxp’s cryptography challenges were apparently autonomously solvable (“sloppable” in CTF parlance) in December 2025. At DEF CON in August 2025 (a long time ago in this tech timeline) [two challenges](https://wilgibbs.com/blog/defcon-finals-mcp/) were solved with major LLM assistance, although LLMs weren’t particularly useful for the rest. Due to dynamic scoring, the winners are still decided by the “unsloppable” challenges.

I asked players from semi-retired top CTF team [Organizers](https://ctftime.org/team/42934), who said that top CTFs still contain fun hard challenges that remain resistant to LLMs. Challenge design increasingly means anticipating what the next frontier model will be able to do, which is a new and genuinely difficult constraint for an author to work under.

They said the most obvious challenges which are harder for AI are “guessy” ones with little training data to work from, although these usually aren’t appreciated by humans either. A couple categories like cryptanalysis of symmetric ciphers are doing better, due to fewer existing writeups. Challenges that require diving deep into the internals of software can make LLMs struggle, particularly areas that are poorly documented, or even better, if the documentation contradicts the source code.

### CTFs vs Pentesting

Given how well LLMs now perform at CTF, it’s reasonable to ask whether those results translate to pentesting. After all, CTF challenges are often modelled on real bugs. While pentesting occasionally throws up tasks that feel like CTF challenges, most of the work looks rather different.

**1\. Goal structure**

CTF challenges have a single target: the flag. Good challenges have a well-designed, intended solution path that leads you there. Pentests are far more open-ended; rather than following a single path to its conclusion, you’re searching a vast system and trying to identify the many parts of it that are broken in a security-relevant way.

**2\. Finding verification**

In a CTF, submitting the correct flag means you’ve unambiguously solved the challenge. In a pentest, verifying if a finding is valid is not so clear-cut. Distinguishing true positives from false positives requires not only reproducing an issue technically, but also understanding the business context in which it exists. A common false positive is an apparent authorization vulnerability where the endpoint or data is actually intended to be public.

**3\. Context management**

CTFs usually involve small, self-contained programs. A typical challenge would be a single binary, webapp with a single-digit number of routes, or a 200-line encryption scheme. Pentests are usually conducted against huge systems and codebases that can have millions of lines of code, where you don’t have access to all dependencies and can’t run it locally.

**4\. Reporting and severity**

In a CTF, the flag is the deliverable, and a writeup is optional. In pentesting, a significant portion of the work goes into the reporting process: explaining what was found, assessing its severity, and articulating why it matters in a way that’s useful to the client.

**5\. Staying in scope and dangerous decision-making**

The worst consequence for breaking the rules of a CTF is likely disqualification. In a pentest, stepping outside the agreed-upon scope can be disastrous. Experienced testers take great care before running a proof-of-concept, or before pivoting to a system they may not be authorized to attack.

CTFs therefore play into the strengths of AI:

-   Goals with unambiguous success criteria
-   Bounded context
-   Immediate feedback loops
-   Low consequences for breaking the rules

Additionally, the wealth of publicly available CTF writeups reinforces this advantage. Easier challenges are likely to be a minor variation on something that’s been seen before.

Recent talks and articles have demonstrated frontier models’ impressive capability at vulnerability research. Successful examples of LLM-driven vulnerability discovery often seem like reframing the problem as something closer to a CTF challenge: narrowing the search to a tight scope and referencing previous CVEs to build a clear threat model of what a vulnerability might look like.

### Conclusion

BSidesSF 2026 shows we have passed an inflection point where easy-to-medium CTF challenges are largely solved problems for AI. What took skilled players hours last year takes an agent minutes today. The competition has shifted from who can solve the most, to who can deploy the best infrastructure.

But the jump from automated CTF to automated pentesting remains big. CTFs are an ideal testbed for LLMs: instant verification, a bounded codebase, and tons of training data. In pentesting, false positive management, scope discipline, and business context are all areas where human judgment remains important.

In the second part of this blog post, we’ll explore the BSidesSF challenges that LLMs had more trouble solving and investigate why.

The post [CTFs in the AI Era](https://blog.includesecurity.com/2026/04/ctfs-in-the-ai-era/) appeared first on [Include Security Research Blog](https://blog.includesecurity.com/).
