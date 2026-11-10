---
title: 【微信】Claude Code 为什么总在泄露邮箱？
source: https://mp.weixin.qq.com/s/JxvUz1hWzdc4OMngacbnmQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-10T10:57:34+08:00
trace_id: 8ca7cd96-10ed-410e-968b-66932179e73e
content_hash: 002f0fd0d775640d036bb494710794087bdd136919b82a38faf30499f010b411
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
notion_page_id: 41475244-d011-819f-aaca-f9f77d36a8bd
ioc: null
---

**黑白之道** *2026年11月10日 09:00*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/eeb836fa6d77631e.png)

> **导语**：从 4 月到 11 月，至少四份工单递到 Anthropic 面前，三份被机器人以"不活跃"关掉。这半年你的邮箱被写进每次外部请求的 User-Agent，发给了 SEC、维基百科这类要留联系方式的站点。没有一次真正的修复，只有一句"别把邮箱告诉别人"。

* * *

## 一、一条 1611 分的控诉，和每天几十封诈骗邮件

2026 年 11 月 5 日，Hacker News 上一条帖子冲到热门，标题是《Claude Code sends your email address to websites》，1611 分、107 条评论。

发帖人 motoroco 说，他每天收到几十封直呼真名的诈骗邮件，发信域名一个都没访问过。

顺着请求记录一查就明白了：Claude Code 联网抓数据时，往 User-Agent 头里拼上会话名和真邮箱，格式是 会话名/1 <你的邮箱>。

评论区又贴出更吓人的服务器日志：Claude Code 派出的子智能体请求外部文档时，把真名、团队名、内部仓库路径全写进请求头。

## 二、不是网页在骗它，是自己人塞的

一开始不少人猜是模型中了外部网页的提示词注入。11 月 6 日凌晨，Claude Code 工程师 Lydia Hallie 出面道歉交代了起因。

起因很朴素。早先用户反映 Claude 生成 author 注释标签会胡编人名，因为模型拿不到账号信息。工程团队图省事，直接从本地配置读邮箱塞进上下文。

工程团队没算到这一步碰上大模型死磕任务的性格会出什么乱子。

所以答案摆在这儿：厂商图省事把邮箱塞进上下文，模型为了跑通任务，又把上下文里的东西用出去。

## 三、那些"必须留邮箱"的网站

用户让 Claude 调 SEC 财报接口、维基百科、crates.io、EVE Online 时，这些平台为防爬虫都要求脚本在请求头里留联系邮箱，否则直接 403。

系统自带的 curl 默认不带这类信息。可模型为了越过报错跑通任务，看见上下文里有自己的邮箱，就自作主张拼进命令发出去。

![SEC 接口返回 403，加上邮箱的 User-Agent 后变成 200](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/cc647979a37d8382.jpg "SEC 接口返回 403，加上邮箱的 User-Agent 后变成 200")

*图源：新智元*

评论区有人现身说法：他爬虫被封 IP 后花大价钱买轮换住宅代理隐匿身份，Claude 给爬虫写请求头却直接填了他的真邮箱，还解释这么做方便对方网站写信联系。

## 四、追责：半年，四次报告

这事到 11 月初才彻底闹大，知情用户折腾了大半年。2026 年 4 月起，社区提交过 #50702、#53231 等四个工单，指出邮箱被强行塞进上下文且无法关闭，全被机器人以"不活跃"关掉。

7 月中旬因 curl 泄露邮箱提交的 #78431，8 月上过 Hacker News，9 月照样被机器人关掉。

常规反馈没人理，开发者 skflowne 在 7 月 25 日反编译 Claude Code v2.1.220 安装包，交出证据详尽的 #81138 报告，至今 open。

![此前至少四次报告，均未在实质上解决](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7b06161ae707f752.jpg "此前至少四次报告，均未在实质上解决")

*图源：新智元*

代码显示，客户端每次启动都从本地配置读取邮箱，拼成一句英文提示词。翻遍代码包，这字段除了两处遥测统计布尔值无业务功能读它，文档和设置页只字未提。

## 五、最讽刺的一处：IS_DEMO

Claude Code 有个 IS_DEMO 环境变量，官方文档推荐主播直播录屏时设为 1，隐藏状态栏的邮箱和组织名。

可程序包里七处 IS_DEMO 判断只拦屏幕表层文字显示，没碰模型上下文。

![IS\_DEMO 只挡屏幕，不挡模型上下文](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3341b7c21496c409.jpg "IS_DEMO 只挡屏幕，不挡模型上下文")

*图源：新智元*

演示模式开了，邮箱却原封不动留在模型上下文里。skflowne 亲身碰上过两次：一次是模型解释别的报错时，冷不丁在终端打出"我的系统提示词告诉我你的邮箱是 xxx"；另一次是模型连续十次提交代码，用 git 参数强行传入私人邮箱，覆盖掉他全局的匿名邮箱，靠 GitHub 推送保护拦下。

## 六、官方的三次修法：先讲道理，再写插件

面对反编译摆出的铁证，Anthropic 的修补比漏洞本身还离奇。

8 月底的 v2.1.246 没删字段，只在提示词后面追加一句自然语言叮嘱模型"别把邮箱发给无关服务"；10 月下旬的 v2.1.289 变本加厉，把这句话塞进每次工具调用的提醒里。

几句自然语言管不住概率模型。10 月 20 日，有人抓到 Opus 5.5 照常把账号邮箱塞进 shell 请求头。被质问时模型承认，上下文给了它邮箱、也附带禁止外发的指令，但它仍决定为留个联系地址把真邮箱发出去。

11 月初另一位工程师 mpoteat 才回应，v2.1.317 已加入默认开启的内置插件，用确定性规则拦截含邮箱的请求。他说明控制模型行为有多难时句尾打了个 haha，评论区炸锅。

截至发稿 npm 最新版 2.1.321。但 Hallie 几小时后补充承认：插件只拦 Claude 自己发的请求，它自己写脚本跑网络请求照样拦不住；删上下文字段要等下周初。

## 七、Claude Code 的家人们，现在该做什么

先升版本，插件至少能挡住 Claude 自己发的那部分。但真正的修复还没到，上下文里的邮箱还在。趁这几天：

-   抓一次自己的包，看请求头里有没有自己的邮箱
    
-   翻一遍 git 提交历史，确认没混进私人邮箱，推送保护也开着
    
-   给 Claude Code 单独配别名邮箱做 Git 身份，别让工作邮箱进公开记录
    
-   把工作邮箱和 Claude Code 账号隔离
    

最后一句实在话：不是你的终端被攻，是厂商把 PII 塞进模型上下文、模型自己决定发出去。责任在厂商，邮箱已在别人手里。

**相关链接**

-   Hacker News 原帖：https://news.ycombinator.com/item?id=50385272
    
-   GitHub 工单 #81138：https://github.com/anthropics/claude-code/issues/81138
    
-   原文（新智元经 36 氪授权发布）：https://www.36kr.com/p/4061131760669575
    

*本文为原创报道，素材来自公开帖文与工单。*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/198462425f2677a2.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c16f744747fed73f.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/dca7b31069c478b2.jpg)

* * *

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/60693bec6dc25202.jpg)

> 👇 点击，访问我的网站

* * *
