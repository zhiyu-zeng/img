---
title: 【看雪】从 BCDEdit 枚举报错到 UEFI NVRAM：Windows BCD 固件同步机制逆向分析
source: https://bbs.kanxue.com/thread-293639.htm
source_host: bbs.kanxue.com
clip_date: 2026-11-24T10:14:25+08:00
trace_id: cf9c8865-e386-4eae-bb09-db30691374e1
content_hash: 8368b4b1407da1c783046595202fc9972d8fbeaf3fbcab2187833f63dae050b6
status: synced
tags:
  - 看雪
  - Windows逆向
  - 内核
series: null
feed_source: 看雪·逆向工程
ai_summary: bcdedit /enum 的“指定不存在的设备”并非枚举读取失败，而是关闭系统 BCD 存储触发的固件导出失败：{bootmgr} 的 device 元素类型为 5，导致合并固件启动项时返回 STATUS_NO_SUCH_DEVICE。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 42275244-d011-811e-845f-d87477fc88bb
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> bcdedit /enum 的“指定不存在的设备”并非枚举读取失败，而是关闭系统 BCD 存储触发的固件导出失败：{bootmgr} 的 device 元素类型为 5，导致合并固件启动项时返回 STATUS_NO_SUCH_DEVICE。
> 
> - **触发链：** 默认系统存储枚举 → BcdEditEnumerate → BcdCloseStore → BiCloseStore；Description\FirmwareModified=1 使后者调用 BiExportStoreAlterationsToEfi → BiExportBcdObjects → BiUpdateEfiEntry → BiCreateMergedBootEntry；后者在 RVA 0x1DD3B 判断设备类型为 5，返回 0xC000000E。
> - **对照实验：** 默认存储下 current、bootmgr、FIRMWARE、ALL 均输出完整却退出码 1，OSLOADER 与显式 /store 指向的 ESP 或 C: 副本均退出码 0，说明 BCD 数据本身未损坏。
> - **错误文本来源：** 0xC000000E 映射为 Win32 0x1B1（433），由系统消息资源输出，并非 bcdedit.exe.mui 专属文本；wmain 将负状态折算为退出码 1。`bcdedit /loglevel 4 /enum {current} /v` 可复现 “BiUpdateEfiEntry failed c000000e”。
> - **最小修复：** 执行 `bcdedit /set {bootmgr} device partition=S:` 后，三类默认枚举退出码全部归零；{memdiag} 的 device unknown 无需一并修改。
> - **路径区分：** 正常固件写入是 BiAddBootEntry → ZwAddBootEntry/NtAddBootEntry → ExpSetBootEntry → IoSetEnvironmentVariableEx（调用前启用 SeSystemEnvironmentPrivilege），本次故障在生成待导出条目时即中断，未进入该路径。

-   环境：Windows 11 24H2 x64，GPT/UEFI，单块 NVMe；ESP 位于 Disk 0 Partition 1，诊断时挂载为 S:。
-   工具：IDA Pro（公共 PDB）、WinDbg/CDB、PowerShell、BCDEdit。

## 0\. 摘要

一天在为 WinPE 添加 BCD 启动项时出现了矛盾现象：bcdedit /set 报出“指定不存在的设备”，但随后的枚举显示配置已写入；bcdedit /enum {current} /v 能完整打印启动项，却在末尾报同样的错误并返回退出码 1。将同一 BCD 文件通过 /store 显式指定后，枚举又完全正常。

经过在线/离线对照、IDA 静态分析和提权 CDB 动态调试，最终定位到 BCDEdit 关闭系统 BCD 存储时的固件导出过程：Description\\FirmwareModified=1 使 BiCloseStore 尝试向 UEFI 固件同步启动项；在处理 {bootmgr} 时，其 device 元素是 BCD 设备类型 5（界面显示 unknown），BiCreateMergedBootEntry 因此返回 `STATUS_NO_SUCH_DEVICE` （0xC000000E）。错误由关闭存储的调用链传回枚举命令，最后转换为 Win32 错误 433 和进程退出码 1。

执行

```
bcdedit /set {bootmgr} device partition=S:
```

之后，先前失败的 current、FIRMWARE、ALL 三种默认枚举均恢复正常，退出码均为 0。同时 {memdiag} 的 device 仍显示 unknown，并不需要为了本次故障而一并修改。

**本文的核心结论是：BCDEdit 的“只读枚举”可以在关闭系统存储时触发固件同步；枚举输出成功与整个命令成功是两回事。**

## 1\. 故障现象：写入成功，命令却报错

在向 BCD 添加自制 WinPE（SnowPE）时，使用两个已有对象：

-   RAMDISK 设备选项：{e404c419-e03b-11f1-b494-2c7ba0036cb7}；
-   WinPE 启动加载器：{e404c41a-e03b-11f1-b494-2c7ba0036cb7}。

例如：

```powershell
$ram = '{e404c419-e03b-11f1-b494-2c7ba0036cb7}'
$pe  = '{e404c41a-e03b-11f1-b494-2c7ba0036cb7}'

bcdedit /set $ram ramdisksdidevice partition=C:
bcdedit /set $ram ramdisksdipath \SnowPE-Boot\boot.sdi

$wim = "ramdisk=[C:]\SnowPE-Boot\boot.wim,$ram"
bcdedit /set $pe device $wim
bcdedit /set $pe osdevice $wim
```

运行时连续出现：

```
指定不存在的设备。
```

但随后：

```
Windows 启动加载器
-------------------
标识符        {e404c41a-e03b-11f1-b494-2c7ba0036cb7}
device        ramdisk=[C:]\SnowPE-Boot\boot.wim,{e404c419-e03b-11f1-b494-2c7ba0036cb7}
path          \Windows\System32\winload.efi
description   SnowPE v0.1
osdevice      ramdisk=[C:]\SnowPE-Boot\boot.wim,{e404c419-e03b-11f1-b494-2c7ba0036cb7}
systemroot    \Windows
detecthal     Yes
winpe         Yes
指定不存在的设备。
```

这一矛盾值得我们深入研究。

## 2\. 对照实验：相同数据，关闭方式不同

### 2.1 先确认 BCD 文件和 ESP

机器为 GPT/UEFI，只有一块 NVMe。ESP 是 Disk 0 Partition 1，大小 200 MiB，卷设备为 \\Device\\HarddiskVolume1。挂载为 S: 后，以下ESP关键文件均存在：

```powershell
mountvol S: /S
Test-Path S:\EFI\Microsoft\Boot\BCD
Test-Path S:\EFI\Microsoft\Boot\bootmgfw.efi
Test-Path S:\EFI\Microsoft\Boot\memtest.efi
Test-Path S:\EFI\kali\grubx64.efi
```

### 2.2 关键行为表

| #   | 存储来源 | 枚举对象 | 输出  | 退出码 |
| --- | --- | --- | --- | --- |
| 1   | 系统默认 | current | 完整输出，末尾报错 | 1   |
| 2   | 系统默认 | bootmgr | 完整输出，末尾报错 | 1   |
| 3   | 系统默认 | FIRMWARE | 完整输出，末尾报错 | 1   |
| 4   | 系统默认 | ALL | 完整输出，末尾报错 | 1   |
| 5   | 系统默认 | OSLOADER | 正常  | 0   |
| 6   | ESP 副本（/store 指向 S:） | ALL | 正常  | 0   |
| 7   | C: 副本（/store 指向 C:\\BCD-Diag） | ALL | 正常  | 0   |

上表对应的完整命令：

```bash
bcdedit /enum {current} /v
bcdedit /enum {bootmgr} /v
bcdedit /enum FIRMWARE /v
bcdedit /enum ALL /v
bcdedit /enum OSLOADER /v
bcdedit /store S:\EFI\Microsoft\Boot\BCD /enum ALL /v
bcdedit /store C:\BCD-Diag\BCD-backup /enum ALL /v
```

为排除 BCD 数据整体损坏，还在导出副本上分别修改了 description、detecthal 和 ramdisksdipath：全部返回成功。bcdedit /sysstore S: 虽然执行成功，却没有消除默认枚举的错误。

最初的可疑点是：

```
Windows Boot Manager
identifier  {9dea862c-5cdd-4e70-acc1-f32b344d4795}
device      unknown
path        \EFI\Microsoft\Boot\bootmgfw.efi
```

Windows 内存诊断 {memdiag} 同样显示 device unknown。但显式 /store 也能显示这两个 unknown 而不报错，可见不能仅凭这个文本断定具体故障点，还要确定什么操作使用了该元素。

## 3\. 动态调试：枚举成功，失败发生在 CloseStore

### 3.1 输出阶段没有失败

在最小复现命令：

```
bcdedit /enum {current} /v
```

中，跟踪发现：

-   BcdOpenObject 返回 0；
-   BcdEditEnumerateObjectElements 返回 0；
-   19 次 BcdEditDisplayElement 均返回 0；
-   BcdCloseObject 返回 0。

**真正的失败来自之后的 BcdCloseStore。**

关键调用链如下（RVA 相对于 bcdedit.exe 的映像基址）：

```
BcdEditEnumerate               RVA 0x08EFC
  └─ BcdCloseStore             RVA 0x0E5C8
      └─ BiCloseStore          RVA 0x0FB9C
          ├─ BiWasFirmwareModified → 1
          └─ BiExportStoreAlterationsToEfi  RVA 0x1EBF0
              └─ BiExportBcdObjects         RVA 0x1E59C
                  └─ BiUpdateEfiEntry       RVA 0x204E8
                      └─ BiCreateMergedBootEntry RVA 0x1DCE8
                          └─ STATUS_NO_SUCH_DEVICE
```

BcdEditEnumerate 的关闭调用位于 RVA 0x9285，之后的错误输出调用位于 RVA 0x929F。

### 3.2 为什么只读枚举会触发固件同步？

系统 BCD Hive 的 Description 下存在：

```
FirmwareModified    REG_DWORD    0x1
System              REG_DWORD    0x1
```

该状态由 BiWasFirmwareModified 检查。实验中，不同命令路径传递的打开/关闭标志不同：

| 路径  | 打开标志 | 关闭标志 | 固件导出 |
| --- | --- | --- | --- |
| 默认系统存储 + current | 0x2 | 0x4 | 关闭时触发 |
| 默认系统存储 + OSLOADER | 0x0 | 0x0 | 关闭时不触发 |
| 显式 /store（文件存储） | 文件存储路径 | 0x2 | 关闭时不触发 |

因此，这与OSLOADER 正常并不矛盾，它只是没有走到同一条关闭期导出路径。

在出现失败的原始状态下，导出不成功，FirmwareModified 不会被这次操作正常清除，于是后续默认查询会重复触发同样的问题。这解释了为什么一个本应只读的命令能持续报错。

## 4\. 根因定位：设备类型 5 被拒绝

### 4.1 失败点

IDA 中 BiCreateMergedBootEntry 的关键反汇编如下：

```
; bcdedit.exe, RVA 0x1DD35
cmp     dword ptr [r8], 5
jnz     short loc_14001DD45
mov     eax, 0C000000Eh       ; STATUS_NO_SUCH_DEVICE
jmp     loc_14001E04B

loc_14001DD45:
cmp     dword ptr [r8], 2
jz      short loc_14001DD55
mov     eax, 0C000000Dh       ; STATUS_INVALID_PARAMETER
```

运行时的 BiUpdateEfiEntry 正在处理 {bootmgr}，对应路径：

```
\EFI\Microsoft\Boot\bootmgfw.efi
```

进入 BiCreateMergedBootEntry 时，设备元素的类型值实测为 5，于是返回 0xC000000E。BCD 枚举里显示的 device unknown，在本案例中正对应这个元素类型；它不是字符串输出函数随意生成的错误提示。

这里也解释了一个容易误判的地方：故障不是遍历到坏的 BCD 对象时才发生，而是将该对象合并成固件启动条目时发生。

### 4.2 从 NTSTATUS 到控制台错误文本

失败状态沿原调用链上返：

```
BiCreateMergedBootEntry
  → BiUpdateEfiEntry
  → BiExportBcdObjects
  → BiExportStoreAlterationsToEfi
  → BiCloseStore
  → BcdCloseStore
  → BcdEditEnumerate
```

调试证据中，NTSTATUS错误码0xC000000E对应Win32错误码0x1B1，随后 BcdEditPrintWin32Message 经系统消息资源输出：

```
指定不存在的设备。
A device which does not exist was specified.
```

它不是 bcdedit.exe.mui 中定义的专属文本。最后 wmain 对负的返回状态折算，进程退出码成为 1。

用 BCDEdit 的详细内部日志也能独立验证传播过程：

```
bcdedit /loglevel 4 /enum {current} /v
```

关键输出：

```
BCD Error: BiUpdateEfiEntry failed c000000e
BCD Error: BiExportBcdObjects failed c000000e
BCD Error: BiExportStoreAlterationsToEfi failed c000000e
BCD Error: Failed to export alterations to firmware. Status: c000000e
A device which does not exist was specified.
```

到此，原始报错的调用、数据条件与返回值已经形成闭环。

## 5\. 扩展：正常的 BCD→UEFI NVRAM 写入路径

上面的故障在 BiCreateMergedBootEntry 就终止了，没有走到真正写 NVRAM 的环节。为了理解正常路径，进一步静态分析了 BCDEdit 和 Windows 内核中的相关实现。

### 5.1 BiAddBootEntry：动态解析系统调用

BiAddBootEntry 中出现了：

```
lea     rcx, aZwaddbootentry  ; "ZwAddBootEntry"
call    BiLookupNtdllProcedureAddress
...
mov     ecx, 16h
call    BiAcquirePrivilege
...
mov     rdx, rdi
mov     rcx, rsi
call    _guard_dispatch_icall$thunk
...
call    BiReleasePrivilege
```

它动态解析 ZwAddBootEntry，在调用前尝试启用 SeSystemEnvironmentPrivilege，之后恢复权限状态。

### 5.2 NtAddBootEntry 与 ExpSetBootEntry

本次分析的内核版本中：

```c
if (dword_140EFE6B0 == 2)
    return ExpSetBootEntry(1, a1, a2);
else
    return STATUS_NOT_IMPLEMENTED;
```

ExpSetBootEntry 的反编译显示了以下主要过程：

1.  根据 PreviousMode 处理用户态输入与权限检查；
2.  检查 SeSystemEnvironmentPrivilege；
3.  验证启动选项结构、文件路径和可选 Windows 参数；
4.  使用 ZwTranslateFilePath 处理路径表示；
5.  查询 Boot0000 至 BootFFFF 等 EFI 启动变量，选择或检查启动项编号；
6.  通过 IoSetEnvironmentVariableEx 写入相关固件变量。

### 5.3 IoSetEnvironmentVariableEx：系统变量设备抽象

其实现出现：

```c
status = IopOpenSystemVariableDevice(&fileObject, &deviceObject);
if (NT_SUCCESS(status)) {
    // 通过设备对象关联的调用路径提交请求
}
```

可见 Windows 的固件变量写入在内核中还经过系统变量设备抽象，而不仅仅是“用户态直接调用 UEFI Runtime Services”。本文不继续展开具体设备驱动与固件实现，因为这不是原始故障的阻断点。

整体关系可概括为：

```
BCDEdit 的正常固件启动项写入逻辑
  → BiAddBootEntry
  → ZwAddBootEntry / NtAddBootEntry
  → ExpSetBootEntry
  → IoSetEnvironmentVariableEx
  → 系统变量设备 / 固件接口
```

这条正常路径与第 4 节的失败路径需要严格区分：本次真实故障在生成待导出的固件启动条目时就已经失败。

## 6\. 最小修复：只改 bootmgr 设备即可恢复

### 6.1 修复前

```bash
{bootmgr}: device unknown
bcdedit /enum {current} /v → exit 1
bcdedit /enum FIRMWARE /v  → exit 1
bcdedit /enum ALL /v       → exit 1
```

经确认 ESP 为 S:，并已备份 BCD 后，在提权命令提示符中执行：

```
bcdedit /set {bootmgr} device partition=S:
```

返回：

```
The operation completed successfully.
```

### 6.2 修复后实测

```bash
{bootmgr}: device partition=S:

bcdedit /enum {current} /v
CURRENT_EXIT=0

bcdedit /enum FIRMWARE /v
FIRMWARE_EXIT=0

bcdedit /enum ALL /v
ALL_EXIT=0
```

只修改一个 BCD 元素，就消除了此前所有默认枚举命令的收尾报错。这一结果直接支持 {bootmgr} 设备元素是本次故障的关键触发数据。修复后的日志也证明了用户可见故障和退出码恢复。

## 7\. 结论与启示

这次问题既不是 SnowPE 的 RAMDISK 配置错误，也不是 FormatMessageW 的文本格式化问题，更不是 ESP 文件缺失。根因是：系统 BCD 存储带有待同步固件状态；BCDEdit 在关闭存储时导出固件条目，遇到 {bootmgr} 的 unknown-device 类型后，BiCreateMergedBootEntry 返回 STATUS_NO_SUCH_DEVICE，使已经完成的枚举最终失败。

三个最值得记住的技术点：

1.  只读命令未必只有只读副作用。/enum 的 BCD 元素读取成功，关闭系统存储时仍可能触发固件同步。
2.  输出成功不等于命令成功，不能把 BcdEdit 失败返回简单解读为 BCD 元素没有写入。
3.  对照实验能快速缩小逆向范围。默认存储、显式 /store、OSLOADER 三条路径的差异，最终把分析聚焦到 BiCloseStore 的固件导出标志，而不是从头遍历全部 BCD API。

另外如果只需要离线查看 BCD，可以显式指定副本：

```
bcdedit /store C:\BCD-Diag\BCD-backup /enum ALL /v
```

* * *

## 附录：关键定位点

| 函数  | RVA | 作用  |
| --- | --- | --- |
| wmain | 0x262C | 返回状态转换为进程退出码 |
| BcdEditEnumerate | 0x8EFC | 枚举及关闭存储后的报错处理 |
| BcdCloseStore | 0xE5C8 | 计算关闭标志 |
| BiCloseStore | 0xFB9C | 根据 FirmwareModified 决定是否导出 |
| BiExportStoreAlterationsToEfi | 0x1EBF0 | 固件导出入口 |
| BiExportBcdObjects | 0x1E59C | 遍历待同步对象 |
| BiUpdateEfiEntry | 0x204E8 | 生成/更新单个固件条目 |
| BiCreateMergedBootEntry | 0x1DCE8 | 设备类型校验，0x1DD3B 返回 0xC000000E |
| BcdEditPrintWin32Message | 0xDC0C | 输出 Win32 错误消息 |
