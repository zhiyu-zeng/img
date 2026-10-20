---
title: 【看雪】tvm-recover：基于语义恢复与代数化简的 TVM 去虚拟化工具
source: https://bbs.kanxue.com/thread-293277.htm
source_host: bbs.kanxue.com
clip_date: 2026-10-20T09:39:30+08:00
trace_id: 5342587e-05b4-4342-8d5a-f307e197400a
content_hash: db2a5265381a1fa5d6abf67166b166641ed97615704f226986d6154f92bdab3b
status: synced
tags:
  - 看雪
  - 脱壳与加固
  - 安全工具
series: null
feed_source: 看雪·逆向工程
ai_summary: 用语义恢复加代数化简取代 SMT 求解，把 TVM（ACE 壳）的虚拟化代码恢复成 guest IR，再编译写回 PE 并附 PDB，供 IDA/Ghidra 继续分析。
ai_summary_style: key-points:weak
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 3ff75244-d011-810a-bdb2-e13d0585dab4
ioc: null
---

> 💡 **AI 总结（key-points:weak）**
>
> 用语义恢复加代数化简取代 SMT 求解，把 TVM（ACE 壳）的虚拟化代码恢复成 guest IR，再编译写回 PE 并附 PDB，供 IDA/Ghidra 继续分析。
> 
> - **动机：** 此前 jz0/tvm-devirt 即使提了多个 PR 也无法正确反虚拟化，常规 SMT 求解恢复耗时极长，而且问题很多。
> - **流程：** `.tvm0` → 语义提升与代数化简 → guest IR → LLVM 编译 → PE 写回 + PDB → IDA/Ghidra；几乎不用 SMT，主要依靠数学推导，速度较快。
> - **实测数据：** 在 `ACE-CORE.sys3` 上，121 个恢复函数完成编译，并通过与解释器的差分检查，另有 19 个候选因存在未决出口等原因未进入产物；新增代码位于 `.neko` 节区。
> - **可读性：** Ghidra 反编译结果能直接看到条件判断、寄存器更新与分支选择，`t_rcx/t_rdx/t_rax` 对应 guest 寄存器；大函数被拆成切片，由生成的调度器连接，返回值是后续切片编号，并非业务返回值。
> - **入口桥接：** 生成的 `tvm_payload_entry` 桩先运行分析 payload，再借助自身地址和保存的 RVA 跳回原入口，从而串出从原 PE 总入口到被保护初始化逻辑的调用链。
> - **局限：** 尚未达到“原始源码复原”，临时变量、运行时接口和调度痕迹仍在；修改后的驱动加载后会自行退出，作者无法进一步验证。

项目地址： [https://github.com/NeuroSaki987/tvm-recover](https://github.com/NeuroSaki987/tvm-recover)

> 给我个 Star 喵，想要 Star 喵，投喂猫猫喵~♥ ヾ(•ω•\`)o

由于 jz0/tvm-devirt 把我 **逼疯** 了， **提了一堆pr还是没法正确反虚拟化** 一些东西，而且通过常规的SMT求解会导致恢复时间极长，并且会有各种毛病。。。

`tvm` (`Tencent VM`)众所周知就是 `ACE` 的那个壳，咳咳，嗯，就是xx的 `Anti-Cheat F**ker(Expert)`

一堆Pr尝试拉屎修复↓  
![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/fc760325a81bcbfb.webp)

要是恢复结果能重新变成可运行的机器码，带上函数名、寄存器结构，再放进 Ghidra，后续分析会方便很多。

流程已经跑通： **恢复 guest 语义、化简混淆表达式、生成机器码，再写回 PE，配好 PDB。** 就能生成好看的函数了（ ~~依旧不好看~~ ）

### 而且没有用到特别烦人的 SMT 求解器喵~，几乎都是数学纯算出来的呢，很快的 ，还是比较准的喵

## 先看效果

  
可以看到函数被我塞了一堆名字（似乎没用）

图里新增的代码位于 `.neko` 节区。左侧可以看到恢复函数、分块调度器，以及内存访问等辅助函数；右侧是生成的入口桥接代码。

用的是项目里的 `ACE-CORE.sys3` 。这一批有 **121 个恢复函数完成编译，并通过与解释器的差分检查**，另外 19 个候选因未决出口等原因没有进入产物。

## 恢复后的代码长什么样

Ghidra 反编译，没做任何修改：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f9c180ee8a8e589c.webp)

这里已经可以直接看到条件判断、寄存器更新和分支选择。 `t_rcx/t_rdx/t_rax` 这些成员对应 guest 寄存器，分析时不用一直对着匿名 context 偏移猜含义。

较大的恢复函数会被拆成多个切片，再由生成的调度器连接起来。上面就是其中一片，所以返回的 `2/0x1d` 是后续切片编号，不是原函数的业务返回值。

效果当然还没有到“原始源码回来”的程度，临时变量、运行时接口和部分调度痕迹仍然存在。不过，能够在常用分析器里顺着结构化结果继续看代码，已经是我比较满意的一点。

## VMEntry 这里也接上了

配图右侧的入口代码如下，按 IDA 显示整理：

```cpp
NTSTATUS __stdcall tvm_payload_entry(
    PDRIVER_OBJECT DriverObject, PUNICODE_STRING RegistryPath)
{
    __int64 v2; // r8
    __int64 v6; // [rsp+60h] [rbp+18h]

    v6 = v2;
    sub_145F25720();
    return ((__int64 (__fastcall *)(
        PDRIVER_OBJECT, PUNICODE_STRING, __int64))
        ((char *)tvm_payload_entry + tvm_oep_rva - tvm_entry_rva))(
            DriverObject, RegistryPath, v6);
}
```

这里是工具生成的 **入口桥接桩**：新入口先运行分析 payload，再通过自身地址和保存的 RVA 找到原入口，把控制权交回去。

然后进一步分析就能得到

```python
0x140001184  原 PE 总入口
    ↓
0x140001060  初始化包装
    ↓
0x14000E140  跳板
    ↓
0x145C19A68  被保护的初始化逻辑入口
```

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5cc724a9309dc00a.webp)

完整逻辑：  

## 整体流程

整体流程可以概括成这一条：

```
.tvm0 → 语义提升与代数化简 → guest IR
      → LLVM 编译 → PE 写回 + PDB → IDA / Ghidra
```

前半段跟踪 guest 寄存器和内存的变化，化简调度过程中大量可以抵消的计算，恢复控制流；后半段把结果重新编译，并处理写回后的代码位置与符号对应关系。

PDB 在这里挺实用：把恢复阶段的名称和类型信息带进分析器，代码会比一堆 `sub_xxx` 和裸偏移更容易跟。大函数分块也是为了方便继续分析，相关控制流仍由生成调度器承载。

做了个小视频可以看看这个:

> YouTube： [https://youtu.be/zbj7j4YcajM?](https://youtu.be/zbj7j4YcajM?)

## 目前的状态

工具已经开源，可以输出恢复 listing，也能生成用于 IDA / Ghidra 分析的 PE 和 PDB  
~~也会摆烂直接不分析了甩锅给你~~ (doge)

它还不是与原驱动完全一样，修改后的驱动加载之后自己退出了很难办，我也没法验证，游戏进程不拉他就不启动。。。QwQ

> GitHub： [https://github.com/NeuroSaki987/tvm-recover](https://github.com/NeuroSaki987/tvm-recover)

相关研究参考了 jz0/tvm-devirt，llvm-project ❤️
