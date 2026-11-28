---
title: 【微信】宁夏大学马自强副教授团队在国际顶级期刊IEEE TIFS发表密文识别最新研究成果
source: https://mp.weixin.qq.com/s/CjHdSE067bLnefmWke5l4w
source_host: mp.weixin.qq.com
clip_date: 2026-11-28T20:29:07+08:00
trace_id: 7413a06d-da64-48bf-a852-acb0c919685c
content_hash: 8800663e2fe1ad1454025801c3f538f8bdfa319cb5841b7be606f8004e0a87ee
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 42675244-d011-81d0-9b47-f01b9e5ed9bd
ioc: null
---

**信息网络安全杂志** *2026年11月26日 20:00*

近日，宁夏大学院系统与应用安全研究组的论文《COMC-DBST: Cipher Operation Mode Classification via Dual-Branch Swin Transformer》获网络与信息安全领域国际顶级学术期刊《IEEE Transactions on Information Forensics and Security》（IEEE TIFS）录用。论文第一作者为学院2024级研究生蒲通骏，共同通讯作者为学院马自强副教授和中关村实验室孟令佳助理研究员。物理学院王恒教授、国家计算机网络应急响应技术小组/协调中心宁夏分中心张宁宁工程师也参与了该项研究。

分组密码的不同操作模式在块依赖结构上存在差异，但受混淆与扩散机制影响，传统一维统计指标难以充分刻画密文块间的依赖关系。基于统计特征的方法在多种加密算法与操作模式并存的场景下判别能力有限，深度学习模型对多尺度结构特征的建模尚不充分，同时缺乏针对模式混淆的决策策略和公开基准数据集。

研究团队提出了一种基于密文结构特征的分组密码操作模式分类方案COMC-DBST。该方案从不同操作模式的分组处理逻辑差异出发，挖掘密文二维化后可能呈现的可区分结构纹理。方案以完整加密文本为样本，将其转换为双尺度二维灰度图像，利用CLAHE增强结构特征，并结合双分支Swin Transformer架构，实现兼具高置信度与容错能力的操作模式分类。

COMC-DBST的总体框架如图1所示。模型首先将密文转换为双尺度灰度图像，利用CLAHE增强结构纹理；随后通过双分支Swin Transformer分别提取全局周期特征与局部链梯度信息，最后结合ECB优先硬投票机制实现高置信度分类。模型提取的是“密钥—密码算法—密码操作模式”的耦合特征。其中，密钥起主导作用，算法与操作模式提供较弱但具有判别力的信号。此类特征对IV/Nonce变化表现出较好的鲁棒性。

![image.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b0a00a865c2a6e10.png) 图 ****1** **COMC-DBST** **总体框架****

该研究提出了密文图像视觉表征与多尺度特征融合的新方法，为云数据中心等大规模信息系统的密码合规审计与评估提供了可行的技术路径。团队公开BCOMMCD数据集并开源代码，为后续研究提供基准。未来，团队将进一步探索模型在AEAD等现代认证加密场景中的扩展应用。

IEEE TIFS是网络与信息安全领域国际公认的顶级期刊，是中国计算机学会（CCF）、中国密码学会（CACR）、中国人工智能学会（CAAI）等推荐的A类国际期刊，是中科院计算机科学大类一区TOP期刊，影响因子为8.7。该期刊涵盖数据隐私保护、网络安全、密码学应用、人工智能安全等多个网络空间安全领域前沿研究方向，所刊发的成果代表了网络与信息安全领域的国际前沿水平。

论文链接 **：**

https://doi.org/10.1109/TIFS.2026.3744636

**END**

来源：宁夏大学

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/81c956483ecd785b.webp)

**信息网络安全**

《信息网络安全》创刊于2001年，是由公安部主管，公安部第三研究所、中国计算机学会主办，面向国内外公开发行的国内首批信息安全类期刊之一，于2015年成为中国科技核心期刊，2017年成为中国科学引文数据库来源期刊，2018年成为中文核心期刊，2022年入选CCF计算领域高质量科技期刊分级目录。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ab74d2f918724aeb.webp)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/db7f4654d6bb88fb.webp)

中文核心期刊

中国科技核心期刊

中国科学引文数据库来源期刊

CCF计算领域高质量科技期刊

我们在不断努力和完善中，期待您的关注和支持！
