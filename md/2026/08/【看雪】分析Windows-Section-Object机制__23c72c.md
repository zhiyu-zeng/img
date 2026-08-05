---
title: 【看雪】分析Windows Section Object机制
source: https://bbs.kanxue.com/thread-292309.htm
source_host: bbs.kanxue.com
clip_date: 2026-08-05T17:45:05+08:00
trace_id: 947950d2-422b-4286-940a-96cc5714c416
content_hash: a85d907a9a4ce2cf3b6bd390b31252ca5985d0956dc0c20f7971f5526202386c
status: synced
tags:
  - 看雪
  - Windows逆向
  - 内核
series: null
feed_source: 看雪·逆向工程
ai_summary: Section Object是Windows内核中描述可共享内存区域的系统对象，文章结合WinDbg调试从创建到映射全流程拆解了其结构、内核调用链与按需提交机制。
ai_summary_style: key-points
images_status:
  total: 18
  succeeded: 18
  failed_urls: []
notion_page_id: 3b375244-d011-8120-bef8-dcc61c11b0de
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Section Object是Windows内核中描述可共享内存区域的系统对象，文章结合WinDbg调试从创建到映射全流程拆解了其结构、内核调用链与按需提交机制。
> 
> - **核心概念：** Section Object（\_SECTION）本身只存元数据，由\_CONTROL\_AREA桥接到\_SEGMENT管理实际物理存储；View是它在某进程地址空间的映射；后备存储分文件支持与页文件支持两类。
> - **关键内核结构：** \_SECTION中SizeOfSection按页对齐（请求1024字节实际为4KB）；\_CONTROL\_AREA的NumberOfMappedViews=1、NumberOfUserReferences=2分别对应一次MapViewOfFile与一个句柄；\_SEGMENT的NumberOfCommittedPages在未实际读写时为0，验证了Windows的按需提交（Demand-Commit）策略。
> - **创建调用链：** 用户态CreateFileMappingW→NtCreateSection（syscall 0x4A）→MiCreateSectionCommon做SEC_*标志合法性校验并获取进程令牌，随后MiCreateSection分派：页文件后备走MiCreatePagingFileMap，文件/映像走MiCreateImageOrDataSection；创建完成后调用CcZeroEndOfLastPage防止最后一页未初始化数据泄露。
> - **映射调用链：** MapViewOfFile→NtMapViewOfSection（syscall 0x28）→MiMapViewOfSectionCommon做保护掩码、对象引用、指针探测和边界检查，再由MiMapViewOfSection按ControlArea标志三路分派：物理内存段、可执行映像段、数据段，最后通过ETW发出威胁情报事件和调试器通知。
> - **防御应用：** 理解Section机制可用于实现内存防篡改，如Self-Remapping-Code项目利用该机制保护关键代码不被修改。

先导内容：

-   [内存交换空间](https://blog.csdn.net/Oorchi/article/details/159)
-   [Windows内存管理中的交换空间](https://blog.csdn.net/Oorchi/article/details/159)

这里写得较为详细，也有些混乱，主要供以后我遇到相关问题时查阅使用。

## 什么是节对象（Section Object）

Section Object，它是一个系统级的、独立于任何进程的对象，代表了一段可以被多个进程共享的物理存储资源。这个资源可以是内存（由页文件pagefile.sys支持），也可以是磁盘上的文件（如.exe、.dll或数据文件）。通过节对象，多个进程可以映射同一份数据到各自的地址空间，实现内存共享或文件的内存映射。

我们可以使用Process Explorer来查看某个进程的节对象句柄：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/a9029cc93b13d9aa.webp)

### Section、View 与 Backing Store

这是三个对于理解Section Object工作原理与应用的重要概念：

-   Section Object (节对象)：它是内存管理器在内核中维护的一个数据结构（正式名称为 \_SECTION）。它描述了“一段可以共享的内存区域”的元数据，比如它有多大、由谁（文件或页文件）提供物理存储等。它本身不包含实际的数据。
-   View (视图)：View是Section Object在某个特定进程的虚拟地址空间中的映射。一个进程要访问Section Object中的数据，必须先将该对象的一部分或全部“映射”到自己的地址空间，这个映射到的区域就叫做View。一个Section Object可以有多个View，分别属于不同的进程。
-   Backing Store (后备存储)：这是Section Object数据的物理来源，决定了数据的最终去向。它有两种：
    1.  文件支持 (File-Supported)：数据来源于磁盘上的一个具体文件。对内存的修改最终会写回这个文件。
    2.  页文件支持 (Page-File-Supported)：数据来源于系统的页文件 (pagefile.sys)。这种Section通常用于纯粹的进程间共享内存，数据不会持久化到磁盘。

### WRK定义

```c
typedef struct _SECTION {
    MMADDRESS_NODE Address;
    PSEGMENT Segment;
    LARGE_INTEGER SizeOfSection;
    union {
        ULONG LongFlags;
        MMSECTION_FLAGS Flags;
    } u;
    MM_PROTECTION_MASK InitialPageProtection;
} SECTION, *PSECTION;
```

Address就是该section object映射的进程地址空间对应的VAD节点。

Segment是真正描述section object数据的对象。

## 工作原理

1.  创建 (Creation)：进程或驱动程序调用 ZwCreateSection 内核函数。调用时需要指定后备存储（是一个文件句柄，还是NULL表示使用页文件）以及保护属性（如只读、读写等）。成功后会返回一个Section Object的句柄。
2.  映射 (Mapping)：进程调用 ZwMapViewOfSection 函数，将Section Object映射到自己的地址空间。这个操作会:
    -   在进程的VAD树中新增一个节点（类型为 \_MMVAD），记录下这段映射的虚拟地址范围，并关联到对应的Section Object。
    -   修改进程的页表，但此时通常不会分配物理内存，也不会真正读取数据。
3.  访问 (Access)：当进程首次访问被映射的虚拟地址时，会触发缺页异常 (Page Fault)。
    1.  内存管理器通过VAD节点找到关联的Section Object。
    2.  根据Section Object的信息（后备存储是文件还是页文件），从磁盘读取相应的数据到物理内存。
    3.  最后，更新进程的页表，让虚拟地址直接指向这块新的物理内存。

## 相关数据结构关系

引自潘爱民老师的《Windows内核原理与实现》：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/221271e3f79e8a52.webp)

## 应用场景与相关API

1.  实现进程间内存共享。当多个进程需要高效地交换数据时，可以创建一个由系统页文件 (pagefile.sys) 支持的Section Object。所有映射了该对象的进程，看到的是同一块物理内存，修改立即可见，这是进程间通信（IPC）最快的方式之一。
2.  实现文件的内存映射。它可以将磁盘上的一个文件（如.exe、.dll 或任意数据文件）“映射”到进程的虚拟地址空间。这样一来，程序就可以像访问内存一样直接读写文件，由操作系统在后台处理磁盘I/O，极大地提升了文件操作的效率。

用户态 (Win32 API)：

-   CreateFileMapping / OpenFileMapping：创建/打开Section Object。
-   MapViewOfFile / UnmapViewOfFile：映射/取消映射视图。

内核态 (内核API)：

-   ZwCreateSection / ZwOpenSection：创建/打开Section Object。
-   ZwMapViewOfSection / ZwUnmapViewOfSection：映射/取消映射视图。
-   ZwClose：关闭句柄。

## 示例程序

下面我们通过一个示例程序来更详细地了解section object的工作机制：

```cpp
#include <Windows.h>
#include <iostream>

int main(int argc, char* argv[])
{
    // 创建一个内存映射文件对象，因为传递了 INVALID_HANDLE_VALUE 作为文件句柄，所以该对象不与任何文件关联，
    // 所以其对应的物理存储为系统分页文件
    HANDLE hSection = CreateFileMapping(INVALID_HANDLE_VALUE, NULL, PAGE_READWRITE, 0, 1024, NULL);
    if (hSection == NULL)
    {
        return 1;
    }

    // 打印内存映射文件对象的句柄值，我们在windbg内核调试器中可以使用!handle
    // 命令查看该句柄对应的内核对象信息
    std::cout << "Section handle: " << hSection << std::endl;

    // 映射内存映射文件对象到当前进程的地址空间
    LPVOID lpBaseAddress = MapViewOfFile(hSection, FILE_MAP_ALL_ACCESS, 0, 0, 0);
    if (lpBaseAddress == NULL)
    {
        CloseHandle(hSection);
        return 1;
    }

    // 打印映射视图的基地址，我们在windbg内核调试器中可以使用!address命令查看该地址对应的内存区域信息
    // 以16进制形式打印地址
    std::cout << "Mapped view base address: " << std::hex << lpBaseAddress << std::endl;

    // 将数据写入内存映射文件对象
    const char* message = "Hello from the section!";
    memcpy(lpBaseAddress, message, strlen(message) + 1);

    // 暂停程序，以便我们在windbg内核调试器中查看内存映射文件对象的内容
    std::cout << "Pausing... Press Enter to continue." << std::endl;
    std::cin.get();

    // 读取数据
    char buffer[1024];
    memset(buffer, 0, sizeof(buffer));
    memcpy(buffer, lpBaseAddress, strlen(message) + 1);
    std::cout << "Read from section: " << buffer << std::endl;

    // 取消映射视图并关闭内存映射文件对象句柄
    UnmapViewOfFile(lpBaseAddress);
    CloseHandle(hSection);
    return 0;
}
```

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/90090dcfdb3fa7ec.webp)

## 数据结构分析

首先我们调用CreateFileMappingW创建了一个Section Object。这里拿到的HANDLE的值是0xE8。那么我们来看看其对应的Section内核对象。首先拿到进程的基本信息：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/baa63969cac19b7e.webp)

拿到Cid，就可以使用!handle命令取得句柄对应的内核对象信息了：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/9e96047f3403cec9.webp)

可以看到HandleCount为1，说明有一个进程引用了这个Section Object，自然就是我们的示例程序了：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/74ec771cdf846c8c.webp)

下面分析这个Section Object对象的结构。

### \_SECTION

于是我们拿到了Section Object地址：ffff808652d39d30。我们查看其结构：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/0a3d945cdb9f5f89.webp)

在输出中，可以看到这个节对象被挂载到了一颗AVL树上，Windows系统使用一颗AVL树来管理所有Section Object。

由于我们在CreatFileMappingW中传递了INVALID_HANDLE_VALUE，使用了系统分页文件作为物理存储，那么其StartingVpn和EndingVpn就都为0。

还可以看到该Section Object大小为4KB，我们在CreatFileMappingW中填写的是1024，但是最小也是以页大小为单位创建Section Object。还可以看到页保护属性字段正是我们在CreateFileMappingW中填写的PAGE_READWRITE：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/7a87399f1c0875d4.webp)

### CONTROL_AREA

\_SECTION中的u1联合体中是CONTROL_AREA，当然也有是FileObject的情况（以磁盘文件作为物理存储时）：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/11350d3828c8c0d9.webp)

我们查看CONTROL_AREA：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/3bbc0697e0c09d20.webp)

`_CONTROL_AREA` 是连接 `_SECTION` （逻辑对象）与 `_SEGMENT` （物理/页文件存储）的 **桥梁**。它不关心映射到哪个进程的哪个地址，只关心“这块内存的物理存储状态”和“当前有多少人在用”。

| 关键字段 | 当前值 | 核心含义与解读 |
| --- | --- | --- |
| **`Segment`** | `ffff8086524c29a0` | **指向 `_SEGMENT` 结构的指针**。这是最核心的字段， `_SEGMENT` 里记录了该 Section 对应的物理内存页框号（PFN）或在 **分页文件（Pagefile.sys）中的具体偏移量**。 |
| **`NumberOfMappedViews`** | **`0x1`** | **当前映射视图数量（确凿证据）**。值为 `1` ，说明 **确实有且仅有 1 个进程（即 `DbgSectionObject.exe` ）通过 `MapViewOfFile` 成功映射了这块内存**。 |
| **`NumberOfUserReferences`** | **`0x2`** | **用户态引用计数**。值为 `2` ，正好对应对这个 Section 的 **2 次有效引用**：  <br>1\. 你手中的句柄 `0xE8` （ `CreateFileMapping` 返回）。  <br>2\. 映射出的视图（ `MapViewOfFile` 建立的关联）。  <br>当两者都关闭时，这个值会归零，Section 才会被销毁。 |
| **`NumberOfSectionReferences`** | `0x1` | **内核态引用计数**。表示操作系统内存管理器（Mm）内部持有对该 `ControlArea` 的引用。通常只要分配了物理内存或页文件空间，这个值至少为 1。 |
| **`LockedPages`** | `0x1` | **锁定页面数量**。值为 `1` ，表示内核为了维护当前有效的视图映射（ `MapViewOfFile` ），暂时将这 1 个页面（4KB）锁定，防止在关键操作期间被换出。 |
| **`NumberOfPfnReferences`** | `0x0` | **物理页框（PFN）引用计数**。值为 `0` ，说明该内存 **没有** 被强制常驻于物理内存（RAM）且被单独计数，它完全依赖于页文件交换机制。这是使用 `INVALID_HANDLE_VALUE` 创建 Section 的正常状态。 |
| **`FilePointer`** | (未显式列出，通常为空) | **指向文件对象的指针（ `_EX_FAST_REF` ）**。因为你使用的是 `INVALID_HANDLE_VALUE` （分页文件后备），所以这里为空或指向无效值。如果这是用 `CreateFileMapping` 映射硬盘上的文件，这里就会指向具体的文件路径。 |

* * *

注意到 `+0x008` 处同时显示了 `ListHead` 和 `AweContext` ：

```
[+0x008] ListHead         [Type: _LIST_ENTRY]
[+0x008] AweContext       : 0xffff918ceb310440
```

这是 `_CONTROL_AREA` 中的一个 **联合体（Union）**。

-   **这里实际使用的是 `ListHead`**。 `ControlArea` 通过这个节点被挂载到全局的 `MmSectionMemory` 树下，供内核快速查找。
-   `AweContext` 只有在处理“地址窗口扩展（AWE）”物理内存时才有效，这里不涉及 AWE。 `dx` 只是将同一块内存地址强行按两种类型解释了一遍， `0xffff918ceb310440` 实际上是 `ListHead` 链表指针的值，而不是什么 AWE 上下文。

### \_SEGMENT

这个结构不关心有多少人在看这块内存（ `MappedViews` ），也不关心是谁在看。它只负责一件事： **管理这块虚拟内存实际占用的物理存储资源（物理内存页或分页文件槽位）**。

| 关键字段 | 当前值 | 核心含义与深度解读 |
| --- | --- | --- |
| **`ControlArea`** | `0xffff918ceb6aa950` | **反向指针**。指向所属的 `_CONTROL_AREA` ，形成双向关联，方便内核在两者间快速切换查找。 |
| **`TotalNumberOfPtes`** | **`0x1`** | **该段占用的页表条目（PTE）总数**。值为 `1` ，对应 `SizeOfSection` 为 `0x1000` （4KB），即正好占用 1 个内存页面。 |
| **`SizeOfSegment`** | `0x1000` | **该段的总大小（字节）**。与 `_SECTION` 中的 `SizeOfSection` 严格一致，确认了 1024 字节请求被系统向上对齐到了 4KB。 |
| **`NumberOfCommittedPages`** | **`0x0`** | **已提交的物理页数（异常关键！）**。值为 `0` ，意味着 **目前这块内存还没有被分配实际的物理存储（RAM 或 硬盘分页文件空间）**。  <br>  <br>**注意**：这是 Windows 的 **“按需提交（Demand-Commit）”** 策略。 `MapViewOfFile` 只是建立了 **虚拟地址映射关系**，但只要没有 **真正读写** 该地址（比如执行 `memset` 或读取变量），操作系统就不会浪费物理资源去提交页面。一旦去读/写，第一个页错误会触发提交，这里就会变成 `0x1` 。 |
| **`PrototypePte`** | **`0xffff80864699ff50`** | **原型页表项（Prototype PTE）的地址**。它指向一个内核全局的页表项模板。当进程访问映射的虚拟地址发生页错误时，内存管理器会从这个 `PrototypePte` 中读取信息，以决定去哪里获取数据。  <br>  <br>由于 `NumberOfCommittedPages = 0` ，这个原型 PTE 目前处于“预留”状态，指向 **系统分页文件（Pagefile.sys）** 的预留槽位，但还没有真正分配硬盘空间（等到写入时才会真正分配）。 |
| **`SegmentFlags`** | (未展开) | **段属性标志位**。这是一个位域结构，里面包含了诸如 `Protection` （保护位）、 `Image` （是否为可执行映像）、 `Reserve` （是否为预留内存）等信息。这里应该包含 `Commit` 标志（因为默认是 `SEC_COMMIT` ），但由于没有写访问，物理提交被延后了。 |
| **`BasedAddress`** | `0x0` | **基址**。仅对\*\*映像文件（如 DLL/EXE）\*\*的映射有效，用于存储其首选加载基址。我们使用的是分页文件后备，该字段为 `0` ，无意义。 |

* * *

对于 `NumberOfCommittedPages = 0` 与 `PrototypePte` ：

1.  **执行 `MapViewOfFile`**：内核在进程的 VAD 中记录映射关系，并设置好 `_SECTION` / `_CONTROL_AREA` / `_SEGMENT` 数据结构，但此时 `NumberOfCommittedPages` 保持为 `0` ， `PrototypePte` 处于“未提交”状态。
2.  **进程尝试读/写该地址**：CPU 触发页错误（Page Fault）。
3.  **内核页错误处理程序**：发现这是属于 `_SEGMENT` 的地址，于是查看 `PrototypePte` ，根据其中的信息决定从 **分页文件** 中分配一个槽位，并将物理内存页（RAM）映射给该进程。
4.  **同时更新**： `NumberOfCommittedPages` 自增为 `1` ， `PrototypePte` 中的内容也会更新，指向新分配的物理页框号（PFN）和分页文件偏移量。

### 从VAD看Section Object

我们的进程是映射了这个Section Object对应的物理存储到虚拟地址空间的，从VAD中可以看到：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/fe1811d2561465af.webp)

我们查看这个VAD节点的详细信息：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/82284095ed67ff7c.webp)

可以看到其中\_MMVAD中和Section Object相关的字段，和我们通过\_SECTION结构获取的对应字段，值是一致的。

具体如何通过\__MMVAD解析得到Section Object这里就演示了。

## 调试分析

我们开始调试这个程序。

### 创建Section Object：用户态

)

反汇编CreateFileMappingW，它只是把用户态参数格式转换为内核态参数格式，然后调用NtCreateSection：

```
ntdll!NtCreateSection:
00007ffa`86560990 4c8bd1          mov     r10,rcx
00007ffa`86560993 b84a000000      mov     eax,4Ah
00007ffa`86560998 f604250803fe7f01 test    byte ptr [SharedUserData+0x308 (00000000`7ffe0308)],1
00007ffa`865609a0 7503            jne     ntdll!NtCreateSection+0x15 (00007ffa`865609a5)  Branch

ntdll!NtCreateSection+0x12:
00007ffa`865609a2 0f05            syscall
00007ffa`865609a4 c3              ret

ntdll!NtCreateSection+0x15:
00007ffa`865609a5 cd2e            int     2Eh
00007ffa`865609a7 c3              ret
```

从这里准备进入内核态。

### 创建Section Object：内核态

这里进行了0x4A号系统调用，我们查找SSDT表基址为：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/e0fdd83088f55856.webp)

根据索引号计算在SSDT表中的偏移，右移四位后加上SSDT基址，得到0x4A对应的函数地址：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/b35fa5947dc1f9ae.webp)

偏移为0x087a0003，右移4位加上SSDT基址得到：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/aa6e8ce5bc6f6813.webp)

* * *

那么我们开始分析nt!NtCreateSection函数：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/aa4ce213332529a4.webp)

**注意 `a10 = 1`** （倒数第二个参数）：这个标志表示"来自NtCreateSection系统调用"还是"来自其他入口"——它影响 `MiCaptureSectionCreateExtendedParameters` 中的权限检查和 `MiCreateSectionCommon` 中是否获取进程令牌。

* * *

接下来分析 `MiCreateSectionCommon` ：

首席是AllocationAttributes 合法性检查（大量位掩码，非法即返回 `STATUS_INVALID_PARAMETER_6` = `0xC00000F4` ）

```c
if ((a6 & 0x3000000) == 0x3000000) return 0xC00000F4;  // 冲突标志组合
if (非法组合...) return 0xC00000F4;
if ((a6 & 0x2080FFFF) != 0 || (a6 & 0xF100000) == 0) return 0xC00000F4;
if ((a5 & 0x701) != 0) return 0xC0000045;  // STATUS_INVALID_PAGE_PROTECTION
```

这些是 SEC\_\* 标志的有效组合校验（例如 SEC_RESERVE 和 SEC_COMMIT 冲突等）。

然后是用户/内核模式敏感的指针捕获：

```c
if (a11 != 0) {   // PreviousMode = UserMode
    // 探测 MaximumSize 指针可读性（等价 ProbeForRead 的惯用写法）
    *(QWORD*)probe_address = *(QWORD*)probe_address;
    if ((a4 & 3) != 0) ExRaiseDatatypeMisalignment();  // 对齐检查
    v28 = *a4;   // 安全解引用 MaximumSize
}
```

**这是 Nt 函数的标志性行为**：由于参数来自用户态，必须在异常捕获下安全读取指针。

接着捕获扩展参数 + 获取令牌/会话

```c
MiCaptureSectionCreateExtendedParameters(Address, Count, ...);  // 验证扩展参数
CurrentThread = KeGetCurrentThread();
Process = CurrentThread->ApcState.Process;
Token  = PsReferencePrimaryTokenWithTag(Process, tag);   // 引用进程主令牌
SessionId = PsGetSessionIdEx(Process);                    // 获取会话ID
```

**这里解释了为什么需要 `a10=1` 标志**：该标志决定是否引用进程主令牌——文件映射需要以进程令牌做后续的文件访问权限检查。

然后调用 `MiCreateSection` + 重试循环

```c
while (1) {
    Section = MiCreateSection(&Object, ObjectAttributes, MaxSize,
                              Protection, AllocationAttributes, ...,
                              Token, SessionId, &ExtParams);
    if (Section != 0xC0000054)   // STATUS_RETRY 类信号
        break;
    KeDelayExecutionThread(0, 0, &MiHalfSecond);  // 等待 500ms 后重试
}
ObfDereferenceObject(Token);   // 释放令牌引用
```

重试循环处理文件映射创建时遇到的瞬态条件（如文件正在被锁定/删除中）。

最后成功后处理 + 句柄创建（ `NtCreateSection` 的收尾）：

```c
ControlArea = MiSectionControlArea(Object);
if (ControlArea && ControlArea->File) {
    FileObject = MiReferenceControlAreaFile(ControlArea);
    CcZeroEndOfLastPage(FileObject);   // 关键安全操作
    MiDereferenceControlAreaFile(ControlArea, FileObject);
}
result = ObInsertObjectEx(Object, 0, 0, &v30);  // 创建句柄
if (result >= 0)
    *SectionHandle = v30;   // 返回句柄给用户态
```

**`CcZeroEndOfLastPage` 值得注意**：它把映射文件最后一页末尾的未使用字节清零，防止映射视图泄漏文件中未初始化的数据（信息泄露防护）。

* * *

在NtCreateSectionEx中，调用了 `MiCreateSection` ，这个函数的分派逻辑如下：

```c
for (i = 0; ; i = (packet.flags & 1) << 24) {   // 最多重试
    memset(&packet, 0, 0xC8);                    // SECTION_CREATE_PACKET (200字节)
    MiInitializeCreateSectionPacket(&packet, ...);// 填充创建包
    if (没有文件对象 && 没有映像) {
        MiCreatePagingFileMap(&packet);           // 页面文件映射 (匿名section)
    } else {
        status = MiCreateImageOrDataSection(&packet); // 文件/映像映射
        if (status != RETRY) break;
    }
    MiFinishCreateSection(&packet);               // 完成创建
    if (需要扩展) MmExtendSection(...);
    *SectionObject = created_section;             // 输出 section 对象
    MiLogSectionObjectEvent(...);                 // ETW 事件
}
```

我们的示例代码中创建的文件映射对应的物理存储是页交换文件，所以调用的是MiCreatePagingFileMap。注意到MiCreateSection中调用了MiLogSectionObjectEvent，这里会触发ETW，我们可以使用ETW检测Section Object的创建。

注意，这是从用户态创建Section Object的调用链分析。如果使用了MmCreateSection这个内核态API，它会调用MmCreateSectionEx，然后也会调用MiCreatePagingFileMap或者MiCreateImageOrDataSection。

对于MmCreateSection，潘爱民老师的《Windows内核原理与实现》中做了详细分析。不过要注意的是，现代Windows内核中MmCreateSection相关实现与WRK中给出的源代码略有不同，应该要

* * *

那么对于创建section object的分析就到这里，如果继续再深入分析的话，我的水平还不够，这里浅尝辄止。

下面分析MapViewOfFile，也就是映射这一步的流程。

### 映射内存映射文件（MapViewOfFile）：用户态

首先调用了MapViewOfFile：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/8e98bdd63e0c4ee6.webp)

也是对参数进行一些准备后，调用了NtMapViewOfSection：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/c9ed842d25561725.webp)

由此准备进入内核，可以看到系统调用号是0x28。

* * *

### 映射内存映射文件（MapViewOfFile）：内核态

总体调用链：

```python
用户态: MapViewOfFile / MapViewOfFileEx / MapViewOfFileNuma
   ↓  NtMapViewOfSection (ntdll.dll)
   ↓  syscall
内核: NtMapViewOfSection (0x1408a30f0, 0x59d字节)
   ├── [阶段1] MiMapViewOfSectionCommon — 参数验证 + 对象引用
   └── [阶段2] ObpAllocateObject_0 (即 MiMapViewOfSection) — 真正的 VAD 创建 + 映射
         ├── MiSectionControlArea — 取控制区
         ├── 大量合法性校验
         ├── KeStackAttachProcess (如果跨进程)
         ├── MiValidateVadMetadataFlags
         └── 三路分派:
              ├── MiMapViewOfPhysicalSection (物理内存 section, flag 0x400)
              ├── MiMapViewOfImageSection   (可执行映像 section, flag 0x20)
              └── MiMapViewOfDataSection    (数据文件 / 页交换文件)
```

这与 `NtCreateSection` → `MiCreateSectionCommon` 的模式一致： **系统调用入口 → 参数准备层 → 核心执行层**。

* * *

接着开始进行参数映射。 `NtMapViewOfSection` 有10个参数：

| 参数  | 寄存器/栈 | 含义  |
| --- | --- | --- |
| `a1` (rcx) | SectionHandle | Section 对象句柄 |
| `a2` (rdx) | ProcessHandle | 目标进程句柄（-1 = 当前进程） |
| `a3` (r8) | \*BaseAddress | 输入/输出：期望/实际基址 |
| `a4` (r9) | ZeroBits | 地址约束（高位零位数） |
| `a5` | \[rsp+0x20\] | CommitSize |
| `a6` | \[rsp+0x28\] | \*SectionOffset |
| `a7` | \[rsp+0x30\] | \*ViewSize |
| `a8` | \[rsp+0x38\] | InheritDisposition |
| `a9` | \[rsp+0x40\] | AllocationType |
| `a10` | \[rsp+0x48\] | Win32Protect |

* * *

`MiMapViewOfSectionCommon` 进行参数验证

```c
NTSTATUS MiMapViewOfSectionCommon(
    HANDLE ProcessHandle,      // a2 (rdx)
    HANDLE SectionHandle,      // a1 (rcx)
    int Flags,                 // 0
    PVOID *BaseAddress,        // a3 输入输出
    PSIZE_T ViewSize,          // a7 输入输出
    PLARGE_INTEGER SectionOffset, // a6
    ULONG Win32Protect,        // a10
    ULONG ZeroBits,            // a4 处理后的约束计数
    CHAR PreviousMode,         // 用户/内核
    PMAP_VIEW_PARAMS OutParams) // 输出结构体
```

它做了以下工作：

#### 保护掩码验证

```c
ProtectionMask = MiMakeProtectionMask(Win32Protect & 0xBFFFFFFF);
if (ProtectionMask == -1)
    return STATUS_INVALID_PAGE_PROTECTION;  // 0xC0000045
OutParams->ProtectionMask = ProtectionMask & 7;  // 只保留低3位 MM_PROTECT_*
```

#### 引用 Section 和 Process 对象

```c
// 通过句柄引用目标进程
ObReferenceObjectByHandle(ProcessHandle, 'MmUv', &OutParams->Process);
// 检查 section 是否允许跨进程映射（flg+0x368 bit 0, "no remote"）
if ((Section->Flags & 1) && CurrentProcess != TargetProcess)
    return STATUS_ACCESS_DENIED;  // 0xC0000022

// 通过句柄引用 section 对象
ObReferenceObjectByHandle(SectionHandle, 'MmUv', &OutParams->Section);
```

#### 用户态指针探测

```c
if (PreviousMode == UserMode) {
    ProbeForRead(BaseAddress);        // 探测 *BaseAddress
    ProbeForRead(ViewSize);           // 探测 *ViewSize
    if (SectionOffset) {
        ProbeForRead(SectionOffset);  // 探测 SectionOffset->QuadPart (16字节)
    }
}
OutParams->BaseAddress = *BaseAddress;
OutParams->ViewSize = *ViewSize;
OutParams->SectionOffset = SectionOffset ? *SectionOffset : 0;
```

#### 边界检查

```c
// BaseAddress 不能超过 0x7FFFFFFEFFFF
// ViewSize + BaseAddress ≤ 0x7FFFFFFF0000
// ViewSize + BaseAddress ≤ (0xFFFFFFFFFFFFFFFF >> ZeroBits)
// 满足则返回 STATUS_SUCCESS
```

* * *

`ObpAllocateObject_0` 是核心映射函数， `NtMapViewOfSection` 构造了一个 128 字节的参数结构体传给它。

#### 关键校验列表：

| 校验项 | 失败返回 |
| --- | --- |
| InheritDisposition ∉ {1,2} | `STATUS_INVALID_PARAMETER` |
| 大粒度映射但给了非零偏移 | `STATUS_INVALID_PARAMETER_3` |
| AllocationType 非法位组合 (0x9F2BDFFF) | `STATUS_INVALID_PARAMETER` |
| SEC_NO_CHANGE(0x40000000)+非映像section | `STATUS_INVALID_PARAMETER` |
| 映像 section 不允许的 AllocationType | `STATUS_INVALID_PARAMETER` |
| SEC_LARGE_PAGES 权限检查失败 | 静默清除该标志 |
| SectionOffset + ViewSize 溢出 | `STATUS_INTEGER_OVERFLOW` |
| 视图超过 section 大小 | `STATUS_INVALID_VIEW_SIZE` / `STATUS_SECTION_TOO_BIG` |
| 保护掩码与 section 保护不兼容 | `STATUS_ACCESS_DENIED` |
| ACG (Arbitrary Code Guard) 阻止 | `STATUS_DYNAMIC_CODE_BLOCKED` |
| 跨进程映射： `KeStackAttachProcess` 附加到目标进程 | —   |

#### 最核心的三路分派：

```c
ControlArea = MiSectionControlArea(Section);
ControlAreaFlags = ControlArea->Flags;  // offset +0x38

if (ControlAreaFlags & 0x400) {
    // 路径1: 物理内存 section
    //   → MmAllocateMappingAddress / MiMapViewOfPhysicalSection
    status = MiMapViewOfPhysicalSection(...);
}
else if (ControlAreaFlags & 0x20) {
    // 路径2: 可执行映像 section (EXE/DLL)
    //   包含 SEC_LARGE_PAGES 重试循环：
    while (1) {
        status = MiMapViewOfImageSection(...);
        if (!(AllocationType & SEC_LARGE_PAGES))
            break;  // 成功或失败，直接退出
        // 大页失败 → 清除标志重试
        AllocationType &= ~SEC_LARGE_PAGES;
        if (status >= 0) {
            MiUnmapViewOfSection(Process);  // 回滚
        }
    }
}
else {
    // 路径3: 数据 section（文件映射 / 页交换文件映射）
    status = MiMapViewOfDataSection(...);
}

// 如果是跨进程映射，恢复原进程上下文
if (attached)
    KiUnstackDetachProcess(&ApcState);
```

#### 成功后回到 NtMapViewOfSection：

```c
*a3  = ViewBase;       // 实际映射地址
*a7  = SectionSize;     // 实际映射大小
if (a6) *a6 = CommittedSize;  // 实际提交大小
```

* * *

NtMapViewOfSection最后还会进行一些处理：

#### 调试器通知

```c
if (flags & 4)  // 调用者请求通知调试器
    DbgkMapViewOfSection(Process, ViewBase, 0, 0);
```

#### ETW 威胁情报事件

```c
// 对于非映像数据 section且非系统进程的映射
if (!(SectionFlags & 0x20) && (flags & 2)) {
    if (EtwThreatIntProvRegHandle enabled with keyword 0xF00)
        // 日志: 调用者进程、调用者线程、目标进程、
        //       ViewBase、ViewSize、AllocationType、Win32Protect
        EtwWrite(TiEventMapViewOfSection, ...);
}
```

#### 引用计数统计

```c
if (ViewBase == 0)
    dword_140E301E8++;  // 失败计数
else
    dword_140E301EC++;  // 成功计数
```

#### 清理

```c
// 无论成功失败，最终都要释放阶段1引用的对象
ObfDereferenceObjectWithTag(SectionObject, 'MmUv');
ObfDereferenceObjectWithTag(ProcessObject,  'MmUv');
```

## 总结

学习Windows的Section Object机制，可以更好地理解其应用原理，比如：

[Self-Remapping-Code](https://github.com/changeofpace/Self-Remapping-Code)

这个项目就是用了Section Object机制，保护内存不被修改。
