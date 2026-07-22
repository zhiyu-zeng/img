---
title: 【微信】勒索组织死灰复燃，跨国药企遭精准勒索
source: https://mp.weixin.qq.com/s/3RHwlUE2ilD-fpLEJ8ws_Q
source_host: mp.weixin.qq.com
clip_date: 2026-07-22T14:31:42+08:00
trace_id: 6a5685d8-9c86-4343-80c2-6f856ee02aae
content_hash: 008248e071645672da45102996c996a038feca945bdeba22ac631f8c9f7278a9
status: summarized
tags:
  - 微信
  - 勒索软件
  - 威胁情报
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: Karma勒索组织复活并升级运营体系，与SpaceBears同属犯罪联盟，通过精准商业情报勒索攻击跨国药企。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3a575244-d011-8123-88d7-c1dc5f775ce5
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Karma勒索组织复活并升级运营体系，与SpaceBears同属犯罪联盟，通过精准商业情报勒索攻击跨国药企。
> 
> - **关联研判：** Karma与SpaceBears勒索组织共享企业化运营模式，包括双重勒索策略、独立暗网门户和深度业务了解，同属一个犯罪联盟。
> - **暗网平台升级：** 从2021年简陋WordPress博客升级为暗红深黑配色企业化门户，具有数据看板（14起泄露）和“独家泄露与情报”定位。
> - **勒索信特征：** 采用RSA+AES混合加密，覆盖Windows、Linux、ESXi及备份系统；攻击者潜伏网络内，精准筛选高价值财务和战略数据，威胁出售给竞争对手，并设置72小时倒计时和双重证明机制。
> - **关键指标：** 勒索家族为Karma，目标系统包括Windows和Linux等，加密后缀为受害者特定缩写，当前活跃于2026-07-20，提供暗网联络和邮箱。

Solar应急响应团队监测到勒索运营组织 Karma死灰复燃。该组织最早于2021年便以数据泄露博客形式出现，近期再度活跃并全面升级运营体系，具备成熟的暗网数据泄露平台与高度定制化的勒索信，呈现出典型的"定向渗透+商业情报勒索"特征。  
  
关联研判：与 SpaceBears 同属一个犯罪联盟  
Solar团队通过暗网基础设施交叉比对与勒索运营手法分析，研判 Karma与此前活跃的 SpaceBears 勒索组织同属一个犯罪联盟。两者共享相似的"企业化"勒索运营模式：均采用双重勒索策略、拥有独立品牌化的暗网泄露门户、对受害者业务结构具备深度了解，且在数据筛选与商业威胁话术上呈现高度一致性。该联盟呈现出多品牌并行、分工协作的犯罪生态特征。  
  
暗网平台特征：从简陋博客到企业化门户  
该组织早期（2021年）仅使用简陋的 WordPress 博客页面，而当前暗网门户已升级为独特的暗红与深黑配色方案，极具辨识度。首页设有运营数据看板（14起泄露、6490次浏览、131次下载），并设有"BROWSE LEAKS"入口，将自己定位为"Exclusive Leaks & Intelligence"（独家泄露与情报商），宣称"Zero logs, zero tracking, zero compromise"。  
  
勒索信特征：  
该组织投放的勒索信采用HTML美化版本，使用glitch故障特效与霓虹闪烁风格，极具视觉冲击。攻击者采用RSA+AES混合加密，同时覆盖Windows终端、Linux服务器、ESXi虚拟机及NAS/VEEAM备份，阻断所有恢复路径。勒索信显示攻击者在加密前已在网络内长期潜伏，精准筛选约XTB高价值数据：多年综合财务数据、HR文件、报告及极具战略价值的他国分公司发展计划，主动排除视频等低价值文件。攻击者明确威胁将数据"出售给竞争对手"，实施商业情报级勒索。此外，该组织设置72小时倒计时，并提供"免费解密2-3个非重要文件"及"指定15-25个文件立即验证"的双重证明机制，同时要求受害者提供身份证明以防止安全研究人员冒充谈判。  
  
关键指标：  
家族：Karma  
主要目标系统：Windows、Linux（含ESXi、NAS、VEEAM备份）  
加密后缀：受害者特定缩写（非固定）  
早期出现：2021年（WordPress博客形态）  
当前活跃：2026-07-20  
暗网联络：2d\*\*\*\*\*\*\*\*\*\*\*\*id\[.\]onion（脱敏原因：平台限制发送）  
联络邮箱：karmaone@cyberfear.com  
备用通讯：qTox Messenger  
加密算法：RSA + AES  
关联组织：SpaceBears（同属一个犯罪联盟）  
#勒索预警 #Karma #SpaceBears #勒索软件 #威胁情报 #网络安全
