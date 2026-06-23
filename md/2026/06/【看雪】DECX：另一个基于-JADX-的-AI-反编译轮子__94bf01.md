---
title: 【看雪】DECX：另一个基于 JADX 的 AI 反编译轮子
source: https://bbs.kanxue.com/thread-291762.htm
source_host: bbs.kanxue.com
clip_date: 2026-06-23T22:02:46+08:00
trace_id: d11d0860-a566-450a-a718-701e385e0c55
content_hash: e89e27be06bb8556d6474fdedb95610c4113ed7773d29d4dd05656e69efe78de
status: summarized
tags:
  - 看雪
series: null
feed_source: 看雪·Android安全
ai_summary: DECX 是一个不依赖 JADX GUI 的 AI 反编译工具，通过独立核心模块实现灵活部署和漏洞分析，解决了 jadx-ai-mcp 架构限制。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 38875244-d011-81fd-b442-c574a4d462f1
ioc:
  cves: []
  cwes: []
  hashes: []
  domains:
    - bbs.kanxue.com
    - github.com
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> DECX 是一个不依赖 JADX GUI 的 AI 反编译工具，通过独立核心模块实现灵活部署和漏洞分析，解决了 jadx-ai-mcp 架构限制。
> 
> - **核心架构创新：** DECX 的 decx-core 模块将反编译引擎（JadxDecompiler）和 MCP server 集成，脱离 GUI 独立运行，提供与传输层无关的 API、服务和 29 个 MCP 工具。
> - **部署方式灵活：** 支持三种方案：独立 fat jar（decx-server）、Jadx 插件和 TypeScript CLI（decx-cli），便于在远程服务器或本地使用。
> - **独特采集能力：** `decx ard framework run` 命令自动从连接的 Android 设备采集厂商魔改的框架代码，并通过四步流水线进行整合分析。
> - **漏洞挖掘流程：** 采用 subagent 委托和证据图流程，要求五种事实（如源码行证据）通过 `proves` 边连接才能确认漏洞，覆盖 30+ 种应用层场景。
> - **严格证据门控：** 漏洞分析依赖 `decx code` 查询源码作为证据，避免仅凭方法名推理，并使用复合漏洞链边（如 enable、carry）评估风险。

前段时间用 jadx-ai-mcp 分析 APK，跑了几个小时，体验确实不错。Claude 能自己调 tool 读反编译代码、看导出组件、跟调用链，省了不少手动翻代码的功夫。

有一天晚上我想把 APK 丢到服务器上跑，本地 Claude 连过去用——本地风扇太吵了。结果发现不行。jadx-ai-mcp 的 Python MCP server 要通过 HTTP 连 JADX 插件的 API，而那个 API 只有在 JADX GUI 启动后才存在。

我当时觉得这很正常——JADX 本来就是个桌面工具。但后来仔细想了想：JADX 的反编译引擎 JadxDecompiler 是一个纯 Java 类，new 出来就能用。它根本不依赖 GUI。那为什么 MCP server 非得挂在 GUI 上？

这个念头改变了一切。如果 MCP server 能跟反编译引擎在同一个进程里跑，不经过 GUI，那整个工具链的形态就完全不同了。这就是 DECX 的起点。

jadx-ai-mcp 的架构是三层串联，这存在一个核心问题：MCP 协议层和反编译能力被 GUI 进程边界隔开了，MCP 离不开 GUI。

DECX 的做法是把所有能力放进一个独立的 decx-core 模块里。这个模块不依赖任何 UI 组件，只需要一个 JadxDecompiler 对象就能提供完整的反编译能力。所有代码——API 接口、Service 实现、MCP Tool 定义——全在core中实现

`decx-core` 是一切的根基。它提供了一套 **与传输层无关的 API/Services/MCP 实现** ，不管你是通过 JADX 插件、独立jar、还是 TypeScript CLI 来用，底下的逻辑完全相同。

这层关系用 Kotlin 代码表达就是 `Decx` 的全局对象：

同一个 **`Decx.mcpServer(api, port)`** ，在 JADX 插件里调用和在 standalone jar 里调用，返回的是同一个类、同一套 29 个工具、同一种 MCP 协议实现。

DecxRoutes 定义 HTTP 路由，McpToolRegistry 定义 MCP tool。两者通过 routePath 一一对应：

由于核心架构和上层分离，我们能够直接使用 Decx 的独立 Jar，也可以使用 Jadx Plugin 的方式，为了方便使用，我也提供了几种方案。

`decx-server` 打成 fat jar 后，不需要 JADX GUI，不过建议还是使用 Cli / Plugin ，会更方便。

这是最简单的使用方法了，打开 Jadx ，在插件列表里找到 Decx，安装即可。

`decx-cli` 是 TypeScript 写的，管理 standalone server 的生命周期。通过 `--help` 命令能够看到怎么使用，当然，也可以直接安装对应的 decx-cli skill 来使用。

这里稍微讲一下 `decx ard framework run` ，这是是 DECX 独有的能力——从连接的 Android 设备自动采集整个框架相关的代码并打包整合分析：

整个过程包括四步流水线：

这样，针对厂商魔改的框架代码，就能够去进行整合性分析，而这套流程的前提就是 `decx-core` 能脱离 GUI 独立运行。没有这个前提，CLI 没法自动启动 server；没有 server，framework jar 只能手动丢进 JADX GUI。

既然已经做到这里了，那不如更近一步，做一些用来处理真实漏洞挖掘和分析的 skill 吧！

这里必须要感谢 https://github.com/oritera/Cairn 给了我启发——能不能将漏洞挖掘的过程做成一整套skill，但是不局限于漏洞知识，而是发挥模型本身的能力。

这可能是五个 skill 里最核心的一个。它做的不是"用 AI 搜一下有没有漏洞"这种笼统的事，而是一套严格的 **subagent 委托 + 证据图** 流程。

主 agent 不碰代码。它的工作只有五件事：初始化项目、启动 DECX session、把具体的分析意图委托给 subagent、读取 subagent 的 JSON 摘要、按风险矩阵决定是否升级为正式漏洞。主 agent 跑 `decx code` 或读源码是违规的——所有分析都在 subagent 里完成。

subagent 收到一个 intent goal（比如"收集攻击面：导出组件、deep link、AIDL、动态 receiver" 或 "跟踪某个 entrypoint 到 sink，证明 5-tuple"），自己创建 intent、跑 `decx code` 查询、写 fact 和 edge 到证据图、solve 后返回结构化 JSON 摘要。subagent 不能"推理"出漏洞——必须通过 `decx code` 读到源码，用源码行作为 evidence。 `validate*` 、 `check*` 这类方法名不算证据（可能只是命名习惯，不代表真的有校验逻辑）。

证据门要求 **5 种事实全部存在且由 ****`proves`**** 边连接** 才能升级为正式漏洞：

复合漏洞链由五种边组合： `enable` （A 创建 B 需要的入口）、 `carry` （A 传输数据给 B）、 `amplify` （A 放大 B 的影响）、 `bypass` （A 打穿 B 的保护）、 `observe` （A 让 B 的影响可见）。

漏洞模式覆盖 30+ 种应用层场景：Intent 重定向、Bundle/key 失配、WebView JS bridge、Provider 数据泄露/SQL 注入/路径穿越、broadcast 劫持、PendingIntent 滥用、fragment 注入、task hijack、动态 dex 加载、跨 app 数据通道等。

[回复或点赞可查看完整内容](#quick_reply_form)

[#基础理论](https://bbs.kanxue.com/forum-161-1-117.htm) [#逆向分析](https://bbs.kanxue.com/forum-161-1-118.htm) [#漏洞相关](https://bbs.kanxue.com/forum-161-1-123.htm) [#程序开发](https://bbs.kanxue.com/forum-161-1-124.htm) [#工具脚本](https://bbs.kanxue.com/forum-161-1-128.htm)

* * *

## 评论

> **wx\_插曲 · 2 楼**
> 
> 66676

> **夜惜风雨 · 3 楼**
> 
> 6666666666

> **温泉划水鱼 · 4 楼**
> 
> kk

> **x1a0f3n9 · 5 楼**
> 
> 有用，感谢分享，jadx的gui好用但是问题实在太多了

> **jygzyc · 6 楼**
> 
> > [x1a0f3n9](https://bbs.kanxue.com/user-1036990.htm) 有用，感谢分享，jadx的gui好用但是问题实在太多了
> 
> 有问题的话可以提交issue，高强度更新 ![](https://bbs.kanxue.com/view/img/face/065.gif)

> **jyotidwi · 7 楼**
> 
> tql

> **mb\_rjdrqvpa · 8 楼**
> 
> 佬，你这个项目和jadx mcp有什么区别，优点？除了不依赖jadx GUI+找漏洞，对于逆向，有什么帮助？

> **mb\_roiscepd · 9 楼**
> 
> tql
