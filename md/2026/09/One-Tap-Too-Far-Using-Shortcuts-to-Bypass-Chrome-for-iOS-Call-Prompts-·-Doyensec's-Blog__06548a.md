---
title: "One Tap Too Far: Using Shortcuts to Bypass Chrome for iOS Call Prompts · Doyensec's Blog"
source: https://blog.doyensec.com/2026/09/24/chrome-ios-policy-bypass.html
source_host: blog.doyensec.com
clip_date: 2026-09-24T23:00:09+08:00
trace_id: 1be5a1db-8c6a-4937-9274-0cf534d6cdf4
content_hash: 72d4afc3f9975b6de5fc407c56a979f2da25f23526d59eececfc0836aaf78a5c
status: synced
tags:
  - iOS逆向
  - 漏洞分析
series: null
feed_source: Doyensec·漏洞研究
ai_summary: iOS 版 Chrome 存在应用启动权限绕过：网页经 Shortcuts 的 x-callback-url 回调，可在一次点击后打开 `tel:`、`facetime:` 等敏感 URL，绕过 Chrome 的用户交互检查（CVE-2026-13795）。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3e575244-d011-819b-b520-ce93aaf7f6ca
ioc:
  cves:
    - CVE-2026-13795
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> iOS 版 Chrome 存在应用启动权限绕过：网页经 Shortcuts 的 x-callback-url 回调，可在一次点击后打开 `tel:`、`facetime:` 等敏感 URL，绕过 Chrome 的用户交互检查（CVE-2026-13795）。
> 
> - **根因：** Chrome 的应用启动层只检查链路中第一个 URL；`shortcuts://` 与 `workflow://` 因属 Apple 原生应用被豁免弹窗确认，且 `tel:` 的"最近用户手势"校验只覆盖 Chrome 自身发起的导航。
> - **利用链：** 恶意链接 `shortcuts://run-shortcut?name=nonexistent&x-error=tel%3A%2F%2F号码` → Chrome 无提示打开 Shortcuts → Shortcuts 记录 `x-error` 回调 → 快捷指令执行失败 → Shortcuts 直接请求 iOS 打开 `tel:`，第二步不再回到 Chrome 校验。
> - **回调参数：** `x-success`、`x-cancel`、`x-error` 均可携带任意 URL（含其他 App 自定义 scheme），三种回调行为一致。
> - **影响面：** 网页一次点击即可调起已安装 App 的 scheme，实际后果取决于 iOS 与目标 App；Chrome 丧失对最终跳转的控制权。
> - **修复：** Chromium 将检查前移至第一次交接，在打开任何 `shortcuts://` / `workflow://` 前弹出确认；用户拒绝则回调链不会启动，同时免去逐一解析各类回调的成本。

## TL;DR

While testing deep links in Chrome for iOS, we noticed a small but important difference. Opening a third-party app through a custom URL scheme normally produced a confirmation prompt. Shortcuts were an exception. As they’re handled by a native Apple app, Chrome allowed `shortcuts://` and its legacy `workflow://` alias to open without showing the same prompt.

At first, this looked like a minor inconsistency. It became more interesting once we looked at Shortcuts’ callback support. A webpage could send the user to Shortcuts and provide a second URL for Shortcuts to open afterwards. That second URL could be `tel:`. Although Chrome protected direct `tel:` navigations with user-interaction checks, it never saw the callback coming from Shortcuts. A single click on a webpage could therefore reach the phone handler without going through Chrome’s normal check for the final URL. This vulnerability was assigned [CVE-2026-13795](https://nvd.nist.gov/vuln/detail/cve-2026-13795).

The fix was to show a prompt before opening any Shortcuts or Workflow URL.

## Background: external schemes and Chrome’s launch policy

Chrome has an app-launch layer between a web navigation and a deep-link redirect. Before handing control to another app, the browser checks whether the navigation came from the user, whether Chrome is in Incognito mode, and whether it needs to show an alert.

In a normal browsing session, a direct link to a third-party custom scheme triggered an app-launch confirmation. The user had to tap again to approve the handoff. Shortcuts did not trigger this prompt. Chrome treated it as a trusted Apple application even though its URL scheme accepts callback parameters that can lead to another app.

Chrome also had explicit handling for `tel:` URLs. A recent user gesture had to exist before the request could be passed on, preventing a page from turning an unrelated navigation into a call request. A direct `tel:` URL went through this code; a `tel:` URL opened later by Shortcuts did not.

Source: [`app_launcher_tab_helper.mm`](https://chromium.googlesource.com/ios-chromium-mirror/+/refs/heads/main/ios/chrome/browser/app_launcher/model/app_launcher_tab_helper.mm#132)

```cpp
if (!(is_user_initiated ||
        (url.SchemeIs(url::kTelScheme) && user_tapped_recently))) {
    ShowAppLaunchAlert(AppLauncherAlertCause::kNoUserInteraction, url);
    return;
}
```

The expected path looked like this:

```
web navigation → Chrome app-launch policy → user decision, if required → UIApplication openURL
```

The problem was that Chrome checked the first URL in the chain, while the second URL caused the sensitive action.

## Shortcuts and x-callback-url

The Shortcuts app accepts `shortcuts://` and `workflow://` URLs. Its `run-shortcut` endpoint supports the [x-callback-url convention](https://support.apple.com/guide/shortcuts/use-x-callback-url-apdcd7f20a6f/ios):

-   `x-success` specifies a URL to open after successful execution.
-   `x-cancel` specifies a URL to open after cancellation.
-   `x-error` specifies a URL to open after an error.

These parameters contain actual URLs, not just status labels. When Shortcuts receives a `run-shortcut` request, it reads the query string and keeps the supplied callbacks while the shortcut runs. Once the shortcut finishes, fails, or is cancelled, Shortcuts opens the callback associated with that outcome. The destination does not have to be an `http` or `https` URL; it can be another app’s custom scheme.

For `x-cancel`, the relevant sequence is:

```
Shortcuts receives run-shortcut?x-cancel=<callback>
  → stores <callback> as the cancellation destination
  → starts, or presents, the requested shortcut
  → shortcut execution is cancelled
  → Shortcuts asks iOS to open <callback>
```

This second handoff never returns to Chrome. Shortcuts asks iOS to open the callback directly, so Chrome has no opportunity to apply its `tel:` policy to it.

## The vulnerable callback chain

The following example uses `x-error`. The callback is URL-encoded because it is itself a URL inside the query string:

```html
<a href="shortcuts://run-shortcut?name=nonexistent&x-error=tel%3A%2F%2FPHONE_NUMBER">
  Continue
</a>
```

When the deeplink is called, the chain is:

```go
1. The victim taps the link in Chrome.
2. Chrome opens shortcuts:// without its app-launch alert.
3. Shortcuts parses x-error and records tel://PHONE_NUMBER as its error callback.
4. The requested shortcut errors, as the shortcut does not exist.
5. Shortcuts processes x-error and opens tel://PHONE_NUMBER.
6. iOS hands the telephone request to its registered handler.
```

Chrome was involved in step 2, but not in step 5. It approved a navigation to an Apple app; the webpage still controlled the `tel:` URL that Shortcuts opened later.

The same behavior applies to all three callbacks.

## Security impact

A webpage could use this behavior to open the URL scheme of an installed app after a single click, without Chrome confirming the final destination.

The clearest example we found was `tel:`. Chrome guarded direct telephone URLs because a webpage should not be able to turn a navigation into a call request without the expected interaction. Routing the URL through Shortcuts skipped that guard. The same technique also worked with `facetime:`. The final behavior depended on iOS, the installed app, and the target URL, but Chrome no longer had control over the last step.

This was an app-launch permission bypass. The visible navigation went to one app, while the webpage supplied a second, potentially action-oriented destination.

 Your browser does not support the video tag.

## Remediation

The Chromium fix, [Show alert before opening a shortcuts URL](https://chromium-review.googlesource.com/c/chromium/src/+/7838361), moved the check to the first handoff. Chrome now shows an alert before opening any `shortcuts://` or `workflow://` URL.

Prompting at this point avoids having to parse every possible callback. It covers `x-error`, `x-success`, `x-cancel`, nested Shortcuts URLs, and any similar callback behavior added in the future.

The resulting flow is:

```
web navigation → Chrome confirmation for Shortcuts/Workflow → UIApplication opens Shortcuts
```

If the user declines, the callback chain never starts. If the user accepts, the handoff to Shortcuts is explicit.
