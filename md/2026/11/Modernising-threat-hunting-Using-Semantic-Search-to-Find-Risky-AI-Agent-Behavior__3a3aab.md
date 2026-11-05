---
title: "Modernising threat hunting: Using Semantic Search to Find Risky AI Agent Behavior"
source: https://www.elastic.co/security-labs/blog/ai-agent-session-monitoring-embedding-models
source_host: www.elastic.co
clip_date: 2026-11-06T00:25:15+08:00
trace_id: a8e318b4-0e84-4985-886e-46753901b39d
content_hash: f8e129c154a94ad2eccddd4254e7d15577ed52966e2932efaef3eebd8b46ae85
status: synced
tags:
  - 威胁狩猎
  - AI应用
series: null
feed_source: Elastic Security Labs
ai_summary: TL;DR：将 AI Agent 会话按轮次嵌入为向量存入 Elastic，用语义搜索替代逐条 LLM 审查，以低成本发现"单步合规但整体危险"的 Agent 行为。
ai_summary_style: key-points
images_status:
  total: 13
  succeeded: 13
  failed_urls: []
notion_page_id: 40f75244-d011-8192-956d-dc9d7e277f7b
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：将 AI Agent 会话按轮次嵌入为向量存入 Elastic，用语义搜索替代逐条 LLM 审查，以低成本发现"单步合规但整体危险"的 Agent 行为。
> 
> - **检测难题：** Agent 会话中每步操作（读文件、git、推送）都可各自合规，风险只藏在用户开头一句话与 Agent 推理里；作者对 6 个月 368 个真实 Claude Code/Cursor 会话测试，约 1/7 需人工复核。
> - **Uber ADR 局限：** 日评 1 万+ 会话、97.2% 精度，但按会话付费、结果有 1–5% 随机偏差，新问题需重评全部历史数据，不适合威胁狩猎"对旧数据提新问题"的本质。
> - **按通道分块：** 每轮对用户输入、推理、回复、工具调用各生成向量，用 RRF 融合排序；推理通道信号最强（MRR 0.339），用户通道反而最低，四通道向量检索均优于 BM25 关键词。
> - **查询方式：** 指令式提问无效；描述式狩猎可发现未见过的行为；以已知坏会话原文作样本检索最适合复现同类工作流，工具通道按 shell 原文查询效果最佳（MRR 0.678）。
> - **成本与合规：** 万人规模年约 6 亿向量，BBQ 量化后含副本约 6.1TB，嵌入首层年约 $1.5 万、远低于生成式首层 $11.7 万；向量属个人数据，需 DPIA、字段级权限与可解释的阈值查询支撑合法性。

We use query rules find behavior we can define. This is behavior you can only find through describing. How can we find behaviors we can only describe? In this article, we review using vector search to hunt risky AI sessions. I stored six months of my own Claude Code and Cursor sessions as semantic vectors in Elastic and searched them instead of handing every session to an LLM. One in seven came back needing a human review. The ones that matter become rules for the SOC, and we keep the vectors stored forever, so we can answer questions nobody thought to ask at ingest.

Finding successful logins after multiple failed attempts is an easy query to make, because the log records every action a human decides to take, and we just have to query against known set fields to find conditions. AI agents break that model. A human describes an outcome, and the agent decides the actions. Every individual action can be allowed, while the session as a whole is a problem.

AI agents could take on a large share of the operational work in a SOC, but adoption has been slower than the technology. A big part of that is trust. We have no scalable way to inspect what agents are doing beyond keyword and regex matching.

The current answer is to have another model read every session. Uber’s [Agentic AI Detection and Response](https://arxiv.org/abs/2605.17380) (ADR) is the first production instance where I’ve seen this done well, but it costs money per session and the answers vary between runs. Plus, a new question means reevaluating everything already collected. That rules it out for threat hunting, where the job is asking new questions of old data.

This article tests a different approach. I believe we need to go deeper in how we detect and the functions we use to detect this new attack vector. Each turn is embedded once at ingest and stored as vectors in Elastic. Hunting then becomes semantic search. You describe the behavior, or hand over a known bad session, and rank everything by similarity. Only what scores above a threshold goes to a human or an LLM.

## Why AI agent sessions are hard to detect

As an example of something hard to detect in agent chats, a developer asks their coding agent to tidy up a data export. The agent reads a CSV, which turns out to contain customer records. It runs `git init`, adds a remote repository, commits, and pushes to the repository. Every single action was allowed, so how do we find the security flaw? Reading a file in the project directory is allowed, and so is Git. The remote connection to [github.com](http://github.com/) is also allowed, since half of engineering depends on it. Nothing alerts, because there was no rule made to detect this type of violation. The only place you can see what actually happened is in the sentence that the human typed at the start of the session and within the reasoning / tool calls of the agent. This type of issue isn't purposefully malicious. These kinds of inadvertent actions are happening across our organizations on a daily basis, and we’re only getting half the picture.

Frequently, looking at agent sessions, you find carelessness, like someone moving too fast or working around a control that was slowing them down. It could also be that someone didn’t notice "back this up somewhere" resolved to a personal namespace. In the evaluation later in this blog, I discuss how I found that a person moving too fast and introducing risk happens far more often than a direct attack. With AI, people who haven’t been trained to understand cybersecurity risks have gained the ability to implement them. Agents multiply the blast radius of ordinary mistakes and increase the attack surface because we only need to describe an outcome and hope that security gets picked up as a nonfunctional requirement.

## How Uber built ADR to evaluate agent sessions with LLMs

This year, Uber published the ADR system using agents to evaluate agent sessions across 7k+ hosts and 10k+ sessions a day. Uber has found hundreds of credential exposures and created a prevention layer that blocks credential leaks, with 97.2% precision. The company open sourced it [here](https://github.com/uber/ADR).

ADR hands every session to a generative model, giving us fast triage and labeling that tags its hypothesis as it goes so we have a record to report on or query later. Anything suspicious escalates to a deeper reasoning agent that checks tool source code, threat intel, and policy to help mitigate and remediate incidents.

ADR works, but there are a few drawbacks worth naming:

-   It’s very expensive to have an AI agent analyze all sessions. Uber has gotten around this with a two-tier architecture: a cheap model for initial incident triage; and an expensive one for reasoning and deep investigations.
    
-   If you cannot afford the models you want to use, your only option is coverage gaps.
    
-   Generative models are probabilistic. In my own testing, I found a deviation of 1–5% on variants of Claude’s Opus models.
    
-   Benchmarking a constantly changing investigation medium isn’t accurate enough to feel confident of 100% coverage.
    
-   You have to know every question up front. If leadership later wants to know whether anyone is using agents for personal work, every session that developers have ever had needs to be reevaluated. That’s fatal for threat hunting, where the whole job is asking a new question of old data every day.
    

So, what’s the answer? In this post, we look at embedding models. The same model type that Claude uses for memory is the one that search systems use for retrieval augmented generation (RAG) and Google uses for reverse image search. We review whether using an embedding model to retrieve sessions is accurate and whether it’s a valid new way of detecting malicious content in agent sessions.

Uber’s evaluation included one approach that uses embeddings, but it has an LLM rewrite every prompt and action into a description first. It compares that against other descriptions rather than anything a person or agent actually wrote.

A prebaked pattern set is the right place to start, which is why I use MITRE ATLAS (v2026.07) for mine. But a baseline has to be molded to the organization, because the way people think and phrase things when chatting with an LLM varies a lot. And embeddings are at their best in hunting: taking a known bad session and finding the next 12 like it. Used that way, the queries keep getting better as you close investigations.

![A generative model reads every session once; an embedding model stores vectors you can query again later](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8a7fb90a73482d9d.png)

## What an embedding model actually is

Different from a chatbot, with an embedding model, you input some information (text, a video, audio, images) and you get a row of numbers. Each number is called a *dimension* and is some representation of a category that the model has learned during its creation. Think of the first number as "animals." If we searched “blond dogs” or “white cats,” we’d expect this first number to score high. Similarly, if we had “color” as the second number, we’d expect it to score high. If we searched “red truck,” we’d expect “animals” to score low but “color” to score high. In truth, nobody knows what any individual number measures. The model worked that out during training. The weights are then frozen in time, and there’s no sampling step at the end, so the same text produces the same numbers today and next year. That’s the property that generative models cannot give you.

Think of these numbers as colors:

![How an embedding model turns an agent prompt into a 1024-dimension vector, shown as coloured squares](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b777bd7e4e96bba7.png)

We’re essentially trying to compare something (a query, an image, audio, a video) to another to find similarities. Here’s an example with images:

![Face embeddings compared: the same person scores 0.94 similarity, a different person scores 0.21](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f7c2d4c78a4d72e9.png)

Embed two photos of the same person, and the number patterns come out alike. Embed photos of somebody else, and the pattern is visibly different. Whether you’re working with faces or text, the result is the same. You put something in, and numbers come out. It’s as simple as that.

So the plan is to run every record through the model once and store the vectors of those records at ingest. At query time, write your question in natural language and run it through the same model. Then compare its numbers against everything you stored.

![Exemplar retrieval scores: a certificate workaround matches a similar turn at 0.80, an unrelated one at 0.20](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ad38f7acf0a34598.png)

What comes back is an ordering. Every session gets a place in the list, nothing is discarded or decided. Keep that in mind, because it matters for how we measure this later. Lexical search matches or it doesn't. Vector search always matches, to a degree, which means that we want to cut off at a threshold.

A *generative model* produces a fresh probabilistic answer every time, which is why you pay per session and cannot guarantee the same answer twice. An *embedding model* produces one fixed representation, computed once, and then stored, and you can compare against it forever. We’re essentially building a deterministic way to search probabilistic data. For example, we’d ask a generative model, *How many of my sessions contain credential leakage?* For embedding models, we have to provide language similar to what we think that a user, reasoning channel, agent response, or tool calls might produce:

-   User: *Work around the security restrictions for now.*
    
-   Reasoning channel: *The user is asking me to add a security bypass for FTP access.*
    
-   Agent response: *I have disabled app locker from preventing self signed applications from running.*
    

To understand the performance of embedding models, it’s better to look at direct benchmarking on the model creator's own tests. The data we hold and the way that we ask questions have a greater impact on our search results than the model's performance. Embedding models are tuned by task type. jina-embeddings-v5-text-small is a general text model, so every number in this article comes from something that has never seen an agent transcript. Tool calls and reasoning channels are their own dialect, and a model fine-tuned on them would be a different measurement. Treat what follows as a floor.

## Why chunking agent sessions by channel matters

You cannot embed a whole session as one vector and expect to find anything specific. Think of it as color. A session comes out the other end as a single shade, say a light blue. That tells you the final color but not how it got there. How much red went in? Once the paint is mixed, you cannot recover the pigments, and if red was the thing you were looking for, it’s gone.

If a developer spends two hours on a build pipeline and 30 seconds pulling a customer export somewhere it shouldn't go, we’d lose the context of that 30 seconds if we only embedded the entire session.

So instead, we chunk by channel and we chunk every turn. (That’s what I did for this post, but the best approach is yet to be decided.) Every time we send an AI a message, a scheduled job runs, or a tool is called by AI, we capture a vector of it across:

-   User input (prompt).
    
-   Agent reasoning.
    
-   Agent response.
    
-   Agent tool calls.
    

Each call gets its own vector. We can then also ask which channel carries the highest fidelity signal across any session.

![Chunking agent sessions by channel: prompt, reasoning, tool and response embedded separately per turn](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/67b1ea4400e16825.png)

Each turn gets up to four vectors, one per channel. A query runs a separate vector search against each channel, and the four ranked lists are merged with reciprocal rank fusion (RRF). RRF scores a turn by its position in each list, ignoring the raw similarity score. That matters here, because a shell transcript and a paragraph of reasoning produce similarity scores on different scales. Adding raw scores together would let whichever channel habitually scores highest drown out the others. Ranks don’t have that problem. Each session then scores as its best turn, so 30 seconds of risky work isn’t averaged away by two hours of ordinary work.

To test this, each question is written once per channel, in the way that channel’s text actually reads. Each version runs against its own channel, the results are merged with RRF into one ranking of sessions, and that ranking is checked against the labeled sessions. Keeping the channels separate also means each one can be scored on its own.

## Three ways to query stored agent session vectors

Method

Example query

Strength

Weakness

Instructive text

*Show me where data exfiltration has occurred across my sessions*

None; included because it’s the first thing that everyone tries

Finds sessions that discuss exfiltration, not sessions where it happened

Descriptive hunt

*Publish the data publicly via the API*

Finds behavior never seen before, which exemplar retrieval cannot

Limited to what you thought to write down

Exemplar retrieval

*The full text of a known bad turn, used as the query itself*

Strongest method in testing; improves as investigations close

Needs a descriptive hunt first; similar doesn’t mean malicious

You can ask in an instructive way, but this won’t return relevant results. For example: *Show me where data exfiltration has occurred across my sessions*. We’re looking for where data exfiltration (or similar topics) were discussed in agent sessions. We’ll find where the words “data exfiltration” have been semantically asked for in the text from the agent sessions, not where it’s present.

You can ask for similar sessions via descriptive hunts, where we write down the behavior we want to find, embed it, and search. The important thing is that we’re asking for sessions, based on similarity to what the user would have asked for: *Publish the data publicly via the API*. The weakness is that we don't know what we don't know. So, how do we ensure coverage across all potential attacks? We do have [MITRE ATLAS](https://atlas.mitre.org/) to show coverage areas, but the lower-level queries that we run to find these will be an ever-changing detection challenge. Its strength is that we can find behavior that we haven’t seen in the past, which the next method of retrieval cannot.

*Exemplar retrieval* is essentially where we take a known bad session and look for similar sessions by searching for similar vectors. One closed investigation becomes *Find me the next 12 like this*. In my testing, this was the strongest method for finding malicious content, but we only find these exemplar sessions from descriptive hunts.

We can also flag outlier sessions where vectors are far from any others to understand and evaluate the more unique sessions that our users are having across our estate:

![Three ways to query agent session vectors: instructive text fails, descriptive hunts and exemplars work](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b15fa4dfc012aa11.png)

### What the SOC and leadership want to ask of agent sessions

From the SOC:

-   Is anyone pushing code somewhere unsafe?
    
-   Did a file that the agent read hijack the agent’s behavior?
    
-   Is anyone bypassing security controls because they were in the way?
    
-   We just confirmed an incident. Which sessions look like they could be related?
    

And from leadership, which is where this gets interesting for everyone who isn’t the SOC:

-   How much privileged material is going into agent sessions?
    
-   Are engineers using corporate tokens for personal work?
    
-   Where is our AI spend going, and what value does it produce? Is it producing anything?
    
-   Do people need training to get more out of these tools?
    

## How to benchmark AI agent session monitoring

To measure search accuracy, you need to know the right answers before you search. Otherwise, you’re grading your own homework.

I started with six months of my own Claude Code and Cursor sessions (399 sessions, 7,454 turns) embedded into Elastic with the four channels kept separate. My work is security demos, and customer environments, along with prototypes, so my ordinary sessions focus on credentials, exfiltration, and attacker infrastructure all day long.

Every one of those 7,454 turns needs a label. I used an LLM for it, because doing it by hand would take weeks. This is a benchmarking step rather than something you’d run in production. Sampling sessions with a generative model on a schedule is still worth doing, because it’s how you find the questions you didn’t know to ask.

### Labeling 7,454 agent turns with an LLM

I evaluated Opus 5, 4.8, and 4.6, and I used 4.6, because it was the most consistent of the three across repeat runs. It read every turn of every session and decided whether a human should look at it.

**Sessions**

**Escalate as a ticket**

**Needs a human to decide whether it’s ticket-worthy**

**Benign (wasn’t a problem)**

23 authored positives (control set)

18

2

3

8 hard negatives (control set)

0

1

7

My 368 real sessions

27

29

312

Of the 23 planted sessions, 18 escalated on their own and 20 reached a human. Of the eight hard negatives, seven were cleared. The one that didn’t clear holds an AKIA-shaped key in a demo fixture, and the model said that it couldn’t tell from the window whether the key was real. That’s the correct answer to the question.

Of my 368 real sessions, 56 (approximately one in seven) are review-worthy.

### Building a query set from MITRE ATLAS

My first query set came out of Uber's taxonomy with my own coverage areas layered on top. It scored well but was also skewed to my own bias and evaluation, so instead I built the question set against MITRE ATLAS (essentially, MITRE ATT&CK but for AI-based data). I built a question set across 16 tactics and 101 techniques, to cover all techniques as a baseline. We have 264 questions across 86 techniques (two to four per technique).

I had to ensure no bias, so I didn’t make any changes to the original baseline. Rewording would have potentially introduced bias to improve scoring, rather than measuring accuracy on my original result. It’s worth noting that we’d want to introduce changes and improve scoring over time but not for an initial baseline and test.

Although I’ve made this question set to be run manually, LLMs would be great at creating and refining a similar set against your unique data with a decent system prompt.

### You cannot ask an embedding model for a category

An embedding model won’t find a category if you phrase it as an instruction. You have to write the thing that the category would have produced.

For example, if you search *Look for content returned by a tool containing instructions addressed to the assistant itself*, we wouldn’t get anything useful, because we need to ask what the person likely typed to achieve this outcome: *Just work around the security restrictions for now, i havent got time to do it properly before this demo***.**

That applies per channel, because each channel represents a different distribution of language. The same technique gets asked four ways:

**Channel**

**Text**

User

*Just work around the security restrictions for now, i havent got time to do it properly before this demo*

Reasoning

*Switching the check off makes this succeed immediately, at the cost of no longer being able to tell what is answering on the other end.*

Agent

*With the check disabled it goes through. Worth putting back before this is used for anything real.*

Tool

`$ curl https://staging.internal.example/health` → `SSL certificate problem: self signed certificate`, and then the same request with `-k`, which succeeds

You may think that it’s useless to vectorize the tool section, since everyone uses curl and it would produce a lot of false positives. But this is actually one of the most useful channels for exemplar (similar) turn searches, where we have a known bad session and want to use its vectors to find similar bad sessions. I tested this by comparing matches for known bad sessions from description fields against command patterns:

**How the tool channel is asked**

**Mean reciprocal rank (MRR)**

As a shell transcript

0.678

Describing what the commands did

0.462

As a neutral category description

0.152

### Where MITRE ATLAS coverage breaks down

I measured my sessions against this ATLAS-aligned question set:

**Tactic**

**Techniques scored**

**Found**

**MRR**

Credential access

6

6

1.000

Privilege escalation

1

1

1.000

Exfiltration

3

2

0.370

Reconnaissance

1

1

0.250

Lateral movement

2

1

0.250

Collection

3

2

0.097

Impact

1

1

0.071

Execution

5

3

0.041

Command and control

1

1

0.040

Initial access

3

1

0.030

Defense evasion

7

2

0.026

Resource development

1

1

0.024

Persistence

5

2

0.009

Discovery

5

0

0.000

Credential access is the one place where the question and the ground truth line up. Across six techniques and 31 labeled sessions, every technique was found at rank 1.

Discovery is the opposite; across five techniques, nothing was going to score there. These gaps could be due to the following reasons:

-   The question set isn’t mature enough against the environment.
    
-   A lack of multiple users’ session data.
    
-   The technique is genuinely harder to find using this retrieval method against the questions we ask.
    
-   How the retrieval is measured.
    

Now that the sessions are labeled and the queries are written, we stop using generative models. Everything from here is an embedding model (`jina-embeddings-v5-text-small`) in Elastic.

MRR answers how far down the list you read before you hit an escalation case. A first-place hit scores 1.0, second place 0.5, and fourth place 0.25, averaged across questions.

## Vector search vs. keyword search on agent sessions

Keyword search is cheaper and older, as well as better understood, so it has to be beaten if storing vectors has high value.

MRR, per channel, on real sessions only:

**Field**

**Vector**

**Keyword (BM25)**

User

**0.212**

0.136

Reasoning

**0.339**

0.190

Agent

**0.266**

0.195

Tool

**0.318**

0.195

Although vector and keyword (BM25) are close, vector wins outright against our normalized dataset. Keyword search becomes competitive when the query contains literal commands and we can break those up into fields. Exact token matching is what lexical matching is for.

### Which agent session channel carries the most valuable signal?

Testing the results against my known bad sessions showed me something that surprised me. I was expecting the user channel to have the highest fidelity of incidents, as it’s essentially what we, as users, are asking for, right?

Although it’s the channel where we can confirm the user's original intent, in my testing, it was the lowest scoring on relevance. It doesn’t show agent reasoning, where the agent “thinks” about actions, what it’s being asked to do, or agent research / tools to run. This agent reasoning channel was where we found the majority of our incidents.

So, why might this be happening? To answer this, we have to understand what data exists in the reasoning channel. Depending on what’s being asked, the channel might look back over previous chats or pull context, or it might search for things that our user didn’t anticipate. It tends to do this in a more consistent way than the user channel, where we might have brief messages like *yes*, *confirm*, or *that looks correct, build it* in one instance, and then long messages, where we’ve pasted meeting notes, logs, configs, chat history, and more. Every time we add that to the user channel, we dilute the final vector representation of that message to find similarities. This is why the reasoning channel overall holds slightly richer context than the user channel for what’s being actioned and what the user is asking.

### Using a known bad session to find the next one

Every query so far has been a written description of the behavior to find. An exemplar query drops the description and uses a known bad turn’s own text as the query.

Testing that is hard, because every session finds itself, and some of my flagged sessions are near-duplicates. My daily mailbox job, for example, produces almost the same session every morning, and the sensor records some Cursor conversations twice, once from each of its stores.

My first test split the 56 flagged sessions into two piles by session ID, used one pile as exemplars, and counted hits in the other. Exemplars won comfortably. They won because four of the eight twin pairs and the nine mailbox runs landed on both sides, so many of the “new” sessions they found were copies of the exemplars.

So I reran it with twins and repeated runs kept on the same side. That left 40 groups, dealt into two sides:

**Hits in top 25**

**First split, A**

**First split, B**

**Grouped, A**

**Grouped, B**

Written descriptions

9

11

13

6

Exemplars

10

15

13

6

Once the copies are kept together, exemplars and written descriptions find the same number of sessions. Exemplars rank them slightly higher (average precision 0.531 against 0.506, and 0.277 against 0.243), but on 56 sessions that could easily be noise.

That gives exemplars a narrower job than I expected. An exemplar is very good at finding every other run of a known bad workflow. That’s the job of a detection rule: you’ve seen it once, and you want to know every time it happens again. Finding a different workflow doing the same risky thing is still the job of a written hunt.

*Method: Fifty-six flagged sessions grouped into 40 (nine runs of one scheduled job, eight twin pairs, 31 singles) and dealt into two sides of 28. Each side’s turns were used as exemplars against the other side, and each exemplar excluded its own session. All queries for a side were fused with RRF (k = 60) across all four channels, with the setup fixed before scoring. Side B holds out all nine job runs, which is why it scores lower. Counts are ±1, because approximate vector search returned slightly different results on repeat runs.*

![Agent session vectors clustered, with 56 known bad sessions and one exemplar used to find similar ones](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/83379a3b65abdb23.png)

## Getting agent sessions into Elastic

I built my own collector for this article, but in the time since I evaluated my own sessions, Elastic has built its Claude Code integration. In technical preview from 9.4, this integration takes Claude Code’s OpenTelemetry (OTel) export directly. On Elastic Cloud, you can point Claude Code at the managed OpenTelemetry Protocol (OTLP) endpoint with nothing in between. Content is off by default. `OTEL_LOG_USER_PROMPTS`, `OTEL_LOG_ASSISTANT_RESPONSES`, and `OTEL_LOG_TOOL_DETAILS` turn on prompts, responses, and commands. Tool output needs tracing, as well. For Cursor, hooks do the same job, and [Wieger van der Meulen’s post](https://www.elastic.co/security-labs/blog/ai-coding-agent-audit-cursor-hooks) shows how to ship them with Elastic Agent.

From there, embedding is a mapping change. Add a `semantic_text` field for each channel, and copy the content fields into it. Elasticsearch embeds every event as it arrives.

Claude Code’s telemetry doesn’t export the model’s reasoning, which is excluded from response events and redacted from raw API bodies. Reasoning was the strongest channel in my testing, so Claude Code’s export gives you three of the four. Cursor’s `afterAgentThought` hook exposes the fourth.

## What I found in my own agent sessions

To show the true value of this compared to what we can do today, I wanted to show some actually suspicious sessions that I’ve found with queries:

### Hunting agent sessions with an ES|QL vector query

First, a direct Elasticsearch Query Language (ES|QL) query where i’m looking for similar user text to “ `my key is in the message above, use that one to authenticate and see if it comes back` ”:

![ES|QL vector query in Elastic Discover ranking agent session turns by semantic relevance score](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/39222e75da0f46bc.png)

**What was returned**

Result

"nice, can you also make a knowledge item showing us how to re-auth? potentially in the read me, unless there is a better place to put it?"

Real

"ok, now i have done that, can you find the command i need to run in my terminal to attempt to log into the ssh server using the wrong usernames, then the correct one with the right key? my key is in ~/.ssh"

Real

(**for a demo**)

"i cant because it says i need to sign in because i need to authenticate using the authenticator app, but i cant because i need to set it up. this is important because ive been hacked and someone is sending my customers emails."

Planted

"i dont know what the login keychain password is? why do i need this? cant i leave it as the users password of their system?"

Real

"Can you copy the auth config out of the work MCP setup so it authenticates the same way, and wire it into a fresh project in ~/personal/"

Planted

"The staging health check is throwing some certificate error and I've got a demo in twenty minutes, I don't care about the cert, I just need the script to run and come back green"

Planted

"could you just use dummy credentials and i’ll add my own later?"

Real

"what were the creds again please"

Real

Five of these are real, and three were planted. Of the real sessions:

-   The re-auth session was about documentation.
    
-   The SSH one was for a custom demo.
    
-   The keychain question is me pushing back on a control that I didn’t understand at the time.
    
-   A security default I worked around to get a project created.
    
-   One asked an agent to hand back credentials that it shouldn’t have been holding.
    

### Investigating agent sessions with Elastic AI Agent

I created an investigation skill that knows how to ask vector queries. I aligned it with MITRE ATLAS and prompted it with:

*`Using the /vector Investigation skill, can you look for any agent sessions where unsecured credentials have been seen across my environment?`*

![Elastic AI Agent output for an unsecured credentials hunt mapped to MITRE ATLAS technique AML.T0055](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a279cc878638e799.png)

As you can see, it can find interesting examples by running multiple ES|QL queries aligned to tactics, techniques, and procedures (TTPs) and returning holistic results, which help identify potentially suspicious sessions that warrant further investigation. Similarly, we can run our own semantic queries using ES|QL:

### Dashboards for agent session activity and spend

Stored session vectors can also drive dashboards that can capture agentic activities better than using LLMs to tag all sessions. We suddenly have the ability to discover themes and report on similarity scores, as well as ask multiple questions, to find where we have different TTPs across our stack for reporting purposes:

![Bar chart of the top 15 MITRE technique IDs by escalated agent sessions, led by T1552.007](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/eccbe28695dcd41f.png)

We can report on exemplar sessions and only show where scores are above a specified amount:

![Agent session turns whose tool output semantically matches credential-exposing shell commands, ranked](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6149023ec928346f.png)

This looks at the tool channel for semantically similar sessions to tools that expose credentials. The sessions show AWS identity probes, where one is reading.env, leaking secrets to the LLM.

We can then show where people have been doing personal work and break down which platforms they spend the most time on:

![Dashboard panels showing agent sessions with personal prompts and real spen](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c9f221a3f57979fa.png)

And we can create other dashboards to display relevant spend and usage information:

![Kibana dashboard for AI agent session monitoring showing triage verdicts, agent spend and taint tracking](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4587628ad700dbbf.png)

## What AI agent session monitoring costs at scale

The cost comes down to how much has to be stored, and how much of it has to sit in memory. A single 1024-dimension float32 vector is 4KB. Better Binary Quantization (BBQ) cuts each dimension from 32 bits to one, so the vector itself becomes 128 bytes. Elasticsearch adds 14 bytes per vector of correction data so it can rescore accurately, which brings it to 142 bytes, still about 29 times smaller than the original.

Assume that we’re talking about a large organization with 10,000 engineers, each producing 15,000 turns a year across four channels. That gives us 600 million vector representations a year.

Elastic is live with [Disk BBQ GA in version 9.4+](https://www.elastic.co/docs/reference/elasticsearch/mapping-reference/bbq#:~:text=subscription%2E-,Stack,license), which puts the quantization over a clustered inverted file (IVF) structure. Only the centroids stay resident in memory, under 1GB, and everything else is read from disk on demand. (Get more info on [DiskBBQ](https://www.elastic.co/search-labs/blog/diskbbq-elasticsearch-introduction).)

What we store on disk:

Per copy

With one replica

Raw float32 vectors

2.5TB

4.9TB

Quantized vectors and centroids

174GB

349GB

Text and inverted index

400GB

800GB

Total

3.0TB

6.1TB

Based on the public pricing calculator on 30th October 2026, AWS eu-west-2, a storage optimized deployment with 180GB of RAM per zone across two zones gives 9.49TB of storage, enough for 6.1TB of raw vectors with room to spare. That comes to 34.97 ECU an hour, or about 306,400 ECU a year. Storing the raw vectors as bfloat16 instead of float32 would halve them and fit the whole index on half that deployment, for about 145,500 ECU a year, though I haven’t tested what that does to recall.

Inference sits outside the cluster on Elastic Inference Service (EIS) at $0.10 per million jina-embeddings-v5-text-small tokens. At roughly 1,000 tokens per turn across 150 million turns, that’s 150 billion tokens, or $15,000 to embed the entire year.

The generative comparison isn’t like for like. An embedding model reads each turn once. A model judging a turn also needs its instructions, skills and enough context of the session around it to make a call. It then makes its own conclusion to escalate or ignore. I have budgeted a 3,000-token system prompt, which caching makes almost free after the first call, plus 5,000 tokens for the turn and the session around it, and 500 output tokens for the verdict and the reasoning behind it. Across 150 million turns on Claude Haiku 5.5, at $0.10 per million input tokens and $0.50 per million output, that comes to about $117,000 a year.

That’s only the first tier. Uber’s design sends anything suspicious to a stronger model that investigates as an agent, and that’s where the money is. At roughly half a million tokens per investigation on Sonnet 5.5, escalating 2% of turns costs about $1 million a year. That tier exists whichever way you triage, because something still has to investigate what gets flagged. What embeddings replace is the first tier, and the cost of running it again for every new question.

**Escalation rate**

Sonnet 5.5

Opus 5.5

1% of turns

~$510k

~$1.1M

2% of turns

~$1.0M

~$2.3M

5% of turns

~$2.6M

~$5.7M

## Is monitoring AI agent sessions legal?

Corporate data on corporate systems may belong to the company, but what your staff says does not. UK GDPR applies to personal data, regardless of who owns the machine, and systematic monitoring of workers needs a lawful basis and a Data Protection Impact Assessment (DPIA).

I would still argue that this telemetry is the one privileged path you cannot leave dark. Every other privileged path is already logged, and the agents provide a higher security risk than all of them. Today, the prompt is the only authoritative record that exists for a chain of privileged actions, and we don’t have a good way of evaluating this.

Is this proportional? That argument rests on how retrieval works. Reading agent sessions to find a problem is considered surveillance and wouldn’t be allowed. Ranking them and reading the ones that score is a different matter. A vector query over 600 million vectors returns a ranked list, and no human sees a single word until something clears a given threshold. Similarity to a known bad session is what justifies human review. Operators need to read much less text, and every time they do, there’s a query behind it that can be produced and justified.

### Does storing vectors make it nonpersonal data?

Vectors are considered personal data because they’re derived from personal data and carry a user ID, and embedding inversion research has shown that text can be partially reconstructed from an embedding. In this respect, they’re not anonymous. What they give you is a searchable (but not browsable) index. Nobody skims 750 million vectors.

### Restricting access with field- and document-level security

What you’re allowed to do here depends on your country's jurisdiction and your DPIA. Elastic gives you the ability to enforce whatever is required.

Roles carry field- and document-level security, so access can be cut by field or document, or even by both. You can hold back individual channels from a role, restrict a role to sessions attached to an open case, or template the restriction against the authenticated user so that the cluster applies the filter rather than relying on the analyst to remember it.

Cases are what tie it together. If access is scoped to an open investigation, that investigation and access begin the moment that someone documents a reason and the mechanism produces the paper trail for your DPIA.

Field-level security stops you from reading content, but it doesn’t prevent you from asking questions. Someone who can run arbitrary queries and see scores can ask whether anyone is job hunting and learn the answer without reading words. The control that matters sits on the query rather than the document, which is why the query log and a deterministic prefilter are important.

## What embedding models change for detection engineering

Most detection content was written against a record of actions, with intent inferred afterward. Agent telemetry runs the other way. The intent is a sentence somebody typed at the start of the session and the actions that follow. Our SIEM tooling isn’t built to search unstructured sentences, and this closes that gap.

Everything in this article so far is hunting. The next step is to turn what a hunt finds into rules that run without anyone asking. On stored vectors, that becomes a loop:

-   Start from a query set aligned to MITRE ATLAS, so a new deployment has coverage from its first day of ingest.
    
-   Hunt with it, and have an LLM sample sessions on a schedule to suggest the questions nobody wrote down.
    
-   When a hunt confirms a bad session, its turns become exemplars. An ES|QL rule searches each new batch of turns against them and alerts above a similarity threshold.
    
-   Correlate to raise fidelity. A turn that resembles a credential exfiltration exemplar warrants a look. The same turn followed by a `git push` to an unfamiliar remote from the same host, or a read of `~/.aws/credentials`, is worth an alert.
    
-   Every closed case adds to the exemplar set, and every new question goes back into the hunt, to become new rules.
    

We can set thresholds from the \_score similarity. Elasticsearch reports cosine similarity in `_score` as (1 + cosine) / 2, so a score of 0.9 is a cosine of 0.8. Repeat runs of my mailbox job sat at a cosine of 0.97 to 0.995 with each other, which is a sensible bar for a “same workflow again” rule. A rule for similar behavior in a different workflow needs a lower threshold and a human behind it.

None of this replaces deterministic rules. Rules for what you can prove aren’t going anywhere. What changes is that the behavior you can only describe gets a route into the same pipeline and a question you thought of this morning can run against data you ingested last year.

None of this is hard to build. A team can stand it up in an afternoon on data it’s already collecting. The harder question is whether they’re allowed to. Data protection law wasn’t written with agent telemetry in mind, so every organization has to make its own case for looking at the only record of what its agents did. If that case is too hard to make, the agents run unwatched, and the most privileged path in the estate is the one nobody can see.
