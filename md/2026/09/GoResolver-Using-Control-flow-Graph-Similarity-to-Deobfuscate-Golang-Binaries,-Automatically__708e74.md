---
title: "GoResolver: Using Control-flow Graph Similarity to Deobfuscate Golang Binaries, Automatically"
source: https://www.volexity.com/blog/2025/04/01/goresolver-using-control-flow-graph-similarity-to-deobfuscate-golang-binaries-automatically/
source_host: www.volexity.com
clip_date: 2026-09-29T10:42:19+08:00
trace_id: ee50b148-e3d9-49a8-aefe-6705f4e974aa
content_hash: c10185b1fa46c7e480a7152fcf2646f97e07e94db71f5cf615f780fda08eec31
status: synced
tags:
  - 恶意样本
  - 安全工具
series: null
feed_source: Volexity·威胁研究
ai_summary: GoResolver 通过控制流图相似度为 Garble 等工具混淆的 Golang 恶意样本自动恢复原始函数与包名，让分析者不必再逆向运行时与库代码。
ai_summary_style: key-points
images_status:
  total: 19
  succeeded: 19
  failed_urls: []
notion_page_id: 3ea75244-d011-81a2-afdc-c4b773ab24f7
ioc:
  cves: []
  cwes: []
  hashes:
    - 1df2cd0d12e5028d5dbda33a4e4404e0
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> GoResolver 通过控制流图相似度为 Garble 等工具混淆的 Golang 恶意样本自动恢复原始函数与包名，让分析者不必再逆向运行时与库代码。
> 
> - **混淆弱点：** Garble 的函数/包名随机化并非真随机，同一包内名字（如 `*E2AKV7TQjQ*`）高度复用，识别出一个函数即可推断整个包，如可判定为 `os/exec`。
> - **两类技术组合：** 先用类似 GoReSym 的方式绕过符号表、从 `ModuleData`/`PcLineTab` 提取符号，再用控制流图相似度（0.0–1.0 归一化评分，基于各节点汇编指令加权比例）匹配干净模板，还原真实名称。
> - **版本指纹：** Garble 会抹掉 `BuildInfo` 与版本字符串，但 Golang 运行时无法移除；对各主版本生成参考数据比对运行时相似度即可定位版本，实测只需测试约 2% 的运行时即可区分主版本。
> - **工具链与用法：** 含 GoResolver（符号恢复）、GoGrapher（二进制度量）、GoStrap（参考样本生成）、GitToolFetcher 四个项目；`pip install goresolver`，运行 `goresolver /path/to/sample.exe`；需 Go 1.20.6+、Python 3.12+。
> - **插件集成：** 提供 IDA Pro（9+ / IDAPython）与 Ghidra（11.3+ / PyGhidra）插件，支持"分析当前文件"和"导入先前报告"两种模式；作者认为 IDA Pro 中分析 Golang 明显更快。

![Volexity-Blog-GoResolver-Using Control-flow-Graph-Similarity-to-Deobfuscate-Golang-Automatically](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/14a0a0f2686f127f.png)

##### KEY TAKEAWAYS

-   *Go language (Golang) is increasing in popularity with developers of both legitimate and malicious tooling.*
-   *Volexity frequently encounters malware samples written in Golang that apply obfuscators to hinder analysis.*
-   *Obfuscated Golang malware samples are significantly harder to statically analyze for reverse engineers.*
-   *Volexity has developed an open-source tool, GoResolver, to retrieve obfuscated functions names.*
-   *GoResolver’s [control-flow graph](https://en.wikipedia.org/wiki/Control-flow_graph) similarity techniques offer a significant advantage in recovering symbol information.*

In the course of its investigations, Volexity frequently encounters malware samples written in Golang. Binaries written in Golang are often challenging to analyze because of the embedded libraries and the sheer size of the resulting binaries. This issue is amplified when samples are obfuscated using tools such as [Garble](https://github.com/burrowers/garble), an open-source Golang obfuscation tool.

The popularity of Golang amongst malware developers, and the use of obfuscators to make reverse-engineering harder, raised the need for better tooling to assist in reverse-engineering efforts. Volexity developed **GoResolver**, an open-source tool that uses [control-flow graph](https://en.wikipedia.org/wiki/Control-flow_graph) similarities to retrieve obfuscated functions names. GoResolver is available for download on GitHub [here](https://github.com/volexity/GoResolver).

Note that throughout this blog post, Garble obfuscation is used to demonstrate GoResolver’s effectiveness. However, the same principles apply to other closed-source Golang obfuscators observed by Volexity.

## Garble Obfuscation Properties Analysis

One of the obfuscators commonly encountered by Volexity is [Garble](https://github.com/burrowers/garble). Its functionality is [described in the README](https://github.com/burrowers/garble/blob/master/README.md#mechanism), a screenshot of which is shown below:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a56aec5ba2ead097.png)

Despite these listed features, all of which significantly hinder manual static analysis, binaries obfuscated using Garble present interesting properties that weaken the overall apparent strength of its obfuscation.

For example, the randomization employed by Garble for function and package names is not truly random. Due to how Golang resolves function names, randomized names must stay consistent across all functions of a package, so they are highly reused:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c5dfdbb2b0521ae6.png)

As shown in the image above, the “ `*E2AKV7TQjQ*` ” string is reused across many functions as it represents the package name. Manually looking at the functions called by this garbled string, it can be inferred that this represents the [os/exec](https://pkg.go.dev/os/exec) package. Consequently, if one function from a package is identified, the package can be identified for the entire binary. All other obfuscated functions can then be associated with this package. This logic greatly improves the symbol recovery.

## Existing Go Tools

Some tools already exist to help retrieve lost symbol information, the most well-known of which is Mandiant’s [GoReSym](https://github.com/mandiant/GoReSym). GoReSym works by bypassing the symbol table entirely. Instead, it extracts function names and type information from Go’s internal runtime structures, `ModuleData` and `PcLineTab`, in the same way as the Golang runtime would, using the Golang runtime’s own parser whenever possible. As these structures are necessary for Golang binaries to work properly, Garble cannot strip them.

As the retrieved symbols are still randomized, Volexity recognized an opportunity to go further by using control-flow graph similarities to identify the original package and function names.

## Control-flow Graph Similarities

Control-flow graphs can be used to represent different paths a binary may take during execution. Even when recompiled across different compiler versions, the resulting control-flow graph of a given algorithm will remain similar. By measuring the similarity between the control-flow graph of two functions in two different binaries, it is sometimes possible to assert if they result from the same algorithm.

A [paper published in 2020](https://www.ijcse.com/docs/INDJCSE20-11-03-237.pdf) describes an efficient technique to compute the normalized similarity (0.0 to 1.0) between two control-flow graphs by computing the weighted ratio of similar assembly instructions across nodes of the control-flow graph. By implementing this technique and comparing Garbled samples against generated clean template Golang samples, it could then be possible to fully resolve the randomized symbol names to their original form.

An illustration of this process is below:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3a20a30d81927c18.png)

Two graphs are compared, and the similarity between each set of two blocks in the graph is computed. In the illustration above, the red and blue blocks contain the exact same instructions but in a different order, and thus have a similarity of 1.0.

## GoResolver Installation

The GoResolver toolchain is composed of four projects:

| **Project** | **Description** |
| --- | --- |
| [GoResolver](https://github.com/volexity/GoResolver) | A Golang symbol recovery tool through symbol extraction and control-flow graph similarity |
| [GoGrapher](https://github.com/volexity/GoGrapher) | A binary similarity tool that computes the control-flow graph similarity between two binaries |
| [GoStrap](https://github.com/volexity/GoStrap) | A Golang reference sample bootstrapping tool that allows users to generate Go samples of any Golang version and feature the requested set of libraries |
| [GitToolFetcher](http://github.com/volexity/GitToolFetcher) | A simple tool to install, manage, and run multiple, concurrent versions of GitHub-hosted projects |

An overview of the interactions within the projects of the GoResolver toolchain is shown below:

![Image3](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/cbc41b94a884cf55.png)

To install the GoResolver toolchain, please ensure your system’s dependencies match the following minimum requirements:

| **Language** | **Version** |
| --- | --- |
| Go  | 1.20.6+ |
| Python | 3.12+ |

Each Python-based component of the toolchain is available on [pypi](https://pypi.org/), so you can simply run the following command to install:

> `pip install goresolver`

GoResolver also provides plugins for IDA Pro and Ghidra. The following versions are supported:

| **Tool** | **Version** | **Python Version** |
| --- | --- | --- |
| IDA Pro (IDAPython) | 9+  | Python 3.12+ |
| Ghidra (PyGhidra) | 11.3+ | Python 3.12+ |

In Volexity’s experience, analysis of Golang binaries is significantly faster in IDA Pro.

## Case Study

To illustrate usage of the GoResolver toolchain, Volexity built the [Stowaway](https://github.com/ph4ntonn/Stowaway/tree/master) agent using Garble. The sample ([1df2cd0d12e5028d5dbda33a4e4404e0](https://www.virustotal.com/gui/file/d46dae3b2de038ddc328af7133a0153cf5bfb5e01e5114844d6513bd37b0c9a3)) is available on VirusTotal.

When the sample is disassembled using IDA Pro, most functions have generic names using the format `sub_OFFSET`. This is to be expected, since Garble stripped the symbol table. Performing a complete analysis would be tedious; instead, the sample is submitted to GoResolver.

GoResolver will first try to identify the version of Golang used to build the malware sample. This is usually done by parsing the `BuildInfo` or identifying Golang version string fragments in the binary. For garbled Golang binaries, however, neither approach works, since Garble ensures no version fragments or `BinaryInfo` remain in the compiled executable.

While Garble removes all directly identifiable information, it is still bundled with the Golang runtimes. Since the Golang runtime changes between different versions, GoResolver can use this information to fingerprint the runtime version. By generating reference data for each major Golang version and computing the similarity of each runtime with the malware sample, the tool can pinpoint the Golang version used to compile the malware sample. Volexity has identified that testing only 2% of the Golang runtime was sufficient to discriminate between major versions. This improves both efficiency and resource usage when computing the similarity of each major Golang version of the malware sample.

To submit a sample to GoResolver, simply call the tool with the path to the sample as argument, for example:

> `goresolver /path/to/sample.exe`

The submission of the malware sample to GoResolver is shown below:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/19112ba7bd3beed0.png)

Once the Golang version of the malware sample is identified, the template compiled with this specific version will be used as a reference. GoResolver then computes the full binary similarity, which is combined with the symbols extracted similarly to those used by GoReSym. This results in the final symbol report, which can then be imported into your SRE tool of choice.

The before-and-after import comparison of resolved symbols is illustrated below:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b5b5c2e9e5678102.png)

As shown above, numerous symbols have been resolved to more meaningful names, even though they are still partially obfuscated. Even in cases where symbols haven’t been fully resolved by the similarity algorithm, statistical analysis helps resolve the package and modules names, as can be seen with the “os” package shown below:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/da4c698cdfcf1b5a.png)

Even though these symbols are only partially resolved, knowing their package name helps understand the binary layout. This also helps the analyst avoid reversing runtime and library methods, allowing them to instead focus on the malware’s actual core logic.

## SRE Plugins

To ease the integration of the GoResolver toolchain into analyst workflows, Volexity has made plugins available for both [IDA Pro](https://hex-rays.com/ida-pro) and [Ghidra](https://ghidra-sre.org/). Both plugins allow easy import of recovered symbol data generated by the GoResolver CLI tool into their respective symbol databases. While their interface differs, both plugins rely on the same codebase and thus provide the same capabilities.

When using IDA Pro, the following dialog is shown:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9ba2aaf763954516.png)

The GoResolver plugin features two modes of operation, depending on how you want the GoResolver toolchain to integrate into your workflow: “Analyze the current file” or “Import a previous report”. These options are selectable on the left-hand side.

The Analyze option lets you run GoResolver directly within IDA Pro. Once the analysis is complete the generate report file will be automatically imported into the symbol database.

The Import option requires you to generate a report file using the standalone GoResolver CLI beforehand. This can then be imported into the symbol database by selecting the path to the previously generated report file.

When using Ghidra, the following dialogs are shown:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/809c790ae4b5f1eb.png)

These dialogs offer the same options as the IDA Pro plugin; the Analyze and Import modes behave the same way.

Both plugins are available in the “Plugin” directory within GoResolver’s repository.

## Conclusion

Golang is more often the language of choice for many malware authors, due to embedded libraries and the size of the resulting binaries. To add additional complexity, malware written in Golang is often obfuscated. The ability to reverse engineer obfuscated malware written in Golang is an important part of digital forensic investigations.

Volexity has developed GoResolver, an open-source tool that uses [control-flow graph](https://en.wikipedia.org/wiki/Control-flow_graph) similarities to retrieve obfuscated functions names. The use of control-flow graph similarity, in conjunction with pre-existing symbol extraction techniques, allows the resolution of more complete symbols than previously achievable. This ensures a better understanding of the binary, and helps analysts focus on reversing the core malware logic. Volexity plans to integrate more features, such as automatic Golang strings parsing and various improvements to facilitate the Golang binaries reversing, so watch for updates in the [GoResolver repository on GitHub](https://github.com/volexity/GoResolver).

### Acknowledgements

Volexity would like to thank Mandiant’s threat intelligence division for its documentation of the Golang runtime’s symbol-parsing mechanism, as well as their work on [GoReSym](https://github.com/mandiant/GoReSym).

Volexity also thanks Mr. Hyun-il Lim from the Kyungnam University for the research and [paper](https://www.ijcse.com/docs/INDJCSE20-11-03-237.pdf) on control-flow graph similarity algorithms.

The post [GoResolver: Using Control-flow Graph Similarity to Deobfuscate Golang Binaries, Automatically](https://www.volexity.com/blog/2025/04/01/goresolver-using-control-flow-graph-similarity-to-deobfuscate-golang-binaries-automatically/) appeared first on [Volexity](https://www.volexity.com/).
