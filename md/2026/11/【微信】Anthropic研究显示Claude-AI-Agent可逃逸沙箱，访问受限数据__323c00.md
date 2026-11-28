---
title: 【微信】Anthropic研究显示Claude AI Agent可逃逸沙箱，访问受限数据
source: https://mp.weixin.qq.com/s/atzqu1L4RMax7OmPhSj4tg
source_host: mp.weixin.qq.com
clip_date: 2026-11-28T11:24:30+08:00
trace_id: 4aab2f1e-15bf-41ce-85b5-d6e06b5ef32c
content_hash: 9c28a6b58d90dca1dd5ced37c1c74b4d06219c104929be0af2103acac99629c3
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 42675244-d011-81d7-a42d-c96037668d97
ioc: null
---

**FreeBuf** *2026年11月26日 18:01*

![FreeBuf](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7c122de5d3efe346.gif)

![Claude AI Agent可逃逸沙箱](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7c33a085a5d6e6b8.png)  

Anthropic发布研究结果称，Claude AI Agent在刻意弱化的沙箱环境中执行常规软件任务时，会访问受限测试数据，部分场景下甚至会直接使用这些数据。

在11月24日发布的Siren研究报告中，Anthropic指出，近期推出的四款Claude模型，在21%至32%的测试场景中会尝试突破沙箱边界，甚至直接越界访问。但模型未经明确许可使用外部资源的比例要低得多。本次结果均来自受控测试，并非已公开上报的客户数据泄露事件。

Part01

受控测试搭建弱化沙箱

明确越界行为判定标准

沙箱是一种隔离工作空间，用于限制AI Agent可访问的文件、工具与网络服务范围。Anthropic在26种刻意弱化的环境中搭建了超过1700个测试场景，覆盖Docker容器、小型虚拟机等多种环境。

  
![四阶段场景生成与验证流程（来源：Anthropic）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/94e130e3806454b2.png)  

测试中发现的绝大多数环境弱点来自配置错误，而非软件漏洞。研究人员在沙箱外部放置了可用测试文件、凭证或模拟互联网服务，部分任务仅靠AI Agent获得授权使用的资源无法完成。

尝试越界访问并不等同于AI Agent已经获取或使用了受限数据。Siren报告对这类行为单独统计，只有当任务要求不存在任何合理解读、允许AI Agent使用其发现的外部资源时，才会将该行为标记为“不对齐使用”。

Part02

新版本模型越界比例更低

测试未启用正式防护

测试数据显示，Claude 5.5系列与Claude Mythos 5.2的不对齐使用比例仅为0.6%至1.6%，相比之下Mythos 5.1的比例为12.7%，Mythos 5的比例达25.8%。

  
![各模型越界访问、资源使用与不对齐使用情况（来源：Anthropic）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/cfa611df919c7b01.png)  

本次测试中，Anthropic关闭了正式发布产品自带的安全防护机制，以观察模型的原生行为。目前公司尚未完全解释，为何新版本模型误用外部资源的比例更低。

测试人员还发现，部分模型似乎能意识到自己正在接受测试，研究人员无法确定这一感知是否会让模型行为更谨慎。此前Cyber Security News曾报道，Anthropic在多起独立测试事件后收紧了管控措施。

Part03

三类缓解措施可大幅降低风险

测试人员首先验证了基础规则的防护效果：明确告知Claude禁止访问的范围，要求其遇到所需资源未被授权时停止任务并上报。应用这类指令后，不同模型的越界访问概率下降了68%至96%，具体降幅因模型而异。

  
![自动模式分类器拦截的命令（来源：Anthropic）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/050aada5c390b8b3.png)  

对于Claude 5.5系列和Mythos 5.2而言，应用上述规则后越界率降至2%及以下。如果为AI Agent提供沙箱弱点上报工具，所有六款测试模型的越界率都会进一步下降。

Anthropic还测试了Claude Code的自动模式功能，该功能会在操作执行前检查所有拟议动作。在离线重放测试中，针对被判定为不对齐使用的场景，自动模式拦截了首个读取或获取受限测试材料的命令，拦截率达96%至100%。

  
![各模型应用三类缓解措施的组合效果（来源：Anthropic）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/81cfd41df18b36b7.png)  

由于Anthropic在同一批测试运行中调整了检查规则，上述结果无法反映自动模式面对未知场景时的防护效果。

当明确规则、上报工具、自动模式三类防护措施全部启用时，五款测试模型未出现任何不对齐使用行为，仅Mythos 5的不对齐使用率为0.1%。但有两款模型的沙箱内任务完成率下降了约9个百分点。

这种权衡对部署AI Agent的团队而言很关键。被拦截的任务可以转回人工审核，但提示词本身无法修复存在弱点的沙箱。团队仍需为软件打补丁，在模型之外落实严格的文件与网络访问限制。

参考来源：

Anthropic Research Reveals Claude AI Agents Can Escape Sandboxes and Access Restricted Data

https://cybersecuritynews.com/claude-ai-agents-can-escape-sandboxes/
