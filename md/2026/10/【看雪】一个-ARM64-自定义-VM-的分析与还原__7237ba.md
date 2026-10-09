---
title: 【看雪】一个 ARM64 自定义 VM 的分析与还原
source: https://bbs.kanxue.com/thread-293114.htm
source_host: bbs.kanxue.com
clip_date: 2026-10-10T00:03:26+08:00
trace_id: b11fae65-9e1a-4f44-acfd-9b5f24391600
content_hash: b3e5ddb1d19e6891c831879d6f4f4d3b658ac6b4ec4a9ea1cb9a2aaa62c79741
status: synced
tags:
  - 看雪
  - Android逆向
  - 模拟执行
series: null
feed_source: 看雪·逆向工程
ai_summary: 面对 ARM64 上叠加控制流平坦化的自定义 register VM，逐层恢复 PC、寄存器、descriptor、ISA 与 HOSTCALL，并用自研 Clean VM 验证语义，最终实现 C-like 反编译器。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3f475244-d011-81a4-8c61-c3b4794349f7
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 面对 ARM64 上叠加控制流平坦化的自定义 register VM，逐层恢复 PC、寄存器、descriptor、ISA 与 HOSTCALL，并用自研 Clean VM 验证语义，最终实现 C-like 反编译器。
> 
> - **识别特征：** 大函数读外部 buffer、cursor 按 4/5/7/11 等不同长度推进、频繁 `base + index*8` 访问 → 判定为变长指令 register VM。
> - **第一个坑：** `LDR table[idx]; BR` 常是 CFF dispatcher 而非 opcode 表；判据是 index 来源是否读 bytecode、是否更新 VM PC，判错会导致整套 opcode→handler 错位。
> - **PC 与跳转表恢复：** 用 ELF `R_AARCH64_RELATIVE` 重定位补全静态为 0 的表项；PC 需三条证据（参与 code 地址计算、handler 增量匹配指令长度、branch 直接覆盖）。
> - **语义陷阱：** 窄写入只改低 32 位保留高位；LOAD/STORE 可能只是 operand 提取，真实语义或为带宽度控制的有符号乘法；opcode 命名需 handler、descriptor、bytecode、dataflow、emulator 五重证据。
> - **反编译原则：** Clean VM 先置 fallthrough PC 再执行；JMP 属 CFG、CALL 属 callgraph 必须分离；phi 在结构化前不可删；类型恢复坚持证据优先，宁可输出 `uint64_t *`。

## 0x00 前言

前段时间分析一个 Android ARM64 程序时，在 native 层遇到了一套自定义虚拟机。

程序中有一部分逻辑没有直接编译成普通 ARM64 指令，而是先转换成一套私有 bytecode，运行时由 native 层解释器负责执行。

为了避免文章和具体产品、厂商或商业项目产生关联，本文对样本名称、函数地址、内部协议名称、常量、字符串以及部分结构信息进行了匿名化处理。

文中使用：

```
libtarget.so
sample_vm.bin
```

分别代指 native runtime 和 VM program。

本文只讨论：

```
如何定位 VM

如何从控制流混淆中提取 VM 状态

如何恢复指令格式和 descriptor

如何恢复 ISA

如何验证 opcode 语义

如何实现一套独立的 Clean VM

如何做函数发现、CFG、SSA

如何最终生成 C-like 伪代码
```

最初的目标只是看懂解释器。

最后实际做成了：

```
VM Container
      ↓
Parser
      ↓
Decoder
      ↓
VM Emulator
      ↓
Function Discovery
      ↓
CFG / IR
      ↓
SSA / Dataflow
      ↓
Structurer
      ↓
Type Recovery
      ↓
C-like Decompiler
```

整个过程中最值得记录的并不是某一条特殊指令，而是从“一个看起来完全无法阅读的解释器”，逐步重新建立一套 machine model 的过程。

* * *

## 0x01 这个 VM 的逆向难在哪

如果只看最终结果，这套 VM 好像就是：

```
找 opcode
    ↓
给 opcode 命名
    ↓
写解释器
    ↓
写反编译器
```

实际分析时远没有这么线性。

真正困难的地方，是几层不同的问题同时叠在一起：

```
ARM64 native
    +
Control Flow Flattening
    +
未知 VM state
    +
未知 bytecode format
    +
未知 descriptor
    +
未知 ISA
    +
未知 Host ABI
    +
未知函数边界
```

其中任意一层判断错了，错误都会向后传递。

例如：

```
dispatcher 判断错
    ↓
opcode / handler 对应错
    ↓
ISA 错
    ↓
emulator 错
    ↓
CFG 错
    ↓
最终伪代码虽然能生成
但语义已经不是原程序
```

所以这次逆向最麻烦的并不是“ARM64 汇编难看”，而是 **必须不断区分哪些东西是 VM 本身，哪些只是 VM 外面的实现噪声**。

* * *

## 1\. OLLVM Dispatcher 和 VM Dispatcher 叠在一起

这是最早遇到，同时也是最容易把整个方向带偏的难点。

解释器本身已经是：

```
bytecode
    ↓
opcode
    ↓
VM dispatcher
    ↓
handler
```

但 native 编译结果外面又套了 Control Flow Flattening：

```
native block
    ↓
flattening state
    ↓
CFF dispatcher
    ↓
native block
```

于是实际看到的是两层“状态机”套在一起：

```text
                ┌─────────────────┐
                │   CFF State     │
                └────────┬────────┘
                         │
                         ▼
                 CFF Dispatcher
                         │
                         ▼
                 Native Basic Block
                         │
                         ▼
                     VM Logic
                         │
                         ▼
                     VM State
```

两层都有：

```
table
index
indirect branch
state update
```

所以单纯看到：

```
LDR Xn, [table, index]
BR  Xn
```

几乎无法判断它究竟是哪一层 dispatcher。

这里真正需要判断的是：

```
index 的来源是什么？

跳转目标有没有读 bytecode？

有没有访问 VM register？

有没有更新 VM PC？
```

而不是看某几条汇编“长得像不像 VM”。

* * *

## 2\. 指令语义和 Operand Extraction 被拆开了

第二个难点是：

> handler 中看到的 native 操作，不一定就是 opcode 的真正语义。

很多 opcode 在真正计算之前，都要经过公共逻辑：

```
解析 descriptor
      ↓
取得 register index
      ↓
读取 register
      ↓
符号扩展 / 零扩展
      ↓
得到 operand
      ↓
真正执行 opcode
```

如果只截取其中一部分，很容易把：

```
operand extraction
```

误认为：

```
opcode semantics
```

这次实际就出现过：

```
看到 LOAD / STORE
       ↓
认为是 indirect memory instruction
```

后来通过完整 handler、descriptor、真实 bytecode 和 emulator 对照，才发现真正语义其实是一个带宽度控制的有符号乘法。

所以这种 VM 很难靠：

```
“IDA 里看到几条指令 → 直接给 opcode 起名字”
```

恢复准确。

* * *

## 3\. Descriptor 让“一条 Opcode”拥有多种形态

如果 VM 是最简单的：

```
1 byte opcode
+
固定 operand
```

分析会容易很多。

但这里 descriptor 同时影响：

```
operand mode

source width

destination width

immediate/register

instruction length
```

于是同一个 arithmetic family 可能表现为：

```
8-bit source  → 32-bit destination

16-bit signed source → 64-bit destination

register source

immediate source
```

如果 descriptor 少理解一个 bit，后面就可能出现：

```
operand 解错
PC 长度错
下一条 instruction boundary 错
整个函数随后全部错位
```

所以 bytecode decoder 本身就是逆向里的核心部分，而不是辅助工作。

* * *

## 4\. 静态分析很难证明语义真的正确

很多 opcode 在静态分析阶段可以达到：

```
“我有 90% 把握它是这个意思”
```

但 VM 逆向的问题在于：

> 90% 对一个解释器是不够的。

因为一条基础指令的微小误差，会影响后面的所有代码。

一个典型例子是寄存器窄写入。

第一版解释器把：

```
32-bit write
```

理解成：

```c
reg = (uint32_t)value;
```

从 C 的角度看非常自然。

但原 VM 实际语义是：

```
只改低 32 位
高 32 位保持不变
```

于是两种实现只差高 32 位，却能让后续调用参数完全改变。

这种问题靠“看起来合理”很难发现。

真正暴露它的是 Clean VM 跑真实 bytecode 时结果开始异常。

因此这次分析很大一个难点其实是：

```
怎么证明自己恢复出来的 VM
真的和原 VM 是同一颗 CPU
```

* * *

## 5\. HOSTCALL 是另一套未知 ABI

即使把：

```
MOV
ADD
CMP
JMP
CALL
RET
```

全部恢复出来，也只解决了 VM 内部计算。

真正让 VM 和外部世界交互的是：

```
HOSTCALL
```

而 Host Interface 本身又是一套新的未知 ABI：

```
service id 是什么

参数从哪里取

返回值放哪里

哪些参数是 pointer

哪些参数是长度

是否存在动态 provider

是否还能调用 native function pointer
```

如果 HOSTCALL 不恢复，最终代码永远会停留在：

```c
hostcall_xxx(a, b, c);
```

ISA 虽然已经理解，但程序本身依旧不好读。

所以 VM 逆向其实包含两套系统：

```
Virtual ISA
+
Host ABI
```

两个都要恢复。

* * *

## 6\. VM 中没有天然的函数边界

普通 ELF 至少还有：

```
symbol
prologue
epilogue
relocation
exception metadata
```

可以辅助识别函数。

bytecode 里可能只有一大块：

```
00 14 05 ...
17 28 ...
...
```

其中：

```
JMP target
```

和：

```
CALL target
```

看起来都只是跳到另一个 offset。

但前者代表：

```
同一函数里的 basic block
```

后者代表：

```
新的函数入口
```

如果把 CALL target 当成 CFG successor，多个函数就会被错误合成一个巨大函数。

反过来，如果把普通 branch 当 CALL，又会制造大量假函数。

所以 function discovery 自身也是一个独立问题。

* * *

## 7\. CALL_REG 会让静态调用图断掉

直接调用：

```
CALL 0x1234
```

很容易恢复。

但：

```
CALL_REG r15
```

目标来自寄存器。

如果不做 symbolic/dataflow propagation，调用图到这里就断了。

而调用图一旦缺失，后面的：

```
函数签名恢复

参数类型传播

helper 识别

跨函数对象恢复
```

都会受到影响。

因此间接调用恢复并不是“锦上添花”，而是静态反编译能不能继续往上走的基础。

* * *

## 8\. “能反汇编”和“能反编译”之间差得非常远

ISA 恢复以后，可以很快得到：

```
MOV
ADD
CMP
Jcc
CALL
RET
```

这时候从 VM 逆向角度来说已经取得了很大进展。

但实际阅读一个几百甚至上千条 VM 指令的函数时，仍然非常困难。

因为里面充满：

```
物理 register 搬运

frame 操作

PUSH_ARG

临时值

CALL ABI

HOSTCALL wrapper
```

真正的高级逻辑只占一部分。

所以要继续跨越：

```
VM asm
   ↓
IR
   ↓
SSA
   ↓
CFG structuring
   ↓
type recovery
   ↓
C-like
```

每一层其实都是一个独立的编译器问题。

* * *

## 9\. 复杂 CFG 比 Opcode 更难收尾

简单的：

```
if
if/else
while
```

并不算太难。

真正麻烦的是：

```kotlin
nested loop

multi-exit loop

early return

break / continue

多个 merge point

间接调用混入控制流
```

这种 CFG 如果强行结构化，很容易生成：

```c
while (...) {
    ...
}
```

但其实改变了原始控制流。

所以后期一个重要原则是：

> 宁可保留局部 goto，也不能生成漂亮但错误的结构。

这也是为什么反编译器后期最重要的指标并不是“有没有 goto”，而是：

```
CFG 是否正确
```

* * *

## 10\. SSA 错一次，最终 C 可能看起来完全正常

这是比较隐蔽的难点。

假设两个分支分别产生：

```
value_A
value_B
```

在 merge block 汇合。

正确应该是：

```
phi(value_A, value_B)
```

如果 cleanup 阶段错误删掉其中一个 definition，最终代码仍然可能语法完全正常：

```c
if (cond)
    result = A();

use(result);
```

但 else 分支的值已经丢了。

这种错误比：

```
local_68
```

名字不好看严重得多，因为它改变程序语义。

所以反编译器越往后，真正难的东西反而从 opcode 转向：

```
SSA correctness
CFG correctness
definition/use correctness
```

* * *

## 11\. 类型恢复不能为了“像 C”而过度推断

最后一个比较明显的难点是类型。

VM 中首先看到的是：

```
64-bit register slot
```

而不是：

```c
char *
size_t
SomeStruct *
```

同一个 register 在不同时间甚至可能分别装：

```
pointer
integer
boolean
return value
```

栈上的对象也可能同时存在：

```
struct

union

overlay

array tail

mixed-width fields
```

而跨函数传播更危险。

例如：

```c
foo(&obj);
```

不能单凭这一处就推断：

```c
foo(SomeStruct *obj);
```

因为另一个 callsite 可能是：

```c
foo(&obj.field_08);
```

所以这套反编译器后期采用的是保守策略：

```
所有 callsite
都提供一致的强证据
        ↓
才提升类型
```

宁可输出：

```c
uint64_t *arg;
```

也不要输出一个错误但看起来很漂亮的结构体类型。

* * *

## 难点总结

如果简单归纳，这次分析的难点大概可以分成四层：

| 层次  | 主要难点 |
| --- | --- |
| Native 层 | CFF、间接跳转、relocation、真实 semantic block 定位 |
| VM 层 | PC、register、descriptor、instruction boundary、ISA |
| Runtime 层 | HOSTCALL ABI、CALL/RET、CALL_REG、执行语义验证 |
| Decompiler 层 | 函数发现、CFG、SSA、结构化、对象和类型恢复 |

所以这类 VM 真正难的不是：

```
opcode 数量很多
```

而是：

```
每一层都缺少 specification
```

分析者需要自己逐层建立：

```
假设
 ↓
证据
 ↓
实现
 ↓
真实 bytecode 验证
 ↓
发现反例
 ↓
修改模型
```

这也是后面为什么 Clean VM 会成为整个分析里的关键节点。

它第一次让：

```
“我认为这个 ISA 是这样”
```

变成：

```
“我按这个 ISA 重写了一颗 VM，
真实程序确实能按照它执行”
```

* * *

## 0x02 从哪里判断这里存在 VM

一开始只看 native 层，其实很难直接断定它就是一个 VM。

普通程序同样可能存在：

```
大 switch
状态机
函数指针表
间接调用
事件 dispatcher
```

所以我的判断主要来自几个特征同时出现。

首先，一个很大的 native 函数被频繁调用，而且输入中明显包含一块外部数据。

函数内部持续出现：

```
读取某个 cursor
从同一块 buffer 取数据
根据取出的值执行不同路径
更新 cursor
回到公共执行点
```

抽象以后非常像：

```c
while (running)
{
    opcode = code[pc];

    execute(opcode);

    pc = next_pc;
}
```

第二个特征是出现了明显的“虚拟寄存器区”。

很多路径都在访问类似：

```c
base + index * 8
```

而 index 来自 bytecode 中的小整数。

这就很像：

```c
vm->regs[index]
```

第三个特征是不同 semantic block 的尾部会用几个固定长度更新 cursor。

例如：

```
pc += 4
pc += 5
pc += 7
pc += 11
```

不同 opcode 的长度不同，但最后都会把新的 PC 写回同一个 context。

这几个特征组合在一起以后，基本可以确定：

> 这不是普通状态机，而是一套变长指令的 register VM。

* * *

## 0x03 第一个坑：把 CFF Dispatcher 当成 VM Dispatcher

真正开始分析解释器后，第一个误判很快就出现了。

在函数中可以看到大量：

```
LDR     X9, [X21, W8, UXTW #3]
BR      X9
```

这种结构。

从表面看：

```
index
  ↓
table[index]
  ↓
BR target
```

特别像经典的 VM opcode dispatch：

```c
handler = handler_table[opcode];
goto *handler;
```

所以第一版分析直接把那张大表标成了：

```
VM_HANDLER_TABLE
```

后来证明是错的。

继续追 index 的来源后发现，它并不是：

```
code[pc]
```

或者任何明显的 bytecode 值。

它来自一串：

```
加减
异或
比较
条件选择
状态值转换
```

最终计算出的内部 state。

更关键的是，这些跳转目标执行完以后通常不会像真正 VM handler 一样：

```
更新 VM PC
回到 fetch
```

而是继续计算新的 flattening state。

于是实际结构更接近：

```text
              ┌─────────────┐
              │ opaque calc │
              └──────┬──────┘
                     │
                     ▼
             flattening state
                     │
                     ▼
              dispatch table
                     │
          ┌──────────┼──────────┐
          ▼          ▼          ▼
        block A    block B    block C
          │          │          │
          └──────┬───┴──────┬───┘
                 ▼          ▼
              next state calculation
```

这是 Control Flow Flattening，而不是 VM 自己的调度。

这是整个分析里第一个比较大的坑。

如果这里判断错了，后面会得到一整套完全错误的：

```
opcode → handler
```

对应关系。

* * *

## 0x04 不完整去平坦化，直接追 VM 数据流

确认外围存在控制流平坦化后，有两个选择。

第一种：

```
先把 native CFG 完整恢复
        ↓
再分析解释器
```

第二种：

```
只恢复和 VM 有关的数据流
```

我后来选择第二种。

原因是分析 VM 时真正需要的东西没有那么多。

核心其实只有：

```
code_base

PC

opcode

descriptor

register file

FLAGS

next_pc
```

只要这些东西能从 flattening 里抽出来，原生函数是否恢复成漂亮的 CFG 反而不是重点。

于是分析方法变成：

```
CFF dispatcher
      ↓
取出一个真实 block
      ↓
判断这个 block 是否访问 VM state
      ↓
标记它的输入和输出
      ↓
忽略纯 flattening block
```

例如某些 block 中可以反复看到：

```css
LDR     X8, [Xstate]
LDR     X9, [X8, #code_field]
LDR     W10, [X8, #pc_field]
ADD     X11, X9, X10

LDRB    W12, [X11]
LDRB    W13, [X11, #1]
LDRB    W14, [X11, #2]
```

把 native register 名字拿掉以后，就是：

```c
insn = vm->code + vm->pc;

opcode = insn[0];
desc   = insn[1];
arg0   = insn[2];
```

这类 block 才是真正值得关心的 VM semantic block。

* * *

## 0x05 利用 Relocation 恢复真实跳转

还有一个比较容易忽略的问题。

IDA 中查看 dispatcher table 时，会发现一些表项看起来是：

```
0
0
0
0
...
```

一开始可能会怀疑：

```
是不是运行时解密？
是不是需要动态 trace？
```

后来检查 ELF relocation 后发现，并不是。

部分地址是在 loader 阶段通过：

```
R_AARCH64_RELATIVE
```

动态填入。

因此可以直接：

```
解析 ELF
    ↓
枚举 relocation
    ↓
找到 table 对应 relocation
    ↓
恢复最终 target
```

抽象成：

```python
for reloc in elf.relocations:
    if table_begin <= reloc.offset < table_end:
        index = (reloc.offset - table_begin) // 8
        targets[index] = image_base + reloc.addend
```

这样就可以静态得到：

```
CFF state
   ↓
native basic block
```

这一阶段最大的意义，不是得到完整 native CFG，而是可以批量把 semantic block 收集出来。

* * *

## 0x06 怎么确认哪个字段是 VM PC

找到 code buffer 以后，还需要确定 PC。

不能因为某个变量不断变化就直接叫它 PC。

我主要看三个证据。

### 1\. 它参与 code address 计算

反复出现：

```c
insn = code_base + value;
```

说明这个 value 很可能是 instruction offset。

### 2\. Handler 会稳定修改它

例如：

```
+4
+5
+7
+11
```

并且这个增量与当前指令格式对应。

### 3\. Branch 会直接覆盖它

普通算术指令表现为：

```c
next_pc = pc + insn_size;
```

而 jump handler 则变成：

```c
next_pc = branch_target;
```

conditional branch 类似：

```c
if (condition)
    next_pc = target;
else
    next_pc = pc + insn_size;
```

这三个条件同时成立以后，基本可以确定：

```
该字段 = VM PC
```

于是最初一团 native dataflow 可以简化成：

```c
pc = vm->pc;

while (pc < vm->code_size)
{
    ins = decode(vm->code, pc);

    pc = execute(vm, &ins);
}
```

* * *

## 0x07 Register File 是怎么恢复的

接下来是寄存器。

分析 operand 读取路径时，经常会出现：

```
UBFX    Wn, Wdesc, ...
...
ADD     Xaddr, Xstate, Windex, UXTW #3
LDR     Xvalue, [Xaddr, #reg_base]
```

这类访问说明：

```
index * 8
```

是固定 stride。

于是可以先建立一个假设：

```c
uint64_t regs[N];
```

再检查不同 opcode 是否都通过同一规则访问。

如果：

```
MOV
ADD
CMP
CALL
```

都最终落到：

```c
regs[index]
```

那么这个假设就比较稳了。

最终虚拟机状态可以先抽象成：

```c
typedef struct
{
    uint64_t regs[VM_REG_COUNT];

    uint64_t pc;
    uint64_t code_size;

    uint8_t *code;

    uint64_t sp;
    uint64_t fp;

    uint64_t flags;
} VMState;
```

这里一开始不需要追求准确的 C struct layout。

只需要保证：

```
语义字段关系正确
```

就够了。

* * *

## 0x08 一个后来才发现的细节：窄写入

自己实现 VM 以后，有一个 bug 花了一些时间。

例如一条 32 位 MOV：

```
MOV.d r3, value
```

第一版 emulator 很自然地写成：

```c
vm->regs[3] = (uint32_t)value;
```

但是执行真实 bytecode 后，某些后续结果始终对不上。

重新看 native handler 才发现，它做的实际上是：

```
只修改寄存器 slot 的低 32 bit
```

高 32 bit 保留。

也就是：

```c
uint64_t old = vm->regs[3];

vm->regs[3] =
    (old & 0xffffffff00000000ULL) |
    (uint32_t)value;
```

8 位、16 位也是类似逻辑。

这个细节看起来很小，但如果 register slot 被后续不同宽度重复使用，错误会一直向后传播。

因此在实现 VM 时，我后来专门统一做了：

```c
write_reg8()
write_reg16()
write_reg32()
write_reg64()
```

而不是让每个 handler 自己随便赋值。

* * *

## 0x09 Descriptor 比 Opcode 更麻烦

恢复 VM 时，一开始很容易认为：

```
opcode 决定指令语义
```

但实际上很多 VM 是：

```
opcode + descriptor
```

共同决定语义。

这一套 VM 也是如此。

可以把一条指令抽象成：

```
+00 opcode
+01 descriptor
+02 operand
+03 operand
...
```

descriptor 中又包含几个维度：

```
source kind

source width

destination width

operand encoding
```

为了便于说明，假设 descriptor 被拆成：

```
bits 0..2   operand mode
bits 3..4   source width
bits 5..6   destination width
```

这只是文章里的抽象表示，不对应原始编码。

decoder 可以先做：

```c
OperandMode decode_mode(uint8_t desc);
ValueWidth  decode_src_width(uint8_t desc);
ValueWidth  decode_dst_width(uint8_t desc);
```

然后 opcode handler 本身只负责：

```
ADD
SUB
MOV
CMP
...
```

例如同一个 ADD：

```
ADD.b
ADD.w
ADD.d
ADD.q
```

可以共用一个 family：

```c
result = lhs + rhs;
write_reg(dst, result, dst_width);
```

这比给每一种 descriptor 单独定义一个 opcode 更容易维护。

* * *

## 0x0A 从 Bytecode 到一条 VM 指令

为了确认 decoder，必须真正拿 bytecode 对。

下面用一条经过重新构造的示意指令说明分析方法。

假设看到：

```
12 95 03 07 2A 00 00
```

先不要直接解释。

根据当前假设：

```
12       opcode
95       descriptor
03       dst
07       src
2A 00 00 ...
         extra/immediate
```

然后去 native handler 看：

```
descriptor 是否进入 width decoder

operand index 是否乘 8

src 是否来自 register file

PC 最终增加多少
```

如果发现：

```
dst = reg[3]

src = sign_extend(reg[7], 16)

result width = 32 bit

next_pc = pc + 7
```

那么最终才能给它写成：

```
OP_X.d r3, r7
```

或者更高层：

```c
r3.low32 =
    r3.low32 * (int16_t)r7.low16;
```

这就是后来一直采用的验证方式：

```
原始 bytes
   ↓
descriptor decode
   ↓
native handler
   ↓
寄存器 effect
   ↓
PC effect
   ↓
最终 opcode semantics
```

* * *

## 0x0B 一个实际发生过的误判

有一条 opcode 很适合说明为什么不能过早命名。

早期在它的 native 路径中看到了：

```
地址计算
LOAD
STORE
operand fetch
```

于是最开始把它记成：

```
INDIRECT_LOAD_STORE
```

disassembler 也按这个逻辑写了。

问题是，后面真正执行 bytecode 时发现：

```
部分运算结果不合理

部分寄存器的符号扩展完全对不上

后续比较结果也开始错
```

重新检查后才发现：

> 之前看到的 LOAD/STORE 只是 descriptor 解析和 operand 提取，并不是这个 opcode 的真正语义。

继续追 arithmetic block 后，最终恢复成：

```
SMUL_EXT
```

抽象语义：

```c
src_value =
    sign_extend(
        read_reg(src),
        source_width
    );

result =
    read_reg(dst) * src_value;

write_reg(
    dst,
    result,
    destination_width
);
```

这个修正以后，同一批真实 bytecode 在 Clean VM 中才能继续正常执行。

从此以后，opcode 命名至少要求五个证据：

```
native handler

descriptor

真实 bytecode

dataflow

Clean VM 执行结果
```

* * *

## 0x0C 恢复 ISA 时不要一条一条孤立看

确定基础 decoder 以后，可以开始按 family 恢复 ISA。

不是按：

```
OP00
OP01
OP02
...
```

逐个硬啃，而是先聚类 semantic pattern。

例如算术类：

```
ADD
SUB
MUL
DIV
REM
```

通常都有相似结构：

```
decode dst
decode src
read operand
perform arithmetic
write result
advance PC
```

逻辑类：

```
AND
OR
XOR
SHIFT
```

也是一组。

比较类：

```
CMP
SETcc
```

控制流：

```
JMP
Jcc
CALL
CALL_REG
RET
```

调用约定：

```
PUSH_ARG
ENTER_FRAME
LEAVE_FRAME
```

后面还能看到浮点：

```
FADD
FSUB
FMUL
FDIV
FCMP
FMIN
FMAX
```

以及整数/浮点转换。

这样处理的好处是：

如果已经确认：

```
width decode

operand decode

register read/write
```

几个公共模块，其它 opcode 的恢复会越来越快。

* * *

## 0x0D HOSTCALL：从 VM 世界进入 Native 世界

VM 自己只有：

```
寄存器
内存
算术
分支
```

它要真正和系统交互，必须有 Host Interface。

因此恢复到后面以后，HOSTCALL 比很多普通 opcode 更重要。

最开始只能看到：

```
HOSTCALL service_A
HOSTCALL service_B
```

后面逐步判断 service 行为，例如：

```
memory allocation

memory copy

string operation

file I/O

symbol lookup

serialization

native call bridge
```

于是低层：

```
PUSH r3
PUSH r7
HOSTCALL service_X
```

才能变成：

```c
memset(buffer, 0, size);
```

或者：

```c
handle = resolve_symbol(module, symbol);
```

在文章里不需要保留原始 service ID。

只需要说明恢复方法。

比如判断一个 service 是否近似 `memset` ，可以看：

```
参数 0 总是地址

参数 1 经常为常量

参数 2 像长度

返回值的使用方式
```

再结合 native implementation 交叉验证。

这种 semantic recovery 做完以后，VM asm 的可读性会发生质变。

* * *

## 0x0E 为什么一定要自己实现一个 Clean VM

到 ISA 基本完成时，静态分析容易产生一种错觉：

```
看起来都对了
```

但“看起来对”并不够。

所以另外写了一套完全不调用原始解释器的 Clean VM。

其核心 state 包含：

```c
struct VM
{
    uint64_t regs[REG_COUNT];

    uint64_t pc;

    uint64_t sp;
    uint64_t fp;

    Flags flags;

    Memory memory;

    HostInterface host;
};
```

执行循环：

```c
for (;;)
{
    Instruction ins =
        decode(vm.code, vm.pc);

    uint64_t fallthrough =
        vm.pc + ins.size;

    vm.pc = fallthrough;

    execute(&vm, &ins);
}
```

之所以先设置：

```
fallthrough PC
```

再执行，是因为这样 branch instruction 可以直接覆盖：

```c
vm.pc = target;
```

普通指令则保持默认值。

* * *

## 0x0F Emulator 如何验证语义

给每条 opcode handler 都做统一 trace。

例如：

```yaml
PC      : 0x120
OP      : ADD
DST     : r3
SRC     : r7

before:
r3 = 10
r7 = 5

after:
r3 = 15

next PC:
0x125
```

如果执行到某一点后结果开始偏离预期，就往前找最后一条可疑 opcode。

另外还记录：

```
CALL depth

SP

FP

HOSTCALL

branch target
```

因此一个 VM 函数可以得到：

```
enter func_A
  CALL func_B
    HOSTCALL strlen
    RET
  CALL func_C
    ...
    RET
RET
```

当越来越多真实函数能够从入口运行到预期出口时，ISA 才算真正闭环。

* * *

## 0x10 “不返回”不一定是 Emulator 卡死

测试过程中有一个函数一直跑不完。

第一反应是：

```
是不是某条 branch 实现错了？
是不是 FLAGS 算错了？
是不是 CALL/RET 有问题？
```

后来对该函数单独建立静态 CFG，发现：

```
根本不存在可达 RET
```

它本身就是：

```text
       ┌────────────┐
       │    loop    │
       ▼            │
check condition     │
       │            │
       ├── retry ───┘
       │
       └── continue work
```

所以它是一个：

```
persistent worker
```

而不是失败的测试。

这件事让 emulator 验证标准从：

```
所有入口最终都 RET
```

改成：

```
returning function
    → 正常 RET

non-returning function
    → 符合静态 CFG

unknown opcode
    → 0

unexpected semantic error
    → 0
```

* * *

## 0x11 Function Discovery

VM 能执行以后，下一个问题就是：

> 一整块 bytecode 怎么切成函数？

最开始一个很容易犯的错误是，把所有控制流 target 都当成当前函数内部 basic block。

但：

```
JMP / Jcc
```

和：

```
CALL
```

不是同一类 edge。

对于：

```
JMP target
```

target 仍属于当前 function。

而：

```
CALL target
```

应该创建新的 function entry。

所以 function discovery 大致是：

```python
worklist = initial_entries

while worklist:
    entry = worklist.pop()

    if entry in known_functions:
        continue

    fn = decode_function(entry)

    for call_target in fn.direct_calls:
        worklist.add(call_target)
```

`initial_entries` 可以来自：

```
program entry

callback registration

metadata

已知 dispatch entry
```

这样逐渐扩大 function inventory。

* * *

## 0x12 Basic Block 是怎么切的

得到 function entry 后，再切 basic block。

基本 block boundary 包括：

```
function entry

branch target

conditional branch fallthrough

CALL 后继点

RET 前结束
```

例如：

```yaml
0000 MOV
0005 CMP
000A JZ  0030
000F ADD
0014 JMP 0040
0030 SUB
0035 ...
0040 RET
```

block 可以切成：

```yaml
B0: 0000 - 000A
B1: 000F - 0014
B2: 0030 - ...
B3: 0040
```

然后建立：

```
B0 → B1
B0 → B2

B1 → B3
B2 → B3
```

这时就已经从：

```
VM instruction stream
```

进入普通 compiler analysis 世界。

* * *

## 0x13 CALL_REG 怎么恢复

直接 CALL 很简单：

```
CALL address
```

但间接调用：

```
CALL_REG r15
```

会破坏调用图。

所以必须做 symbolic propagation。

例如：

```
r3  = function_A
r8  = r3
r15 = r8
CALL_REG r15
```

传播以后：

```
r15 = constant function_A
```

因此：

```
CALL_REG r15
```

可以静态改写成：

```
CALL function_A
```

更复杂一点：

```
if (...)
    r10 = func_A
else
    r10 = func_B

CALL_REG r10
```

这里不能强行变成单一 target。

应该保留：

```
indirect call {func_A, func_B}
```

原则仍然是：

> 能证明才解析。

* * *

## 0x14 为什么不能一直输出 VM 汇编

做到这里，已经可以生成很完整的 VM asm。

但几百条 VM 指令仍然不好读。

例如：

```
MOV r3, ...
MOV r4, r3
PUSH_ARG r4
CALL host_A
MOV r7, RET
CMP r7, 0
JZ ...
```

很多指令只是：

```
VM ABI noise
```

真正的高级逻辑可能只是：

```c
ptr = allocate(size);

if (!ptr)
    return -1;
```

因此下一阶段不是继续优化 disassembly，而是写 lifter。

* * *

## 0x15 IR Lifter

lifter 不再接收文本汇编。

它直接接：

```
decoded Instruction
```

然后把 VM register operation 提升成 symbolic expression。

例如：

```
MOV r3, r1
ADD r3, 8
```

转换成：

```
r3 := r1 + 8
```

如果后面：

```
PUSH_ARG r3
HOSTCALL memory_op
```

就可以继续折叠。

最终 IR 可能是：

```
v1 = arg0 + 8
call memory_op(v1, 0, 32)
```

而不是：

```
r3 = ...
r7 = ...
```

* * *

## 0x16 SSA：不要把 VM Register 当局部变量

这是反编译器里一个非常关键的点。

VM 的：

```
r7
```

只是 physical register。

它可能在一个函数中先后保存：

```
pointer
size
return value
boolean
```

所以直接输出：

```c
r7 = open_object(...);

r7 = get_length(...);

r7 = r7 > 10;
```

虽然“能看”，但类型完全混乱。

SSA 后会变成：

```toml
v1 = open_object(...)

v2 = get_length(...)

v3 = v2 > 10
```

之后 emitter 再决定是否给这些 value 起：

```
handle
length
condition
```

这样的名字。

* * *

## 0x17 Phi 是不能乱删的

CFG：

```text
        B0
       /  \
      B1  B2
       \  /
        B3
```

如果：

```
B1:
x = 1

B2:
x = 2
```

B3 使用 x，就必须有：

```
x3 = phi(x1, x2)
```

第一版 cleanup 很容易因为：

```
“phi 看起来很丑”
```

而过早删掉。

这样最后可能得到：

```c
if (cond)
    x = 1;

use(x);
```

直接丢语义。

正确顺序是：

```
SSA
 ↓
CFG structuring
 ↓
识别 if/else
 ↓
把 phi 降成普通 assignment
```

而不是在 CFG 结构还没确定前就删除。

* * *

## 0x18 Dominator 和 Post-Dominator

为了从 goto CFG 恢复：

```
if
if/else
while
```

最基础的两个东西是：

```
dominator
post-dominator
```

假设：

```text
       A
      / \
     B   C
      \ /
       D
```

A 分支到 B/C，而 D 是 B/C 的最近共同 post-dominator。

就可以恢复：

```c
if (condition) {
    B;
} else {
    C;
}

D;
```

如果一条 edge：

```
B → A
```

并且 A dominates B，则这是一个典型 back edge。

于是 A 可能是 natural loop header。

继续分析 loop exits 后，可以恢复：

```c
while (cond) {
    ...
}
```

而不是：

```c
loc_A:
...
if (...) goto loc_A;
```

* * *

## 0x19 Multi-Exit Loop

真正麻烦的是：

```c
while (...)
{
    if (...)
        break;

    if (...)
        return;

    ...

    if (...)
        continue;
}
```

这种循环对应 CFG 中多个 exit。

第一版 structurer 很容易找不到唯一 follow block。

后来改成：

```
收集 loop exits
      ↓
计算 exits 的共同 post-dominator
      ↓
作为 loop follow candidate
```

如果不存在可靠的共同 follow，就宁可保留局部 goto。

这也是后期反编译器一直遵守的原则：

> 结构化失败时可以丑，但不能为了生成 while 强行改控制流。

* * *

## 0x1A Stack Object Recovery

控制流解决以后，伪代码里还会出现大量：

```c
*(uint64_t *)(fp + 0x120)
*(uint32_t *)(fp + 0x128)
foo(fp + 0x120);
```

这时候需要识别：

```
stack object
```

基本做法是收集所有：

```
fp + offset
```

访问。

记录：

```
offset

access width

read/write

是否取地址

是否传给 CALL

是否进入 memset/memcpy

lifetime
```

例如发现：

```
fp+0x120      qword
fp+0x128      qword
fp+0x130      dword
```

且：

```
foo(fp+0x120)
```

那么很可能这是同一个 aggregate。

先不要猜业务名称。

可以先生成：

```c
struct local_obj_120_t
{
    uint64_t field_00;
    uint64_t field_08;
    uint32_t field_10;
};
```

于是：

```c
local_obj_120.field_00 = a;
local_obj_120.field_08 = b;

foo(&local_obj_120);
```

* * *

## 0x1B 为什么还要支持 Union / Overlay

局部对象并不总是标准 C struct。

有时同一块 8 字节：

```
offset + 0
```

既会被：

```
uint64_t
```

整体写入，又会单独访问：

```
offset + 0
offset + 4
```

例如：

```c
*(uint64_t *)(base) = value64;
*(uint32_t *)(base + 4) = value32;
```

如果直接生成：

```c
struct {
    uint64_t field_00;
    uint32_t field_04;
};
```

显然是重叠的。

正确表示更接近：

```c
union
{
    uint64_t word;

    struct
    {
        uint32_t low;
        uint32_t high;
    };
};
```

所以 local object inference 不能只解决：

```
struct
```

还要支持：

```
union
overlay
array tail
mixed-width record
```

* * *

## 0x1C 数组尾部

另一个常见模式是：

```
固定 header
+
动态索引区域
```

例如：

```c
*(uint32_t *)(base + 0x00)
*(uint64_t *)(base + 0x08)

*(uint32_t *)(base + 0x10 + index * 4)
```

可以推成：

```c
struct object_t
{
    uint32_t flags;
    uint32_t pad;

    uint64_t count;

    uint32_t items[];
};
```

判断 array 的主要证据是：

```
base
+
constant offset
+
index * fixed stride
```

如果 stride 稳定是：

```
1 / 2 / 4 / 8
```

数组证据通常比较强。

* * *

## 0x1D 跨函数类型传播

局部对象恢复后，自然会出现：

```c
foo(&obj);
```

于是很想直接推：

```c
void foo(Object *obj);
```

但是这样很危险。

因为另一个调用点可能是：

```c
foo(&obj.field_08);
```

这时 foo 的真实参数可能只是：

```c
uint64_t *
```

所以最后采用：

```
收集所有 callsite
      ↓
比较 argument evidence
      ↓
只有全部兼容
      ↓
提升 callee signature
```

否则保持保守类型。

这条原则在整个类型恢复过程中都适用：

```
错误的高层类型
```

往往比：

```
uint64_t *
```

更误导分析。

* * *

## 0x1E 从一个 Callback 到 C-like

最后把整个流程串起来。

假设有一段匿名化后的 bytecode。

decoder 得到：

```
MOV
CALL
CMP
JZ
ADD
CALL_REG
RET
```

经过 function discovery：

```
func_A
 ├─ call func_B
 └─ indirect call func_C
```

CFG：

```text
        B0
        |
        ▼
      CALL B
        |
        ▼
       CMP
      /   \
    B1     B2
     \     /
       B3
```

lifter：

```
v1 = func_B(arg0)

if (v1 == 0)
    goto B2

v2 = arg1 + 8
func_C(v2)
```

SSA/structurer：

```c
result = func_B(arg0);

if (result != 0) {
    func_C(arg1 + 8);
}
```

类型恢复后：

```c
int process_object(Context *ctx, Object *obj)
{
    int result;

    result = validate_object(ctx);

    if (result != 0) {
        process_field(&obj->field_08);
    }

    return result;
}
```

这时候才算真正完成：

```
VM bytecode
   ↓
C-like pseudo code
```

* * *

## 0x1F Decompiler 最后的架构

做到后面以后，工具被拆成两层。

## VM Backend

只负责 VM 特有内容：

```
container format

section layout

opcode map

descriptor

ISA

HOSTCALL ABI

callback ABI
```

## Generic Decompiler

负责通用程序分析：

```
function discovery

basic block

CFG

dominator

post-dominator

SSA

dataflow

structurer

type propagation

object recovery

C-like emitter
```

完整架构：

```text
               VM Container
                    │
                    ▼
                  Parser
                    │
          ┌─────────┴─────────┐
          │                   │
          ▼                   ▼
       Backend             Metadata
          │
          ▼
       Decoder
          │
          ▼
     Disassembler
          │
          ▼
  Function Discovery
          │
          ▼
         CFG
          │
          ▼
        Lifter
          │
          ▼
    SSA / Dataflow
          │
          ▼
      Structurer
          │
          ▼
 Type / Object Recovery
          │
          ▼
      C-like Output
```

这样以后碰到同系列的新 VM：

```
opcode map 变化

descriptor 变化

HOSTCALL 变化
```

只需要换 backend。

而：

```
CFG
SSA
Structurer
Type System
```

仍然可以直接使用。

* * *

## 0x20 回头看几个最重要的经验

## 1\. 不要先入为主地完整去 CFF

分析 VM 时，比漂亮 native CFG 更重要的是：

```
PC

code_base

opcode

descriptor

register

next_pc
```

只要这些数据流还能恢复，就可以先绕开外围混淆。

* * *

## 2\. 间接跳转表不等于 Opcode Table

一定要确认：

```
index 是哪里来的？
```

如果来自：

```
flattening state
```

那它只是控制流 dispatcher。

只有 index 真正来自：

```
bytecode / opcode
```

才可能是 VM dispatch。

* * *

## 3\. Opcode 不要太早命名

看到：

```
LOAD
STORE
```

不代表 opcode 就是 LOAD/STORE。

它可能只是：

```
operand extraction
```

必须结合：

```
handler

descriptor

bytecode

dataflow

emulator
```

一起判断。

* * *

## 4\. Clean VM 是非常重要的验证手段

只有静态分析时，只能说：

```
“这个语义大概率是这样。”
```

自己实现 VM 后可以问：

```
“真实 bytecode 能不能按照这个语义运行？”
```

这是完全不同的证据强度。

* * *

## 5\. CALL 和 Branch 必须严格分离

```
JMP target
```

属于 CFG。

```
CALL target
```

属于 callgraph。

如果这一步错了，后面：

```
函数数量
调用图
签名
类型
```

都会一起错。

* * *

## 6\. 反编译器最重要的不是“看起来漂亮”

一个：

```c
uint64_t arg1;
```

可能不好看。

但一个错误的：

```c
SomeComplexStruct *ctx;
```

会严重误导分析。

所以类型恢复原则应该始终是：

> Evidence first.

* * *

## 0x21 总结

回头看整个过程，其实可以分成三个阶段。

最初面对的问题是：

```
这个大型 ARM64 函数到底在干什么？
```

后来变成：

```
这颗 VM CPU 到底是怎么工作的？
```

最后则变成：

```
怎么为它写一套反编译器？
```

整个过程：

```
stripped ARM64 ELF
        +
Control Flow Flattening
        +
Unknown Bytecode
        │
        ▼
发现 VM PC
        │
        ▼
发现 Register File
        │
        ▼
恢复 Descriptor
        │
        ▼
恢复 ISA
        │
        ▼
恢复 HOSTCALL
        │
        ▼
Clean VM
        │
        ▼
Function Discovery
        │
        ▼
CFG / SSA
        │
        ▼
Structuring
        │
        ▼
Type Recovery
        │
        ▼
C-like Decompiler
```

到最后以后，原本隐藏在：

```
ARM64 混淆
+
自定义 VM
```

后面的程序重新变成了普通的：

```
function

basic block

call

condition

loop

variable

struct

array
```

所以如果让我用一句话总结这种 VM 的分析方式：

> **不要一开始想着“破解一套 VM”，而是先把它当成一颗完全未知的 CPU。**

先恢复：

```
machine state

instruction encoding

ISA

ABI

host interface
```

当 machine model 建立完成以后：

```
CFG

SSA

dataflow

type recovery

decompilation
```

这些已经成熟的程序分析方法就都可以重新使用。

VM 改变的是程序的执行机器。

并没有改变程序本身仍然需要：

```
计算

访存

分支

调用

返回
```

这个事实。
