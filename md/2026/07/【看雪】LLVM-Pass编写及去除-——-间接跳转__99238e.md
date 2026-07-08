---
title: 【看雪】LLVM Pass编写及去除 —— 间接跳转
source: https://bbs.kanxue.com/thread-291922.htm
source_host: bbs.kanxue.com
clip_date: 2026-07-08T19:31:57+08:00
trace_id: dfe320a0-3c53-4e12-a87d-d774246094a7
content_hash: fd73eeb9c85fb7447d0625eb9c56e9b51169c1d3b28eab44bb7ac714008bc76c
status: summarized
tags:
  - 看雪
series: null
feed_source: 看雪·逆向工程
ai_summary: 通过 LLVM Pass 实现间接跳转混淆及其去除方法，涵盖静态脚本和动态调试技术。
ai_summary_style: key-points
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 39775244-d011-812b-acaf-c2a46e94f125
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 通过 LLVM Pass 实现间接跳转混淆及其去除方法，涵盖静态脚本和动态调试技术。
> 
> - **Pass 编写基础**：IndirectBranch pass 将函数中的直接跳转指令替换为 `IndirectBrInst` 间接跳转，使用 `BlockAddress` 获取目标地址。
> - **增强混淆**：为地址加解密，如通过全局变量存储加密值，使用随机密钥进行异或或加减运算，增加逆向分析难度。
> - **静态去除方法**：编写 IDC 脚本匹配特征指令（如 `jmp rax`），计算全局变量和密钥值，将间接跳转 patch 为直接跳转指令。
> - **动态去除方法**：使用 IDA 批量对 `jmp` 指令下断点并设置条件回调，执行程序记录跳转关系表，生成映射用于自动化 patch。
> - **实例应用**：在样本 strange_xor.exe 中，识别混淆模式（如赋值、取值、计算、跳转），通过 IDC 脚本去除冗余指令，恢复函数可读性。

间接跳转是通过将原本的jmp addr指令，替换成jmp reg，从而混淆块与块之间的跳转关系的方法。

## 编写

一个最基础的间接跳转pass如下

```cpp
#include "llvm/IR/Function.h"
#include "llvm/Pass.h"
#include "llvm/Support/raw_ostream.h"
#include "llvm/Support/CommandLine.h"
#include "llvm/Transforms/Utils/ValueMapper.h"
#include "llvm/Transforms/Utils/Cloning.h"
#include "llvm/IR/Module.h"
#include "llvm/IR/Instructions.h"
#include "llvm/IR/IRBuilder.h"
#include "SplitBasicBlock.h"
#include "Utils.h"
#include <vector>
#include <cstdlib>
#include <ctime>

using std::vector;
using namespace llvm;

static cl::opt<bool> enableIndBr("indbr_num",cl::init(1),cl::desc("Indirect branch obfuscation"));

namespace{
    class IndirectBranch : public FunctionPass{
        public:
        static char ID;
        IndirectBranch() :FunctionPass(ID){}

        bool runOnFunction(Function &F);
        void applyIndirectJump(BasicBlock *BB);
    };
}

bool IndirectBranch::runOnFunction(Function &F)
{
    vector<BasicBlock *> origBB;
    for(BasicBlock &BB : F)
    {
        origBB.push_back(&BB);
    }

    for(BasicBlock *BB : origBB)
    {
        applyIndirectJump(BB);
    }

    return true;
}

void IndirectBranch::applyIndirectJump(BasicBlock *BB)
{
    Instruction *terminator = BB->getTerminator();
    BranchInst *br = dyn_cast<BranchInst>(terminator);
    if(!br) return;
    // 创建IRBuilder对象,在终结指令前插入
    IRBuilder<> builder(terminator);

    // 无条件跳转
    if(br->isUnconditional())
    {
        // 获取目标块
        BasicBlock *targetBB = br->getSuccessor(0);
        // 获取目标地址
        BlockAddress *targetAddr = BlockAddress::get(targetBB);

        // 创建间接跳转指令(目标地址,可能地址数)
        IndirectBrInst *indirectBr = builder.CreateIndirectBr(targetAddr,1);
        // 添加有效目标块
        indirectBr->addDestination(targetBB);
        // 删除原指令
        br->eraseFromParent();
    }
    // 有条件跳转
    else if(br->isConditional())
    {
        Value *cond = br->getCondition();
        // 获取真假目标块
        BasicBlock *trueBB = br->getSuccessor(0);
        BasicBlock *falseBB = br->getSuccessor(1);

        // 真假目标地址
        BlockAddress *trueAddr = BlockAddress::get(trueBB);
        BlockAddress *falseAddr = BlockAddress::get(falseBB);

        // 条件选择指令
        Value *selectedAddr = builder.CreateSelect(cond,trueAddr,falseAddr);

        // 创建间接跳转指令
        IndirectBrInst *indirectBr = builder.CreateIndirectBr(selectedAddr,2);
        // 添加可能的目标块
        indirectBr->addDestination(trueBB);
        indirectBr->addDestination(falseBB);

        // 删除原指令
        br->eraseFromParent();
    }

}

char IndirectBranch::ID = 0;
static RegisterPass<IndirectBranch> X("indbr","Indirect Branch Obfuscation Pass");
```

经典的寄存器跳转，直接给rax赋值。一下就能看出跳转的地址

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/94da20ced0c61e8b.png)

为了让混淆的效果更好，可以对地址进行加解密操作

```cpp
#include "llvm/IR/Function.h"
#include "llvm/Pass.h"
#include "llvm/Support/raw_ostream.h"
#include "llvm/Support/CommandLine.h"
#include "llvm/Transforms/Utils/ValueMapper.h"
#include "llvm/Transforms/Utils/Cloning.h"
#include "llvm/IR/Module.h"
#include "llvm/IR/Instructions.h"
#include "llvm/IR/IRBuilder.h"
#include "SplitBasicBlock.h"
#include "Utils.h"
#include <vector>
#include <cstdlib>
#include <ctime>
#include <string>

using std::vector;
using namespace llvm;

static cl::opt<bool> enableIndBr("indbr_num",cl::init(1),cl::desc("Indirect branch obfuscation"));

namespace{
    class IndirectBranch : public FunctionPass{
        public:
        static char ID;
        IndirectBranch() :FunctionPass(ID){
            srand(time(0));
        }

        bool runOnFunction(Function &F);
        void applyIndirectJump(BasicBlock *BB);
        Value *createDecodedBlockAddress(IRBuilder<> &builder, BasicBlock *targetBB, uint64_t secretKey);
    };
}

bool IndirectBranch::runOnFunction(Function &F)
{
    INIT_CONTEXT(F);
    vector<BasicBlock *> origBB;
    for(BasicBlock &BB : F)
    {
        origBB.push_back(&BB);
    }

    for(BasicBlock *BB : origBB)
    {
        applyIndirectJump(BB);
    }

    return true;
}

Value *IndirectBranch::createDecodedBlockAddress(IRBuilder<> &builder, BasicBlock *targetBB, uint64_t secretKey)
{
    Module *M = targetBB->getModule();
    const DataLayout &DL = M->getDataLayout();
    IntegerType *intPtrTy = DL.getIntPtrType(*CONTEXT);
    Type *int8PtrTy = Type::getInt8PtrTy(*CONTEXT);

    // 目标地址
    BlockAddress *targetAddr = BlockAddress::get(targetBB);
    // 转为Int便于计算
    Constant *targetInt = ConstantExpr::getPtrToInt(targetAddr,intPtrTy);
    Constant *keyVal = ConstantInt::get(intPtrTy,secretKey);

    // 加密后的地址
    Constant *encodedInit = ConstantExpr::getAdd(targetInt,keyVal);
    // 生成全局变量名称
    std::string globalName = targetBB->getParent()->getName().str() + ".indbr.addr";
    // 创建全局变量 初始值为加密后的值
    GlobalVariable *encodedSlot = new GlobalVariable(
        *M,
        intPtrTy,
        false,
        GlobalValue::PrivateLinkage,
        encodedInit,
        globalName
    );

    // 加载全局变量值
    LoadInst *encodedVal = builder.CreateLoad(intPtrTy,encodedSlot);
    // 设置不优化
    encodedVal->setVolatile(true);
    // 创建减法指令
    Value *decodedVal = builder.CreateSub(encodedVal,keyVal);
    return builder.CreateIntToPtr(decodedVal,int8PtrTy);
}

void IndirectBranch::applyIndirectJump(BasicBlock *BB)
{
    Instruction *terminator = BB->getTerminator();
    BranchInst *br = dyn_cast<BranchInst>(terminator);
    if(!br) return;
    IRBuilder<> builder(terminator);

    // 条件跳转
    if(br->isUnconditional())
    {
        BasicBlock *targetBB = br->getSuccessor(0);

        uint64_t secretKey = rand();
        Value *decPtr = createDecodedBlockAddress(builder,targetBB,secretKey);

        IndirectBrInst *indirectBr = builder.CreateIndirectBr(decPtr,1);
        indirectBr->addDestination(targetBB);
        br->eraseFromParent();
    }
    // 非条件跳转
    else if(br->isConditional())
    {
        Value *cond = br->getCondition();
        // 获取真假目标块
        BasicBlock *trueBB = br->getSuccessor(0);
        BasicBlock *falseBB = br->getSuccessor(1);

        uint64_t secretKey = rand();
        // 获取解密后的值
        Value *decPtr_true = createDecodedBlockAddress(builder,trueBB,secretKey);
        Value *decPtr_false = createDecodedBlockAddress(builder,falseBB,secretKey);

        // 创建选择指令
        Value *selectedAddr = builder.CreateSelect(cond,decPtr_true,decPtr_false);

        // 创建间接跳转指令
        IndirectBrInst *indirectBr = builder.CreateIndirectBr(selectedAddr,2);
        // 添加可能的两个目标块
        indirectBr->addDestination(trueBB);
        indirectBr->addDestination(falseBB);

        br->eraseFromParent();
    }

}

char IndirectBranch::ID = 0;
static RegisterPass<IndirectBranch> X("indbr","Indirect Branch Obfuscation Pass");
```

现在给寄存器赋的值需要通过全局变量去运算

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/6e0976233f5babe0.png)

当然间接跳转混淆的方式多种多样，这里只是基础的两种Pass编写。

## 去除

关于去除：

有两种去除混淆的方式

1.通过idc脚本计算进行去除

和之前去除控制流平坦化一样，通过idc脚本匹配特征再进行patch，以上面的样本为例，读取全局变量的值后和一个64位值进行简单运算，可以根据特征 `jmp rax` 来定位间接跳转部分

```
auto jmp_insn = print_insn_mnem(current_addr);
auto jmp_op = print_operand(current_addr,0);
if(jmp_insn == "jmp" && jmp_op == "rax")
```

然后计算出全局变量的值和加的值

```java
auto add_addr = prev_head(current_addr,start_addr);
auto add_val = Dword(add_addr + 2);
add_val = add_val | 0xFFFFFFFF00000000;
msg("add val = %X\n",add_val);
auto mov_addr = prev_head(add_addr,start_addr);
auto rand_offset = Dword(mov_addr + 3);
auto rand_addr = mov_addr + rand_offset + 7;
msg("rand addr = %X\n",rand_addr);
auto rand_val = Dword(rand_addr);
auto jmp_addr = add_val + rand_val;
```

最后patch

```
NopCode(mov_addr,jmp_addr + 2 - mov_addr);
PatchByte(mov_addr,0xE9);
PatchDword(mov_addr + 1,jmp_offset);
```

完整脚本如下：

```java
static NopCode(Addr, Length)
{
    auto i;
    for (i = 0; i < Length; i++)
    {
        PatchByte(Addr + i, 0x90);
    }
}

static main()
{
    auto current_addr = ;
    auto end_addr = ;
    auto start_addr = current_addr;
    while (current_addr < end_addr && current_addr != BADADDR)
    {
        auto jmp_insn = print_insn_mnem(current_addr);
        auto jmp_op = print_operand(current_addr,0);
        if(jmp_insn == "jmp" && jmp_op == "rax")
        {
            auto add_addr = prev_head(current_addr,start_addr);
            auto add_val = Dword(add_addr + 2);
            add_val = add_val | 0xFFFFFFFF00000000;
            msg("add val = %X\n",add_val);
            auto mov_addr = prev_head(add_addr,start_addr);
            auto rand_offset = Dword(mov_addr + 3);
            auto rand_addr = mov_addr + rand_offset + 7;
            msg("rand addr = %X\n",rand_addr);
            auto rand_val = Dword(rand_addr);
            auto jmp_addr = add_val + rand_val;
            auto jmp_offset = jmp_addr - mov_addr - 5;
            msg("jmp addr = %X\n",jmp_addr);
            msg("jmp offset = %X\n",jmp_offset);
            NopCode(mov_addr,jmp_addr + 2 - mov_addr);
            PatchByte(mov_addr,0xE9);
            PatchDword(mov_addr + 1,jmp_offset);
        }
        current_addr = next_head(current_addr,end_addr);
    }
}
```

(示例脚本仅为非条件跳转)

运行后可自动将间接跳转改为直接跳转

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/cc77d5cbd1cbdff7.png)

2.自动下断点trace去除

无论是怎样的间接跳转，执行到最后jmp指令的时候都会计算出值，所以动态获取值无疑是很好的办法。

但是在一个混淆样本中jmp指令往往过多，调试去看值是不行的，所以可以使用idc批量下断点，再执行一遍，直接获取到跳转的值

```cpp
#include <idc.idc>

// 设置断点Break属性
static SetBptBreak(Address, Enable)
{
    auto OldFlag = get_bpt_attr(Address, BPTATTR_FLAGS);
    if (Enable == 1)
    {
        if ((OldFlag & BPT_BRK) == 0)
        {
            msg("%d\n", OldFlag & BPT_BRK);
            OldFlag = OldFlag | BPT_BRK;
        }
    }
    else
    {
        if ((OldFlag & BPT_BRK) != 0)
        {
            OldFlag = OldFlag & (~BPT_BRK);
        }
    }
    set_bpt_attr(Address, BPTATTR_FLAGS, OldFlag);
}

// 设置断点Handler
static SetHandlerToBpt(Address, HandlerFuncName, IsBreak)
{
    // return回调到Handler
    auto Cond = sprintf("return %s();", HandlerFuncName);
    if (check_bpt(Address) == (BPTCK_NONE))
    {
        add_bpt(Address);
    }

    // 设置Break属性
    SetBptBreak(Address, IsBreak);

    // 设置断点Conditional
    auto Status = set_bpt_cond(Address, Cond);
    if (Status == 1)
    {
        msg("Successfully set conditional bpt at 0x%x -> call %s\n", Address, HandlerFuncName);
    }
    else
    {
        msg("Failed to set conditional bpt at 0x%x\n", Address);
    }
}

static Handler1()
{
    auto fp = fopen("dump.txt", "a");

    fprintf(fp, "jmp %X -> %X\n",rip,rax);
    fclose(fp);
    return 0;
}

static main()
{
    auto start_addr = ;
    auto end_addr = ;
    auto current_addr = start_addr;
    while(current_addr < end_addr && current_addr != BADADDR)
    {
        auto insn_name = print_insn_mnem(current_addr);
        auto op = print_operand(current_addr,0);
        // 检查到jmp rax指令就对其下断 断点函数为Handler1
        if(insn_name == "jmp" && op == "rax")
        {
            SetHandlerToBpt(current_addr, "Handler1", 0);
        }
        current_addr = next_head(current_addr,end_addr);
    }
    
}
```

因为有循环，所以重复内容占了很多，可以写一个python脚本去重

```python
file_path = "dump.txt"
with open(file_path,'r') as f:
    lines = [line.rstrip('\n') for line in f]
set_line = set(lines)
for s in set_line:
    print(s)
```

结果如下

```python
jmp 401581 -> 401583
jmp 4015AA -> 4015AC
jmp 4013D4 -> 4013D6
jmp 4015E6 -> 401583
jmp 4013A5 -> 4013A7
jmp 4015CE -> 4015D0
jmp 4014FA -> 4013A7
jmp 4014D9 -> 4014DB
jmp 4013D4 -> 4014FC
jmp 4015AA -> 4015E8
```

这样我们就获取到了关键的跳转关系表，可通过脚本或ai辅助patch

## 实例

样本为strange_xor.exe，混淆方式如图

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/cd90b40e4d1b975d.png)

这一段汇编中只有中间的 `push ebp` 是真正有用的程序代码，其余全部为间接跳转服务。

最终跳转的计算公式为 0x77 ^ 0x9908 + 0x393017 = 0x39C996

虽然是通过复杂的方式对最终跳转的值进行计算，但因为混淆的方式是固定的：赋值 + 取值 + 赋值 + 跳转，所以可以写idc脚本来匹配特征去混淆

脚本如下

```cpp
#include <idc.idc>

static NopCode(Addr, Length)
{
    auto i;
    for (i = 0; i < Length; i++)
    {
        PatchByte(Addr + i, 0x90);
    }
}


static main()
{
    auto current_addr = 0x40C996;
    auto end_addr = current_addr + 0x10000;
    // 初始保存的ecx值
    auto ecx_data = 0x35;
    while (current_addr != BADADDR && current_addr < end_addr)
    {
        auto insn_name = Byte(current_addr);
        auto op = print_operand(current_addr, 0);
        auto op2 = print_operand(current_addr, 1);
        auto i;
        ///msg("addr: %X\n",current_addr);

        // 找到pusha这条指令
        if( insn_name == 0x60)
        {
            auto asm_name = Byte(current_addr + 1);
            auto call_asm_name = Byte(current_addr + 2);
            auto call_op = Dword(current_addr + 3);
            //msg("pusha\n");
            // jmp ebx
            // 接下来的两条汇编是否为pushf + call $5
            if( asm_name == 0x9C && call_asm_name == 0xE8 && call_op == 0)
            {
                auto pop_addr = current_addr + 7;
                auto xor_addr = current_addr + 16;
                //msg("xor_addr : %X\n",xor_addr);
                auto xor_data = Dword(xor_addr + 2);
                auto offest = ecx_data ^ xor_data;
                //msg("xor_data : %X\n",xor_data);
                // 计算出跳转的值
                auto jmp_addr = (offest + pop_addr) & 0xFFFFFFFF;
                msg("jmp_addr : %X\n",jmp_addr);
                auto ecx_addr = xor_addr + 9;
                // 计算出跳转偏移
                auto jmp_offest = jmp_addr - ecx_addr - 5;
                // 顺带保存下一次运算的ecx值
                ecx_data = Dword(ecx_addr + 1);
                msg("ecx_data : %X\n",ecx_data);
                NopCode(current_addr,39);
                //msg("nop_addr: %X  len: %X\n",current_addr,39);
                PatchByte(ecx_addr,0xE9);
                PatchDword(ecx_addr + 1,jmp_offest);
                //msg("jmp  %X\n",jmp_addr);
                for(i = 0; i < 54; i++)
                {
                    create_insn(jmp_addr + i);
                }
                current_addr = jmp_addr;
                msg("current_addr: %X\n",current_addr);
                auto next_call_insn = Byte(current_addr);
                auto next_call_op = Dword(current_addr + 1);
                if( next_call_insn == 0xE8 && next_call_op == 0 )
                {
                    auto pop_byte = Byte(current_addr + 5);
                    if( pop_byte == 0x5B)
                    {
                        NopCode(current_addr - 1,12);
                    }
                }

            }

        }
        
        auto check_byte = Byte(current_addr); 
        if( check_byte == 0x9D || check_byte == 0x61 || check_byte == 0x60 || check_byte == 0x9C)
        {
            NopCode(current_addr,1);
        }

        current_addr = current_addr + 1;
    }
}
```

效果如下

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/404ed477e3963adf.png)

只留下了有用的汇编和跳转地址，其余全部被nop

函数可正常反编译

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/8d6e24a3a24565b2.png)

当然除写idc脚本之外还可以下断点动态trace，只需要将刚才的脚本稍加修改

```cpp
static Handler1()
{
    auto fp = fopen("dump.txt", "a");

    fprintf(fp, "jmp %X -> %X\n",eip,ebx);
    fclose(fp);
    return 0;
}

static main()
{
    auto start_addr = 0x403001;
    auto end_addr = 0x413C98;
    auto current_addr = start_addr;
    while(current_addr < end_addr && current_addr != BADADDR)
    {
        auto insn_name = print_insn_mnem(current_addr);
        auto op = print_operand(current_addr,0);
        if(insn_name == "jmp" && op == "ebx")
        {
            SetHandlerToBpt(current_addr, "Handler1", 0);
        }
        current_addr = next_head(current_addr,end_addr);
    }
    
}
```

就可以得到跳转表。部分跳转表如下

```python
jmp 4068F4 -> 41207E
jmp 404D77 -> 40C281
jmp 40E202 -> 407CB0
jmp 404155 -> 410C62
jmp 40A019 -> 40AA11
jmp 4057F3 -> 4139A5
jmp 40BFA4 -> 41212A
jmp 40B340 -> 4036FB
jmp 413AC2 -> 406A8F
jmp 40C789 -> 40D40E
jmp 40E652 -> 407150
jmp 40FFC7 -> 40CBDA
jmp 40A6BC -> 404A8A
jmp 40B8CD -> 4076D9
jmp 406C5F -> 409DFB
jmp 408170 -> 40A32B
jmp 40C74F -> 4127E1
jmp 40DBE5 -> 412CFA
jmp 40D4EB -> 40C7FE
jmp 411949 -> 413489
```

符合我们刚才patch过的代码。

## 最后

以上就是关于间接跳转的Pass编写，还有混淆去除的方法，当然都是我个人拙见，如果有问题或其他思路欢迎各位大佬和我交流☆\*:.｡. o(≧▽≦)o.｡.:\*☆

* * *

最后的最后，虽然有这些去除混淆的方法，但是实际应用是还是要逐个样本分析，没有一把梭的方法。所以我想借助agent来辅助去混淆，这需要很多混淆样本。所以如果各位大佬有小型混淆样本 / CTF题目，都可以分享给我orz。

qq：2060824185

## 附件

- [stange_xor_original - 副本.exe](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/attach/2026/07/0b1234973cd55e82.exe) （77.00kb，1次下载）
