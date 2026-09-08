---
title: "Binja Lattice MCP Server: Reverse Engineering with AI"
source: https://invokere.com/posts/2025/04/binja-lattice-mcp-server-reverse-engineering-with-ai/
source_host: invokere.com
clip_date: 2026-09-08T17:35:58+08:00
trace_id: 59217a5d-65a9-4712-9125-0d33af477d81
content_hash: d8e3cb55131ad880d2c0eb968ebc39e5296362fbd4a0093cace706c46a6ed123
status: synced
tags:
  - AI辅助逆向
  - 恶意样本
series: null
feed_source: Invoke RE
ai_summary: "TL;DR: 将 Binary Ninja 与 LLM 通过 MCP 连接的 BinjaLattice 服务器，在恶意软件分析和逆向报告生成中表现良好，但依赖人工监督，仍有全局变量、地址计算与混淆处理等限制。"
ai_summary_style: key-points
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 3d575244-d011-8195-9f41-d117b7a61c1d
ioc:
  cves: []
  cwes: []
  hashes:
    - ffffffffffffffffffffffffffffffff
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> TL;DR: 将 Binary Ninja 与 LLM 通过 MCP 连接的 BinjaLattice 服务器，在恶意软件分析和逆向报告生成中表现良好，但依赖人工监督，仍有全局变量、地址计算与混淆处理等限制。
> 
> - **架构方式：** 通过 Binary Ninja 插件启动 HTTP REST API 并伪随机生成 API key；MCP 客户端（如 Cursor）使用 stdio 方式运行 mcp_server.py，将函数列表、交叉引用、伪代码、反汇编、重命名和添加注释等操作暴露给 LLM agent。
> - **测试结果一：** 对已完整标注的 Binary Ninja 数据库自动生成报告效果很好；从单一函数自动扩展到子函数的分析也能识别基础功能、已知密码学函数和自定义加密算法。
> - **Yara 规则局限：** 自动化分析可从恶意代码功能生成可用的 Yara 规则，但规则中按字节构建的字符串不合法且缺字节，只能靠多重条件匹配到样本。
> - **已知限制：** 当前服务器无法存取全局变量；LLM 对十六进制/整数地址计算能力较弱，因此设计上优先用函数名进行信息检索与更新。
> - **实战情况：** 直播中分析 Stealc 和 Phorpiex；无法处理 Stealc 混淆，但对 Phorpiex 进展较大，能生成较准确报告，不过误将剪贴板钱包地址劫持判为“隐蔽通信通道”，整体仍需人工复核，并有上下文窗口、成本和隐私限制。

## Overview

A few weeks ago, we saw that a number of folks had developed Model Context Protocol (MCP) servers to provide the ability for Large Language Models (LLMs) to interact with various pieces of software. At this time, a project called [AbletonMCP](https://github.com/ahujasid/ableton-mcp) had been developed that enabled AI (specifically LLM Agents or MCP Clients) to interact with Ableton (one of the standards of Digital Audio Workstations) and [was able to create an entire song on its own using this software](https://x.com/sidahuj/status/1902719460278198658). Seeing this, we had the idea of developing an MCP server to perform malware analysis. Having had prior experience with Binary Ninja’s Python API, we wanted to write an MCP server with Binary Ninja. We then familiarized ourselves with the architectural concepts of MCP servers and [wrote an HTTP REST API for the MCP server](https://github.com/Invoke-RE/binja-lattice-mcp/) to interface directly with Binary Ninja. To our surprise (as others discovered as well) the server does fairly well at recognizing and reverse engineering functions. This provides a great interface for asking questions about a Binary Ninja database, marking up code and adding comments to provide functionality insights.

## What is an MCP Server and Why Do You Care?

As per the [official documentation](https://modelcontextprotocol.io/introduction) `MCP is an open protocol that standardizes how applications provide context to LLMs. Think of MCP like a USB-C port for AI applications. Just as USB-C provides a standardized way to connect your devices to various peripherals and accessories, MCP provides a standardized way to connect AI models to different data sources and tools`. In this case, we wanted the MCP server to be able to communicate with an open instance of Binary Ninja, so we wrote a plugin for Binary Ninja to be able to start an HTTP server that would receive connections, provide responses and provide a basic interface to push/pull information from the database. The overall architecture looks like this:

![BinjaLattice Architecture](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9ecd5aa2488c6141.png)

This interface allows the LLM Agent to list functions, get cross references to functions, retrieve function pseudocode, retrieve function disassembly, rename functions, rename variables and add comments to code.

## BinjaLattice MCP Workflow

In order to start the server, copy the [lattice_server_plugin.py](https://github.com/Invoke-RE/binja-lattice-mcp/blob/main/plugin/lattice_server_plugin.py) to your Binary Ninja plugins directory and start Binary Ninja. This will provide a `Start Lattice Protocol` entry in the Plugins menu dropdown. Select this dropdown entry to start the HTTP REST API. Once started, an API key will be pseudo-randomly generated and printed in the Binary Ninja Log interface, along with a log indicating that the server has started:

```fallback
[agent] API key: ffffffffffffffffffffffffffffffff
[agent] Server started on localhost:9000
```

### Command-Line Testing

For testing the server, you can use the `lattice_client.py` that provides a command-line interface to interact with the HTTP REST API without having to use the MCP server. The client provides an interactive interface for ease of use:

```gdscript3
jmag@static:~/tools/binja-lattice-mcp$ python3 lattice_client.py --username user --password ffffffffffffffffffffffffffffffff -i
INFO:lib.lattice:Authentication successful

BinjaLattice Client Menu:
1. Get Binary Information
2. Get Function Context by Address
3. Get Function Context by Name
4. Update Function Name
5. Update Variable Name
6. Add Comment to Function
7. Add Comment to Address
8. Reconnect to Server
9. Get All Function Names
10. Get Function Disassembly
11. Get Function Pseudocode
12. Get Function Variables
13. Get Cross References to Function
14. Exit

Enter your choice (1-14):
```

For example, the number `9` can be used to get all function names:

```fallback
Enter your choice (1-14): 9
{
  "status": "success",
  "function_names": [
    {
      "name": "_init",
      "address": 16384
    },
    ...
  ]
}
```

### MCP Client

For our MCP client we used Cursor, [which provides support for MCP servers](https://docs.cursor.com/context/model-context-protocol) and an agent-based chat interface that can be used to interact with the MCP server and multiple LLMs. To interface with the MCP server, we use `stdio` [communication](https://modelcontextprotocol.io/docs/concepts/transports#standard-input%2Foutput-stdio) (avoiding yet another HTTP server). In order to allow Cursor to interact with the MCP server, you have to:

-   Create a Python virtual environment, install required dependencies ([requests](https://pypi.org/project/requests/) and the [MCP](https://pypi.org/project/mcp/) package)
-   Modify the MCP server configuration to point to your virtual environment’s Python binary and your [mcp_server.py](https://github.com/Invoke-RE/binja-lattice-mcp/blob/main/mcp_server.py)
-   Add the API key provided in the Binary Ninja log as an environment variable:

```gdscript3
{
  "mcpServers": {
    "binja-lattice-mcp": {
      "command": "/home/jmag/tools/binja-lattice-mcp/test-env/bin/python",
      "args": ["/home/jmag/tools/binja-lattice-mcp/mcp_server.py"],
      "env": {
          "BNJLAT": "ffffffffffffffffffffffffffffffff"
      }
    }
  }
}
```

Once saved, the MCP server will become active within Cursor (or your respective MCP client) and MCP functions will become available:

![Cursor MCP Settings Active](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2713a1ebc03981fd.png)

You will also see in Binary Ninja that authentication is successful with the provided API key:

`[ScriptingProvider] 127.0.0.1 - - [08/Apr/2025 11:10:00] "POST /auth HTTP/1.1" 200 -`

All of this is outlined in detail in the [README](https://github.com/Invoke-RE/binja-lattice-mcp/blob/main/README.md).

### Results

We conducted a number of tests with BinjaLattice MCP against multiple malware analysis scenarios:

1.  Analysis of a fully marked up Binary Ninja database for automated report generation
2.  Fully automated analysis from a single function to its sub-functions

The first scenario worked extremely well, as the LLMs and Cursor agent simply queried the database for function code and their respective function calls. Here is an example:

![Cursor Summary of Malware Filezilla Enquiry and Tool Function Calls](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/95338bced41d6cc3.png) ![Cursor Summary of Malware Filezilla Functionality Results](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b40b885237a27c05.png)

The second scenario worked well for identifying basic functionality, identifying known cryptographic functions and identifying custom cryptographic functions. Here’s an example:

![Cursor Describing Custom Algorithm](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b769cc4aa9fc9a8a.png)

Finally, we were able to perform analysis of multiple sub-functions from a starting function, have it summarize their functionality and even generate a working Yara rule based on the functionality identified:

![Cursor Analysis of Multiple Sub-Functions](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/491291bd811957c7.png)

Despite the rule being functional, it created byte-based strings that were not valid and were missing bytes. Despite this, the rule matches on the malware being analyzed due to multiple conditions being met (similar to how a human would write the Yara rule).

### Limitations and Future Work

The current MCP server does not have the ability to access global variables. The testing conducted also revealed that LLMs struggle with calculation and use of hexadecimal and integer addresses. Because of this, we opted to use function names instead of addresses for function-based information retrieval and function-based updates. We will be submitting the BinjaLattice MCP server to the Binary Ninja plugin manager and adding additional functionality for accessing global marked data throughout the database. We will also explore extending this functionality further to see what can be accomplished.

## Conclusion

Regardless of the major hype, there does appear to be applications of MCP servers in the fields of reverse engineering and malware analysis. They provide a quick and simple way to interface both with reverse engineering databases and LLMs to provide insight and markups during the reverse engineering process. They are by no means replacements for human interaction, as they typically require human oversight during the analysis process. They are also limited by context windows, can be cost prohibitive if leading LLMs are used during the analysis process and can often not be used due to privacy reasons.

## Acknowledgements

Many folks have been working on MCP servers to perform reverse engineering:

-   [Mx-Iris](https://x.com/JH_Pointer) who wrote the first [IDA MCP server](https://github.com/MxIris-Reverse-Engineering/ida-mcp-server) that we observed during our research
-   [itsszn](https://x.com/itszn13/) who was the [first to demo](https://x.com/itszn13/status/1903227860648886701) the ability for an MCP server to be with Binary Ninja
-   [mrexodia](https://github.com/mrexodia) who implemented a robust IDA MCP server [that is easily extensible](https://github.com/mrexodia/ida-pro-mcp)
-   [LaurieWired](https://x.com/lauriewired/) who implemented an [MCP server for Ghidra](https://github.com/LaurieWired/GhidraMCP) and released a [video on it](https://www.youtube.com/watch?v=u2vQapLAW88)
-   [Sergei Frankoff](https://x.com/herrcore) who demonstrated its use with IDA for malware analysis and [did a stream with mrexodia](https://x.com/herrcore/status/1907453048491802830)
-   [fosdick](https://github.com/fosdickio/binary_ninja_mcp) and [Known Rabbit](https://github.com/MCPPhalanx/binaryninja-mcp) who implemented similar MCP servers over the past couple of weeks

## Full Demo

Here’s a small demo of BinjaLattice MCP reverse engineering custom encryption functions and summarizing the results:

## Live Stream and Generated Reports

On Friday, April 11th 2025, we had a live stream where we explored the BinjaLattice MCP Server to analyze the Stealc and Phorpiex malware variants:

The MCP server was able to add comments, change function names and summarize the results of the analysis. It was unable to deal with Stealc obfuscation, however, it made considerable progress on the Phorpiex sample and was able to [produce a fairly accurate report](https://github.com/Invoke-RE/stream-notes/blob/main/mcp-malware-reversing/reports/results.md) during the analysis process. Finally, once all markups were applied, we renamed all functions with the `VIBE::` namespace and had the MCP server re-analyze the [sample to produce a second report](https://github.com/Invoke-RE/stream-notes/blob/main/mcp-malware-reversing/reports/vibe_report.md). We had mixed results with both approaches and it took multiple requests to Cursor’s agent to analyze all applicable functions, but it did a fairly good job at summarizing malicious functionality. It had the inability to recognize specific types of functionality, such as the crypto address clipboard hijacking in Phorpiex that was identified as a `covert communication channel`. The results do, however, appear to be promising and could likely be improved with research and time investment.

## Interested in learning malware analysis?

Check out our training courses today

[Training Courses](https://training.invokere.com/)
