---
title: Making HTTP header injection critical with one prompt
source: https://portswigger.net/research/making-http-header-injection-critical-with-one-prompt
source_host: portswigger.net
clip_date: 2026-11-05T02:28:23+08:00
trace_id: 3cea4b0c-08e6-4040-b787-5150d05c2234
content_hash: d0e0cbd9ae3da0a7f6ccbfc1782374301ef832c4ae01ca23f7ce4fe570c8cc07
status: synced
tags:
  - 漏洞分析
  - 安全工具
series: null
feed_source: PortSwigger Research
ai_summary: TL;DR：PortSwigger 为 Burp AT 新增 HTTP 请求头注入扫描检查与自动化技能，可一条提示将头注入升级为 CRLF 驱动 Desync，让真实用户被重定向到攻击者域名。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40e75244-d011-81ab-b379-d5da4dd6b003
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：PortSwigger 为 Burp AT 新增 HTTP 请求头注入扫描检查与自动化技能，可一条提示将头注入升级为 CRLF 驱动 Desync，让真实用户被重定向到攻击者域名。
> 
> - **四阶段自动化方法论：** 技能按研究级流程执行——定位上游注入点 → 请求拆分验证 desync → 搜寻利用 gadget → 构建并验证 exploit，全程后台自主运行。
> - **注入位置判定（Phase 1）：** 对比仅注入 `%0d%0a` 与追加 Host 头后的状态码差异（如正常响应 vs 400），可推断注入发生在上游 Host 头之后的自定义头（如 X-Original-Path）中；技能支持任意插入点而非仅路径。
> - **验证 desync（Phase 2）：** fuzz 多种前缀 payload（如伪造 `HTTP/13.37` 版本、TRACE 请求），收集到 2-3 个独特状态码即可证明前缀已影响上游请求，随后进入利用阶段。
> - **克制的利用路线（Phase 3/4）：** 迷你爬虫寻找可经 Host、X-Forwarded-Host 或绝对 URL 诱导的开放重定向，再拼合拆分结构让重定向指向 Collaborator；刻意放弃响应队列投毒（测试中过于危险），但该原语可链接缓存投毒实现全站接管。
> - **优雅降级设计：** gadget 阶段失败仍报告已验证的 desync；无法完整 desync 时自动回退到 CRLF-Powered Tunnelling 技能尝试访问控制绕过，并预填充 Intruder 会话供手工继续测试。技能已默认启用，Burp Scanner 报出头注入时即可调用。

You can now escalate HTTP header injection to a CRLF-Powered Desync and exploit it to serve random users a redirect to your collaborator, in a single prompt. We’ve just introduced a new scan check for HTTP Request Header Injection and distilled [CRLF-Powered Desync Attacks: Beheading HTTP Stream’s](https://portswigger.net/research/crlf-powered-desync-attacks) exploitation methodology into Burp AT. Watch it in action below:

Video tags are not supported by your browser.  

[HTTP request smuggling](https://portswigger.net/web-security/request-smuggling) attacks are devastating. To make matters worse, they’re so widespread and so complex that we’ve released [six](https://portswigger.net/research/request-smuggling) BlackHat USA research presentations about them. That’s a lot of new hacking techniques to consume if you don’t want to miss critical vulnerabilities in your engagements.

To help testers discover more cutting-edge critical vulnerabilities, we’re distilling the PortSwigger Research team’s knowledge into Burp AT skills. This allows it to autonomously perform our research grade methodology in the background, all while you continue your own manual testing.

## Our CRLF-Powered Desync methodology

To illustrate what we mean, here are the steps Burp AT is taking for you in the background. The skill expects a HTTP request header injection issue from burp, and uses it to run several phases, each of which is a step in the methodology we used during our research:

#### Phase 1 - Identify the upstream injection location

Just because your insertion point is the path, doesn’t mean that your injected header ends up in the path upstream. We encountered several cases where the path was re-written to a custom header upstream, meaning that to achieve request splitting, we needed to identify if the custom header occurred before or after the existing host header.

For example, if the following produces normal looking status code:

`GET /%0d%0a%0d%0a HTTP/1.1`

But the adding a host header like so triggers a 400:

`GET /%0d%0aHost:%20x%0d%0a%0d%0a HTTP/1.1`

Upstream request:

`GET / HTTP/1.1 Host: example.com X-Original-path: / Host: x`

Then we can be fairly certain that our injection is occurring inside of a custom header that appears after the upstream request’s host header.

Note: the skill and scan check both support any insertion point, not just the path

#### Phase 2 - Validate the desync via request splitting

Next, we need to build our request splitting payload and prove that we can achieve a desync. To do this, we use the structure provided by phase 1 to build a request splitting payload with prefixes like so:

`GET /%0d%0a%0d%0aGET%20/%20HTTP/13.37%0d%0aHost:%20example.com %0d%0aContent-Length:%20150%0d%0a%0d%0a HTTP/1.1` `GET /%0d%0a%0d%0aTRACE%20/%20HTTP/1.1%0d%0aHost:%20example.com %0d%0aContent-Length:%20150%0d%0a%0d%0a HTTP/1.1`

The skill will fuzz several different prefix payloads in order to try and produce unique status codes. Once it has collected 2 or 3 we know our prefixes are modifying our requests upstream and it’ll move into exploitation.

#### Phase 3 - Find an exploit gadget

This phase will launch a mini-crawl against the domain you are targeting, in an attempt to find open redirects that can be induced via the Host header, the X-Forwarded-Host header or an absolute URL.

#### Phase 4 - Exploit the target

Assuming we found a gadget in phase 3, we can now build our exploit by combining our phase 2 request structure with our phase 3 gadget. For example, if phase 3 identified that a request towards `/assets` redirected to `/assets/` and used the host header to determine the location of said redirect, phase 4 attempts the following exploit:

`GET /%0d%0a%0d%0aGET%20/assets%20HTTP/1.1%0d%0aHost:%20collaborator.net%0d%0a Content-Length:%20150%0d%0a%0d%0a HTTP/1.1`

If repeatedly sending this request over different connections produces the expected redirect response to the attacker’s domain, the skill reports an issue with all of the evidence.

If you’re anything like me, you may be wondering why we chose such a safe exploitation route compared to the attacks we published in our research paper. We did consider other exploitation routes, namely Response Queue Poisoning, but this turned out to be so dangerous in our testing that we chose err on the side of caution and opted for an exploit that would be less catastrophic if it happened to impact real users. That said, if you do want even more impact, the reported exploit is the primitive for a [full-site takeover](https://portswigger.net/web-security/request-smuggling/exploiting#using-http-request-smuggling-to-perform-web-cache-poisoning) if you chain it with cache poisoning.

## PortSwigger Research Skills

The skills being developed by PortSwigger Research are built to make the techniques we discover and use as practical as possible, as quickly as possible. By pouring our methodology into Burp AT, testers can identify critical vulnerabilities from novel attack vectors the second the techniques are published.

Our skills fail gracefully and feature several bail points that loop the tester back into the process to follow up. For example, if the gadget phase fails, you’ll still get a validated desync finding without evidence of an exploit. If phase 2 fails to get enough distinct status codes, it’ll report a tentative issue instead.

Our skills are also built to cover every edge case we encountered during our research. Once Burp AT has finished, you’ll either have an end-to-end exploit to report, or a validated finding that you can easily take further with your own knowledge.

For example, a particularly tricky edge case that is often missed when a desync attack fails is blind request tunnelling. To combat this, we’re releasing an additional skill which the CRLF-Powered Desync skill will fall back to if it proves that a full desync isn’t possible in phase 2. With some luck, the CRLF-Powered Tunnelling skill will find an [access control](https://portswigger.net/web-security/access-control) bypass exploit, but if it fails to do so, you’ll find a handy pre-populated intruder session ready for you to pair with your own wordlists.

The skills are enabled by default, so next time [Burp Scanner](https://portswigger.net/burp/vulnerability-scanner) reports header injection try asking Burp AT to exploit it. You might just end up with a critical vulnerability from a single prompt.

[Back to all articles](https://portswigger.net/research/articles)
