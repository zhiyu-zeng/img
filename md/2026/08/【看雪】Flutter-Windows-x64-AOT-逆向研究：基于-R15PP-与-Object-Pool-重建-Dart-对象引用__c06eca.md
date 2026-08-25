---
title: 【看雪】Flutter Windows x64 AOT 逆向研究：基于 R15/PP 与 Object Pool 重建 Dart 对象引用
source: https://bbs.kanxue.com/thread-292768.htm
source_host: bbs.kanxue.com
clip_date: 2026-08-25T11:44:10+08:00
trace_id: 96d59805-92dd-4087-a629-d9585040e14d
content_hash: 8adac1b4f47fa3180125938f99e109e146c1e49f998ef2a2d26d0ba3d943179c
status: synced
tags:
  - 看雪
  - Windows逆向
  - Flutter逆向
series: null
feed_source: 看雪·逆向工程
ai_summary: Flutter Windows x64 Dart AOT逆向不能依赖传统字符串Xref，需通过识别AOT Region、恢复R15/PP、解析Object Pool来重建Dart对象与代码引用。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3c775244-d011-81b9-91a1-d6a53062cc0e
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Flutter Windows x64 Dart AOT逆向不能依赖传统字符串Xref，需通过识别AOT Region、恢复R15/PP、解析Object Pool来重建Dart对象与代码引用。
> 
> - **核心问题：** Dart AOT 中对象经 Object Pool 间接访问，字符串存在运行时对象里却常无 IDA 自动 Xref，需重建 `Dart Object → Object Pool Entry → PP/R15 displacement → AOT Code` 引用链路。
> - **AOT Region 识别：** Dart AOT 代码运行时落在非 PE 模块的匿名可执行内存区域；`DartPPDumper.lua` 枚举可执行 Region、排除已加载模块、采样反汇编统计 `[r15+disp]` 直接访问来筛选候选，并排除 `lea reg,[r15+xxx]` 减少误判。
> - **PP 恢复：** 在多个不同代码地址下断读取 R15，只有多个命中地址观察到相同 R15 值才作为高可信 PP 候选，可过滤偶然命中和不稳定寄存器状态。
> - **Object Pool 解析：** 从 PP 恢复 `base=PP-1`，读取 entryCount、entry 数组和 entry_bits；entry_bits 低 4 位区分 Immediate/TaggedObject/NativeFunction 等，TaggedObject 再按最低位区分 Smi 与 Tagged Pointer，并解析 String；String CID 从运行时对象池启发式校准，不写死固定值。
> - **验证与生命周期：** 已在 Reqable（免登录使用订阅功能）和 Rive（免费导出 .riv）上验证；Rive 需先等待 Flutter 主窗口出现再扫描，Reqable 需持续监视新增 AOT Region；FIELD 对象扫描为可选启发式，默认关闭。

> 本文围绕 **Windows x64 Flutter / Dart AOT** 应用展开逆向工程研究。重点并不是某个软件的固定 Patch，而是： **如何从非模块 AOT Code Region、R15 / PP 和 Object Pool 出发，重新建立 Dart Object 与 AOT Code 之间的引用关系。**
> 
> 目前这套研究已经在两个不同场景中完成验证：
> 
> -   **Reqable**：实现了在不登录的情况下使用原本需要订阅才能使用的功能；
> -   **Rive**：实现了免费用户也能导出 `.riv` 文件。
> 
> 两个案例的 AOT Region 生命周期并不相同，因此 Runtime 侧采用了不同的扫描基础设施；而 `DartPPDumper.lua` 本身不依赖 Reqable 或 Rive 的业务逻辑，目标是逐步沉淀成一套可复用的 Dart AOT 运行时分析工具。
> 
> 文中涉及的工具和代码已整理到仓库：
> 
> **项目地址：** `https://github.com/lwtw123456/flutter-win64-re`

* * *

## 0x00 前言

Flutter 在 Android / iOS 平台上的逆向资料已经不少，但到了 Windows x64，能直接复用的资料明显更少。

这次研究过程中，我遇到的核心问题并不是“某个函数怎么 Patch”，而是更基础的一件事：

> **在 Dart AOT 环境下，传统 Native 逆向里非常依赖的“字符串 → Xref → 函数”链路经常失效。**

普通 Native 程序里，我们习惯从字符串 Xref 直接进入代码；但 Dart AOT 中，对象往往通过 Object Pool 间接访问。于是会出现一种很典型的情况：字符串明明存在于运行时对象里，IDA 却没有预期的 Code Xref。

所以这篇文章真正想解决的，是如何重新建立下面这条链路：

```
Dart Object
    │
    ▼
Object Pool Entry
    │
    ▼
PP / R15 displacement
    │
    ▼
AOT Code
```

Reqable 和 Rive 只是两个验证场景。真正希望做通用化的部分，是前面的 AOT Region 识别、PP 恢复、Object Pool 解析与对象引用反查。

* * *

## 0x01 研究目标

这项研究主要围绕几个问题展开：

1.  Flutter Windows x64 的 Dart AOT 代码实际运行在哪里；
2.  如何从进程地址空间中识别候选 AOT Code Region；
3.  x64 AOT 代码里的 `R15 / PP` 如何参与对象访问；
4.  如何从运行时恢复高可信 PP；
5.  如何解析 Object Pool 以及对应的 `entry_bits` ；
6.  如何识别 Tagged Object、Smi、String 等常见运行时对象；
7.  如何从某个 Dart Object 反推出对应的 `[r15+disp]` ；
8.  如何进一步定位引用这个对象的 AOT Code，并尽量把过程工具化。

* * *

## 0x02 Windows 下的 AOT Code Region

一开始如果按照传统 PE 分析习惯，很自然会把注意力放在：

```
main.exe
flutter_windows.dll
其他模块
```

然后继续分析这些模块里的 `.text` 。

但对于 Flutter Windows 应用，更值得关注的并不是 exe 或 Flutter Engine 相关 DLL，而是应用自身打包生成的 app.so。其中包含 Dart AOT 编译后的代码与相关运行时数据，是静态分析 Flutter 业务逻辑的重要入口。

然而，即使分析了 app.so，运行时情况仍然和传统 Native 程序不同。实际执行过程中，Dart AOT Code 会被加载到不属于已加载 PE 模块的匿名可执行内存区域中，而不是简单对应某个模块里的.text Section。

因此，静态分析阶段可以从 app.so 入手，而运行时定位阶段则需要关注进程中的 AOT Code Region。

* * *

## 0x03 为什么传统 String Xref 不够用了

接下来是整个分析中最关键的问题。

在 Native 程序里，如果我们找到一个字符串：

```
"user"
"login"
"subscription"
"premium"
```

通常会直接看 Xref。

但 Dart AOT 中经常看到这样的代码：

```
mov rax, [r15+0x1234]
```

这里并没有：

```
lea rcx, aSomeString
```

也没有一个能让 IDA 自动生成传统字符串引用的绝对地址。

更准确的访问模型是：

```text
                ┌───────────────┐
                │   AOT Code    │
                └───────┬───────┘
                        │
                 [r15 + disp]
                        │
                        ▼
                ┌───────────────┐
                │  Object Pool  │
                └───────┬───────┘
                        │
                  Tagged Value
                        │
                        ▼
                ┌───────────────┐
                │  Dart Object  │
                └───────────────┘
```

所以真正的问题不是：

> “字符串为什么没有 Xref？”

而是：

> **“代码通过哪个 Object Pool Entry 间接拿到了这个对象？”**

一旦换成这个思路，分析路径就完全不同了。

* * *

## 0x04 R15 / PP：重新建立引用关系的入口

在 Windows x64 的 Dart AOT 代码中，经常可以看到：

```
[r14+...]
[r15+...]
```

本文重点关注 `R15` 。在当前分析环境里，它可以作为恢复 PP / Object Pool 访问关系的重要入口。

后续就从运行时拿到 R15 入手。

这也是 `DartPPDumper.lua` 的核心思路。

* * *

## 0x05 DartPPDumper：先找到高可信 AOT Region

我写了一个 Cheat Engine Lua 工具：

```
DartPPDumper.lua
```

它不依赖 Reqable 或 Rive 的业务逻辑，第一阶段只做一件事：

> **从进程中的非模块可执行 Region 里，找出“最像 Dart AOT Code”的候选区域。**

当前实现会先枚举内存，排除已加载模块对应的 Allocation Base，再对候选 Region 做分散采样：

```
枚举可执行 Region
        │
        ▼
排除已加载 PE 模块
        │
        ▼
对候选 Region 分散采样
        │
        ▼
反汇编采样窗口
        │
        ▼
统计 [r15+disp] 直接引用
        │
        ▼
选择高可信候选
```

对于一个很大的 Region，没有必要从头到尾完整反汇编。脚本把有限的扫描预算分散到多个位置：

```
|-------------------------------------------------------------|
^        ^        ^        ^        ^        ^        ^       ^
scan     scan     scan     scan     scan     scan     scan    scan
```

然后重点寻找类似：

```
mov reg, [r15+xxxx]
cmp reg, [r15+xxxx]
test ...
```

这样的直接内存访问。

类似：

```
lea reg, [r15+xxxx]
```

则单独排除，尽量减少误判。

这个阶段并不尝试直接“认出对象”，而是先回答：

> **“这块可执行 Region 是否具有明显的 Dart AOT / PP 访问特征？”**

* * *

## 0x06 动态恢复 PP：不是命中一次就相信

找到 `[r15+disp]` 指令后，下一步就是动态执行。

最简单的方法当然是：

```
下断
  │
  ▼
命中
  │
  ▼
读取 R15
```

但这里我没有直接把一次命中的 `R15` 当成最终结果。

工具里做了一个很简单的“投票”确认。

假设在不同代码地址得到：

```
Breakpoint A
R15 = 0xXXXXXXXX

Breakpoint B
R15 = 0xXXXXXXXX
```

当多个不同执行地址观察到相同的 `R15` 值时，再把这个值作为高可信 PP 候选。

可以理解为：

```
Hit A ──► PP_X
            │
Hit B ──► PP_X
            │
Hit C ──► PP_X
            │
            ▼
        PP_X 可信
```

这样做主要是为了过滤：

-   偶然命中的非目标代码；
-   错误候选 Region；
-   某些寄存器状态并不稳定的情况。

> **Region 筛选负责找“像 Dart AOT 的代码”，动态断点负责确认“这个 R15 是否真能作为 PP 使用”。**

两层结合后，稳定性会比单纯静态猜测好很多。

* * *

## 0x07 从 PP 恢复 Object Pool

确认 PP 以后，就可以继续解析 Object Pool。

在当前研究环境中， `DartPPDumper.lua` 使用的关系是：

```
PP / R15
   │
   ▼
base = PP - 1
   │
   ├── entryCount  @ base + 0x08
   ├── entry[0]    @ base + 0x10
   └── entry_bits  @ entry[0] + entryCount * 8
```

第 `i` 个 Entry 地址为：

```
poolAddr = entryStart + i * 8
```

相对于 PP 的位移则是：

```
ppDisp = poolAddr - PP
```

这一步最关键的地方，是把 **Object Pool Entry 的实际地址** 重新转换成 AOT Code 里可搜索的 `[r15+disp]` 。

当前脚本还会继续解析每个 Entry 对应的 `entry_bits` ：

```toml
type     = bits & 0x0F
patch    = (bits >> 4) & 1
snapshot = (bits >> 5) & 7
```

这样就不再把 Object Pool 里的每个 8 字节值都粗暴地当成 Dart Object，而是可以先区分：

```
Immediate
TaggedObject
NativeFunction
Immediate128
...
```

这对后面的对象识别和引用图生成很重要。

* * *

## 0x08 Tagged Value、Smi 与 Object 的基础识别

如果 Object Pool Dump 最后只有一串地址：

```
0x000001XXXXXXXX
0x000001XXXXXXXX
0x000001XXXXXXXX
```

实际分析价值仍然有限。

所以脚本会先根据 `entry_bits` 判断 Entry 类型；只有 `TaggedObject` 才继续按 Dart Tagged Value 解析。

对于 Tagged Value，当前主要区分：

```
最低位 = 0
   │
   ▼
  Smi

最低位 = 1
   │
   ▼
Tagged Pointer
   │
   ▼
raw = tagged - 1
```

对于 Pointer，会继续尝试读取 Object Header，并提取：

```
Tag
CID
Size Tag
Object Size
```

String 又是一个额外的问题：不同 Dart SDK / Runtime 环境下，不应该简单依赖写死的 CID。

因此当前 `DartPPDumper.lua` 会从 Object Pool 中抽取候选 TaggedObject，结合对象长度、布局与字符串内容做启发式校准，尝试确认 OneByte / TwoByte String 的 CID。无法确认时则保守地按普通 Object 输出，而不是强行识别。

最终 Dump 的信息会更接近：

```
Smi(
    tagged = ...,
    value  = ...
)

String(
    tagged = ...,
    raw    = ...,
    CID    = ...,
    len    = ...,
    value  = "xxxx"
)

Object(
    tagged = ...,
    raw    = ...,
    CID    = ...,
    size   = ...
)
```

这里的意义并不只是“把字符串打印出来”，而是给 Object Pool Entry 增加足够的类型信息，让后面的对象反查更可靠。

* * *

## 0x09 从 Object Pool Entry 重新得到 \[r15+disp\]

有了 Object Pool Dump，最实用的信息其实不是对象地址，而是：

```
Index
Pool Address
PP Displacement
Object Type
Object Value
```

例如某个 String 出现在一个 Object Pool Entry 中：

```
Entry Index : N
Pool Addr   : 0xXXXXXXXX
PP Disp     : 0x1234
Type        : String
Value       : "example"
```

这时就可以回到 AOT Code 中搜索：

```
[r15+0x1234]
```

至此，反查链路真正闭合：

```
Dart Object
    │
    ▼
Object Pool Entry
    │
    ▼
PP Disp
    │
    ▼
[r15+disp]
    │
    ▼
AOT Code
```

这比在 IDA 里等待自动 Xref 更直接，实际输出结果类似：

```objectivec
[06700] +0x00D160 [r15+0xD16F] 0x000001AD3BD0D1F0 0x11   TaggedObject     NotPatchable  Snapshotable                    String[OneByte](tagged=0x000001AD388F8C61 raw=0x000001AD388F8C60 CID=0x5E len=21 "Export your Rive file")
[06701] +0x00D168 [r15+0xD177] 0x000001AD3BD0D1F8 0x11   TaggedObject     NotPatchable  Snapshotable                    String[OneByte](tagged=0x000001AD387DB821 raw=0x000001AD387DB820 CID=0x5E len=22 "runtime_upgrade_button")
[06702] +0x00D170 [r15+0xD17F] 0x000001AD3BD0D200 0x11   TaggedObject     NotPatchable  Snapshotable                    String[OneByte](tagged=0x000001AD3872DF61 raw=0x000001AD3872DF60 CID=0x5E len=17 "Upgrade to export")
[06703] +0x00D178 [r15+0xD187] 0x000001AD3BD0D208 0x11   TaggedObject     NotPatchable  Snapshotable                    String[OneByte](tagged=0x000001AD387AC801 raw=0x000001AD387AC800 CID=0x5E len=21 "community_join_button")
[06704] +0x00D180 [r15+0xD18F] 0x000001AD3BD0D210 0x11   TaggedObject     NotPatchable  Snapshotable                    String[OneByte](tagged=0x000001AD38972ED1 raw=0x000001AD38972ED0 CID=0x5E len=27 "Join the Community for help")
[06705] +0x00D188 [r15+0xD197] 0x000001AD3BD0D218 0x11   TaggedObject     NotPatchable  Snapshotable                    String[OneByte](tagged=0x000001AD389106E1 raw=0x000001AD389106E0 CID=0x5E len=17 "demo_files_button")
[06706] +0x00D190 [r15+0xD19F] 0x000001AD3BD0D220 0x11   TaggedObject     NotPatchable  Snapshotable                    String[OneByte](tagged=0x000001AD389CC1E1 raw=0x000001AD389CC1E0 CID=0x5E len=20 "Test with demo files")
[06707] +0x00D198 [r15+0xD1A7] 0x000001AD3BD0D228 0x11   TaggedObject     NotPatchable  Snapshotable                    String[OneByte](tagged=0x000001AD389A04C1 raw=0x000001AD389A04C0 CID=0x5E len=33 "runtime_modal_skip_checkbox_label")
[06708] +0x00D1A0 [r15+0xD1AF] 0x000001AD3BD0D230 0x11   TaggedObject     NotPatchable  Snapshotable                    String[OneByte](tagged=0x000001AD388EBA51 raw=0x000001AD388EBA50 CID=0x5E len=25 "Skip this modal next time")
[06709] +0x00D1A8 [r15+0xD1B7] 0x000001AD3BD0D238 0x11   TaggedObject     NotPatchable  Snapshotable                    String[OneByte](tagged=0x000001AD387E1D71 raw=0x000001AD387E1D70 CID=0x5E len=24 "upgrade_modal_free_title")
```

* * *

## 0x0A 直接引用还不够：可选的对象字段扫描

实际分析时，并不是所有目标对象都会直接出现在 Object Pool Entry 里。

有时关系会变成：

```
Object Pool
    │
    ▼
Parent Object
    │
    ▼
field + 0xXX
    │
    ▼
Target Object
```

也就是说，Object Pool 保存的是父对象，而真正感兴趣的对象只是它的某个字段。

`DartPPDumper.lua` 因此保留了一层可选的对象字段扫描：

```
遍历 TaggedObject Entry
        │
        ▼
解析 Parent Object
        │
        ▼
扫描对象字段
        │
        ▼
记录可能的 Child Object
```

引用关系最终可以分成：

```
[DIRECT]

Object Pool Entry
      │
      ▼
Target Object
```

以及：

```
[FIELD]

Object Pool Entry
      │
      ▼
Parent Object
      │
      ▼
field + 0xXX
      │
      ▼
Target Object
```

不过 FIELD 扫描本质上带有启发式成分，容易产生噪声，所以当前脚本默认关闭，只在需要进一步追踪对象关系时手动启用。

* * *

## 0x0B DartPPDumper 整体流程

把当前脚本的主流程整理一下：

```
┌────────────────────────────┐
│ 枚举进程 Memory Region     │
└──────────────┬─────────────┘
               │
               ▼
┌────────────────────────────┐
│ 排除已加载 PE 模块         │
└──────────────┬─────────────┘
               │
               ▼
┌────────────────────────────┐
│ 采样反汇编，寻找 R15 引用  │
└──────────────┬─────────────┘
               │
               ▼
┌────────────────────────────┐
│ 在多个代码地址布置断点     │
└──────────────┬─────────────┘
               │
               ▼
┌────────────────────────────┐
│ 多命中地址投票确认 PP      │
└──────────────┬─────────────┘
               │
               ▼
┌────────────────────────────┐
│ Dump Object Pool           │
│ + decode entry_bits        │
└──────────────┬─────────────┘
               │
               ▼
┌────────────────────────────┐
│ Smi / Object / String 识别 │
│ + String CID 校准          │
└──────────────┬─────────────┘
               │
               ▼
┌────────────────────────────┐
│ DIRECT / 可选 FIELD 反查   │
└──────────────┬─────────────┘
               │
               ▼
┌────────────────────────────┐
│ 重新定位目标 AOT Code      │
└────────────────────────────┘
```

这套流程的目标不是针对某一个客户端自动找 Patch，而是把原本需要大量手工完成的 **AOT Region → PP → Object Pool → Dart Object → AOT Code** 这条分析链路尽量工具化。

* * *

## 0x0C Runtime 侧：两个不同生命周期的验证案例

除了 `DartPPDumper.lua` ，仓库里还有两套 Windows x64 Runtime 验证代码。

两边都通过 `version.dll` Proxy 进入目标进程，并使用 Pattern Scan + Runtime Patch 验证前面定位到的代码路径；但由于 AOT Code Region 的生命周期不同，基础设施并不一样。

### RiveHack

Rive 的问题是：

> **`version.dll` 加载时，目标 Dart AOT Code Region 还没有出现。**

所以需要先等待 Rive 的 Flutter 主窗口：

```
FindWindowW(
    L"FLUTTER_RUNNER_WIN32_WINDOW",
    L"Rive"
)
```

窗口出现后，再由 Rive 版 `MemoryKit` ：

1.  枚举已加载 PE 模块范围；
2.  扫描不与这些模块重叠的可执行 Region；
3.  定位 Pattern；
4.  通过固定 Offset 找到验证位置；
5.  完成 Runtime Patch。

### ReqableHack

Reqable 的问题是：

> **创建新的 Reqable 窗口后，还会出现新的 AOT Code Region。**

因此它不能只在进程启动时扫描一次。

当前流程是：

```
version.dll Proxy
        │
        ▼
   Worker Thread
        │
        ▼
    MemMonitor
        │
        ▼
持续发现新的候选 Region
        │
        ▼
Region 内 Pattern Scan
        │
        ▼
 Runtime Verification
```

`MemMonitor` 通过 `VirtualQuery` 持续枚举地址空间，并维护已经处理过的 Region 集合；新 Region 出现时才交给 Reqable 版 `MemoryKit` 做 **指定 Region 内** 的 Pattern Scan 和 Patch。

* * *

## 0x0D 我认为这项研究里比较有价值的几个点

### 1\. 不要只把 Flutter Windows AOT 当普通 PE 分析

目标 AOT Code 可以出现在不属于已加载 PE 模块的可执行内存区域中，PE Section 并不是唯一分析入口。

### 2\. IDA 自动 Xref 不是 Dart AOT 对象引用的完整视图

Dart Object 经常通过 Object Pool 间接访问，因此“没有 String Xref”并不等于“没有代码使用这个对象”。

### 3\. R15 / PP 是恢复对象引用关系的重要锚点

运行时确认 PP 后，就有了连接 Object Pool Entry 与 AOT Code `[r15+disp]` 的基准，这也是后续 `Object -> Code` 反查能够成立的关键。

### 4\. Object Pool 不能只按“8 字节数组”粗暴处理

当前脚本进一步解析 `entry_bits` ，区分 TaggedObject、Immediate、NativeFunction 等 EntryType，再对 TaggedObject 做对象解析，可以明显减少误判。

### 5\. 工具想做通用，尽量少依赖写死的 Runtime 信息

例如 String CID，当前实现不是直接绑定某个样本里的固定值，而是尝试从运行时 Object Pool 中做启发式校准。即使校准失败，也选择保守输出，而不是制造一个看似正确的结果。

### 6\. Runtime 基础设施也需要适配程序生命周期

Reqable 需要持续监测后续新增的 AOT Code Region；Rive 只需要解决 `version.dll` 加载早于目标 Region 出现的问题。两者说明“如何找到 AOT Region”不能简单套一个固定时序。

### 7\. 静态、动态和 Runtime Object Layout 最好结合

三者各自解决的问题不同：

```
Static    -> 指令模式 / Region 特征 / disp 搜索
Dynamic   -> R15 / PP / Breakpoint / Object 实例
Runtime   -> Object Pool / entry_bits / Tagged Value
```

结合起来后，才能比较完整地恢复 Dart Object 与 AOT Code 之间的关系。

* * *

## 0x0E 总结

这项研究最终想验证的，并不是某个版本下的固定地址、固定 Pattern 或固定 Patch，而是一条更有复用价值的分析路径：

```
AOT Code Region
      │
      ▼
R15 / PP
      │
      ▼
Object Pool + entry_bits
      │
      ▼
Dart Object
      │
      ▼
PP displacement
      │
      ▼
AOT Code
```

Reqable 和 Rive 两个案例分别验证了这套思路在不同 AOT Region 生命周期和 Flutter 版本下如何落地；而 `DartPPDumper.lua` 则是在尝试把这条链路里最重复、最适合自动化的部分抽出来，逐步做成一个更通用的 Dart AOT 运行时分析工具。

目前实现仍然偏研究型。不同 Dart SDK 版本下的 Object Layout、CID 识别、更多对象类型解析，以及 FIELD 引用关系的准确性，都还有继续完善的空间。

如果各位师傅之前也研究过 Flutter Windows、Dart AOT、Object Pool、PP / R15 或 Dart VM Object Layout，欢迎交流；如果文中对 Dart Runtime 内部结构的理解存在错误，也欢迎指正。

[#调试逆向](https://bbs.kanxue.com/forum-4-1-1.htm) [#问题讨论](https://bbs.kanxue.com/forum-4-1-197.htm)
