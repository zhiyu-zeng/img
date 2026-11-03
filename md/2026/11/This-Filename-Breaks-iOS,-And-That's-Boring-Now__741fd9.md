---
title: This Filename Breaks iOS, And That's Boring Now
source: https://bryce.co/missing-images/
source_host: bryce.co
clip_date: 2026-11-03T10:32:15+08:00
trace_id: eb895763-9ad2-4d33-9ebf-c75c9cdb58ac
content_hash: 1498db0a8a234555c4a2c2dc86828a34688691950a94de3c74c79c2609f5873e
status: synced
tags: []
series: null
feed_source: Bryce Bostwick·iOS逆向
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40d75244-d011-818c-9d85-c94fab6e884b
ioc: null
---

You can’t use an image named `highjump.png` in an iOS app.

Go ahead, try it! As long as you’re using the standard asset catalog system, on iOS 26+, `highjump` won’t appear.

This post would normally be a long technical dive with a very tiny scrollbar, where we figure out how asset compilation works on Apple platforms, trace through three different binaries, and eventually run into the cause, after way more reverse engineering than you’d expect.

But it’s late 2026, and if you ask an LLM to just solve the bug for you, they’ll do so, even in Apple’s closed-source binaries - eventually finding a function called `IBHashImageName`, which hashes asset filenames, and happens to return `0` for `highjump`, when then breaks things elsewhere.

More than that, it’ll walk you through exactly how you can find that information yourself, if you want - filling in whatever gaps of knowledge you in particular happen to have.

I think there’s still value to long technical posts, but if I wrote this one up… I’m actually not sure I’d read it myself anymore. I think there’s still a *lot* of interesting things to do on iOS, and that those things are more accessible than ever. But after some delightful years of really dense technical posts - it might be the end of tiny scrollbars on this site.

* * *
