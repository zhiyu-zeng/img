---
title: 【微信】EDR 对抗：不使用 WriteProcessMemory 的进程注入
source: https://mp.weixin.qq.com/s/JJORL1W1naDWlZ7voT1Zng
source_host: mp.weixin.qq.com
clip_date: 2026-09-29T12:19:08+08:00
trace_id: ac09ce6a-8f0f-46ea-a9d7-7989d59a0e1d
content_hash: 3babcaaf19b4816e6c1156432d1f4ad8caaa0295a51a53c931bdc25a8ca938e2
status: synced
tags:
  - 微信
  - Windows逆向
  - 风控对抗
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 利用控制台命名管道（hStdInput）向子进程写入载荷并劫持线程执行，全程不调用 `WriteProcessMemory` 与 `VirtualAllocEx`，从而绕过 EDR 对跨进程内存写入的监控。
ai_summary_style: key-points
images_status:
  total: 7
  succeeded: 7
  failed_urls: []
notion_page_id: 3ea75244-d011-81e0-97fe-fa115a40e34c
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 利用控制台命名管道（hStdInput）向子进程写入载荷并劫持线程执行，全程不调用 `WriteProcessMemory` 与 `VirtualAllocEx`，从而绕过 EDR 对跨进程内存写入的监控。
> 
> - **原理基础：** 交互式控制台程序（如 `nslookup.exe`、`netsh.exe`）会将其接收的交互命令保存在自身进程内存中；对子进程的 `hStdInput` 调用 `WriteFile`，所写数据即落入子进程内存，因此可借命名管道代替 `WriteProcessMemory` 投递任意字节。
> - **六步注入流程：** 选一个交互式控制台程序 → `CreateProcess` 取子进程 `hStdInput` 句柄 → `WriteFile` 写入载荷 → 靠载荷开头的独特标记（marker）在内存中定位 → `VirtualProtectEx` 给该区域加执行权限 → 劫持线程线程并把 RIP 设为 `marker_addr + sizeof(marker)`。
> - **坏字符约束：** 载荷须避开 `0x0D`（CR）、`0x0A`（LF）、`0x1A`（SUB/Ctrl+Z），否则会被子进程当作命令解释执行而不再留存于内存。
> - **规避优势：** 无需以挂起状态创建进程，不会造成 `lpCommandLine`、`lpEnvironment` 格式异常，坏字符限制也更少；传统基于 `VirtualAllocEx`/`WriteProcessMemory` 特征的检测无效。
> - **防御转向：** 应监控对远程进程调用 `VirtualProtectEx`、命名管道的读写行为，以及控制台程序存放命令的内存区域。

**securitainment** *2026年9月29日 12:06*

![不使用 WriteProcessMemory 的进程注入示意图](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/866a956216ed76c4.jpg)

## 一、引子

在对目标开展红队行动或渗透测试的过程中，你极有可能需要使用远程进程注入来执行你的载荷。由于这项技术被如此频繁地使用，端点检测与响应（EDR）系统对相关 API 的监控非常严密。

本文将介绍一种 **远程向进程注入代码的新方法**——它 **不依赖** 众所周知的 `WriteProcessMemory` 与 `VirtualAllocEx` 这两个 API。

在我跟一堆 EDR 许可证较劲的时候，我发现两位非常有实力的研究者——来自 SensePost 的 Max Hirschberger 与 Ogulcan Ugur —— **独立想出了类似的思路** 并就此发表了文章。他们的工作还引导我找到了 modexp 对一种密切相关方法的研究。事实上，这些研究者做得比我好得多。

不过，我并不完全满意于「在初始化时必须暂停进程」这一点，也不满意 `lpCommandLine` 与 `lpEnvironment` 所需的那些怪异格式。因此我把那些方法搁置一旁，转向一种新的注入技术，也就是下面要介绍的内容。

想获取我一直在研究的渗透测试与红队最新技巧，可以在 X 上找到我：Two Seven One Three（@TwoSevenOneT）。

## 二、正文

### 1\. 远程进程注入技术概览

进程注入是一项关键的规避与持久化技术：攻击者迫使一个合法的、受信任的 Windows 进程 **代其执行任意代码**。

在经典的远程线程注入或 PE 注入流程中，注入方进程必须首先通过 `OpenProcess` 获取目标应用（例如 `explorer.exe` 或 `svchost.exe` ）的句柄，并用 `VirtualAllocEx` 在其虚拟地址空间中分配一块专用缓冲区。

内存准备好之后，攻击者调用 `WriteProcessMemory` API 把恶意载荷复制进远程进程的内存空间。

随后，攻击者使用 `CreateRemoteThread` 或其他方法创建一个线程，使其 **RIP 指向刚写入的、包含 shellcode 的内存区域**。

由于这种跨进程转换天然地绕过了常规的边界防御，并且 **继承了宿主进程的访问权限**，端点检测与响应（EDR）方案会通过 **用户态挂钩（userland hooks）与内核回调** 对 `WriteProcessMemory` 进行严密监控与审查。

EDR 平台把跨进程内存修改视为 **高危遥测事件**，这促使现代威胁行为体不断寻找能够绕过传统内存操作特征的规避替代方案。

大多数远程注入技术背后的通用公式是：

```
[OpenProcess/CreateProcess] + [VirtualAllocEx] + [WriteProcessMemory] + [某种创建线程、把 RIP 重定向到新写入 shellcode 的方法]
```

### 2\. 使用 Windows 命名管道向远程进程写入任意载荷

当你打开一个交互式控制台程序、它带着一个名为 `conhost.exe` 的子进程，你输入命令与它交互时—— **这些命令的内容存储在哪里？**

答案是： **存储在程序内存的某个地方**。

为演示这一点，我会写一个小程序，用 `CreateProcess` 创建一个子进程，并向该子进程的 `hStdInput` 写入数据。

![创建进程并向其控制台写入数据的代码](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a97796b01d8b5488.png)

我以控制台程序 `nslookup.exe` 为例：

![命名管道 std\_in 数据位于子进程内存中](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/548cb5503efe6090.png)

当我向子进程的 `hStdInput` 调用 `WriteFile` 时，被写入的数据会 **存储在子进程的内存中**。

于是思路就来了： **利用 `hStdInput` 命名管道把载荷写入另一个进程，而不是对子进程调用 `WriteProcessMemory` 。**

不过问题出现了：Windows 控制台界面 **只能显示有限的一组可读字符**，而写入命名管道本质上就是一次 `WriteFile` 调用。理论上这意味着，我们应该能够向 `hStdInput` 写入 **控制台无法显示** 的字节。我们来实际验证一下。我有如下的二进制数组：

![不使用 WriteProcessMemory 向子进程写入的原始载荷](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7859ec2232a848d6.png) ![原始载荷可以不使用 WriteProcessMemory 写入子进程](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c37f326a04488b9d.png)

这证实了： **我们几乎可以把任意数据写入一个控制台进程的内存。**

### 3\. 经由控制台命名管道的远程进程注入

基于上述信息，要在 **不使用** `VirtualAllocEx` 与 `WriteProcessMemory` 的情况下把载荷注入远程进程，需要以下主要步骤：

-   选择一个交互式控制台程序。我找到了两个： `netsh.exe` 与 `nslookup.exe` 。
    
-   调用 `CreateProcess` ，获取子进程 `hStdInput` 的句柄。
    
-   对该 `hStdInput` 调用 `WriteFile` ，把载荷写入子进程。
    
-   在子进程的内存中 **定位** 刚写入的载荷。
    
-   使用 `VirtualProtectEx` 为刚识别出的内存区域 **添加执行权限**。
    
-   **劫持一个线程**
    
    ，把它的 RIP 重定向到该地址。
    

使用 `WriteFile` 向 `hStdInput` 写入时，载荷 **必须避开** 在 Windows 控制台中具有特殊含义的某些坏字符：

-   `0x0D`
    
    ：回车符（CR），ASCII 与 Unicode 中的控制字符。
    
-   `0x0A`
    
    ：换行符（LF），控制字符。
    
-   `0x1A`
    
    ：SUB（替换字符），由按下 Ctrl+Z 产生，历史上被用作文件结束（EOF）标记。
    

在生成载荷时，我们必须避开这些字符。否则，子进程会把载荷 **当作一条命令来解释并以普通命令执行**。结果就是「命令未找到」之类的提示，而原始载荷 **将不再留在进程内存中**。

为了在子进程内存中定位刚写入的载荷，我会在载荷开头放置一串独特的字符，我称之为 **标记（marker）**。通过搜索这个标记，我们就能识别出载荷的位置。重定向 RIP 时，我们需要在 RIP 将要指向的地址上 **加上标记的长度**：

```
RIP = marker_addr + sizeof(marker)
```

我写了一个概念验证程序，执行上述六个步骤来远程注入并执行 shellcode，如下所示：

![InjectSetConsole 运行成功](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e611ade8db413bd5.png) ![InjectSetConsole 运行成功的进程树](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1c95e84340a77570.png)

此前的研究者已针对多款 EDR 测试过这项技术，因此这里我不再附上自己的测试结果。

演示视频：https://youtu.be/DCUnbj_usPM

### 4\. 防御

由于这种控制台命名管道注入技术 **完全消除了** 对 `VirtualAllocEx` 与 `WriteProcessMemory` API 的使用，监控重点应转向： **对远程进程调用 `VirtualProtectEx` 的行为**，以及 **对命名管道的读写操作**。

## 三、结语

红队行动或渗透测试中使用的大多数远程注入技术都依赖 `VirtualAllocEx` 与 `WriteProcessMemory` 这一对 API，因此 EDR 对它们监控得非常严密。

与传统方法不同，控制台命名管道注入 **不使用** `VirtualAllocEx` 与 `WriteProcessMemory` 。相反，它利用了 **经由命名管道的读写操作**，以及 **控制台程序把交互式命令存储在内存中** 这一特性。此外，该技术还具备若干其他优势：

-   它 **不要求** 用 `CreateProcess` 以 **挂起状态** 启动进程。
    
-   它 **不会** 导致子进程的 `lpCommandLine` 或 `lpEnvironment` 出现 **异常格式**。
    

载荷或 shellcode 所使用的字符受到的 **限制相对较少**，也就是说需要避开的坏字符更少。

因此，传统的监控方法 **无法可靠地检测和阻止** 这项技术。防御方应转而关注 **控制台程序存储其命令的内存区域**、监控 `VirtualProtectEx` 的使用，并跟踪 **命名管道上的读写操作**。

MalDev · 目录
