---
title: "【看雪】Hypervisor : Intel VT 平台 DMA和VT-D对抗"
source: https://bbs.kanxue.com/thread-293258.htm
source_host: bbs.kanxue.com
clip_date: 2026-10-17T21:14:41+08:00
trace_id: 19f56dfa-666b-4145-9125-979e3ff0c856
content_hash: 4b32caf30a46bb7f028e4c6791932b9949a8d9aedac3768587cc46e2cb072969
status: synced
tags:
  - 看雪
  - 硬件逆向
  - 虚拟化安全
series: null
feed_source: 看雪·逆向工程
ai_summary: "**TL;DR：** 在 UEFI 阶段加载的 Type-1 Hypervisor 借助 VT-d 重映射与 EPT 拦截，阻断 PCILeech 类硬件对物理内存的直接读写。"
ai_summary_style: key-points
images_status:
  total: 13
  succeeded: 13
  failed_urls: []
notion_page_id: 3fc75244-d011-81a5-800d-e8b3112a58a2
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> **TL;DR：** 在 UEFI 阶段加载的 Type-1 Hypervisor 借助 VT-d 重映射与 EPT 拦截，阻断 PCILeech 类硬件对物理内存的直接读写。
> 
> - **攻击前提：** DMA 允许网卡、存储控制器等设备直接读写为它们准备的缓冲区；PCILeech 正是利用这一点直接读写物理内存并获取数据。
> - **旧时代对抗的局限：** CR3Fix（2024 年 10 月 EasyAntiCheat 采用的方案）通过混淆 CR3，并在需要执行时回调、在异常时回填；HAL HOOK 则劫持 HAL 内部的回调全局变量来接管异常。这两种方案都停留在 Ring 0 层。
> - **VT-d 三步防护：** 先记录 Hypervisor 映像与数据池占用的物理范围；普通内存保持原地址映射，受保护范围映射到用 0xFF 填充的替代页并设为只读；读取时设备拿到替代页内容，写入时被硬件以权限不足阻止。
> - **定位寄存器：** DMAR 表由 BIOS/UEFI 按平台信息以 ACPI 表形式建立，EDK2 的 `EfiLocateFirstAcpiTable()` 可直接取得；再遍历 DRHD 子结构读取 `RegisterBaseAddress` 得到 VT-d 寄存器物理基址。一个 VT-d 单元可绑定多个 DMA 设备分组管理，建议上限为 4。
> - **使能与拦截：** 通过 MMIO 写 RTADDR（0x20）放根表地址、GCMD（0x18）发 SRTP/TE 命令、GSTS（0x1C）确认状态；Legacy 模式按根表→上下文表→DMA 页表（类四级页表、物理地址映射物理地址）查表；再用 EPT 使 Guest 读时见影子页、写时触发 EPT violation → VM-exit 丢弃本次写入。

这里感谢Satoshi大师，师承Satoshi。这里主要聊一下基于uefi模式下的Hypervisor层的VT-D对抗（TYPE1型Hypervisor或者说ACE预加载方案）。这里不讨论固伪装和绕过保护手法只讨论保护方向。黑灰勿扰。（全文无AI 古法）

## DMA背景介绍

这里讨论的是基于，PCILeech所开发的硬件。先说明一下：我个人完整阅读过PCILeech和LeechCore、MemProcFS 相关的库。对于PCILeech我是非常佩服的，提供的功能太强大了。ps:（2022年就通过老外接触到这个设备，当时对它提供的能力感到的惊讶的。后面也感受到这个东西将来要出大事，没想到这几年，祸事都从它而起。。。。劝大家向善吧）

## DMA介绍

-   为什么DMA可以读写物理内存？

正常的网卡、存储控制器需要向内存传输数据。DMA 允许设备直接读写为它准备的缓冲区，减少 CPU 搬运数据的工作。所以才诞生了PCILeech这类产品。  
![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/9df6e6963d9d6ee2.webp)

## DMA旧时代对抗

### CR3Fix

这个最开始是出现在2024年10月的EasyAnti-Cheat给的一个方案,卡死不少人hhh。这里简单说一下保护思路：

-   DTB  
    先介绍一下DTB:在 x64 Windows 中，进程的 EPROCESS.Pcb.DirectoryTableBase 保存着地址空间相关的页表根信息。正常情况下，系统切换地址空间时，会把对应的有效值装入 CPU 的 CR3 寄存器。  
    所以思路很简单了，混淆CR3,当需要执行的时候在回调CR3，其他情况下CR3是失效的。一般来说直接制造一个畸形CR3地址可以触发异常，配合异常接管即可回填。  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5cc32a3856f164f2.webp)
    
-   HAL HOOK  
    一种基于纯Rin0实现方式：  
    HAL内部存在一个回调地址的全局变量（HAL组件可以自行搜索）。劫持这个变量就可以，触发函数间接调用。我们可以去HOOK系统函数来接管异常。  
    这是一种基于CR3替换 的方式来做到的一种对抗。后续进化Hypervisor层更上一层楼。

## Hypervisor 保护思路

### Hypervisor分配内存页

当我们启动了Hypervisor之后，我们是可以手动给Guest分配内存页。相当于我们有自己管理Guest的内存的能力。（这一块后续我单开一个板块慢慢说）

### VT-D保护思路

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ecd145a640f8cb85.webp)

重点来了：  
如图所示：  
  
VT-d 防护的基本思路，是在设备访问内存的路径上增加硬件控制。我们自定义的 Hypervisor 组件负责建立转换表，规定设备请求的地址最终对应哪块物理内存，以及是否允许读取和写入。启用 DMA 重映射后，经过对应 VT-d 单元的请求都会受到这些规则约束。  
具体实现分为三步：

1.  确定保护范围。记录 Hypervisor 组件的程序映像和内部数据池占用的物理内存范围。
2.  配置映射和权限。普通内存大多保持原地址映射；受保护范围映射到一个填充了 0xFF 的替代页，并设置为只读。
3.  由硬件执行保护。设备读取受保护地址时，得到替代页的内容；尝试写入时，VT-d 因权限不足而阻止访问，真实的组件内存得到保护。

### VTD

VTD单元和DMA设备的关系是一对多。一个VTD下可以绑定多个DMA设备，从而进行分组管理。  
这里需要注意的是这里一种说的VTD是一个物理硬件通常在CPU里面。而我们则需要针对这个物理硬件进行设置，VTD可以管理DMA的的行文。而VTD是由数量上限，这样推荐的上限是4。  
VTD可以提供如下的能力：最直观的能力就是控制DMA与RAM的交互能力

```python
一个 VT-d 硬件单元
┌─────────────────────────────┐
│ 控制、状态寄存器            │ ← 我们通过 MMIO 配置它
│ 转换表查询逻辑              │ ← 按根表地址读取 RAM 中的表
│ 地址转换、读写权限检查逻辑  │ ← 处理设备发出的 DMA 请求
│ 转换缓存                    │ ← 缓存查过的映射，减少重复查表
└─────────────────────────────┘
```

### MMIO

全称是 Memory-Mapped I/O，中文叫“内存映射输入输出”。首先不是所有内存都是映射到RAM（内存条），会有硬件自己的内存，比如硬件的寄存器等。。。。  
通过CPU角度去看：  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5beb32a22b050c95.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d6104a1cfc4d172e.webp)
  
白皮书解释;  
  
所以从上面流程图可以看到， MMIO 会把一些寄存器映射到我们的内存中，这样我们可以方便操控硬件，也算是一个底层调用硬件的统一接口。这和我们VT-D有什么关系呢？看intel88白皮书  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/79951f023d22f063.webp)
  
两段分别说明：

-   11.1：寄存器在哪里。 每个 VT-d 重映射硬件单元都有一段内存映射的寄存器区域，BIOS 通过 ACPI 结构告诉软件它的位置。
-   11.2：软件如何控制它。 软件通过读写这些内存映射寄存器，与重映射硬件交互。

我们需要通过MMIO来控制我们的VTD物理硬件。

### DmarTable 解释

DmarTable是用来存储VTD信息的地方，每条 DRHD 记录描述一个 VT-d 单元。通过寄存器地址来访问和设置VTD  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/36fb0d2ea1bd5459.webp)

### DmarTable如何被加载并且访问它？

主板的 BIOS/UEFI启动过程中，它根据平台信息，在内存中准备 ACPI 表，包括描述 VT-d 硬件的 DMAR，并建立指向这些表的地址目录。EDK2库函数负责处理以下这些事情：

```cpp
typedef EFI_STATUS (EFIAPI *EFI_IMAGE_ENTRY_POINT)(
    EFI_HANDLE ImageHandle,
    EFI_SYSTEM_TABLE *SystemTable
);
```

SystemTable：它就是固件交给程序的实际内存地址。  
从这个已知指针，沿着内存里的地址逐级查找。

```python
固件传入的 SystemTable 指针
    ↓
SystemTable->ConfigurationTable
    配置表数组：每项保存“类型 GUID + 表地址”
    ↓ 找 ACPI 类型的那一项
VendorTable
    里面保存 RSDP 的地址
    ↓
RSDP 中的 XsdtAddress
    指向 ACPI 表的地址目录 XSDT
    ↓ 遍历目录中的表地址，检查表头签名
找到签名为 "DMAR" 的表
    ↓ 遍历其中的 DRHD 结构
读取 RegisterBaseAddress
    ↓
得到 VT-d 寄存器的物理基址
```

这一部分实际上EDK2已经帮我们是实现完了，我们只需要调用 Edk中的EfiLocateFirstAcpiTable()就可以拿到DMAR表

```python
typedef struct {
    EFI_ACPI_DESCRIPTION_HEADER Header; // 36字节，含签名、整张表的长度等
    UINT8 HostAddressWidth;             // 1字节
    UINT8 Flags;                        // 1字节
    UINT8 Reserved[10];                 // 10字节
} EFI_ACPI_DMAR_HEADER;
```

EDK2定义的表结构。

```python
DmarTable 指向这里
       ↓
┌───────────────────────────┐
│ DMAR 固定表头：48 字节     │
├───────────────────────────┤
│ DRHD：描述第一个 VT-d 单元 │
├───────────────────────────┤
│ DRHD：描述另一个 VT-d 单元 │ ← 如果有多个
├───────────────────────────┤
│ 其他类型的描述结构……       │
└───────────────────────────┘
```

DmarTable解析代码：

```python
UINT64 endOfDmar;
CONST EFI_ACPI_DMAR_STRUCTURE_HEADER* dmarHeader;
UINT64 discoveredUnitCount;

discoveredUnitCount = 0;

// 1. 整张 DMAR 表的结束地址。
// Header.Length 是整张表的字节长度。
endOfDmar = (UINT64)DmarTable + DmarTable->Header.Length;

// 2. 跳过 DMAR 固定头，定位到第一个子结构。
// DmarTable + 1 跨过的是一个完整结构体，不是一个字节。
dmarHeader =
    (CONST EFI_ACPI_DMAR_STRUCTURE_HEADER*)(DmarTable + 1);

// 3. 逐个遍历子结构。
while ((UINT64)dmarHeader < endOfDmar)
{
    // 4. 判断当前子结构是否为 DRHD。
//     DRHD 描述一个 VT-d 重映射硬件单元。
    if (dmarHeader->Type == EFI_ACPI_DMAR_TYPE_DRHD)
    {
        if (discoveredUnitCount < ARRAY_SIZE(VtdContext->DmarUnits))
        {
            DMAR_UNIT_INFORMATION* dmarUnit;
            UINT64 registerBase;

            // 5. 按 DRHD 格式解释这段内存，
            //    读取其中的寄存器物理基址字段。
            registerBase =
                ((CONST EFI_ACPI_DMAR_DRHD_HEADER*)dmarHeader)
                    ->RegisterBaseAddress;

            // 6. 把读出的物理地址保存到我们自己的记录中。
            dmarUnit = &VtdContext->DmarUnits[discoveredUnitCount];
            dmarUnit->RegisterBasePa = registerBase;
        }

        discoveredUnitCount++;
    }

    // 7. 当前结构的 Length 告诉我们，它占多少字节。
    //    跳过这些字节，就到下一个结构。
    dmarHeader =
        (CONST EFI_ACPI_DMAR_STRUCTURE_HEADER*)
            ((UINT64)dmarHeader + dmarHeader->Length);
}
```

### DRHD

DRHD就是用来存储VTD的结构体。  
定义如下：

```python
#pragma pack(push, 1)
// DMAR 内各类记录的公共头
typedef struct {
    UINT16 Type;       // 偏移 0：DRHD 的类型值为 0
    UINT16 Length;     // 偏移 2：整条记录长度，包含后面的 Device Scope
} EFI_ACPI_DMAR_STRUCTURE_HEADER;

// DRHD 固定头，共 16 字节
typedef struct {
    EFI_ACPI_DMAR_STRUCTURE_HEADER Header; // 偏移 0，占 4 字节

    UINT8  Flags;               // 偏移 4，占 1 字节
    UINT8  Size;                // 偏移 5，占 1 字节
    UINT16 SegmentNumber;       // 偏移 6，占 2 字节

    UINT64 RegisterBaseAddress; // 偏移 8，占 8 字节
                                // VT-d 单元寄存器的物理基址
} EFI_ACPI_DMAR_DRHD_HEADER;
#pragma pack(pop)
// 偏移 16 开始：紧跟零个或多个 Device Scope 记录。
// 它们不包含在上面这个固定头的 sizeof 中。
```

对应如上结构的白皮书解释：  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/02dce564f2842b92.webp)
  
通过RegisterBaseAddress地址就可以设置我们需要的功能了，功能对应的偏移标志位如下：

| 寄存器 | 作用  | 谁操作 |
| --- | --- | --- |
| **RTADDR**，偏移 `0x20` | 保存根表的物理地址和转换模式，相当于告诉硬件“表在这里” | 软件写入 |
| **GCMD**，偏移 `0x18` | 向硬件发送命令，例如“采用这个根表”“启用转换” | 软件写入 |
| **GSTS**，偏移 `0x1C` | 报告操作完成情况和当前状态 | 硬件更新，软件读取 |

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ac55811c81f21f05.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d62e2fed0ba2dcb5.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/dc6461187eec24bd.webp)

  
  

### 转换表

通过RTADDR设置我们就可以让硬件执行我们的转换表。转换表分几种模式这里只详细介绍Legacy模式（剩下自己探索吧）：  
有如下几种模式

| TTM 值 | 模式  | 作用  |
| --- | --- | --- |
| `00` | **Legacy Mode：传统模式** | “根表 → 上下文表 → DMA 页表” |
| `01` | **Scalable Mode：可扩展模式** | 使用另一套更复杂的表结构，支持更细的地址空间管理 |
| `11` | **Abort-DMA Mode：DMA 阻断模式** | 阻断 DMA 请求 |
| `10` | 保留  | 不能当作可用模式设置 |
| 假设一个场景： |     |     |
| 设备的身份Info如下： |     |     |

```python
总线号 = 2
设备号 = 3
功能号 = 0
```

### Root 上下文表

根表，就是 VT-d 硬件开始查找规则时，读取的第一张目录表。流程如下：

```python
根表 Root[2]
    │
    │ 找到上下文表
    ▼
上下文表 Context[3 × 8 + 0]
也就是 Context[24]
    │
    │ 这一项记录了 DMA 页表的物理地址
    ▼
这个设备使用的 DMA 页表
    │
    ▼
继续查：设备请求的地址，实际对应哪块物理内存？
```

上下文表对应的就映射的真正设备。

### DMA 页表

DMA 页表，就是告诉 VT-d：设备请求的地址，对应哪块真实物理内存，以及允许读、允许写。表结构：  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/90cf0105ce613a17.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f80c5b29452ae587.webp)
  
  
这里说直白一点，就是传统的四级页表结构一模一样。这里的页表就是单纯的物理地址映射物理地址，只不过这个物理地址可以被重映射。如下：

```python
设备请求读取 0x1234
        ↓
VT-d 收到请求，把 0x1234 当作输入地址
        ↓
拿 0x1234 查 DMA 页表
        ↓
表项规定：这页映射到物理页 0x9000
页内偏移：0x234
        ↓
实际访问物理内存 0x9234
```

循环映射代码：

```python
for (UINT32 ptIndex = 0; ptIndex < EPT_PTE_ENTRY_COUNT; ++ptIndex)
{
    // 允许设备读取、写入这一页。
    pt->Entries[ptIndex].ReadAccess = TRUE;
    pt->Entries[ptIndex].WriteAccess = TRUE;

    // 这一项最终指向的物理页。
    pt->Entries[ptIndex].PageFrameNumber = address >> MV_PAGE_SHIFT;

    // 继续映射下一个 4 KB。
    address += SIZE_4KB;
}
```

### 整个流程

首先我们设置好权限页表，再去设置权限即可

```python
① 建好根表、上下文表、DMA 页表
                  ↓
② 把根表物理地址写入 RTADDR
                  ↓
③ 发出 SRTP 命令，等待硬件确认采用根表
                  ↓
④ 使旧的转换缓存失效
                  ↓
⑤ 设置 TE，等待 TES 确认转换已经启用
                  ↓
⑥ 此后，VT-d 硬件自动处理设备的 DMA 请求
```

运行期间修改保护规则时，需要定位目标地址对应的表项，修改目标物理页或读写权限；随后确保更新对硬件可见，使相关转换缓存失效，并等待完成。

### VTD保护

用EPT 限制 Guest 对 VT-d 寄存器的访问：读的时候给它看影子页，写的时候拦下来  
如图：

```python
Guest，包括 Windows 内核里的 Ring 0 代码
                  │
                  │ 访问 VT-d 寄存器所在地址
                  ▼
              CPU 检查 EPT
                  │
         ┌────────┴─────────┐
         │                  │
       读取               写入
       R = 1              W = 0
         │                  │
         ▼                  ▼
  读取 RAM 中的影子页    触发 EPT violation
  得不到真实寄存器内容       │
                            ▼
                    VM-exit 进入 Hypervisor
                            │
                            ▼
                    丢弃这次写入，跳过指令

             真实 VT-d 寄存器没有被修改
```

## 总结

感谢您看到这里如果觉得有用可以给我点个赞噢。如有其他问题或者讨论的可以在评论区讨论。如果有保护方面可以和我沟通我可以提供技术支持。
