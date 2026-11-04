---
title: 【微信】一句“hi”触发中转站广告：海鸥越狱包如何持久化操控 Codex 输出
source: https://mp.weixin.qq.com/s/suy2Is-aaqTEutsHdlRECA
source_host: mp.weixin.qq.com
clip_date: 2026-11-04T17:04:12+08:00
trace_id: d4a1c700-6e42-41ea-b887-e9821caa9ea8
content_hash: a0586028d967f78574507ecce34ed3cd7eb057301b4bdec1c6b02c47236d024f
status: synced
tags:
  - 微信
  - 恶意样本
  - AI应用
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: Check Point 将“海鸥”Codex 越狱包 4.5.0 定性为提示词广告软件：越狱与广告共用持久化配置，输入“hi”等触发词即输出固定中转站广告。
ai_summary_style: key-points
images_status:
  total: 5
  succeeded: 5
  failed_urls: []
notion_page_id: 40e75244-d011-81d1-a55f-da57f56cd640
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Check Point 将“海鸥”Codex 越狱包 4.5.0 定性为提示词广告软件：越狱与广告共用持久化配置，输入“hi”等触发词即输出固定中转站广告。
> 
> - **持久化载体：** 指令写入 ~/.codex/AGENTS.md（AGENTS.override.md 优先加载）及六个 seagull-* Skills；启动器先以 Ed25519 签名与 SHA-256 校验 payload.pkg，再用内嵌 AES-256-GCM 密钥解密落地，签名与加密并不代表内容安全。
> - **广告触发机制：** 00-identity.md 预设“hi/你好/教练/ctf”等自然语言触发词，命中即只返回固定口号并附中转站 zz.aiapi2025.top 链接；03-protected-site.md 还将该网关列为禁止攻击性测试的“受保护基础设施”。
> - **越狱手段：** 多模块组合角色扮演、拒绝抑制、双用途借口化重构与 CTF 情境重构以压制模型拒绝；测试中 Claude Code 所用 Sonnet 5 将相关指令标记为提示注入并拒绝遵从。
> - **定性边界：** 未发现被推广网关恶意或作者涉案的证据，但该包出现在配置不当的攻击者服务器上（同机含 Cobalt Strike、Ladon），证明此类双用途工具已进入真实网络犯罪工具集。
> - **排查建议：** 差异比对 AGENTS.md 与可信备份，检索模块名、Skills、域名与固定口号，隔离环境复现触发词，从备份恢复配置而非盲目运行卸载脚本，并将第三方网关凭据纳入审计。

**奇安信威胁情报中心** *2026年11月4日 16:17*

AI 安全 · Prompt Adware

一句“hi”触发中转站广告  
海鸥越狱包如何持久化操控 Codex 输出

Prompt Adware 的技术链路、分发生态与防御排查：免费“增强包”如何同时成为中转服务的引流入口。

· 提示词广告软件　· Codex 配置完整性　· 2026.11.04

当用户在 Codex 中输入一句普通的“hi”，期待得到的通常是一句问候，或“有什么可以帮你”的回复。但在 Check Point Research 分析的样本中，智能体却返回了一句固定口号，并顺手推广了一个第三方大模型中转站。

## 事件背景与定性

异常并不来自一次临时对话，而是来自已经被改写的全局指令文件。只要这些指令仍会被后续会话加载，广告逻辑就可能反复出现。

2026 年 11 月 3 日，Check Point Research 发布对“海鸥”（Haiou）越狱捆绑包的分析，将其归类为 **提示词广告软件（Prompt Adware）**：它一方面通过角色扮演、拒绝抑制和情境重构等提示词技术削弱模型安全约束，另一方面把商业广告写入 Codex 的可信配置，让免费“增强包”同时成为中转服务的引流入口。

**需要首先划定结论边界：** Check Point Research 没有发现被推广网关本身存在恶意的证据，也没有发现捆绑包作者与网络犯罪存在直接关联。但研究人员确实在一名网络犯罪攻击者配置不当的服务器上发现了该捆绑包，这说明此类双用途工具已经进入真实攻击活动的工具体系。

01 事件速览：这不只是一份“越狱提示词”

本次分析对象为海鸥 Codex 捆绑包 **4.5.0**。它将多组模块化提示词与六个安全研究方向 Skills 打包分发，覆盖渗透测试、逆向工程、许可证破解、游戏安全与反作弊绕过等主题。

要判断这类样本的风险，首先需要回答三个问题。

它改变了什么？

不是模型权重，也不是上游模型服务，而是本地智能体在后续会话中读取的可信指令。其核心持久化载体是 Codex 全局配置中的 AGENTS.md，以及随包安装的提示词模块和 Skills。

它如何呈现广告？

00-identity.md 模块规定：当用户输入特定问候语或激活词时，智能体必须只返回一句固定文本，其中包含作者推广的中转站地址。广告的触发条件是自然语言，广告的执行者则是读取了被修改配置的模型。

它为什么值得威胁情报团队关注？

因为它把三类问题压缩到了同一个安装包中：

1.  **智能体配置完整性：全局提示词被写入额外指令，影响跨越单次对话。**
2.  **模型安全边界：越狱模块试图压制拒绝话术，并将攻击性安全任务重构为“专业”或“CTF”场景。**
3.  **第三方服务信任：广告引导用户接触一个不透明的 OpenAI 兼容 LLM 网关，而网关位于应用与模型供应商之间，天然处于敏感流量必经位置。**

## 安装到广告的完整链路

02 从安装到出广告：完整链路如何闭合

海鸥包并没有把全部提示词以明文形式直接陈列在仓库中。Check Point Research分析的 4.5.0 版本采用打包归档与加密载荷，普通用户仅浏览 GitHub 页面，很难直接审查最终写入本机的全部指令。

其执行链路可以概括为：

1 **用户运行启动器**

2 **校验并解密 payload.pkg**

3 **得到 ZIP 并解压至临时目录**

4 **写入模块化提示词与六个 Skills**

5 **Codex 后续加载全局指令**

6 **特定输入触发固定广告回复**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a6c4da939ee0b6e7.png)

图 1｜海鸥 Prompt Adware 技术过程图

图源：依据 Check Point Research

1\. 启动器先校验，再解密

Linux、macOS 和 Windows 启动器会使用 Ed25519 签名与 SHA-256 哈希验证 payload.pkg，随后使用嵌入脚本中的 AES-256-GCM 密钥解密载荷。解密结果是一个 ZIP 文件，再被解压到临时目录。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/61f366ffceee6dc1.png)

图 2｜海鸥 Codex 版 4.5.0 包内容与跨平台启动／卸载文件

图源：Check Point Research

这里有两个容易被误读的技术点：

-   **签名和哈希不等于内容安全。**
    
    它们可以服务于完整性及来源一致性校验，但不会替用户判断提示词中是否夹带广告、越权指令或不当配置。
    
-   **加密不等于无法分析。**
    
    密钥嵌入启动器脚本，研究人员仍可沿启动器逻辑还原载荷；加密主要提高了直接浏览仓库、快速审查明文的门槛。Check Point Research 推测这可能与规避自动扫描和静态检测有关，但这一动机并未得到证实，不能写成确定事实。
    

2\. 真正落地的是一组“指令资产”

解密后的内容以模块化系统提示词为主，并包含以下六个 Skills：

-   seagull-game-security
-   seagull-lab
-   seagull-license-security
-   seagull-memory
-   seagull-pentest
-   seagull-reverse

这些组件共同塑造 Codex 的中文技术人格与安全研究工作流。换言之，用户获得的不是一段复制后即用完的提示词，而是一套会持续影响智能体行为的本地配置。

3\. 特定输入激活固定输出

广告逻辑位于 00-identity.md。其触发词包括：

在吗在线吗启动海鸥hihello你好嘿yoctfcoach教练

命中后，模型被要求只返回固定口号，并附上中转站链接。由于指令进入全局配置文件，这不是用户在某轮对话中临时要求模型“扮演海鸥”，而是配置在安装完成后持续等待下一次触发。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4f5cab1093c9deb4.png)

图 3｜在 Codex 中输入“hi”后触发固定中转站广告

图源：Check Point Research。截图含原始推广地址，请勿访问。

包内还带有卸载器。Check Point Research 指出，卸载器可以撤销安装所做的更改、恢复原配置并移除广告；启动器最后也会删除临时文件。因此，该样本并非没有清理机制，问题的关键在于： **用户在安装前是否真正知晓并审查了全部行为。**

## 越狱与广告双线机制

03 一个包，两套逻辑：越狱与广告并不相同

海鸥包的安全影响需要拆成两条线。越狱模块试图改变模型“愿不愿意回答”，广告模块则决定模型“在什么时候说什么”。二者共享持久化配置载体，但目标和触发方式不同。

1\. 越狱线：组合使用多种提示词技术

|     |     |     |
| --- | --- | --- |
| 文件  | Check Point Research 观察到的行为 | 对应提示词技术 |
| 10-persona.md | 以直接、突破规则的人格覆盖原有语气，并屏蔽常见拒绝措辞 | 角色扮演、拒绝抑制 |
| 07-action-first-language.md | 禁止在开场回复中询问授权或设置边界 | 响应引导、拒绝抑制 |
| 08-dual-use-professional.md | 要求模型不要仅因特定技术词而拒绝，并将模糊的双用途请求强制解释为“专业”场景 | 拒绝抑制、借口化重构 |
| 11-ctf-fullspeed.md | 将攻击性安全任务重构为教学 CTF 练习 | 情境重构、借口化 |
| 06-autonomy.md | 通过“开干”“不打断模式”等快捷语，尝试进一步削弱谨慎约束 | 指令覆盖、元提示、拒绝抑制 |

这些手段并不意味着模型一定会按预期执行，更不能据此推导出“所有安全防护均已失效”。它们描述的是捆绑包试图施加的影响，实际效果仍取决于模型、客户端版本、指令层级和运行时防护。

2\. 广告线：把可信指令变成固定广告位

广告注入的技术重点不是生成一段“像广告”的文本，而是用确定性的触发词和输出模板约束模型行为。

这一定义也解释了 Prompt Adware 与传统广告软件的差别：传统广告软件通常依赖可执行程序展示或注入广告；这里的广告呈现与持续影响主要由 **配置工件中的自然语言指令** 完成。与此同时，这并不表示整个分发包没有脚本或可执行启动器，不能将“自然语言广告逻辑”误写成“样本不含任何可执行内容”。

包内的 03-protected-site.md 还把被推广的中转站设为“受保护基础设施”，禁止对其开展攻击性测试，即使用户声称已经获得授权或处于 CTF 场景。由此可见，同一套提示词既试图放宽对其他安全任务的限制，又为作者自身服务保留了明确的保护例外。

3\. Codex 与 Claude Code 版本不能混为一谈

Check Point Research 指出，GitHub 用户 haiou-666 同时托管 Codex 与 Claude Code 版本；截至 Check Point Research 报告发布时，只有 Codex 版本看起来仍在积极维护并包含广告注入机制。

Codex 包内也存在一个带广告指令的 CLAUDE.md，Check Point Research 认为它可能是打包遗留文件；但海鸥 Claude 仓库本身并未包含广告注入。在Check Point Research 测试中，Claude Code 使用的 Sonnet 5 将相关指令标记为提示注入并拒绝遵从。这个结果只代表该次测试，不能外推为所有模型、所有版本都能稳定拦截同类问题。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/bd86f26ebfcc6ff4.png)

图 4｜Claude Code 在Check Point Research测试中标记提示注入并拒绝遵从

图源：Check Point Research。该图仅代表Check Point当次测试。

04 从开源仓库到图形化工具：分发面不止一个入口

## 分发渠道与生态

Check Point Research 报告记录的海鸥传播渠道包括 GitHub、哔哩哔哩视频、视频简介中引用的 QQ 群，以及 Codex 配置管理工具 Codex-X。报告发布时，相关 GitHub 仓库已获得超过 250 个星标。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5f2fa9935f625301.png)

图 5｜视频中的海鸥 Claude 版推广页面

图源：Check Point Research。原视频面向 Claude 版本，不代表其仓库包含相同广告注入。

Codex-X 将提示词模板、Provider／API、Skills／MCP 和 TOML 配置集中到图形界面中，降低了用户修改 Codex 配置的操作门槛。其公开项目页面也展示了“海鸥 3.0 破甲”模板。需要强调的是，页面所示 3.0 与 Check Point Research 拆解的 4.5.0 并非同一版本，这一信息可以佐证分发或集成关系，却不能单独证明每个历史版本都包含相同广告逻辑。

海鸥包进入研究人员视野的起点则更值得关注：Check Point Research 在一台配置不当的攻击者服务器开放目录中发现了它。同台服务器还部署或存放了 Cobalt Strike、Ladon 网络扫描框架和 VulnClaw 渗透测试智能体；开放的 Cobalt Strike 服务日志显示，该攻击者曾入侵多名中文用户的私人计算机。

对这一发现，准确的情报表述应是：

-   它证明海鸥包已经出现在真实网络犯罪活动所使用的工具集合中；
    
-   它说明此类越狱与技能组合具有明显双用途属性；
    
-   它 **不能证明** 海鸥包由该攻击者开发，也 **不能证明** 作者参与了相关入侵。
    

05 为什么还要单独审视“中转站”

海鸥广告所推广的是一个不透明的 OpenAI 兼容 LLM 网关。此类网关位于应用与模型供应商之间，接收客户端请求，再向上游模型服务转发，并把响应带回客户端。

对于普通聊天应用，这意味着提示词、上下文和模型输出会经过中间方；对于能够调用工具的智能体，经过中间方的还可能是工具定义、工具参数、环境信息以及返回的工具调用。如果客户端使用第三方网关凭据或经网关转发上游密钥，凭据暴露面也需要纳入评估。

论文《Your Agent Is Mine: Measuring Malicious Intermediary Attacks on the LLM Supply Chain》对这类风险进行了测量。研究覆盖 **28 个付费路由和 400 个免费路由**，发现其中 **1 个付费路由和 8 个免费路由** 会主动向返回的工具调用注入恶意代码， **2 个路由** 采用自适应触发条件， **17 个路由** 存在使用研究者投放的 AWS 诱饵凭据的行为，另有 **1 个路由** 转走了研究者控制的测试地址中的 ETH。

这些数字揭示了不透明中间路由可能带来的供应链风险，但 **不能被移植为对海鸥所推广网关的指控**。Check Point Research 明确表示，没有迹象表明该网关本身存在恶意。对本文事件而言，可靠的判断是：捆绑包确实在为该服务做广告；该服务是否需要进一步安全评估，应依据独立测试和可验证证据，而不是依据它出现在广告中这一点直接定性。

还要区分两种不同攻击位置：海鸥的广告注入发生在 **本地可信提示词与配置层**；上述路由研究关注的是 **请求／响应经过中间网关时的读取或篡改**。二者可以分别存在，不能拼接成一条已被证实的攻击链。

06 防御排查：先看配置，再看输出，最后看网关

## 防御排查步骤

1\. 审查全局指令与安装痕迹

Codex 默认从 ~/.codex/AGENTS.md 读取全局指令；如果存在 AGENTS.override.md，则优先读取该文件。设置了 CODEX_HOME 的环境还应检查对应自定义目录。

建议将当前文件与已知良好备份进行差异比对，重点检索：

-   中转站域名及固定广告口号；
    
-   00-identity.md
    
    、03-protected-site.md 等模块名；
    
-   六个 seagull-\* Skills 名称；
    
-   与“精确问候语”“只返回固定文本”相关的异常指令；
    
-   未经解释的加密 payload.pkg、临时解密目录或来源不明的安装启动器。
    

单独出现“hi”“hello”“教练”等常见词没有检测价值，必须结合固定输出、域名或文件上下文判断。

2\. 用行为验证辅助定位

在隔离测试环境中新建 Codex 会话，输入 Check Point Research 列出的精确触发词，观察是否只返回海鸥口号和中转站广告。行为复现可以辅助确认影响，但不能替代文件取证：未触发可能与版本差异、配置未加载、覆盖文件优先级或模型防护有关。

3\. 恢复配置，而不是盲目再次执行未知脚本

发现异常后，应优先从可信备份恢复全局指令，删除经确认属于该包的模块和 Skills，并复核项目级指令是否也被修改。Check Point Research 报告虽然确认样本带有卸载器，但是否运行第三方卸载脚本仍应先审查其内容；不要为了“清理”而在生产环境再次盲目执行未知代码。

4\. 把第三方网关纳入数据流与凭据审查

如果用户曾把敏感代码、内部文档、生产凭据或工具输出交由未经验证的网关处理，应依据实际数据流评估暴露范围，必要时轮换相关凭据。企业可通过批准的模型服务清单、出口访问控制、网关日志和工具调用审计，降低不透明中转服务带来的不可见性。

对 zz\[.\]aiapi2025\[.\]top 这类本次事件中的域名，适合用于排查和关联分析；是否采取访问限制，可依据组织的未批准服务管理策略决定，但不应在缺乏独立证据时将其直接标记为已确认恶意基础设施。

07 结语：智能体的“启动项”，可能只是一段自然语言

海鸥包展示的关键变化，不是广告文案藏得有多深，而是 **持久化影响智能体行为，未必需要传统意义上的常驻恶意程序**。只要全局提示词、Skills 或其他可信配置持续被加载，一段自然语言就可能长期参与后续每一次决策与输出。

因此，对智能体增强包的安全审查不能只问“有没有恶意二进制”，还应追问：它写入了哪些指令？这些指令在何时加载？是否存在隐藏触发条件？它把用户导向了哪些第三方服务？配置能否完整审计和恢复？

在智能体生态中，提示词已经不只是输入内容，也正在成为需要版本管理、完整性校验和变更审计的配置资产。

08 技术附录

## ATT&CK技术映射

附录 A：MITRE ATT&CK 技术映射

以下映射用于描述可观察的主机侧与数据侧行为。Prompt Adware 的核心效果发生在 AI 指令层，传统 ATT&CK 无法完整表达，因此部分条目属于近似映射，不应被解读为样本同时具备传统恶意软件的全部能力。

|     |     |     |     |
| --- | --- | --- | --- |
| ATT&CK ID | 技术名称 | 本案对应行为 | 映射说明 |
| T1204.002 | User Execution: Malicious File | 用户获取并运行跨平台启动器，随后完成解密、解压和配置写入 | 描述用户主动执行这一前置条件；不代表所有分发渠道都具有欺骗性 |
| T1027.013 | Obfuscated Files or Information: Encrypted/Encoded File | payload.pkg<br><br>以加密形式分发，AES-256-GCM 密钥嵌入启动器脚本 | 描述加密封装这一可观察事实；主观规避检测的意图在Check Point Research 中仅为推测 |
| T1140 | Deobfuscate/Decode Files or Information | 启动器解密载荷，得到 ZIP 并解压至临时目录 | 描述载荷还原过程，不代表解密得到的是传统可执行恶意载荷 |
| T1565.001 | Data Manipulation: Stored Data Manipulation | 修改 Codex 全局指令等本地配置，使后续输出受到持续影响 | 用于表达存储数据遭篡改及其对后续过程的影响；AI 语义层持久化见 ATLAS 映射 |

**不宜强行映射的方向：** Check Point Research 报告没有证明该样本建立 C2、窃取凭据、执行传统恶意二进制持久化，或利用上游模型服务漏洞，因此不应据此添加 Command and Control、Credential Access 或 Exploitation for Client Execution 等技术标签。

附录 B：MITRE ATLAS 技术映射

|     |     |     |
| --- | --- | --- |
| ATLAS ID | 技术名称 | 本案对应行为 |
| AML.T0081 | Modify AI Agent Configuration | 修改 Codex 全局指令与相关配置，使更改在单次会话之外持续生效 |
| AML.T0080 | AI Agent Context Poisoning | 将额外行为规则写入智能体后续依赖的可信上下文来源，影响其后续输出 |
| AML.T0051.002 | LLM Prompt Injection: Triggered | 预置广告指令由特定问候语或激活词触发，并返回固定文本 |
| AML.T0054 | LLM Jailbreak | 通过角色扮演、拒绝抑制、情境重构和指令覆盖等方式，尝试绕过模型既有约束 |

其中，AML.T0081 最直接对应“修改智能体配置”这一核心行为；AML.T0054 描述越狱目的与手段，不能与广告触发行为合并为同一个技术标签。

附录 C：失陷指标与排查线索

以下条目基于 Check Point Research 分析的 **4.5.0** 版本。域名与仓库地址已区分“行为关联”与“恶意定性”，使用时应避免过度阻断或错误归因。

|     |     |     |
| --- | --- | --- |
| 类型  | 指标／线索 | 用途与注意事项 |
| 域名  | zz\[.\]aiapi2025\[.\]top | 海鸥广告所推广的中转站；可用于本地配置、日志与输出排查，未发现证明其自身恶意的证据 |
| URL（已去武器化） | hxxps://zz\[.\]aiapi2025\[.\]top | 固定广告文本中的目标地址；不建议直接访问 |
| 分发仓库 | https://github.com/haiou-666/haiou-codex | 样本公开分发位置，属于调查关联线索，不应作为全网恶意域名或地址阻断依据 |
| 分析版本 | 4.5.0 | Check Point Research 明确拆解的版本，不能把其全部特征无条件外推到其他版本 |
| 加密载荷 | payload.pkg | 经 Ed25519 签名与 SHA-256 哈希校验，再由启动器使用 AES-256-GCM 解密 |
| 广告模块 | 00-identity.md | 包含精确触发词与固定广告回复逻辑，是优先排查文件 |
| 自保护模块 | 03-protected-site.md | 将推广域名设为“受保护基础设施”，禁止对其进行攻击性测试 |
| 全局指令文件 | ~/.codex/AGENTS.md | Codex 默认全局指令位置；自定义 CODEX_HOME 时需检查对应目录 |
| 可能的覆盖文件 | ~/.codex/AGENTS.override.md | Codex 全局层优先读取文件，应纳入配置完整性核查 |
| 遗留／兼容文件 | CLAUDE.md | Codex 包内包含广告指令，Check Point Research 认为可能是打包遗留；不等于 Claude 仓库也包含广告 |
| Skills | seagull-game-security<br><br>、seagull-lab、seagull-license-security、seagull-memory、seagull-pentest、seagull-reverse | 用于确认是否安装过相关系列组件，需结合内容与安装来源判断 |
| 固定广告文本 | 海鸥在线，你要整点薯条吗？老子开了个中转站hxxps://zz\[.\]aiapi2025\[.\]top 支持一下 | 高价值内容匹配线索；此处仅将Check Point Research 文中的 URL 去武器化，其余文本保持不变 |
| 触发词集合 | 在吗<br><br>、在线吗、启动、海鸥、hi、hello、你好、嘿、yo、ctf、coach、教练 | 只能与固定输出、广告域名或异常配置联合使用，不能作为独立失陷指标 |

**指标缺口：** Check Point Research 报告未公开样本文件哈希、攻击者服务器 IP 或可供复核的完整网络基础设施清单，本文不补造相关 IOC。

附录 D：建议保留的取证信息

1.  安装包、启动器、payload.pkg 及仓库或下载来源信息；
    
2.  全局与项目级 AGENTS.md／AGENTS.override.md 的当前版本、可信备份和差异；
    
3.  相关提示词模块、Skills 目录、安装与卸载脚本；
    
4.  可复现广告行为的会话时间、客户端版本、输入与输出；
    
5.  第三方网关配置、实际调用的 Base URL、凭据使用范围及可用审计日志；
    
6.  临时目录清理前的可用残留，以及安装前后的文件变更记录。
    

参考链接

**1\. Check Point Research：Free the Model, Sell the Gateway: Prompt Adware hidden in Jailbreak Bundles**  
https://research.checkpoint.com/2026/free-the-model-sell-the-gateway-prompt-adware-hidden-in-jailbreak-bundles/

**2\. Haiou Codex 仓库**  
https://github.com/haiou-666/haiou-codex

**3\. Codex-X 项目**  
https://github.com/yynxxxxx/Codex-X

**4\. Your Agent Is Mine: Measuring Malicious Intermediary Attacks on the LLM Supply Chain**  
https://arxiv.org/html/2604.08407v1

**5\. HiddenLayer Adversarial Prompt Engineering（APE）Taxonomy**  
https://ape.hiddenlayer.com/about.html

**6\. OpenAI Codex：Custom instructions with AGENTS.md**  
https://developers.openai.com/codex/guides/agents-md

**7\. MITRE ATT&CK T1204.002：User Execution: Malicious File**  
https://attack.mitre.org/techniques/T1204/002/

**8\. MITRE ATT&CK T1027.013：Obfuscated Files or Information: Encrypted/Encoded File**  
https://attack.mitre.org/techniques/T1027/013/

**9\. MITRE ATT&CK T1140：Deobfuscate/Decode Files or Information**  
https://attack.mitre.org/techniques/T1140/

**10\. MITRE ATT&CK T1565.001：Data Manipulation: Stored Data Manipulation**  
https://attack.mitre.org/techniques/T1565/001/

**11\. MITRE ATLAS 官方知识库（本文涉及 AML.T0051、AML.T0051.002、AML.T0054、AML.T0080、AML.T0081）**  
https://atlas.mitre.org/

**12\. MITRE ATLAS 官方数据仓库**  
https://github.com/mitre-atlas/atlas-data

安全事件分析研判 · 目录
