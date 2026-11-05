---
title: 【微信】利用下载文件夹中的 AGENTS.md 文件劫持 AI 编码代理
source: https://mp.weixin.qq.com/s/htVFDH6c9vOadQ7sfl6UOg
source_host: mp.weixin.qq.com
clip_date: 2026-11-05T10:19:59+08:00
trace_id: 2cc8c03d-d0ac-45f4-a07b-4d26618fdfad
content_hash: f2a228909175ccc3f24b3b0a2d0869c5b7d91ab8ade8a734e2f8098caa7f38b5
status: synced
tags:
  - 微信
  - AI应用
  - 漏洞分析
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 下载文件夹中的恶意 AGENTS.md 可劫持 AI 编码代理执行代码或窃取 OAuth 令牌：Codex 攻击成功率 90%，切勿将代理工作目录设在 ~/Downloads。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 40f75244-d011-8128-a1de-e7aa086fb718
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 下载文件夹中的恶意 AGENTS.md 可劫持 AI 编码代理执行代码或窃取 OAuth 令牌：Codex 攻击成功率 90%，切勿将代理工作目录设在 ~/Downloads。
> 
> - **攻击链路：** 网页可将恶意 AGENTS.md 静默下载到 ~/Downloads；代理在该目录启动时会自动加载其中的指令并照做，受害者即被诱骗安装恶意 npm 包 "function-color"。
> - **实测数据：** 用无害载荷（打开计算器）重建对 Codex 的攻击，成功率 90%；用恶意 CLAUDE.md 将 Claude Code 的 API 流量重定向到攻击者服务器，可截获 OAuth 令牌并冒充模型返回执行代码的工具调用，发生率约 50%。
> - **受影响面：** Forever Security 内部统计显示，数百家客户曾从 ~/Downloads 运行 Claude Code、OpenAI Codex、Cursor CLI，仅 Claude Code 就从该目录启动超过 1300 个会话。
> - **厂商立场：** 研究人员认为 OpenAI/Anthropic 无需修补——代理遵循工作目录中的 AGENTS.md 是按设计意图行事，属使用习惯问题而非软件漏洞。
> - **防护建议：** 将代理启动在具体项目根目录而非下载目录；使用前审查陌生的 AGENTS.md、CLAUDE.md 等指令文件；保持审批提示与沙盒保护开启；不受信代码先在隔离环境中测试。

**暗镜** *2026年11月5日 07:00*

研究人员在客户的下载文件夹中发现了一个恶意 AGENTS markdown 指令文件，该文件诱骗 AI 编码代理安装了一个恶意 npm 包。他们重现了对 OpenAI Codex 的攻击，并演示了一种针对 Claude Code 的相关技术，该技术仅使用恶意指令即可泄露 OAuth 令牌并劫持帐户。Markdown 文件（例如 AGENTS.md）是纯文本文件，其中包含针对 AI 编码代理的项目特定说明，例如要使用的工具、如何运行测试以及要遵循的编码约定。

Forever Security 是一家监控人工智能代理和自主软件带来的风险的公司，其研究人员在客户的计算机上发现了这种策略，其中编码代理试图安装恶意 npm 包“ *function-color* ”。调查发现，人工智能代理试图将恶意 npm 包安装到客户的 ~/Downloads 文件夹中的 AGENTS.md 文件，该文件夹也是代理的工作目录。

## 攻击机制

代理程序会自动从其工作目录加载适用的文件，并使用其中包含的指令来指导其操作。

虽然这些文件不是可执行文件，但其中包含的恶意指令会导致 AI 代理利用其可用的工具和权限运行命令、安装软件包或更改设置。

研究人员表示 ： “OpenAI 或 Anthropic 无需对此进行任何修补。遵循其文件夹中 AGENTS.md 文件的代理正在完全按照其设计用途执行操作 。 ”

研究人员的测试证实，攻击者可以使用此类文件操纵 OpenAI Codex 和 Claude Code 来执行代码或窃取凭据。。

## 投放路径

Forever Security 本周发布的一份报告称，“~/Downloads 文件夹很特殊。它是网页可以自行写入的唯一文件夹”，并且“网页可以悄无声息地将名为 AGENTS.md 的文件下载到您的 Downloads 文件夹中”。

研究人员创建了一个概念验证 (PoC)，以演示该攻击如何在用户不知情的情况下将恶意文件放入 ~/Downloads 位置。

当 验证 PoC 页面 时，它下载了一个 AGENTS.md 文件，其中包含无害内容，即字符串“敏感数据在此处”和“第 2 行”。默认情况下，包括 Chrome、Edge 和 Firefox 在内的许多流行浏览器会将从网络下载的文件保存到用户的 ~/Downloads 目录中，而不会提示用户为每个下载选择保存位置。

但是，Chrome、Edge 和 Firefox 默认会显示下载通知，在文件保存到本地时提醒用户。

将文件放入下载目录后，攻击者需要目标用户在同一目录下启动其人工智能代理，以便加载指令文件并处理其中的恶意指令。

Forever 的研究员 Gal Weizman 告诉 BleepingComputer，这是一种常见的做法，因为人们经常使用 AI 代理来整理文件夹或处理新下载的文件。

魏兹曼表示，内部统计数据显示，数百家客户从其“~/Downloads”文件夹运行人工智能代理，包括 Claude Code、OpenAI Codex 和 Cursor CLI。这位研究人员告诉 BleepingComputer，仅 Claude Code 就从该位置启动了超过 1300 个会话。

## 攻击实测结果

研究人员使用一个无害的有效载荷（该有效载荷只是打开计算器应用程序）对 Codex 进行了重建攻击链的测试，结果记录到 90% 的成功率。

在另一项测试中，他们使用恶意 CLAUDE.md 文件将 Claude Code 的 API 流量重定向到他们控制的服务器。这暴露了代理的 OAuth 令牌，使得服务器能够冒充模型并返回执行代码的工具调用，这种情况在约 50% 的测试中发生。

用户应避免将 ~/Downloads 设置为 AI 编码代理的工作目录，因为该位置可能包含不受信任的文件，代理可能会将其解释为指令。

OpenAI 和 Anthropic 建议从它们要处理的项目目录运行其 AI 编码代理。

将工作目录限制在相关项目范围内，有助于为代理提供适当的上下文并限制其工作范围，从而降低其处理不相关位置中不受信任的文件的风险。

OpenAI 和 Anthropic 的共同建议是，将 AI 编码代理启动在它需要处理的特定项目的根目录下，而不是启动在你的用户主目录或更广泛的父目录中。尽可能缩小其工作范围，仅在需要时才扩展访问权限。

关键在于，工作目录定义了代理的默认项目上下文，并且根据工具的不同，有助于建立其文件系统访问边界。

用户在允许 AI 编码代理执行操作之前，应查看不熟悉的 AGENTS.md、CLAUDE.md 和类似指令文件，保持启用审批提示和沙盒保护，并在隔离环境中测试可能不受信任的代码，然后再在主系统上运行。
