---
title: 【微信】渗透测试从业者：把AI智能体接进Burp 数据包分析交给它
source: https://mp.weixin.qq.com/s/dK6v4bhmXG3bxKLZ-TRaRA
source_host: mp.weixin.qq.com
clip_date: 2026-07-21T12:29:15+08:00
trace_id: e7a93663-2a27-4e12-a244-5d75708cb00d
content_hash: 362bd8bb498e125884068b37db0019facaf3ff7607fdb82427961f6b59da588e
status: summarized
tags:
  - 微信
  - 安全工具
  - AI应用
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 将AI智能体接入BurpSuite等渗透测试工具可自动化数据包分析和Payload处理，但核心判断力仍需人类掌握，且必须严格遵守授权等安全红线。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 3a475244-d011-8100-bb8b-c15d82af676a
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 将AI智能体接入BurpSuite等渗透测试工具可自动化数据包分析和Payload处理，但核心判断力仍需人类掌握，且必须严格遵守授权等安全红线。
> 
> - **插件核心**：Burp_Hermes是开源BurpSuite扩展，集成Hermes AI智能体，支持右键触发数据包分析与Payload自动化处理，降低手动分析体力消耗。
> 
> - **部署步骤**：需在Kali中部署Hermes环境，安装Jython到`/usr/share/jython/`路径，并在Burp扩展设置中加载插件文件完成集成。
> 
> - **行业数据**：82%安全从业者已在工作流中使用AI工具，但AI自主利用真实CVE成功率仅13%-21%；人类在业务逻辑漏洞、攻击链组合和上下文判断上更具优势。
> 
> - **成本与风险**：AI单次渗透成本低（0.3-28.5美元），但需人工复核；过度依赖AI可能导致基本功退化，且黑产同样可利用带来安全风险。
> 
> - **安全边界**：AI接入安全工具是必然趋势，但必须划清三条红线：授权底线、判断权不交给人类、核心能力保持；实践中已通过LLM-as-judge和流量网关控制自主Agent风险。

在小说阅读器读本章

去阅读

**网络安全老宋** *2026年7月21日 12:00*

**导语：** 你好，我是网络安全老宋。安全攻防干货准时送达！

工具把AI接进Burp那天，渗透测试的门槛又降了一截——但降的是体力，不是判断力。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/78f588169336ff07.png)

目录 · Table of Contents

00开篇：Burp遇见AI

01Burp_Hermes 是什么

02怎么装、怎么用

03互联网上，安全圈怎么看

04老宋的判断：必然，但边界要划清

工具把AI接进Burp那天，渗透测试的门槛又降了一截——但降的是体力，不是判断力。

<div class="joplin-table-wrapper"><table><tbody><tr><td>00</td><td><h2>开篇Burp遇见AI</h2></td></tr></tbody></table></div>

BurpSuite是安全圈绕不开的神器，这点不用老宋多说。可它再强，也是个"哑巴工具"——你抓到包，分析靠自己，Payload怎么改也靠自己。

最近有个开源插件 Burp_Hermes，干了一件事：把AI智能体（Hermes）直接接进BurpSuite。抓到包，右键甩给AI，让它帮你分析请求、处理Payload。作者还配了视频教学。

这事不大，信号不小。今天老宋不只讲这个插件怎么装，更要聊聊：安全圈对"AI进工具"到底是捧还是怵；以及我自己的判断——这股趋势，挡不住。

<div class="joplin-table-wrapper"><table><tbody><tr><td>01</td><td><h2>Burp_Hermes是什么</h2></td></tr></tbody></table></div>

一句话：它是 BurpSuite 的一个扩展（Extension），把 Hermes 这个AI智能体 嵌进你的抓包工作流。

```ruby
开源项目地址：https://github.com/Priess0503/Burp_Hermes
视频【给BurpSuite接入Hermes 法力无边】 https://www.bilibili.com/video/BV1wjVn6FEFz/?share_source=copy_web
```

你以前怎么干活？Proxy抓包 → 丢进Repeater → 自己读请求、猜参数、改Payload、看响应。现在多了一个选择：选中目标请求，右键丢给 Hermes，让它读这段流量、给出分析、顺手把Payload处理掉。

开源，地址在 `github.com/Priess0503/Burp_Hermes` 。作者说主打两个能力：数据包分析、Payload处理。从演示看，选中一个带账号密码的登录请求，它能直接帮你拆解、甚至对凭证做进一步动作——这玩意用好了是真省事。

⚠️ 提醒一句：演示里出现"对请求中的账号密码进行破解"这类动作，说明它的能力边界很接近实战攻击。这条红线老宋后面专门说。

<div class="joplin-table-wrapper"><table><tbody><tr><td>02</td><td><h2>怎么装怎么用</h2></td></tr></tbody></table></div>

部署分两步：先让Hermes本身跑起来（作者在Kali里部署，有单独的上手指北），再在Burp里装插件。

装插件两小步：第一步，装 Jython。把 `jython-standalone-2.7.3.jar` 放到 `/usr/share/jython/` ，再在 Burp 的 `Extensions` → `extension settings` 里指定 Python 环境。

⏺ Shell · 安装 Jython 环境

```
sudo mv jython-standalone-2.7.3.jar /usr/share/jython/# 然后到 Burp：Extensions → extension settings → 选 Python 环境
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/ffc1775d3e726368.png)

第二步，加载插件。Burp 里 `Extensions` → 添加，选插件文件，装完在 `Output` 能看到成功日志。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/6df5be52a98acd7e.png)

用起来就一句话：常规抓包后，选中目标URL，右键 `Extensions` → `Hermes` ，AI接管这段流量。分析完，直接在 Hermes 里做下一步操作。

门槛不高，有个Kali和会装扩展就能跑。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/f5c73c061b330ad4.png)

<div class="joplin-table-wrapper"><table><tbody><tr><td>03</td><td><h2>互联网上安全圈怎么看</h2></td></tr></tbody></table></div>

老宋把圈内外的声音拢了拢，发现分歧不在"用不用"，而在"信到什么程度"。

**主流共识：赋能，不是取代。** PortSwigger 自己的 Burp AI 都明说——这是给人类测试员当助手，不是替代。Bugcrowd 2026 的数据：82% 的白帽已经在工作流里用AI；但 HackerOne 的调研里，只有 12% 的安全研究员觉得AI会取代自己。

**自主和准确，是两回事。** Hadrian 的基准里，自主智能体自己只能打穿 13%–21% 的真实CVE，加上人辅助才到 64%。GPT-4 在考试题上 85% 准，落到生产环境的真实漏洞，直接掉到 13%–21%。

**账算得过来，但有坑。** 人工渗透一次 1.5万到5万美元，AI agent 单次 0.3 到 28.5 美元，卡内基梅隆的基准记到 156 倍降本、3600 倍提速。可"单次成本"不等于"每个有效漏洞的成本"——自主产出的东西，最后还得人盯一遍。

**人还赢在哪？** 业务逻辑漏洞（购物车能不能改出负数）、攻击链组合（三个低危拼一个高危）、GUI测试、误报率（老手 95%+，ARTEMIS 只有 82%）、社工、还有"这个预发环境凭证和生产是同一套"这种上下文判断。这些，2026 年的AI还 reliably 搞不定。

**国内声音更务实。** CSDN 上不少文章的结论很一致：人机协同是方向，AI降低了高手级技术的入门门槛，但"永远保持你作为安全专家的核心判断力"。既别排斥，也别当甩手掌柜。

**而且，国内一线已经把它跑成"全自动"了。** 知攻善防实验室 2026年7月 公开了"无人监管 Agent 自动化渗透"的落地设计：Agent 在授权范围内批量打点，作者称.NET 场景 getshell 概率提升约 300%。但他反复提醒——无人监管最大的坑是"影响业务"。所以配套了两道闸：用 LLM-as-judge（本地 Qwen3.5-9B 当裁判）对 MCP 调用做中间人拦截，Agent 想改 admin 密码会被直接拦下；再在网关层接管全部测试流量，防沙箱横向、防超范围、防模型幻觉误判（比如把 curl 误当 SSRF）。这说明圈内不是空谈"取代不取代"，而是已经在认真解决"怎么安全地让它自主"。

**担忧也实实在在。** 双刃剑——黑产同样能用；误报漏报还在；依赖商业API、隐私敏感环境不敢上云；合规风险；还有最隐蔽的一条：过度依赖AI，自己的基本功退化。

📌 老宋数据

82% 的白帽已在工作流里用AI，但只有 12% 认为AI会取代自己。

把"用AI"和"被取代"分开看，结论就清楚了。

|     |     |     |
| --- | --- | --- |
| 维度  | AI 现状 | 人的优势 |
| 自主利用真实CVE | 13%–21%（加人辅助到64%） | 范围界定与攻击链组合 |
| 基准准确率 | GPT-4 85% → 生产 13%–21% | 上下文与业务判断稳 |
| 误报率 | ARTEMIS 82% | 老手 95%+ |
| 单次成本 | 0.3–28.5 美元 | 人工 1.5万–5万美元 |

<div class="joplin-table-wrapper"><table><tbody><tr><td>04</td><td><h2>老宋的判断必然，但边界要划清</h2></td></tr></tbody></table></div>

我的看法很明确：AI 接入安全工具，不是选择题，是必然。三个东西在同时涨，工具不会等人——

模型能力在涨，上个月还卡壳的活，这个月就能干；人力成本在涨，资深渗透越来越贵、越来越缺；攻击面在涨，资产一多，靠人手一寸寸测根本测不过来。

把AI接进Burp、接进扫描器、接进审计链路，本质是给安全人员配了个不知疲倦的副驾。副驾再能开，方向盘还得你握。

**三条红线，碰哪条都不行：**  
① 授权是底线。只在你授权、或自查自有系统的范围内用。拿去扫别人的系统，那不是研究，是违法。  
② 判断权不能交出去。AI 给的结论，尤其是"破解""利用"类动作，必须你自己复核。  
③ 核心能力不能退化。工具越聪明，越要逼自己懂它每一步在干嘛。

好消息是，工程界已经在给"自主"套缰绳。上面那套 LLM-as-judge + 流量网关，本质就是把"授权底线"和"判断权不交"做成了自动化——裁判模型盯着每一步调用，网关兜住所有越界流量。红线不是让你别用，是让你用的时候，给AI套上这两道闸。

换句话说，从 Burp_Hermes 这种"人右键触发"的辅助插件，到"无人监管全自动 Agent"，中间只隔了一年不到。工具进化的速度，比大多数人预想的快；但快归快，缰绳得自己先系好。

**// 老宋说**  
这件事真正的根因，是安全工具从"放大器"变成了"副驾"——它开始替你做判断，而不只是替你省力，这才是行业必须正视的变化。  
接下来两年，从"人右键触发的辅助插件"到"无人监管全自动 Agent"，这类形态的渗透工具只会更多、更顺手，谁先用顺手谁先占便宜。  
你现在能做的，是把手边一个工具接上AI跑一遍，看懂它的输入输出和边界；但记住，授权是底线，判断权永远留在你自己手里。

防御，不是在演练期间发现攻击，而是在演练开始前就把攻击面收敛到最小。

end

不想错过文章内容？读完请点一下 **“在看** **”** ，加个 **“** **关注”** ，您的支持是我创作的动力

期待您的一键三连支持（点赞、在看、分享~）

知道了

微信扫一扫  
使用小程序

： ， ， ， ， ， ， ， ， ， ， ， ， 。 视频 小程序 赞 ，轻点两下取消赞 在看 ，轻点两下取消在看 分享 留言 收藏 听过
