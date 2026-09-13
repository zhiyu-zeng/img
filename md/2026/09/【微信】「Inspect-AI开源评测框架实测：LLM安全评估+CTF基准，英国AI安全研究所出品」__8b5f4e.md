---
title: 【微信】「Inspect AI开源评测框架实测：LLM安全评估+CTF基准，英国AI安全研究所出品」
source: https://mp.weixin.qq.com/s/_z4IXIIsOjJyfKolF6SBWw
source_host: mp.weixin.qq.com
clip_date: 2026-09-13T10:03:46+08:00
trace_id: b464c900-99fe-45b4-bef6-544675f84dc3
content_hash: cc2f77945621ea99e10110fa63b4cd4b2bc5c7ad36d2dc3e1cd69cf5176e2ed6
status: synced
tags:
  - 微信
  - AI应用
  - 漏洞分析
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: Inspect 是英国 AI 安全研究所开源的大模型安全评估框架，把「模型有多容易出事」量化为可复现、可跨模型对比的分数，而非运行时拦截。
ai_summary_style: key-points:weak
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 3da75244-d011-8183-a972-fd332127b3a6
ioc: null
---

> 💡 **AI 总结（key-points:weak）**
>
> Inspect 是英国 AI 安全研究所开源的大模型安全评估框架，把「模型有多容易出事」量化为可复现、可跨模型对比的分数，而非运行时拦截。
> 
> - **核心模型：** 一切评估由 Task = dataset（题目）+ solver（怎么问，可为带工具的 Agent）+ scorer（怎么判分）组成，跑 `inspect eval` 得到分数、逐样本日志，`inspect view` 可视化查看。
> - **安全专用能力：** 框架自带 Agent 工具调用、多轮对话与 Docker / Kubernetes 沙箱，能在受控环境里派发真工具、执行代码，观察模型是否被提示词注入牵着走。
> - **内置基准：** `inspect_evals` 含 200+ 预置评估，代表项有 Cybench（39 道真实 CTF，覆盖密码学、Web、逆向、取证、pwn、杂项）、CyberSecEval 2/3/4、AgentDojo、CodeIPI（间接提示词注入）、CVEBench。
> - **上手成本：** 最小示例约 30 行——一个 `@task` 串起安全数据集、系统提示、`model_graded_fact()` 评分器，命令如 `uv run inspect eval inspect_evals/cybench --model openai/gpt-5-nano`。
> - **注意点：** 评估器不是防火墙；沙箱默认权限较开，CTF 类任务建议切 Kubernetes 沙箱加域名过滤；判分模型需抽查，重要评估另指定 judge；起容器跑数十上百样本资源开销不低。
> - **工具链定位：** garak / PyRIT 负责打洞，Inspect 负责把风险量化成基线分数，PurpleLlama 的运行时护栏负责线上挡，形成打、测、防闭环。

**句芒安全实验室** *2026年9月13日 09:45*

搞 AI 安全的人手里不缺点攻击工具：garak 能一顿乱扫，PyRIT 能把越狱编排起来，PurpleLlama 给模型套壳。可到了真要给自家模型交一份"它到底安不安全"的结论时，画风立刻尴尬——拿什么术语、多大的样本、跑完怎么看结果，全得自己从零搭。英国 AI 安全研究所（UK AISI）把官方做测试评估的那套东西打包开出来了，就是今天句芒深挖的 **Inspect**。

## 它是什么：官方评测框架，不是又一个扫描器

Inspect（ `UKGovernmentBEIS/inspect_ai` ）是英国 AI 安全研究所开源的大模型评估框架，MIT 许可，Python 写的，2026-09-13 核实 2757 颗星，仍是活跃维护的旗舰项目。

它和前面扫过的工具性质不一样。garak、PyRIT 是 **红队工具**——帮你把洞打出来；Inspect 是 **评估框架**——你把数据集喂进去，它负责一轮轮问模型、收集回答、给答案打分，最后吐出一份可复现、可比对的分数报告。核心就一个概念：Task = dataset（数据集）+ solver（求解器）+ scorer（评分器）。dataset 是你的题目，solver 是"怎么问"（最简单的就是调用一次模型，复杂的是一整套带工具的 Agent），scorer 是"怎么判对错"。

跑一次 `inspect eval` ，你会得到每个模型的分数、每条样本的详细日志，还能用内置的 `inspect view` 打开日志面板可视化地看——这批评估是能贴在报告里、能跟下一版模型对比的硬指标，不是随口一句"感觉还行"。

## 为什么给 AI 安全用：把威胁装进沙箱里量

安全评测和普通能力评测最不同的地方在于：你不能只静态问模型，得 **在受控沙箱里给它真工具**，看它被注入牵着走的时候会不会真去执行、会不会利用漏洞、会不会把恶意代码跑起来。Inspect 把这块做成了标准件——Agent 工具调用、多轮对话、沙箱环境（Docker / Kubernetes）都是框架自带的能力，尤其是给模型派发计算环境做"带执行的任务"时不打手抖。

它自带的日志视图能看到一整个评估过程，正好是安全测试想要的透明可审计：

![Inspect 的 CTF 安全评估日志视图（仓库官方示例图）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4839c211ebcaf952.png "Inspect 的 CTF 安全评估日志视图（仓库官方示例图）")

## 内置的安全/CTF 基准：装上就能跑

Inspect 多年沉淀出一个 `inspect_evals` 仓库，内置 200+ 预置评估，安全方向尤其能打，拿几个直接点名：

-   **Cybench**：39 道真实 CTF 题，覆盖密码学、Web 安全、逆向、取证、漏洞利用（pwn）、杂项六大域。这玩意儿默认把模型扔进带 Kali 的沙箱、还默认开 Kubernetes 沙箱做域名过滤——安全做足了才敢放模型去解题。
    
-   **CyberSecEval 2 / 3 / 4**：脱胎于 Meta PurpleLlama 的安全评估套件，测提示词注入、代码解释器滥用、漏洞识别与利用，v4 还加了 MITRE ATT&CK 合规、误拒率、多语言提示词注入、多轮钓鱼模拟、恶意软件分析、威胁情报推理。
    
-   **AgentDojo**：专测 AI Agent 在"工作区 / 订票这类真实环境"里会不会被第三方提示词注入劫持。
    
-   **CodeIPI**：测编码 Agent 对藏在 issue 描述、代码注释、README 里的 **间接提示词注入** 的抵抗力。
    
-   **CVEBench**：量化 AI Agent 利用真实 Web 应用漏洞的能力。
    

想跑一条，直接一行命令，比如 `uv run inspect eval inspect_evals/cybench --model openai/gpt-5-nano` 。打分面板长这样，跨模型跨任务一眼对比：

![Inspect 的多模型分任务得分面板（仓库官方示例图）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/88af44e46d2712dc.png "Inspect 的多模型分任务得分面板（仓库官方示例图）")

## 上手：最小 30 行就能跑一条评估

Inspect 的最小项目极简。官方教程里的"安全问答"示例就是全貌——一个 `Task` ，把一个安全知识数据集、一段系统提示、一个"由模型判分"的评分器串起来，加一行 `@task` ：

```python
from inspect_ai import Task, task
from inspect_ai.dataset import example_dataset
from inspect_ai.scorer import model_graded_fact
from inspect_ai.solver import generate, system_message

SYSTEM_MESSAGE = """
You are a computer security expert tasked with providing
concise responses to the following questions.
"""

@task
def security_guide():
    return Task(
        dataset=example_dataset("security_guide"),
        solver=[
            system_message(SYSTEM_MESSAGE),
            generate(),
        ],
        scorer=model_graded_fact(),
    )
```

跑一下并打开日志面板：

```
inspect eval security_guide.py --model openai/gpt-5
inspect view
```

跑通这一条，剩下的就是把 dataset 换成你关心的安全题（提示词注入话术、越狱样本、漏洞利用 prompt……），把 solver 从"单次调用"换成"带工具和沙箱的 Agent"，Inspect 从底层给你兜住。

## 避坑点

-   **评估≠运行时护栏**：Inspect 给你"模型有多容易出事"的 **分数**，它不拦截线上流量。要真机防御还是得靠 PurpleLlama 那套 Llama Guard / Prompt Guard 之类的运行时组件，别把评测器当防火墙用。
    
-   **沙箱别裸奔**：跑 CTF 这类带执行任务时，默认 Docker 沙箱权限较开，能切 Kubernetes 沙箱+域名过滤就切，否则等于把带工具的红队模型放养在本机。
    
-   **判分模型要核对**： `model_graded_fact()` 默认"被测模型自己给自己判分"，不同模型、不同协议下的打分一致性要抽查，重要的评估单独指定一个更稳的 judge 模型。
    
-   **资源开销不低**：一跑就是几十上百条样本、还可能起沙箱容器，评估机资源要按需给，别想着在笔记本上平替完整基准。
    

## 和 garak、PyRIT、PurpleLlama 怎么配

把四者放一条流水线就顺了： **PyRIT / garak 负责把洞打出来** （越狱、注入、漏洞诱导）， **Inspect 负责把风险量化成可复现的分数基线** （同一套题、跨模型跨版本对比）， **PurpleLlama 的运行时护栏负责在线上挡**。Inspect 甚至直接把 PurpleLlama 的 CyberSecEval 基准搬进了 `inspect_evals` 就能跑——打、测、防三段闭环，AI 安全才算真正落地成工程。

## 适合谁

给自家大模型或 AI Agent 做安全基线、想要开源不绑平台、要一份能写进报告的可复现评估的团队和个人。仓库 GitHub 搜 `UKGovernmentBEIS/inspect_ai` ，文档在 `inspect.aisi.org.uk` ，安全基准在姊妹仓库 `UKGovernmentBEIS/inspect_evals` 。具体装哪个扩展、怎么配你的沙箱和模型，你按自己环境去仓库和文档里翻，别图省事直接照抄。
