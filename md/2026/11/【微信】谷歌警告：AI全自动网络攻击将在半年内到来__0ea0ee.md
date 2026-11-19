---
title: 【微信】谷歌警告：AI全自动网络攻击将在半年内到来
source: https://mp.weixin.qq.com/s/7Fgk9k3D1ShRXolW06UGjg
source_host: mp.weixin.qq.com
clip_date: 2026-11-19T12:45:36+08:00
trace_id: d1f8f7de-7fff-4b1e-972e-42b69b42c59e
content_hash: 4d081735c97868d5ece7e7a5635755e780389a8a557df2c7fe3a417a290b192d
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 8
  succeeded: 8
  failed_urls: []
notion_page_id: 41d75244-d011-8170-a378-e09ed5e38eed
ioc: null
---

**内生安全联盟** *2026年11月18日 11:36*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e1644555022cc2fb.gif)

谷歌威胁情报部门发布最新报告称，AI智能体攻击活动已经突破重大门槛，已有威胁组织在攻击法国系列目标时，攻击智能体实现了漏洞发现到利用全程自动化；

近期全球也出现了大量基于AI智能体的网络攻击，大量组织中招导致数据泄露乃至更严重影响，甚至FBI也点名警告ARTEX等渗透测试智能体；

据谷歌预测，预计半年内，将会出现技术复杂、完全自主的智能体攻击，这将对全球的关键基础设施网络防护造成巨大压力。

11月17日消息，攻击者正开始借助AI驱动的攻击框架构建智能体工作流，自动发现并利用软件漏洞，让攻击速度快得像机器自动运行一样。

谷歌威胁情报小组（GTIG）发现，AI最初只是在攻击流程中用作一些试验性应用，如今已被大规模用于网络攻击。使用者既包括以经济利益为目的的黑客组织，也包括国家支持的黑客组织。

其中一个典型案例是，攻击者使用开源多智能体渗透测试框架CAIRN，对美国航空航天领域发动攻击。另一起案例中，疑似朝鲜黑客利用Claude Code投放恶意软件。

研究人员预计，未来三个月内，攻击者将能够发动一些技术门槛较低的攻击。这类攻击几乎不需要人工参与，主要依靠多个AI智能体协同完成。

他们还预测，未来六个月内，很可能会出现技术复杂、完全自主的智能体攻击。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d30ea82cb3345b89.jpg)

图：AI在网络攻击中的应用演变

上周，美国联邦调查局（FBI）发布警告称，自8月以来，多个攻击者已开始将ARTEX AI渗透测试框架武器化，并以金融、政府、科技、国防、医疗卫生等领域的机构为目标发动攻击。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/786c24899692d789.gif)

利用AI发现并利用漏洞

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/be25726eb5b260aa.gif)

谷歌表示，攻击者正有意滥用开源渗透测试工具套件，实施全自动化攻击。相关工具包括ARTEX、CAIRN、CyberStrikeAI和HexStrike AI。

攻击者利用这些框架，针对暴露在互联网上、漏洞相对简单的系统发动自适应攻击。大模型（LLM）能够轻易针对这类漏洞生成攻击代码。

谷歌威胁情报小组在其《AI威胁追踪报告》中披露了一起案例：黑客利用名为“exploit_agent”的多智能体系统，对法国媒体、娱乐和教育类网站发动攻击，从漏洞发现到漏洞利用全程自动化。

谷歌表示：“在过去一个季度中，GTIG首次发现攻击者利用大模型框架，在没有人工介入的情况下，完全自动化地完成漏洞发现和利用。”

“具体而言，GTIG发现了一台对外暴露的测试服务器。该服务器托管着一个用于漏洞研究和攻击武器化的多智能体框架，名为exploit_agent。该框架能够接入多个前沿大模型和本地部署的大模型。”

谷歌通过攻击者对外暴露的测试服务器发现了这一框架。服务器中还存有被盗取的受害者数据、侦察信息、WebShell以及暴力破解脚本。

该系统能够分析热门Web应用的软件更新，寻找可能存在的安全漏洞，并自动尝试利用这些漏洞发动攻击。

谷歌警告称，此类框架投入攻击后，大幅压缩了防御方修补系统漏洞的时间，同时也会产生大量误导性信息，加重安全防护工作的负担。

研究人员以近期的PHP2Shell事件为例指出，PHP官方公布两个漏洞后不久，网上便出现了数百个所谓的概念验证（PoC）漏洞利用代码，其中大部分由AI生成。这给防御人员带来了额外压力，他们不得不逐一验证代码，并制定相应的防护措施。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/298d879ac51908ef.jpg)

图：每月遭利用的漏洞数量

AI在网络攻击中的其他利用趋势

除自动化攻击外，谷歌还发现，一个代号为UNC6836的攻击集群近期利用经过修改的Claude Code，针对北美和欧洲的加密货币企业发动了多起攻击。该集群疑似与“Midnight Neptune”有关联。

攻击者初步入侵目标系统后，修改了Claude Code应用的设置，使其在启动时自动下载名为SOMBERMEME的后门程序。

谷歌报告还指出，国家支持的组织、商业供应商和政治网络已开始常态化利用AI开展舆论影响活动。

此外，大模型劫持（LLMjacking）已成为普遍问题。攻击者正越来越多地把它当作新的牟利渠道，受害机构则因此承担高昂成本。

**参考资料：bleepingcomputer.com**

来源：安全内参

[【征稿启事】2026 IEEE网络韧性与内生安全国际会议（IEEE CRESS 2026）相约南京，诚邀投稿！](https://mp.weixin.qq.com/s?__biz=Mzg4MDU0NTQ4Mw==&mid=2247540726&idx=1&sn=b9402b72bbf0adc75cef49f7bbd0bd49&scene=21#wechat_redirect)

****| 推荐阅读****

**[AI4E如何重构数字生态系统网络发展范式？](https://mp.weixin.qq.com/s?__biz=Mzg4MDU0NTQ4Mw==&mid=2247532455&idx=1&sn=ee5102d94087e9440ede67b18386c621&scene=21#wechat_redirect)**

**[资料下载 | 十五五规划建议全文及说明](https://mp.weixin.qq.com/s?__biz=Mzg4MDU0NTQ4Mw==&mid=2247534593&idx=2&sn=7f9516f40cbafbcb1012d5999612157a&scene=21#wechat_redirect)**

**[《科技日报》整版访谈邬江兴院士：将“安全基因”植入人工智能系统](https://mp.weixin.qq.com/s?__biz=Mzg4MDU0NTQ4Mw==&mid=2247537206&idx=1&sn=2ce618202d759560ecee6aeca93b8c24&scene=21#wechat_redirect)**

[重磅发布 | 行业首部《智能网联汽车内生安全白皮书》，智己LS9 Hyper全球首搭中国原创内生安全系统](https://mp.weixin.qq.com/s?__biz=Mzg4MDU0NTQ4Mw==&mid=2247540505&idx=1&sn=db8e714a57b8bf3dad9268b996fb5a44&scene=21#wechat_redirect)

[邬江兴院士：构建内生安全质量检测体系，筑牢人类可控可信 AI 根基](https://mp.weixin.qq.com/s?__biz=Mzg4MDU0NTQ4Mw==&mid=2247539044&idx=1&sn=1791fd1aad5f130fe5d87c46cc4b8687&scene=21#wechat_redirect)

[人工智能内生安全让“千里马”跑得快又跑得稳——邬江兴院士解读AI安全应对新思路](https://mp.weixin.qq.com/s?__biz=Mzg4MDU0NTQ4Mw==&mid=2247540081&idx=1&sn=7abcebf943fbb1723bc747b626f90087&scene=21#wechat_redirect)

[中国工程院院士邬江兴：从“概率性”中构建“确定性”，以内生安全范式破解大模型安全困局](https://mp.weixin.qq.com/s?__biz=Mzg4MDU0NTQ4Mw==&mid=2247540750&idx=1&sn=412b1fca972cda7fe628429d14ea6a7a&scene=21#wechat_redirect)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8309b3df15982848.gif)

热点新闻 · 目录
