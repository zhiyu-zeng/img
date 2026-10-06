---
title: IP and DNS Leaks in WebKit Affecting Proxy Browsers and Apple iCloud Private Relay | Mysk Blog – In-Depth Cybersecurity & Mobile App Privacy Research
source: https://mysk.blog/2026/08/04/webkit-proxy-icloud-private-relay-ip-leak/
source_host: mysk.blog
clip_date: 2026-10-06T10:19:24+08:00
trace_id: 9879d32f-319d-47e5-8041-d94ac8008135
content_hash: d6627c6bdee419ee1eed2980004d74c8a7a31021c6bb208ff551053ac0d0836c
status: synced
tags:
  - 漏洞分析
  - 网络工具
series: null
feed_source: Mysk·iOS/macOS隐私安全
ai_summary: WebKit 存在三处绕过代理配置的泄漏，会把设备真实 IP 或 DNS 服务器直接暴露给网站，影响 iOS 代理浏览器与 iCloud Private Relay。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 3f175244-d011-81da-9a4a-f69ef89794db
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> WebKit 存在三处绕过代理配置的泄漏，会把设备真实 IP 或 DNS 服务器直接暴露给网站，影响 iOS 代理浏览器与 iCloud Private Relay。
> 
> - **DNS 预取：** 页面用 `<link rel="dns-prefetch">` 可让 WebKit 走设备原生 DNS 解析而非代理；攻击者可嵌入每访客唯一主机名并在自有权威 DNS 观察真实来源。iOS 26.0 才启用，Private Relay 拦不住。
> - **WebAuthn 关联源请求：** 当 `rpId` 与页面源不同，系统凭据服务自行发起 `https://<rpId>/.well-known/webauthn` 请求，不经浏览器网络栈；配合 `mediation: "conditional"` 可无 UI 触发，暴露真实 IP。iOS 18.0 起可用。
> - **WebTransport：** `new WebTransport(url)` 建立 HTTP/3（QUIC）直连，WebKit 不为其提供会话代理，服务器看到真实 IP；iOS 26.4 公开。Onion Browser 的 Silver 级别因 Lockdown Mode 禁用该 API 而幸免。
> - **影响范围：** 凡依赖 `WKWebsiteDataStore.proxyConfigurations`（iOS 17 / macOS 14 引入）的浏览器均中招，含所有 iOS Tor 浏览器与 Psylo，以及仅代理 Safari 的 iCloud Private Relay；系统级 VPN 不受影响。
> - **缓解措施：** Psylo 1.3.1 屏蔽 dns-prefetch 提示，并默认关闭 WebTransport 与 WebAuthn，可按 silo 单独重新开启以保留 passkey 等合法用途。

Note

Like our research? Try Psylo.

**Psylo** is our privacy-first browser for iOS and iPadOS, with a built-in proxy network, per-tab isolated web sessions, and anti-fingerprinting. Using it helps fund more work like this.

[Read why we built it →](https://mysk.blog/2025/06/17/introducing-psylo/)

## Summary

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/55a290213d4a93e6.webp)

Our proof-of-concept website leaks.psylo.app that detects the leaks

WebKit-based browsers on iOS and macOS can be built to route all web traffic through proxy servers. This is how all proxy browsers work on iOS, including iOS Tor browsers and our own browser, Psylo. Every network connection a web page makes is supposed to flow through the configured proxy, so websites only ever see the proxy’s IP address. We found three WebKit features that bypass the proxy configuration and send traffic directly from the device instead:

-   **DNS prefetching** resolves hostnames through the device’s normal DNS path, which reveals the user’s real DNS servers instead of the proxy’s. Available since iOS 26.0.
-   **WebAuthn Related Origin Requests** make the operating system’s credential service fetch a validation file directly from the device. This exposes the device’s real IP address. Available since iOS 18.0.
-   **WebTransport** opens a direct HTTP/3 connection and bypasses the proxy, which also exposes the device’s real IP address. Available since iOS 26.4.

These leaks also impact Apple’s iCloud Private Relay. It must be noted that VPNs are not affected, since they tunnel the device’s entire network traffic at the system level.

We’ve reached out to the Tor Project and the developers of [Onion Browser on iOS](https://onionbrowser.com/) about these issues.

To test the leaks, you can visit our proof-of-concept website at [leaks.psylo.app](https://leaks.psylo.app/).

> **Fixed in Psylo 1.3.1:** Psylo now blocks `dns-prefetch` hints and disables WebTransport and WebAuthn by default. For websites that genuinely need these features, each one can be re-enabled through per-silo toggles. This explicit opt-in keeps the privacy trade-offs in the user’s hands. See [Mitigations Introduced in Psylo 1.3.1](https://mysk.blog/2026/08/04/webkit-proxy-icloud-private-relay-ip-leak/#mitigations-introduced-in-psylo-131) for details.

## Background

### Proxy Configuration on iOS and macOS

Introduced in iOS 17 and macOS 14, `WKWebsiteDataStore.proxyConfigurations` allows WebKit-based browsers route all of their own web traffic through proxy servers at the application level. This API is the foundation of proxy browsers on iOS: every network connection a web page makes is supposed to flow through the configured proxy, so websites only ever see the proxy’s IP address.

### DNS Leak Reported by a Psylo User

This investigation started with a bug report from a [Psylo](https://psylo.app/) user who noticed DNS leaks when visiting only certain websites, and we immediately started looking into it. Psylo routes all traffic from each silo through the [Mysk Private Proxy Network](https://mysk.blog/2025/06/30/psylo-1.0-system-architecture/) (or the user’s own configured custom proxy), so DNS queries should all originate from the proxy server and never from the device. It also seemed odd that this only affected some websites, and not all.

As we dug deeper, we found the source of the DNS leaks, plus two more leaks that actually reveal the device’s real IP address. All three leaks live in WebKit, where they bypass the proxy settings provided by `WKWebsiteDataStore.proxyConfigurations`. Since Apple’s App Store policy requires every iOS browser to use WebKit, any iOS browser that relies on this API for proxying is affected, including all iOS Tor browsers and Psylo. These leaks are also present in Apple’s iCloud Private Relay. VPNs, on the other hand, are not affected by these issues, since the device’s entire network traffic is tunneled through the VPN at the system level.

### iCloud Private Relay

[iCloud Private Relay](https://support.apple.com/en-ca/102602) is Apple’s privacy feature for iCloud+ subscribers. When enabled, it proxies Safari’s (and only Safari’s) web traffic and DNS queries through a two-hop relay, designed so that no single party, not even Apple, can see both who you are and which sites you visit. As it turns out, all three leaks described in this article occur outside WebKit’s standard page-loading process, meaning Private Relay is susceptible to the same leaks.

## 1\. DNS Prefetching

DNS prefetching lets a website ask the browser to resolve a hostname before it’s needed. So when later it needs to connect to that hostname, the lookup is already done and the connection starts faster. This is done through a `<link rel="dns-prefetch">` HTML tag.

When a page includes that tag, WebKit resolves the hostname through the device’s normal DNS path, regardless of any proxy set by the browser through `WKWebsiteDataStore.proxyConfigurations`. A page can embed unique per-visitor hostnames in these tags, then watch the queries arrive at its own authoritative DNS server from the visitor’s real network rather than the proxy’s.

This was the leak behind the original user report, and it explains why only some websites triggered it: without prefetch tags on the page, WebKit doesn’t perform this DNS lookup.

Private Relay doesn’t catch this one. It normally proxies Safari’s DNS queries, but these prefetch lookups skip it. The query reaches the authoritative server from the device’s real network even with Private Relay enabled.

> Desktop Safari has supported `<link rel="dns-prefetch">` since Safari 5, but iOS ignored it until iOS 26.0 (September 2025), when WebKit enabled it in the same change that removed iOS’s older, implicit speculative DNS prefetching ([bug 285744](https://bugs.webkit.org/show_bug.cgi?id=285744), [290327@main](https://commits.webkit.org/290327@main); [browser-compat data](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/rel/dns-prefetch)). That resolver had been rewritten the year before, to keep hostnames out of system logs during private browsing ([bug 272190](https://bugs.webkit.org/show_bug.cgi?id=272190), [279199@main](https://commits.webkit.org/279199@main)).

## 2\. WebAuthn Related Origin Requests

WebAuthn is the web standard behind passkeys. A passkey is normally bound to a single domain, but Related Origin Requests let an organization use one passkey across a small set of domains it owns.

To make that work, when a page requests a credential whose `rpId` differs from its own origin, the client first fetches `https://<rpId>/.well-known/webauthn`, a JSON file listing which origins may use that `rpId`.

That validation fetch doesn’t come from the browser’s network stack. WebKit hands WebAuthn ceremonies to the operating system’s credential service, which issues the HTTPS request itself, directly from the device and unaware of any proxy the host app configured. A page can set `rpId` to a host of its choosing, and the fetch fires even without user interaction: with `mediation: "conditional"` and no UI ever appears.

The same reasoning applies to iCloud Private Relay. Because the fetch is issued by the operating system’s credential service rather than by Safari, it never enters Private Relay’s proxied path. The destination server sees the device’s real IP address either way.

> Apple announced the feature for iOS 18.0 / Safari 18.0 (September 2024) in [WebKit Features in Safari 18.0](https://webkit.org/blog/15865/webkit-features-in-safari-18.0/). WebKit’s half of the plumbing landed earlier that year ([bug 268426](https://bugs.webkit.org/show_bug.cgi?id=268426), [274592@main](https://commits.webkit.org/274592@main)) and even shipped, inert, in iOS 17.4; the system component that performs the fetch only gained support in 18.0.

## 3\. WebTransport

WebTransport is a low-latency alternative to WebSocket. It runs over HTTP/3 and QUIC, offers multiple independent streams plus unreliable datagram delivery, and can fall back to HTTP/2 where QUIC is unavailable.

Calling `new WebTransport(url)` opens a QUIC connection straight from the device. WebKit builds the connection with its own network parameters and never offers it the session’s proxy, so the server sees the device’s real IP address instead of the proxy’s.

Private Relay doesn’t help here either. WebKit builds the connection outside the web traffic that Private Relay proxies, so a WebTransport server learns the device’s real IP address even with Private Relay enabled.

There is one exception: Onion Browser’s “Silver” security level configures WebKit with Lockdown Mode, which disables WebTransport entirely, so Onion Browser users at the Silver level are not affected by this particular leak.

> First traces of the API appeared in 2023 ([bug 260810](https://bugs.webkit.org/show_bug.cgi?id=260810), [267408@main](https://commits.webkit.org/267408@main)) but sat disabled until December 2025, when it was switched on for platforms with sufficient Network.framework support ([bug 303453](https://bugs.webkit.org/show_bug.cgi?id=303453), [303860@main](https://commits.webkit.org/303860@main)). It shipped publicly in iOS 26.4 (March 2026); see [WebKit Features for Safari 26.4](https://webkit.org/blog/17862/webkit-features-for-safari-26-4/) and the [Safari 26.4 Release Notes](https://developer.apple.com/documentation/safari-release-notes/safari-26_4-release-notes).

## Mitigations Introduced in Psylo 1.3.1

We’ve addressed all three leaks in Psylo 1.3.1:

-   Psylo blocks `dns-prefetch` hints, so a page can no longer make your device resolve attacker-controlled hostnames.
-   WebTransport is disabled by default.
-   WebAuthn is disabled by default.

Passkeys and WebTransport have legitimate uses, so both can be re-enabled at any time through per-silo toggles. This keeps Psylo leak-free out of the box, while users who need one of these features on a given site can opt in explicitly, with a clear understanding of the trade-off.

Note

Found this research useful?

Help fund more of it by trying **Psylo**, our privacy-first browser for iOS and iPadOS — with a built-in proxy network, per-tab isolated web sessions, and anti-fingerprinting.

[Read why we built it →](https://mysk.blog/2025/06/17/introducing-psylo/)
