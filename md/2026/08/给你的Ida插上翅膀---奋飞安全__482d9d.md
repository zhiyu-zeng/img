---
title: 给你的Ida插上翅膀 - 奋飞安全
source: http://91fans.com.cn/post/idamcp/
source_host: 91fans.com.cn
clip_date: 2026-08-04T14:33:41+08:00
trace_id: ab3d24dc-ae90-4d3b-a64c-67b354fef34f
content_hash: 50b8de37c5e78f61ec310dd4fffeeca0aee0897a61b1fc0ddb44d3f91c10a049
status: synced
tags:
  - AI辅助逆向
  - IDA Pro
series: null
feed_source: 91fans·逆向
ai_summary: IDA Pro 可通过 MCP 协议让 AI IDE 直接操控，实现去花指令、分析函数等逆向操作；核心是专用 Python 环境与 ida-pro-mcp 插件。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 3b275244-d011-818e-a7ed-fa90d1762ded
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> IDA Pro 可通过 MCP 协议让 AI IDE 直接操控，实现去花指令、分析函数等逆向操作；核心是专用 Python 环境与 ida-pro-mcp 插件。
> 
> - **环境隔离：** 不推荐用系统 Python，用 conda 创建专用虚拟环境（如 `ida_env`），并在 `/Applications/IDA Professional 9.1.app/Contents/MacOS/python/init.py` 中添加 `sys.path.append("/opt/miniconda3/envs/ida_env/lib/python3.13/site-packages")`，让 IDA 只使用该环境。
> - **查看 IDA 当前 Python：** 在 IDA 安装目录下执行 `./idapyswitch` 可列出已检测到的 Python 版本，当前 IDA 9.1 默认使用系统发现的 3.13。
> - **安装 MCP 插件：** 在专用环境执行 `pip install https://github.com/mrexodia/ida-pro-mcp/archive/refs/heads/main.zip` 及 `ida-pro-mcp --install`；打开 IDA 后通过 `Edit → Plugins → MCP` 启动服务，默认监听 `http://127.0.0.1:13337/sse`。
> - **AI IDE 配置：** 在 Cursor/CodeGeeX/Trae 等 AI IDE 的 MCP 配置中写入 `{"mcpServers":{"ida":{"transport":"sse","url":"http://127.0.0.1:13337/sse","alwaysAllow":["idb_meta","list_funcs","disasm","decompile","lookup_funcs","analyze_funcs","get_bytes"]}}}` 即可让 AI 直接操作 IDA。
> - **实用效果：** 可直接对 AI 下达“去掉 0x101159B88 函数的花指令”“分析 xid 生成逻辑并生成 Frida hook 脚本”等指令，AI 能理解并执行；作者同时强调“你会 AI 才能搞出来”，说明基础逆向能力仍不可替代。

一、目标

## 一、目标

“小x同学，把0x1011218f 的函数中的花指令去除掉”。

最近飞哥已经陷入到AI中无法自拔，感觉以后古法分析都快要成非遗了，以后的标题都得是"传承三十年，古法纯手工去花指令，定位关键算法"。

## 二、步骤

### 你的Ida Python在哪里？

首先你得知道你的ida python是谁？ 在哪里？

原则一，不要用系统的python，不然你乱七八糟装一堆包，把系统的python干坏了，就废了，最好创建一个虚拟环境，这个python只给ida用

/Applications/IDA Professional 9.1.app/Contents/MacOS

目录下面找到 idapyswitch

```bash
fenfei@fenfei-Mac-Studio MacOS % ./idapyswitch
The following Python installations were found:
    #0: 3.13.0 ('') (/opt/homebrew/Cellar/python@3.13/3.13.5/Frameworks/Python.framework/Versions/3.13/Python)
    #1: 3.12.0 ('') (/opt/homebrew/Cellar/python@3.12/3.12.10/Frameworks/Python.framework/Versions/3.12/Python)
    #2: 3.11.0 ('') (/opt/homebrew/Cellar/python@3.11/3.11.12/Frameworks/Python.framework/Versions/3.11/Python)
    #3: 3.10.0 ('') (/opt/homebrew/Cellar/python@3.10/3.10.17/Frameworks/Python.framework/Versions/3.10/Python)
    #4: 3.9.0 ('') (/Library/Developer/CommandLineTools/Library/Frameworks/Python3.framework/Versions/3.9/Python3)
    #5: 3.9.0 ('') (/Applications/Xcode.app/Contents/Developer/Library/Frameworks/Python3.framework/Versions/3.9/Python3)
Please pick a number between 0 and 5 (default: 0)
```

可以看到 我现在ida 用的是 py3.13

然后使用 conda 装个虚拟环境，然后里面也装python3.13

```bash
conda create -n ida_env python=3.13
```

修改 /Applications/IDA Professional 9.1.app/Contents/MacOS/python/init.py

增加一行 sys.path.append("/opt/miniconda3/envs/ida_env/lib/python3.13/site-packages")

恭喜你，从此以后你的ida python就专款专用了

可以确认一下你的配置是否正确，

### 插上翅膀

[https://github.com/mrexodia/ida-pro-mcp](https://github.com/mrexodia/ida-pro-mcp)

mcp是什么？这个得问ai

MCP 一般指的是 Model Context Protocol（模型上下文协议）。

一句话版理解（先看这个）

```
MCP = 给 AI 规定的一套“插件 / 外挂接口标准”
```

就像：

-   USB 是硬件接口标准
-   HTTP 是网络接口标准
-   MCP 是 AI 调用外部能力的接口标准

其实你就理解成，ida mcp 可以让AI ide 直接操作你的ida

我们开始安装 ida mcp

```bash
# 进入ida专用py环境
conda activate ida_env
pip uninstall ida-pro-mcp
pip install https://github.com/mrexodia/ida-pro-mcp/archive/refs/heads/main.zip
ida-pro-mcp --install
```

ok了， 安装完毕， 打开 ida ，找个样本反编译，然后 Edit → Plugins → MCP

```bash
[MCP] Server started:
  Streamable HTTP: http://127.0.0.1:13337/mcp
  SSE: http://127.0.0.1:13337/sse
  Config: http://127.0.0.1:13337/config.html
```

这就是启动成功，

### 配置AI IDE

打开你常用的 AI IDE， 包括不限于 Cursor / CodeGeeX / Trae / Codebuddy

配置 MCP

```bash
{"mcpServers":{"ida":{"transport":"sse","url":"http://127.0.0.1:13337/sse","alwaysAllow":["idb_meta","list_funcs","disasm","decompile","lookup_funcs","analyze_funcs","get_bytes"]}}}
```

出来这个效果

![idamcp](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/e457cf1f42ea8e0a.png)

1:idamcp

可以开始了

```bash
从ida mcp中，请把 0x101159B88 函数的花指令去掉

从ida mcp中，请帮我分析一下 xid 是如何生成的， 生成frida hook 脚本 跟踪一下。
```

嗯 真香

## 三、总结

感觉ai进步了，以前红极一时的 AI Prompt 没那么重要了，反正我说的 AI 基本都能听懂。

古法纯手工还有没有意义？ 有个网友说过 你不会的别指望 ai 会，你能用 ai 搞出来是因为你会

![ffshow](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/06f4181c8978918b.jpg)

1:ffshow

插上翅膀的人是天使，插上翅膀的老鼠是蝙蝠

![100](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/897edc78d5c0d2b3.png)
