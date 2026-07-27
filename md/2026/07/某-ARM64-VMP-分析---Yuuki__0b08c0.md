---
title: 某 ARM64 VMP 分析 - Yuuki
source: https://yuuki.cool/posts/alivmp/%E6%9F%90-vmp-%E5%88%86%E6%9E%90/#0x02-%E7%AE%97%E6%B3%95%E5%88%86%E6%9E%90
source_host: yuuki.cool
clip_date: 2026-07-27T21:07:54+08:00
trace_id: 0813a15b-cb68-4633-80e5-f4f523e6dd0f
content_hash: e26c5fa83fdde51cbcc4b3c052ce49c39aea0866a9d2e6ae23149ce56fa73f56
status: summarized
tags:
  - Android逆向
  - 密码学
series: null
feed_source: null
ai_summary: 通过ARM64栈式虚拟机解释器的逐条trace日志，成功还原了被虚拟化保护的标准SM4加密算法及其完整数据流，并提出了一种直接对VM trace进行语义归约的高效分析方法。
ai_summary_style: key-points
images_status:
  total: 9
  succeeded: 9
  failed_urls: []
notion_page_id: 3aa75244-d011-81a7-b77c-fe09aeeb5eb5
ioc:
  cves: []
  cwes: []
  hashes:
    - 098791487a6d6fbf560169d159c14244
    - 79e08918a8e80dfb4699a5396d7d7c8f
    - 8b4a7b7d7700492d39876dea29237774
    - acf91a46642091f6e2a8219e51c95479
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 通过ARM64栈式虚拟机解释器的逐条trace日志，成功还原了被虚拟化保护的标准SM4加密算法及其完整数据流，并提出了一种直接对VM trace进行语义归约的高效分析方法。
> 
> - **算法识别与还原：** 通过跟踪内存读写、异或运算链以及表项匹配，确认VM中执行的是标准SM4分组加密。逆向过程完整复原了密钥、固定参数、轮密钥生成及经过反序输出的最终密文。
> - **VM类型与结构：** 判定该VM为栈式虚拟机，其核心是一个大循环结构，包含取指、译码、执行三个阶段。通过分析高频指令地址与时间分布，准确定位到主循环入口及充当虚拟PC的寄存器（x25）。
> - **分析方法论：** 提出了一种超越“将字节码翻译回ARM64指令”的思路，即直接对VM handler的执行过程进行语义归约，将庞大的原生指令折叠成简洁的中间表示，再进行算法和逻辑分析。
> - **Handler语义：** 分析了多种opcode（如0xc4, 0x5a, 0x97）的格式与功能，揭示了指令支持变长操作数（ULEB128编码），并能执行从虚拟栈读取槽位变量、线性内存加载/存储（I32_LOAD/STORE）等核心操作。

## 0x00 前言

本文样本：秘密

设备环境：iOS 15.8

工具版本：主要使用 trace-ui

早就想研究一下 VMP 了，但现在再来谈论这个话题，似乎有些过时

## 0x01 VM的分类

VM 主要分为栈式和寄存器式，比如早期的 JVM 就是一个栈式虚拟机，后续为了运行时加速慢慢引入了寄存器的特性

所谓的 `栈式` 和 `寄存器式` ，他们面向的对象是 `数据` ，这一点很重要，早期我在学习时，这一块一直没有搞清楚，导致后续的理解出现了偏差

### 栈式VM

```nasm
以 int d = a + b + c为例
OP_load var[a]       // stack: a
OP_load var[b]       // stack: a b
OP_add               // stack: x     #where x=a+b
OP_load var[c]       // stack: x c
OP_add               // stack: y     #where y=x+c
OP_save var[d]       // stack empty

基于栈的设计
1. 单条指令更短更简单
2. 总指令膨胀更严重
3. 运行时效率一般
4. Source to bytecode代码相对简单，也更容易被逆向分析
```

栈式虚拟机的设计是将数据压入到栈中，然后运算时弹栈，运算后的结果再压栈，如此反复进行。所以栈式虚拟机相对来说实现起来简单，无需考虑寄存器的分配算法

### 寄存器式VM

```nasm
以 int d = a + b + c为例
OP_add   r1      var[a]  var[b]   // r1     = var[a] + var[b]
OP_add   r0      r1      var[c]   // r0     = r1 + var[c]
OP_move  var[d]                   // var[d] = r0

基于寄存器的设计
1. 单条指令的虚拟字节码设计更复杂
2. 总指令膨胀没那么严重
3. 模拟物理CPU，运行时效率更高
4. Source to bytecode代码更复杂，逆向起来更难
```

寄存器虚拟机的设计其实是根据物理机的 CPU 架构设计是一致的，用寄存器来做数据的存取和运算，所以是一个软 CPU 的模式，运行时速度更快，但是虚拟指令集设计更加的复杂

无论是哪一种虚拟机，它的本质都是将 `CPU` 字节码转换为对方自己设计的 `虚拟字节码` ，这个过程叫做 `翻译` ，对应的处理模块叫做 `翻译器` ，而在运行时，需要再把 `虚拟字节码` 对应的操作转换成对应的 `CPU` 字节码，然后交给CPU解释执行，处理这个过程的模块叫做 `解释器` ，可以看出 `翻译器` 和 `解释器` 其实同根同源，对开发者而言，最重要的实际上是 `翻译器` ，对于逆向者来说，最重要的就是 `解释器` ，但是他俩本质上是同一种东西，都是把一种东西映射成另一种东西

### 运行时

那么运行时 VM 是如何动态解释执行虚拟字节码的呢？

先用一个最简单的模型说明。VMP 的整个过程可以分成保护阶段和运行阶段。在保护阶段，保护器抽取目标函数的 ARM64 指令，通过翻译器将其转换为自定义虚拟字节码，同时向目标 Mach-O 中加入 VM 解释器、虚拟字节码以及相关的上下文信息。原目标函数的入口则会被 patch 成一段跳板代码，使程序在调用该函数时，不再执行原来的 ARM64 指令，而是进入 VM 入口

大致过程如下：

```text
原始 ARM64 函数
        ↓
     翻译器
        ↓
VM bytecode + VM interpreter
        ↓
写入目标 Mach-O，并 patch 原函数入口
```

当目标函数在运行时被调用，程序首先进入 VM 入口。VM 会保存必要的真实 CPU 上下文，并初始化自己的运行状态，例如：

```plaintext
virtual PC       当前虚拟字节码位置
virtual SP       虚拟操作数栈
virtual registers / locals
bytecode end     虚拟字节码结束位置
```

初始化完成后，dispatcher 开始循环解释虚拟字节码：

```plaintext
取指：通过 virtual PC 读取 opcode
  ↓
译码：解析操作数并选择对应的 handler
  ↓
执行：handler 修改虚拟栈、虚拟寄存器、内存或者 virtual PC
  ↓
返回 dispatcher，继续解释下一条虚拟指令
```

用伪代码表示，大概是：

```plaintext
while (virtual_pc < bytecode_end) {
    opcode = *virtual_pc++;
    handler = dispatch(opcode);
    handler(&vm_context);
}
```

当 VM 遇到返回、退出或者其他终止指令时，再将执行结果从虚拟上下文映射回真实 CPU 上下文，最后回到原程序中继续执行

需要注意的是，CPU 从始至终都不会直接执行这些虚拟字节码。CPU 真正执行的是 VM 解释器中的 ARM64 handler，而虚拟字节码只负责决定接下来选择哪个 handler，以及 handler 应该如何修改 VM 状态

因此，一条原本很简单的 ARM64 指令，在经过虚拟化之后，可能会膨胀为取指、分发、参数解码、边界检查、状态读写和 handler 执行等一整段原生指令。VMP 的复杂性很大程度上就来自这里：它把原本直接可见的程序语义，分散到了虚拟字节码、解释器和运行时状态之中

## 0x02 算法分析

先搞一份trace日志，这里分析工具主要使用 trace-ui ，感谢开源。最终运算的结果是

```text
sign  = XXXX_JAIAAAAABuTgbEilBgB54IkYqOgN+0aZpTltfXyPCYeRSHptb79WAWnRWcFCRENniaM=
color = XXXX_Hbpjz+jktCWKo8olMpKHPBMjOflQ1BYfo4AuxT19Gu0RGBl80B5Peqh2Atjip3GVPXi6ijh+pZB1TrlNQsiqFw==
```

只看sign就行，color的生成逻辑并没有被vmp保护

多次抓包发现前四位固定(脱敏替换为XXXX)，所以看后面几位即可

![1](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/720df05e8174b658.webp)

这里是被消费的地方，不用管，继续往上追，地址是 `0x16e07d944` ，前5个字节固定，所以追 `0x16e07d949`

![2](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/c66b3704f7e7dceb.webp)

加载自 `0x16e07d8f0` ，由 0x24经查表变换为0x4a，直接搜 `0x16e07d8f0` ，查找原始内存，顺便验证一下是不是标准Base64

![3](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/f59a7b0ff6945bc1.webp)

![4](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/2bd76d7886e74050.webp)

验证了一下确实是Base64眉毛，接着继续跟Base64的输入

```text
[MTPotal!0xe60b0c] call _platform_memmove  (libsystem_platform.dylib+0x1820)
        ↓ memmove(dst=0x16e07d8f0, src=0x11b51e828, n=50)
          0000: 24 02 00 00 00 00 06 E4 E0 6C 48 A5 06 00 79 E0   $........lH...y.
          0010: 89 18 A8 E8 0D FB 46 99 A5 39 6D 7D 7C 8F 09 87   ......F..9m}|...
          0020: 91 48 7A 6D 6F BF 56 01 69 D1 59 C1 42 44 43 67   .Hzmo.V.i.Y.BDCg
          0030: 89 A3                                             ..
```

### 总体分割

剩下的不是很容易分析，可以先来对 `Base64_RAW` 做一个划分，由 `memmove(dst=0x16e07d8f0, src=0x11b51e828, n=50)` 可得 `Base64_RAW = 0x11b51e828` ，直接搜 `0x11b51e828` 可得

第一段从基址开始：

```text
line=4469219  write 0x11b51e828 = 0x24
line=4469998  write 0x11b51e829..82c = 02 00 00 00
line=4470452  write 0x11b51e82d = 0x00
```

所以第一段长度为 6：

```text
24 02 00 00 00 00
```

第二段从 `base+6` 开始：

```text
0x11b51e828 + 6 = 0x11b51e82e
```

写入记录：

```text
line=4471259  write 0x11b51e82e..82f = 06 e4
line=4471262  write 0x11b51e830..831 = e0 6c
line=4471270  write 0x11b51e832..833 = 48 a5
line=4471273  write 0x11b51e834..835 = 06 00
```

得到 8 字节：

```text
06 e4 e0 6c 48 a5 06 00
```

第三段从 `base+14` 开始：

```text
0x11b51e828 + 0x0e = 0x11b51e836

line=3765039  write 0x11b51e836 = 0x79
...          连续写满 16 字节
```

第四段紧接着从 `base+30` 开始：

```text
0x11b51e828 + 0x1e = 0x11b51e846

line=4179214  write 0x11b51e846 = 0x09
...          连续写满 16 字节
```

最后一段从 `base+46` 开始：

```text
0x11b51e828 + 0x2e = 0x11b51e856

line=4467758  write 0x11b51e856..857 = 43 67
line=4467761  write 0x11b51e858..859 = 89 a3
```

所以可得

| 偏移  | 动态地址 | 长度  | 当前名称 | 数据  |
| ---: | --- | ---: | --- | --- |
| `+0` | `0x11b51e828` | 6   | `header6` | `240200000000` |
| `+6` | `0x11b51e82e` | 8   | `field8` | `06e4e06c48a50600` |
| `+14` | `0x11b51e836` | 16  | `blockA` | `79e08918a8e80dfb4699a5396d7d7c8f` |
| `+30` | `0x11b51e846` | 16  | `blockB` | `098791487a6d6fbf560169d159c14244` |
| `+46` | `0x11b51e856` | 4   | `tail4` | `436789a3` |

长度相加：

```text
6 + 8 + 16 + 16 + 4 = 50
```

### 具体分析

#### header6

多次trace发现 `24 02 00 00 00 00` 为固定头，当然也可能是环境校验位，这里没有具体去分析

#### field8

小端搜索 `06 E4 E0 6C 48 A5 06 00` ，即 `0x0006a5486ce0e406` 没搜到，于是搜索 `6ce0e406` ，有命中

![5](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/9f14bc48ceb0b2ee.webp)

![6](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/3108423d9dcd84ca.webp)

可以看到是时间戳经过了变换生成的

```text
line=1626785  x0 = 0x16e07b9a0       // timeval 输出地址
line=1626786  x1 = 0                 // tz=NULL
line=1626787  bl gettimeofday

line=1626805  ldr x8, [sp]
             x8 = 0x6a5486ce        // tv_sec

line=1626806  ldrsw x9, [sp,#8]
             x9 = 0xe406            // tv_usec

line=1626807  eor x0, x9, x8, lsl #20
             x0 = 0x6a5486ce0e406
```

所以：

```text
ts = tv_usec ^ (tv_sec << 20)
   = 0xe406 ^ (0x6a5486ce << 20)
   = 0x6a5486ce0e406
```

#### blockA

`blockA` 的确切内容是：

```text
79 e0 89 18 a8 e8 0d fb 46 99 a5 39 6d 7d 7c 8f
```

按 4 字节一组写成 4 个大端语义的 32 位 word：

```text
0x79e08918
0xa8e80dfb
0x4699a539
0x6d7d7c8f
```

32 位运算可能按两种形式出现，所以都试：

```plaintext
0x79e08918    // 大端语义
0x1889e079    // 小端整数
```

搜索 `0x79e08918` 命中，取最早的一次：

```plaintext
line=3762852
ldr w8, [x26, #-0x4]!
从 0x11c329474 读取 0xc869a1a1

line=3762853
ldur w9, [x26, #-0x4]
从 0x11c329470 读取 0xb18928b9

line=3762854
eor w8, w9, w8
0xb18928b9 ^ 0xc869a1a1 = 0x79e08918

line=3762855
stur w8, [x26, #-0x4]
把 0x79e08918 写到 0x11c329470
```

分别追一下 `0xc869a1a1` 和 `0xb18928b9` ，这是当前的反向树

```text
0x79e08918
├── 0xb18928b9
└── 0xc869a1a1
```

##### 0xb18928b9

它的生产者是：

```text
line=3761739  读取 0xea52b8ea
line=3761740  读取 0x5bdb9053
line=3761741  0x5bdb9053 ^ 0xea52b8ea = 0xb18928b9
line=3761742  写回 0x11c329470
```

继续搜索 `0x5bdb9053` ：

```text
line=3759835  读取 0x0d0d4f42
line=3759836  读取 0x56d6df11
line=3759837  0x56d6df11 ^ 0x0d0d4f42 = 0x5bdb9053
line=3759838  写回 0x11c329470
```

继续搜索 `0x56d6df11` ：

```text
line=3757931  读取 0xbef2f24c
line=3757932  读取 0xe8242d5d
line=3757933  0xe8242d5d ^ 0xbef2f24c = 0x56d6df11
line=3757934  写回 0x11c329470
```

现在整条 XOR 链已经展开：

```text
0xe8242d5d
^ 0xbef2f24c = 0x56d6df11       line=3757933
^ 0x0d0d4f42 = 0x5bdb9053       line=3759837
^ 0xea52b8ea = 0xb18928b9       line=3761741
^ 0xc869a1a1 = 0x79e08918       line=3762854
```

可以概括为一个原始 32 位值连续 XOR 四个 32 位值，得到新的 32 位值

##### 0xc869a1a1

最早的有效生产位置是：

```text
line=3762823
ldr w17, [x8]
x8 = 0x11b4a1300
mem[0x11b4a1300] = 0xc869a1a1
```

直接从别的地址加载而来，继续追一下 `0x11b4a1300`

```text
line=3762767
ldur w8, [x26, #-0x4]
从 VM 栈 0x11c329474 读取 0x1300

line=3762768
add x8, x8, w0, uxtw
w0 = 0，所以结果仍然是 0x1300

line=3762773
ldr x9, [x27, #0x80]
从 0x28283cc50 读取 x9 = 0x11b4a0000

line=3762774
add x8, x9, x8
0x11b4a0000 + 0x1300 = 0x11b4a1300
```

所以 读取地址 = 0x11b4a0000 + 0x1300，那还得继续往上追

```text
line=3762736
ldr w8, [x26, #-0x4]!
从 VM 栈 0x11c329478 读取 0x140

line=3762737
ldur w9, [x26, #-0x4]
从 VM 栈 0x11c329474 读取 0x11c0

line=3762738
add w8, w9, w8
0x11c0 + 0x140 = 0x1300

line=3762739
stur w8, [x26, #-0x4]
把 0x1300 写回 VM 栈 0x11c329474
```

现在地址被拆成了两部分：

```text
固定部分：0x11c0
变化部分：0x140
```

所以先追 `0x140` ，往上找找

```text
line=3762713
ldr w8, [x26, #-0x4]!
从 VM 栈 0x11c32947c 读取 0x2

line=3762714
ldur w9, [x26, #-0x4]
从 VM 栈 0x11c329478 读取 0x50

line=3762715
lsl w8, w9, w8
0x50 << 2 = 0x140

line=3762716
stur w8, [x26, #-0x4]
把 0x140 写回 VM 栈 0x11c329478
```

故 `0x140 = 0x50 << 2`

`ldr w17, [x8]` 读取的是 32 位，也就是 4 字节， `0x50 << 2` 刚好等于 `0x50 * 4` ，所以 `0x50` 很像是一个数组下标

不过这里只能说明它像下标，还不知道 `0x50` 从哪里来的，继续追

```text
line=3762661
ldr w8, [x26, #-0x4]!
从 VM 栈 0x11c32947c 读取 0xff

line=3762662
ldur w9, [x26, #-0x4]
从 VM 栈 0x11c329478 读取 0x50

line=3762663
and w8, w8, w9
0xff & 0x50 = 0x50

line=3762664
stur w8, [x26, #-0x4]
把结果写回 0x11c329478
```

这里的 `& 0xff` 是只保留低 8 位，说明程序把当前值当一个字节使用。接下来要找 `line=3762662` 读取的 `0x50` 是谁写进去的。

对 `mem:0x11c329478@3762661` 做反向 taint，可以得到下面这条搬运链：

```text
line=3761977  从 0x11c329474 读取右移位数 8
line=3761978  从 0x11c329470 读取 0x5047
line=3761979  0x5047 >> 8 = 0x50
line=3761980  把 0x50 写到 0x11c329470

line=3762019  从 0x11c329470 读取 0x50
line=3762022  把 0x50 写到临时地址 0x11b4aad40

line=3762394  从 0x11b4aad40 读回 0x50
line=3762398  把 0x50 移到 x1
line=3762403  把 0x50 写到 0x11c329478

line=3762662  从 0x11c329478 读取 0x50
```

中间大部分都是在 VM 栈和临时地址之间搬运，实际运算只有：

```text
0x5047 >> 8 = 0x50
```

那就继续追 `0x5047` ：

```text
line=3760073  读取右移位数 8
line=3760074  读取 0x50472b
line=3760075  0x50472b >> 8 = 0x5047
line=3760076  把 0x5047 写到 0x11c329470

line=3760115  从 0x11c329470 读取 0x5047
line=3760118  把 0x5047 写到 0x11b4aad40
line=3761920  从 0x11b4aad40 读回 0x5047
line=3761929  把 0x5047 写回 0x11c329470
line=3761978  再次读取 0x5047
```

继续追 `0x50472b` ：

```text
line=3758169  读取右移位数 8
line=3758170  读取 0x50472bc6
line=3758171  0x50472bc6 >> 8 = 0x50472b
line=3758172  把 0x50472b 写到 0x11c329470

line=3758211  从 0x11c329470 读取 0x50472b
line=3758214  把 0x50472b 写到 0x11b4aad40
line=3760016  从 0x11b4aad40 读回 0x50472b
line=3760025  把 0x50472b 写回 0x11c329470
line=3760074  再次读取 0x50472b
```

追到这里才第一次知道完整值是 `0x50472bc6` ，整个发现顺序是：

```text
0x11b4a1300
→ 0x11b4a0000 + 0x1300
→ 0x1300 = 0x11c0 + 0x140
→ 0x140 = 0x50 << 2
→ 0x5047 >> 8 = 0x50
→ 0x50472b >> 8 = 0x5047
→ 0x50472bc6 >> 8 = 0x50472b
```

所以完整的读取地址为：

```text
0x11b4a0000 + 0x11c0 + (0x50 << 2)
= 0x11b4a0000 + 0x11c0 + 0x140
= 0x11b4a1300
```

其中 `0x11c0` 也不是猜的，往前追 VM 栈里的值：

```text
line=3762276  从 0x11b4aad48 读取 0x11c0
line=3762280  把 0x11c0 移到 x1
line=3762285  把 0x11c0 写到 0x11c329474
line=3762737  再从 0x11c329474 读取 0x11c0
```

所以当前这张表的实际基址可以记为：

```text
0x11b4a0000 + 0x11c0 = 0x11b4a11c0
```

最终：

```text
table[0x50] = 0xc869a1a1
```

这里只能看出来是一次 32 位查表，暂时还不能说明是啥算法

###### 0x50472bc6

现在已经在数据流里真实遇到了 `0x50472bc6` ，可以直接搜它，最早的计算位置是：

```text
line=3756265
从 0x11c329474 读取 0xd34bff8b

line=3756266
从 0x11c329470 读取 0x830cd44d

line=3756267
0x830cd44d ^ 0xd34bff8b = 0x50472bc6

line=3756268
把 0x50472bc6 写回 0x11c329470
```

继续追 `0x830cd44d` ：

```text
line=3755838  读取 0xa8e80dfb
line=3755839  读取 0x2be4d9b6
line=3755840  0xa8e80dfb ^ 0x2be4d9b6 = 0x830cd44d
```

继续追 `0x2be4d9b6` ：

```text
line=3755697  读取 0x4699a539
line=3755698  读取 0x6d7d7c8f
line=3755699  0x4699a539 ^ 0x6d7d7c8f = 0x2be4d9b6
```

故：

```text
0x50472bc6
= 0x6d7d7c8f
^ 0x4699a539
^ 0xa8e80dfb
^ 0xd34bff8b
```

这几个值的实际读取地址是：

```text
line=3755550  0x11b4aad34 = 0x6d7d7c8f
line=3755668  0x11b4aad38 = 0x4699a539
line=3755809  0x11b4aad3c = 0xa8e80dfb
line=3756236  0x11b51e940 = 0xd34bff8b
```

而前面累计 XOR 的初始值：

```text
line=3756446  0x11b4aad30 = 0xe8242d5d
```

当前能还原出来的数据关系是：

```text
work = 0x6d7d7c8f ^ 0x4699a539 ^ 0xa8e80dfb ^ 0xd34bff8b
     = 0x50472bc6

result = 0xe8242d5d ^ 某个对 work 的查表变换
       = 0x79e08918
```

###### 剩下三个值

回到前面的 XOR 链，还有下面三个值没解释：

```text
0xbef2f24c
0x0d0d4f42
0xea52b8ea
```

可以发现它们都是一个 32 位内存值经过循环右移得到的

先看 `0xea52b8ea` ：

```text
line=3760919 / 3761636
mem[0x11b4a12dc] = 0x52b8eaea

line=3760979  0x52b8eaea << 24 = 0xea000000
line=3761695  0x52b8eaea >> 8  = 0x0052b8ea
line=3761718  0xea000000 | 0x0052b8ea = 0xea52b8ea
```

也就是：

```text
ROR32(0x52b8eaea, 8) = 0xea52b8ea
```

这个表地址的计算过程是：

```text
line=3761474  读取 0xff
line=3761475  读取 0x5047
line=3761476  0x5047 & 0xff = 0x47
line=3761528  0x47 << 2 = 0x11c
line=3761551  0x11c0 + 0x11c = 0x12dc
line=3761587  0x11b4a0000 + 0x12dc = 0x11b4a12dc
```

故：

```text
table[0x47] = 0x52b8eaea
ROR32(table[0x47], 8) = 0xea52b8ea
```

再看 `0x0d0d4f42` ：

```text
line=3759015 / 3759732
mem[0x11b4a126c] = 0x4f420d0d

line=3759075  0x4f420d0d << 16 = 0x0d0d0000
line=3759791  0x4f420d0d >> 16 = 0x00004f42
line=3759814  0x0d0d0000 | 0x00004f42 = 0x0d0d4f42
```

对应的索引和地址：

```text
line=3759572  0x50472b & 0xff = 0x2b
line=3759624  0x2b << 2 = 0xac
line=3759647  0x11c0 + 0xac = 0x126c
line=3759683  0x11b4a0000 + 0x126c = 0x11b4a126c
```

故：

```text
table[0x2b] = 0x4f420d0d
ROR32(table[0x2b], 16) = 0x0d0d4f42
```

最后看 `0xbef2f24c` ：

```text
line=3757111 / 3757828
mem[0x11b4a14d8] = 0x4cbef2f2

line=3757171  0x4cbef2f2 << 8  = 0xbef2f200
line=3757887  0x4cbef2f2 >> 24 = 0x0000004c
line=3757910  0xbef2f200 | 0x0000004c = 0xbef2f24c
```

对应的索引和地址：

```text
line=3757668  0x50472bc6 & 0xff = 0xc6
line=3757720  0xc6 << 2 = 0x318
line=3757743  0x11c0 + 0x318 = 0x14d8
line=3757779  0x11b4a0000 + 0x14d8 = 0x11b4a14d8
```

故：

```text
table[0xc6] = 0x4cbef2f2
ROR32(table[0xc6], 24) = 0xbef2f24c
```

四次查表放一起就是：

| 字节  | 表地址 | 原始表项 | 旋转后参与 XOR |
| --- | --- | --- | --- |
| `c6` | `0x11b4a14d8` | `4cbef2f2` | `bef2f24c` |
| `2b` | `0x11b4a126c` | `4f420d0d` | `0d0d4f42` |
| `47` | `0x11b4a12dc` | `52b8eaea` | `ea52b8ea` |
| `50` | `0x11b4a1300` | `c869a1a1` | `c869a1a1` |

`0x50472bc6` 的字节是：

```text
50 47 2b c6
```

日志从低字节开始处理，所以执行顺序是 `c6 → 2b → 47 → 50` ，每处理完一个字节就右移 8 位。

到这里可以确定程序做的是：

```text
四个 32 位值 XOR 得到 work
→ 依次取 work 的四个字节
→ 用字节访问同一张 32 位表
→ 按字节位置旋转表项
→ 四个表项与另一个 32 位值连续 XOR
```

这很像 SM4 的运算过程

#### 对比 SM4

标准 SM4 的轮函数是：

```text
t = X[i+1] ^ X[i+2] ^ X[i+3] ^ rk[i]
X[i+4] = X[i] ^ T(t)
```

其中：

```text
T(t) = L(tau(t))

L(B) = B
     ^ ROL32(B, 2)
     ^ ROL32(B, 10)
     ^ ROL32(B, 18)
     ^ ROL32(B, 24)
```

程序这里用的是 T-table 优化，可以写成：

```text
T0[b] = L(Sbox[b] << 24)

T(t) = T0[t的最高字节]
     ^ ROR32(T0[t的次高字节], 8)
     ^ ROR32(T0[t的次低字节], 16)
     ^ ROR32(T0[t的最低字节], 24)
```

先拿 `0x50` 验证一下

标准 SM4 S 盒：

```text
Sbox[0x50] = 0x68
B = 0x68000000
```

套入 SM4 的 `L` 变换：

```text
0x68000000
^ ROL32(0x68000000, 2)
^ ROL32(0x68000000, 10)
^ ROL32(0x68000000, 18)
^ ROL32(0x68000000, 24)
= 0xc869a1a1
```

与 trace 完全相同：

```text
line=3762823  table[0x50] = 0xc869a1a1
```

剩下三个也逐个计算：

| 字节  | SM4 `Sbox[byte]` | 标准 `L(Sbox[byte] << 24)` | trace 表项 |
| --- | --- | --- | --- |
| `50` | `68` | `c869a1a1` | `c869a1a1` |
| `47` | `ba` | `52b8eaea` | `52b8eaea` |
| `2b` | `43` | `4f420d0d` | `4f420d0d` |
| `c6` | `bc` | `4cbef2f2` | `4cbef2f2` |

四个表项全部一致，再把它们按位置旋转后 XOR：

```text
0xc869a1a1
^ 0xea52b8ea
^ 0x0d0d4f42
^ 0xbef2f24c
= 0x91c4a445
```

标准 SM4 直接计算也是：

```text
L(tau(0x50472bc6)) = 0x91c4a445
```

最后：

```text
0xe8242d5d ^ 0x91c4a445 = 0x79e08918
```

正好对应：

```text
line=3762854  0xb18928b9 ^ 0xc869a1a1 = 0x79e08918
```

把日志里的值套到 SM4 轮公式里：

```text
X[i]   = 0xe8242d5d
X[i+1] = 0x6d7d7c8f
X[i+2] = 0x4699a539
X[i+3] = 0xa8e80dfb
rk[i]  = 0xd34bff8b

t = X[i+1] ^ X[i+2] ^ X[i+3] ^ rk[i]
  = 0x50472bc6

X[i+4] = X[i] ^ T(t)
       = 0x79e08918
```

轮函数已经完全对上 SM4，不过再去看一下 `0xd34bff8b` 是不是标准 SM4 生成的轮密钥

#### key schedule

先找到原始 key，地址是 `0x11b4aaf40` ，完整后读取 16 字节：

```text
8b 4a 7b 7d 77 00 49 2d 39 87 6d ea 29 23 77 74
```

按大端拆成四个 word：

```text
MK[0] = 0x8b4a7b7d
MK[1] = 0x7700492d
MK[2] = 0x39876dea
MK[3] = 0x29237774
```

沿着这四个值第一次参与的 XOR 往上看，另一个 operand 分别是：

```text
line=2701634  0x11b4a0410 = 0xa3b1bac6
line=2703822  0x11b4a0414 = 0x56aa3350
line=2706010  0x11b4a0418 = 0x677d9197
line=2708198  0x11b4a041c = 0xb27022dc
```

这四个值正好是标准 SM4 的 FK：

```text
A3B1BAC6 56AA3350 677D9197 B27022DC
```

trace 的初始化结果也与 `MK[i] ^ FK[i]` 一致：

```text
K[0] = 0x28fbc1bb
K[1] = 0x21aa7a7d
K[2] = 0x5efafc7d
K[3] = 0x9b5355a8
```

继续看 key schedule 使用的常量数组：

```text
line=2709653  0x11b4a0d40 = 0x00070e15
line=2721385  0x11b4a0d44 = 0x1c232a31
line=3073345  0x11b4a0dbc = 0x646b7279
```

从 `0x11b4a0d40` 到 `0x11b4a0dbc` 一共 32 个 32 位值，首项、第二项、末项都与标准 SM4 的 CK 对应位置相同。

第一个轮密钥的计算结果：

```text
line=2709684  K[1] ^ K[2] ^ K[3] ^ CK[0] = 0xe404ddbd
line=2716271  计算得到 rk[0] = 0x0e9cc33c
line=2719924  写入 0x11b51e8c4
```

生成的轮密钥连续放在：

```text
0x11b51e8c4 ～ 0x11b51e940
```

数量为：

```text
(0x940 - 0x8c4) / 4 + 1 = 32
```

取几个位置看一下：

```text
rk[0]  = 0x0e9cc33c   @ 0x11b51e8c4
rk[1]  = 0x829508d3   @ 0x11b51e8c8
rk[8]  = 0xa040cf98   @ 0x11b51e8e4
rk[16] = 0x016aca21   @ 0x11b51e904
rk[31] = 0xd34bff8b   @ 0x11b51e940
```

用上面的原始 key 按标准 SM4 key schedule 离线生成 32 个轮密钥，与 trace 中这 32 个值逐项一致。

前面最后一轮使用的：

```text
line=3756236  0x11b51e940 = 0xd34bff8b
```

正好就是 `rk[31]` 。

到这里轮函数、FK、CK 和 32 个轮密钥都对上了，可以确定 VM 中执行的是标准 SM4

#### blockA为什么这样排列

刚才算出来的是最后一轮新状态：

```text
X[35] = 0x79e08918
```

另外三个状态值是：

```text
X[34] = 0xa8e80dfb
X[33] = 0x4699a539
X[32] = 0x6d7d7c8f
```

SM4 最后会把四个状态 word 反序输出：

```text
X[35] || X[34] || X[33] || X[32]
= 79e08918 a8e80dfb 4699a539 6d7d7c8f
```

正好就是：

```text
blockA = 79e08918a8e80dfb4699a5396d7d7c8f
```

#### 完整复算

再找第一轮开始前写入 scratch 的四个 word：

```text
line=3395597  0x11b4aad30 = 0xacf91a46
line=3397551  0x11b4aad34 = 0x642091f6
line=3399505  0x11b4aad38 = 0xe2a8219e
line=3401459  0x11b4aad3c = 0x51c95479
```

所以进入 SM4 分组运算的 16 字节是：

```text
acf91a46642091f6e2a8219e51c95479
```

原始 key 是：

```text
8b4a7b7d7700492d39876dea29237774
```

按标准 SM4 加密一块：

```text
SM4_Encrypt(
    key   = 8b4a7b7d7700492d39876dea29237774,
    input = acf91a46642091f6e2a8219e51c95479
)
= 79e08918a8e80dfb4699a5396d7d7c8f
```

与 trace 的 `blockA` 16 个字节完全一致，所以最终可以确定：

```text
blockA 是标准 SM4 分组加密的输出
```

剩下的 `blockB` ，和 `tail4` 分析方式也是一样的，他们的输入也可以继续往上追，还有其他的算法，但这里不多赘述了

## 0x03 VM分析

经过分析，应该很容易判断这个 vm 的类型，这是个栈式vm，日志中大量出现类似如下的结构

```asm
str  w0, [x26], #4        ; push 立即数
ldr  w8, [x26, #-4]!      ; pop 栈顶操作数
ldur w9, [x26, #-4]       ; 读取第二个操作数
add  w8, w9, w8
stur w8, [x26, #-4]       ; 将结果写回栈
```

那么分析vm该从何处入手呢？在这之前，我们应该先判断日志中是否存在vm，以及如何定位它的大概范围

### 初步判断

对于传统解释型VM，它执行虚拟字节码的逻辑是：

1.  取指：用虚拟PC获取对应虚拟字节码
2.  译码：将虚拟字节码分发给对应handler
3.  执行：调用对应handler

所以，解释型VM是运行在一个巨大的 取指->译码->执行 的循环中的，每有一条虚拟字节码被执行，这个循环就会被执行一次，这是它的特征，我们可以据此进行初步的判断

判断方式也很简单，我们可以统计日志中每条指令对应地址出现的次数，并进行排行，着重关注排在前面的几处地址

在普通代码中，一段业务逻辑通常只执行一次或少量几次；而 vm dispatcher 每解释一条虚拟指令，都必须重复执行。例如：

```asm
mov  x8, x25
cmp  x25, x23
b.hs vm_exit
ldrb w24, [x25], #1    ; 读取一条虚拟 opcode
```

假设 VM 执行了 50,000 条虚拟指令，那么这里的 ldrb 可能就在 trace 中出现约 50,000 次，因此会进入地址频率排行榜。但是我们还需要在时间尺度上进行一次过滤，因为普通循环也会产生高频地址，例如：

```c
for (i = 0; i < 1000000; i++) {
    sum += data[i];
}
```

它的循环指令虽然出现很多次，但通常集中在 trace 的一小段：

```text
───────────────[普通循环]────────────────
```

vm dispatcher 则会与不同 handler 交替执行，并贯穿整个 VM 运行期：

fetch → handler A → fetch → handler B → fetch → handler C

时间分布类似：

```text
───F────F────F────────F────F────F────F──
```

因此要同时 检查出现次数高，从首次到末次跨度大，分布在很多时间窗口 三个特征，这能快速帮助我们定位到vm的入口，并且由于取指的过程是使用的虚拟PC，所以我们也能快速确认虚拟PC对应的寄存器是哪个。让AI根据这个原理写个脚本给我们，运行结果：

```text
python find_vm_dispatch.py ./trace_log/trace.log
trace: trace_log/trace.log
parsed instructions: 4,600,122

Likely virtual-PC registers (heuristic vote):
   x25  vote=108.597
    x9  vote=47.969
   x14  vote=36.267
    x8  vote=30.751
   x28  vote=22.467

Fetch/decode candidates:
[1] MTPotal+0xea20c4  score=50.265 count=38,504
    line=1,319,872..4,467,220 coverage=65.0% span=68.4% peak=2.7%
    load=ldrb opcode=w24 vpc?=x25 writeback=True decode_evidence=yes
    disasm: ldrb w24, [x25], #0x1
    observed reads: 0x11b48c647..0x16e07bdbf
    read samples: 0x11b49db5a, 0x11b49db60, 0x11b49db63, 0x11b49db64, 0x11b49db66, 0x11b49db6c
    nearby decode uses:
      cmp w24, #0x68
      cmp w24, #0x33
      cmp w24, #0x4d
    first-hit context:
          1319867         MTPotal+0xea2094  adrp x21, #61607936
          1319868         MTPotal+0xea2098  mov w19, #0x5f8a
          1319869         MTPotal+0xea209c  mov x25, x8
          1319870         MTPotal+0xea20a0  b #0x24
      >>  1319871         MTPotal+0xea20c4  ldrb w24, [x25], #0x1
          1319872         MTPotal+0xea20c8  cmp w24, #0x68
          1319873         MTPotal+0xea20cc  b.hs #0x40
          1319874         MTPotal+0xea20d0  cmp w24, #0x33
          1319875         MTPotal+0xea20d4  b.hs #0x88
          1319876         MTPotal+0xea215c  cmp w24, #0x4d
          1319877         MTPotal+0xea2160  b.hs #0xe8
          1319878         MTPotal+0xea2248  cmp w24, #0x5a
          1319879         MTPotal+0xea224c  b.hs #0x2e4
          1319880         MTPotal+0xea2530  cmp w24, #0x60
          1319881         MTPotal+0xea2534  b.hs #0x69c
          1319882         MTPotal+0xea2bd0  cmp w24, #0x63
          1319883         MTPotal+0xea2bd4  b.hs #0x870
          1319884         MTPotal+0xea3444  cmp w24, #0x65
          1319885         MTPotal+0xea3448  b.hs #0xa4c

[2] MTPotal+0xeadf24  score=18.133 count=2,399
    line=1,320,129..4,467,137 coverage=64.0% span=68.4% peak=3.3%
    load=ldrb opcode=w26 vpc?=x14 writeback=False decode_evidence=yes
    disasm: ldrb w26, [x14, #0xc7c]
    observed reads: 0x106a23c7c..0x106a23c7c
    read samples: 0x106a23c7c
    nearby decode uses:
      and w26, w26, #0xfc
      cmp w26, #0xc8
      cmp w26, #0x51
    first-hit context:
          1320124         MTPotal+0xeade2c  ldp w25, w26, [x6]
          1320125         MTPotal+0xeade30  add w25, w26, w25
          1320126         MTPotal+0xeade34  cmp w19, w2
          1320127         MTPotal+0xeade38  b.hs #0xec
      >>  1320128         MTPotal+0xeadf24  ldrb w26, [x14, #0xc7c]
          1320129         MTPotal+0xeadf28  mul w26, w26, w15
          1320130         MTPotal+0xeadf2c  and w26, w26, #0xfc
          1320131         MTPotal+0xeadf30  cmp w26, #0xc8
          1320132         MTPotal+0xeadf34  b.ne #0xdc
          1320133         MTPotal+0xeadf38  mov x26, x24
          1320134         MTPotal+0xeadf3c  mov x27, x22
          1320135         MTPotal+0xeadf40  mov x28, x23
          1320136         MTPotal+0xeadf44  cmp w26, #0x51
          1320137         MTPotal+0xeadf48  b.gt #0xa8
          1320138         MTPotal+0xeadf4c  cmp w25, w9
          1320139         MTPotal+0xeadf50  cset w24, eq
          1320140         MTPotal+0xeadf54  mov x23, x28
          1320141         MTPotal+0xeadf58  mov x22, x27
          1320142         MTPotal+0xeadf5c  cmp w26, #0x49

[3] MTPotal+0xea4250  score=15.365 count=7,963
    line=1,444,521..4,466,458 coverage=63.0% span=65.7% peak=2.8%
    load=ldrh opcode=w9 vpc?=x9 writeback=False decode_evidence=yes
    disasm: ldrh w9, [x9, #0xcf4]
    observed reads: 0x106a23cf4..0x106a23cf4
    read samples: 0x106a23cf4
    nearby decode uses:
      and w9, w9, w10
      cmp w9, #0xa2e
    first-hit context:
          1444516         MTPotal+0xea4240  b.hi #0x911c
          1444517         MTPotal+0xea4244  ldr x9, [x27, #0x80]
          1444518         MTPotal+0xea4248  add x8, x9, x8
          1444519         MTPotal+0xea424c  adrp x9, #61599744
      >>  1444520         MTPotal+0xea4250  ldrh w9, [x9, #0xcf4]
          1444521         MTPotal+0xea4254  mov w10, #0xa2e
          1444522         MTPotal+0xea4258  and w9, w9, w10
          1444523         MTPotal+0xea425c  adrp x10, #61599744
          1444524         MTPotal+0xea4260  ldrb w10, [x10, #0xc8b]
          1444525         MTPotal+0xea4264  tst x8, #0x3
          1444526         MTPotal+0xea4268  mov w11, #0x18
          1444527         MTPotal+0xea426c  mov w12, #0x10
          1444528         MTPotal+0xea4270  csel w11, w11, w12, eq
          1444529         MTPotal+0xea4274  tst x8, #0x1
          1444530         MTPotal+0xea4278  mov w12, #0x5
          1444531         MTPotal+0xea427c  cneg w12, w12, ne
          1444532         MTPotal+0xea4280  mov w13, #0x1a
          1444533         MTPotal+0xea4284  mov x22, x20
          1444534         MTPotal+0xea4288  cmp w9, #0xa2e

[4] MTPotal+0xed1e34  score=11.234 count=5,386
    line=1,323,803..4,271,176 coverage=39.0% span=64.1% peak=4.9%
    load=ldrb opcode=w24 vpc?=x28 writeback=False decode_evidence=yes
    disasm: ldrb w24, [x28]
    observed reads: 0x11b48c676..0x11b49eff4
    read samples: 0x11b49dbb6, 0x11b49dbb8, 0x11b49dbba, 0x11b49dbbc, 0x11b49dbbe, 0x11b49dbc2
    nearby decode uses:
      cmp w24, #0x6d
      cmp w24, #0xa1
      cmp w24, #0x8b

[5] MTPotal+0xed328c  score=11.154 count=5,036
    line=1,324,050..4,271,079 coverage=39.0% span=64.1% peak=4.8%
    load=ldrsb opcode=w8 vpc?=x8 writeback=False decode_evidence=yes
    disasm: ldrsb w8, [x8, w9, uxtw]
    observed reads: 0x11b48c67b..0x11b49eff3
    read samples: 0x11b49dbbb, 0x11b49dbbf, 0x11b49dbc0, 0x11b49dbc1, 0x11b49dbc4, 0x11b49dbc8
    nearby decode uses:
      cmp w8, #0x0

[6] MTPotal+0xea3304  score=8.754 count=9,915
    line=1,321,099..4,467,212 coverage=65.0% span=68.4% peak=2.7%
    load=ldrb opcode=w8 vpc?=x8 writeback=False decode_evidence=no
    disasm: ldrb w8, [x8, #0x1]
    observed reads: 0x11b48c659..0x11b49f008
    read samples: 0x11b49db6d, 0x11b49db6f, 0x11b49db75, 0x11b49db77, 0x11b49db7d, 0x11b49db7f

[7] MTPotal+0xed3270  score=8.619 count=5,037
    line=1,324,043..4,271,072 coverage=39.0% span=64.1% peak=4.8%
    load=ldrh opcode=w9 vpc?=x9 writeback=False decode_evidence=yes
    disasm: ldrh w9, [x9, #0x57a]
    observed reads: 0x106a2457a..0x106a2457a
    read samples: 0x106a2457a
    nearby decode uses:
      and w9, w26, #0xffff

[8] MTPotal+0xed31ec  score=8.616 count=5,039
    line=1,324,031..4,271,060 coverage=39.0% span=64.1% peak=4.8%
    load=ldrh opcode=w8 vpc?=x11 writeback=False decode_evidence=yes
    disasm: ldrh w8, [x11, #0x576]
    observed reads: 0x106a24576..0x106a24576
    read samples: 0x106a24576
    nearby decode uses:
      and w8, w8, #0xffff

[9] MTPotal+0xea3dd4  score=8.180 count=5,705
    line=1,320,447..4,466,584 coverage=65.0% span=68.4% peak=3.3%
    load=ldrb opcode=w9 vpc?=x25 writeback=False decode_evidence=no
    disasm: ldrb w9, [x25]
    observed reads: 0x11b48c64e..0x11b49efff
    read samples: 0x11b49db61, 0x11b49dbbb, 0x11b49dbc4, 0x11b49dbca, 0x11b49dbd3, 0x11b49dbd9

[10] MTPotal+0xea627c  score=8.134 count=2,579
    line=1,321,345..4,466,168 coverage=65.0% span=68.4% peak=2.9%
    load=ldr opcode=w9 vpc?=x8 writeback=True decode_evidence=no
    disasm: ldr w9, [x8, #-0x8]!
    observed reads: 0x11c328dc4..0x11c329560
    read samples: 0x11c328dc4, 0x11c328f40, 0x11c328f48, 0x11c329030, 0x11c329038, 0x11c329040

Confirmation checklist:
  1. The candidate load reads from a stable non-executable bytecode area.
  2. Its destination register controls cmp/tst/jump-table dispatch.
  3. Different handlers repeatedly return to the same fetch location.
  4. Stack push/pop implies a stack VM; indexed vreg accesses imply a register VM.
```

可以看到最可能得虚拟PC是X25，IDA跳到对应地址看看

![7](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/f6eb2fb2ba1c55c2.webp)

确实是vm所在的地址了，可以看到函数的基地址是0xEA1F80，大小是0xBBA8，所以vm的大概范围是 `[0xEA1F80, 0xEADB27]`

### 进一步分析

找到了虚拟PC，我们就可以进一步寻找 `dispatcher` 和 `handlers` 了，我们已经知道这个vm的取指过程是

```asm
ldrb w24, [x25], #0x1
```

其中 `w24` 的值就是取出的 `opcode` ，然后后续的逻辑会根据 `opcode` 分发到对应 `handler` ，先随便看一个

![8](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/162da7ad421e290a.webp)

可以看到vm的主循环结构是

```asm
mov x8, x25              ; instruction_start = virtual_pc
cmp x25, x23             ; if virtual_pc >= bytecode_end:
b.hs #0xb398             ; vm_exit()
ldrb w24, [x25], #0x1    ; opcode = memory[virtual_pc]; virtual_pc += 1
```

#### vm_bytecode

所以x23里存放的是 `vm_bytecode` 的结束地址，具体咋来的呢？

```text
MTPotal+0xea739c  ldr x25, [x9, #0x38]
mem[READ] abs=0x283953c88
=> x25=0x11b49db5a
```

这里可以看出 `vm_bytecode` 起始地址是 `0x11b49db5a` ，接下来又有

```text
MTPotal+0xea7440  ldr x10, [x9, #0x38]
=> x10=0x11b49db5a

MTPotal+0xea7444  ldr w9, [x9, #0x34]
=> w9=0x5fc

MTPotal+0xea7448  add x28, x10, x9
=> x28=0x11b49e156
```

手算关系是：

```text
0x11b49db5a + 0x5fc = 0x11b49e156
字节码起点      长度       末尾地址
```

而日志中，x23的值刚好是 `0x11b49e156` ，那正好说明他就是结束地址。拿到起始地址和结束地址，到时候我们可以把它从内存里直接dump出来，然后离线翻译成arm64的字节码，然后就容易分析它的算法逻辑了，当然这些都是后话

##### 字节码格式

第一种格式：只有 opcode，没有操作数

**以 opcode 0x75 为例**

取指：

```asm
ldrb w24, [x25], #1
```

假设当前指令从地址 S 开始：

```text
bytecode[S] = 0x75
```

执行后：

```text
w24 = 0x75
x25 = S + 1
```

进入 handler 后，核心只有：

```asm
str wzr, [x26], #4
```

它没有继续读取：\[S+1\]，\[S+2\]，也没有继续增加 x25。执行结束后直接跳回取指循环：

```asm
b MTPotal+0xea20b8
```

下一轮取指时：

```text
x25 = S + 1
```

所以 S+1 就是下一条虚拟指令

因此 opcode 0x75 的格式为：

```text
+--------+
|  0x75  |
+--------+
  1 字节
```

这条虚拟指令不需要操作数，因为“压入什么值”已经由 opcode 本身决定，0x75 永远压入 0

**0x2c 也是一字节指令**

真实取指：

```text
S = 0x11b49dc33
[0x11b49dc33] = 0x2c
```

执行：

```asm
ldrb w24, [x25], #1
```

之后：

```text
w24 = 0x2c
x25 = 0x11b49dc34
```

它的 handler：

```asm
ldr  w8, [x26, #-4]!
ldur w9, [x26, #-4]
add  w8, w9, w8
stur w8, [x26, #-4]
b    dispatcher_loop
```

整个 handler没有读取当前字节码的后续字节，没有额外修改 x25，运算需要的数据全部来自虚拟操作数栈

所以它也是一字节指令：

```text
+--------+
|  0x2c  |
+--------+
  1 字节
```

它不需要在字节码中写ADD 操作数1，操作数2，因为它默认使用虚拟栈顶的两个元素。类似的还有：

```text
0x36    SUB
0x54    XOR
```

这些目前观察到的简单路径都是单字节指令

**opcode 后面有一字节操作数**

以 0xc4 为例，真实字节码地址：

```text
S = 0x11b49db6c
```

取指：

```text
ldrb w24, [x25], #1
trace 显示：
[0x11b49db6c] = 0xc4
w24 = 0xc4
x25: 0x11b49db6c -> 0x11b49db6d
```

当前布局暂时是：

```text
地址              字节
0x11b49db6c       c4    opcode
0x11b49db6d       ??    opcode 后面的字节
0x11b49db6e       ??    后面的字节
```

进入 handler 后：

```asm
add x25, x8, #2
```

因为：

```text
x8 = S = 0x11b49db6c
```

所以：

```text
x25 = S + 2 = 0x11b49db6e
```

这说明顺序执行时，handler 认为当前指令占 2 字节

接着：

```asm
ldrb w8, [x8, #1]
```

读取：

```text
[x8 + 1]
  = [S + 1]
  = [0x11b49db6d]
  = 0x09
```

所以真实指令布局是：

```text
地址              字节       含义
0x11b49db6c       c4       opcode
0x11b49db6d       09       一字节操作数
0x11b49db6e       ...      下一条 opcode
```

格式可以暂时写成：

```text
+--------+-------------+
|  0xc4  |  u8 operand |
+--------+-------------+
       共 2 字节
```

目前已经知道 09 被当成某种编号使用。暂时先不管它具体引用什么，可以只写：

```text
C4 <u8 index>
```

所以 `c4 09` 是一条完整虚拟指令，不能错误地拆成两条指令

##### 指令长度

普通指令获取长度的方式很简单：

```text
虚拟指令长度 = 下一条虚拟指令地址 - 当前虚拟指令起始地址
```

也可以直接观察 handler 如何设置 x25

例如 0xc4：

```asm
add x25, x8, #2
```

所以 length = 2

例如 0x75，取 opcode 后 x25 = S+1，handler 没再修改 x25。所以 length = 1

例如 0x2c，取 opcode 后 x25 = S+1，handler 没再修改 x25。所以 length = 1

**但跳转指令不能简单看“下一次 fetch 地址差”**

跳转指令的编码长度和跳转距离是两回事。计算指令长度只能看handler实际读取了多少字节，不能拿跳转目标的差值来算

例如：指令在 `0x1000` 占2字节（opcode+偏移），执行后跳到 `0x1100` ，跳转距离是 `0x100` ，但指令长度只有2字节。如果拿 `0x1100 - 0x1000 = 0x100` 当长度就完全错了。

所以每个handler必须分别记录三个值：编码长度、顺序下一条地址、跳转目标地址

#### opcode

这个应该一眼就能看出来啊，之前也大概分析了。真实例子：

```text
[x25] = 0x75  => w24=0x75
[x25] = 0xc4  => w24=0xc4
[x25] = 0x2c  => w24=0x2c
```

它立刻控制 dispatcher 的分支方向，取指后会看到一串：

```asm
cmp w24, #0x68
b.hs ...
cmp w24, #0x33
b.hs ...
cmp w24, #0x4d
b.hs ...
...
```

这是一个由比较和条件跳转组成的决策树。它在做的事情类似：

```c
if (opcode < 0x68) {
    // 去左半棵树继续比较
} else {
    // 去右半棵树继续比较
}
```

继续比较几次后，最终进入与该 opcode 对应的 handler

改变 w24，最终进入的 handler 也改变

动态 trace 已验证：

| `w24` | 最终 handler 入口附近 | 观察到的效果 |
| ---: | ---: | --- |
| `0x75` | `MTPotal+0xea2334` | 压入 0 |
| `0xc4` | `MTPotal+0xea3300` | 从槽位数组读取并压栈 |
| `0x2c` | `MTPotal+0xea2b9c` | 取两个栈值做 32 位加法 |
| `0x36` | `MTPotal+0xea2d20` | 取两个栈值做 32 位减法 |
| `0x54` | `MTPotal+0xea2ab0` | 取两个栈值做 32 位异或 |

#### 虚拟SP指针

这个需要我们根据 `handler` 去分析，因为这主要和数据相关，我们分析它操作数据时的特征即可

先看最简单的 `push(0) handler`

opcode `0x75` 最终执行：

```text
MTPotal+0xea2334  str wzr, [x26], #0x4

mem[WRITE] abs=0x11c328f58
x26=0x11c328f58
=> x26=0x11c328f5c
```

拆开看：

```asm
str wzr, [x26], #4
```

等价于：

```c
*(uint32_t *)x26 = 0;
x26 += 4;
```

也就是：

1.  在 x26 当前指向的位置写入一个 32 位 0
2.  x26 向高地址移动 4 字节

这非常像 `push(0)`

再看“从局部槽位读取后压栈”

opcode `0xc4` 的末尾：

```text
ldr w8, [x28, w8, uxtw #2]
    => w8=0xae90

str w8, [x26], #4
    写入地址 0x11c328dc4
    x26: 0x11c328dc4 -> 0x11c328dc8
```

翻译为：

```c
*(uint32_t *)x26 = 0xae90;
x26 += 4;
```

又是一模一样的 push 形状。不同 handler 都用 x26 进行压栈，说明它不是偶然的普通输出指针

用加法 handler 验证 pop 两个、push 一个

opcode `0x2c` 的真实执行是：

```text
执行前：
x26 = 0x11c328dcc
[0x11c328dc4] = 0xae90
[0x11c328dc8] = 0x00b0
```

第一条：

```asm
ldr w8, [x26, #-4]!
```

它先让 x26 减 4，再读取：

```text
x26: 0x11c328dcc -> 0x11c328dc8
w8 = [0x11c328dc8] = 0x00b0
```

这等价于弹出最上面的 `rhs` 。

第二条：

```asm
ldur w9, [x26, #-4]
```

这里没有 `!`，所以 x26 不变，只读取 x26 下方 4 字节：

```text
x26 仍是 0x11c328dc8
w9 = [0x11c328dc4] = 0xae90
```

第三条：

```asm
add w8, w9, w8
```

计算：

```text
w8 = 0xae90 + 0x00b0 = 0xaf40
```

第四条：

```asm
stur w8, [x26, #-4]
```

把结果写回较低的那个槽：

```text
[0x11c328dc4] = 0xaf40
x26 仍是 0x11c328dc8
```

执行后布局：

```text
低地址

0x11c328dc4    0x0000af40    ← 计算结果，当前已占用栈顶
0x11c328dc8                  ← x26，下一空闲位置

高地址
```

从元素个数看：

```text
执行前：2 个元素
执行后：1 个元素
净变化：-1
```

从指针看：

```text
执行前 x26 = 0x...dcc
执行后 x26 = 0x...dc8
净变化：-4 字节，也就是少一个 32 位槽
```

因此这段 handler 的高级伪代码是：

```c
rhs = pop_u32();
lhs = pop_u32();
push_u32(lhs + rhs);
```

实现做了一个小优化：它没有真的把 lhs 也挪进寄存器后再单独 push，而是直接在 lhs 原来的内存槽上覆盖结果，分析到这基本可以确实 `x26` 就是虚拟 `SP` 了

### handlers 分析

先写个脚本统计一下本份trace日志里使用到了哪些opcode，然后去重排序，按顺序分析一下

```text
trace: trace_log/trace.log
fetch: MTPotal+0xea20c4
parsed native instructions: 4,600,122
fetches with decoded w24: 38,504
distinct observed opcodes: 46

opcode   count    share    cycle native instructions       first bytecode PC
------  -------  -------  ------------------------------  -----------------
  0x07      190   0.49%  min=25    med=  25.0 p90=25     max=25       0x11b49db64
  0x09        2   0.01%  min=91    med= 135.0 p90=179    max=179      0x11b49e7c5
  0x10       55   0.14%  min=575   med= 617.0 p90=2919   max=5551     0x11b49eb07
  0x1d       97   0.25%  min=349   med= 365.0 p90=365    max=365      0x11b49db5a
  0x1e        7   0.02%  min=25    med=  25.0 p90=25     max=25       0x11b490170
  0x27        9   0.02%  min=29    med=  29.0 p90=29     max=29       0x11b4901df
  0x2a      542   1.41%  min=29    med=  29.0 p90=55     max=55       0x11b49dbc7
  0x2c    2,481   6.44%  min=23    med=  23.0 p90=23     max=23       0x11b49dc33
  0x2e      357   0.93%  min=29    med=  29.0 p90=85     max=365      0x11b49dbf5
  0x31       25   0.06%  min=117   med= 117.0 p90=441    max=441      0x11b49ed99
  0x36      112   0.29%  min=22    med=  22.0 p90=22     max=22       0x11b49db63
  0x3c      123   0.32%  min=23    med=  23.0 p90=23     max=26       0x11b49ede0
  0x46       63   0.16%  min=27    med=  27.0 p90=27     max=613      0x11b49dbf8
  0x4c    1,782   4.63%  min=24    med=  24.0 p90=24     max=24       0x11b49dbc5
  0x51       54   0.14%  min=668   med= 696.0 p90=710    max=738      0x11b48f8df
  0x54    1,134   2.95%  min=23    med=  23.0 p90=23     max=23       0x11b49ed22
  0x55        6   0.02%  min=24    med=  24.0 p90=24     max=24       0x11b49e24b
  0x5a    7,963  20.68%  min=93    med=  93.0 p90=93     max=424      0x11b49dbbe
  0x5b      301   0.78%  min=51    med=  51.0 p90=51     max=51       0x11b49ede2
  0x65        1   0.00%  min=193   med= 193.0 p90=193    max=193      0x16e07bdbf
  0x69        1   0.00%  min=24    med=  24.0 p90=24     max=24       0x11b49e239
  0x6a      461   1.20%  min=24    med=  24.0 p90=24     max=24       0x11b49dbc6
  0x6d      142   0.37%  min=37    med=  37.0 p90=37     max=224      0x11b49dc2a
  0x6e       96   0.25%  min=369   med= 369.0 p90=369    max=369      0x11b49db66
  0x75        1   0.00%  min=20    med=  20.0 p90=20     max=20       0x11b49e238
  0x76    1,506   3.91%  min=24    med=  24.0 p90=24     max=24       0x11b49029f
  0x78      155   0.40%  min=23    med=  23.0 p90=23     max=23       0x11b49ec3a
  0x86      581   1.51%  min=23    med=  23.0 p90=23     max=23       0x11b4902cd
  0x8a       63   0.16%  min=52    med=  52.0 p90=52     max=239      0x11b49dbfa
  0x8b      120   0.31%  min=26    med=  26.0 p90=26     max=26       0x11b49dbc2
  0x8d    5,705  14.82%  min=28    med=  28.0 p90=236    max=375      0x11b49db60
  0x90      315   0.82%  min=100   med= 100.0 p90=6628   max=115206   0x11b49dbb4
  0x97    2,579   6.70%  min=44    med=  44.0 p90=44     max=231      0x11b49db70
  0x98      207   0.54%  min=26    med=  26.0 p90=26     max=26       0x11b49ece3
  0x9b        8   0.02%  min=26    med=  26.0 p90=26     max=26       0x11b49e266
  0x9d       20   0.05%  min=56    med= 370.0 p90=383    max=387      0x11b49dc63
  0x9e        8   0.02%  min=25    med=  25.0 p90=25     max=25       0x11b49dd58
  0x9f        6   0.02%  min=25    med=  25.0 p90=25     max=25       0x11b49e254
  0xa6       13   0.03%  min=21    med=  21.0 p90=21     max=21       0x11b49ec58
  0xa7      394   1.02%  min=36    med=  36.0 p90=36     max=215      0x11b49dcc5
  0xaa       16   0.04%  min=31    med=  31.0 p90=31     max=31       0x11b49ed21
  0xac        6   0.02%  min=26    med=  26.0 p90=26     max=26       0x11b49e253
  0xad       29   0.08%  min=85    med=  85.0 p90=85     max=85       0x11b49ef58
  0xc4    9,915  25.75%  min=25    med=  25.0 p90=25     max=27       0x11b49db6c
  0xc6      822   2.13%  min=23    med=  23.0 p90=23     max=23       0x11b49dca6
  0xc9       31   0.08%  min=27    med=  27.0 p90=27     max=27       0x11b49dccc
```

本份日志中一共出现46种opcode

| opcode | 执行次数 | fetch 间原生指令中位数 |
| :--- | :--- | :--- |
| 0xc4 | 9,915 | 25  |
| 0x5a | 7,963 | 93  |
| 0x8d | 5,705 | 28  |
| 0x97 | 2,579 | 44  |
| 0x2c | 2,481 | 23  |
| 0x4c | 1,782 | 24  |
| 0x76 | 1,506 | 24  |
| 0x54 | 1,134 | 23  |

第三列“fetch 间原生指令中位数”指的是：从本次 VM 字节码 fetch 到下一次 fetch 之间，执行了多少条 ARM64 原生指令，用于帮我们判断 handler 的复杂度。数值越大，说明该 handler 执行的原生逻辑越重，这很好理解，例如 `0x5a` 高达 93，显著高于其他 opcode，说明它是最复杂的 handler

我们挑三个分析一下，剩下的交给ai吧，这里选择分析 `0xc4` ， `0x5a` ， `0x97`

三个 opcode 的统计：

| opcode | 执行次数 | 动态周期长度（原生指令数） |
| ---: | ---: | --- |
| `0xc4` | 9,915 | `25:9914次，27:1次` |
| `0x5a` | 7,963 | `93:7879次，279:80次，424:4次` |
| `0x97` | 2,579 | `44:2542次，45:2次，49:1次，231:34次` |

#### 0xc4

`0xc4` 基本只有一条短路径，但存在一个极少出现的两条指令差异路径，但27和25接近，到时候分别看看即可

##### 9914 次

真实取指：

```text
S = 0x11b49db6c

[S] = [0x11b49db6c] = 0xc4
w24 = 0xc4
x25: S -> S+1 = 0x11b49db6d
```

跳过 dispatcher 中只负责选择 opcode 的 `cmp/b` 后，进入：

```asm
MTPotal+0xea3300  add  x25, x8, #2
MTPotal+0xea3304  ldrb w8, [x8, #1]
MTPotal+0xea3308  tbnz w8, #7, high_bit_path
MTPotal+0xea330c  ldr  w8, [x28, w8, uxtw #2]
MTPotal+0xea3310  str  w8, [x26], #4
MTPotal+0xea3314  b    dispatcher_loop
```

这就是 handler 的核心，先判断指令长度

循环开头已经保存：

```text
x8 = S = 0x11b49db6c
```

handler 执行：

```asm
add x25, x8, #2
```

所以：

```text
x25 = S + 2 = 0x11b49db6e
```

这说明当前指令总长 2 字节：

```text
+-------------+--------------------+
| opcode 0xc4 | 一字节 mode/index   |
+-------------+--------------------+
```

读取第二字节

```asm
ldrb w8, [x8, #1]
```

真实结果：

```text
[S+1] = [0x11b49db6d] = 0x09
w8 = 9
```

所以当前字节码是：

```text
c4 09
```

下一条：

```asm
ldr w8, [x28, w8, uxtw #2]
```

先把寻址翻译成数学表达式：

```text
address = x28 + unsigned(w8) × 4
```

当前 VM 栈帧中：

```text
x28 = 0x11c328d9c
w8  = 9
```

所以：

```text
address = 0x11c328d9c + 9×4
        = 0x11c328d9c + 0x24
        = 0x11c328dc0
```

trace 显示：

```text
mem[READ] abs=0x11c328dc0
=> w8=0xae90
```

这说明第二字节 `09` 不是要压栈的值，而是一个槽位编号：

```text
slot[9] = 0xae90
```

因此在当前主 VM 作用域内，可以把：

```text
x28 = vm_slots_base
```

注意，x28 在解释器初始化的更早阶段曾临时保存过 bytecode end；进入主循环前已经被重新赋值。寄存器语义必须限定作用域，不能说 x28 在整个原生函数中永远都是槽位基址

```asm
str w8, [x26], #4
```

真实效果：

```text
写入 [0x11c328dc4] = 0xae90
x26: 0x11c328dc4 -> 0x11c328dc8
```

这就是：

```c
push_u32(0xae90);
```

所以 `c4 09` 的完整语义是：

```c
uint8_t index = bytecode[S + 1];
vpc = S + 2;
push_u32(vm_slots[index]);
```

可以暂时命名：

```text
LOAD_SLOT32 9
```

##### 1 次

9,915 次执行中，有 1 次周期长度为 27。对应字节码：

```text
c4 8c
```

取第二字节：

```text
w8 = 0x8c = 1000 1100b
                 │
                 └── bit7 = 1
```

因此：

```asm
tbnz w8, #7, high_bit_path
```

发生跳转，执行：

```asm
and x8, x8, #0x7f
lsl x8, x8, #2
ldr d0, [x28, x8]
str d0, [x26], #8
```

逐条解释：去掉最高位，得到 index

```text
0x8c & 0x7f = 0x0c = 12
```

所以最高位是模式标志，低 7 位是编号：

```text
mode  = operand >> 7
index = operand & 0x7f
```

index 仍然按 4 字节槽换算

```asm
lsl x8, x8, #2
```

得到：

```text
12 × 4 = 48 = 0x30
```

这次读取 8 字节

```asm
ldr d0, [x28, x8]
```

真实地址：

```text
x28 = 0x11c328f10
offset = 0x30
address = 0x11c328f40
```

`d0` 是 SIMD/浮点寄存器的低 64 位，但这里只能证明它搬运了 8 个原始字节，不能仅凭 `d0` 就说数据一定是浮点数

接着：

```asm
str d0, [x26], #8
```

说明压入 8 字节：

```text
x26 += 8
```

所以高位路径可以命名为：

```text
LOAD_SLOT64 12
```

**0xC4 的完整格式**

根据两条动态路径，可以恢复成：

```text
+-------------+--------------------------------+
| opcode 0xc4 | mode_index:u8                  |
+-------------+--------------------------------+

mode_index.bit7:
    0 -> 读取 4 字节，压栈 4 字节
    1 -> 读取 8 字节，压栈 8 字节

index:
    mode_index & 0x7f

槽位地址:
    x28 + index×4

指令长度:
    始终为 2 字节（当前观察到的两条路径）
```

伪代码：

```c
uint8_t token = bytecode[S + 1];
uint32_t index = token & 0x7f;
vpc = S + 2;

if ((token & 0x80) == 0) {
    push_u32(load_u32(vm_slots_base + index * 4));
} else {
    push_raw_u64(load_u64(vm_slots_base + index * 4));
}
```

#### 变长操作数

`0x5a` 有三种明显长度， `0x97` 有四种，可能存在变长操作数，那么何为变长操作数呢？

简单样本：

```text
5a 02 00
97 02 2c
```

看起来像固定格式：

```text
[opcode][field1][field2]
```

但另一些真实样本是：

```text
5a 02 98 02
97 02 98 02
```

还有：

```text
5a 02 c0 ab 80 80 00
```

这说明第二个字段是变长整数

handler 对每个首字节都检查最高位：

```asm
读取一个字节
tbnz ..., #7, decoder_helper
```

最高位为 0：当前字节就是字段全部内容

最高位为 1：还有后续字节，进入解码器

这与 ULEB128 的结构一致：

```text
每个字节：
bit7      = 是否还有后续字节
bit0..6   = 当前 7 位有效数据
```

手算 `98 02`

```text
0x98 = 1001 1000b
       │└──────┘
       │ 低7位 = 0x18
       └ 最高位1，继续读取

0x02 = 0000 0010b
       │└──────┘
       │ 低7位 = 0x02
       └ 最高位0，结束
```

结果：

```text
0x18 + (0x02 << 7)
= 0x18 + 0x100
= 0x118
```

手算 `c0 ab 80 80 00`

只取每字节低 7 位：

```text
c0 -> 0x40
ab -> 0x2b
80 -> 0x00
80 -> 0x00
00 -> 0x00，结束
```

结果：

```text
0x40 + (0x2b << 7)
= 0x40 + 0x1580
= 0x15c0
```

因此指令长度取决于两个字段各自占几个 LEB 字节

#### 0x5a

0x5A 的 operand 解析入口：

```asm
ldrsb w9, [x25]
tbnz  w9, #31, decode_first_field

add   x22, x8, #2
ldrb  w0, [x22]
tbnz  w0, #7, decode_second_field
```

这里第一条使用 `ldrsb` ，把原始字节最高位扩展到 bit31，再通过 `tbnz #31` 检查；本质仍是在判断原始字节的 bit7。

动态统计第一字段：

```text
0x02    7,960 次
0x00    3 次
```

这个字段没有参与有效地址相加；值 2 又正好对应 4 字节访问的自然对齐 `log2(4)=2` 。因此可以高置信度暂命名为：

```text
align_hint
```

第二字段会直接加到栈顶地址操作数上，因此命名为：

```text
offset
```

当前恢复格式：

```text
0x5a align_hint:ULEB32 offset:ULEB32
```

这与常见的线性内存 `memarg {align, offset}` 编码非常相似

##### 5a 02 00

真实字节码：

```text
地址              字节       含义
0x11b49dd55       5a         opcode
0x11b49dd56       02         align_hint = 2
0x11b49dd57       00         offset = 0
0x11b49dd58       ...        下一条 opcode
```

所以：

```text
S = 0x11b49dd55
next_pc = S + 3 = 0x11b49dd58
```

操作数解析结束后，核心数据流如下

**从虚拟栈顶取得线性内存地址操作数**

```asm
ldur w8, [x26, #-4]
```

真实值：

```text
x26 = 0x11c328dcc
[x26-4] = [0x11c328dc8] = 0x7e870
w8 = 0x7e870
```

这里没有 `!`，所以 x26 不变。handler 是读取/查看栈顶，不是先 pop。

**加上字节码中的 offset**

```asm
add x8, x8, w0, uxtw
```

当前：

```text
address_operand = 0x7e870
offset = 0
effective_offset = 0x7e870
```

**做 4 字节越界检查**

```asm
add x9, x8, #4
ldr w10, [sp, #0x94]
cmp x9, w10, uxtw
b.hi out_of_bounds
```

近似：

```c
if (effective_offset + 4 > linear_memory_size) {
    trap();
}
```

为什么加 4？因为马上要读取一个 32 位值，宽度是 4 字节。

**加上线性内存基址**

```asm
ldr x9, [x27, #0x80]
add x8, x9, x8
```

真实值：

```text
linear_memory_base = 0x11b4a0000
effective_offset   = 0x7e870

native_address = 0x11b4a0000 + 0x7e870
               = 0x11b51e870
```

这说明虚拟栈中保存的 `0x7e870` 不是完整原生指针，而是相对于 VM 线性内存基址的 offset。

**找真正的数据读取**

中间有几十条控制流、对齐选择和混淆指令。不要每条都解释，先找语义的关键读：

```asm
ldr w17, [x8]
```

真实效果：

```text
[0x11b51e870] = 0x40
w17 = 0x40
```

**结果覆盖虚拟栈顶**

最后：

```asm
stur w1, [x26, #-4]
```

真实效果：

```text
[x26-4] = 0x40
x26 不变
```

执行前后：

```text
执行前栈顶：线性内存 offset 0x7e870
执行后栈顶：从该位置读取的值 0x40
```

所以它等价于：

```c
uint32_t address = pop_u32();
uint32_t value = load_u32(linear_memory_base + address + offset);
push_u32(value);
```

实现层面没有真的移动 x26，而是直接把地址操作数原地替换成读取结果。

栈变化：

```text
pop 1 + push 1
净变化 0
x26 不变
```

因此可以命名：

```text
I32_LOAD / LOAD_MEM32
```

##### 5a 02 98 02

真实编码：

```text
5a 02 98 02
```

解码：

```text
align_hint = 2
offset = ULEB(98 02) = 0x118
指令长度 = 1 + 1 + 2 = 4
```

trace 显示解码器消费了 2 字节：

```text
[0x11b49dbc0] = 0x98
[0x11b49dbc1] = 0x02
decoded offset = 0x118
next_pc = 0x11b49dbc2
```

当前栈顶地址操作数：

```text
address_operand = 0xae90
```

计算：

```text
effective_offset = 0xae90 + 0x118
                 = 0xafa8

native_address = 0x11b4a0000 + 0xafa8
               = 0x11b4aafa8
```

真实读取：

```text
[0x11b4aafa8] = 0x7e778
```

最终覆盖栈顶：

```text
[x26-4] = 0x7e778
```

这条路径之所以用了 279 条原生指令，不是 load 本身复杂了，而是进入了变长整数解码辅助逻辑

##### 5a 02 c0 ab 80 80 00

真实编码：

```text
5a 02 c0 ab 80 80 00
```

解码：

```text
align_hint = 2
offset = ULEB(c0 ab 80 80 00) = 0x15c0
指令长度 = 1 + 1 + 5 = 7
```

trace 中解码辅助函数返回：

```text
x0 = 0x15c0
消费字节数 = 5
```

随后：

```text
x25 = offset_start + 5
```

因此 0x5A 的三个周期长度簇可以解释为：

| 周期长度 | 次数  | 主要原因 |
| :---: | :---: | :---: |
| 93  | 7,879 | offset 单字节，直接解析 |
| 279 | 80  | offset 两字节，调用变长整数解码器 |
| 424 | 4   | offset 五字节，解码器循环更多次 |

它们不是三个不同的 opcode，也不是三个不同的 load 语义；它们主要是同一条指令的不同 operand 编码长度

#### 0x97

##### 97 02 2c

真实字节码：

```text
地址              字节       含义
0x11b49dc6e       97         opcode
0x11b49dc6f       02         align_hint = 2
0x11b49dc70       2c         offset = 0x2c
0x11b49dc71       ...        下一条 opcode
```

所以：

```text
指令长度 = 3
next_pc = S + 3
```

接下来分析它如何使用虚拟栈

执行前栈布局，真实值：

```text
x26 = 0x11c328dcc

[x26-8] = [0x11c328dc4] = 0xae90
[x26-4] = [0x11c328dc8] = 0x7e828
```

暂时还不知道两个值的角色，继续看使用方式

取得倒数第二个栈值

```asm
mov x8, x26
ldr w9, [x8, #-8]!
```

注意：修改的是临时寄存器 x8，不是 x26

执行后：

```text
x8 = old_x26 - 8 = 0x11c328dc4
w9 = [old_x26-8] = 0xae90
x26 仍然是 0x11c328dcc
```

加上字节码 offset

```asm
add x9, x9, w0, uxtw
```

当前：

```text
w9 = 0xae90
w0 = 0x2c

effective_offset = 0xae90 + 0x2c
                 = 0xaebc
```

做 4 字节边界检查并加线性内存基址

```asm
add x10, x9, #4
cmp x10, linear_memory_size
b.hi out_of_bounds

ldr x10, [x27, #0x80]
add x9, x10, x9
```

得到：

```text
linear_memory_base = 0x11b4a0000
native_address = 0x11b4a0000 + 0xaebc
               = 0x11b4aaebc
```

取得最后一个栈值

```asm
ldur w10, [x26, #-4]
```

得到：

```text
w10 = [x26-4] = 0x7e828
```

现在两个栈值的角色清楚了：

```text
stack[-2] = address operand
stack[-1] = value
```

写入线性内存

```asm
str w10, [x9]
```

真实效果：

```text
[0x11b4aaebc] = 0x7e828
```

一次消费两个栈元素

```asm
mov x26, x8
```

前面已经令：

```text
x8 = old_x26 - 8
```

所以：

```text
x26 = old_x26 - 8
```

也就是丢弃两个 4 字节栈元素，不压回结果：

```text
pop address
pop value
push 0 个
stack delta = -2
```

因此完整语义是：

```c
uint32_t value = pop_u32();
uint32_t address = pop_u32();

check_bounds(address + offset, 4);
store_u32(linear_memory_base + address + offset, value);
```

可以命名：

```text
I32_STORE / STORE_MEM32
```

##### 97 02 98 02

真实编码：

```text
97 02 98 02
```

解码：

```text
align_hint = 2
offset = ULEB(98 02) = 0x118
指令长度 = 4
```

真实栈值：

```text
stack[-2] = address = 0xae90
stack[-1] = value   = 0x7e778
```

有效地址：

```text
effective_offset = 0xae90 + 0x118
                 = 0xafa8

native_address = 0x11b4a0000 + 0xafa8
               = 0x11b4aafa8
```

真实写入：

```text
[0x11b4aafa8] = 0x7e778
```

最后：

```text
x26: old_x26 -> old_x26-8
```

这条 231 原生指令的路径，比普通 44 条路径长，主要原因是 offset 使用了两字节 ULEB 编码并调用解码辅助逻辑

##### 0x97 的 44/45/49 路径为什么略有差异

在 offset 都能直接用一个字节表示时，0x97 仍有：

```text
44 条原生指令    2,542 次
45 条原生指令    2 次
49 条原生指令    1 次
```

它们不是不同的虚拟指令长度，而是写入地址的对齐情况不同

handler 会检查：

```asm
tst x9, #3
```

也就是检查地址除以 4 的余数

对齐地址，例如：

```text
address = 0x11b4aaebc
address & 3 = 0
```

可以直接：

```asm
str w10, [x9]
```

非对齐地址，另一个真实样本：

```text
address = 0x11b51e856
value = 0xa3896743
address & 3 = 2
```

handler 分成两次 16 位写入：

```asm
strh w10, [x9]
strh w11, [x9, #2]
```

最终内存字节仍然是正确的小端顺序：

```text
43 67 89 a3
```

所以 44/45/49 的区别主要是原生层如何安全完成未对齐写入，不改变虚拟语义：

```text
STORE_MEM32
```

handlers先分析到这里，剩下的全都交给聪明的你吧

### 离线翻译

早期接触 VMP 时，我把它理解成一种“等价翻译”：将程序从表示 A 转换为表示 B。既然两者功能等价，我当时便认为转换过程中没有信息损失，只要分析清楚 A 与 B 之间的映射规则，就能够把 B 原样还原成 A，再对熟悉的 A 进行分析

但后来我意识到，A→B 并不是一种简单、双射的编码过程。A 和 B 的“等价”，只是可观察行为或最终效果上的等价，而不是实现形式、执行过程和结构信息上的一致。对人而言，它们完成了同一件事；但对 CPU 而言，两者执行的指令、控制流和中间状态可能完全不同

这和编译、反编译很相似：C 源码可以编译成二进制程序，但 IDA 无法从二进制中唯一恢复出原始 C 源码，只能生成一份行为近似或等价的伪 C。变量名、类型、控制结构以及编译前的抽象信息，可能已经被消除或融合；而且许多不同的源程序都可以编译成相同或近似的机器代码

因此，从 A 到 B 是一次保持程序行为的变换，而从 B 到 A 并不是对该过程的简单求逆。它更接近于：根据 B 的行为，重新构造出某个与原始 A 语义等价的 A′。A′ 可以完成同样的事情，却未必在结构上等于最初的 A

对 VMP 来说也是如此。去虚拟化真正需要恢复的，通常不是原始指令与虚拟指令之间的一一映射，而是虚拟指令、handler、调度器以及运行时状态共同表达的程序语义，再据此重建一种更容易分析的等价表示。当我们完成对各个 handler 的分析后，实际上已经掌握了它们所对应的局部语义。因此，没有必要再将 VM bytecode 转换成某种语义等价的 ARM64 机器码，然后重新通过阅读 ARM64 汇编来理解程序

以前面的例子来说，假设我已经分析清楚了各个 handler，并且能够把 VM bytecode 翻译成一组语义等价的 ARM64 指令，那么接下来仍然需要分析这些 ARM64 指令的数据流、控制流以及它们所实现的算法。整个过程实际上变成了：

VM bytecode → 等价的 ARM64 指令 → 程序语义

但既然 handler 的分析已经告诉了我们每条虚拟指令“做了什么”，那么中间生成 ARM64 指令这一步并没有提供新的语义信息，反而重新引入了寄存器分配、指令选择等与算法本身无关的底层细节。

因此，更直接的做法是对 trace 中的 handler 执行过程进行语义归约：将一连串用于实现某个虚拟操作的真实指令，折叠为一条或少量更容易理解的 IR，再基于 IR 恢复程序的数据流、控制流以及高层算法：

VM trace → 语义归约 → IR → 算法分析

这里恢复的目标不再是原始 ARM64 指令本身，而是原始程序所表达的核心语义。这里折叠之后，400W 行的日志被压缩到了 3.5W 行，效果还不错，后续直接把折叠之后的日志交给 AI 分析，效果还不错，而且耗时很短

![9](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/816e74c23b991b2d.webp)

## 0x04 小结

写完这篇文章后，我对 VMP 的理解反而简单了很多

VMP 的本质，是用解释器构造一台软件 CPU，将原本由真实 CPU 直接执行的程序，转换为另一套指令集和状态模型，再重新执行一遍，它没有创造新的程序语义，只是改变了语义的表达方式。原本一条清晰的指令，被拆散到虚拟字节码、dispatcher、handler、虚拟栈和运行时状态之中；原本直接可见的数据流和控制流，也被淹没在庞大的解释执行过程中

但是，无论 handler 写得多复杂，执行路径膨胀到多长，最终都必须读取输入、改变状态并产生结果。只要这些数据状态变化仍然可以被观察，隐藏在虚拟机背后的语义就仍然可以被恢复。VMP 所做的，只是用更复杂的执行形式，提高理解原始语义的成本

仅此而已。

[](#)

Twikoo 评论管理

密码
