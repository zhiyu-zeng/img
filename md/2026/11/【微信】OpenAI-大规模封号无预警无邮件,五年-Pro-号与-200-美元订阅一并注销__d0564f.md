---
title: 【微信】OpenAI 大规模封号:无预警无邮件,五年 Pro 号与 200 美元订阅一并注销
source: https://mp.weixin.qq.com/s/7AjCO-yYltKa19dddT1qKw
source_host: mp.weixin.qq.com
clip_date: 2026-11-09T10:44:10+08:00
trace_id: 2d77ac88-1163-499a-a427-11bede3de0e6
content_hash: f0630d932a05596682be1127f078d6feeaf3b354b4cb5be497d0d631d659f279
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
notion_page_id: 41375244-d011-81a6-babf-cb7c3b622434
ioc: null
---

**黑白之道** *2026年11月9日 08:50*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/eeb836fa6d77631e.png)

> **导语**:一觉醒来,多个 GPT 账号已经登不上:不发邮件、不给理由,直接把账号删除注销,连五年老号和每月 200 美元的 Pro 都在名单里。官方状态页只承认支付通道故障,一个字没提封号。

* * *

## 一觉醒来,账号没了

这一夜多个 GPT 账号被批量处置。用户看到的只有一行报错:**「您的账户已被删除或停用(You do not have an account because it has been deleted or deactivated)」**,后台错误码是 `account_deactivated` 。没有邮件,没有站内信,没有预告。

![OpenAI 身份验证错误页,红圈标出 request\_id 与 account\_deactivated](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c9275f0d5c12dc59.png "OpenAI 身份验证错误页,红圈标出 request_id 与 account_deactivated")

*(图源:新智元 / OpenAI 界面截图)*

按汇总的开发者反馈,重灾区集中在菲律宾区、土耳其区、低价 Team 拼车号,以及挂反代中转的账号;不少续费四五个月的正常老号也被扫进去。这波范围和 Anthropic 那轮不一样—— **免费的 API 账号、团队拼车号,以及每月 200 美元的 Pro 都在内**,付费不是免死金牌。

## 五年老号也没幸免

一位开发者在推特上无奈控诉:用了整整五年的 ChatGPT Pro 账号当天被停用,没有警告、没有邮件、没有给出任何理由,登录时只有一句 `account_deactivated`,申诉提交后一直没收到回复。

![推文截图:五年 ChatGPT Pro 账号被停用,申诉无回音](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7e22a32fec2bd584.png "推文截图:五年 ChatGPT Pro 账号被停用,申诉无回音")

*(图源: 推特截图)*

最扎心的不是账号没了,是这几年攒下的对话记录和"个人记忆"全锁在云端,拿不回来。你以为自己买的是订阅,实际买的是一个租期不明的云端身份。

## 官方嘴上说支付,手上在做处置

我核了 OpenAI 的状态页:11 月 6 日 18:38(UTC)确实登记了一起事件,标题是「Elevated error rates with some U.S. business Mastercards」,描述里点名了受影响的美国商业万事达卡 BIN——544015、546400、543502、543799、512998,部分 513989 开头也在内;11 月 7 日 01:29 更新为"已实施缓解措施并持续监控"。

但整条状态记录只字未提账号封禁或停用,官方口径就是"支付通道问题"。事件本身是实的,可它解释不了一夜之间消失的账号。 **声明和动作之间的这段空白,就是这次争议的全部来源。**

**版权声明**:本文由华盟网原创发布,保留所有权利。文中配图来自新智元报道与 OpenAI 官方帮助中心截图,仅作新闻引用。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/198462425f2677a2.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c16f744747fed73f.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/dca7b31069c478b2.jpg)

* * *

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/60693bec6dc25202.jpg)

> 👇 点击，访问我的网站

* * *
