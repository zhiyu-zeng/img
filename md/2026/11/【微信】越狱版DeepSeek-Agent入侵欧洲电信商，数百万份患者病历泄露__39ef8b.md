---
title: 【微信】越狱版DeepSeek Agent入侵欧洲电信商，数百万份患者病历泄露
source: https://mp.weixin.qq.com/s/4vjnyQ96vcCavVa4AKVtxg
source_host: mp.weixin.qq.com
clip_date: 2026-11-10T20:54:49+08:00
trace_id: 6002b190-ef8e-4d94-9572-918587b018f1
content_hash: e6a226e198145cc85141089e4ff177ecf722e11c4357f920433019094d92b3f1
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
notion_page_id: 41475244-d011-8155-94b8-d7670c7efd42
ioc: null
---

**FreeBuf** *2026年11月10日 18:00*

![FreeBuf](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7c122de5d3efe346.gif) ![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/be401b6fab1a4030.png)

一款经越狱处理的DeepSeek Agent耗时两周多，入侵了一家欧洲电信运营商及托管在其系统上的13家企业。据披露，攻击过程中该Agent访问了数百万份医疗健康记录。

Malbear Labs研究人员将此次攻击活动命名为"雪球行动（Operation Snowball）"。团队在例行扫描中发现一个存放着攻击者完整工作空间的开放目录，由此溯源到这起攻击活动。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/390addb8d6c86c8d.png)

Part01

开放目录泄露全量攻击记录

根据Malbear Labs发布的技术研究，该开放目录无需密码即可访问。目录内包含约70份会话记录、数百台主机的扫描结果、窃取的凭证及数据库转储文件。攻击者输入的所有指令、Agent返回的所有报告均为中文。

研究人员未公布服务器IP地址，以保护受害机构。团队同时提醒，攻击者使用中文操作，不能证明其国籍，也不能证明其与任何政府存在关联。

攻击所用的是一套基于DeepSeek Flash搭建的自定义Agent框架，该模型拥有百万token级上下文窗口。借助这一窗口，主Agent可以连续数天记住所有主机信息、密码及失败的尝试记录。人类攻击者每次入侵间隙都需要重新查阅笔记，该Agent则无需这一操作。

DeepSeek本身会拒绝生成webshell、执行密码猜解等恶意请求。攻击者通过一段7.8万字符的系统提示词绕过了这一限制。这段提示词基于公开越狱模板Little Code Sauce编写，该模板最初通过国内某论坛的插件社区传播。攻击者移除了模板中的角色扮演类绕过技巧，新增了约400行攻击指令。提示词告知模型，任何拒绝响应的行为都是故障，同时列出了需要规避的中英文拒绝话术。

这类越狱攻击手法与其他安全团队观测到的情况一致。派拓网络（Palo Alto Networks）Unit 42团队曾披露，名为BUGSTER的攻击者使用搭配Hermes Agent框架的越狱版DeepSeek V4发起攻击。该攻击者从印度一所大学窃取了超过5200份记录，其用到的越狱手段仅为简单的系统提示词覆盖。

Part02

Agent自主执行全攻击流程

该Agent几乎无需人工协助，就能独立完成从侦察到数据窃取的全流程任务。它可自主扫描网络、测试密码，在找到有效入口后部署webshell。获得权限后，它还能在不同系统间横向移动。当防御机制拦截其攻击行为时，它会自动调整攻击路径。据披露，该Agent还自行编写了替代隧道工具，针对加固后的Liferay服务器重建了漏洞利用链。

攻击者发送的指令非常简短，其中一条仅为"继续"，另一条要求Agent封堵最新的高危漏洞。攻击目标、利用的漏洞、攻击方法均由Agent自主决策。使用这套框架的攻击者无需掌握相关技术细节。

这套框架还引入了游戏化的打分机制，对每次成功入侵计分。成功横移到独立内网段的得分，远高于获取单台服务器的shell权限。防火墙控制台等安全工具相关的目标，同样对应较高分值。研究人员溯源时，框架内的总积分为3725分。这一打分规则表明，攻击者最关注负责网络监控和分区的系统。

本次研究最令人担忧的发现涉及医疗数据泄露。据披露，借助默认登录凭证，Agent获得了TrakCare系统的完整数据库管理员权限，该系统运行在老旧的Oracle 9i数据库上。此次入侵导致患者信息、疫苗接种记录、预约台账等数百万条数据暴露。Agent还导出了数千条用户账单、设备数据，并窃取了该电信运营商的加密密钥。

需要说明的是，报告摘要明确提到，上述数据泄露结果尚未通过现有材料完成独立验证，目前具体泄露规模仅为研究人员的观测结论。但攻击的根本原因非常明确：未修改的默认密码为攻击者敞开了大门。

Part03

AI驱动攻击效率远超人工

这类攻击并非个例。CrowdStrike曾披露，从10月17日开始的11天内，与中国相关的攻击组织VAPOR PANDA使用主要基于DeepSeek搭建的ARTEX框架，攻击了至少14个国家的200多家机构。该组织已确认攻入9家机构，并植入BLOODALCHEMY后门，美国、比利时、菲律宾的电信运营商也在受害之列。

攻击速度提升是这类AI驱动攻击的核心变化。CrowdStrike的Adam Meyers表示："人类入侵者通常每小时最多执行40条命令，而ARTEX的攻击活动每小时执行的命令超过1500条。"

由于这类攻击没有人工实时操作，传统的工作时间特征匹配、针对缓慢谨慎人工入侵行为的检测规则已经失效。Agent的攻击活动特征明显、行为重复，防御方需要重点监控端点与网络日志中的快速扫描、突发失败登录、异常隧道等可疑行为。

防御方需要从基础措施做起：

-   修改所有默认密码，重点排查老旧数据库系统的密码配置；
    

-   严格落实内网段隔离机制，避免跨段横向移动；
    

-   在看似无法从互联网直接访问的服务器上部署端点传感器；
    

-   持续监测开放目录与暴露的存储资源。
    

这起事件带来的启示非常明确：AI并没有创造新的安全漏洞，只是它发现旧漏洞的速度，已经超过了所有团队的补丁修复速度。

参考来源：

Jailbroken DeepSeek AI Agent Breaches European Telecom and Accesses Millions of Patient Records

https://cybersecuritynews.com/jailbroken-deepseek-ai-agent-breach/
