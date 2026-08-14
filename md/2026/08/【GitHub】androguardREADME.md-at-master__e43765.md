---
title: 【GitHub】androguard/README.md at master
source: https://github.com/androguard/androguard/blob/master/README.md
source_host: github.com
clip_date: 2026-08-14T17:23:30+08:00
trace_id: 4d655384-2311-48b8-856e-d95f9efdbf5d
content_hash: 6c85260124073c2116d4a24820f9f68af3a46cb9f0eec1cc1eac8c53ed115e9f
status: synced
tags:
  - GitHub
  - Android逆向
  - 安全工具
series: null
feed_source: null
ai_summary: Androguard 是 Python 编写的 Android 逆向分析框架，可解析 APK/DEX/ODEX、反汇编、反编译并整合 Frida，新版 4.x 与旧版差异显著。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 3bc75244-d011-81cc-a499-f75a10cd0a38
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Androguard 是 Python 编写的 Android 逆向分析框架，可解析 APK/DEX/ODEX、反汇编、反编译并整合 Frida，新版 4.x 与旧版差异显著。
> 
> - **安装方式：** `pip install androguard` 即可安装；4.0.0+ 是继 2019 年 3.3.5 后的大版本更新，与旧版有实质差异，部分旧功能已被移除，遇到问题需到 GitHub 提交 issue。
> - **核心功能：** 支持 DEX、ODEX、APK 文件解析，处理 Android 二进制 XML 与资源文件；可反汇编 DEX/ODEX 字节码，提供基础反编译，并内置 Frida 支持以进行动态分析，还可用 SQLite 保存分析会话。
> - **在线版本：** Andorguard Live 是一个完全本地运行的 WebAssembly 版本，无需云端依赖，提供反汇编器、反编译器、控制流图（CFG）与安全检测，用户可直接上传 APK 使用。
> - **生态与许可：** 已被 MobSF、Cuckoo Sandbox、Virustotal、F-Droid Server、Quark-Engine 等项目采用；项目及 DAD 反编译器均以 Apache License 2.0 授权，最新文档以 GitHub Pages 为准，ReadTheDocs 部分内容已过时。

[![banner](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/470fa2415a868b6e.jpg)](https://raw.githubusercontent.com/androguard/androguard/master/assets/web/androguardwithname.jpg)

## Androguard

[![PyPI Upload](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/8ff877afbd928011.svg)](https://github.com/androguard/androguard/actions/workflows/pythonpublish.yml) [![PyPI - Version](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/527bb85c0d794618.svg)](https://camo.githubusercontent.com/e0a9086c3dc4552a62b39318d46069381e0130e3aac89a9791a111b48260b855/68747470733a2f2f696d672e736869656c64732e696f2f707970692f762f616e64726f6775617264) [![Static Badge](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/34321fa11d2a7835.svg)](https://camo.githubusercontent.com/38d21012fff1b9b2c5dccdaf08330ab8fef4933bc3aba923c7bf7347311a5d2c/68747470733a2f2f696d672e736869656c64732e696f2f62616467652f446f63756d656e746174696f6e2d496e50726f67726573732d726564)

Live version: [Andorguard Live](https://ismyphonepwned.com/droid2web/). ❤️ It is a full local WASM version (no cloud baby), with disassembler, decompiler, CFG, security checks and much more!! Put your APK! ❤️

Do you think your phone has been pwned? please check [IsMyPhonePwned](https://github.com/IsMyPhonePwned)

New tool: Goauld [Dynamic injection tool for Linux/Android](https://github.com/androguard/goauld)

See the new version of Androguard: [https://github.com/androguard/androguard/tree/ng](https://github.com/androguard/androguard/tree/ng)

## Installation

Quick installation:

```bash
pip install androguard
```

Important

Versions >= 4.0.0 are new releases after a long time, where the project has substantial differences from the previous stable version 3.3.5 from 2019. This means that certain functionalities have been removed. If you notice an issue with your project using the latest version, please open up an [issue](https://github.com/androguard/androguard/issues).

## Documentation

**Documentation contains outdated information - In progress of updating**

The [Github Pages Documentation](http://androguard.github.io/androguard/) is the most up to date source.

Additional documentation that contains outdated information is available at [ReadTheDocs](http://androguard.readthedocs.io/en/latest/).

## Features

Androguard is a full python tool to play with Android files.

-   DEX, ODEX
-   APK
-   Android's binary xml
-   Android resources
-   Disassemble DEX/ODEX bytecodes
-   Basic Decompiler for DEX/ODEX files
-   Frida support for easy dynamic analysis
-   SQLite database to save the session

## Authors: Androguard Team

Androguard + tools: Anthony Desnos (desnos at t0t0.fr).

DAD (DAD is A Decompiler): Geoffroy Gueguen (geoffroy dot gueguen at gmail dot com)

## Projects using Androguard

In alphabetical order

-   [AndroPyTool](https://github.com/alexMyG/AndroPyTool)
-   [AppKnox](http://appknox.com/)
-   [Cuckoo Sandbox](https://cuckoosandbox.org/)
-   [Deckard](https://github.com/hrkfdn/deckard)
-   [Droidbot](https://github.com/honeynet/droidbot)
-   [Droidstatx](https://github.com/integrity-sa/droidstatx)
-   [εxodus](https://github.com/Exodus-Privacy/exodus)
-   [F-Droid Server](https://gitlab.com/fdroid/fdroidserver)
-   [gplaycli](https://github.com/matlink/gplaycli)
-   [Koodous](https://koodous.com/)
-   [MobSF](https://github.com/MobSF/Mobile-Security-Framework-MobSF)
-   [qiew](https://github.com/mtivadar/qiew)
-   [Quark-Engine](https://github.com/quark-engine/quark-engine)
-   [Virustotal](https://virustotal.readme.io/reference/androguard)
-   [Viper Framework](https://github.com/viper-framework/viper)
-   ... and many more!

You are using Androguard and are not listed here? Just create a [ticket](https://github.com/androguard/androguard/issues) or send us a [pull request](https://github.com/androguard/androguard/pulls) with your project!

## Licenses

### Androguard

Copyright (C) 2012 - 2024, Anthony Desnos (desnos at t0t0.fr) All rights reserved.

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at

```
 http://www.apache.org/licenses/LICENSE-2.0
```

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS-IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

### DAD

Copyright (C) 2012 - 2016, Geoffroy Gueguen (geoffroy dot gueguen at gmail dot com) All rights reserved.

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at

```
 http://www.apache.org/licenses/LICENSE-2.0
```

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS-IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
