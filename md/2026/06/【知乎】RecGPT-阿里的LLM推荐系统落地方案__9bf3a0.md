---
title: 【知乎】RecGPT-阿里的LLM推荐系统落地方案
source: https://zhuanlan.zhihu.com/p/1963825375902699535
source_host: zhuanlan.zhihu.com
clip_date: 2026-06-05T11:55:47+08:00
trace_id: 4bb43454-d326-4513-9278-ec639761d84c
content_hash: 7ca1ee4b1a44ab6e7227c4af742bf3b6b406279b9336b3746ee08ac7dee23aa9
status: synced
tags:
  - 知乎
  - AI应用
series: null
ai_summary: RecGPT通过大语言模型挖掘用户兴趣并预测商品标签，为传统协同过滤推荐系统补充了关键的语义信息，在召回阶段带来了核心指标超过5%的提升。
ai_summary_style: key-points
images_status:
  total: 19
  succeeded: 19
  failed_urls: []
notion_page_id: 3ab75244-d011-81d0-8e68-fd0ba7da2a94
---

> 💡 **AI 总结（key-points）**
>
> RecGPT通过大语言模型挖掘用户兴趣并预测商品标签，为传统协同过滤推荐系统补充了关键的语义信息，在召回阶段带来了核心指标超过5%的提升。
> 
> - **创新架构：** 采用用户-物品-标签（Tag）三塔结构，其中Tag塔利用LLM生成的用户兴趣标签来计算语义相关性得分，与传统的用户-物品协同过滤得分加权融合，增强了召回多样性。
> - **LLM核心作用：** 包含两个核心模块：1) LLM用户兴趣挖掘模块（LLM_UI），将用户属性和行为历史抽象为结构化兴趣集合；2) LLM商品标签预估模块（LLM_IT），将兴趣进一步细化为更细粒度的、适合召回的商品标签。
> - **工程落地方案：** 对用户行为序列进行压缩（仅保留购买、加购等强兴趣行为），以控制输入LLM的数据量。推荐可解释性通过离线预计算实现：为用户兴趣与商品对预先生成推荐原因并存入查询表，线上直接调用以满足低延迟要求。
> - **模型训练与评估：** 微调采用三步策略：多任务微调、利用DeepSeek R1生成数据进行预对齐、以及基于模型自生成数据与评估的持续进化。评估创新性地采用“LLM as a Judge”方法，通过少量人工样本训练一个LLM评估器，形成“人类监督LLM Judge，LLM Judge监督模型”的高效闭环。
> - **实用建议：** 中小团队可直接使用未经微调的开源模型（如DeepSeek R1）执行LLM任务，以较低成本获得大部分效果提升，实现降本增效。

![RecGPT-阿里的LLM推荐系统落地方案](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/61bdb3ee0b29258c.png)

RecGPT-阿里的LLM推荐系统落地方案

[](https://www.zhihu.com/column/wangzhenotes)

[收录于 · 王喆的机器学习笔记](https://www.zhihu.com/column/wangzhenotes)

107 人赞同了该文章

目录

这里是「 **[王喆的机器学习笔记](https://www.zhihu.com/column/wangzhenotes)** 」的第四十九篇文章，今天我们讲一讲阿里的 [LLM推荐系统](https://zhida.zhihu.com/search?content_id=264689129&content_type=Article&match_order=1&q=LLM%E6%8E%A8%E8%8D%90%E7%B3%BB%E7%BB%9F&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODA4MDQ1NDYsInEiOiJMTE3mjqjojZDns7vnu58iLCJ6aGlkYV9zb3VyY2UiOiJlbnRpdHkiLCJjb250ZW50X2lkIjoyNjQ2ODkxMjksImNvbnRlbnRfdHlwZSI6IkFydGljbGUiLCJtYXRjaF9vcmRlciI6MSwiemRfdG9rZW4iOm51bGx9.SH5jBoeaARJ-7D5WrKHGx4nF-gzNUW38bqtV986HX78&zhida_source=entity) 落地方案——RecGPT。

RecGPT主要是在两个方向落地，一个是召回，一个是推荐可解释性。召回方案的落地带来了效果的大幅提升。下图可以看到，CTR、 [IPV](https://zhida.zhihu.com/search?content_id=264689129&content_type=Article&match_order=1&q=IPV&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODA4MDQ1NDYsInEiOiJJUFYiLCJ6aGlkYV9zb3VyY2UiOiJlbnRpdHkiLCJjb250ZW50X2lkIjoyNjQ2ODkxMjksImNvbnRlbnRfdHlwZSI6IkFydGljbGUiLCJtYXRjaF9vcmRlciI6MSwiemRfdG9rZW4iOm51bGx9.8GzpKQlxxS5eR3yfzkMWuNtCtWrZiTAbrBR4rhEa8H8&zhida_source=entity) 等核心指标有超过5%的提升，是非常亮眼的数据。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/a2e6dd8551a34ce8.png)

RecGPT主要线上效果指标

我们之前讲过，推荐系统任何效果上的提升都来自两方面，一是增量信息，二是模型能力。RecGPT的效果归因主要在于前者。LLM通过理解物品相关语义信息，以及用户行为中包含的语义信息，为推荐系统召回逻辑带来了自己的知识理解，从而提升了召回的多样性。这是对于传统推荐系统单纯利用id类的 [协同过滤](https://zhida.zhihu.com/search?content_id=264689129&content_type=Article&match_order=1&q=%E5%8D%8F%E5%90%8C%E8%BF%87%E6%BB%A4&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODA4MDQ1NDYsInEiOiLljY_lkIzov4fmu6QiLCJ6aGlkYV9zb3VyY2UiOiJlbnRpdHkiLCJjb250ZW50X2lkIjoyNjQ2ODkxMjksImNvbnRlbnRfdHlwZSI6IkFydGljbGUiLCJtYXRjaF9vcmRlciI6MSwiemRfdG9rZW4iOm51bGx9.1WOyo2NKQ-woD4KjcbNLkw-Gj70RKYYGep8YqNvP9Gg&zhida_source=entity) 信息的有效补充。

## RecGPT的召回模型设计

下面是RecGPT召回模型的设计，一个三塔结构。右边的用户塔和物品塔没有什么可多讲的，典型的双塔结构；左边的Tag塔是RecGPT独有的，简单来说，RecGPT通过理解商品和用户信息把大模型的能力浓缩进了Tag塔，这也是召回效果增量的全部来源。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/e2826370b2988f47.png)

RecGPT的召回模型架构

最终的召回得分是user-item双塔和tag-item双塔的加权，宏观上来说，user-item双塔得分学习的是传统推荐系统里用户行为之间的协同过滤相关性；而tag-item双塔得分学习的是用户兴趣意图和物品内容信息的语义相关性。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/f84779a85975ea19.png)

创新点和问题的关键就是tag-item得分是怎么得出来的。item embedding的生成方式没有什么特别的，就是把item相关的属性转换成embedding，再用一个DNN学习item的emb表达，很经典DLRM的方式。那么这里的tag是什么呢？

**tag其实是RecGPT利用大模型的能力学习出来的用户感兴趣的商品标签的集合。**

所以tag塔的输入是一组商品标签。这组商品标签是大模型通过语义相关性分析出来的用户可能感兴趣的商品标签。而tag塔的输出就是这一组商品标签embedding化后的mean pooling。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/4e0956c93bee6a0d.png)

现在问题就又聚焦了，这组用户感兴趣的商品标签是怎么生成的？分为两步，第一步是利用用户兴趣挖掘模块 [LLM_UI](https://zhida.zhihu.com/search?content_id=264689129&content_type=Article&match_order=1&q=LLM_UI&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODA4MDQ1NDYsInEiOiJMTE1fVUkiLCJ6aGlkYV9zb3VyY2UiOiJlbnRpdHkiLCJjb250ZW50X2lkIjoyNjQ2ODkxMjksImNvbnRlbnRfdHlwZSI6IkFydGljbGUiLCJtYXRjaF9vcmRlciI6MSwiemRfdG9rZW4iOm51bGx9.Wxh2noXm1NhF8EOwBTf9ft9X7v1S4PATgXXio466-1o&zhida_source=entity) 来挖掘用户兴趣，然后再把用户兴趣输入另外一个大模型模块——商品标签预测模块 [LLM_IT](https://zhida.zhihu.com/search?content_id=264689129&content_type=Article&match_order=1&q=LLM_IT&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODA4MDQ1NDYsInEiOiJMTE1fSVQiLCJ6aGlkYV9zb3VyY2UiOiJlbnRpdHkiLCJjb250ZW50X2lkIjoyNjQ2ODkxMjksImNvbnRlbnRfdHlwZSI6IkFydGljbGUiLCJtYXRjaF9vcmRlciI6MSwiemRfdG9rZW4iOm51bGx9.67boZqolslsDe0yhHjwEG6VfUikiWXbixB3pgQo3QNY&zhida_source=entity) 来生成商品标签。下面就让我看看这两个模块分别是如何工作的。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/5d17e18812cf688e.png)

## LLM用户兴趣挖掘模块

用户兴趣挖掘模块是这样一个大模型任务，它会利用LLM的能力把用户的属性和行为历史抽象成用户的兴趣点。它的prompt把这个任务描绘的很清晰。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/1228ab03da4b42a0.png)

用户兴趣挖掘模块的Prompt

任务的输入是用户的一些属性信息和用户的行为历史，输出是用户的兴趣集合（文本形式）。当然，这里面肯定是要把兴趣相关的标签体系，任务的具体要求（Mandatory Requirement）作为prompt的一部分输入进去，这样才能生成结构化的兴趣集合。文中给出了一个例子如下，大家可以有个直观认知。作为落地方案，这个兴趣集合其实直接采用电商平台的商品分类体系，广告平台的定向分类体系就很合适，而且易于跟现有平台融合。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/c6355c6b03589dce.png)

## LLM商品标签预估模块

接下来的商品标签预估模块是要进一步把用户兴趣细化，变成更细粒度的，更适合推荐系统召回层使用的商品标签。定义该任务的prompt也不难理解，具体的形式如下：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/d07996048e2b99ac.png)

商品标签预估模块的Prompt

可以看到，标签预估模块其实不仅把刚刚生成的用户兴趣作为输入，而且还把原始的用户属性和用户行为输入进去了。为什么要这么做？我刚开始也有点疑惑，直接把用户兴趣模块去掉，让大模型基于用户属性和原始行为信息推测商品标签不好吗？为什么要加一步呢？

我推测主要有两点原因：

1.  用户兴趣模块起到了一个兴趣泛化的作用，利用这一步把用户的兴趣先提炼出来，让标签预测模块预测时能够在相对大，但是有针对性的兴趣范围内进行细粒度的标签预测。
2.  利用了大模型CoT（思维链）的思考方式，把问题拆解的更清晰，让大模型通过多步任务的出更稳定和合理的标签预测结果。

另外一个思考方向是能不能只把用户兴趣作为输入，舍弃原始的用户行为序列。这样做肯定是不行的，因为我们期望的输出是相比用户兴趣更细粒度的商品标签，必须有更丰富的原始信息输入，才能做到标签的细化。

总而言之，通过标签预测模块，我们可以得到用户喜欢的一批商品标签，下面是一个具体的例子。可以看到，标签预估模块生成的tag相比用户interest，粒度更细，更接近商品描述本身，这更有利于推荐系统更精准的找到相关商品。在生成标签列表之后，就可以通过tag-item-user三塔模型进行商品召回了。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/0ec462b9fc7ff0f9.png)

## RecGPT的行为序列压缩技巧

整个RecGPT的框架其实让我想到了在LLM4Rec初期，Amazon提出的框架PALR，PALR也是通过prompt任务生成用户profile，并利用profile和用户行为历史完成候选物品的召回和推荐。但PALR更类似一个toy system，没有看到它的线上指标。RecGPT显然是一个更有工业风，与成熟的推荐系统架构融合的更好的方案。这种工业风主要体现在细节的处理上，比如序列数据的压缩。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/dc246b86f9c80bd4.png)

对于用户行为序列，如果我们不加处理的输入LLM，会存在一些问题，比如信息密度过低，序列长度超出LLM限制等。所以RecGPT方案采取了一系列的序列压缩方案：

1.  只采用有明确兴趣指向的行为，比如购买，添加购物车，喜欢，搜索等。对于弱兴趣意图的行为比如点击、阅读评论等则不加入行为序列；
2.  商品信息压缩。只把关键的能代表商品信息，比如名称、类别、品牌等作为商品信息；
3.  对用户行为进行时间上和item级别的压缩。比如把固定时间段内的重复行为合并，把经常同时出现的item聚合在一起汇总行为序列等。最终的行为序列是下面的表达，是几个物品item1，item2，在不同时间段time1，tme2上的行为序列汇总，这样大幅压缩了原始序列的体积，同时保留了关键的item相关性和时间相关性的信息。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/cd5b8542db24730d.png)

## 推荐可解释性

相比于推荐召回的改进工作，RecGPT更进一步用LLM给出了推荐原因。这样在产品界面中把推荐原因展现给用户，有可能进一步提升用户的购买兴趣。RecGPT的推荐归因prompt如下：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/6948098dd9e04924.png)

RecGPT的推荐归因Prompt

Prompt定义的输入主要是用户兴趣，当前时间和商品信息。所以归根结底，RecGPT没有采用特别复杂的Prompt，而是主要发掘用户兴趣和推荐商品的关联性。如果把用户的所有行为历史都输入进来，那势必会让推荐归因的结果五花八门，不太可控。而简单易于理解的归因也可以让用户不会感到意外。

通过这个例子，我们也可以学习RecGPT给我们提供的非常好的prompt engineering的范例。Role，Input，Requirements，Output可以视为一个严谨的prompt设计的必要元素。另外Prompt中的Core Reasoning Steps是一个很好的利用LLM CoT能力的设计，把推荐归因生成分裂成了“上下文理解”和“解释生成”两步，增强了归因的稳定性。

另外团队也给出了线上推理的建议。由于大模型线上实时做inference，无论从latency还是资源消耗的角度来说都是不可接受的。所以解释生成的过程是在离线预处理的。把用户兴趣x商品集合进行逐对离线分析，把推荐原因记录在lookup table，线上为用户推荐时就可以直接根据用户兴趣和推荐出的商品查询出推荐原因。这也是一个比较实用的工程技巧。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/db8cc73b30e6f981.png)

推荐归因的离线工程架构

至此，整个RecGPT的框架就介绍完了，我们再列出整个系统的框图，大家可以整体性回顾一下：用户兴趣挖掘模块挖掘用户兴趣供商品标签预测模块和推荐归因模块使用。标签预测模块生成商品标签供召回层使用，召回层利用了商品标签包含的语义相关性信息，丰富了召回的多样性带来效果提升。推荐归因模块离线生成用户兴趣x物品的推荐原因，最后跟推荐结果一起展示给用户。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/a4eb658c695c9288.png)

## RecGPT的大模型微调和评估

但到这里，我们还要回答两个关键的问题。

1.  RecGPT是直接使用 [DeepSeek](https://zhida.zhihu.com/search?content_id=264689129&content_type=Article&match_order=1&q=DeepSeek&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODA4MDQ1NDYsInEiOiJEZWVwU2VlayIsInpoaWRhX3NvdXJjZSI6ImVudGl0eSIsImNvbnRlbnRfaWQiOjI2NDY4OTEyOSwiY29udGVudF90eXBlIjoiQXJ0aWNsZSIsIm1hdGNoX29yZGVyIjoxLCJ6ZF90b2tlbiI6bnVsbH0.kEnewWTCad7POOy-TPm2VyDGbQxnYZtbUuNNELK3SIc&zhida_source=entity) 这类开源的大模型呢？还是经过了一些fine tunning的训练过程？
2.  LLM各模块的评估是如何完成的？

关于问题一，文中比较了两个未经fine tuning的大模型DeepSeek-R1和阿里的 [Qwen3](https://zhida.zhihu.com/search?content_id=264689129&content_type=Article&match_order=1&q=Qwen3&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODA4MDQ1NDYsInEiOiJRd2VuMyIsInpoaWRhX3NvdXJjZSI6ImVudGl0eSIsImNvbnRlbnRfaWQiOjI2NDY4OTEyOSwiY29udGVudF90eXBlIjoiQXJ0aWNsZSIsIm1hdGNoX29yZGVyIjoxLCJ6ZF90b2tlbiI6bnVsbH0.avDWni0WCGVYrVcbDtaqf49nGGNy2Obg_yYp6MJ4Zkg&zhida_source=entity) ，和经过fine tuning的模型Qwen3-SFT和 [TBStars-SFT](https://zhida.zhihu.com/search?content_id=264689129&content_type=Article&match_order=1&q=TBStars-SFT&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODA4MDQ1NDYsInEiOiJUQlN0YXJzLVNGVCIsInpoaWRhX3NvdXJjZSI6ImVudGl0eSIsImNvbnRlbnRfaWQiOjI2NDY4OTEyOSwiY29udGVudF90eXBlIjoiQXJ0aWNsZSIsIm1hdGNoX29yZGVyIjoxLCJ6ZF90b2tlbiI6bnVsbH0.Axa0etXFX7iKzngNWDkQDPkpCnOXumPqyndR2JpvB-I&zhida_source=entity) 的效果。采用的测试集是人工生成的测试用例。

在用户兴趣生成任务上，几个模型的表现如下：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/525f283d1de2b705.png)

在商品标签预测任务上，几个模型的表现如下：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/dd89a625220814cc.png)

可以看到，DeepSeek-R1在两个任务上均展现出了很高的通过率。这也给中小团队一些启发，如果没有资源和精力进行fine tuning，其实用开源的DeepSeek-R1就是非常好的选择。对于阿里这样的一线团队来说，他们除了采用阿里千问的大模型Qwen3作为基座模型，还使用了专门用于电商业务的TBStars模型进行fine tuning，该模型仅有3.5B参数，也达到了不错的效果，是线上部署比较节约资源的工程方案。

关于fine tuning的过程，用户兴趣、标签预测、推荐归因这三个任务基本都采用了三步走的策略：

1.  **多任务微调。** 利用16个预先准备好的微调训练集，总共16.3k个训练样本进行模型微调。让模型更适合处理电商类的任务。比如这些训练集中包括商品关键信息提取，用户画像分析，推荐归因等。
2.  **推理增强预对齐** 。利用DeepSeek R1生成针对任务的高质量训练集，并经过人工精选和整理，形成预对齐训练集。经过这一步训练，模型会显著增强完成特定任务的能力。
3.  **自训练进化** 。建立了 **模型自生成样本 -> Human-LLM协同评估 -> 模型持续学习 的闭环** 。模型能够持续进化提升效果。这里面的关键是Human-LLM协同评估，等会我们再细讲。

下面这个图概括了整个的fine tuning的过程。三个任务的不同之处在于Data Quality Control的区别，不同的任务会用不同的标准来评估模型结果。用户兴趣模块是Willingness和Reasonableness，标签预测是Relevance Consistency Specificity Validity，推荐归因是Relevance Factuality Clarity Safety。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/46484936de8135c1.png)

至此，我们也介绍完了大模型fine tuning的框架。最后只剩一个问题，也是RecGPT的最后一个创新点，就是大模型任务的评估，这里使用了大模型领域非常关键的评估技术LLM as a Judge。

其实评估大模型在特定任务上的效果一直比较困难。因为人工生成大量测试集是一个非常昂贵的过程。LLM as a judge的思路是利用少量的人工测试集，教会LLM自己进行效果评估。如下图所示，RecGPT是把三个任务的通过样本（Approved Judge Samples）以及拒绝样本（Rejected Judge Samples）先保存到Judge Data Buffer，然后再通过数据再平衡，简单来说就是把量比较少的样本类别进行增强，把量比较大的样本类别进行降采样，形成一个比较平衡的样本集合，供LLM进行微调，微调成一个LLM Judge。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/99352a6e6259813c.png)

LLM as a Judge的数据准备过程

LLM Judge微调完成后，也不是一劳永逸的，还需要经过阶段性的人工检查。也就是说人会定期生成一些测试样本，不断测试LLM Judge的效果，再不断把LLM Judge分类错的例子教给它，不断优化LLM judge的效果。这样就形成了 **人类监督LLM Judge，LLM Judge监督SFT-LLM** 的链条。这一链条大幅降低了人类参与的工作量。只需要用少量的人工样本测试LLM Judge即可。

## 总结与启发

至此我们完成了RecGPT框架性的介绍。原文是一篇细节满满的文章，我还是推荐大家去读一读。

整体来说，RecGPT的工作还是工业风拉满，很实用，而且我相信线上效果会是很solid的结果，因为语义信息增量确实是之前推荐系统召回层比较少利用的信号，原理上讲的通。

对于中小团队来说，也可以寻求降级版本，就是省略掉RecGPT模型微调的部分，直接用DeepSeek完成三个大模型任务，然后与推荐系统召回层做整合，从文中的性能比较来看，DeepSeek R1与微调模型效果上差距并不明显，所以使用20%的力量完成80%的工作显然是划算的。

此外，文中对于离线-线上配合，召回层整合方案，Prompt编写，LLM as a Judge的设计都非常简洁实用，一看就是冲着落地去的。相信一线业务团队会喜欢RecGPT的方案。

最后还是留两个问题供讨论：

1.  **你觉得拆开用户兴趣模块和标签预测模块合理吗？直接用LLM预测商品标签是不是更直接，架构上更简洁？**
2.  **RecGPT本质上是一个召回方案。能融合到排序模型里面去吗？怎么融合？**

欢迎关注公众号： **王喆的AI笔记**

发布于 2025-10-22 07:16・美国

[](https://www.zhihu.com/topic/25402720)

[大模型](https://www.zhihu.com/topic/25402720)

[](https://www.zhihu.com/topic/19563024)

[推荐系统](https://www.zhihu.com/topic/19563024)

[豆包疑误导老人断指泡盐水致残 477 万](https://www.zhihu.com/search?q=%E8%B1%86%E5%8C%85%E7%96%91%E8%AF%AF%E5%AF%BC%E8%80%81%E4%BA%BA%E6%96%AD%E6%8C%87%E6%B3%A1%E7%9B%90%E6%B0%B4%E8%87%B4%E6%AE%8B&search_source=Trending&utm_content=search_hot&utm_medium=organic&utm_source=zhihu&type=content) 热

[王楚钦任国乒男队队长 433 万](https://www.zhihu.com/search?q=%E7%8E%8B%E6%A5%9A%E9%92%A6%E4%BB%BB%E5%9B%BD%E4%B9%92%E7%94%B7%E9%98%9F%E9%98%9F%E9%95%BF&search_source=Trending&utm_content=search_hot&utm_medium=organic&utm_source=zhihu&type=content) 热

[宁夏事业编考生因围报被取消资格 355 万](https://www.zhihu.com/search?q=%E5%AE%81%E5%A4%8F%E4%BA%8B%E4%B8%9A%E7%BC%96%E8%80%83%E7%94%9F%E5%9B%A0%E5%9B%B4%E6%8A%A5%E8%A2%AB%E5%8F%96%E6%B6%88%E8%B5%84%E6%A0%BC&search_source=Trending&utm_content=search_hot&utm_medium=organic&utm_source=zhihu&type=content) 热

[宝妈称带孩子去山姆是托举引争议 354 万](https://www.zhihu.com/search?q=%E5%AE%9D%E5%A6%88%E7%A7%B0%E5%B8%A6%E5%AD%A9%E5%AD%90%E5%8E%BB%E5%B1%B1%E5%A7%86%E6%98%AF%E6%89%98%E4%B8%BE%E5%BC%95%E4%BA%89%E8%AE%AE&search_source=Trending&utm_content=search_hot&utm_medium=organic&utm_source=zhihu&type=content) 热

[官方通报女大学生被骗入戒网瘾学校 327 万](https://www.zhihu.com/search?q=%E5%AE%98%E6%96%B9%E9%80%9A%E6%8A%A5%E5%A5%B3%E5%A4%A7%E5%AD%A6%E7%94%9F%E8%A2%AB%E9%AA%97%E5%85%A5%E6%88%92%E7%BD%91%E7%98%BE%E5%AD%A6%E6%A0%A1&search_source=Trending&utm_content=search_hot&utm_medium=organic&utm_source=zhihu&type=content) 热

[AI脸引发网友生理性厌恶 318 万](https://www.zhihu.com/search?q=AI%E8%84%B8%E5%BC%95%E5%8F%91%E7%BD%91%E5%8F%8B%E7%94%9F%E7%90%86%E6%80%A7%E5%8E%8C%E6%81%B6&search_source=Trending&utm_content=search_hot&utm_medium=organic&utm_source=zhihu&type=content) 热

[苹果液态金属铰链折叠屏 317 万](https://www.zhihu.com/search?q=%E8%8B%B9%E6%9E%9C%E6%B6%B2%E6%80%81%E9%87%91%E5%B1%9E%E9%93%B0%E9%93%BE%E6%8A%98%E5%8F%A0%E5%B1%8F&search_source=Trending&utm_content=search_hot&utm_medium=organic&utm_source=zhihu&type=content) 热

[粉笔CEO张小龙骂学生 297 万](https://www.zhihu.com/search?q=%E7%B2%89%E7%AC%94CEO%E5%BC%A0%E5%B0%8F%E9%BE%99%E9%AA%82%E5%AD%A6%E7%94%9F&search_source=Trending&utm_content=search_hot&utm_medium=organic&utm_source=zhihu&type=content)
