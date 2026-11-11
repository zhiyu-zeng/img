---
title: 【看雪】Safengine2.x Patch机器码
source: https://bbs.kanxue.com/thread-293496.htm
source_host: bbs.kanxue.com
clip_date: 2026-11-11T08:30:40+08:00
trace_id: c653bbde-95a4-4e83-bba2-c31dd46e7ac5
content_hash: f32c7132938f00d9942be3eabe1f931c08b430d85dcb3efcd9b4462db88e6e9e
status: synced
tags:
  - 看雪
  - Windows逆向
  - 风控对抗
series: null
feed_source: 看雪·逆向工程
ai_summary: 通过 AI agent 辅助分析 Safengine 2.x 的虚拟机与校验机制，最终定位并 patch 用户机器码，绕过其“File corrupted”内存校验与机器码比对。
ai_summary_style: key-points
images_status:
  total: 9
  succeeded: 9
  failed_urls: []
notion_page_id: 41575244-d011-8123-bb4b-f0b61f22c17b
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 通过 AI agent 辅助分析 Safengine 2.x 的虚拟机与校验机制，最终定位并 patch 用户机器码，绕过其“File corrupted”内存校验与机器码比对。
> 
> - **定位 VM 调度器：** Trace 统计影响 EIP 的指令地址数找到 disp2handler（0x64 disp2handler 命中 310 次 ret 0x64），据此污点回溯拿到 handler table；ret 型特征为 `ret imm16`，handler 由 `mov reg,[disp32+idx*N]` 取出。
> - **去混淆与架构结论：** 用活跃变量分析+Nop/指令替换削弱死代码，pushfd/popfd 栈混淆 lowering 为不依赖栈的指令；确认 Safengine 2.x 是栈式虚拟机，CISC 语义、RISC 实现，256 个 handler 去重后 60 个，含 3 种 vRet；opcode 为变长（区别于 VMProtect 3.5）。
> - **内存校验 bypass：** vChecker 位于 0x82AE17，抽象为（校验地址、长度）两参数函数；编写注入 DLL hook 校验，将 hash 改为 unicorn 模拟得到的预期值，实现 bypass。
> - **机器码校验定位：** 跟踪 vRet/vCpuid 侧信道定位到 004EFA7C，发现作者在 Safengine 外再套一层 VMProtect；00598561 处比较用户机器码与预期值，失败则启动退出线程（入口 004F3485，VMP 保护）。
> - **最终 patch：** Safengine 自行重载 DLL 调 API；机器码 base64 解码计算函数无混淆，在 SystemBiosVersion 调用后需 patch 两次（程序两次获取机器码比对）；弹窗机器码显示 "1+LKtQAIEABTBgoAeqbPxVAJBgeiZysuFa1lCg=="，标 Fail，且该内容仅在弹窗时存在，无法通过内存搜索回溯计算逻辑。

先找到disp2handler，跑个Trace统计影响EIP指令的地址数即可，发现disp2handler。

0064F6D8 <safe | E8 ECA4FEFF | call safengine授权对抗ai.639BC9

{

HITS KIND TARGETS ADDR INSN

\----------------------------------------------------------------------

310 ret 21 0x82BA1E ret 0x64 disp2handler

1 ret 1 0x82AA51 ret 0x30

1 jmp indirect 1 0x639763 jmp \[ds: + 0x63B044\]

}

来个workflow分析Trace根据disp2handler做污点分析回溯handler table，拿到特征

ret 型（Safengine 2.x）：\`ret imm16\`，handler 由更早的

\`mov reg,\[disp32 + idx\*N\]\` 取出、变换后写回栈顶再弹出

拿到handler表

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7e83204e5a338c23.webp)

Handler有混淆，来个workflow，分析Trace当中的混淆特征，基于活跃变量分析通过Nop、简单指令替换的方式削弱死代码去混淆，有些pushfd、popfd基于栈的混淆要求lowering到简单指令，还原回正常不依赖栈的汇编。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/89bf692dcbf21c39.webp)

接下来个workflow分析Safengine的虚拟机架构，根据去混淆的汇编CFG分析Safengine虚拟机的架构，是基于堆的虚拟机还是栈的虚拟机，是CISC还是RISC。

结果

Safengine 2.x 是栈式虚拟机（stack machine），指令集是 CISC 语义、RISC 实现。

Handler表有256个handler，去重后60个，其中有3种类型的vRet走自己的handler尾部退出虚拟机。其他handler尾部都会回到虚拟机循环里重新调度。相比于VMProtect3.5，Safengine 2.x的opcode是指令变长的。

随便下个断点触发File corrupted，文件被修改，说明有内存校验vChecker。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1e41e5d490a2dd9b.webp)

vChecker在0x82AE17，将其抽象为函数，参数1为校验地址，参数2为校验长度。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7a34b3ad7be30697.webp)

来个workflow，编写内存注入dll做bypassSafengine2.xVChecker，忽略掉我们的断点，将hash值hook为预期的即可。预期的hash值通过unicorn模拟和我们实际的hookVChecker修改结果做对比，如不一致调试。最终达到bypass内存校验的效果。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/11fd6a004b365f73.webp)

接下去就是跟踪VM了，通过不断地侧信道分析vRet、vCpuid，最终定位到004EFA7C这个地址。同时发现vmp特征，看样子作者在safengine的基础上套了一层vmprotect的保护壳，很强大。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d26f4d8e80be337f.webp)

继续跟踪VM，到了00598561，这是个判断CALL，判断用户机器码与预期的机器码是否一致。如果判断失败会启动一个退出线程，参数地址为004F3485，也是一个被VMP保护的函数。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/daff970cfe34c00c.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a379a6d5287e4cee.webp)

通过不断的跟踪，发现Safengine自行重载了dll进行api的函数调用，总之跟了一堆的VM函数调用。最终定位到计算出base64解码后机器码machinecode的函数地址，这块没有混淆，类似一个shellcode。在SystemBiosVersion调用后进行patch机器码即可，要patch俩次，因为程序有两次获取机器码进行比较的操作。这可能也是作者魔改后的效果，总之，最终patch结果如下。

程序默认弹出机器码“1+LKtQAIEABTBgoAeqbPxVAJBgeiZysuFa1lCg==”，注意到Fail，这说明用户无法通过搜索该机器码的base64解码内存进行回溯机器码的计算，因为仅在弹窗时显示该内容。

2026年11月10日

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f0966f07722b993e.webp)

[#调试逆向](https://bbs.kanxue.com/forum-4-1-1.htm)

* * *

## 评论

> **zZhouQing · 2 楼**
> 
> 本文演示了如何利用workbuddy等agent进行程序的Safengine保护程序的虚拟机架构、用户机器身份校验算法分析，通过一些简单的提示词可以减少大量的重复工作。这应该就足够了。

## 附件

- [对抗Ai_Safengine_KeyGenMe.zip](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/attach/2026/11/c2ef61864c62a2ff.zip) （7.16MB，2次下载）
- [Safengine2.x Patch机器码.pdf](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/attach/2026/11/00186dc65b7188c2.pdf) （1.80MB，1次下载）
