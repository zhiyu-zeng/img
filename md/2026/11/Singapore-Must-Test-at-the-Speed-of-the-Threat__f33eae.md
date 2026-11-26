---
title: Singapore Must Test at the Speed of the Threat
source: https://xbow.com/blog/singapore-must-test-at-the-speed-of-the-threat
source_host: xbow.com
clip_date: 2026-11-26T16:07:33+08:00
trace_id: 2ea1eea8-a29d-4fb5-8fb6-59e0207403e8
content_hash: 193d064f6c1a5eddca1b2c9fb8599e390c9c83ecba00d4a8c20d9fabf5a8de4e
status: synced
tags: []
series: null
feed_source: XBOW·漏洞利用研究
ai_summary: null
ai_summary_style: null
images_status:
  total: 5
  succeeded: 5
  failed_urls: []
notion_page_id: 42475244-d011-8108-99ea-d331e6825741
ioc: null
---

Reported cyber incidents in Singapore have tripled since September, and AI is helping attackers find and exploit weaknesses faster. Here’s how organisations can test at the same speed and scale, in waves.

* * *

Since late October, Singapore has seen what The Straits Times calls an unprecedented spate of data breaches in sectors including healthcare, telecoms, media and aviation. Its analysis names AI as a primary contributor, because AI has sped up the discovery of vulnerabilities. ([The Straits Times](#))

The Cyber Security Agency of Singapore (CSA) says reported cyber incidents since September have averaged three times the monthly level of January to August, driven by opportunistic attacks on exposed systems rather than coordinated campaigns. ([CSA](#))

## Faster discovery, faster exploitation

Exploitation is speeding up too. Mandiant’s M-Trends 2026 report, cited in the same analysis, puts the estimated mean time to exploit a vulnerability at negative seven days: attackers routinely exploit flaws a week before they are publicly disclosed or fixes are released. AI-enabled reconnaissance lets attackers probe multiple misconfigurations at high speed and, when one approach fails, refine it and try another. When the critical PHP2Shell flaws in PHP were patched on 21 October, attack traffic targeting them had already been seen for days. (AWS Security Blog via [SecurityWeek](#))

Singapore’s government sees the same shift. Launching the Cybersecurity Strategy 2026 in October, Senior Minister and Coordinating Minister for National Security K Shanmugam said AI allows actors to “operate with greater speed, greater scale, and greater sophistication”. ([CSA](#)) Its neighbours agree. Korea’s financial regulator has [told](#) the sector to defend against AI attacks with AI, and Japan’s emergency cybersecurity package of 6 November warns that advances in AI now let gaps such as unpatched known vulnerabilities and website misconfigurations be exploited in a short time and at scale.([Cabinet Secretariat](#))

Each shift compounds the others. Attackers find weaknesses faster, exploit them sooner and probe at a scale that annual testing was not built for. Businesses can no longer count on time between disclosure and exploitation.

## A regional trend

In Korea, financial regulators logged breach reports from 37 financial firms between late September and early November. ([MBC](#)) In Japan, a run of unauthorised access has led to data leaks at companies across industries since September. ARTEX, an open-source AI penetration testing tool turned to attack use, was linked to breaches at major Korean banks and to attacks targeting at least 80 companies in finance and other sectors. ([Nikkei](#))

## What is at stake

When time is cut, customers bear the cost. A password can be reset and a credit card reissued, but an NRIC number, full name and date of birth cannot. Once exposed, they give criminals the key details for targeted impersonation scams. Every breach puts customer trust and service continuity at risk, and Singapore’s standing as a business hub rests on trusted digital services.

## Testing in waves

In the same speech, Shanmugam set out the response: “If AI allows attackers to identify vulnerabilities and conduct attacks more quickly, then the defenders will have to use AI too.” For businesses, that means testing at the speed and scale attackers now work at. Testing in waves gets there in stages: a broad outsider’s view of everything exposed first, then deeper testing as you add context, with each wave building on the last.

The first wave assesses all approved internet-facing applications in parallel, without credentials, source code or inside knowledge, and with the web application firewall left in place. Customer portals, partner services and older applications all belong in scope, as do staff portals and services run by third parties on your behalf. The result is a baseline leadership can act on: what was tested, where exploitation was demonstrated and which findings need attention first.

Later waves add the context you would give a human penetration tester: user credentials, application documentation and source code, as you see fit. An authenticated user can reach more of each application, so the attack surface grows, and so does the potential impact of a weakness. Each wave also retests earlier fixes.

The waves show what an attacker could exploit. The same testing shows whether you would notice. XBOW logs each request it sends, with timestamps, target URLs and server responses, so your security operations centre can check that record against its own alerts. Any security monitoring misses is a monitoring gap you can close.

Powering these waves is XBOW, an autonomous offensive security platform that breaks into every asset you expose, not just the crown jewels, and proves it. You set the scope, the impact level and the testing window and every action is logged. XBOW delivers this approach through [Autonomous Exposure Management](#), starting with black box testing at scale: one Fortune 50 organisation assessed 180 web applications in a month and received 1,216 validated findings. Assessments return results in hours. Every finding is a working exploit, and XBOW re-tests each fix once it is deployed.

## Running tests safely

![Loi Liang Yang](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ecd1e2bff81ff904.webp)

Singapore organisations will want to settle two questions before they start: can testing run safely, and can it meet security and residency requirements? With XBOW, testing runs only against targets you approve, within agreed scope and [safety controls](#), including non-destructive exploit demonstration and automatic pauses if a target becomes unstable. Testing is also visible end to end; XBOW traffic comes from published IP addresses, and every request and agent action is logged, so a security operations team can tell authorised testing apart from a real attack. To help meet data sovereignty requirements, XBOW offers an AWS data residency option in Singapore, where security-sensitive assessment data, including details of how systems could be exploited, is stored and processed. ([Data residency details](#))

The outcome is a security programme that keeps pace with attackers. Leadership gains broad visibility from the outset, deeper testing with each wave, and validated evidence that exploitable weaknesses are being reduced. [Get in touch](#) to plan your first wave.
