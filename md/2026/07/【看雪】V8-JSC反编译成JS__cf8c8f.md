---
title: 【看雪】V8 JSC反编译成JS
source: https://bbs.kanxue.com/thread-291883.htm
source_host: bbs.kanxue.com
clip_date: 2026-07-05T12:24:14+08:00
trace_id: 17466a41-27a2-490a-a80e-e5ed7ed9a079
content_hash: fe4f55bd46106d9e55b66830550c8d4c3bcde4e28fc2943672d37065861b3bdc
status: summarized
tags:
  - 看雪
series: null
feed_source: 看雪·逆向工程
ai_summary: "**TL;DR**：通过逆向Typora发现授权逻辑在V8 JSC文件中，作者利用工具和AI成功将JSC反编译为可读的JS代码，但仅限于已触发的函数。"
ai_summary_style: key-points
images_status:
  total: 7
  succeeded: 7
  failed_urls: []
notion_page_id: 39475244-d011-81ed-9957-efda3a8919ce
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> **TL;DR**：通过逆向Typora发现授权逻辑在V8 JSC文件中，作者利用工具和AI成功将JSC反编译为可读的JS代码，但仅限于已触发的函数。
> 
> - **工具组合**：使用Python库jsc2js和view8脚本，配合V8的d8.exe执行反编译命令，生成反汇编文件后转换为JS。
> - **关键步骤**：获取V8版本（如13.4.114.21）至关重要，通过Electron调试和控制台输入实现，并利用现有库避免付费网站。
> - **AI增强可读性**：借助AI静态分析和CDP协议动态调用，显著提升反编译代码的可读性，类似IDA F5但更智能。
> - **主要局限**：反编译过程只能覆盖已触发的函数，未触发的函数无法解析，限制了全面性。
> - **成果分享**：作者已将整个反编译流程总结为开源skill项目（1903247335/jsc-lifter），供后续参考。

起因是在逆向Typora的时候发现有个最关键的授权逻辑全在JSC

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/36650f704fa570d1.webp)

V8开头的前4个字节是0xc0de0687 庆幸没有加壳

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/bdb788b18cf7c3fd.webp)

说明是V8编译的JSC 不简单 甚至还挺麻烦的

我不爽就想把JSC给反编译

首先是要得到V8的版本 这是最重要的一点 （我是把eletron开启调试了之后进入到里面然后console控制台里面输入得到的）

然后是要使用python库 jsc2js 基于view8的

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/0a01cf4f8f28dee6.webp)

得到V8版本后又听说有个网站支持这个V8版本的JSC反编译成JS就好奇试了下

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/e4d8fb3d24ff4bec.webp)

要钱的并且也不值得特地给钱去弄

但也不影响 jsc2js里面就有我们需要的版本13.4.114.21（向作者致敬respect）

然后 ".\\d8.exe" -e "loadjsc('C:/Users/Administrator/jsc_decompile/atom.jsc')" > "disasm.txt"

运行最终得到

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/cb129f0ddd671bae.webp)

里面自带view8了

python view8.py --disassembled "disasm.txt" "atom.decompiled.js"

最终输出

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/e2e5fa81ed1ebd48.webp)

可读性确实很垃 它其实很像是IDA的F5

IDA的F5为什么可读性不算弱 那是因为那家公司写的引擎本身就给力

像JSC这种的如果有人愿意花大堆时间写一个好的识别引擎可能也是可以做到的

但现在我们有了AI 直接上蹬

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/086ec49bf488d820.webp)

可以看到可读性确实好很多了

原理是叫AI静态配合CDP协议控制来动态调用读取最后才让函数变得可读

但缺点是只能覆盖触发的 如果没有触发就没办法知道 所以是没办法达到整个js文件都知道

我已经把过程总结成skill了

1903247335/jsc-lifter
