---
title: 【看雪】ai自动化逆向环境搭建与实战
source: https://bbs.kanxue.com/thread-293226.htm
source_host: bbs.kanxue.com
clip_date: 2026-10-15T15:02:26+08:00
trace_id: 534f54f0-f3bc-4a06-9886-1f6d0e5f9614
content_hash: 584cc894ff80433e59338d4eb25ae620941cd63aabfe32db1ec72381bac31da7
status: synced
tags:
  - 看雪
  - AI辅助逆向
  - Android逆向
series: null
feed_source: 看雪·Android安全
ai_summary: 给本地 agent（opencode）配好 ida 与 jadx 的 MCP，就能搭建可自动脱壳、还原混淆与 VMP 的 AI 逆向环境，无需 rea 那类封装。
ai_summary_style: key-points
images_status:
  total: 9
  succeeded: 9
  failed_urls: []
notion_page_id: 3fa75244-d011-8136-8ba2-dc04fa861f65
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 给本地 agent（opencode）配好 ida 与 jadx 的 MCP，就能搭建可自动脱壳、还原混淆与 VMP 的 AI 逆向环境，无需 rea 那类封装。
> 
> - **rea 评价：** 它只是对 ida、jadx 等安全工具自身 MCP 的一层封装，没有独有能力，自己在 agent 里配置 MCP 效果相同。
> - **环境搭建：** agent 选 opencode 并导入 API key；MCP 本质是函数 + 供大模型阅读的注释描述 + 启动命令 + 超时配置，写入 `.config/opencode/opencode.json` 的 `mcp.servers`。
> - **IDA/jadx 配置：** ida9.3 需装 uv、运行 `py-activate-idalib.py` 激活 idalib，再装 ida-pro-mcp（Python≥3.11），生成 `idalib-mcp.exe`；jadx 只需 Java 加 jadx-headless-mcp jar；超时分 startup/catalog/execution 三档。
> - **实测成果：** 不到 2 天自动完成梆梆加固 libDexHelper.so 脱壳修复与重打包、libdexjni.so 的 opcode 与 handler 还原、GB 级 trace 的指纹链路与白盒 AES 密钥提取、010Editor/Typora 授权破解。
> - **能力边界：** 弱混淆可全自动逆向；加壳与畸形 ELF 修复、密码学还原、VMP handler 还原均强，强混淆大型 App 需提供 trace 文件。

## 0.前言

前几天有个叫rea的东西“大火”，作为圈内人，当然要看看这到底是个什么玩意了。试了之后发现似乎啥也不是，只是对一些安全工具本身的mcp做了一层封装，底层能力还是依赖大模型本身和ida，jadx这些安全工具自己的mcp。

这层封装本身也没有必要，只要自己在agent里配置好ida的mcp，能力完全一样。

所以rea本身就是一个炒作下没有任何用处的东西。

本文借此机会详细讲述如何自己搭建ai自动化逆向环境。

## 1.agent

ai已经火了很久了，但是在rea出来之前我也没怎么用过agent，听说过mcp，skill什么的，但是完全没用过，都是把代码复制粘贴给ai，让他辅助分析，效果也还行。

agent我的理解就是把网页的ai对话搬到了本地，本质还是网络请求和后端的大模型交互，不过在本地可以有更多的拓展功能和操作权限等等等。

首先去下载一个叫 **opencode** 的agent：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7e54be582118afb7.webp)

下载好后需要导入自己的ai apikey：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c659624263b32aa4.webp)

等连接上ai后，可以在对话框里进行对话了：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a007a7af6f83aa74.webp)

这样agent就装好了。

## 2.mcp

mcp是可以理解为大模型和 **程序** 之间的 **接口**

对大模型来说，想要调用一些函数提供的能力，需要提供以下东西：

1.函数：

需要在代码里编写若干供大模型调用的函数，这里的代码就是正常开发时写的代码

2.描述：

这是mcp中最关键的部分。因为大模型使用自然语言来进行交互，具体怎么调用，为什么调用，完全基于自然语言的理解。这里的描述，其实就是函数里的注释：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/54727b5c50059366.webp)

例如这是jadx的mcp，定义的python方法时大模型会调用的，其中的注释是供大模型理解的

大模型会自己阅读注释，正确理解每个函数什么时候调用。

3.命令

大模型想要调用一个函数，必须要执行一些命令。例如java，python等等。这些命令要在配置的时候提供给大模型。

4.配置

一个mcp的配置大概长这样：

```python
      "jadx": {
        "type": "local",
        "command":["java","-jar","D:/tools/jadx-headless-mcp-0.7.1-all.jar"],
        "timeout": {
          "startup": 120000,
          "catalog": 60000,
          "execution": 600000
        }
      }
```

其中主要包括mcp名称，启动命令，等待超时等等。

因为函数执行都需要时间，如果是ida反编译之类的时间会更久。所以需要配置一个等待和超时时间，ai会根据这个时间决定是继续等待执行结果还是中止。

### 2.1 ida mcp

给大模型配置ida的能力，大模型可以自己去分析一个可执行文件，包括不限于elf结构，函数的反编译，交叉引用等等。

注意，ida9.3和ida9.4的mcp配置方式不同，本文使用ida9.3配置。

首先安装uv

```python
py -m pip install --user uv
```

然后激活idalib

```python
uv run "D:\ida93\idalib\python\py-activate-idalib.py"
```

idalib在ida的安装目录下存在

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/34519be686b0effa.webp)

然后安装ida-pro-mcp(需要python3.11以上)

```python
python -m pip install --upgrade "https://github.com/mrexodia/ida-pro-mcp/archive/refs/heads/main.zip"
```

安装后，一般会在C:\\Users\\\[name\].local\\bin\\idalib-mcp.exe

### 2.2 jadx mcp

jadx的mcp很简单，只需要装好java和下载jadx-headless-mcp-0.7.1-all.jar即可

```python
https://github.com/1013503897/jadx-headless-mcp
```

## 3.配置opencode

接下来只需要把ida和jadx的mcp配置给opencode即可，配置文件一般在：

```python
C:\Users\[user]\.config\opencode\opencode.json
```

打开，在其开始处添加配置信息：

```python
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "servers": {
      "idalib": {
        "type": "local",
        "command": [
          "C:\\Users\\[user]\\.local\\bin\\idalib-mcp.exe",
          "--stdio"
        ],
        "timeout": {
          "startup": 120000,
          "catalog": 60000,
          "execution": 600000
        }
      },
      "jadx": {
        "type": "local",
        "command":["java","-jar","D:/tools/jadx-headless-mcp-0.7.1-all.jar"
        ],
        "timeout": {
          "startup": 120000,
          "catalog": 60000,
          "execution": 600000
        }
      }
    }
  },
```

主要是idalib和jadx的command部分，保证其能正常执行即可。

配置好后重新打开opencode，可以在opencode里的拓展部分看到mcp已经被加载了：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f58b3e285f71c4c8.webp)

这个时候，我们就可以用来自动化的逆向apk了，大模型会调用jadx去获取需要的java信息，调用ida去获取需要的so信息，同时综合分析，自动写各种测试脚本等等。

以下是一些ai自动分析时的运行截图：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/cccde55cea2367f6.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8460185117dbae9d.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c2dca8476d4307a1.webp)

  
  

## 总结

最终我通过agent结合ida和jadx的mcp，完成了以下自动化逆向：

-   梆梆加固的elf文件(libDexHelper.so)脱壳并修复，dex文件加密算法分析，完成解密脚本，自动回填coditem修复。生成可运行的重打包apk。
-   梆梆加固dexvmp(libdexjni.so)完全opcode和handler还原。
-   破解了010editor，Typro的license。
-   某电商app（强混淆）的GB级trace自动化分析， [完整还原指纹采集链路与所有算法](https://bbs.kanxue.com/thread-293223.htm) ，包括 [白盒aes的还原和密钥提取](https://bbs.kanxue.com/thread-293224.htm)

以上所有工作，在 **不到2天的时间内完成**，而且基本上都是ai自动化完成。目前大模型+mcp可以有以下能力：

-   不是特别强的混淆，基本都可以自动逆向分析完毕。
    
-   对于加壳的elf和畸形elf，自定义linker修复，密码学算法还原，都非常强力。
    
-   对于强混淆的大型商业app，提供trace文件GB级别的基本可以快速还原。
    
-   对于vmp，可以自动分析还原所有handler，并生成还原脚本。
    

至于rea，路边一条。。。
