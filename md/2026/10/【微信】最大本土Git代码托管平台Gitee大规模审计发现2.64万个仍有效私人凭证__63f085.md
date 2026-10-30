---
title: 【微信】最大本土Git代码托管平台Gitee大规模审计发现2.64万个仍有效私人凭证
source: https://mp.weixin.qq.com/s/ll1r0ugxS2HyTsN1f_Hvrg
source_host: mp.weixin.qq.com
clip_date: 2026-10-31T07:56:07+08:00
trace_id: da7d57a1-77b7-474e-a96b-014c46e654f1
content_hash: 392facb61f348b2e7dc3e77a5540227e8bad9f507edde096d4e3af2de2577a02
status: synced
tags:
  - 微信
  - 凭证泄露
  - 安全工具
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 扫描中国最大Git托管平台Gitee的725万个公共仓库，发现26,400个仍有效的私人凭证，集中在阿里云、DeepSeek、OpenAI等云与AI服务。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 40975244-d011-81a6-8587-cdbe303314db
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 扫描中国最大Git托管平台Gitee的725万个公共仓库，发现26,400个仍有效的私人凭证，集中在阿里云、DeepSeek、OpenAI等云与AI服务。
> 
> - **扫描方法：** 因Gitee公共API严重受限（无分页端点、站内搜索停用），研究者用三字符前缀枚举用户并抓取内部Elasticsearch按桶拆分查询，构建725万仓库语料；在Modal平台350并发容器中同时运行TruffleHog与Kingfisher双扫描器验证有效性，耗时约一个月，成本3,097.64美元。
> - **凭证分布：** 阿里云AccessKey最突出，达9,473个（约每766个仓库1个有效凭证），其后是YouTube API令牌3,805个、DeepSeek密钥3,170个、智谱AI 1,489个、OpenAI密钥1,348个，还发现某企业级AI平台的活跃组织管理员凭证，存在供应链风险。
> - **时间与根因：** 2025年提交的凭证达12,242个，约占一半；主因并非蓄意公开，而是开发中硬编码令牌叠加Git永久保留历史提交，删除当前文件后历史版本仍可检索；提交者邮箱涵盖google.com、huawei.com、microsoft.com等企业域名，并非中国开发者独有现象。
> - **横向对比：** Gitee的凭证绝对数与单位仓库密度均高于Bitbucket（约260万仓库6,212个）和GitLab（约560万仓库17,430个），但本次使用双扫描器、既往扫描仅用TruffleHog，方法学差异使横向比较需谨慎。
> - **披露与建议：** 团队已向头部厂商发送含完整凭证列表的协调报告，认为厂商侧撤销比依赖泄露者更可靠，且多数中国公司缺乏漏洞赏金等披露通道；建议开发者轮换令牌、清理历史提交，并将自动化机密扫描前置到提交和CI环节。

**网空闲话plus** *2026年10月31日 07:25*

2026年10月28日，MongoDB博客刊发独立安全研究员Ben Zimmermann与MongoDB Kingfisher团队合作的研究报告；10月30日，SecurityOnline作者Do Son跟进报道。报告称，研究团队扫描了中国最大本土Git代码托管平台Gitee的7,256,531个公共仓库，经去重和上游接口验证，共发现26,400个唯一、仍有效的私人凭证\[1\]\[2\]。SecurityOnline在摘要中概称为“2.6万个”，MongoDB报告给出的精确数字为26,400个。核心结论是：Gitee不仅是代码托管平台，也是高密度的凭证暴露面；泄露主要集中在阿里云、DeepSeek、OpenAI、智谱AI等云与AI服务，且大量凭证仍“活着”。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b003080735dd2a4a.png)

## 一、研究概况：API受限下的“工程化”扫描

Gitee于2013年上线，并被中国工业和信息化部选为国家开源代码托管平台。报告指出，其公共API相对GitHub、GitLab严重受限：没有分页项目端点，站内代码搜索功能据称已停用多年；2021年一项相关研究曾因API限制而难以规模化\[1\]。为绕开限制，研究者组合了多种入口：以三字符前缀查询官方用户搜索接口，结合Explore信息流、用户关注列表和热门仓库星标页，先构建1,704,759个用户名的种子库；再抓取用户项目页和星标页，并调用支撑站内搜索的内部Elasticsearch组件。该组件每页最多20条、总量硬上限200条，研究者按语言、许可证等聚合桶拆分查询，并对三字符前缀做广度优先拆分，最终去重得到7,256,531个唯一公共仓库\[1\]。

扫描阶段使用Modal无服务器平台，部署350个并发容器，将仓库以SSH方式裸克隆后，同时运行TruffleHog和Kingfisher。两款工具均以“仅验证有效”模式，逐一调用供应商API认证候选凭证，并按原始密钥值去重。为控制稳定性，语料被拆成50批、每批约15万仓库；总墙钟时间约一个月，总成本3,097.64美元，由Modal提供的5,000美元计算信用额度覆盖\[1\]。报告特别说明，单一扫描器只能覆盖约一半凭证：TruffleHog发现12,737个，Kingfisher发现14,664个，两者共同发现1,001个，合计26,400个\[1\]。

## 二、主要发现：云与AI密钥集中暴露，历史提交是主因

从厂商分布看，阿里云AccessKey对最为突出，达9,473个，约每766个Gitee仓库就有1个经验证仍有效的阿里云凭证；其次是YouTube API令牌3,805个、DeepSeek API密钥3,170个、智谱AI（Zhipu/BigModel）1,489个、OpenAI密钥1,348个、GitHub令牌600个、AWS凭证338个、MongoDB密钥220个；另有Infura 499个、JWT 391个、Mapbox 346个、GCP 283个、Google Gemini 260个、Weights & Biases 222个、HuggingFace 155个，以及LangSmith、OpenWeather、Algolia、PostHog、OpenRouter、MySQL、Stripe、Slack、Twitter等长尾凭证\[1\]。报告还提到，发现了一个大型企业级AI平台的活跃组织管理员（organization-admin）凭证，凸显高权限凭证泄露可能带来的供应链风险\[1\]\[2\]。

时间维度上，2025年提交的凭证达12,242个，几乎占全部数据集的一半；SecurityOnline亦指出约50%的已验证密钥可追溯至2025年推送的提交\[1\]\[2\]。根因并非蓄意公开，而是开发者快速开发中将令牌硬编码，且Git永久保留历史提交——即使当前文件删除密钥，历史版本仍可被检索。按提交者邮箱域名统计，个人邮箱qq.com、163.com、gmail.com占多数，企业域名统计只是下限；其中google.com66个、huawei.com32个、microsoft.com22个、bytedance.com22个、alibaba-inc.com20个、jd.com18个、tencent.com13个，另有Oracle、Apple、Meta、Anthropic等较小足迹，说明这并非纯粹的“中国开发者现象”\[1\]。

## 三、横向比较与影响：密度高于GitLab、Bitbucket

报告将Gitee与既往公开扫描对比：Bitbucket约260万仓库、6,212个有效凭证；GitLab约560万仓库、17,430个；Gitee为7,256,531个仓库、26,400个， raw count和单位仓库密度均居前\[1\]。但报告也给出方法学提醒：TruffleSecurity此前的扫描仅用TruffleHog，而本次同时使用两款工具；若仅保留TruffleHog结果，Gitee为每千仓库1.76个\[1\]。这既说明双扫描器提升了中文云与AI厂商的检出率，也提示横向比较需谨慎。就影响而言，云访问密钥、AI API密钥和组织管理员凭证一旦被滥用，可能导致资源盗用、费用损失、数据泄露乃至供应链攻击；但报告并未确认这些凭证已被恶意利用，也未确认撤销状态\[1\]。

## 四、披露与后续：厂商侧撤销更可靠，披露路径不对称

研究团队向泄露量最高的厂商发送了协调报告，包含完整有效凭证列表和来源仓库元数据，便于厂商定位受影响客户；但由于规模巨大，未逐一通知个人开发者。报告认为，厂商侧撤销比依赖泄露者行动更可靠；截至写作时，披露凭证的撤销状态尚未确认\[1\]。报告还指出披露路径不对称：西方公司通常有漏洞赏金或可访问的安全渠道，多数中国公司缺乏类似通道，泄露凭证可能缺少清晰修复路径\[1\]。SecurityOnline则建议开发者立即审计公开Gitee仓库，轮换暴露令牌、清理历史提交日志，并在部署前引入自动化机密扫描\[2\]。

## 五、警示与建议

这项研究的方法论价值在于：在API受限、站内搜索弱化的平台上，仍可通过多源枚举、桶拆分和双扫描器验证，形成可复现的大规模凭证审计流水线；其安全价值在于，它把“公开仓库中的历史提交”这一常被忽视的风险量化了。对组织而言，删除当前文件中的密钥远远不够，必须轮换凭证、清理历史提交、使用密钥管理服务，并把自动化扫描前置到提交和CI环节。对平台而言，缺乏与厂商的密钥扫描合作机制，会放大生态风险。公开仓库不是保险箱，Git历史也不是垃圾场；任何硬编码的密钥，都可能在数月甚至数年后仍是一把可用的“钥匙”。

## 参考文献

\[1\] Ben Zimmermann. Scanning 7.25 Million Public Repositories on China's Largest Git Platform for Secrets\[EB/OL\]. MongoDB Blog, 2026-10-28\[2026-10-31\].https://www.mongodb.com/company/blog/technical/scanning-7-point-25-million-public-repositories-chinas-largest-git-platform-for-secrets.

\[2\] Do Son. Gitee Exposed Credentials Found Across Millions of Repositories\[EB/OL\]. SecurityOnline, 2026-10-30\[2026-10-31\].https://securityonline.info/gitee-exposed-credentials-scan/.

数据安全 · 目录

作者提示: 素材来源官方媒体/网络新闻，文中事件发生于2026年10月31日
