---
title: "[Video] How Apple Hooks Entire Frameworks"
source: https://bryce.co/swizzle-everything/
source_host: bryce.co
clip_date: 2026-11-03T10:31:02+08:00
trace_id: be536686-5b17-4f4e-b32e-db60dbd6b7bc
content_hash: 185ded70947d1e30d9b2ff8be44dba53d9e865e291c56cab8ae2fd91aa1f19c2
status: synced
tags:
  - iOS逆向
  - Hook
series: null
feed_source: Bryce Bostwick·iOS逆向
ai_summary: TL;DR：借鉴 Apple Main Thread Checker 的原理，用共享汇编处理器加运行时内存映射 trampoline，突破方法 swizzle 的规模上限，实现对任意数量方法的批量 hook。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40d75244-d011-8138-ae0b-c835c19d1d8a
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：借鉴 Apple Main Thread Checker 的原理，用共享汇编处理器加运行时内存映射 trampoline，突破方法 swizzle 的规模上限，实现对任意数量方法的批量 hook。
> 
> - **规模瓶颈：** Apple 的 Main Thread Checker 能 swizzle 数万个方法，但面对百万级方法就撑不住了，除非在二进制体积上做出重大妥协。
> - **核心机制：** 每个方法被替换为独一无二的 trampoline，统一跳转到共享汇编处理器；处理器据此识别目标方法，保存全部参数寄存器、调用注册的回调、恢复寄存器后跳回原实现。
> - **突破思路：** 传统方案需预先写死 trampoline 数量；该框架借鉴 `imp_implementationWithBlock` 的技巧，二进制内只放固定数量的 trampoline，需要时再映射更多进内存，期间还要绕过 iOS 代码签名限制。
> - **批量优化：** 可选启用私有 API `class_replaceMethodsBulk`，对单个类的全部方法只获取一次 runtime lock 即完成替换，受编译器开关控制。
> - **工程产物：** Xcode 工程产出 `SwizzleEverything` 与 `SwizzleEverythingPrivateAPIs` 两个框架，完整实现已开源在 GitHub，视频演示了 arm64 版本。

Six years ago (!), I wrote a post about reverse engineering [Apple’s Main Thread Checker](https://bryce.co/swizzle-all-uikit/).

That post essentially ended with the age-old question:

> Can we do better?

I left that question alone at the time, but it turns out, the answer is yes. Apple’s implementation scales incredibly well, but it hits limits eventually — it can swizzle tens of thousands of methods, but it can’t really handle millions, not without some significant tradeoffs in binary size.

This video is an investigation into how to really push past that limit.

  

## 实现方案详解

A more polished version of the library we make in that video is available on [GitHub](https://github.com/brycebostwick/SwizzleEverything). As a brief substitute for having an actual text post here (which, sorry — maybe I’ll come back to add one, because I like them too — but this whole project has already taken… several months longer than expected), this excerpt from the readme explains the methodology pretty well:

> Swizzling a single method is easy; swizzling many methods is tricky. To deal with different parameter and return types, we replace each method with a unique trampoline that bounces us to a shared assembly handler.

> That handler then uses that unique trampoline to figure out what method we were going to, saves all parameter registers onto the stack, calls whatever overall callback we registered, restores the parameter registers, and then branches back to the original implementation.

> That’s equivalent to how Apple’s Main Thread Checker already works, but the standard setup involves knowing in advance exactly how many trampolines you need, which limits the possibilities of the framework.

> Instead, this framework uses a technique inspired by `imp_implementationWithBlock` (shoutout Landon Fuller for the awesome [write-up](https://web.archive.org/web/20250131045152/https://landonf.org/code/objc/imp_implementationWithBlock.20110413.html)) when that runtime feature was first added) to start with a fixed number of trampolines in the binary and map more of them into memory as needed. This involves a couple tricks to make data accessible and workaround iOS codesigning requirements, but the end result is being able to support an arbitrarily large number of methods.

> Finally, the framework optionally supports using the private `class_replaceMethodsBulk` function to replace all the methods on a single class while only acquiring the runtime lock once. Because this is a private method, its usage is gated behind a compiler flag. The Xcode project is set up to produce two frameworks — `SwizzleEverything` and `SwizzleEverythingPrivateAPIs` — to make it easy to pull in either version, depending on your use case.

## 延伸阅读

The original [blog post](https://bryce.co/swizzle-all-uikit/)) is still worth a read if you want a deep dive into how the trampoline side works — but if you want the updated `arm64` version, or want to see how we can use memory mapping to create more trampolines at runtime, definitely check out the video or the implementation on GitHub!
