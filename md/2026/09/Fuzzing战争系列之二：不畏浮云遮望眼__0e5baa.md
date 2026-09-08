---
title: Fuzzing战争系列之二：不畏浮云遮望眼
source: https://blog.flanker017.me/fuzzing%e6%88%98%e4%ba%89%e7%b3%bb%e5%88%97%e4%b9%8b%e4%ba%8c%ef%bc%9a%e4%b8%8d%e7%95%8f%e6%b5%ae%e4%ba%91%e9%81%ae%e6%9c%9b%e7%9c%bc/
source_host: blog.flanker017.me
clip_date: 2026-09-08T17:59:00+08:00
trace_id: 43591be5-3804-4d0b-b90b-71e997ffee6a
content_hash: eafc8afda2c42201977509cce69d593d68d0aad361c75f659c8a7f5193ad937c
status: synced
tags:
  - Android逆向
  - 模拟执行
series: null
feed_source: Flanker·移动安全
ai_summary: 无源码的Android ARM二进制，可通过QEMU/Unicorn类动态翻译在执行中采集覆盖，结合AFL思路在x86工作站大规模并发Fuzz，从而发现闭源组件的真实漏洞。
ai_summary_style: key-points
images_status:
  total: 14
  succeeded: 14
  failed_urls: []
notion_page_id: 3d575244-d011-8117-8f68-fd2a100ce39b
ioc:
  cves:
    - CVE-2020-12751
    - CVE-2020-25278
    - CVE-2021-22493
  cwes: []
  hashes:
    - a5b97e342da843fbbc63cf662981205b
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 无源码的Android ARM二进制，可通过QEMU/Unicorn类动态翻译在执行中采集覆盖，结合AFL思路在x86工作站大规模并发Fuzz，从而发现闭源组件的真实漏洞。
> 
> - **覆盖率手段选择：** 无源码下静态重写（AFL-DynInst、e9patch）需解析控制流并处理重定位/代码迁移，对ARM支持差；动态跟踪分ptrace hook与QEMU模拟，跨架构Fuzz需要后者。
> - **QEMU方案优化：** 把覆盖率记录下沉到TCG生成层，避免禁用block chain缓存；通过pipe将新TB翻译请求共享给父进程，减少子进程重复翻译开销。
> - **DroidCorn框架：** 用Unicorn实现底层模拟，以Trap方式把heap allocator等热函数Host端化，裁剪runtime与syscall handlers，并加入syscall沙箱，较QEMU usermode获得约30%性能提升。
> - **目标与成果：** 该方法面向数亿手机默认内置的闭源图片解析库，可大规模并发Fuzz；后续披露多个远程内存破坏漏洞，包括CVE-2020-12751、CVE-2020-25278、CVE-2021-22493等。

本文 *拨开二进制Fuzzing的迷雾* 为Fuzzing战争系列的第二篇，也是 [Fuzzing战争：从刀剑弓斧到星球大战](https://mp.weixin.qq.com/s/nREiT1Uj25igCMWu1kta9g) 的续篇。

每个人都期待有全图点亮的体验，然而现实中安全研究的目标却更多是编译好的二进制binary而没有源码。迷雾之下崇山峻岭羊肠小道，但应许之地却往往也隐藏其中。本文将以目前最为主流的Android on ARM/AARCH64为例，综合笔者在 MOSEC 2020 和 RWCTF Tech Forum 2021 的演讲内容，首次系统性地阐述如何实现无源码情况下的大规模Coverage-Guided Fuzzing理论、工程和实践，和小试牛刀即发现的主流移动终端中广泛存在的真实漏洞。出于阅读体验，本篇可能会分多次发出，持续更新中。

`前方预警：本文为硬核技术导向，非技术人员请直接划到最后篇后随笔一节` 。

Let’s rock n’ roll!

## 温故而知新

就像简陋的纸带机模型却能描述出完备的图灵机一样，一个五行的bash脚本甚至也可以成为fuzzer，当然作为一个dumb fuzzer，直到宇宙毁灭，它也不一定能发现一个漏洞。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c660928c2f5790a8.jpg)

现代Fuzzing技术以样本为驱动，论Coverage Feedback为核心，取遗传算法为理论。获取Coverage的办法主要有三种：

-   Compiler Instrumentation w/ source, e.g GCC / LLVM
-   Hardware-tracing, e.g. Intel PT
-   binary-based: static rewrite/ dynamic tracing

相比于传统的Grammar Fuzzer, CGF Fuzzer在每轮变异样本的输入运行后，会评估该样本是否触及了更多的代码块，从而决定是否保留它进而进行更深度的变异，从而自动构建输入样本的格式。以AFL为例，在x86形式下，其核心插桩代码逻辑如下所描述：

![image-20210117231946276](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/71ca95a10a325158.jpg)

```c
cur_location = <COMPILE_TIME_RANDOM>;
shared_mem[cur_location ^ prev_location]++;
prev_location = cur_location >> 1;
```

在有源码的情况下，基于编译器工具链的支持，我们可以很容易地在编译过程中实现以上的变更。

## Elephant in the room

但更多的时候，房间里会有这么一些闭源的大象：

-   来自于供应链的黑盒SDK
-   平台私有库 (例如移动设备中Qualcomm, Samsung, Apple等不开源的系统组件内容)
-   一些即使有源码但需要特殊运行时支持的产品，或者因为部门墙而拿不到源码的自家产品 (true story)

引入注目却大部分时间让人束手无策，也少见对这方面的研究和成功实践。公开的文献中对此类目标仍然是dumb fuzz居多，

![image-20210117231124533](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/331e9122e575c4d5.jpg)

这前朝Fuzzer的剑，就斩不了本朝的binary target了么？

## Static or Dynamic? "996还是11116？"

为了解决这个问题，我们首先需要确定在无源码情况下应当如何收集Coverage。ELF/MachO的Static Rewrite和Dynamic Tracing是我们可能的选项，那他们分别是什么，对于实际环境下的目标又应当如何选择？ `是996，还是11116？`

![image-20210117231659875](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/eb3be280b0acb71e.jpg)

## Static Rewrite

Static Rewrite基于Disassembliing 和 Static Patching。目标ELF/MachO/PE首先被汇编后，根据其Control Flow提取出Basic Block。类似于孙悟空复制出六小龄童一样，我们可以在Basic Block的edge处插入希望被执行的指令，进而获得一个新的binary，也就是所谓的 `rewrite` 。 `AFL-DynInst` 和 `e9patch` 是其中的典型案例，例如 `AFL-DynInst` 的做法即是

```
.. inserting callbacks for each basic block and an initialization callback either at _init or at specified entry point ..
```

它的优点非常明显：对于实现较好的rewrite，目标binary在性能上具有巨大的优势。但同样地缺点也非常明显，魔鬼在于细节

-   rewrite事实上修改了目标的basic block，这意味着我们通常必须要将一些basic block进行ELF内的迁移以腾出足够的空间。那么对于主流的relocatable binary而言，这涉及到重定位会带来的一系列问题。同理上反汇编引擎需要能够尽可能地识别出控制流，否则就会出现遗漏覆盖率或者运行时崩溃。而不幸的是，目前的rewrite工具对ARM平台的binary支持并不是很好。
-   对于ARM/AARCH64的目标而言，该方法更存在一个终极悖论：在ARM server和工作站普及之前，rewrite后的binary应当在哪里运行？如果仍然需要在移动设备、开发板上运行的话，我们还是需要面临着平台本身的限制，移动设备在高负荷的Fuzzing时经常会出现过热变慢甚至变砖的情况，且从成本和物理连接上并不适合动态scale。

当然，随着ARM工作站的逐渐普及（特别是苹果M1芯片的搅局），这个状况后面可能会有所改观。但目前M1芯片的Mac产品仍不支持直接运行Android Binary (Kernel和linker不同导致)，这也是笔者后续所关注和研究的方向。

## Dynamic Tracing

相对于静态编辑技术，Dynamic Tracing着力于运行时获取coverage信息。这也通常会有两种实现方式：

-   基于ptrace等实施动态hook，典型案例如frida-qdbi-fuzzer，但这仍需要在同架构下运行
-   基于QEMU实现运行时异构模拟，在模拟执行的过程中获取coverage, *这也是后面我们会提到的重点*

### QEMU stands for Quick EMUlator

![img](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e9ff2fb6127c3fb6.jpg)

QEMU通过 `Translated Block` 的方式提供动态二进制翻译。我们知道，任何计算机科学技术中的问题都能通过添加中间层解决，QEMU定义了 `TCG (Tiny Code Generator)` 的概念作为IR中间语言，任何前端目标语言指令都会被统一翻译为标准Ops后，再通过后端的解释器翻译为Host Machine的Target Code。

在QEMU执行目标程序时，根据指令位置查询到对应已翻译的TB会被直接执行，而未翻译的TB则会被进行实时翻译，并链入缓存序列中，如下图所示：

![image-20210118170412040](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/fa7b2a157e6f066f.jpg)

这种JIT的方式给了我们操作的空间，一种简单的思路是与tb挂钩，在 `tb_find_slow` 中直接挂钩记录当前的pc值并传递给AFL，如下图所示：

![image-20210118172930139](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/337d810455487c71.jpg)

![image-20210118172935323](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8278b16b5d459dc0.jpg)

但显然这个初步的方法有很大的优化空间：

-   在 `tb_find_slow` 中进行记录意味着必须要禁用block chain caching，也就是说每一个block都需要跳回dispatcher查询是否被翻译过。这带来了巨大的性能回退
-   缺乏信息回传机制，新的block/ 新的chain信息无法在多个子进程之间实现共享，避免重复劳动

针对这两个问题， `abiondo` 等提出了如下的解决方案：

-   将记录代码下沉，迁移到TCG生成中，也就是TCG生成的ops。这样无论上层如何修改缓存方式，都仍可以精确地实现记录
-   通过pipe管道共享translate request。当子进程遇到新的block时，将信息发送给parent，指令parent同样进行一次翻译

![image-20210118181917200](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a8b5c783bd7cdc11.jpg)

### 加速

![a5b97e342da843fbbc63cf662981205b](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3cb6637265cb927d.jpg)

就像计算产业的速度曾经被摩尔定律所主导，但当摩尔定律主频这个柠檬的汁被榨干之后，人们转向分布式计算和专用芯片（FPGA）。在穷尽当前系统性的措施之后，我们仍可以借用专用计算的概念来优化Fuzzer，也就是说

-   `如果我们关心的只是特定的代码片段，我们是否仍需要模拟整个完整的Runtime环境？`

笔者在MOSEC 2020上介绍的基于 `Unicorn框架` 实现的 `DroidCorn` 即是基于这个理念编写的改进版执行框架。它的结构如下图所示：

![image-20210120154208872](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5b20c10d301c387f.jpg)

相比于 `QEMU-usermode`,DroidCorn在如下方面进行了重写，并最终初步获得了约30%的性能提升

-   通过Trap的形式实现Hooker，将hot functions例如heap allocators转移到host端实现，提升热点区域执行速度
-   实现最小裁剪版的runtime和syscall handlers，支持跨内核部署和运行，减小运行开销
-   对syscall等提供沙箱保护和返回值拦截，可用于模拟特定驱动或环境

这套框架完成了笔者在x86工作站和服务器Linux环境下运行和fuzz ARM binary的目标，在摆脱了物理移动设备的限制之后，我们可以轻松地对其进行大规模并发Fuzz，开拓前人所未到达之领地，发现前人所未发现之漏洞。

### 加速，加速

![image-20210120163651371](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/af8f44eeea885df1.jpg)

当QEMU以上的优化做到极致，我们可能就要考虑优化QEMU本身了。在预先控制流解析的支持下，JIT编译是否可以被替换为AOT编译，就像从Dalvik到ART runtime？这是一个开放性的话题，请读者自行思考。

## 今日把示君，谁有不平事？

以上介绍了binary fuzzing技术的现状和笔者的思考、探索和实践。在接下来的文章中我们将进入实战环节，针对数亿移动手机中所广泛内置默认使用的闭源图片解析库进行fuzz，并分析发现的数十个远程内存破坏漏洞，i.e. CVE-2020-12751, CVE-2020-25278, CVE-2020-12751, CVE-2021-22493。敬请期待。

![image-20210120212524459](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c6a2e8e9f7bf194a.jpg)

![image-20210120212606016](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/169bfd07221a3a8a.jpg)

本文所对应的RWCTF 2021 Tech Forum上分享的PPT可以在 [https://speakerdeck.com/flankerhqd/blowing-the-cover-of-android-binary-fuzzing](https://speakerdeck.com/flankerhqd/blowing-the-cover-of-android-binary-fuzzing) 查阅。

## References

-   https://github.com/lunixbochs/usercorn
-   https://github.com/AeonLucid/AndroidNativeEmu
-   https://github.com/AFLplusplus/AFLplusplus
-   https://github.com/Battelle/afl-unicorn
-   https://abiondo.me/2018/09/21/improving-afl-qemu-mode
-   https://github.com/andreafioraldi/qasan
-   https://gts3.org/~wen/assets/papers/xu:os-fuzz.pdf

## 篇后随笔

数十年前因特网的蛮荒时代，ARPA的先贤们曾满怀信念，希望能建立一个田园牧歌的大同世界，Richard Stallman至今仍在为了看似疯癫的信念而奔走呼号。曾经我们以为这个梦想已经越来越近，但撕裂的地缘政治和残酷的资本迅速消灭了所有的幻想。

曾经的程序员（我更愿意称为计算机工程师和科学家）是极客，是创作者，是艺术家。开源社区的蓬勃发展是他们灵感的碰撞，才华的闪光，成千上万人智慧的结晶。但很不幸的是，创作的果实被贪婪地资本所攫取，they are taker not giver，开源驱动的基础架构技术发展和完善让手艺人异化成了流水工。精妙的计算科学变成了CRUD的堆需求，严谨的数学计算被 `7*24` 人肉盯盘取代，每一个电脑配一个人，看是电脑还是人先crash。先贤图灵和冯诺依曼们若泉下有知，是否会预料到今天的局面？

愿每个人都能有时间看看天空，再次引述下天才黑客GeoHot的一句话： `I want power, not power over people, but power over nature and the destiny of technology. I just want to know how the things work.`

愿我们仍能记住这段话：

> Computer science is the study of algorithmic processes, computational machines and computation itself. As a discipline, computer science spans a range of topics from theoretical studies of algorithms, computation and information to the practical issues of implementing computational systems in hardware and software.
