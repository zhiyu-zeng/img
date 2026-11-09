---
title: 【微信】GitHub AI 渗透一周报：本周 17 个新项目（Agent / 编排 / MCP
source: https://mp.weixin.qq.com/s/InYRinFWKZTg4M3OTKUOrw
source_host: mp.weixin.qq.com
clip_date: 2026-11-09T11:52:07+08:00
trace_id: 9e3a566b-ac5e-4349-8d30-08ebe27f33f2
content_hash: 08ea21b4a9a73060909a61254bb6ef42e06360aee4dee3b40b7ddb76e2908bff
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
notion_page_id: 41375244-d011-81fa-9882-e53ed40a661c
ioc: null
---

## GitHub AI 渗透一周报：本周 17 个新项目（Agent / 编排 / MCP / Skills）

**船山信安** *2026年11月9日 11:03*

实战笔记 · PENTEST × AI 安全

## GitHub AI 渗透一周报：本周 17 个新项目（Agent / 编排 / MCP / Skills）

2026-11-09 · 船山信安 · 数据来自 GitHub 实时 API

这一周 GitHub 上又冒出来一批 AI 渗透相关的开源项目。我们按星标、许可证、语言逐个跑 API 核验，把本号还没写过的挑出来，归成了自治 Agent 与编排框架、Agent Skills、MCP 平台与工具三类。老兵的判断写在后半段——能帮你什么，帮不了什么，哪些地方会出幻觉和误报。

## 一、自治 Agent 与编排框架

这一类是主力，主打「给目标、出结果」。蜂群协作、ReAct 推理、从侦察到利用的编排是共同特征。每一个都只做合法授权测试场景。

**Pentest-Swarm-AI** （Armur-Ai/Pentest-Swarm-AI，3153⭐，Go）— 蜂群架构的自主渗透平台，用信息素黑板协调侦察、分类、利用、报告多个专精 Agent，支持 Claude API 与 Ollama 本地部署。仅限合法授权测试。

**pentest-ai** （0xSteph/pentest-ai，1812⭐，Python）— 开源 AI 渗透测试器，每个发现都要机器 oracle 复跑验证，验证过的漏洞会生成可回放的证明胶囊。仅限合法授权测试。

**guardian-cli** （zakirkun/guardian-cli，1906⭐，Python）— 生产级 AI 渗透 CLI，用 Google Gemini 加 LangChain 编排一步步的渗透工作流。仅限合法授权测试。

**AutoPentestX** （Gowtham-Darkseid/AutoPentestX，1579⭐，Python）— 自动化渗透与漏洞报告工具，把扫描、利用、报告串成一条流水线。仅限合法授权测试。

**Pentest Copilot** （bugbasesecurity/pentest-copilot，1553⭐，TypeScript）— 浏览器端的 AI 道德黑客助手，帮渗透测试人员理顺工作流。仅限合法授权测试。

**AutoCVE** （larlarua/AutoCVE，1216⭐，Python）— 智能体驱动的自动化 CVE 发现平台，覆盖源码审计、漏洞验证、报告生成全流程。仅限合法授权测试。

**Cairn** （oritera/Cairn，4959⭐，Python）— 通用 AI 状态空间搜索引擎，先在自主渗透场景上做了验证，把攻击路径当成搜索问题来解。仅限合法授权测试。

**CyberStrike** （CyberStrikeus/CyberStrike，3463⭐，TypeScript）— 开源 AI 驱动的进攻性安全 harness，把任意 LLM 转成自主红队 Agent。仅限合法授权测试。

**red-run** （blacklanternsecurity/red-run，303⭐，Python）— 专为 Claude Code 打造的进攻性安全工具包，覆盖侦察到横向移动各环节。仅限合法授权测试。

## 二、Agent Skills 与知识库

这一类把「能力」和「知识」喂给通用 Agent，让 Claude Code、Copilot、Cursor 这类客户端直接调起安全动作或方法论。门槛低、落地快，适合个人装完就用。

**Claude-Red** （SnailSploit/Claude-Red，10504⭐，Python）— 精选的进攻性安全 skills 库，覆盖 Web、AD、云、无线、移动、IoT 等 13 个攻击面，每个都是结构化 SKILL.md。仅限合法授权测试。

**Claude-BugHunter** （elementalsouls/Claude-BugHunter，5495⭐，Python）— 面向 bug bounty 与红队的 Claude Code skills 包，内置 82 个 skills、15 条斜杠命令与大量已披露漏洞模式。仅限合法授权测试。

**Transilience Community Tools** （transilienceai/communitytools，611⭐，Python）— 开源 Claude Code 安全套件，含 23 个 skills、8 个 agents 与多条斜杠命令，覆盖从侦察到报告的全生命周期。仅限合法授权测试。

**claude-code-guide** （zebbern/claude-code-guide，4700⭐，Python）— Claude Code 指南仓库，内置 29 个聚焦渗透测试与安全分析的安全 skills。仅限合法授权测试。

## 三、MCP 平台与工具

这一类把安全工具通过 MCP 协议暴露给 AI Agent，让客户端直接调起 nmap、Metasploit、Kali 命令行。是「Agent 指挥工具」这条线的关键基础设施。

**MetasploitMCP** （GH05TCREW/MetasploitMCP，760⭐，Python）— 给 Metasploit Framework 做的 MCP Server，支持 stdio 与 HTTP 两种传输。仅限合法授权测试。

**MCP-Kali-Server** （Wh0am123/MCP-Kali-Server，871⭐，Python）— 把 AI Agent 连到 Linux 机器的 MCP 配置，可调用任意终端命令。仅限合法授权测试。

**awsome_kali_MCPServers** （ccq1/awsome_kali_MCPServers，110⭐，Python）— 为 Kali Linux 量身定制的 MCP servers 集合，覆盖网络分析、流量分析、二进制理解。仅限合法授权测试。

**pentestmcp** （ramkansal/pentestmcp，115⭐，Python）— 为渗透测试者设计的 MCP，把扫描、利用、报告封装成 Agent 可调用的工具。仅限合法授权测试。

## 重点项目表（实时星标 / 语言 / 一句话定位）

|     |     |     |     |
| --- | --- | --- | --- |
| 项目  | 星标  | 语言  | 一句话定位 |
| oritera/Cairn | 4959 | Py  | 通用 AI 状态空间搜索，先在自主渗透上验证 |
| SnailSploit/Claude-Red | 10504 | Py  | 58 个进攻性安全 skills 库 |
| elementalsouls/Claude-BugHunter | 5495 | Py  | 82 个 bug bounty / 红队 skills 包 |
| zebbern/claude-code-guide | 4700 | Py  | 指南仓库，内含 29 个安全 skills |
| CyberStrikeus/CyberStrike | 3463 | TS  | 开源 AI 进攻性安全 harness |
| Armur-Ai/Pentest-Swarm-AI | 3153 | Go  | 蜂群架构自主渗透平台 |
| zakirkun/guardian-cli | 1906 | Py  | Gemini + LangChain 生产级 AI 渗透 CLI |
| 0xSteph/pentest-ai | 1812 | Py  | 机器 oracle 验证每个发现的 AI 渗透器 |
| Gowtham-Darkseid/AutoPentestX | 1579 | Py  | 自动化渗透与漏洞报告工具 |
| bugbasesecurity/pentest-copilot | 1553 | TS  | 浏览器端 AI 道德黑客助手 |
| larlarua/AutoCVE | 1216 | Py  | 智能体驱动自动 CVE 发现平台 |
| Wh0am123/MCP-Kali-Server | 871 | Py  | 把 AI Agent 连到 Linux 机器的 MCP |
| GH05TCREW/MetasploitMCP | 760 | Py  | Metasploit 的 MCP Server |
| transilienceai/communitytools | 611 | Py  | 23 skills + 8 agents 的 Claude Code 安全套件 |
| blacklanternsecurity/red-run | 303 | Py  | 给 Claude Code 用的进攻性安全工具包 |
| ramkansal/pentestmcp | 115 | Py  | 为渗透测试者设计的 MCP |
| ccq1/awsome_kali_MCPServers | 110 | Py  | 为 Kali Linux 定制的 MCP servers 集合 |

## 老兵判断：能帮什么，帮不了什么

**能帮的：** 它们最适合做广度侦察和重复劳动——资产梳理、已知 CVE 匹配、配置审计、CTF 与靶场训练。带技能化封装的（Claude-Red、Claude-BugHunter）把方法论标准化，新人上手更快；带编排的（Pentest-Swarm-AI、Cairn）把多 Agent 协作跑成可复现的流程；MCP 类（MetasploitMCP、MCP-Kali-Server）让 Agent 直接调起现成工具，省去自己写胶水代码。

**帮不了的：** 业务逻辑漏洞、需要社会工程与现场判断的环节，机器目前还替代不了人。多 Agent 系统在真实大网里容易被卡在「该往哪走」的决策点上，链式攻击路径仍靠人拍板。guardian-cli、pentest-copilot 这类偏交互辅助，离「全自动拿 shell」还远，更像会查资料的副驾。

**幻觉与误报：** 这是最该警惕的。Agent 会编造不存在的参数、把推测当结论、把扫描噪音报成高危。pentest-ai 这类带机器 oracle 复跑验证的思路值得肯定，但即便如此，所有高危结论仍需人工复核，不要把 Agent 的输出直接当报告发出去。星标高不等于可靠，先在小靶场验证再上生产环境。

## 合规红线

① 仅限合法授权测试：所有工具只在你拿到书面授权的目标上使用，未经授权不得对任何系统发起测试。

② 本地模型保数据主权：涉及敏感代码与目标信息时，优先用本地或私有化部署的模型，避免数据出域。

③ 不未授权使用：不把自动化能力用于未授权的侦察、利用或数据获取，遵守所在司法辖区的法律法规。

## 开源地址汇总

https://github.com/Armur-Ai/Pentest-Swarm-AI

https://github.com/0xSteph/pentest-ai

https://github.com/zakirkun/guardian-cli

https://github.com/Gowtham-Darkseid/AutoPentestX

https://github.com/bugbasesecurity/pentest-copilot

https://github.com/larlarua/AutoCVE

https://github.com/oritera/Cairn

https://github.com/CyberStrikeus/CyberStrike

https://github.com/blacklanternsecurity/red-run

https://github.com/SnailSploit/Claude-Red

https://github.com/elementalsouls/Claude-BugHunter

https://github.com/transilienceai/communitytools

https://github.com/zebbern/claude-code-guide

https://github.com/GH05TCREW/MetasploitMCP

https://github.com/Wh0am123/MCP-Kali-Server

https://github.com/ccq1/awsome_kali_MCPServers

https://github.com/ramkansal/pentestmcp

参考来源：数据截至 2026-11-09，星标以 GitHub 实时 API 为准；许可证与语言取自各仓库元数据。本文仅作技术盘点，不构成使用建议，所有工具仅限合法授权测试场景。

AI安全 · 目录

作者提示: 个人观点，仅供参考
