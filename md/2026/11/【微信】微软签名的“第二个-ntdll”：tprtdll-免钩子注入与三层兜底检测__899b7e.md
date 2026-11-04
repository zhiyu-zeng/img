---
title: 【微信】微软签名的“第二个 ntdll”：tprtdll 免钩子注入与三层兜底检测
source: https://mp.weixin.qq.com/s/L7x9s1smthnn74dF2Dn3dQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-04T13:38:38+08:00
trace_id: f62a6cf9-390e-48e4-bb0f-318810cdb78b
content_hash: 9b63da3374af4f25a980cefea5c2a65605be40eaf6f7f70e24fc88d848a7ea82
status: synced
tags:
  - 微信
  - 风控对抗
  - Hook
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: Windows 11 24H2 自带的微软签名 tprtdll.dll 导出与 ntdll 同名函数，可作为"干净 ntdll"绕过用户态 inline hook，但内核回调与线程归属校验仍能抓住它。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 40e75244-d011-812d-94a2-ee27a5fc0f2d
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Windows 11 24H2 自带的微软签名 tprtdll.dll 导出与 ntdll 同名函数，可作为"干净 ntdll"绕过用户态 inline hook，但内核回调与线程归属校验仍能抓住它。
> 
> - **绕过原理：** tprtdll.dll 属于 VBS/隔离用户模式组件族（Microsoft-OneCore-IsolatedUserMode-Common），导出 Nt/Zw/Rtl 系列 syscall 桩，是独立 PE 镜像；EDR 焊在 ntdll 入口的 5 字节 jmp 对其完全不生效，且比 direct/indirect syscall 更干净——无需找 gadget、无需处理 SSN，只需一次 LoadLibrary
> - **关键弱点：** 导出表残缺，没有 NtWriteVirtualMemory/NtCreateThreadEx/NtOpenProcess，注入链四步中只有 alloc/protect 走 tprtdll，write 和 thread 被迫退回 kernel32 与 RtlCreateUserThread，而线程创建必然触发内核回调，与 syscall 从哪个模块发出无关
> - **三层兜底检测：** L1 用 Sysmon 事件 7 监控非常规进程加载 tprtdll（需先建基线，空闲机器 10 分钟就有 2637 条 ImageLoad）；L2 用 Sysmon 事件 8 抓 StartModule 为 "-" 的无主线程；L3 用 NtQueryInformationThread 校验线程起始地址是否落在进程已加载模块区间，注入线程会显示为 UNBACKED
> - **实测与版本门槛：** 作者在 Win10 上跑等价链路（ntdll 版四步）全部成功，Sysmon 事件 8 抓到无主线程，但 Defender 实时防护全程未拦截——因为每步行为都"太正常"；该技术仅限 build 26100+，本质是 loader 技术，且前置条件是已能在目标执行代码
> - **检测思路转变：** 从"哪个 API 被调用"改为"这块代码/线程/内存属于谁"；内核回调、线程归属、内存归属三层不依赖钩子覆盖率，蓝队应把"钩子覆盖了哪些模块"纳入资产盘点，而非只依赖 ntdll 单点

**赛博57库** *2026年11月4日 12:03*

![cover](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/188d9330d335bf27.jpg)

栏目 · 攻防技术 · 威胁狩猎

## 微软签名的“第二个 ntdll”：tprtdll 免钩子注入与三层兜底检测

签名模块跳板 · 内核回调 · 线程归属校验 · VBS 组件族

2026 年 10 月 22 日，GitHub 上出现了一个新仓库： `ivancabrera02/tprtdll-Injection` 。到今天它 33 个 star，README 里列了四个 PoC，实际只有两个 `.cpp` ——两个 Python 版本压根没提交，链接点开是 404。

按惯例，这种"研究仓库"可以直接略过。但它点到了一件很少被公开讨论的事： **Windows 11 24H2 的 `System32` 里，躺着一份微软签名的 DLL，导出表与 `ntdll.dll` 高度重合，而它是一份独立的 PE 镜像。**

它叫 `tprtdll.dll` 。

对红队，这意味着调用 `NtAllocateVirtualMemoryEx` 时不必再从 `ntdll` 走；对蓝队，这意味着你在 `ntdll` 上焊的那些 inline hook，覆盖率从来不是 100%。

本文不复述 README。要回答的是三个问题：它凭什么能绕、它绕不过什么、以及在一台只开了默认遥测的机器上，你怎么把它抓出来。

## 01 · 先把 tprtdll 从“神秘 DLL”还原成一个组件

仓库说它是"Windows 11 build 26100+ 自带的微软签名 DLL"。这句话对，但太粗。我用微软自己的更新清单核了一遍。

2026 年 3 月的 Windows 11 24H2/25H2 SafeOS 动态更新（KB5083482）文件清单里，有两条 `tprtdll.dll` 记录：

|     |     |     |
| --- | --- | --- |
| 架构  | 版本  | 大小  |
| x64 | 10.0.26100.8107 | 456,008 字节 |
| arm64 | 10.0.26100.8107 | 390,072 字节 |

它属于组件 **`Microsoft-OneCore-IsolatedUserMode-Common`**，安装目标是 `$(runtime.system32)\` 。同包的还有五个文件：

|     |     |
| --- | --- |
| 文件  | 角色  |
| `iumbase.dll`<br><br>/ `iumdll.dll` | 隔离用户模式（IUM）基础运行时 |
| `vertdll.dll`<br><br>/ `veinterop.dll` | 虚拟化安全（VBS）相关的 enclave 接口 |
| `ucrtbase_enclave.dll` | enclave 侧 C 运行时 |
| `tprtdll.dll` | 本案例主角，导出 Nt/Zw/Rtl 系列 |

这就是第一层真相： **`tprtdll.dll` 不是"某个黑客工具的配套 DLL"，它是 VBS/隔离用户模式组件族的一员**。微软把它放进 `System32` 是完全正常的——它要服务 VTL1 侧的代码，那套代码和普通用户态一样，需要一套"进内核"的调用桩。

而这套桩，和 `ntdll` 里的长得一样。

于是第二层真相出现了： **一份合法签名、合法路径、导出表与 ntdll 重合的独立镜像，等于给所有人免费发了一份"干净的 ntdll"。**

![tprtdll 与 IUM 组件族、ntdll 的关系](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6962557f7e20e105.jpg)

tprtdll 与 IUM 组件族、ntdll 的关系

▲ 图 1：tprtdll 属于 IUM/VBS 组件族，与 ntdll 共享同名导出，但加载基址、`.text` 段、地址全都独立

需要说明边界：仓库声称这些导出是 **逐字节相同的 syscall stub**，我目前只拿到 PA31/PSFX 增量格式的 DLL（SafeOS 包只发差分），没法在本地还原完整 PE 做逐字节比对。所以本文把它当作"待验证的强假设"，而不是定论。但即便只从组件定位看，"独立镜像 + 同名导出"这一条已经足够解释后面所有现象。

## 02 · 钩子为什么失效：被打破的是同一个假设

EDR 在用户态做行为监控，主流做法是在 `ntdll.dll` 的函数入口写一个 5 字节 `jmp` ，跳到自己的分析 DLL。这个设计建立在一个假设上：

进程里所有进入内核的 Nt 调用，都要经过 `ntdll` 的 `.text` 。

`tprtdll.dll` 把这个假设拆了。它是独立映射的 PE，有自己的 `AllocationBase` 、自己的 `.text` 、自己的函数地址。 `GetProcAddress(tprtdll, "NtAllocateVirtualMemoryEx")` 拿到的地址和 `ntdll` 里的那个完全不同，而那段代码里同样有 `mov r10, rcx; mov eax, SSN; syscall` 。

**钩子打在 `ntdll` 的地址上， `tprtdll` 的字节没人动**。于是调用照样进内核，钩子一次都没触发。

很多人会把它和 direct syscall、indirect syscall 混为一谈。三者差别其实很关键：

|     |     |     |     |
| --- | --- | --- | --- |
| 方式  | syscall 指令在哪 | 调用栈看起来像 | 典型破绽 |
| Direct syscall | 自己的内存 | 匿名内存/私有段 | 返回地址不在任何签名模块 |
| Indirect syscall | `ntdll`<br><br>内 | 正常 ntdll 调用 | 栈帧拼装痕迹、SSN 来源异常 |
| **tprtdll** | **签名模块 `.text`** | **一次普通库函数调用** | **模块不在 EDR 白名单里** |

换句话说，indirect syscall 是"伪造一个像 ntdll 的栈"， `tprtdll` 是"真的调用一个签名模块"。后者不需要拼栈，不需要找 gadget，也不需要处理 SSN 随版本变化—— `GetProcAddress` 拿到的就是现成的。

这是它比前两代更"干净"的地方，也是它唯一的破绽所在： **这个模块平时不该出现在你的进程里。**

### 为什么不干脆自己映射一份 ntdll

看到这里会有一个自然的疑问：既然目标是"拿一份没被钩的 ntdll"，为什么不自己从磁盘读一份、或者从 `KnownDlls` 开一个节？

因为这些做法都有自己的代价，而且代价恰好落在遥测上：

|     |     |     |
| --- | --- | --- |
| 做法  | 代价  | 留下的痕迹 |
| 从磁盘读 `ntdll.dll` | 需要文件 I/O | 文件读取事件、句柄 |
| 打开 `\KnownDlls\ntdll.dll` 节 | 需 `NtOpenSection` | 节对象访问、路径异常 |
| 挂起子进程读它的 ntdll | 要先起进程 | 进程创建 + 跨进程读内存 |
| 自带一份改过的 ntdll | 落地文件、签名问题 | 文件落地、镜像签名校验 |
| **加载系统自带的 tprtdll** | **只需一次 `LoadLibrary`** | **一条镜像加载事件** |

最后一行就是它的全部优势：不落地、不改内存、不碰 `KnownDlls` 、不需要处理签名， `LoadLibrary` 一个系统路径下的微软签名文件就完成了。代价是导出表残缺，以及——这个模块出现在错误的地方。

## 03 · 注入链拆解：四步里有三步必然露头

仓库给了两条链，自注入和跨进程。自注入四步：

HMODULE htprt = LoadLibraryA("tprtdll.dll");

NtAllocVMEx = GetProcAddress(htprt, "NtAllocateVirtualMemoryEx");

ZwProtectVM = GetProcAddress(htprt, "ZwProtectVirtualMemory");

RtlCreateUT = GetProcAddress(htprt, "RtlCreateUserThread");

NtAllocVMEx(hSelf, &base, &size, MEM_COMMIT|MEM_RESERVE, PAGE_READWRITE, NULL, 0);

memcpy(base, sc, sc_len);

ZwProtectVM(hSelf, &base, &size, PAGE_EXECUTE_READ, &old);

RtlCreateUT(hSelf, NULL, FALSE, 0, NULL, NULL, base, NULL, &hThread, &cid);

跨进程版本只多一步： `WriteProcessMemory` 把 shellcode 写进目标进程。原因是 `tprtdll` 的导出表是 **残缺的**——它没有 `NtWriteVirtualMemory` 、没有 `NtCreateThreadEx` 、没有 `NtOpenProcess` 。缺的那几个，只能用 `kernel32` 补。

这恰恰是蓝队的机会： **攻击者为了绕开钩子，被迫放弃了三条最"原生"的路径，改用三条更容易被别的传感器看见的路径。**

![四步注入链与三处必然露头的位置](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5544dbe5d1ef9da4.jpg)

四步注入链与三处必然露头的位置

▲ 图 2：alloc / write / protect / thread 四步中，只有 alloc 和 protect 真正走了 tprtdll，另外两步是补位动作

**露头点一： `LoadLibrary("tprtdll.dll")` 。** 这一步产生镜像加载事件。普通业务进程加载一个 IUM 组件族的 DLL，本身就是异常——它不在 `ntdll` 、 `kernel32` 、 `user32` 这条常规链上。

**露头点二： `WriteProcessMemory` 。** 无论前面用了多干净的 syscall，写内存这一步走的是 `kernel32!WriteProcessMemory → ntdll!NtWriteVirtualMemory` 。如果 EDR 钩了 `ntdll` ，这里会响；如果没钩， `NtWriteVirtualMemory` 的进程句柄权限（ `PROCESS_VM_WRITE` ）仍然是内核可见的。

**露头点三： `RtlCreateUserThread` 。** 这是最关键的一条，也是最容易被忽略的一条。它不是 `CreateRemoteThread` ，不经过 `kernel32` 的任何包装，所以用户态钩子抓不到它。但它最终仍然是一次内核的线程创建—— **内核回调一定会触发**， **这一层与 syscall 从哪个模块发出无关**。

这里有个细节值得单独说。README 写"跨进程没有 `NtOpenProcess` ，必须用 `kernel32!OpenProcess` "，但代码里根本没调 `OpenProcess` ：它用 `CreateProcess` 返回的 `pi.hProcess` （ `PROCESS_ALL_ACCESS` ）直接操作。也就是说，真实链路里连"打开进程"这一步都省了，留下的痕迹更少，但也更依赖"先起一个子进程"这个前置动作——那又落回进程创建遥测。

## 04 · 三层兜底检测：从“函数有没有被调用”转向“归属关系”

如果检测还停留在"哪个 API 被调用了"， `tprtdll` 这类技术会一直赢。有效的思路是换问题：

这个线程、这块内存、这次系统调用， **属于谁**？

按这个思路可以落三层，从便宜到贵。

### L1 镜像加载：谁把 tprtdll 拉进了进程

最便宜的一层。Sysmon 事件 7（ImageLoad）就能覆盖，ETW 的 `Microsoft-Windows-Kernel-Process` 镜像加载事件同理。

要点不是"记录所有 ImageLoad"——我在这台测试机上量了一下， **空闲状态下 10 分钟就有 2637 条 ImageLoad 事件**，全量记录没有运营价值。要点是给 `tprtdll.dll` 建一条独立的匹配规则，并回答一个问题：这台机器上，正常情况下到底有哪些进程会加载它？

我的建议是先做基线再上规则：在 24H2 资产上跑一周 `ImageLoad` 里 `ImageLoaded` 含 `tprtdll.dll` 的聚合，按进程名分组。基线之外的宿主（ `mspaint.exe` 、 `notepad.exe` 、 `cmd.exe` 、 `rundll32.exe` 、各类 IM/浏览器）直接告警。

### L2 内核线程回调：谁在别人进程里开了线程

`RtlCreateUserThread` 不经过 `CreateRemoteThread` ，但绕不过内核。这层我做了一次实测验证：在 Windows 10 上跑等价链路（ `ntdll` 版 stub），Sysmon 记录到：

SourceImage: C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe

TargetImage: C:\\Windows\\System32\\notepad.exe

NewThreadId: 8960

StartAddress: 0x0000014D594E0000

StartModule: -

StartFunction:-

三个字段要连起来看： `SourceImage` 是发起方， `TargetImage` 是受害者， **`StartAddress` 指向一块不属于任何模块的地址，所以 `StartModule` 是 `-`**。 **这是"无主线程"的指纹，也是最稳的判据**。

注意，这个事件来自 Sysmon 的内核驱动，不是用户态钩子——否则它不可能看见 `RtlCreateUserThread` 。所以无论 syscall 是从 `ntdll` 还是 `tprtdll` 发出的，这一层都成立。

前提是 **事件 8 得开着**。这台测试机原来的 Sysmon 配置（ `C:\lab\logs\sysmon-lab.xml` ）只启用了 ImageLoad 和 FileCreate，事件 8 和 10 一条都没有。我临时换了一份全量配置才抓到上面这条。这件事本身比技术更值得警惕： **很多单位以为"装了 Sysmon 就有遥测"，其实配置里只开了三五个事件**。

### L3 线程归属校验：不依赖任何传感器

如果 EDR 不给数据、Sysmon 没开事件，还有一条纯本地的路：枚举目标进程的线程，取每个线程的 Win32 起始地址，看它是否落在该进程已加载模块的地址区间内。

代码不复杂， `NtQueryInformationThread` 的 `ThreadQuerySetWin32StartAddress` （信息类 9）就够：

IntPtr h = OpenThread(0x0040, false, tid);

IntPtr startAddr;

NtQueryInformationThread(h, 9, out startAddr, 8, IntPtr.Zero);

// 遍历 Process.Modules，判断 startAddr 是否落在 \[Base, Base+Size) 内

同一台机器上的实测输出：

tid=9880 start=0x7FF7FD1E3BD0 owner=notepad.exe

tid=5420 start=0x7FF90055D110 owner=ntdll.dll

tid=8028 start=0x7FF8FFB8F460 owner=combase.dll

tid=8960 start=0x14D594E0000 owner=UNBACKED

unbacked_threads=1

最后一行就是注入线程：起始地址等于分配基址，不属于任何模块。这个判据对 `tprtdll` 、direct syscall、手动映射、APC 注入全都成立，因为它问的不是"你用了什么 API"，而是"你的代码从哪来"。

### L4 调用来源校验：需要内核侧能力

还有一层更彻底：看系统调用返回地址落在哪个模块。正常调用落在 `ntdll` ， `tprtdll` 的调用落在 `tprtdll` 的 `.text` 。这需要 ETW-TI（ `Microsoft-Windows-Threat-Intelligence` ）或内核钩子，而 ETW-TI 的消费端要 ELAM 签名，普通运维拿不到。多数商业 EDR 有类似能力，但各家实现差异很大，不能一概而论。

## 05 · 实测记录：在 Windows 10 上把“等价链路”跑了一遍

必须交代清楚： **没有在 26100 上跑通 PoC**。手上的测试机是 Windows 10 Pro 19045.6456， `tprtdll.dll` 不存在， `LoadLibrary` 直接返回失败。这反倒验证了版本门槛是真的。

于是改用等价链路：把 `tprtdll` 换成 `ntdll` ，四步完全一致（ `NtAllocateVirtualMemoryEx` → `WriteProcessMemory` → `NtProtectVirtualMemory` → `RtlCreateUserThread` ），目标 `notepad.exe` ，shellcode 只做 `Sleep` 后 `ExitThread` 。

|     |     |
| --- | --- |
| 观测点 | 结果  |
| 四步调用 | 全部成功， `st=0x0` ，目标进程存活 |
| Sysmon 7（ImageLoad） | 10 分钟 2637 条（噪声基线） |
| Sysmon 8（CreateRemoteThread） | 抓到， `StartModule = -` ， `StartAddress` 指向分配区 |
| Sysmon 10（ProcessAccess） | 15 分钟 1310 条，绝大多数是 Defender 的 `0x1000` |
| L3 归属校验 | `unbacked_threads = 1`<br><br>，与分配基址一致 |
| Defender 实时防护 | 全程开启，未拦截 |

最后一行值得说：微软 Defender 的实时防护在这条链上没有反应。不是因为技术多高级，而是因为 **它执行的行为太"正常"**——分配内存、写内存、改权限、建线程，每一步都有大量合法软件在做。

遥测侧则是另一种景象：事件 8 一开就抓到了。 **技术的"隐"和遥测的"显"是两件事，中间隔着的就是配置。**

## 06 · 规则、误报与处置顺序

**规则思路** （Sigma 风格，Sysmon 8）：

• `EventID=8` 且 `StartModule` 为空/ `-` ， `StartAddress` 落在 `PAGE_EXECUTE_*` 的私有内存；

• 叠加 `SourceImage` 是脚本宿主（ `powershell.exe` 、 `wscript.exe` 、 `mshta.exe` ）或 Office 进程；

• 叠加 `TargetImage` 是常被注入的宿主（ `notepad.exe` 、 `mspaint.exe` 、 `explorer.exe` 、 `svchost.exe` ）。

**误报来源** 要提前想清楚：.NET 的 JIT、加壳程序、部分 EDR 自己的注入、CFG/JIT 动态代码、以及某些游戏反作弊，都会产生"起始地址不在模块内"的线程。落地时用"进程白名单 + 线程存活时长 + 内存权限"三个条件收窄，不要单靠 `StartModule = -` 。

**处置顺序** 建议：

1\. 先确认线程归属（L3），拿到起始地址和内存权限；

2\. 对该区域做内存 dump，看是 shellcode 还是完整 PE；

3\. 回查该进程的镜像加载链（L1），确认是否加载过 `tprtdll.dll` 等非常规模块；

4\. 回查 `ProcessAccess` （L2），确认是谁打开的句柄、用什么权限；

5\. 最后再看版本面——如果资产里有 24H2/25H2，这条链路是"可用"的；Windows 10 和 21H2 不成立。

## 07 · 结论：不是 EDR 已死，是“钩子覆盖率”该进资产盘点了

把这件事说成"又一个免杀神技"是廉价的。真实情况更朴素：

• `tprtdll` 确实绕过了用户态 inline hook，而且绕得比 indirect syscall 更干净，因为它调用的是真签名模块；

• 但它同时失去了三条原生路径（写内存、建线程、开进程），只能退回 `kernel32` 和 `RtlCreateUserThread` ，而这两条都在内核回调的覆盖范围内；

• 它的版本面很窄（26100+），前置条件是"已经能在目标上执行代码"，本质是一个 loader 技术，不是入口。

对蓝队，真正该改的不是某条规则，而是一个盘点项： **我们依赖的那些钩子，到底覆盖了哪些模块？** 如果答案只有 `ntdll` ，那么 `tprtdll` 、 `win32u` 、以及未来任何一个"带着 Nt 桩的签名 DLL"都能从旁边走过去。而 **内核回调、线程归属、内存归属这三层，不依赖钩子覆盖率**，才是兜底的那部分。

至于那个仓库本身——两个不存在的 Python 文件、没有构建说明、没有版本适配——它更像一份"想法记录"而不是可用工具。但它提出的问题是真的： **当系统自己带了一份干净的 ntdll，你凭什么认为钩子是完整的。**

技术内容仅供学习与研究，请勿用于非法用途。

赛博57库 · 2026-11-04
