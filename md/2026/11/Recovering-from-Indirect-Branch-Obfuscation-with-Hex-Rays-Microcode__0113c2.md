---
title: Recovering from Indirect Branch Obfuscation with Hex-Rays Microcode
source: https://hex-rays.com/blog/recovering-from-indirect-branch-obfuscation
source_host: hex-rays.com
clip_date: 2026-11-21T06:54:04+08:00
trace_id: 8b9aeca4-eda4-4ead-b974-37b1624f249b
content_hash: 30683f76b85f9d6b69b25bcc2131d1e49de3ac0f5b69311a125965ae7b7f28c9
status: synced
tags: []
series: null
feed_source: Hex-Rays Blog
ai_summary: null
ai_summary_style: null
images_status:
  total: 1
  succeeded: 0
  failed_urls:
    - https://hex-rays.com/hubfs/indirect-branch-blog-header.png
notion_page_id: 41e75244-d011-814a-a13f-d394c973005e
ioc: null
---

[![⚠️ 图片托管失败 · Recovering from Indirect Branch Obfuscation with Hex-Rays Microcode](https://hex-rays.com/hubfs/indirect-branch-blog-header.png)](https://hex-rays.com/blog/recovering-from-indirect-branch-obfuscation)

This article uses samples obfuscated with the [Hikari-LLVM19](https://github.com/PPKunOfficial/Hikari-LLVM19) framework to present a recovery method for AArch64 indirect branch obfuscation. The method is not intended to handle all indirect branches. Different obfuscators may compute target addresses in entirely different ways, so the target resolver still needs to match the specific obfuscation semantics. However, once one or two successors can be reliably identified, the subsequent CFG completion, function range expansion, and microcode rewriting steps can be reused directly.
![](https://track-eu1.hubspot.com/__ptq.gif?a=143552897&k=14&r=https%3A%2F%2Fhex-rays.com%2Fblog%2Frecovering-from-indirect-branch-obfuscation&bu=https%253A%252F%252Fhex-rays.com%252Fblog&bvt=rss)
