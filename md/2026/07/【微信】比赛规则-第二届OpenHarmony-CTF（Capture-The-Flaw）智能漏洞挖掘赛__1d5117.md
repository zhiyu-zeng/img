---
title: 【微信】比赛规则 | 第二届OpenHarmony CTF（Capture The Flaw）智能漏洞挖掘赛
source: https://mp.weixin.qq.com/s?__biz=MjM5NDU3MjExNw==&mid=2247516592&idx=1&sn=fcc48ad5c78269e3739fd1626330d429
source_host: mp.weixin.qq.com
clip_date: 2026-07-24T00:01:33+08:00
trace_id: 60a16b1d-c0df-409e-a834-7d1fe7429a86
content_hash: b0b1a46d7b1d9e1a334c39fe5a4984df9543462377e64ce5506570eaa8599232
status: summarized
tags:
  - 微信
  - CTF
  - AI辅助逆向
series: null
feed_source: 公众号·XCTF联赛
ai_summary: 第二届OpenHarmony CTF挑战赛要求参赛团队开发AI智能体，在真实系统环境中全自动化地挖掘漏洞，无需人工干预。
ai_summary_style: key-points
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 3a675244-d011-811f-a042-d26d5e2d966b
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 第二届OpenHarmony CTF挑战赛要求参赛团队开发AI智能体，在真实系统环境中全自动化地挖掘漏洞，无需人工干预。
> 
> - **比赛形式：** 这是一场“0人工”的全智能化漏洞挖掘赛，团队需自主构建或组合大模型形成的“agentic AI”来挖掘OpenHarmony系统漏洞。
> - **初赛规则：** 线上初赛要求AI在限定时间内自主挖掘Nday漏洞，晋级名额暂定15支，每队不超过4人，冠军可直接晋级XCTF国际联赛总决赛。
> - **积分规则：** 采用动态分值，满分10分，根据漏洞触发位置的精确度（文件路径、代码行、引入commit、CWE类型）给予不同分值。
> - **0day漏洞激励：** 在初赛中挖掘并提交有效的0day漏洞可获得额外高分附加分，例如严重漏洞可获N*100分，但前提是Nday漏洞总分需达到200分。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/669d4c2b6c68ea10.jpg)

报名倒计时7天 | 第二届OpenHarmony CTF（Capture The Flaw）智能漏洞挖掘赛

**第二届 OpenHarmony CTF（Capture The Flaw）智能漏洞挖掘赛**

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/b32bcd276b25d371.png)

**报名链接**

[https://openharmony.xctf.org.cn](https://openharmony.xctf.org.cn/)

报名通道限时开启至7月31日

（已报名队伍无需再次报名）

火热🔥报名中 等你🔥上线

比赛形式

本次挑战赛为"0人工"全智能化挖洞挑战，分为线上初赛和现场决赛；参赛团队可自主开发或任意组合市面上的大模型，构建自己的"agentic AI"，使用"agentic AI"在OpenHarmony真实系统环境进行漏洞挖掘挑战。

初赛、决赛的0day漏洞均需通过OpenHarmony安全漏洞奖励计划（< [https://bugbounty.openharmony.cn/](https://bugbounty.openharmony.cn/) >）进行提交，漏洞的判定结果由奖励计划评审组决定。对应有效的0day漏洞奖金由OpenHarmony安全漏洞奖励计划提供。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/84faa340bf5c3193.png)

**线上初赛**

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/383cecaa28b6254d.png)

-   参赛团队需要在规定时间内且"0人工"干预的情况下，使用团队的"agentic AI"按要求在比赛环境挖掘OpenHarmony Nday漏洞获得积分。
    

-   Nday漏洞为真实在OpenHarmony Release版本发现并已修复的漏洞。
    
-   晋级名额暂定15支。
    
-   线上初赛限定每队人数不超过4人。
    
-   线上初赛冠军战队可直接获得第十一届XCTF国际网络攻防联赛总决赛入场券。
    

**初赛积分&晋级规则**

采用动态分值每个有效发现满分10分，根据完成度获得对应积分；

|     |     |     |
| --- | --- | --- |
| **文件路径+漏洞触发代码行（精确到代码行标记）** | **漏洞引入Commit Hash** | **漏洞类型CWE类型** |
| 5   | 4   | 1   |

为确保解题过程提交漏洞位置准确，请确保漏洞挖掘环境为社区原始发布且未带入任何版本发布后修复的PR补丁，以免出现漏洞触发行号偏移。

初赛赛程2/3（大致2-3周）：晋级积分排名前10名（或总参赛队伍前10%）且积分中需包含不少于5个得分≥9分Nday漏洞。

初赛赛程后1/3（大致1周）排位冲刺：抢先达到50分的前5名（或未晋级参赛队伍前5%）队伍晋级。

防爆破：参赛过程中禁止采用爆破猜想的方式，采用爆破猜想的参赛团队将被冻结当日提交资格，冻结次数达三次将取消参赛资格。

**版本环境**

OpenHarmony v6.0 Release（2025-09-06）

[https://gitcode.com/openharmony/docs/blob/master/zh-cn/release-notes/OpenHarmony-v6.0-release.md#%E4%BB%8E%E9%95%9C%E5%83%8F%E7%AB%99%E7%82%B9%E8%8E%B7%E5%8F%96](https://gitcode.com/openharmony/docs/blob/master/zh-cn/release-notes/OpenHarmony-v6.0-release.md#%E4%BB%8E%E9%95%9C%E5%83%8F%E7%AB%99%E7%82%B9%E8%8E%B7%E5%8F%96)

**资源下载**

全量代码（标准、轻量和小型系统）

[https://repo.huaweicloud.com/openharmony/os/6.0-Release/code-v6.0-Release.tar.gz](https://repo.huaweicloud.com/openharmony/os/6.0-Release/code-v6.0-Release.tar.gz)

RK3568标准系统解决方案（二进制）ROM包

[https://repo.huaweicloud.com/openharmony/os/6.0-Release/dayu200_standard_arm32_rom.tar.gz](https://repo.huaweicloud.com/openharmony/os/6.0-Release/dayu200_standard_arm32_rom.tar.gz)

RK3568标准系统解决方案（二进制）XTS包

[https://repo.huaweicloud.com/openharmony/os/6.0-Release/dayu200_standard_arm32_xts.tar.gz](https://repo.huaweicloud.com/openharmony/os/6.0-Release/dayu200_standard_arm32_xts.tar.gz)

**关于比赛测试环境部署说明**

1\. 需满足可运行OpenHarmony v6.0 Release及最新Release版本的环境。

2\. 参赛团队可根据自身环境条件选择使用开发板或虚拟模拟器。

3\. 开发板使用建议：润和DAYU200 RK3568。

比赛平台及Agent交互接口说明见比赛平台《第二届OpenHarmony CTF智能漏洞挖掘赛平台使用说明》文档及交互Skills附件。

（ [https://thuctf.tsinghua.edu.cn/harmonyctf/posts/06c3c59d）](https://thuctf.tsinghua.edu.cn/harmonyctf/posts/06c3c59d%EF%BC%89)

**0day漏洞附加分**

附加分：初赛期间挖出0day漏洞，通过0day漏洞提交入口，在限定的审核工单数量限制内，提交0day漏洞报告，或者针对模块漏洞被评估为Flag错误的误报进行申诉为0day漏洞，如获得审核通过，可获得额外0day漏洞积分，记入初赛总分排名：

|     |     |     |     |
| --- | --- | --- | --- |
| 严重  | 高危  | 中危  | 低危  |
| N*100 | N*60 | N*30 | N*10 |

\* N为对应数量。

**0day漏洞提交**

1、初赛通过有效0day漏洞获得附加分需满足Nday漏洞得分200分，否则得分不计入0day漏洞附加分；

2、有效0day漏洞提交范围需与初赛Nday漏洞赛题代码仓范围一致且满足《OpenHarmony安全漏洞奖励计划》规则要求；

3、有效0day漏洞的判定以《OpenHarmony安全漏洞奖励计划》反馈为准；

4、提交0day漏洞时在标题加上【OpenHarmony CTF+队名】标签以便识别并优先进行处理。

\* 注：如在比赛过程中按照0day漏洞提交但被审核为未在预期数据集中的Nday漏洞或无效漏洞，将不获得积分。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/84faa340bf5c3193.png)

**线下决赛**

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/383cecaa28b6254d.png)

-   决赛规则将与决赛队伍晋级名单同步公布。
