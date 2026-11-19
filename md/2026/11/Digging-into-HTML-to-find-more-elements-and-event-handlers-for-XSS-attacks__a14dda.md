---
title: Digging into HTML to find more elements and event handlers for XSS attacks
source: https://www.hacktivesecurity.com/blog/2026/11/05/digging-into-html-to-find-more-elements-and-event-handlers-for-xss-attacks/
source_host: www.hacktivesecurity.com
clip_date: 2026-11-19T08:24:21+08:00
trace_id: da974a16-c3d6-4611-a642-8324a8d8c69c
content_hash: 3455679f75a95011d9fc8a6251b6593c1630867b4d8599f915aa877158bea7b7
status: synced
tags: []
series: null
feed_source: Hacktive Security·漏洞研究
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41d75244-d011-81e3-850d-e4246bc8d649
ioc: null
---

## Intro

This article aims to illustrate the steps taken during a small-scale research effort to identify new elements and event handlers that can be exploited in XSS attacks.

One of the largest and most widely used repository for XSS payloads is the PortSwigger XSS cheat sheet \[[1](https://github.com/PortSwigger/xss-cheatsheet-data)\]. This repository contains all the XSS attack payloads available in the associated web application \[[2](https://portswigger.net/web-security/cross-site-scripting/cheat-sheet)\]. It includes a variety of payloads for different types of XSS, prototype pollution sinks, and more.

It is open source, boasts numerous contributors, and serves as a key reference for web application penetration testers.

From time to time, new elements and event handlers emerge and are implemented across various browsers. Consequently, new XSS possibilities come into play, and new WAF rules or signatures must be implemented.

Furthermore, although XSS attacks are a widely discussed topic, new payloads can sometimes be discovered within features that have been implemented for years but have never been tested by anyone.

During this brief period of research, i looked for potential new elements and event handlers to add to the PortSwigger repository. Since the repository is widely used by many experts and is kept very up-to-date, the task did not seem easy from the outset.

Despite the difficulty in finding new things, something did turn up. During this period, 2 HTML elements not mentioned in the repository were discovered (though they do not have any specific event handlers), along with two event handlers that work on mobile versions of Safari.

## Discovery

During an initial research phase, HTML documentation \[[3](https://html.spec.whatwg.org/multipage/indices.html)\] was consulted to identify HTML elements not included in the cheat sheet, that are capable of executing JavaScript. This review uncovered two HTML elements absent from the repository:

– `fencedframe` (used as a sort of \`iframe\`)

– `search` (used as a wrapper for forms)

Although the two identified elements could be used with event handlers such as `onclick` or `onmouseover`, the repository maintainers decided not to consider them, given that these event handlers work on all elements.

Finally, while digging through various documentation, i came across a resource \[[4](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/Using_HTML5_Audio_Video/ControllingMediaWithJavaScript/ControllingMediaWithJavaScript.html)\] concerning two event handlers that only work in Safari mobile:

– `onwebkitbeginfullscreen` (triggered when a video enters full-screen mode)

– `onwebkitendfullscreen` (triggered when a video exits full-screen mode)

The documentation gives this description:

**OS X and iOS behave differently in terms of detecting which HTML elements can be brought full-screen. On iOS, you can take any full-screen video. On OS Although they share the same webkitRequestFullscreen and webkitExitFullscreen methods, the two platforms have different event listeners:**

**OSX: the webkitfullscreenchange event fires when an element enters or exits full-screen mode.**

**iOS: the webkitbeginfullscreen and webkitendfullscreen events fire when a video enters and exits full-screen mode, respectively.**

Surprisingly, no references to these event handlers were found, neither in the Portswigger repository nor in other repositories concerning XSS payloads.

As a proof of concpet i used a simple HTML page with this payload: `<video controls width="640" src="https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4" onwebkitendfullscreen="alert('xss')"></video>`

and as described in the documentation it worked on Safari mobile:

![](https://www.hacktivesecurity.com/wp-content/uploads/2026/11/xss-576x1024.png)

An analogue payload was used for testing the `onwebkitbeginfullscreen` event handler.

After verifying that the payloads worked, a pull request was opened in the Portswigger repository to add them.

## Conclusion

Despite the limited time available and the large number of maintainers and users who utilize the repository, it was possible to discover something new and make a useful contribution to the community. New payloads will constantly be discovered, and new elements will be implemented alongside new event handlers. This is the ongoing lifecycle of HTML and its associated XSS payloads. XSS attacks remain prevalent in nearly all modern applications, and these payloads, along with potential attack vectors, continue to be a critical focus for application testing and the development of new WAF signatures.

## References

\[1\] – https://github.com/PortSwigger/xss-cheatsheet-data

\[2\] – https://portswigger.net/web-security/cross-site-scripting/cheat-sheet

\[3\] – https://html.spec.whatwg.org/multipage/indices.html

\[4\] – https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/Using_HTML5_Audio_Video/ControllingMediaWithJavaScript/ControllingMediaWithJavaScript.html
