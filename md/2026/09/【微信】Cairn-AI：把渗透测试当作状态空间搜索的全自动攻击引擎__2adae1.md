---
title: 【微信】Cairn AI：把渗透测试当作状态空间搜索的全自动攻击引擎
source: https://mp.weixin.qq.com/s/NmL_mVyHfid7oJ5cMfqkrA
source_host: mp.weixin.qq.com
clip_date: 2026-09-21T09:12:59+08:00
trace_id: 9aefed4b-0ace-4f2a-9131-7b66d1ada632
content_hash: 140f6013b74dc85465ddfdfb5bcdf368bdd7836e6d65a6daf52079a04c5f6395
status: synced
tags:
  - 微信
  - 安全工具
  - AI应用
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: Cairn 是把渗透测试抽象为"有方向的状态空间搜索"的全自动攻击引擎，零预置角色、零 RAG，在第二届腾讯云黑客松 AI 渗透测试挑战赛中助队伍成为唯一 AK 全清 54 题者。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 3e275244-d011-81b3-9049-f1a1cb832eaa
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Cairn 是把渗透测试抽象为"有方向的状态空间搜索"的全自动攻击引擎，零预置角色、零 RAG，在第二届腾讯云黑客松 AI 渗透测试挑战赛中助队伍成为唯一 AK 全清 54 题者。
> 
> - **核心论断：** 渗透测试=起点（IP/系统）、终点（shell/flag）明确而路径未知的搜索问题；该结构可外推到漏洞研究、CTF、数学证明。
> - **三原语机制：** 黑板架构 + Fact-Intent 图，Fact 为已验证事实、Intent 为待执行意图、Hint 为人类注入判断；Agent 之间靠共享黑板以 Stigmergy 式 Fact 接力协作，无直接通信。
> - **任务与运行：** 同一 Worker 跑 OODA 循环，承担 Bootstrap/Reason/Explore 三类动态生成任务；后端可选 Claude Code、Codex、Pi；Server 管图一致性，Dispatcher 为协议唯一写入方并按项目拉起 Worker 容器。
> - **部署：** Docker 模式 `docker compose up --build` 后服务在 8000 端口，数据落 `./datas/cairn/`；本地模式免 Docker，复用已登录 CLI；要求 macOS/Linux + Python ≥ 3.12。
> - **优劣：** 抽象层级高、调度细到任务级（便于审计重放回滚）、Hint 支持人工介入；短板是 AGPL-3.0 商用需授权、强依赖单点 LLM 能力、生态与文档尚新。

**黑白之道** *2026年9月21日 08:33*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/eeb836fa6d77631e.png)

> **导语**：腾讯云黑客松AI渗透测试挑战赛第二届，610支队伍、1345名选手同台竞技，清华、北大等顶尖高校和一线安全公司都派人下场。结果只有一支队伍全清54道题拿到AK（全场唯一），他们用的是一款叫Cairn的开源引擎——零预置Agent角色、零RAG检索增强、零域内工具，比赛当天凌晨4点才第一次上线完整流水线。

* * *

## 一、它到底干了什么

Cairn自我定位为"通用状态空间搜索引擎"，渗透测试只是它的第一个验证领域。它的核心论断很黑客： **渗透测试本质上是有方向的搜索问题**。

起点已知——目标IP、目标系统；终点定义——拿到shell或拿到flag；路径未知——这一坨就是搜索空间。Cairn把这套结构推广到漏洞研究、数学证明、CTF解题上，凡是"起点明确、成功条件明确、中间路径未知"的问题，它都拿来跑。

这思路比现在满大街的"AI安全Agent"高一个段位——别人还在堆工具编排、写一堆"扫描员/漏洞验证员/提权员"的角色扮演提示词，Cairn干脆不预设任何角色，让Agent根据当前图状态自己生成下一步任务。

![Cairn核心架构图](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c608d064578d356d.png "Cairn核心架构图")

* * *

## 二、技术架构：黑板+Facts/Intents/Hints

Cairn用的是经典AI架构里的 **黑板架构（Blackboard Architecture）**，配一张显式的"事实-意图图（Fact-Intent Graph）"。整个引擎只靠三个原语运转：

-   **Fact（事实）**：板上写死的客观发现，已验证，落字为据
    
-   **Intent（意图）**：声明的探索方向，还没执行
    
-   **Hint（提示）**：人类随时注入的判断，下一次Agent读图时被吸收
    

图从起点向终点生长。每多一个Fact，就是多一块垫脚石；每个Intent都是朝未知迈出的一步。

跑任务的是 **Agent Worker**，每个Worker独立跑 **OODA循环**——观察全图、定位当前状态、决策下一个Intent、执行探索、把发现回写成新Fact。Worker没有固定岗位，任务完全根据图实时状态动态生成，不是从预设任务清单里挑。

Agent之间互不直接通信，全部通过共享黑板协作，这种模式叫 **Stigmergy（信息素协作）**——蚂蚁靠信息素接力，Agent靠Fact接力。 **没有信息孤岛，没有直接调用，所有协调都通过板上数据**。

三类任务全部由同一个Worker执行：

-   **Bootstrap**：项目启动时，尝试直接解题，可能产出Fact甚至直接宣告Complete
    
-   **Reason**：读全图，判定目标是否已达成，决定下一步生成哪些Intent
    
-   **Explore**：认领一条Intent，真正执行探索，回报一个Fact
    

后端支持三种——Claude Code、Codex、Pi（一种编码Agent），随你机器上装了啥。

* * *

## 三、部署与运行：Docker与本地两套模式

Cairn的部署分两层： **Cairn Server** 只管图一致性， **Cairn Dispatcher** 读图、调度任务、拉起/销毁Worker容器，是协议的唯二写入方。每个项目独占一个Worker容器，容器内多个Worker并发跑。

**Docker模式**：

```bash
docker pull --platform=linux/amd64 ghcr.io/oritera/cairn-worker-container:latest
cp dispatch.example.yaml dispatch.yaml
docker pull ghcr.io/astral-sh/uv:python3.13-trixie
docker compose up --build
```

服务器跑在8000端口，Dispatcher挂载根目录的dispatch.yaml，通过宿主socket连Docker，数据持久化到`./datas/cairn/` 。

**本地模式**——不装Docker也行，Worker直接跑在Dispatcher宿主上，复用机器里已经登录好的 `claude/codex/pi` CLI。配置文件用 `dispatch.local.example.yaml` ，启动时Dispatcher会自检每个CLI是否就位。

前置条件：macOS或Linux + Python 3.12+。Docker仅容器模式需要，本地模式不要。

* * *

## 四、红队视角：凭什么它能全清

比赛是2026年9月20日凌晨4点才第一次把完整流水线跑通的—— **没有训练、没有调参、没有域内工具**。这种"零预热直接上战场"还能拿到全场唯一AK，说明架构层面的设计撑得住。

对红队实战我的判断：

**一是抽象层级够高**。别的AI Agent工具把"扫描/漏洞验证/利用/提权"硬编码进System Prompt，Cairn把这些全部扔给运行时——Agent根据图状态自己决定下一步干啥。这意味着同一套引擎，明天拿去挖0day、后天拿去解CTF、大后天拿去验证数学猜想， **底层不用改**。

**二是调度粒度细到任务级**。Dispatcher是协议唯一写入方，图的每一次变化都集中管理， **审计、重放、回滚天然容易**。这给红队作战复盘、合规留痕提供了现成基础设施。

**三是把"人"也接进来了**。Hint机制允许操作员在任意时刻注入判断，Worker下一次读图就吸收。在红队作战里这就是战术指挥入口——Agent跑偏了，你一句话拨回来。

短板也得提： **AGPL-3.0协议，商业用要单独谈授权**；系统对单点LLM能力依赖极强，换个弱一点的模型整套逻辑就垮；目前生态新，文档和案例都在补。 **这是工具，不是银弹**。

* * *

## 五、工具仓库

-   **GitHub**：https://github.com/oritera/Cairn
    
-   **协议**：GNU AGPLv3（个人/教育免费，商业用途需授权）
    
-   **后端支持**：Claude Code、Codex、Pi
    
-   **前置**：Python ≥ 3.12，可选Docker
    
-   **本地clone & 安装**
    
    ```bash
    git clone https://github.com/oritera/Cairn.git
    cd Cairn
    cp dispatch.example.yaml dispatch.yaml   # 填入LLM端点和API Key
    # Docker模式
    docker compose up --build
    # 或本地模式（无需Docker）
    cp dispatch.local.example.yaml dispatch.yaml
    uv run --project cairn cairn serve
    uv run --project cairn cairn dispatch --config dispatch.yaml
    ```
    
-   **原推**：https://x.com/0x0SojalSec/status/2101483385747304452
    
-   **比赛复盘（中文）**： [TCH腾讯云黑客松AI渗透测试挑战赛全清复盘](https://mp.weixin.qq.com/s?__biz=Mzk2NDgwMTY5Nw==&mid=2247484051&idx=1&sn=31b30c8f8b381dd434fd98f99330e848&scene=21#wechat_redirect)
    

* * *

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/60693bec6dc25202.jpg)

> 👇 点击，访问我的网站

* * *
