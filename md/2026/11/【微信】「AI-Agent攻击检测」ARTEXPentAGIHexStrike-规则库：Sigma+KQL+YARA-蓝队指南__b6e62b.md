---
title: 【微信】「AI Agent攻击检测」ARTEX/PentAGI/HexStrike 规则库：Sigma+KQL+YARA 蓝队指南
source: https://mp.weixin.qq.com/s/PgwN0UbPh7ecSeFlDirq5A
source_host: mp.weixin.qq.com
clip_date: 2026-11-28T00:36:00+08:00
trace_id: a36f1703-4cb7-4a3b-a89a-be86e817b70f
content_hash: e53839043b64cecbda6b37ab21e099df94b4176ad01d6789c109cee72f2afedf
status: synced
tags:
  - 微信
  - AI辅助逆向
  - 安全工具
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: ThreatDefence 的 agentic-attack-detections 把 AI Agent 攻击拆成可观测行为并标注脆弱性，用于构建 Sigma/KQL/Suricata/YARA 检测而不是当扫描器。
ai_summary_style: key-points
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 42575244-d011-814d-942e-fcc1622e982d
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> ThreatDefence 的 agentic-attack-detections 把 AI Agent 攻击拆成可观测行为并标注脆弱性，用于构建 Sigma/KQL/Suricata/YARA 检测而不是当扫描器。
> 
> - **仓库定位与规模：** MIT 开源，v2.11.1（11 月 25 日），48 个框架目录（ARTEX、PentAGI、HexStrike、CyberStrikeAI、Hermes 等）另有 11 个仅控制台指纹目录；实测 1,105 条指标，ARTEX 单框架 50 条 Suricata / 36 条 Sigma / 31 条 KQL。
> - **信号可溯源性：** 每条信号带 `file:line` 与 fragility 四级（code 需重编译、config 改环境变量、flag 命令行开关、prompt 改提示词）；例：WebFetch 只取 HTML 不取静态资源（UA `norma/0.4`）、Go mitmproxy 重建 ClientHello 致工具呈现 Go JA3/JA4、shell 用 bracketed paste。
> - **一套指标多后端：** Sigma 为源共 172 条，转出 Splunk（88 saved search）、Elastic（74 条 ndjson）、Sentinel ARM 模板；三者 `enableRules`/默认状态全为 disabled，发布包带 SHA-256。
> - **置信度与时效：** High 为框架特有五元组类信号，Medium 为会变的地址/通用 UA，Low 为正常开发也用的（如 `Claude-User (claude-code/`）；地址带 `review_by` 180 天过期，过期后仅留 CSV/STIX 作历史。
> - **避坑要点：** 规则未经真实入侵验证（pcap 为合成）、文档数字漂移（README 580 条 vs 实测 1,105）、暴露≠攻击（4,699 控制台超半数疑为蜜罐）、HTTP 规则需明文或解密流量、品牌字符串为模型临场生成故易失效。

**句芒安全实验室** *2026年11月26日 14:45*

2026 年 8 月 1 日，FBI 和 Google 把这一天标成最早出现恶意使用的日子。被点名的工具叫 ARTEX：一个开源的 AI 渗透测试框架，Go 写的，有 planner、有 worker、有 Web 控制台。攻击者把它装在云主机上，让 Agent 自己规划、自己调工具、自己往下打。Storm-0940 从第一次踩点到拿到云上特权访问，用了不到三个小时。

这件事对防守方最难受的地方不是"攻击变快了"，而是没有东西可抓。没有 exe 落地，没有固定 C2 域名，没有一段能写进 YARA 的 payload。每次跑的 User-Agent、探测路径、文件名，都是模型临场起的。你拿传统 IOC 去对，对不上。

11 月 20 日，ThreatDefence 开源了一个仓库，专门收这类痕迹：agentic-attack-detections。六天 704 星、142 个 fork，MIT，最新版 v2.11.1 在 11 月 25 日发布。它不是扫描器，也不是防火墙，是一套"检测内容库 + 生成器 + 暴露面记录"。

![仓库自带的 11 月 25 日暴露面统计：4,699 个活跃控制台，30 天内 6,982 个](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c80f07010482feef.png "仓库自带的 11 月 25 日暴露面统计：4,699 个活跃控制台，30 天内 6,982 个")

## 一、它收的是什么

48 个框架目录。ARTEX 和它的改名版 AntiFox、Cairn、PentAGI、HexStrike、CyberStrikeAI、Strix、Hermes Agent、Agent Zero、RedAmon、Xalgorix、Pentest Swarm AI、Decepticon、Shannon、PentestGPT、Cyber-AutoAgent、CAI、HackSynth、VulnBot、AutoPT、DarkMoon、sapper-v2、NeuroSploit、Vigilo、Pentest Copilot、cyber-harness、CHYing-agent、Hexstrike-redteam、pentest-ai、LazyOwn、H-Pentest、Incalmo、Virga。还有 11 个只做到"控制台指纹"一级的目录，比如 AutoCVE、CyberStrike、Vulnerator AI、AIDA、BugTraceAI、Z3r0、AIRecon、LuaN1aoAgent、open-kritt、REDCELL、T3MP3ST。

每个框架目录里，规则按平台分开放：Sigma、Sentinel 和 Defender XDR 的 KQL、Splunk SPL、Elastic 的 ES|QL 和 Lucene、Suricata、Zeek、YARA、osquery，还有 STIX 2.1 和三家 WAF（Cloudflare、AWS、Azure）的规则。仓库另有一个 behaviors 目录，收"所有 Agent 攻击框架共有"的行为，不绑定具体工具。

我 clone 下来数了一遍：48 个目录，1,105 条指标；ARTEX 一个框架 50 条 Suricata、36 条 Sigma、31 条 KQL。

## 二、三个设计，值得单独说

第一个设计：信号从源码里取，并且标了"有多容易被删"。

大多数检测规则库只写"看到这个就报警"，不写这个信号从哪来、攻击者改一下还在不在。这个仓库每条信号都带 file:line，还多一列 fragility，四个值：code、config、flag、prompt。code 意味着要重新编译才能去掉，config 是改环境变量或 UI，flag 是命令行开关，prompt 是改提示词。

举三个真实的例子。

WebFetch 发出去的是 `user-agent: norma/0.4` ，30 秒超时，并且拒绝.js、.css、图片、字体、媒体 URL（Norma `tool/webfetch.go:177-204` ）。也就是说它读页面，但不读页面依赖的资源。你在 WAF 上看到一个 IP 只取 HTML、不取静态资源，这个形状本身就有意义。

代理工具会保留自己的 User-Agent，但 TLS 指纹会丢。录制代理用 Go 的 `crypto/tls` 重建每个 ClientHello，curl、sqlmap、nuclei、headless Chromium 最后都呈现 Go 的 JA3/JA4，没有 GREASE，也没有会话复用（ `traffic/` 配 go-mitmproxy v1.9.2）。这条对做 TLS 指纹的人来说，比 UA 有用得多。

交互式 shell 里，回车是 `\r` ，多行输入用 `ESC[200~` 和 `ESC[201~` 包起来，而且不回显完成标记（ `tool/shell_tools.go:150, 225-245` ）。这是 bracketed paste 的正常实现，但放在"一个 Web 服务突然起了 shell"的上下文里，就是一个可以关联的信号。

第二个设计：一套指标，生成多个后端。

Sigma 是源，全仓 172 条规则；转换出来的有 Splunk SPL、Sentinel 和 Defender 的 KQL、Elastic 的 ES|QL 和 Lucene。发布包里每个文件都带 SHA-256。Splunk 是一个 app，88 条 saved search，默认全 disabled；Elastic 是一个 ndjson，74 条规则，也默认全 disabled；Sentinel 是一键 ARM 模板， `enableRules` 默认 false。这个默认值是对的：检测规则不该在你没看过数据之前就自己开始报警。

第三个设计：置信度分三层，地址会过期。

High 是框架特有：UA、命令行、路径、提示词、探测产物、已报道的 C2 和 skimmer 域名、文件哈希。Medium 是见过但会变：已报道的地址、通用 Agent UA、和其他工具共享的提示词。Low 是常见或合法：AI 模型 API、请求收集服务、agent CLI 的 UA、托管 ASN、代理池。

地址带 `review_by` ，报道后 180 天。过期地址会从 plain list、Zeek intel 和 Suricata 地址规则里剔除，只留在 CSV 和 STIX 里当历史。这个设计很务实：云和 VPS 的 IP 会重新分配，拿半年前的 IP 去封，封到的可能是别人的新机器。

![指标按框架和置信度分布，前 12 名；数据来自仓库 iocs/indicators.csv](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/fe05e0f6feb8f40e.png "指标按框架和置信度分布，前 12 名；数据来自仓库 iocs/indicators.csv")

## 三、拆几条真规则

Suricata SID 3800001，匹配 `artex-` 开头的 UA，pcre 里是 readonly、pentest、audit、verify、spawn、enrich 六个角色，映射 MITRE T1595.002（漏洞扫描）。

SID 3800020，匹配 URI 里的 `zzz-nonexistent-xyz123` 。这是 ARTEX 在每次 fuzz 之前先请求一个肯定不存在的路径，用来学习"什么是不存在"。这个请求本身不是攻击，但它是攻击的前置动作。

SID 3800023，匹配 URI 里的 `alg:none` JWT，三种写法都覆盖：alg 在前、typ 在前、None 和 NONE 的大小写变体。映射 T1606（伪造 Web 凭证）和 T1190（利用面向公众的应用）。

SID 3800040，匹配响应体里的 `<title>ARTEX` 加 `_next/static` 。改名 fork 会换标题，但标题结尾常常保留：3800081 匹配 `Autonomous Penetration Testing Console` ，3800082 匹配中文结尾"自主渗透测试控制台"。这两个规则是给"改了名但没改完"的构建准备的。

behaviors 里有一条我特意看了一眼：SID 3801010，匹配 `Claude-User (claude-code/` ，置信度标的是 Low。原因写得很清楚：Cairn 的 worker 也用它，正常开发也用它。这条不能单独报警，只能当上下文。

还有 SID 3801041：往容器 registry push 一个以 Agent 命名的仓库，比如 `artex-i127739` 、 `hermes-h23645-writecheck` 、 `csai-push-probe` 、 `xalgorix-pwn` 。这是 Agent 在证明"我能写"，不是漏洞，但它是一个很干净的行为信号。仓库顺手把 380 个开放 registry 也记了下来，其中 364 个在同一个托管网络、仓库列表几乎一样，这更像一次批量部署或一组诱饵，不是 364 个独立操作者。

这些规则的共同点：不抓 payload 字符串，抓"一个 Agent 在你应用上留下的一串动作"。

## 四、连 Hermes Agent 都在名单里

仓库对 Hermes 的定性写得很克制：Hermes 是一个合法的通用 Agent，有持久记忆、自己写 skill、 `SOUL.md` 人格、定时任务、Telegram 网关和 Web 面板。攻击者做的是把审批关掉、加载自带的 jailbreak skill、换掉人格、用 Telegram 驱动，模型用 DeepSeek 或 Claude 都行。

它列的案例是 Unit 42 的 knaithe/KnYuan（2026 年 7 月）、Hunt.io 的泰国财政部（2026 年 7 月）、Gambit Security 的零售盗卡（2026 年 9 月）、ThreatDown 的 Carbonato Docker 僵尸网络（2026 年 9 月）。

规则只找"这些改动"，不找 Hermes 本身。这个边界划得很清楚，也很重要：一个通用 Agent 被改成攻击控制台，和这个 Agent 本身是不是恶意的，是两件事。

对我们自己来说，这条还有一层用法：如果你在跑 Hermes、Claude Code、Codex，这些规则也会在你自己的流量里响。先拿它当"我有没有把审批关掉"的自检，而不是"我被入侵了"的警报。

## 五、上手：一分钟到一条流水线

最快的验证是 Suricata 加仓库自带的 sample pcap：

```bash
git clone https://github.com/ThreatDefence/agentic-attack-detections
cd agentic-attack-detections
mkdir -p out
suricata -r frameworks/artex/tests/artex-sample.pcap \
  -S frameworks/artex/suricata/artex.rules -l out -k none
cat out/fast.log
```

期望看到三条： `artex-<role>/1.0` 的 UA、占位路径 probe、URI 里的 `alg:none` JWT。这个 pcap 是按源码和公开报告写出来的测试流量，不是录下来的真实入侵，仓库自己也这么写。

Sentinel 是一键 ARM 模板，一次建好全部 analytics rule（默认 disabled）、hunting query 和 `AGENTIC_IOCs` watchlist，参数只有 workspace 名和 `enableRules` 。Defender XDR 直接跑 `frameworks/*/sentinel/hunting/` 里的 KQL。Splunk 装 release 里的 app，把 `aad_indexes` 宏指向自己的索引，先跑 30 天再启用。Elastic 导入 ndjson，指标单独 bulk 进 `logs-ti_agentic_attacks-default` 。Zeek 用 `zkg install` 装 behaviors 包，设 `server_nets` ，再加载各框架脚本。Sigma 用 `sigma convert` ，或者直接用 `generated/` 里转好的。

WAF 是可选的：它给你在边缘加一层阻断，不替代检测。这个定位是对的。

我实际做的是轻量校验，不是全量部署：clone 下来 36MB，48 个目录，1,105 条指标，跑仓库自带的 feed 单测 6 个，0.011 秒全过。这个测试只覆盖"指标置信度、过期、SID 稳定性"的策略，不覆盖规则能不能在你的数据上响。

## 六、避坑：八条，都是仓库自己写了的

第一，没有一条规则对真实入侵验证过。README 的原话是 pcap 是合成的，每条规则在你自己数据上跑之前都算 experimental。有规则不等于能防。

第二，文档数字会漂。README 写 580 条指标，我 clone 下来 CSV 是 1,105 条；表里 ARTEX 的 Suricata 写 46，实际文件 50 条；前文写 "fourteen more frameworks"，后文写 "other eleven"，实际 11 个目录只有 console 级规则。用之前自己数一遍，别拿文档数字去做容量规划。

第三，Low 置信度不能单条报警。 `Claude-User (claude-code/` 、 `QwenCode/` 、 `KimiCLI/` 、 `opencode/` 这些正常开发也在用。仓库自己标了 Low，只能当上下文。

第四，地址 180 天过期。封 IP 之前先看 `review_by` ，云地址会重新分配。

第五，暴露不等于攻击。11 月 25 日快照是 4,699 个活跃控制台、30 天内 6,982 个；但一半以上标题是 CyberStrikeAI 的被标成蜜罐，一个网络占了剩下 CyberStrikeAI 和 PentAGI 各三分之一。研究者、学生、红队、诱饵都在跑。仓库把"暴露"和"攻击"分开写，是对的；你看的时候也要分开。

第六，HTTP 规则要明文或解密流量。只有 DNS 和 TLS SNI 规则能在加密流量上工作。没做 TLS 解密，就别指望那些看 URI 和响应体的规则。

第七，品牌字符串是模型临场起的。 `artex-pentest/1.0` 、 `X-ARTX-KEY` 、 `C:\ProgramData\artx5v\` 都不在公开代码里；Wiz 看到每波喷洒换一个 UA，Eye Security 说"Agent 自己给工作命名"。下次换个名字就没了。这也是 1.1.0 补"从源码取信号"的原因。

第八，只覆盖被点名的框架。改名的 fork、自己写的 harness、只在本机跑的脚本，规则看不见。它给你的是"已知框架的已知形状"，不是"所有 Agent 攻击"。

## 七、适合谁

适合有 Sentinel、Splunk、Elastic 中任意一个的蓝队；做 AI Agent 红队演练、需要检测自己工具痕迹的安全团队；想理解"Agent 攻击长什么样"的研究者；给 SOC 做检测工程的人。它的价值不在"多一个规则包"，在"把 Agent 攻击拆成可观测的行为，并且告诉你每条信号有多脆弱"。

不适合想开箱即用当 IDS 的；没有日志和流量可见性的小团队；期待它替代 EDR/NDR 的；把它当"AI 防火墙"的。它自己也写了：匹配是线索，不是判决；没有匹配，也不等于没有被入侵。

ARTEX 不是第一个，也不会是最后一个。真正变的是攻击的产出方式：以前是人写 payload，现在是模型临场写。检测要跟上的，不是某个字符串，而是"一个 Agent 在你应用上留下的一串动作"。这个仓库的价值，是把这串动作的样本摊开给你看，包括它自己承认看不全的那部分。

作者提示: 内容由AI生成
