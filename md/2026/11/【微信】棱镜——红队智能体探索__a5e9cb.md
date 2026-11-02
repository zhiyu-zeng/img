---
title: 【微信】棱镜——红队智能体探索
source: https://mp.weixin.qq.com/s/dq74YYEet-Mn92-EHPrnHg
source_host: mp.weixin.qq.com
clip_date: 2026-11-02T15:43:19+08:00
trace_id: f1bf3869-e1ce-470f-9dfa-23e16bdb7f20
content_hash: 4d044d4542a9d0f11774b3e00038a91164b593640558fe1bda32505cbfaeef60
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 38
  succeeded: 38
  failed_urls: []
notion_page_id: 40c75244-d011-8168-862c-fefba4e5eec2
ioc: null
---

**货拉拉安全应急响应中心** *2026年11月2日 15:00*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/571e0ddef326d5f1.png)

**棱镜**

**红队智能体探索**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/fddeff2fc1895c88.png)

**PRISM RED TEAM AGENT EXPLORATION**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/237c9c5550648c80.png)

**一、背景**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/203ac2e3d05ea43b.png)

随着大模型 Agent 的发展，越来越多安全从业者开始尝试将其用于红蓝对抗、渗透测试等安全行业。现有通用 Agent 已经擅长对话、写代码、浏览网页和调用工具，但红队任务不是简单地“让模型执行几个安全工具”。

这些步骤前后依赖、持续反馈。例如资产发现会改变后续策略，指纹识别会影响漏洞判断，复核结果又会改变风险排序和报告结论。真正困难的不是单次工具调用，而是如何让 Agent 在安全任务中保持长期可用状态。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1442d00298c4f08a.png)

**二、基于Coding Agent探索**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a69ec14171d3ea41.png)

**2.1 Agent架构分析**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/17af90d2a872eab0.png)

Claude Code的整体架构可以理解为一个由 Runtime 驱动的循环执行系统。用户输入任务后，Runtime 会先完成会话管理和上下文组装，将系统提示、项目规则、历史消息、工具描述和环境信息整理为模型当前可见的工作上下文；随后模型进入主循环，判断下一步是直接回复、继续规划，还是调用工具。每一次工具调用都会先经过权限检查，再由 Runtime 执行，并将结果写回上下文，供模型进入下一轮分析。这个过程会持续迭代，直到任务完成，或在上下文接近上限时触发压缩后继续执行。整体上，模型负责理解任务和决策方向，Runtime 负责上下文维护、工具调度、权限控制和循环管理。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5d74ef30a4f5e65e.png)

成熟 Agent Runtime 已经解决了大量通用问题：

**·** 会话与上下文生命周期。

**·** 模型调用和流式响应。

**·** 工具注册、调用和结果回写。

**·** 权限确认与执行控制。

**·** 长任务循环、压缩和恢复。

**·** 子任务或子 Agent 扩展接口。

**2.2 棱镜1.0**

棱镜最初版本设想是在Agent之上增加一层面向红队任务协作机制，以此来更好的完成对抗任务。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c2d3ef452a8a0939.png)

**Agent运行时**

Agent Runtime 采用持续反馈的任务推进方式：

**· 思考**：结合用户目标、当前状态和历史结果判断下一步任务。

**· 行动**：选择MCP 服务、技能库或协作 Agent 执行具体动作。

**· 观察**：读取结果，将新内容写入共享状态。

**· 再思考**：基于状态调整策略，决定后续操作。

**观察纠偏**

观察纠偏作为 Agent 主循环之外的评估机制，不直接替代模型决策。它持续消费会话、工具和状态事件，识别重复尝试、任务跑偏和异常结束，并给出纠偏建议，问题严重时可直接结束Agent循环。

**安全工具**

工具层负责快速接入常见安全工具：

**· 统一接口**：规范工具参数、返回值，避免工具之间通过非结构化文本松散传递状态。

**· 执行治理**：按操作风险进行范围判断、人工审批，避免破坏性动作。

**· 标准化**：对工具输出进行处理，写入共享状态。

**共享状态**

共享状态中心是一次红队任务的结构化“工作记忆”，由六类对象组成：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a0d3805bf579d444.jpg)

**数据沉淀**

数据沉淀层用于跨任务复用，任务结束或阶段完成后，系统将经过审核的信息归纳为四类长期数据：

**\- Knowledge**：CVE、漏洞知识、利用条件、工具用法、方法论和 TTP。

**\- Experience**：有效路径、失败案例、误报模式、现场约束和目标特征。

**\- Asset**：组织、域名、IP、技术指纹、拓扑、标签和历史变化。

**\- Ops**：任务报告、漏洞清单、证据链、时间线和报告输出记录。

数据沉淀必须保留来源、采集时间、置信度、适用范围和敏感级别，并通过去重、复核和归档策略持续治理。

**结果导出**

从共享状态生成四类交付物：

**·** 攻击面报告汇总资产、服务、风险和潜在路径

**·** 漏洞报告描述漏洞、影响、证据、复现条件与修复建议

**·** 证据附件保存请求响应、日志、截图和文件

**·** 可视化资产拓扑、风险仪表

**三、基于DeepSeek-Harness**

**插件化落地**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5c4ab32dc5d47e84.png)

**3.1 DeepSeek-Harness**

本节依据 DeepSeek Harness 官方 **《DeepSeek Harness 架构》** 整理。

DeepSeek Harness 构建在 Cordis 之上。启动时，Profile 将 Bundle、用户 Patch 和树外插件叠加成一棵实际运行的插件树；会话、系统提示、工具注册表、模型适配器和 Agent Loop 都以插件形式挂载，因此可以通过配置组合、替换，并在卸载时撤销相应注册。运行阶段以 Turn / Step 为基本闭环：系统领取输入，组装提示词与工具 Schema，发起模型请求，执行流水线，再把结果写入 SessionEvent。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/764dae25bfcdaf45.png)

**3.2 Cordis 插件体系**

本节依据 DeepSeek Harness 官方 **《Cordis 教程》** 整理。

Cordis 是 DeepSeek Harness 底层的插件框架：它是一个小型运行时，其中的每项能力，包括工具、LLM（大语言模型）适配器、文件访问乃至 agent loop（智能体循环）本身，都是挂载到共享上下文中的插件。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0d6fb6d3a51d903c.png)

插件不需要自己启动一整套 Agent，只需要告诉系统它能增加什么能力，例如一个工具、一段提示词、一项公共服务或一个事件监听器；cordis.yml 和 Profile Patch 则决定最终要把哪些插件装在一起。

开发一个插件通常只需要确定增加的能力，定义可选的配置 Schema 和必需依赖 inject，然后在 apply(ctx, config) 中完成注册，最后把插件加入组装配置。插件启动后，通过共享 Context 把能力交给 Harness。工具注册到 ctx.tools，提示词注册到 ctx.systemPrompt，公共能力放在 ctx.<key>。

**3.3 棱镜 2.0**

棱镜以 @prism-ai/dsh-redteam 单一 Cordis 插件落地，并配套一组侧边栏入口。插件随会话模式启用，只在该作用域内注册相关内容。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b7bf04a024959465.png)

DeepSeek Harness 负责 Agent 主循环、会话、模型调用、通用工具、Skills、MCP、沙箱和人工审批。棱镜插件只补充安全任务适配：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6089a74f158c1beb.jpg)

运行模式、目标范围和工具启用构成棱镜的安全围栏：

**·** 运行模式决定可以使用哪些权限

**·** 目标范围决定可以测试哪些目标

**·** 工具名单决定可以调用什么工具

三项都满足后，操作仍需继续经过 DeepSeek Harness 的安全策略；通用的 Bash、文件、Web 和其他 MCP 工具仍由 Harness 自身策略管理。

**四、棱镜效果**

**DeepSeek Harness最新版本0.1.2-alpha.5已验证，源码地址： https://github.com/spkiddai/dsh-redteam**

部署插件后，在 DeepSeek Harness 的 Agent 预设列表中选择“红队模式”，并关联当前工作区，即可进入棱镜看板。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/661a9397e8421d14.png)

**4.1 执行权限**

看板顶部用于设置棱镜安全工具在当前会话中的执行权限，四种模式按权限逐级放开：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/cfa7f8e50e609cbf.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0bb761fbd16165aa.png)

**4.2 项目状态**

“项目状态”是任务的主要操作入口，集中放置项目概览、模型情况、信息收集、目标范围、漏洞扫描、漏洞验证、结果导出等模块。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/075efabb82948efc.jpg)

• 项目概览：展示项目名称、项目 ID、工作区和总体完成度；可选择资产数据、漏洞详情或项目报告，并导出为Word、Markdown或 HTML。

•模型情况：查看输入与输出Token、缓存命中率和费用消耗，便于评估运行成本。

•信息收集：查看输入与输出Token、缓存命中率和费用消耗，便于评估运行成本。

•目标范围：使用公开检索逐层发现资产，并把节点、关系、来源写入资产图。

•漏洞扫描：分析现有资产、服务和代码，形成漏洞。

•漏洞验证：用于复现漏洞实际利用效果。

•会话对话：所有操作复用当前Harness会话，历史消息、推理过程和工具结果。

**4.3 资产情况**

“资产情况”用于查看已经沉淀到当前项目中的资产。上方按域名、IP、端口、服务统计数量，下方以关系图展示资产之间的关联。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/90db4bf45e0c8c60.jpg)

使用时可以通过右上角的缩放控件放大、缩小或恢复资产图。节点颜色用于快速判断处理状态：绿色表示当前没有关联漏洞，黄色表示尚未开始测试，红色表示已经关联漏洞。

**4.4 漏洞汇总**

“漏洞汇总”用于统一查看当前项目的风险结果。顶部展示漏洞总数以及四个严重度的数量，下面展示每条漏洞的标题、位置、严重度、证据和处理状态。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f30fa49ff92a013d.png)

**4.5 工具集成**

“工具集成”负责管理当前项目允许使用的安全工具。内置工具包括用于Nmap、Nuclei、Burp Suite和Metasploit。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/27686019944fcf0a.png)

使用内置工具时，先勾选需要的工具，再点击“确认选择”；只勾选但没有确认不会生效，未确认的工具会被服务端拒绝。添加 MCP 扩展时可填写工具名称、接口地址并选择 HTTP、SSE 或 STDIO 协议，工具能否实际调用仍以 DeepSeek Harness 中已经连接的 MCP 服务为准。“执行详情”区域用于查看工具执行状态和返回摘要，完整过程仍保留在 Harness 原生工具卡片中。

**4.6 使用流程**

一次完整的棱镜任务可以按以下顺序推进：

• 在工作区会话中选择“红队模式”

• 在“项目状态”输入资产并开始信息收集

• 根据资产图勾选并确认目标范围

• 在“工具集成”勾选工具，并选择合适的权限模式

• 在“项目状态”执行漏洞扫描

• 在“漏洞验证”或“全部允许”模式下复核已确认漏洞

• 在“资产情况”和“漏洞汇总”查看整体结果

• 导出资产、漏洞或项目报告

**五、后续演进计划**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/54257f689e50b88d.jpg)

**参考文献：**

**Claude Agent相关文章:https://code.claude.com/docs/**

**Claude Code:https://github.com/anthropics/claude-code**

**DeepSeek Harness相关文章:https://deepseek.com/harness**

**DeepSeek Harness源码地址:https://github.com/deepseek-ai/deepseek-harness**
