---
title: 【微信】【安全圈】Chainalysis 被打穿：全体用户凭据泄露
source: https://mp.weixin.qq.com/s/EuSI8dWx3G6AZhlC86DYow
source_host: mp.weixin.qq.com
clip_date: 2026-11-07T12:49:21+08:00
trace_id: 2721a2dc-aa10-47c5-8839-82f3ee3d0117
content_hash: 1e16895ae44103b86e34a66c23713824bfbf39540927e89b6d416423fc3d4837
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
notion_page_id: 41175244-d011-81e9-97ff-c8f2b6dd07d3
ioc: null
---

**安全圈** *2026年11月6日 19:00*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/830fccecd7453c2c.webp)

**关键词**

凭据泄露

11 月 6 日，区块链分析公司 Chainalysis 更新安全事件通报，影响面比一周前的"部分客户密码泄露"大得多： **全部用户的姓名、用户名、密码哈希与仍在生效的访问令牌均已外泄**。此前公司已把 Reactor、KYT 等核心产品全线停摆。泄露范围升级到全体账户，攻击向量虽已修复，凭据外泄的既成事实收不回来

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c7d3b4430f073e2a.jpg)

## 🚨 一周之内，定性两次升级

事件起点是 10 月 30 日。Chainalysis 披露遭外部行为者入侵，对方动用进攻性智能体技术（offensive agentic techniques）拿到系统与内部工具的未授权访问。调查过程中又挖出一起路径上攻击（on-path attack），暴露了部分客户的密码

11 月 6 日的通报把范围改写为全体用户：姓名、用户名、密码哈希、活跃令牌均告泄露。公司称攻击向量已修复，但没有说明攻击持续了多久

## ⚡ 核心产品集体下线

处置动作密集而彻底：

-   Reactor 与 Data Solutions 的访问权限已移除
    
-   KYT（Know Your Transaction）用户界面与 API 下线，地址筛查产品、登录页一并关闭
    
-   受影响账户全部锁定，收到改密邮件的用户暂时无法完成重置
    
-   公司新增主动监控系统，盯防异常活动
    

Chainalysis 强调，目前没有证据表明调查数据被访问，归因数据也未被篡改

## 🔍 同期遭袭的技术平台不止一家

攻击者身份没有下文。Chainalysis 只有一句定性：与近几周其他技术平台的遭遇相似

背景是实的。Chainstack、OpenCode、Warp、WorkOS 近期先后披露遭 AI 驱动攻击，部分事件涉及名为 ARTEX 的自主渗透测试工具。微软追踪到攻击者用智能体框架扫荡公开 GitHub 仓库里的凭据、应用凭据与 AI 推理 API 密钥，再拿这些密钥展开后续入侵。一个案例里， **智能体从扫描 GitHub 到外泄 Azure Key Vault 密钥只花了 5 分钟**，这类活动从 2026 年 8 月持续至今

微软还观察到智能体先取得目标组织内单租户 OAuth 应用的令牌，再借它枚举组织的其他云资源，专挑 AI 服务 API 密钥与 Foundry Tools（原 Azure Cognitive Services）权限下手。Google 本周的报告证实，盗取商用大模型云访问权限再转卖已经做成生意（LLMjacking）

## 🛡️ 恢复走白名单，眼下该做的事

-   KYT 与地址筛查恢复采用白名单制：把可信 IP 提交给 support@chainalysis.com 或客户经理，加白后重置密码、轮换 API 密钥
    
-   公司要求所有用户重置密码并按需轮换 API 密钥；Reactor 与 Data Solutions 的恢复时间未定
    
-   在其他系统复用过同一密码的账户立即改密——密码哈希已随本次事件外泄
    

目前处置停留在加固与恢复阶段：系统加固、产品逐步重新上线、账户访问将增加额外保护。公司称恢复完成后会另行通知访问策略变更

***END***

阅读推荐

[【安全圈】白宫专网被卖做代理？总统办公室设备疑遭植入后门](https://mp.weixin.qq.com/s?__biz=MzIzMzE4NDU1OQ==&mid=2652079711&idx=1&sn=05bdbc8ba75d9805145596493772fbf6&scene=21#wechat_redirect)
