---
title: Our NoScript review found three ways around its JavaScript protections, and all are fixed
source: https://srlabs.de/blog/our-noscript-review-found-three-ways-around-its-javascript-protections-and-all-are-fixed
source_host: srlabs.de
clip_date: 2026-11-05T02:35:51+08:00
trace_id: 2607e58c-6809-4121-ad8e-f6400b1b8cfc
content_hash: 2292187eeaea1c3e4886ef69119404a250f48b91d4a33bb4edc434af7aee4e45
status: synced
tags:
  - 漏洞分析
  - 安全工具
series: null
feed_source: SRLabs·模糊测试/漏洞审计
ai_summary: NoScript 浏览器扩展经安全审计发现 3 个高危漏洞——XSS 过滤绕过、Chromium 上 CSP 注入绕过、TabGuard 反去匿名功能静默失效，现已全部修复。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40e75244-d011-8112-86d8-dcd3e5982fee
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> NoScript 浏览器扩展经安全审计发现 3 个高危漏洞——XSS 过滤绕过、Chromium 上 CSP 注入绕过、TabGuard 反去匿名功能静默失效，现已全部修复。
> 
> - **XSS 过滤器绕过：** NoScript 用正则表达式对出站请求做黑名单匹配，但某些可触发于 div 标签的事件处理器未被正则覆盖，攻击者可借此执行任意 JavaScript，印证了黑名单“未列出的即放行”的固有弱点。
> - **Chromium 上 CSP 注入绕过：** NoScript 通过注入 meta 标签设置 CSP 并冻结 DOM 更新来拦截第三方脚本，但 SVG 文件的冻结处理被跳过；而 SVG 可包含执行 JS 的标签，导致本应被拦截的站点仍可运行任意脚本。
> - **TabGuard 完全失效：** 反侧信道去匿名功能使用了方法简写语法（合法 JS），但 Firefox 的 executeScript API 无法解析，导致该保护静默失败，启用用户仍暴露于去匿名攻击而无任何提示。
> - **修复与影响范围：** 共报告 8 个问题（3 个高危），NoScript 13.6.18.901 及之后版本、Tor Browser 15.0.13 起已修复；该审计由 Open Technology Fund 委托，因 Tor Browser 以 NoScript 为核心组件，直接影响记者、活动人士等高风险用户的匿名性。
> - **开发者教训：** 基于模式/黑名单的过滤需随浏览器新增特性持续审查；跨浏览器实现的保护必须在每个浏览器中分别测试；应建立端到端测试在真实浏览器中验证功能——静默失效比显式失效更危险。

Ann-Christine Kycler

[Constantin Schwarz @derconno](https://infosec.exchange/@derconno)

## Key takeaways

-   **Denylists only block what they list.** We found patterns for the XSS-prevention filter that were not covered by the regular expression.
-   **End-to-end testing is still a good way to ensure features behave as intended.** A feature was silently not working. End-to-end tests would have revealed that.
-   **Language quirks lead to unforeseen problems when parsing is involved.** TabGuard used method shorthand, which is valid JavaScript, but could not be parsed by Firefox's executeScript implementation.
-   **All issues were fixed swiftly. Versions since NoScript 13.6.18.901 and Tor Browser 15.0.13 are protected.**

Have a look at our [audit report](https://github.com/srlabs/audit-reports/blob/main/Open_Technology_Fund/SRL-NoScript_baseline_assurance-report-2026.pdf).

On behalf of the Open Technology Fund, we performed a security review of the NoScript browser extension. Among other issues, we identified three high-severity vulnerabilities: an XSS filter bypass, a gap in NoScript’s CSP injection on Chromium-based browsers that allowed script execution through SVG files, and a bug that silently disabled the TabGuard anti-deanonymization feature. All of them were fixed.

## NoScript and its standing in the privacy-aware world

NoScript is one of those open-source, privacy-ensuring projects that have been around for over 20 years. Other projects, such as Tor, rely on it, and it has one dedicated developer working tirelessly on it. Usually, there are not enough volunteers to test features or even to perform a security review. Luckily, the Open Technology Fund engaged us to perform a security review of the NoScript extension, and we were excited about the opportunity. We strongly believe in privacy and giving control to the user, which NoScript provides in a web full of trackers and ads and heavily built on JavaScript.

The modern web relies on JavaScript not only to load content dynamically and personalize pages, but also to track users across websites and build detailed profiles that are sold to advertisers or used to influence opinions on social and political matters. JavaScript is also a common vehicle for malware and targeted attacks.

There are various ways in which websites can be used to attack users, such as cross-site scripting (XSS) and DNS rebinding, and most of them leverage JavaScript execution capabilities to perform their attacks. NoScript is a browser extension that acts as a defense-in-depth measure, making the web still usable, but hopefully safer to use. To achieve this, the extension offers the possibility of fine-grained control over JavaScript execution utilizing allowlists and levels of strictness for each website visited. NoScript also offers various measures that can, even if JavaScript execution is allowed, detect and block certain attacks.

NoScript can be used in most major browsers. Its primary target is Firefox, but it also has a Chrome version. The Tor Browser uses the extension as a core feature to disable tracking and other deanonymization attacks wherever possible, so that its users can anonymously browse the web. The Tor Project provides important tools to people facing political persecution, such as activists or journalists, and having NoScript at the core of the Tor Browser makes it vital for their (oftentimes physical) security and anonymity.

## NoScript’s security architecture

Of course, NoScript’s main feature is to block JavaScript execution for websites entirely, with the user being able to make rules for individual websites. There are, however, more fine-grained controls, and certain features offer some security even when JavaScript execution is allowed.

### XSS filtering

XSS attacks are a very common and infamous attack method. Modern web browsers already offer some XSS protection, but NoScript offers some further XSS filtering measures to enhance secure browsing.

This defense-in-depth is achieved by first attempting to inject a strict Content Security Policy (CSP) that disallows execution from other origins. On top of that, outgoing requests are checked using regular expressions for common XSS patterns. Our first two highlighted findings each bypassed one of these layers.

### TabGuard

TabGuard is an optional feature that aims to prevent side-channel deanonymization attacks against users of content-sharing websites such as Instagram or YouTube. An attacker who suspects a target’s username changes how a resource responds for that account (for example, by blocking it), then uses a malicious website that is allowed to run JavaScript to load the resource in another tab and measure the load time. A different timing reveals whether the visitor is the suspected user, as shown in a [USENIX paper](https://leakuidatorplusteam.github.io/) from 2022. These are strong preconditions, but high-value targets such as journalists and activists face exactly this kind of well-resourced, targeted attacker. As our third finding shows, this protection was not actually working.

## Highlighted findings

In total, we reported 8 issues, 3 of them rated high severity. In this section we highlight the three high-severity findings. For all details, please see our [published report](https://github.com/srlabs/audit-reports/blob/main/Open_Technology_Fund/SRL-NoScript_baseline_assurance-report-2026.pdf).

### XSS filter bypass via unfiltered event handlers

NoScript’s XSS filter uses regular expression matching on outgoing requests to detect dangerous HTML tags such as script or iframe, along with JavaScript event handlers (which fire when, for example, an element loses focus or a page finishes loading). The filter blocked script execution in most cases, but we identified event handlers that can be triggered on a div tag and were missing from the patterns, so they could still be used for an XSS attack. This is the built-in weakness of any denylist: whatever it does not list is allowed.

-   **Impact**: An attacker could have executed arbitrary JavaScript whenever one of these events was triggered on the page, which is exactly what the filter exists to prevent.
    
-   **Fix**: The missing events [were added](https://github.com/hackademix/noscript/commit/d5583c60608182cf2c312ca0bc9308a048743c00) to the regular expression.
    

### CSP injection bypass via SVG files on Chromium

Firefox and Chrome differ in small but important details, so NoScript has to implement some of its protections differently in each browser. Dynamic content execution is limited by the NoScript extension by inserting a Content Security Policy (CSP). If the website’s developers have not set such a policy, NoScript’s CSP ensures that only content from the website itself, not third-party content, can be loaded and executed. On Chromium-based browsers, this blocking is achieved by injecting a content script into the webpage, which in turn injects a meta tag to set the CSP. To be able to do this before any extra content is loaded, NoScript aims to stall the changing of the DOM until the injection of the CSP succeeds. We identified that for SVG files, an image file format, this freezing attempt is skipped. However, SVG files can include tags that execute JavaScript.

-   **Impact**: Because the CSP was never injected into SVG documents, an attacker could have executed arbitrary JavaScript in Chromium-based browsers, even on sites where NoScript should have blocked it.
    
-   **Fix**: SVG files now [get the same DOM freezing mechanism](https://github.com/hackademix/noscript/commit/3b266e94e2f8022242e3e06c336efb1cd34fbdf9#diff-106cd44e2a925e09ebb2bbd267075cc83f359f6d326ef5af84d28e2c155c0e1a) as HTML and XHTML documents.
    

### TabGuard silently non-functional in Firefox

During our analysis we found that in TabGuard, NoScript was using method shorthand for a function that was then handed to the executeScript function provided by the browser API of Firefox. This function, however, cannot parse the method shorthand correctly (although it is valid JavaScript), which led to it silently failing. As a result, TabGuard never worked as intended. This emphasizes the need for end-to-end tests that exercise the extension’s features in a real browser.

-   **Impact**: Users who had enabled TabGuard were still exposed to the deanonymization attacks it is meant to prevent, with no sign that the protection was inactive.
    
-   **Fix**: The method shorthand [was replaced with a function definition](https://github.com/hackademix/noscript/commit/bf8eece1c7982bb6f8dc98722e45174f714a03cc) that the browser API can parse.
    

## Conclusion

We classified all three highlighted findings as high severity: two allowed JavaScript execution that the extension should have prevented, and the third meant that TabGuard did not work at all. In addition to the findings, we delivered some evolution suggestions and a release and supply-chain security review. Among our suggestions was the implementation of end-to-end tests, which could have identified the TabGuard vulnerability early on. After reviewing the release channels, we suggested establishing more trust anchors for the integrity of extension code in distribution.

What this means for users: All issues described here are fixed in NoScript 13.6.18.901 and later, which also ships with Tor Browser 15.0.13. Users who keep NoScript and the Tor Browser up to date are protected.

What this means for extension developers: Our findings point to three lessons that apply well beyond NoScript. First, pattern-based filters are only as good as their pattern lists, so denylists need regular review as browsers add new features. Second, a protection that is implemented differently per browser has to be tested in each browser. Third, a security feature that fails silently is worse than one that fails loudly: end-to-end tests that run features in a real browser would have caught the TabGuard bug before release.

We want to highlight that our experience working with the lead developer of NoScript was phenomenal. All our findings were fixed by the time we delivered the report, which just speaks to the dedication with which he commits his time to this project. We were able to have great discussions about findings and approaches, which helped us arrive at robust fixes quickly.

We are proud to have worked on such an influential project in the privacy-preserving world, one that helps keep journalists, activists and victims of oppressive regimes safe.

*The full audit report (v1.0) was delivered to the Open Technology Fund and NoScript on May 27, 2026. The assessment team consisted of Constantin Schwarz, Yannis Hofmann, Ann-Christine Kycler, Aarnav Bos and Marc "vanHauser" Heuse.*

## References

-   Read the [report](https://github.com/srlabs/audit-reports/blob/main/Open_Technology_Fund/SRL-NoScript_baseline_assurance-report-2026.pdf)
-   [OTF news about our report](https://www.opentech.fund/security-safety-audits/noscript-security-suite/)
-   [https://github.com/hackademix/noscript](https://github.com/hackademix/noscript)
-   [https://github.com/hackademix/nscl](https://github.com/hackademix/nscl)
