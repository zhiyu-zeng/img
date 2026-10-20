---
title: 【微信】不用 WriteProcessMemory 也能写内存：用 SendMessage 加 cdb.exe 绕过高版本 EDR 的注入思路
source: https://mp.weixin.qq.com/s/-Q8QN1kVbIw6zLwDUkA8AQ
source_host: mp.weixin.qq.com
clip_date: 2026-10-20T12:41:48+08:00
trace_id: 84b148ee-1939-48ee-a2fe-e4afa8c7283c
content_hash: 9f249ed0f219060db5498b6cb979a2487350cb6bbdccfb47646017e0f2eb28d1
status: synced
tags:
  - 微信
  - 风控对抗
  - 反调试
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 进程注入可改用 SendMessage+WM_SETTEXT 将 payload 写入目标控件缓冲区，再由微软签名的 cdb.exe 修改线程 RIP，从而绕开对 WriteProcessMemory/SetThreadContext 的监控。
ai_summary_style: key-points
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 3ff75244-d011-81af-af6c-cbc58dcc59f5
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 进程注入可改用 SendMessage+WM_SETTEXT 将 payload 写入目标控件缓冲区，再由微软签名的 cdb.exe 修改线程 RIP，从而绕开对 WriteProcessMemory/SetThreadContext 的监控。
> 
> - **传统链路：** EDR 在 OpenProcess、VirtualAllocEx/VirtualProtectEx、WriteProcessMemory、线程上下文劫持四个节点布点；该方案只替换“写远程内存”一环。
> - **写入与定位：** 枚举带 Edit 控件的 GUI 进程（或自行拉起 Notepad/Regedit），用 SendMessageW+WM_SETTEXT 让 user32 完成跨进程拷贝，再用 ReadProcessMemory 按 payload 特征字节扫描定位地址。
> - **改 RIP 的命令：** `cdb.exe -p <PID> -c "~~[<TID>]s; r rip=0x<ADDRESS>; qd"`，其中 TID 为不带 0x 的十六进制，RIP 地址必须带 0x，qd 表示退出并分离、目标继续运行。
> - **主要限制：** payload 不能含连续 0x00（文本通道会截断）；目标须有 GUI 控件；全量内存扫描本身留下可疑特征；依赖目标机存在 cdb.exe 且常需放在默认安装路径以规避非默认路径告警。
> - **防守重点：** 作者建议监控 SendMessage+WM_SETTEXT 组合与 cdb.exe 执行路径；文章补充更本质的信号是内存页由 RW 变为 RX/RWX 的瞬时行为。

**幻泉之洲** *2026年10月20日 12:14*

> 进程注入绕 EDR，常规做法是替换掉 WriteProcessMemory、SetThreadContext 这些被重点监控的 API，或者用间接系统调用、调用栈伪装硬扛。Zero Salarium 作者 Two Seven One Three 换了个角度：用 SendMessage + WM_SETTEXT 把 payload 送进目标进程的控件缓冲区，再让微软签名的调试器 cdb.exe 替自己设置 RIP。两个动作都发生在"合法程序正常行为"的范畴里，测试中成功躲过了高端 EDR。这篇文章拆解它的实现细节、真实局限，以及防守方该盯哪里。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/3509e146557d6899.png)

## 注入的四个环节，EDR 全都盯着

红队做进程注入，绕不开一条固定的 API 链路：OpenProcess 拿到目标进程句柄，VirtualAllocEx / VirtualProtectEx 划出可写可执行内存，WriteProcessMemory 把 payload 拷贝进去，最后让目标进程的某个线程跳过去执行。EDR 的产品逻辑基本就是在这四步上布点，任何一步露出异常行为模式，告警就来了。

所以攻击方的所有花招，本质都是在做减法：能不能少调一个 API？能不能换个没人监控的等价实现？能不能把动作拆散到看起来无关的进程里？

这篇文章的思路属于第二类。它没打算把整条链路藏起来，只替换了其中一个环节——把 payload 写进远程内存这一步，从 WriteProcessMemory 换成了窗口消息。

## WM_SETTEXT：一个被忽视的内存写入通道

SendMessageW 是 Win32 里再普通不过的 API。配合 WM_SETTEXT 消息，目标窗口会调用自己的窗口过程，更新标题栏、按钮文字或者编辑框内容。假设你往一个记事本的 Edit 控件里塞字符串，系统会把这段文本复制到目标进程的堆上，由控件自己持有。

关键在于，这个复制动作是内核和 user32 帮你做的跨进程内存写入，全程不经过 WriteProcessMemory。payload 就这样落在目标进程的内存里了，附赠一个副作用：EDR 对 SendMessage 的关注度远低于 WriteProcessMemory。

完整流程拆成四步：

1.  枚举带合适 GUI 控件的进程，本文选 Edit 控件。找不到就自己起一个——Windows 10 上的 Notepad.exe，或者 Windows 11 上的 Regedit.exe 都行。
    
2.  拿到控件句柄。
    
3.  调用 SendMessageW，用 WM_SETTEXT 把 payload 发过去。
    
4.  用 ReadProcessMemory 在目标进程内存里扫描，定位 payload 落地的地址。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/50ba12e627ca0e2e.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a6b354bde82fa0c1.jpg)
    

第 4 步是这个技术能成立的前提。控件缓冲区的位置不固定，只能扫。作者的做法是拿 payload 的特征字节在目标进程的可读内存里比对，命中即锁定。听起来粗糙，但实际够用——毕竟 payload 是你自己构造的，特征要多少有多少。

## PhantomBuffer：两个小工具组成的 PoC

作者把 PoC 拆成两个可执行文件，分工清晰。

### FindTargetWindows

负责找目标。扫一遍当前系统的 GUI 进程，看谁身上挂着能承接 WM_SETTEXT 的 Edit 控件；一个都没有，就按参数自己拉起一个进程。这种"找不到就自己造"的设计在实战里挺实用，因为干净的服务器上未必跑着记事本。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/369bbe86fe72b95e.jpg)

### PhantomBuffer

主工具，干四件事：从文件读 Base64 编码的 payload 并解码；用 SendMessage + WM_SETTEXT 发出去；在目标内存里定位 payload，把所在区域改成可执行；把目标进程的某个线程重定向到 payload 首地址。

第一步到第三步都顺，第四步才是真正难啃的地方，下面单独说。

先说一个实现层面的坑。测试中发现，payload 里只要出现两个连续的 0x00 字节，写入就不正确。 `0x00` 是 WM_SETTEXT 的坏字符——这不奇怪，文本消息底层按字符串处理，遇到空字符就截断。绕过的办法是在编码阶段就把 0x00 挑出来单独处理，或者改用别的消息，但这会引入新的复杂度。这也是这类"借文本通道传二进制"手法的通病：通道设计初衷不是干这个的，边界条件必然一堆。

## 真正的难题：不改线程上下文，怎么改 RIP

把代码放进目标进程只是上半场。让它跑起来，传统做法是 SetThreadContext 或 NtSetContextThread 劫持一个远程线程，改掉它的 RIP 寄存器。这两个 API 在 EDR 的监控列表里排得很靠前，从间接系统调用到调用栈伪装，攻防双方在这里拉锯了快十年。作者没有继续在这个战场上纠缠，他问了一个很刁钻的问题：微软当初造这对 API，到底给谁用的？

答案里有个绕不开的群体——调试器。杀毒软件、EDR、调试工具都得靠它来控制被调试进程的执行流。既然是给合法工具用的，那就让合法工具来干。

于是他选了 cdb.exe，Windows Debugger Tools 里附带的命令行调试器。一行命令解决全部问题：

cdb.exe -p <PID> -c "~~\[<TID>\]s; r rip=0x<ADDRESS>; qd"

参数逐个拆开看：

-   `-p <PID>`
    
    ：按十进制进程 ID 附加到目标进程。
    
-   `-c "..."`
    
    ：附加后立即执行引号里的命令串。
    
-   `~~[<TID>]s`
    
    ：选中系统线程 ID 为指定值的线程，TID 用十六进制且不带 0x 前缀，比如 `~~[1a4]s` 。
    
-   `r rip=0x<ADDRESS>`
    
    ：把 RIP 设成 payload 的地址，十六进制必须带 0x。
    
-   `qd`
    
    ：退出并分离，调试会话结束但目标进程继续跑。
    

整条命令执行完，线程上下文被改了，payload 开始执行，而改动动作发生在 cdb.exe 这个微软签名的调试器进程里。EDR 面对的是一个正常的调试会话，监控 SetThreadContext 的那套规则在这里形同虚设——调试器不用这对 API，它用调试端口和内核调试机制。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d4a0d5d4502821ce.jpg)

作者说这套组合拳对着高端 EDR 打过去，全程没触发任何告警。我信这个结果，因为它绕开的是检测模型的假设前提，而不是在检测模型内部找缝隙。

## 便携化，以及一个藏不住的破绽

cdb.exe 可以只带随附的 DLL 做便携化运行，不用装整套 SDK。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/02adcfabed1f47fa.jpg)

但作者自己也点出一个弱点：部分 EDR 会对非默认路径下执行的 cdb.exe 报警。默认路径是 `C:\Program Files (x86)\Windows Kits\10\Debuggers\x64\cdb.exe` 。所以最稳的用法是把 cdb.exe 放到这个路径下，让路径本身成为伪装的一部分。

这里能看出这个技术的性格：它不是那种靠底层奇技淫巧硬穿检测的方案，而是靠"行为合法性"混过去。优点是稳，缺点是依赖环境——目标机器上有没有调试工具？能不能往 Program Files 里写文件？权限够不够？这些前置条件在实际交战里经常不成立。

## 这套手法能走多远

先说它成立的三个支点。

第一，WM_SETTEXT 的跨进程内存拷贝是 user32 的固有行为，不是漏洞，微软没理由堵。第二，调试器修 RIP 是产品功能，不是攻击面。第三，这两个动作单独看都不敏感，组合起来才构成注入，而 EDR 的检测粒度通常落在单个 API 调用上。

再说它绕不过去的东西。

-   **payload 不能含 0x00**
    
    。这个限制直接排除了一大类 shellcode，加密器、加载器都得重写。
    
-   **目标必须有 GUI 控件**
    
    。无窗口的服务进程用不了这招，得先起一个带窗口的宿主，反而多出一步可疑动作。
    
-   **内存扫描会留痕**
    
    。ReadProcessMemory 扫全量内存的行为特征其实不弱，只是很多产品没把它当高危信号。
    
-   **依赖 cdb.exe 的存在**
    
    。生产服务器上装 Windows SDK 的场景少之又少，把调试器带上去本身就是个显眼的动作。
    

换句话说，这是一个针对"高价值、有人值守、装了开发工具"的终端特别有效的技术，放到大规模自动化投放里就不太灵。定位很清晰：定向渗透、红队演练、需要极低噪音的场景。

## 防守方该盯哪里

作者给了两条建议，我觉得第二条比第一条更实用。

监控 SendMessage + WM_SETTEXT 的组合调用，理论上没错，实践上有难度。哪个正常桌面程序不往 Edit 控件里塞文字？如果只按 API 名匹配，误报能把分析师淹了。真正可用的规则得加维度：跨进程调用、缓冲区大小异常（比如几 KB 的可执行特征数据）、调用方是没有 GUI 交互的后台进程、目标控件所属进程与调用方没有预期的父子关系。这些条件叠起来，噪音就下来了。

监控非默认路径执行的 cdb.exe，这条落地成本低很多。可以再往前推一步：任何调试器进程附加到非调试关系的目标上，都应该是个信号。调试器在服务器上的合法用途本来就窄，白名单容易维护。

还有一条作者没提但值得补上：内存区域从只读/可写被改成可执行（RW → RX 或 RWX）的瞬时行为。这个技术无论怎么绕，最后总要把 payload 所在页设成可执行，这一步没有替代方案。盯着这块，比盯着注入入口更接近本质。

## 攻防的账要这么算

这类研究真正的价值，不在于又多了一个能过 EDR 的工具，而在于它指出检测模型的一个结构性盲区：我们习惯按"恶意 API"建规则，但攻击者可以选择用"合法 API 的合法行为"完成任务。当每一个单独动作都无害时，基于单点行为的检测就失效了，只能退到行为链和上下文关联上。而上下文关联的误报率和工程成本，比单点规则高一个数量级。

PhantomBuffer 的代码已经开源，地址是 github.com/TwoSevenOneT/PhantomBuffer，演示视频在 youtu.be/2UmMFXyZ2OU。想复现的话，一台装了 Windows Debugger Tools 的测试机就够。

防守方不必因为它上了新闻就急着加规则。更该做的是回头检查自己的检测体系：有多少规则建立在"攻击者一定会调用某个敏感 API"的假设上？这些假设今天还成立吗？

* * *

作者：Two Seven One Three \[1\]

原文：Zero Salarium \[2\]

* * *

### 参考资料

\[1\] https://x.com/TwoSevenOneT

\[2\] https://www.zerosalarium.com

\[3\] https://www.zerosalarium.com/2026/10/PhantomBuffer-Effective-EDR-Evasion-Stealth-Injection.html
