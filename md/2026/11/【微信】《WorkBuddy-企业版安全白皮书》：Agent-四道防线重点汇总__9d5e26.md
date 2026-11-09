---
title: 【微信】《WorkBuddy 企业版安全白皮书》：Agent 四道防线重点汇总
source: https://mp.weixin.qq.com/s/0XxSSgPAHa0rwUVHmVF9xA
source_host: mp.weixin.qq.com
clip_date: 2026-11-09T08:54:00+08:00
trace_id: e00a8c54-d396-4668-95c1-2587dd123205
content_hash: a6de5aac8c8ee396100c0604f862d01b5e46f00a30be0b1b17cd47853f6875fb
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 41375244-d011-8161-a6d1-ea3939f42de8
ioc: null
---

**效能跃迁实验室** *2026年11月8日 17:32*

2026 年 10 月 30 日，腾讯数字生态大会发布《WorkBuddy 企业版安全白皮书》。白皮书给出的目标口径是：可控、可溯、可管。

**Agent 已经能读写终端文件、执行命令、持有凭据，并通过 Skill 与 MCP 扩展外部能力。企业真正担心的，是失控、误删、事后无法追溯，以及数据外泄。**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0e17acaa0fe3469b.jpg)

* * *

## 四道防线

整套体系按时间顺序展开：事前识别、事中拦截、事后恢复、全程留痕。企业策略是客户端的底线，员工只能在上面叠加更严格的配置。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/00182a56c57c735b.jpg)

事前识别覆盖输入框、工具返回和数据外发三个入口，敏感信息在本地完成识别；技能上架前会做静态与动态检测，覆盖 6 大类 19 种风险。

~~事~~ 中拦截依赖 Mac、Windows、Linux 上的原生沙箱，把文件读写与命令执行收敛到授权工作目录。系统默认保护 8 类敏感路径，内置 106 条文件规则；对 `rm -rf` 、 `sudo` 等高危命令会前置询问，并对子进程同样生效。设计原则是：执行前拦截，不依赖模型自觉。

事后恢复会在每轮修改文件前自动备份，删除默认进入系统回收站；一次改动超过阈值时会暂停等待确认，整轮任务产生的改动也可以整轮回滚。

全程留痕把拦截与放行事件统一记录下来，包含时间戳与具体命令，并且可以解释、查询和导出。管理端日志覆盖操作、内容、端、人、IP、时间六要素。

* * *

## 全文获取

白皮书目前以官方推文文末扫码查阅全文为主入口：

补充阅读：腾讯新闻通稿 https://news.qq.com/rain/a/20261030A08UG800 ；产品页 https://cloud.tencent.com/product/workbuddy

懂点网络安全 · 目录
