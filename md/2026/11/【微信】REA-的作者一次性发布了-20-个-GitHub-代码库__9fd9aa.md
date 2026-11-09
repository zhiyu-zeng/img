---
title: 【微信】REA 的作者一次性发布了 20 个 GitHub 代码库
source: https://mp.weixin.qq.com/s/ba27-QF3jUFYFJkadLWwMg
source_host: mp.weixin.qq.com
clip_date: 2026-11-09T10:47:06+08:00
trace_id: b1ce9a3b-3482-46f9-adaf-b93b7e82476c
content_hash: f48b431da84c780267601afef0f49e05b2411d4dbe46eafddcc0179b9c066693
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 8
  succeeded: 8
  failed_urls: []
notion_page_id: 41375244-d011-81e7-b7bb-c5d64f603c14
ioc: null
---

**黑白之道** *2026年11月9日 08:50*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/eeb836fa6d77631e.png)

> **导语**：推文说，REA 的作者一口气放了 20 个 GitHub 仓库，照着抄就能搭出一整套 AI 逆向环境。我把 GitHub API 翻了一遍：20 项里 18 个是真实仓库、全部可以正常访问，作者亲手写的只有 2 个，最后两项压根不是仓库。而他真正的"一次性发布"，是 2026 年 10 月 9 日一天建出来的 88 个。

![AI 逆向工程工具链](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2b051dd0744b0f60.png "AI 逆向工程工具链")

*20 个仓库按逆向流程分成 5 个环节，从分析内核一路排到重建验证*

* * *

## 先把推文里的 20 个仓库拆开看

推文出自 @0xluffy_eth（路飞），2026 年 11 月 2 日 18:55 发布，2.3 万次浏览、383 赞、482 收藏。收藏数压过点赞数，是典型的"工具清单"传播特征——大家想留着以后用，不是想现在看。

清单按逆向流程分了五组，每组四个：

| 环节  | 仓库  |
| --- | --- |
| 分析内核 | REA（morluto/rea）、Ghidra、GhidraMCP、ida-pro-mcp |
| 移动端与 App | jadx、Apktool、Frida、ILSpy |
| 二进制与底层 | radare2、x64dbg、ImHex、angr |
| 网络与运行 | mitmproxy、dnSpy、rizin、raddebugger |
| 重建与验证 | awesome-ai-reverse-engineering、awesome-reverse-engineering、REA 工作流、净室循环 |

![REA 作者铺开的五层逆向工具链](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/fe9289aa29bb168c.png "REA 作者铺开的五层逆向工具链")

*五个环节共 20 项，覆盖反编译、调试、动态插桩、流量拦截到规格重建的完整链路*

## "20 个仓库"这句话，三成是包装

我把清单里能查的 18 个地址逐个 curl 了一遍， **全部返回 200**，没有一个是死链。而作者 morluto 自己写的，只有两个： `morluto/rea` 和 `morluto/awesome-reverse-engineering` 。剩下 16 个全是别人的上游项目——Ghidra 是 NSA 的，jadx、Apktool、Frida、ILSpy、radare2、x64dbg、ImHex、angr、mitmproxy、dnSpy、rizin、raddebugger（Epic Games 出品），加上 GhidraMCP、ida-pro-mcp 和 zhuyansen 的那份 122 仓库安全评级清单。

后两项更直接：清单里的"REA 工作流"和"净室循环" **不是独立仓库**，是 REA 仓库内部的东西。前者是 `.agents/skills/reverse-engineer-anything/` 下的 Agent Skill——一份 36 KB 的 SKILL.md 加 6 篇参考文档；后者是 docs/specs/<功能名>/ 下 spec.md、plan.md、tasks.md、verification.md 这套规格目录结构。所以"20 个 GitHub 仓库"这个说法，实际是 18 个仓库加 2 个仓库内的工作流。

真正值得写的是另一件事。

## 真正的"一次性发布"，是 88 个

翻 morluto 的 GitHub 主页，260 个公开仓库里 **自建的只有 10 个**，其余全是 fork。再按创建日期一统计： **2026 年 10 月 9 日一天之内，他建了 88 个仓库**，从当天 14:20 排到 17:50，三个半小时，87 个是 `rea-` 前缀的各路清单快照，剩下 1 个是自建的 `awesome-reverse-engineering` （现在 1566 star、349 fork）。

所以推文里那个"一口气"，方向没错，只是把 88 压成了 20。这 88 个里绝大多数是 fork——它们的作用是 **冻结上游快照**，让 REA 的依赖不随上游变动而漂移。你要读懂这个动作，就得明白作者真正在意的不是仓库数量，而是 **依赖可复现**。

## 有一条热评是误判

推文下面有人回："除了 rea 全部都 404，有啥吓人的。"

我逐个验证过了，18 个仓库全部 200 可访问。那位多半是把推文里被 X 截断的显示文本——比如 `github.com/NationalSecuri…` ——当成了真实地址去访问。推文里 16 个链接的显示串都被截断了，实际跳转走的是 t.co。

回复区另一条说得在理："这已经不是工具清单了，是把逆向各环节都交给智能体。"

## 真正有杀伤力的是净室循环

清单里那两个"不是仓库"的东西，才是整套东西的重心。

REA 的流程是：二进制 → REA 取证 → 生成 SPEC.md → 按规格重建 → 判定 → 不对就回到第一步。

![REA 的净室重建循环](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b60b1616107f0fab.png "REA 的净室重建循环")

*取证与重建分离，判定不通过就回到第一步继续迭代*

这一圈解决的是 AI 逆向最大的死穴—— **模型会编**。规格文档由证据驱动生成，重建结果要过判定标准，不通过就重跑；每条结论都带证据引用和不确定性说明。它把"让模型解释一个二进制"变成了"让模型交付一个可校验的等价实现"。

再加上全链路本地：分析引擎跑在本机（MCP 走本地 stdio），二进制不出网，云端模型只拿到结论和证据。这一条同时踩在两个点上——绕开了"上传样本"这条合规红线，也绕开了"模型现场幻觉"这条技术红线。

覆盖面上，REA 现在吃原生二进制、JavaScript/Electron、.NET 程序集、Web 和 Android APK。 `npx rea-agents setup` 一条命令把 MCP server 和配套工作流装进 Claude Code、Codex、Cursor、Gemini CLI、Grok Build。

## 攻防两端，成本一起塌

从红队视角看，这东西把两件事同时打通了： **逆向能力** 和 **重建能力**。

以前拿到一个 App，想复刻它的某个功能，只能人肉逆。反过来防守方要判断"这个 APK 到底干了什么"，也得靠人。二进制没法自己解释自己，人是唯一的中介。

现在这条链路两端都能接上智能体：攻击者用它拆别人的东西并复刻功能，防守方用它拆自己发的版本来查供应链。42 万 star 和 10 万 fork 说明它已经不再是研究者的玩具，而是默认选项。

顺带说一句，这项目在中文安全圈不算新面孔——10 月底它刚因为"Claude 被 Anthropic 悄悄掐断逆向能力"的事刷过一轮热度。这次推文只是把散落的零件一次性摆在了台面上。

**结论**：别被"20 个仓库"这个数字带跑，真正该盯的是净室循环——取证和重建分离、判定闭环、全链路本地。工具会换，那三件事不会。

**版权声明**：本文由华盟网原创发布，保留所有权利。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/198462425f2677a2.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c16f744747fed73f.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/dca7b31069c478b2.jpg)

* * *

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/60693bec6dc25202.jpg)

> 👇 点击，访问我的网站

* * *

Tools · 目录
