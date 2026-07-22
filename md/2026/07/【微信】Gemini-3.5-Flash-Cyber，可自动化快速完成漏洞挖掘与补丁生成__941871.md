---
title: 【微信】Gemini 3.5 Flash Cyber，可自动化快速完成漏洞挖掘与补丁生成
source: https://mp.weixin.qq.com/s/fvWnDvAx0aKRKlgW_RR9VQ
source_host: mp.weixin.qq.com
clip_date: 2026-07-22T19:00:24+08:00
trace_id: 1b3a64cf-44b5-48d2-b759-25ca81275ce1
content_hash: 1450cecca9948f760b5d1be221d4aef05df429f5a441ad66745ae2586e46b3cb
status: summarized
tags:
  - 微信
  - 漏洞分析
  - 安全工具
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: Google发布安全专用AI模型Gemini 3.5 Flash Cyber，能自动化、高效率地完成漏洞挖掘与补丁生成。
ai_summary_style: key-points
images_status:
  total: 5
  succeeded: 5
  failed_urls: []
notion_page_id: 3a575244-d011-8164-8428-d230aad5d5d4
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Google发布安全专用AI模型Gemini 3.5 Flash Cyber，能自动化、高效率地完成漏洞挖掘与补丁生成。
> 
> - **模型特点：** 基于Gemini 3.5 Flash基础模型微调，牺牲原始规模以换取更快的速度和成本效率，适合大规模部署和频繁扫描。
> - **基准测试表现：** 在CyberGym、Big Sleep等基准测试中表现优于更大模型；在V8 JavaScript引擎测试中，共发现55个独立问题，多于Claude Opus 4.6和主线Flash模型。
> - **实际应用案例：** Google内部团队使用该模型，在两小时内发现了公共API中的远程代码执行漏洞及内存损坏漏洞，并生成了可绕过ASLR等保护机制的利用程序。
> - **部署策略：** 鉴于潜在滥用风险，Google通过CodeMender以有限访问试点形式向政府和可信合作伙伴提供，并同步通过企业平台开放核心功能。

**FreeBuf** *2026年7月22日 18:36*

![FreeBuf](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/7c122de5d3efe346.gif) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/0e32639b5c48eb1d.png)

Google正式发布了Gemini 3.5 Flash Cyber，这是一款专门面向网络安全的模型，经过微调后能够比主线Gemini Flash模型更快速、更高效地发现、验证并修复软件漏洞。此次发布标志着Google在自动化安全研究领域的重大扩展，其基础工具包括CodeMender——该公司自主开发的AI驱动代码安全Agent。

随着AI Agent发现漏洞的能力日益增强，防御者面临一个严峻挑战：攻击者找到漏洞的速度可能比安全团队修复漏洞的速度更快。Google的应对方案并非采用更大的模型，而是更智能、更经济的模型。

基于Gemini 3.5 Flash基础模型，3.5 Flash Cyber以牺牲原始规模换取速度和成本效率，使其适用于大规模部署。这一点至关重要，因为漏洞狩猎本质上是一个搜索问题：扫描庞大的代码库意味着要探索海量的执行路径，而依赖单次昂贵的大模型调用会导致瓶颈。

CodeMender通过多次调用3.5 Flash Cyber来解决这个问题，让子Agent并行分析更多代码路径，然后整合成一份高质量漏洞报告。这种设计让该模型非常适合频繁扫描、时间敏感的上线流水线以及大规模提交级扫描。

Part01

Gemini 3.5 Flash Cyber性能表现

Google对该模型进行了广泛测试：

-   CyberGym基准测试：每个报告最多使用五次调用，采用3.5 Flash Cyber的CodeMender与体积更大、成本更高的网络安全模型相比取得了具有竞争力的结果。
    
-   Big Sleep评估：在Chrome和Safari等复杂代码库上，3.5 Flash Cyber的表现显著优于主线3.5 Flash和3.6 Flash。
    
-   Chrome生产环境提交扫描：针对未公开漏洞（确保无数据污染）进行测试，该模型相比主线Flash的成功率大幅提升。
    
-   V8 JavaScript引擎测试：3.5 Flash Cyber发现了55个独立确认的问题，而主线3.5 Flash发现了47个，Claude Opus 4.6发现了36个，其中包括两个竞品均未发现的10个问题。
    

Google指出，较弱的模型往往会反复报告同一发现，而像3.5 Flash Cyber这样更强的模型能覆盖更广的范围，并随着调用次数的增加持续发现新漏洞。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/16d28c8380d799da.png)

Part02

Gemini 3.5 Flash Cyber实际应用

除基准测试外，3.5 Flash Cyber已在Google内部代码库中投入使用，包括Chrome、Android、Cloud、Ads和YouTube。一个典型案例是，Google云漏洞研究团队使用该模型仅在两小时内就发现了公共API中的远程代码执行漏洞，以及一项敏感生产服务中的内存损坏漏洞。随后，该模型生成了一个完全可靠的RCE利用程序，能够绕过ASLR和W^X等保护机制。

鉴于其潜在的滥用风险，Google正谨慎部署3.5 Flash Cyber。初始阶段将通过CodeMender以有限访问试点形式向政府和可信合作伙伴提供，后续逐步扩大开放范围。此外，CodeMender的核心功能也通过Gemini Enterprise Agent Platform面向企业客户提供。

Google的优势源于数十年的安全基础设施积累：OSV.dev（收录超过70万个开源漏洞的数据库）以及10年以上的OSS-Fuzz测试结果，这些数据为训练AI模型学习真实安全专家的实际操作方式提供了高质量的素材。

参考来源：

Gemini 3.5 Flash Cyber With Automated Faster Vulnerability Detection and Patch Capabilities

https://cybersecuritynews.com/gemini-3-5-flash-cyber/

![扫码加入AI安全交流群](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/bc7cdca0f87c11ed.png) ![下载FreeBuf知识大陆APP](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/38686c230a3b5a7d.png)
