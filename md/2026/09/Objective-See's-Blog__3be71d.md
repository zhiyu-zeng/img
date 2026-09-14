---
title: Objective-See's Blog
source: https://objective-see.org/blog/blog_0x85.html
source_host: objective-see.org
clip_date: 2026-09-14T10:18:36+08:00
trace_id: 7cb53862-a85f-46b2-abb9-f27777db18be
content_hash: 472e73e95a0cbf7bda1412cad96684de9943a46c773ff5c9a8f2f55c570ccd22
status: synced
tags:
  - 恶意样本
  - 安全工具
series: null
feed_source: Objective-See·macOS
ai_summary: 针对 ClickFix 这类诱骗用户向终端粘贴命令的社工攻击，可在粘贴瞬间拦截：监听 ⌘+V、判断前台是否为终端应用，命中则暂停进程并弹窗确认。
ai_summary_style: key-points
images_status:
  total: 7
  succeeded: 7
  failed_urls: []
notion_page_id: 3db75244-d011-8120-95e2-f098a3346e96
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 针对 ClickFix 这类诱骗用户向终端粘贴命令的社工攻击，可在粘贴瞬间拦截：监听 ⌘+V、判断前台是否为终端应用，命中则暂停进程并弹窗确认。
> 
> - **攻击本质：** ClickFix 不利用软件漏洞，而是诱导用户把攻击者控制的命令粘贴进终端执行，从而绕过 Gatekeeper 与 Notarization 等系统级防护；已被犯罪团伙与国家级攻击者（如 UNC1069 冒充 CEO 会议排障）采用，近期还借 LLM 回答与“Google 赞助”结果传播，常见载荷形如 `echo "..." | base64 -D | zsh`。
> - **检测实现：** 用 `NSEvent addGlobalMonitorForEventsMatchingMask:` 全局监听 `Command+V`（需辅助功能权限，通过 `AXIsProcessTrusted`/`AXIsProcessTrustedWithOptions` 申请并提示）。
> - **拦截动作：** 比对前台应用 bundle ID 白名单（Terminal、iTerm2、Ghostty、kitty、Warp），命中即 `kill(pid, SIGSTOP)` 暂停终端、展示剪贴板内容让用户确认；用户选 Block 则用 `clearContents` 清空剪贴板，命令无从执行。
> - **已知局限：** 右键→粘贴不会被捕获（但多数攻击明确要求用快捷键）；Endpoint Security 没有 `AUTH_PASTE` 类事件，且终端逐行解析、`echo` 等内建命令不产生 exec 事件，故监控 `AUTH_EXEC`/`NOTIFY_EXEC` 不可靠；也没有可靠的剪贴板变更通知 API，轮询有性能与隐私代价；默认对任意终端粘贴告警，误报偏多。
> - **降噪与落地：** 开启 “Apply Heuristics” 后仅对可疑内容告警（长度、管道到 shell、`base64`/`curl`/`osascript`/`exec*` 等），并允许在同一终端实例内自动放行后续粘贴；该保护已随 BlockBlock v2.3.0 的 Paste Protection Mode 发布。

ClickFix: Stopped at ⌘+V

Defending against malicious terminal pastes

The **Objective-See Foundation** is supported by:

**ClickFix** has quickly become a widely adopted infection technique targeting both macOS and Windows users. Rather than relying on software vulnerabilities or exploit chains, it leverages something much simpler: convincing a user to copy and paste a command into a terminal.

The mechanics are straightforward, yet the impact can be significant, allowing attackers to bypass even OS-level protections such as Gatekeeper and Notarization on macOS. This technique is now being leveraged not only by opportunistic cybercriminals, but also by more sophisticated threat actors. As its adoption increases, it becomes important to examine practical ways to reduce its effectiveness.

In this post, we explore a simple, generic mechanism to disrupt the majority of ClickFix-style attacks on macOS by intervening at the critical moment of execution: paste time.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f76df7632f707f87.png)

Block(Blocked): A ClickFix Attack

  

**Note:**

-   Full source code for this implementation can be found in [BlockBlock](https://github.com/Objective-see/BlockBlock), which now includes this protection.
-   The approach covered here is simple and largely effective. However, as with any defensive technique, there are limitations and potential bypasses (outlined in the 'Limitations' section below), so it should not be considered a panacea.
-   This approach is intentionally broad and, as such, may be prone to false positives. It is primarily aimed at protecting users who are more susceptible to ClickFix-style attacks (i.e., not power users who frequently use Terminal and, ideally, know better than to paste and execute arbitrary commands from the Internet). False positives can be reduced through additional heuristics, several of which we discuss in this post.

### ⌛ Background

ClickFix seems to be all the rage, currently one of the most in-vogue infection vectors targeting both macOS and Windows users. But first, what even is ClickFix?

My (unofficial) definition is:

> " *ClickFix is a social engineering technique that tricks users into **copying and pasting attacker-controlled commands** into a terminal thereby executing malicious code.*"

You can read more about ClickFix attacks in MacPaw’s Moonlock Labs writeup: “ [How ClickFix attacks trick users and infect devices with malware](https://moonlock.com/clickfix-attack) ”.

Let us look at a few recent examples from this month that shed light on both the prevalence of this attack vector and how it functions in practice.

First, and most recently, researchers from MacPaw’s Moonlock Lab uncovered large language models naively propagating a ClickFix-style attack to unsuspecting users:

> 🧵 1/ 🚨 What if a Google Sponsored result for a common macOS query led to malware? That's happening right now and 15K+ people have already seen it.  
> We at @MoonlockLab observed 2 variants today abusing legitimate platforms for ClickFix delivery: a [@AnthropicAI](https://twitter.com/AnthropicAI?ref_src=twsrc%5Etfw) public artifact on… [pic.twitter.com/e1ocnQPmV4](https://t.co/e1ocnQPmV4)
> 
> — Moonlock Lab (@moonlock_lab) [February 11, 2026](https://twitter.com/moonlock_lab/status/2021695650367226108?ref_src=twsrc%5Etfw)

As they noted, the malicious LLM-generated instructions were accessible via a top “Google Sponsored” result for common macOS queries. The instructions directed users to paste a command into Terminal: **`echo "..." | base64 -D | zsh`**

If the user trusted the LLM and followed its instructions, the base64-encoded payload would be decoded and used to download and execute a loader for the MacSync stealer.

The Moonlock researchers also uncovered another vector for the same ClickFix attack. Searches for macOS utilities related to disk space led to an article masquerading as Apple’s “Support Team,” again instructing the user to execute commands in Terminal:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f5dac944a4c505ce.png)

ClickFix Attack (Image credit: Moonlock)

Another recent ClickFix-based attack, also from this month, was uncovered by Google’s Mandiant team. In a report titled “ [UNC1069 Targets Cryptocurrency Sector with New Tooling and AI-Enabled Social Engineering](https://cloud.google.com/blog/topics/threat-intelligence/unc1069-targets-cryptocurrency-ai-social-engineering) ”, they noted that North Korean nation-state actors engaged with victims and enticed them to join a virtual meeting with a prominent CEO. Once connected, the impersonated “CEO” claimed the victim’s computer was experiencing audio issues and directed them to run troubleshooting commands on their system to resolve the problem. Predictably, those commands resulted in infection of the victim’s device.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5eaf4fd71fb16fed.png)

A North Korean ClickFix Attack (Image credit: Google)

### 🛡️ Towards Thwarting ClickFix Attacks

Though it may be tempting to dismiss ClickFix attacks as simplistic, that would be a mistake. As shown above, these attacks are both widespread and impactful, enabling cybercriminals and nation-state actors alike to infect user systems while neatly sidestepping OS-level protections such as Gatekeeper and Notarization. Broadly speaking, these protections are designed to regulate application execution, not arbitrary commands executed directly within an existing terminal session.

However, the very simplicity of this technique presents an opportunity. Because ClickFix relies on user-initiated copy-and-paste into a terminal, we can attempt to generically disrupt it by detecting pastes into terminal applications, particularly those that originate from web content.

In this section, we will explore this detection heuristic and show how it is now implemented in BlockBlock. We will also, as any responsible analysis should, discuss the limitations of this approach.

First, it is important to note a core commonality across most, if not all, ClickFix attacks: they rely on the user pasting a command into Terminal. If we can reliably intercept paste operations into terminal applications, then in theory we should be able to generically disrupt the majority of ClickFix-style attacks.

And in this case, it is almost easier done than said.

To detect pastes into Terminal, we will do the following:

1.  Detect `Command+V` / `⌘+V` (the well known macOS keyboard shortcut for paste, as seen in the ClickFix examples above).
2.  Determine whether the destination of the paste is a terminal application.
3.  If so, intercept the paste and alert the user.

It may be tempting to improve this approach by attempting to track whether the paste originated from a browser. However, some ClickFix attacks originate via chat applications or email, so relying solely on browser attribution would be insufficient.

In macOS, we can leverage the `NSEvent` class’s `addGlobalMonitorForEventsMatchingMask:handler:` method to detect when `⌘ (Command)+V` is pressed:

```obj-c
[NSEvent addGlobalMonitorForEventsMatchingMask:NSEventMaskKeyDown
                                       handler:^(NSEvent *event) {

    if ((event.modifierFlags & NSEventModifierFlagCommand) &&
        ([[event.charactersIgnoringModifiers lowercaseString] isEqualToString:@"v"])) {

        // Command+V was pressed!
    }

}];
```

Before going further, let’s note that a global event monitor rightfully requires Accessibility permissions. The following code snippet from BlockBlock shows how to see if the code has such permissions (via `AXIsProcessTrusted`), and if not, trigger an alert for the user to grant it (via `AXIsProcessTrustedWithOptions`):

```obj-c
if(!AXIsProcessTrusted()) {
    AXIsProcessTrustedWithOptions((__bridge CFDictionaryRef)@{
        (__bridge id)kAXTrustedCheckOptionPrompt: @YES
    });
}
```

  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8abdf5bf0bdb7455.png)

AXIsProcessTrustedWithOptions will trigger an Accessibility Access Alert

Once Accessibility permissions have been granted, the handler registered via `addGlobalMonitorForEventsMatchingMask:handler:` will fire on key presses, including `⌘+V` (`Command+V)`. If a paste is detected, we query the frontmost application to determine where the user is pasting.

```obj-c
static NSSet *terminalBundleIDs = nil;
static dispatch_once_t onceToken;
dispatch_once(&onceToken, ^{
    terminalBundleIDs = [NSSet setWithArray:@[
        @"com.apple.Terminal",
        @"com.googlecode.iterm2",
        @"com.mitchellh.ghostty",
        @"net.kovidgoyal.kitty",
        @"dev.warp.Warp-Stable"
    ]];
});

NSRunningApplication *frontApp = NSWorkspace.sharedWorkspace.frontmostApplication;
if (frontApp && [terminalBundleIDs containsObject:frontApp.bundleIdentifier]) {
    // Command+V was pressed in a terminal application!
}
```

If the frontmost application is Apple’s Terminal (`com.apple.Terminal`) or another supported terminal such as iTerm, we may be facing a ClickFix-style attack. In response, we immediately pause the terminal process via `kill(frontApp.processIdentifier, SIGSTOP)`. We then alert the user, display the contents of the clipboard, and ask them to explicitly confirm whether they wish to allow the paste:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f76df7632f707f87.png)

Block(Blocked): A ClickFix Attack

  

**Note:** Users can, of course, choose to ignore or dismiss this alert. An enterprise security tool may wish to incorporate additional safeguards to strengthen this protection, such as automatically blocking pastes that contain encoded payloads, curl pipelines, or other high-risk command patterns.

If the user clicks `Block`, we clear the pasteboard via `[NSPasteboard.generalPasteboard clearContents]`, effectively removing the malicious command before it can execute.

And that is essentially the core idea!

If you would like to see this protection in action, download the latest version of [BlockBlock](https://objective-see.org/products/blockblock.html) and enable **Paste Protection Mode**:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2be01a883db66a90.png)

ClickFix Protection, now in BlockBlock v2.3.0

### Limitations

It is important to explicitly acknowledge the limitations of any defensive mechanism. In this case, we intentionally favored simplicity over completeness. As a result, several tradeoffs exist.

Most notably, if a user pastes ClickFix commands into Terminal via Right-click → Paste (rather than using the keyboard shortcut), this implementation will not detect the action. However, most observed ClickFix campaigns explicitly instruct users to use the keyboard shortcut, which means this heuristic remains effective against the majority of currently documented attacks.

**Note:**  
I initially explored leveraging Apple’s Endpoint Security framework for this detection, but found it insufficient. There is no ES_EVENT_TYPE_AUTH_PASTE (or equivalent) event that would allow interception of paste operations at the OS level. Moreover, terminals parse pasted input line by line, executing each command individually. Many shell built-ins, such as echo, are handled directly by the shell itself and do not result in a new process execution event. As a result, monitoring execution events such as ES_EVENT_TYPE_AUTH_EXEC or ES_EVENT_TYPE_NOTIFY_EXEC — even when inspecting their associated arguments — does not reliably capture the full structure or intent of a ClickFix payload. By the time discrete processes (if any) are observed, the original pasted command has already been interpreted and partially acted upon by the shell.

Additionally, there is no supported API that provides reliable notification when new content is added to the clipboard. While polling the pasteboard is technically possible, doing so requires continuous inspection of clipboard contents, which introduces both performance overhead and legitimate privacy concerns.

Finally, the current implementation is intentionally broad, as it alerts on **any** paste into Terminal. This design choice favors safety over precision and may result in benign pastes triggering alerts. Moreover, as ClickFix attacks are unlikely to succeed against seasoned Terminal users (right!? 😅), this protection is primarily intended for users who rarely, if ever, use Terminal. For such users, even benign paste events are uncommon, making alerts both meaningful and low-noise.

That said, the approach can be refined through additional heuristics, such as examining clipboard contents for length, encoded payloads, or suspicious command patterns, or incorporating contextual signals like recent application usage.

If the **“Apply Heuristics”** option is enabled, BlockBlock implements simple heuristics and will alert only on pastes it considers suspicious, ignoring others. These heuristics include length checks, detection of pipes to a shell, use of `base64`, `curl`, `osascript`, `exec*` calls, and more.

If you’re interested in the specifics, take a peek at the code in the [`shouldAllowPaste:`](https://github.com/objective-see/BlockBlock/blob/3d7d548e7b399bd42f83bddc2c3ef7de510cf28f/Application/Application/AppDelegate.m#L837) method.

BlockBlock also mitigates alert fatigue by allowing users to approve a paste and automatically permit subsequent pastes within the same Terminal instance. Future iterations may introduce more context-aware heuristics to minimize superfluous alerts without weakening the protective boundary.  

* * *

### 👋🏼 Takeaways

**ClickFix** represents a shift in attacker tradecraft. Rather than exploiting software vulnerabilities, it exploits user trust and normal system behavior. By instructing users to execute attacker-controlled commands directly within a terminal (commands they believe will resolve a problem) adversaries can effectively sidestep many traditional OS-level safeguards and install malware.

This post outlines a lightweight, execution-boundary defense that intervenes at paste time. While not comprehensive, this approach reduces exposure to a rapidly growing attack vector with minimal complexity or resource overhead.

### 💕 Support

Love these blog posts and free tools? You can support them via my [Patreon](https://www.patreon.com/bePatron?c=701171) page!  
  
[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3eacf1e96571c6f7.png)](https://www.patreon.com/bePatron?c=701171)
