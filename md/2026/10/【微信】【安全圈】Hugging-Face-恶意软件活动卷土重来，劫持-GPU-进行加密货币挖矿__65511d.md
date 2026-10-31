---
title: 【微信】【安全圈】Hugging Face 恶意软件活动卷土重来，劫持 GPU 进行加密货币挖矿
source: https://mp.weixin.qq.com/s/EDQwXmWcSQOZ_eQOAc-Z4g
source_host: mp.weixin.qq.com
clip_date: 2026-10-31T19:31:46+08:00
trace_id: 2588b3e8-85a2-4520-ad1a-7bff9ff5fb64
content_hash: 26f9ced08e323a95cdc45bf2cb7e6c3d0a0ec915237f591b83f2b3ce7eaeef4b
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
notion_page_id: 40a75244-d011-8108-9dcd-c41662f21447
ioc: null
---

**安全圈** *2026年10月31日 19:00*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/830fccecd7453c2c.webp)

**关键词**

恶意软件

一个滥用 Hugging Face 模型代码库的加密货币挖矿和后门活动在被下线后数天内卷土重来。

其最受欢迎的恶意模型下载量超过 28,000 次。

另外，研究人员标记了 GitHub 上一个自 2025 年底以来一直存在的虚假 Solana 入门套件，其定位是诱骗 AI 编码智能体安装远程访问木马。

**模型加载前代码就已运行**

Pluto Security 的研究人员在七个 Hugging Face 账户中发现了 31 个恶意代码库，自 9 月以来分两波发布。

这些模型伪装成小型 Qwen2 测试检查点。它们针对运行 Xinference 和 GPUStack 等自托管推理服务器的 GPU 主机。

包含关联模型在内，这些代码库的下载量超过 32,000 次。Pluto 指出，这统计的是下载量，而非已确认的感染。

该活动没有使用投毒权重或 pickle 漏洞利用，而是滥用 Hugging Face 的一个选项 trust_remote_code，它允许模型自带 Python 代码。当用户启用它时，模型一加载，该代码就会在其机器上运行。

下载量最高的模型 MENXIANGYU/qwen2-tiny 根本不含实际模型。其代码悄悄安装一个伪装成 Linux 系统进程的加密货币挖矿程序，若被杀死则重启它，并移除机器上与之竞争的挖矿程序。

某些版本还会开启一个反向 shell，让攻击者直接访问受感染的服务器。

**下线后数天内卷土重来**

Pluto 通过一个测试账户发现了该活动，其遗留的备份文件指向攻击者的主要账户。它向 Hugging Face 和中国的 ModelScope 报告了第一波活动，两者都移除了这些账户。

数天内，第二波 19 个代码库在新账户下出现。

在 Pluto 报告后数小时，操作者又发布了另一个模型，其脚本可以突破容器并接管其下的服务器。

Pluto 表示，第二波代码库在其报告后八天仍然在线。旗舰模型的下载量从报告时的 7,354 次攀升至 10 月 28 日的 28,412 次。

截至撰写时，Hugging Face 已禁用对该模型的访问。一个由较新账户 htt0118 于 10 月 25 日上传的几乎相同的副本仍然在线，BleepingComputer 确认其包含相同的挖矿程序和反向 shell。

**扫描干净，实际获利**

Hugging Face 使用防病毒软件以及来自 Protect AI 和 JFrog 的合作伙伴工具扫描上传内容。Pluto 表示，这些工具查找已知恶意软件和不安全的模型格式，而不是模型 Python 代码的实际行为。

"第二波旗舰模型在扫描中显示干净，同时积累了 28,412 次下载，"研究人员表示，并补充说 JFrog 报告该载荷文件"不是一个机器学习模型"。

据 Pluto 称，操作者的主钱包已收到约 5,000 美元的 Pearl（PRL）加密货币。在其背后的代码库被移除后，它在矿池上仍然活跃。

在研究人员观察期间，九台似乎属于一个共享研究 GPU 集群的机器同时开始为操作者挖矿。

它们在大约六分钟后停止，Pluto 表示这符合管理员杀掉作业的情况。

Pluto 将该活动归因于一个出于经济动机的汉语系操作者。它引用了简体中文代码注释、位于 Alibaba Cloud 上的命令与控制服务器，以及发生在中国深夜的活动时间。

任何在启用 trust_remote_code 的情况下加载过这些模型的人都应将该机器视为已被攻陷，对照 Pluto 报告中的指标进行检查，并轮换其可能触及的任何凭据。仅杀死挖矿程序并不能移除后门。

**虚假 Solana 套件瞄准 AI 编码智能体**

在另一份报告中，Air Security 描述了一个 GitHub 代码库 SolanaUpdateTools/solana-starter-kit，称当 AI 编码智能体搜索 Solana 入门套件时，它排名第一。

选择该代码库并遵循其 README 的智能体可能在开发者从未察觉的情况下运行攻击者的命令。

该代码库创建于 2025 年 11 月，拥有 286 个 star。其 README 承诺一个完整的 Solana 应用模板，但这些代码都不存在，README 是代码库中

唯一的文件：

README 唯一的"安装"步骤是让用户将一条 PowerShell 单行命令粘贴到命令提示符中。这条仅限 Windows 的命令从片段组装出一个 developer-update\[.\]app 上的 URL，然后从中获取脚本并在内存中运行。

BleepingComputer 从 Internet Archive 的 Wayback Machine 获取了存档的载荷并确认了 Air 的发现。

该载荷安装 NetSupport Manager——一种合法的远程访问工具——配置为连接到 maxwintodaybtc\[.\]com，并在每次登录时让攻击者对机器进行隐藏控制。

该脚本随后显示一个伪造的错误，称"开发者功能因负载暂时暂停"并"请在 72 小时后重试"，智能体很容易将其转述为寻常的服务器小故障。

Air 将该配置与 eSentire 追踪的一个已知 NetSupport RAT 操作者以及一个早先用虚假 TradingView "AI 信号"工具诱骗加密货币交易者的活动关联起来。

当 Air 检查时，载荷 URL 返回了 404。截至撰写时，该 GitHub 代码库仍然在线。

***END***

阅读推荐

[【安全圈】官方插件遭投毒！Claude Code被植入SSH后门](https://mp.weixin.qq.com/s?__biz=MzIzMzE4NDU1OQ==&mid=2652079634&idx=1&sn=5f118197d2668a55db0755ec56254013&scene=21#wechat_redirect)
