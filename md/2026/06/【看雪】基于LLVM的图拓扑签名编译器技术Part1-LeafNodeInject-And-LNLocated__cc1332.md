---
title: 【看雪】基于LLVM的图拓扑签名编译器技术Part1-LeafNodeInject And LNLocated
source: https://bbs.kanxue.com/thread-291736.htm
source_host: bbs.kanxue.com
clip_date: 2026-06-21T21:38:19+08:00
trace_id: 4a5bcabc-661d-4c01-ad09-2c341b523c38
content_hash: 06c3d5f27dde3993c875d2dd0a1859bc7f1bf4211fbf879a00c9330b9c3d3847
status: summarized
tags:
  - 看雪
series: null
feed_source: 看雪·逆向工程
ai_summary: 基于LLVM IR层插入抗优化特征指令序列（SAS）的方法，解决了传统拓扑水印在编译优化下被静默消除的难题，为构建可靠的软件水印定位机制提供了基础。
ai_summary_style: key-points
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 38675244-d011-814a-a82c-e93ab09ae507
---

> 💡 **AI 总结（key-points）**
>
> 基于LLVM IR层插入抗优化特征指令序列（SAS）的方法，解决了传统拓扑水印在编译优化下被静默消除的难题，为构建可靠的软件水印定位机制提供了基础。
> 
> - **注入点选择：** 首选CFG中的叶子节点（包含`ret`指令，出度为0）作为注入位置，因其不影响正常执行路径且对原CFG结构改动最小。
> - **核心抗优化设计：** 植入的SAS特征序列（含`volatile load/or/store/xor`等指令）全部使用`volatile`修饰，以阻止SCCP、GVN等优化Pass将其推导为常量或消除，确保在`-O2`下仍能保留。
> - **注入与接驳流程：** 将目标叶子块`splitBasicBlock`拆分为原始前驱段和包含`ret`的尾块；在前驱段末尾植入SAS后，替换其末尾跳转为指向一个`unreachable`哨兵块的、条件永假的`condBr`指令，从而在不影响正常返回的前提下隐藏特征。
> - **定位与提取机制：** 提取端通过静态分析框架解析二进制反汇编文本，使用状态机匹配预设的SAS五指令模式，并依据`store`指令的目标地址对提取的nibble值进行排序和拼接，最终通过XOR校验还原并验证水印。
> - **后续演进方向：** 当前方案的nibble值以明文存在于`or`指令中，Part2计划将其升级为双层水印体系，即SAS仅作为定位锚点，真正的水印信息将编码进其后所接驳的CFG拓扑子图的形状中。

大家好我是TeddyBe4r, 好久不见，这次给大家带来，图拓扑编译器开发指南。  
本文是图拓扑签名系列的第一篇，介绍叶子节点注入（LeafNode Inject）和定位（LN Located）的完整实现思路与工程细节。后续 Part2 将在此基础上引入拓扑形状编码，构建双层水印体系。具体代码考虑在写完系列之后再开源V2或者部分V3版本的。扫描器因为有自己的静态分析框架所以不打算开源，大家只能自己研发扫描器了可能需要自己实现一个IR提升加CFG重建。ICFG以及一些优化。

## 0x00 背景与动机

软件水印是版权保护和溯源追踪的重要手段。传统的字符串水印、常量水印很容易被静态扫描识别并手动抹除。基于控制流图（CFG）拓扑结构的水印方案理论上更难被简单 patch，但实现复杂，且容易被编译器优化静默消除。

之所以选择在 LLVM Pass 层做，是因为能在 IR 级别操控 CFG，比在二进制层 patch 更干净，也不依赖特定架构。

之前尝试过一版纯拓扑水印（通过 dummy 子图的形状编码 nibble），遇到的核心问题是：

-   `SimplifyCFG` 会把 always-false 的条件分支识别出来直接删掉
-   `SCCP` 看到全局变量的初始值是常量，直接推导出跳转目标，整个 dummy 子图被静默抹除
-   就算加了 `volatile` ，部分优化 pass 仍然会破坏形状
-   其实我开始做的纯GraphDiff的版本不能稳定在工程上使用因为LLVM的DAG OPT太操蛋了，要改源码树等等， 于是就没有写这个方案，纯DIFF是很牛逼的但是实现起来需要废掉DAG OPT或者集成到DAG的OPT里面去需要改动源码树有一点不友好所以就没有用这个方案,这篇文章采用了特征法肯定没有纯粹的拓扑信息那么完美但是通用性就高很多了。

这一版（Part1）的思路是 **退一步** ：先解决"注入后能不能在二进制层可靠找到"的问题，把定位和编码解耦。定位用特征指令序列（SAS），编码留给后续 Part2 的拓扑形状，我一共写了三版

1.  V1 特征水印
2.  V2 纯拓扑 Graph Diff
3.  V3 混合

## 0x01 整体架构

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/85f79fb679693d57.webp)

主要架构是分为两个端的

1.  LeafNode Inejctor LLVM端负责注入sign
2.  LeafNode Scanner 我自己写的跨平台静态分析框架写的  
    这里我们选取LeafNode 只是单纯方便，毕竟实验性的东西，要是用非LeafNode其实技术上也能做到，只不过需要判断真假 Branch.详细的解释我放在后面讲  
    两端完全解耦，注入端只管写，提取端只管扫，不共享任何运行时状态。

## 0x02 叶子节点注入（LeafNode Inject）

### 为什么选叶子节点

CFG 里的叶子节点（outDegree=0，即含 `ret` 指令的块）是注入的理想位置：

1.  不影响正常执行路径——正常流程沿 `false` 分支走原来的 `ret`
2.  叶子节点是函数的自然终点，注入代码不会被循环反复执行，副作用可控
3.  `splitBasicBlock` 后叶子的前半段保留所有原始指令，结构清晰

和选 outDegree=1 的中间块相比，叶子节点不会影响后续块的前驱关系，引入的 CFG 变化最小。但是说实话我分析了DAG的OPT找到了更好的方法去做这个事情等我完全版的时候就会把纯粹的Graph DIff 加上去但是工作量太大了，对于一个人来说属实不太友好。

### SAS 的设计

SAS（Signature Access Sequence）是植入叶子节点的特征指令序列，由 3 个 volatile 操作构成：

```python
volatile load  @gs_wm_key             ; op-1：哨兵读，定位锚点
or  %loaded, nibble                   ; op-2：编码运算，低4位是水印值
volatile store %encoded, @gs_wm_val_N ; op-3：编码写
xor %encoded, 0xA5A5A5A5              ; 校验运算
volatile store %checked, @gs_wm_val_N ; op-4：校验写（覆盖）
```

全部标记 `volatile` 的原因是阻止 SCCP 和 GVN 把全局变量推导为编译期常量。之前没有 `volatile` 的版本在 `-O1` 下会被整个消除，加了之后 `-O2` 也能保留。

校验写的目的是让提取端能够验证结构完整性： `enc XOR 0xA5A5A5A5 == chk` ，如果二进制被 patch 过，这个等式大概率不成立。

### 注入流程

注入流程分四步。  
**第一步，找叶子节点**  
Pass 遍历函数里所有 BasicBlock，筛选条件是 terminator 为 ReturnInst 且后继数为 0。这类块是函数的自然出口，注入后只需在末尾追加代码，不会影响前驱块的跳转关系，是改动最小的注入点。  
**第二步，split 叶子块**  
对选定的叶子块调用 splitBasicBlock，以原来的 ret 指令为分割点，把块拆成两半。前半段保留所有原始指令，末尾由 split 自动插入一条无条件跳转到后半段（leafTail）；后半段只含原来的 ret。这一步必须在创建 sentinelBB 之前完成，否则中间窗口期会有无 terminator 的空块挂在函数上，pass-pipeline 内联验证器会直接崩溃。  
**第三步，植入 SAS**  
在前半段末尾的无条件跳转之前，插入特征指令序列。先 volatile load @gs\_wm\_key 作为定位锚点，接着 or %k, nibble 把水印值编码进低4位，然后 volatile store 写入 @gs\_wm\_val\_N，再 xor 0xA5A5A5A5 做校验运算，最后再 volatile store 覆盖写一次。五条指令全部或依赖 volatile，SCCP 和 GVN 均无法推导其值，DCE 也无法消除。  
**第四步，替换 terminator，接入 sentinelBB**  
创建 sentinelBB，内部只有两条指令：volatile store 0xC0FFEE00|(idx<<8) → @gs\_wm\_magic 和 unreachable。然后把前半段末尾 split 插入的无条件跳转删掉，换成 condBr(always\_false, sentinelBB, leafTail)。always-false 条件的构造方式是 volatile load @gs\_cv，平方后与 0 比较小于，平方永远非负所以条件永远为 false，但因为 load 是 volatile 的，SCCP 看不到这个结论，无法删掉 sentinelBB 分支。  
至此注入完成，原始函数行为不变，leafTail 的 ret 是唯一实际执行的出口，这里的FakeBranch 也可以换成其他的可控随机行为作为跳转条件甚至你想还可以加上MBA混淆使其FakeBranch更不容易被识别，我举几个例子

1.  随机栈地址取值 有残值的情况
2.  恒等式
3.  .text段  
    

`condBr` 的条件是 `sq = gs_cv * gs_cv; sq < 0` （平方永远非负，所以永远 false）， `gs_cv` 也是 `volatile` 的，阻止 SCCP 推导。

### 全局变量布局

| 变量名 | 初始值 | 用途  |
| --- | --- | --- |
| `@gs_wm_key` | `0xDEAD5A5A` | 水印区识别 tag，SAS 定位锚点 |
| `@gs_wm_val_N` | `0` | 第 N 个 nibble 的编码槽 |
| `@gs_wm_magic` | `0xC0FFEE00` | sentinel 完整性 magic |
| `@gs_cv` | `1` | always-false 条件的 volatile 源 |

### LLVM Pass 实现坑点(全部是踩得坑务必注意)

**叶子节点收集：**

```cpp
for (BasicBlock& BB : F) {
    Instruction* term = BB.getTerminator();
    if (term && term->getNumSuccessors() == 0 && isa<ReturnInst>(term))
        leaves.push_back(&BB);
}
```

**splitBasicBlock 时序问题：**

必须先 split，再创建 sentinelBB。如果先创建 sentinelBB 再 split，中间窗口期会有一个无 terminator 的空块挂在函数上，pass-pipeline 内联验证器会崩溃。

```cpp
// 正确顺序
BasicBlock* leafTail = leaf->splitBasicBlock(retInst, ...);
// split 完成后再创建
BasicBlock* sentinelBB = BasicBlock::Create(Ctx, sentinelName, &F);
```

**多 nibble 复用同一叶子：**

当叶子节点数量少于需要的 nibble 数时，会对同一个叶子反复注入。每次注入都对上一次注入产生的 `leafTail` 继续操作，结果是叶子块被拆成多段，每段末尾各挂一个 sentinelBB。这是当前实现的一个限制，Part2 会改成每个叶子只注入一次。

## 0x03 叶子节点定位（LN Located）

提取端运行在自研的静态分析框架上，输入是 `.llir` 格式的反汇编文本，框架解析后得到 `CCFG` / `CBasicBlock` / `CInstruction` 的内存表示。

### 为什么不用 sentinel 块定位

最初设计里 sentinel 块（含 `mov gs_wm_magic, 0xC0FFEExx` 的不可达小块）是定位入口。但实测发现，当同一个叶子节点被注入多次时，多个 sentinel 块在编译后会被合并到同一个连续区域，不再是独立的小块，前驱关系也变得混乱。

所以放弃 sentinel 定位，改为 **直接扫 SAS 模式** 。

### SAS 模式识别

`.llir` 使用 Intel 语法，操作数在 `m_vecOperands[0].m_strRaw` 里是整串，格式如：

```
mov eax, dword ptr [$+602058h]   ; load gs_wm_key
or  eax, 0Dh                     ; nibble = 0xD
mov dword ptr [$+60208Ch], eax   ; store encoded
xor eax, -5A5A5A5Bh             ; XOR mask（补码 = 0xA5A5A5A5）
mov dword ptr [$+60208Ch], eax   ; store checked
```

因为一直感觉自己写的静态分析框架够用就一直用的Intel语法代替的IR,所以会看到形似汇编的东西，但是实际上汇编已经包含了一些信息，我的LLIR还增加了一些其他的东西 用于提升更多的语义细节，所以看到我的IR和Intel语法类似不要惊讶。  
几个解析细节,这里实现上的细节还是要看一下的：

-   十六进制带 `h` 后缀，需要专门的解析函数
-   XOR mask 在 `.llir` 里是 `-5A5A5A5Bh` （有符号补码），解析时要处理负号
-   内存地址格式是 `[$+xxxxxxh]` ，取括号内 `$+` 后的十六进制作为地址 key

用状态机按顺序匹配这5条指令：

```python
IDLE → mov reg, [key_addr]      → LOAD_FOUND
     → or  reg, imm(≤0xF)      → OR_FOUND
     → mov [val_addr], reg      → STORE1_FOUND
     → xor reg, 0xA5A5A5A5     → XOR_FOUND
     → mov [val_addr], reg      → 记录 SASRecord，回 IDLE
```

任何一步不匹配都回到 `IDLE` 重新开始，避免误判。

### payload 还原

每条 SASRecord 里有：

-   `valAddr` ： `gs_wm_val_N` 的地址（区分不同 nibble 槽）
-   `nibble` ：从 `or eax, 0xN` 直接读到的值

按 `valAddr` 数值升序排列（ `60208C` < `602090` < `602094` < `602098` ），对应 nibble 0~3，拼接得到完整 payload。

去重处理：同一 `valAddr` 在多个函数里重复注入时只保留第一次出现的记录。

### 实测结果

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/f7ef8e3546bbbeda.webp)

4个 nibble 全部还原， `structOK=YES` ，XOR 校验通过。

## 0x04 抗优化分析

| 优化 Pass | 影响  | 应对  |
| --- | --- | --- |
| SCCP | 推导全局变量为常量 | `volatile` 阻止 |
| GVN | 消除冗余 load | `volatile` 阻止 |
| SimplifyCFG | 删除 always-false 分支 | `volatile` 阻止条件推导 |
| DCE | 删除无用 store | `volatile` store 不可消除 |
| InstCombine | 折叠 `or` 立即数 | nibble 仍在操作数里 |

`-O2` 实测 SAS 序列完整保留，EXE 体积仅增加约 200 bytes（相对 12864 bytes 的基准）。

## 0x05 局限性与下一步

**当前局限：**

-   SAS 里的 nibble 是明文存在 `or` 指令的立即数里，静态分析器轻松读到，攻击者也一样
-   同一叶子节点多次注入会导致 sentinel 块合并，定位逻辑退化
-   单函数只有一个叶子节点时，所有 nibble 都堆在同一个块里，缺乏分散性

**Part2 计划：**

SAS 退化为纯定位锚点（ `or eax, 0` 不携带有效 nibble），真正的 nibble 编码进 `condBr` 之后的 **CFG 拓扑子图形状** （复用 v2 的 `DummySubgraph` 方案）。攻击者即使找到 SAS 序列并读出立即数，拿到的也只是无意义的 0，真正的水印在形状里。

V3的双层结构：

```python
SAS（定位） + 拓扑形状（编码）= 完整水印
```

缺一不可，提取器必须同时理解两套机制才能还原 payload。

### 声明：图是AI画的

[#调试逆向](https://bbs.kanxue.com/forum-4-1-1.htm) [#系统底层](https://bbs.kanxue.com/forum-4-1-2.htm) [#软件保护](https://bbs.kanxue.com/forum-4-1-3.htm) [#加密算法](https://bbs.kanxue.com/forum-4-1-5.htm)
