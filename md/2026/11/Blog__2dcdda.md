---
title: Blog
source: https://www.thezdi.com/blog/2026/10/20/cve-2026-35273-ssrf-to-rce-in-oracle-peoplesoft
source_host: www.thezdi.com
clip_date: 2026-11-03T05:42:13+08:00
trace_id: 5c3b8d1b-2d46-45cf-9cdc-219f8a185586
content_hash: 43d4a236a3810c82a7d587b30925c8fd7bee743e6b62a834052b2d7296635ad6
status: synced
tags:
  - 漏洞分析
  - SSRF
series: null
feed_source: ZDI Blog
ai_summary: Oracle PeopleSoft 的 SSRF 漏洞可绕过 validateClient 校验，已被 ShinyHunters 用于大规模攻击并链式达成 RCE；Oracle 一个 CVE 实际覆盖三个漏洞。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 40c75244-d011-816c-baa5-d8bd2c37b968
ioc:
  cves:
    - CVE-2026-35273
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Oracle PeopleSoft 的 SSRF 漏洞可绕过 validateClient 校验，已被 ShinyHunters 用于大规模攻击并链式达成 RCE；Oracle 一个 CVE 实际覆盖三个漏洞。
> 
> - **披露时间线：** TrendAI 零日计划（ZDI）于 2026 年 6 月 10 日向 Oracle 报告漏洞，Mandiant 于 2026 年 9 月 25 日披露 ShinyHunters 对 CVE-2026-35273 的持续大规模利用。
> - **三个漏洞一个 CVE：** 研究者实际报告了分布在多个 PeopleSoft 组件中的三个独立漏洞，Oracle 仅以单个 CVE 发布补丁，目前正协调为每个问题分配独立 CVE 编号。
> - **两个目标组件：** PSEMHUB 是环境管理框架的内部管理接口，通过 `validateClient` 方法限制仅可信客户端访问其 Web 端点；PSIGW（集成网关）通过 Listening/Target Connector 与远程系统交换消息。
> - **SSRF 威力：** PSIGW 的 `HttpListeningConnector` 会将入站 HTTP 请求转换为 `HttpTargetConnector` 格式并路由到指定 URL，攻击者既能控制目标 URL，也能完全控制发送的载荷。
> - **绕过逻辑：** 攻击者无法直接访问 PSEMHUB，但 SSRF 发出的请求可满足 `validateClient` 校验，从而从低权限立足点间接触达存在远程代码执行风险的端点。

On September 25, 2026, Mandiant released a [report](https://cloud.google.com/blog/topics/threat-intelligence/shinyhunters-renewed-mass-exploitation-campaign-targeting-oracle-peoplesoft) regarding continued mass exploitation of CVE-2026-35273 by the ShinyHunters group. TrendAI’s Zero Day Initiative first reported this CVE to Oracle on June 10, 2026, following an investigation I conducted with Minh Giang and Lucas Miller of TrendAI Research. Although Oracle issued a patch under a single CVE, we reported three distinct vulnerabilities across multiple PeopleSoft components. We are coordinating with Oracle to assign separate CVEs for each issue.

## 漏洞导读

In this blog post, we will walk through each of these vulnerabilities, starting with a Server-Side Request Forgery (SSRF) vulnerability. We will also review the `validateClient` method that Oracle introduced to allow PeopleSoft system administrators to restrict access to certain functionality. Spoiler alert: the SSRF allows attackers to make requests that satisfy this validation and access endpoints vulnerable to remote code execution (RCE).

**Overview**

There are two main components involved here, both served as individual Oracle WebLogic applications.

## PSEMHUB 组件

The first, the PeopleSoft Environment Management Hub (PSEMHUB), is part of Oracle’s Environment Management Framework. This component implements the `validateClient` method, ensuring only trusted clients can reach PSEMHUB functionality. Because this is an internal management interface, it makes sense that Oracle would restrict access to its web endpoints. However, this also means it’s a prime target for attackers looking to pivot from their existing, low-privileged access.

## PSIGW 组件

The second, the PeopleSoft Integration Gateway (PSIGW), contains functionality for exchanging messages between the PeopleSoft server and remote systems. This is accomplished using a set of Listening and Target Connectors.

One such connector is the `HttpListeningConnector`, which translates data from inbound HTTP requests into the format supported by the specified Target Connector before routing the request to the desired URL. In this chain, attackers specify the `HttpTargetConnector`.

The diagram below shows how an attacker like ShinyHunters can combine these vulnerabilities to compromise PeopleSoft systems. Notice that the attacker cannot simply hit the PSEMHUB functionality directly:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5f4de3db631fb6fd.webp)

## SSRF 漏洞细节

**Bug 1: PSIGW Server-Side Request Forgery (ZDI-CAN-31816)**

Now let’s take a look at how the PSIGW SSRF provides attackers with a foothold in the PeopleSoft application. An example malicious request to PSIGW shows just how powerful this is for an attacker. We control the URL to hit AND the full payload to send!
