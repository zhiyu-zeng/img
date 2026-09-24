---
title: 【看雪】x32dbg/x64dbg Ctrl+G 跳转框 4 种地址表达式详解
source: https://bbs.kanxue.com/thread-293032.htm
source_host: bbs.kanxue.com
clip_date: 2026-09-24T10:52:24+08:00
trace_id: 3c65b2bd-272c-43a4-a3f9-a044ddc4e311
content_hash: 8b0cec7c29fbdbc6357d9e99d3cd56c34d66579bc77273be80300b58ab47554d
status: synced
tags:
  - 看雪
  - 安全工具
  - Windows逆向
series: null
feed_source: 看雪·逆向工程
ai_summary: x32dbg/x64dbg 的 Ctrl+G 跳转框支持 `$RVA`、`#文件偏移`、`peb()`、`teb()` 四种内置地址表达式，能省去手动换算基址与节映射。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3e575244-d011-8100-8300-f0cac3c00f63
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> x32dbg/x64dbg 的 Ctrl+G 跳转框支持 `$RVA`、`#文件偏移`、`peb()`、`teb()` 四种内置地址表达式，能省去手动换算基址与节映射。
> 
> - **作用范围：** 表达式默认基于 CPU 窗口当前选中模块运算。
> - **`$RVA`：** 模块内相对偏移，`$1234` 即 `$RVA:0x1234`；VA = 模块基址 + RVA，适合填 IDA/Ghidra 或 PE 节表导出的 RVA。
> - **`#` 文件偏移：** 磁盘文件偏移（FOA），如 `#40A3`，调试器自动读 PE 节信息换算成内存 VA；FOA 与 RVA 因节对齐通常不相等，加壳程序中差异更大。
> - **`peb()` / `teb()`：** 分别返回当前进程 PEB、当前线程 TEB 地址；`peb()+0xC` 为 PEB->Ldr，`peb()+0x10` 为进程参数，`teb()+0x30` 可取 PEB 指针，`teb()+0` 为 SEH 链头；32 位下 `FS:[0]` 等于 `teb()`。
> - **多模块写法：** 加模块名前缀指定目标，如 `demo:$15C7`、`demo:#40A3`；不带前缀直接写 `004015C7` 表示绝对 VA。

弹窗里： `$RVA` 、 `#文件偏移` 、 `peb()` 、 `teb()` ，这是 x32dbg/x64dbg 跳转对话框内置的 4 种快捷地址语法， **CPU 窗口选中哪个模块，默认就作用在这个模块上** （你当前是 demo.exe）

> 快捷键： `Ctrl+G` 调出【输入目标地址或表达式】弹窗

* * *

## 1\. $RVA （相对虚拟地址）

语法： `$RVA:0x1234` 或者简写 `$1234`

-   **RVA = Relative Virtual Address**：模块加载到内存后， **相对于模块基址的偏移**
-   公式： `VA(内存虚拟地址) = 模块基址 + RVA`
-   场景：IDA 看 PE 时，IDA 默认显示 RVA；拿到 IDA 里的函数 RVA，直接填 `$RVA:40A3` ，不用手动加基址，直接跳转到内存对应代码。
-   例子：demo 基址 `00400000` ，RVA `0x15C7` → VA = `004015C7` ，就是截图里当前代码行。输入 `$15C7` 直接跳转。
-   适用：IDA/Ghidra 导出的 RVA、PE 头里节表、导入导出表的 RVA。

> 区分：直接写 `004015C7` 不带前缀，是 **VA 虚拟内存地址** （绝对内存地址）

## 2\. #文件偏移（FOA，File Offset，磁盘文件偏移）

语法： `#0x1234`

-   文件偏移：PE 文件 **保存在硬盘上**，相对于文件头部 0 字节开始的偏移，用 010Editor/WinHex 打开 exe 看到的地址就是文件偏移。
-   作用：调试器自动把【磁盘文件偏移】换算成进程内存中的 VA，直接跳转。
-   场景：在十六进制编辑器找到某个字符串 / 特征码的文件偏移，不需要手动算节映射，直接 `#偏移值` 跳内存。

> ⚠️ 注意：RVA 和 文件偏移 **不是同一个值**，PE 节对齐后两者会不一样，壳程序里差别巨大。

-   例子： `#40A3` ，调试器读取 demo.exe 的 PE 节信息，自动换算成内存 VA。

## 3\. peb() 获取 PEB 结构体地址

`peb()` 是内置函数，返回当前进程 **PEB（Process Environment Block，进程环境块）** 的内存地址。

-   PEB：Windows 内核给每个进程分配的结构体，保存进程信息：模块链表、进程参数、堆信息、加载的 dll 列表等。
-   常用玩法：

-   输入 `peb()` → 直接跳转到 PEB 结构体头部；
-   `peb()+0xC` 取 PEB->Ldr（加载器链表，遍历进程所有 DLL）；
-   `peb()+0x10` 取进程参数。

-   逆向脱壳常用：壳经常遍历 PEB 的 Ldr 链表隐藏 DLL，直接 `peb()` 快速定位。

## 4\. teb() 获取 TEB 结构体地址

`teb()` 返回当前线程 **TEB（Thread Environment Block，线程环境块）** 的内存地址。

-   TEB：每个线程独立的结构体，保存线程信息：栈地址、SEH 异常链、TLS 局部存储、当前进程 PEB 指针。
-   常用玩法：

-   `teb()` ：跳 TEB 头部；
-   `teb()+0x30` ：TEB->ProcessEnvironmentBlock，也就是 PEB 指针；
-   查 SEH 异常链： `teb()+0` 就是 SEH 链表头。

> 32 位程序 TEB 在 FS 段寄存器： `FS:[0]` = teb()。

* * *

## 额外拓展：混合写法（多模块时）

如果不是当前模块，可以指定模块名前缀：

1.  `demo:$15C7` → demo 模块 RVA=0x15C7
2.  `demo:#40A3` → demo 模块文件偏移 0x40A3 方便在调试多个 DLL 的时候切换。

## 快速对比总结

表格

| 表达式 | 含义  | 来源场景 |
| --- | --- | --- |
| `$RVA` | 模块内存相对偏移（RVA） | IDA 反汇编、PE 节表 |
| `#` | 磁盘文件偏移 FOA | WinHex/010Editor |
| `peb()` | 进程环境块地址 | 脱壳、遍历 DLL |
| `teb()` | 线程环境块地址 | SEH、线程栈、TLS |

## 小实操演示（你的 demo.exe）

demo 基址 `00400000` ，当前代码地址 `004015C7`

-   VA = `004015C7`
-   RVA = `000015C7` 输入： `$15C7` ，直接跳转到当前行。
