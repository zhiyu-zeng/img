---
title: "Reconstructing Rust Types: A Practical Guide for Reverse Engineers [RE//verse 2025]"
source: https://cxiao.net/posts/2025-02-28-reconstructing-rust-types-re-verse-2025/
source_host: cxiao.net
clip_date: 2026-11-12T10:22:02+08:00
trace_id: 506c2f98-e482-4f0e-bb62-0065a3f28701
content_hash: ebe0bf90c132125fadb49ec18e25c42508c2c8144350a608ebf5784d3d14ab61
status: synced
tags:
  - Rust逆向
  - 类型恢复
series: null
feed_source: cxiao·Rust逆向
ai_summary: |-
  - **核心观点：** Rust 二进制的静态逆向难点在于类型系统——即使函数符号和签名可恢复，数据流分析仍困难，因为 Rust 的类型系统、标准库和编译器与 C/C++ 差异很大。
  - **演讲内容：** 从 Rust 程序员视角和编译器视角讲解类型系统的基本构件，从原始类型入手，逐步构建 Rust 二进制中常见标准库类型（字符串格式化、错误处理等）的内存布局。
  - **实用产出：** 演讲覆盖 Rust 二进制中可揭示类型布局的二进制构件——如何定位、如何利用，以及它们在 Rust 工具链中的来源。
  - **目标受众：** 熟悉 C/C++ 逆向但不熟悉 Rust 开发与逆向的工程师，目标是建立 Rust 类型布局的心智模型并提供小块的实战恢复技巧。
  - **资源：** 2025 年 2 月 28 日于 RE//verse 大会演讲，幻灯片提供单页 HTML、演示模式 HTML 和 PDF 三种格式，并镜像在 GitHub 仓库 cxiao/reconstructing-rust-types-talk-re-verse-2025。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 41675244-d011-817d-8668-cd008371536f
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> - **核心观点：** Rust 二进制的静态逆向难点在于类型系统——即使函数符号和签名可恢复，数据流分析仍困难，因为 Rust 的类型系统、标准库和编译器与 C/C++ 差异很大。
> - **演讲内容：** 从 Rust 程序员视角和编译器视角讲解类型系统的基本构件，从原始类型入手，逐步构建 Rust 二进制中常见标准库类型（字符串格式化、错误处理等）的内存布局。
> - **实用产出：** 演讲覆盖 Rust 二进制中可揭示类型布局的二进制构件——如何定位、如何利用，以及它们在 Rust 工具链中的来源。
> - **目标受众：** 熟悉 C/C++ 逆向但不熟悉 Rust 开发与逆向的工程师，目标是建立 Rust 类型布局的心智模型并提供小块的实战恢复技巧。
> - **资源：** 2025 年 2 月 28 日于 RE//verse 大会演讲，幻灯片提供单页 HTML、演示模式 HTML 和 PDF 三种格式，并镜像在 GitHub 仓库 cxiao/reconstructing-rust-types-talk-re-verse-2025。

[Rust for the Working Reverse Engineer](https://cxiao.net/categories/Rust-for-the-Working-Reverse-Engineer/), [Presentations](https://cxiao.net/categories/Presentations/)

On February 28, 2025, I presented the talk [*Reconstructing Rust Types: A Practical Guide for Reverse Engineers*](https://re-verse.sessionize.com/session/776665), at the [RE//verse conference](https://re-verse.io/):

> As of 2024, most reverse engineers still struggle to statically reverse Rust binaries. Static RE tools are beginning to develop features for analyzing Rust, and tools for recovering Rust library function signatures now exist. However, even when function symbols and signatures are available, analyzing data flow in Rust binaries is not trivial. The Rust type system, standard library, and compiler differ in many ways from C and C++, making type recovery difficult even for experienced reverse engineers.
> 
> This talk provides a guide for reverse engineers on reconstructing types in Rust binaries. We will cover the basic building blocks of the Rust type system, from both the Rust programmer’s perspective and the Rust compiler’s perspective. From the primitive types, we will move to constructing the layouts of common standard library types found in Rust binaries, including types used in string formatting and in error handling. We will also cover artifacts inside Rust binaries that give information about type layout - how to find them, how to use them, and where in the Rust toolchain they actually come from.
> 
> The goal for this talk is to provide the audience with a solid mental model for the layouts of Rust types, and present bite-sized practical techniques for Rust structure recovery. The intended audience for this talk is reverse engineers who are familiar with reversing C or C++ code, but who are unfamiliar with both developing and reversing Rust.

RE//verse was really well organized and I had a great time there! Looking forward to seeing this reverse engineering focused conference grow. Thanks so much again to the organizers for the opportunity to present there, and to the review board for their feedback on the presentation.

## Talk Video

## Slides

Slides are available in the following formats:

-   [Single-file HTML page](https://cxiao.net/2025-02-28-reconstructing-rust-types-re-verse-2025/slides-single-page). If you would like to use the presentation slides as a reference, this is the most comfortable format.

![Preview of the single-page HTML version of the RE//verse 2025 talk slides](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b339d7f4bd5c8b10.png)

Preview of the single-page HTML version of the RE//verse 2025 talk slides

-   [HTML presentation](https://cxiao.net/2025-02-28-reconstructing-rust-types-re-verse-2025/slides-presentation-mode).
-   [PDF](https://github.com/cxiao/reconstructing-rust-types-talk-re-verse-2025/blob/main/slides/Reconstructing%20Rust%20Types%20-%20A%20Practical%20Guide%20for%20Reverse%20Engineers%20-%20Cindy%20Xiao%20-%20RE-verse%202025%20-%20PDF%20Slides.pdf).

The slides are also mirrored on GitHub, at [cxiao/reconstructing-rust-types-talk-re-verse-2025](https://github.com/cxiao/reconstructing-rust-types-talk-re-verse-2025).
