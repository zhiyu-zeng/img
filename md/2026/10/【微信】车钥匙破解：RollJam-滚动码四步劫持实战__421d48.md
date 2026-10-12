---
title: 【微信】车钥匙破解：RollJam 滚动码四步劫持实战
source: https://mp.weixin.qq.com/s/l0HUi3xncqiV4lDE8kzFaA
source_host: mp.weixin.qq.com
clip_date: 2026-10-12T08:59:18+08:00
trace_id: a4bfea67-6e60-4338-a492-6e966b0992db
content_hash: e80d269ef122a545be56c9917e3e066c4f4e0d7701afc93a558343a0cbbddac2
status: synced
tags:
  - 微信
  - 硬件逆向
  - 协议分析
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: RollJam 以 32 美元硬件通过"干扰-记录-干扰回放-回收码"四步劫持滚动码，让车主第二次按开锁时攻击者同步截获一组未来可用码，Keeloq/Hisec 体系的车辆与车库门因此可被远程解锁，十年未根治。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 3f775244-d011-816c-b6cb-f9e43c0d6ac6
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> RollJam 以 32 美元硬件通过"干扰-记录-干扰回放-回收码"四步劫持滚动码，让车主第二次按开锁时攻击者同步截获一组未来可用码，Keeloq/Hisec 体系的车辆与车库门因此可被远程解锁，十年未根治。
> 
> - **攻击原理：** 滚动码依赖"车主第一次按不开会再按一次"的行为假设，RollJam 正是利用这次同步转发，把第二组新码留给攻击者。
> - **四步流程：** ①315/433 MHz 双频干扰致车端收不到信号 → ②窄带 CC1101 记录第一组码 → ③再干扰并回放第一组码开门、同时收走第二组码 → ④取回设备后回放第二组码远程解锁。
> - **硬件成本：** Teensy 3.1 主控 + 三片 CC1101（一片干扰、一片监听、一片窄带接收）+ 电池 + 按钮，总价不到 50 美元；源码（eliddell1/RollJam 等）已在 GitHub 公开复刻。
> - **实测影响：** Nissan、Ford、Toyota、Lotus、Volkswagen、Chrysler、Cadillac 及 Cobra/Viper 报警器、Genie/Liftmaster 车库门；Kamkar 估计受害规模达数百万辆。
> - **根源与修复：** 问题出在 Microchip Keeloq 与 TI Hisec 两家芯片供应商；老车无 OTA、芯片换代以十年计，码簿范围限制挡不住同步转发，只有全行业换芯片才能根治。

**黑白之道** *2026年10月12日 08:40*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/eeb836fa6d77631e.png)

> **导语**：2015 年 DEF CON 23 现场，Samy Kamkar 当众演示了一个 32 美元的小盒子——RollJam。它藏在车底下就能让车主第一次按钥匙没反应、第二次照常开锁，等车主把车开走，攻击者手里还攥着一组"未来才能用"的滚动码。车厂引以为傲的 Keeloq 和 Hisec 加密芯片，在这套干扰-记录-回放组合拳下集体失守。

* * *

## 一、从固定码到滚动码：为何这套防御会失败

车钥匙遥控经历过两个阶段。第一代是固定码（fixed code），钥匙每次按下都发同一个密码，攻击者拿个收音机在停车场里坐一下午就能把码全收走。2000 年前后 Keeloq 芯片的滚动码（rolling code）成为主流：钥匙和车之间共享一个伪随机序列计数器，每次按下计数器加一并用密钥加密传输。车载接收机收到后比对计数器，发现序列对不上就直接丢弃。

这个设计原本是想掐死重放攻击。攻击者即使截到了第一组码，车主按下第二组之后，第一组就被作废了。但 RollJam 把这套机制的一个隐含假设击穿了—— **车主遇到第一次按不开门，会自然地按第二次**。

## 二、RollJam 四步劫持流程

![RollJam 四步劫持流程示意图](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7b941431343c2042.png "RollJam 四步劫持流程示意图")

RollJam 的攻击过程可以拆成四步，全部在车主完全无感的前提下完成：

**第一步，干扰。** RollJam 上电后用两片 CC1101 射频芯片持续发出 315 MHz 和 433 MHz 两个 ISM（工业科学医疗）公用频段的噪声，覆盖绝大多数车钥匙和车库门遥控使用的频段。车主第一次按钥匙时，车端接收器被噪声淹没，根本没收到信号——表现就是"咦，怎么没反应"。

**第二步，记录。** RollJam 第三片 CC1101（更窄带、更灵敏）专门用来收车钥匙的信号，把第一组滚动码原封不动地记下来。车主完全无感，钥匙以为已经把码发出去了，其实只送到了 RollJam。

**第三步，干扰 + 回放。** 车主等了几秒没反应自然再按一次。RollJam 这次边干扰边发射，把第一步存下来的第一组码原样转发给车端，车门正常打开。车主以为只是按慢了一秒。同时，第二组新码被悄悄收进存储。

**第四步，回收 + 远程开锁。** 攻击者找机会把 RollJam 取回来，按下小按钮，把藏好的那组"未来才能用"的滚动码发给车，车门解锁。这组码还能用是因为车主从第二组之后就没再碰过钥匙，车端计数器还没把它标为作废。

Kamkar 在 DEF CON 演讲里把原理概括成一句话："你按下第一次没反应，按下第二次门开了。你觉得没事开车回家了。但我现在有第二组码，我能开你的车。"

## 三、硬件清单：32 美元能买什么

RollJam 的硬件方案在 Make: 杂志的拆解文章里写得非常清楚，总成本不到 50 美元：

-   **Teensy 3.1 微控制器**：主控，跑拦截、回放、存储全部逻辑
    
-   **两片 CC1101 射频收发模块**：一片发干扰噪声，一片监听信号
    
-   **第三片 CC1101**：更窄带滤波，专门用来收车钥匙信号
    
-   **电池供电**：能藏在车底下连续工作数天
    
-   **物理按钮一个**：触发"回放"模式
    

代码方面，Kamkar 在 DEF CON 之后把完整 Arduino 风格的源代码放到了 GitHub（eliddell1/RollJam、CR11CS/RollJam-315MHz-433MHz 等社区复刻版持续在更新）。攻击者不需要懂射频工程，把代码烧进 Teensy、接好三片 CC1101 就能用。

整套方案精妙之处在于：所有逻辑都是被动应答式的，不用事先知道目标车辆任何密钥信息，只是把"下一次按下的码"先收下来，等合适时机再发。

## 四、验证车型与底层芯片

Kamkar 公开了实测清单，几乎覆盖了当时北美和欧洲市场的主力车型：

-   **汽车**：Nissan、Ford、Toyota、Lotus、Volkswagen、Chrysler、Cadillac
    
-   **报警器**：Cobra、Viper
    
-   **车库门**：Genie、Liftmaster
    
-   **受害规模**：Kamkar 估计数百万辆
    

WIRED 记者就测试清单逐家联系车厂，回复耐人寻味：Liftmaster 和 Volkswagen 拒绝评论，Viper 说"正在了解细节"，只有 Cadillac 的发言人 David Caldwell 公开表态——承认这套方法"网络安全专家都清楚"，但强调只对早期车型有效， **最新款凯迪拉克已经换成新的加密体系**。

Kamkar 补了一刀：问题根源不在车厂，而在两家芯片供应商——Microchip 的 Keeloq 与德州仪器（TI）的 Hisec。这两家几乎垄断了北美车钥匙和车库门遥控芯片市场，Keeloq 芯片的车厂只要不换新一代 Dual Keeloq，就一直可被 RollJam 攻击。

## 五、修复：为什么十年过去了还没根治

这个漏洞从 2014 年 Spencer Whyte 首次公开（当时还需外接笔记本）到 2015 年 Kamkar 做成独立小盒子，按理说十年时间足够所有车厂 OTA（空中远程升级）或召回换芯片了。但实际上：

-   大量车辆出厂时根本没有 OTA 能力，车厂要修就得上百万辆召回
    
-   Keeloq 芯片虽然推出了 Dual 版本做短时窗过期，但老车不换芯片就没有这层保护
    
-   车库门场景更没人管，Genie 和 Liftmaster 的存量设备亿级别
    

车厂加密芯片上后来加了一个"码簿范围限制"做临时修复，让接收器只接受计数器在合理窗口内的码。但这挡不住 RollJam 在车主按第二次时的同步转发。

* * *

## 六、红队启示：这种漏洞的典型生命周期

RollJam 这类攻击给红队演示了一个漏洞从发现到失效的完整曲线：

1.  **研究阶段** （2014 之前）：原理早已公开但没人做独立硬件
    
2.  **工程化阶段** （2014 Whyte）：需要外接笔记本，不便携
    
3.  **小型化阶段** （2015 Kamkar）：32 美元独立设备，任何人都能复刻
    
4.  **复刻阶段** （2015 至今）：GitHub 上几十个分支，硬件供应链成熟
    
5.  **根治阶段** （至今未到）：OTA 覆盖不到老车，芯片换代周期十年起步
    

攻击者成本曲线一路下降，防御者修复成本却越来越高。进入"复刻阶段"后单点修补意义消失，只有全行业换芯片才能根治。这就是为什么十年过去了，车钥匙仍是渗透测试的高价值目标。

* * *

## 七、思考题

1.  滚动码的"码簿范围限制"为什么挡不住 RollJam 的同步转发？
    
2.  如果 RollJam 攻击失败（车主只按了一次就走了），攻击者手里还有可用码吗？
    
3.  Keeloq 和 Hisec 为什么 2015 年后才被新车逐步淘汰？车厂的更新周期为何这么长？
    
4.  假设你是某车厂的安全团队，2015 年拿到 RollJam 完整 write-up，3 个月、1 年、3 年的修复路线分别是什么？
    

* * *

## 素材出处

1.  makezine.com 2015-08-11《Anatomy of the RollJam Wireless Car Hack》Caleb Kraft 撰
    
2.  WIRED 2015-08-06《This Hacker's Tiny Device Unlocks Cars And Opens Garages》Andy Greenberg 撰
    
3.  Slate 2015-08-07《RollJam hacker device defeats rolling codes security for cars, garages》
    
4.  Forbes 2015-08-07《RollJam: This $50 'Universal Remote' Unlocks All Kinds Of Car Doors》Thomas Brewster 撰
    
5.  Samy Kamkar《Drive It Like You Hacked It》DEF CON 23 演讲，2015-08-08
    
6.  Spencer Whyte 2014-03 公开 RollJam 原始方法（依赖笔记本）
    
7.  GitHub：eliddell1/RollJam、CR11CS/RollJam-315MHz-433MHz 社区复刻仓库
    
8.  Wikipedia：Keeloq 加密芯片条目，Hisec 与 Dual Keeloq 演进
    

* * *

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/60693bec6dc25202.jpg)

> 👇 点击，访问我的网站

* * *

汽车安全 · 目录
