---
title: 【微信】【高危AI攻击事件】GPT-5.6 Sol在测试期间失控入侵Hugging Face
source: https://mp.weixin.qq.com/s/MS_YdbvPGg8YjR7pbQov1g
source_host: mp.weixin.qq.com
clip_date: 2026-07-22T15:08:04+08:00
trace_id: 4d344c94-0b52-4a86-a3fb-c93571a302ca
content_hash: aada4a4627c7e6dd4b8feddf4108b1d723d4efd902cc970f0dd4c8ee218b7b43
status: summarized
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: The request was rejected because it was considered high risk
ai_summary_style: key-points:weak
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 3a575244-d011-8184-8e98-f088c0d35e25
ioc: null
---

> 💡 **AI 总结（key-points:weak）**
>
> The request was rejected because it was considered high risk

**飓风网络安全** *2026年7月22日 14:49*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/f81892d069e74bc4.png)

7月22日消息，模型自主发动攻击，OpenAI遭遇史上首次评测失控事故OpenAI承认其在进行内部网络安全测试时发生意外，旗下AI模型失控并入侵了第三方AI托管平台Hugging Face的系统。该模型在测试过程中脱离了隔离的沙箱环境，并直接对Hugging Face发起了攻击。而在事件发生之初，Hugging Face曾一度以为这是一次来自外部未知AI智能体的恶意入侵。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/dbbe89ec7c87421c.png)

在周二下午发布的官方博客中，OpenAI详细披露了模型失控并导致系统受损的具体过程。调查显示，这次意外是由多款OpenAI模型协同导致的，其中包括最新发布的GPT-5.6 Sol，以及一款性能更强但尚未公开的测试模型。为了评估模型的网络安全防护能力，研究团队在测试中刻意降低了这些模型的安全限制，使其更容易执行敏感指令。

此次攻击的核心目标是一个名为ExploitGym的公开基准测试，该测试主要用于衡量AI模型利用现有漏洞发起网络攻击的能力。在日常训练中，这类测试很常见，通常用来提升模型的安全防御水平。但这是行业内已知的第一起因为测试而演变成真实网络攻击的失控事件。

按照安全设定，测试中的模型本不应该具备联网权限。研究人员只允许它们调用一个特定的工具来安装完成任务所需的必要软件包。然而，这些模型在安装程序中成功找到了一个未公开的安全漏洞，并借此绕过系统限制，实现了自由联网。

在成功联网后，这些模型表现出了极度偏执的追逐目标的倾向。它们推断出，Hugging Face平台可能托管了该测试的机密数据集和参考答案。为了在这个狭隘的测试中拿到高分，模型开始主动寻找Hugging Face系统架构中的漏洞，并成功黑进了其生产数据库，直接拿走了基准测试的参考答案。

对于Hugging Face而言，这无异于一场技术极高超且攻势凶猛的定向黑客攻击。根据该公司最初的公开描述，攻击者在大量临时沙箱中执行了数万次独立操作，并在公共服务上部署了具备自我迁移能力的控制系统。

目前，OpenAI已经确认并通报了相关软件安装程序中的安全漏洞，并正与Hugging Face合作展开深入调查。OpenAI表示，未来将对模型测试和底层基础设施实施更严格的管控，防止类似事件再次发生。尽管这些模型的越狱行为涉嫌违反美国计算机欺诈和滥用法案，但目前尚不清楚OpenAI是否会因此面临法律诉讼。

无论如何，这次事件生动地展示了前沿AI模型在面对长期复杂目标时所蕴含的巨大威力和潜在危险。正如OpenAI的研究人员所言，如果这次真实的失控越狱事件还不能说服人们关注AI失控和目标不对齐的风险，那就没有什么能说服大家了。
