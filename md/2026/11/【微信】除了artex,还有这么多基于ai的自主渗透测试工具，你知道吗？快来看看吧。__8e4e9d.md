---
title: 【微信】除了artex,还有这么多基于ai的自主渗透测试工具，你知道吗？快来看看吧。
source: https://mp.weixin.qq.com/s/VoRal0fIxQGKMuEU2mswVg
source_host: mp.weixin.qq.com
clip_date: 2026-11-10T19:48:15+08:00
trace_id: c4f11a4a-6586-46d7-bca1-55680ae291ad
content_hash: ca0be12bf36f156cc7d36c257beabd4a0bb6203cd0830f7226d9a747715775f1
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
notion_page_id: 41475244-d011-816a-8328-e5fc58d114b4
ioc: null
---

**小白安全成长记** *2026年11月10日 15:00*

## 超越 ARTEX：45 款自主式攻击框架、其搜寻目标与发现方法

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d6dd72508fceb7c7.png)

ARTEX基于ai的自主式渗透测试平台火了之后，越来越多的类似工具参与到了真实的攻击中，在一些态势感知的设备中也确实发现了一些蛛丝马迹，我也趁此机会在互联网上进行了一些收集，目前比较流行的就是我接下来要说的，包括如何通过互联网资产识别平台去主动发现它们，还有默认口令的，有新发现哦。这里我也引用了一些安全机构的调查结果，大家可以看看，对于想用此类工具的同学，也可以根据链接去尝试。但是请大家自觉遵守网路安全法。

目前大约 **45 个开源框架** 目前正被用于自动化攻击：每一个框架都将大语言模型（LLM）接入一个运行工具并根据其输出采取行动的循环中。我们对其中 32 个框架进行了编目，并将其归纳为 5 大系列，其余则是各种分支（Fork）和变体。

-   **只有 4 个框架内置了真正的凭据扫描器**，且没有一个内置完整的流水线：Pojun、Cybermes、Xalgorix 和 AIRecon 将扫描器接入了智能体，但其中没有一个包含 GitHub 数据抓取器（Fetcher）。不过，由于每个框架都为智能体提供了 Shell 终端和 Web 访问权限，大模型完全可以在运行时动态组装其余部分。
    
-   **数十个操作员控制台直接暴露在公网之上**：在针对 Shodan 进行指纹识别的 41 个框架中，有 11 个默认提供 Web UI。仅 ARTEX 系列在 2026 年 11 月 7 日就匹配到了 1,428 个服务。
    
-   **风险聚集在被广泛派生的基座项目中**：风险存在于少数被深度 Fork 的项目中，而不是 Star 数最多的仓库中。还有一些二开ARTEX的项目包含恶意代码。
    

## 一、 什么是ARTEX

**ARTEX** 是一个开源的自主式渗透测试平台。在其首个提交（Commit）之后的第 74 天（2026年10月8日），由于有报道称威胁行为者正利用它搜寻机密凭据并以此进行横向移动（Lateral Movement），其创建者将其进行了下架处理。此后成了企业版。

然而，下架并未阻止其扩散：仅在下架当周，就涌现出了 102 个 Fork 和以 ARTEX 命名的仓库。Google 威胁情报集团（GTIG）、微软、Wiz、CrowdStrike、Zscaler、Check Point、Censys 和 RST Cloud 都曾撰文探讨过 ARTEX 本身。接下来看下该领域的其他工具。

## 二、 这次调查的框架

每个框架都拥有公开的源码，并将模型接入一个运行工具并根据输出进行决策的循环中。我们将约 45 个框架中的 32 个归类为 **5 个系列**，其余约 13 个则是复用了某个系列模式的变体和 Fork：

1.  **网络杀伤链（Network Kill Chain）**：端到端的侦察（Recon）、漏洞利用（Exploitation）和后渗透（Post-exploitation），通常运行在 Kali 容器中。
    

-   PentAGI 运行带有 Nmap、Metasploit 和 sqlmap 的智能体团队。
    
-   RedAmon 构建攻击面图谱。
    
-   Xalgorix、Pentest-Swarm-AI、LuaN1aoAgent、AIRecon、redcell、PentestCode 和 cain-agent 共享该模式。
    
-   DarkMoon 拥有跨 Web、云、Active Directory 和 CI/CD 的 50 个专业智能体。
    

3.  **Web 应用与 API（Web-app and API）**：
    

-   Strix 自主测试 Web 应用。
    
-   Shannon 基于源码分析，更接近 SAST（静态代码分析）审查器而非实时杀伤链。
    
-   PentestGPT 是一个咨询辅助助手。
    
-   T3MP3ST、Apex、deadend-cli 和 PentesterFlow 也在其中。
    

5.  **C2 集成（C2-integrated）**：
    

-   Sage 和 echidna 在 Mythic C2 框架内部作为 LLM 操作员运行。
    
-   virga 在植入物内部嵌入本地模型。
    
-   Pojun 和 FORANG 是将 C2 控制台加载到基座上的 ARTEX 衍生版，故归入此类而非杀伤链系列；ycode 是第三个 ARTEX 衍生版；ScopeWeaver 则是一个支持英、韩双语本地化的 ARTEX Fork。
    

7.  **封装（Harnesses）**：
    

-   RAPTOR、CyberStrike、cyber-harness、Nebula 和 Cybermes 用攻击性技能包装了通用的编码智能体（Claude Code、Codex、Hermes）。插件包也为编码智能体做了同样的事情，我们将其作为一个整体进行追踪。
    

9.  **研究原型（Research prototypes）**：
    

-   Incalmo、hackingBuddyGPT、VulnBot、HackSynth、AutoPT 和 Ares 均源自学术研究。
    

另有三个工具出现在威胁情报报告中，值得纳入：

-   **Cairn**：在共享的事实图谱上协调工作智能体，默认无身份验证。
    
-   **HexStrike**：一个 MCP 服务器，向任何 MCP 客户端公开了 150 多个攻击性工具，默认无身份验证。
    
-   **Agent Zero**：一个通用智能体，同样默认无身份验证，曾被威胁行为者试用。
    
-   **CAI**：已于 2026 年 8 月 28 日归档。
    

最后无法纳入任何系列的 13 个框架，则是共享了某个系列模式的变体、Fork 和研究种子。

以下目录为每个工具提供了一行信息：代码位置、流行度与活跃度、针对凭据搜寻提供的功能，以及在 Shodan 上的可见度。Star 数和最后提交时间（Last push）来自 2026 年 11 月 7 日的 GitHub API。“未审查（Not reviewed）”表示该工具不在凭据搜寻短名单之内，因此未对其进行检查，这与“未发现（None found）”（即我们阅读了代码但未发现搜寻能力）不同。

### ▍工具总目录表

| **工具名称** | **仓库地址** | **系列分类** | **Star 数** | **最后提交** | **凭据搜寻情况** | **Shodan 暴露级别** |
| --- | --- | --- | --- | --- | --- | --- |
| Strix | `usestrix/strix` | Web/API | 74.2k | 2026-11-06 | 未发现 | 部分配置下有服务 |
| Shannon | `KeygraphHQ/shannon` | Web/API (SAST) | 51.4k | 2026-11-06 | 未发现 | 无监听端口 |
| PentAGI | `vxcontrol/pentagi` | Network | 33.6k | 2026-10-22 | 未发现 | 部分配置下有服务 |
| Agent Zero | `agent0ai/agent-zero` | General | 19.8k | 2026-11-05 | 未发现 | 默认提供 Web UI |
| PentestGPT | `GreyDGL/PentestGPT` | Web/API | 16.3k | 2026-07-14 | —   | 无监听端口 |
| HexStrike | `0x4m4/hexstrike-ai` | MCP server | 13.4k | 2026-08-03 | 未发现 | 部分配置下有服务 |
| CAI (已归档) | `aliasrobotics/cai` | Network | 9.8k | 2026-08-22 | 未发现 | 部分配置下有服务 |
| Cairn | `oritera/Cairn` | Harness/graph | 4.9k | 2026-09-07 | 未发现 | 默认提供 Web UI |
| RAPTOR | `gadievron/raptor` | Harness | 4.0k | 2026-11-07 | 未审查 | 无监听端口 |
| CyberStrike | `CyberStrikeus/CyberStrike` | Harness | 3.4k | 2026-11-07 | 未审查 | 部分配置下有服务 |
| RedAmon | `samugit83/redamon` | Network | 3.3k | 2026-11-05 | 未发现 | 默认提供 Web UI |
| PentestAgent | `GH05TCREW/pentestagent` | Network | 3.2k | 2026-11-02 | 仅文本提示 | 部分配置下有服务 |
| Pentest-Swarm-AI | `Armur-Ai/Pentest-Swarm-AI` | Network | 3.1k | 2026-11-03 | 未连线 | 默认提供 Web UI |
| sapper-v2 | `N1nEmAn/sapper-v2` | Network | 1.5k | 2026-11-07 | 未审查 | 部分配置下有服务 |
| LuaN1aoAgent | `SanMuzZzZz/LuaN1aoAgent` | Network | 1.5k | 2026-09-15 | 未审查 | 部分配置下有服务 |
| PentesterFlow | `PentesterFlow/agent` | Web/API | 1.4k | 2026-08-31 | 未审查 | 部分配置下有服务 |
| xalgorix | `xalgorix/xalgorix` | Network | 1.3k | 2026-11-07 | 已配备 | 默认提供 Web UI |
| DarkMoon | `ASCIT31/Dark-Moon` | Network | 1.2k | 2026-10-27 | 仅文本提示 | 无可用指纹 |
| AIRecon | `pikpikcu/airecon` | Network | 1.1k | 2026-10-27 | 已配备 | 无监听端口 |
| Cybermes | `Zyrexnn/Cybermes` | Harness | 1.0k | 2026-11-05 | 已配备 | 无监听端口 |
| cain-agent | —   | Network | 946 | 2026-10-14 | 未发现(未连线) | 无监听端口 |
| PentestCode | `s0ld13rr/pentestcode` | Network | 930 | 2026-11-05 | 仅文本提示 | 部分配置下有服务 |
| ScopeWeaver | `cskwork/scopeweaver` | Network (ARTEX类) | 918 | 2026-11-04 | 未审查 | 默认提供 Web UI |
| T3MP3ST | `elder-plinius/T3MP3ST` | Web/API | 7.0k | 2026-09-08 | 未审查 | 部分配置下有服务 |
| cyber-harness | `chainreactors/cyber-harness` | Harness | 384 | 2026-11-07 | 未发现 | 部分配置下有服务 |
| redcell | `martian56/redcell` | Network | 356 | 2026-10-06 | 未发现 | 默认提供 Web UI |
| deadend-cli | `straylabs-ai/deadend-cli` | Web/API | 324 | 2026-08-07 | 未审查 | 无监听端口 |
| Apex | —   | Web/API | 323 | 2026-11-06 | 未审查 | 无监听端口 |
| Incalmo | `cylabcyberautonomy/Incalmo` | Research | 148 | 2026-11-02 | 未发现 | 默认提供 Web UI |
| Pojun | `chu0119/Pojun` | C2 (ARTEX fork) | 84  | 2026-11-06 | 已配备 | 默认提供 Web UI |
| Sage | `MythicAgents/sage` | C2 (Mythic) | 35  | 2026-10-30 | 未发现 | 无监听端口 |
| virga | `r74tech/virga` | C2 (implant) | 8   | 2026-10-12 | 未发现 | 无可用指纹 |
| FORANG | `F0ran9/forang` | C2 (ARTEX fork) | 8   | 2026-11-07 | 未发现 | 默认提供 Web UI |
| echidna | `Echidna-Pentest/Echidna/` | C2 (Mythic) | 5   | 2026-08-25 | 未发现 | 无可用指纹 |
| Decepticon | `BitterSecurity/Decepticon` | Harness | —   | 2026-11-07 | 未连线 | 部分配置下有服务 |

## 三、 凭据搜寻能力的差异

对 24 款接受审查的 AI 渗透测试工具进行的凭据搜寻评级简述：

-   **已配备 (Provisioned)**：代码中指定了扫描器，智能体默认可达。
    
-   **仅文本提示 (Text only)**：包含提示词配方或技能说明，但无扫描器。
    
-   **未连线 (Unwired)**：代码存在，但无智能体调用它。
    
-   **未发现 (None found)**：经过审查，未发现相关内容。
    
-   **未审查 (Not reviewed)**：在短名单之外。
    

### ▍凭据搜寻短名单工具详情

| **工具名称** | **评级** | **具体搭载内容** |
| --- | --- | --- |
| **Pojun** | 已配备 | 自 2026-10-20 起在 Worker 提示词中指定了 `gitleaks` ；自 2026-11-05 起提供默认技能，将智能体引导至公共 GitHub 和目标组织。 |
| **Cybermes** | 已配备 | 自带 `secret_scan` 二进制文件（48 个正则模式）；包含 13 个 GitHub 代码搜索语法语料库；加载了 9 个只读凭据验证器（AWS、GitHub、Slack、OpenAI、Anthropic 等）作为默认技能。 |
| **Xalgorix** | 已配备 | 指定了 `gitleaks` 和 `trufflehog` ；默认的“full”检查清单指示智能体使用 GitHub 搜索和 gitleaks 来寻找暴露的机密和密钥。 |
| **AIRecon** | 已配备 | 在其 Kali 容器中内置 `gitleaks` 和 `trufflehog` ；带有带 dork 操作符的类型化网络搜索工具；提供带 `site:github.com` 机密 dorks 的默认关闭技能。 |
| **DarkMoon** | 仅文本提示 | 提供一个提示词配方，用于挖掘指定仓库历史记录以寻找密钥，并传递给其云智能体。 |
| **ycode** | 仅文本提示 | 包含 GitHub 泄露搜寻技能文本，未安装扫描器。 |
| **ijlalhaider313/ARTEX** | 仅文本提示 | 一个机密扫描配方，调用 `trufflehog` 、 `gitleaks` 和 `gh` ，均未安装。 |
| **PentestAgent** | 仅文本提示 | 仅有指引。 |
| **PentestCode** | 仅文本提示 | 二进制文件中包含侦察技能：针对 `org:target` 和 `target.com password` 进行 GitHub/GitLab 搜索，然后在找到的仓库上运行 trufflehog/gitleaks；未安装扫描器。 |
| **Decepticon** | 未连线 | 于 2026-10-09 合并了一个 GitHub-dork 生成器；在审查的提交或主分支中无智能体绑定它。 |
| **Pentest-Swarm-AI** | 未连线 | 包含一个带有 4 个机密 dorks 的 GitHub 代码搜索客户端，但没有任何代码调用它；trufflehog 和 gitleaks 已安装，但仅在操作员自己的仓库的 CI 自扫描演练手册中运行。 |
| **ARTEX v0.3.15** | 未发现 | 仅发布源码；其唯一的 GitHub API 调用是自更新程序。 |
| **cain-agent** | 未发现 | 66 个演练手册文件从未被加载器读取；有一个没有智能体调用的云库。 |
| **redcell** | 未发现 | 其 OSINT 提示词中包含通用的泄露收集；未点名 GitHub；未指定扫描器。 |
| **RedAmon, HexStrike, Sage 等** | 未发现 | —   |

**结论**：只有 4 款工具向智能体真正部署了扫描器：Pojun、Cybermes、Xalgorix 和 AIRecon。但它们都不包含 GitHub 抓取器。然而，目录中的几乎每个框架都为智能体提供了 Shell 和网络访问权限，因此 GitHub 搜索或扫描器下载只需一次临时工具调用即可完成。能力由模型和提示词提供，仓库本身并未打包这些。

## 四、 Shodan 互联网暴露面情况

Shodan 对服务进行索引，因此首要问题是框架是否暴露了可匹配的内容。我们根据代码对每个工具进行了分类。在约 45 个框架中，41 个进行了 Shodan 指纹评估：11 个默认在网络端口上托管 Web UI，18 个仅在某些配置下托管 UI 或在根目录下无明显特征，12 个完全没有监听端口。我们编写了 56 个指纹记录，每个具有独特 Web 界面的构建版本对应一个。

| **工具名称** | **暴露级别** | **纯计数服务数** | **主要端口** |
| --- | --- | --- | --- |
| PentAGI | 部分配置下有服务 | 419 (其中 233 个使用默认证书) | 8443, 8666, 8765 |
| Agent Zero | 默认提供 Web UI | 173 (134 个在登录页，39 个开放) | 5080, 50080 |
| ScopeWeaver | 默认提供 Web UI | 43  | 8787 |
| Cairn | 默认提供 Web UI | 41  | 8000 |
| RedAmon | 默认提供 Web UI | 27  | 3000, 443 |
| Xalgorix | 默认提供 Web UI | 6   | 9137 |
| Strix (结果查看器) | 部分配置下有服务 | 13  | 8080 |
| Pojun | 默认提供 Web UI | 11  | 8787 |
| Decepticon | 部分配置下有服务 | 4   | 3000 |
| LuaN1aoAgent | 部分配置下有服务 | 2   | 8787 |
| CyberStrike | 部分配置下有服务 | 2   | 8888 |
| T3MP3ST | 部分配置下有服务 | 1   | 3333 |
| Incalmo | 默认提供 Web UI | 1   | 8443 |

*图表注：截至 2026 年 11 月 7 日，按工具划分的纯计数 Shodan 服务统计（对数刻度），ARTEX 家族以 1,428 个居首。*

## 五、 核心启示

1.  **45 个框架，但风险集中在少数被广泛 Fork 的基座中**，而不是 Star 数最多的仓库中。
    
2.  **几乎没有工具自带凭据搜寻流水线，但这毫无安慰作用**。每个工具都赋予智能体 Shell 和网络访问权限，因此模型可以在运行时自行组装。GitHub 搜索、下载扫描器、将发现的密钥传递给下一个调用——所有这些都只需一个提示词，而仓库本身无需打包。
    
3.  **在我们扫描当天，数十个操作员控制台响应了 Shodan 查询**，且许多控制台毫无实际屏障。我们发布的是指纹描述而非目标列表，以便防守方能够首先找到他们自己暴露的实例。
    

## 六、 搜寻查询（Shodan 检索式汇总）

下表总结了用于匹配现存工具公网实例的 Shodan 查询语句：

| **工具名称** | **Shodan 查询语句 (Query)** | **匹配依据** | **数量** |
| --- | --- | --- | --- |
| PentAGI | `http.title:"PentAGI"` | 页面标题 | 521 |
| PentAGI | `http.favicon.hash:-1596753120` | 网页图标哈希 | 419 |
| PentAGI | `ssl.cert.issuer.cn:"PentAGI CA"` | TLS 证书 | 240 |
| Agent Zero | `http.title:"Agent Zero"` | 页面标题 | 173 |
| Agent Zero | `http.title:"Login - Agent Zero"` | 页面标题 | 134 |
| Agent Zero | `http.title:"Agent Zero" -http.title:"Login"` | 页面标题 | 39  |
| ScopeWeaver | `http.title:"ScopeWeaver"` | 页面标题 | 43  |
| ScopeWeaver | `http.html:"Console for an LLM-driven autonomous penetration testing system"` | 页面 HTML | 49  |
| RedAmon | `http.title:"RedAmon"` | 页面标题 | 29  |
| RedAmon | `http.favicon.hash:964522141` | 网页图标哈希 | 28  |
| RedAmon | `http.html:"Security reconnaissance and vulnerability assessment dashboard"` | 页面 HTML | 29  |
| Xalgorix | `http.title:"Xalgorix"` | 页面标题 | 12  |
| Xalgorix | `http.html:"xalgorix.theme"` | 页面 HTML | 9   |
| Xalgorix | `http.favicon.hash:248472114` | 网页图标哈希 | 7   |
| Strix | `http.title:"Strix Results"` | 页面标题 | 13  |
| Strix | `http.favicon.hash:-566184040` | 网页图标哈希 | 13  |
| Decepticon | `http.html:"Autonomous Red Team Platform"` | 页面 HTML | 10  |
| Decepticon | `http.title:"Decepticon"` | 页面标题 | 5   |
| Decepticon | `http.favicon.hash:-1814445533` | 网页图标哈希 | 4   |
| LuaN1aoAgent | http.title:"鸾鸟渗透智能体" | 页面标题 | 2   |
| LuaN1aoAgent | http.title:"鸾鸟Agent" | 页面标题 | 1   |
| CyberStrike | `http.title:"CyberStrike"` | 页面标题 | 19  |
| CyberStrike | `http.title:"CyberStrike" http.html:"favicon-v3.svg"` | 页面标题 + HTML | 2   |
| T3MP3ST | `http.html:"T3MP3ST"` | 页面 HTML | 2   |
| T3MP3ST | `http.title:"T3MP3ST"` | 页面标题 | 1   |
| Incalmo | `http.html:"Incalmo C2 Server API"` | 页面 HTML | 1   |
| redcell | `http.html:"rc-theme"` | 页面 HTML | 59  |
| redcell | `http.title:"REDCELL"` | 页面标题 | 6   |
| PentestCode | `http.favicon.hash:-196523122` | 网页图标哈希 | 167 |
| PentestCode | `http.title:"PentestCode"` | 页面标题 | 0   |
| Pentest-Swarm-AI | `http.html:"{\"error\":{\"code\":\"404\",\"message\":\"Cannot GET /\"}}"` | 页面 HTML | 310 |
| cyber-harness | `http.html:"cyber-theme"` | 页面 HTML | 75  |
| cyber-harness | `http.title:"Cyber" http.html:"cyber-theme"` | 页面标题 + HTML | 4   |
| ycode | http.title:"月落" | 页面标题 | 13  |
| virga | `http.html_hash:911008380` | 页面主体哈希 | 6   |
| Nebula | `http.title:"Nebula 3"` | 页面标题 | 0   |
| sapper-v2 | `http.title:"sapper — engagement graph"` | 页面标题 | 0   |
| FORANG | `http.title:"FORANG"` | 页面标题 | 0   |
| Mergen MCP | `http.title:"MERGEN — Arsenal"` | 页面标题 | 0   |
| AutoRedTeam | `ssl.cert.subject.cn:"AutoRedTeam C2"` | TLS 证书 | 0   |
| pentest-ai | `http.title:"pentest-ai · dashboard"` | 页面标题 | 0   |

## 七、 常见问题解答 (FAQ)

-   **什么是自主式 AI 渗透测试工具？**
    
    自主式 AI 渗透测试工具是将大语言模型接入一个运行工具并根据其输出采取行动的循环中的开源项目。目前大约有 45 种。GitGuardian 将其中 32 种编目为 5 大系列：网络杀伤链、Web 应用与 API、C2 集成、封装和研究原型。其余则是复用系列模式的 Fork 和变体。
    
-   **AI 渗透测试工具会在 GitHub 上搜寻机密吗？**
    
    AI 渗透测试工具很少在其自身代码中内置机密搜寻功能。有 4 款工具将真实扫描器接入了智能体：Pojun、Cybermes、Xalgorix 和 AIRecon。但它们都不包含 GitHub 抓取器。
    
-   **如果它们不自带机密搜寻流水线，为什么它们依然重要？**
    
    因为 AI 渗透测试工具为其智能体提供了 Shell 终端和网络访问权限，模型可以在运行时自行组装流水线。GitHub 搜索、下载扫描器、将发现的密钥传递给下一步，这一切都只需一个提示词，尽管仓库本身并未打包这些功能。
    
-   **有多少 ARTEX 控制台暴露在 Shodan 上？**
    
    截至 2026 年 11 月 7 日，ARTEX 控制台匹配到了 1,428 个纯计数 Shodan 服务，是目录中数量最多的工具；其次是 PentAGI（419 个）和 Agent Zero（173 个）。
    
-   **如何在 Shodan 上寻找暴露的 AI 渗透测试工具？**
    
    可以通过匹配页面标题、favicon 哈希、页面 HTML 或 TLS 证书的指纹来在 Shodan 上找到它们。在评估的 41 个框架中，11 个默认提供 Web UI，18 个仅在特定配置下提供或在根目录下无明显特征，12 个没有监听端口。GitGuardian 编写了 56 个指纹记录，每个具有独特 Web 界面的构建版本对应一个。
    
-   **暴露的 AI 渗透测试控制台受到保护吗？**
    
    通常没有保护。在扫描当天，数十个控制台响应了 Shodan 查询，许多控制台背后没有任何真正的屏障。在找到的 173 个 Agent Zero 服务中，134 个停留在登录页，39 个完全开放。
    

最后本文大量引用gitguardian安全团队的研究方法，在此特别感谢，另附引用文章链接，风险提示:采用任何安全工具前优先选择官网链接，然后在测试环境中进行测试，生产环境少用，容易删库跑路，别问我怎么知道的。
