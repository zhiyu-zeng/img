---
title: 【微信】广东省安全智能新技术重点实验室陈斌课题组在 CCF A 类会议 KDD 2026 发表3DGS 后门攻击研究成果
source: https://mp.weixin.qq.com/s/XwoCYBo8M0xJoTRem2t54w
source_host: mp.weixin.qq.com
clip_date: 2026-07-27T12:24:58+08:00
trace_id: c3828b36-314f-4f68-9db1-cb100eaf0889
content_hash: 648c215041690553713a408dcfa875600f31a72ca423520c51e29d69fba8c1b4
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
notion_page_id: 3aa75244-d011-81c1-b908-db8dca0b07a7
ioc: null
---

**信息网络安全杂志** *2026年7月27日 12:00*

2026 年，哈尔滨工业大学（深圳）计算机科学与技术学院陈斌课题组联合清华大学深圳国际研究生院、华南理工大学、华为技术有限公司等单位，在国际数据挖掘与知识发现顶级会议 KDD 2026 发表论文《GaussTrap: Stealthy Backdoor Attacks on 3D Gaussian Splatting for Targeted Scene Misperception》。论文由洪家欣第一作者，陈斌为通讯作者。

ACM SIGKDD Conference on Knowledge Discovery and Data Mining（简称 KDD）是数据挖掘、知识发现与人工智能领域最具影响力的国际顶级学术会议之一，也是中国计算机学会（CCF）推荐的 A 类会议。KDD 聚焦数据科学、机器学习、人工智能、数据挖掘及其在工业界和社会场景中的应用，长期吸引来自全球高校、科研机构与头部科技企业的研究者投稿。其录用论文通常代表了数据挖掘与智能计算领域的前沿进展，具有较高的学术影响力和应用价值。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/0d77428debbf388a.png)

图 1 论文在OpenReview被接受网页

该研究聚焦近年来快速发展的 3D Gaussian Splatting（3DGS）安全问题。3DGS 作为一种高效的实时三维场景表与新视角合成方法，已逐步应用于自动驾驶、机器人导航、AR/VR、医学仿真等安全敏感场景。然而，现有 3DGS 安全研究更多关注水印与所有权保护，针对 3DGS 重建流程自身后门风险的系统研究仍相对不足。针对这一问题，论文提出了面向 3DGS 的隐蔽后门攻击框架 GaussTrap。与传统神经辐射场中将后门嵌入全局网络权重不同，3DGS 由显式三维高斯基元表示场景，并在训练过程中依赖自适应密度控制机制不断分裂、克隆和剪枝高斯基元。研究发现，攻击者可以利用触发视角处较高的重建损失诱导局部高斯基元异常增殖，从而把恶意视觉内容结构性地嵌入场景几何中。

GaussTrap 的核心思想是从“静态插入恶意点”转向“劫持 3DGS 优化过程”。在攻击视角，模型会将恶意图像对应的高梯度区域误判为需要补充的细节，并分配大量微小高斯基元进行拟合；而这些恶意基元由于具有局部性和方向性，在其他正常视角下往往被遮挡或退化为难以察觉的背景扰动。因此，攻击者能够在指定视角触发高保真视觉误导，同时维持其他视角的渲染质量。

方法上， GaussTrap 采用三阶段交替优化流程。第一阶段为 Adversarial Injection，通过在目标攻击视角最小化恶意图像的重建损失，主动诱导高斯基元在局部区域增殖；第二阶段为 Geometric Stabilization，构造攻击视角附近的扰动视角集合，并利用干净模型生成伪标签，以约束恶意基元在邻近视角下保持几何一致性，避免产生漂浮黑块等明显伪影；第三阶段为 Global Fidelity Restoration，重新引入正常训练视角恢复整体场景质量，使被投毒模型在非触发视角下尽可能接近干净模型。

图 2 GaussTrap 三阶段优化框架：对抗注入、几何稳定化与全局保真恢复

实验部分，论文在 Blender 与 Mip-NeRF360 两类合成和真实世界数据集上进行了系统评估，并与 IPA-NeRF + 3DGS、StealthAttack 等代表性方法进行对比。结果表明，GaussTrap 能够在目标攻击视角稳定生成预设的误导内容，同时在训练视角、测试视角和稳定化视角上保持较高的 PSNR、SSIM 和较低的 LPIPS，体现出较强的攻击有效性、隐蔽性与跨场景鲁棒性。

进一步的机制验证表明， 3DGS 的密度增殖上限与攻击成功率存在明显正相关：当允许更多高斯基元参与分裂和克隆时，模型更容易在局部区域形成承载后门信息的细粒度结构。消融实验还证明，视角集合稳定化策略能够显著减少攻击视角邻域中的渲染伪影，提高后门触发的空间稳定性。论文同时讨论了简单干净数据微调防御的局限性，指出恶意内容一旦与三维高斯结构深度耦合，仅靠普通微调难以有效移除。

该工作首次系统揭示了 3DGS 自适应密度控制机制中潜在的过程级安全漏洞，提出了面向显式三维场景表示的优化感知后门攻击范式。研究不仅丰富了三维重建模型安全领域的攻击与评测方法，也为未来构建可信、可检测、可修复的 3DGS 安全防护机制提供了重要参考。

■ 论文信息

论文题目： GaussTrap: Stealthy Backdoor Attacks on 3D Gaussian Splatting for Targeted Scene Misperception

论文作者： Jiaxin Hong（洪家欣）、Sixu Chen（陈司旭）、Shuoyang Sun（孙朔阳）、Hongyao Yu（余泓垚）、Hao Fang（方豪）、Yuxin Peng（彭雨欣）、Bin Chen（陈斌，通讯作者）、Jiawei Li（李佳维）

作者单位：哈尔滨工业大学（深圳）；清华大学深圳国际研究生院；华南理工大学；华为技术有限公司

来源：广东省安全智能新技术重点实验室

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/81c956483ecd785b.webp)

**信息网络安全**

《信息网络安全》创刊于2001年，是由公安部主管，公安部第三研究所、中国计算机学会主办，面向国内外公开发行的国内首批信息安全类期刊之一，于2015年成为中国科技核心期刊，2017年成为中国科学引文数据库来源期刊，2018年成为中文核心期刊，2022年入选CCF计算领域高质量科技期刊分级目录。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/ab74d2f918724aeb.webp)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/db7f4654d6bb88fb.webp)

中文核心期刊

中国科技核心期刊

中国科学引文数据库来源期刊

CCF计算领域高质量科技期刊

我们在不断努力和完善中，期待您的关注和支持！
