---
title: 【微信】漏洞挖掘方法论：逻辑漏洞的五种常见模式
source: https://mp.weixin.qq.com/s/4UGADnxv55T-iDocKN7-dg
source_host: mp.weixin.qq.com
clip_date: 2026-11-05T11:18:46+08:00
trace_id: b03427e2-c3d6-4a54-9b85-b1e0bc07e553
content_hash: ceba78e346a2889069e8ab619d57fb8ee1e67ae95e2adc0d21fcf14811f7ab67
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
notion_page_id: 40f75244-d011-817a-8ed9-fb9863481d66
ioc:
  cves: []
  cwes:
    - CWE-840
  hashes: []
  domains: []
  tools: []
  techniques: []
---

**船山信安** *2026年11月5日 00:00*

漏洞挖掘 · VULNHUNT

漏洞挖掘方法论：逻辑漏洞的五种常见模式

扫描器永远扫不出的一类洞，叫逻辑漏洞——代码忠实地实现了错误的需求。这篇讲五种最常见的模式，以及怎么挖。

案例为通用示意，不涉及未修复系统的可利用细节。

本文为漏洞挖掘的方法论分享，案例均为通用示意，不涉及未修复系统的可利用细节或完整利用链。

0101 越权：改一个 ID 就进别人房间

IDOR 是最典型的逻辑漏洞。服务端从前端取 user_id 又不校验「这人能不能看这条数据」，于是改个 ID 就读到别人的。

\# 把响应里的 own id 改成别人的（授权测试）

GET /api/order?user_id=10086

\# 若返回他人订单 -> IDOR 确认

它隐蔽在「每个请求都合法，只是身份对了、对象错了」。靠的是服务端按会话身份取资源，不信任前端 ID。

0202 改密流程缺陷

很多系统改密只验短信码、不验旧密码，等于把「身份确认」这一步省了。攻击者拿到会话就能改掉主人的密码。

1只验短信码不验旧密码 → 会话内可直接改密。

2短信码可预测 / 可重放 → 等同于没有。

3防护：改密必须重新校验身份（旧密码 + 二次因子）。

0303 额度与价格服务端未校验

前端显示「限购 1 件」「单价 100」，但服务端没二次校验。改个请求里的数量或价格，就能绕过。这是电商与金融系统的高频雷区。

防护：一切与钱、与权限相关的判断，服务端必须独立计算，不信任前端传来的任何值。

0404 验证码与重试缺陷

验证码前端校验、刷新不变、无失败锁定——等于没有。这给了爆破与绕过空间。

|     |     |
| --- | --- |
| 问题  | 加固  |
| 验证码缺陷 | 服务端校验 + 失败即失效 |
| 无锁定 | 限频 + 渐进延迟 + 告警 |
| 信息区分 | 统一「账号或密码错误」 |

0505 业务状态机绕过

正常流程是 A→B→C，但系统没校验「能不能从 A 直接跳 C」。比如支付未完成就跳到「已发货」，或审批被并发绕过。

逻辑漏洞的本质是「代码忠实地实现了错误的需求」。挖它靠的是先想清「业务规则是什么」，再问「有没有办法绕过这条规则」。

参考来源

OWASP — Business Logic Vulnerabilities

PortSwigger Web Security Academy — Access Control / Logic

MITRE CWE-840 — Business Logic Errors

本文为漏洞挖掘的方法论分享。案例为通用示意，不涉及未修复系统的可利用细节或完整利用链。

漏洞挖掘 · 目录
