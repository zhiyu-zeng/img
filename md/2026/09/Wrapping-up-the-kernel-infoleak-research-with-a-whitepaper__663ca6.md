---
title: Wrapping up the kernel infoleak research with a whitepaper
source: https://j00ru.vexillium.org/2018/07/wrapping-up-the-kernel-infoleak-research/
source_host: j00ru.vexillium.org
clip_date: 2026-09-09T00:12:05+08:00
trace_id: 809ba16b-4c04-4b6e-a52d-10d97830632c
content_hash: 25d81bd55aa1dd66862770083cfe572a929abf3fc37683e922761eaa972803a8
status: synced
tags:
  - 内核
  - 漏洞分析
series: null
feed_source: j00ru
ai_summary: 基于 x86 模拟和污点追踪的 Bochspwn Reloaded 项目完成内核信息泄露检测研究，并以白皮书系统总结方法论与成果，相关工作中报告了大量 Windows/Linux 内核漏洞。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 3d575244-d011-810c-8e88-d4cf1fc1c1d4
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 基于 x86 模拟和污点追踪的 Bochspwn Reloaded 项目完成内核信息泄露检测研究，并以白皮书系统总结方法论与成果，相关工作中报告了大量 Windows/Linux 内核漏洞。
> 
> - **研究定位：** Bochspwn Reloaded 是基于 Bochs 的检测工具，专门发现内核把未初始化内存泄露到用户地址空间的问题。
> - **主要技术进展：** 新增对 x64 客户系统的支持，发现 17 个 64 位 Windows 平台特有 bug；还开发了面向存储设备的无污点泄露检测，帮助在 NTFS.sys 驱动中找到多个问题。
> - **自动化测试成果：** 为 Windows NtQuery 系统调用家族建立测试套件，在 14 个系统调用、23 个信息类中发现新漏洞，并尝试通过 double-writes 检测内核地址泄露。
> - **漏洞统计：** 研究期间累计发现并上报超过 70 个 Windows 未知安全漏洞，以及 10 多个 Linux 内核 bug。
> - **成果发布：** 相关进展曾在 REcon、Black Hat USA、INFILTRATE 等安全会议分享；最终白皮书系统整理内核信息泄露的成因、既有工作、检测手段、非内存数据汇和未来研究方向。

![](https://j00ru.vexillium.org/wp-content/uploads/2018/07/kernelbleed-300x76.png "Kernelbleed") Following the [previous post](https://j00ru.vexillium.org/2017/06/announcing-bochspwn-reloaded-and-my-recon-montreal-2017-slides/) in June last year, I continued to actively work on Bochspwn Reloaded, a [Bochs](http://bochs.sourceforge.net/) -based tool designed to detect leaks of uninitialized memory from kernels to the user address space. In addition to my talk at REcon Montreal 2017 ([slides](https://j00ru.vexillium.org/slides/2017/recon.pdf), [video](https://recon.cx/media-archive/2017/mtl/recon2017-mtl-03-j00ru-Bochspwn-Reloaded-Detecting-Kernel-Memory-Disclosure-with-x86-Emulation-and-Taint-Tracking.mp4)), I also gave similar presentations at Black Hat USA 2017 ([slides](https://j00ru.vexillium.org/slides/2017/bhusa.pdf), [video](https://www.youtube.com/watch?v=8tqo78E04cM)) and a Polish event called *Security PWNing Conference* held in Warsaw ([slides](https://j00ru.vexillium.org/slides/2017/pwning.pdf) in Polish).

Since then, I improved and polished various parts of the instrumentation and testing environment, which led to new waves of Windows bugs being reported to Microsoft in several iterations throughout the year. The most significant advancements I made during this time are as follows:

## 主要技术进展

-   Implemented support for x64 guest systems and used it to identify 17 new Windows bugs specific to the 64-bit platform.
-   Developed and evaluated a taint-less method of detecting leaks to mass storage devices, which helped find a number of bugs in the Windows NTFS.sys file system driver.
-   Implemented a test suite of programs to automatically test the `NtQuery` system call family on Windows, which uncovered new issues in a total of 14 syscalls across 23 different information classes.
-   Tested other types of instrumentation aimed to detect problems related to userkernel communication, such as kernel address disclosures through *double-writes*.

![↔](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ddf0db284cad126c.png)

## 漏洞统计与大会分享

[![](https://j00ru.vexillium.org/wp-content/uploads/2018/07/infiltrate-300x83.png "INFILTRATE Security Conference")](http://infiltratecon.com/) In the course of the research, I discovered and reported over 70 previously unknown security flaws in Windows (all detailed in the Project Zero [bug tracker](https://bugs.chromium.org/p/project-zero/issues/list?can=1&q=finder%3Amjurczyk+product%3Akernel+opened%3E2017-02-23+opened%3C2018-1-23+%22uninitialized+%22memory+disclosure%22&colspec=ID+Status+Restrict+Reported+Vendor+Product+Finder+Summary&cells=ids)), and more than [10](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/log/?qt=author&q=mjurczyk%40google.com) bugs in Linux. The latest progress outlined above was the subject of a talk at the INFILTRATE conference in April 2018. The slides can be downloaded below:

[**Bochspwn Revolutions: Further Advancements in Detecting Kernel Infoleaks with x86 Emulation**](https://j00ru.vexillium.org/slides/2018/infiltrate.pdf) **(slides, PDF, 4.52 MB)**

## 白皮书背景与目标

As I learned during the study, there were a number of considerations related to kernel memory disclosure that were not well suited to be presented on stage. However, they were equally important to understand the nature of the problem and how it could be effectively worked against going forward. In an attempt to systematically outline the background of the bug class and the current state of the art, I wrote a comprehensive paper on this subject. It aims to provide an exhaustive guide to kernel infoleaks, their genesis, related prior work, means of detection and future avenues of research. While a significant portion of the document is dedicated to Bochspwn Reloaded, it also covers other methods of infoleak detection, non-memory data sinks and alternative applications of full-system instrumentation, including the empirical evaluation of some of the ideas. It has already been announced at the [Project Zero blog](https://googleprojectzero.blogspot.com/2018/06/detecting-kernel-memory-disclosure.html) a few weeks ago, and can be found below:

**[Detecting Kernel Memory Disclosure with x86 Emulation and Taint Tracking](http://j00ru.vexillium.org/papers/2018/bochspwn_reloaded.pdf) (whitepaper, PDF, 1.54 MB)**

## 研究阶段总结

The paper is the culmination of over a year-long examination of the particular type of kernel issues, and marks the end of my work in this area for the moment. I hope you enjoy the read!
