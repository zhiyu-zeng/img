---
title: 【GitHub】keypatch/README.md at master
source: https://github.com/keystone-engine/keypatch/blob/master/README.md
source_host: github.com
clip_date: 2026-08-14T17:26:45+08:00
trace_id: e994b7b2-182f-4ff7-ac24-75595c5800ae
content_hash: b57073d19e1729711586725bfd6f618f5fcd3dfd12afcdbf6904003632cc676a
status: synced
tags:
  - GitHub
  - 安全工具
  - IDA插件
series: null
feed_source: null
ai_summary: TL;DR：Keypatch是IDA Pro上的Keystone汇编插件，提供补丁、范围填充、汇编搜索三类功能，弥补IDA自带汇编器不足。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 3bc75244-d011-81f5-9ab2-d4f58ef470a2
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：Keypatch是IDA Pro上的Keystone汇编插件，提供补丁、范围填充、汇编搜索三类功能，弥补IDA自带汇编器不足。
> 
> - **组成/功能：** Keypatch 包含 Patcher、Fill Range 和 Search 三个工具；Fill Range 除汇编外也接受 raw hex（如 `90`、`aa bb`、`0xAA,0xBB`）。
> - **核心优势：** 基于 Keystone，跨架构支持 Arm、AArch64、Mips、PowerPC、Sparc、SystemZ、X86；跨平台支持 Windows/macOS/Linux，纯 Python 实现，GPL v2 开源。
> - **使用方式：** 在 IDA 中按 `CTRL+ALT+K` 打开补丁对话框，键入汇编时 Encode 框实时更新编码，Patch 后自动跳到下一条指令；可用 IDA 符号，原始指令默认以注释保存，可通过菜单撤销。
> - **边界处理：** 新代码长度与原文不同时，默认用 NOP 填充到下一条指令边界；只改 IDA 数据库，如需写入原二进制需选择 `Edit | Patch program | Apply patches to input file`。
> - **安装要点：** 需要先安装 Keystone 与 six（`pip install six`、`pip install keystone-engine`），再将 keypatch.py 放入 plugins 目录；IDA 7.0 前 IDA Python 为 32 位，需匹配 32 位 Keystone；已知兼容 IDA 6.4-7.5。

## Keypatch

Keypatch is [the award winning plugin](https://www.hex-rays.com/contests/2016/index.shtml) of [IDA Pro](https://www.hex-rays.com/products/ida/) for [Keystone Assembler Engine](http://keystone-engine.org/).

Keypatch consists of 3 tools inside.

-   **Patcher** & **Fill Range**: these allow you to type in assembly to directly patch your binary.
-   **Search**: this interactive tool let you search for assembly instructions in binary.

See [this quick tutorial](https://github.com/keystone-engine/keypatch/blob/master/TUTORIAL.md) for how to use Keypatch, and [this slides](https://github.com/keystone-engine/keypatch/blob/master/Keypatch-slides.pdf) for how it is implemented.

Keypatch is confirmed to work on IDA Pro version 6.4, 6.5, 6.6, 6.8, 6.9, 6.95, 7.0, 7.5 but should work flawlessly on older versions. If you find any issues, please [report](http://keystone-engine.org/contact).

* * *

### 1\. Why Keypatch?

Sometimes we want to patch the binary while analyzing it in IDA, but unfortunately the built-in asssembler of IDA Pro is not adequate.

-   This tool is not friendly and without many options that would make the life of reverser easier.
-   Only X86 assembler is available. Support for all other architectures is totally missing.
-   The X86 assembler is not in a good shape, either: it cannot understand many modern Intel instructions.

Keypatch was developed to solve this problem. Thanks to the power of [Keystone](http://keystone-engine.org/), our plugin offers some nice features.

-   Cross-architecture: support Arm, Arm64 (AArch64/Armv8), Hexagon, Mips, PowerPC, Sparc, SystemZ & X86 (include 16/32/64bit).
-   Cross-platform: work everywhere that IDA works, which is on Windows, MacOS, Linux.
-   Based on Python, so it is easy to install as no compilation is needed.
-   User-friendly: automatically add comments to patched code, and allow reverting (undo) modification.
-   Open source under GPL v2.

Keypatch can be the missing piece in your toolset of reverse engineering.

* * *

### 2\. Install

-   Install Keystone core & Python binding for Python 2.7 from [keystone-engine.org/download](http://keystone-engine.org/download). Or follow the steps in the [appendix section](#appendix-install-keystone-for-ida-pro).
-   Install Six module from pip because it is used by the keypatch.py: `pip install six`.
-   Copy file `keypatch.py` to IDA Plugin folder, then restart IDA Pro to use Keypatch.
    -   On Windows, the folder is at `C:\Program Files (x86)\IDA 6.9\plugins`
    -   On MacOS, the folder is at `/Applications/IDA\ Pro\ 6.9/idaq.app/Contents/MacOS/plugins`
    -   On Linux, the folder may be at `/opt/IDA/plugins/`

`NOTE`

-   On Windows, if you get an error message from IDA about "fail to load the dynamic library", then your machine may miss the VC++ runtime library. Fix that by downloading & installing it from [https://www.microsoft.com/en-gb/download/details.aspx?id=40784](https://www.microsoft.com/en-gb/download/details.aspx?id=40784)
-   On other \*nix platforms, the above error message means you do not have 32-bit Keystone installed yet. See [appendix section](#appendix-install-keystone-for-ida-pro) below for more instructions to fix this.

* * *

### 3\. Usage

-   For a quick tutorial, see [TUTORIAL.md](https://github.com/keystone-engine/keypatch/blob/master/TUTORIAL.md). For a complete description of all of the features of Keypatch, keep reading.
    
-   To patch your binary, press hotkey `CTRL+ALT+K` inside IDA to open **Keypatch Patcher** dialog.
    
    -   The original assembly, encode & instruction size will be displayed in 3 controls at the top part of the form.
    -   Choose the syntax, type new assembly instruction in the `Assembly` box (you can use IDA symbols).
    -   Keypatch would *automatically* update the encoding in the `Encode` box while you are typing, without waiting for `ENTER` keystroke.
        -   Note that you can type IDA symbols, and the raw assembly will be displayed in the `Fixup` control.
    -   Press `ENTER` or click `Patch` to overwrite the current instruction with the new code, then *automatically* advance to the the next instruction.
        -   Note that when size of the new code is different from the original code, Keypatch can pad until the next instruction boundary with NOPs opcode, so the code flow is intact. Uncheck the choice `NOPs padding until next instruction boundary` if this is undesired.
        -   By default, Keypatch appends the modified instruction with the information of the original code (before being patched). Uncheck the choice `Save original instructions in IDA comment` to disable this feature.
    -   By default, the modification you made is only recorded in the IDA database. To apply these changes to the original binary (thus overwrite it), choose menu `Edit | Patch program | Apply patches to input file`.

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/a46c9aa8c8e9711a.png)](https://github.com/keystone-engine/keypatch/blob/master/screenshots/keypatch_patcher.png)

-   To fill a range of code with an instruction, select the range, then either press hotkey `CTRL+ALT+K`, or choose menu `Edit | Keypatch | Fill Range`.
    -   In the `Assembly` box, you can either enter assembly code, or raw hexcode. Some examples of acceptable raw hexcode are `90`, `aa bb`, `0xAA, 0xBB`.

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/c598e00f724aa010.png)](https://github.com/keystone-engine/keypatch/blob/master/screenshots/keypatch_fillrange.png)

-   To revert (undo) the last patching, choose menu `Edit | Keypatch | Undo last patching`.
    
-   To search for assembly instructions (without overwritting binary), open **Keypatch Search** from menu `Edit | Keypatch | Search`.
    
    -   Choose the architecture, address, endian mode & syntax, then type assembly instructions in the `Assembly` box.
    -   Keypatch would *automatically* update the encoding in the `Encode` box while you are typing, without waiting for `ENTER` keystroke.
    -   When you click `Search` button, Keypatch would look for all the occurences of the instructions, and show the result in a new form.

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/8e74aeadd12f154b.png)](https://github.com/keystone-engine/keypatch/blob/master/screenshots/keypatch_search.png)

-   To check for new version of Keypatch, choose menu `Edit | Keypatch | Check for update`.
    
-   At any time, you can also access to all the above Keypatch functionalities just by right-click in IDA screen, and choose from the popup menu.
    

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/59223011bad1ed2e.png)](https://github.com/keystone-engine/keypatch/blob/master/screenshots/keypatch_menupopup.png)

* * *

### 4\. Contact

Email [keystone.engine@gmail.com](mailto:keystone.engine@gmail.com) for any questions.

For future update of Keypatch, follow our Twitter [@keystone_engine](https://twitter.com/keystone_engine) for announcement.

* * *

### Appendix. Install Keystone for IDA Pro

We all know that before IDA 7.0, IDA Pro's Python is 32-bit itself, so it can only loads 32-bit libraries. For this reason, we have to build & install Keystone 32-bit. However, since IDA 7.0 supports both 32-bit & 64-bit, which means we also need to install a correct version of Keystone. Simply install from Pypi, with `pip` (32-bit), like followings:

```bash
pip install keystone-engine
```

Done? Now go back to [section 2](#2-install) & install Keypatch for IDA Pro. Enjoy!
