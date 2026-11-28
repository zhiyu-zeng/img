---
title: 【微信】山东大学网络空间安全学院密码顶会EUROCRYPT 2026成果解读 | 面向DL相关性的逐轮近似分析方法
source: https://mp.weixin.qq.com/s/p0IoMzE6inqq3bgtwkMZnw
source_host: mp.weixin.qq.com
clip_date: 2026-11-28T19:29:05+08:00
trace_id: 65bf27d7-32dc-439b-8ebc-239270b6e251
content_hash: 1fe3b8f297ae316be19d4379b0c232248392b9f636ca2acf324091c71fdf4352
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
notion_page_id: 42675244-d011-8162-a7a4-c3095898b4f7
ioc: null
---

**信息网络安全杂志** *2026年11月26日 20:00*

**（ 一 ） 引子**

DL 分析由 Langford 和 Hellman 于 1994 年提出，其基本思想是把 differential 分析和 linear 分析结合起来：攻击者固定输入差分，再观察输出差分上的某个线性组合是否具有非随机相关性。如果相关性明显偏离 0，就可以构造区分性质。

传统方法通常把目标算法切成两段，前半段找高概率 differential characteristic，后半段找高相关 linear approximation，再把二者连接起来。这种方法直观但不够精确。后来 DLCT、DATF、HATF 等方法提高了估计精度，但仍然存在两个问题：一是很多方法在轮数增加后计算成本很高；二是它们主要服务于常规 S-box 型算法，对使用大规模 χ 函数的算法支持有限。高阶 DL 分析也面临类似问题，已有工具更少。

几何方法为重新理解这些攻击提供了统一语言。理论上， DL 相关性可以通过高维线性空间中的矩阵传播来精确表示。但如果沿着 trail 逐条枚举，计算量会迅速失控。 山东大学网络空间安全学院 EUROCRYPT 2026 成果 “ Round-Based Approximation of (Higher-Order) Differential-Linear Correlation: A Geometric Approach Perspective ” 的动机正是绕开这种枚举，用更轻量的逐轮近似来估计相关性。

## （二）论文速览

文章 的核心观察是：一个 DL 区分性质的相关性，可以看成密文多重集对应相关向量中的一个坐标。对密码的二元形式构造相关矩阵后，明文多重集的相关向量经过该矩阵传播，就得到密文侧的相关向量。

直接计算完整矩阵仍然不可行，因此作者采用逐轮近似。对于典型 SPN 结构，S-box 层可以按小块精确计算；线性层会打散这些小块，作者用独立性近似把整体相关向量重新分解为若干局部向量。这样，算法可以逐轮更新这些局部向量，避免保存和计算完整状态空间。

论文还分析了轮密钥异或对相关性的影响。在平均密钥设置下，值掩码可以安全地置零；在固定密钥或常数异或场景下，轮密钥异或主要带来符号翻转。为了提高精度，作者还允许前若干轮使用 differential 部分显式传播，再对剩余轮数使用逐轮近似。

对于 Subterranean-2.0 和 Koala-p 这类使用 257-bit χ 函数的算法，普通 S-box 方法不能直接套用。论文进一步推导 χ 及其二元形式的相关传播规则，用递归矩阵乘法处理大 χ 层。最后，作者把同样思想扩展到高阶 DL 分析，用于搜索二阶区分性质。

论文首先在 Ascon 和 Present 上验证方法。对于 Ascon 初始化阶段，本文方法能复现 4 轮相关性为 1 的已知结果，并把 5 轮 Ascon-128 初始化的相关性估计为 2^-8.94，与实验值一致。针对 NIST 标准化后更受关注的 Ascon-128a，论文给出 6 轮初始化阶段的 DL 区分结果，理论相关性为 2^-23.89。对于 Ascon-p，论文也给出 6 轮结果，相关性约为 2^-21.89。

在 Present 上，已有 DLCT 类方法给出的最好结果为 13 轮。本文方法不仅验证了这些结果，而且进一步搜索到 17 轮 DL 区分结果，比此前最好结果多 4 轮。这说明逐轮近似不仅能做精度估计，也能作为有效的自动化搜索工具。

对于基于 χ 的算法，论文分析了 Subterranean-2.0 和 Koala-p。二者都采用 257-bit χ 作为非线性层。作者分别给出 5 轮和 6 轮 DL 区分结果，其中 5 轮结果经过随机实验验证，理论值与实验值接近。相较已有 differential 和 linear 区分结果，这些结果多覆盖 2 轮。

在高阶 DL 场景下，论文给出 6 轮 Ascon-128 初始化阶段的二阶区分结果，理论相关性约为 2^-45.35，这是首次在该目标上得到 6 轮有效的 DL-like 结果。对于 Subterranean-2.0 和 Koala-p，论文分别给出最高 7 轮的二阶结果，理论相关性约为 2^-90.99 和 2^-86.24。作者也尝试了 8 轮预测，但认为此时误差可能已经超过信号，因此没有把 8 轮结果视为可靠结论。

## （三）深度剖析

文章 提出的逐轮近似方法，为 DL 和高阶 DL 相关性估计提供了一条新的路线。它把相关性理解为相关向量的坐标，并利用轮函数的组合结构逐轮更新局部信息，从而避免了直接枚举 trails 的巨大开销。

从实验结果看，该方法在 S-box 型算法和大 χ 函数算法上都有效。它在 Ascon 上给出更准确的相关性估计，在 Present 上把 DL 结果推进到 17 轮，并首次系统给出 Subterranean-2.0 和 Koala-p 上的 DL 与二阶 DL 结果。

这项工作的意义不在于声称完整算法被攻破，而在于提供了一个更实用的相关性估计框架。对于复杂轮函数或大状态算法， trail 枚举很快失效，而逐轮近似可以在精度和效率之间取得较好的平衡。未来需要进一步研究的是误差界定问题：当预测相关性很小时，如何判断近似误差是否已经淹没真实信号。这也是该方法走向更强自动化分析工具的关键一步。

点评专家：陈师尧 教授

研究方向： 对称密码算法分析中的数学原理研究、对称密码算法设计与分析的自动化研究、密码分析与机器学习安全的关系

专家单位：山东大学

原文标题： Round-Based Approximation of (Higher-Order) Differential-Linear Correlation: A Geometric Approach Perspective

原文作者： Kai Hu、Zhongfeng Niu、Meiqin Wang

期刊 /会议： EUROCRYPT 2026

DOI： https://doi.org/10.1007/978-3-032-25333-0_6

版权与来源声明：本文依据《中华人民共和国著作权法》第二十四条之规定，为介绍、评选之目的，在此适当引用。原文版权归原作者所有。

推荐阅读：

[CRYPTO 2025：面向NP的自适应安全SNARG](https://mp.weixin.qq.com/s?__biz=Mzg3NjU0Nzg1Nw==&mid=2247516531&idx=1&sn=0b751c1e0eaeaa94798a9f64ba5912f9&scene=21#wechat_redirect)

[PKC 2026 ：标准模型下可复用的恶意安全HSS方案](https://mp.weixin.qq.com/s?__biz=Mzg3NjU0Nzg1Nw==&mid=2247516530&idx=1&sn=1379b3952ab3928d6f22321afd5e9010&scene=21#wechat_redirect)

[当数学遇见工程：后量子密码的实现和挑战](https://mp.weixin.qq.com/s?__biz=Mzg3NjU0Nzg1Nw==&mid=2247516492&idx=1&sn=aa4e92d3a1319076e972e6e861f7f46d&scene=21#wechat_redirect)

[哈尔滨工业大学（深圳）与中国科学技术大学合作完成：首个完全在FPGA硬件内实现自举密钥展开的独立TFHE全同态加密加速方案](https://mp.weixin.qq.com/s?__biz=Mzg3NjU0Nzg1Nw==&mid=2247516297&idx=1&sn=b30e41113ea34afbfa8e45293840bdbe&scene=21#wechat_redirect)

[密码领域顶会CRYPTO 2025 | 高效并行性与灵活函数表达能力兼得，全同态加密向前一步](https://mp.weixin.qq.com/s?__biz=Mzg3NjU0Nzg1Nw==&mid=2247516548&idx=1&sn=0fc77d905d300396b03c23379fdbea7e&scene=21#wechat_redirect)

[密码领域顶会Eurocrypt 2026 | 全同态加密领域中国团队（华东师范大学、北京航空航天大学）最新进展](https://mp.weixin.qq.com/s?__biz=Mzg3NjU0Nzg1Nw==&mid=2247516547&idx=1&sn=d8230ed3642e62d79c4a545900f4d274&scene=21#wechat_redirect)

[HOST 2025 | 从“密钥恢复”到“物理层数据重建”：基于三维功耗曲面的AI芯片隐私泄露分析](https://mp.weixin.qq.com/s?__biz=Mzg3NjU0Nzg1Nw==&mid=2247516550&idx=1&sn=13918edb12fa6529c2872d4a19601fdf&scene=21#wechat_redirect)

[Cryptography 2025 | 抗量子密码时代，基于深度学习的芯片侧信道高效评估机制](https://mp.weixin.qq.com/s?__biz=Mzg3NjU0Nzg1Nw==&mid=2247516551&idx=1&sn=56ed7ce5953c805ca9edff780db8c13f&scene=21#wechat_redirect)

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
