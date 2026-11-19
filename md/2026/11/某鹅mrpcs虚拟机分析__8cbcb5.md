---
title: 某鹅mrpcs虚拟机分析
source: https://fjqisba.github.io/2025/12/03/2025/%E6%9F%90%E9%B9%85mrpcs%E8%99%9A%E6%8B%9F%E6%9C%BA%E5%88%86%E6%9E%90/
source_host: fjqisba.github.io
clip_date: 2026-11-19T10:53:09+08:00
trace_id: 59ef005d-a744-41c9-9d18-6bf6cf0ebd5c
content_hash: d3464919a341f34e44be2a7dbe9d81fe6d5209347892520d9a2d4664e30cd3e1
status: synced
tags: []
series: null
feed_source: fjqisba·Android/Hook
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41d75244-d011-81a4-9571-d6797716f145
ioc: null
---

## 虚拟机数据下载

mrpcs一般来说是一个压缩包，解压得到unzipmrpcs.data

## 虚拟机分析

首先依然是反序列化，有一段较大的结构，反序列化完成之后，整个虚拟机里面的数据大致可以分为 `shellcode函数` 和 `AST虚拟机函数` 两类。

## 关于shellcode函数

这个没什么好说的，就是单纯的ARM64指令shellcode，直接通过mmap申请内存然后控制执行。

当然，shellcode函数的入参必定是一个context指针，里面藏了很多公共函数，比如获取模块地址啊，添加上报数据啊之类的。

## 关于AST虚拟机

AST虚拟机其实就是一个又一个的AST指令，结构大致如下吧：

```cpp
class VmAstInstruction
{
public:
    //类似于地址,或者节点ID的概念,从0x1开始不断上升
    unsigned short vm_idx;
    //类似于无条件跳转指令,还是条件跳转,还是普通指令
    unsigned char ins_type;
    //如果发生跳转,要跳向的节点(地址)
    unsigned short branch_idx;
    //节点存储结果,可用来表达是否要发生跳转
    bool is_jmp;
    //节点指向的根节点
    VmAstNode* op;
    //......
};
CPP
```

而op节点则存储着具体要执行的逻辑，结构如下：

```cpp
class VmAstNode
{
public:
    //存储结果
    std::uint64_t val;
    //op大类型,表明当前节点是数据、运算符还是函数
    unsigned char op_type;
    //op子类型,例如如果是数据,可以用来表示是常量、变量、字符串还是数组;如果是运算符,可以用来表示是哪种运算符;外部函数调用同理
    unsigned char idx;
    //数据类型,1字节,2字节,4字节还是8字节
    unsigned short dataSize;
    //如果是常量,则存储对应值
    std::uint64_t valConst;
    //如果是字符串,则存储对应值
    char* strConst;
    //子OP数组
    std::vector<VmAstNode*> vmOP_list;
    //....
};
CPP
```

有了这些，任何执行代码就可以用上面的结构来表示了。

1、关于指令执行流程

运行虚拟机的时候，从第一条VmAstInstruction开始执行，执行的就是里面的OP，每次执行完会将结果存储到 `op->val` 里面，根据这个运算结果，再根据指令类型以及跳转地址，就能完成分支逻辑，如果不发生跳转，则默认执行下一条指令。

2、关于变量

每条VmAstInstruction就等于一个全局变量，全局变量ID = 当前虚拟机函数ID + 变量ID，这就意味着，虚拟机函数是可以跨函数访问的，即虚拟机函数A可以随时访问另外一个函数B的变量节点。

执行VmAstInstruction的过程，也是在不断更新全局变量的过程。

3、关于具体执行

例如某个逻辑

```
std::uint64_t g_val_1 = 0x1234 + (0x5678 - g_val_2);
APACHE
```

对应的VmAstInstruction结构如下：

```
opvmOP_list[0]vmOP_list[1]vmOP_list[0]vmOP_list[1]VmAstInstruction
vm_idx: 0x01
var: g_var_1VmAstNode(Root Op)
op_type:ADDVmAstNode (Const)
0x1234VmAstNode (Op)
op_type: SUBVmAstNode (Const)
0x5678VmAstNode (Var)
g_val_2
```

能看懂这个结构基本就看懂了整个AST虚拟机的逻辑构造

## 关于还原

其实完美还原还是需要花费一点时间精力的，我的思路如下：

1、梳理函数的流程结构，重建函数控制流程图。

2、梳理函数里面用到的全局变量、字符串等数据

3、利用asmjit工具将虚拟指令重新转换回原来的ARM64指令，里面比较肝的是要处理很多OP和函数。

4、最终利用asmjit出色的能力输出一份bin，就可以愉快地F5了。

## 参考资料

[https://github.com/asmjit/asmjit](https://github.com/asmjit/asmjit)
