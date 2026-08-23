---
title: 【看雪】Arm静态分析引擎原理四 - IR设计和应用
source: https://bbs.kanxue.com/thread-292736.htm
source_host: bbs.kanxue.com
clip_date: 2026-08-23T14:06:57+08:00
trace_id: 03a85422-0ca6-46fa-a6c7-d263e268fb4b
content_hash: 2e3f3ae0ffc857af6b4f892b8046b91cc78cc9f144094f41055ae046312d728c
status: synced
tags:
  - 看雪
  - Arm静态分析
  - IR设计
series: null
feed_source: 看雪·Android安全
ai_summary: Arm静态分析引擎rosemary以IR为核心，通过识别br Xn间接跳转（jumptable/vtable），并循环lift以实现控制结构和栈恢复。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3c575244-d011-81e3-b772-d9ce0074c519
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Arm静态分析引擎rosemary以IR为核心，通过识别br Xn间接跳转（jumptable/vtable），并循环lift以实现控制结构和栈恢复。
> 
> - **间接跳转来源：** `br Xn` 主要来自大型switch编译的跳转表、C++ vtable（RTTI）和函数指针数组；小型switch仍编译成branch/ifeq。
> - **IR基础与扩展：** 操作数分 register/imm/mem/vlist/rbitlist；定义 jd_exp 平铺存储，并扩展 binary、phi_ref、assignment_reg 等以便常量折叠。
> - **IR应用示例：** 标准jumptable（adrp+add+ldrsw+br）会lift成 `br(load((((base)+((phi<<2)))+(base))))` 形IR，可据此识别表基址与步长，再向上找cmp完成整个jumptable识别。
> - **后续能力：** 更高层lift可支持控制结构识别、类型识别、局部变量恢复、栈恢复/平衡等；rosemary目前只实现了控制结构识别与栈平衡。
> - **工程化数据：** 处理6MB aarch64 ELF耗时约2.39秒，常驻内存约310MB；工程上全用无指针数组存储，以节约内存并提升cache友好度。

接 [上文](https://bbs.kanxue.com/thread-292482.htm)

上一篇文章讲了静态分析最重要的一个部分 - 控制流恢复，所有控制流恢复的分析软件都存在一个重大的挑战就是 **间接跳转** 恢复，在arm里面就是 `br Xn` ，跳转的参数是一个寄存器，而这个寄存器中的值是不确定的。包括IDA/Binary Ninja/Ghidra/R2都是这样，没有办法完完全全的将所有的间接跳转恢复出来。

那么这个 `br Xn` 到底是怎么来的呢？它有几种情况

1.  switch case 语法

switch case不会都编译成br Xn，如果case的情况少，比如：

```c
switch (variable) {
    case 0: printf("xxx\n") break;
    default: printf("default\n"); break;
}
```

这样的switch case就会被编译成branch，因为case的路径少，完全可以用if/else，在汇编语言里就是ifeq这种情况。

如果switch非常非常大，那么它会被编译成什么样呢？可以在IDA里面找一个例子：

```python
.text:0000000000056970                 MOV             W24, #0x3594A0BB
.text:0000000000056978                 ADRL            X25, jpt_569A0
.text:0000000000056980                 B               def_569A0 ; jumptable 00000000000569A0 default case
.text:0000000000056984 ; ---------------------------------------------------------------------------
.text:0000000000056984
.text:0000000000056984 loc_56984                               ; CODE XREF: .text:00000000000569A0↓j
.text:0000000000056984                                         ; .text:0000000000056EAC↓j
.text:0000000000056984                                         ; DATA XREF: ...
.text:0000000000056984                 MOV             W8, #0xD ; jumptable 00000000000569A0 case 5
.text:0000000000056988                 STR             W8, [SP,#8]
.text:000000000005698C
.text:000000000005698C def_569A0                               ; CODE XREF: .text:0000000000056980↑j
.text:000000000005698C                                         ; .text:0000000000056994↓j ...
.text:000000000005698C                 UBFX            X9, X8, #0, #0x20 ; ' ' ; jumptable 00000000000569A0 default case
.text:0000000000056990                 CMP             W8, #0x1B ; switch 28 cases
.text:0000000000056994                 B.HI            def_569A0 ; jumptable 00000000000569A0 default case
.text:0000000000056998                 LDRSW           X8, [X25,X9,LSL#2]
.text:000000000005699C                 ADD             X8, X8, X25
.text:00000000000569A0                 BR              X8      ; switch jump
```

在这里ADRL就是adrp + page_offset的一个缩写，这里的 **jpt_569A0** 这个地址存储的就是所有的case的偏移地址，如下：

```python
.text:0000000000056F18 jpt_569A0       DCD loc_569A4 - 0x56F18 ; DATA XREF: .text:0000000000056978↑o
.text:0000000000056F18                                         ; jump table for switch statement
.text:0000000000056F1C                 DCD loc_569D4 - 0x56F18 ; jumptable 00000000000569A0 case 1
.text:0000000000056F20                 DCD loc_56D30 - 0x56F18 ; jumptable 00000000000569A0 case 2
.text:0000000000056F20                                         ; jumptable 0000000000056CEC case 74
..... 这里省略
.text:0000000000056F80                 DCD loc_56D24 - 0x56F18 ; jumptable 00000000000569A0 case 26
.text:0000000000056F80                                         ; jumptable 0000000000056CEC case 73
.text:0000000000056F84                 DCD loc_56EF8 - 0x56F18 ; jumptable 00000000000569A0 case 27
```

那么到这里就一目了然了，编译器在这里的工作简单的说就是第一，找到所有case，第二把这些case的偏移地址存储起来，通过比较W8，加载对应的地址实现case的跳转。

1.  c++的vtable

vtable就是c++的多态的产物，是一堆函数指针列表；它在C++中的结构是rtti(RuntimeTypeInfo)，它由一个名字是vptr的指针存储

如果要识别vtable，首先要做的就是识别rtti，能够正确的识别出rtti的typeinfo结构后，才能完整的推断出vtable的结构。

typeinfo有：

```c
__si_class_type_info 单继承类
__vmi_class_type_info 多重继承或虚继承类
__class_type_info 独立基类，无继承关系
```

1.  函数指针数组

函数指针数组，顾名思义，就是一个数组，里面都是函数指针；

但是这个结构其实也是最扯淡的结构，因为这种结构都是非标准化的

我可以可以写 `func_arrs = [0x1234, 0x5679]` 这里 func_arrs既可能是uint类型的数据，也可能是函数地址，但是，它在编译器眼里，都是数据；

那么这种结构的识别也就是仁者见仁，智者见智了。

文章的标题是IR设计，为什么扯到了一堆跟间接跳转相关的话题呢？因为识别这些结构有的可以根据模式匹配（pattern match）来匹配，像IDA/BN/GHIDRA/R2这些老牌的产品，风风雨雨经历过编译器的多个变迁，那么它们的识别库里面有N多这样识别这些跳转的pattern，如果一个新的产品，来处理这些间接跳转，最好的办法就是通过IR的模式来处理，而不是模式匹配。

我没有了解过gcc/llvm的ir，我只写rosemary引擎的ir设计和开发

* * *

## 一、汇编语言的操作数(operands)

aarch64的汇编的操作数有几种： 寄存器（register）、立即数（imm）、内存（memory）、列表（vlist）、rbitlist

在没有NEON/SVE/SME的情况下，只有前三种

vlist是我自己给的定义，用来描述\*\*{v1, v2, v3, v4}\*\*, **{v2-v3}** 这种结构；

rbitlist是a32/t32结构中的bit寄存器数组

那么原则上IR的基础数据结构就只有这4种，register/imm/mem/vlist/rbitlist

* * *

## 二、定义和使用

我用的c语言写的，那么IR的c语言定义应该是这样的：

```python
typedef struct jd_exp {
    u1 type; // expression的类型
    union {
                struct {
            u1 idx; // X4
            u1 t; // 寄存器类型, 分标准寄存器(X/W)和向量寄存器(V)
            u1 size; // 向量寄存器的宽度
        } reg;

        struct {
            u4 hi; // 高位
            u4 lo; // 低位
            u1 is_sign;
            u1 is_addr;
            u1 is_page;
        } imm;

        struct {
            jd_rid addr;
            u1 elane_type;
            u1 access_mode; // flags: liner_access, structure_access, scalable_mode
            u1 size; // 如果是NEON或者SVE/SME，这里就是struct的size，正常的liner没有这个
            u1 orientation; // 方向，针对SME的
            u1 is_signed;
            u4 index;
        } mem;
              
        struct {
            u2 mnemonic;
            u1 def_flags;
            u1 use_flags;
            u1 args_count;
            jd_rid args_start_index;
        } invoke;
    }
} jd_exp;
```

有了这个结构，我们可以用它来描述一条指令： `adds x1, x2, #1`

```c
jd_exp *x1 = malloc(sizeof(jd_exp));
x1->type = JD_REGISTER;
x1->t = JD_REGISTER_TYPE_X;
x1->idx = 0x1;

jd_exp *x2 = malloc(sizeof(jd_exp));
x2->type = JD_REGISTER;
x2->t = JD_REGISTER_TYPE_X;
x2->idx = 0x2;

jd_exp *imm = malloc(sizeof(jd_exp));
imm->type = JD_IMM;
imm->idx = 0x1;
imm->hi = 0x0;
imm->lo = 0x1;

jd_exp *add_exp = malloc(sizeof(jd_exp));
add_exp->t = JD_INVOKE;
add_exp->mnemonic = JD_MNEMONIC_ADDS;
add_exp->args_count = 3;
add_exp->args_start_index = xxxx; // 存在大数组的起始位置
add_exp->def_flags = 0xxxx; // 标识adds指令在数据流中的def
add_exp->use_flags = 0xxxx; // 标识adds指令在数据流中的use
```

这样，一条adds指令的所有数组都描述完成了

```c
expressions = { exp_x1, exp_x2, exp_imm, exp_invoke_adds };
```

可以看到，这种结构的逻辑上是嵌套的，存储结构上是平铺的。

* * *

## 三、IR的扩展

如果仅仅有上述4种类型的IR，那么会在描述过程中越来越复杂，当规约某一种类型的结构时候会越来越麻烦，比如上面的adds，

如果adds是 `adds x1, #0x1, 0x2` 这样的情况，那么在简化IR的过程中，就会写成：

```python
if (invoke->mnemonic == JD_JD_MNEMONIC_ADDS) {
    if (op1->type == JD_IMM && op2->type == JD_IMM) {
         // 到这里才能将x1简化成一个常数
    }
}
```

所以IR还需要有下面这些类型

```c
                struct {
            u1 op; // +, -, *, <<
            jd_rid left;
            jd_rid right;
            u1 def_flags;
            u1 use_flags;
        } binary; // 加减乘除/移位/与或非等操作

        struct {
            jd_reg_id reg_id;
            jd_rid block_id;
        } phi_ref; // ssa的phi

        struct {
            jd_rid left;
            jd_rid right;
        } assignment_reg; // 寄存器三地址码： x1 = x2 + #0x1

        struct {
            jd_rid left;
            jd_rid right;
        } assignment_mem; // 内存三地址码

        struct {
            jd_rid addr_exp_id;
        } load_addr; // 地址加载
```

有了这些，就可以简化指令了， `adds` 就会从invoke进化成binary，从binary进化成一个assignment_reg

```c
assigment_reg:  left(x1) = right(binary(left(#0x1) + right(#0x2)))
```

这样简化起来就简单了，在常量折叠的时候，完全可以根据x1的def/use来将它简化成常数 **3**

* * *

## 四、IR的应用

到了这里，就能解释文章开头时候到问题了，用IR来识别jumptable/vtable等等结构。我们以一个最简单jumptable的例子来看，在IDA里，jumptable的样子是这样的：

```python
.text:000000000043F6F0 loc_43F6F0                              ; CODE XREF: sub_43F4F8+120↑j
.text:000000000043F6F0                 ADRL            X9, jpt_43F700
.text:000000000043F6F8                 LDRSW           X8, [X9,X8,LSL#2]
.text:000000000043F6FC                 ADD             X8, X8, X9
.text:000000000043F700                 BR              X8      ; switch jump
```

它的真实机器码：

```python
adrp                 x9, #6057984   // 这里是10进制                     
add                  x9, x9, #1100                         
ldrsw                x8, [x9, x8, lsl #2]                  
add                  x8, x8, x9                            
br                   x8      
```

这段代码的意思很简单，这是一个标准的jumptable结构

-   adrp x9, #6057984 加载jumptable所在页到x9，即x9是def
-   add x9, x9, #1100 加载jumptable到位置到x9
-   ldrsw x8, \[x9, x8, lsl #2\] 将x9位置对应内存的内容加载到x8，这里的lsl是步长
-   br x8 跳转到特定的case

在我们定义的IR里，jumptable的IR表达式如下：

```python
[BR TRACE #4318474]
  instruction px: 0x0043f700
  root trace idx: 4318474
  trace tree:
  [def] call:br((load([((6057984 + 1100) + ((PHI: reg_id: 8, off: 1458453, count: 2) << 2))]) + (6057984 + 1100)))
```

有了这样的IR描述，一个jumptable就完全可以识别到了，即：

-   jumptable所在的位置是 **6057984 + 1100**
-   jumptable每个case的步长是 << 2，即4
-   通过jumptable对应的ir再往上搜索cmp，就完成了一整个jumptable的识别。

这里仅仅举了一个ir的作用，它的作用远远不止这些，这种形式的ir还能继续lift，当lift到一个极简的结构后，就可以继续做

控制结构识别（if/else/else if/switch/for/while/do while）

类型识别（uint/int/long）

local varibale恢复

栈恢复

栈平衡

函数参数溢出到栈

等等等等，目前rosemary只做到了用ir识别控制结构和栈平衡。

* * *

## 五、IR的工程化

理解这样简单的IR并不难，这里最最复杂的其实是工程化，在将汇编语言lift后，它不是一蹴而就的，它的过程更像一个螺旋上升的过程，而且是越缩越窄的一个过程：

```python
decoder -> control flow -> data flow -> lift to ir -> decoder -> control flow -> data flow .....
  
while (next)
  decoder
  make control flow
  make data flow
  lifter to ir
  if (find function or entries)
    next = true
end
```

静态分析过程就是这样一个循环，在分析过程中不断的发现新的函数(function)，新的入口(entry)来不断的循环收窄，直到收窄到没有新的内容为止。

在这个过程中，每一个数据结构的定义，甚至每一个struct的item对于整体性能的影响都是非常非常大的，

-   指针，在64位系统中，一个指针的size是8字节，如果用uint32_t来代替一个指针就可以节约一半的内存；
-   内存对齐，减少内存的padding也可以节约非出多多内存
-   存储结构，list和数组，list看似快，开发简单，但是list耗费的内存其实非常大，就比如java那种ArrayList
-   cpu cache，考虑cache也是定义数据结构的关键，一个平铺的array，要比一个list的cache友好的多得多

经过各种debug/profiler，rosemary最终的存储结构都落到了数组上，没有指针，首先是节约内存，其次cpu缓存友好，运行速度快;

rosemary的profile， 样本是一个6M的aarch64的elf：

```python
~/workspace/clang/garlic (main)$ time -v ./build/rosemary 
 ----- elf memory start ------
[elf memory] elf's binary buffer: 7127792, 6 MB
[elf memory] elf's entry points: 27119, size: 32 memory: 0 MB
[elf memory] elf's entry hashmap: 27119 size: 16, memory: 0 MB
[elf memory] elf's jd_pc_addr: 30953, size: 24, memory: 0 MB
[elf memory] elf's jd_addr: 55135, size: 24, memory: 1 MB

[elf region] pc range: 0 -> 69912c
[elf memory] elf's region bitmap: 0 MB
[elf memory] elf's basic block count: 207249, size: 176, memory: 34 MB, includes defs/uses/livein/liveout
[elf memory]       basic block's defs count: 207249, size: 16, memory: 3 MB
[elf memory]       basic block's uses count: 207249, size: 16, memory: 3 MB
[elf memory]       basic block's livein count: 207249, size: 16, memory: 3 MB
[elf memory]       basic block's liveout count: 207249, size: 16, memory: 3 MB
[elf memory] elf's edge count: 500304, size: 8, memory: 3 MB
[elf memory] elf's expression count: 4342012, size: 32, memory: 132 MB
[elf memory] elf's jd_elf_func_ins count: 1284442, size: 16, memory: 19 MB
[elf memory] elf's def_exp_ids_arr: 819583, size: 4, memory: 3 MB
[elf memory] elf's use_exp_ids_arr: 681656, size: 4, memory: 2 MB
[elf memory] elf's phi_args_arr: 1483587, size: 4, memory: 5 MB
[elf memory] elf's invoke_args_arr: 1504192, size: 4, memory: 5 MB
[elf memory] elf's pc_map_ins: 3459222, size: 4, memory: 13 MB
[elf memory] elf's functions: 20379, size: 88, memory: 1 MB
[elf memory] elf's jumptable: 332, size: 72, memory: 0 MB
[elf memory] elf's jumptable target: 3018, size: 4, memory: 0 MB
[elf memory] elf's vtable: 1430, size: 40, memory: 0 MB
[elf memory] elf's vtable target: 7779, size: 4, memory: 0 MB
[elf memory] elf's phi_arr: 665071, size: 20, memory: 12 MB
[elf memory] elf's collapsed phi count: 115246
[elf memory] elf's xref: 401952, size: 12, memory: 4 MB
[elf memory] elf's stack event: 126278, size: 24, memory: 2 MB

[elf region] pc range: 69a250 -> 6d515c
[elf memory] elf's region bitmap: 0 MB
[elf memory] elf's basic block count: 0, size: 176, memory: 0 MB, includes defs/uses/livein/liveout
[elf memory]       basic block's defs count: 0, size: 16, memory: 0 MB
[elf memory]       basic block's uses count: 0, size: 16, memory: 0 MB
[elf memory]       basic block's livein count: 0, size: 16, memory: 0 MB
[elf memory]       basic block's liveout count: 0, size: 16, memory: 0 MB
[elf memory] elf's edge count: 1, size: 8, memory: 0 MB
[elf memory] elf's expression count: 1, size: 32, memory: 0 MB
[elf memory] elf's jd_elf_func_ins count: 0, size: 16, memory: 0 MB
[elf memory] elf's def_exp_ids_arr: 0, size: 4, memory: 0 MB
[elf memory] elf's use_exp_ids_arr: 0, size: 4, memory: 0 MB
[elf memory] elf's phi_args_arr: 0, size: 4, memory: 0 MB
[elf memory] elf's invoke_args_arr: 0, size: 4, memory: 0 MB
[elf memory] elf's pc_map_ins: 120710, size: 4, memory: 0 MB
[elf memory] elf's functions: 0, size: 88, memory: 0 MB
[elf memory] elf's jumptable: 0, size: 72, memory: 0 MB
[elf memory] elf's jumptable target: 0, size: 4, memory: 0 MB
[elf memory] elf's vtable: 0, size: 40, memory: 0 MB
[elf memory] elf's vtable target: 0, size: 4, memory: 0 MB
[elf memory] elf's phi_arr: 0, size: 20, memory: 0 MB
[elf memory] elf's collapsed phi count: 0
[elf memory] elf's xref: 0, size: 12, memory: 0 MB
[elf memory] elf's stack event: 0, size: 24, memory: 0 MB
[elf memory] elf's instruction: 1192597, size: 24, memory: 27 MB
[elf memory] elf's region: 2, size: 1952, memory: 0 MB
[elf memory] elf's template count: 6000, size: 68, memory: 0 MB
 ----- elf memory end ------
    Command being timed: "./build/rosemary"
    User time (seconds): 1.62
    System time (seconds): 0.11
    Percent of CPU this job got: 72%
    Elapsed (wall clock) time (h:mm:ss or m:ss): 0:02.39
    Average shared text size (kbytes): 0
    Average unshared data size (kbytes): 0
    Average stack size (kbytes): 0
    Average total size (kbytes): 0
    Maximum resident set size (kbytes): 317872
    Average resident set size (kbytes): 0
    Major (requiring I/O) page faults: 218
    Minor (reclaiming a frame) page faults: 21039
    Voluntary context switches: 290
    Involuntary context switches: 253
    Swaps: 0
    File system inputs: 0
    File system outputs: 0
    Socket messages sent: 8
    Socket messages received: 8
    Signals delivered: 0
    Page size (bytes): 16384
    Exit status: 0
```

* * *

garlic的github： https://github.com/neocanable/garlic, 欢迎使用，特别欢迎PR  
特别特别欢迎来讨论关于二进制分析软件的开发过程，感谢。
