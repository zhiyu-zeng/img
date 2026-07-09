---
title: 【看雪】AI加持garlic - 快速了解一个apk
source: https://bbs.kanxue.com/thread-291942.htm
source_host: bbs.kanxue.com
clip_date: 2026-07-09T22:14:28+08:00
trace_id: 31b00bf0-9cfd-4748-a568-250fdddd2de4
content_hash: c5520f4626dd6e40ac1660f83b847cd4c7d7bcca0eb906f99aff4b1de0d05778
status: summarized
tags:
  - 看雪
series: null
feed_source: 看雪·Android安全
ai_summary: garlic是一个用C编写的高效APK反编译工具，集成AI分析能力，通过MCP-server实现快速逆向工程和call graph生成，以DuckDB支持复杂查询。
ai_summary_style: key-points
images_status:
  total: 5
  succeeded: 5
  failed_urls: []
notion_page_id: 39875244-d011-81e9-af16-e3e76965f5e7
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> garlic是一个用C编写的高效APK反编译工具，集成AI分析能力，通过MCP-server实现快速逆向工程和call graph生成，以DuckDB支持复杂查询。
> 
> - **工具核心**：garlic是纯C实现的APK反编译和分析工具，提供MCP-server（以stdio形式运行）支持AI模型介入，速度快且内存占用低。
> - **分析流程**：自动执行反编译APK、解析AndroidManifest.xml、生成call graph和字符串索引，并导入DuckDB以实现递归查询和可视化。
> - **配置方式**：MCP-server通过命令`garlic -m`启动，避免HTTP方式的性能开销，易于集成到AI工作流中。
> - **native分析**：正在开发ARM64架构支持，包括反汇编、控制流分析等功能，无第三方库依赖，可与Java代码关联追踪。
> - **实际效果**：分析微信APK耗时约3分钟，生成770,928个方法的call graph和182个native SO文件的分析数据，验证了效率。

[garlic decompiler](https://bbs.kanxue.com/elink@cacK9s2c8@1M7s2y4Q4x3@1q4Q4x3V1k6Q4x3V1k6Y4K9i4c8Z5N6h3u0Q4x3X3g2U0L8$3#2Q4x3V1k6F1k6h3!0U0j5h3&6S2j5X3I4W2i4K6u0r3k6$3q4J5L8r3W2U0) mcp-server可以跑起来了。

## 1\. 效果

拿京东商城一个旧版本举例：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/7784e33949938256.webp) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/de4d111f5feff78f.webp) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/3f3fe964d0263905.webp)

流程： 反编译 + call graph + 综合分析(AI自己做的)

## 2\. 原理

garlic mcp server和garlic decompiler都在一个二进制内, garlic mcp-server没有http形式的，完全是stdio的形式，我试验了几个http形式的mcp-server，太慢了，感觉难以接受

```bash
反编译： garlic xxx.apk -t 4 -o output
mcp-server: garlic -m
```

在AI分析一个apk的时候是什么流程呢？

1.  反编译apk
    
2.  反编译AndroidManifest.xm
    
3.  生成apk的call graph
    
4.  生成apk的strings和strings的xref
    
5.  导入call graph/strings到duckdb
    

如果需要可视化，也可以让AI或者自己生成这样的call graph：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/2be792fa396e200a.webp)

## 3\. 优点/缺点

速度快 - garlic是c写的，速度上能得到保证

占用资源少 - 在分析完一个apk后，内存就释放掉，定位文件/方法都可以直接查db

追踪程序执行快 - duckdb支持递归形式的查询，不用追踪每一条路径都去grep file

没有windows的机器，windows版本的没有仔细测试。

## 4\. mcp server配置方法

```javascript
{
  "command": "garlic", // 这里直接写garlic的路径就ok了
  "args": [
    "-m"
  ]
}
```

## 5\. native分析

native的分析是我正在做的另外一个东西，现在只支持arm64，现在能支持到的功能：

1.  反汇编
    
2.  控制流分析
    
3.  控制流还原
    
4.  数据流分析
    
5.  IR
    
6.  jumptable还原
    
7.  vtable还原
    
8.  部分blr分析
    
9.  xref 分析
    

native部分的分析也是c语言实现的，完全可以衔接到garlic上，没有任何三方库，比如capstone这些。

大部分功能还在调试，现在能实现的基础效果是将java的code和native的流程关联起来，我相信有AI的加持下，可以更容易的从java一直跟到native的代码，分析 **微信** 效果如下：

```bash
Waiting foranalysis to start...
[13:55:33] Started analysis forweixin.apk
[13:55:33] Running aapt2 dump badging...
[13:55:34] Extracting APK metadata (package, version, permissions)...
[13:55:34] Parsing AndroidManifest.xml forcomponents...
[13:55:39] Extracting APK contents...
[13:55:43] APK extraction complete [10.2s]. Queueing decompilation...
[13:55:43] Starting Java decompilation with garlic...
[13:55:59] Generating Java call graph...
[13:56:08] Building Java call graph index...
[13:56:23] Call graph built: 770928 methods, 8998 native, 381196 strings
[13:56:23] Decompilation completed successfully [39.6s]
[13:56:26] Extracting native functionindex...
[13:56:40] Queueing native SO analysis...
[13:56:40] Decompilation phase complete
[13:56:40] Found 182 native SO files to analyze
[13:56:40] [1/182] Analyzing libAdvanceP2P.so...
[13:56:40] [1/182] libAdvanceP2P.so: imported successfully [0.43s]
[13:56:40] [2/182] Analyzing libAudioFFmpegDecode.so...
[13:56:40] [2/182] libAudioFFmpegDecode.so: imported successfully [0.05s]
# ... 这里略过了，是一堆so的分析profile
[13:58:41] [174/182] Analyzing libwxperf-tkill.so...
[13:58:41] [174/182] libwxperf-tkill.so: imported successfully [0.02s]
[13:58:41] [175/182] Analyzing libxeffect_xlog.so...
[13:58:41] [175/182] libxeffect_xlog.so: imported successfully [0.01s]
[13:58:41] [176/182] Analyzing libxffmpeg.so...
[13:58:51] [176/182] libxffmpeg.so: imported successfully [9.55s]
[13:58:51] [177/182] Analyzing libxlabeffect.so...
[13:58:51] [177/182] libxlabeffect.so: imported successfully [0.07s]
[13:58:51] [178/182] Analyzing libxsummary.so...
[13:58:51] [178/182] libxsummary.so: imported successfully [0.08s]
[13:58:51] [179/182] Analyzing libxweb_hpatchz.so...
[13:58:51] [179/182] libxweb_hpatchz.so: imported successfully [0.02s]
[13:58:51] [180/182] Analyzing libxweb_linker.so...
[13:58:51] [180/182] libxweb_linker.so: imported successfully [0.03s]
[13:58:51] [181/182] Analyzing libz-ng.so...
[13:58:51] [181/182] libz-ng.so: imported successfully [0.03s]
[13:58:51] [182/182] Analyzing libzidl2.so...
[13:58:51] [182/182] libzidl2.so: imported successfully [0.09s]
[13:58:51] Importing native strings and cross-references...
[13:59:34] Native call graph analysis complete [174.2s]
```

可以达到追踪native函数的效果：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/395a9f016201136e.webp)

\-----------------

项目地址： [https://github.com/neocanable/garlic](https://bbs.kanxue.com/elink@a2eK9s2c8@1M7s2y4Q4x3@1q4Q4x3V1k6Q4x3V1k6Y4K9i4c8Z5N6h3u0Q4x3X3g2U0L8$3#2Q4x3V1k6F1k6h3!0U0j5h3&6S2j5X3I4W2i4K6u0r3k6$3q4J5L8r3W2U0) ，欢迎使用反馈。

[#逆向分析](https://bbs.kanxue.com/forum-161-1-118.htm) [#基础理论](https://bbs.kanxue.com/forum-161-1-117.htm) [#工具脚本](https://bbs.kanxue.com/forum-161-1-128.htm) [#源码框架](https://bbs.kanxue.com/forum-161-1-127.htm) [#程序开发](https://bbs.kanxue.com/forum-161-1-124.htm)
