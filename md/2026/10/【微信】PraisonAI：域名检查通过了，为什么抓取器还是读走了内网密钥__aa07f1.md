---
title: 【微信】PraisonAI：域名检查通过了，为什么抓取器还是读走了内网密钥
source: https://mp.weixin.qq.com/s/VCJd22NnAiFwhzqxKAPYGA
source_host: mp.weixin.qq.com
clip_date: 2026-10-31T14:27:12+08:00
trace_id: 754cb433-da20-4357-bc09-3a62b6c0d1fa
content_hash: b3e0a6eb61a31fdbc8d2df3389950e419604befac3fa98c98216114e5319d651
status: synced
tags:
  - 微信
  - 漏洞分析
  - AI应用
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: PraisonAI 的 `web_crawl` 存在 DNS 重绑定 SSRF（CVE-2026-61430，CVSS 8.5）：域名检查与实际连接之间隔了一次 DNS 解析，攻击者可借此读回内网密钥，公告修复版 1.6.78 仍可绕过。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 40a75244-d011-81fc-83cf-ea9c9a35ad6d
ioc:
  cves:
    - CVE-2026-61430
  cwes:
    - CWE-918
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> PraisonAI 的 `web_crawl` 存在 DNS 重绑定 SSRF（CVE-2026-61430，CVSS 8.5）：域名检查与实际连接之间隔了一次 DNS 解析，攻击者可借此读回内网密钥，公告修复版 1.6.78 仍可绕过。
> 
> - **漏洞与版本：** CVE-2026-61430 / GHSA-qg25-6gc4-48mg，CWE-918 服务端请求伪造，影响 `praisonaiagents <= 1.6.77`，公告修复版本为 1.6.78；触发条件是应用允许用户或模型控制抓取 URL，且目标域名解析可被攻击者控制。
> - **根因是 TOCTOU 时序差：** 校验阶段用 `getaddrinfo()` 解析一次域名，`client.get(url)` 连接时又重新解析，前次结果未传给后次；攻击者的权威 DNS 可先返回公网地址通过检查，连接前再换成 127.0.0.1、RFC1918 或云元数据地址。检查函数本身识别回环/私网的逻辑没写错，错在校验对象与连接对象脱节。
> - **本地固定时序验证：** 实验不连公网，直接在进程内替换 `socket.getaddrinfo`，让 `rebind.lab` 第一次返回 93.184.216.34、第二次返回 127.0.0.1，1.6.77 成功把 18099 端口合成服务响应中的密钥标记读回。
> - **1.6.78 的修复不构成安全边界：** 它改为共享 `is_safe_http_url()` 并在连接前多校验一次，但仍只返回布尔值，HTTP 客户端依旧拿原始 URL 重新解析，攻击者多给一次公网答案即可；真正的修复需把已校验 IP 绑定到连接并保留 Host 头/TLS SNI，或在自定义 transport 中锁定解析结果。
> - **回环地址被默认放行：** 1.6.78 的 `_allowlist_hosts()` 无条件把 `localhost`、`127.0.0.1`、`::1` 加入允许集合，未设 `ALLOW_LOCAL_CRAWL` 时直接抓 `http://127.0.0.1:18099/secret` 也能读回密钥；排查时应把 DNS 查询与出站连接日志关联，留意公网 A 记录后紧跟私网连接、抓取结果含云元数据字段等迹象。

**云梦安全** *2026年10月31日 09:00*

AI Agent 抓网页前做一次 URL 安全检查，看起来已经够谨慎：解析域名，判断回环、私网和链路本地地址，命中就拒绝。但如果真正发请求时，HTTP 客户端又按域名解析了一遍，检查结果就只是“当时那个 IP 没问题”，并不能约束接下来连到哪。

PraisonAI 的 `web_crawl` 就踩在这个时间差上。2026 年 10 月披露的 CVE-2026-61430（GHSA-qg25-6gc4-48mg，CVSS 8.5）影响 `praisonaiagents <= 1.6.77` ，公告修复版本是 1.6.78。本地隔离环境里，1.6.77 可以被 DNS 重绑定绕过；继续测 1.6.78，发现它增加了校验次数，但仍未把已校验的 IP 绑定到实际连接，重绑定路径依旧能读回合成密钥。

另有一条更容易复现的现象：1.6.78 未设置 `ALLOW_LOCAL_CRAWL` 时，直接调用 `web_crawl("http://127.0.0.1:18099/secret")` 也能成功。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4f9c7db9f17f8876.png)

## 漏洞速览

| 项目  | 内容  |
| --- | --- |
| 漏洞编号 | CVE-2026-61430 / GHSA-qg25-6gc4-48mg |
| 影响组件 | `praisonaiagents <= 1.6.77` |
| 公告修复版 | 1.6.78 |
| 漏洞类型 | 服务端请求伪造（CWE-918），DNS 重绑定绕过 |
| 危害等级 | CVSS 8.5 High |
| 触发条件 | 应用允许用户或模型控制抓取 URL；目标域名可被攻击者控制解析 |
| 本地结果 | 1.6.77 重绑定成功；1.6.78 重绑定仍成功，且未设 `ALLOW_LOCAL_CRAWL` 时可直接访问回环 |

这里的“读走”不是页面上出现了一个内网链接，而是抓取器把内网响应当成正常网页内容收下，密钥字段跟着进入返回值。Agent 如果再把这段内容送进模型上下文，数据就继续往下游走。

## 检查和使用隔了一次 DNS 查询

漏洞版的逻辑可以简化成两部分：

```python
# 校验阶段
for info in socket.getaddrinfo(hostname, None):
    ip = ipaddress.ip_address(info[4][0])
    if ip.is_loopback or ip.is_private or ip.is_link_local:
        return False
​
# 请求阶段
response = client.get(url)
```

`getaddrinfo()` 拿到的是当时那一刻的 A/AAAA 记录。 `client.get(url)` 内部还会再解析一次域名，前一次的结果没有传给后一次。攻击者控制的权威 DNS 可以先返回公网地址，让检查通过，再在连接前把答案换成 127.0.0.1、RFC1918 地址或云元数据地址。

检查函数本身没有写错。它确实识别了回环和私网，也没有被 URL 里的 `@` 或十进制 IP 骗过去。问题在于校验对象是域名字符串，最终连接对象是重新解析后的套接字地址。

## 本地怎么固定这个时序

实验没有连接公网域名。脚本在进程内替换 `socket.getaddrinfo` ，第一次查询 `rebind.lab` 返回文档示例地址 `93.184.216.34` ，第二次返回 `127.0.0.1` 。本机 `18099` 端口起了一个合成 HTTP 服务，响应里放两个虚构标记：

```
PRAISONAI_INTERNAL_SECRET_CANARY_7f3a91
FAKE_INTERNAL_TOKEN_DO_NOT_USE_7f3a91
```

然后调用：

```
web_crawl("http://rebind.lab:18099/secret", provider="httpx")
```

1.6.77 的输出分成三段：

```
[1] CHECK rebind.lab -> 93.184.216.34
[2] CONNECT rebind.lab -> 127.0.0.1
VERDICT: INTERNAL RESPONSE READ BACK (SSRF)
```

第一行是安全检查看到的地址，第二行是 HTTP 客户端连接时解析到的地址，最后一行说明响应体里出现了合成密钥。

这组结果能证明漏洞成立，但不代表公网环境每次都能这么稳定。真实 DNS 有缓存、TTL、多个 A 记录，客户端还可能做 Happy Eyeballs 并发尝试。实验把解析结果固定成两次，是为了把“检查”和“连接”之间的窗口单独拿出来看。

## 1.6.78 多了一次检查，为什么还能过

切到 1.6.78 后，原先内联的检查换成了共享的 `url_safety.is_safe_http_url()` ，连接前又加了一次校验。代码看起来更整齐，但仍然只返回布尔值，HTTP 客户端依旧拿原始 URL 去连接。

实验把解析器改成前两次返回公网地址，第三次返回回环。输出如下：

```
[1] CHECK rebind.lab -> 93.184.216.34  public / allowed
[2] CHECK rebind.lab -> 93.184.216.34  public / allowed
[3] CONNECT rebind.lab -> 127.0.0.1    loopback / internal
VERDICT: INTERNAL RESPONSE READ BACK (SSRF)
```

多一次检查，只是让攻击者需要多给一次公网答案。连接阶段仍然重新解析，次数就不构成安全边界。要让检查真正约束连接，需要把解析得到的 IP 固定下来，连接时直接连这个 IP，同时保留原域名的 `Host` 头和 TLS SNI；或者在自定义 transport 里锁定解析结果，发现二次解析换了地址就拒绝。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/11065c5bc2ccf3e6.png)

## 回环地址被默认放行

1.6.78 新增的 `url_safety.py` 还有一段逻辑值得单独看。 `_allowlist_hosts()` 除了读取 `SEARXNG_URL_ALLOWLIST` ，还会无条件把 `localhost` 、 `127.0.0.1` 、`::1` 加入允许集合。 `is_safe_http_url()` 检查私网之前，会先对这三个主机名返回 `True` 。

本地未设置 `ALLOW_LOCAL_CRAWL` ，直接调用：

```
web_crawl("http://127.0.0.1:18099/secret")
```

请求通过了检查，响应里的合成密钥也被读回。截图里同时出现 `guard verdict : True` 和 `VERDICT: LOOPBACK RESPONSE READ BACK` ，说明安全检查通过和实际访问本机服务可以同时发生。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/e139b85eb9b8218d.png)

这条路径比 DNS 重绑定更容易用。任何能控制抓取地址的入口，都可以直接填 http://127.0.0.1:端口/路径，探测本机管理接口、调试端口或本地模型服务。云主机上还会有人尝试 `169.254.169.254` ，能不能读到内容取决于该地址是否被同一套逻辑放行，以及网络策略有没有阻断。

## 影响和排查

PraisonAI 常被用来把搜索、抓网页和工具调用串成自动化流程。URL 可能来自用户输入、检索结果、模型生成的工具参数，也可能是网页里的跳转链接。只要业务侧没有域名白名单，抓取器就可能被当成内网探测器。

排查时，单看 `web_crawl` 的入参日志不够，最好把 DNS 查询和出站连接放在一起：

-   同一域名短时间内出现“公网 A 记录后紧跟回环/私网连接”；
    
-   应用进程向 `127.0.0.1` 、RFC1918、 `169.254.0.0/16` 发起不该有的 HTTP 请求；
    
-   抓取结果里出现云元数据字段、管理后台 HTML 或内部 API 的 JSON；
    
-   Agent 上下文里突然出现内网主机名、端口、令牌或云账号信息；
    
-   出口代理、WAF 或 eBPF 日志中，域名与实际连接 IP 不一致。
    

如果抓取内容会直接拼进模型提示词，还要看模型输出有没有带出内网路径、服务名或凭据片段。SSRF 在这里可能只是一次读取，后面还会接着发生数据外带。
