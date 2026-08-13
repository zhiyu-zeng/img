---
title: 【看雪】Arm静态分析引擎原理三 - 控制流构建基础
source: https://bbs.kanxue.com/thread-292482.htm
source_host: bbs.kanxue.com
clip_date: 2026-08-12T18:39:46+08:00
trace_id: e80bcd83-8289-4c39-884e-833bc7482e00
content_hash: f29e76c5ba8c1d8f18d3154fb6b27087750822b21bee87f9ff5514477e6cc9d0
status: synced
tags:
  - 看雪
  - Android逆向
  - 静态分析
series: null
feed_source: 看雪·Android安全
ai_summary: Arm 静态分析引擎构建控制流的核心是：先解析 ELF 识别多种分析入口，再用 worklist 递归向下建图，最后处理 jump table、vtable、blr 等特殊结构并回填入口，直到无新入口。
ai_summary_style: key-points:weak
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3bb75244-d011-81e4-a21d-f0f3ef3e63b2
ioc: null
---

> 💡 **AI 总结（key-points:weak）**
>
> Arm 静态分析引擎构建控制流的核心是：先解析 ELF 识别多种分析入口，再用 worklist 递归向下建图，最后处理 jump table、vtable、blr 等特殊结构并回填入口，直到无新入口。
> 
> - **入口类型：** 引擎把分析入口抽象为 `jd_entry_type`，包括 ENTRY_POINT_ENTER、.init/.fini、.init_array、符号表函数、IFUNC resolver、.plt、.eh_frame、C++ vtable、prologue scan，以及反汇编/分析过程中由 BL 和 BLR 指令发现的入口。
> - **控制流辅助判定：** 对 ARM64 指令实现多组判断函数：`jd_arm_a64_ins_has_target`（B/BC/BL/CBZ/CBNZ/TBZ/TBNZ）、`jd_arm_a64_ins_has_fallthrough`（条件 B/BC 有 fallthrough，RET/ERET 等没有）、`jd_arm_a64_ins_is_bb_end` 等；BRK 只有 `0xd4200000`（即普通 BRK，可能作为调试断点）时不终止块。
> - **noreturn 函数集合：** 定义了已知不返回函数名列表，如 `__stack_chk_fail`、`abort`、`__assert_fail`、`__cxa_throw`、`exit`、`pthread_exit`、`_Unwind_Resume` 等，当 BL 调用这些函数时，该 BL 作为 basic block 结束，不产生 fallthrough。
> - **构建方法：** 采用 worklist 迭代：从初始 worklist 中弹出元素处理，处理过程中可能把新数据推入 worklist，直到队列为空；新 function 的发现方式是 BL 到一个 PC，该 PC 被默认为一个新函数入口。
> - **规模与数据结构：** 30MB 左右的 so 可产生 700~800 万条指令，控制流图的 node 和 edge 达百万级，因此指令/CFG 存储结构、basic block 切分、function head 识别、fallthrough 到已知函数头结束块等细节非常重要。
> - **特殊控制结构：** ARM64 下主要是 jump table（switch case 多分支）、vtable（通过 vptr 和 RTTI 识别 C++ 成员函数）、blr（函数指针列表、结构体指针列表，难以完整识别）；识别后把新 PC 加入 worklist 继续递归，直到没有新入口。

接 [上文](https://bbs.kanxue.com/thread-292294.htm "上文") 。

当反汇编引擎完成之后，下一步就是对 ELF 建立控制流。

对于一个完整的 ELF 控制流分析引擎来说，通常可以拆分为以下几个部分：

1.  二进制加载器（Binary Loader）：解析 ELF，并识别初始分析入口
    
2.  递归向下（Recursive Descent）：从已知入口开始递归构建控制流
    
3.  特殊控制结构识别：处理普通递归向下难以覆盖的控制流结构，例如 jump table、br间接跳转等
    

其中，第一步决定了我们从哪里开始分析，第二步负责沿着控制流扩展，第三步则负责解决真实世界二进制中大量存在的特殊控制结构。

## 一、 elf 入口识别

Android App 中存在各种各样的 ELF。

除了使用 GCC/Clang 编译出来的标准 ELF 之外，还会遇到 Dart VM、Cocos2d、Unity3D 等各种大型运行时或游戏引擎生成的 ELF。

这里的elf入口其实是分析入口，因此，在 Rosemary 中，我将这些统一抽象成 analysis entry。

elf的入口定义：

```cpp
typedef enum jd_entry_type {
    ENTRY_POINT_ENTER = 0,
    ENTRY_POINT_INIT,          // .init
    ENTRY_POINT_FINI,          // .fini
    ENTRY_POINT_INIT_ARRAY,    // .init_array / .fini_array
    ENTRY_POINT_SYMBOL,        // 符号表中的函数符号
    ENTRY_POINT_IFUNC_RESOLVER,// IFUNC resolver
    ENTRY_POINT_PLT,           // .plt
    ENTRY_POINT_EH_FRAME,      // .eh_frame
    ENTRY_POINT_VTABLE,        // C++ vtable
    ENTRY_POINT_PROLOGUE_SCAN, // prologue scan
    ENTRY_POINT_ASSEMBLY_BL,   // 解码过程中发现的入口
    ENTRY_POINT_ASSEMBLY_BLR,  // 分析过程中发现的入口
} jd_entry_type;
```

其中BL和BLR是在递归向下的识别汇编指令的时候发现的。

## 二、递归向下构建控制流

递归向下的构建控制流的过程就是静态分析软件建模的过程。

这个过程中涉及到的东西有控制流的node、edge、end instruction、branch instruction、trap function

### 2.1 控制流构建的必要辅助方法

还是以ARM64举例，构建控制流需要的辅助方法就是arm的汇编代码的理解，如下：

```cpp
#ifndef GARLIC_JD_ARM_INSTRUCTION_H
#define GARLIC_JD_ARM_INSTRUCTION_H
 
// arm指令的jump target
static inline u8 jd_arm_a64_ins_target(jd_arm_ins *ins)
{
    jd_arm_tpl *tpl = INS_TPL(ins);
 
    switch (tpl->mnemonic_index) {
        case JD_ARM_A64_INS_B:
        case JD_ARM_A64_INS_BC:
        case JD_ARM_A64_INS_BL: {
            jd_arm_imm_operand *imm = jd_arm_get_oprand(ins, tpl->oprands[0]);
            u8 addr = jd_arm_value_to_u8(ins, imm->imm_value_index);
            return addr;
        }
        case JD_ARM_A64_INS_CBZ:
        case JD_ARM_A64_INS_CBNZ:
        {
            jd_arm_imm_operand *imm = jd_arm_get_oprand(ins, tpl->oprands[1]);
            u8 addr = jd_arm_value_to_u8(ins, imm->imm_value_index);
            return addr;
        }
        case JD_ARM_A64_INS_TBNZ:
        case JD_ARM_A64_INS_TBZ: {
            jd_arm_imm_operand *imm = jd_arm_get_oprand(ins, tpl->oprands[2]);
            u8 addr = jd_arm_value_to_u8(ins, imm->imm_value_index);
            return addr;
        }
        default: return 0;
    }
}
 
// 在递归向下的过程中，遇到哪些指令必须停止识别
static inline bool jd_arm_a64_ins_dfs_stop(jd_arm_ins *ins) {
    jd_arm_tpl *tpl = INS_TPL(ins);
    if (tpl == NULL)
        return true;
    switch (tpl->mnemonic_index) {
        case JD_ARM_A64_INS_UDF:
        case JD_ARM_A64_INS_RET:
        case JD_ARM_A64_INS_RETAA:
        case JD_ARM_A64_INS_RETAB:
        case JD_ARM_A64_INS_RETAASPPC:
        case JD_ARM_A64_INS_RETABSPPC:
        case JD_ARM_A64_INS_RETAASPPCR:
        case JD_ARM_A64_INS_RETABSPPCR:
        case JD_ARM_A64_INS_ERET:
        case JD_ARM_A64_INS_ERETAA:
        case JD_ARM_A64_INS_ERETAB:
        case JD_ARM_A64_INS_DRPS:
        case JD_ARM_A64_INS_BRAA:
        case JD_ARM_A64_INS_BRAB:
        case JD_ARM_A64_INS_BLRAA:
        case JD_ARM_A64_INS_BLRAB:
        case JD_ARM_A64_INS_SVC:
        case JD_ARM_A64_INS_HVC:
        case JD_ARM_A64_INS_SMC:
        case JD_ARM_A64_INS_HLT:
        case JD_ARM_A64_INS_DCPS1:
        case JD_ARM_A64_INS_DCPS2:
        case JD_ARM_A64_INS_DCPS3:
        case JD_ARM_A64_INS_BR:
        case JD_ARM_A64_INS_BRAAZ:
        case JD_ARM_A64_INS_BRABZ:
        case JD_ARM_A64_INS_WFET:
        case JD_ARM_A64_INS_WFIT:
        case JD_ARM_A64_INS_WFE:
        case JD_ARM_A64_INS_WFI:
            return true;
        case JD_ARM_A64_INS_BRK: {
            if (ins->code == 0xd4200000) {
                return false;
            }
            return true;
        }
        default: return false;
    }
}
 
// 哪些指令有下一条指令
static inline bool jd_arm_a64_ins_has_fallthrough(jd_arm_ins *ins)
{
    jd_arm_tpl *tpl = INS_TPL(ins);
    switch (tpl->mnemonic_index) {
        case JD_ARM_A64_INS_B: {
            // b.<cond>
            if (_lrs_eq(ins->code, 24, 8, 0x54))
                return true;
            return false;
        }
        case JD_ARM_A64_INS_BC: {
            if (_lrs_eq(ins->code, 24, 8, 0x54))
                return true;
            return false;
        }
        case JD_ARM_A64_INS_BR:
        case JD_ARM_A64_INS_BRAA:
        case JD_ARM_A64_INS_BRAB:
        case JD_ARM_A64_INS_BRAAZ:
        case JD_ARM_A64_INS_BRABZ:
        case JD_ARM_A64_INS_RET:
        case JD_ARM_A64_INS_RETAA:
        case JD_ARM_A64_INS_RETAB:
        case JD_ARM_A64_INS_RETAASPPC:
        case JD_ARM_A64_INS_RETABSPPC:
        case JD_ARM_A64_INS_RETAASPPCR:
        case JD_ARM_A64_INS_RETABSPPCR:
        case JD_ARM_A64_INS_ERET:
        case JD_ARM_A64_INS_ERETAA:
        case JD_ARM_A64_INS_ERETAB:
            return false;
        case JD_ARM_A64_INS_BL: {
            u8 target = jd_arm_a64_ins_target(ins);
            if (jd_bitmap_test(ins->region->noreturn_bitmap, target)) {
                return false;
            }
            return true;
        }
        default:
            return true;
    }
}
 
// 哪些指令有target
static inline bool jd_arm_a64_ins_has_target(jd_arm_ins *ins)
{
    jd_arm_tpl *tpl = INS_TPL(ins);
    switch (tpl->mnemonic_index) {
        case JD_ARM_A64_INS_B:
        case JD_ARM_A64_INS_BC:
        case JD_ARM_A64_INS_BL:
        case JD_ARM_A64_INS_CBZ:
        case JD_ARM_A64_INS_CBNZ:
        case JD_ARM_A64_INS_TBZ:
        case JD_ARM_A64_INS_TBNZ:
            return true;
        default:
            return false;
    }
}
 
static inline bool jd_arm_a64_ins_is_jump(jd_arm_ins *ins) {
    jd_arm_tpl *tpl = INS_TPL(ins);
    switch (tpl->mnemonic_index) {
        case JD_ARM_A64_INS_B:
        case JD_ARM_A64_INS_BC:
        case JD_ARM_A64_INS_BL:
        case JD_ARM_A64_INS_CBZ:
        case JD_ARM_A64_INS_CBNZ:
        case JD_ARM_A64_INS_TBZ:
        case JD_ARM_A64_INS_TBNZ:
            return true;
        default:
            return false;
    }
}
 
// 无条件跳转指令
static inline bool jd_arm_a64_ins_is_unconditional_jump(jd_arm_ins *ins)
{
    jd_arm_tpl *tpl = INS_TPL(ins);
    if (tpl->mnemonic_index == JD_ARM_A64_INS_B &&
        !_lrs_eq(ins->code, 24, 8, 0x54))
        return true;
 
    return false;
}
 
// 有条件跳转指令
static inline bool jd_arm_a64_ins_is_condtional_jump(jd_arm_ins *ins)
{
    jd_arm_tpl *tpl = INS_TPL(ins);
    switch (tpl->mnemonic_index) {
        case JD_ARM_A64_INS_B: {
            // b.<cond>
            if (_lrs_eq(ins->code, 24, 8, 0x54))
                return true;
            return false;
        }
        case JD_ARM_A64_INS_BC: {
            if (_lrs_eq(ins->code, 24, 8, 0x54))
                return true;
            return false;
        }
        case JD_ARM_A64_INS_CBZ:
        case JD_ARM_A64_INS_CBNZ:
        case JD_ARM_A64_INS_TBZ:
        case JD_ARM_A64_INS_TBNZ:
            return true;
        default:
            return false;
    }
}
 
// 方法调用的指令
static inline bool jd_arm_a64_ins_is_call_fuction(jd_arm_ins *ins) {
    jd_arm_tpl *tpl = INS_TPL(ins);
    return tpl->mnemonic_index == JD_ARM_A64_INS_BL;
}
 
// 哪些指令是basic block的结束
static inline bool jd_arm_a64_ins_is_bb_end(jd_arm_ins *ins)
{
    jd_arm_tpl *tpl = INS_TPL(ins);
    switch (tpl->mnemonic_index) {
        case JD_ARM_A64_INS_RET:
        case JD_ARM_A64_INS_RETAA:
        case JD_ARM_A64_INS_RETAB:
        case JD_ARM_A64_INS_RETAASPPC:
        case JD_ARM_A64_INS_RETABSPPC:
        case JD_ARM_A64_INS_RETAASPPCR:
        case JD_ARM_A64_INS_RETABSPPCR:
        case JD_ARM_A64_INS_ERET:
        case JD_ARM_A64_INS_ERETAA:
        case JD_ARM_A64_INS_ERETAB:
        case JD_ARM_A64_INS_B:
        case JD_ARM_A64_INS_BC:
        case JD_ARM_A64_INS_CBZ:
        case JD_ARM_A64_INS_CBNZ:
        case JD_ARM_A64_INS_TBZ:
        case JD_ARM_A64_INS_TBNZ:
            return true;
        case JD_ARM_A64_INS_BL: {
            // 调用所有nonreturn的必须是bb end
            u8 target = jd_arm_a64_ins_target(ins);
            if (jd_bitmap_test(ins->region->noreturn_bitmap, target))
                return true;
            return false;
        }
        default:
            return false;
    }
}
 
 
#endif //GARLIC_JD_ARM_INSTRUCTION_H
```

### 2.2 noreturn function

当发现指令调用下面这些函数的时候，比如bl 0x1234 // 0x1234是\__stack_chk_fail，那么这里应该是basic block的结束。

```cpp
static bool jd_known_noreturn_name(const char *name)
{
    if (!name) return false;
 
    return strcmp(name, "__stack_chk_fail") == 0 ||
           strcmp(name, "__stack_chk_fail_local") == 0 ||
           strcmp(name, "abort") == 0 ||
           strcmp(name, "__assert_fail") == 0 ||
           strcmp(name, "__cxa_throw") == 0 ||
           strcmp(name, "__cxa_rethrow") == 0 ||
           strcmp(name, "std::terminate") == 0 ||
           strcmp(name, "_ZSt9terminatev") == 0 ||
           strcmp(name, "exit") == 0 ||
           strcmp(name, "_exit") == 0 ||
           strcmp(name, "_Exit") == 0 ||
           strcmp(name, "__fortify_fatal") == 0 ||
           strcmp(name, "__android_log_assert") == 0 ||
           strcmp(name, "pthread_exit") == 0 ||
           strcmp(name, "_Unwind_Resume") == 0;
}
```

### 2.3 构建

构建控制流最经典的方法就是worklist

```cpp
worklist = {data1, data2, ...}
 
while worklist != NULL:
    x = pop(worklist)
    if y = deal_with(x)
      push(queue, y)
```

上面的3个步骤就是构建elf控制流的基础方法，这里还有很多很多细节，例如

**instruction/cfg的存储结构**

一个30M左右的so，能产生的指令会有700～800w条，控制流图的node和edge也百万级别的，因为构建过程中需要查询，所以数据结构十分十分重要。

**basic block的切分**

控制流jump到一个已知的node的情况

**function head的识别**

fallthrough到一个function head到时候是需要停掉分析，结束basic block的

**new function的发现**

bl到一个pc，那么这个pc就默认为一个function

## 三、特殊结构的识别

在arm64中，特殊结构只有下面几种

**jumptable**

jumptable就是编译器在编译switch case时候的codegen，在case少的情况下，可能会被编译器优化成branch，case多的情况下，就是jumptable

**vtable**

vtable是c++的类的编译产物，主要识别vptr，通过vptr和runtime type info来识别c++成员函数。

**blr**

blr就分为非常非常多的情况了，比如函数指针列表，结构体内的指针列表这些，blr没有办法完完整整的识别出来，即使做了IR，也是非常非常难做的。

这些特殊结构识别完成后，继续将识别出来的pc加入到第二个步骤的worklist里，继续递归，直到没有任何新的入口为止

\----------------

用该引擎实现的二进制的静态分析在: [https://github.com/neocanable/garlic](https://github.com/neocanable/garlic) 里面，欢迎试用，欢迎pr
