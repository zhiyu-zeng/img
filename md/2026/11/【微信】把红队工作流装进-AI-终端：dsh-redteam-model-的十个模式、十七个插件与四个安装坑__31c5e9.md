---
title: 【微信】把红队工作流装进 AI 终端：dsh-redteam-model 的十个模式、十七个插件与四个安装坑
source: https://mp.weixin.qq.com/s/oZfNk0L-UGD0Bqql1-NMQg
source_host: mp.weixin.qq.com
clip_date: 2026-11-08T06:19:06+08:00
trace_id: b0a7c7c1-bb24-4172-881e-bd17e71da788
content_hash: e4fb50f86be87121dced780b734baca5863e08d6aef666cb93689fba39fb127d
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 5
  succeeded: 5
  failed_urls: []
notion_page_id: 41175244-d011-8105-9d95-fd2407477e5f
ioc: null
---

**赛博57库** *2026年11月8日 05:00*

![cover](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3830fd23f606ebe1.jpg)

AI 安全 / 攻防技术

## 把红队工作流装进 AI 终端：dsh-redteam-model 的十个模式、十七个插件与四个安装坑

DSH 插件 · 十模式预设 · 三层门禁 · 本地安装实测 · 数据落盘边界

AI 终端里最不缺的是知识。你给它一份 playbook，它能背下来；你问它某个战术，它也能答。但真让它从头到尾完成一次授权评估，问题往往不在“知不知道”，而在“有没有人盯着它按步骤走”：阶段有没有漏、证据有没有落、报告有没有过门、上下文有没有被长对话冲掉。

GitHub 上的 `SeaOf0/dsh-redteam-model` 想解决的正是这件事。它把十个红队工作模式、十七个运行时插件和一套门禁/留痕机制，装进 DeepSeek Harness（DSH）的 preset 体系里。作者在 README 里写得很直白：不是再给模型灌 knowledge，而是把自身经验写成 workflow，让模型按 workflow 完成任务。

我在一个隔离的 `DSH_HOME` 里把它装了一遍，没有碰正在用的 3080 实例。结论先说： **它能装、能跑，十个模式全部挂载，十七个插件全部就位，十六个测试套件一千零六十三项断言通过；但它不是一个安全沙箱，安装过程也有四个会直接绊人的坑。**

边界：本文没有接触任何真实目标，也没有登录模型做端到端对话。安装、校验和测试都在本机回环环境完成；截图来自本地隔离实例。代码与数字对应 `dsh-redteam-model` v1.1.2（commit `ce24bb2` ，2026-10-27）与 DSH `0.2.1-rc.5` 。

## 01 · 为什么不是再灌一套 prompt

DSH 的扩展模型是“profile → bundle → preset → agent loop”。一个 preset 可以自带 persona、工具组合、技能和提示词；插件则挂在宿主平面，能注册工具、监听事件、拦截调用。换句话说， **模式决定“你是谁、能用什么”，插件决定“谁能拦你、谁在记账”。**

这正好对上红队工作流的两层需求：

• 方法论要能随模式切换：渗透、代码审计、二进制、应急、云、CTF 的步骤不一样，不能共用一份大 prompt；

• 治理要独立于模型自觉：门禁如果只写在 prompt 里，模型可以自称“已通过”；留痕如果靠模型主动写，漏写的概率和它想不想写有关。

`dsh-redteam-model` 的答案是把这两层拆开：十个 preset 负责方法论，十七个插件负责运行时治理。前者是文本资产，后者是代码。

## 02 · 它装了什么：十个模式、十七个插件

十个模式的分工很清晰：

|     |     |
| --- | --- |
| 模式  | 定位  |
| `redteam` | 安全领域总入口，负责任务路由、多任务协同与全局总结 |
| `pentest` | Web/API/客户端黑盒渗透，从资产基线到覆盖度报告 |
| `code-audit` | 白盒源码审计，面映射、双链、覆盖与对账 |
| `binary-analysis` | 病毒分析、逆向、脱壳、固件与硬件 |
| `attack-defense` | 外网打点、内网横向、持久化与防御验证 |
| `av-evasion` | 载荷免杀与过检测，技术与检测侧成对交付 |
| `incident-response` | 失陷排查、攻击链还原、处置与加固 |
| `cloud-security` | 云平台与云原生渗透，暴露面与攻击路径 |
| `ctf-solver` | 题面登记、模块路由、解题循环、flag 台账 |
| `asset-mapping` | 多平台资产测绘、子域/DNS、备案归属、指纹清册 |

每个模式自带四层资产： `persona` （角色与边界）、 `playbook` （方法论与门禁）、 `skills` （可加载技能）、 `refs/` （知识库索引）。仓库里 `modes/` 有 28MB，大部分是 refs 的原文；运行时只注入指针，不把整库塞进上下文。

十七个插件按职责分四组：

|     |     |     |
| --- | --- | --- |
| 组   | 插件  | 作用  |
| 治理  | `dsh-route-boost`<br><br>、 `dsh-stage-gate` 、 `dsh-sec-enforce` 、 `dsh-refusal-guard` 、 `dsh-trace-vault` 、 `dsh-auto-advance` | 逐轮信封、结构门、确定性拦截、拒答修复、过程留痕、自动推进 |
| 工作台 | `dsh-attack-atlas`<br><br>、 `dsh-session-pulse` 、 `dsh-mcp-studio` 、 `dsh-product-subagents` 、 `dsh-hunter` 、 `dsh-scanner-tools` 、 `dsh-semgrep-audit` 、 `dsh-webshell-mgr` | 攻击面图谱、会话面板、MCP 接入、外部 CLI 复核、资产狩猎、扫描器封装、semgrep、webshell 管理 |
| 记忆/成果 | `dsh-campaign-memory`<br><br>、 `dsh-redteam-results` | 跨会话打法沉淀、任务台账与成果页 |
| 界面  | `dsh-mode-group` | 把九个专业模式折叠进“专业安全模式”子菜单 |

还有一个设置页里的 `Redteam Manager` ，负责部署模式、安装/更新/卸载插件、看操作记录。它本身也是根 bundle 的一部分。

![三层结构：预设负责方法论，宿主插件负责治理，工作区与本地库承接证据](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4a5617709c5ab917.jpg)

三层结构：预设负责方法论，宿主插件负责治理，工作区与本地库承接证据

▲ 图 1：左边决定“怎么干”，中间决定“谁能拦、谁留痕”，右边决定“干完留下什么”

## 03 · 本地安装：10/10 与 17/18

安装环境是 DSH `0.2.1-rc.5` 、Node `22.20.0` 。我没有往默认的 `~/.dsh` 里装，而是把 `DSH_HOME` 指到工作区下的临时目录，另起一个 3099 端口：

export DSH_HOME=$PWD/.lab/dsh-home

cd research/dsh-redteam-model/deploy

node deploy.mjs

`deploy.mjs` 做了五件事：把 `modes/` 链到 `$DSH_HOME/.agent-presets` ；把根 bundle 和十七个插件写进当前 profile 的 `dependencies` 与 `dsh.profile.bundles` ；用 pnpm 装运行时桥包；把 `AGENTS.security.md` 落到 `$DSH_HOME` ；最后打印完成。它会在改 profile 前备份 `package.json` 和 lockfile，卸载时只移除自己登记的条目，这部分写得比较克制。

装完后跑离线校验：

node deploy.mjs --check

结果是 **40 个 OK、4 个 WARN**。十个 preset 全部通过真实 loader 挂载，十七个插件也逐行走了一遍加载路径；四条 WARN 是 normaliser 对四个预设“没有改动”，不影响挂载。

![本地 deploy --check：10 个预设 + 17 个插件通过真实 loader](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5693b76ad92a23a4.jpg)

本地 deploy --check：10 个预设 + 17 个插件通过真实 loader

▲ 图 2：本地隔离实例的校验输出；40 OK / 4 WARN，WARN 不是失败

打开 3099 端口的 Web UI，设置页里能看到“红队模型管理”：

• 模式就绪 **10/10**；

• 插件已装 **17/18**；

• 可更新 0，运行中 0；

• 总体状态“需要关注”，运行时插件一栏标了 1。

这个 **17/18** 不是少装了一个插件。十七个插件全部是 `installed` ，第十八项是 `plugins/.runtime` ——deploy 为了放 `dsh-tools` 建的运行时目录，被管理器的 `scanPlugins` 当成了一个插件。它没有 `package.json` ，于是显示 `not-installed` ，把总数从 17 抬到 18，还顺手把状态染成“需要关注”。

![红队模型管理台：10/10 模式，17/18 插件；第 18 个是 .runtime](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/298c68e391f715c3.jpg)

红队模型管理台：10/10 模式，17/18 插件；第 18 个是.runtime

▲ 图 3：本地管理台。17/18 的“1”不是缺插件，是 `.runtime` 被误计

Agent 预设页能看到十个自定义模式，和四个内置模式分开列：

![Agent 预设页：十个自定义红队模式](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a4759c99511880a0.jpg)

Agent 预设页：十个自定义红队模式

▲ 图 4：十个自定义模式全部出现在预设页；截图只保留内容区，避免暴露本机路径

插件测试是另一组证据。仓库给十六个插件带了离线测试套件，合计 **1,063 项断言**：

dsh-attack-atlas 103

dsh-route-boost 215

dsh-sec-enforce 121

dsh-stage-gate 115

dsh-campaign-memory 88

dsh-scanner-tools 57

dsh-refusal-guard 56

dsh-trace-vault 56

dsh-redteam-results 58

dsh-auto-advance 41

dsh-product-subagents 41

dsh-session-pulse 33

dsh-hunter 31

dsh-webshell-mgr 25

dsh-semgrep-audit 20

dsh-mcp-studio 3

补齐运行时桥接后，十六个套件全部通过——这也是后面第四个坑的由来。这个数字不能证明插件在真实宿主里没有问题——它证明的是纯函数、状态机、命令构造、拦截判定这些可离线验证的部分是自洽的。对一个红队工作台来说，这已经比“README 说它能用”强很多。

## 04 · 真正有用的三件事

### 4.1 route-boost：每轮一张“作战信封”

`dsh-route-boost` 注册一个动态 system prompt 上下文节。每一步装配时，它读当前 preset、最新的人类用户输入，推断阶段，然后渲染一张不超过 1600 字符的信封：

\[route-boost\] mode=pentest phase=recon（推断）

gates: P1 资产基线 / P2 finding —— 结构校验调 stage_gate

review: 关键 finding 双签 = DSH 独立复核 + claude/codex 复核

boundary: 速率/资金红线/登记前置

evidence: partial（先补证据）

refs: refs/web/README.md

这套东西的价值不在“又加了一段 prompt”，而在 **变化才投递**：同一阶段不重复注入，阶段切换才重新锚定。长会话里，模型最容易丢的就是“现在走到哪、下一步该过哪道门”；信封把这两件事变成每轮可见的短状态，而不是让模型自己回忆。

### 4.2 stage-gate：三十二道结构门

`dsh-stage-gate` 把各模式的阶段门做成工具： `stage_gate(mode, stage, workspace, file?)` 和 `gates_list` 。校验的是结构——文件在不在、非空、必需标记有没有、表格行是否完整、产物有没有 64 位哈希。判定追加到 `<workspace>/gate-log.md` 。

它明确区分“机器判定”和“人工判定”：结构通过只代表材料齐了，语义上的调用链是否成立、覆盖度是否真实，仍由复核员看。这个边界写得很清楚，也是它比“让模型自评”可靠的地方。

### 4.3 sec-enforce：四条纪律与一个熔断

`dsh-sec-enforce` 用 DSH 的工具 guard 缝做确定性拦截，默认只对十个安全模式生效：

• **reportGate**：写 `reports/` 前， `gate-log.md` 里必须有本模式报告门的 PASS；

• **writeBoundary**： `write/edit` 限制在任务工作区（可配豁免目录）；

• **dangerousOps**：大范围 `rm` 、裸 `DROP` 、停机重启、资金类 POST 等先拦后问；

• **rateDiscipline**：裸全端口扫描、超速率 masscan、无速率 ffuf 直接拒绝并给修法；

• **killSwitch**： `touch ~/.dsh/sec-enforce/KILL` 可一键停掉所有工具执行。

还有一个 `askGate` ：账号/权限变更、防火墙规则、flood 类压测这类“可逆但侵入”的动作，走宿主原生审批，而不是硬拦。

这三件事合起来，才是这个项目真正的价值： **把“红队应该怎么干活”从一段容易漂移的 prompt，变成可检查的结构、可回读的日志和可复现的工具面。**

## 05 · 四个安装坑

这一节是实测里最值得写下来的部分。四个坑都不难修，但每一个都会让第一次安装的人以为“项目坏了”。

|     |     |     |
| --- | --- | --- |
| 现象  | 原因  | 修法  |
| 设置页没有“红队模型管理” | deploy 装的是 `dsh-settings@0.1.1-rc.2` ，DSH 0.2.1-rc.5 判定它不兼容，直接禁用 settings 行 | 在 profile 里升到 `@deepseek-ai/dsh-settings@0.2.1-rc.5` ，重启 web |
| 管理台显示 17/18、状态“需要关注” | `plugins/.runtime`<br><br>被 `scanPlugins` 当成第十八个插件 | 管理器过滤点目录，或把 `.runtime` 移出扫描面 |
| 新环境 `--check` 直接报找不到 `@deepseek-ai/cordis` | `verify-deployment.mjs`<br><br>假设运行时在 `profiles/node_modules` ，deploy 实际装到 `profiles/web/node_modules` | 补一条 `profiles/node_modules` 桥接，或修校验脚本的路径 |
| 插件测试报 `ERR_MODULE_NOT_FOUND` 或 `CallId` 导出不存在 | `plugins/node_modules/@deepseek-ai/dsh-tools`<br><br>指向不存在的 `profiles/web/...`；且树内 `dsh-tools@0.1.0-rc.7` 与 0.2.x 的 `dsh-llm` 导出不匹配 | 指到 `plugins/.runtime` 的 dsh-tools，并补同代运行时 |

第一个坑最影响体验。README 的验证口径停在 0.1.x（“验证于 0.1.1-rc.2”），而 0.2.1 宿主对 `dsh-settings` 的 peer 要求已经变了。deploy 里写的版本范围 `^0.1.0-rc.6 || ^0.1.1-rc.0` 会解析到 0.1.1-rc.2，于是设置页整行被宿主禁用，管理台入口直接消失。手动升级后，管理台立刻出现，功能正常。

第二个坑是“自己人打自己人”：deploy 为了桥接 `dsh-tools` 建了 `plugins/.runtime` ，管理器的目录扫描又没有排除点目录，于是安装脚本越负责，管理台越显示“缺一个”。仓库自带的 manager 测试也栽在这里——干净 checkout 跑 `npm test` 是 17，deploy 之后再跑就变成 18!==17。

第三、第四个坑都跟“运行时桥”有关。DSH 0.2 之后，宿主不再自动铺 `profiles/node_modules` ，deploy 把桥包装进了 `profiles/web/node_modules` ，但校验脚本还在找旧路径；同时 `plugins/node_modules/@deepseek-ai/dsh-tools` 的软链指向 `profiles/web` 下并不存在的 dsh-tools，真实安装位置是 `plugins/.runtime` 。把这两处对齐，测试才能全绿。

另外还有文档漂移：README 说十个模式， `package.json` 的描述写“nine presets”，deploy 注释里写“十五插件”，实际是十七个。数字对不上不影响运行，但会影响第一次评估的人判断交付范围。

## 06 · 门禁的边界：它是检查清单，不是沙箱

装完之后最容易产生的误解，是把“有门禁”当成“有安全边界”。这两件事在这个项目里不是一回事。

**第一，门禁的信任根是一个模型可写的文件。** `sec-enforce` 的 reportGate 读的是 `<workspace>/gate-log.md` ，只要里面出现本模式报告门的 `pass` 行，就放行 `reports/` 写入。 `gate-log.md` 在任务工作区内，模型的 `write/edit` 本来就允许写工作区。也就是说， **模型如果能写文件，就能写出一条“已通过”的记录**；插件没有对 gate-log 做签名或只追加保护。这不是说模型一定会这么干，而是说这条链路的强度取决于“模型不伪造”，而不是密码学。

**第二，写边界只管 `write/edit` 。** `writeBoundary` 检查的是工具名和路径，bash 不在其内； `bash` 只受 dangerousOps 的少量高危特征约束。模型完全可以用重定向、 `tee` 、脚本落盘等方式绕过“工作区内写”的限制。路径判断用的是 `path.resolve` ，也没有对工作区内的符号链接做 `realpath` 校验。真正的边界仍然是 DSH 的 sandbox 和 approval，插件只是加了一层“显而易见的动作会被看见”。

**第三，反拒绝层是产品设计，不是安全控制。** `AGENTS.security.md` 把平台注入的内容政策提醒称为“机器噪声”，要求模型不采纳其框架、不重启合规评估； `dsh-refusal-guard` 则用关键词检测拒答/说教，命中后按“提醒 → 纠偏+自动重试 → 落审计”三级修复。对授权红队来说，这是为了减少“模型明明能做却开始说教”的摩擦；但它同时意味着， **模型在安全模式里的行为上限由 preset 和插件共同决定，而不是由宿主的安全策略单独决定**。这是双用途能力，文章只讨论机制和风险，不展开成绕过教程。

**第四，数据落盘比想象中更“原样”。**

• `dsh-hunter` 的注释写“只存密文值”，代码实际把 FOFA/Hunter/Quake 的 API Key 明文写进 `~/.dsh/hunter/hunter.db` ， `getKey` 直接读出来用；

• `dsh-trace-vault` 明确“本地库不做脱敏”，工具调用的参数和结果按 8K/32K 截断后入库；

• `dsh-campaign-memory` 明确“凭据/密钥也原样存储”，内网地址、指纹、打法都进 SQLite；

• `dsh-webshell-mgr` 的连接口令、密钥、数据库密码同样是明文 SQLite，代码注释自己承认“不采用加密落盘”。

这些库都在 `~/.dsh` 下，目录权限通常是 700，单机风险可控；但一旦你把工作区共享、把 `~/.dsh` 备份到网盘、或者让多个本地用户共用一台跳板机，这些“原样”就会变成实打实的凭据泄露面。

**第五，爆炸半径不小。** `dsh-webshell-mgr` 能生成并连接真实 webshell； `dsh-scanner-tools` 封装 nuclei/nmap/ffuf 等十三种工具； `dsh-hunter` 会把查询发到三个外部资产平台； `dsh-mcp-studio` 能拉起任意 MCP 命令； `dsh-product-subagents` 会无头调用本机 `claude` / `codex` ； `deploy/assets` 里还带了一个 171 个 Python 文件的 Kali MCP server，默认走 stdio/127.0.0.1，但一旦改成 SSE 并对外放行，就是一条命令执行面。这些对一个红队工作台来说是合理能力，但它们也意味着： **不要把它装进你的日常主力 profile，更不要在有真实凭据的环境里随手点“安装全部”。**

## 07 · 蓝队能看什么，红队该清什么痕迹

这套东西虽然跑在 AI 终端里，落在地上的痕迹却很传统。

|     |     |     |
| --- | --- | --- |
| 痕迹  | 位置  | 说明  |
| 模式目录链接 | `~/.dsh/.agent-presets`<br><br>→ `modes/` | 十个模式目录，名字很显眼 |
| profile 依赖 | `profiles/web/package.json` | 十七个 `link:` 依赖 + `dsh.profile.bundles` |
| 安全规范 | `~/.dsh/AGENTS.security.md` | 只对十个安全模式注入 |
| 门禁/拦截/拒答日志 | 任务工作区的 `gate-log.md` 、 `enforce-log.md` 、 `refusal-audit.md` | 模型和插件都会写 |
| 成果/图谱库 | `~/.dsh/redteam-results/results.db`<br><br>、 `~/.dsh/attack-atlas/atlas.db` | SQLite，跨会话聚合 |
| 过程库 | `~/.dsh/trace-vault/traces.db` | 工具调用参数与结果 |
| 狩猎库 | `~/.dsh/hunter/hunter.db` | API Key、查询历史、授权白名单 |
| webshell 库 | `~/.dsh/webshell-mgr/webshell.db` | 连接、口令、操作台账 |
| 外部 CLI 过程流 | `~/.dsh/product-subagents/traces/*.ndjson` | claude 的 stream-json 全量落盘 |
| 出站请求 | `fofa.info`<br><br>、 `hunter.qianxin.com` 、 `quake.360.net` | 只有配了 key 并主动查询才会出现 |

对蓝队来说，最省成本的检测点不是“找某个 0day”，而是这几条：

1\. 对 `~/.dsh` 做文件完整性监控，尤其是 `.agent-presets` 、 `AGENTS.security.md` 和 `*.db` 的新增；

2\. 看进程树： `dsh` 下面挂 `nuclei` 、 `nmap` 、 `ffuf` 、 `semgrep` 、 `claude` 、 `codex` ，这个组合在普通办公终端上很少见；

3\. 看 DNS/HTTP：一次性出现对 FOFA/Hunter/Quake 的 API 请求，且源是个人终端，值得问一句；

4\. 看工作区： `gate-log.md` 、 `enforce-log.md` 、 `reports/` 这些文件名本身就是强特征；

5\. 看 `hunter.db` / `webshell.db` 的创建时间与权限——如果它们落在共享目录或被备份，优先按凭据泄露处理。

对红队来说，OPSEC 建议也很具体：给这套东西单独一个 `DSH_HOME` 和 profile，不要和日常会话混用；API Key 用独立的、限额的、可随时吊销的；项目结束删掉 `*.db` 、 `traces/` 和三个日志文件；不要把 webshell 口令、云密钥写进 `campaign-memory` ，哪怕它“方便下次复用”。

## 08 · 结论：它是工作流脚手架，不是安全边界

`dsh-redteam-model` 不是那种“装完就自动变强”的工具。它的价值在三个很朴素的地方：

• **把方法论变成结构**：十个模式、三十二道门、每轮一封短信封，让长任务不容易跑偏；

• **把证据变成默认动作**：门禁判定、拦截留痕、过程库、成果台账，都是“顺手就写了”的；

• **把工具面收进一个工作台**：扫描器、semgrep、hunter、webshell、MCP、外部 CLI 复核，不用来回切终端。

但它的边界也要说清楚： **门禁是检查清单，不是沙箱；反拒绝是产品设计，不是安全控制；本地库不脱敏，凭据会原样落盘。** 这三句话决定了它适合“隔离环境里的授权工作台”，不适合“日常主力终端”。

如果你准备在团队里推，先做三件事：隔离 `DSH_HOME` 和 profile；给每个外部平台发独立 key；把 `gate-log.md` 当成“材料清单”，而不是“已验收”的签名。做到这三点，它是一套很省心的红队工作流脚手架；做不到，它只是把原来的风险搬进了 AI 终端。

本文的安装、校验与测试均在本地回环环境完成，未对任何真实资产发起请求。项目版本 v1.1.2（commit `ce24bb2` ），DSH 0.2.1-rc.5，Node 22.20.0。

技术内容仅供学习与研究，请勿用于非法用途。

赛博57库 · 2026-11-04
