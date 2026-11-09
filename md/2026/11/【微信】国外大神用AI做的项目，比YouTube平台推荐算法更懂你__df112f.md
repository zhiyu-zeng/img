---
title: 【微信】国外大神用AI做的项目，比YouTube平台推荐算法更懂你
source: https://mp.weixin.qq.com/s/YogpLKS1BFWLD5XXVsrq5g
source_host: mp.weixin.qq.com
clip_date: 2026-11-09T13:12:57+08:00
trace_id: 07d9f0fc-ca27-4e6b-a2f8-b1e6894df158
content_hash: 868537a2d20a24df86fac3868e9e80f09feb25082e70297fc5b312f539cd611b
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
notion_page_id: 41375244-d011-819f-9831-e00b06e1644e
ioc: null
---

**黑客联盟l** *2026年11月9日 12:15*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/57c2d9dc64618c5a.gif)

用心做分享，只为给您最好的学习教程

如果您觉得文章不错，欢迎持续学习

## Karpathy 用 AI 做了个视频站

10 月 31 日，Karpathy 发了篇博客。周五晚上十一点，他想刷会儿 YouTube，结果被推荐页恶心到了：夸张的封面，翻来覆去的同款选题。他的原话是，这套算法对大多数人可能管用，对他不管用。

周六早上，他用 Opus 5.5 ，让它写一个 YouTube 克隆站，片源就用 Hacker News 里被推荐过的视频。

Opus 把 HN 的评论全部下载下来，过滤一遍，再用 Sonnet 在一个 Workflow 里跑，去掉垃圾内容，剩下 4 万条提到 YouTube 视频的评论。这些评论从 2007 到 2026 年间、覆盖 150 个话题的 6454 个视频。

然后套一个 YouTube 界面，买域名，推到 VPS，加固、优化。整个过程大约两小时。

![配图](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7517bec85a1d16c8.png)

Hacker News 的评论区一直有人聊技术演讲和公开课。有人看完四十分钟，回来留一句「第 23 分钟那个 demo 值得看」；也有人直接泼冷水，说这讲的是五年前的东西，别浪费时间。

这些零散的评论堆了二十年，平时想找也找不到。

模型把评论一条条过了一遍，先判断说的是哪个视频，再看是推荐还是吐槽，最后按视频聚起来，把原话一起附上。

HN 从 2007 年到现在，一天几千条。Opus 等于把整个评论区翻了一遍。

![配图](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1ef69800c906ce31.png)

YouTube 推荐看的是那一套指标：你停了多久，点没点下一个，看完没有。它的目标是让你留在站里。

HN 不一样。评论说错了会被人当面怼，吹过头会被踩下去。二十年下来，还能站住的判断，多少被社区筛过几轮。

Karpathy 自己也说，模型没做推荐，只是把散在各处的判断捞出来，排了个序。

![配图](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8ad81ba363bcd615.png)

这事对做安全的人有用。CVE 讨论、邮件列表、GitHub issue、内部工单，都是有人踩过坑之后写下的东西。以前只能 grep 加关键词，现在可以让模型读完再归类。

举个例子。把某个组件三年的 issue 全喂进去，问它哪些是误报、哪些真炸了、当时怎么修的。人工翻一周，模型半小时就搞定。

威胁情报也一样。厂商通告、研究员推特、蜜罐日志，都是半结构化文本。模型读完能大概画出谁在打哪个洞、用的什么手法。

成本也变了。HN 全部评论，从下载到部署，一个人两小时跑完。放几年前这是团队活，现在就是一张账单。门槛从有没有人手，变成了有没有语料。

![配图](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d07835f61378fa97.png)

但别把它当裁判。Karpathy 列了几个问题：模型会认错视频，会把讽刺当成推荐，评论指向不明的时候会硬编一个。他的办法是保留原始评论链接，让人能回查。

我见过有人把模型生成的漏洞摘要直接写进报告，CVE 编号是编的。这种事不新鲜。

还有个更麻烦的地方：语料本身能被污染。HN 评论区可以刷，可以带节奏，也可以埋一条看起来很内行的假推荐。模型分不清谁在演，它只会照单收下。

做安全的对这套不陌生。供应链投毒换个场景，就是把脏数据塞进训练集和检索库。以前投的是代码，现在投的是一句话。喂进去的语料有多脏，出来的结果就有多脏。

真正值钱的，是二十年里几万人自愿写下的评论。模型只是租来的工具。流程可以学，那堆带人味的语料学不走。

想复刻的话，先看自己手里有没有这样的东西。有就动手，没有就先攒。

真要动手，别一上来就啃全量。挑一个你熟的子领域，先跑一千条，看结果准不准。准了再扩，不准先改判定标准。这一步不能省。

本文仅作技术分享 切勿用于非法途径

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4572e2410eae5db1.gif)

关注【**黑客联盟**】带你走进神秘的黑客世界

安全资讯 · 目录
