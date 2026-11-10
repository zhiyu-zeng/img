---
title: 【微信】谷歌修复Chrome在野0Day漏洞，可远程执行恶意代码
source: https://mp.weixin.qq.com/s/VKjFKq3Jxc9W32Rbz6naCQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-10T20:27:51+08:00
trace_id: 19b7cd6f-3194-4af6-814b-49f2afd88c78
content_hash: 96656102987bbf99c17107dec17c4e4347b4f3fe40c529843996349383f1451e
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
notion_page_id: 41475244-d011-8147-9084-f2e15f0040a3
ioc:
  cves:
    - CVE-2026-125350
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

**信息安全大事件** *2026年11月10日 17:25*

一、漏洞概述

Google Chrome 的XML 组件中存在一处释放后重用（Use-After-Free, UAF） 漏洞，编号 CVE-2026-125350。该漏洞由一名匿名安全研究人员于 2026年11月6日 上报，Google 在 3天后（11月9日）即发布了修复补丁。

释放后重用的典型风险在于，程序在内存被释放后仍继续引用该内存区域。攻击者通过精心构造的恶意网页，可能触发浏览器崩溃、数据损坏，乃至在目标系统上执行任意代码。由于浏览器日常处理大量不可信内容，此类 XML 组件的内存漏洞对远程攻击者具有较高吸引力，受害者仅需访问恶意链接即可能中招。

Google 已确认该漏洞的利用代码已在真实攻击中被使用，但未披露攻击者身份及受影响用户规模。这是 Google 在 2026 年内修复的第八个已遭在野利用的 Chrome 零日漏洞。

二、影响范围

受影响产品：

-   Google Chrome（Windows、macOS、Linux 桌面版）
    
-   基于 Chromium 的其他浏览器（Edge、Brave、Opera、Vivaldi 等）在采用 Chromium 修复前同样面临风险
    

受影响版本：

-   Linux：Chrome < 157.0.8103.50
    
-   Windows / macOS：Chrome < 157.0.8103.50 /.51
    
-   Extended Stable 通道：Chrome < 156.0.8078.96（Windows / macOS）
    

三、在野利用状态

|     |     |
| --- | --- |
| 项目  | 状态  |
| Google 是否确认在野利用 | 是——Google 明确表示“aware that an exploit for CVE-2026-125350 exists in the wild” |
| CISA KEV 收录情况 | 尚未收录（截至KEV 目录版本 2026.11.09） |
| 漏洞细节公开程度 | 受限——Google 在绝大多数用户完成更新前不公开技术细节，且若漏洞涉及第三方共享库，限制期可能进一步延长 |

四、修复方案与缓解措施

4.1 立即升级至安全版本

|     |     |     |
| --- | --- | --- |
| 平台  | 安全版本 | 通道  |
| **Windows** | **157.0.8103.50 /.51** 或更高 | Stable |
| **macOS** | **157.0.8103.50 /.51** 或更高 | Stable |
| **Linux** | **157.0.8103.50** 或更高 | Stable |
| **Windows/ macOS** | **156.0.8078.96** 或更高 | Extended Stable |

更新方法： Chrome 菜单 → 帮助 → 关于 Google Chrome → 自动检查并安装更新 → 重新启动浏览器使补丁生效。

4.2 企业环境加固建议

-   优先覆盖托管终端： 通过组策略或 MDM 强制更新 Chrome，并验证实际安装版本，不能仅依赖渐进式推送。
    
-   强制重启策略： 更新安装后，确保用户完全退出并重新打开 Chrome，而非仅依赖后台静默更新。
    
-   Chromium 衍生浏览器同步关注：Edge、Brave、Opera 等需等待各自上游合并补丁后跟进，在确认修复前可考虑临时限制或加强监控。
    
-   威胁检测线索： 关注 Chrome 进程的异常崩溃、可疑的 XML 解析行为，以及通过钓鱼邮件、恶意广告或入侵网站投递的恶意链接访问。
    

浏览器零日漏洞，别只“点一下更新”

对企业而言，真正的挑战往往不是“有没有补丁”，而是：终端是否全部覆盖、更新后是否强制重启、Chromium 衍生浏览器是否同步跟进、异常崩溃和恶意链接访问能否及时发现、事件发生后能否快速闭环处置。

如有需要，欢迎联系江苏国骏安全专家

联系电话：400-6776-989/13338963885

欢迎关注，了解更多内容
