---
title: 【微信】Super-agent（DeepSeek Harness）
source: https://mp.weixin.qq.com/s/IVg6eb2v8WG2xgPIZxd1CA
source_host: mp.weixin.qq.com
clip_date: 2026-11-09T13:15:23+08:00
trace_id: 9e700fb8-bf8a-4943-ab3d-9d8c30be7839
content_hash: 2b1a4618a96dbf210e6a4195e6e1e55489df66b234ce73c2b4c21f94ab94535b
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 41375244-d011-81f7-ae6b-c5110dedac23
ioc: null
---

**威胁情报Z分析** *2026年11月9日 12:32*

它不是新大模型，是一套面向长期、多任务、主动协作的智能体调度架构，基于 DeepSeek Harness 研发，2026-10-31 正式公开，附带开源原型 dsh-superagent-prototype。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/908bbf737ebaf9ba.jpg)

解决传统Agent痛点：传统Agent大多是单次会话、被动等待指令，一次只能处理一件事，跨渠道（IM/GitHub）上下文割裂，多任务并发很难管理。  
  
✅ 核心架构：Router + Worker 双层  
  
• Router（调度层）：常驻全局协调节点，统一接收多渠道事件（飞书群、GitHub PR、issue），负责路由、任务分发、会话管理；不做具体执行  
  
• Worker（执行层）：每个任务独立一个Worker，自带隔离上下文，并行跑任务；任务启动后Worker会订阅该任务后续事件，后续消息可以直连Worker，不用全部经过Router，减少瓶颈；Worker还可以拉起子Agent（Subagent）  
  
• 配套机制：事件驱动、异步通信、存算分离、Watchdog看门狗，卡死/异常自动恢复，支持持久化长期运行  
  
✅ 四大核心特性  
  
1\. 连续（上下文贯通）：同一个任务，在飞书群聊、GitHub PR来回讨论，上下文自动对齐，不用反复复述需求  
  
2\. 并行高效：多Worker同时跑多个独立任务，耗时任务不会阻塞新请求  
  
3\. 主动感知：事件驱动+两级过滤，不需要@它，监控群聊/工单，后台识别潜在bug、自动复现、尝试修复，有结果再通知人，没结果不打扰  
  
4\. 持久自愈：7×24在线，异常自动恢复，任务不会因为会话关闭直接丢失  
  
✅ 典型场景（内部落地在研发流程）  
  
• 群聊里用户提bug、需求，自动识别、复现、写代码、提交PR  
  
• 代码评审、issue跟进、版本缺陷持续跟踪，打通IM和GitHub研发链路  
  
• 适合研发团队的自动化编码、缺陷闭环，也是DeepSeek Harness自身迭代在用的系统  
  
✅ 和普通Agent的区别  
  
普通Agent：触发式、单次会话、一问一答、人要手动新建会话、手动管理上下文；  
Super-agent：持续在线的Agent集群调度系统，人只负责高层验收和决策，会话、任务、多渠道同步交给架构自己管。

它是研究原型架构，不是开箱即用成品；强绑定 DeepSeek Harness 工具执行底座，侧重研发/软件工程场景，不是通用Agent框架。
