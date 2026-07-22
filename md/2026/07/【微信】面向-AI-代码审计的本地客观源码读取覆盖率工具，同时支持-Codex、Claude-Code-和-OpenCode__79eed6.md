---
title: 【微信】面向 AI 代码审计的本地客观源码读取覆盖率工具，同时支持 Codex、Claude Code 和 OpenCode
source: https://mp.weixin.qq.com/s/kvSvM8r9TuuVGdiYNi1W8Q
source_host: mp.weixin.qq.com
clip_date: 2026-07-23T07:45:11+08:00
trace_id: bf64089c-1323-42a7-93b8-0072d63a6eb6
content_hash: 0728327b8700236733e2288255c251fe94393191839333ce18ccce3a4b1956c9
status: summarized
tags:
  - 微信
  - AI辅助逆向
  - 安全工具
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: AuditCov是一个用于追踪AI代码审计工具客观读取源码覆盖率的本地工具，支持Codex、Claude Code和OpenCode。
ai_summary_style: key-points
images_status:
  total: 8
  succeeded: 8
  failed_urls: []
notion_page_id: 3a575244-d011-8107-bb8d-e6b4a65d345f
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> AuditCov是一个用于追踪AI代码审计工具客观读取源码覆盖率的本地工具，支持Codex、Claude Code和OpenCode。
> 
> - **核心功能：** 统计AI工具成功读取了哪些源码文件和代码行，提供客观的读取覆盖率数据，而非判断代码是否被理解或审计完成。
> - **支持工具：** 同时支持Codex、Claude Code和OpenCode，通过Hook机制在工具调用前后关联，仅记录成功返回的读取操作。
> - **展示界面：** 提供Web界面管理项目，展示项目、会话、父子Agent及逐文件的目录树和行级覆盖状态，支持多选会话合并计算。
> - **部署与使用：** 通过Python脚本启动本地服务并安装适配器，需在Web界面手动创建项目指定代码库路径，之后AI工具的操作会自动上报。
> - **重要限制：** 覆盖率仅是客观读取记录，不能证明代码已被正确理解、分析或完成安全审计。

**夜组安全** *2026年7月23日 07:30*

由于传播、利用本公众号夜组安全所提供的信息而造成的任何直接或者间接的后果及损失，均由使用者本人负责，公众号夜组安全及作者不为此承担任何责任，一旦造成后果请自行承担！如有侵权烦请告知，我们会立即删除并致歉。谢谢！ **所有工具安全性自测！！！VX：** **NightCTI**

朋友们现在只对常读和星标的公众号才展示大图推送，建议大家把 **夜组安全** “ **设为星标** ”，否则可能就看不到了啦！

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/ef3de906fd21ae79.png)

## 工具介绍

AuditCov面向 AI 代码审计的本地客观源码读取覆盖率工具，同时支持 **Codex、Claude Code 和 OpenCode** 。

AuditCov 记录每个 Code Agent 会话成功读取过哪些源码文件、哪些完整代码行，并通过统一的 Web 界面展示项目、会话、父子 Agent 和逐文件覆盖情况。它回答的是“Agent 客观上读取过哪些代码”，而不是“Agent 是否理解了代码”或“审计是否已经完成”。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/0dd81fdfde454dbf.jpg)

> AuditCov 的覆盖率是 **客观读取覆盖率** ，不能单独证明代码已经被正确理解、分析或完成安全审计。

## 功能概览

-   一个本地统计服务同时接收 Codex、Claude Code 和 OpenCode 的读取事件。
    
-   Web 界面创建和管理代码仓项目，无需由 Agent 初始化项目。
    
-   按项目、工具和原生会话 ID 分开统计覆盖率。
    
-   展示源码目录树、文件覆盖率以及逐行覆盖状态。
    
-   支持多选会话，按所选会话读取区间的并集计算覆盖率。
    
-   支持 Claude Code 和 OpenCode 的父子 Agent 层级展示。
    
-   父 Agent 和子 Agent 独立统计、独立勾选，不会隐式合并。
    
-   Hook 采用调用前/调用后两阶段关联，只有成功返回的 Read 才计入覆盖。
    
-   对已创建项目中的超大 Read 请求按完整行边界安全截断。
    
-   未创建项目中的读取完全忽略，Hook 不修改工具参数。
    
-   统计服务不可用时放行原工具调用，并写入告警日志。
    
-   使用 SQLite 保存本地状态，无外部服务和第三方 Python 依赖。
    
-   提供 Windows/Linux 通用 Python 安装器，可任选安装或卸载一个或多个 Agent 适配器。
    

## 快速开始

以下命令都在本仓库根目录执行。

### 1\. 可选：安装 Python 包

无需安装依赖即可从源码运行。若希望在其他目录使用 `auditcov-server` 等命令，可执行：

```
python -m pip install -e .
```

Linux 中如果 `python` 未指向 Python 3，请将本文命令中的 `python` 改为 `python3` 。

### 2\. 启动统计服务和 Web 界面

```
python -m auditcov_mcp.web
```

默认地址：

```
http://127.0.0.1:8765
```

如果已经执行过可编辑安装，也可以使用：

```
auditcov-server
```

可用启动参数：

```
--host HOST     监听地址，默认 127.0.0.1
--port PORT     监听端口，默认 8765
--db PATH       显式指定 SQLite 数据库
--quiet         不打印启动地址
```

服务第一版需要手动启动。建议先启动服务，再启动 Code Agent。

### 3\. 在 Web 中创建项目

打开 `http://127.0.0.1:8765` ，在左侧 **Create project** 中填写：

-   **Repository root** ：代码仓的绝对路径。
    
-   **Name** ：可选的显示名称。
    

点击 **Create project** 后，AuditCov 会扫描整个代码仓并冻结第一版覆盖率分母。项目创建完成前产生的读取不会被补记。

路径必须使用统计服务所在环境能够访问的形式。例如服务运行在 WSL 中时，应填写：

```
/mnt/f/product/example-repository
```

而不是 Windows 路径：

```
F:\product\example-repository
```

### 4\. 安装 Agent 适配器

安装一个工具：

```
python scripts/auditcov_install.py install --codex
python scripts/auditcov_install.py install --claude
python scripts/auditcov_install.py install --opencode
```

安装 Codex 时，安装器会创建一份当前用户专用的运行时 marketplace 副本，并将执行安装器的 Python 解释器绝对路径写入 MCP 配置。Linux/WSL 使用 `python3` 运行安装器，Windows 使用 `python` ；Codex MCP 不再假定两个平台都存在同名的 `python` 命令。

同时安装多个工具：

```
python scripts/auditcov_install.py install --claude --opencode
```

当三个工具均已安装且命令可用时，可以一次安装全部适配器：

```
python scripts/auditcov_install.py install --all
```

查看安装状态：

```
python scripts/auditcov_install.py status
codex plugin list
```

安装完成后必须完全退出并重新启动对应的 Code Agent。Codex 需要开启一个新任务，Claude Code 和 OpenCode 需要开启新会话或重新启动进程。

### 5\. 开始审计并查看覆盖率

-   Codex 通过 AuditCov Skill 和三个 MCP 工具读取、查询覆盖率。
    
-   Claude Code 和 OpenCode 在调用原生 Read 工具时自动上报，无需手动调用统计 API。
    
-   返回 Web 后点击 **Refresh** ，选择项目和需要查看的会话。
    
-   点击目录树中的源码文件，查看成功读取过的行和未读取行。
    

推荐给 Codex 的提示词：

```
使用 AuditCov 审计当前仓库。所有源码读取通过 auditcov_read_file 完成，
并定期使用 auditcov_get_coverage 检查客观读取覆盖率。
```

推荐给 Claude Code/OpenCode 的约束：

```
审计当前项目。直接阅读源代码时使用 Read 工具，
不要使用 cat、sed、awk 或 Python 脚本读取代码文件。
```

## 工具获取

点击关注下方名片进入公众号

回复关键字【260723】获取下载链接

## 往期精彩

[](https://mp.weixin.qq.com/s?__biz=Mzk0ODM0NDIxNQ==&mid=2247497261&idx=1&sn=28f382637e4ebc1222a1a26eccaebd3a&scene=21#wechat_redirect)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/23cb00bf164247fc.webp)

[RavenEye · 威胁狩猎平台 | 一款面向蓝队与安全分析人员的轻量级桌面工具集](https://mp.weixin.qq.com/s?__biz=Mzk0ODM0NDIxNQ==&mid=2247497261&idx=1&sn=28f382637e4ebc1222a1a26eccaebd3a&scene=21#wechat_redirect)

[

2026-07-22

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/27cf0486a368b0fb.jpg)

](https://mp.weixin.qq.com/s?__biz=Mzk0ODM0NDIxNQ==&mid=2247497261&idx=1&sn=28f382637e4ebc1222a1a26eccaebd3a&scene=21#wechat_redirect)[

云安全漏洞挖掘与利用Skill — 攻击面发现 + 凭据后利用

2026-07-21

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/eaec10b1be8213de.jpg)

](https://mp.weixin.qq.com/s?__biz=Mzk0ODM0NDIxNQ==&mid=2247497236&idx=1&sn=fb1300d826d7382d8a3b4ed29e5e849e&scene=21#wechat_redirect)[

CNVD 漏洞高效挖掘 | 从目标侦察到 CNVD 提交的全流程自动化技能包

2026-07-20

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/1dd85da106ed18f9.jpg)

](https://mp.weixin.qq.com/s?__biz=Mzk0ODM0NDIxNQ==&mid=2247497230&idx=1&sn=f442c178078d5e1dd055da7682205709&scene=21#wechat_redirect)[

Linux 失陷主机一键应急排查>蓝队应急响应 / Incident Response / Linux 主机取证

2026-07-17

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/092f53996c7f55cd.jpg)

](https://mp.weixin.qq.com/s?__biz=Mzk0ODM0NDIxNQ==&mid=2247497225&idx=1&sn=7e8a5c4344861c3cac121da7d5d94b39&scene=21#wechat_redirect)[

Agent 自动化挖掘逻辑漏洞被动扫描工具 | 可对进行漏洞验证生成可复现的完整利用链

2026-07-16

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/ff798b64be3db6ec.jpg)

](https://mp.weixin.qq.com/s?__biz=Mzk0ODM0NDIxNQ==&mid=2247497220&idx=1&sn=cc32cebeca21434e0fbea8a683138358&scene=21#wechat_redirect)

代码审计 · 目录
