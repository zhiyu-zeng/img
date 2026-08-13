---
title: 【看雪】右下角Windows Toast通知逆向（拦截与绕过）
source: https://bbs.kanxue.com/thread-292498.htm
source_host: bbs.kanxue.com
clip_date: 2026-08-13T16:14:28+08:00
trace_id: 44940624-9576-4cb7-bcb4-3efba44a60dc
content_hash: e2b353aaab5800e69dd23d85b12c29ef98736e1b3bab25fe2d3bbb2a962340f7
status: synced
tags:
  - 看雪
  - Windows逆向
  - Hook
series: null
feed_source: 看雪·逆向工程
ai_summary: Windows Toast通知实为svchost中WpnUserService的RPC调用；在rpcrt4!NdrStubCall3按GUID与ProcNum过滤即可定位PostNotification3并Hook其COM虚表，实现静默拦截，也可随机化AppId或还原补丁绕过拦截。
ai_summary_style: key-points
images_status:
  total: 12
  succeeded: 12
  failed_urls: []
notion_page_id: 3bb75244-d011-813a-a1a9-da85239dd894
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Windows Toast通知实为svchost中WpnUserService的RPC调用；在rpcrt4!NdrStubCall3按GUID与ProcNum过滤即可定位PostNotification3并Hook其COM虚表，实现静默拦截，也可随机化AppId或还原补丁绕过拦截。
> 
> - **调用链定位：** 弹窗进程经rpcrt4.dll的RPC调用svchost.exe，所有RPC服务端stub统一进入rpcrt4!NdrStubCall3；其第3参数（r8）指向RPC_MESSAGE，偏移0x1C为ProcNum，偏移0x28为RpcInterfaceInformation。
> - **目标判定：** 使用条件断点 `bp rpcrt4!NdrStubCall3 ".if (dwo(@r8+0x1c)=0x29) {} .else {g}"` 过滤，命中后读出IID {926516E8-D891-45BC-9DE5-6959FB8ECAC5}，对应IWpnAppEndpoint3的PostNotification3（opnum=0x29）。
> - **真实地址获取：** RPC_SERVER_INTERFACE.DispatchTable存放解释器结构，不能直接当函数指针数组读；改用COM路径：从`pThis+0x10`取pvServerObject，再取`vtable[0x29]`即得到PostNotification3入口。
> - **拦截实现：** 两层Detours Hook：第一层在NdrStubCall3做GUID+ProcNum双重匹配，第二层在wpncore!AppEndpoint::PostNotification按进程名/AppId匹配；命中则返回0（S_OK），Toast被静默阻止。INotificationHandlerProxyVtbl中GetAppId、GetType、GetPayloadData分别位于vtable索引4、5、6，GetPayloadType位于索引15。
> - **绕过方案：** 随机化WinToast的AppId（避免以"10"开头）可改变匹配规则；Unhook采用“远程内存字节 vs 磁盘DLL同RVA原始字节”对比恢复，定位svchost实例可扫描命令行"-s WpnUserService"，NdrStubCall3用“本地偏移+远程基址”定位，PostNotification3不在导出表需扫描.text段中的E9/FF25补丁模式。

Windows Toast通知是从屏幕底部弹出来的一个通知，十分烦人，加上官方似乎没有好的方法拦截这个通知知，我们于是写了一个程序拦截，下面是逆向思路

## 通知怎么弹出来的与RPC调用

为了研究通知弹出的原理，我们写了一个弹窗程序，其目的是弹出一个示例弹窗，在使用Process Monitor监控发现，它加载了rpcrt4.dll，一个典型的RPC调用dll，于是我怀疑这个是通过RPC到svchost.exe中实现调用的  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/ae6ed38f7aaaa2ee.webp)  
通过RpcView，可以进一步确定这就是RPC调用svchost.exe的弹窗，通过服务管理器和Process Explorer，可以确定是哪一个进程  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/baa38b783bdaf8e7.webp)

## RPC统一入口：NdrStubCall3

Windows RPC框架中，MIDL编译器为每个RPC接口生成服务端stub。所有stub最终都调用rpcrt4.dll中的同一个分发函数。在x64上，这个函数就是NdrStubCall3。这个是参考ReactOS和Wine和Windows Internals得出的结论，在Windows11上进行验证  
首先： *x rpcrt4!NdrStub*  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/5b3bca673e8100a6.webp)  
可以看到，有意义的只有NdrStubCall3和NdrStubCall2，NdrStubCall2是旧版（x86），NdrStubCall3是x64版本（ReactOS/Wine源码也可印证）。我们在NdrStubCall3上下断点，在断点命中后kvn。  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/317c4d722f76ea72.webp)  
至此，我们确定所有RPC调用都经过这里。下一步，就是在NdrStubCall3中筛选目标调用。

## 在NdrStubCall3中筛选目标调用

NdrStubCall3处理svchost.exe中的所有RPC接口（不只Toast），所以需要从大量命中中筛选出目标。之前以为这里只有Toast通知，结果写完发现Edge起不来了。  
下面是正确思路：

### NdStubCall3的参数

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/64977d840a6fbaa9.webp)  
这段汇编可以显然看出，NdrStubCall3是一个多参数函数，结合IDA符号分析，我们可以知道NdrStubCall3的第三个参数（x64下为r8）指向RPC_MESSAGE

```python
    RPC_MESSAGE (x64) 关键偏移
  +0x1C  ProcNum: u32              <-- 方法编号
  +0x28  RpcInterfaceInformation   <-- 接口描述指针RPC_MESSAGE:
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/9987b225058650df.webp)  
NdrStubCall3的第三个参数（x64下为r8）指向RPC_MESSAGE，在结构体偏移0x1C处是方法编号ProcNum，在结构体0x28处是接口描述指针RpcInterfaceInformation，而RpcInterfaceInformation指向RPC_SERVER_INTERFACE。

### RPC_SERVER_INTERFACE

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/5a1bdc0d9cef5eaa.webp)  
根据结构体定义可以发现，InterfaceId (RPC_SYNTAX_IDENTIFIER) 位于0x04处，下面来分析PostNotification3的调用参数及编号  
**下面先简单介绍一下ProcNum是怎么来的以及从IDL到RPC_MESSAGE的完整链路**  
ProcNum是DCE/RPC协议中的操作编号。它的来源必须追溯到MIDL编译流程，Windows Internals、Wine和ReactOS的源码都印证了这一机制。首先，接口定义在IDL文件中。以WpnAppEndpoint为例（简化示意）：

```python
    [
      uuid(926516E8-D891-45BC-9DE5-6959FB8ECAC5),
      version(3.0)
    ]
    interface IWpnAppEndpoint3
    {
        // ... 前面的 0x00 ~ 0x28 号方法 ...
        HRESULT PostNotification3([in] handle_t hBinding, ...);  // opnum = 0x29
    }
```

MIDL编译器解析IDL后，按方法声明顺序从0开始自动编号。PostNotification3排在接口的第0x29位（即第41个方法），所以它的opnum就是0x29。  
Windows Internals Part 1 第7章提到： *"Each method in an interface is assigned an operation number (opnum) by the MIDL compiler, which is used by the RPC runtime to dispatch calls."*  
MIDL编译IDL时同时生成客户端代理代码（\*\_p.c 或 \*\_c.c）。在Wine源码 wine/dlls/rpcrt4/ndr_stubless.c 中可以看到ObjectStublessClient的实现模式：

```python
    // 每个ObjectStublessClientN函数中，eax/rax被设置为方法索引N
    void __stdcall ObjectStublessClient4(IUnknown *This, ...)
    {
        // eax = 4 (or rax = 4 on x64) -- 这就是ProcNum
        // 然后跳转到 ObjectStubless 统一入口
        __asm { mov eax, 4; jmp ObjectStubless }
}
```

这正是我们在WinDbg中看到的反汇编：

```python
    combase!ObjectStublessClient4:
    mov     eax, 4                   ; 方法索引 = ProcNum
    jmp     combase!ObjectStubless   ; 统一编组入口
```

在Wine的 rpcrt4/ndr_stubless.c 中，ObjectStubless函数会把这个方法索引写入RPC_MESSAGE：

```python
    // Wine: wine/dlls/rpcrt4/ndr_stubless.c
    // ObjectStubless内部将方法索引填入MSG.ProcNum
    MSG.ProcNum = ProcNumFromEAX;  // 即调用方的 eax/rax 值
```

正是RPC_MESSAGE这个结构决定了我们在WinDbg中用 dd @r8+0x1c 读取ProcNum、用 dq @r8+0x28 读取RpcInterfaceInformation。  
RPC运行时将客户端的RPC_MESSAGE透传到服务端。服务端的NdrStubCall3收到PRPC_MESSAGE后，用 pRpcMsg->ProcNum 作为索引在DispatchTable中查找对应的服务端实现函数。  
Windows Internals Part 1 解释： *"The server-side RPC runtime uses the opnum to index into the dispatch table generated by MIDL, calling the appropriate server function."* 这就是为什么 vtable\[0x29\] 对应 PostNotification3。

根据上述Wine和ReactOS的分析，加上少许的IDA分析，PostNotification3对应ProcNum 0x29。我们用条件断点过滤：

```python
bp rpcrt4!NdrStubCall3 ".if (dwo(@r8+0x1c) = 0x29) {} .else {g}"
```

弹Toast导致断点命中后分析上下文，根据前文分析验证GUID：

```python
dt ole32!GUID poi(@r8+0x28)+0x04
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/1a863d35b3921447.webp)  
输出了{926516e8-d891-45bc-9de5-6959fb8ecac5}，这就是IID_IWpnAppEndpoint3

## 从DispatchTable定位PostNotification3真实地址

RPC_DISPATCH_TABLE里面实际包含的是一个解释器结构，直接当函数指针数组读不可靠。代码走的是更可靠的COM vtable路径：

```python
dq @rcx+0x10 L1                       # pThis = rcx, 取pvServerObject
dps poi(poi(@rcx+0x10)) + 0x29*8 L1 # vtable[0x29]
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/4305f87b37578ccc.webp)  
于是，我们确定了目标函数的地址

## 分析PostNotification3的参数

在PostNotification3入口下断，弹Toast命中后，x64 calling convention寄存器含义如下：

```python
rcx = pThis
rdx = INotificationHandlerProxy*   <-- 关键
r8  = TransientNotificationDetails
r9  = nType
```

然后查看第二个参数的虚表

```python
dps poi(@rdx) L30
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/8eacc47059a739d4.webp)  
为什么虚表全是ObjectStublessClient？这不是错误。INotificationHandlerProxy的真正实现在发起Toast的应用进程中，而非svchost。svchost中拿到的是COM框架自动生成的Proxy Stub。  
ObjectStublessClient4（vtable\[4\]）内部做的事情就是 mov eax, 4（方法索引），然后跳转到ObjectStubless完成 序列化->ALPC->反序列化->调用远端->返回 的完整编组流程。  
这对我们的拦截代码没有任何影响——COM代理透明地完成任务，我们只需要按偏移调用虚表即可。

## 虚表布局确认

结合WinDbg验证和源码和符号表定义，最终 INotificationHandlerProxyVtbl 布局如下

```python
索引    偏移      对应方法           签名    
----    ----      ----------         -----    
0       0x00      QueryInterface     COM标准    
1       0x08      AddRef             COM标准    
2       0x10      Release            COM标准   
3       0x18      Unknown            -   
4       0x20      GetAppId           (pThis, LPWSTR*) -> HRESULT   
5       0x28      GetType            (pThis, LPWSTR*) -> HRESULT   
6       0x30      GetPayloadData     (pThis, IStream**) -> HRESULT   
7-14    0x38-0x70 Unknown            -   
15      0x78      GetPayloadType     (pThis, LPWSTR*) -> HRESULT  
```

由此，我们完成了逆向分析

## 程序代码解释

## 数据结构定义

源码首先定义了从WinDbg逆向中确认的几个核心结构体

### INotificationHandlerProxyVtbl

回顾之前的 WinDbg 输出：

```python
偏移    虚表内容
0x00    combase!IUnknown_QueryInterface_Proxy    <- PUCHAR pfnQueryInterface
0x08    combase!IUnknown_AddRef_Proxy  <- PUCHAR pfnAddref
0x10    combase!IUnknown_Release_Proxy  <- PUCHAR pfnRelease
0x18    combase!ObjectStublessClient3     <- PUCHAR pfnUnkown1
0x20    combase!ObjectStublessClient4     <- GetAppId_Type pfnGetAppId
0x28    combase!ObjectStublessClient5     <- GetType_Type pfnGetType
0x30    combase!ObjectStublessClient6     <- GetPayloadData_Type-pfnGetPayloadData
0x38    combase!ObjectStublessClient7     <- PUCHAR pfnUnkown5
//Skip…..
 0x78    combase!ObjectStublessClient15    <- GetPayloadType_Type pfnGetPayloadType
```

改写好的结构体布局

```python
struct INotificationHandlerProxyVtbl
  {
      PUCHAR               pfnQueryInterface;    // 0x00
      PUCHAR               pfnAddref;            // 0x08
      PUCHAR               pfnRelease;           // 0x10
      PUCHAR               pfnUnkown1;           // 0x18
      GetAppId_Type        pfnGetAppId;          // 0x20
      GetType_Type         pfnGetType;           // 0x28
      GetPayloadData_Type  pfnGetPayloadData;    // 0x30
      PUCHAR               pfnUnkown5;           // 0x38
      PUCHAR               pfnUnkown6;           // 0x40
      PUCHAR               pfnUnkown7;           // 0x48
      PUCHAR               pfnUnkown8;           // 0x50
      PUCHAR               pfnUnkown9;           // 0x58
      PUCHAR               pfnUnkown10;          // 0x60
      PUCHAR               pfnUnkown11;          // 0x68
      PUCHAR               pfnUnkown12;          // 0x70
      GetPayloadType_Type  pfnGetPayloadType;    // 0x78
  };
```

对应本文虚表布局。前三个槽位（0x00-0x10）是IUnknown三剑客，用PUCHAR占位（只需知道存在即可，不需要调用）。0x18是未知方法，同样占位。0x20起才是真正要用的GetAppId、GetType、GetPayloadData，0x78是GetPayloadType。中间0x38-0x70的未知槽位全部用PUCHAR填充，保证对齐到正确的偏移。  
在 WinDbg 输出中，ObjectStublessClient3 的 "3" 对应 vtable 索引 3（偏移 0x18），ObjectStublessClient4 对应索引 4（偏移 0x20），以此类推。编号 N 就是 vtable 中的槽位索引。这从侧面验证了虚表共有 16 个槽位（索引 015，偏移 0x000x78），每个 8 字节，总计 0x80 字节。  
对于需要调用的四个方法，源码定义了精确的函数指针类型：

```python
  typedef ULONG(WINAPI* GetAppId_Type)      (PVOID pThis, LPWSTR*);
  typedef ULONG(WINAPI* GetType_Type)       (PVOID pThis, LPWSTR*);
  typedef ULONG(WINAPI* GetPayloadType_Type)(PVOID pThis, LPWSTR*);
  typedef ULONG(WINAPI* GetPayloadData_Type)(PVOID pThis, IStream**);
```

WINAPI 在 x64 下展开为空，但保留可移植性。返回值为 ULONG（即 HRESULT），两个参数：pThis 是 COM this 指针，第二个参数是输出参数指针。  
GetAppId/GetType/GetPayloadType 输出 LPWSTR\*（宽字符串），GetPayloadData 输出 IStream\*\*（COM 流接口）。调用方通过 CoTaskMemFree 释放 LPWSTR，通过 IStream::Read 读取 XML 数据，通过 IStream::Release 释放。

### PostNotification3_Type

函数指针类型定义。6个参数，前两个最关键：pThis（COM this指针）和NotificationHandlerProxy。签名完全匹配在WinDbg中观察到的x64 调用约定。

### IID_IWpnAppEndpoint3 和 POSTNOTIFICATION3_PROCNUM (0x29)

这两个常量直接来自WinDbg的断点命中结果：GUID从 dt ole32!GUID 读出，ProcNum从 dd @r8+0x1c 读出。

## 第一拦截：NdrStubCall3_Proxy

这个函数是整个方案的核心调度器，对应本文在NdrStubCall3中筛选目标调用。

### 从pRpcMsg提取RPC接口信息

```python
  PRPC_SERVER_INTERFACE pIf = (PRPC_SERVER_INTERFACE)pRpcMsg->RpcInterfaceInformation;
```

pRpcMsg是NdrStubCall3的第三个参数，它的RpcInterfaceInformation字段指向RPC_SERVER_INTERFACE结构。这正是我们在WinDbg中通过 poi(@r8+0x28) 读到的那个地址。

### GUID + ProcNum双重匹配

```python
  if (IsEqualGUID(pIf->InterfaceId.SyntaxGUID, IID_IWpnAppEndpoint3)
      && pRpcMsg->ProcNum == POSTNOTIFICATION3_PROCNUM)
```

这正是在WinDbg中手动做的检查，看 dd @r8+0x1c 看ProcNum是否为0x29。

### 原子操作防重入

```python
  if (InterlockedCompareExchange(&g_bHookAttempted, 1, 0) != 0)
      goto CALL_ORIGINAL;
```

svchost多线程并发处理RPC调用。InterlockedCompareExchange保证只有第一个匹配的线程执行Hook操作，后续线程直接跳过。

### COM vtable定位PostNotification3

```python
  IUnknown* pServer = *(IUnknown**)((BYTE*)pThis + 0x10);
  PVOID* vtable = *(PVOID**)pServer;
  g_OriginalPostNotif3 = (PostNotification3_Type)vtable[POSTNOTIFICATION3_PROCNUM];
```

这对应WinDbg中的命令：dq @rcx+0x10 L1 然后 dps poi(poi(@rcx+0x10)) + 0x29*8 L1。pThis偏移0x10处是COM对象的pvServerObject指针，其虚表首项指向vtable数组，vtable\[0x29\]就是PostNotification3。  
注意：代码并没有使用RPC_SERVER_INTERFACE.DispatchTable（即 poi(@r8+0x28)+0x30），因为那里存的是解释器结构而非直接的函数指针数组（这在之前已分析过）。走COM vtable路径更可靠。

## 第二拦截：PostNotification3_Proxy

这个函数在PostNotification3被调用时触发，执行实际的拦截和内容提取

### 调用GetAppId获取通知来源

```python
  if (FAILED(SafeCallVTable(pProxy, (PUCHAR)vtb->pfnGetAppId, (PVOID)&lpAppId)) || !lpAppId)
      goto ALLOW;
```

SafeCallVTable封装了虚表调用：将pfnGetAppId（一个PUCHAR函数指针）强转为函数并调用，传入pThis和输出参数&lpAppId。这完全对应WinDbg中看到的 vtable\[4\] ObjectStublessClient4 -> GetAppId。  
调用端（Toast.exe）的INotificationHandlerProxy实现会返回应用标识符字符串，比如 "Microsoft.WindowsStore_8wekyb3d8bbwe!App" 或 "none.wintoast.test.10"。

### 拦截执行

```python
  if (bBlocked) {
      DbgPrint(L"[ToastBlocker] BLOCKED toast ...");
      CoTaskMemFree(lpAppId);
      return 0;   // 模拟成功返回，通知不会弹出
  }
```

直接返回0（S_OK），不调用原始PostNotification3。系统以为通知已成功处理，但实际上什么也没发生——Toast被静默阻止。

```python
ALLOW:
  return g_OriginalPostNotif3(pThis, pProxy, ...);
```

对于不匹配拦截规则的通知，透传给原始PostNotification3正常处理。

## 绕过方法解释

## 前置背景

ToastCatcherDll 通过两层 Detours Hook 拦截 Windows Toast 通知，我们只需要绕过这些拦截点即可  
**第一层 Hook**: rpcrt4!NdrStubCall3，NdrStubCall3_Proxy检查 GUID==926516E8-D891-45BC-9DE5-6959FB8ECAC5&& ProcNum==0x29，并从 COM vtable\[0x29\] 定位 PostNotification3 地址  
**第二层 Hook**: wpncore!AppEndpoint::PostNotification，这个钩子在首次命中时安装，PostNotification3_Proxy按进程名/AppId 匹配，拦截则 return S_OK，否则调用原始 PostNotification3  
在了解了这些技术点后，我们就知道了如何绕过

## 随机化AppId

我们先回顾一下代码中的拦截篇章部分

```python
if (dwClientPid && _wcsicmp(szProcName, BLOCKED_PROCESS_NAME) == 0){
        bBlocked = TRUE;
    }
    else if (!dwClientPid){
        if (wcsstr(lpAppId, L"none.wintoast.test.10"))
            bBlocked = TRUE;
    }
    if (bBlocked){
        DbgPrint(L"[ToastBlocker] BLOCKED toast (Proc=%s, AppId=%s)!\n", szProcName, lpAppId);
        CoTaskMemFree(lpAppId);
        return 0;   
    }
```

可以显然发现，在这里我们使用了两个参数进行拦截，一是进程名分析，二是AppId分析，这里着重讲一下随机化AppId的方法。因为AppId不会在Toast上显示，是一个方便的绕过途径  
我们先看WinToast库是如何把AppId作为参数传进去的

```python
WinToast::instance()->setAppName(L"Test");
const auto aumi = WinToast::configureAUMI(L"none", L"wintoast", L"test", L"10");
WinToast::instance()->setAppUserModelId(aumi);
```

可以显然发现，WinToast库通过configureAUMI实现AppId，那么我们只需要随机化AppId，就像这样

```python
WinToast::instance()->setAppName(L"Test");
srand((unsigned)time(nullptr));
WCHAR version[16];
do {
    swprintf_s(version, _countof(version), L"%u", rand() % 100000);
} while (wcsncmp(version, L"10", 2) == 0);   // 跳过 10/100/101... 等以 "10" 开头的值
const auto aumi = WinToast::configureAUMI(L"none", L"wintoast", L"test", version);
WinToast::instance()->setAppUserModelId(aumi);
```

随机化进程名的方法较为简单，这里不做介绍

## Unhook(脱钩)理论

既然挂钩了rpcrt4!NdrStubCall3和wpncore!AppEndpoint::PostNotification，那我们也可以脱钩，Detours库的经典挂钩方法是Inline Hook，我们可以采用对比磁盘文件的方法进行Unhook  
*我们对于任意地址 X，读取远程进程内存中 X 处的字节，再读取磁盘 DLL 文件中对应 RVA 处的原始字节若二者不等则 X 处被修改过，我们可以patch*  
那么，我们如何找到目标进程呢，因为WpnUserService 运行在某个 svchost.exe 实例中。定位方式如下  
我们通过命令行扫描 (CreateToolhelp32Snapshot)遍历所有 svchost.exe 进程，读其命令行参数（通过 NtQueryInformationProcess或远程 PEB），匹配 "-s WpnUserService" 标志。  
那么，如何定位NdrStubCall3呢  
NdrStubCall3是 rpcrt4.dll 的导出函数。在外部进程中无法直接 GetProcAddress，但可以通过"本地偏移 + 远程基址"方式算得：

```python
  // Local
  HMODULE hLocal      = GetModuleHandleW(L"rpcrt4.dll");
  PVOID   pFuncLocal  = GetProcAddress(hLocal, "NdrStubCall3");
  DWORD_PTR offset    = (DWORD_PTR)pFuncLocal - (DWORD_PTR)hLocal;
  // Remote
  DWORD_PTR remoteBase = GetRemoteModuleBase(hProcess, L"rpcrt4.dll");
  DWORD_PTR remoteAddr = remoteBase + offset;
```

下面简述PE文件的解析  
PE 文件在内存和磁盘上的布局不同：在内存中: 按 VirtualAddress 排列，节之间有页对齐间隙，在磁盘上: 按 PointerToRawData 排列，更紧凑，我们可以遍历节表，找到包含目标 RVA 的节，然后：

```python
  for each section:
      if rva in [VirtualAddress, VirtualAddress + VirtualSize):
          return (rva - VirtualAddress) + PointerToRawData;
```

注意: CreatFile时使用FILE_SHARE_WRITE | FILE_SHARE_DELETE 确保即使 DLL 被系统锁定也能打开读取。

## 恢复 NdrStubCall3与PostNotification3

恢复NdrStubCall3的方法不作赘述，这里重点讲述恢复PostNotification3  
PostNotification3 是 C++ 成员函数，不在 wpncore.dll 的导出表中。我们无法按名查找，因此对整个.text 段做扫描。  
读取远程 wpncore.dll 的 PE 头（前 4KB），解析节表找到.text:

```python
    textStart = wpncoreRemoteBase + pTextSec->VirtualAddress
textSize  = pTextSec->Misc.VirtualSize
```

每次从远程读取 4KB，在其中滑动窗口扫描，检测两种 JMP 模式:

```python
      E9      (5 字节，目标函数入口的补丁)
      FF 25   (6 字节，trampoline 内的间接 JMP)
```

对每个候选计算 RVA，并从磁盘文件读取对应 RVA 处的原始字节，再memcmp，相同则跳过，不同则恢复

## 其他方案

1.  阻止 DLL 注入：但对方有驱动，可能不行
2.  在 ToastCatcherDll 的 Hook 之前抢先 Hook，但对方加载更早，可能不行
3.  内存中直接篡改 ToastCatcherDll/ Hook VirtualProtect 阻止代码篡改：兼容性不佳
4.  走其他通知通道：目前还没有逆向

## 效果

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/2193f576c9050d2a.webp)  
解除钩子忘了截图了，但跑通了的

## 说在最后

这个是一个闲的没事的作品，源码和编译说明都在附件里面，Windows10/11均测试通过。  
源码目录解释  
CatchToast-----Toast弹窗程序  
ToastCatcherDll-Toast拦截Dll  
ToastInjector.cpp-svchost.exe注入器，用来注入ToastCatcherDll.dll。  
ToastUnhook.cpp---解除钩子程序，需要管理员权限  
编译直接跑bulid.bat即可，编译产物在bin下  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/1639a296aaf097bf.webp)  
薇尔莉特好看:)

[#调试逆向](https://bbs.kanxue.com/forum-4-1-1.htm) [#系统底层](https://bbs.kanxue.com/forum-4-1-2.htm) [#.NET平台](https://bbs.kanxue.com/forum-4-1-7.htm) [#问题讨论](https://bbs.kanxue.com/forum-4-1-197.htm) [#其他内容](https://bbs.kanxue.com/forum-4-1-10.htm)

## 附件

- [Toast.zip](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/attach/2026/08/d53b5a12789e0cdb.zip) （8.38MB，0次下载）
