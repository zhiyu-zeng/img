---
title: Cheat Engine 九关教程通关笔记：从数值扫描到代码注入
source: https://ip2867.github.io/post/cheat-engine-tutorial/
source_host: ip2867.github.io
clip_date: 2026-11-25T10:51:03+08:00
trace_id: f19590df-435a-469d-bed7-f8ddf0909dc1
content_hash: 1e0937d80ac75e5b90a3bc1e7b47d6c9c3d520fef1233a303297f276b9dd58af
status: synced
tags: []
series: null
feed_source: Ip2867·Android/逆向
ai_summary: null
ai_summary_style: null
images_status:
  total: 56
  succeeded: 56
  failed_urls: []
notion_page_id: 42375244-d011-81bb-b438-f7b3ac2b2fc1
ioc: null
---

> Cheat Engine 自带的九关教程，本质上是一条很完整的逆向入门路线：先学会在内存里找值，再顺着值找到改值的代码，最后读懂并改写这段代码。九关走完，动态调试的基本功就齐了。
> 
> 这篇笔记按「地址换算 → 九关逐个过 → 小游戏 → 避坑清单」的顺序整理，所有操作都是在本机实际跑通后记录的。工具版本为 Cheat Engine 7.x，教程版本 v3.6，目标进程 `Tutorial-x86_64.exe` 。

* * *

## 零、先搞清楚地址：CE / x32dbg / IDA 的换算

在动手之前，有一件事必须先建立概念，否则后面每找一个地址都会怀疑自己。

### 0.1 三种工具，两种地址

| 工具  | 显示的是什么 | 基准  | 受 ASLR 影响 |
| --- | --- | --- | --- |
| IDA | 静态 VA（Preferred ImageBase + RVA） | PE 头里的 `ImageBase` ，可在 IDA 内 rebase | 否   |
| x32dbg / x64dbg | 运行时 VA | 模块实际加载基址 | 是   |
| CE  | 运行时 VA，常显示成 `模块名+RVA` | 模块实际加载基址 | 是   |

一句话： **CE 和调试器看到的是"这次运行时装在哪"，IDA 看到的是"链接时假设装在哪"，两者用 RVA 搭桥。**

[![三种工具显示的地址与基准对照](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/451ea70ef42202f5.png)](https://ip2867.github.io/images/ce-tutorial/addr-conversion.png)

> 表里 `game.exe+1234` 中的 `1234` 就是 RVA。CE 直接把它写在地址里，反而最省事。

### 0.2 核心公式

```text
RVA      = 运行时 VA − 模块实际基址
IDA_VA   = IDA_ImageBase + RVA

合并：
IDA_VA   = 运行时 VA − 运行时基址 + IDA_ImageBase
```

反过来从 IDA 推运行时地址：

```text
运行时 VA = 模块实际基址 + (IDA_VA − IDA_ImageBase)
```

x86 PE 的默认 `ImageBase` 常见 `0x00400000` ，x64 常见 `0x140000000` 。CE 里显示的 `TUTORIAL-X86_64.EXE+346C70` ，等价于 `IDA_VA = 0x140000000 + 0x346C70` 。

### 0.3 例一：无 ASLR 的 32 位 PE

PE 头 `ImageBase = 0x00400000` ，某函数 `RVA = 0x12340` 。

| 工具  | 看到的地址 | 计算过程 |
| --- | --- | --- |
| IDA | `0x00412340` | `0x400000 + 0x12340` |
| x32dbg | `0x00412340` | 模块实际基址也是 `0x400000` |
| CE  | `game.exe+12340` → `0x00412340` | 基址 + RVA |

[![无 ASLR 时三者完全一致](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8600988eb5dd7091.png)](https://ip2867.github.io/images/ce-tutorial/pe-imagebase-example.png)

三者完全一致，可以直接互相跳转。

### 0.4 例二：开了 ASLR 的 64 位程序

这次模块被装到了别处：

```text
模块实际基址 = 0x7FF612340000
函数 RVA     = 0x12340
运行时 VA    = 0x7FF612352340

IDA 里看到的是：
IDA_VA = 0x7FF612352340 − 0x7FF612340000 + 0x140000000
       = 0x140012340
```

所以在 x64dbg 里断在 `0x7FF612352340` ，回到 IDA 要按 `0x140012340` 去看，直接拿运行时地址去 IDA 里跳是跳不到的。

> 反过来也一样：CE 里记下的绝对地址，下次重启程序就作废了；只有 `模块名+偏移` 这种写法能跨重启使用。这也是后面指针关卡的由来。

### 0.5 别把 VA 当文件偏移

IDA 里按 `G` 跳转用的是 VA，不是文件偏移。要改文件（打补丁、写脚本）时，得用节表换算：

```text
若 RVA 落在某个节内：
文件偏移 = RVA − 节的 VirtualAddress + 节的 PointerToRawData
```

例：`.text` 节 `VirtualAddress = 0x1000` 、 `PointerToRawData = 0x400` ，某函数 `RVA = 0x2340` ：

```text
文件偏移 = 0x2340 − 0x1000 + 0x400 = 0x1740
```

两个坑：

-   用节头里的 `VirtualAddress` ，不要用按 `FileAlignment` 取整后的值；
-   `VirtualSize` 比 `SizeOfRawData` 小的节，文件尾部有填充，按上式计算时注意落在哪个区间。

* * *

## 一、第一关：附加进程

教程窗口会提示先启动 CE 主程序，然后在进程列表里选中 `Tutorial-x86_64.exe` 。

[![第一关：启动 CE 并附加教程进程](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/55023ea3bba7379f.png)](https://ip2867.github.io/images/ce-tutorial/level1-intro.png)

CE 左上角有个闪烁的电脑图标，点它弹出进程列表：

[![在进程列表里选择 Tutorial-x86\_64.exe](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/eefd9035764d09a1.png)](https://ip2867.github.io/images/ce-tutorial/level1-process-list.png)

选中后点「打开」，标题栏会显示进程名和 PID，说明附加成功。 **后面所有扫描都只在这个进程的内存里进行**，选错进程会一无所获。

* * *

## 二、第二关：精确值扫描

**目标：把生命值改成 1000。** 跳关密码 `090453` 。

[![第二关：扫描精确值](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/223f5819f7601aa2.png)](https://ip2867.github.io/images/ce-tutorial/level2-intro.png)

生命值是已知的整数，直接用「精确数值」扫：

1.  值类型选 `4 字节` ，扫描类型选 `精确数值` ，数值填当前血量（比如 `100` ）；
2.  点「首次扫描」，会得到一批地址；
3.  点一次「打我」，血量变成 96，把数值改成 `96` ，点「下一次扫描」；
4.  重复第 3 步，直到左侧只剩一两个地址；
5.  双击该地址的「值」列，改成 `1000` 。

[![精确扫描后定位到血量地址并修改](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/23a6e418e5012661.png)](https://ip2867.github.io/images/ce-tutorial/level2-scan.png)

也可以在「内存视图」里直接双击对应字节改值，效果一样。

**这一关要建立的习惯**：扫描不是一次完成的，而是"改变数值 → 再筛一次"的循环。筛得越勤，候选越少。

* * *

## 三、第三关：未知初始值

**目标：把生命值改成 5000。** 跳关密码 `419482` 。

[![第三关：未知初始值](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9856853f0d798671.png)](https://ip2867.github.io/images/ce-tutorial/level3-intro.png)

这次血条不显示具体数字，只知道范围是 0～500。初始值未知，就没法用精确扫描，改用「未知初始值」：

1.  扫描类型选 `未知初始值` ，值类型 `4 字节` ，点「首次扫描」；
2.  点一次「打我」，血量减少，扫描类型改成 `减少的值` ，点「下一次扫描」；
3.  反复"挨打 → 扫描减少的值"，候选会迅速收敛；
4.  剩下的候选里，挑一个数值落在 0～500 之间、且每次挨打都跟着减的，就是真身；
5.  改成 `5000` 。

[![用"减少的值"反复筛选](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/de57e43cd313af4a.png)](https://ip2867.github.io/images/ce-tutorial/level3-scan-decreased.png)

这里的关键不是记住步骤，而是理解扫描类型：

| 扫描类型 | 适用场景 |
| --- | --- |
| 精确数值 | 知道当前值 |
| 未知初始值 | 完全不知道值，只知道它存在 |
| 减少的值 / 增加的值 | 知道变化方向，不知道变化量 |
| 变动的值 | 只关心它变了 |

* * *

## 四、第四关：浮点数

**目标：修改生命值和子弹，两者都是浮点数。** 跳关密码 `890124` 。

[![第四关：单浮点与双浮点](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1a903369092d813a.png)](https://ip2867.github.io/images/ce-tutorial/level4-float-intro.png)

这关有两个数值，类型不同：

-   生命值： `单浮点` （float，4 字节），每次挨打减少一些；
-   子弹： `双浮点` （double，8 字节），每次开火减少 `0.5` 。

操作上就是把值类型从 `4 字节` 换成 `单浮点` / `双浮点` ，其余流程和第二关一样。子弹每次减 0.5，所以扫描时会出现 `99.5` 、 `99.0` 这种小数。

**为什么必须选对类型**：整数和浮点在内存里的二进制表示完全不同。100 作为 int 是 `64 00 00 00` ，作为 float 是 `00 00 C8 42` 。类型选错，扫一万次也扫不到。

* * *

## 五、第五关：代码查找（NOP 掉写入）

**目标：锁定数值，点「改变数值」也不让它变。** 跳关密码 `888899` 。

[![第五关：代码查找](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/171232105b9d46f5.png)](https://ip2867.github.io/images/ce-tutorial/level5-intro.png)

这关的地址每次进来都会变，单纯改值没有意义。思路是 **找到改这个值的指令，然后让它失效**。

### 5.1 先找到值

按前面的方法扫出当前血量（比如 178）：

[![先扫描定位当前血量](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3991c494bfae4760.png)](https://ip2867.github.io/images/ce-tutorial/level5-address-found.png)

### 5.2 找出是什么写入了它

在地址上右键 →「找出是什么改写了这个地址」（Find out what writes to this address），然后回游戏点「改变数值」触发一次写入。CE 会捕获到：

```asm
1000495D8 - 89 10 - mov [rax],edx
```

[![捕获到写入血量的指令](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1829007d7238f3fc.png)](https://ip2867.github.io/images/ce-tutorial/level5-write-instruction.png)

### 5.3 用 NOP 掐断写入

选中这条指令 →「替换」（Replace）→ 输入 `nop` 。 `nop` 是空操作，CPU 执行到这儿什么也不做，写入逻辑就被切断了。

改完回游戏点「改变数值」，数值不再变化，过关。

**注意**：NOP 是直接改写进程内存里的指令字节，只对当前进程有效。想恢复的话，在反汇编窗口右键该指令选择「还原原始代码」，或者在自动汇编脚本列表里停用/删除对应条目。改错了导致程序崩溃，重启进程即可，不会影响磁盘上的文件。

> 这一关还有另一种解法：顺着写入指令找到指针，再把指针指向的值锁定。指针的做法就是下一关的内容。

* * *

## 六、第六关：一级指针

**目标：把生命值锁定为 5000，点「改变指针」后数值也不变。** 跳关密码 `098712` 。

[![第六关：指针](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b3e53bcff6e63c26.png)](https://ip2867.github.io/images/ce-tutorial/level6-intro.png)

### 6.1 为什么需要指针

第五关用 NOP 是"就地防守"，但如果游戏每次切换场景都重新分配对象，指令地址和数值地址都在变，NOP 就不是长久之计。

指针的思路是： **动态地址会变，但"谁指向它"这件事是有固定路径的**。只要记住"静态基址 + 一串偏移"，每次都能重新算出当前地址。

### 6.2 顺着写入指令往上摸

先扫出血量地址（如 `015B30E0` ），对它「找出是什么改写了这个地址」，得到：

```asm
100049B8C - 89 02 - mov [rdx],eax
```

点「更多信息」，CE 会展开这段上下文并给出寄存器快照：

```asm
100049B82 - mov rdx,[100346C70]
100049B89 - mov eax,[rbp-18]
100049B8C - mov [rdx],eax      << 当前指令
```

[![寄存器快照与指针提示](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/20af921f8b6bf03a.png)](https://ip2867.github.io/images/ce-tutorial/level6-disassembly.png)

读法：

-   `mov [rdx],eax` 说明写入目标由 `rdx` 决定；
-   执行后 `RDX = 015B30E0` ，正好是血量地址；
-   `mov rdx,[100346C70]` 说明 `rdx` 是从 `100346C70` 这个固定位置读出来的。

**这条指令没有偏移** （ `[rdx]` 而不是 `[rdx+18]` ），所以偏移是 `0` ， `015B30E0` 本身就是指针的值。

### 6.3 把指针加进地址列表

先确认 `100346C70` 是静态的：它是 `TUTORIAL-X86_64.EXE+346C70` ，模块基址 `100000000` 加上偏移 `346C70` 。CE 里这类地址会显示成绿色，表示它落在模块的静态区，不会随场景变化。

[![模块名 + 偏移的形式，与绝对地址 100346C70 等价](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/07386013a60c987f.png)](https://ip2867.github.io/images/ce-tutorial/level6-change-address.png)

换个角度确认：新建扫描，勾选「十六进制」，直接搜指针值 `015B30E0` ，命中的就是保存这个指针的静态槽位。

[![十六进制搜索 015B30E0，命中静态区](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b66eb8b5303fc1ae.png)](https://ip2867.github.io/images/ce-tutorial/level6-pointer-search.png)

点「手动添加地址」→ 勾选「指针」→ 基址填 `"TUTORIAL-X86_64.EXE"+346C70` ，偏移填 `0` ：

[![添加指针，偏移为 0](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5b98fc95a97964d7.png)](https://ip2867.github.io/images/ce-tutorial/level6-add-pointer-offset.png)

添加后显示的数值和原地址一致，说明指针链走通了：

[![指针条目与原地址指向同一个值](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d4ed2ac9ffa16a10.png)](https://ip2867.github.io/images/ce-tutorial/level6-pointer-verified.png)

### 6.4 锁定

把指针条目的值改成 `5000` 并勾选「激活」（锁定），再点游戏里的「改变指针」。因为指针会重新解析到新的动态地址，锁定始终作用在正确的位置上，数值就不会被改回去了。

[![锁定指针条目的值](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e7b6aa0513197e84.png)](https://ip2867.github.io/images/ce-tutorial/level6-locked.png)

**CE 地址颜色速记**：

-   绿色：静态地址（模块+偏移），跨重启有效；
-   黑色：动态地址，这次运行有效；
-   指针条目显示 `P->` 前缀，后面是解析出来的动态地址。

* * *

## 七、第七关：代码注入

**目标：让「打我」每次加 2 点血（原本是减 1）。** 跳关密码 `013370` 。

[![第七关：代码注入](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/835777bbf439b32d.png)](https://ip2867.github.io/images/ce-tutorial/level7-intro.png)

第五关是"让指令失效"，这一关是"让指令改口"——不仅不执行原来的减法，还要执行我们写的加法。

### 7.1 找到扣血指令

扫出血量地址，找出写入指令，在反汇编窗口里能看到类似：

```asm
sub dword ptr [rsi+000007E8],01
```

[![扣血指令](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/329ed82397de0f9e.png)](https://ip2867.github.io/images/ce-tutorial/level7-disassembly.png)

### 7.2 打开自动汇编并套用代码注入模板

在反汇编窗口按 `Ctrl+A` 打开「自动汇编」，菜单「模板」→「代码注入」。CE 会自动生成 `newmem` 、 `originalcode` 、 `returnhere` 这套骨架：

```asm
label(exit)

newmem:
  // 这是已分配内存，可读 / 写 / 执行
  // 把你的代码放在这里

originalcode:
  sub dword ptr [rsi+000007E8],01

exit:
  ...
```

骨架里几块东西各司其职：

-   `newmem` ：CE 在目标进程里新申请的一块可执行内存，你的代码放这里；
-   `originalcode` ：被覆盖掉的原指令，必须原样保留或等价改写，否则寄存器/堆栈状态会对不上；
-   `returnhere` ：跳回原流程的落点。

### 7.3 两种改法

**改法一：先加 3，再走原本的减 1。** 净效果 `+3 − 1 = +2` ：

```asm
newmem:
  add dword ptr [rsi+000007E8],03
originalcode:
  sub dword ptr [rsi+000007E8],01
```

[![先加 3 再减 1](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/78836b79983cd593.png)](https://ip2867.github.io/images/ce-tutorial/level7-inject-add3.png)

**改法二：注释掉原指令，直接加 2**：

```asm
newmem:
  add dword ptr [rsi+000007E8],02
originalcode:
  // sub dword ptr [rsi+000007E8],01
```

[![注释原指令后直接加 2](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/38e8363f3976c481.png)](https://ip2867.github.io/images/ce-tutorial/level7-inject-add2.png)

两种都能过关。改法一的兼容性更好，因为原指令仍然执行；改法二更直观，但跳过了原指令，要确认它没有其他副作用。

### 7.4 关于寄存器保护

CE 的模板通常会带 `pushad` / `popad` （x64 下是 `push` / `pop` 一组寄存器）来保存现场。 **不要随手删掉这些指令**：注入代码运行在游戏主流程中间，你把 `eax` 、 `rdx` 改乱了却不恢复，返回后游戏用到这些寄存器就会读到脏数据，轻则逻辑错乱，重则直接崩溃。

这个模板已经帮你处理好了保存与恢复，自己手写 `alloc` + `jmp` 的版本时才需要特别当心。

* * *

## 八、第八关：多级指针

**目标：把生命值锁定为 5000，点「改变指针」后数值也不变。** 跳关密码 `525927` 。

[![第八关：多级指针](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6ac17cdf5fa55a41.png)](https://ip2867.github.io/images/ce-tutorial/level8-intro.png)

这一关是四级指针，也就是"指向指针的指针的指针的指针"。查找方向和直觉相反： **从血量出发，一层层往回摸**。

### 8.1 第一层：找写入指令

扫出血量地址 `01601A48` ，找出写入指令：

```asm
10004B2FA - 89 46 18 - mov [rsi+18],eax
```

这里 `RSI = 01601A30` ，代入 `[rsi+18]` 正好是 `01601A48` 。所以：

-   偏移 = `18` ；
-   上一层的指针槽 = `01601A30` 。

[![第一层：偏移 18](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7c8342eae1d56370.png)](https://ip2867.github.io/images/ce-tutorial/level8-write-instruction.png)

[![寄存器快照](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ca6d4436a979b448.png)](https://ip2867.github.io/images/ce-tutorial/level8-registers.png)

### 8.2 第二层：谁保存了 01601A30

关键操作： **新建扫描，值类型选 `4 字节` ，勾选「十六进制」，搜索 `01601A30` 。** 这会找到内存中哪个位置存着这个指针值。

命中的是 `016017B0` 。对它右键「找出是什么访问了这个地址」（注意是"访问"，不是"写入"）：

```asm
10004B2AC - cmp qword ptr [rsi],00
10004B2B8 - mov rsi,[rsi]
```

`mov rsi,[rsi]` 的源和目标同为 `rsi` ，硬件断点显示的是执行后的寄存器值，容易看错。判断依据： `[rsi]` 没有偏移，所以偏移 = `0` ，当前槽位 `016017B0` 里存的值就是 `01601A30` 。

[![第二层：偏移 0](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4cb41eec90cd32d7.png)](https://ip2867.github.io/images/ce-tutorial/level8-access-instruction.png)

**为什么中间层用「访问」而不是「写入」**：中间这些槽位只是被程序读出来当跳板用，本身并不会被频繁写入。只盯写入，什么也抓不到。

### 8.3 第三层、第四层：重复同样的动作

继续用十六进制搜索上一层的槽位地址，再找访问指令：

```asm
// 搜索 016017B0，命中槽位 05F25FB8
10004B260 - cmp qword ptr [rsi+18],00
10004B26C - mov rsi,[rsi+18]
// RSI = 05F25FA0 → 偏移 18
```

[![第三层：偏移 18](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d1094744b8d7379b.png)](https://ip2867.github.io/images/ce-tutorial/level8-second-layer.png)

```asm
// 搜索 05F25FA0，命中槽位 0161A0D0
10004B218 - cmp qword ptr [rsi+10],00
10004B224 - mov rsi,[rsi+10]
// RSI = 0161A0C0 → 偏移 10
```

[![第四层：偏移 10](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/96ff492333b44c95.png)](https://ip2867.github.io/images/ce-tutorial/level8-third-layer.png)

最后搜索 `0161A0C0` ，搜到的结果已经是绿色静态地址 `"TUTORIAL-X86_64.EXE"+346CA0` ，链条到头了：

[![找到绿色静态基址](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d9e20ee431651fed.png)](https://ip2867.github.io/images/ce-tutorial/level8-static-base.png)

### 8.4 整理成表

| 层级  | 槽位地址 | 指向  | 偏移  |
| --- | --- | --- | --- |
| 静态基址 | `"TUTORIAL-X86_64.EXE"+346CA0` | `0161A0C0` | —   |
| 第 1 跳 | `0161A0C0` | `05F25FA0` | `10` |
| 第 2 跳 | `05F25FA0` | `016017B0` | `18` |
| 第 3 跳 | `016017B0` | `01601A30` | `0` |
| 第 4 跳 | `01601A30` | `01601A48` （血量） | `18` |

### 8.5 在 CE 里填指针

「手动添加地址」→ 勾选「指针」→ 基址填静态地址 `"TUTORIAL-X86_64.EXE"+346CA0` ，偏移 **从内到外** 依次填 `18` 、 `0` 、 `18` 、 `10` ：

[![按内到外的顺序填偏移](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/70b63bf2c5316d9a.png)](https://ip2867.github.io/images/ce-tutorial/level8-pointer-panel.png)

顺序记法： **离血量最近的偏移填最上面，离基址最近的填最下面。** 填反了会解析到一个完全无关的地址。

添加后数值一致，说明链条正确：

[![指针解析出的值与血量一致](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/808bb68f0cfd5728.png)](https://ip2867.github.io/images/ce-tutorial/level8-pointer-verified.png)

改成 `5000` 并勾选「激活」锁定：

[![改为 5000 并锁定](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/689ca1e339a5beda.png)](https://ip2867.github.io/images/ce-tutorial/level8-value-5000.png)

再点游戏里的「改变指针」，数值保持不变：

[![点击改变指针后仍然锁定](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/679f223e0f2f5ee3.png)](https://ip2867.github.io/images/ce-tutorial/level8-locked.png)

**操作顺序很重要**：先锁定，再点「改变指针」。如果先点按钮，动态地址已经换掉，原来的条目就失效了。

### 8.6 这一关的两个陷阱

1.  **`mov rsi,[rsi]` 自引用**：源和目标是同一个寄存器时，CE 显示的是执行后的值，看起来像"偏移 0、值没变"，很容易把槽位地址当成指针值。判断方法是看指令里的 `[]` 有没有偏移，以及结合同一代码块里的 `cmp` 交叉验证。
2.  **中间层找"访问"**：写值只会发生在最终的血量上，中间槽位只被读取。找写入会一无所获。

* * *

## 九、第九关：共享代码

**目标：在不冻结血量的前提下赢下 4 人战斗。** 跳关密码 `31337157` 。

[![第九关：共享代码](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6b93c9091855b442.png)](https://ip2867.github.io/images/ce-tutorial/level9-intro.png)

四个角色：戴夫、艾里克是我方（100 血），哈尔、凯特是电脑（500 血）。麻烦在于—— **所有角色共用同一段扣血代码**，直接改指令会变成"我方无敌，敌方也无敌"。

[![四个角色的血量都是独立地址，但走同一段代码](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8919e959d43eb5af.png)](https://ip2867.github.io/images/ce-tutorial/level9-four-health.png)

### 9.1 确认是共享代码

分别扫出四个血量地址（单浮点），逐个「找出是什么改写了这个地址」。四次捕获到的都是同一条：

```asm
10004BBDD - F3 0F 11 43 08 - movss [rbx+08],xmm0
```

[![四个地址指向同一条指令](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1492a6b72a0d5f9e.png)](https://ip2867.github.io/images/ce-tutorial/level9-shared-instruction.png)

确认共享。接下来要解决的是： **怎么在共享代码里区分敌我。**

### 9.2 用「分析数据」找差异

菜单「工具」→「分析数据/结构」（或直接 `Ctrl+D` ）：

[![打开分析数据](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b011ad2a18259efa.png)](https://ip2867.github.io/images/ce-tutorial/level9-analyze-data-menu.png)

输入血量地址，定义一个结构：

[![定义结构](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/fb41a2f8e5129515.png)](https://ip2867.github.io/images/ce-tutorial/level9-define-structure.png)

再把另外三个角色的血量地址加进同一组，并排对比：

[![四个对象的结构对比](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b942d40f7416d322.png)](https://ip2867.github.io/images/ce-tutorial/level9-compare-structure.png)

差异一眼可见：

| 偏移  | 含义  | 戴夫  | 艾里克 | 哈尔  | 凯特  |
| --- | --- | --- | --- | --- | --- |
| `0x00` | 血量 float | 87  | 91  | 498 | 498 |
| `0x0C` | 队伍编号 | 1   | 1   | 2   | 2   |
| `0x11` | 名字  | DAVE | ERIC | HAL | KITT |

`0x0C` 处的队伍编号 `1 / 1 / 2 / 2` 就是最干净的判别条件。

### 9.3 注入条件判断

血量在 `[rbx+08]` ，队伍编号在血量 `+0x0C` 处，即 `[rbx+08+C]` ：

```asm
newmem:
  cmp [rbx+08+C],1      // 队伍编号为 1 = 我方
  je returnhere         // 我方：跳过写入，血量不再减少
  subsd xmm0,xmm0       // 敌方：把待写入的新血量清零（截图写法，见 9.4）
originalcode:
  movss [rbx+08],xmm0   // 原始指令：把 xmm0 写入血量
exit:
```

[![注入区分敌我的代码](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b8c18b19426c511b.png)](https://ip2867.github.io/images/ce-tutorial/level9-inject-compare.png)

这里要理解 `movss [rbx+08],xmm0` 的含义：它是把 `xmm0` 里的 **新血量** 写回对象，不是扣血动作。所以：

-   我方：直接跳过这条写入，血量停在原值；
-   敌方：先把 `xmm0` 清零，再走原指令，写回去的血量就是 0，一击必杀。

### 9.4 关于 XMM 寄存器清零

`movss xmm0, 0` 是 **非法写法**——SSE 指令不能直接跟立即数。合法写法有三种：

```asm
xorps xmm0,xmm0      // 推荐：自己异或自己，结果必为 0，最快
subss xmm0,xmm0      // 单精度：自己减自己
xorpd xmm0,xmm0      // 双精度场景用这个
```

[![关于 XMM 清零的说明](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8263f13d5899d0a5.png)](https://ip2867.github.io/images/ce-tutorial/level9-xorps.png)

如果代码里是 `movss` （单精度），用 `xorps` 或 `subss` ；如果是 `movsd` （双精度），用 `xorpd` 或 `subsd` 。

### 9.5 验收

点「重启游戏并自动战斗」。两台电脑角色直接死亡，我方存活：

[![通关：敌方死亡，我方存活](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e7971f45d218410e.png)](https://ip2867.github.io/images/ce-tutorial/level9-success.png)

注意过关条件是"不冻结血量"，所以不能用锁定，必须靠代码逻辑本身区分敌我。

* * *

## 十、Tutorial Game 小游戏

九关之后还有一组小游戏，考的是把前面的方法组合起来用。

[![小游戏界面](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e9288bc95bf6621d.png)](https://ip2867.github.io/images/ce-tutorial/minigame-levels.png)

### 10.1 Step 1：打靶

规则：每 5 发子弹强制装弹，装弹时目标回血。

[![Step 1：五发一装弹](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/789f0ccb9e76c0a8.png)](https://ip2867.github.io/images/ce-tutorial/minigame1-intro.png)

两条思路：改目标血量，或者让装弹永远不触发。

**思路一：改血量。** 目标血条不显示数字，也不知道类型，只能用「未知初始值」起扫，然后按"开枪后减少 / 装弹后增加"的方向反复筛：

[![用未知初始值扫描目标血量](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0a9ed3a2dbed5825.png)](https://ip2867.github.io/images/ce-tutorial/minigame1-unknown-scan.png)

收敛后改成 `1` ，一枪带走：

[![把目标血量改成 1](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8cabeb198ef4cace.png)](https://ip2867.github.io/images/ce-tutorial/minigame1-health-modified.png)

**思路二：改弹药计数。** 界面上写着 5 发，就先搜 5，然后每开一枪筛一次。但扫到一半会发现问题：界面显示 3 的时候，候选地址里已经出现 0 了。

[![按递减方向扫描对不上](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/bf80eb7009ddf44b.png)](https://ip2867.github.io/images/ce-tutorial/minigame1-ammo-inverted.png)

这说明 **显示值和内存值不是同向的**。恢复满弹，改成从 0 开始按"增加的值"重扫，才命中真正的地址：

[![改成按递增方向扫描](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/207356f05876f489.png)](https://ip2867.github.io/images/ce-tutorial/minigame1-ammo-increment.png)

把该地址锁定在满弹对应的值上，装弹流程就永远不会触发：

[![锁定弹药计数](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b6c42f4e41d1dcab.png)](https://ip2867.github.io/images/ce-tutorial/minigame1-ammo-locked.png)

这一关的收获不是具体步骤，而是： **扫描方向错了就换个方向，别硬刚。** 显示 5 但内存是 0，这种反向映射在真实游戏里非常常见。

### 10.2 Step 2：两个精英敌人

规则：两个敌人血更厚、伤害更高，提示"敌我之间存在关联"。

[![Step 2：敌人更强，且与玩家有关联](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a77d0d2e744ad904.png)](https://ip2867.github.io/images/ce-tutorial/minigame2-intro.png)

“有关联"基本就是在说共享代码。先分别定位玩家和两个敌人的血量：

[![分别定位三个单位](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/cbe8e7421eed7f15.png)](https://ip2867.github.io/images/ce-tutorial/minigame2-three-units.png)

再核对写入指令，果然是同一条：

[![确认共享代码](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c5b9604a810d37b2.png)](https://ip2867.github.io/images/ce-tutorial/minigame2-shared-code.png)

用「分析数据」并排比较三个对象。偏移 `0x10` 处：玩家是 `0` ，两个敌人都是 `1` ：

[![偏移 0x10 区分敌我](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e416de5dc785bfd5.png)](https://ip2867.github.io/images/ce-tutorial/minigame2-compare-structure.png)

于是有了条件判断的依据。血量在 `[rax+60]` ，标志位在 `[rax+60+10]` 。

**方案一：给敌人拉满伤害。**

```asm
cmp [rax+60+10],0
je returnhere
mov edx,7FFFFFFF
originalcode:
sub [rax+60],edx
```

[![伤害拉满，一击必杀](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/94da522ffb703a31.png)](https://ip2867.github.io/images/ce-tutorial/minigame2-damage.png)

**方案二：直接把敌人血量清零。** 把伤害值设成敌人的当前血量，减完正好是 0：

```asm
cmp [rax+60+10],0
je returnhere
mov edx,[rax+60]
originalcode:
sub [rax+60],edx
```

[![伤害等于当前血量，减完归零](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b1deb78a16ca2b43.png)](https://ip2867.github.io/images/ce-tutorial/minigame2-zero-health.png)

两种方案都能过关。方案二更"干净”，不依赖极大值，也不会因为数值溢出出问题。

* * *

## 十一、总结与避坑清单

### 11.1 九关速查

| 关卡  | 主题  | 核心操作 | 跳关密码 |
| --- | --- | --- | --- |
| 1   | 附加进程 | 选对进程 | `090453` |
| 2   | 精确值扫描 | 改值 → 再筛 | `090453` |
| 3   | 未知初始值 | 未知初始值 + 减少的值 | `419482` |
| 4   | 浮点数 | 选对单/双浮点 | `890124` |
| 5   | 代码查找 | 找出写入 → NOP | `888899` |
| 6   | 一级指针 | 静态基址 + 偏移 | `098712` |
| 7   | 代码注入 | 自动汇编改写逻辑 | `013370` |
| 8   | 多级指针 | 逐层逆推 + 十六进制扫描 | `525927` |
| 9   | 共享代码 | 结构体特征 + 条件跳转 | `31337157` |

### 11.2 汇编避坑（防闪退）

1.  **不要乱改原指令。** `sub eax,eax` 能清零，但会改变标志位（ZF/PF/SF 等），影响后续条件跳转。原指令是 `mov eax,0` 就老老实实用 `mov` 。
2.  **XMM 不能直接写立即数。** `movsd xmm0,0` 会报错，用 `xorps` / `subss` / `xorpd` / `subsd` 。
3.  **保护现场。** 用了 `eax` 、 `rdx` 等寄存器后，用 `push` / `pop` 保存恢复；模板里的 `pushad` / `popad` 不要删。
4.  **确认指针非空。** 往 `[rdx+60]` 写数据前，先确认 `rdx` 不是 0，否则就是一次访问违规。

### 11.3 关于 originalcode 和 returnhere 的选择

这两个标签经常被误解成"必须选一个"。其实它们对应两种不同的意图：

| 跳转目标 | 效果  | 适用场景 |
| --- | --- | --- |
| `originalcode` | 执行被覆盖的原指令，再返回原流程 | 你只想改参数/寄存器，不想改变指令本身的效果 |
| `returnhere` | 直接跳过原指令，回到原流程的下一条 | 你要让这条指令彻底不生效 |

第九关就是典型：我方跳 `returnhere` ，直接跳过"写入血量"，所以不掉血；敌方继续走 `originalcode` ，把清零后的 `xmm0` 写回去。 **关键不是背规则，而是清楚自己跳过了什么、那条指令有没有副作用。**

### 11.4 找"访问"往往比找"写入"有用

-   「写入」只在你修改内存的瞬间触发，命中少；
-   「访问」包含读和写，能抓到大量"只是读取这个值"的代码。

多级指针的中间层、被反复读取的结构体字段，基本只能靠"访问"找。找不到写入时，先换"访问"试试。

### 11.5 几条方法论

-   **地址颜色是线索**：绿色 = 模块+偏移 = 可跨重启；黑色 = 本次运行有效。
-   **十六进制扫描是找指针的主力**：要找"谁保存了这个地址"，就用十六进制搜这个地址值。
-   **偏移顺序从内到外**：手动添加指针时，离数值最近的偏移填第一行。
-   **共享代码先找结构体差异**：队伍编号、类型标记、名字字符串，都是天然的判别条件。
-   **改完记得恢复**：NOP 和注入都是改进程内存，验证完就停用脚本，避免影响后续分析。

九关的价值不在"通关"，而在于把这几件事连成一条线： **值 → 改值的代码 → 代码依赖的指针 → 代码里的判断逻辑**。这条线走顺了，换一个真实的程序，方法是一样的。
