---
title: 【看雪】xdec：为去 VMP 而生的可编程反编译引擎(ai文)
source: https://bbs.kanxue.com/thread-293620.htm
source_host: bbs.kanxue.com
clip_date: 2026-11-20T20:08:57+08:00
trace_id: b08de37d-5a3e-4ae3-b664-8dfe83a59bcd
content_hash: a9bf077da3aa665cce03f0c8064f850d708a6378e9acaac83c17ec5d59b05228
status: synced
tags:
  - 看雪
  - 脱壳与加固
  - 编译器保护
series: null
feed_source: 看雪·Android安全
ai_summary: xdec 是面向去 VMP 的可编程 C++20 多级 IL 反编译库，让少量 Python 解码脚本复用 SSA、MBA、结构化和 Bit-Exact 校验能力。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41e75244-d011-8164-a0e4-e7d19ecd908e
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> xdec 是面向去 VMP 的可编程 C++20 多级 IL 反编译库，让少量 Python 解码脚本复用 SSA、MBA、结构化和 Bit-Exact 校验能力。
> 
> - **定位与入口：** 采用 Library-First 架构，上层用 `pyxdec` 描述字节码解码，再通过 `decompile_from_il()` 把自定义虚拟架构接回核心优化管线。
> - **虚拟架构：** `il::RegisterFile` 支持任意数量、位宽及父子视图的寄存器，`AbiSpec` 解耦架构假设，128×64 寄存器机与仅 `vSP`/`vPC` 栈机均可处理。
> - **内存与状态消除：** `LayeredMemory` 可叠加解密/重定位层并标记不可变区；`RegionMem2Reg`、`RegionDSE` 将私有栈/寄存器提升为 SSA，消除别名与死存储。
> - **去混淆能力：** `structured_exprs=True` 导出带溯源的双视图 AST，`summarize_case_effects()` 聚类 Handler 语义；`Specializer` 按 `(pc, StateKey)` 部分求值，应对 OLLVM 平坦化与滚动 key。
> - **实测效果：** 115,776 B XIMG 样本中 `cs` 含 333 块、18,759 条静态 VM 指令、134,059 条动态指令，约 1 秒还原 C；原始与优化 IL 均 Bit-Exact 输出 `0x44704227`，核心禁止样本硬编码并有 889 个合成单测。

> 这个是以前windows vmp基本都是这个思路,但是大家实现不一样,xdec也只是在ai时代做的更加完善,其实跟以前我的zhuzhu-Top/de_vm本质思路是一致的

> 我一直很喜欢binja,开源了很多内容,但是还核心的il不做开源,导致无法进一步定制,我期待是类似js vmp还原一样的思路,直接遍历ast完成还原,现在xdec也可以做到了,xdec也能作为一款非常轻便的反编译工具,对大二进制文件有奇效,我会持续迭代优化xdec

> 因为是自己的反编译工具,所以在trace方面也能做的更好,xdec可以作为类似unicorn的工具,进而实现字节/位级别的污点传播(这些都是我实际用xdec已经实现的工具),虽然现在ai时代模型能力越来越强,但是这些都是很有趣的技术

面对一个 **VMP（Virtual Machine Protection）** 或 **OLLVM + 自定义虚拟机** 混合保护的算法模块：

-   静态反编译器面对 500+ 块的字节码解释器循环，要么卡死在状态分派图上，要么给你吐出一堆 `*(vm_ctx + rs * 8)` 的指针读写；
-   于是大家只能退回到「手写 Python 模拟器 + 跑 Unicorn Trace + 盯十几万条动态指令人肉总结算法」的原始手工劳动；
-   最憋屈的是： **你明明知道虚拟机里面跑的就是一个魔改哈希或分组密码，却完全用不上反编译器的 SSA 优化、常量传播、MBA 化简与控制流结构化能力。**

为了彻底解决这个问题，我从头设计并开源了 **`xdec`**—— 一个从架构第一天起就 **专为去混淆与去虚拟化（Devirtualization）而生的 C++20 多级 IL 反编译库与 Python 绑定（ `pyxdec` ）**。

开源仓库： [zhuzhu-Top/xdec](https://github.com/zhuzhu-Top/xdec)

* * *

## 一、为什么传统反编译器「啃不动」VMP？

商业与自研 VMP 的实现五花八门：

-   **封装形态各异**：明文段、XOR/zlib 压缩壳、自定义 ELF 变体（如 `XIMG` ）、运行时 `call_once` 解密；
-   **虚拟架构各异**：128×64-bit 寄存器机、纯栈机（ `vSP` push/pop）、混合内存机；
-   **编码花样翻新**：PC 相关 XOR 解混淆、滚动 key、opcode 二次重映射表（`.rodata_v` ）、源寄存器差分编码；
-   **调度形态各异**：大 `switch(opcode)` 、直接线程化 `br xN` 、OLLVM 控制流平坦化套壳。

把每家 VMP 的解包/解码逻辑硬编码进反编译器核心是不现实的。 **真正优雅的解法不是「替你猜所有 VMP」，而是把反编译器做成一套可编程底层库（Library-First）：**

```rust
┌────────────────────────────────────────────────────────────────────────────┐
│                上层分析脚本层 (Python / pyxdec，按目标样本定制)              │
│                                                                            │
│  [1] Load & Bootstrap   xdec.Image / LayeredMemory / RuntimeOracle         │
│         │               加载并挂载解密、重定位后的虚拟载荷                   │
│         ▼                                                                  │
│  [2] Dual-View 模式识别 xdec.Image.decompile(structured_exprs=True)        │
│                         遍历结构化 HlStmt/HlExpr AST + summarize_case_effects │
│         │               批量自动化聚类解释器 Handler 语义                    │
│         ▼                                                                  │
│  [3] 提升为标准 IL      xdec.il.FunctionBuilder + xdec.AbiSpec             │
│                         为任意自定义虚拟架构构造 il::Function               │
│         │                                                                  │
│         ▼                                                                  │
│  [4] 回流优化与校验     xdec.decompile_from_il() + xdec.il.Interpreter     │
│                         白嫖 SSA/MBA/Structurizer 出 C，并做 Bit-Exact 校验 │
└──────────────────────────┬─────────────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                        xdec Core (纯通用底层引擎)                           │
│  • 数据驱动 ISA: il::RegisterFile + analysis::AbiSpec + Custom32/64        │
│  • 私有状态消除: passes::RegionMem2Reg + passes::RegionDSE                  │
│  • 常量与代数化简: const-fold-memory + SCCP + MBA 恒等式 + Oracle 验证门禁   │
│  • 可选部分求值: devirt::Specializer ((pc, StateKey) 上下文敏感展开)        │
│  • 校验闭环: il::Interpreter (DAG memoized) + devirt::DiffVerifier         │
└────────────────────────────────────────────────────────────────────────────┘
```

一句话总结： **你只需要用几十行 Python 描述「字节码怎么解码」，剩下的常量折叠、虚拟栈/寄存器提升、MBA 化简、循环结构化、C 代码还原和 Bit-Exact 执行校验，全部由 `xdec` 核心自动接管。**

* * *

## 二、xdec 专为去 VMP 打造的五大核心武器

### 1\. 彻底数据驱动的虚拟架构与中段入口（AbiSpec + decompile_from_il）

`xdec` 的 `il::RegisterFile` 原生支持任意数量、任意位宽、带父子视图（zero-extend / preserve）的虚拟寄存器；中段管线通过 `analysis::AbiSpec` 解耦了所有架构假设。无论是 **128 个 64-bit 寄存器的 RISC 虚拟机**，还是 **只有 `vSP` / `vPC` 的栈式虚拟机**，都是 `xdec` 的一等公民。

### 2\. 分层覆盖内存与区域别名消除（LayeredMemory + RegionMem2Reg / RegionDSE）

-   `xdec.LayeredMemory` 支持在原始镜像上叠加多个解密/重定位后的内存层，并将 `.rodata` / `.text` / `.got` 标记为 `immutable=True` ，让 `const-fold-memory` 自动将虚拟指令的查表、常量加载折进表达式；
-   `passes::RegionMem2Reg` 与 `passes::RegionDSE` 针对 `PrivateRegFile` / `PrivateStack` 区域执行非逃逸判定、支配边界 Phi 提升与死存储消除—— **哪怕字节码全靠虚拟栈 push/pop 或 `vm_ctx` 结构体传值，也会被自动还原成干净的 SSA 局部变量。**

### 3\. Dual-View AST 与通用副作用摘要（HlStmt/HlExpr + summarize_case_effects）

`decompile(..., structured_exprs=True)` 同时导出带 `il_expr` / `il_op` / `il_blocks` 溯源的结构化 AST 与底层规范化 IL DAG。 `summarize_case_effects()` 可从解释器的任意一个 `case` 或分支块中自动拆出：

-   索引槽位读写模式 `base + index * scale + offset`
-   核心纯表达式算子（ `Xor` / `Add` / `RotR` / `Shl`...）与位宽/符号扩展标志
-   内存访存宽度、条件分支与外部调用

### 4\. 上下文敏感部分求值引擎（devirt::Specializer）

面对没有规整 `switch(opcode)` 的 **OLLVM 控制流平坦化** 或 **滚动 key 字节码解释器**， `xdec.specialize()` 按 `(pc, StateKey)` 自动沿路径展开、折叠常量分支与不可变查表、并在命中已访问状态时自动连回边形成循环。

### 5\. 多块/多函数 il::Interpreter 与 DiffVerifier

优化反编译完以后，怎么证明自己的去虚拟化没有引入 1 bit 偏差？  
`xdec.il.Interpreter` （支持跨块 Phi 求值、多函数 `subfunctions` 递归调用以及单次求值 DAG memoization）与 `xdec.diff_verify()` 可以 **直接执行提升后的原始 `Cfg` IL 和优化后的 `Vars` IL**，与真实向量逐字节比对。

* * *

## 三、真实样本实战：还原 128 寄存器 XIMG 加密虚拟机

仓库中的 [`samples/rqt/`](https://bbs.kanxue.com/samples/rqt/) 提供了一个完全自包含的脱敏真实样本（ `vm_payload.bin` ，115,776 B 的 `XIMG` ELF64 虚拟载荷 + `vm_fmt.json` 指令格式表，无需任何外部私有二进制即可一键运行）。

### 样本保护结构

这个样本实现了一个受 128 寄存器自定义 RISC 虚拟机保护的摘要令牌计算模块：

1.  **指令编码混淆**：每条 32-bit 定长指令包含 PC 相关操作码异或 + `.rodata_v` 54 对操作码二次重映射 + 源寄存器差分编码；
2.  **双重套壳**：VM 字节码保护之下的核心入口 `cs` （ `333` 个基本块 / `18,759` 条静态 VM 指令 / 运行时动态执行 **134,059** 条指令），内部 **还叠加了一层 OLLVM 控制流平坦化**；
3.  **跨 GOT 内部调用**： `cs` 内部通过 `ADRP + ADD_LO14 + LD64 + BLR` 经 `.got` 间接调用 `vm_memset` 与 `vm_memcpy` ，且 `.data` 段依赖 `.init_array` 运行时 XOR 12 解密初始化。

### Step 1：用 pyxdec 定义 128 寄存器虚拟架构并提升字节码

在 [`samples/rqt/devirt_rqt.py`](https://bbs.kanxue.com/samples/rqt/devirt_rqt.py) 中，我们只需要声明 `r0..r127` 寄存器文件和 `AbiSpec` ：

```python
rf = xdec.il.RegisterFile()
R = [
    rf.add(
        f"r{i}", 64,
        xdec.il.RegClass.General if i != 125 else xdec.il.RegClass.StackPointer,
    )
    for i in range(128)
]
abi = xdec.AbiSpec(
    name="vm-128-64",
    stack_pointer=R[125],
    link_register=R[127],
    int_arg_regs=R[0:8],
    int_ret_regs=[R[0]],
    callee_saved_regs=R[8:125] + [R[126], R[127]],
    caller_saved_regs=R[0:8],
)
```

随后把 `.rodata` /`.text` /`.got` 作为 `immutable=True` 层挂载进 `xdec.LayeredMemory()` ，用 `xdec.il.FunctionBuilder` 按解码出的指令逐条构建 IL，再直接送入：

```python
res = xdec.decompile_from_il(fn_cfg, abi=abi, memory=layered, names=names)
```

### Step 2：运行结果与还原出的真实 C 逻辑

执行：

```powershell
python samples/rqt/devirt_rqt.py
```

总耗时 **~1.0 秒**，实测输出：

```lua
[1/4] Loaded anonymized VM payload (115,776 B), entry cs @ 0x10004000
[2/4] Lifting VM functions into xdec::il::Function ...
  lifted cs @ 0x10004000: 333 basic blocks
[3/4] Decompiling cs via xdec.decompile_from_il ...
  wrote samples\rqt\output\cs.c (6069 lines, labeled=32, vars_blocks=333)
  lifted vm_init_array @ 0x10016520: 4 basic blocks
  wrote samples\rqt\output\vm_init_array.c (21 lines, labeled=0, vars_blocks=4)
  lifted vm_memcpy @ 0x10016588: 33 basic blocks
  wrote samples\rqt\output\vm_memcpy.c (271 lines, labeled=6, vars_blocks=33)
  lifted vm_memset @ 0x10016a2c: 12 basic blocks
  wrote samples\rqt\output\vm_memset.c (84 lines, labeled=2, vars_blocks=12)
[4/4] Executing cs via xdec.il.Interpreter (Bit-Exact check) ...
  Cfg (raw lifted): out_u32=0x44704227 (expected=0x44704227), out_len=4
  Vars (xdec optimized): out_u32=0x44704227 (expected=0x44704227), out_len=4
SUCCESS: Self-contained VM devirtualization & Bit-Exact IL execution PASSED!
```

看看从加密虚拟机里直接还原出来的 C 代码质量：

1.  **`vm_init_array.c` （21 行，0 gotos）**：完整还原为标准 `do ... while` 解密循环：

```c
uint64_t vm_init_array(void) {
  uint64_t var_18; // sp-24
  uint64_t t0, _cse0;

  var_18 = 0x0;
  do {
    t0 = var_18;
    _cse0 = (t0 + 0x10018000);
    (*(uint8_t*)(_cse0)) = ((uint8_t)((((int64_t)(int8_t)((*(uint8_t*)(_cse0)))) ^ 0xc)));
    var_18 = (t0 + 0x1);
  } while ((((t0 + 0x1) < 0x6) == 0x1));
  return 0x10018000;
}
```

2.  **`cs.c` 中的核心魔改密码细节一目了然** （原本隐藏在 13.4 万条动态 VM 指令中）：

-   **魔改 HMAC ipad / opad（4008–4202 行）**：直接展开为 `^ 0xdf` 与 `^ 0xec` ；
-   **魔改 SHA-256 双轮常数表切换与自定义移位量（1555–1564 行）**：

```c
t833 = (*(uint32_t*)(((((((_cse7 & 0xff) % 0x3) == var_1a98) == 0x1) ? 0x100002d0 : 0x100003d0) + _cse6)));
...
_cse9 = (... + (((((_cse10 & var_1ac8) >> 0x7) | (_cse10 << 0x19)) ^ (((_cse10 & 0xffffe000) >> 0xd) | (_cse10 << 0x13))) ^ (((_cse10 & 0xfffe0000) >> 0x11) | (_cse10 << 0xf)))) + ...);
```

`i % 3 == 0` 切换两张轮常数表（ `0x100002d0` / `0x100003d0` ）以及 `(7, 13, 17)` 、 `(5, 11, 19)` 的魔改循环移位量直接呈现在 C 表达式中；

-   **魔改 MD5 位长异或魔数（2848 行）**： `_cse596 = (_cse590 ^ 0x64130efb);`；
-   **最终 8-bit 滚动哈希与拼装（3818 行）**：完整坍缩为乘数 `0x85` （133）、掩码 `0x3f` / `0x6f00` 与 `0x44000000` 的单条赋值， **且优化前 `Cfg` IL 与优化后 `Vars` IL 在 `xdec.il.Interpreter` 上均 100% Bit-Exact 输出 `0x44704227`**。

* * *

## 四、核心设计原则：Core 保持纯粹，特定样本留给脚本/插件

在 `xdec` 的架构规范（ `docs/00-core-vs-plugin-prompt.md` ）中，有一条铁律：  
**任何针对具体样本的硬编码、启发式、专用魔法数，一律禁止进入 Core。**

-   **C++ Core（ `src/` 、 `include/xdec/` ）** 只做完全通用、架构无关的底座（889 个不依赖任何外部真实样本的 L0 合成单元测试保护着所有不变量）；
-   **Python 脚本层（ `pyxdec` ）** 用于极速探索各类 VMP 的解包、Handler 聚类、IL 提升与部分求值；
-   **C++ 插件层（ `XdecPluginHost` ）** 允许将成熟的去混淆策略（如 OLLVM 状态线程化、特定 SDK 语义恢复、Oracle 校验后的自定义 MBA 规则）无缝下沉为原生 `.dll` /`.so` 插件，直接接入 `xdec` CLI 与 `xdec serve --mcp` 。

如果你也在被各类定制 VMP、OLLVM 平坦化或白盒密码折磨，欢迎试用并一起共建 `xdec` ：

-   GitHub: [https://github.com/zhuzhu-Top/xdec](https://github.com/zhuzhu-Top/xdec)
-   构建运行 `samples/rqt/devirt_rqt.py` 即可在本地 1 秒复现本文全部去虚拟化过程与 Bit-Exact 校验。

[#基础理论](https://bbs.kanxue.com/forum-161-1-117.htm) [#逆向分析](https://bbs.kanxue.com/forum-161-1-118.htm) [#混淆加固](https://bbs.kanxue.com/forum-161-1-121.htm) [#脱壳反混淆](https://bbs.kanxue.com/forum-161-1-122.htm)

## 附件

- [cs.c](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/attach/2026/11/7023086a64ddc7f4.c) （291.27kb，2次下载）
- [vm_init_array.c](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/attach/2026/11/c6cc0294baff8b22.c) （0.57kb，6次下载）
- [vm_memcpy.c](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/attach/2026/11/1de1260705acabe6.c) （10.65kb，4次下载）
- [vm_memset.c](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/attach/2026/11/37989dd71ea9aaeb.c) （2.87kb，4次下载）
