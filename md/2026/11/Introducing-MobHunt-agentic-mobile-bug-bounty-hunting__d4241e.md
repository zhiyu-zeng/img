---
title: "Introducing MobHunt: agentic mobile bug bounty hunting"
source: https://ivrodriguez.com/introducing-mobhunt/
source_host: ivrodriguez.com
clip_date: 2026-11-03T10:25:03+08:00
trace_id: b97ddee9-d2ff-491b-a9a0-8bb00cf0e54c
content_hash: 497c524b30ab8b139767a84c1571dd93a550966b01545e6f0ba6958e3ea66b90
status: synced
tags:
  - AI辅助逆向
  - iOS逆向
series: null
feed_source: Ivan Rodriguez·移动安全
ai_summary: 作者开源了 MobHunt：用十余个 AI 代理自动跑完移动端漏洞赏金全流程，实测 9 份报告 2 份获赏，瓶颈不在挖洞而在验证与写报告。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40d75244-d011-81e6-b980-d14219e457b7
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 作者开源了 MobHunt：用十余个 AI 代理自动跑完移动端漏洞赏金全流程，实测 9 份报告 2 份获赏，瓶颈不在挖洞而在验证与写报告。
> 
> - **核心架构：** MobHunt 是几乎无编排代码的 Claude Code 项目，智能全在 markdown 提示里，Python 只是跑 `jadx`、解析 manifest、调用 Ghidra 的胶水；11 个代理各只负责一类漏洞（iOS/Android 各 5 个 + Mariana Trench/Semgrep 全局扫描），峰值 13 个并行，宽泛目标只会产生噪音。
> - **iOS 获取思路：** FairPlay 只加密 Mach-O 内一段字节，`Info.plist`、entitlements、内嵌框架、React Native/Hermes bundle 均为明文；Apple Silicon Mac 可原生安装并解密 iOS 应用，但依赖开发者在 App Store Connect 的设置是否选择支持 Mac。
> - **降级模式是常态：** 拿不到解密二进制时记录 `analysis_mode=partial`，跳过加密 `__TEXT` 上的字符串提取、Swift 元数据解析与反汇编，改跑资源和配置分析，仍能产出有效发现。
> - **验证优先于发现：** 设计预算主要花在杀掉自己的产出——34 条原始发现只出 2 份报告，另一目标 29 杀 21；机械门控曾杀 0 条，真正起效的是推理；曾推翻自己最漂亮的跨登录边界链（singleton 实为只写死代码），并确认所有 Firebase/云存储配置均干净。
> - **行业结论：** 移动端读发布的二进制即是验证，静态分析不是偷懒路径，7 个有效发现被拒暴露的是分诊端的移动知识缺口；获付的两份报告共同点是他人可自行复现（如生产设备上一条 `adb logcat`），最后一公里的确认与写报告仍完全靠人。

tl;dr I built an agentic mobile security research system that runs the whole mobile bug bounty pipeline, from scoping a program to writing the report. I pointed it at a set of real programs a few months ago. It produced 9 reports. Two were accepted and paid. Seven were valid findings that got pushed back on, mostly on the grounds that I had “only performed static analysis”. I want to talk about the gap that points at. The whole thing is now open source: [https://github.com/ivRodriguezCA/MobHunt](https://github.com/ivRodriguezCA/MobHunt).

## Background

I have been doing mobile application security for over 12 years, and the two platforms have aged very differently.

On Android, the acquire step is essentially what it always was. Install the app on an emulator, ask the package manager where it put the APK, pull it over ADB, run `apktool` and `jadx`. You get real Java, the manifest, the resources. Obfuscation has got heavier, but the workflow is recognisably the one I used a decade ago.

On iOS the ground moved, and that is the part that shaped MobHunt more than anything else.

## The iOS problem

App Store apps are FairPlay encrypted. For years the answer was a jailbroken device: run the app, dump the decrypted pages out of memory, load the binary in Hopper. That answer keeps getting worse. Jailbreaks arrive later, cover fewer devices and die faster, and at some point I was spending more time maintaining a research device than doing research on it.

So I changed what I was aiming at. The detail I think a lot of people gloss over is that **FairPlay does not encrypt the app. It encrypts a range of bytes inside one binary.** The Mach-O load command tells you exactly which range. Everything outside it is plaintext, and that is a lot: the `Info.plist` with its URL schemes, associated domains and ATS exceptions; the entitlements and provisioning profile; every bundled `.plist` and `.json`, which is still where credentials go to die; embedded frameworks, many of them not encrypted at all; and for React Native apps the entire JavaScript or Hermes bundle, which is to say the entire business logic. For those apps the encrypted part is mostly the runtime.

Once I started treating the encrypted binary as one input rather than the input, targets that used to be dead ends turned back into work I could do.

There is also a useful trick on Apple Silicon. Because these Macs run iOS apps natively, you can pull the app down on the Mac and decrypt it there with no jailbroken device involved. The catch is that it only works if the app can be installed on a Mac at all, and that is the developer’s choice: in App Store Connect, under Pricing and Availability, there is an “iPhone and iPad Apps on Apple Silicon Macs” setting. Compatible apps ship to the Mac App Store by default, but developers can opt out, and plenty of the interesting ones do. A good first attempt, not a strategy.

MobHunt encodes this directly. Acquisition runs the full decryption chain, tries the Mac path first, and records an `analysis_mode`: `full` if it got a real decrypted binary, `partial` if it did not. Every later stage branches on that flag. In partial mode the orchestrator skips what produces garbage on an encrypted binary, which is string extraction over an encrypted `__TEXT`, Swift metadata parsing and disassembly of any kind, and runs the resource and configuration analysers instead.

Partial mode is not a failure state. It is the normal state for a lot of App Store targets, and it still finds things. The pipeline was built around not having the binary, because most of the time you do not.

## What MobHunt is

It is a Claude Code project with almost no orchestration code in it. The intelligence lives in markdown files loaded as prompts, and the Python is boring glue that runs `jadx`, parses a manifest or talks to Ghidra.

```plaintext
/hunt <program>  ->  scope -> acquire -> recon -> hunt -> chain -> validate -> report
                                             ^                        |
                                             +---- agentic loop ------+
```

An orchestrator coordinates eleven agents. The decision everything else follows from is that **each hunter gets exactly one vulnerability class**. Five iOS hunters, five Android hunters, and three more that sweep the whole app with Mariana Trench and Semgrep. At peak that is thirteen agents reading the same app at once, each blind to the others.

Broad objectives produce noise. Ask one agent to find everything and you get twenty paragraphs about how the app uses AES. Ask it whether the `myapp-auth://` scheme carries an OAuth callback that can be hijacked and you get an answer.

## The part I actually care about

The hunting is not the hard problem. Automated mobile scanners have existed for years and are mostly useless, not because they cannot find things but because they cannot tell a configuration observation from a vulnerability. “ATS is disabled” is not a finding. “This app disables ATS and then sends the session token over HTTP” is. That gap is the entire job.

So MobHunt spends most of its design budget killing its own findings: a quick triage, a Mobile 7-Question Gate, four post-gates, and a never-submit list encoded as data. The instruction to the validator is blunt. Be strict, and when in doubt kill it.

In practice, on real runs: 34 raw findings became 2 reports on one target. On another, 21 of 29 were killed outright. And the purely mechanical gate is close to useless on its own, which is worth admitting rather than dressing up. On that 34-finding target it killed zero and punted 32 to human review. The reasoning pass did all the actual killing.

My favourite result is the one where the pipeline destroyed its own best looking finding. A chain claimed attacker-controlled state survived across the login boundary through a process-wide singleton. It looked great. Dynamic verification re-decompiled the app and found the singleton is write-only dead code: three call sites null it before anything reads it, and the field the chain assumed was the consumer is never assigned and never read anywhere. The verdict, written down verbatim, was that the claim “was inferred from the field declaration’s existence without tracing the complementary half”. Which is a polite way of saying it was wishful thinking.

Every Firebase and cloud storage configuration it checked came back clean, incidentally. The tool cleared as much as it flagged, and that is a feature.

## What happened when I pointed it at real programs

They are private programs, so I cannot name them, describe them or post the findings. That has been true since [the first time I wrote about bug bounty hunting](https://ivrodriguez.com/tips-for-mobile-bug-bounty-hunting/) and it is still true.

A full run on one app took between four and ten hours and was almost entirely autonomous. I would start `/hunt`, go do something else, and come back to validated findings and drafted reports.

The aggregate: nine reports filed, **two accepted and paid**, seven valid findings pushed back on for only doing static analysis.

That nine is not what the tool found. It is how many reports I had time to write. The pipeline produced far more, and there is still a queue of candidates that cleared the gates and are waiting on the last mile: confirmation, a clean reproduction, the writeup. That part the tool cannot do for me. Then I pivoted to other work and the queue stopped moving. Finished reports never got sent, rebuttals I had written never got posted, and four months later the backlog is stale enough that I would re-verify all of it before touching any of it.

The bottleneck was never finding candidates. Thirteen agents generate more plausible leads overnight than I can responsibly chase in a month. The bottleneck was me, and it stayed me.

## The mobile knowledge gap

To be careful here: this is not a complaint about any platform or any person. Triagers handle a firehose, most are good at it, and the two reports that got paid were handled well. The gap I want to point at is an industry one. There is far more demand for mobile security review than there are people who have spent years doing it.

Mobile is not web. On a web target you can poke the endpoint and hand someone a `curl` command. On mobile you often cannot, and that is not laziness. The logic is compiled into a binary sitting on a hundred million phones, and probing a production backend to prove a client-side bug is usually out of scope, rightly. Static analysis is not the lazy path in mobile work, it is the primary tool. That is obvious to everyone who does this and not obvious to a reviewer whose background is web.

So when a report says a shipped release build has a WebView whose `onReceivedSslError` reads a `useUntrustedCertificate` flag, throws the result away, and then evaluates `if (Boolean.TRUE.booleanValue()) { handler.proceed(); }`, that is not theoretical. A debug escape hatch got constant-folded into an unconditional accept-any-certificate in a build that is on real devices right now, and the decompiler even preserves the fossil of the check that no longer does anything. If the answer to that is “come back when you have run it dynamically”, something went wrong before the conversation started, because reading the shipped code *is* the verification.

I will be fair about the other half, though. A closed report is an opening argument, not a verdict, and the right move is to reply and give the reviewer what they are actually asking for. I never sent my rebuttals. That one is on me.

And there is a version of this worth internalizing rather than arguing with. The two that got paid had something the other seven did not: a way for someone with no access to my machine to see the problem themselves. One needed a single `adb logcat` line on an unmodified production device, because the app announces its own broken state at startup. That is the real difference, and it is not static versus dynamic. It is whether the person reading your report has to take your word for anything.

Eight years ago my first bug bounty report was closed because I could not produce a proof of concept, and I wrote at the time that the lesson was `PoC || GTFO`. Apparently I needed to learn it twice.

## Open sourcing it

It is up:

[https://github.com/ivRodriguezCA/MobHunt](https://github.com/ivRodriguezCA/MobHunt)

The eleven agents, the nine skills, the ten slash commands, the always-on rules, the validation gates, the recon and analysis tooling, the report templates and the Semgrep and Mariana Trench rule packs. No findings, no reports, no targets, and no proof of concept code written against a real app. The repo has a rule file saying so, because writing the rule down is part of the point.

Getting it ready took longer than writing it, which is worth mentioning because anyone doing this will hit the same thing. A repo that has been pointed at real targets accumulates material that must never be published: proof of concept code written against named apps, obfuscated class names that fingerprint one specific build, program-specific requirements only invited researchers ever see, worked examples in code comments that quietly identify a target. Some of it lives in git history rather than the working tree, so deleting the files is not enough. It ships from a fresh history for exactly that reason.

Two things to know if you run it. It only pulls app binaries from official stores, never from APKPure or APKMirror or any other mirror, because a repackaged binary makes your whole analysis worthless and you will not know. And it will not hand your credentials to third party CLI tools. Both are hard rules in the project, not suggestions.

One thing is missing on purpose. The decryption subsystem ships almost intact, including the Apple Silicon path above, but I cut a later fallback that spawned the target under a debugger to get around `CS_RESTRICT`. Not because the technique is dangerous or clever, it is neither, and it is publicly documented in [jhftss’s “Debug any iOS Apps on M1 Mac”](https://jhftss.github.io/Debug-any-iOS-Apps-on-M1-Mac/). The reason is narrower. DMCA 1201’s good-faith research exemption covers the *act* of circumvention, while distributing circumvention tools is restricted separately with no equivalent carve-out. Running something yourself and publishing it for others are different positions.

The distinction is real, and it is the more interesting half. `mremap_encrypted` does not defeat anything: it is Apple’s own syscall, called against an app whose licence I hold, on hardware built to run iOS apps, with SIP on. The debugger path exists specifically to get around a control put there to stop it. Same result, opposite relationship to the platform’s security model.

The architecture is adapted from [claude-bug-bounty](https://github.com/shuvonsec/claude-bug-bounty) by shuvonsec, which does this for web targets. The project structure, agent model and gate pattern come from there. It is MIT licensed, same as the upstream.

## Conclusions

-   Android acquisition has barely changed in a decade. iOS changed completely, and the winning move was to stop treating a decrypted binary as a prerequisite. Build the pipeline around the degraded case, because it is the common one.
-   The hunting was never the hard part. Deciding what to throw away was, and that is where the design effort went. A pipeline that can kill its own best looking finding is working correctly.
-   Nine reports is not what the tool found, it is what I had time to write. Automating the hunt just moves the bottleneck to confirmation and writeups, and that last mile is still entirely human.
-   There is a real mobile knowledge gap in bug bounty triage, and it is a capacity problem rather than a people problem. On mobile the shipped binary is the ground truth.
-   The reports that got paid were the ones someone else could verify without trusting me. That is a fair bar, and a better thing to optimize for than winning the argument.

That’s it. If you run it, break it, or disagree with any of the above, let me know on twitter [@ivMobAppSec](https://twitter.com/ivMobAppSec).
