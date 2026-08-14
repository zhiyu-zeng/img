---
title: 【GitHub】frida-dexdump/README.md at master
source: https://github.com/hluwa/frida-dexdump/blob/master/README.md
source_host: github.com
clip_date: 2026-08-14T17:22:15+08:00
trace_id: 8e9ff050-2abc-4ac2-80ff-9c77d977b1dc
content_hash: e5c8e29fe75ef7fe997f6ed0a34501a1976b32871a63d8ae35950dee8cfc9a58
status: synced
tags:
  - GitHub
  - Frida
  - 脱壳与加固
series: null
feed_source: null
ai_summary: frida-dexdump 是一个基于 Frida 的轻量工具，用于在内存中查找并转储 dex 文件，帮助安全工程师分析恶意 App，无需修改系统即可快速部署。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 3bc75244-d011-818d-afb1-d13b41b9d493
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> frida-dexdump 是一个基于 Frida 的轻量工具，用于在内存中查找并转储 dex 文件，帮助安全工程师分析恶意 App，无需修改系统即可快速部署。
> 
> - **工具定位：** 借助 Frida 实现内存 dex 搜索与 dump，面向恶意样本安全分析场景。
> - **核心特性：** 支持模糊搜索头部损坏的 dex（深度搜索模式），兼容 Frida 支持的全部 Android 版本，可一键安装。
> - **使用方式：** `pip3 install frida-dexdump` 安装；`frida-dexdump -FU` 直接 dump 前台应用，`frida-dexdump -U -f com.app.pkgname` 指定包名启动；新增 `-o/--output`、`-d/--deep-search`、`--sleep` 等参数，建议开启深度搜索获得更完整结果。
> - **实现细节：** 构建命令为 `make`，依赖见 requirements.txt；作者另发文《深入 FRIDA-DEXDump 中的矛与盾》介绍内部原理。

## FRIDA-DEXDump

`frida-dexdump` is a frida tool to find and dump dex in memory to support security engineers in analyzing malware.

## Make Jetbrains Great Again

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/d160f4809749cf01.png)](https://camo.githubusercontent.com/fb05ef5dfb873be566f687c659530467837038a1f1b3160accc9e8df636d323a/68747470733a2f2f7265736f75726365732e6a6574627261696e732e636f6d2f73746f726167652f70726f64756374732f636f6d70616e792f6272616e642f6c6f676f732f6a625f6265616d2e706e67) [![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/0e9b12f08baf27b5.png)](https://camo.githubusercontent.com/d8e261806b358107ad0245c3d395a8be7d08e2224e280f4851ffdc6caf43ee94/68747470733a2f2f7265736f75726365732e6a6574627261696e732e636f6d2f73746f726167652f70726f64756374732f636f6d70616e792f6272616e642f6c6f676f732f5079436861726d2e706e67)

## Features

1.  Support fuzzy search broken header dex(deep search mode).
2.  Compatible with all android version(frida supported).
3.  One click installation, without modifying the system, easy to deploy and use.

## Installation

```
pip3 install frida-dexdump
```

## Usage

CLI arguments base on [frida-tools](https://github.com/frida/frida-tools), you can quickly dump the foreground application like this:

```
frida-dexdump -FU
```

Or specify and spawn app like this:

```
frida-dexdump -U -f com.app.pkgname
```

Additionally, you can see in `-h` that the new options provided by frida-dexdump are:

```sql
-o OUTPUT, --output OUTPUT  Output folder path, default is './<appname>/'.
-d, --deep-search           Enable deep search mode.
--sleep SLEEP               Waiting times for start, spawn mode default is 5s.
```

When using, I suggest using the `-d, --deep-search` option, which may take more time, but the results will be more complete.

[![screenshot](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/96cd73bf7e59bd2b.png)](https://github.com/hluwa/frida-dexdump/blob/master/screenshot.png)

## Build and develop

```
make
```

### Requires

See [requirements.txt](https://github.com/hluwa/FRIDA-DEXDump/blob/master/requirements.txt)

## Internals

[《深入 FRIDA-DEXDump 中的矛与盾》](https://mp.weixin.qq.com/s/n2XHGhshTmvt2FhxyFfoMA)
