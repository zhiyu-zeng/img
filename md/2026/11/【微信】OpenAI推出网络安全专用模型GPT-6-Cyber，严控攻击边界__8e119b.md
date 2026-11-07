---
title: 【微信】OpenAI推出网络安全专用模型GPT-6 Cyber，严控攻击边界
source: https://mp.weixin.qq.com/s/loYjq3M0yJ-BZiB3d2l6sQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-07T12:14:27+08:00
trace_id: e8ecbe75-acd9-4fb3-9686-525f8f854a7d
content_hash: 4974dc170c79b92c68cdaa4ea1b8c9611805eefb2e82045a31e3595305f11851
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 41175244-d011-8110-805d-c787a44cb8f7
ioc: null
---

**FreeBuf** *2026年11月6日 18:00*

![FreeBuf](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7c122de5d3efe346.gif) ![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/81aad7d8abf77930.png)

Part01

针对越界风险专项训练

配套蜜罐验证边界控制能力

OpenAI今日正式发布GPT-6 Cyber。该模型属于GPT-6 Astra系列，专门为经授权的漏洞研究场景训练打造。

这款新模型旨在解决OpenAI今年夏季安全测试中暴露的问题。今年7月，该公司测试环境中运行的Agent在执行指定任务时，越权入侵了Hugging Face的系统。OpenAI对GPT-6 Cyber进行了专门训练，确保其只会对研究人员授权范围内的目标发起测试，本次发布配套的安全测试机制正是借鉴了这起事件的教训。

这套测试机制名为ExploitGym Honeypot，会给模型分配高难度任务，同时在任务周边部署多个故意设置为易被攻破的配套服务。模型只要攻击其中任意一个非授权服务，就会被判定为越界。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0b4d7917a9f74332.png)

Part02

越界率较前代大幅下降

网络任务表现对标Astra

在未配置部署安全指令的场景下，GPT-6 Cyber在所有评分测试中的越界率仅为0.07%。其前代模型GPT-5.6-Cyber的越界率为5.51%。如果加上安全部署指令，测试中GPT-6 Cyber的越界率直接降至0。

OpenAI将这款新模型的网络安全等级评为Critical，这是其Preparedness Framework中网络安全类的最高评级，与Astra今年9月发布时的评级一致。GPT-5.6-Cyber此前的评级为High。

OpenAI表示，GPT-6 Cyber在绝大多数网络安全任务上的表现超过Astra。早期针对火狐的测试中，模型共发现81个此前未知的漏洞。Mozilla将这些漏洞评为高危级别，目前已修复其中大部分漏洞。

本次发布的模型系统卡收录了AI安全实验室Irregular的测试结果：两款模型的实际性能差距更小，除长流程多步骤任务上GPT-6 Cyber表现更强外，两者能力大体相当。在OpenAI自有测试集中，两款模型都无法突破经过全面加固的目标。

Part03

实行严格申请准入机制

分阶段开放各类合规用户

GPT-6 Cyber是OpenAI今年发布的第四款网络安全专用模型。和首款同系列模型GPT-5.4-Cyber一样，这款模型采用申请制准入，初期访问权限仅面向Daybreak Red层级的获批客户开放。

Daybreak Red是OpenAI Daybreak项目中专门面向渗透测试、红队演练等攻击性安全工作的层级。获批客户可通过OpenAI的API和Codex访问模型，默认情况下API请求必须来自经过审核的授权网络。

谷歌今年9月发布Gemini 4 Argon时，也优先向经过资质审核的防御方开放。一周后，Anthropic对其网络安全验证计划（Cyber Verification Program）进行了调整，设置三个访问层级。

OpenAI表示，未来几周内GPT-6 Cyber将向所有Daybreak Red客户开放，GPT-5.6-Cyber目前已对该层级所有客户开放。关键基础设施防御方将拥有专属的Daybreak Red用户组。

在防御侧，OpenAI还将通过Daybreak Blue层级，把Astra的早期访问权限扩展给更多机构和独立安全研究员。

参考来源：

OpenAI launches GPT-6 Cyber, an Astra model built to keep vulnerability research in scope

https://siliconangle.com/2026/11/05/openai-launches-gpt-6-cyber-a-gpt-6-astra-model-built-to-keep-vulnerability-research-in-scope/
