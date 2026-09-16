---
title: 【微信】Windows内核免杀学习：不调 API 找 ntdll 基址
source: https://mp.weixin.qq.com/s?__biz=MjM5NTc2MDYxMw==&mid=2458620444&idx=1&sn=bd763b6986b4c05a62ddf89ef70e891b&scene=58&subscene=0
source_host: mp.weixin.qq.com
clip_date: 2026-09-16T20:02:22+08:00
trace_id: 2ade9fca-b966-4670-af78-a9ba2f219fe2
content_hash: 8f91463ba4b3307d9a515c17c1b03cbefb40247a5b6cc9ed86166ef1dbc531bc
status: synced
tags:
  - 微信
  - Windows逆向
  - 反调试
series: null
feed_source: 公众号·看雪学院（weread）
ai_summary: 通过读取用户态 PEB 遍历模块链表，不经 GetProcAddress 直接算出 ntdll.dll 基址，避开 EDR 在 API 链路上的 inline hook。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3dd75244-d011-8115-8f89-d003cfa2d0cb
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 通过读取用户态 PEB 遍历模块链表，不经 GetProcAddress 直接算出 ntdll.dll 基址，避开 EDR 在 API 链路上的 inline hook。
> 
> - **核心偏移链（x64）：** `gs:[0x60]`→PEB，`PEB+0x18`→Ldr，`Ldr+0x20`→InMemoryOrderModuleList 哨兵头；头.Flink→首个真实节点 curr，`curr+0x20`→DllBase，`curr+0x50`→BaseDllName.Buffer（字符串指针）。
> - **最易踩的坑：** 链表交出的 curr 是 `InMemoryOrderLinks` 字段地址，比结构体首地址多 0x10；从 curr 算 DllBase 应 `+0x20`，照搬首地址偏移 `+0x30` 会取到 EntryPoint。正规写法用 `CONTAINING_RECORD` 反推首地址。
> - **链表规则：** LIST_ENTRY 中 Flink 在 `+0x00`、Blink 在 `+0x08`；节点内部字段用固定偏移、节点之间只用指针串（加载器在堆上动态分配，物理不连续）。
> - **不要假设 ntdll 是第二个节点：** 该假设只对 `InLoadOrderModuleList` 成立；本 demo 用的内存序链表按地址排序，notepad 中 ntdll 被 GUI 相关 DLL 挤后，故按名字 `_wcsicmp` 全链遍历匹配。
> - **验证与实测：** 输出首个节点为 exe 自身（`7ff785b70000`）后命中 ntdll（`7ffe2f3a0000`）；用 Procmon 过滤 `Operation is Load Image` 由 ETW 独立得到同一基址，两来源吻合。

## Windows 把每个进程已加载模块的基址，放在了一个用户态可直接读的结构里——PEB。读它不需要 syscall，不经过任何可被 hook 的 API。这意味着你不必走 GetProcAddress 去问 ntdll 要函数地址（EDR 在那条路上等着），而是自己把基址翻出来、自己算目标函数地址直接调。这篇记的是从 PEB 出发、一行偏移一行偏移把 ntdll.dll 的加载基址取出来的完整过程，代码自己写、能编译能跑，文末有真实输出。

文里标了自查的地方，是我给自己留的痕迹——当时卡在哪、怎么想错的、后来怎么弄对的。写下来主要是给自己复习用，顺便留存。如果有路过的同行看到哪里说得不对，能指一下当然好，但这不是本意，没人有这义务。内容均在合法授权的隔离靶场环境内学习验证。

环境：Windows 11 家庭中文版（10.0.26200），MSYS2 gcc 16.1.0，x64。

EDR 盯的是 GetProcAddress 这条路

用户态调系统服务，标准路径是两层下传：

应用代码 → kernel32!VirtualAlloc (Win32 API，公开导出) → ntdll!NAllocateVirtualMemory (NT API，实际系统调用包装) → syscall 指令 (陷入内核，进入 ntoskrnl) **用户态系统调用下传链与EDRinlinehook插入点**

EDR 在用户态的检测就落在这条链上。典型做法是在 `ntdll` 的 `Nt*` 函数入口插 inline hook（写几字节的 `jmp` 跳到自己的处理函数），或者 hook `kernel32` 的导出函数。只要你还走 `GetProcAddress` 去 `ntdll` 里取函数地址再调用，EDR 都看得到。

绕开这一层的思路：自己把 `ntdll` 里目标函数的地址算出来直接调。前提是先拿到 `ntdll.dll` 在当前进程地址空间里的加载基址。这个基址受 ASLR 影响，每次启动都不同，不能写死。

每个线程有一个 TEB，每个进程有一个 PEB。这俩都在进程自身的用户态地址空间里，用户代码可以直接读写，不需要 syscall，不需要内核调用。这就是免杀爱用它的根本原因——访问它们不经过任何可被 hook 的 API。

x64 下，gs 段寄存器指向当前线程的 TEB。TEB 起始地址是 `gs:[0]` ，而 TEB 内部偏移 `+0x30` 处存放着指向所属进程 PEB 的指针。

取 PEB 可以一步到位：

mov rax, gs:\[0x60\]; rax = PEB 地址

`gs:[0x60]` 等价于先取 TEB（ `gs:[0]` ）再读其 `+0x30` 字段，CPU 在段寄存器机制里替你完成了这步寻址。C 里我用 gcc 的内联函数 `__readgsqword(0x60)` 读取，省得写汇编。

PEB 字段很多，我用到的就两个：

`PEB.Ldr` 指向 `PEB_LDR_DATA` 结构，里面维护着当前进程已加载模块的三条双向链表：

三条链表串的是同一批模块节点，区别只在排序方式，以及节点指针挂在结构体的哪个字段上。我选 `InMemoryOrderModuleList` （ `Ldr + 0x20` ）。

链表中每个节点对应一个 `LDR_DATA_TABLE_ENTRY` ，关键布局（x64，从结构体首地址算）：

+0x00 InLoadOrderLinks (LIST_ENTRY, 16 字节)+0x10 InMemoryOrderLinks (LIST_ENTRY, 16 字节) ← 我用的链表挂这里+0x20 InInitializationOrderLinks (LIST_ENTRY, 16 字节)+0x30 DllBase (PVOID)+0x38 EntryPoint (PVOID)+0x40 SizeOfImage (ULONG)+0x48 FullDllName (UNICODE_STRING)+0x58 BaseDllName (UNICODE_STRING)

### 自查：完整的遍历路径偏移

从 PEB 到 DllBase 的完整偏移链：

gs:\[0x60\] → PEBPEB + 0x18 → Ldr (PEB_LDR_DATA)Ldr + 0x20 → InMemoryOrderModuleList 链表头（哨兵）头.Flink → 第一个真实节点的 InMemoryOrderLinks 字段（即 curr）curr + 0x20 → DllBase ← 从节点指针算curr + 0x48 → BaseDllName ← 从节点指针算

**容易错的地方**：把 `curr+0x08` 当成取 DllBase 的偏移。 `+0x08` 是 Blink（后向指针），不是 DllBase，DllBase 从 curr 算是 `+0x20` 。

还有一点： `Ldr + 0x20` 这个地址本身是哨兵节点，不是真实模块，要从它的 Flink 跳一步才到第一个真实模块节点。

差 0x10 的坑：链表交来的不是结构体首地址

这是我实际写代码时反复出错的地方。

`InMemoryOrderModuleList` 是个 `LIST_ENTRY` ，位于 `PEB_LDR_DATA + 0x20` ，它本身是链表的 **哨兵头节点** （不对应任何真实模块）。它的 `Flink` 指向第一个真实模块节点的 `InMemoryOrderLinks` 字段——注意，指向的是 **这个字段**，而不是 `LDR_DATA_TABLE_ENTRY` 结构体的首地址。

算法A（从结构体首地址算）：DllBase = entry + 0x30算法B（从节点指针 curr 算）： DllBase = curr + 0x20 **LDR_DATA_TABLE_ENTRY内存布局:curr与结构体首地址差0x10**

两者差 0x10，正是 `InMemoryOrderLinks` 字段在结构体内的偏移。我最初照搬网上资料写了 `+0x30` ，从 `curr` 直接加，取到的是 `EntryPoint` 而非 `DllBase` ，打印出来是个明显不对的值。后来逐个偏移打印验证，确认从 `curr` 算应当用 `+0x20` 。

正规写法是用 `CONTAINING_RECORD` 宏从字段指针反推结构体首地址：

PLDR_DATA_TABLE_ENTRY entry = CONTAINING_RECORD(curr, LDR_DATA_TABLE_ENTRY, InMemoryOrderLinks);// 等价于 entry = (char\*)curr - 0x10PVOID base = entry->DllBase; // entry + 0x30

反推之后所有字段统一用从首地址算的偏移。本文的 demo 没用这个宏，直接拿 `curr` 当基址、配从 curr 算的偏移，省去反推一步，代价是每取一个字段都要记得减去 0x10。两种写法取到的是同一个 `DllBase` 。

### 自查：0x10 到底是什么

0x10 是 `InMemoryOrderLinks` 这个字段在 `LDR_DATA_TABLE_ENTRY` 结构体里的 **位置偏移**，不是起点。前面 0x00～0x0F 被第一个 `LIST_ENTRY` （ `InLoadOrderLinks` ，16 字节）占满了，所以 `InMemoryOrderLinks` 排在 `+0x10` 。

链表交给你的 `curr` ，就是这个字段本身的地址（= 结构体首地址 + 0x10）。所以从首地址算 DllBase 在 `+0x30` ，从 curr 算就是 `0x30 - 0x10 = +0x20` 。差的 0x10 = 字段在结构体里的偏移量。是字段的位置，不是起点。

`LIST_ENTRY` 是 Windows 里的标准双向链表节点，只有两个指针：

curr + 0x00 Flink 前向指针，指向下一个节点curr + 0x08 Blink 后向指针，指向上一个节点

我默写时把这两个记反过一次，以为 `Flink` 在 `+0x08` ，结果遍历直接绕回链表头。记法是前在前，0 在前：前向（Forward）在 `+0x00` 。遍历链表找下一个节点一律用 `Flink` （ `curr + 0x00` ）。

### 自查：链表为什么用指针，不用固定偏移跳

这些 `LDR_DATA_TABLE_ENTRY` 是加载器在堆上动态分配的，各节点物理地址并不连续，无法靠固定步长跳转。所以节点 **内部** 字段之间用偏移寻址（柜子里第几格），节点 **之间** 用 `Flink` / `Blink` 指针寻址（柜子在哪）。

偏移只管柜子内部，指针只管柜子之间，两套机制分工。如果节点像数组那样连续排布，理论上可以靠固定偏移跳，但加载器没这么分配，所以必须靠节点自带的指针串。

`BaseDllName` 字段在 `curr + 0x48` ，但它存的不是字符串本身，而是一个 `UNICODE_STRING` 结构（x64 下 16 字节）：

+0x00 Length (USHORT) 字符串字节数（不含终止符）+0x02 MaximumLength (USHORT) Buffer 分配的字节数+0x08 Buffer (PWSTR) 指向真正的 UTF-16 字符串 **BaseDllIName与UNICODE_STRING:取字符串要再读一次 Buffer**

要从 `curr + 0x48` 取到字符串，需要再读一次 `Buffer` 字段。 `Buffer` 在 `UNICODE_STRING` 内部偏移 `+0x08` ，于是其绝对位置是 `0x48 + 0x08 = 0x50` ，即 `curr + 0x50` 处存着字符串指针。代码里写成 `*(unsigned long long*)(curr + 0x50)` 取出该指针，再 `(wchar_t*)` 转型交给 `printf` 的 `%ws` 。

Windows 内部字符串一律 UTF-16LE，C 里对应 `wchar_t` （MSYS2 下 2 字节）。宽字符串字面量用 `L` 前缀： `L"ntdll.dll"` 。比较宽字符串用 `wcscmp` （区分大小写）或 `_wcsicmp` （不区分）。DLL 名大小写并不统一——我这台机器上 `ntdll.dll` 全小写， `KERNEL32.DLL` 全大写——所以必须用 `_wcsicmp` ，否则匹配失败。

`Buffer` 有可能为 NULL（某些节点未填充名称），直接传给 `%ws` 或 `_wcsicmp` 会触发空指针访问。代码里用 `if (basename_buf)` 做了一层保护，字符串比较也放在这层之内。

`*` 的作用是去某个地址，把那里存的内容读出来。读出来的东西是地址还是普通数值， **取决于你怎么继续用它**——内存里存的都是字节，含义由后续使用决定。

如果读出来之后还要再 `*` 一次（比如 `*(*(curr+0x50))` ），说明那个位置存的是个地址，你在做指针的指针。

如果读出来直接交给 `printf` 打印，那它就是个数值（基址、长度之类的值）。

在第一周里， `ntdll_base` 是当 **值** 用的（一个基址数值，打印出来给人看）。但到了第二周解析 PE 头时，这个基址会变成 **地址**——作为 PE 文件在内存里的起点去解引用读 DOS 头。同一个数字，这一周是值，下一周是地址，用法变了，含义就变了。

### 自查：first_entry / second_entry 是节点还是地址

`first_entry` 和 `second_entry` 是同一种东西——都是 `curr` ，都是某个节点的 `InMemoryOrderLinks` 字段地址，不是结构体首地址。所以取 DllBase 时，两者用的是 **同一个偏移** `+0x20` （从 curr 算）。

**容易错的地方**：在 `second_entry` 上误用 `+0x30` ，因为潜意识里把它当成了结构体首地址。其实 second_entry = first_entry 的 Flink，它和 `first_entry` 是同一种指针，偏移规则一样。

环形双向链表的遍历：

**InMemoryOrderModuleList:环形双向链表与哨兵头节点**

一个需要澄清的说法是ntdll 永远是第二个节点。它只对 `InLoadOrderModuleList` 成立：进程启动时加载器最先映射 exe 本身，紧接着映射 ntdll，所以在按加载顺序排的链表里 ntdll 确实是第二个。

但 `InMemoryOrderModuleList` 按内存地址排序，ntdll 的位置并不固定。我在自己这个 demo 进程里实测 ntdll 恰好是 `[1]` ，但用 notepad 验证时，它启动会拉入一批 GUI 相关 DLL，ntdll 在内存序链表里被挤到后面。

因此代码没有依赖跳一次即到 ntdll的假设，而是老老实实遍历整条链按名字匹配。

第一周的顶点代码，自己写的。保留了前期探测用的旧变量（flink、blink、second_entry、ntdll_base）和注释掉的 printf，作为试错过程的记录，未做删除。

`#include<stdio.h>   #include<intrin.h>   #include<string.h>   #include<wchar.h>   int main(){       unsigned long long peb, ldr, first_entry, dllbase, flink, blink, second_entry, ntdll_base, curr;       int i = 0;       wchar_t* basename_buf = NULL;       peb = __readgsqword(0x60);       ldr = *(unsigned long long*)(peb + 0x18);       first_entry = *(unsigned long long*)(ldr + 0x20);       dllbase = *(unsigned long long*)(first_entry + 0x20);       flink = *(unsigned long long*)(first_entry + 0x00);       blink = *(unsigned long long*)(first_entry + 0x08);       second_entry = flink;       ntdll_base = *(unsigned long long*)(second_entry + 0x20);       curr = first_entry;       unsigned long long found_ntdll = 0;       while(curr != (ldr + 0x20)){           basename_buf = (wchar_t*)(*(unsigned long long*)(curr + 0x50));           dllbase = *(unsigned long long*)(curr + 0x20);           if(basename_buf){           printf("basename:%ws\ndllbase:%llx\n", basename_buf, dllbase);           if(_wcsicmp(basename_buf, L"ntdll.dll") == 0){               found_ntdll = dllbase;               printf("found ntdll.dll base:%llx\n", found_ntdll);               break;           }           }else{           printf("basename_buf is NULL");           }           curr = *(unsigned long long*)(curr + 0x00);           i++;       }       printf("found ntdll.dll base:%llx\n", found_ntdll);       // printf("flink:%llx\n",flink);       // printf("peb:%llx\n", peb);       // printf("ldr:%llx\n", ldr);       // printf("first_entry:%llx\n", first_entry);       // printf("dllbase:%llx\n", dllbase);       // printf("ntdll_base:%llx\n", ntdll_base);       return 0;   }`

`curr` 声明为 `unsigned long long` （整数），不能直接解引用，需先 `(unsigned long long*)` 转为指针类型再 `*` 取值。

循环条件 `curr != (ldr + 0x20)` 依赖绕回哨兵即停止；正常情况下 ntdll 必在链中， `break` 先于绕回触发。若链表损坏导致死循环，可加 `i < 50` 作为兜底。

`$ gcc week1.c -o week1_run.exe   $ ./week1_run.exe   basename:week1_run.exe   dllbase:7ff785b70000   basename:ntdll.dll   dllbase:7ffe2f3a0000   found ntdll.dll base:7ffe2f3a0000   found ntdll.dll base:7ffe2f3a0000`

第一个节点是 exe 自身（ `week1_run.exe` ，基址 `7ff785b70000` ），加载顺序上 exe 总是第一个。

`found ntdll.dll base` 出现两次：第一次在循环内命中时打印并随即 `break` ；第二次是循环结束后打印变量 `found_ntdll` 。两值一致，确认基址已被正确保存。

地址 `7ffe...` 开头符合 Windows 用户态高地址区分配特征（用户态通常占据地址空间高半区，x64 下大致在 `0x00000000_00000000` ～ `0x00007FFF_FFFFFFFF` ）。该值是本次进程启动中 ASLR 的结果，重启或换机后会变化，因此代码每次运行都重新计算，不写死。

## 用 Procmon 交叉验证

仅靠代码自身打印不足以确认偏移正确——万一取错了字段、碰巧打印出一个看起来合理的值。我用 Sysinternals 的 Process Monitor（Procmon）做外部交叉验证。

Procmon 通过 ETW（Event Tracing for Windows）捕获文件、注册表、网络、进程/线程、镜像加载等事件。在其中过滤 `Operation is Load Image` （对应模块映射事件，与本文讨论的模块加载对应），可以看到 notepad 的模块地址列表里 `ntdll.dll` 的基址同样为 `7ffe2f3a0000` 。

一个来自进程内部读 PEB 的值，一个来自外部 ETW 监控的值，两个独立来源吻合，基址得以确认。

### 顺带记录：Procmon 看 notepad 另存为

过滤设为 `Process Name is notepad.exe` + `Operation is WriteFile` ，观察 notepad另存为 temp_test.txt的事件流，发现它并非单次 `WriteFile` 完成：

先以 `CreateFile` 打开目标， `Disposition` 字段出现 `CREATE` 、 `OVERWRITE_IF` 、 `OPEN_IF` 三种取值，分别对应 Win32 `CreateFile` 的 `dwCreationDisposition` （新建、覆盖、打开或新建）。分析样本落地文件时，Disposition 是判断其文件创建意图的首要指标。

中间写入 `.tmp` 临时文件，完成后通过 `SetRenameInformationFile` 改名为正式文件——文件系统的原子写惯例，保证要么完整写入、要么不可见。

末尾还出现 `nvph` 开头的文件写入，系 Win11 新版 notepad 的会话状态存储，与另存为本身无关。

另将过滤切换为 `Operation is Load Image` + `Process Name is notepad.exe` ，观察整个另存为过程： **未出现新的 Load Image 事件**。模块加载集中于进程启动最初一两秒，运行期基本复用已加载 DLL。这与进程启动早期加载模块、运行期不再加的预期一致。

后续学习内核回调 `PsSetLoadImageNotifyRoutine` 时，所捕获的也正是这一启动期的加载事件。

## 关键偏移速查（x64）

gs:\[0x60\] PEBPEB + 0x18 LdrLdr + 0x20 InMemoryOrderModuleList（哨兵头）头.Flink 第一个真实节点（curr）curr + 0x00 Flink（下一节点）curr + 0x08 Blink（上一节点）curr + 0x20 DllBasecurr + 0x48 BaseDllName（UNICODE_STRING）curr + 0x50 BaseDllName.Buffer（字符串指针）

口诀两条，防记反：

**字段位置，不是起点**：0x10 是 `InMemoryOrderLinks` 在结构体里的位置，从 curr 算比从首地址算少 0x10。

## 几个还没想通的地方

我自己还有几个点没弄明白，先记着：

**三条链表怎么选**。我选 `InMemoryOrderModuleList` 主要是偏移顺手。写 shellcode 或 loader 时更常用哪条？有没有稳定性上的讲究，比如 `InLoadOrder` 的节点顺序是不是更可预测。

**ntdll 第二个的边界**。不少公开资料直接假设第二个节点就是 ntdll跳一次取基址，不走遍历。这种写法在 `InLoadOrder` 链上是不是真的跨版本稳定？不同子系统下会不会有例外。我自己是老老实实遍历了，但那个偷懒写法到底能用在什么范围，我还不确定。

**偏移的版本依赖**。本文偏移都是 x64 Win11 实测。这些结构体偏移从 Win7 到 Win11 变过吗？写跨版本兼容的代码是靠判断系统版本选偏移，还是有更稳的办法，我得查查。

**TEB 还能干嘛**。这篇我只用 TEB 取了 PEB。 `StackBase` / `StackLimit` 、 `LastErrorValue` 这些字段在规避技术里有没有实际用处，我还没碰到。

**下一步 PE 解析**。拿到基址后我要从内存直接解析导出表（不 `LoadLibrary` 、不 `MapViewOfFile` ）。内存解析和文件解析的差异我还没理清，比如节区在内存里按 `VirtualAddress` 展开、文件里按 `PointerToRawData` ，这块得专门花时间。

下一篇以这篇拿到的 ntdll 基址为起点，走 DOS 头 → NT 头 → 导出表，定位 `NtAllocateVirtualMemory` 的地址。

\*本文为看雪论坛优秀文章，由 aln1lam 原创，转载请注明来自看雪社区 [App 抽取壳的内存脱壳与请求签名逆向](https://mp.weixin.qq.com/s?__biz=MjM5NTc2MDYxMw==&mid=2458619713&idx=1&sn=ec61b7e3afb64384c71693657e53d117&scene=21#wechat_redirect) [ART 执行链与 Nterp：解析 FART Android12‑16 失效问题](https://mp.weixin.qq.com/s?__biz=MjM5NTc2MDYxMw==&mid=2458619676&idx=1&sn=2c4d3a7a8e4001824f3a0a2f5bc5c8f8&scene=21#wechat_redirect) [Hitcon-2016-babytrick 解题报告](https://mp.weixin.qq.com/s?__biz=MjM5NTc2MDYxMw==&mid=2458619656&idx=2&sn=e2518e55f8b66c6b10176910c3fd00e6&scene=21#wechat_redirect) [Windows调试体系揭秘](https://mp.weixin.qq.com/s?__biz=MjM5NTc2MDYxMw==&mid=2458619528&idx=2&sn=24940f883e8435ecda20073eec37fb9b&scene=21#wechat_redirect) [RP2350 硬件固化 CVE‑2022‑38694：突破 Unisoc BSP 安全启动链](https://mp.weixin.qq.com/s?__biz=MjM5NTc2MDYxMw==&mid=2458619521&idx=2&sn=1a084ce77235787ce7e11a74374a537f&scene=21#wechat_redirect)
