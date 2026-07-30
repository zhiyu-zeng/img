---
title: 【看雪】angr符号执行对抗ollvm
source: https://bbs.kanxue.com/thread-292240.htm
source_host: bbs.kanxue.com
clip_date: 2026-07-30T17:37:02+08:00
trace_id: fdbe3bbf-e002-4a07-bf20-6620757bf4fa
content_hash: 21681924bb69e0ca6a22a95e491e750bfd509632045331ab3ad4900ea2c20ebf
status: synced
tags:
  - 看雪
  - 编译器保护
  - 模拟执行
series: null
feed_source: 看雪·逆向工程
ai_summary: 利用angr动态符号执行可还原被OLLVM混淆的控制流：先定位真实块，再通过符号执行获取块间跳转关系，最后修补指令重组函数逻辑。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ad75244-d011-811e-b746-d5657eee07d0
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 利用angr动态符号执行可还原被OLLVM混淆的控制流：先定位真实块，再通过符号执行获取块间跳转关系，最后修补指令重组函数逻辑。
> 
> - **真实块定位算法：** 基于IDA Python，通过BFS寻找循环头（地址再次被访问时判定），根据前驱数量区分序言块与汇聚块，将汇聚块的前驱（大于5字节的非跳转指令块）识别为真实块，同时区分ret块与冗余代码。
> - **angr模拟执行关键技巧：** 为提高效率，先执行序言完成初始化，随后在进入主分发器末尾指令时通过hook将PC直接设置为目标真实块地址（实际偏移需减6），避免冗余执行。对`cmovnz`/`cmovz`等条件移动指令，模拟器不会自动分裂状态，需手动拷贝状态并显式执行或跳过mov操作，以获取不同分支的后继块。
> - **后继关系记录与修补：** 将每个真实块的后继地址保存在字典中，单后继情况将块末尾指令修补为`jmp`；双后继情况（记录为[zf=1目标, zf≠1目标]）修补为`jz` + `jmp`指令组合；其余指令空间填充`nop`。
> - **无用块清理：** 在控制流修补前预先收集未被使用的块地址，修补完成后统一将这些块整体以`nop`覆盖，最后刷新函数控制流图完成去混淆。

ollvm一直是程序保护中的一种强有力的手段，将原本的控制流打散，用一套分发器去控制流程（网上资料很多，这里不再赘述，请了解ollvm的基础知识再来阅读此文章，比如啥是序言，啥是后继，啥是分发器），本文将着重于一些被别人忽略的细节，让你能够用一套通法根据不同的变异ollvm特征写出不同的脚本  
静态的对抗手段有一些ida插件，比如d810，但是这些静态处理的方法在面对变异ollvm时就显得有些乏力，比如双循环头，汇聚块与循环头合并等问题  
我们不经想既然是控制流混淆，那么动态执行一遍找到正确的执行顺序不久行了嘛？

## 寻找真实块

第一步我们就是要找出所有的代码，也就是真实块，我们可以根据一套固定流程来确定寻找  
先祭出老生常谈的一张图  
![ollvm](https://github.com/Qmeimei10086/qmeimei10086.github.io/blob/main/img/2026-1-19-blog.png?raw=true "ollvm")

1.  找到循环头

```
A -> B -> C -> D -> B
```

假如说又回到了B，那么B就是循环头，我们根据BFS算法可以找出来

```python
# ida python
def find_loop_head(start_ea):
    loop_heads = set()
    queue = deque() # BFS 队列
    blcok = get_basic_block(start_ea) # 获取起始地址所在的基本块
    queue.append((blcok,[]))
    while len(queue) > 0:
        cur_block, path = queue.popleft()
        if cur_block.start_ea in path:
            loop_heads.add(cur_block.start_ea) # 找到循环头
            continue
        path = path + [cur_block.start_ea] # 更新路径
        queue.extend((s, path) for s in cur_block.succs()) # 将后继加入队列
    
    all_loop_heads = list(loop_heads)
    all_loop_heads.sort() # 升序排序，确保主循环头在第一个
    print("[+]Find loop heads:",[hex(lh) for lh in all_loop_heads]," -- total:",len(all_loop_heads))
    return all_loop_heads
```

循环头有两个前驱，一个是序言，用与开辟栈空间，初始化变量之类的，一个是汇聚块  
怎么判断哪个是汇聚块呢？汇聚块有很多前驱，而哪些前驱就是我们最关心的————真实快  
ps:其实序言也是真实块之一，别忘了（

1.  找出循环头

```python
def find_converge_addr(loop_head_addr):
    converge_addr = 0
    block = get_basic_block(loop_head_addr) # 循环头
    preds = block.preds() # 获取前驱基本块
    pred_list = list(preds)

    if len(pred_list) == 2: # 标准 ollvm：循环头有两个前驱,一个序言块一个汇聚块
        for pred in pred_list:
            tmp_list = list(pred.preds())
            if len(tmp_list) > 1: # 有多个前驱的块是汇聚块
                converge_addr = pred.start_ea
    print("[+]Find converge_addr:",hex(converge_addr))
    return converge_addr
```

1.  找出汇聚块  
    那不是汇聚块就是序言了呗

```python
    for loop_head_addr in loop_heads:
        loop_head_block = get_basic_block(loop_head_addr)
        converge_addr = find_converge_addr(loop_head_addr)
        real_blocks = []

        
        #找出序言
        loop_head_preds = list(loop_head_block.preds())
        loop_head_preds_addr = [b.start_ea for b in loop_head_preds]
        if loop_head_addr != converge_addr:
            loop_head_preds_addr.remove(converge_addr)
            print("序言块:",[hex(x) for x in loop_head_preds_addr])
```

1.  找出ret块  
    这个简单，没后继的就是ret块

```python
def find_ret_block(blocks):
    for block in blocks:
        succs = list(block.succs()) # 获取后继块
        succs_list = list(succs)

        end_ea = block.end_ea # end_ea 指向基本块最后一条指令的下一个地址
        last_inst_ea = idc.prev_head(end_ea) # 获取基本块最后一条指令地址
        mnem = idc.print_insn_mnem(last_inst_ea) # 获取指令助记符

        if len(succs_list) == 0: # 没有后继块
            if mnem == "retn": # 最后一条指令是 ret 指令
                ori_ret_block = block

                # 向上寻找更合适的 ret 块
                while True:
                    tmp_block = block.preds()
                    pred_list = list(tmp_block)
                    if len(pred_list) == 1: # 只有一个前驱
                        block = pred_list[0]
                        if get_block_size(block) == 4: # 单指令块
                            continue
                        else:
                            break
                    else: # 多个前驱或者无前驱
                        break
    
                # 处理子分发器情况
                block2 = block
                num = 0
                i = 0
                while True:
                    i += 1
                    succs_block = block2.succs()
                    for succ in succs_block:
                        child_succs = succ.succs()
                        succ_list = list(child_succs)
                        if len(succ_list) != 0:
                            block2 = succ
                            num += 1
                    if num > 2:
                        block = ori_ret_block
                        break
                    if i > 2:
                        break
                print("[+]ret块",hex(block.start_ea))
                return block.start_ea
# 这里是是考虑了可能ret块有前驱，保险起见算一起，可以不用这么多，当然这个代码你直接抄去就行，你可以先自己观察一下哦，有时候自己找ret块也行
```

1.  找出真实块

```python
def find_all_real_blocks(fun_ea):
    blocks = idaapi.FlowChart(idaapi.get_func(fun_ea))
    loop_heads = find_loop_head(fun_ea)
    all_real_blocks = []


    for loop_head_addr in loop_heads:
        loop_head_block = get_basic_block(loop_head_addr)
        converge_addr = find_converge_addr(loop_head_addr)
        real_blocks = []

        
        #找出序言
        loop_head_preds = list(loop_head_block.preds())
        loop_head_preds_addr = [b.start_ea for b in loop_head_preds]
        if loop_head_addr != converge_addr:
            loop_head_preds_addr.remove(converge_addr)
            print("序言块:",[hex(x) for x in loop_head_preds_addr])
            real_blocks.extend(loop_head_preds_addr)
        
        converge_block = get_basic_block(converge_addr)
        list_preds = list(converge_block.preds())
        
        
        
        
        for pred in list_preds:
            end_ea = pred.end_ea
            last_inst_ea = idc.prev_head(end_ea)
            mnem = idc.print_insn_mnem(last_inst_ea)
            
            size = get_block_size(pred)
            if size > 5: # 大于单指令块且不是跳转指令
                start_ea = pred.start_ea
                real_blocks.append(start_ea)
            
        real_blocks.sort() # 排序，第一个是序言块
        all_real_blocks.append(real_blocks)

        print("子循环头及其子真实块", [hex(child_block_ea) for child_block_ea in real_blocks])
    
    ret_addr = find_ret_block(blocks)
    all_real_blocks.append(ret_addr)
    print("all_real_blocks:",all_real_blocks)


    all_real_block_list = []
    for real_blocks in all_real_blocks:
        if isinstance(real_blocks,list):
            all_real_block_list.extend(real_blocks)
        else:
            all_real_block_list.append(real_blocks)
    
    print(f"\n所有真实块获取完成 真实块数量: {len(all_real_block_list)}")
    print(all_real_block_list)
```

这里也是考虑了多循环头的情况，可以自己看情况改  
我们以\[RoarCTF 2019\]polyre 为例子，附件和所有脚本我都放github上了  
https://github.com/Qmeimei10086/deflat-angr  
ida运行结果是

```rust
[+]Find loop heads: ['0x40063f']  -- total: 1
[+]Find converge_addr: 0x4020cc
序言块: ['0x400620']
子循环头及其子真实块 ['0x400620', '0x401121', '0x401198', '0x4011de', '0x40124f', '0x40125e', '0x4012a4', '0x4012f6', '0x401305', '0x401326', '0x40136c', '0x4013b2', '0x4013cf', '0x4013ef', '0x401435', '0x401481', '0x401490', '0x4014ae', '0x4014d2', '0x4014e8', '0x4014f7', '0x401506', '0x401521', '0x401567', '0x4015b6', '0x4015c5', '0x4015d4', '0x4015ed', '0x4015fc', '0x401642', '0x401691', '0x4016a0', '0x4016e6', '0x401739', '0x401748', '0x401765', '0x4017ab', '0x4017fc', '0x40180b', '0x401830', '0x401849', '0x401861', '0x4018a7', '0x4018fa', '0x401909', '0x401926', '0x401940', '0x401960', '0x40197d', '0x40199b', '0x4019e1', '0x401a3d', '0x401a4c', '0x401a73', '0x401a8d', '0x401ad3', '0x401b25', '0x401b34', '0x401b4e', '0x401b5d', '0x401b75', '0x401bbb', '0x401c0d', '0x401c1c', '0x401c2b', '0x401c46', '0x401c69', '0x401caf', '0x401d03', '0x401d12', '0x401d2d', '0x401d45', '0x401d54', '0x401d9a', '0x401e00', '0x401e0f', '0x401e2d', '0x401e73', '0x401eb9', '0x401ed6', '0x401efa', '0x401f09', '0x401f2d', '0x401f3c', '0x401f60', '0x401f97', '0x401fa6', '0x401fb5', '0x401fcd', '0x401fe5', '0x401ff4', '0x40200c', '0x40201b', '0x402033', '0x40204d', '0x402072', '0x402096', '0x4020b3', '0x4020c2']
[+]ret块 0x401f54
all_real_blocks: [[4195872, 4198689, 4198808, 4198878, 4198991, 4199006, 4199076, 4199158, 4199173, 4199206, 4199276, 4199346, 4199375, 4199407, 4199477, 4199553, 4199568, 4199598, 4199634, 4199656, 4199671, 4199686, 4199713, 4199783, 4199862, 4199877, 4199892, 4199917, 4199932, 4200002, 4200081, 4200096, 4200166, 4200249, 4200264, 4200293, 4200363, 4200444, 4200459, 4200496, 4200521, 4200545, 4200615, 4200698, 4200713, 4200742, 4200768, 4200800, 4200829, 4200859, 4200929, 4201021, 4201036, 4201075, 4201101, 4201171, 4201253, 4201268, 4201294, 4201309, 4201333, 4201403, 4201485, 4201500, 4201515, 4201542, 4201577, 4201647, 4201731, 4201746, 4201773, 4201797, 4201812, 4201882, 4201984, 4201999, 4202029, 4202099, 4202169, 4202198, 4202234, 4202249, 4202285, 4202300, 4202336, 4202391, 4202406, 4202421, 4202445, 4202469, 4202484, 4202508, 4202523, 4202547, 4202573, 4202610, 4202646, 4202675, 4202690], 4202324]
```

## 获取执行循序

这就到了本文最精髓的地方了，我们要找到每个块的后继  
对于每一个真实块，我们遵循一套这样的法则  
序言执 -> 主分发器 -> 直接跳到我们要的真实块 -> 继续执行看会到哪一个块  
重点:

1.  必须先执行序言，这是初始化，执行开栈等操作
2.  直接跳到我们要的真实块，避免每次都要完整执行一遍直到遇到我们要的块，到时候我们用hook解决  
    你可能会好奇，那么判断这种广泛使用的功能ollvm是怎么实现的呢？这就是许多文章忽略的一点  
    在x86汇编里，是通过cmovxx这些汇编实现的  
    在arm64下是用csel指令完成，以后遇到在说。。。  
    比如一个真实块

```
loc_40199B:
mov     eax, ds:dword_603054
mov     ecx, ds:dword_603058
mov     edx, eax
sub     edx, 1
imul    eax, edx
and     eax, 1
cmp     eax, 0
setz    sil
cmp     ecx, 0Ah
setl    dil
or      sil, dil
test    sil, 1
mov     eax, 0F37184F0h
mov     ecx, 0A105D2C4h
cmovnz  ecx, eax
mov     [rbp+var_114], ecx
jmp     loc_4020CC
```

cmovxx通过修改寄存器的值，影响上面分发器的分发，达到不同的块  
但是我们angr遇到不会cmovxx这些汇编分裂出两个分支，而是通过积累一个约束实现，所以我们要手动分裂两个状态，一个执行这条，一个不执行，就会到达两不同的块，然后我们这样储存

```python
{'0xaaaa':['0xbbb','0xccc']} 
```

左边放我们zf=1的,右边放zf=0的，方便我们接下来patch

```python
import logging
import angr
from tqdm import tqdm

logging.getLogger('angr').setLevel(logging.ERROR)

def capstone_decode_cmovxx(insn):
    operands = insn.op_str.replace(" ", "").split(",")
    dst_reg = operands[0]
    src_reg = operands[1]
    print(f"cmovxx解析结果: 目标寄存器:{dst_reg}, 源寄存器:{src_reg}")
    return dst_reg, src_reg

def find_state_succ_cmovxx(proj, base, local_state, flag, real_blocks, real_block_addr, path):
    # 仅在 find_block_succ 识别为 cmov 时调用
    ins = local_state.block().capstone.insns[0] 
    dst_reg, src_reg = capstone_decode_cmovxx(ins) 
    
    # 逻辑修正：
    # flag == True  -> ZF=1 (Zero) -> cmovnz (Not Zero) 条件不满足 -> 不执行 Move -> Pass
    # flag == False -> ZF=0 (Not Zero) -> cmovnz (Not Zero) 条件满足 -> 执行 Move
    
    if not flag: # 需要执行 Move
        try:
            # 修正：state.regs 没有 .get() 方法，用 getattr
            src_val = getattr(local_state.regs, src_reg)
            setattr(local_state.regs, dst_reg, src_val)
        except Exception as e:
            print(f"寄存器访问错误: {e}")

    # 关键修正：手动跳过这条 cmov 指令！防止 Angr 再次执行它
    local_state.regs.ip += ins.size

    sm = proj.factory.simgr(local_state)
    
    while(len(sm.active)):
        for active_state in sm.active:
            try:
                ins_offset = active_state.addr - base
                if ins_offset in real_blocks:
                    value = path[real_block_addr]
                    if ins_offset not in value:
                        value.append(ins_offset)
                    return ins_offset
            except:
                pass 
        sm.step(num_inst=1)

def find_block_succ(proj, base, func_offset, state, real_block_addr, real_blocks, path):
    msm = proj.factory.simgr(state)  # 构造模拟器
    while len(msm.active):
        for active_state in msm.active:
            #print(active_state.block().capstone.insns[0])
            offset = active_state.addr - base
            #print("当前偏移地址:", hex(offset),"寻找真实块:", hex(real_block_addr))
            if offset == real_block_addr:  # 找到真实块
                print("找到真实块:", hex(real_block_addr))
                mstate = active_state.copy()  # 复制state,为后继块的获取做准备
                msm2 = proj.factory.simgr(mstate)
                msm2.step(num_inst=1)  # 让状态进到块内的下一条指令位置，避免和外层状态混淆

                while len(msm2.active):
                    
                    for mactive_state in msm2.active:
                        #print(mactive_state.block().capstone.insns[0])
                        ins_offset = mactive_state.addr - base
                        if ins_offset in real_blocks:  # 无分支块（或无条件跳转）
                            # 在无条件跳转中,并且有至少两条路径同时执行到真实块时,取非ret块的真实块
                            msm2_len = len(msm2.active)
                            if msm2_len > 1:
                                tmp_addrs = []
                                for s in msm2.active:
                                    moffset = s.addr - base
                                    tmp_value = path[real_block_addr]
                                    if moffset in real_blocks and moffset not in tmp_value:
                                        tmp_addrs.append(moffset)
                                if len(tmp_addrs) > 1:
                                    print("当前至少有两个路径同时执行到真实块:", [hex(tmp_addr) for tmp_addr in tmp_addrs])
                                    ret_addr = real_blocks[len(real_blocks) - 1]
                                    if ret_addr in tmp_addrs:
                                        tmp_addrs.remove(ret_addr)
                                    ins_offset = tmp_addrs[0]
                                    print("两个路径同时执行到真实块最后取得:", hex(ins_offset))

                            value = path[real_block_addr]
                            if ins_offset not in value:
                                value.append(ins_offset)
                            print(f"无条件跳转块关系:{hex(real_block_addr)}-->{hex(ins_offset)}")
                            return
                        # 可能是 cmovnz 分支指令
                        ins = mactive_state.block().capstone.insns[0]
                        if ins.mnemonic == 'cmovnz' or ins.mnemonic == 'cmovne':
                            print("发现 cmovnz/cmovne 指令，进行分支处理:", hex(ins_offset))
                            #分裂双情况
                            state_true = mactive_state.copy()
                            state_true_succ_addr = find_state_succ_cmovxx(proj, base, state_true, True, real_blocks, real_block_addr, path)
                            
                            state_false = mactive_state.copy()
                            state_false_succ_addr = find_state_succ_cmovxx(proj, base, state_false, False, real_blocks, real_block_addr, path)
                            if state_true_succ_addr is None or state_false_succ_addr is None:
                                print("cmovnz/cmovne错误指令地址:", hex(ins_offset))
                                print(f"cmovnz/cmovne后继有误:{hex(real_block_addr)}-->{hex(state_true_succ_addr) if state_true_succ_addr is not None else state_true_succ_addr},"
                                      f"{hex(state_false_succ_addr) if state_false_succ_addr is not None else state_false_succ_addr}")
                                return "erro"
                        #cmovne
                            print(f"cmovnz/cmovne分支跳转块关系:{hex(real_block_addr)}-->{hex(state_true_succ_addr)} zf = 1,  {hex(state_false_succ_addr)} zf != 1")
                            #print(f"csel分支跳转块关系:{hex(real_block_addr)}-->{hex(state_true_succ_addr)},{hex(state_false_succ_addr)}")
                            return
                        #与cmovnz相反
                        if ins.mnemonic == 'cmovz' or ins.mnemonic == 'cmove':
                            print("发现 cmovz/cmove 指令，进行分支处理:", hex(ins_offset))
                            state_true = mactive_state.copy()
                            state_true_succ_addr = find_state_succ_cmovxx(proj, base, state_true, False, real_blocks, real_block_addr, path)
                            
                            state_false = mactive_state.copy()
                            state_false_succ_addr = find_state_succ_cmovxx(proj, base, state_false, True, real_blocks, real_block_addr, path)
                            if state_true_succ_addr is None or state_false_succ_addr is None:
                                print("cmovz/cmove误指令地址:", hex(ins_offset))
                                print(f"cmovz/cmove后继有误:{hex(real_block_addr)}-->{hex(state_true_succ_addr) if state_true_succ_addr is not None else state_true_succ_addr},"
                                      f"{hex(state_false_succ_addr) if state_false_succ_addr is not None else state_false_succ_addr}")
                                return "erro"
                        #cmovne
                            print(f"cmovz/cmove分支跳转块关系:{hex(real_block_addr)}-->{hex(state_true_succ_addr)} zf = 1,  {hex(state_false_succ_addr)} zf != 1")
                            #print(f"csel分支跳转块关系:{hex(real_block_addr)}-->{hex(state_true_succ_addr)},{hex(state_false_succ_addr)}")
                            return
                        
                    msm2.step(num_inst=1)
                # 真实块集合中的最后一个基本块如果最后没找到后继,说明是return块,直接返回
                return
        msm.step(num_inst=1)

def angr_main(real_blocks,func_offset,file_path):
    proj = angr.Project(file_path, auto_load_libs=False) 
    base = 0
    func_addr = base + func_offset
    init_state = proj.factory.blank_state(addr=func_addr)
    init_state.options.add(angr.options.CALLLESS)

    path = {addr: [] for addr in real_blocks}

    ret_addr = real_blocks[len(real_blocks) - 1]
    
    first_block = proj.factory.block(func_addr)
    first_block_insns = first_block.capstone.insns
    # 主序言的最后一条指令
    first_block_last_ins = first_block_insns[len(first_block_insns) - 1]
    print(hex(first_block_last_ins.address))

    for real_block_addr in tqdm(real_blocks):
        if ret_addr == real_block_addr:
            continue
    
        state = init_state.copy()
        print("正在寻找:",hex(real_block_addr))

        def jump_to_address(state):
            #print(state.regs.pc)
            
            state.regs.pc = base + real_block_addr - 6 
            print("跳转到地址:", hex(base + real_block_addr - 6))
            proj.unhook(0x400675)
        print(hex(real_block_addr),hex(func_offset))
        
        if real_block_addr != func_offset:
            print("序言结束")
            proj.hook(0x400675, jump_to_address, first_block_last_ins.size)
    
        ret = find_block_succ(proj, base, func_offset, state, real_block_addr, real_blocks, path)
        
        if ret == "erro":
            return

    hex_dict = {
        hex(key): [hex(value) for value in values]
        for key, values in path.items()
    }

    for i in hex_dict.keys():
        print(f"{i}:  {hex_dict[i]}")
    print(hex_dict)
    return hex_dict

all_real_blocks: list[int] =[4195872, 4198689, 4198808, 4198878, 4198991, 4199006, 4199076, 4199158, 4199173, 4199206, 4199276, 4199346, 4199375, 4199407, 4199477, 4199553, 4199568, 4199598, 4199634, 4199656, 4199671, 4199686, 4199713, 4199783, 4199862, 4199877, 4199892, 4199917, 4199932, 4200002, 4200081, 4200096, 4200166, 4200249, 4200264, 4200293, 4200363, 4200444, 4200459, 4200496, 4200521, 4200545, 4200615, 4200698, 4200713, 4200742, 4200768, 4200800, 4200829, 4200859, 4200929, 4201021, 4201036, 4201075, 4201101, 4201171, 4201253, 4201268, 4201294, 4201309, 4201333, 4201403, 4201485, 4201500, 4201515, 4201542, 4201577, 4201647, 4201731, 4201746, 4201773, 4201797, 4201812, 4201882, 4201984, 4201999, 4202029, 4202099, 4202169, 4202198, 4202234, 4202249, 4202285, 4202300, 4202336, 4202391, 4202406, 4202421, 4202445, 4202469, 4202484, 4202508, 4202523, 4202547, 4202573, 4202610, 4202646, 4202675, 4202690, 4202324]

angr_main(all_real_blocks, 0x400620, "D:\\reverse\\Angr\\polyre")
```

几个关键点

```python
def jump_to_address(state):
    #print(state.regs.pc)
    
    state.regs.pc = base + real_block_addr - 6 
    print("跳转到地址:", hex(base + real_block_addr - 6))
    proj.unhook(0x400675)
```

我们通过hook主分发器的最后一个指令，运行到直接跳到我们要的块，然后记得unhook，不然到时候执行回来又跳到那里去了，就循环了  
为什么要 -6，我只能说理论上应该不用加偏移，但是实际上不加的化angr不能正确的识别指令，capstone解码出来的混乱的，这个-6是我摸索出来的，如果不行你们可以试试别的，记得把汇编输出出来对一下就行（我把它注释了）  
运行结果

```python
0x400620:  ['0x401121']
0x401121:  ['0x401198']
0x401198:  ['0x401f60', '0x4011de']
0x4011de:  ['0x401f60', '0x40124f']
0x40124f:  ['0x40125e']
0x40125e:  ['0x401f97', '0x4012a4']
0x4012a4:  ['0x401f97', '0x4012f6']
0x4012f6:  ['0x401305']
0x401305:  ['0x401326']
0x401326:  ['0x401fa6', '0x40136c']
0x40136c:  ['0x401fa6', '0x4013b2']
0x4013b2:  ['0x4015d4', '0x4013cf']
0x4013cf:  ['0x4013ef']
0x4013ef:  ['0x401fb5', '0x401435']
0x401435:  ['0x401fb5', '0x401481']
0x401481:  ['0x401490']
0x401490:  ['0x4014ae', '0x4014f7']
0x4014ae:  ['0x4014d2']
0x4014d2:  ['0x4014e8']
0x4014e8:  ['0x4015d4']
0x4014f7:  ['0x401506']
0x401506:  ['0x401521']
0x401521:  ['0x401fcd', '0x401567']
0x401567:  ['0x401fcd', '0x4015b6']
0x4015b6:  ['0x4015c5']
0x4015c5:  ['0x40125e']
0x4015d4:  ['0x4015ed']
0x4015ed:  ['0x4015fc']
0x4015fc:  ['0x401fe5', '0x401642']
0x401642:  ['0x401fe5', '0x401691']
0x401691:  ['0x4016a0']
0x4016a0:  ['0x401ff4', '0x4016e6']
0x4016e6:  ['0x401ff4', '0x401739']
0x401739:  ['0x401748']
0x401748:  ['0x401d54', '0x401765']
0x401765:  ['0x40200c', '0x4017ab']
0x4017ab:  ['0x40200c', '0x4017fc']
0x4017fc:  ['0x40180b']
0x40180b:  ['0x401830']
0x401830:  ['0x401849']
0x401849:  ['0x401861']
0x401861:  ['0x40201b', '0x4018a7']
0x4018a7:  ['0x40201b', '0x4018fa']
0x4018fa:  ['0x401909']
0x401909:  ['0x401c2b', '0x401926']
0x401926:  ['0x401940']
0x401940:  ['0x401960']
0x401960:  ['0x401a73', '0x40197d']
0x40197d:  ['0x40199b']
0x40199b:  ['0x402033', '0x4019e1']
0x4019e1:  ['0x402033', '0x401a3d']
0x401a3d:  ['0x401a4c']
0x401a4c:  ['0x401b4e']
0x401a73:  ['0x401a8d']
0x401a8d:  ['0x40204d', '0x401ad3']
0x401ad3:  ['0x40204d', '0x401b25']
0x401b25:  ['0x401b34']
0x401b34:  ['0x401b4e']
0x401b4e:  ['0x401b5d']
0x401b5d:  ['0x401b75']
0x401b75:  ['0x402072', '0x401bbb']
0x401bbb:  ['0x402072', '0x401c0d']
0x401c0d:  ['0x401c1c']
0x401c1c:  ['0x401849']
0x401c2b:  ['0x401c46']
0x401c46:  ['0x401c69']
0x401c69:  ['0x402096', '0x401caf']
0x401caf:  ['0x402096', '0x401d03']
0x401d03:  ['0x401d12']
0x401d12:  ['0x401d2d']
0x401d2d:  ['0x401d45']
0x401d45:  ['0x4015fc']
0x401d54:  ['0x4020b3', '0x401d9a']
0x401d9a:  ['0x4020b3', '0x401e00']
0x401e00:  ['0x401e0f']
0x401e0f:  ['0x401e2d']
0x401e2d:  ['0x4020c2', '0x401e73']
0x401e73:  ['0x4020c2', '0x401eb9']
0x401eb9:  ['0x401ed6', '0x401f09']
0x401ed6:  ['0x401efa']
0x401efa:  ['0x401f3c']
0x401f09:  ['0x401f2d']
0x401f2d:  ['0x401f3c']
0x401f3c:  ['0x401f54']
0x401f60:  ['0x4011de']
0x401f97:  ['0x4012a4']
0x401fa6:  ['0x40136c']
0x401fb5:  ['0x401435']
0x401fcd:  ['0x401567']
0x401fe5:  ['0x401642']
0x401ff4:  ['0x4016e6']
0x40200c:  ['0x4017ab']
0x40201b:  ['0x4018a7']
0x402033:  ['0x4019e1']
0x40204d:  ['0x401ad3']
0x402072:  ['0x401bbb']
0x402096:  ['0x401caf']
0x4020b3:  ['0x401d9a']
0x4020c2:  ['0x401e73']
0x401f54:  []
```

## patch

1.  假如只有一个后继的，我们直接把最后一条指令patch为

```
jmp 后继地址
```

1.  假如有双后继，根据我们前面说的，列表左边是zf=1，右边是zf=0，从cmovxx开始，patch为

```
jz 列表左侧地址
jmp 列表右侧地址
```

剩下的地方用nop填充  
然后再后面把没用到的块给nop了

```python
from collections import deque

import ida_funcs
import idaapi
import idautils
import idc
import keystone


def patch_ins_to_nop(ins):
    size = idc.get_item_size(ins)
    for i in range(size):
        idc.patch_byte(ins + i,0x90)


def patch_bytes(addr, data):
    for i, b in enumerate(data):
        idc.patch_byte(addr + i, b)


def fill_nop(start_ea, end_ea):
    # [FIX 1] 应该是 end - start，否则是负数
    size = end_ea - start_ea 
    if size > 0:
        # [FIX 2] 使用 patch_bytes 批量写入
        patch_bytes(start_ea, b'\x90' * size)

def get_block_by_address(ea):
    func = idaapi.get_func(ea)
    blocks = idaapi.FlowChart(func)
    for block in blocks:
        if block.start_ea <= ea < block.end_ea:
            return block
    return None

def generate_jmp_code(src, dst):
    # E9 xx xx xx xx
    offset = dst - (src + 5)
    return b'\xE9' + offset.to_bytes(4, 'little', signed=True)

def generate_jz_code(src, dst):
    # 0F 84 xx xx xx xx
    offset = dst - (src + 6)
    return b'\x0F\x84' + offset.to_bytes(4, 'little', signed=True)

def patch_branch(patch_dict):
    for ea in patch_dict:
        values = patch_dict[ea]
        if len(values) == 0:#如果后继块为0,基本都是return块,不需要patch,直接跳过
            continue
        block = get_block_by_address(int(ea, 16))
        start_ea = block.start_ea
        end_ea = block.end_ea
        last_ins_ea = idc.prev_head(end_ea)#因为block.end_ea获取的地址是块最后一个地址的下一个地址,所以需要向上取一个地址
        if len(values) == 2:
            for ins in idautils.Heads(start_ea,end_ea):
                if idc.print_insn_mnem(ins).startswith("cmov"):
                    print("find cmov")
                    jz_code = generate_jz_code(ins, int(values[0],16))
                    jmp_code = generate_jmp_code(ins + len(jz_code), int(values[1],16))
                    
                    # [FIX 2] 实际写入内存！
                    patch_bytes(ins, jz_code)
                    patch_bytes(ins + len(jz_code), jmp_code)
                    
                    # 3. 填充 NOP
                    nop_start = ins + len(jz_code) + len(jmp_code)
                    fill_nop(nop_start, end_ea)
        if len(values) == 1:
            mnem = idc.print_insn_mnem(last_ins_ea)
            if mnem.startswith("jmp"):
                jmp_code = generate_jmp_code(last_ins_ea, int(values[0],16))
                patch_bytes(last_ins_ea, jmp_code)
                nop_start = last_ins_ea + len(jmp_code)
                fill_nop(nop_start, end_ea)

def find_all_useless_block(func_ea,real_blocks):
    blocks = idaapi.FlowChart(idaapi.get_func(func_ea))
    local_real_blocks = real_blocks.copy()
    useless_blocks = []
    
        # local_real_blocks.extend(succ.start_ea for succ in cur_block.succs())
    for block in blocks:
        start_ea = block.start_ea
        end_ea = block.end_ea
        if start_ea not in local_real_blocks:
            useless_blocks.append([start_ea,end_ea])
        
    print("所有的无用块:",[b for b in useless_blocks])
    return useless_blocks


def patch_useless_blocks(useless_blocks):
    
    # print(useless_blocks)
    for useless_block in useless_blocks:
        
        print(f"Nop-ing useless block from {hex(useless_block[0])} to {useless_block[1]}")
        fill_nop(useless_block[0], useless_block[1])
    print("无用块nop完成")


func_ea = 0x400620
all_real_blocks =[4195872, 4198689, 4198808, 4198878, 4198991, 4199006, 4199076, 4199158, 4199173, 4199206, 4199276, 4199346, 4199375, 4199407, 4199477, 4199553, 4199568, 4199598, 4199634, 4199656, 4199671, 4199686, 4199713, 4199783, 4199862, 4199877, 4199892, 4199917, 4199932, 4200002, 4200081, 4200096, 4200166, 4200249, 4200264, 4200293, 4200363, 4200444, 4200459, 4200496, 4200521, 4200545, 4200615, 4200698, 4200713, 4200742, 4200768, 4200800, 4200829, 4200859, 4200929, 4201021, 4201036, 4201075, 4201101, 4201171, 4201253, 4201268, 4201294, 4201309, 4201333, 4201403, 4201485, 4201500, 4201515, 4201542, 4201577, 4201647, 4201731, 4201746, 4201773, 4201797, 4201812, 4201882, 4201984, 4201999, 4202029, 4202099, 4202169, 4202198, 4202234, 4202249, 4202285, 4202300, 4202336, 4202391, 4202406, 4202421, 4202445, 4202469, 4202484, 4202508, 4202523, 4202547, 4202573, 4202610, 4202646, 4202675, 4202690, 4202324]
useless_blocks = find_all_useless_block(func_ea,all_real_blocks)
patch_branch({'0x400620': ['0x401121'], '0x401121': ['0x401198'], '0x401198': ['0x401f60', '0x4011de'], '0x4011de': ['0x401f60', '0x40124f'], '0x40124f': ['0x40125e'], '0x40125e': ['0x401f97', '0x4012a4'], '0x4012a4': ['0x401f97', '0x4012f6'], '0x4012f6': ['0x401305'], '0x401305': ['0x401326'], '0x401326': ['0x401fa6', '0x40136c'], '0x40136c': ['0x401fa6', '0x4013b2'], '0x4013b2': ['0x4015d4', '0x4013cf'], '0x4013cf': ['0x4013ef'], '0x4013ef': ['0x401fb5', '0x401435'], '0x401435': ['0x401fb5', '0x401481'], '0x401481': ['0x401490'], '0x401490': ['0x4014ae', '0x4014f7'], '0x4014ae': ['0x4014d2'], '0x4014d2': ['0x4014e8'], '0x4014e8': ['0x4015d4'], '0x4014f7': ['0x401506'], '0x401506': ['0x401521'], '0x401521': ['0x401fcd', '0x401567'], '0x401567': ['0x401fcd', '0x4015b6'], '0x4015b6': ['0x4015c5'], '0x4015c5': ['0x40125e'], '0x4015d4': ['0x4015ed'], '0x4015ed': ['0x4015fc'], '0x4015fc': ['0x401fe5', '0x401642'], '0x401642': ['0x401fe5', '0x401691'], '0x401691': ['0x4016a0'], '0x4016a0': ['0x401ff4', '0x4016e6'], '0x4016e6': ['0x401ff4', '0x401739'], '0x401739': ['0x401748'], '0x401748': ['0x401d54', '0x401765'], '0x401765': ['0x40200c', '0x4017ab'], '0x4017ab': ['0x40200c', '0x4017fc'], '0x4017fc': ['0x40180b'], '0x40180b': ['0x401830'], '0x401830': ['0x401849'], '0x401849': ['0x401861'], '0x401861': ['0x40201b', '0x4018a7'], '0x4018a7': ['0x40201b', '0x4018fa'], '0x4018fa': ['0x401909'], '0x401909': ['0x401c2b', '0x401926'], '0x401926': ['0x401940'], '0x401940': ['0x401960'], '0x401960': ['0x401a73', '0x40197d'], '0x40197d': ['0x40199b'], '0x40199b': ['0x402033', '0x4019e1'], '0x4019e1': ['0x402033', '0x401a3d'], '0x401a3d': ['0x401a4c'], '0x401a4c': ['0x401b4e'], '0x401a73': ['0x401a8d'], '0x401a8d': ['0x40204d', '0x401ad3'], '0x401ad3': ['0x40204d', '0x401b25'], '0x401b25': ['0x401b34'], '0x401b34': ['0x401b4e'], '0x401b4e': ['0x401b5d'], '0x401b5d': ['0x401b75'], '0x401b75': ['0x402072', '0x401bbb'], '0x401bbb': ['0x402072', '0x401c0d'], '0x401c0d': ['0x401c1c'], '0x401c1c': ['0x401849'], '0x401c2b': ['0x401c46'], '0x401c46': ['0x401c69'], '0x401c69': ['0x402096', '0x401caf'], '0x401caf': ['0x402096', '0x401d03'], '0x401d03': ['0x401d12'], '0x401d12': ['0x401d2d'], '0x401d2d': ['0x401d45'], '0x401d45': ['0x4015fc'], '0x401d54': ['0x4020b3', '0x401d9a'], '0x401d9a': ['0x4020b3', '0x401e00'], '0x401e00': ['0x401e0f'], '0x401e0f': ['0x401e2d'], '0x401e2d': ['0x4020c2', '0x401e73'], '0x401e73': ['0x4020c2', '0x401eb9'], '0x401eb9': ['0x401ed6', '0x401f09'], '0x401ed6': ['0x401efa'], '0x401efa': ['0x401f3c'], '0x401f09': ['0x401f2d'], '0x401f2d': ['0x401f3c'], '0x401f3c': ['0x401f54'], '0x401f60': ['0x4011de'], '0x401f97': ['0x4012a4'], '0x401fa6': ['0x40136c'], '0x401fb5': ['0x401435'], '0x401fcd': ['0x401567'], '0x401fe5': ['0x401642'], '0x401ff4': ['0x4016e6'], '0x40200c': ['0x4017ab'], '0x40201b': ['0x4018a7'], '0x402033': ['0x4019e1'], '0x40204d': ['0x401ad3'], '0x402072': ['0x401bbb'], '0x402096': ['0x401caf'], '0x4020b3': ['0x401d9a'], '0x4020c2': ['0x401e73'], '0x401f54': []})

patch_useless_blocks(useless_blocks)
ida_funcs.reanalyze_function(ida_funcs.get_func(func_ea))#刷新函数控制流图
print("控制流图已刷新")
```

这里一个小细节,我们先找出所有的无用块列表，得到开始地址与结束地址，然后在进行控制流的patch，最后根据前面获取的无用块列表，nop无用块，如果先patch控制流在寻找无用块，找出来的无用块是错误的  
恢复完的到代码

```c
__int64 __fastcall main(int a1, char **a2, char **a3)
{
  signed __int64 v4; // [rsp+1E0h] [rbp-110h]
  int n6; // [rsp+1E8h] [rbp-108h]
  int n64; // [rsp+1ECh] [rbp-104h]
  int n64_1; // [rsp+1ECh] [rbp-104h]
  _BYTE s1[48]; // [rsp+1F0h] [rbp-100h] BYREF
  _BYTE s[60]; // [rsp+220h] [rbp-D0h] BYREF
  unsigned int v10; // [rsp+25Ch] [rbp-94h]
  _BYTE *p_s; // [rsp+260h] [rbp-90h]
  int n64_3; // [rsp+26Ch] [rbp-84h]
  bool v13; // [rsp+272h] [rbp-7Eh]
  unsigned __int8 n10; // [rsp+273h] [rbp-7Dh]
  int n10_1; // [rsp+274h] [rbp-7Ch]
  _BYTE *v16; // [rsp+278h] [rbp-78h]
  int v17; // [rsp+284h] [rbp-6Ch]
  int n6_1; // [rsp+288h] [rbp-68h]
  bool v19; // [rsp+28Fh] [rbp-61h]
  _BYTE *p_s_1; // [rsp+290h] [rbp-60h]
  int n64_4; // [rsp+298h] [rbp-58h]
  bool v22; // [rsp+29Fh] [rbp-51h]
  signed __int64 v23; // [rsp+2A0h] [rbp-50h]
  bool v24; // [rsp+2AFh] [rbp-41h]
  __int64 v25; // [rsp+2B0h] [rbp-40h]
  __int64 v26; // [rsp+2B8h] [rbp-38h]
  signed __int64 v27; // [rsp+2C0h] [rbp-30h]
  __int64 v28; // [rsp+2C8h] [rbp-28h]
  int n64_2; // [rsp+2D0h] [rbp-20h]
  int v30; // [rsp+2D4h] [rbp-1Ch]
  signed __int64 *v31; // [rsp+2D8h] [rbp-18h]
  int v32; // [rsp+2E0h] [rbp-10h]
  int v33; // [rsp+2E4h] [rbp-Ch]
  bool v34; // [rsp+2EBh] [rbp-5h]

  v10 = 0;
  memset(s, 0, 0x30u);
  memset(s1, 0, sizeof(s1));
  printf("Input:");
  p_s = s;
  __isoc99_scanf("%s", s);
  for ( n64 = 0; ; ++n64 )
  {
    n64_3 = n64;
    v13 = n64 < 64;
    if ( n64 >= 64 )
      break;
    n10 = s[n64];
    n10_1 = n10;
    if ( n10 == 10 )
    {
      v16 = &s[n64];
      *v16 = 0;
      break;
    }
    v17 = n64 + 1;
  }
  for ( n6 = 0; ; ++n6 )
  {
    n6_1 = n6;
    v19 = n6 < 6;
    if ( n6 >= 6 )
      break;
    p_s_1 = s;
    v4 = *(_QWORD *)&s[8 * n6];
    for ( n64_1 = 0; ; ++n64_1 )
    {
      n64_4 = n64_1;
      v22 = n64_1 < 64;
      if ( n64_1 >= 64 )
        break;
      v23 = v4;
      v24 = v4 < 0;
      if ( v4 >= 0 )
      {
        v27 = v4;
        v28 = 2 * v4;
        v4 *= 2LL;
      }
      else
      {
        v25 = 2 * v4;
        v26 = 2 * v4;
        v4 = (2 * v4) ^ 0xB0004B7679FA26B3LL;
      }
      n64_2 = n64_1;
    }
    v30 = 8 * n6;
    v31 = (signed __int64 *)&s1[8 * n6];
    *v31 = v4;
    v32 = n6 + 1;
  }
  v33 = memcmp(s1, &s2_, 0x30u);
  v34 = v33 != 0;
  if ( v33 )
    puts("Wrong!");
  else
    puts("Correct!");
  return v10;
}
```

最后exp:

```python
import struct

# Data from s2_
s2_bytes = [
    0x96, 0x62, 0x53, 0x43, 0x6d, 0xf2, 0x8f, 0xbc, 
    0x16, 0xee, 0x30, 0x5, 0x78, 0x0, 0x1, 0x52, 
    0xec, 0x8, 0x5f, 0x93, 0xea, 0xb5, 0xc0, 0x4d, 
    0x50, 0xf4, 0x53, 0xd8, 0xaf, 0x90, 0x2b, 0x34, 
    0x81, 0x36, 0x2c, 0xaa, 0xbc, 0xe, 0x25, 0x8b, 
    0xe4, 0x8a, 0xc6, 0xa2, 0x81, 0x9f, 0x75, 0x55
]

POLY = 0xB0004B7679FA26B3

# Convert bytes to QWORDs (little endian)
qwords = []
for i in range(0, len(s2_bytes), 8):
    chunk = s2_bytes[i:i+8]
    val = struct.unpack('<Q', bytes(chunk))[0]
    qwords.append(val)

start_vals = []
for val in qwords:
    curr = val
    for _ in range(64):
        if curr & 1:
            curr = (curr ^ POLY) >> 1
            curr |= 0x8000000000000000
        else:
            curr = curr >> 1
    start_vals.append(curr)

# Convert back to bytes
flag = b''
for val in start_vals:
    flag += struct.pack('<Q', val)

print(flag)
try:
    print("Flag:", flag.decode('utf-8'))
except:
    pass

#flag{6ff29390-6c20-4c56-ba70-a95758e3d1f8}
```

[#软件保护](https://bbs.kanxue.com/forum-4-1-3.htm) [#问题讨论](https://bbs.kanxue.com/forum-4-1-197.htm)
