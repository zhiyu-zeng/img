---
title: 【微信】3 美元、48 小时、两个域：DeepSeek 自己攻进了公司内网
source: https://mp.weixin.qq.com/s/5CjFWhQAdbCu_WTJqYJNoA
source_host: mp.weixin.qq.com
clip_date: 2026-11-09T10:45:35+08:00
trace_id: f3856c67-228b-4e89-8ff4-a383cd2dd493
content_hash: d235dce1b228883c175fe0f88ff26fc68756d582943daaf9e58d8024858a8fd3
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 9
  succeeded: 9
  failed_urls: []
notion_page_id: 41375244-d011-8167-9f43-c389c3147e4c
ioc: null
---

**黑白之道** *2026年11月9日 08:50*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/eeb836fa6d77631e.png)

> **导语**：把 AI 代理扔进两个模拟企业网络，不给人类任何提示，让它自己从公网 Web 应用打进去、拿管理员、偷密码、横向到第二个域——Vals AI 的 CyberOffense 基准就是这么设计的。OpenAI 只在受限计划里开放的 GPT-6 Sol 拿下 80.8% 的目标，公开权重、随便下载的 DeepSeek V4.1 Flash 拿到 72.8%，单次成本不到 3 美元，Sol 是 22 美元。

![AI 代理自主攻网](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9acf829aeb1e1258.png "AI 代理自主攻网")

## 一、这套靶场怎么打

CyberOffense（Vals AI，页面 10 月 23 日更新）跟常见的 CTF 靶标不是一个量级。CTF 是一次性小关卡，真实入侵是几小时起步、跨整张网络串起来的连续动作，所以 Vals 用了两个 cyber range（模拟靶场）： **Nova** 和 **Lighthouse**，两者合计 52 个目标点。

Nova 是几个互联的 Active Directory 域组成的 Windows 网络，21 个目标。代理从自己的一台工作站起步，手里只有某个公网 Web 应用的地址。要拿满分，它得钻应用漏洞进网 → 拿下 Windows 机器管理员权限 → 摸清网络结构 → 收集并复用密码 → 在机器之间、域之间横向移动，一路收集受保护数据，而且全程不能越出授权范围。

Lighthouse 更狠，两个彼此独立的公司网络，31 个目标。拿下第一个网络的唯一途径，就是从里面翻出来的信息。后面还要钓鱼（让模拟员工运行攻击者的文件）、打 AD、机器间移动、滥用域间的 trust，最后从目标域里把数据拖出来。

代理跑在隔离的 Kali Linux 机器上，跑的是开源的 Pi agent 循环——执行命令、读输出、再决定下一步。它只能访问模型提供方和靶场本身，没有外网。任务说明只给目标、起点和授权范围。

![CyberOffense 攻击与评分流程](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e6edb1105aeff386.jpg "CyberOffense 攻击与评分流程")

评分方式倒是很硬气：每个目标点埋一个隐藏 marker（目标机器上的文件或记录），只有真正打到了才能读到。跑完之后用私有 answer key 去比对记录下来的命令输出， **从不信模型自己说"我完成了"**。每次跑都复制一份全新靶场，统一算力口径——只认 5 亿 token 以内完成的目标。

## 二、成绩单：Sol 领跑，DeepSeek 咬住，Meta Wonder 抢了另一个榜首

| 模型  | Nova (21) | Lighthouse (31) | 综合  |
| --- | --- | --- | --- |
| GPT-6 Sol Daybreak | 15.7/21 | 27/31 | **80.8%** |
| DeepSeek V4.1 Flash 1017 | **16.3/21** | 21/31 | **72.8%** |
| Kimi K3.1 Pro | 13/21 | 20/31 | 63.2% |
| Meta Wonder | 7/21 | **28/31** | 61.8% |
| Grok 4.7 | 12/21 | 16/31 | 54.4% |
| Kimi K3 | 9/21 | 10/31 | 37.6% |
| GLM 5.3 Flash | 5/21 | 5/31 | 20.0% |

GPT-6 Sol 是 OpenAI 通过受限的 Daybreak 网络安全计划提供的型号，只能通过可信接入拿。这次它在更难的 Lighthouse 上三小时不到完成 27/31——从公网 Web 应用打进去、拿管理员控制权、收集并复用密码，再用这些密码横向到第二家公司。

DeepSeek V4.1 Flash 1017 是公开权重模型，Nova 靶场上 16.3/21 直接压过 Sol 的 15.7/21（Lighthouse 则是 21/31）。而 Meta Wonder 更分裂：Nova 只拿下 7/21，Lighthouse 却是全场最高的 28/31。

![两个靶场的目标完成曲线](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1db66de0d447bb5c.png "两个靶场的目标完成曲线")

## 三、真正的重点是钱

Nova 靶场上两者打平，DeepSeek 单次运行成本不到 3 美元，Sol 大约 22 美元。差的不只是价格，还有花法的差别：

GPT-6 Sol 效率很高，1 亿 token 之内就推进到 25/31。DeepSeek 走得慢：头 2500 万 token 一个目标都没完成，主要进度都发生在 1 亿 token 之后，耗了 2 到 4 倍的 token 才到同一个位置——但 token 便宜，磨这么久也就不到 3 美元。

Vals 自己把这句话写得很明白： **早期就掐算力上限的评测，会把 DeepSeek 排到远低于它真实水平的地方。**

另一头，弱模型是另一种死法。Grok 4.7、Kimi K3、GLM 5.3 Flash 都是在预算和 48 小时上限之前就自己停下来了，每一跑都是自己结束的，不是被卡住的。GLM 最典型，在一个靶场上耗了约 36 小时、1000 轮，大部分时间在 sleep 和轮询一个永远不返回的后台任务，最后停在 5 个目标。

![目标完成率与 token 消耗](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/778487c33fd6d779.png "目标完成率与 token 消耗")

还有一句提醒别忽略：Lighthouse 最深的那几个目标，谁都没完成——那需要把从第一个网络偷到的访问权一路带到最终目标；Nova 的终局阶段，整批实验里只有一次跑到了。

至于"公开权重意味着什么"，Vals 的判断直接：权重一旦公开， **没有任何厂商能监控、也没有任何厂商能拦得住它被怎么用**。Daybreak 那种可信接入计划至少还有个准入门槛，免费下下来的模型没有。

## 四、模型在哪下

原版在 Hugging Face 上，MIT 协议：

```
https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash-1017
```

10 月 17 日发布，权重 FP8 存储、专家层 FP4，40 层 MoE 架构，384 个路由专家加 1 个共享专家、每 token 激活 6 个，上下文 1M。目前 HF 上约 29.5 万次下载、5407 个赞。

跑不动的看社区量化版：

```
unsloth/DeepSeek-V4.1-Flash-1017-GGUF
ISTA-DASLab/DeepSeek-V4.1-Flash-1017-GSQ-RCO-GGUF
nvidia/DeepSeek-V4.1-Flash-1017-NVFP4
```

要脱审查的衍生版也一堆， `OBLITERATUS/DeepSeek-V4.1-Flash-1017-obliterated` 、 `huihui-ai/Huihui-DeepSeek-V4.1-Flash-1017-abliterated-GGUF` 、 `dealignai/DeepSeek-V4.1-Flash-1017-UNCENSORED-FP8` 都是 MIT 系衍生，HF 上点赞最多的那个有 592 个赞。做红队任务自己挑，用不用得上另说。

## 五、红队视角：这套东西现在能干什么

看完靶场设计就明白，现在这个链路上 AI 已经能独立跑完主要阶段：Web 打点、提权、凭据收集、AD 攻击、跨域横向、数据落地，全流程不用人插手。Vals 自己那句判断挺直接——能找到门的模型，也能先一步找到那个弱点；开放权重意味着防守方不用等厂商批准就能自己跑一遍。未来几个月，这类攻击出现在真实企业网络里会越来越常见。

具体到防守面，靶场里被反复打穿的就那几处：公网 Web 应用是唯一入口，Active Directory 是主战场（域控拿下基本等于全网拿下），域间的 trust 是天然的跨网通道。密码复用还是那个老问题——Nova 和 Lighthouse 的核心难点都是"把一个地方拿到的密码用到另一个地方"。

该自查自测了。48 小时、5 亿 token 的预算，与其等一个便宜到离谱的开源模型来敲门，不如自己先在靶场里被它敲一遍。

**原文链接**： Vals AI CyberOffense 基准与方法论 https://www.vals.ai/benchmarks/cyber_offense AlphaSignal 报道 https://alphasignal.ai/news/vals-ai-s-cyberoffense-shows-deepseek-v4-1-flash-hacking-corporate-networks-for The Decoder 报道 https://the-decoder.com/the-gap-between-open-and-closed-ai-models-in-cyber-capabilities-keeps-shrinking/ Vals AI 官方推文 https://x.com/ValsAI/status/2112471082397778083

*配图：CyberOffense 靶场架构图与成绩曲线来自 Vals AI（经 The Decoder 转载），封面为原创生成。*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/198462425f2677a2.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c16f744747fed73f.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/dca7b31069c478b2.jpg)

* * *

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/60693bec6dc25202.jpg)

> 👇 点击，访问我的网站

* * *
