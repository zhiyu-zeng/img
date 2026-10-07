---
title: C-Sky Based Game Console
source: https://tinyhack.com/2026/10/07/c-sky-based-game-console/
source_host: tinyhack.com
clip_date: 2026-10-07T11:59:01+08:00
trace_id: 53ac161c-378c-4773-a1ad-ff215d121f99
content_hash: 147222871d4ad09c2850542315632516fb39f127fb8c939edd955b056ab3bf46
status: synced
tags:
  - 硬件逆向
  - AI辅助逆向
series: null
feed_source: tinyhack·Android/RE
ai_summary: 约 22 美元的 HOCO 充电宝兼复古游戏机采用冷门的 C-Sky 架构，作者靠 LLM 智能体完成固件逆向、游戏 patch 并自制出 SDK。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3f275244-d011-813c-a74e-d6c8fdf1baf8
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 约 22 美元的 HOCO 充电宝兼复古游戏机采用冷门的 C-Sky 架构，作者靠 LLM 智能体完成固件逆向、游戏 patch 并自制出 SDK。
> 
> - **设备定位：** 充电功能已损坏但仍能玩游戏；仅有 NES 模拟器和大量自制游戏，CPU 慢，当游戏机很差、当充电宝尚可。
> - **架构背景：** C-Sky 是 32 位架构，源自 Motorola MCore，原公司已被阿里收购并转向 RISC-V；官方 QEMU 与 capstone 至今都不支持它。
> - **LLM 智能体成果：** 正确识别 CPU；通过 Chrome MCP 登录泰芯半导体网站下载中文 SDK 与文档；逆向固件和一款游戏；patch "Pocket Change" 游戏的 main 使外设完成初始化。
> - **SDK 生成：** 方式是反复生成小程序拷到 SD 卡运行、回传寄存器值以分析寄存器初始化，耗时较长；使用了 Claude Opus 5.5 与 Codex，成果开源于 yohanes/hoco-public。
> - **结论与心态：** 只要存在文档（不必是英文），LLM 智能体能快速逆向少见架构并为其构建新 SDK；作者既遗憾 AI 夺走了逆向的乐趣，又高兴于想改造的设备都变得可行。

I have a powerbank that also acts as a retro game console, but it can’t be used for charging now. I can still use it to play games, but not as a powerbank. I bought this 3 years ago since it was based on SF2000 (using a MIPS based CPU), and there [was an active modding community](https://github.com/vonmillhausen/sf2000).

![](https://tinyhack.com/wp-content/uploads/2026/10/image-2-768x1024.png)

HOCO Powerbank with game console

I bought a new powerbank (that is also a game console), and surprisingly, this uses C-Sky architecture. The brand name is HOCO and it costs about 22 USD (740 Thai Baht). It only has a NES emulator and a lot of custom made games. Note that if you only want a retro game console, this is quite bad (CPU is slow), as a powerbank it seems to be ok.

![](https://tinyhack.com/wp-content/uploads/2026/10/image-768x1024-1.png)

This one is MIPS based

## What is C-Sky

C-Sky is a 32 bit CPU architecture, initially based on Motorola MCore developed by C-SKY Microsystems (China). The company has now been acquired by Alibaba group, and they have switched to RISC-V for their newer processors. This is the reason for my surprise: I thought that C-Sky is already dead.

I learned about the existence of this architecture from this 2018 Phoronix article: [C-SKY Architecture Approved For The Linux Kernel, Might Be The Last New CPU Arch](https://www.phoronix.com/news/C-SKY-Approved-Last-Arch) (spoiler, another new architecture “Loongarch” was added later), and from this cnx-software post [$6 C-SKY Linux Development Board Features GX6605S Media SoC with C-SKY ISA](https://www.cnx-software.com/2018/11/12/c-sky-linux-development-board-gx6605s-media-soc/).

I did buy the board at that time (because [it was discussed in Hacker News](https://news.ycombinator.com/item?id=18425643)), but there was not much that I can do. Software support was still weak at that time. It is still weak now: current official QEMU still doesn’t support this architecture, and capstone disassembler also doesn’t support this. Note: I can no longer find that board on AliExpress.

## LLM Agents vs less known CPU Architecture

If you skim around this blog, I have done a lot of reverse engineering in my life. I have reverse engineered various programs and devices. Before LLM, I would probably just postpone hacking this device because I know that this will involve a lot of detailed work, and hope that someone else will do the hard work (as in the SF2000).

But this time: i don’t think many people are even aware of this console, so I can’t expect someone else to do the work. Fortunately we can use various LLMs to reverse engineer and create new apps for this console.

Starting beginning of this year, I have used LLMs to reverse various apps for ARM and Intel architecture, and they work very well. I was not aware of many projects using C-Sky (official QEMU doesn’t even support it, capstone doesn’t support it), so I was curious if it can do the job that I asked. It did so very well:

-   It correctly identified the CPU used
-   It found some documentation (mostly in Chinese) and toolchain. I need to register and login to [Taixin Semi](https://taixin-semi.com/zh) website so the agents can download related SDKs and documentation (via chrome MCP)
-   It reverse engineered the firmware and one game so that we understand how everything works
-   It patches an existing game (called “Pocket Change”) to run its own code. It patches the `main` so that all peripherals are already initialized
-   It finally creates a custom SDK. This one took a while: it generates several small apps that I need to copy to sd card and run, and give back resulting values so it can analyze register initializations.

So the conclusion is: if we have some documentation (doesn’t have to be in English), LLM agents can reverse engineer things quickly, and even build new SDK and apps for it.

[![](https://tinyhack.com/wp-content/uploads/2026/10/image-1-768x1024.png)](https://tinyhack.com/wp-content/uploads/2026/10/image-1.png)

## Custom SDK

I used a combination of Claude (Opus 5.5) and Codex (Astra/Sol 6) to reverse engineer and create an SDK for this game console. So now you can create your own app or games.

[http://github.com/yohanes/hoco-public](http://github.com/yohanes/hoco-public)

I hope more people will share their LLM-assisted reverse engineering effort, because redoing something like this takes time (and LLM resources).

## Sad and Happy

I am a bit sad that AI takes the joy out of reverse engineering. But I am also happy because there are so many apps and things in the world that I want to reverse engineer and customize, and AI now makes all of this possible.
