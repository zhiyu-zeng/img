---
title: 【微信】VOLTA窃密木马：窃取会话凭证，调用大模型自动生成受害者画像
source: https://mp.weixin.qq.com/s/yJ-gNDYscifB2zuZrThWgw
source_host: mp.weixin.qq.com
clip_date: 2026-11-02T18:35:06+08:00
trace_id: 6758470e-9e21-45f2-a463-d2cd251b6ccb
content_hash: ecada9e10819f5f5df45118fe64cc5876a626445b61c049fe91ac5bfffcb4bbc
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
notion_page_id: 40c75244-d011-8169-8937-e7929365abb1
ioc: null
---

**看雪学苑** *2026年11月2日 17:59*

思科Talos团队近期曝光一款名为 VOLTA（VOLTA-AUTODOXER） 的Windows窃密木马。和普通盗号工具不一样，它把AI变成了黑客的“情报分拣员”。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4fb49a5878daedbe.png)

*VOLTA 完整攻击链路（来源：Cisco Talos）*

**01**

**第一步：大范围收割账号会话**

VOLTA会抓取Windows终端里各类账号凭证：

✅ 浏览器Cookie、密码、银行卡信息；

✅ Discord、Telegram、Steam、Slack、Roblox ；

✅ 邮箱、微软OAuth令牌、SSH密钥、WiFi密码、加密钱包。

它还会利用窃取到的Gmail、外卖平台会话，从订单记录扒出受害者住址；查询Roblox道具估值。 依托绕过Chrome绑定加密的能力，拿到的会话令牌很多时候可以跳过密码、二次验证。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/71756e2ebb395d93.png)

*木马最终打包的三类外泄数据包（来源：Cisco Talos）*

**02**

**核心亮点：AI自动做目标评估**

收集完信息后，木马生成一份受害者档案 Identity_Report.txt，通过OpenRouter网关发给大模型分析。要求AI输出两大内容：

-   价值评级：低/中/高，标记受害者资产价值
    
-   安全评估：判断受害者的密码习惯、防护水平
    

调用顺序：Claude Opus 4.6 → 调用失败自动降级 Kimi K2 → Gemini 2.5 FlashAI分析结果保存为 AI_Analysis.txt，打包成压缩包外传。

木马执行完成后会自删除，增加查杀溯源难度。

**03**

**黑产商业化：低门槛木马生成器**

VOLTA是一套售卖的木马生成工具（Builder）。攻击者填入API密钥、Telegram接收通道，就能一键生成定制木马。受害者的AI评估报告，直接推送至攻击者Telegram。没有固定C2服务器，防守方无法简单拉黑IP阻断。

**个人&企业防护建议**

**个人：** 不明来源exe不要运行；怀疑中招，在干净设备上重置所有密码、吊销令牌；加密资产尽快迁移新钱包；

**运维：** 管控Chrome无头--headless启动参数；安全设备导入IOC进行检测。

之前已有Dolphin-X尝试AI筛选受害者，VOLTA方案更加成熟，代表黑产AI武器化正在落地。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9f7425f35c0afdc5.png)

*链接域名已脱敏，仅在情报平台内还原使用。*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c953c0b9b281634c.gif)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/1174aba2fd2940bc.jpg)

**球分享**

**球点赞**

**球在看**
