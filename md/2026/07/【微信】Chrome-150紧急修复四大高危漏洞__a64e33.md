---
title: 【微信】Chrome 150紧急修复四大高危漏洞
source: https://mp.weixin.qq.com/s/vuQ5d_37WtyD0Gkf7-mdhg
source_host: mp.weixin.qq.com
clip_date: 2026-07-25T19:24:35+08:00
trace_id: 58ee9152-0a83-4e27-a94f-cb1624fdcb74
content_hash: 53f70993363651a66aa9f1adfdb4d0d3cf9e6b32aae80e99be60b82f31b8f0f7
status: summarized
tags:
  - 微信
  - 漏洞分析
  - 安全工具
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 谷歌Chrome 150.0.7871.186版本紧急修复了四个高危漏洞，涉及Codecs、WebMCP、Blink及Input核心组件，可导致恶意代码执行，用户应尽快更新。
ai_summary_style: key-points
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 3a875244-d011-8142-9124-cd67ffe1e542
ioc:
  cves:
    - CVE-2026-16804
    - CVE-2026-16805
    - CVE-2026-16806
    - CVE-2026-16807
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 谷歌Chrome 150.0.7871.186版本紧急修复了四个高危漏洞，涉及Codecs、WebMCP、Blink及Input核心组件，可导致恶意代码执行，用户应尽快更新。
> 
> - **漏洞组件：** 修复涉及Codecs、WebMCP、Blink及Input四个核心组件的高危漏洞。
> - **漏洞类型：** 包括一个越界写入漏洞（CVE-2026-16807）和三个释放后重用漏洞，可能引发内存破坏和代码执行。
> - **安全措施：** 谷歌未发现漏洞被主动利用，但限制技术细节公开，直到大多数用户完成更新，以降低武器化风险。
> - **更新方法：** 用户可通过Chrome菜单检查更新，补丁后必须重启浏览器才能生效；敏感系统应优先部署。

**网安百色** *2026年7月25日 18:58*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/12446f59903204b0.png)

谷歌Chrome 150.0.7871.186版本已修复四个影响核心组件（Codecs、WebMCP、Blink及Input）的高危漏洞。

尽管谷歌未发现这些漏洞正被 actively exploited（主动利用）的证据，但公司限制了技术漏洞报告及相关信息的公开访问权限，直至大多数Chrome用户完成更新。此举是行业标准实践，旨在降低漏洞在广泛补丁部署前被武器化的风险。

Google Chrome 150 Update

最严重的漏洞为CVE-2026-16807，属于Chrome Codecs组件中的越界写入（out-of-bounds write）漏洞，由谷歌内部于2026年5月30日报告。此类漏洞发生时，软件会向内存缓冲区边界外写入数据。在浏览器环境中，此类内存破坏问题可能导致应用崩溃，并在特定条件下被攻击者利用，在浏览器进程中执行恶意代码。

Chrome 150.0.7871.186版本同时修复了三个释放后重用（use-after-free）漏洞：

CVE-2026-16806 影响WebMCP组件，谷歌于2026年6月10日报告；

CVE-2026-16805 位于浏览器渲染引擎Blink中，报告时间为6月12日；

CVE-2026-16804 涉及Input组件，报告时间为6月16日。

释放后重用漏洞源于软件在内存释放后仍继续访问该区域，攻击者可能借此篡改程序行为或触发内存破坏。Blink组件的漏洞尤为关键，因其负责处理网页内容并管理页面、脚本与渲染功能的交互。而媒体编解码器或输入处理功能的缺陷，则可能通过恶意构造的网页内容触发，具体取决于漏洞利用所需的代码路径与条件。目前谷歌尚未公开攻击向量、概念验证细节或可利用条件。

谷歌安全公告中未提及外部研究人员奖励，表明这些漏洞由内部发现。公司特别致谢其安全工程团队及自动化测试技术，包括AddressSanitizer、MemorySanitizer、UndefinedBehaviorSanitizer、控制流完整性（CFI）、libFuzzer和AFL。这些工具在Chrome开发与测试阶段可精准识别不安全内存操作、未定义行为及代码流缺陷。

可通过以下路径验证Chrome版本：点击浏览器菜单→帮助→关于Google Chrome。此操作将触发更新检查，并在必要时提示重启浏览器。处理敏感数据或处于高风险环境的系统应优先通过受管更新策略部署补丁。用户需注意：下载补丁后必须重启Chrome，否则修复程序无法生效。

Chrome 150.0.7871.186的完整更新日志可通过Chromium源代码仓库获取。

本公众号所载文章为本公众号原创或根据网络搜索下载编辑整理，文章版权归原作者所有，仅供读者学习、参考，禁止用于商业用途。因转载众多，无法找到真正来源，如标错来源，或对于文中所使用的图片、文字、链接中所包含的软件/资料等，如有侵权，请跟我们联系删除，谢谢！
![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/cc9dd7fb5b24fc27.webp)
