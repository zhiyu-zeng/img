---
title: 【微信】豆包+UU远程=黑屏，神奇的bug又出现了
source: https://mp.weixin.qq.com/s/46-Hv11IdLMmm2_XfGSmLg
source_host: mp.weixin.qq.com
clip_date: 2026-11-23T16:56:13+08:00
trace_id: 3a9901f7-df15-4cd4-9986-6ab86908ef13
content_hash: 06aa29ddb8b1ec23c8e2aced404ff7090fb1c314aa972b81e97b30b7e3feff0d
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 11
  succeeded: 11
  failed_urls: []
notion_page_id: 42175244-d011-81be-b181-f2f08a1b60b1
ioc: null
---

**星宇Sec** *2026年11月20日 16:43*

*一次围绕Windows间接显示驱动的逆向分析*

![起因](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3d63bb0e3bbd9488.jpg)

起因

豆包开着"本地电脑"，UU远程在后台待命，屏幕突然黑一下，画面闪退再恢复，运气差的时候要等系统把显示拓扑重新算完。这个组合的问题不在应用层，也不在驱动本身，而在两者中间的显示器配置层。

这次我把两款软件从驱动层往上拆了一遍。豆包"本地电脑"的底层是RDP影子会话；账户密码是首次手动输入之后用DPAPI加密落盘的；UU远程和豆包各挂一块IddCx虚拟显示器，共用同一个内核上滤器 `IndirectKmd` ；黑屏就发生在这些虚拟显示器的状态切换上。

## 结论

| 环节  | 结论  | 关键证据 |
| --- | --- | --- |
| 豆包"本地电脑" | RDP ActiveX控件拉起的影子会话 | SDK日志里的 `CreateShadowSession` 、 `ConnectToShadowSession` 、 `ShadowSessionLoginCompleted` |
| 账户密码 | 首次手动输入， `LogonUserW` 校验通过后DPAPI加密落盘，此后免密复用 | 凭据时间线、凭据管理器条目、DPAPI结构解析 |
| 显示驱动 | 两块IddCx驱动同机共存，共用 `IndirectKmd` | 两个INF的 `UpperFilters` 声明、注册表Enum键写入时间 |
| 黑屏  | 显示器配置重置撞上被RDP会话占用的虚拟显示目标 | UU远程服务端字符串、事件ID 1056、显示设备枚举时序 |

下面按证据链条展开。

## 测试环境

分析在一台隔离的Windows 10虚拟机里完成，机器上同时装有豆包和UU远程。

工具链很朴素。PE结构解析用pefile，x86-64反汇编用capstone，INF和注册表直接读原始数据，密码学部分用ctypes直接调Windows自带API，日志靠SDK自己落盘的文件还原时间线。另外补了一组对照实验，自己造一个DPAPI blob做加解密往返，确认分析脚本本身没问题。

有一点需要交代清楚。豆包的主程序是一个319MB的Electron壳，核心逻辑在 `Doubao.dll` 里，符号被剥得比较干净，所以本文里的"代码分析"主要基于字符串定位、反汇编和运行时行为三者互相印证，而不是逐行还原源码。

## 一、影子会话

答案是RDP影子会话。

豆包把这一套功能内部代号叫PIP。点开对话里的"本地电脑"，前端会调起一个叫 `PipSdk_CreateShadowSession` 的方法，参数里带着父窗口句柄、目标分辨率，以及一串被掩码的密码。

![豆包的本地电脑入口](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8b66185d948f8a8e.jpg)

豆包的本地电脑入口

```
[PIP_SDK]PipSdk_CreateShadowSession() enter with args {parent_window_handle=1967310,
  x=0, y=0, width=1067, height=600, display_width=1920, display_height=1080,
  visible=1, password=***********, prompt=0}
[PIP_SDK]PipSdk_CreateShadowSession() exit with result {category=0, code=0, success=true}
[PIP_SDK]ShadowSessionLoginCompleted: 0
```

`prompt=0` 是个很关键的信息，它意味着创建会话时不允许弹出任何交互式登录框。

会话建立之后，驱动侧走的是RDP ActiveX控件（ `mstscax.dll` ），控件的调用序列在日志里一目了然。

![PIP SDK日志](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6b774aa0bc158f51.jpg)

PIP SDK日志

```
[PIP_SDK][MAIN]put ConnectToShadowSession completed
[PIP_SDK][MAIN]Shadow session binding finished, session id: 2,
                shadow_session_marked: 1, explorer_startup_marked: 1
[PIP_SDK][MAIN][RDP Events] LoginComplete
[PIP_SDK][MAIN]ConnectToShadowSession succeed, pipe_name: PipRemotePipeName_12444
```

`session id: 2` 配合 `shadow_session_marked` 说明这是一个标准的Windows RDP影子会话——主会话之外挂一个子会话，把主桌面的画面送进去，同时接收键鼠输入回主会话去执行。豆包想"控制电脑"，走的其实是Windows自带RDP那套成熟的机制，而不是自己实现一套远程桌面协议。

从系统侧看也能对上账。 `query session` 会把两个会话同时列出来，一个是控制台，一个是影子会话。

![终端会话与驱动共存](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/abcd1fbdbd0d653e.jpg)

终端会话与驱动共存

## 二、密码从哪来

这是整件事里最容易被讲歪的部分，也是我花时间最多的地方。

密码这一层最容易被讲歪。时间线不长，看一遍就清楚了。

![凭据时间线](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/62825fe42887368f.jpg)

凭据时间线

逐行翻译一下这条时间线。

11:32:22，应用要建影子会话，去凭据管理器里找，目标是 `Doubao/ComputerUse/PIPSession` ，没找到。同一时刻它还在读一个叫 `s2-new-windows-password-prompt` 的本地资源——那是密码输入框的前端脚本。

11:32:29，前端调用 `validatePipWindowsUserPassword` ，后端拿用户输入的密码去调 `LogonUserW` 做校验，第一次失败， `gle=1326` 。1326是 `ERROR_LOGON_FAILURE` ，用户名或密码不正确。

11:32:34，同样的调用再来一次，这次通过了。紧接着凭据被写进凭据管理器， `Save persisted PIP credential: success, password_empty=0` 。

11:32:35，应用回头去读自己刚写进去的那条记录， `blob_size=324, encrypted_blob=true` ，然后 `Resolve PIP shadow session credential, source=windows_credential_manager` 。

四小时之后的第二次运行，来源变成了 `protected_memory_cache` ，也就是同一份密码在进程内存里的加密副本。

准确的表述是，密码由用户手动输入，应用用 `LogonUserW` 验证它是否正确，验证通过之后把它加密保存下来，此后每次建影子会话都直接取用，不再打扰用户。日志里 `password_prompt_show_count=0` 说的就是这件事。

为什么非要密码而不是PIN？因为RDP影子会话底层就是一次完整的远程桌面登录，Windows Hello和PIN在这条路径上用不了，只能走账户密码。这一点在日志里也能看到——应用明确记录了 `windows_hello_status=Available, pin_configured=Enrolled` ，它知道这台机器配了PIN，但依然选择了密码这条路。

还有个细节值得单独拎出来。凭据解析记录里写着 `remember_password=false` ，可凭据还是落了盘。这两处字段很可能不是同一个开关，但无论如何，密码确实以明文等价物的形式被持久化了。

### 落盘结构

把那条凭据从凭据管理器里读出来，结构相当清楚。

![凭据管理器条目](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e96a155cc3f1b6a3.jpg)

凭据管理器条目

```
TargetName   Doubao/ComputerUse/PIPSession
Type         1   (CRED_TYPE_GENERIC)
Persist      2   (CRED_PERSIST_LOCAL_MACHINE)
BlobSize     324 bytes

16 byte envelope  "AHA_PIP_DPAPI_V1"
followed by a standard DPAPI blob (MS-ENCDPAPI):
   dwVersion           1
   guidProvider        {DF9D8CD0-1501-11D1-8C7A-00C04FC297EB}   (Windows DPAPI provider)
   dwMasterKeyVersion  1
   guidMasterKey       {B70E11A2-1C6A-43E7-88F2-9497090F2929}
   dwFlags             0x00000000
   descriptionLength   64
   description         "Doubao ComputerUse PIP password"
   encrypted data      196 bytes
```

`CRED_PERSIST_LOCAL_MACHINE` 这一项值得留意，它意味着这条记录以本机为作用域持久保存，不随登录会话消失。里面的数据用Windows DPAPI加密，主密钥绑定的是当前账户的配置目录，别的账户或别的机器拿不到。

有意思的是它的外层还包了16字节的自定义信封 `AHA_PIP_DPAPI_V1` ，这是应用自己加的格式，Windows并不认识。

### 代码层面

这个加密动作在 `Doubao.dll` 里看得见。调用点是 `CryptProtectData` ，描述字符串就是 `Doubao ComputerUse PIP password` 。

![CryptProtectData调用点](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7e1a9ccb722d7c32.jpg)

CryptProtectData调用点

```
CryptProtectData( pDataIn         = the plaintext Windows account password,
                   pDataOut        = &blob,
                   szDataDescr     = "Doubao ComputerUse PIP password",
                   pOptionalEntropy= a buffer the caller prepared,
                   pvReserved      = NULL,
                   dwFlags         = CRYPTPROTECT_UI_FORBIDDEN,
                   pEncryptedData  = &out )
```

有意思的是那三个常量。 `AHA_PIP_DPAPI_V1` 是16字节的信封标签， `Doubao/ComputerUse/PIPSession/DPAPI/v1` 和 `/DPAPI/v2` 是应用在不同版本间轮换的可选熵来源。

![常量与导入表](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/32810feabd777247.jpg)

常量与导入表

```sql
static import   CRYPT32.dll  CryptProtectData     IAT 0x19323E5F0
static import   CRYPT32.dll  CryptUnprotectData   IAT 0x19323E608
static import   CRYPT32.dll  CryptProtectMemory   IAT 0x19323E5F8
static import   CRYPT32.dll  CryptUnprotectMemory IAT 0x19323E610
dynamic         advapi32.dll CredReadW            2 name hits, absent from the import table
dynamic         advapi32.dll CredWriteW           2 name hits, absent from the import table
dynamic         advapi32.dll CredDeleteW          2 name hits, absent from the import table
dynamic         advapi32.dll LogonUserW           3 name hits, absent from the import table
```

`CredReadW` 、 `CredWriteW` 、 `LogonUserW` 都不在导入表里，是运行时按名字动态解析的。静态扫一遍导入表很容易把这些行为漏掉，这也是为什么必须跑起来看。

读取路径是对称的， `CryptUnprotectData` 的第三个参数指向一段运行期拼出来的宽字符串。

![CryptUnprotectData调用点](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f248be2a4edbbf60.jpg)

CryptUnprotectData调用点

```
00000001840A27F3  lea      r8, [rsp + 0x230]
00000001840A2808  mov      dword ptr [r8], eax          ; cbData = 2 * length
00000001840A2802  mov      qword ptr [r8 + 8], rcx      ; pbData = the wide characters
...
00000001840A2825  call     CryptUnprotectData
```

这段可选熵不是二进制里的常量，是应用在运行时拼出来的。作为对照，我在自己的进程里试了七种熵候选——不传熵、16字节全零、两个版本的 `AHA_PIP_DPAPI_*` 标签、描述字符串、以及三个 `PIPSession` 路径字符串的UTF-16和ASCII形式——全部被 `CryptUnprotectData` 以 `ERROR_INVALID_DATA` 拒绝。

这个结果其实是好消息。它意味着同一台机器上以同一账户身份运行的另一个程序，哪怕直接读凭据管理器拿到了这条记录，也解不开里面的密码。能解开它的只有豆包自己的代码，或者一个挂钩了它 `CryptUnprotectData` 调用的东西。反过来说，这个"加密"挡不住本机的root，却能挡住绝大多数顺手做credential dump的工具。

不过这里也得说句公道话。这台机器的日志里写着 `credential_guard_state=NotRunning` ，Credential Guard没有运行，DPAPI的主密钥保护因此弱了一档。密文本身再结实，钥匙放在防守松懈的锁后面，实际强度也要打折。

## 三、两块虚拟显示

现在进入驱动这一层，问题最集中的地方也在这里。

Windows 10 1703之后，虚拟显示有一套统一框架叫IddCx（Indirect Display Driver based on Indirect Display Driver Class eXtension）。第三方虚拟显示器不再自己写显示驱动，而是写一个用户态的IddCx扩展模块，再由内核框架统一调度。所有IddCx驱动在设备栈上都挂同一个内核上滤器 `IndirectKmd.sys` 。

豆包这条链路上的显示适配器来自Windows自带的 `rdpidd.inf` ，也就是微软的Remote Display Adapter，硬件ID长这样。

```
SWD\REMOTEDISPLAYENUM\RdpIdd_IndirectDisplay&SessionId_0002
```

UU远程这一侧装的是自己编译的IddCx驱动，两个INF文件摆在一起看非常直观。

![两个INF对照](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ba3aa14320632864.jpg)

两个INF对照

```java
C:\Windows\INF\rdpidd.inf   (Microsoft Remote Display Adapter)
   ServiceBinary = %12%\UMDF\RdpIdd.dll
   UmdfExtensions = IddCx0102
   HKR,, "UpperFilters",  %REG_MULTI_SZ%, "IndirectKmd"

C:\Windows\INF\oem9.inf   (GameViewer virtual display adapter)
   ServiceBinary=%12%\UMDF\GameViewerIddDriver.dll
   UmdfExtensions = IddCx0102
   HKR,, "UpperFilters",  %REG_MULTI_SZ%, "IndirectKmd"

C:\Windows\System32\drivers\IndirectKmd.sys
   47104 bytes, signed 2023-12-04, shared by every IddCx driver on the system
```

两行 `UmdfExtensions = IddCx0102` 和两行 `UpperFilters = "IndirectKmd"` 说明它们不仅都是IddCx驱动，还挂在同一个内核过滤器的同一条链上。

再补一个时间证据，注册表Enum分支的键最后写入时间可以直接读出来。

```
2026-11-20 11:32:37  SYSTEM\CurrentControlSet\Enum\SWD\REMOTEDISPLAYENUM\RdpIdd_IndirectDisplay&SessionId_0002
2026-11-20 11:18:39  SYSTEM\CurrentControlSet\Enum\ROOT\DISPLAY\0000
```

`ROOT\DISPLAY\0000` 是GameViewer虚拟显示适配器的软件设备枚举，11:18:39就在了。豆包的 `RdpIdd_IndirectDisplay&SessionId_0002` 在11:32:37落盘，比影子会话创建的11:32:35晚两秒。也就是说，有长达约27分钟的时间，两块基于同一框架、共用同一内核上滤的间接显示驱动同时存在于同一台机器上。

## 四、UU的避让逻辑

UU远程的代码里，有一套完整的避让逻辑。

翻遍 `GameViewerServer.exe` 的字符串，能看到这么几组。

![UU远程服务端关键字符串](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/40f4ccb796acd0fd.jpg)

UU远程服务端关键字符串

```sql
privacy_mode_request result=blocked reason=rdp_active
privacy_mode_request result=blocked reason=second_screen_active
input_driver_lock_state state=unlocked reason=active_rdp_session_overrides_console_state
input_driver_setup result=started rdp_session=
reason=rdp_session_no_local_mutation
host::VideoSession::manualCreateVirtualDisplay
host::VideoSession::manualRemoveVirtualDisplay
display_created: virtual_display, screen_id=
display_removed: virtual_display, screen_id=
try resetMonitorConfigStrict with pre-connect snapshot. paths:
resetMonitorConfigStrict result:
ccd restore failed, fallback to enableAllPhysicsMonitor
tryCcdRestore got 1610, wait 600ms and retry (attempt 1)
```

翻译一下。 `reason=rdp_active` 表示当检测到RDP会话活跃时，隐私模式（隐藏鼠标、屏蔽输入那类功能）会被直接拒绝； `active_rdp_session_overrides_console_state` 说明RDP会话的优先级高于控制台； `rdp_session_no_local_mutation` 表示存在RDP会话时不改本地状态。

还有一串更值钱的， `resetMonitorConfigStrict` 和 `tryCcdRestore` 把连接前的显示器配置重置过程暴露得很完整。

把这条逻辑和豆包放在一起看，画面就完整了。豆包建影子会话时会在系统里挂起一块 `RdpIdd` 虚拟显示器；UU远程这时候如果恰好要连接，第一件事就是去重置显示器配置——而此时那块虚拟显示器正被一个活跃的RDP会话占着。症结不在"驱动打架"，而在UU远程这边的配置重置动作被一个正在使用中的显示目标挡住。

## 五、黑屏的链路

黑屏不在RDP里，也不在驱动里，而在两者中间的显示器配置层。

时间戳能对上。11:32:22， `TerminalServices-RemoteConnectionManager` 写下事件ID 1056；11:32:35影子会话创建完成；11:32:37， `RdpIdd_IndirectDisplay&SessionId_0002` 的设备节点落盘。从这一刻起，系统里同时跑着两条显示路径，一条通向控制台物理屏，一条通向RDP影子会话里的虚拟屏。

UU远程这一侧的动作序列，在服务端二进制里写得很直白。连接之前先给当前显示器配置拍快照，调用 `resetMonitorConfigStrict` 把分辨率、刷新率、色彩配置重置成保守值；失败就退到 `enableAllPhysicsMonitor` ； `tryCcdRestore` 碰到1610还会等600毫秒重试。1610是 `ERROR_DEVICE_IN_USE` ，意思是某个显示目标正被占用。

矛盾就出在这一步。CCD改拓扑时，系统会先把现有显示目标拆开、重新枚举、再按新配置组合起来；豆包的 `RdpIdd` 适配器此刻被一个活跃的RDP会话握着， `ROOT\DISPLAY\0000` 和它又共用 `IndirectKmd` 这条内核上滤链，两个IddCx扩展还都由 `WUDFRd` 托管。UU远程的重置动作撞进来，拓扑重组就会卡在"目标被占用、等待释放"的状态里。1610之后那600毫秒重试，就是这场等待留下的痕迹。重试期间如果UU远程还要 `manualCreateVirtualDisplay` 建自己的虚拟屏，第二个IddCx设备往 `IndirectKmd` 上一挂，拓扑又要再算一遍。

控制台的输出目标在这几轮重组里短暂失效，屏幕就是黑的；RDP侧如果在重连或者重移交画面，豆包的画面会跟着闪退。什么时候恢复，取决于显示拓扑按什么顺序收敛，这也是为什么有的人黑一下就回来，有的人要黑到UU远程把连接彻底断开。

所以黑屏的本质不是两块驱动互斥，而是同一时刻有三个动作在抢显示器配置的所有权，豆包的RDP会话、UU远程的配置重置、UU远程新建虚拟屏。谁都没做错，撞在一起就是黑屏。

不喜欢
