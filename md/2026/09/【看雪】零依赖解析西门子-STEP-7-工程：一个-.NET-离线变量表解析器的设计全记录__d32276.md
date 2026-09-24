---
title: 【看雪】零依赖解析西门子 STEP 7 工程：一个 .NET 离线变量表解析器的设计全记录
source: https://bbs.kanxue.com/thread-293038.htm
source_host: bbs.kanxue.com
clip_date: 2026-09-24T17:10:34+08:00
trace_id: a716c700-30b0-4035-b1f2-81d23d3350ce
content_hash: f740d9b2abe5603445e6e8008aeb791fd33913908a930b1e27a5032b9e5d765c
status: synced
tags:
  - 看雪
  - 协议分析
  - 开发工具
series: null
feed_source: 看雪·逆向工程
ai_summary: 离线解析西门子 `.s7p` 工程的零依赖 .NET 库：逆向其目录结构与 DBF/MC5 格式，按 STEP 7 对齐规则位级算出地址，对外输出可直接喂给 s7netplus 的点号通讯地址。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3e575244-d011-81e4-adbc-ea46ea8db5b8
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 离线解析西门子 `.s7p` 工程的零依赖 .NET 库：逆向其目录结构与 DBF/MC5 格式，按 STEP 7 对齐规则位级算出地址，对外输出可直接喂给 s7netplus 的点号通讯地址。
> 
> - **格式发现：** `.s7p` 只是约 110 字节描述文件；数据在同级目录，靠 `hrs\S7RESOFF.DBF` → `linkhrs.lnk`（两套 ID）→ `YDBs\{id}\SYMLIST.DBF` 与 `ombstx\offline\{id}\SUBBLK.DBF` 的发现链串联，DBF 为 dBase III 变体，长文本存 `.DBT` memo（数据在 `n*512` 偏移，头为 `FF FF 08 00`）。
> - **中文乱码：** 文本一律按建工程机器的 ANSI 代码页（中文为 GBK/936）存储，DBF 语言字节恒为 0 无法自检测，故与 STEP 7 一致改用 `Encoding.Default` 解码。
> - **位级地址：** MC5 代码中无地址，需用贯穿解析的位计数器配合对齐规则推算，如 INT 对齐 16 位使 `BOOL1` 后的 `INT1` 落在 `DBW2`。
> - **数组展开：** 每个元素输出为带独立地址的叶子节点，STRING 数组元素各对齐 2 字节；多维 BOOL 数组仅最后一维按位打包、其余每行另起字节边界，故维度顺序影响内存占用；另设 6 维与元素数量上限安全阀。
> - **对外接口：** 只输出 s7netplus 点号语法通讯绝对地址（`DB1.DBX8.0`、`MW2`、`T5`），STEP 7 符号表地址降级为内部格式；结果对象与 S7CommPlusDriver 对齐，构建环境为 .NET Framework 4.0 + C# 4.0、零第三方依赖，附控制台与 WinForms 演示。

> 摘要：STEP 7 工程（`.s7p` ）是西门子 PLC 项目的容器。本文完整记录一个  
> **离线文件解析器** 的实现思路：从逆向 `.s7p` 的目录布局与 DBF/MC5 二进制格式开始，  
> 到解决中文乱码、按 STEP 7 编译器规则做位级地址计算、把数组展开为带独立地址的  
> 树形节点，最后对外输出可直接用于通讯的"通讯绝对地址"（s7netplus 点号语法）。  
> 整个库基于.NET Framework 4.0、C# 4.0 语法，零第三方依赖，输出结果对象与  
> S7CommPlusDriver 对齐。附带控制台与 WinForms 两个演示程序。

* * *

## 一、背景：为什么要离线解析 STEP 7 工程

在 PLC 上位机 / SCADA / 通讯网关等场景中，程序经常需要知道 PLC 里有哪些变量：  
符号名是什么、地址在哪、类型多大——例如用 s7netplus 这类库读写变量时，地址参数  
（ `DB1.DBW8` 、 `MW2` ）只能靠人工从 STEP 7 软件里抄。

理想情况是 **直接读取 STEP 7 工程文件**，自动导出变量表：

-   不需要安装 STEP 7 / TIA Portal，也不需要 PLC 在线；
-   可用于工程文档自动生成、变量审计、上位机与通讯库的符号表对接；
-   解析结果是静态数据，天然适合离线场景（导出、比对、批量处理）。

本项目要解决的问题是：`.s7p` 是西门子的私有格式，没有任何官方文档。所以第一步  
工作是 **逆向**。

先说清楚 **边界**：本库是一个 **文件解析器**——输入工程路径，输出解析结果。  
不实现任何读写变量值 / 修改运行状态等通讯功能（那是通讯库的职责，地址格式上  
我们已经预留好了对接点，见第六节）。

* * *

## 二、逆向：一个.s7p 工程里到底有什么

`.s7p` 文件本身只是一段约 110 字节的 **描述文件**，真正的数据分布在其同级目录中。  
以经典的 S7-300/400 工程为例，目录结构如下：

```python
STEP7Sample1/
├── Sample1.s7p              ← 约 110 字节的描述文件
├── hrs/
│   ├── S7RESOFF.DBF         ← 设备清单（CPU 型号/订货号/固件/站点/槽位…）
│   └── linkhrs.lnk          ← 符号表 / 子块列表 ID 关联表
├── hOmSave7/
│   └── ...                  ← 站点 → 设备 发现链
├── YDBs/
│   ├── SYMLISTS.DBF         ← 符号表清单
│   └── {id}/SYMLIST.DBF     ← 每个设备自己的符号表（I/M/Q 区符号）
└── ombstx/offline/
    ├── BSTCNTOF.DBF         ← 块计数器
    └── {id:8-hex}/SUBBLK.DBF ← DB / UDT / FB 块的 MC5 结构代码
```

核心发现链可以概括为：

```python
hrs\S7RESOFF.DBF  ──设备──▶ linkhrs.lnk ──ID──▶ YDBs\{id}\SYMLIST.DBF  （区域符号）
                                   │
                                   └──▶ ombstx\offline\{id}\SUBBLK.DBF （DB 块 MC5 代码）
```

三个关键技术点：

**1\. DBF 是 dBase III 的变体。** 文件首字节 `0x03` ，记录数在偏移 4（LE uint32），  
头长度在偏移 8、记录长度在偏移 10（LE uint16），字段描述符从偏移 32 开始、每个  
32 字节、以 `0x0D` 结束。字符字段右填充空格。STEP 7 还在旁边放了一个 `.DBT`  
memo 文件存放长文本（块注释、变量注释），其块布局也很有个性：块号 `n` 位于文件  
偏移 `n*512` ，内容 = `FF FF 08 00` 标记 + 4 字节长度 + 文本。

**2\. 设备的"符号表 ID"与"子块列表 ID"是两套 ID。** 设备记录里只给出数字 ID，  
需要到 `linkhrs.lnk` 里把两个 ID 分别关联到 `YDBs` 与 `ombstx` 下的实际目录。  
这是多设备工程（一个.s7p 里多个 PLC 站）能正确区分的根基。

**3\. 块内容不是普通的二进制记录，而是一段类 SCL 的结构代码文本（MC5）。**  
形如：

```python
STRUCT
  BOOL1 : BOOL ;
  INT1 : INT ;
  SAMPLE_ARRAY : ARRAY [1..5] OF INT ;
  UDT_INST : UDT 1 ;
END_STRUCT
```

变量表就藏在这里面，但 **地址不在**——需要自己按 STEP 7 编译器的布局规则算出来。  
这是整个解析器最难也最有意思的部分（第四节）。

* * *

## 三、第一只拦路虎：中文乱码

STEP 7 工程中的所有文本（DBF 字符字段、MC5 代码里的注释）都用 **创建工程那台  
机器的 ANSI 代码页** 存储：中文 Windows 上是 GBK（代码页 936），西文 Windows 上  
是 Windows-1252。更糟的是 DBF 头里本可以指示语言的"语言驱动"字节 **恒为 0**，  
即文件本身没有携带任何编码信息。

解法出奇地简单—— **跟 STEP 7 自己保持一致**：STEP 7 打开工程时就是用本机 ANSI  
代码页解码的，所以我们也用 `Encoding.Default` （.NET Framework 4.0 下即系统 ANSI  
代码页）。中文机器上打开中文工程，注释、符号名全部正常显示；西文工程按西文  
代码页解码，行为与 STEP 7 完全一致。

```csharp
// AnsiText.Decode：按系统 ANSI 代码页解码
return AnsiEncoding.GetString(bytes, 0, bytes.Length);
```

代价是要承认一个限制：编码无法从文件本身自动检测，跨语言环境（中文机器开西文  
工程）的表现与 STEP 7 相同——这不是 bug，是格式本身没有提供检测依据。

* * *

## 四、核心：MC5 结构代码解析与位级地址计算

### 4.1 结构代码的词法 / 语法

解析器做了一个很小的 token 流 + 递归下降：

-   token 规则：跳过空白与行注释； `stopChars` （如 `:`、`;`、 `{` 、 `}` ）中的单字符  
    作为独立 token；其余取连续非空白单词；
-   结构段： `VAR_INPUT` / `VAR_OUTPUT` / `VAR_IN_OUT` / `VAR` / `STRUCT` ，  
    遇到 `VAR_TEMP` 停止（临时变量不参与静态地址分配）；
-   变量形如 `名字 : 类型 ;`，也支持 `名字 {属性列表} : 类型 ;`——属性列表的内容  
    与地址无关，直接跳到右花括号丢弃；
-   `STRUCT` / `UDT n` 实例递归展开，成员继续参与地址计算。

### 4.2 位计数器：地址是"算"出来的

MC5 代码里没有地址，STEP 7 在编译时按下表做 **位级布局**。解析器维护一个贯穿  
整个 DB 解析过程的 **位计数器** （bit counter），每声明一个变量就按类型推进：

| 类型  | 对齐（位） | 大小（位） |
| --- | --- | --- |
| BOOL | 无（按位连续） | 1   |
| BYTE / CHAR | 8   | 8   |
| INT / WORD / DATE / S5TIME 等 | 16  | 16  |
| DINT / DWORD / REAL / TIME 等 | 16  | 32  |
| POINTER | 16  | 48  |
| DATE_AND_TIME | 16  | 64  |
| ANY | 16  | 80  |
| STRING \[n\] | 16  | (2+n)×8 |

一个 `STRUCT` 段从字节边界开始，变量依次"对齐 → 占位 → 计数器推进"。例如：

```csharp
// S7DataType.AlignUp：把位计数器向上对齐到 alignmentBits 的整数倍
public static int AlignUp(int bitCounter, int alignmentBits)
{
    if (alignmentBits <= 1) return bitCounter;
    int mask = alignmentBits - 1;
    return (bitCounter + mask) & ~mask;
}
```

于是 `BOOL1 : BOOL` 后跟 `INT1 : INT` 会落在字节 2（ `DB1.DBW2` ）而不是字节 1——  
因为 INT 要对齐到 16 位。这套规则与 STEP 7 编译器的实际分配结果完全一致，  
后面所有数组/结构的地址都建立在这个计数器之上。

### 4.3 数组展开：每个元素都是带独立地址的节点

需求是 **数组展开**： `ARRAY [1..5] OF INT` 不输出一行汇总，而是输出 5 个元素，  
各自拥有独立地址。规则：

-   数组起始地址先对齐到 2 字节边界；
-   元素地址 = 对齐后的基址 + 下标 × 元素大小；
-   基本类型元素直接展开为叶子节点；STRUCT / UDT 元素每个都重新解析一遍  
    （元素大小由该类型自身的布局自然决定）；
-   **STRING 数组** 的每个元素各自对齐 2 字节（ `STRING[3]` 的步长是 6 字节而非 5）；
-   **多维 BOOL 数组** 有一条特殊规则：最后一维按位连续打包，其余每一"行"从新的  
    字节边界开始。所以 `ARRAY[1..2, 1..8] OF BOOL` 共占 2 字节，而  
    `ARRAY[1..8, 1..2] OF BOOL` 共占 8 字节——维度的顺序直接影响内存占用。

UDT 实例是一个很好的综合例子： `UDT 1 = BOOL + INT + REAL` 共占 8 字节，  
那么 `ARRAY [1..5] OF UDT 1` 的 5 个元素分别位于 36.0 / 44.0 / 52.0 / 60.0 / 68.0。

展开算法还有安全阀：数组维度上限 6 维、元素数量上限校验，避免恶意或损坏的  
工程文件把解析器拖死。

### 4.4 树形输出

与"扁平列表"不同，输出是 工程 → 设备 → 块 → 变量 的 **树**：

```python
DB1
├── [STRUCT]                    ← 结构类型段容器节点
│   ├── BOOL1 : BOOL            ← 叶子
│   ├── SAMPLE_ARRAY : ARRAY [1..5] OF INT
│   │   ├── SAMPLE_ARRAY[1] : INT    ← 数组节点下有带下标的元素节点
│   │   └── ... [2]..[5]
│   └── UDT_INST : UDT 1
│       ├── B1 : BOOL
│       ├── I1 : INT
│       └── R1 : REAL
└── [VAR]
    └── ...
```

结构类型段（STRUCT / VAR / In / Out / InOut）作为容器节点保留，让树的层次与  
源工程一致；数组节点本身是容器，元素是它的孩子。

* * *

## 五、三种地址，只对外输出一种

动手之前先厘清三个容易混淆的概念——这也是本项目设计上最大的一个坑：

| 地址形式 | 示例  | 出处  | 用途  |
| --- | --- | --- | --- |
| STEP 7 符号表地址 | `DB1:8.0` 、 `MD4` 、 `EW2` | STEP 7 符号表 | 仅内部格式 |
| 博途十六进制访问 ID | `8A0E0001.A` | S7CommPlusDriver | **禁用** （易混淆） |
| 通讯绝对地址 | `DB1.DBX8.0` 、 `MW2` 、 `T5` | s7netplus 点号语法 | **对外输出** |

真实通讯库（如 s7netplus）读写变量用的是 **结构化地址参数**：存储区 + DB 号 +  
起始字节 + 位，以点号语法表达。所以解析器在 **内部就按软数据类型格式化好** 通讯  
绝对地址，调用者拿到的地址串可以直接喂给通讯库：

| 软数据类型 | 输出  | 示例  |
| --- | --- | --- |
| BOOL | `DB{n}.DBX{字节}.{位}` / `M{字节}.{位}` | `DB1.DBX8.0` 、 `M2.3` |
| BYTE / CHAR / USINT / SINT | `DB{n}.DBB{字节}` / `MB{字节}` | `DB1.DBB8` |
| WORD / INT / UINT / DATE / S5TIME | `DB{n}.DBW{字节}` / `MW{字节}` | `DB1.DBW8` |
| DWORD / DINT / UDINT / REAL / TIME | `DB{n}.DBD{字节}` / `MD{字节}` | `DB1.DBD8` |
| 定时器 / 计数器 | `T{编号}` / `Z{编号}` | `T5` 、 `Z3` |

注意宽度字母来自 **软数据类型** （ `MW` 表示 WORD 宽度的 M 区），而不是地址串本身——  
所以 `ItemAddress.SetSoftdatatype(uint)` 一设置类型， `GetAccessString()` 立刻返回  
格式化好的通讯绝对地址。STEP 7 符号表地址降级为内部格式，仅经  
`ItemAddress.AbsoluteAddress` / `PlcVariableNode.Address` 可查。

* * *

## 六、API 设计：输出对象与 S7CommPlusDriver 对齐

入口类只有一个： `S7Project` （ `S7ProjectParser` 命名空间）。打开、取结果、关闭，  
三步走：

```csharp
using S7ProjectParser;

var project = new S7Project();

// 打开（参数是 .s7p 文件或工程目录）
int rc = project.Open(@"D:\...\STEP7Sample1\test");
if (rc != 0) Console.WriteLine(S7Project.ErrorText(rc));   // 中文文案

// 浏览：活动设备的全部叶子条目（与驱动 Browse 语义一致）
List<VarInfo> vars;
rc = project.Browse(out vars);
// vars[i].Name           = "DB1.SAMPLE_ARRAY[3]"（完整符号路径，数组元素带下标）
// vars[i].AccessSequence = "DB1.DBW14"（通讯绝对地址）
// vars[i].Softdatatype   = 5（软数据类型）
// vars[i].NonOptAddress / NonOptBitoffset = 块内字节/位偏移
// vars[i].OptAddress     = 0（经典 STEP 7 工程没有优化访问，恒为 0）

project.Close();
```

设计上刻意与 S7CommPlusDriver **对齐** （尽管两者一个离线一个在线）：

-   **Browse 语义一致**：递归到叶子（ `Childs.Count == 0` ），空列表跳过、不支持的  
    软数据类型跳过；Name 为完整符号路径，数组元素加 `[i]` ；
-   **输出对象形状一致**： `VarInfo` （Name / AccessSequence / Softdatatype /  
    OptAddress / OptBitoffset / NonOptAddress / NonOptBitoffset）、 `PObject`  
    （VarnameList / VartypeList / OffsetInfoType）、 `DatablockInfo` ；
-   **relId 约定一致**：数据块 relId = 块号 + `0x8A0E0000` ；符号区域固定 relId  
    （Inputs= `0x90010000` 、Outputs= `0x90020000` 、Merker= `0x90030000` 、  
    S7Timers= `0x90050000` 、S7Counters= `0x90060000` ）；结构/UDT 实例经  
    `OffsetInfoType` 的 RelationId 指向子类型信息（本库从 `0x90070000` 起分配，  
    由 `getTypeInfoByRelId` 懒加载）；
-   唯一的分歧点：驱动的 `AccessSequence` 是博途十六进制访问 ID，本库按用户要求  
    输出通讯绝对地址（见第五节）。

主要接口一览：

| 接口  | 作用  |
| --- | --- |
| `Open(path)` / `Close()` / `IsOpen` | 打开 / 关闭工程 |
| `Browse(out List<VarInfo>)` | 活动设备的全部叶子条目（一次取全） |
| `GetDevices()` / `BrowseDevice(dev, out vars)` | 多设备：先取设备信息，再按设备取各自变量 |
| `GetDeviceCount()` / `GetDeviceName(i)` / `SetActiveDevice(i)` | 设备切换（下标从 0 开始） |
| `GetListOfDatablocks(out blocks)` | 数据块列表 |
| `getTypeInfoByRelId(relId)` | 按 relId 取类型信息 |
| `GetTypeInformation(relId, out objects)` | 沿 RelationId 递归展开结构成员类型信息 |
| `GetCommentsXml(relId, out lc, out dc)` | 注释 XML（离线输出最小空结构） |
| `ErrorText(int)` | 错误码中文文案 |

错误码是简单的自有体系：0=成功、1=参数无效、2=工程未打开、3=工程已打开、  
4=打开工程失败、5=未找到、6=内部错误。

" **真懒加载** "与" **一次取全部叶子** "并不矛盾，两者互补：

-   `Browse` 一次性返回活动设备的 **全部叶子条目** （数组元素逐个、结构成员递归、  
    段容器展平、区域符号带 `MArea.` 等前缀）——上位机做符号表对接时一次拿全；
-   GUI 变量树则是真正的 **按需加载**：展开节点时才经 `getTypeInfoByRelId` 读取  
    该节点的类型信息（显示 "Loading..." 占位），不展开不解析——大工程也能秒开。

多设备工程（一个.s7p 含多个 PLC 站）的用法：

```csharp
foreach (PlcDevice dev in project.GetDevices())
{
    string cpu = dev.CpuName + " / " + dev.CpuMlfb + " / " + dev.CpuFirmware;
    // 例如 "CPU 315-2 DP / 6ES7 315-2AH14-0AB0 / V3.3"，还有 StationName、Slot
    List<VarInfo> deviceVars;
    project.BrowseDevice(dev, out deviceVars);   // 该设备自己的全部叶子
}
```

设备按 `linkhrs` 里的 ID 关联， **重名站点也不会互相串变量**。

* * *

## 七、两个演示程序

**控制台 `S7ProjectParser.Console`** 的调用序列与参考驱动的 DriverTest 一致  
（去掉通讯部分）： `Open → Browse → 打印变量表 → Close` 。对中文样例工程  
（STEP7Sample1，默认活动设备为第一个设备）的真实输出：

```python
Main - Open 完成
Main - Starte Browse...
Main - Browse res=0
====================== VARIABLENHAUSHALT ======================
SYMBOLIC-NAME/ACCESS-SEQUENCE/TYP
DB1.BOOL1        / DB1.DBX0.0               / Bool
DB1.INT1         / DB1.DBW2                 / Int
DB1.FLOAT1       / DB1.DBD4                 / Real
DB2.BOOL1        / DB2.DBX0.0               / Bool
DB2.INT1         / DB2.DBW2                 / Int
DB2.FLOAT1       / DB2.DBD4                 / Real
MArea.PLC1_FLOAT1 / MD4                      / DWord
MArea.PLC1_INT1  / MW2                      / Word
MArea.PLC1_BOOL1 / M0.0                     / Bool
===============================================================
Main - ENDE
```

第二个设备（ `SetActiveDevice(1)` ）则有 45 个叶子——包含  
`DB1.SAMPLE_ARRAY[3]` → `DB1.DBW14` 、UDT 数组、结构成员等完整展开。

**WinForms GUI `S7ProjectExplorer`** 是一个变量树浏览器：左边打开工程，右边  
选中节点后显示符号路径、数据类型与通讯绝对地址，支持"查找"定位符号；下方  
变量树带类型图标、按块/结构/数组/叶子着色。它复用按需加载 + 全量 Browse 两套  
接口，是 API 的活文档。

* * *

## 八、工程约束与验证

一些有意思的工程化细节：

-   **.NET Framework 4.0 + C# 4.0 语法** （无字符串插值 / `?.` / `nameof` ），  
    旧式 csproj、MSBuild 15.0（VS2017）构建， **零第三方依赖**——目标环境往往是  
    老旧的工控机；
-   输出相关结果对象全部对齐驱动，但 **不提供通讯接口**：文件解析器只负责把  
    工程变成数据；
-   健壮性优先：缺失的符号表 / 子块列表目录不中断解析，只记录警告并跳过；
-   测试用两个真实样例工程：STEP7Sample1（中文 Windows 创建，GBK 编码——编码  
    修复的试金石）与 STEP7Sample2（德文、多设备——设备隔离与多语言验证）；
-   接口冒烟测试 `api_smoke.ps1` 用 PowerShell 反射加载 dll，覆盖 Open/Close、  
    设备切换、数据块列表、类型信息、Browse、通讯地址格式化用例表（  
    `DB1:8.0` + BOOL → `DB1.DBX8.0` 、 `MD4` → `MD4` 、 `T5` → `T5` 等 13 组）、  
    错误码与未打开路径。

已知限制也如实记录：

-   编码无法自检测，始终按本机 ANSI 代码页解码（与 STEP 7 行为一致）；
-   数组展开会显著增加节点数量（20 个 BYTE 的数组 = 20 个叶子节点），这是展开  
    算法的预期行为，如需扁平汇总需另行处理。

* * *

## 九、结语

解析一个私有二进制格式的乐趣在于：没有文档，但文件 **结构会说话**——dBase III  
的头字段、memo 块的偏移规律、linkhrs 里的 ID 关联、MC5 代码里的对齐规则，  
拼起来就是完整的图景。整个库最终只有约十个源文件、零第三方依赖，却能稳定地  
把 STEP 7 工程变成一棵带完整地址信息的变量树，并输出可直接对接通讯库的地址串。

如果您的场景是"读工程文件、导出变量表、对接通讯库"，这套思路可以直接复用；  
如果您只需要现成的库，代码与两个样例工程就在本目录下。
