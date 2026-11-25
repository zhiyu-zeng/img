---
title: 【微信】Windows 在记录你用哪些编码代理：逆向 MissionControlAggregator 的遥测链路
source: https://mp.weixin.qq.com/s/Vm8LM-IVeeG_RqnjOFzR3A
source_host: mp.weixin.qq.com
clip_date: 2026-11-25T09:57:34+08:00
trace_id: 3e77213d-d62a-4b6d-9de2-f95ff2349286
content_hash: baee56e564049620fb1c491d0ec96901d375b2da0c42f1678e8cf80e94306387
status: synced
tags:
  - 微信
  - Windows逆向
  - 恶意样本
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: Windows 11 的 MissionControlAggregator.dll 内嵌编码代理和开发工具名单，它通过订阅既有的 ETW 事件匹配可执行文件名，再以 bitset 形式经 Segments.SubCohorts 上报微软，且该项数据默认属于可选诊断数据。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 42375244-d011-8106-a0e7-d0adffd1e212
ioc:
  cves: []
  cwes: []
  hashes:
    - 340dfe7e962ab225b6ac33bc664bd54f
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Windows 11 的 MissionControlAggregator.dll 内嵌编码代理和开发工具名单，它通过订阅既有的 ETW 事件匹配可执行文件名，再以 bitset 形式经 Segments.SubCohorts 上报微软，且该项数据默认属于可选诊断数据。
> 
> - **内嵌名单：** CLI 编码代理有四个槽位（copilot、claude、codex、agy.exe），桌面代理有五个槽位（github、claude、codex、cursor、antigravity.exe）；此外还有 node、python、dotnet、gcc、clang、gdb、javac、devenv、code.exe 等开发工具分类。部分槽位会核验发行者，例如 node 期待 Node.js Foundation、python 期待 Python Software Foundation。
> - **取数方式：** 它不自行扫描进程，而是订阅 KernelProcess.AppStateChangeSummary、Win32kTraceLogging.AppInteractivitySummary 以及 WSL 的 Lxss.Manager.Exec，从这些事件中提取 imageName，再交给名称匹配器处理。命中后仅置位，丢弃运行时长、前台时间等细节。
> - **上报链路：** 组件由 DiagTrack 拉起的 AggregatorHost.exe 加载，状态持久化到 `C:\ProgramData\Microsoft\Diagnosis\AggregatorStorage\MissionControlAggregator$`，约每天通过 ReportCohorts<12,4,5> 发出 TraceLogging 事件，三个数字分别对应工具大类、CLI 代理和桌面代理。
> - **实测验证：** 把 cmd.exe 改名为 codex.exe 后，CLI 槽位 2 的值为 2；上报事件中 CliAgentSubCohorts 为 4（1<<2）。改名为 gcc.exe 则置 developer-tool slot 3，SubCohorts 为 [8]。回拨上报窗口 25 小时并重启 DiagTrack 可以立即抓取。
> - **默认开启：** 至少美区全新安装为 AllowTelemetry=3，可选诊断数据默认开启，隐私字段 `isRequired:false`；关闭“发送可选诊断数据”即停止上传。检测只比对文件名，因此改名可绕过检测，也可伪造。

**赛博生存指南** *2026年11月23日 16:58*

> 原文：https://xusheng.dev/posts/windows-coding-agent-telemetry/  
> 作者：Xusheng Li（xusheng.dev）  
> 发布时间：2026-11-16  
> 翻译模型：GLM-5.3  
> 质量评分：★★★★☆（4/5） ｜ 标签：检测基础设施 · 分析工具与方法论 · AI×安全

**AI 摘要**：逆向 Windows 11 的 MissionControlAggregator.dll 发现一份内嵌名单：CLI 编码代理四槽（copilot／claude／codex／agy.exe）、桌面代理五槽（github／claude／codex／cursor／antigravity.exe），外加 node／python／gcc 等开发工具分类，部分槽位还验发行者。它不自扫进程，而是订阅既有 ETW 事件（KernelProcess.AppStateChangeSummary、Win32kTraceLogging.AppInteractivitySummary、WSL 的 Lxss.Manager.Exec），把命中压成 bitset 经 Segments.SubCohorts 上报——只记“出现过哪个”，不记时长。把 cmd.exe 改名 codex.exe 即触发 Codex 位；该报告被归为可选诊断数据，美区全新安装默认开启，也就是默认上传微软。

ETW 在本仓库一直是防守方的吃饭家伙、攻击者的必拆目标。这篇的看点是视角对调：同一条 TraceLogging 管道，生产者换成了微软自己，统计的是“你机器上出现过哪些编码代理”。想知道 AI 编码工具的渗透率，微软不必发问卷，订阅自家遥测就够了。文末译者补充给了个五分钟自测法（cmd 改名 codex.exe 跑一下），也把这条链与仓库既有的遥测文章放在一张图上对照。

最近我让 AI 帮我把最新版 Windows 的二进制文件过一遍，找找未文档化的功能。在它翻出的线索里，有一份名单立刻引起了我的注意： `codex.exe` 、 `claude.exe` 、 `copilot.exe` 、 `cursor.exe` 这些编码代理，和 `python.exe` 、 `dotnet.exe` 、 `gcc.exe` 、 `code.exe` 这些熟面孔的开发工具列在一起。

一个 Windows 系统 DLL，为什么要内置一份编码代理和开发工具的名单？

这些名字出现在 MissionControlAggregator.dll 里。我让 agent 顺着引用往下挖，看这个 DLL 到底做什么。这条线从几个字符串比对出发，一路牵出一个正在运行的 Windows 组件：它记录你用过哪些编码代理和开发工具，把信息存到本地，再上报给 Windows 诊断。除非你主动退出了“可选”诊断数据（默认开启），这些数据会上传给微软。

我把初步发现发在了 X 上https://x.com/CrackmesOne/status/2122147747390468384，这篇文章是调查过程的完整记录。

## 顺着名字往下查

用 Binary Ninja 打开这个 DLL，第一条线索一眼可见——这些是明晃晃嵌在 Windows 组件里的可执行文件名：

![Binary Ninja 中可见的内嵌可执行文件名单](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ada855799a1254b2.jpg)

顺着引用看，这些名字都用在比对里。四个 CLI-agent slot 检查 `copilot.exe` 、 `claude.exe` 、 `codex.exe` 和 `agy.exe` ，WSL 路线上还有一套不带扩展名的等价写法；五个桌面 agent slot 检查 `github.exe` 、 `claude.exe` 、 `codex.exe` 、 `cursor.exe` 和 `antigravity.exe` 。

下面是与 `codex.exe` 的比对之一：

![与 codex.exe 的名称比对逻辑](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5113bc8884388d9b.jpg)

编译器生成的 C++ 名字又长又难读，下文把这类函数叫作 executable-name matcher（可执行文件名匹配器）。供参考，其中一个相关 matcher 的全名是 `std::_Func_impl_no_alloc<<lambda_340dfe7e962ab225b6ac33bc664bd54f>, bool, std::basic_string_view<wchar_t, std::char_traits<wchar_t>> const&, Microsoft::Diagnostics::MissionControlAggregator::Utils::AppType>::_Do_call` 。截图里是另一个做同类名称比对的 lambda 实例。

守着这组新 agent 检查的 feature 名字相当直白： `CLICodingAgentUsage` ，feature ID `62580080` 。

名单也不止 AI agent。同一个组件还检查 `node.exe` 、 `python.exe` 、 `dotnet.exe` 、 `gcc.exe` 、 `clang.exe` 、 `gdb.exe` 、 `javac.exe` 、 `devenv.exe` 、 `code.exe` 等等，检查结果汇入更宽的开发工具分类。其中一些槽位还会验证发行者：node 槽位期待 Node.js Foundation，python 期待 Python Software Foundation，.NET 与 Visual Studio 期待 Microsoft Corporation。GCC、Clang 所在的编译器／调试器组在这条路径上没有额外的发行者校验。

## 这些信息从哪来

下一个问题是：这个组件会不会自己去扫描运行中的进程。顺着 `Aggregator::OnLoad` 看，它其实是订阅既有的 Windows 事件。

Windows 程序这边，它消费 `KernelProcess.AppStateChangeSummary` 和 `Win32kTraceLogging.AppInteractivitySummary` ，由 handler 解析出应用身份喂给 matcher；WSL 这边，它消费 `Microsoft.Windows.Lxss.Manager.Exec` 和 `ExecCritical` 的 `imageName` 字段。所以 Windows 侧一个普通的 `codex.exe` 会经 app-state summary 路线进入 CLI-agent 检查——并不限于跑在 WSL 里的 Linux 程序。

整条流程如下：

```ruby
Aggregator::OnLoad
├─ WSL Exec / ExecCritical
│  └─ ProcessWslExecEvent → CLI agent matchers
├─ KernelProcess.AppStateChangeSummary
│  └─ ProcessAppStateChangeSummaryEvent → CLI agent matchers
└─ Win32kTraceLogging.AppInteractivitySummary
   └─ ProcessAppInteractivitySummaryEvent → desktop agent matchers

Aggregator::OnRelativeTimerExpire
└─ MissionControlAggregatorLogging::ReportCohorts<12,4,5>
   └─ Segments.SubCohorts ETW report

Aggregator::OnUnload / intermediate timer
└─ PersistentState::SaveToDisk
```

匹配成功，就在聚合器状态里置一个 slot。之后 `ReportCohorts<12,4,5>` 把这些 slot 收成 bitset，发出一份名为 `Segments.SubCohorts` 的报告——三个数字分别对应十二个工具大类、四个 CLI agent、五个桌面 agent。

承载这份报告的是 ETW（Event Tracing for Windows）https://learn.microsoft.com/en-us/windows/win32/etw/event-tracing-portal，具体是一条自描述的 TraceLogging 事件。组件没有把可执行文件名写进每份报告，而是给每个类别分配一个位：Codex 位为 1，表示上报窗口内观察到过这个工具。

来源事件里其实还有运行时长、前台时间、交互计数和资源占用。这个组件似乎把这些细节全部丢弃，只记录一张“观察到过哪些 agent”的位图。报告的时间戳描述的是采集窗口，不是每个 agent 各用了多久。

虽然我没有在这份报告里发现提示词文本或源代码，但采集“谁在用哪些 agent 和开发工具”这件事本身，已经有相当分量的隐私影响。

## 普通机器上它真的在跑吗

字符串和代码是不错的线索，但我想看到组件真的跑起来。我看了自己的 Parallels Windows 11 ARM64 虚拟机，build `26200.9974` 。它的 MissionControlAggregator.dll 版本是 `10.0.26100.9818` ， `CLICodingAgentUsage` 已经作为 service experiment 处于启用状态——我没有手动开过这个 feature。

DiagTrack（**Connected User Experiences and Telemetry** 服务）也已经在跑，启动类型 `Automatic` 。它会拉起一个独立的 AggregatorHost.exe 进程，由后者加载这个 DLL。下面这组管理员 PowerShell 命令可以看到服务、子进程和已加载的模块：

```powershell
PS> Get-Service DiagTrack | Format-Table Name,Status,StartType -AutoSize

Name       Status StartType
----       ------ ---------
DiagTrack Running Automatic

PS> Get-Process AggregatorHost | Format-Table ProcessName,Id -AutoSize

ProcessName      Id
-----------      --
AggregatorHost 1500

PS> Get-CimInstance Win32_Service -Filter "Name='DiagTrack'" |
       Format-List Name,State,StartMode,ProcessId

Name       : DiagTrack
State      : Running
StartMode  : Auto
ProcessId  : 10148

PS> Get-CimInstance Win32_Process -Filter "Name='AggregatorHost.exe'" |
       Format-List ProcessId,ParentProcessId

ProcessId       : 1500
ParentProcessId : 10148

PS> tasklist /m MissionControlAggregator.dll

Image Name                     PID Modules
========================= ======== ============================================
AggregatorHost.exe            1500 MissionControlAggregator.dll
```

进程 ID 把几块拼图连了起来：DiagTrack 跑在 10148，它是 AggregatorHost.exe（1500）的父进程；模块列表则把 MissionControlAggregator.dll 放进了这个子进程里。

## 实际动手验证

为了实测，我把 `cmd.exe` 复制一份改名为 `codex.exe` ，在交互式 Windows 会话里运行。光这个名字，就足以让组件把它认成 Codex。

我从 KernelProcess provider（ `{2839ff94-8f12-4e1b-82e3-af7af77a450f}` ）抓到了该进程的一条 `AppStateChangeSummary` ， `LaunchCount=1` 、 `TerminateCount=0` 。聚合器保存的状态里，CLI slot 2（Codex 槽位）的值为 `2` 。另一次不带额外 ETW trace 的运行同样置了该槽位，证实检测走的是 Windows 既有的诊断采集通道。

这份状态持久化在：

```
C:\ProgramData\Microsoft\Diagnosis\AggregatorStorage\MissionControlAggregator$
```

报告通常以大约一天为周期。为了立刻抓到它，我把已保存的上报窗口起点临时改到 25 小时前，重启 DiagTrack，并挂上监听聚合器的 trace。得到的 `Segments.SubCohorts` 事件内容如下：

```yaml
Provider: Microsoft.Windows.MissionControlAggregator
Time:     2026-11-16T12:34:29.125116Z
Version:  0.1.5

CliAgentSubCohorts:     4
DesktopAgentSubCohorts: 0
FlushedFromSave:       true
```

值 `4` 就是 `1 << 2` ——Codex CLI 位。这个名字走完了输入摘要、matcher、持久化状态、上报事件的全程。

我还单独测了开发工具路径：把 `cmd.exe` 改名 `gcc.exe` ，置的是 developer-tool slot 3。在允许可选诊断数据的前提下，我在 DiagTrack 的上传队列里找到了对应的 `Segments.SubCohorts` 事件， `SubCohorts: [8]` （ `1 << 3` ）。这是 GCC、Clang 及相关工具共享的编译器／调试器类别，不是每个可执行文件单独占一个位。

## 顺着报告追到微软

ETW 事件本身并不能证明数据离开了这台机器——ETW 也大量用于本地诊断。更有信息量的问题是：谁在监听这份特定报告。

虚拟机里已经有一个 Diagtrack-Listener 会话，订阅了链路的两端。下面这些 PowerShell 查询可以看它的订阅：

```
Get-EtwTraceProvider -SessionName Diagtrack-Listener `
  -Guid '{2839ff94-8f12-4e1b-82e3-af7af77a450f}'

Get-EtwTraceProvider -SessionName Diagtrack-Listener `
  -Guid '{00de11a2-ec06-58e5-1a2b-21bb21dbee4b}'
```

第一条订阅（KernelProcess）的 `MatchAnyKeyword=0x400000000002` ，覆盖了 summary 的 `0x400000000000` keyword；第二条（Microsoft.Windows.MissionControlAggregator）的 `MatchAnyKeyword=0xe00000000000` ，覆盖了报告的 `0x800000000000` keyword。两条的 level 都是 `255` 。

订阅说明了报告的去向。要确认 Windows 是否真的把它排进了发送队列，我检查了 DiagTrack 的 EventStore.db，解压 AsimovEvents 表里的 JSON 批次。这揭示了一个重要条件：agent 使用报告被归类为 **可选诊断数据** （optional diagnostic data）。

当允许可选诊断数据时（在我测试的美区安装里默认开启），Windows 会把编码代理使用报告排入上传微软的队列。我在 DiagTrack 上传队列里找到了 agent 事件本身，验证了这一点：

```json
{
  "name": "Microsoft.Windows.MissionControlAggregator.Segments.SubCohorts",
  "ext": {
    "privacy": { "isRequired": false }
  },
  "data": {
    "Version": "0.1.5",
    "CliAgentSubCohorts": [4],
    "DesktopAgentSubCohorts": [0],
    "FlushedFromSave": true
  }
}
```

我用最新官方 ISO 做了一次 Windows 11 Home ARM64 全新安装，区域设为美国，验证默认值。改任何隐私设置之前，“Diagnostic data”开关就已是启用状态、标注着 Include Optional；以默认值走完安装后， `AllowTelemetry` 为 `3` ——可选诊断数据开启。

![美区全新安装的默认诊断设置](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/525adcaaf7723f5c.jpg)

也就是说，至少在我测试的美区安装里，可选诊断数据默认开启。如果你没有在安装时拒绝、也没在之后关掉它，它现在仍然开着，你的编码代理使用数据正在上传。你可以在安装时拒绝可选诊断，或稍后在“设置 → 隐私和安全性 → 诊断和反馈”里关闭“发送可选诊断数据”。微软的《诊断、反馈与隐私》指南https://support.microsoft.com/en-us/windows/privacy/diagnostics-feedback-and-privacy-in-windows说明了修改方法。

## 译者补充：几点解读与延伸

**一、攻守易位的样本。** 本仓库译过的大量检测基础设施文章里，ETW 的角色要么是防守方的传感器（《深入解析 Windows 遥测》），要么是攻击者要限速、要致盲的对象（EDRChoker、Fairy Law）。这篇补上第三个视角：微软自己坐在 producer 的位置上，用同一条 TraceLogging 管道统计开发者的工具使用。检测基础设施本身不挑立场，谁接上就为谁工作——把它与前两类文章放在一起，正好凑成攻、守、平台三方共用一套管线的对照。

**二、复用既有事件，不加新传感器。** MissionControlAggregator 的取数方式值得蓝队留意：它不自建进程扫描，而是订阅 KernelProcess、Win32kTraceLogging、Lxss.Manager 这些既有 provider 的摘要事件。《etw-rs》那篇讲的是把既有遥测的消费端做快，这篇是系统组件在 producer 侧直接复用既有事件——两端都在“不加新传感器”的前提下做文章。反过来做检测盘点时也要意识到：系统里“谁订阅了什么”本身就是一张值得审计的清单（原文那两条 Get-EtwTraceProvider 查询就是现成的起点）。

**三、只认名字，就挡不住改名。** 检测逻辑是文件名比对（部分槽位加发行者校验），于是 cmd.exe 改名 codex.exe 就能上报“用了 Codex”，真用代理却换个名字就能不上报。对红队读者，这是“画脚印”的新维度——投递物与工具的进程名会直接落进微软的遥测位图，OPSEC 清单里多了一行；对企业读者，这份位图是“谁在用 AI 编码工具”的现成证据源，DLP 与审计可以直接接。

**四、五分钟自测。** 复制一份 cmd.exe 改名 codex.exe 跑一下，再看 `C:\ProgramData\Microsoft\Diagnosis\AggregatorStorage\MissionControlAggregator$` 下是否出现状态文件——出现即命中。想确认上报，用原文的思路把窗口起点回拨 25 小时再重启 DiagTrack，挂 trace 抓 `Segments.SubCohorts` 即可。注意这份数据归为可选诊断（ `isRequired: false` ），关掉“发送可选诊断数据”即退出上传。

## 参考

-   原文：Windows 11 Is Collecting Data on Which Coding Agents and Developer Tools You Use：https://xusheng.dev/posts/windows-coding-agent-telemetry/
    
-   作者的 X 初步发现帖：https://x.com/CrackmesOne/status/2122147747390468384
    
-   ETW 官方文档：https://learn.microsoft.com/en-us/windows/win32/etw/event-tracing-portal
    
-   微软《诊断、反馈与隐私》指南：https://support.microsoft.com/en-us/windows/privacy/diagnostics-feedback-and-privacy-in-windows
    

前沿资讯 · 目录
