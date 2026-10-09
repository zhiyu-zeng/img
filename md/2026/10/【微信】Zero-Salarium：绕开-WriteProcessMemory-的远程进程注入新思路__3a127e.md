---
title: 【微信】Zero Salarium：绕开 WriteProcessMemory 的远程进程注入新思路
source: https://mp.weixin.qq.com/s/WhBZzm-MyI3yTMCMEZK5NA
source_host: mp.weixin.qq.com
clip_date: 2026-10-09T09:56:45+08:00
trace_id: 7520f0fd-fc17-46ed-a494-cc7f18d6c583
content_hash: 717940d37d75abf09d61fb6734893ba63ba14c5a02736dfb6d61d545fcb71cf1
status: synced
tags:
  - 微信
  - Android逆向
  - 恶意样本
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 绕开 VirtualAllocEx/WriteProcessMemory 的 EDR 监控，改用控制台命名管道（hStdInput）把 payload 写进目标进程内存，再改内存权限并劫持线程执行。
ai_summary_style: key-points
images_status:
  total: 7
  succeeded: 7
  failed_urls: []
notion_page_id: 3f475244-d011-81ec-a442-c3169b1d30aa
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 绕开 VirtualAllocEx/WriteProcessMemory 的 EDR 监控，改用控制台命名管道（hStdInput）把 payload 写进目标进程内存，再改内存权限并劫持线程执行。
> 
> - **核心原理：** 交互式控制台程序的命令行内容保存在自身内存中，向子进程 hStdInput（命名管道）调 WriteFile 可写入任意二进制数据，包括控制台无法显示的字节。
> - **注入六步：** 选控制台目标（netsh.exe、nslookup.exe）→ CreateProcess 取 hStdInput 句柄 → WriteFile 写 payload → 内存中按 marker 定位 → VirtualProtectEx 加执行权限 → 劫持线程 RIP 指向 marker_addr + sizeof(marker)。
> - **坏字符限制：** payload 须避开 0x0D（CR）、0x0A（LF）、0x1A（SUB/EOF），否则会被当作命令执行而报错、payload 不留在内存。
> - **相比旧方案优势：** 无需挂起进程创建（避免时序类检测），无需构造异常的 lpCommandLine/lpEnvironment 格式，坏字符约束更少。
> - **防御落点：** 监控对远程进程的 VirtualProtectEx 可执行属性修改、父进程向子进程 hStdInput 写异常长度数据、控制台命令行内存区出现大段不可显示二进制内容；VirtualProtectEx 与线程劫持仍未被绕过，非"完全隐身"。

**幻泉之洲** *2026年10月9日 09:18*

> 红队打点、渗透测试收尾，几乎都绕不开远程进程注入，而 EDR 盯得最紧的恰恰是 VirtualAllocEx 和 WriteProcessMemory 这一对组合。这篇文章给出另一条路：不碰这两个 API，改用 Windows 控制台的命名管道，把 payload 直接写进目标进程的内存里，再想办法让它跑起来。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/cd147ff9c880d8f3.png)

## 先说背景

做红队或者渗透测试，只要是打 Windows 目标，最后十有八九得做远程进程注入来投递 payload。这个动作太常见了，所以 EDR 厂商在这块下了死功夫——OpenProcess、VirtualAllocEx、WriteProcessMemory、CreateRemoteThread，这几个 API 的用户态钩子和内核回调基本是标配监控。

这篇文章要介绍的是另一种注入方式：不调用 WriteProcessMemory，也不用 VirtualAllocEx。

写这东西的过程中，作者翻 EDR 授权的时间比写代码还多，后来发现 SensePost 的 Max Hirschberger 和 Ogulcan Ugur 已经独立想到过类似的点子并且发了文章（https://sensepost.com/blog/2026/process-parameter-poisoning/），顺藤摸瓜又看到 modexp（https://modexp.wordpress.com）做过相关的探索。坦白说，那几位做得比作者更完整。

但作者对已有的方案不太满意。卡点有两个：一是注入时需要把进程暂停在初始化阶段，二是 lpCommandLine 和 lpEnvironment 得凑成某种非正常格式。这两个约束在实际操作里都很别扭——挂起进程容易触发时序类的检测，参数格式怪异则意味着 payload 得反复裁剪。于是他把这些思路搁在一边，另找了一条路。

## 一、远程进程注入的常规套路

进程注入的本质，是让一个合法的、受信任的 Windows 进程替攻击者跑代码。它既是规避手段，也是持久化手段。

经典的远程线程注入或者 PE 注入，流程大致是这样：注入器先通过 OpenProcess 拿到目标进程（比如 explorer.exe 或 svchost.exe）的句柄，然后调用 VirtualAllocEx 在对方的虚拟地址空间里划一块缓冲区。

内存准备好之后，用 WriteProcessMemory 把 payload 拷过去。

最后用 CreateRemoteThread 或者别的办法创建线程，把这个线程的 RIP 指到刚才写入的那块内存上。

这套跨进程操作天然绕过了传统的边界防护，还能继承宿主进程的权限身份，所以 EDR 对 WriteProcessMemory 的审查格外细——用户态钩子加内核回调双管齐下。在 EDR 的遥测里，跨进程内存修改属于高危事件，现代攻击者因此不断寻找能够绕过内存操作特征的新路子。

绝大多数远程注入技术，抽象出来都是同一个公式：

\[OpenProcess/CreateProcess\] + \[VirtualAllocEx\] + \[WriteProcessMemory\] + \[某种把线程 RIP 重定向到新写入 shellcode 的方法\]

公式里的后两项是重灾区。只要你能拆掉其中任意一环，检测面就小一大截。

## 二、用命名管道往别的进程里写数据

### 命令行内容到底存在哪

打开一个交互式控制台程序，它必定带一个叫 conhost.exe 的子进程。你在里面敲命令，那些命令的内容存在哪？

答案就在程序自己的内存里。

验证起来不难。写个小程序，用 CreateProcess 拉起子进程，然后往子进程的 hStdInput 里写数据。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/547e5af0ae569a44.png)

拿 nslookup.exe 这个控制台程序做例子：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8d041a4ccf718d5f.png)

对子进程的 hStdInput 调用 WriteFile，写进去的数据就落在了子进程的内存中。

顺着这个现象往下想：既然 hStdInput 是个命名管道，那能不能用它替代 WriteProcessMemory，把 payload 直接送进目标进程？

问题来了。Windows 控制台界面只显示可读字符的有限集合，但往命名管道写本质就是调 WriteFile——理论上，控制台显示不出来的字节也应该能写进 hStdInput。到底行不行，试了才知道。作者构造了这么一个二进制数组，里面包含控制台无法显示的字节：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/be6c91e56f74d674.png)

写进命名管道之后：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b997697ee2781717.png)

结果证明，往控制台进程的内存里写任意数据是完全可行的。这一步是整个技术的基石——它把"跨进程写内存"这件事，从 WriteProcessMemory 换成了一个看起来再普通不过的文件写操作。

### 完整的注入链路

基于上面的结论，不用 VirtualAllocEx 和 WriteProcessMemory 完成远程注入，要走的步骤大致是这些：

1.  挑一个交互式控制台程序。作者找到两个可用目标：netsh.exe 和 nslookup.exe。
    
2.  调用 CreateProcess，拿到子进程 hStdInput 的句柄。
    
3.  对 hStdInput 调 WriteFile，把 payload 写进子进程。
    
4.  在子进程内存里定位刚写进去的 payload。
    
5.  用 VirtualProtectEx 给这块内存加上执行权限。
    
6.  劫持一个线程，把它的 RIP 指过去。
    

这里有几个坑必须提。

往 hStdInput 写数据时，payload 里不能出现 Windows 控制台里有特殊含义的字符，一共三个：

-   `0x0D`
    
    ：回车（CR），ASCII 和 Unicode 里的控制字符。
    
-   `0x0A`
    
    ：换行（LF），同样是控制字符。
    
-   `0x1A`
    
    ：SUB（替换符），按 Ctrl+Z 产生，历史上被当作文件结束（EOF）标记。
    

payload 里混进这几个字节，子进程会把它当成一条命令去执行，结果是"命令未找到"之类的报错，而 payload 本身也就不会继续留在内存里了。所以生成 shellcode 的时候必须做字符集过滤。

定位 payload 靠的是标记（marker）。在 payload 开头塞一串特征明显的字符，在内存里搜这串字符就能找到 payload 的落点。重定向 RIP 时需要加上 marker 的长度：

RIP = marker_addr + sizeof(marker)

作者写了个 PoC 把上面六步串起来，完成远程注入并执行 shellcode：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/59675a7d38fccda4.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/fd92f488c0925e84.png)

关于对抗 EDR 的实际效果，之前的研究者已经拿多个 EDR 产品做过测试，这里就不重复贴自己的结果了。

演示视频：https://youtu.be/DCUnbj_usPM

### 把它和传统注入放在一起看

| 维度  | 经典远程线程注入 | 控制台命名管道注入 |
| --- | --- | --- |
| 内存分配 | VirtualAllocEx | 由控制台程序自身的输入缓冲区承担 |
| 数据写入 | WriteProcessMemory | WriteFile 写 hStdInput |
| 进程启动方式 | 常在挂起状态下创建 | 正常创建，无需暂停初始化 |
| 命令行/环境块 | 无特殊要求 | 无需构造异常格式 |
| 坏字符限制 | 相对宽松 | 需避开 0x0D、0x0A、0x1A |
| 仍需调用的敏感 API | WriteProcessMemory 等 | VirtualProtectEx、线程劫持 |

看得出来，它不是"完全隐身"，而是把检测面从最显眼的那两个 API 上挪开了。VirtualProtectEx 和线程劫持依然要做，这也是防御方新的落脚点。

## 三、防御怎么做

这套手法彻底不用 VirtualAllocEx 和 WriteProcessMemory，所以监控重心得换地方。两个方向：

-   关注 VirtualProtectEx 对远程进程的调用，尤其是把内存改成可执行属性的行为。
    
-   关注命名管道的读写操作，特别是父进程向子进程 hStdInput 写入异常长度的数据。
    

更进一步，控制台程序存放命令行的那块内存区域本身值得单独盯。正常情况下那里躺的是人类可读的短字符串，如果出现大段不可显示的二进制内容，基本可以判定有问题。

## 最后说几句

红队和渗透测试里用的远程注入，绝大多数都依赖 VirtualAllocEx 加 WriteProcessMemory 这对搭档，EDR 因此把它们围得密不透风。

控制台命名管道注入换了条路：靠命名管道的读写，加上控制台程序"把交互命令存在内存里"这个特性，把 payload 送进去。相比已有的类似方案，它有两个实打实的好处——

-   不需要用 CreateProcess 把进程以挂起状态拉起来。
    
-   不需要让子进程的 lpCommandLine 或 lpEnvironment 变成奇怪的格式。
    

payload 或 shellcode 的字符限制也小得多，需要避开的坏字符更少。

副作用是，传统的监控手段没法可靠地发现和拦截它。防御方的注意力要转向控制台程序存放命令的内存区域、VirtualProtectEx 的调用，以及命名管道的读写行为。
