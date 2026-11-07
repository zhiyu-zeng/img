---
title: 【微信】暗网泄露:Suno AI 源代码与训练数据及千万用户信息
source: https://mp.weixin.qq.com/s/GWsoFBdYxbvd5Qw6TfmtQQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-08T06:19:46+08:00
trace_id: d2d382e6-a550-4442-a1fa-74b00a371e10
content_hash: 217d2648983f9a42c6b3570d3470fdcc900c886c7da81b10a48ea6dc03755f39
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 41175244-d011-81d0-8b7c-d6501bca3665
ioc: null
---

**开源情报技术研究院** *2026年11月8日 05:36*

### 俺捏个下载看了一下全球的用户信息都有还挺全面的，注意防范被诈骗的风险。

### 事件核心事实

-   **时间与披露**：攻击实际发生在 **2025 年 11 月**，由黑客 **ellie.191** 实施，但直到 **2026 年 7 月 15–16 日** 才由 404 Media 记者 公开报道并引爆舆论。
-   **攻击手法**：利用名为 **Shai-Hulud** 的 npm 供应链蠕虫，控制了一名 Suno 内部员工的个人与工作设备，窃取其本地及浏览器中保存的凭证，包括 GitHub 仓库权限、AWS/GCP 云后台权限和内网通信工具凭证，随后横向移动进入云端开发环境。
-   **泄露内容**：

-   **2023–2024 年间源代码**：代码注释中白纸黑字列出了训练数据来源，包括 youtube_music（约 11.4 万小时、201 万个片段）、ytm_tagged（约 15.2 万小时）、pond5_music（约 6.2 万小时）、genius_hq（歌词，约 1.76 万小时）、imslp（国际乐谱库，约 1.95 万小时）、deezer（约 1.2 万小时）、freesound、jamendo，以及通过 RSS 抓取的约 42 万个播客节目（约 100 万小时）。
-   **用户数据**：超 **5530 万** 用户信息，含姓名、邮箱、电话、购买记录，以及支付服务商 Stripe 中的部分支付卡号与到期日（非完整卡号、无 CVV）。

-   **Suno 的回应**：称这是“有限的安全事件”，涉及“过时的源代码”，且因完整卡号未泄露而无法律义务通报用户，因此未主动向受影响用户发出通知。
