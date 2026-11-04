---
title: 议题分享： ZeroMDASH：领域自适应的Agent-Native 通用漏洞挖掘工程
source: https://bestwing.me/zeromdash-agent-native-vulnerability-mining.html
source_host: bestwing.me
clip_date: 2026-11-04T10:43:06+08:00
trace_id: c81d2d8b-475a-4dcc-b8e8-f20bc353fa5e
content_hash: 24efa1230dda135ba4c795c9947e2f029b5878175ff5c8cd7f1856f5d858d8bf
status: synced
tags: []
series: null
feed_source: Swings·漏洞/二进制
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40e75244-d011-8102-8f8c-ce98d2d26b60
ioc: null
---

BEGIN_PAYLOAD20261101

…

## 前言

这个议题于2026年10月23日在看雪 SDC 2026 上分享。

## 议题介绍

AI Agent已经能够阅读代码、调用工具并自主执行安全分析，但当目标从单一函数扩展到 Linux 内核、虚拟化系统、网络协议栈等复杂软件时，为什么它仍会遗漏真正重要的漏洞？问题往往不只是上下文长度不足，而是模型缺少对目标软件特有安全机制的理解：它不知道哪些对象属于核心资产，哪些权限关系和状态转换必须满足特定的安全约束，也难以判断散落在不同模块中的局部缺陷能否组合成一条真实可利用的攻击链。

本议题将介绍 ZeroMDASH，一套面向源码漏洞挖掘的领域自适应 Agent-Native 分析框架。它不依赖预设的漏洞类型清单，而是从目标代码出发，自主识别其中的关键对象、权限关系、信任边界、状态转换及其安全约束，并将潜在攻击面转化为可追踪的分析范围和漏洞假设。随后，由调查 Agent 与审查 Agent 围绕源码证据、反例和未解决条件展开多轮对抗式验证。系统还会关联分析分散在不同模块中的风险线索，识别单点分析难以发现的复杂漏洞与攻击路径。

当每一个局部行为看起来都“不是漏洞”时，它们组合起来是否可能导致权限提升、信息泄露？当 Agent 声称“没有发现问题”时，我们又如何判断它确实完成了必要的安全分析，而不是因为分析范围不足而提前停止？本议题将围绕这些问题，分享 ZeroMDASH 在目标领域安全建模、假设集推理、对抗式证据复核以及跨原语攻击链验证方面的设计与实践，并讨论 AI 漏洞挖掘如何从生成潜在issue，进一步发展为构建可追踪和复核的安全证据。

## 议题亮点

**Agent时代的漏洞挖掘，怎么才能挖得又全又准。**

## 公开 slide

这里公开 slide，感兴趣的同学可以自行阅读。

[在线阅读 slide](https://cossack9989.github.io/slides/2026/10/23/zeromdash-agent-native-vulnerability-mining.html)

## 开源代码

ZeroMDASH 已开源，代码仓库：

[https://github.com/JANUS-SEC/ZeroMDASH](https://github.com/JANUS-SEC/ZeroMDASH)

EOFCHECKSUM_OK
