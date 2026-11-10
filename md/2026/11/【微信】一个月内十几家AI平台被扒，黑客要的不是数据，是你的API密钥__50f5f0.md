---
title: 【微信】一个月内十几家AI平台被扒，黑客要的不是数据，是你的API密钥
source: https://mp.weixin.qq.com/s/hWCef8TlROY5SN-W5W4pDg
source_host: mp.weixin.qq.com
clip_date: 2026-11-10T20:10:45+08:00
trace_id: 0c85deda-9821-4506-b9a1-734bb921e765
content_hash: cecd99035cc6af7a49e99bd91416a8c1432346e2993f4f90b07946257bedb064
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 7
  succeeded: 7
  failed_urls: []
notion_page_id: 41475244-d011-81aa-9316-d0c37de96c5c
ioc: null
---

**安全客** *2026年11月10日 16:52*

9 月底到 11 月初，一个多月时间里，至少十几家 AI 开发者平台被同一类攻击打穿。

Andromeda、英伟达的 Brev、CommandCode、Fireworks AI、Lightning AI、Northflank、OpenCode、Railway、Trigger.dev、Warp、Zeabur，以及本周刚刚披露的 Chainstack 和 WorkOS。

这份名单不是从同一份报告里抄的，是各家自己发公告、自己在状态页上承认的。横向排在一起才有意义：这不是巧合，这是一条正在成型的产业链。

他们要找的东西高度一致：AI 访问令牌。

一、被偷的东西，为什么突然值钱了

先说清楚这些平台是干什么的。它们提供 AI 推理服务的托管、模型评测环境、开发者控制台，本质上是一个"中间层"——替下游大量客户保管着接入各家 AI 服务商的凭据。

Cloud Security Alliance 的分析讲得很直接：入侵者是通过托管平台、评测服务、开发者控制台这层中间层拿到 AI 服务商的凭据的，而近期几起网关被攻破的事件里，攻击者对这批密钥的兴趣完全一样。因为这层替很多下游客户保管凭据，一次入侵就能一次拿到一批推理账户的密钥。

拿到密钥之后怎么变现，Wiz 给了答案：LLM-jacking（盗用算力）和 LLM 经纪人基础设施的兴起，让偷来的 AI 令牌变得容易出手。需求端还在被另一件事推着走——蒸馏，也就是用更强的模型输出去训练一个更便宜的模型。

这里得说清楚一点。Wiz 在报告里提到了"据称指向中国 AI 实验室"的蒸馏活动，这是他们的表述，我们转述的时候不替任何一方下结论。但需求存在这件事，是技术事实，跟谁在需求无关。

结果就是，密钥有了市场，而且是卖方市场。Wiz 观察到多个不同的威胁组织在用同一批被泄露的密钥，这只能说明一件事：这类凭据已经有成熟的流转渠道。

二、两家公司的披露，暴露了攻击的真实形态

Chainstack 的事件时间是 10 月 26 日。攻击者通过一个第三方组件，进到了开发环境，还碰到了部分生产环境。被访问的数据库里存着客户账户信息：组织名、账户持有人姓名、组织成员在 Chainstack 上的邮箱，以及密码哈希。更麻烦的是节点凭据也可能泄露，因为攻击者够到了存这些凭据的系统，公司已经要求客户轮换。

WorkOS 是 10 月 30 日，被攻破的是销售团队用的内部应用。丢的东西听起来没那么严重：姓名、邮箱、电话、职位、公司归属、客户账户历史、销售细节、客户沟通摘要。

但把这两起放在一起看，味道就变了。

一个是第三方组件，一个是销售内部应用。都不是核心业务系统，都不是"我们最在意的那台机器"。攻击者也没在这两处停下来搞破坏，他们的动线很短：进来，找密钥，走。

真正该警惕的是这条动线的前提——这两家都不是安全薄弱的小公司。WorkOS 做的是企业身份认证，按理说是最懂这块的。他们自己也在公告里承认被人进了销售系统。

三、Artex：自动化是怎么发生的

本周 Chainstack 和 WorkOS 的公告里，有一个共同的技术细节：攻击依赖了开源 AI 渗透测试框架 Artex 来做自动化。

Artex 本身不是恶意软件，它是一个公开的、合法的渗透测试工具。问题在于，用它的人不需要是高手。

多起被归因到中国 APT 组织 Storm-0940 的攻击，都被关联到 Artex 的使用，其中包括近期针对 ConnectWise 客户的那一波。

这件事的技术含义，比"又一个 APT 用了 AI 工具"要具体得多。过去一次入侵的时间成本主要花在侦察、找入口、横向、绕过检测上，这些环节高度依赖操作者的经验。现在这套流程可以被编排：工具负责枚举和尝试，模型负责判断哪条路值得走，人只在关键节点做决策。

对防守方来说，最直接的变化是攻击的"试错成本"塌了。以前一个不熟练的攻击者会被 WAF 挡住、会在错误的方向上耗掉几天。现在他可以让工具替他把所有方向都试一遍，然后回来挑结果。

这件事还有一个更隐蔽的后果：检测变得难了。传统的入侵检测靠的是"异常动作"——比如深夜里从陌生 IP 登进来、短时间内大量文件被读取。但 Artex 类的框架跑的是合法工具、发的是合法请求，它只是在很短的时间里把合法请求发了特别多遍。这种流量在日志里看着很正常，在告警规则里也就擦着阈值走。等你想明白的时候，攻击者已经在里面待了几天。

四、和你有关的三个动作

第一，把你家 AI 密钥当成一等公民管。

现在很多团队的做法是：开发要测就开个 key，用完放着，没有人回收。这类 key 一旦随代码、配置文件、CI 日志外泄，等于把你付账单的能力交出去了。具体做三件事：按环境隔离 key（生产、测试、个人开发分开），给 key 设额度上限，建立轮换周期并真的执行。

第二，盘点你手上的第三方组件，包括看起来无关紧要的那些。

Chainstack 是从第三方组件进来的。这类组件的共同特点是：不需要用户交互、常年不更新、出问题时没人认领。做一次清点，重点是那些有外网访问权限、又能读到凭据存储的组件。这类组合最危险——既能进来，又能拿走最值钱的东西。

第三，给销售、客服、HR 这些"非技术系统"补上安全基线。

WorkOS 被攻破的是销售系统。这类系统长期处在安全团队的视野盲区：不是核心业务、不上生产、出了问题也只是"一些客户联系方式"。但它们往往保存着最完整的客户关系图谱和最坦白的沟通记录，社工攻击者要的正是这个。

具体动作：这类系统必须走 SSO，不允许本地账号；必须开 MFA，包括普通销售账号；客户沟通记录的导出权限要收窄，不能全组可见。再加一条容易被忽略的：这类系统的第三方集成要单独列清单。销售系统通常接了一堆 CRM 插件、邮件追踪、会议纪要工具，每一个都拿到了读权限，但没人在季度评审里看它们。

五、这件事还没结束

一个值得注意的细节是时间分布。9 月底开始，10 月密集，11 月第一周还在新增。这不是一次事件，是一条正在爬升的曲线。

Wiz 的观察里有一句更让人不安的话：他们看到的两个案例，"首次未授权活动"发生在厂商披露凭据被访问之后的 30 分钟之内。也就是说，密钥一旦泄露，被拿去用是分钟级的，不是天级的。

所以"发现泄露—通知客户—客户轮换"这个流程，如果按天算，那个时间差就是攻击者的窗口。

对防守方来说，这意味着密钥泄露的响应不能再走工单流程。得有预案：谁能一键吊销，吊销之后哪些业务会断，断多久能恢复。这套东西平时不演练，出事的时候就是一团乱。

最后一句给同行：这次的攻击者不是靠某一个 0day 打进来的。第三方组件、内部应用、供应链依赖，都是常规入口。他们只是把"常规入口"的尝试速度提高了一个数量级，然后专挑那批装着最值钱钥匙的机器。

下一个被点名的，很可能不是因为你有一个没修的洞，而是因为你有一把没轮换的钥匙。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/157048466537be00.gif)

**END  
**

推荐阅读

[杀毒软件成了后门：cPGuard更新通道被投毒](https://mp.weixin.qq.com/s?__biz=MzA5ODA0NDE2MA==&mid=2649790700&idx=1&sn=dbe2f4e03b49c7edbc36dc198972d05c&scene=21#wechat_redirect)

2026-11-09

[![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/bd69aec1e3d6c154.jpg)](https://mp.weixin.qq.com/s?__biz=MzA5ODA0NDE2MA==&mid=2649790700&idx=1&sn=dbe2f4e03b49c7edbc36dc198972d05c&scene=21#wechat_redirect)

[有人把欧洲超市的冷柜调到了50℃，这是第二个月了](https://mp.weixin.qq.com/s?__biz=MzA5ODA0NDE2MA==&mid=2649790689&idx=1&sn=2f92763396458e742d06a05ac48f53ff&scene=21#wechat_redirect)

2026-11-05

[](https://mp.weixin.qq.com/s?__biz=MzA5ODA0NDE2MA==&mid=2649790689&idx=1&sn=2f92763396458e742d06a05ac48f53ff&scene=21#wechat_redirect)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1a214bce04d3e8b7.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/099da120efd4ed5c.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/25e1809ea5c8b60a.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/fd11021941fb33c3.jpg)

[币安丢了63亿美元，问题出在一台工程师的笔记本上](https://mp.weixin.qq.com/s?__biz=MzA5ODA0NDE2MA==&mid=2649790688&idx=1&sn=1136e5e6f4f7cefe1f1a9f8cc51977ef&scene=21#wechat_redirect)

2026-11-04

[](https://mp.weixin.qq.com/s?__biz=MzA5ODA0NDE2MA==&mid=2649790688&idx=1&sn=1136e5e6f4f7cefe1f1a9f8cc51977ef&scene=21#wechat_redirect)

[潜伏16年的UEFI漏洞：开机那几秒，你的所有防线都还没上线](https://mp.weixin.qq.com/s?__biz=MzA5ODA0NDE2MA==&mid=2649790661&idx=1&sn=1385c2dfcbcaf38e00737143ad75a02d&scene=21#wechat_redirect)

2026-11-02

[](https://mp.weixin.qq.com/s?__biz=MzA5ODA0NDE2MA==&mid=2649790661&idx=1&sn=1385c2dfcbcaf38e00737143ad75a02d&scene=21#wechat_redirect)

更多AI知识，请关注Aiker World社区（社区网站：aikerworld.com）

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/dd679fc829adb2b4.png)

欢迎关注社区网站
