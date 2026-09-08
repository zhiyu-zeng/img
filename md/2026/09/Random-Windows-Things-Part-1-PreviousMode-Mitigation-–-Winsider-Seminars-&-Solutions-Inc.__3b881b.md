---
title: "Random Windows Things Part 1: PreviousMode Mitigation – Winsider Seminars & Solutions Inc."
source: https://windows-internals.com/random-windows-things-part-1-previousmode-mitigation/?utm_source=rss&utm_medium=rss&utm_campaign=random-windows-things-part-1-previousmode-mitigation
source_host: windows-internals.com
clip_date: 2026-09-09T01:16:38+08:00
trace_id: 4fde3f1d-f8f0-4db7-b805-e27493b38834
content_hash: aaba3783b76fd588e931ddf84945079587e098dd630b12e21ee9264f4a2cb5ef
status: synced
tags:
  - 内核
  - 漏洞分析
series: null
feed_source: Yarden Shafir·Windows Internals
ai_summary: Windows 11 23H2 起新增缓解：系统调用入口把 PreviousMode 强制重置为 UserMode，返回用户态前校验否则触发 0x1F9，从而阻断此项 LPE 利用手法。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3d575244-d011-81f5-8f97-d3428817c573
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Windows 11 23H2 起新增缓解：系统调用入口把 PreviousMode 强制重置为 UserMode，返回用户态前校验否则触发 0x1F9，从而阻断此项 LPE 利用手法。
> 
> - **原有利用方式：** 通过任意内核写覆盖 `KTHREAD.PreviousMode` 为 `KernelMode`，让调用被当作驱动发起，从而跳过安全检查，可把内核写升级为完整 LPE 并用于终止 PPL 等场景。
> - **缓解之一（入口校验）：** 线程经系统调用进入内核时，`KiSystemCall64` 会把该线程的 `PreviousMode` 设为 `UserMode`，直接纠正被污染的值。
> - **缓解之二（出口校验）：** `KiSystemCall64` 返回用户态前会检查 `PreviousMode` 是否仍为 `UserMode`，若不是则以 bugcheck `PREVIOUS_MODE_MISMATCH`（`0x1F9`）触发崩溃。
> - **影响范围：** 此前所有 Windows 版本基本都能被该技术利用，缓解由 Gabriel Landau 首先发现，并在 PPLFault 相关分析中被记录。
> - **绕过难度：** 攻击者需要在内核态线程中完成 PreviousMode 修改、提权操作和恢复 UserMode，流程更复杂，但并非不可实现。

I’m starting a new series of blogs called “Yarden documents random Windows things” (I am open to alternative name suggestions) where I’ll write about some features and changes in Windows that knowledge of exists only in the communal brain of security researchers, in a footnote in a blog about a different topic, or in a vague screenshot on Twitter.

I don’t claim any of the research shown in this series is novel or done by me, and I will credit other people whenever I can. This series only exists to have a place I can point to for documentation of niche topics. If you published anything, or know of anyone who did, about these topics, please let me know and I’ll happily link it here and credit you.

The first topic of the series is: killing the `PreviousMode` overwrite exploitation technique.

## PreviousMode 覆盖利用原理

This exploitation technique, that worked in all past Windows versions until Microsoft killed it in Windows 11 23H2, included overwriting a `KTHREAD` ‘s `PreviousMode` field to set it from user to kernel mode. When a thread is running with `PreviousMode == KernelMode`, the system will skip all security and access checks, since it assumes the call came from a driver. So, an arbitrary kernel write could turn into a full LPE, bypassing all Windows security restrictions.

The mitigation for this was first spotted by [Gabriel Landau](https://x.com/GabrielLandau/status/1597001955909697536?s=20) and is mentioned in his [blog post](https://www.elastic.co/security-labs/inside-microsofts-plan-to-kill-pplfault) about PPLFault, which used the technique to achieve LPE and terminate a Protected Process Light. It was also demonstrated in [this](https://hackyboiz.github.io/2025/01/12/l0ch/bypassing-kernel-mitigation-part2/en/) blog post but the technical details of it were not fully explained.

The mitigation blocks this exploitation technique in two ways:

## 缓解机制一：入口重置

1.  When a thread enters the kernel through a system call, `KiSystemCall64` sets the thread’s `PreviousMode` to `UserMode`. This way, if the thread’s `PreviousMode` was corrupted by an exploit or arbitrary memory corruption, it is corrected back to the right value:
    
    [![](https://windows-internals.com/wp-content/uploads/2026/07/image-1-1024x315.png)](https://windows-internals.com/wp-content/uploads/2026/07/image-1.png)
    
## 缓解机制二：出口校验

2.  Before returning to user mode, `KiSystemCall64` checks if the thread’s `PreviousMode` is set to `UserMode`. If it is not (likely because it was corrupted through a kernel vulnerability), the system will crash with bugcheck code `PREVIOUS_MODE_MISMATCH` (`0x1F9`).
    
    `![](https://windows-internals.com/wp-content/uploads/2026/07/image-1024x405.png)`
    

## 绕过条件与影响

That’s it. Very simple but very effective mitigation. To bypass it, an attacker would need to corrupt the `PreviousMode` of a thread that is already in kernel mode, perform any privileged actions through that thread, then set its `PreviousMode` back to `UserMode` before it returns to user space. Not an impossible bypass to achieve but definitely complicates things compared to the original technique.
