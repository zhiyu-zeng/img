---
title: 【看雪】用 P-code 做 VMP 还原：一份实战向的 IR 入门
source: https://bbs.kanxue.com/thread-292911.htm
source_host: bbs.kanxue.com
clip_date: 2026-09-11T13:31:41+08:00
trace_id: ba6b1aca-3b6a-46b8-8cf0-368b69c722c2
content_hash: 8a48d79eb77a4c10e42ccb908b6c066e4e9717464f39cae7008b35f80487726f
status: synced
tags:
  - 看雪
  - VMP还原
  - P-code反混淆
series: null
feed_source: 看雪·Android安全
ai_summary: P-code 把 ARM64 汇编摊成显式 varnode def-use 图，配合 trace 折叠，即可在 varnode 层自动追出 VMP 的锚点寄存器。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3d875244-d011-812f-8c24-d67ed8b35695
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> P-code 把 ARM64 汇编摊成显式 varnode def-use 图，配合 trace 折叠，即可在 varnode 层自动追出 VMP 的锚点寄存器。
> 
> - **工具链：** pypcode 只吃机器码，需先用 keystone 汇编；`Context` 构造昂贵要复用；`base_address` 决定 PC 相对指令（bl/adr/字面量 ldr）的目标常量，且只对第一条指令可靠。
> - **表示结构：** 每个 `PcodeOp` 只有 opcode/output/inputs；所有值都是 `(space, offset, size)` 的 varnode，space 分 register/unique/ram/const，`const` 的 offset 就是值本身；同一寄存器如 x23 与 w23 offset 相同（0x40b8）仅 size 不同，故按 offset 而非名字认寄存器。
> - **三个必踩坑：** op 不带地址，指令边界只能靠 `IMARK` 切；`LOAD/STORE` 第一个输入是每进程随机化的空间标记常量，真实地址在 `inputs[1]`、存入值在 `inputs[2]`；`unique` 的 offset 会被跨指令复用，分类必须边扫边做。
> - **折叠与 trace 边界：** 折叠即把 varnode 从 register 折到 const，值来自动态 trace（先折输入、再做常量折叠）；trace 不记 NZCV flags 与「内存地址→值」，条件码穿透和内存 key 分析会断。
> - **实战结论：** 一条 handler 展开后是 `regs[dst]=regs[src]+imm16` + IP++ + dispatch；VM 骨架为 IP 在 [x23]、寄存器文件 [x24+idx*8]、handler 表 [x25+opcode*8]、每条 VM 指令 0x30 字节。锚点应在 varnode 层前向染色追踪（LOAD 地址带 ip 色=读 IP，STORE 地址带色=写 IP），而非在指令层找寄存器。

> 面向：会看 ARM64 汇编、想上手 VMP / 去混淆，但没接触过中间表示的同学。  
> 环境：Python 3 + pypcode（Ghidra 反编译器的 Python 绑定）+ keystone。  
> **注意：** 模型以笔记底座写的东西，上下文是七神分析

## 0\. 先说结论：P-code 能帮你干什么

先说人话。如果你正在还原一个 VMP，下面这几件事大概率正在恶心你：

-   handler 长得都差不多，语义却完全不同，一个个抠汇编抠到吐血
-   寄存器被反复复用， `x10` 上一条是「源值」、下一条是「临时」，纯看汇编得自己脑内记账
-   想知道「这个值从哪来、又流到哪去」，汇编里全是隐式的，追两步就断

P-code 解决的就是这三件事：

1.  **一条汇编变成若干条语义单一的微操作** （ `COPY` / `LOAD` / `INT_ADD` / …），没有隐式副作用
2.  **每个值都有名字** （varnode），寄存器重命名、内存别名、条件码这些脏东西全被显式化
3.  **def-use 是现成的**—— 每个 varnode 谁定的、谁用的，一目了然

第三条最值钱：它本身就是一张 DFG（数据流图）的骨架。后面做污点追踪、锚点定位、语义还原，全建在它上面。

所以对 VMP 还原来说，P-code 不是「锦上添花的可视化」，而是 **把「读汇编」这件事换成「查图」**。

* * *

## 1\. 拿到 P-code

pypcode 吃的是 **机器码**，不是汇编文本。所以明文汇编得先用 keystone 编一遍：

```python
import keystone, pypcode

ARCH = "AARCH64:LE:64:v8A"          # SLEIGH 规范名：Ghidra 的 AArch64

ks = keystone.Ks(keystone.KS_ARCH_ARM64, keystone.KS_MODE_LITTLE_ENDIAN)
enc, count = ks.asm("ldr w9, [x23]")

ctx = pypcode.Context(ARCH)
ops = ctx.translate(bytes(enc), base_address=0x2e87e8)   # 返回 Translation
ops.ops                                                   # PcodeOp 列表
```

两个参数值得说：

**`base_address`** 决定 Sleigh 译码时的指令地址，进而决定 **所有 PC 相对指令** （ `bl` / `adr` / 字面量 `ldr` ）算出来的目标常量。你的 trace 里给的是模块偏移（RVA），喂进去才能还原出真实的调用目标；不给就是 0，目标全错。注意它只对 **第一条** 指令一定对 —— 把不连续的指令拼成一块喂进去，后面的就都歪了。

**`ctx` 是个重家伙**，构造一次就够了。几万条指令的循环里反复 `pypcode.Context(ARCH)` 会死得很难看。

> 补一句：keystone 的 AArch64 停在 v8.0，ARMv8.1 的 LSE 原子指令（ `casal` / `ldaddal` 之类）一条都不认。trace 里真出现的话，一条编不出来就会带崩整块 —— 要么退回 `llvm-mc -show-encoding` 取编码，要么逐条编译、编不动的走兜底。pypcode 那边是认这些指令的，拿到字节就能正常译。

## 2\. PcodeOp：三个分支

每个 `PcodeOp` 就三样东西：

```python
op.opcode   # 操作标签
op.output   # 输出 Varnode（可能为 None）
op.inputs   # 输入 Varnode 列表
```

`opcode` 拿名字用 `op.opcode.name` ，常见的有：

| 类别  | 例子  |
| --- | --- |
| 搬运  | `COPY` |
| 算术/逻辑 | `INT_ADD` `INT_MULT` `INT_LEFT` `INT_AND` `INT_XOR` |
| 比较  | `INT_EQUAL` `INT_SLESS` `INT_LESS` |
| 扩展/截断 | `INT_ZEXT` `INT_SEXT` `SUBPIECE` |
| 内存  | `LOAD` `STORE` |
| 控制流 | `BRANCH` `CBRANCH` `BRANCHIND` `CALL` `CALLIND` `RETURN` |
| 边界  | `IMARK` |

```python
OpCode.COPY
  output: unique[c700:8]    input: x23
```

## 3\. varnode：一切都拆成三元组

P-code 里 **没有「操作数」这种模糊概念**，任何输入输出都是 varnode，一个 `(space, offset, size)` 三元组：

```python
vn.space.name   # 'register' / 'unique' / 'ram' / 'const'
vn.offset       # 空间内的偏移，含义随 space 变
vn.size         # 字节长度
```

拿 x23 举例：

```python
print(vn.space.name, hex(vn.offset), vn.size)
# register 0x40b8 8
```

`size` 这东西很关键： `x23` 和 `w23` 的 **offset 完全相同（0x40b8），只有 size 不同（8 / 4）**。这是后面所有「按 offset 认寄存器」写法的根据，也是「按名字认会漏」的原因。

全部寄存器表可以直接从 Context 拿：

```python
for vn, name in ctx.getAllRegisters().items():
    print(name, hex(vn.offset), vn.size)
# x23 0x40b8 8
# w23 0x40b8 4
```

## 4\. space 决定 offset 是什么（核心）

这是全文最重要的一张表：

| space | offset 含义 | 实战意义 |
| --- | --- | --- |
| `register` | 寄存器在 register space 的偏移 | **真实世界的输入**，值来自 CPU / trace |
| `unique` | 指令内部临时值，SLEIGH 顺序分配 | **中间价**，编译器生成的临时变量 |
| `ram` | 内存地址 | 内存里的东西 |
| `const` | **常量值本身** | 已知的确定值 |

对应的表示法：

```python
register[0x40b8:8]     # 寄存器，偏移 0x40b8
unique[c700:8]         # 临时变量
ram[0x794d9af5c8:8]    # 内存地址 0x794d9af5c8
const[0x30:8]          # 常量 0x30
```

**`const` 的 offset 就是值本身**，这一点第一次见会愣一下 —— 它不指向任何存储， `const[0x30:8]` 的意思就是「这里有个 0x30」。

看一眼真实的 `ldr w9, [x23]` 提升出来是什么：

```python
IMARK    in=[ram[0x2e87e8:4]]
COPY     unique[0xc700:8] = register[0x40b8:8]         ; x23 → 临时
LOAD     unique[0x48f00:4] = *(ram)unique[0xc700:8]    ; 用临时当地址去读
INT_ZEXT register[0x4048:8] = zext(unique[0x48f00:4])  ; 零扩展回 x9
```

**一条汇编，四条 P-code。** 而且注意第二行 —— 这就是后面要讲的坑。

## 5\. 三个必踩的坑

### 5.1 IMARK：指令边界藏在流里

pypcode 译每条指令时，会在流里 **先插一个 `IMARK`**，它的输入就是被译指令的地址：

```python
IMARK    in=[ram[0x2e87e8:4]]
```

`PcodeOp` 本身 **不携带地址**，你拿到的是一整条打平的 p-code 流。想知道「这条 op 属于哪条汇编」，唯一的依据就是 IMARK：

-   `IMARK` 不入业务逻辑，只用来切边界
-   它后面直到下一个 `IMARK` 之前的真实 p-code，都属于这条指令
-   A64 定长 4 字节，所以 **每条指令恰好一个 IMARK** （ `nop` / `hint` 这类是「一个 IMARK + 零条 op」）

我一开始不知道这个，直接拿 `op` 去找地址，找了半天找不到。这是最容易卡住半天的地方。

### 5.2 LOAD / STORE 的第一个输入不是地址

```python
LOAD  out=unique[0x48f00:4]  in=[const[0x3f857ee0:8], unique[0xc700:8]]
                                        ^^^^^^^^^^^^^^^^   ^^^^^^^^^^^^^^^^
                                        这个是空间标记      这个才是地址
```

**第一个输入是 pypcode 的「地址空间标记」常量**，它的值是 ram 空间的基址，而且 **每个 `Context` 构造时随机化** （实测两次跑差得十万八千里）。真正的地址是第二个输入。

```python
# 正确姿势
addr  = op.inputs[1]        # LOAD / STORE 都是
value = op.inputs[2]        # STORE 才有
```

不处理这个的话，你跨进程重跑一遍，所有二代 IR 全对不上 —— 因为那串随机基址每次都变。我的做法是把它归一成 0。

### 5.3 unique 的 offset 会被复用

`unique` 的生命周期 **只在单条指令内**，所以 SLEIGH 会复用编号。同一个 `unique[0xae00:8]` ，在这条指令里是左移的源，在另一条指令里可能是完全不相干的东西：

```python
; ldr x10, [x24, x10, lsl #3]
unique[ae00:8] = COPY x10
unique[da00:8] = COPY unique[ae00:8]
unique[da00:8] = INT_LEFT unique[da00:8], 0x3
...
; str x10, [x24, x13, lsl #3]      ← 另一条指令
unique[ae00:8] = COPY x13           ← 同一个 offset，值完全无关
```

**所以跨指令不能按 unique 的 offset 认「同一个值」。** 这条在写数据流分析时是个隐蔽的坑，特别是当你想着「先把整个流扫一遍，回头再统一分类」的时候 —— 回头那一格早被后面的指令覆盖了。要分类就在扫的过程中分类。

## 6\. 折叠：把 register 踢进 const

到这一步，P-code 还只是「汇编的另一种写法」。真正让它变成 **影子** 的，是把已知的值代进去。

概念很简单： **折叠 = 把 varnode 从 `register` space 踢到 `const` space**。

```python
折叠前：  register[0x40b8:8]          ; 这是「x23」，值未知
折叠后：  const[0x7853c7e1dc:8]       ; 这是「0x7853c7e1dc」，值已知
```

值从哪来？ **从 trace（动态执行）来，不是 P-code 自己算出来的。**

```python
# 一条 trace 行（七神 VMP）
{'asm': 'ldr w9, [x23]', 'read': {'X23': '0x7853c7e1dc'}, 'write': {'W9': '0x0'}}
```

`read` 列是执行前的值， `write` 列是执行后的值。手工折一条看看：

```python
原始汇编：  madd x10, x12, x11, x10
read 列：   {X12: 0x0, X11: 0xdec, X10: 0x794d9af5c8}

第一代（纯 SLEIGH）：
    x10 = (x12 * x11) + x10

第二代（把三个源 varnode 折成常量）：
    x10 = (0x0 * 0xdec) + 0x794d9af5c8
          └──────────────┘
           顺手就能常量折叠成 0x794d9af5c8
```

两个概念别混：

-   **替换**：源 varnode 换成 trace 里的常量值
-   **常量折叠**：代数化简，能算的算出来，中间 unique 变死代码消掉

顺序是「先折输入，再化简」，因为 unique 的值 trace 不记，只能靠输入折成常量之后化简掉。

**折叠的边界就是 trace 给了啥**：

| trace 给了 | 能折什么 |
| --- | --- |
| 读列（源寄存器值） | 折源  |
| 写列（目标寄存器值） | 折目标 |
| 内存地址 → 值 | **没记**—— 所以 LOAD/STORE 折不了「这地址里是啥」，只能靠输出寄存器已知之后反向折 |

还有两个已知的洞，动手前先有个心理准备：

1.  **flags / NZCV 不记**。 `cmp` 的写列是空的， `csel` 的读列也不含 NZCV。凡是要靠条件码穿透的控制流（ `cbz` / `tbz` / `csel` ），到这里会断。
2.  **内存地址 → 值不记**。追控制流够用，追内存 key 不够。

* * *

## 7\. 实战：一条 VMP handler 的完整走读

光讲概念没感觉，上真家伙。下面这段是我在还原一个线程化 VMP（七神）时截的，一条 **普通 handler**。

先把原文汇放在这：

```python
0x2e87e8  ldr w9, [x23]                  ; 读 VM 的 IP
0x2e87ec  mov w12, #0x30                 ; VM 指令大小
0x2e87f0  ldr x11, [x20]                 ; 字节码基址
0x2e87f4  ldrb w10, [x8, #0x8]           ; 操作数：源寄存器索引
0x2e87f8  add w9, w9, #0x1               ; IP++
0x2e87fc  ldrb w13, [x8, #0x9]           ; 操作数：目标寄存器索引
0x2e8800  ldrsh x14, [x8, #0xa]          ; 操作数：16 位有符号偏移
0x2e8804  nop
0x2e8808  smaddl x8, w9, w12, x11        ; X8 = base + IP * 0x30（下一条指令）
0x2e880c  ldr x10, [x24, x10, lsl #3]    ; regs[src]
0x2e8810  str w9, [x23]                  ; 写回 IP
0x2e8814  ldrh w11, [x8]                 ; 下一条的 opcode
0x2e8818  add x10, x10, x14              ; regs[src] += offset
0x2e881c  str x10, [x24, x13, lsl #3]    ; regs[dst] = 新值
0x2e8820  ldr x11, [x25, x11, lsl #3]    ; 查 handler 表
0x2e8824  br x11                         ; 跳下一个 handler
```

trace 里同一条的 read/write 列（只列有用的）：

```python
{'asm': 'ldr w9, [x23]',   'read': {'X23': '0x7853c7e1dc'}, 'write': {'W9': '0x0'}}
{'asm': 'ldrb w10, [x8, #0x8]', 'read': {'X8': '0x7c4f75c1d0'}, 'write': {'W10': '0x1'}}
{'asm': 'add w9, w9, #0x1',     'read': {'W9': '0x0'},  'write': {'W9': '0x1'}}
{'asm': 'ldr x10, [x24, x10, lsl #3]', 'read': {'X24': '0x7853c84240', 'X10': '0x1'}}
```

### 逐条拆

**① `ldr w9, [x23]` —— 读 IP**

```python
IMARK    in=[ram[0x2e87e8:4]]
COPY     unique[c700:8] = x23
LOAD     unique[48f00:4] = *(ram)unique[c700:8]
INT_ZEXT x9 = zext(unique[48f00:4])
```

注意这里： **x23 压根没出现在 LOAD 里**。它只出现在 COPY 的输入端 —— SLEIGH 先把寄存器搬进一个临时，再用临时当地址去读。

这一点是我做锚点追踪时最大的认知修正： **在汇编层看，「读 IP 的是这条 ldr，它引用了 x23」；在 P-code 层看，「x23 是一条 COPY 的源，真正读内存那条 LOAD 的地址是个 unique」。** 想顺着寄存器找人，必须在 varnode 这一层追，不能在指令这一层认。

**② `mov w12, #0x30`**

```python
IMARK
COPY     x12 = 0x30         ; 常量直接就是 const[0x30:8]
```

**③ `ldr x11, [x20]` —— 取字节码基址**

```python
COPY     unique[c800:8] = x20
LOAD     x11 = *(ram)unique[c800:8]
```

同一个套路。trace 里 `X11 = 0x7c4f75c1d0` ，这就是字节码数组的基址。

**④ `ldrb w10, [x8, #0x8]` —— 读操作数（源寄存器索引）**

```python
INT_ADD  unique[bc00:8] = x8 + 0x8
LOAD     unique[4a100:1] = *(ram)unique[bc00:8]
INT_ZEXT x10 = zext(unique[4a100:1])
```

`x8` 是当前 VM 指令的地址（threaded dispatch 的游标）， `+0x8` 就是这个指令记录里的第一个操作数字节。trace 给出 `W10 = 0x1` —— **源寄存器索引是 1**。

**⑤ `add w9, w9, #0x1` —— IP++**

```python
COPY       unique[22d00:4] = 0x1
INT_CARRY  tmpCY = carry(w9, unique[22d00:4])
INT_SCARRY tmpOV = scarry(w9, unique[22d00:4])
INT_ADD    unique[22f00:4] = w9 + unique[22d00:4]
INT_SLESS  tmpNG = unique[22f00:4] s< 0x0
INT_EQUAL  tmpZR = unique[22f00:4] == 0x0
INT_ZEXT   x9 = zext(unique[22f00:4])
```

**一条 `add` 编译出 7 条 P-code。** 多出来的全是 flags（carry / overflow / negative / zero）—— 这就是「隐式副作用被显式化」的意思：汇编里你看不出 `add` 顺手改了 NZCV，P-code 里它明明白白写在流上。

**⑥ `ldrb w13, [x8, #0x9]` / ⑦ `ldrsh x14, [x8, #0xa]`**

```python
INT_ADD  unique[bc00:8] = x8 + 0x9        ; ← 同一个 unique offset，值变了
LOAD     unique[4a100:1] = *(ram)unique[bc00:8]
INT_ZEXT x13 = zext(unique[4a100:1])

INT_ADD  unique[be00:8] = x8 + 0xa
LOAD     unique[4c100:2] = *(ram)unique[be00:8]
INT_SEXT x14 = sext(unique[4c100:2])      ; 16 位有符号
```

⑦ 就是 5.3 那个坑的现场： `unique[bc00:8]` 在 ④ 和 ⑥ 里是 **两个不同的值**。拿 offset 当身份跨指令用，必错。

另外 `sext` 说明这个操作数是 **有符号** 的 —— trace 里 `X14 = 0xfffffffffffffb60` ，也就是 `-0x4a0` 。这是 VM 里「带偏移的寄存器访问」的那个偏移量。

**⑧ `smaddl x8, w9, w12, x11` —— 算下一条指令地址**

```python
INT_SEXT  unique[6db00:8] = sext(w9)      ; IP（已经是自增后的 1）
INT_SEXT  unique[6dd00:8] = sext(w12)     ; 0x30
INT_MULT  unique[6df00:8] = unique[6db00:8] * unique[6dd00:8]
INT_ADD   x8 = x11 + unique[6df00:8]      ; base + IP * 0x30
```

trace 给出 `X8 = 0x7c4f75c200` ，而 `0x7c4f75c1d0 + 1*0x30 = 0x7c4f75c200` —— **对上了**。

这条顺带把 VM 的指令格式给透了： **每条 VM 指令占 0x30 字节，IP 是「第几条」的下标，不是字节偏移。**

**⑨ `ldr x10, [x24, x10, lsl #3]` —— 取虚拟寄存器**

```python
COPY      unique[ae00:8] = x10            ; 索引 1
COPY      unique[da00:8] = unique[ae00:8]
INT_LEFT  unique[da00:8] = unique[da00:8] << 0x3    ; *8
INT_ADD   unique[e300:8] = x24 + unique[da00:8]
LOAD      x10 = *(ram)unique[e300:8]
```

`x24` 是 **虚拟寄存器文件基址**， `[x24 + idx*8]` 就是 `regs[idx]` 。trace 里 `X24 = 0x7853c84240` 、 `idx = 1` ，读出 `x10 = 0x7853c84200` 。

**连 LSL 都被展开成 4 条 P-code**—— 藏不了东西。

**⑩ `str w9, [x23]` —— 写回 IP**

```python
COPY     unique[c700:8] = x23
STORE    *(ram)unique[c700:8] = w9
```

STORE 的输入是 `[空间标记, 地址, 值]` ，值就是 `w9 = 0x1` 。 **要取「存回去的值」，直接看 `inputs[2]` 。**

**⑪ `ldrh w11, [x8]` —— 读下一条的 opcode**

```python
COPY     unique[c600:8] = x8
LOAD     unique[4a500:2] = *(ram)unique[c600:8]
INT_ZEXT x11 = zext(unique[4a500:2])
```

`x8` 就是 ⑧ 算出来的「下一条指令地址」，从它开头读 2 字节 = 下一个 opcode。trace 里 `W11 = 0x8d` 。

**⑫ `add x10, x10, x14` —— 真正干活的地方**

```python
COPY        unique[23f00:8] = x14
INT_CARRY   tmpCY = ...
INT_SCARRY  tmpOV = ...
INT_ADD     unique[24100:8] = x10 + unique[23f00:8]
INT_SLESS   tmpNG = ...
INT_EQUAL   tmpZR = ...
COPY        x10 = unique[24100:8]
```

`0x7853c84200 + (-0x4a0) = 0x7853c83d60` ，trace 里 `X10 = 0x7853c83d60` —— 对上。

**⑬ `str x10, [x24, x13, lsl #3]` —— 写回虚拟寄存器**

```python
COPY      unique[74600:8] = x10
COPY      unique[ae00:8] = x13             ; 目标索引 1
COPY      unique[da00:8] = unique[ae00:8]
INT_LEFT  unique[da00:8] = unique[da00:8] << 0x3
INT_ADD   unique[e300:8] = x24 + unique[da00:8]
STORE     *(ram)unique[e300:8] = unique[74600:8]
```

**⑭ `ldr x11, [x25, x11, lsl #3]` + `br x11` —— 跳下一个 handler**

```python
COPY      unique[ae00:8] = x11             ; opcode 0x8d
INT_LEFT  unique[da00:8] = ... << 0x3
INT_ADD   unique[e300:8] = x25 + unique[da00:8]
LOAD      x11 = *(ram)unique[e300:8]       ; 查 handler 表
COPY      pc = x11
BRANCHIND pc
```

### 连起来是什么

把上面这些片段拼起来，这条 handler 干的事一句话就能说清：

> **`regs[dst] = regs[src] + imm16` ，然后 IP++，然后跳到下一个 handler。**

一条「虚拟寄存器 + 立即数偏移」指令。而且顺带把整个 VM 的骨架摸出来了：

-   **VM 的 IP 在 `[x23]`** （x23 = ctx+0xC）
-   **VM 的寄存器文件在 `[x24 + idx*8]`** （x24 = ctx+0x6070，32 个 8 字节槽）
-   **handler 表在 `[x25 + opcode*8]`** （x25 固定）
-   **每条 VM 指令 0x30 字节，操作数在记录内偏移 +8 / +9 / +0xA**

这四句话就是整个 VM 的骨架，剩下 1580 个 handler 全是在这个骨架上换算法。

**而这三条锚点线（x23 / x24 / x25），全部是从 P-code 的 varnode 里追出来的 —— 看汇编你得一条条读，看 P-code 你可以写代码去追。**

## 8\. 实战：从 varnode 追锚点寄存器

接着上面说。既然锚点是 `x23` / `x24` / `x25` ，那怎么自动化地找出「一条 handler 里，谁在读 IP、谁在写 IP」？

**别在指令层找，在 varnode 层追。** 这是我踩了坑之后的结论 —— 如果你按 `space == "register" and name == "x23"` 去扫 inputs，你只会收上来一堆 `COPY` （见 7.①），啥也说明不了。

思路是 **前向标记** （一趟就行，P-code 是 SSA 序，def 先于 use）：

```python
种子：  register[0x40b8]  →  记上「ip」这个色

普通 op  ：输出继承所有输入的色（并集）；输入全无色就清色（寄存器被重新赋值了）
LOAD     ：地址有色 ≠ 读出来的值有色 —— 把地址的色换成「值」色（ip → ipval）落到输出
STORE    ：不产值，但地址/值的色要在扫到时就记下来
```

最后那条划重点： **unique 的 offset 会被复用（5.3），所以分类必须在扫的过程中做；扫完再回头统一看，那一格早被覆盖了。**

跑完之后你手上就有：

| 判定  | 含义  |
| --- | --- |
| `LOAD` 地址带 `ip` 色 | 读 IP |
| `STORE` 地址带 `ip` 色 | 写 IP， `inputs[2]` 就是新 IP |
| `LOAD` 地址带 `regf` 色 | 读虚拟寄存器 `regs[idx]` |
| `STORE` 地址带 `regf` 色 | 写虚拟寄存器 |
| `LOAD` 地址带 `table` 色 | 尾巴那次 dispatch |

再补一句 **按 offset 别按名字**： `x23` 和 `w23` 的 offset 都是 `0x40b8` ，只有 size 不同。按名字认， `w23` 就被漏了；按 offset 认，两个视图自动归到同一个槽。

实测下来这个方法很好使。全量 trace 跑一遍，普通 handler 的 IP 变化量分布是这样的：

```python
step=+1    22208 条      ; 顺序落下一个 slot
step=+3    13170 条
step=+4     4650 条      ; 一条 VM 指令占 4 个 slot
step=+5     1834 条
step=-10    1085 条      ; 负数 = 条件跳转
step=-23     772 条
...
```

几个反直觉的点：

-   **`step=+1` 连一半都不到。** 我原以为「一条 VM 指令 = IP+1」，实际大量指令占 3~6 个 slot。IP 是 slot 下标这件事，是从数据里看出来的，不是猜出来的。
-   **负数就是跳转。** 抽到一条 `CMP/BEQ` ， `pre=17, post=6, step=-11` ，而它的 `CSEL` 选出来 offset 是 `-12` ， `-12+1 = -11` —— 语义立刻对上，比读汇编快得多。
-   **同一个 handler 在不同 VM 调用里，锚点寄存器（x23）的值不一样** （实测分别是 `0x7853c6aefc` 和 `0x7853c7e1dc` ，ctx 分配位置不同）。 **所以按寄存器值认锚点行不通，必须按 offset。** 这个坑躲过一次就记一辈子。

## 9\. 踩坑清单

动手之前先扫一眼，能省几天：

1.  **地址不在 op 上**—— 想知道 op 属于哪条指令，只能靠 `IMARK` 切边界
2.  **LOAD / STORE 第一个输入不是地址**—— 是每进程随机化的空间标记常量，地址在 `inputs[1]`
3.  **unique 的 offset 会被复用**—— 跨指令不能按它认身份
4.  **`x23` / `w23` 同 offset 不同 size**—— 按 offset 认寄存器，别按名字
5.  **`translate` 的 `base_address` 影响 PC 相对指令**—— 不连续指令拼块喂进去，第二条以后目标全错
6.  **`Context` 构造很贵**—— 别放进循环
7.  **keystone 不认 ARMv8.1 的 LSE 原子指令**—— 得留 `llvm-mc` 兜底
8.  **trace 不记 flags 和「内存地址 → 值」**—— 控制流穿透会在这两处断

## 10\. 结语

P-code 这东西看文档十分钟就能「懂」，但真正让它产生价值的是第 7、8 节那两步： **把汇编的隐式数据流摊成显式的 varnode def-use，然后在 varnode 层写代码去追。**

我在 VMP 还原里最大的一个转折点，就是意识到「锚点寄存器不该在指令层找，该在 varnode 层找」—— `ldr w9, [x23]` 在汇编层是「引用了 x23」，在 P-code 层却是「x23 是一条 COPY 的源，真正读内存那条 LOAD 的地址是个 unique」。 **同一件事，两个层次看到的完全不一样。**

再往上一步就是「影子轨道」了：同一个 handler 提升两代，第一代是纯 SLEIGH 的静态骨架，第二代把 trace 的值折进 varnode。两代同源同 varnode，于是可以像影子一样互相穿透 —— 静态这边负责「长什么样」，动态那边负责「跑起来是什么」，各管各的。

这部分内容比较多，放在项目实践那篇里写了。
