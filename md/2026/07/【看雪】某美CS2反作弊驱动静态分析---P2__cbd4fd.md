---
title: 【看雪】某美CS2反作弊驱动静态分析 - P2
source: https://bbs.kanxue.com/thread-292164.htm
source_host: bbs.kanxue.com
clip_date: 2026-07-25T19:03:31+08:00
trace_id: 73bce86d-8472-46cc-8537-6f6d5ee712c4
content_hash: 63da096b1ffa6af11a4551e6a674188bcda4c7dbdbd6ce76e97a55067df30c1c
status: summarized
tags:
  - 看雪
  - Windows逆向
  - 反调试
series: null
feed_source: 看雪·逆向工程
ai_summary: 该反作弊驱动通过注册多种Windows内核回调机制，对CS2进程进行全方位监控，以阻止外部程序注入或读写其内存。
ai_summary_style: key-points
images_status:
  total: 51
  succeeded: 25
  failed_urls:
    - src
    - src
    - src
    - src
    - src
    - src
    - src
    - src
    - src
    - src
    - src
    - src
    - src
    - src
    - src
    - src
    - src
    - src
    - src
    - src
    - src
    - src
    - src
    - src
    - src
    - src
notion_page_id: 3a875244-d011-812c-bc1b-fd8de5ada951
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 该反作弊驱动通过注册多种Windows内核回调机制，对CS2进程进行全方位监控，以阻止外部程序注入或读写其内存。
> 
> - **ObRegisterCallbacks检测进程句柄操作：** 驱动通过`ObRegisterCallbacks`监控外部进程打开CS2进程句柄的行为。它会检查请求的访问权限是否包含`VM_READ`、`VM_WRITE`、`CREATE_THREAD`等敏感操作，并对调用进程的主模块PE头计算MD5指纹进行上报。
> 
> - **PsSetCreateProcessNotifyRoutine记录目标：** 驱动通过进程创建回调在CS2.exe启动时记录其进程ID（PID），并收集进程路径、命令行、父进程等信息。此PID作为后续线程和句柄操作检测的基准。
> 
> - **PsSetCreateThreadNotifyRoutine检测线程注入：** 驱动通过线程创建回调，专门检测外部进程（非CS2自身）向CS2进程创建远程线程的行为。它会计算创建者进程的PE头MD5，并获取新线程的起始地址（Win32StartAddress），这些信息组合起来用于判定注入行为。
> 
> - **PsSetLoadImageNotifyRoutine监控模块加载：** 驱动通过模块加载回调监控可能的DLL或驱动加载行为，例如通过`LoadLibrary`进行的常规注入或加载无签名驱动。它会获取加载模块的路径和大小信息。
> 
> - **统一上报与特征匹配：** 所有检测到的可疑行为都会通过内部函数`sub_14004E7EB`进行统一事件打包和上报，事件类型区分句柄操作、进程创建、线程注入等。上报的数据，特别是PE头MD5，用于与特征库进行匹配以识别作弊软件。

## 三．回调检测相关部分

【Note：本节除了3.1以外的其他监控方式，均可以通过抹掉notifymask的方式绕过。以进程创建监控为例,在 ntoskrnl.exe 的分析文件中找到进程创建函数，在下面找到这个PspNotifyEnableMask，抹掉即可】

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/b6a8c45cdba838e7.webp)

### 3.1 ObRegisterCallbacks（ObjectType=PsProcessType）

在 sub_14034C000 初始化里，0x14034CB8C 这里会走 ObRegisterCallbacks，前面填的 OB_OPERATION_REGISTRATION 也能对上：

·ObjectType = PsProcessType

·Operations = 1

·PreOperation = sub_1400529A4

·PostOperation = nullsub_1

·Altitude = L"389613"

·RegistrationHandle = qword_140344998

Operations = 1 这个地方要注意，它对应的是 OB_OPERATION_HANDLE_CREATE。也就是说这块看的是“创建进程句柄”这件事，DuplicateHandle 那条路不在这里。ObjectType 又是 PsProcessType，所以这里盯的是进程对象句柄。

对应注册代码大概是这样：

![](⚠️ https://bbs.kanxue.com/src)

继续跟进 sub_1400529A4。这个函数就是 Ob 的 PreOperation 回调，第二个参数 a2 可以按 POB_PRE_OPERATION_INFORMATION 看。它后面读的几个偏移基本能对上：

·a2 + 0x00 = Operation

·a2 + 0x04 = Flags

·a2 + 0x08 = Object

·a2 + 0x10 = ObjectType

·a2 + 0x20 = Parameters

一上来先卡几层基础条件：当前 IRQL 要是 0，a2 和 a2->Object 要能过 sub_1400C16D3，Info->Flags & 1 要等于 0，并且 ObjectType 必须等于 PsProcessType。sub_1400C16D3 里面能解出 MmIsAddressValid，所以这里就是先防一下空指针和无效地址。

然后它拿 a2->Object 调 PsGetProcessId，这个得到的是“被打开的进程 PID”。接着它调 PsGetCurrentProcessId，拿到的是“正在打开句柄的进程 PID”。

这里先提前说一下，qword_140344968 后面 【3.2】会讲，它就是进程回调里记下来的 cs2 PID。所以 Ob 这里筛得很直白：

TargetPid = PsGetProcessId(a2->Object)

CurrentPid = PsGetCurrentProcessId()

TargetPid!= qword_140344968 -> return

CurrentPid == qword_140344968 -> return

CurrentPid == qword_140344980 -> return

Operation!= 1 -> return

翻成人话就是：只有外部进程打开 cs2 进程句柄，它才继续。cs2 自己打开自己会被过滤掉，打开的目标不是 cs2 也会被过滤掉。qword_140344980 看起来像前面记下来的一个排除 PID，这里碰到也直接返回。

过了 PID 这层以后，它开始看权限。它读的是 a2->Parameters + 4，也就是 OriginalDesiredAccess。它关心的是这些位：

·0x2 PROCESS_CREATE_THREAD

·0x8 PROCESS_VM_OPERATION

·0x10 PROCESS_VM_READ

·0x20 PROCESS_VM_WRITE

·0x800 PROCESS_SUSPEND_RESUME

正常软件偶尔打开一下进程句柄不一定有事，但是要是创建线程、读写内存、改内存权限，那就很像后面要注入或者读游戏内存了。

权限过了以后，它会用 CurrentPid 调 sub_1400C6A64。里面是 PsLookupProcessByProcessId、ObOpenObjectByPointer、ZwQueryInformationProcess(ProcessImageFileName = 27)，最后拿到当前打开 cs2 句柄的那个进程的完整路径 UNICODE_STRING。

也就是说，如果 external_cheat.exe 在打开 cs2，这里拿到的就是 external_cheat.exe 的完整路径。

再往下，它和线程回调那边一样，会给这个打开者进程算一个主模块 PE header MD5。流程还是先走内存版 sub_14004D3CB：

·IoGetCurrentProcess

·PsGetProcessSectionBaseAddress

·从 section base 读 PE header

·清掉 TimeDateStamp 和 ImageBase

·对处理后的 PE header 算 MD5

如果内存里算失败，它还会走 sub_14004DED2，用刚才 sub_1400C6A64 查出来的完整路径打开磁盘上的 exe，读前 0x1000 字节，再用同样方式算一次 MD5。

两个函数算出来的 16 字节 MD5 都放到同一个小结构里，后面真正上报的时候传的是 info + 0x14。

最后才走 sub_14004E7EB，事件类型这里解出来是 3：

sub_14004E7EB(

CurrentPid,

openerImagePath,

3,

info + 0x14,

0,

0

);

对应的上报路径在这里：

![](⚠️ https://bbs.kanxue.com/src)

通俗点讲，这个 Ob 回调盯的就是谁在 OpenProcess cs2。

比如 external_cheat.exe 起来以后想打开 cs2：

OpenProcess(

PROCESS_VM_WRITE | PROCESS_VM_OPERATION | PROCESS_CREATE_THREAD,

...,

cs2_pid

);

这时候 Ob 回调能看到：目标进程是 cs2，当前进程是 external_cheat.exe，申请的权限里还带了 VM_WRITE / VM_OPERATION / CREATE_THREAD 这种敏感权限。然后它继续把 external_cheat.exe 的完整路径拿出来，再给 external_cheat.exe 的主模块 PE header 算 MD5，最后作为 type = 3 的事件丢给 sub_14004E7EB。

Ob 这里看的是“谁拿了 cs2 的进程句柄，以及拿句柄的时候要了什么权限”。如果发现某个外部进程拿 cs2 高权限句柄，这个外部进程的路径和 PE 头 MD5 就会直接被上报给客户端，事件类型是3（maybe是某美那边用来筛选用的）。

### 3.2 PsSetCreateProcessNotifyRoutine进程创建检测

在 0x14034C977（sub_14034C000里）驱动通过 off_140104608 + 0x3EF98FDBAFBD88A7 得到 PsSetCreateProcessNotifyRoutine函数，然后注册进程回调 sub_1400506E5。

![](⚠️ https://bbs.kanxue.com/src) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/1519b3a3c776f591.webp)

我们跟进这个sub_1400506E5 进程回调里。发现这个函数挺大的，会用到：

·PsLookupProcessByProcessId

·ObOpenObjectByPointer

·ZwQueryInformationProcess

·PsGetProcessImageFileName

·KeStackAttachProcess

·RtlInitUnicodeString

·wcsstr / \_stricmp

这些函数

通过这些api他可以知道：

·这个创建的进程叫什么

·路径是什么

·命令行是什么

·父进程是谁

·是不是它关心的目标

·当前上下文是谁

通过主播的不懈努力，成功解出来了他关心或者说匹配的目标是cs2.exe。。。

在 sub_1400506E5 里，流程是这样的：

![](⚠️ https://bbs.kanxue.com/src) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/c4904cb10d361a40.webp)

然后它运行时拼了一个“cs2.exe”字符串，对应的是0x140050E89 - 0x140050F68 那段

![](⚠️ https://bbs.kanxue.com/src) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/934d9bf884febb8f.webp)

接着把这次回调创建的Process它比较，如果比较结果是 0，就说明这次创建的进程是 cs2.exe：

![](⚠️ https://bbs.kanxue.com/src) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/8f0ca626000eb620.webp)

总结一下：

![](⚠️ https://bbs.kanxue.com/src) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/a275cfcf93730ba7.webp)

然后命中了就会走我上面说的写入全局变量逻辑，表示cs2启动了，也就是要开始打游戏需要保护cs2不被注入cheat了

目标进程退出的时候，它还会把这些全局变量清掉。这个逻辑也挺正常，不然 cs2 退出以后，后面 PID 复用或者别的进程创建线程，就容易把旧状态带进去。

这个全局变量后面【3.3】的线程回调 sub_1400523D4 会用到。现在这个进程回调把“我要盯cs2”记下来，线程回调再看“是不是有人往这个目标进程里创建新线程”

举个简单的例子：

![](⚠️ https://bbs.kanxue.com/src) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/41664e0c2451dff5.webp)

![](⚠️ https://bbs.kanxue.com/src) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/bfb12fd71a2afc9a.webp)

![](⚠️ https://bbs.kanxue.com/src) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/97e4924c3b47b5b7.webp)

![](⚠️ https://bbs.kanxue.com/src) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/aead93ec3846828c.webp)

对某美驱动来说，进程创建回调可以先记录这些东西：

·哪个 exe 启动了

·它的路径是什么

·命令行是什么

·父进程是谁

·它是不是 cs2.exe

·它是不是在 cs2 运行之后才出现

·配合 Ob 回调看它有没有尝试打开 cs2 进程句柄

·配合线程回调看它有没有往 cs2 里创建新线程

最后这些信息会进 sub_14004E7EB 统一打包，后面再通过 \\PacDomain 这条通信链路丢给用户态（但是大概率只是确认反作弊是否正常的）。

### 3.3 PsSetLoadImageNotifyRoutine模块加载检测

模块加载回调也是在 sub_14034C000 注册的。位置在 0x14034C48B，回调是sub_140051B1D。

![](⚠️ https://bbs.kanxue.com/src) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/3d47442d1f3cfd64.webp)

sub_140051B1D 镜像加载回调中，里面看到一个格式化痕迹：L"0x%I64x-%d"，个字符串实际构建的是加载dll + dll大小，比如：0x7ff612340000-204800 这种。

![](⚠️ https://bbs.kanxue.com/src) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/84c3380b41daf6cd.webp)

一开始我看到这里也以为它就是拿 FullImageName 拼个字符串然后上报 DLL，结果继续往下跟了一下发现没这么简单。sub_140051B1D 里面虽然控制流被平铺得很烦，但是把真正干活的调用抽出来以后，链路还是挺直白的，先拿ImageInfo：

![](⚠️ https://bbs.kanxue.com/src) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/4f0a004c54b33dd4.webp)

然后就是一些神笔早退条件，它要求 ImageInfo 有效，后面从 ImageInfo->FileObject 取对象名；一些 Properties 位判断夹在中间，明显是在筛回调场景，防止一堆正常的dll或者sys加载被上报污染分析。

然后它从 nonpaged pool 拿了一块 0x400 大小的缓冲区，调的是：

![](⚠️ https://bbs.kanxue.com/src) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/38551ce9c82b7a3c.webp)

ObQueryNameString 这个名字已经很直白了，就是从这次加载对应的 FILE_OBJECT 里把对象路径拿出来。后面再走sub_14004E7EB，也就是塞进前面那套统一事件上报队列管线，下面是的主UNICODE_STRING是（文件对象名 + ImageBase-ImageSize + 一块附带的 16 字节字段）：

![](⚠️ https://bbs.kanxue.com/src) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/eb0b08187aae3911.webp)

那么它到底都能检测到什么场景呢，这是我的一些猜想：

·DSE Bypass加载的无签名驱动

·StandInject 这种走 LoadLibrary 的常规 DLL 注入

### 3.4 PsSetCreateThreadNotifyRoutine线程创建检测

草了写了半天终于写到一个很常规的了，首先这边同样来自 sub_14034C000。位置在 0x14034C4FC，回调是sub_1400523D4，他能监视两个事情：

·某个进程里新线程出现了

·某个线程退出了

他的回调有三个标准入参：

VOID ThreadNotify(

HANDLE ProcessId,

HANDLE ThreadId,

BOOLEAN Create

);

![](⚠️ https://bbs.kanxue.com/src) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/f455add4a98aa45a.webp)

然后我们进入回调，再次解密导入表和这些间接跳转，得到：

![](⚠️ https://bbs.kanxue.com/src) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/0497a7c8835dd67d.webp)

![](⚠️ https://bbs.kanxue.com/src) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/40a30fb63ddb8f32.webp)

发现他会先把Create 和 0 比较，Create == 0 直接返回。所以线程退出它不管，它只看线程创建的事件，然后它要求 qword_140344968 已经有值。这个值是前面进程回调里记下来的cs2进程，没有cs2进程它也不干活。接着它调 PsGetCurrentProcessId 拿当前 PID。这里就能看出它筛得很窄（ProcessId是cs2的pid，CurrentPid拿到的是当前创建这个线程的程序的pid）：

![](⚠️ https://bbs.kanxue.com/src) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/e083fb2d1b95ea83.webp)

也就是说，cs2进程自己正常创建线程会被过滤掉。只有外部程序给cs2创建线程才会进入下一步。继续往下，它会用 CurrentPid 调 sub_1400C6A64，然后sub_1400C6A64 这里补的是“创建线程的那个进程”的信息。这个函数里面能解出：

![](⚠️ https://bbs.kanxue.com/src) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/62b81a78db1af7c8.webp)

也就是说它会把 CurrentPid 对应的进程信息查出来，比如路径、进程对象、映像信息之类的东西。后面这些信息有两个用途：一个是上报时带上“是谁在创建线程”，另一个是给后面的磁盘 PE 头指纹计算用。

再往下，它会调 IoGetCurrentProcess，然后调 PsGetProcessSectionBaseAddress。这里拿到的是当前进程的 section base，也就是“创建线程的那个进程”的主模块基址。接着它会走 sub_14004D3CB，实际干的事情好像是给CurrentPid进程的主模块 PE 头算一个 MD5 指纹：

![](⚠️ https://bbs.kanxue.com/src) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/474f10f2469ac170.webp)

它会从 section base 开始读 PE header，大概流程是：

·ProbeForRead

·IoAllocateMdl

·MmProbeAndLockPages

·MmMapLockedPagesSpecifyCache

·检查 MZ

·检查 e_lfanew

·检查 Machine 是 0x14C 或 0x8664

·取 SizeOfHeaders

·复制 PE header

·把 TimeDateStamp 清 0

·把 ImageBase 清 0

·对处理后的 PE header 算 MD5

算出来的 16 字节 MD5 会写到 info + 0x14，如果 sub_14004D3CB 成功，后面就继续走线程起点查询。如果它失败了，还不会马上放弃，它会再走 sub_14004DED2

![](⚠️ https://bbs.kanxue.com/src) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/5ce78cc193ecfae9.webp)

sub_14004DED2 是磁盘 fallback。它会拿前面查出来的创建者进程路径，打开磁盘上的 exe：

![](⚠️ https://bbs.kanxue.com/src) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/40d63eed367f38f6.webp)

然后用差不多的方式检查 PE header，清掉 TimeDateStamp 和 ImageBase，再算一次 MD5，也写到 info + 0x14。

通俗点讲就是你敢拿一个注入器在r3创建线程，某美就会把创建线程那个进程的主模块 PE header生成md5然后去看他特征库里的cheat有没有和这个一样的md5，如果有就banned，如果没有此时你已经暴漏了，很快就会被录入然后拉闸。

这个 MD5 不是整个 exe 的文件 MD5，而是 PE header 处理后的指纹。好处就是体积小、上报方便，而且比单纯进程名靠谱。把 exe 改个名字没用，路径换一下也没用，只要 PE 头特征还对得上，它就能认出来。

当然，这里驱动里我目前只能确定它生成并上报这个 MD5。至于后面是客户端本地查库，还是传到云端查库，这个要继续看用户态那边，大概率是云端更新规则。但从反作弊角度看，这个字段明显就是为了做特征匹配准备的。

然后它还没完。拿到创建者进程的 PE 头 MD5 以后，它会继续走 sub_140070446，用 ProcessId 和 ThreadId 去打开这个新线程：

![](⚠️ https://bbs.kanxue.com/src) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/c4e4fb59a9c712f0.webp)

这里 ZwQueryInformationThread 的信息类是 9，也就是ThreadQuerySetWin32StartAddress。也就是它会尝试查这个新线程从哪个用户态地址开始跑，这就是非常关键的检测点了。因为正常程序自己创建线程，线程起点一般会落在自己模块、系统 DLL、运行库这些比较正常的位置。你如果是注入器往 cs2 里开线程，那这个线程起点就很容易变得难看：

·落在 LoadLibraryW

·落在 VirtualAlloc 出来的 shellcode

·落在 manual map 出来的匿名内存

·落在一个没有正常模块信息的地址

所以这条线程事件最后上报至少带了这些东西：

·谁创建的线程

·线程创建到了哪个进程里

·创建者进程的 PE header MD5

·这个线程的 Win32StartAddress

·前面 Ob 回调有没有看到它打开 cs2 进程句柄

这些东西一起上报以后，反作弊就很好判断了。单独看一个 CreateRemoteThread 可能还能狡辩，单独看一个 exe 也可能只是普通软件。但是：

![](⚠️ https://bbs.kanxue.com/src) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/7e30022c290764fb.webp)

基本上就是完整取证了，我觉得工作人员只要智商没问题看一眼把这个md5加进去就全拉闸了xD

到这里，线程回调这一块就能结束了：

它盯的核心就是外部进程给 cs2 创建线程。正常 cs2 自己创建线程会被过滤掉，不是 cs2 的线程事件也会被过滤掉。真正留下来的，是那种 CurrentPid!= cs2，但 ProcessId == cs2 的情况。也就是别人往 cs2 里开线程。

这对 R3 注入器已经检测死了。你只要走 CreateRemoteThread 这条路，第一步给 cs2 创建新线程已经被从内核回调里抓到了。

最后，这个回调也是走 sub_14004E7EB 上报线程事件，事件类型是 2。它有两条上报路径：

·查到线程起点字符串就带着 buffer + 0x218 上报

·没查到也会上报，只是第六个字符串参数为空

[#调试逆向](https://bbs.kanxue.com/forum-4-1-1.htm) [#系统底层](https://bbs.kanxue.com/forum-4-1-2.htm) [#加密算法](https://bbs.kanxue.com/forum-4-1-5.htm)
