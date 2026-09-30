---
title: 【看雪】某DEX_VMP安全分析与还原
source: https://bbs.kanxue.com/thread-270799-1.htm
source_host: bbs.kanxue.com
clip_date: 2026-09-30T14:55:04+08:00
trace_id: d197a3f0-7667-45bf-832b-0ccb29d28d5b
content_hash: 7359fb9532f4a5b8f40a1a80930e2873b8057c978e043e46195b43d96ebf90c4
status: synced
tags:
  - 看雪
  - 脱壳与加固
  - 模拟执行
series: null
feed_source: null
ai_summary: 某安卓 DEX_VMP 通过已知明文 + JNI trace 回溯定位 codeitem，再按内存读取切分指令、异或还原 opcode，最终把字节码翻译回 smali。
ai_summary_style: key-points:weak
images_status:
  total: 47
  succeeded: 37
  failed_urls:
    - upload/attach/202112/760871_K8A82WT9MXDZBS3.jpg
    - upload/attach/202112/760871_MCK3AN5Z62UEU25.jpg
    - upload/attach/202112/760871_23SNEC59HP724FA.jpg
    - upload/attach/202112/760871_HAD9ZDD75Z6XMA2.jpg
    - upload/attach/202112/760871_RXXRP5PH7BZABAJ.jpg
    - upload/attach/202112/760871_GU63ZHNRHXUJHQ9.jpg
    - upload/attach/202112/760871_AXTR4TYKGFKZW97.jpg
    - upload/attach/202112/760871_JZDMKRBHWDHBASP.jpg
    - upload/attach/202112/760871_ZE4XEB77YEAZ3ES.jpg
    - upload/attach/202112/760871_5CG4TCW9RQ7UC3W.jpg
notion_page_id: 3eb75244-d011-81f9-923c-e907863d3092
ioc: null
---

> 💡 **AI 总结（key-points:weak）**
>
> 某安卓 DEX_VMP 通过已知明文 + JNI trace 回溯定位 codeitem，再按内存读取切分指令、异或还原 opcode，最终把字节码翻译回 smali。
> 
> - **三步主线：** 定位 VMP 字节码 → 分割字节码（确定每条指令长度、区分 opcode 与 operand）→ 还原为 smali。
> - **入口特征：** 目标方法被替换为跳板方法，进入 native 后按返回值类型分发到多个 JNI 函数。
> - **定位 codeitem：** 需同时掌握 index（0x2dce）与 codeitem 地址（0xcac85880）；后者由已知明文（onCreate 必含 startTracing/super.onCreate）、沙箱调用序列、JNI 参数回溯、内存访问统计四步推出。
> - **关键推导：** 回溯 GetStaticMethodID 的参数来源得到偏移 0x81de，它来自 0xcac858a8；检索对 0xcac85??? 的访问，最早命中 0xcac85890（首条字节码），减 0x10 即得 codeitem 基址 0xcac85880。
> - **opcode 解密：** off1 = 指令地址 − 基址，off2 = off1<<1，key = load(base+off2)，de_opcode = en_opcode XOR key；opcode 后常跟 EOR 与 CMP 定位 handle，operand 则没有。
> - **无对照表还原：** 接口猜测法、参数推导法、借助标准 dalvik 指令格式的位分布特征缩小候选。
> - **攻击面：** VMP 高度依赖 JNI（HOOK 调用信息是突破口）、codeitems 连续集中存储、指令仅由标准 dalvik 略改。
> - **trace 方案取舍：** GDB/IDA 慢且有反调试；FridaStalker 不支持 thumb 且有花指令问题；脱机 unicorn 需自行实现大量 jni/syscall——文中尝试在真实进程与 context 中用 unicorn 构造虚拟 CPU 取 trace。

> 一.思路整理  
> 二.某VMP入口特征  
> 三.定位VMP字节码  
> 四.分割VMP字节码  
> 五.还原为SMALI  
> 六.攻击面总结  
> 七.深入VMP还原的一些问题  
> 八.调试与工具总结

## 一.思路整理

#### 还原VMP需要哪些铺垫?

> (1)定位VMP字节码  
> (2)分割VMP字节码  
> (3)还原成SMALI

#### (1)为什么要找VMP字节码的位置?

> 因为如果目标方法的字节码地址,都找不到,还原也就没法展开了.

![⚠️ 图片托管失败](upload/attach/202112/760871_K8A82WT9MXDZBS3.jpg)

![⚠️ 图片托管失败](https://bbs.kanxue.com/upload/attach/202112/760871_K8A82WT9MXDZBS3.jpg)

#### (2)为什么要分割VMP字节码?

> 如果要反汇编成smali,  
> 起码要知道这条smali对应的字节码一共几个字节.

> 在确定一条指令占几个字节后,  
> 还要知道这几个字节中,  
> 谁是操作码,谁是操作数.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/709673c96c296e5c.png)

#### (3)还原为SMALI

> 有了前两步铺垫,最终我们可以解读一条完整的smali的含义.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1da7bbf296d2e704.png)

## 二.某安卓VMP入口特征(2021.8月样本)

![⚠️ 图片托管失败](upload/attach/202112/760871_MCK3AN5Z62UEU25.jpg)

> 跳板方法

![⚠️ 图片托管失败](https://bbs.kanxue.com/upload/attach/202112/760871_MCK3AN5Z62UEU25.jpg)

> 进入native后的参数处理逻辑

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/05768b4d29470243.png)

> 为了处理不同类型的返回值, 定义了多个jni方法

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/cf528e0c63d01cfd.png)

> 对应jni函数入口指令情况

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/19038e7845f21743.png)

## 三.定位VMP字节码

#### 逻辑

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1e814acd566ff6bb.png)

> 根据上述逻辑,则一定存在函数F,向F输入index可得到对应codeitem_addr  
> F(index) == codeitem_addr

> 我们看一下这个函数,从index到codeitem_addr的过程  
> (0x2dce->0xcac85880)

![⚠️ 图片托管失败](upload/attach/202112/760871_23SNEC59HP724FA.jpg)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0834f8f73f8c7faa.png)

![⚠️ 图片托管失败](https://bbs.kanxue.com/upload/attach/202112/760871_23SNEC59HP724FA.jpg)

#### 如何在十几万数量级的汇编中定位到这段代码的?

> 通过Trace记录REG信息,  
> 用到了两个关键数值,0x2dce(index)与0xcac85880(codeitems),  
> 标记两个数值出现的中间区间即可.

![⚠️ 图片托管失败](upload/attach/202112/760871_HAD9ZDD75Z6XMA2.jpg)

![⚠️ 图片托管失败](https://bbs.kanxue.com/upload/attach/202112/760871_HAD9ZDD75Z6XMA2.jpg)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d1667353d0e2ad3d.png)

#### 展开上面的定位方式的两个前提条件:

> 我们已经有了关键数据0x2dce,但还需要知道另一个提前条件,  
> 即codeitem是0xcac85880,所以这个信息是从哪得知的?  
> 这里是本章的关键.

#### 如何分析出codeitem的地址是0xcac85880?

> (1) 已知明文  
> (2) 沙箱日志获取切入点  
> (3) JNI参数回溯  
> (4) 内存访问统计

#### (1)已知明文

> 目标APP内很多的onCreate()方法,其内部普遍调用了,  
> NBSTraceEngine.startTracing();以及super.onCreate()

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2e87419e15b94399.png)

> 我们选一个被vmp保护了的onCreate()作为分析目标, ZxWebViewActivity.onCreate()  
> ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e47025f8b03aa199.png)

#### (2) 沙箱日志获取切入点

> ① ZxWebViewActivity.onCreate内必定存在NBSTraceEngine.startTracing();以及super.onCreate()  
> ② startTracing为静态方法,会被编译器编译为invoke-static  
> ③ super.onCreate()为超类调用,会被编译器编译为invoke-super  
> ④我们猜测vmp对invoke-static模拟实现借助了JNI函数,  
> 所以我们触发ZxWebViewActivity.onCreate()执行,截取其调用序列,效果如下:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/53a8fde584528dcc.png)

> 大致逻辑为

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ed45db66f203890a.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/eb2f9f2c2d19cc47.png)

#### (3) JNI参数startTracing来源回溯

> 我们在trace中找到这条GetStaticMethodID()的出现位置,  
> 然后作为起点向上展开回溯,希望找到其参数”startTracing”的最早出处,  
> 如果有自动化的脚本和条件可进行污点分析,由于逻辑不是很复杂,这里人工回溯完成.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/12efc40173749b0e.png)

> 具体过程省略……  
> 在trace中对参数”startTracing”来源进行一番回溯,  
> 最终发现了一个起到决定性作用的偏移值0x000081de.  
> 可以简单理解成,它以base+0x000081de的形式确立的参数”startTracing”.

> 结论:  
> 如果0x000081de是那个起到决定性意义的数值,  
> 那么毫无疑问0x000081de来自codeitem.

> 在trace中找到0x81de的出现位置,  
> 发现它来自于内存位置0xcac858a8.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a6992796b4c6e16c.png)

#### (4) 内存访问统计

> 0x81de来自0xcac858a8,  
> 由于这个地址可能是codeitem,  
> 因此我们检索一下,trace中对这片内存区域的访问情况  
> 0xcac858a8取前5个高位,忽略后3个地位,即检索对0xcac85???的访问

![⚠️ 图片托管失败](upload/attach/202112/760871_RXXRP5PH7BZABAJ.jpg)

![⚠️ 图片托管失败](https://bbs.kanxue.com/upload/attach/202112/760871_RXXRP5PH7BZABAJ.jpg)

> 找到19条指令, 而对0xcac85???的访问,最早的第一条指令,出现在编号5691的位置,  
> 对应的内存地址为0xcac85890,说明这里是ZxWebViewActivity.onCreate()第一条字节码.

> 由于codeitem第一条字节码之前0x10个字节还存在一些固定内容,  
> 所以0xcac85890-0x10取得codeitem地址0xcac85880,  
> 即codeitem的地址是0xcac85880

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d59fb1bfc2550056.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3a4ab71ccdb6d0d4.png)

## 四.分割VMP字节码

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/49804ad2c9c4dd6e.png)

> 现在已经有了某厂vmp codeitems全部内容,  
> 但是还没法反汇编成smali,

> 因为还不知道,  
> 第一条指令一共占几个字节,  
> 第二条指令一共占几个字节,  
> 依次......

> dalvik指令是不等长,  
> 反汇编成smali的话,  
> 起码要知道这条smali对应的字节码一共几个字节  
> 在知道了每条指令占几个字节后,  
> 还要知道这几个字节中,  
> 谁是操作码,谁是操作数.

#### 通过观察codeitem的内存段的读取情况,可以达到这个目的

![⚠️ 图片托管失败](upload/attach/202112/760871_GU63ZHNRHXUJHQ9.jpg)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/dab5274267d738dd.png)

![⚠️ 图片托管失败](https://bbs.kanxue.com/upload/attach/202112/760871_GU63ZHNRHXUJHQ9.jpg)

#### 如何快速区分出操作码和操作数?

> 一般opcode后面会有一个EOR解密指令,  
> 以及一串类似定位handle的CMP指令操作,  
> 而operand没有,这就为区分opcode和operand提供了特征依据.  
> ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/db5789db770b26cf.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8fe919b02ebddaaa.png)

#### opcode解密逻辑?

> 由eor指令向上回key出现的位置,  
> 即可确定key的来源,  
> 以及解密逻辑.

> 大致逻辑:  
> off1 = sub( codeitem当前指令地址, codeitem基址 )  
> off2 = lsl( off1, 1)  
> key = load( base + off2 )  
> de_opcode = xor(en_opcode, key)

## 五.VMP字节码还原为SMALI

> 1 标准dalvik指令反汇编过程  
> 2 VMP指令反汇编过程  
> 3 还原VMP所有指令需要什么?  
> 4 没有opcode对照表时,如何展开还原?

#### 1 标准dalvik指令反汇编过程

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/013c1b804a651146.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c7375699453c105e.png)

#### 2 VMP指令反汇编过程

> 由于使用了已知明文条件作为切入点,  
> 已知分析目标ZxWebViewActivity.onCreate()中,  
> 必定会调用startTracing()方法,  
> 即必定存在invoke-static {v0}, method@00da6f //...startTracing

> 又通过上面的分析得知关键值81de出现在这条invoke-static中,  
> 且充当操作数的角色,那么按照我们按照标准invoke-static反汇编规则进行解析,  
> 就可以得到结论.

![⚠️ 图片托管失败](upload/attach/202112/760871_AXTR4TYKGFKZW97.jpg)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9230086cdd7e1563.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b790bc8af3a1c601.png)

![⚠️ 图片托管失败](https://bbs.kanxue.com/upload/attach/202112/760871_AXTR4TYKGFKZW97.jpg)

.

> VMP指令由标准指令基础上修改而来,有哪些异同?

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/cca68aaa6724baf0.png)

#### 3 还原VMP所有指令需要什么?

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a8034b35cca1a426.png)

#### 4 没有opcode对照表时如何展开还原?

> (1)接口猜测法  
> (2)参数推导法  
> (3)标准dalvik指令格式的信息利用  
> (4)人肉逆向法(略)

#### (1)接口猜测法

> method相关的invoke系列指令,可以通过JNI执行情况猜测.  
> Field相关的get set系列指令,也可以通过JNI执行情况猜测.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e45a716babcdc0b6.png)

#### (2)参数推导法

> 方法调用前,会先准备参数,  
> 通常是声明类型的指令,  
> 可以很大程度缩小猜测的候选指令范围.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4c61dd053afab372.png)

#### (3)标准dalvik指令格式的信息利用

> 由于vmp指令是由dalvik标准指令略微修改/变异而来,  
> 只做了较小的改动,仍然保留了BIT位分布特征这样信息.  
> 在做还原时,可以利用这些信息,一定程度缩小候选范围.  
> https://source.android.com/devices/tech/dalvik/instruction-formats  
> https://source.android.com/devices/tech/dalvik/dalvik-bytecode#instructions  
> ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1da3458a3efe805d.png)

## 六.攻击面总结

> 1 分析路径  
> 2 攻击面总结 && 启示

#### 1 分析路径

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/dc68130dfdd8ac25.png)

#### 2 攻击面总结 && 启示

> (1) 被VMP的方法内部存在已知明文指令.  
> (2) VMP的实现高度依赖JNI函数,通过HOOK拿到其调用信息,是非常有效的切入点与突破口.  
> (3) codeitems的连续性,集中存储的特性,通过内存访问统计最终被发现.  
> (4) vmp指令由标准dalvik指令基础上略改而来,整体仍然保留了很多可用信息,  
> 对于一些内部逻辑比较简单的方法,可以以较小成本还原.

#### (1) 被VMP的方法内部存在已知明文指令.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/64bc5d0088e204f3.png)

#### (2) VMP的实现高度依赖JNI函数,通过HOOK拿到其调用信息,是非常有效的切入点与突破口.

![⚠️ 图片托管失败](upload/attach/202112/760871_JZDMKRBHWDHBASP.jpg)

![⚠️ 图片托管失败](https://bbs.kanxue.com/upload/attach/202112/760871_JZDMKRBHWDHBASP.jpg)

#### (3) codeitems的连续性,集中存储的特性,通过内存访问统计最终被发现.

![⚠️ 图片托管失败](upload/attach/202112/760871_ZE4XEB77YEAZ3ES.jpg)

![⚠️ 图片托管失败](https://bbs.kanxue.com/upload/attach/202112/760871_ZE4XEB77YEAZ3ES.jpg)

#### (4)某vmp指令由标准dalvik指令基础上略改而来,整体仍然保留了很多可用信息

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a337816b567eb551.png)

## 七.深入VMP还原的一些问题

> 略

## 八.调试与工具总结

#### 核心问题:

> 获取程序完整的执行&&数据信息 (trace).

#### 目前公开的主流的获取trace的方案:

> 1 GDB调试  
> 2 FridaStalker编译执行  
> 3 脱机unicorn模拟执行

#### 主流的获取trace的方案的弊端和缺陷:

> 1 IDA / GDB:  
> 速度极慢,且会遭遇反调试

> 2 FridaStalker  
> 不支持arm指令的thumb模式,且BUG多,  
> 遭遇vmp.so中的花指令时,基本无法正常使用.

> 3 PC上脱机unicorn模拟执行  
> vmp.so中存在大量jni call和system call,需要手动实现它们,unicorn才能完成运行.

#### 基于以上问题的尝试:

> 实现原始APP进程环境 && 原始context中,  
> 通过unicorn构造虚拟化CPU,  
> 执行目标function,获得trace,  
> 无已知检测和对抗手段,简单过anti.  
> ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/dbecc74621caf45d.png)

#### 基于trace进行离线分析:

> 1 trace形态可视化  
> 文本 / json / 数据库 / EXCEL可视化表格 / 动态CFG图

> 2 基本的分析  
> 地址含义解析 调用符号识别

> 3 程序分析  
> 污点分析 相似性分析等..

![⚠️ 图片托管失败](upload/attach/202112/760871_5CG4TCW9RQ7UC3W.jpg)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/567df682786dac65.png)

![⚠️ 图片托管失败](https://bbs.kanxue.com/upload/attach/202112/760871_5CG4TCW9RQ7UC3W.jpg)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d89014f1a858e4be.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/644e5a3139355d7d.png)
