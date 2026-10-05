---
title: 【微信】Black Hat USA 2026：AFD跨驱动信任链
source: https://mp.weixin.qq.com/s/kgClyHNF1MIZHAiKptre9g
source_host: mp.weixin.qq.com
clip_date: 2026-10-05T08:55:21+08:00
trace_id: a081a34f-4b19-48f6-9493-d1e5d675765c
content_hash: b0a47771e89181a9ecccadc3f031f25f882566621216585ca3a84eeb281b08f8
status: synced
tags:
  - 微信
  - 内核
  - 漏洞分析
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: AFD 漏洞链的根因是跨驱动信任与权限语义未随对象传递，单点补丁会被同一状态机的其他入口绕过。
ai_summary_style: key-points
images_status:
  total: 27
  succeeded: 27
  failed_urls: []
notion_page_id: 3f075244-d011-8119-b7db-edfd7f34ec46
ioc:
  cves:
    - CVE-2024-38193
    - CVE-2025-21418
    - CVE-2025-32709
    - CVE-2025-47996
    - CVE-2025-49658
    - CVE-2025-49659
    - CVE-2025-54093
    - CVE-2025-55230
    - CVE-2025-55339
    - CVE-2025-55679
    - CVE-2025-59513
    - CVE-2026-20860
    - CVE-2026-25176
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> AFD 漏洞链的根因是跨驱动信任与权限语义未随对象传递，单点补丁会被同一状态机的其他入口绕过。
> 
> - **一年三洞：** CVE-2024-38193 位于 `AfdConnect`，CVE-2025-21418 经 `AfdAccept` 绕过，CVE-2025-32709 经 `AfdSuperAccept` 再触发，说明缺的是状态机级不变量而非单函数校验。
> - **跨层入口：** 只审计 AFD_IOCTL 会漏掉下游对上游的信任，`tdx.sys`、`tcpip.sys`、`rfcomm.sys` 等产生 CVE-2025-49658/49659/54093/59513；内部 IOCTL 也必须按不可信输入验证长度、类型和嵌套偏移。
> - **权限漂移：** AFD 用 `IoCreateFileEx` 打开传输对象时未带 `IO_FORCE_ACCESS_CHECK`，`RequestorMode` 变为 `KernelMode`；`AfdQueryHandles` 又以 `KernelMode + MAXIMUM_ALLOWED` 导出句柄，造成二次权限放大。
> - **对象重解析：** endpoint 保存可重解析的传输名，符号链接可在 bind/connect 前改指 Mount Manager 或 NTFS，形成 TOCTOU，对应 CVE-2026-20860、CVE-2026-25176。
> - **逻辑利用：** Mount Manager 特权句柄可影响会话 DOS 映射，借 Network Service/Windows Media Sharing 与 DLL 劫持到 SYSTEM；无需堆喷、UAF 或 race，演示成功率 100%。修复需传播原始 RequestorMode、强制访问检查、导出做权限交集，并用发布门禁验证不变量。

**白帽子罗棋琛** *2026年10月4日 10:20*

## Windows 内核漏洞工厂：AFD 跨驱动信任链

> Black Hat USA 2026 议题笔记：Vulnerabilities Assembled! The Vulnerability Factory Inside the Windows Kernel

Windows 内核里最难处理的一类漏洞，并不一定藏在某个显眼的越界读写中。单看每个函数，它们可能都在做合理的事：AFD 根据套接字状态打开下层传输设备，I/O Manager 解析对象名，低层驱动接收内部 IOCTL，Object Manager 把内核对象转换成用户句柄。问题出在这些动作被跨阶段组合后，安全属性没有一起传递。

Angelboy 的公开课件以 `afd.sys` 为中心，解释了一个很有价值的审计视角：不要只问“这个 IOCTL handler 有没有校验长度”，还要问“谁选择了下游对象、对象身份是否会变化、下游为什么相信请求来自内核、最终句柄以谁的访问模式创建”。当四个问题同时出现缺口，一组看似互不相关的 Windows 组件就可能被组装成稳定的逻辑提权链。

![议题课件封面](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5befc9b4e3a12249.jpg)

*图 1：研究重点不是单一内存破坏点，而是 AFD 与多个内核组件之间可组合的信任关系*

本文基于公开课件复盘其工程含义，侧重防守方如何审计驱动、建立跨层不变量和补充遥测。涉及提权的部分只描述必要机制，不提供可直接运行的利用程序、对象重解析脚本或 DLL 劫持载荷。

## 1、三次修补同一问题，说明缺失的是不变量

课件从三起已在野利用的 AFD 漏洞开始：CVE-2024-38193 的问题位于 `AfdConnect` ，2024 年 8 月修复；半年后，CVE-2025-21418 可从 `AfdAccept` 绕过先前修复；又过三个月，CVE-2025-32709 经 `AfdSuperAccept` 触发同一底层问题。

![三起 AFD 在野漏洞](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/00a330c3269d3b5a.jpg)

*图 2：一年内出现三起 AFD 在野漏洞，后两次都与前一次的根因和修补边界有关*

![AfdConnect 中的首个问题](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6bb7de973133e406.jpg)

*图 3：CVE-2024-38193 来自 `AfdConnect` 路径缺少验证，并导致 Use-After-Free*

![AfdAccept 绕过修复](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/1b20bc497ee950d5.jpg)

*图 4：CVE-2025-21418 通过另一条入口到达相同底层状态，说明入口级补丁没有覆盖系统不变量*

![AfdSuperAccept 再次绕过](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/bc62336485049381.jpg)

*图 5：第三条入口再次击中同类问题，暴露的是状态机级别而非单个函数级别的缺口*

这类修复失败常见于大规模内核代码。开发者在一个调用点加入引用计数、状态判断或访问检查，但同一对象还能从另一个入口进入相同消费函数。补丁在代码层面是正确的，在系统层面却不完整。

审计时应先把约束写成不依赖入口函数的不变量，例如：

text

```
Invariant A：只要连接对象可能被异步使用，就必须持有有效引用。 Invariant B：所有进入同一状态迁移的入口，执行相同的前置校验。 Invariant C：传输对象一旦绑定，其对象身份和安全属性不得被名称重解析改变。 Invariant D：源自用户态的请求，跨驱动转发后仍按 UserMode 做访问检查。 Invariant E：返回用户态的句柄，其权限不得高于原始调用者可直接获得的权限。 
```

相应地，补丁 review 不该只看修改过的函数，而要找同一状态迁移的全部 producer：

powershell

```bash
# 防御性代码审计示例：列出可能进入连接/接受状态的入口与公共后端。$Symbols = @(   'AfdConnect',   'AfdAccept',   'AfdSuperAccept',   'AfdCreateConnection',   'AfdIssueDeviceControl' )  foreach ($Symbolin$Symbols) {   rg --line-number--glob'*.{c,cpp,h}'$Symbol'.\driver-src' } 
```

真正要验证的是：这些路径是否在同一个、无法绕过的 helper 中执行检查；检查失败后对象状态能否回滚；异步完成例程是否仍持有引用。把同一段 `if` 复制到三个 dispatch 函数，只会为第四次绕过留下空间。

## 2、AFD 不是普通网络驱动，而是传输设备的调度层

`afd.sys` 是 Winsock 的内核入口。用户态看见的是 socket、bind、connect、send；AFD 看到的则是 endpoint、connection、address file、transport provider 和一系列内部设备控制请求。它自己不是 TCP/IP 协议栈，而是把操作翻译并转交给 `tcpip.sys` 、 `tdx.sys` 、 `hvsocket.sys` 、 `rfcomm.sys` 等下层组件。

![AFD 与连接对象](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/1c4bfdeadd7e5d05.jpg)

*图 6：AFD endpoint 保存地址对象和传输信息，连接操作再通过文件对象与句柄向下层发请求*

课件将创建 socket 的传输选择分成三类：

-   TLI 模式只提供地址族、类型和协议，由 AFD 选择 AF_UNIX、TCP/IP 或 Hyper-V Socket 等 provider；
    
-   Hybrid 模式由调用者给出与参数兼容的 TCP、UDP、Raw IP 设备路径；
    
-   TDI 模式允许提供更自由的传输路径，例如 RFCOMM 或 PGM 设备。
    

AFD endpoint 中至少有三组字段直接参与后续安全决策：状态、 `TdiServiceFlags` 、 `AddressFileObject/AddressHandle` ，以及 `TransportInfo->TransportDeviceName` 。可用简化结构表示：

c

```
typedefstruct _AFD_ENDPOINT_VIEW {     ULONG State;     ULONG TdiServiceFlags;     PFILE_OBJECT AddressFileObject;     HANDLE AddressHandle;     PTRANSPORT_INFO TransportInfo; } AFD_ENDPOINT_VIEW;  typedefstruct _TRANSPORT_INFO_VIEW {     UNICODE_STRING TransportDeviceName;     ULONG AddressFamily;     ULONG SocketType;     ULONG Protocol; } TRANSPORT_INFO_VIEW; 
```

这些字段不是普通元数据。 `TransportDeviceName` 决定请求交给谁， `TdiServiceFlags` 可能影响访问检查模式， `AddressFileObject` 又能在后续被转换成用户句柄。也就是说，AFD 同时承担路由、状态和授权语义；如果三者没有绑定在一个不可变对象上，攻击面就不再局限于公开的 AFD IOCTL。

## 3、只审计 AFD_IOCTL，会漏掉真正的跨层入口

传统 AFD 审计通常从 `AfdIrpCallDispatch` 、 `AfdImmediateCallDispatch` 开始，逐个检查 `AfdBind` 、 `AfdConnect` 、 `AfdPoll` 、 `AfdQueryHandles` 等处理函数。这当然必要，但它默认了一个前提：漏洞一定在 AFD 消费用户缓冲区的地方。

![传统 AFD 攻击面](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/fe50d1e1b345b7cd.jpg)

*图 7：已知审计面集中在 AFD 的 IOCTL 分发函数，容易把下游驱动视为实现细节*

课件给出的反例是：低层传输驱动经常假设输入已经由 AFD 验证。对于内部 IOCTL，这种假设并非完全不合理——调用者通常确实是另一个内核驱动。但“请求来自内核组件”和“请求中的每个字段都可信”不是一回事。

![低层驱动信任上游](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7cecfab4060e9b73.jpg)

*图 8： `tdx.sys` 、 `tcpip.sys` 、 `rfcomm.sys` 等下层组件往往把 AFD 当作可信 producer*

研究者沿着这条边界发现多组漏洞： `tdx.sys` 的 CVE-2025-49658、CVE-2025-49659， `tcpip.sys` 的 CVE-2025-54093，以及 `rfcomm.sys` 的 CVE-2025-59513。CVE-2025-49659 的调用链从 `afd!AfdFastDatagramSend` 到 `tdx!TdxSendDatagramTransportAddress` ，下层存在固定尺寸假设。

![低层传输驱动漏洞清单](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6cda10cddb109e44.jpg)

*图 9：同一上游验证假设在多个 transport provider 中产生了独立漏洞*

![固定尺寸假设](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a780f3a2898631b9.jpg)

*图 10：当变长地址结构进入固定尺寸消费逻辑，问题已不在 AFD 的公开 handler 内*

驱动接口应把“内核调用者”与“可信输入”分开。即使是 `IRP_MJ_INTERNAL_DEVICE_CONTROL` ，消费端也要验证长度、类型、枚举范围、嵌套偏移和对象归属：

c

```cpp
NTSTATUS ValidateTransportAddress(     _In_reads_bytes_(InputLength) constvoid *Input,     _In_ size_t InputLength,     _Out_ const TRANSPORT_ADDRESS **Address) {     if (Input == NULL || Address == NULL ||         InputLength < sizeof(TRANSPORT_ADDRESS)) {         return STATUS_INVALID_PARAMETER;     }      const TRANSPORT_ADDRESS *ta = Input;     if (ta->TAAddressCount == 0 || ta->TAAddressCount > MAX_TA_COUNT) {         return STATUS_INVALID_PARAMETER;     }      if (!AllVariableEntriesFit(ta, InputLength)) {         return STATUS_INFO_LENGTH_MISMATCH;     }      *Address = ta;     return STATUS_SUCCESS; } 
```

关键不是这段样例是否覆盖全部 TDI 结构，而是消费驱动不能把“AFD 调过我”当成类型证明。所有跨驱动缓冲区都要按 hostile-but-well-formed 的输入处理。

## 4、把 transport 换成意外设备，攻击面就从函数变成组合

接下来问题发生了变化：如果 socket 所选的 transport 不是设计者预期的 TCP、UDP 或 RFCOMM，而是另一个恰好接受相同内部请求的设备，会怎样？

![意外的传输设备](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/18b638cca26fc6cc.jpg)

*图 11：AFD 的可达面不只由自身 IOCTL 决定，还由可被选中并接受请求的设备对象决定*

这不是简单的“任意设备可打开”。组合成立至少需要四个条件：

1.  用户可影响 AFD 保存的传输名称或其解析结果；
    
2.  目标设备允许在当前命名空间和令牌条件下被解析；
    
3.  AFD 在 bind/connect 阶段用足够高的权限打开该对象；
    
4.  后续操作把目标对象按原传输协议继续使用，或把它转换成用户可用句柄。
    

因此，攻击面清单不应只列 IOCTL，而应列“状态 × provider × 阶段 × 对象类型”的笛卡尔积：

yaml

```
afd_composition_matrix:states: [created, bound, connected, listening]   transport_modes: [tli, hybrid, tdi]   phases:-create_transport-create_address-create_connection-relay_internal_ioctl-export_handlesecurity_properties:-canonical_object_identity-requestor_mode-desired_access-force_access_check-object_type-creator_token
```

对每一个组合，审计者要核对对象类型是否符合预期、名称解析是否只发生一次、权限是否来自原始用户令牌，以及低层收到的结构是否由当前 provider 定义。课件在 NetBT 与 NDIS 的组合上给出了具体结果，包括 CVE-2025-55230、CVE-2025-47996、CVE-2025-55679 和 CVE-2025-55339。

![跨驱动组合发现的漏洞](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4c3b4d3c126d9144.jpg)

*图 12：NetBT 和 NDIS 不是传统 AFD handler，但能通过 transport composition 进入同一攻击面*

## 5、RequestorMode 丢失后，内核代理替用户获得了权限

NDIS 组合暴露了 Windows 驱动审计中一个经典问题：access mode mismatch。创建特定 socket 时，endpoint 的 `TdiServiceFlags` 可以为 0；绑定阶段，AFD 调用 `IoCreateFileEx` 打开下层对象，却没有带 `IO_FORCE_ACCESS_CHECK` 。

![缺少强制访问检查](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f0eaa1a0299f2db6.jpg)

*图 13：AFD 以内部内核路径打开 NDIS 对象，调用参数没有强制按原始用户身份检查*

请求继续向下时， `RequestorMode` 已表现为 `KernelMode` 。I/O Manager 和目标驱动因此可能跳过原本应对用户调用者执行的权限判断。结果不是“用户直接打开了特权对象”，而是 AFD 作为 confused deputy 代用户拿到了 `AddressFileObject` 。

![特权 AddressFileObject](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/edae065a5eda6a2a.jpg)

*图 14：内核代理创建的地址文件对象携带了调用者本不应拥有的访问能力*

安全封装必须显式接收原始请求来源，默认强制访问检查，不允许各调用点自由决定：

c

```cpp
NTSTATUS OpenTransportForRequest(     _In_ PIRP OriginatingIrp,     _In_ PCUNICODE_STRING CanonicalName,     _In_ ACCESS_MASK DesiredAccess,     _Out_ PHANDLE Handle) {     const KPROCESSOR_MODE origin = OriginatingIrp->RequestorMode;     if (origin != UserMode) {         return STATUS_INVALID_PARAMETER;     }      OBJECT_ATTRIBUTES oa;     InitializeObjectAttributes(         &oa,         (PUNICODE_STRING)CanonicalName,         OBJ_KERNEL_HANDLE | OBJ_CASE_INSENSITIVE,         NULL,         NULL);      IO_STATUS_BLOCK iosb = {0};     return IoCreateFileEx(         Handle,         DesiredAccess,         &oa,         &iosb,         NULL,         0,         0,         FILE_OPEN,         0,         NULL,         0,         CreateFileTypeNone,         NULL,         IO_FORCE_ACCESS_CHECK,         NULL); } 
```

生产代码还应限制 `DesiredAccess` ，验证对象类型，并根据实际接口设置 share、disposition 和 create option；这里最重要的设计点是： **访问检查是 API 契约，不是由某个 flag 间接推导的副作用。**

## 6、AfdQueryHandles 把内核对象重新导出，权限发生第二次放大

拿到特权 `AddressFileObject` 还不是完整链。 `AfdQueryHandles` 可以把 endpoint 保存的文件对象转换成用户句柄并返回。课件显示，该路径使用 `ObOpenObjectByPointer` 和 `MAXIMUM_ALLOWED` ，但 `AccessMode` 会根据 endpoint 状态在 `UserMode` 与 `KernelMode` 之间变化。

![AfdQueryHandles 的最大权限请求](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/9d1b7bd75878dad4.jpg)

*图 15：对象导出路径申请 `MAXIMUM_ALLOWED` ，最终权限高度依赖 access mode 的解释*

常规服务标志下，访问模式为 `UserMode` ，用户最终只能获得允许的只读权限；当 `TdiServiceFlags=0` 时，访问模式变为 `KernelMode` ，同一个对象转换可能得到完整权限。课件指出，NDIS 恰好留下了 `TDI_SERVICE_FORCE_ACCESS_CHECK` 未设置的状态。

![KernelMode 导出完整权限](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/886ac6d42ffc1e02.jpg)

*图 16： `TdiServiceFlags=0` 、 `KernelMode` 和 `MAXIMUM_ALLOWED` 组合后，句柄权限不再受原始用户令牌约束*

这段链包含两次权限语义转换：

text

```
用户请求   └─ AFD 代为打开对象        ├─ 缺少 IO_FORCE_ACCESS_CHECK        └─ 得到高权限 FileObject             └─ AfdQueryHandles 重新打开对象                  ├─ AccessMode = KernelMode                  ├─ DesiredAccess = MAXIMUM_ALLOWED                  └─ 返回用户态完整权限句柄 
```

修复不应只禁止某个 provider。更稳妥的接口是保存创建对象时的授权结果，并在导出时做权限交集：

c

```
ACCESS_MASK exportMask =     endpoint->GrantedToOriginalCaller &     endpoint->AllowedExportMask &     requestedMask;  if (exportMask == 0 || requestedMask == MAXIMUM_ALLOWED) {     return STATUS_ACCESS_DENIED; }  return ObOpenObjectByPointer(     endpoint->AddressFileObject,     0,     NULL,     exportMask,     *IoFileObjectType,     UserMode,     UserHandle); 
```

还要记录对象的来源 provider、创建者令牌摘要和规范化身份；否则即使权限交集正确，也可能把错误类型的对象合法地导出。

## 7、符号链接让“创建时验证”与“使用时对象”不是同一个东西

Windows Object Manager 支持符号链接。课件中的关键组合是：创建 socket 时，传输名称使用 `\RPC Control\XX` 之类的链接，最初指向预期设备；AFD 将名称保存在 `_TRANSPORT_INFO` 中。进入 bind 或 connect 前，链接被重新指向另一个设备。后续按名称再次打开时，得到的已不是创建阶段验证过的对象。

![endpoint 中的符号链接传输名](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/050b99c6509be4d1.jpg)

*图 17：endpoint 保存的是可再次解析的名称，而名称背后的对象可能跨阶段变化*

这是对象身份层面的 TOCTOU。普通文件系统审计会警惕路径重解析，但驱动开发中容易把 NT 对象名当成稳定标识。实际上，字符串相同只说明命名入口相同，并不证明解析出的 `DEVICE_OBJECT/FILE_OBJECT` 相同。

课件通过这种方式组合出 CVE-2026-20860：创建、绑定、连接阶段使用的底层 FileObject 与 Handle 不再属于同一 provider，AFD 仍按原状态继续转发。

![跨阶段对象不一致](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/17e6eb14c260faf2.jpg)

*图 18：FileObject、Handle 和 endpoint 中的 transport 状态来自不同阶段，组合后破坏了原有类型假设*

正确设计应在首次解析后固定对象身份，而不是保存一个之后还要解析的名称：

c

```
typedefstruct _BOUND_TRANSPORT {     PDEVICE_OBJECT DeviceObject;      // 已引用     PFILE_OBJECT ControlFileObject;   // 已引用     GUID ProviderId;     ULONG CapabilityFlags;     ACCESS_MASK GrantedAccess;     LUID CreatorAuthenticationId; } BOUND_TRANSPORT;  NTSTATUS VerifyBoundTransport(     const BOUND_TRANSPORT *bound,     const EXPECTED_PROVIDER *expected) {     if (!IsEqualGUID(bound->ProviderId, expected->ProviderId))         return STATUS_OBJECT_TYPE_MISMATCH;     if ((bound->CapabilityFlags & expected->RequiredCaps) !=         expected->RequiredCaps)         return STATUS_INVALID_DEVICE_REQUEST;     return STATUS_SUCCESS; } 
```

如果业务必须再次解析名称，就要在每次解析后比较对象类型、目标 `DriverObject` 、provider identity 和允许的 capability；只比较 Unicode 路径没有意义。

## 8、Mount Manager 链说明：没有内存破坏也能稳定提权

课件继续把最初指向 NDIS 的链接重定向到 `\Device\MountPointManager` 。由于 endpoint 仍保留 `TdiServiceFlags=0` ，绑定阶段可以获得 Mount Manager 的文件对象；之后 `AfdQueryHandles` 又按 `KernelMode + MAXIMUM_ALLOWED` 把它导出成用户句柄。

![链接重指向 Mount Manager](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/af58593e5448b99a.jpg)

*图 19：创建阶段的 NDIS 属性被保留，但绑定阶段名称已经解析到 Mount Manager*

![完整权限的 Mount Manager 句柄](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8116c129aa68c691.jpg)

*图 20：对象重解析与句柄导出两段逻辑结合，最终把 Mount Manager 完整权限送到用户态*

![链路结果](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/1edebd6979d8623d.jpg)

*图 21：这条链的关键产物不是任意读写原语，而是一个本不该获得的特权设备句柄*

有了该句柄，Mount Manager 的挂载点管理能力可影响特定登录会话看到的 DOS 设备映射。课件中的后续链选择了以 Network Service 运行的 Windows Media Sharing 服务，使其会话中的 `C:` 指向攻击者控制的卷，再利用 DLL 搜索路径进入服务进程，最终借助 Network Service 所持的模拟能力到达 SYSTEM。

这里值得防守方重视的不是具体服务，而是链条属性：它没有堆喷、没有 UAF、没有竞争窗口，课件给出的结论是逻辑型利用、无需 race，演示成功率为 100%。

![逻辑型利用特征](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/9f3294f2176d3113.jpg)

*图 22：稳定性来自权限与对象身份错误，而不是对内存布局和时序的精确控制*

这也解释了为什么只部署 CFG、HVCI、内核池保护或内存破坏检测并不够。它们能显著抬高传统利用成本，却不会阻止一个合法 IOCTL 经合法句柄完成越权动作。逻辑漏洞的防线必须回到 token、对象、句柄和状态迁移。

## 9、第二条路径绕过句柄导出，直接落到任意文件创建

修补 `AfdQueryHandles` 后，组合攻击面并未结束。课件给出的另一条路径 CVE-2026-25176 不依赖导出完整权限句柄：传输符号链接被重定向到文件路径， `AfdCreateConnection` 在 socket connection 阶段调用 `IoCreateFile` ，同样没有强制按原始用户做访问检查。

![替代组合路径](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/49c6ccb5abe068cb.jpg)

*图 23：新的链绕开先前修补点，转而利用连接阶段的对象创建语义*

![文件路径被当成传输目标](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b8ea55176c9ca2fa.jpg)

*图 24：当可重解析传输名落到 NTFS，网络状态机意外获得了文件创建能力*

课件展示了从任意文件创建到 SYSTEM 的服务 DLL 劫持思路；补丁则是在该文件打开路径加入 `IO_FORCE_ACCESS_CHECK` 。这段脆弱逻辑已经存在近 20 年。它并非长期无人审计，只是此前的审计单元通常停在单个驱动或单个 dispatch function，没人把对象命名、AFD 状态机、I/O Manager 权限语义和服务加载路径放进同一张图。

![补丁加入强制访问检查](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/42f0ec91e8cb9db7.jpg)

*图 25：修复点明确要求 I/O Manager 对原始访问主体执行检查*

![长期存在的逻辑](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d8e82ccb517b0264.jpg)

*图 26：代码年龄不能代表安全成熟度；跨组件组合方式变化后，旧逻辑会获得新的安全含义*

修复 review 至少要做三类变体分析：

yaml

```
patch_variant_review:same_sink:-all_callers_of_IoCreateFile_or_IoCreateFileEx-all_callers_of_ObOpenObjectByPointer-all_uses_of_MAXIMUM_ALLOWEDsame_state:-create-bind-connect-accept-query_or_export_handlesame_primitive:-mutable_object_manager_name-requestor_mode_downgrade-internal_ioctl_relay-file_object_handle_mismatch
```

任何只回答“这个 CVE 的 PoC 已经失效”的补丁测试都不够。需要证明同一权限原语在其他状态、其他 provider 和其他对象类型上也无法成立。

## 10、驱动团队应建立跨层审计与检测闭环

课件最后把结论归纳为三点：跨层组合会扩展攻击面；对上游输入的过度信任非常脆弱；仍有更多 transport/device 组合没有被系统探索。

![研究结论](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/bcfaa49dec8dd874.jpg)

*图 27：组件分别安全，不代表组合后仍保持各自的前置条件*

对驱动研发团队，最实际的工作不是立刻做全量内核 fuzz，而是先把危险 API 与跨层语义做成可查询清单。下面是一组适合进入代码评审机器检查的规则：

yaml

```
kernel_driver_review_rules:object_open:flag:-IoCreateFile_without_IO_FORCE_ACCESS_CHECK-ZwCreateFile_on_user_influenced_name-reparsable_name_stored_across_state_transitionrequire:-original_requestor_mode-canonical_object_identity-expected_object_typehandle_export:flag:-ObOpenObjectByPointer_with_KernelMode-MAXIMUM_ALLOWED_returned_to_userrequire:-explicit_export_mask-original_token_access_checkioctl_relay:require:-input_length_validation_at_consumer-provider_identity_check-nested_offset_overflow_check-completion_lifetime_contract
```

在有私有符号和授权测试环境时，可用 WinDbg 核对对象关系；命令本身不构成利用，但应在隔离的测试机上执行：

text

```
bp afd!AfdIssueDeviceControl bp afd!AfdQueryHandles bp nt!IoCreateFileEx bp nt!ObOpenObjectByPointer  !irp <IRP> !object <TransportDeviceName> !handle <AddressHandle> f dt afd!_AFD_ENDPOINT <endpoint> dt afd!_TRANSPORT_INFO <transport-info> 
```

断点日志应同时记录：原始进程与令牌、 `PreviousMode/RequestorMode` 、规范化对象名、解析后的 `DriverObject/DeviceObject/FileObject` 、desired/granted access、endpoint 状态和 provider ID。没有这些字段，就很难判断一次合法的 `IoCreateFileEx` 是否发生了身份漂移。

检测方面，默认 Windows 日志通常不会提供完整 AFD 内部 IOCTL 参数，不能声称一条 Sigma 就能发现利用。需要 EDR 内核传感器、经过评估的 ETW provider 或实验性驱动遥测补齐数据，再做关联：

yaml

```ruby
title:Low-PrivilegeAFDCross-DeviceHandleSequencestatus:experimentallogsource:category:kernel_driver_telemetrydetection:selection:SourcePreviousMode:UserModeBrokerDriver:afd.sysEvents|contains|all:-TransportNameResolved-AddressObjectCreated-HandleExportedToUsersuspicious:ResolvedTargetDriver|not_in:-tcpip.sys-tdx.sys-afunix.sys-hvsocket.sys-rfcomm.sys-rmcast.syscondition:selectionandsuspiciousfalsepositives:-authorizeddrivercompatibilitytestinglevel:high
```

更可靠的发布门禁则验证不变量，而非维护越来越长的设备黑名单：

yaml

```
afd_release_gate:transport_identity:resolve_once_and_hold_references:passprovider_and_object_type_bound_to_endpoint:passsymbolic_link_retarget_test:blockedauthorization:original_requestor_mode_propagated:passuser_influenced_open_forces_access_check:passno_MAXIMUM_ALLOWED_on_user_export:passstate_machine:common_validation_for_connect_accept_superaccept:passfile_object_and_handle_same_provider:passinvalid_transition_fails_closed:passconsumers:internal_ioctl_buffers_revalidated:passvariable_length_structures_checked:passprovider_capabilities_explicit:passvariants:alternate_transport_devices_tested:passfile_and_non_transport_object_types_rejected:passlow_privilege_appcontainer_profile_tested:pass
```

LPAC 会限制 TCP/UDP、对象管理器链接和多数设备访问，但课件也指出，TLI 仍暴露 AF_UNIX、Hyper-V Socket 和部分 AF_INET 路径，后续又发现多项 AFD CVE。沙箱边界能缩小组合空间，却不能替代 AFD 自身的类型、状态和访问控制验证。

这场研究最值得复用的方法，是把“漏洞”从单个危险函数提升为一条安全属性传递链：用户输入选择对象，名称解析确定身份，AFD 保存状态，低层驱动消费结构，I/O Manager解释 `RequestorMode` ，最后句柄回到用户态。每跨过一层，都应重新确认对象是谁、权限属于谁、数据由谁验证。

如果一个系统只能靠“上游应该检查过”“这个路径一般只指向 TCP”“内部 IOCTL 不会由用户控制”来维持安全，它就已经具备了漏洞工厂的基本条件。

* * *

### 资料来源

-   Black Hat 官方 Session 页面
    
-   Black Hat USA 2026 Session 页面
    
-   Project Zero：Windows Kernel Logic Bug Class — Access Mode Mismatch in IO Manager
    

**原始会议材料（仓库内）**

-   演讲课件 PDF
    

开源资料与原始议题 PDF

本文对应的 Markdown 原稿、Black Hat 原始议题 PDF 与配图已整理到 GitHub，可按文章编号查找和下载。

https://github.com/cybermaxluo/black-hat-usa-2026-talks

也可以点击文末“阅读原文”进入仓库。欢迎 Star、提交 Issue 或参与勘误。

Black Hat · 目录
