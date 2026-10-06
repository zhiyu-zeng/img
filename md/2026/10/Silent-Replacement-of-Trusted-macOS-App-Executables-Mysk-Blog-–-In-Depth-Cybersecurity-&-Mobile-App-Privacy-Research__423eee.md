---
title: Silent Replacement of Trusted macOS App Executables | Mysk Blog – In-Depth Cybersecurity & Mobile App Privacy Research
source: https://mysk.blog/2026/07/23/macos-overwrite-app-executables/
source_host: mysk.blog
clip_date: 2026-10-06T10:18:23+08:00
trace_id: eea86941-fe60-496d-8a2d-76c237d914d8
content_hash: d33ba47ce359624d811a299993e73b130f75e2de8f1b6cc4162a20c8a4be977d
status: synced
tags:
  - macOS安全
  - 漏洞分析
series: null
feed_source: Mysk·iOS/macOS隐私安全
ai_summary: macOS 允许已信任应用的主可执行文件被静默替换，系统仍以原应用身份弹出 Keychain/TCC 授权，Apple 认定不构成安全问题、不予修复。
ai_summary_style: key-points
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 3f175244-d011-813f-8cb7-f72b0979f22a
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> macOS 允许已信任应用的主可执行文件被静默替换，系统仍以原应用身份弹出 Keychain/TCC 授权，Apple 认定不构成安全问题、不予修复。
> 
> - **影响范围：** macOS Tahoe 26.0.0–26.5.2 与 Golden Gate 27 beta 1–4；更早版本可能同样受影响，但未测试。
> - **触发条件：** 目标应用从网页下载（非 App Store，属当前用户所有）、已至少启动过一次（Gatekeeper 已完成首次校验）、攻击者已取得当前用户权限——无需提权。
> - **核心手法：** 用 `tar` 打包 `Signal.app`、`rm -rf` 删除原 bundle、再解包回 `/Applications`，此后对该 bundle 内容的写入不再被拦截（此前连 `sudo touch` 都被拒绝）。资源哈希因未变动仍校验通过，替换进去的 ad-hoc 签名可执行文件被允许运行。
> - **攻击收益：** 伪造程序位于 `Signal.app` 内，弹窗沿用 Signal 的名称与图标，用户批准后即可读取其 Keychain 加密密钥及 `~/Desktop`、`~/Documents` 的 TCC 保护数据；随后可自杀并重启原程序降低暴露。影响同样波及 Brave、Cursor、VS Code、Slack、Xcode 等。
> - **Apple 判定：** 未绕过 Gatekeeper/TCC，且属社会工程，报告于 2026-07-14 关闭；建议启动前重新校验变更过的 bundle 签名，并在授权提示中展示请求方的签名身份（开发者/Team ID），而非仅名称与图标。

Note

Like our research? Try Psylo.

**Psylo** is our privacy-first browser for iOS and iPadOS, with a built-in proxy network, per-tab isolated web sessions, and anti-fingerprinting. Using it helps fund more work like this.

[Read why we built it →](https://mysk.blog/2025/06/17/introducing-psylo/)

## Affected Platforms

-   macOS Tahoe 26.0.0 – 26.5.2
-   macOS Golden Gate 27 beta 1, 2, 3, and 4
-   Earlier versions of macOS are likely affected as well, but have not been tested.

## Summary

macOS provides several safeguards to prevent applications and scripts from tampering with other installed applications. In this post, we show a bug in macOS that allows an attacker to:

-   Silently replace an application’s main executable under `/Contents/MacOS/` without triggering an authorization prompt.
-   Relaunch the modified application normally, without displaying any security warnings.
-   Impersonate the trusted application in system permission prompts to request access to Keychain secrets and files protected by Transparency, Consent, and Control (TCC), including those inside `~/Desktop` and `~/Documents`.

The attack requires only code execution as the current user, and does not require elevated privileges.

> ### Summary for Non-Technical Readers
> 
> We found a macOS security issue that Apple looked into but decided not to fix. If you run a malicious app or script on your Mac, an attacker could:
> 
> -   Secretly replace trusted apps you already have installed from the web with malicious versions.
> -   Request permissions to access private data on behalf of those trusted apps, including files in places you expect to be private, such as your Desktop or Documents folders, or your Keychain.
> 
> Replacing a trusted app requires neither your Mac’s password nor any special approval, and it can happen entirely in the background. Accessing protected data still requires your approval, but the macOS system prompts show the trusted app’s name and icon, making the requests appear to come from the real app.

## Background

### macOS Application Bundles

On macOS, apps are distributed as **application bundles**, which are directory structures that appear as a single `.app` file in Finder. An application bundle contains the app’s executable, resources such as icons and artwork, embedded frameworks and libraries, and metadata. [Apple’s documentation](https://developer.apple.com/documentation/bundleresources/placing-content-in-a-bundle) describes the bundle format in more detail.

When a user downloads an app from the Internet and launches it for the first time, macOS verifies its code signature and notarization and applies Gatekeeper policies to determine whether the app is trusted to run.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/368d82d45553ab04.png)

macOS verifying the integrity and notarization of an application before its first launch.

After the app is installed (for example, by dragging it into `/Applications`) and opened, macOS also protects the contents of its bundle. Other applications and scripts, even those running with administrator privileges, cannot modify files inside it. macOS blocks any such attempt and alerts the user that it prevented the modification.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8bb54c351aba9393.png)

macOS alerts the user when an application or script attempts to modify the contents of another application's bundle.

## Archive and Restore

We accidentally discovered a scenario in which any application or script running with the current user’s privileges can silently replace the main executable of an application bundle and launch the modified application without triggering a code-signature or security warning.

The issue is reproducible when:

1.  The app was downloaded from the web rather than installed through the Mac App Store. App Store apps are owned by root, while apps downloaded from the web are typically owned by the current user.
2.  The app has already been launched at least once, allowing Gatekeeper to complete its initial verification.
3.  The attacker already has code execution as the current user, for example through a malicious app or downloaded script.

We’ll use **Signal** as an example. To be clear, this is **not** a Signal vulnerability. Signal is simply a convenient demonstration target because it is widely trusted and distributed outside the Mac App Store. The same behaviour affects other apps downloaded from the web, including Brave Browser, Cursor, Mullvad Browser, Proton Mail, Slack, Visual Studio Code, Xcode, and many others.

After installing Signal and launching it once, macOS prevents subsequent modifications to its application bundle. You can verify this by running:

```bash
% touch /Applications/Signal.app/Contents/MacOS/Signal
touch: /Applications/Signal.app/Contents/MacOS/Signal: Operation not permitted
```

Even with `sudo`, you still cannot modify the application’s main executable:

```bash
% sudo touch /Applications/Signal.app/Contents/MacOS/Signal
touch: /Applications/Signal.app/Contents/MacOS/Signal: Operation not permitted
```

However, archiving the application bundle with `tar`, deleting the original, and extracting the archive back into `/Applications` changes this behaviour:

```bash
% cd /Applications/
% tar cf .Signal.tar Signal.app
% rm -rf Signal.app
% tar xf .Signal.tar -C /Applications
```

The restored app launches normally, despite being a different copy of the original bundle. What’s surprising is that its contents can be modified without triggering an authorization prompt:

```bash
% touch /Applications/Signal.app/Contents/MacOS/Signal
%
```

It works!

Video: Archiving and restoring an application bundle allows it to be modified without requiring user authorization.

At this point, replacing the app’s main executable is straightforward. The modified app continues to launch, and macOS displays neither a Gatekeeper warning nor any indication that its bundle has been altered. Here’s a minimal example that uses Swift to compile a dummy executable and then replaces Signal’s main executable with it:

```bash
# Write a minimal Swift program that shows a window
cat << EOF > /tmp/dummy.swift
import Cocoa

let app = NSApplication.shared
let window = NSWindow(
    contentRect: NSRect(x: 0, y: 0, width: 400, height: 200),
    styleMask: [.titled, .closable, .miniaturizable, .resizable],
    backing: .buffered,
    defer: false
)
window.center()
window.title = "Hi! I'm Signal!"
window.makeKeyAndOrderFront(nil)
app.activate(ignoringOtherApps: true)
app.run()
EOF

# Compile it as a command-line macOS executable
swiftc -framework Cocoa /tmp/dummy.swift -o /tmp/dummy

# Replace the main Signal executable with the dummy binary
cp /tmp/dummy /Applications/Signal.app/Contents/MacOS/Signal

# Launch the now-modified app (should display a window, not real Signal)
open /Applications/Signal.app
```

This behaviour is consistent with how [macOS code signing protects application bundles](https://developer.apple.com/documentation/technotes/tn3126-inside-code-signing-hashes). The bundle’s resources are sealed by hashes stored in the `_CodeSignature/CodeResources` file, while the main executable carries its own embedded code signature. Because the archive-and-restore process leaves the bundle resources unchanged, their hashes continue to validate successfully.

The replaced executable, however, is ad hoc signed, and macOS permits ad hoc signed executables to run. As a result, the modified application bundle launches successfully even though its original executable has been replaced.

What appears inconsistent is that macOS continues to recognize the modified bundle as the same trusted app — though not entirely, since the replacement executable still triggers Keychain and TCC prompts, as discussed in the next section. Once the original developer-signed executable has been replaced with an ad hoc signed one, we would expect macOS to treat the bundle as a different app and require it to establish trust again.

This explains why the app must first be launched successfully. If its main executable is replaced before the first launch, initial validation fails and macOS reports that the app is damaged and should be moved to the Trash. If the executable is replaced after the first launch, however, the modified bundle continues to launch under the original app’s identity.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/1c196e924803450d.png)

Replacing the main executable before the application's first launch causes the initial validation to fail.

## A Proof-of-Concept Attack

With these building blocks, we can create a simple proof of concept that archives the application bundle, restores it, replaces its main executable, and launches the modified app.

The replacement executable is ad hoc signed, so it does not inherit the original app’s code-signing identity or previously granted permissions. Attempts to access Keychain items or files protected by TCC still trigger macOS authorization prompts.

For this demonstration, the replacement executable attempts to:

1.  Access Signal’s Keychain item that stores its encryption key.
2.  Access the TCC-protected `~/Desktop` and `~/Documents` folders.
3.  After collecting the targeted secrets, terminate itself and relaunch the original Signal executable to make the compromise less noticeable.

Although macOS correctly asks the user to approve access, the prompts are misleading. Because the replacement executable resides inside `Signal.app`, they display Signal’s name and icon and appear to come from the real app.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/972d11bc136ef944.png)

macOS authorization prompt displayed when the modified Signal executable requests access to Signal's Keychain item. The prompt uses Signal's name and icon, making it appear as though the request originates from the real app.

A user who trusts Signal may approve these requests, believing they came from the original app. Once approved, the replacement executable gains access to the requested resources despite being ad hoc signed and unrelated to Signal’s developer.

When the modified Signal executable requests access to the Desktop folder, macOS displays this prompt:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/019010bb0a14e860.png)

macOS authorization prompt displayed when the modified Signal executable requests access to the Desktop folder. The prompt is visually indistinguishable from one generated by the legitimate application.

For comparison, a request from Terminal produces the same macOS authorization prompt:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/025f51f085d0f2e7.png)

macOS authorization prompt displayed when Terminal requests access to the Desktop folder.

This proof of concept does not bypass TCC, Keychain protections, or code signing. It instead exploits the user’s trust in an installed app: since the prompts are genuine macOS system prompts, they’re visually indistinguishable from ones generated by the real app.

Here is the proof of concept in action. To make each step easier to follow, the replacement executable displays a window with buttons that trigger individual actions. A real attack could perform these actions automatically in the background, without displaying an interface.

## Apple’s Assessment

Apple concluded that the reported behaviour does not constitute a security issue for the following reasons:

-   The proof of concept replaces the entire application bundle rather than modifying an existing signed executable.
-   The attack requires code execution as the current user and only affects applications owned by that user.
-   The replacement executable does not inherit the original application’s entitlements or previously granted TCC permissions, requiring the user to approve new authorization prompts.
-   Apple considers convincing a user to approve these prompts to be a matter of social engineering rather than a bypass of TCC or other security mechanisms.
-   Gatekeeper is designed to evaluate downloaded applications before their first launch and is not intended to protect files already owned and modified by the current user.

Based on these findings, Apple determined that neither Gatekeeper nor TCC was bypassed and that the report did not require a security fix.

## Discussion

This behaviour does not bypass Gatekeeper or TCC. It does, however, let an attacker silently replace the main executable of a trusted app and exploit that trust through authentic but misleading system prompts. Revalidating modified application bundles or identifying the requesting executable’s code-signing identity in authorization prompts would make the attack far less effective.

## Suggested Remediation

-   Revalidate an application’s code signature before launch when its bundle has changed. The brief validation process macOS displays after the modification suggests it has already detected the change.
-   Improve authorization prompts by displaying the code-signing identity (developer or Team ID) of the executable requesting access, not just the application’s name and icon.

## Demos & Videos

### Video: Replacing Signal’s Main Executable

### Video: Replacing a Background Executable to Spy on the Clipboard

### Related Video: Re-establishing a Signal Session Using a Stolen Encryption Key

## Report Timeline

| Date | Event |
| --- | --- |
| **June 4, 2026** | Mysk submits report to Apple. |
| June 9, 2026 | Apple requests more information. |
| June 11, 2026 | Mysk sends the proof-of-concept source code. |
| July 13, 2026 | Mysk asks for an update and discusses possible disclosures to Proton, Signal, Brave, and Mullvad. |
| July 14, 2026 | Apple responds: “We’ve taken an initial pass at reproducing this report.” |
| **July 14, 2026** | Apple closes the report. |

Note

Found this research useful?

Help fund more of it by trying **Psylo**, our privacy-first browser for iOS and iPadOS — with a built-in proxy network, per-tab isolated web sessions, and anti-fingerprinting.

[Read why we built it →](https://mysk.blog/2025/06/17/introducing-psylo/)
