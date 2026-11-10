---
title: 【微信】【安全圈】云商被黑连累FireworksAI！模型权重与密钥遭窃
source: https://mp.weixin.qq.com/s/OfJm4gpKdRiC0j4eOdBnNQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-10T21:52:34+08:00
trace_id: 6b804e86-bf89-4d7f-b6c2-02a994d23cb7
content_hash: fa53785c3b596d99912d3476d958f8be0ae2fa401c00df02a822906ec1b3cbe1
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 41475244-d011-81d1-b230-ce3385465818
ioc: null
---

**安全圈** *2026年11月10日 19:00*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/830fccecd7453c2c.webp)

**关键词**

密钥

**核心事实**：2026 年 11 月 10 日凌晨披露，AI 推理基础设施独角兽 Fireworks AI 证实遭遇连环安全入侵。继 10 月初环境变量中的 API 密钥遭窃后，攻击者又在 10 月 23 日攻陷托管 Fireworks 研发机器的第三方云服务商，并于次日横向穿透其开发环境运行恶意工作负载，导致部分客户资源元数据、账单信息、数据集及未完整模型权重外泄。公司已聘请 Palo Alto Networks Unit 42 介入取证，并将攻击源头指向专门盗卖大模型算力的“LLMJacking”黑产团伙。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6f5cb16b6bfa1ab6.jpg)

## 🔍 入侵复盘：第三方云供应链穿透开发网

Fireworks AI 主打高性能开源大模型（如 Llama、Mistral、Gemma）推理与微调托管，客户覆盖大批 AI 原生应用团队。这起新披露的次生入侵，暴露了从外部云供应商向核心研发环境渗透的完整攻击路径：

-   💥 **10 月 9 日首轮失守**：黑客入侵部分账户存储于环境变量中的评估任务 Secrets、API Key 与 Token。Fireworks 随即吊销了受损内部凭据及攻击者私建的密钥。
    
-   ⚡ **10 月 23 日–24 日云商跳板渗透**：托管 Fireworks 研发（R&D）主机的第三方云服务商发生安全事件；24 日，未授权第三方借此跳入 Fireworks 开发机并启动恶意工作负载（Unauthorized Workload），触及内部应用存储的数据层。
    
-   📦 **数据波及清单**：受影响内部应用可读取资源元数据（ID、名称、创建时间）、账单与付款历史（含账单与收货地址、余额及额度消耗，不含银行卡号，因平台不存储卡号），以及部分客户的 **未完整模型权重（Incomplete Model Weights）和微调数据集**。
    

Fireworks 强调在 24 日当天即发现异常并启动阻断，自 10 月 25 日起未再发现针对线上生产平台的未授权访问迹象；默认启用零数据留存（ZDR）的 Inference、Training SDK 及 Nexus 产品线未受波及。

## 🔑 黑色产业链：LLMJacking 如何将偷来的 Key 变现百万美元

Fireworks 明确指出，这批黑客具有典型的经济逐利特征——盗取大模型 Token 并转售给地下非法路由网关（Illicit Routing Gateways），即安全圈近期频频拉响警报的 **LLMJacking（大模型劫持）**。

就在一周前（11 月 2 日），Google 威胁情报团队（GTIG）与 Mandiant 联合发布报告指出，黑客团伙正批量扫描泄露的云凭证与推理平台 API Key，将其接入地下 API 聚合池按次售卖给灰产 AI 应用或恶意自动化脚本。单家受害企业因此背上的云端 AI 调用账单最高已突破 **100 万美元**。对黑客而言，偷算力 Token 比直接勒索或挖矿变现更快、隐蔽性更强。

## 🛡️ 应急停服与 AI 企业防劫持动作

-   ✅ **平台侧临时冻结功能**：Fireworks 目前已暂停用于 Batch Inference 和基于数据集训练的自助数据集上传与下载功能，并联合 Unit 42 完成服务账号全量轮换、研发网段隔离及存储权限收紧。
    
-   ✅ **API 消费侧立即轮换与设限**：所有使用 Fireworks AI 或类似云推理平台的团队，应立刻核查 10 月中下旬至今的异常 Token 消耗峰值与陌生 IP 调用记录，立即轮换写入环境变量与 CI/CD 的 API Key。
    
-   ✅ **严控模型微调数据留存与研发隔离**：敏感微调任务优先启用零数据留存（ZDR）通道；企业自建 AI 研发网段必须与第三方云商控制台及线上客户数据存储之间设置零信任鉴权，杜绝 R&D 机器直接拉取生产数据集。
    

***END***

阅读推荐

[【安全圈】篡改温控至50℃！黑客攻破工业冷链致血浆变质引火灾](https://mp.weixin.qq.com/s?__biz=MzIzMzE4NDU1OQ==&mid=2652079809&idx=1&sn=c1a8b7e5a159a8bd80d64aadad83d242&scene=21#wechat_redirect)
