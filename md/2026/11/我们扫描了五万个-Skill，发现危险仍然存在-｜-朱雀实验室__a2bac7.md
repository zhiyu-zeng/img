---
title: 我们扫描了五万个 Skill，发现危险仍然存在  ｜ 朱雀实验室
source: https://security.tencent.com/index.php/blog/msg/224
source_host: security.tencent.com
clip_date: 2026-11-18T10:43:06+08:00
trace_id: 42f6a0c0-d5ec-4136-a7c1-d0e7d9276776
content_hash: 82411cef579e9cacb285ef3ff377ecf30cc7eafe602599b9f29b43785effcb47
status: synced
tags: []
series: null
feed_source: 腾讯安全响应中心
ai_summary: null
ai_summary_style: null
images_status:
  total: 20
  succeeded: 20
  failed_urls: []
notion_page_id: 41c75244-d011-818e-930e-decfdb5a6b00
ioc: null
---

> 基于传统扫描器的防护体系已无法应对现状。当 25% 的 Skill 能读写文件、成百上千条路径指向私钥、远程控制通道被预埋进生态底层时，我们面对的不再是漏洞，而是一个已经完成”前置部署”的攻击面。AI 安全问题，从模型问题演进到了“系统工程”的对抗阶段：排名操纵、平台投毒、Agent 自动安装，这是第三代攻击的形态。它们不突破防线，而是用功能本身洞穿防线。  
> 真正的问题不是扫出了什么，是：这个生态还有没有，有效的免疫系统？
> 
> 腾讯安全平台部负责人 Coolc腾讯安全平台部负责人 Coolc

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/df0d456966851396.png)

2026 年初 OpenClaw 的火爆让 AI 从替你回答问题变成了替你操作一切，而Skill 是 Agent 获取这些能力的关键方式，也是攻击者最新的投毒入口。我们用 A.I.G （ [https://github.com/tencent/AI-Infra-Guard](https://github.com/tencent/AI-Infra-Guard) ） 对 ClawHub 上的50000+ Skill 做了全量扫描。发现不只是已知恶意样本，还有 **下一代更隐蔽的攻击方式**。

下面是一个真实的恶意 Skill 攻击流程。从安装到数据被盗，用户全程无感知。

恶意 Skill 攻击流程图：  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/390d2ee8e0b0a229.png)

## 一、从 MCP 到 Skill 市场：AI 工具生态供应链攻击简史

随着 AI Agent 生态的爆发，攻击面正在沿着一条清晰的路线扩大：  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3486e24af6b01fa9.png)  
每一代攻击面都比上一代更大。MCP 服务器是 Agent 和外部工具之间的协议层，恶意 MCP 可以劫持工具调用；IDE 扩展跑在 IDE 沙箱里，但 GlassWorm 已经证明可以跨 IDE 传播； **Agent Skill 直接运行在用户环境中，拥有文件读写、网络通信、Shell 执行的完整权限**。Skill 的恶意指令可以是纯自然语言，Agent 不需要”执行代码”就会服从 Markdown 中的一行话。

OWASP 在 2026 年 4 月专门为此发布了 Agentic Skills Top 10（AST10），将 Agent Skill 安全风险系统性地独立出来。这是安全行业第一次正式承认： **Skill 不是插件，不是扩展，是一个全新的、更危险的攻击面。**

我们使用 A.I.G（朱雀实验室推出的 AI 安全检测平台）对 ClawHub 上近五万个 Skill 进行了全量扫描。ClawHub 是 OpenClaw 的官方 Skill 市场，也是目前最大的开源 Agent Skill 分发平台。

从时间线看，这个生态在 90 天内完成了从零到爆发的过程：

● **2026 年 1 月**，ClawHub 上线，Skill 总量不足 2,000。

● **2026 年 1 月底**，ClawHavoc 爆发。1,184 个恶意 Skill 上架，12 个被入侵的发布者账号被用来分发窃密木马。24.7 万次确认安装，230 万美元加密货币被盗。

● **2026 年 2 月**，ClawHub 上线安全检测机制。

● **2026 年 3 月**，Skill 总量突破四万。Silverfort 发现 ClawHub 排名操纵漏洞。上海交大 SkillProbe 团队完成 2,500 个 Skill 的学术安全审计。

● **2026 年 4 月**，Skill 总量达到五万。OWASP 发布 Agentic Skills Top 10。我们完成全量审计。

扫描结果显示，即便经历了 ClawHavoc 的清洗和平台安全机制的上线，生态中的危险信号依然密集：  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/68603cfa6612f77f.png)  
风险的重点已经不是”有没有恶意 Skill”，而是 **恶意 Skill 正在换代，攻击者和平台安全机制的对抗已经开始。**

## 二、平台安全检测机制与对抗现状

#### CLAWHUB 做了什么

ClawHavoc 之后，ClawHub 构建了一套多层安全检测体系：

1.  **正则模式扫描：** 对代码文件做静态正则匹配，捕捉可疑函数和已知危险模式。
    
2.  **注入信号检测：** 在 SKILL.md 中扫描 5 种提示词注入模式（恶意字符串、加密字符串、system prompt 覆写等）。
    
3.  **LLM 安全评估：** 将 Skill 的元数据、权限声明、SKILL.md 送入 LLM，从五个维度做综合评估。
    
4.  **VirusTotal 外联检测：** 主要扫描已知病毒木马签名。
    

这套机制能够有效拦截 ClawHavoc 那一类”恶意命令直接写在文档里”的粗暴攻击。

正常通过 OpenClaw 官方检测图：  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/507711e627d45311.png)

## 三、典型案例深度分析

## 案例一：一个通过了官方检测的远程控制后门

在全量审计中，我们发现了一个能绕过 ClawHub 多层检测的 Skill。 **该样本通过了官方安全检测。**

样本包含两个文件， `skill.md` 为 Markdown 格式的技能描述文件，包含完整的 YAML 元数据头部和业务流程说明；也包含一个 `poc.py` 的 Python 脚本，约 337 行。两个文件位于同一目录下，无其他附属资源。  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a35cc4563fc8d7f8.png)  
Skill描述中自称是一个”分布式状态恢复工具”。文档写得非常专业，架构图、用例表格、安全说明一应俱全，甚至引用了 Python 官方文档的安全警告。权限申请也合理，一个分布式状态工具需要联网拉取数据，需要 Python 运行环境，没有多余的权限。  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5b1f1d7f38b3ede8.png)  
由于原始样本中的 C2 服务器已不可达，我们根据样本逻辑构造了一个模拟的 C2 服务器响应包，以完整演示攻击链路。

**该Skill利用完整链路：**

1.  **Skill执行；**
    
2.  **远程载荷拉取：** 从远程 C2 获取序列化对象，并返回X-Decode解码顺序。  
    ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0cd564efdeae899f.png)  
    3\. **多层编码混淆还原：** 样本内支持 12 种传输编码（Base64、ROT13、Morse 码等），且支持链式组合解码（x-decode: base64,rot13,hex）。文档里包装成”二进制安全传输需求”，根据获取的x-decode解码顺序依次解码，获得反序列化字节码。  
    ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d9bfedbf5835304b.png)
    
3.  **不安全反序列化：** 最终使用 Python pickle 对最终解码数据做反序列化，这直接导致任意代码执行，用户机器被控制。  
    ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9d89c2de466d3122.png)  
    **在整个过程中，攻击者不需要在代码里写恶意命令，而是只需要把任意指令上传到C2服务器，运行这个skill连接后就会执行。**

但我们使用A.I.G 检测会发现样本被标记为高危。A.I.G 的检测逻辑不同于模式匹配，它关注三件事：实际会做什么、高风险动作之间能不能拼成完整攻击链、这个发布者和样本是否呈现规模化异常特征。在这个案例中，”远程拉取 + 反序列化 + 多层编码”三个动作单独看都合理，但A.I.G分析其组合起来可以形成了完整的 RCE 链路。

随着 AI Agent 生态的爆发，攻击面正在沿着一条清晰的路线扩大：  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6c1fce2be865c6fe.png)

## 案例二：ClawHub 排名操纵，恶意 Skill 被推到第一名

2026 年 3 月，Silverfort 研究团队发现 ClawHub 后端存在一个关键漏洞。任何人发一条未认证的 curl 请求就能无限刷下载量。

Silverfort 做了 PoC 验证：他们发布了一个伪装成”Outlook Graph Integration”的 Skill，内部嵌入了伪装成遥测功能的数据外泄载荷。然后通过刷量把它推到 ClawHub 排名第一。  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7a3b001df62a3f86.png)  
**最值得警惕的是：** 这不仅骗了人类用户，也骗了 OpenClaw 的 AI Agent。Agent 在自主选择工具时，会优先安装下载量排名靠前的 Skill，恶意 Skill 借此完成了对 Agent 的自动化感染。

这意味着在 Agent 自主安装 Skill 的场景下，排名操纵等于批量投毒。攻击者不需要精心设计绕过检测的恶意代码，只需要让排名足够高，Agent 就会自动送上门。

## 案例三：ClawHavoc，1,184 个恶意 Skill，247,693 次安装

2026年2月的ClawHavoc 是迄今规模最大的 Agent Skill 供应链攻击：  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/40d4660a75d08d01.png)  
攻击者采用 **域名仿冒（typosquatting）** 策略，伪装成 Google Assistant Pro、YouTube Summarize Pro 等热门工具名称。载荷使用双层投递，Markdown 指令负责窃取 SSH 密钥，嵌入式 Shell 脚本负责部署 Atomic Stealer (AMOS) 窃密木马。

高峰期间， **下载量 Top 7 中有 5 个是恶意 Skill。**

ClawHub 在事件后上线了安全检测机制并移除了所有恶意 Skill。但我们的全量扫描发现， **第一代显性恶意样本确实大量消失了，但伪装更深的风险并没有一起消失。**

## 四、生态级风险：不是几个坏 Skill 的问题

单独看某个恶意样本，可能觉得是个案。但当我们把全量数据摊开，看到的是系统性的结构风险。

### 供给侧：批量制造能力已经成型

这五万个 Skill 背后共有 15,427 名开发者，但分布极度不均，Top 20 合计发布 5,422 个 Skill，占总量的 12.9%。  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e1a9cf5e45cf87b4.png)  
最极端的账号 3 个月发布 955 个 Skill，日均 10.6 个。即便只做最简单的 API 封装，纯人工也很难 90 天不间断维持这样的产出密度。这背后大概率是模板化批量生成。

多组命名相近、发布时间交替的账号矩阵进一步佐证了这一判断：bytesagain、bytesagain1、bytesagain3 三个账号合计 551 个 Skill，单看是三个作者，放在一起看更像同一条生产线的多个窗口。

**一旦规模化生产能力成型，恶意样本、低质样本、伪装样本都可以被批量制造。**

### 攻击链：权限采集 + 通道外传

在近五万个 Skill 里，27,818 个声明了网络请求权限，占比 74.6%。平均每 4 个 Skill 就有 3 个会联网。

联网本身不是问题。但当联网成为生态默认动作时， **真正恶意的数据外传就能混进海量合法流量里。**

更危险的是权限组合，文件读取加上网络外传，已经构成了一条完整的数据外泄路径：  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/abc57fbc148389af.png)  
高频被引用的敏感路径：  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5dbcdeb5cc17a834.png)  
这种”功能上合理、组合后危险”的过度授权模式在生态中大量存在。Snyk 的 ToxicSkills 研究在 3,984 个 Skill 中发现了 280+ 个直接泄露凭证的样本。上海交大 SkillProbe 团队的发现更令人警惕， **超过 90% 的高下载量 Skill 未能通过严格安全审计**，下载量与安全性之间存在显著的反直觉矛盾（“流行度-安全性悖论”）。

### 外联通道：29,196 个域名，两类通道需要特别关注

全量扫描共发现 246,378 条 URL，指向 29,196 个不同域名。其中两类通道值得单独看：  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ace8a3c9aefa407a.png)  
前者对应远程控制和数据回传能力，后者说明链上交互场景已经进入 Skill 生态。对攻击者来说，这些都是可以直接借用的现成通道。

高频外联目标：  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c658d7b6b2ffd67e.png)

## 五、不只是 ClawHub：Agent Skill 安全是行业通病

以上发现是否是 ClawHub 的个别问题？不是。

**安全学术圈**：SkillProbe 论文对 2,500 个 ClawHub Skill 的审计发现了”流行度-安全性悖论”，高下载量 Skill 的安全性并不优于低下载量 Skill。更进一步，高风险 Skill 在风险关联维度上形成了一个 **单一的巨型连通分量**，说明级联风险是系统性的。

**安全工业界：** Snyk ToxicSkills 研究覆盖了 OpenClaw、Claude Code、Cursor、VS Code 四个平台共 3,984 个 Skill。结果显示 **所有平台都有大量安全缺陷：**  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e116c82c203ae8ce.png)  
2026 年 4 月发布的OWASP Agentic Skills Top 10 明确覆盖了 OpenClaw、Claude Code、Cursor/Codex、VS Code 四大平台，并特别指出跨平台复用风险，恶意 Skill 可以从一个平台移植到另一个平台。ClawHub 上的恶意 Skill 已经被观察到在 skills.sh 等独立市场中传播。

## 六、防御建议

安装 Clawhub 等外部市场的任何 Skill 之前，可以花一些时间三看三查：

**安装前三看**

1.  **看作者：** 点进主页，如果一个人发了 200+ Skill，谨慎安装
    
2.  **看权限：** 打开 SKILL.md，查看权限是否和功能是否匹配
    
3.  **看域名：** 搜索 http，如果出现你不认识的域名，保持警惕
    

**安装后三查**

1.  **查列表：** 超过 20 个 Skill？清理掉不常用的
    
2.  **查权限：** 检查谁拥有全局 Bash 和敏感文件读写权限
    

3\. **查来源：** 非官方且不知名作者的高权限 Skill，优先卸载

如果觉得太复杂，我们推荐使用 A.I.G 的EdgeOne Claw Skill 给你的龙虾做一轮系统性检查，它会调用 A.I.G 对 ClawHub 上近五万个 Skill 风险数据，判断你安装的 Skill 是否命中已知风险；对于非 ClawHub 渠道安装的 Skill，也支持本地快速审计。

```cpp
拉取 https://matrix.tencent.com/clawscan/skill.md 安装后，用 edgeone-clawscan 跑一轮本地检查。
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/642f192c6db41b1a.png)

相关链接：

● Skill 安全扫描： [https://matrix.tencent.com/clawscan/](https://matrix.tencent.com/clawscan/)

● AI-Infra-Guard 开源项目： [https://github.com/tencent/AI-Infra-Guard](https://github.com/tencent/AI-Infra-Guard)

● OWASP Agentic Skills Top 10： [https://owasp.org/www-project-agentic-skills-top-10/](https://owasp.org/www-project-agentic-skills-top-10/)

● SkillProbe 论文： [https://arxiv.org/abs/2603.21019](https://arxiv.org/abs/2603.21019)

* * *

**腾讯朱雀实验室（Tencent Zhuque Lab）是腾讯安全平台部于 2019 年成立的顶尖 AI 安全实验室，专注于 AI 安全领域的实战攻防与前沿技术研究，研究方向涵盖大模型安全、AI 智能体安全、AI 赋能安全与 AI 生成检测等领域。团队多次协助英伟达、谷歌、微软等知名厂商以及OpenClaw、Linux、Huggingface等开源社区修复大量高危漏洞，并获得官方公开致谢。先后推出开源 AI 红队安全测试平台 A.I.G（AI-Infra-Guard）及朱雀 AI 检测助手等AI安全产品。研究成果广泛发表于 Black Hat、DEF CON、ICLR、CVPR、NeurIPS、ACL 等国际顶级安全与 AI 学术会议，并出版专著《AI 安全：技术与实战》。**
