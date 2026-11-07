---
title: 【微信】外媒：免费中国大模型在网络攻击方面越来越厉害，令人担忧——DeepSeek逼近OpenAI受限模型
source: https://mp.weixin.qq.com/s/E6mTNP1eQ56aGP8JxWvxDw
source_host: mp.weixin.qq.com
clip_date: 2026-11-07T14:28:30+08:00
trace_id: e886bc82-a6d9-472f-a03e-9a09ef885edb
content_hash: 77e8d1b3a5557644d6a200bcc960913d1a17312200c6f66709481ea8d6641488
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 41175244-d011-817f-b790-ca0e6fcfbf51
ioc: null
---

**网空闲话plus** *2026年11月7日 08:31*

WIRED 2026年11月6日报道称，开放权重AI模型在网络入侵能力上已几乎追平最好的闭源模型。Vals AI的模拟企业网络测试显示，中国开源权重模型DeepSeek V4.1 Flash 1017总体完成约73%的攻击目标，接近OpenAI仅向可信伙伴开放的GPT-6 Sol Daybreak（约81%），单次运行成本不到3美元，约为后者的十分之一。这被视为网络安全格局的“转折点”，但公开数据并不支持把GLM 5.3 Flash与DeepSeek并列：后者在Vals榜单中两个靶场各仅完成5个目标，总体约20%。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7d6d4432a71390ad.gif)

## 一、测试方法与核心数据

Vals AI构建了两个模拟企业网络靶场：Nova（21个目标）和Lighthouse（31个目标）。模型在隔离的Kali Linux环境中通过开源Pi agent自主运行，无人工帮助，只能访问模型提供商和靶场；每次运行使用全新靶场副本，预算为5亿累计token、48小时上限。每个目标设有隐藏标记，评分只认模型真正攻陷机器后读取到的标记，不采信模型自述。最终得分取两个靶场完成比例的平均值，二者权重相同。

结果显示，最强模型能连续数小时执行多步入侵：通过公开Web应用进入，获取管理员权限，收集并复用密码，从一个公司网络横向移动到另一个。GPT-6 Sol Daybreak总体完成约81%，在更难的Lighthouse完成27/31，不到三小时；DeepSeek总体约73%，在Nova平均16.3/21，甚至略高于Daybreak的15.7/21，但在Lighthouse为21/31，低于Daybreak。WIRED称，在部分任务上两者得分相同。Vals研究者Nikil Ravi表示：“最好的前沿模型被锁在实验室里、只能通过可信访问项目获得，现在开始被任何人可下载的开源模型匹配。”

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f9749e10cc3dc5ac.png)

其他模型中，Kimi K3.1 Pro总体约63%，Meta Wonder因Lighthouse完成28/31但Nova仅7/21，总体约62%；Grok 4.7约54%；Kimi K3约38%；GLM 5.3 Flash在Nova和Lighthouse各仅5/21、5/31，总体约20%。所有模型都未完成Lighthouse最终目标，仅一次运行到达Nova最终阶段。

## 二、成本、算力与开源扩散

成本差异是这项研究的关键。WIRED称，GPT-6-Sol执行一次攻击的token成本为17至46美元，DeepSeek仅2至3美元；Vals的结论更直接：DeepSeek在第一个网络得分与Daybreak持平，单次运行不到3美元，Daybreak约22美元。开源权重模型可本地运行，成本低，且“一旦权重公开，没有提供商能监控或阻止其使用”。

但算力消耗模式不同。Daybreak效率更高，在更难靶场用1亿token内达到25/31；DeepSeek前2500万token几乎无进展，大部分进展在1亿token之后，花费2至4倍token才达到相近位置。由于token便宜，长时间运行仍不到3美元。Vals因此警告：过早限制算力的评测会严重低估DeepSeek的真实能力。弱模型则未从更多算力中受益：Grok 4.7、Kimi K3和GLM 5.3 Flash均在预算耗尽前停滞，所有运行均自行结束，而非被token或时间限制截断。GLM 5.3 Flash在一个靶场花费约36小时、上千轮，大量时间在睡眠和轮询一个从未返回的后台任务，最终仅完成5个目标。Vals称，这些分数标记的是模型“用尽想法”的位置，而不是评测者停止的位置。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6a1f9df24cd69043.png)

## 三、影响与后果：攻防双用途与真实风险

Vals指出，同一能力既能让攻击者找到入口，也能让防御者先找到弱点；开源权重让防御者无需等待提供商批准即可使用。Vals CEO Rayan Krishnan称，低成本也强烈激励防御方使用开源模型而非专有模型。但风险同样明显：开源模型无安全护栏、无法监控停止；AI代理已能自主完成模拟网络攻击的大部分流程。Vals预计，未来几个月真实企业网络上的此类攻击将更常见。

WIRED同时提醒，今年网络安全大体如预测：AI自动化核心黑客任务，帮助攻防双方发现大量新漏洞并快速探测弱点。速度和规模都在上升，但专家仍在辩论，AI究竟带来了新型威胁，还是放大了长期存在的安全挑战。实际观察显示，网络犯罪和国家支持黑客往往节省资源，多数活动仍使用较旧、较弱的模型——无论专有还是开源。即便有严格管控，防御者也必须假设资金最充足、动机最强的攻击者早已接触过闭源模型。

## 四、最新进展与各方评论

OpenAI的Daybreak仅通过受限网络项目开放；Anthropic从今年4月Claude Mythos Preview开始，以Project Glasswing向可信伙伴提供完整能力。Anthropic前沿红队负责人Logan Graham当时对WIRED称，目标是让工具“先到防御者手中”，并为“6、12、24个月后能力广泛可用”做准备。七个月后，WIRED称这一转变似乎如期而至。

云安全公司Edera联合创始人兼CTO Alex Zenla表示，他总体同意开源权重模型如今能产生高级攻击和漏洞，尤其是通过修改权重禁用安全训练的“消融（abliterated）模型”；但他提醒，闭源实验室很可能已训练出超过公开能力的未发布模型，“这非常像猫鼠游戏……我确实认为这可能是危险安全格局的开端”。Z.ai在2026年8月发布GLM 5.3时承认双用途风险，采取分阶段发布，先让选定安全伙伴受控评估，两周后全面开放；同时推出OpenVuln扫描代码漏洞。Vercel CEO Guillermo Rauch称，低成本GLM对防御性安全工作是利好，“这是新的开放前沿”。AI专家Nathan Lambert则称，这是“非常强网络能力不可避免地向整个经济扩散的又一步”。OpenAI总裁Greg Brockman此前称Hugging Face事件是网络安全“分水岭”，显示典型威胁行为者能力未来数月将如何演变。OpenAI未立即回应WIRED置评请求。

## 五、质疑：别把模拟当现实，别把“中国模型”一概而论

首先，Vals测试是模拟企业网络，不等于真实攻击。真实入侵有防守方响应、法律风险、操作失误和不可预测的IT环境；模型在靶场中的自主性，也不等于能独立发现和选择现实目标。

其次，WIRED导语将DeepSeek和GLM并列为“不落后于OpenAI最强网络模型”，但公开数据并不支持这一概括。Vals榜单中，GLM 5.3 Flash在Nova仅5/21、Lighthouse仅5/31，总体约20%，远低于DeepSeek的73%和Daybreak的81%。WIRED正文实际只给出了DeepSeek的73%，未给GLM在Vals的同等分数。GLM 5.3完整版在CyberGym等基准上可能接近或超过部分模型，但CyberGym与CyberOffense测试方法不同，公开材料不足以证明GLM 5.3 Flash在自主多步网络攻击中“不落后”。把“中国开源模型”作为一个整体赞誉或担忧，都会掩盖DeepSeek、Kimi、GLM等模型之间的巨大分化。

第三，开源模型成本低，但本地运行需要硬件、部署和操作技能；成本优势不等于零门槛。实际攻击者常保留资源、使用旧弱模型，说明能力扩散并不自动等于攻击激增。

第四，闭源实验室可能拥有未发布的更强模型，开源追赶不等于超越；Alex Zenla的“猫鼠游戏”判断值得重视。

第五，攻防双用途意味着开源模型也可能强化防御，Nvidia已推动开放AI用于网络安全，Hugging Face也曾用先前GLM版本加固系统。

最后，AI是否根本改变网络安全的概念基础，专家仍无定论；更稳妥的判断是，它显著放大了既有挑战，并降低了部分攻击步骤的门槛。

## 六、未来影响

Vals计划增加更多靶场和模型，并预计真实企业网络上的AI自主攻击将增多。防御窗口在于：企业现在可用同类模型测试和修复自身系统，开源权重使这种防御不必等待提供商批准。政策层面，美国政府正在制定框架，以缓解AI网络能力进步的影响，核心难题正是开源模型：既要利用其防御价值，又难以控制其扩散。Z.ai的分阶段发布、OpenAI的Daybreak和Anthropic的Glasswing，都是“先可信访问、再逐步开放”的尝试，但Vals的数据表明，这种时间差正在缩小。

对“免费中国大模型越来越厉害”的担忧并非空穴来风，但必须精确到模型、版本、基准和成本。DeepSeek在Vals测试中确实逼近受限前沿模型，且成本极低；GLM 5.3 Flash却远未达到同等水平。真正值得警惕的不是“中国模型”这一标签，而是高性能网络能力正以开源权重、低成本、无护栏的方式扩散，而防御、监管和攻击者行为都尚未跟上。

## 事实核验与口径说明

总体得分：按Vals表格，Daybreak为Nova 15.7/21、Lighthouse 27/31，平均约81%；DeepSeek为16.3/21、21/31，平均约73%；GLM 5.3 Flash为5/21、5/31，平均约20%。

成本口径：WIRED称GPT-6-Sol每次17至46美元、DeepSeek 2至3美元；Vals称Daybreak约22美元、DeepSeek不到3美元。本文并列保留两种表述。

GLM区分：Vals测试对象是GLM 5.3 Flash，不等同于Z.ai2026年8月宣布的完整GLM 5.3；公开材料未给出完整版在CyberOffense的同等成绩，故不能将CyberGym等基准表现直接替代本文结论。

## 参考文献

\[1\] Knight W, Newman L H. Free Chinese AI Models Are Getting Scary Good at Hacking\[EB/OL\]. WIRED, 2026-11-06\[2026-11-07\].https://www.wired.com/story/free-chinese-ai-models-are-getting-scary-good-at-hacking/.

\[2\] Ravi N, Tran H, Nashold L, et al. CyberOffense Leaderboard and Methodology\[EB/OL\]. Vals AI, 2026-10-23\[2026-11-07\].https://www.vals.ai/benchmarks/cyber_offense.

\[3\] Knight W. The Powerful Chinese AI Model Experts Warned About—and Waited for—Is Here\[EB/OL\]. WIRED, 2026-08-18\[2026-11-07\].https://www.wired.com/story/zai-open-weight-ai-models-release-cybersecurity-hacking/.

人工智能 · 目录

作者提示: 素材来源官方媒体/网络新闻，文中事件发生于2026年11月7日
