---
title: 【看雪】OLLVM混淆+VS 2019/22 Windows环境搭建
source: https://bbs.kanxue.com/thread-292795.htm
source_host: bbs.kanxue.com
clip_date: 2026-08-28T05:34:24+08:00
trace_id: f9529071-7a54-4622-a6d1-c883420ab9d7
content_hash: 61fabd347316ae6ed3c9d51189f66121bdc40199637a3f84f82c0d1749851280
status: synced
tags:
  - 看雪
  - 编译器保护
  - OLLVM混淆
series: null
feed_source: 看雪·逆向工程
ai_summary: OLLVM通过源码级混淆（指令替换、控制流平坦化、虚假控制流、字符串加密）可显著增加逆向难度，并用于规避AC程序特征；本文完整记录了在VS2019/2022 Windows环境下的OLLVM搭建与编译流程。
ai_summary_style: key-points
images_status:
  total: 9
  succeeded: 9
  failed_urls: []
notion_page_id: 3c975244-d011-8108-9ab5-d02a329ba44e
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> OLLVM通过源码级混淆（指令替换、控制流平坦化、虚假控制流、字符串加密）可显著增加逆向难度，并用于规避AC程序特征；本文完整记录了在VS2019/2022 Windows环境下的OLLVM搭建与编译流程。
> 
> - **项目背景：** 注入项目的DLL被AC特征检测，尝试用OLLVM混淆规避。
> - **原理简述：** OLLVM基于LLVM，可对源码插入无用变量/控制语句，使生成代码包含大量无效跳转和复杂字节，并能字符串加密。
> - **VS安装LLVM：** VS2019/2022在“单个组件”中勾选clang相关组件即可集成LLVM；平台工具集需选LLVM(clang-cl)；若报illegal character encoding，将文件编改UTF-8。
> - **OLLVM获取：** 无官方仓库，可用DreamSoule的ollvm17（适配LLVM 17）或0x3f97的ollvm12（适配LLVM 12）；ollvm17有Release成品，ollvm12需自行编译或使用作者提供的成品。
> - **替换与使用：** 将ollvm的clang-cl.exe、llvm-lib.exe、lld-link.exe替换VS对应目录（X86在\bin，X64在\x64\bin）；项目平台工具集改为LLVM(clang-cl)，在C/C++命令行中添加如 `/O2 -mllvm -fla -mllvm -sub -mllvm -split -mllvm -bcf -mllvm -bcf_prob=30 -mllvm -bcf_loop=1` 参数后编译。

在很早之前就听过 **OLLVM混淆** 了，但是项目用户不多没拉闸过所以没有去弄

最近在做的注入项目DLL被AC特征了 正好趁着这个机会来搞一下 **OLLVM混淆** 看看能不能规避特征

笔者在网上找了很多相关资料 但是多数要不是安卓的 要不就是好几年之前的 **"牢文章"**

为了帮助未来可能换设备的自己 决定正好记录下 **OLLVM混淆的搭建全流程**

## 0x1 OLLVM是什么

在正式开始记录之前 还是先来科普下OLLVM是什么

LLVM是一个编译器中负责代码生成的工具 比如 **VS 2019** 默认的同款工具是 **Visual Studio 2019 (v142)**， **VS 2022** 的生成工具默认是 **Visual Studio 2022 (v143)**

而 **OLLVM** 呢 则是 **基于** **LLVM的开源代码混淆工具** 带有 **源码级混淆** 功能

所谓源码级混淆可以通俗易懂的理解为：

写好的源文件 -> OLLVM混淆 加一堆没用的变量声明，控制语句等

(例如：

int a = 100;

if( a!= 100)

return;

)

\-> 编译为

而正常项目编译逻辑则是：写好的源文件 -> 编译

可以清晰看到使用 **OLLVM混淆** 后，生成的代码多了很多没用的跳转(即控制流平坦化&虚假控制流)，以及生成的代码字节复杂化，源码中一行一个a += 100; 可能变成 a += 2 \* 4 + 552 / 6;(即指令替换)，还有将用到的 **字符串加密 。。**

官方的解释为： **通过指令替换、控制流平坦化和虚假控制流等手段显著增加二进制逆向难度**

而对于我们来说，可以通过每次混淆程度不同，来 **规避AC的程序特征**

## 0x2 环境搭建：LLVM安装

如上所述，OLLVM是基于LLVM的工具，所以需要先在IDE中安装LLVM

笔者这里使用的IDE是 **Visual Studio 2019**， 已经将 **LLVM** 集成进组件了，VS 2019 2022版本也可以直接使用笔者的办法来安装LLVM，其他版本可以自行尝试

## 0.VS中打开任意解决方案/继续但无需代码，在上方工具栏中依次点击 【工具 -> 获取工具和功能】

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/73de88203aeecc69.webp)

## 1.在新打开的窗口中，点击上方单个组件，然后搜索【clang】勾选出现的两个选项，然后点击右下角修改

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/22b861f896dee035.webp)

## 2.等待修改完毕，期间可能需要你关闭VS的编辑器窗口

## 3.1 验证安装状态：查看是否有LLVM生成工具，检查【平台工具集】中是否出现LLVM(clang-cl)，并尝试选它来进行编译

**如果编译失败，提示illegal character encoding in string literal，则将报错的文件编码改为 UTF-8 即可**

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/94409e5744bb27f8.webp)

## 3.2 验证安装状态：查看LLVM版本，依次点击 【工具 -> 命令行->开发者PowerShell】，输入【clang --version】

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/8b492bf0b151d233.webp)

## 0x3 环境搭建：OLLVM安装

ollvm并没有官方维护的仓库，都是民间自己魔改的，笔者找了两个，分别是

****DreamSoule**** 大佬的 **ollvm17** 适用于(**LLVM 17.\*版本**) **，链接：** [GitHub - DreamSoule/ollvm17: Obfuscation LLVM 17 · GitHub](https://github.com/DreamSoule/ollvm17)

****0x379F**** 大佬的 **ollvm12** 适用于(**LLVM 12.\*版本**) **，链接：** [GitHub - 0x3f97/ollvm-12.x: obfuscator-llvm 移植到llvm12.x. · GitHub](https://github.com/0x3f97/ollvm-12.x)

笔者使用VS2019组件安装的LLVM版本为12.0.0，VS2022组件安装的LLVM版本为17.0.\*

**ollvm17** Release页提供了编译好的版本

**ollvm12** 需要自己照着文档编译，耗时长还麻烦，我这里编译了一份

链接： [ollvm12成品（提取码:Vex6）](https://pan.baidu.com/s/1FP34PJSJ4liuwCTzDRhIJQ?pwd=Vex6)

## 0.不管是ollvm17还是ollvm12最后拿到的核心是llvm-lib.exe,lld-link.exe和clang-cl.exe

## 1.在上面使用VS PowerShell输入【clang --version】获取到llvm的环境目录（删掉\\bin）

## 2.根据你的项目环境来复制进去替换原有的llvm-lib.exe,lld-link.exe和clang-cl.exe

**X86编译器目录: \\bin**

**X64 **编译器** 目录: \\x64\\bin**

值得注意的是，X86/X64编译器是一份(llvm-lib.exe,lld-link.exe和clang-cl.exe)

这里按个人所需替换就行，比如笔者只需要X64版本，所以只替换\\X64\\bin中的llvm-lib.exe,lld-link.exe和clang-cl.exe

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/5e0635591db76d10.webp)

## 0x4 使用OLLVM混淆编译项目

## 0.将项目的对应配置版本中改为【常规->平台工具集】改为 LLVM(clang-cl)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/92d7f262d3e0d8ad.webp)

## 1.将【C/C++->命令行参数】中输入对应参数后点应用

笔者这里测试用的是/O2 -mllvm -fla -mllvm -sub -mllvm -split -mllvm -bcf -mllvm -bcf_prob=30 -mllvm -bcf_loop=1

**参数的详细意义可以参考仓库文档，这里我用Ai整理了一下ollvm12的：**

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/c8cc7903ad689fe5.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/84a3b76603c08175.webp)

## 2.最后正常生成就行，第一次生成可能比较慢，耐心等待即可

最后丢一个IDA中的效果，可以看到混淆的连亲妈都不认识了

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/002c6e2c3ab4ad13.webp)

## 0x5 后话

没有，太困了，睡觉
