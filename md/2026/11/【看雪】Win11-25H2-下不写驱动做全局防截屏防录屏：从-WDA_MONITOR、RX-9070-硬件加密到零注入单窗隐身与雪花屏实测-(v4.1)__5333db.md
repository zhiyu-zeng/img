---
title: 【看雪】Win11 25H2 下不写驱动做全局防截屏/防录屏：从 WDA_MONITOR、RX 9070 硬件加密到零注入单窗隐身与雪花屏实测 (v4.1)
source: https://bbs.kanxue.com/thread-293674.htm
source_host: bbs.kanxue.com
clip_date: 2026-11-27T04:07:54+08:00
trace_id: 894926ba-b2e7-433f-9fe6-a683626c00ec
content_hash: 7efaa15168cc126bdfcb9b8d1eb7108f9343dc5feaa205a712de4e916fd0069a
status: synced
tags:
  - 看雪
series: null
feed_source: 看雪·逆向工程
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 42475244-d011-8136-bd3a-d9bdc2982385
ioc: null
---

Win11 25H2 开着 VBS 和 HVCI，平时机子上还跑大型联机游戏，一直不想为了折腾防截屏去写未签名 `.sys` 硬刚 DSE，也不想在内核里乱 hook 跟反作弊撞车。前段时间折腾了一个完全不加载内核驱动的全局防截屏、防录屏工具，整理好源码和预编译包开源在了 GitHub（ [AegisBlackout](https://github.com/verg-fe/AegisBlackout) ）。

这篇不写套话，只按实际踩坑顺序记录四件事：纯挂 `WDA_MONITOR` 哪里会漏、怎么靠 `SYSTEM` 服务加 UIPI 在无驱动前提下把进程护住、怎么用 Raw Input 封死热键嗅探和静默截屏，以及我在 AMD RX 9070 上直接开 `DXGI_SWAP_CHAIN_FLAG_HW_PROTECTED` 时自己怀疑它是不是“假加密”、专门拿第二个独立 D3D11 设备去 `CopyResource` 硬抠的实测数据。

### 0\. 先做个通俗科普：用「盒子 B + 盒子 A」给小白讲明白整条防窃屏全链路

在直接上代码和显存实测之前，先把这套项目的核心原理用大白话讲透，让非系统方向的同学也能一眼看懂。

如果你用过 **Netflix、Apple TV+ 或在电脑上播 4K 蓝光电影**，应该注意过一个经典现象：屏幕上明明放着清晰大片，但只要一按微信截图、OBS 录屏或者远控工具， **抓出来的画面瞬间变成一片纯黑**。

这并不是播放器自己在黑屏，而是微软（Windows DWM / DXGI 显示合成器）与显卡厂商（例如 AMD 的 **TMZ** Trusted Memory Zone 硬件信任内存区）在系统与硬件层联手修好的「**影视级硬件数字版权专车通道（DRM / 受保护媒体路径）**」：

-   只要显卡交换链带上 `HW_PROTECTED | DISPLAY_ONLY` （标志位 `0x420` ）， **像素在显存里从诞生那一刻起就已经是硬件密文** （后文第 4 节有跨独立 D3D11 设备硬抠显存的实测：4096+ 种高熵乱码， `0/16384` 明文匹配）；
-   只有顺着显卡直连物理显示器的输出管线时才在末端解码亮在屏幕上，Windows 的所有桌面抓取通道（ `BitBlt` 、 `DXGI DuplicateOutput` 、 `WGC` 、 `PrintWindow` ）一律会在内核/DWM/GPU 层被直接掐断返回纯黑。

这套硬件保险箱原本只给好莱坞蓝光和商业流媒体用。 **AegisBlackout 的核心玩法只有一句话：不写高危未签名 `.sys` 驱动，也不去买昂贵的 PlayReady 商业版权证书——直接借壳“白嫖”微软和 AMD 现成的影视级硬件 DRM 防盗版通道，构建「盒子 B + 盒子 A」双层全链路防护**：

```sql
业务软件正常绘图渲染
  |
  +--> [盒子 B：系统软件防线（开源 v4.1.0 全套已包含）]
  |      |-- High-IL + UIPI 隔离：普通软件打不开、改不动护盾进程与窗口
  |      |-- 全屏 0x420 透明 DRM 幕布：整个桌面在 DWM 眼里进入受保护播放状态
  |      |-- 零注入 Special-APC (WDA=0x11)：所有窗口自带 0% 雪花抗定向抓取
  |      |-- 物理 HID Raw Input 验真：只有亲手敲物理键盘才放行 Ctrl+Alt+Q 截图 (+ F9 瞬间物理黑幕)
  |      +-- [高敏可选] Sandboxie 降权关禁闭 + 下期预告「键盘防记录 + 剪贴板防窃取」
  |
  +--> [盒子 A：显卡硬件加密保险箱（0x420 AMD TMZ 硬件随机密钥显存）]
         |-- 像素进显存直接成 4096+/8192 种高熵硬件密文（密钥锁死在 GPU 芯片内，OS/CPU 拿不到）
         |-- 只有直连 HDMI/DP 物理显示器的最后一步才在芯片末端硬件解码 -> 肉眼清晰可见
         +-- 现已开源纯盒子 A 看图器 AegisVault；浏览器等日常软件全自动进盒子 A 见 7.4 闭源彩蛋
```

打个最直观的比方：

-   **盒子 B 就是展馆门口的特警与权限铁门**：用 High-IL/UIPI、全屏 `0x420` 透明 DRM 幕布、零注入 `Special-APC (WDA=0x11)` 和物理键鼠验真，在不加载任何 `.sys` 内核驱动（绝不撞游戏反作弊）的前提下，把普通权限软件的 **20 路截屏/录屏与窗口篡改全部死死拦在门外**；
-   **盒子 A 则是显卡芯片内部自带硬件钥匙的物理保险箱（TMZ）**：内容根本不在普通显存里明文裸奔，一进显存就直接加密成硬件密文；
-   **开源版本 (`v4.1.0`) 能直接拿到什么**：全套开箱即用的 **盒子 B** （ `AegisBlackout v4.1` + `GhostSwap v2.1` + `CaptureAuditSuite` ）外加一把 **纯盒子 A 独立硬件保险箱看图器（ `AegisVault` ）**——看高敏证件图/助记词直接进 `0x420` 加密显存，关窗直接 `SecureZeroMemory` 抹零主机内存；
-   **为什么还藏了一手闭源自用彩蛋（见 7.4 节）**：第 7.2 节你会看到“把日常浏览器 Chrome 也塞进 `0x420` 显卡保险箱必变雪花”的硬件难题；而在私人自用的 **GhostSwap v3.0** 里，我已经用「影子纹理代理 + `CopyResource` 」把这个雪花死结彻底啃穿，让未改二进制的 Chrome 也 **0% 雪花自动写进真 `0x420` TMZ 加密显存** （因显卡性能开销与厂商硬件差异决定不开源，但原理、实测数据与 Ring-0 对抗边界在第 7.4 节完整拆给大伙看）。

**小白一句话总结日常体验**：平时用电脑 4K 144Hz **100% 清晰、零雪花、后台无黑框**；微信 / QQ / OBS / 系统自带截屏 / 远控木马截出来全是 **0.00% 纯黑**；只有你本人敲下物理键盘 `Ctrl + Alt + Q` ，护盾验证真人硬件按键后才毫秒放行清晰截图；身边真有人举手机偷拍屏幕，敲一下 `Ctrl + Alt + F9` **0 频闪、0 显卡空闲占用** 瞬间整屏变黑砖！只想直接上手用的同学去文末下安装包即可，想看底层源码设计与硬件密文对抗实测数据的兄弟请继续往下看 1–9 节。

### 1\. 只贴个 WDA_MONITOR 透明窗为什么防不住稍认真的工具

最开始的想法很朴素：在桌面上盖一个全屏置顶的透明穿透窗口（ `WS_EX_LAYERED` alpha 设成 1， `WS_EX_TRANSPARENT` 加上 `WM_NCHITTEST` 返回 `HTTRANSPARENT` ），再调用 `SetWindowDisplayAffinity(hwnd, WDA_MONITOR)` 。对付普通 `BitBlt` 、 `GetPixel` 确实立刻全黑，但实测做红队对抗时问题一大堆：

-   普通 Medium-IL 进程拿到窗口句柄，一个 `ShowWindow(SW_HIDE)` 、 `MoveWindow(-9999, -9999, 1, 1)` 或者 `PostMessage(WM_CLOSE)` 就把遮罩掀了，甚至直接 `OpenProcess(PROCESS_TERMINATE)` 干掉。
-   早期把护盾和截图工具拆成两个 exe，靠 `Global\Event` 同步“临时摘幕截图”，用 `RegisterHotKey` 注册全局热键。结果问题更明显：一是全局热键很容易跟现有聊天工具或游戏快捷键冲突弹占用提示，而且别人遍历热键表或者试探性 `RegisterHotKey` 就能摸出你在运行；二是任意普通进程都能 `OpenEvent` 发信号或者 `SendInput` 伪造组合键，趁你摘幕那几帧把屏幕偷拍走。
-   `CreateWindowEx` 时如果窗体类名、窗口标题带特征字样， `FindWindow` 扫一圈就暴露。

所以后面干脆合并成单进程：砍掉所有跨进程事件和 `RegisterHotKey` ，随机生成类名、标题留空，只在启动写一次初始化日志，运行时和截图过程中不落盘、不保留未清零的桌面内存。

### 2\. 无驱动护盾自保：LocalSystem 服务代拉 High-IL（UIPI 隔离）

想让用户态程序开机无 UAC 弹窗跑在高完整性级别（High-IL），最稳的系统原生路径就是配一个 `LocalSystem` 服务（ `AegisBlackoutGuard` ），从控制台当前登录会话里取出关联的高权限令牌 `TokenLinkedToken` ，再用 `CreateProcessAsUserW` 把主程序投进 `winsta0\default` 。令牌提取就这几十行：

```objectivec
static HANDLE AcquireHighIlPrimaryTokenForSession(DWORD sessId)
{
    HANDLE hUserToken = NULL;
    if (!WTSQueryUserToken(sessId, &hUserToken) || !hUserToken) {
        return NULL;
    }

    HANDLE hLaunchToken = NULL;
    TOKEN_LINKED_TOKEN lt = { 0 };
    DWORD retLen = 0;

    if (GetTokenInformation(hUserToken, TokenLinkedToken, &lt, sizeof(lt), &retLen) && lt.LinkedToken) {
        DuplicateTokenEx(lt.LinkedToken, MAXIMUM_ALLOWED, NULL, SecurityImpersonation, TokenPrimary, &hLaunchToken);
        CloseHandle(lt.LinkedToken);
    }
    if (!hLaunchToken) {
        DuplicateTokenEx(hUserToken, MAXIMUM_ALLOWED, NULL, SecurityImpersonation, TokenPrimary, &hLaunchToken);
    }
    CloseHandle(hUserToken);

    if (hLaunchToken) {
        SetTokenInformation(hLaunchToken, TokenSessionId, &sessId, sizeof(sessId));
    }
    return hLaunchToken;
}
```

只要主程序跑在 High-IL，Windows 的 `win32k.sys` UIPI 会从内核层直接拒掉 Medium-IL 进程发来的跨权限窗口操作和消息注入，也不用怕谁发个 `MoveWindow` 把遮罩拖走。为了补齐进程和服务本体自保，启动阶段顺手把能上的原生限制都叠上：

-   **进程 DACL 收口**：调 `SetSecurityInfo` 打上 `D:P(A;;GA;;;SY)(A;;GA;;;BA)(A;;0x00101000;;;WD)` ，普通进程连 `PROCESS_TERMINATE` 、 `PROCESS_VM_READ` 、 `PROCESS_VM_WRITE` 句柄都拿不到，统一返回 `ERROR_ACCESS_DENIED (5)` 。
-   **注入面收口**： `SetProcessMitigationPolicy` 开 `ProcessExtensionPointDisablePolicy` 禁用老式全局钩子/DLL 注入扩展点，开 `ProcessImageLoadPolicy` 禁加载低完整性与远程路径映像。
-   **窗口置顶看门狗**：除了 `WM_WINDOWPOSCHANGING` 强行把 Z 序压在 `HWND_TOPMOST` 和虚拟屏全尺寸上，还挂了 100ms 定时器和 `SetWinEventHook` （盯 `EVENT_SYSTEM_FOREGROUND` 与 `EVENT_OBJECT_SHOW` ），有置顶弹窗压上来就立刻重新置顶盖回去。
-   **服务守护与 NTFS 只读**： `sc sdset` 把普通用户对守护服务的停止、删除权限去掉， `sc failure` 配好 1 秒拉起；服务进程自己等主进程句柄退出，只要退出码不是约定的物理紧急退出码 `0x5A5A` ，150ms 内原地重启。exe 和 svc 文件配好仅管理员可写的 NTFS ACL。

### 3\. 绝不允许静默截图：物理 HID Raw Input + 可视门禁

去掉 `RegisterHotKey` 和低级键盘钩子 `WH_KEYBOARD_LL` 之后，按键监听全部换成被动收 `WM_INPUT` （ `RegisterRawInputDevices` 配 `RIDEV_INPUTSINK` ）。

这样做有两个直接好处：系统里完全查不到你占用了任何全局热键（用审计程序连扫 `Alt+A` 、 `Ctrl+Alt+A` 、 `Ctrl+Alt+S` 、 `Ctrl+Alt+X` 全是未占用状态）；而且每一条按键和鼠标左键消息都能直接拿 `raw->header.hDevice` 去区分是不是实体硬件发的：

```swift
static BOOL IsPhysicalHardwareDevice(HANDLE hDevice)
{
    if (!hDevice) return FALSE; /* SendInput / keybd_event / mouse_event */

    for (int i = 0; i < g_devCacheCount; i++) {
        if (g_devCache[i].hDevice == hDevice) return g_devCache[i].isPhysical;
    }

    BOOL result = FALSE;
    WCHAR devName[512];
    UINT cb = 512;
    UINT len = GetRawInputDeviceInfoW(hDevice, RIDI_DEVICENAME, devName, &cb);
    if (len != (UINT)-1 && len > 0) {
        devName[511] = L'\0';
        for (WCHAR* p = devName; *p; ++p) {
            if (*p >= L'a' && *p <= L'z') *p = (WCHAR)(*p - L'a' + L'A');
        }
        if (wcsstr(devName, L"RDP_KBD") || wcsstr(devName, L"RDP_MOU") || wcsstr(devName, L"ROOT#RDP")) {
            result = FALSE;
        } else if (wcsstr(devName, L"\\\\?\\HID#") || wcsstr(devName, L"\\\\?\\ACPI#") ||
                   wcsstr(devName, L"\\\\?\\USB#") || wcsstr(devName, L"\\\\?\\BTHENUM#") ||
                   wcsstr(devName, L"\\\\?\\SERENUM#") || wcsstr(devName, L"\\\\?\\PCMCIA#")) {
            result = TRUE;
        }
    }
    if (g_devCacheCount < MAX_DEV_CACHE) {
        g_devCache[g_devCacheCount].hDevice = hDevice;
        g_devCache[g_devCacheCount].isPhysical = result;
        g_devCacheCount++;
    }
    return result;
}
```

只要 `hDevice == NULL` （ `SendInput` 、 `keybd_event` 、自动脚本合成事件）或者设备路径带 RDP，直接丢弃，同时用 `GetAsyncKeyState` 再交叉核对修饰键状态防卡键。物理按 `Ctrl+Alt+Q` 才允许触发截图：先断开 DComp 表面 + 隐藏遮罩 + 连等两次 `DwmFlush()` 拿一帧干净桌面，再立刻恢复遮罩（整个摘幕周期实测二十几毫秒，肉眼看不到黑屏闪烁），随后弹出全屏暗化选区画布。

画布同样挂了 `WDA_MONITOR` ，顶部居中挂一条显眼的绿色提示条，而且写了硬门禁： `>= 150ms` 可视停留时间内任何确认动作一概不理，必须物理键盘敲 `Enter` 或物理鼠标 500ms 内双击才写入剪贴板 `CF_DIB` ，取消或写完立刻调 `SecureZeroMemory` 把两份 4K 位图缓冲抹平。物理按 `Ctrl+Alt+Shift+End` 则返回 `0x5A5A` 让守护服务干净下班，不用进 TaskMgr 或重新弹 UAC。

### 4\. RX 9070 上直接开 HW_PROTECTED | DISPLAY_ONLY 交换链：到底是不是真加密？

做桌面防录制时顺手试了一把把显卡硬件保护也挂到遮罩上：建 `D3D11_CREATE_DEVICE_BGRA_SUPPORT | D3D11_CREATE_DEVICE_VIDEO_SUPPORT` 设备，给 `CreateSwapChainForComposition` 直接传 `DXGI_SWAP_CHAIN_FLAG_HW_PROTECTED | DXGI_SWAP_CHAIN_FLAG_DISPLAY_ONLY` （ `0x420` ），Alpha 模式设 `DXGI_ALPHA_MODE_PREMULTIPLIED` ，窗口样式加 `WS_EX_NOREDIRECTIONBITMAP` ，挂到 `IDCompositionDevice` 上并每秒清成 `RGBA(0,0,0, 1/255)` Present 一次维持硬件表面活跃（硬件不支持时则静默切回普通 `WS_EX_LAYERED` ）。

```
const UINT candidates[] = {
    DXGI_SWAP_CHAIN_FLAG_HW_PROTECTED | DXGI_SWAP_CHAIN_FLAG_DISPLAY_ONLY,
    DXGI_SWAP_CHAIN_FLAG_HW_PROTECTED,
    DXGI_SWAP_CHAIN_FLAG_DISPLAY_ONLY,
};
for (UINT flags : candidates) {
    desc.Flags = flags;
    hr = factory2->CreateSwapChainForComposition(g_pD3DDev, &desc, nullptr, &g_pSwapChain);
    if (SUCCEEDED(hr) && g_pSwapChain) break;
}
```

原本以为没签过 PlayReady/PMP 证的普通程序调这俩标志必报 `E_INVALIDARG` 或 `E_ACCESSDENIED` 。没想到在这块 **AMD Radeon RX 9070（ `Device=0x7550` ）** 上居然直接 `S_OK` 过了， `GetDesc1` 确认 `Flags=0x420` ，BackBuffer 的 `MiscFlags=0x80000` （ `D3D11_RESOURCE_MISC_HW_PROTECTED=1` ）， `DCompositionDevice::Commit()` 返回 `0x00000000` 。

但这很快引出个很现实的怀疑：驱动放行归放行，它到底有没有真的在硬件内存层面做加密？如果换另一个完全独立的 D3D11 设备去 `OpenSharedResource` / `CopyResource` ，或者强行 Staging `Map` 读回，会不会直接把里面的内容抠出来？

为了不自欺欺人，我写了双设备 A/B 实测探针，专门往 BackBuffer 和测试纹理里 `ClearRenderTargetView` 填纯洋红 `RGBA(255,0,255,255)` 或纯青色 `RGBA(0,255,255,255)` ，然后再跨设备/同设备 `CopyResource` 到未保护 Staging 纹理映射读字节。结果挺有意思：

```
--- Case 0 (Control): Unprotected SwapChain (Requested Flags=0x0) ---
CreateSwapChainForComposition hr=0x00000000
ActualFlags=0x0 BackBuffer MiscFlags=0x0 (HW_PROTECTED=0)
  [SameDeviceA]: stgHr=0x00000000 mapHr=0x00000000 nonZero=16384/16384 exactPlain=16384 uniq=1 px={(255,0,255,255)...}

--- Case 2: HW_PROTECTED | DISPLAY_ONLY SwapChain (Requested Flags=0x420) ---
CreateSwapChainForComposition hr=0x00000000
ActualFlags=0x420 BackBuffer MiscFlags=0x80000 (HW_PROTECTED=1)
  [SameDeviceA]: stgHr=0x00000000 mapHr=0x00000000 nonZero=16384/16384 exactPlain=0 uniq=4096 px={(204,169,202,192),(140,55,146,90),(68,162,52,135),(190,20,90,85)}
  [SwapChainBackBuf] GetSharedHandle hr=0x80070057 handle=0000000000000000
  [SwapChainBackBuf] CreateSharedHandle(READ) hr=0x80070057 ntHandle=0000000000000000

--- Case 3d-Magenta (properly AcquireSync'd): HW_PROTECTED | NTHANDLE | KEYEDMUTEX (MiscFlags=0x80900) ---
  [SameDeviceA]: exactPlain=0 uniq=4096 px={(196,194,218,33),(89,219,137,10),(0,22,234,130),(86,82,136,171)}
  [Case 3d-Magenta] CreateSharedHandle(READ) hr=0x00000000 ntHandle=0000000000001864
  [Case 3d-Magenta] DeviceB OpenSharedResource1(NT) hr=0x00000000 DeviceB opened(NT) Desc MiscFlags=0x80900 (HW_PROTECTED=1)
  [DeviceB NT]: stgHr=0x00000000 mapHr=0x00000000 nonZero=16384/16384 exactPlain=0 uniq=4096 px={(196,194,218,33),(89,219,137,10),(0,22,234,130),(86,82,136,171)}

--- Case 4: Live Running Shield Curtain (DwmGetDxSharedSurface from Independent DeviceB) ---
EnumWindows total=225 WDA_MONITOR=1 FullscreenCurtain=000000000018020E (virtual=3840x2160)
DwmGetDxSharedSurface ok=0 err=3223724043 hSurf=0000000000000000 fmt=0 flags=0x0
```

几条现象能直接看出来：

-   未保护交换链（Case 0） `CopyResource` 读回 16384 个采样点全是一模一样的 `(255,0,255,255)` ，100% 明文；而 `0x420` 交换链（Case 2）不仅 `GetSharedHandle` / `CreateSharedHandle` 全报 `0x80070057` 无法导出，连同设备强行 `CopyResource` 读回的也是一片超过 4096 种杂乱像素的高熵密文， `exactPlain=0/16384` 。
-   即便建一张显式带 `SHARED_NTHANDLE | SHARED_KEYEDMUTEX` 的 `HW_PROTECTED` 纹理（Case 3d），拿 **另一个独立 D3D11 设备 Device B** 打开共享 NT 句柄后再 `AcquireSync` + `CopyResource` ， `texB` 依然保持 `MiscFlags=0x80900` ，读出来的同样是 `exactPlain=0` 的高熵密文，且跟 Device A 读出的密文字节完全一致。
-   跑探针时还顺手排查过一个小乌龙：之前未调用 `KeyedMutex::AcquireSync` 前直接读表面曾经意外读到一次未刷新前的数据，补齐正常 `AcquireSync(0)` / `ReleaseSync(0)` 流程并拿洋红、青色双色对照后，跨设备读回都是 100% 密文。
-   直接对运行中的全屏遮罩窗调 `user32!DwmGetDxSharedSurface` ，DWM 直接返回 `ok=0, err=3223724043, hSurf=0` ，连表面句柄都不给。
-   另外查 `ID3D11VideoDevice::GetContentProtectionCaps` 时注意到一个细节：RX 9070 返回 `Caps=0x0000EF31` （其中 `CAP_HARDWARE(0x2)` 为 0，而 `CAP_HW_DRM_COMM(0x4000)` 、 `CAP_HW_DRM_MT(0x8000)` 、 `CAP_TEARDOWN(0x2000)` 全为 1，受保护显存汇报 `17095983104` 字节）。说明在当前驱动下 `HW_PROTECTED` 的 TMZ 显存加密确实在硬件管线生效。目前手头只有 RX 9070 一张卡跑过，不同厂商显卡/驱动差异可能很大，触发失败时程序会按预案回落到普通 Layered 双锁模式。

### 5\. 宿主机实测结果与客观边界

仓库自带了 `CaptureAuditSuite.cpp` （29 项测试），在 Win11 25H2 (3840x2160) 宿主机上对着 High-IL + `0x420` 运行态跑出来的结果摘录如下：

```
[V01] GDI BitBlt(GetDC(NULL), SRCCOPY): non-black=0/230400 (0.00%)
[V02] GDI BitBlt(GetDC(NULL), SRCCOPY|CAPTUREBLT): non-black=0/230400 (0.00%)
[V03-V06] StretchBlt / CreateDC(DISPLAY) / DISPLAY1 / GetPixel: non-black=0 (0.00%)
[V07-V10] target GetDC / GetWindowDC / PrintWindow(0 / PW_CLIENTONLY): 0.00%
[V12] DXGI 1.2 DuplicateOutput (30-frame video): frames=30 maskedOut=26 max-non-black=0/2073600 (0.00%)
[V13] DXGI 1.5 DuplicateOutput1 (5 frames): frames=5 maskedOut=1 max-non-black=0/2073600 (0.00%)
[V14] D3D9 GetFrontBufferData: hr=0x8876086C non-black=0/0 (0.00%)
[V15-V16] Magnification API (Normal & FilterExclude WDA_MONITOR): non-black=0/160000 (0.00%)
[V17] WGC CreateForMonitor (10-frame loop): frames=10 max-non-black=80/2073600 (0.00%) (仅鼠标指针)
[V19-V20] user32!DwmGetDxSharedSurface / 20-frame GDI gdigrab: 0.00%
[V21] PASS Legacy IPC Backdoor Check
[V22] PASS Kernel DACL Anti-Kill/Dump/Inject (TermErr=5 ReadErr=5 WriteErr=5)
[V23] PASS Stealth Fingerprint Scan: signatureHits=0/5
[V24] PASS Window Tampering Attack: alive=1 vis=1 size=3840x2160 aff=1 non-black=0.00%
[V25] PASS Synthetic SendInput Spoof: maxLeak=0.00%
[V26] PASS Hotkey-Scanner Check (4/4 free): Alt+A=FREE(0) Ctrl+Alt+A=FREE(0) Ctrl+Alt+S=FREE(0) Ctrl+Alt+X=FREE(0)
[V27] PASS Topmost Z-Order Hijack (600x600 red window): GDI_nonBlack=0.00% DXGI_nonBlack=0.00%
[V29-SC] PASS SwapChain(0x420) BackBufMisc=0x80000 SameDevPlain=0/16384 Uniq=4096 SharedHr=(0x80070057,0x80070057)
[V29-XDEV] PASS IndependentDeviceB OpenSharedResource1->CopyResource: Misc=0x80900 Plain=0/16384 Uniq=4096
```

有几个明显拦不住的地方得老实讲清楚，免得误导：

1.  **宿主机同权限按 HWND 定向抓单窗口（ `PrintWindow(PW_RENDERFULLCONTENT=2)` / `WGC CreateForWindow` ）直接穿透**：桌面全屏遮罩管得了整个桌面合成和按显示器截图，但如果跟你想防的软件同跑在宿主机同权限下，对方手里只要有目标窗口句柄，Windows 原生就允许它们直接从 DWM 视觉树把那个窗口的像素拎走（实测 V11/V18 都是 100% 透出）。对于权限胃口大、自带截屏录屏或爱扫用户目录的常见桌面聊天软件 / Electron 客户端，我的做法是把它们塞进 Sandboxie-Plus，开 `BlockScreenCapture=y` 、降权、 `ClosedFilePath` 封掉 `GraphicsCapture.dll` / `Magnification.dll` / `CaptureService.dll` 以及客户端自带的截屏/录屏/D3D Hook/远控插件（顺便一坑：带通配符的版本号子目录在 `ClosedFilePath` 里路径末尾一定要带 `*` ，只写目录斜杠挡不住里面的具体 `.exe` /`.dll` ）。套上沙箱以后再拿同一个审计工具在盒子里测，宿主机 `V11` 和 `V18` 全部变成 `0.00%` 和 `0x80070005` ，敏感盘扫描也是 0 文件命中。
2.  **同一交互桌面（ `WinSta0\Default` ）下的窗口矩形元数据藏不住**：虽然沙箱已经把 `EnumWindows` 、 `GetWindowTextW` 和像素全挡掉了，但在同一个 Win32 桌面上，通过 `GetWindow(GW_HWNDNEXT)` 或 UIAutomation 依然能读到其他窗口的外框坐标和宽高（看不到图像也看不到标题）。如果连窗口宽高矩形都要彻底隐藏，就不是遮罩层能解决的，得上独立 Win32 Desktop 或虚拟机。
3.  **管理员权限对抗**：本方案设计用来防普通桌面软件（Medium-IL），对抗同等 SYSTEM 或带签名的 Ring-0 驱动不在讨论范围内。

### 6\. v4.0 到 v4.1 补齐最后两块拼图：零注入 Special-APC 单窗隐身

第 5 节实测里最遗憾的一个硬伤，是宿主机同权限下攻击者只要握有目标窗口句柄 `HWND` ，就能用 `PrintWindow(PW_RENDERFULLCONTENT=2)` （V11）或 WGC `CreateForWindow` （V18）直接从 DWM 视觉树拎走像素——此前只能把高敏客户端塞进 Sandboxie 里硬封 DLL。

从 **v4.0 到 v4.1**，我补上了「**零注入 Special-APC 单窗隐身引擎**」，在不依赖沙箱的前提下把原生宿主机 V11/V18 也压到了 **0.00%**：

-   **零注入直调系统调用存根**：不分配远程内存，不调 `WriteProcessMemory` ，也不起 `CreateRemoteThread` ；而是直接定位本进程已加载的系统签名模块 `win32u!NtUserSetWindowDisplayAffinity` ，配合 `ntdll!NtQueueApcThreadEx2` 传入 `QUEUE_USER_APC_FLAGS_SPECIAL_USER_APC (0x1)` 向目标窗口主线程投递特别用户态 APC，在目标上下文原地执行 `WDA_EXCLUDEFROMCAPTURE (0x11)` 。
-   **兼容性与安全前置校验**：Chrome / Edge / Electron 普遍开着 ACG/CFG，普通注入很容易被缓解决绝或触发崩溃。v4.1 投递前严格过四关：（1） `IsWow64Process2` 仅放行原生 64 位进程，跳过 WOW64 32 位旧宿主；（2） `CreateToolhelp32Snapshot(TH32CS_SNAPMODULE, pid)` 核对目标进程内的 `win32u.dll` 基址与偏移跟本地完全一致（本机 Win11 25H2 实测 Chrome / Edge / Weixin / Electron 均映射在相同系统基址 `0x7FF8C25B0000` ）；（3）跳过桌面壳与反作弊进程，过滤宽或高 `<16px` 或面积 `<1024px²` 的隐形占位窗；（4） **全局无白名单扩展与快巡检**：移除早先对微信 / QQ / 终端的豁免，挂上 `EVENT_OBJECT_CREATE` + `EVENT_OBJECT_SHOW` + `EVENT_OBJECT_LOCATIONCHANGE` 瞬时事件钩子、 `50ms` 巡检、 `3` 次瞬态失败重试容错，并在守护服务重启时自动认领现存已隐身窗口。
-   **`Ctrl+Alt+Q` 原子摘幕加固**：将 `RestoreAllCloakedWindows` 的异步还原确认轮询放宽至最长 `150ms` （还原完成立刻跳出），隐藏全屏幕布后连等 `3` 次 `DwmFlush()` 再执行 `BitBlt` ，抓完瞬间恢复 `WDA=0x11` 与全屏 `0x420` 幕布。

开启 v4.1 后在纯宿主机下对目标窗实测结果对比：

```
[V01-V10] GDI BitBlt / GetDC / PrintWindow(0/1): non-black=0 (0.00%)
[V11] PrintWindow(PW_RENDERFULLCONTENT=2): ok=1 non-black=0.00% | WM_PRINT: ok=1 non-black=0.00% (v4前为 100.00%)
[V12-V17] DXGI DuplicateOutput / DuplicateOutput1 / D3D9 / Magnification / WGC ForMonitor: 0.00%
[V18] WGC CreateForWindow(0x20452): blocked=0 hr=0x00000000 frames=0 max-non-black=0/0 (0.00%) (v4前为 99.98%)
[V19-V20] user32!DwmGetDxSharedSurface(0x20452) / 20-frame GDI gdigrab: ok=0 non-black=0.00%
```

宿主机 20 项全屏与定向单窗采集均压制至 **0.00%**，不再依赖沙箱才能防住 `PrintWindow(2)` 与 `WGC CreateForWindow` 。

### 7\. 踩坑实录：全局 DXGI 显存级升维 (GhostSwap Fileless PIC) 与 RX 9070 雪花屏根因定位

在做到全软件 `WDA=0x11` 的同时，我还探索了另一条更激进的路线—— **GhostSwap v2.1（无文件 `.gpic` PIC DXGI 交换链升维引擎）**，尝试把全系统所有目标 GPU 进程的 `IDXGISwapChain` 在创建与缩放时无感强行改写进显存保护状态。过程中正面撞上一个极具代表性的硬件坑： **同一套 `0x420` 机制接管后，微信怎么拖窗口都清晰正常，Chrome 一拉就满屏彩色雪花。**

**7.1 无文件 PIC + CFG 合规绕过**

-   将 C++ 编写的 DXGI Factory / SwapChain 9 槽位虚表 Hook（ `CreateSwapChain=10` / `ForHwnd=15` / `ForCoreWindow=16` / `ForComposition=24` / `Media::ForCompSurface=3` / `Present=8` / `ResizeBuffers=13` / `Present1=22` / `ResizeBuffers1=39` ）隔离放进独立 `.gpic` 代码段，以 `/O2 /GS- /GL- /EHs-c- /GR- /Oi- /guard:cf-` 编译并校验 **11,101 字节、0 重定位表项、全部入口 16 字节对齐**；
-   写入目标进程私有可执行页并回填遥测数据哨兵后，调用 `SetProcessValidCallTargets` 把 9 个桩函数偏移显式注册进 Chromium `CFG=0x1` 进程的合法间接调用位图（实测 `reg=1` 零异常）。

**7.2 为什么微信 `0x420` 不雪花，Chrome `0x420` 必变雪花？**

对比抓包运行态遥测与未改动前描述符，立刻定位出关键差异： **微信（ `Weixin.exe` ）** 使用的是 `DXGI_FORMAT_R8G8B8A8_UNORM (28)` ；而 **Chrome（ `chrome.exe` ）** 使用的是 `DXGI_FORMAT_B8G8R8A8_UNORM (87)` ，且 `BufferUsage = 0x30 (RTV | SRV)` 会在合成管线中将后备缓冲当作着色器资源回读。

在 RX 9070 上针对同一组管线跑 D3D11 对照探针实测如下：

```css
Case A: BGRA8 (87) + 0x420 (HW_PROTECTED | DISPLAY_ONLY) + Draw()               => exact=0/65536     uniq=8192  (全屏高熵乱码)
Case B: BGRA8 (87) + 0x420 + ClearBlack + Draw()                                => exact=8064/65536  uniq=8192  (明文与 TMZ 密文块混叠，呈现雪花)
Case C: BGRA8 / RGBA8 + 0x420 + SRV(0x80000) -> UnprotRT                        => exact=0/65536     uniq=8192  (Chromium Usage=0x30 SRV 回读花屏)
Case D: RGBA8 (28) + 0x420 + Draw() (微信同款路径)                              => exact=65536/65536 uniq=1     (Draw 未混入密文，故肉眼清晰)
Case E: BGRA8 (87) + 0x020 (纯 DISPLAY_ONLY) + Draw() & SRV->UnprotRT           => exact=65536/65536 uniq=1     (PrintWindow=0/65536, 0.00% 零雪花)
```

切到通用 **`0x20 DISPLAY_ONLY`** 后，Chrome 与测试目标窗在初始渲染和 `ResizeBuffers` 拉伸全过程均保持 `65536/65536 (76800/76800)` 零雪花且 `PrintWindow` 泄漏率为 **0.00%**。

**7.3 工程取舍与反手机偷拍实证**

-   **为什么 GhostSwap v2.1 默认采用「协同护盾模式」**：实测一旦把 `0x20 DISPLAY_ONLY` 焊死在浏览器交换链上，由于 DWM 强制禁止回读（且 Chromium 长期持有 RTV 引用无法在线 `ResizeBuffers` 摘除 `0x20` ），会导致用户自己按 `Ctrl+Alt+Q` 也截出纯黑框。既然 `AegisBlackout v4.1` 通过 `0x420` 幕布 + 全局无白名单 `WDA=0x11` 已实现 V01–V20 全部 `0.00%` 且支持毫秒级合法放行 `Ctrl+Alt+Q` ，GhostSwap v2.1 默认不往业务进程注入 Hook，只在后台零黑框提供一键防拍黑幕，仅在极高敏需求下通过 `--lock-vram` 启用全局 `0x20` 焊死。
-   **软件 144Hz 频闪防手机偷拍的光学局限**：实测室内手机自动拍照快门（约 `1/30s` + 多帧 HDR）积分慢于人眼暂留，任何快到不严重闪眼的软件频闪都会被手机清晰平均还原；因此 v2.1 砍掉高频频闪，改为事件驱动的 **0% 频闪、0% 空闲占用的瞬间纯黑/极暗黑幕（ `Ctrl+Alt+F9/F10/F11` ：100% 纯黑 / 85% 极暗 / 65% 低亮）**。

**7.4 \[闭源自用彩蛋\] 啃下雪花死结：GhostSwap v3.0 全自动「盒子 A」影子代理实测、Ring-0 对抗边界与为什么不开源**

前面第 7.2 节实证了 Chrome 用 `0x420` 必变雪花的原因——Chromium 在合成管线里必须把后备缓冲当作 `SRV (Usage=0x30)` 回读，而未受保护着色器读 TMZ 加密表面直接吐出高熵密文。那么能不能在不改 Chrome 一行二进制的前提下， **既让 Chrome 用普通通道丝滑画完 `SRV` 回读、又把最终上屏的后备缓冲全自动焊进真 `0x420` AMD TMZ 加密显存**？

答案是肯定的。在闭源自用的 **GhostSwap v3.0（ `--shadow-tmz` ）** 中，我通过纯无文件内存架构跑通了 **全自动「盒子 A」影子纹理代理**：

1.  **10 槽位纯内存 `.gpic` + CFG 自动过关**：PIC 桩代码扩至 `10` 个虚表槽位（`.gpic` 段实测 `29,472` 字节、 `0` 条重定位、 `16` 字节严格对齐），注入目标进程私有可执行页后自动通过 `SetProcessValidCallTargets` 注册进 `CFG=0x1` 位图；
2.  **真 `0x420` 交换链 + `GetBuffer(0)` 偷梁换柱**：创建交换链时强制写入 `0x420 (HW_PROTECTED | DISPLAY_ONLY)` ，确认真实后备缓冲带有 `MiscFlags=0x80000` （TMZ 激活）；紧接着代理拦截 `IDXGISwapChain::GetBuffer(0)` ，对外只递出一张同格式同尺寸、普通未保护的 **影子纹理 Shadow Texture (`RTV | SRV`)**；Chrome 所有的绘制、 `SRV` 回读与 `ResizeBuffers` 重建全部对影子纹理生效，从而实现 **0% 雪花**，也避免宿主直接死握真后备缓冲引用导致的拉伸死锁；
3.  **上屏前一拍硬件直通搬运**：在 `Present` / `Present1` 调用前零着色器、零状态污染地执行一条 `CopyResource(Real_0x420_BackBuffer, ShadowTexture)` ——即使是在 Chrome 同款无 `VIDEO_SUPPORT` 的 `DevFlags=0x0` 设备上，RX 9070 硬件管线依然会在写入真实 `0x420` 后备缓冲的一瞬完成全帧 TMZ 加密。

在 RX 9070（Win11 25H2）上的三组实测硬数据如下：

```swift
[1] 同设备 DevFlags=0x0 影子搬运硬件自测 (GhostSwap --shadow-tmz --self-test)
    [SHADOW-TMZ] DevFlags=0x0 CopyResource BbMisc=0x080000 MagPlain=0/65536(uniq=8192) CyanPlain=0/65536(uniq=8192) HashDiff=YES Pres=0x00000000
    [SHADOW-CAPTURE] ForHwnd 0x420 PrintWindow(PW_RENDERFULLCONTENT) nonBlack=0/65536 (0.00%)

[2] /guard:cf 强制控制流防护靶机动态拉伸压测 (256x256 -> ResizeBuffers 320x240)
    [ATTACHED] PID=22504 cfg_victim_v3.exe slots=10 CIG=0x0 CFG=0x1(reg=1)
    Verified0x20=4 VerifiedHwProt=4 Shadow=4/4/4/2(nonD3D11=0) Resize=2/2 Pres=4 Last[Flags:0x0->0x420 Misc:0x80000 Hr:0x00000000 320x240]
    [CFG-VICTIM-V3] ActFlags=(Comp=0x420 Hwnd=0x420) Pres=(0x0,0x0,0x0,0x0) Resize=(0x0,0x0)
      Before256x256: CompSRV=65536/65536(uniq=1,shMisc=0x0) HwndSRV=65536/65536(uniq=1,shMisc=0x0) PW=0/65536
      After320x240 : CompSRV=76800/76800(uniq=1,shMisc=0x0) HwndSRV=76800/76800(uniq=1,shMisc=0x0) PW=0/76800
    CFG_VICTIM_V3_ALL_PASS=1

[3] 宿主真实未修改 Chrome 接管 (chrome.exe)
    [ATTACHED] PID=18668 chrome.exe slots=10 CIG=0x0 CFG=0x1(reg=1)
    Create=1 [Primary=1 Fallback=0 Orig=0] Verified0x20=1 VerifiedHwProt=1 Shadow=1/2/22/0(nonD3D11=0) Resize=0/0 Pres=22
    Last[Flags:0x0->0x420 Misc:0x80000 Hr:0x00000000 1864x2011]
```

**很多兄弟最关心的问题：这套「盒子 A + 盒子 B」到底防不防得住 Ring-0 攻击？**

作为安全论坛发帖，不玩玄学、按攻击路径拆实话：

-   **针对「Ring-0 驱动 / PCIe DMA 直接强读已加密显存页」：盒子 A（ `0x420` AMD TMZ）真防得住。** TMZ 的硬件密钥被锁死在 GPU 安全处理器与显示引擎内部，OS 内核与 CPU 从未持有明文密钥——哪怕 Ring-0 驱动绕开 DWM 去捞 `0x420` 加密后备缓冲，或硬件插着 PCIe DMA 读取卡扫描对应物理显存页，看到的也只会是 `8192` 种高熵硬件密文（ `0/65536` 明文）或硬件导出拒绝（ `0x80070057` ）。尤其是仓库里开源的 **纯盒子 A 看图器 `AegisVault`**，高敏图片一次性直接送入 `0x420` TMZ 显存后立刻对 CPU 主机内存调用 `SecureZeroMemory` 抹零，驻留期间无论 Ring-0 扫内存还是抠显存都拿不到明文。
-   **针对「Ring-0 接管 OS 内核后转头抓未加密前置环节」：必须承认通用软件代理的客观边界。** 在 `GhostSwap v3.0` 里，为了让日常浏览器完成 `SRV` 合成不出雪花，每帧在 `CopyResource` 落入 `0x420` 之前，未加密的 **影子纹理 Shadow Texture** 与宿主 CPU 进程内存里必然短暂挂着明文帧。一旦 OS 内核本身已经沦陷给 Ring-0 恶意驱动，对手不需要去硬刚加密后的 `0x420` 后备缓冲，直接挂内核回调截获 `CopyResource` 前的影子纹理或直接刮削浏览器 CPU 内存即可绕开。这也是整套体系采用分级设计的原因： **日常桌面与浏览器用 盒子 B + 影子代理盒子 A 封死一切常规及跨显存盗采；绝对核心的机密图档用纯盒子 A (`AegisVault`)，再叠加下一期「键盘与剪贴板隔离」收口全链路。**

**为什么决定 `GhostSwap v3.0` 不开源、仅留个人闭源自用？**

原因很现实，主要是工程性能与硬件生态两条硬约束：

1.  **显卡性能与显存带宽开销**：每帧在真实交换链之外额外维护全屏分辨率尺寸的影子纹理，并在每次 `Present` 前执行一次全帧 `CopyResource` 搬运，会带来实打实的显存占用与帧提交带宽开销，在 4K 高刷多窗口高频刷新负载下对显卡性能有额外消耗；
2.  **各家显卡厂商与驱动硬件差异太大**：上述不依赖 `VIDEO_SUPPORT` （ `DevFlags=0x0` ）却能经由 `CopyResource` 自动激活 `0x420 (Misc=0x80000)` 真 TMZ 硬件加密的特性，只在个人手头的 AMD Radeon RX 9070 上完成了完整实测；不同显卡厂商（NVIDIA / Intel 核显）及各版本驱动对非商业签名进程的 `HW_PROTECTED` 、影子跨表面拷贝及合成策略行为差异很大，强行开源无法保证普遍可用性。

因此公开的 GitHub `v4.1.0` 仓库专注于提供性能无损、普适性高的 **完整盒子 B 防线（ `AegisBlackout v4.1` + `GhostSwap v2.1` + `CaptureAuditSuite` ）与纯盒子 A `AegisVault`**， `GhostSwap v3.0` 的影子代理分支决定保留为闭源自用版本。

### 8\. 坦诚复盘：Ctrl+Alt+Q 特权通道与当前体系的残余攻击面

这套架构能在不写驱动前提下彻底封住普通权限（Medium-IL）软件的 20 种录屏截屏方式与伪造按键/窗口篡改，但做完红队复盘后，依然有 **3 个真实存在的薄弱点** 必须交代清楚：

1.  **【最现实风险】特权截图写进 Windows 全局剪贴板的一瞬间可被窃取**：用户选区按回车后， `CopySelectionToClipboard` 会把完整高清 `CF_DIB` 写入桌面全局剪贴板。Windows 剪贴板在普通进程间毫无隔离，后台任意 Medium-IL 程序挂一个 `AddClipboardFormatListener` 就能在复制那一毫秒直接读走截图。
2.  **~25ms–35ms 摘幕空窗的“守株待兔”蹭拍**：攻击者自己触发不了 `Ctrl+Alt+Q` （ `SendInput` 与 RDP 硬件句柄已被硬丢弃），但如果本机潜伏一个 60–144fps 死循环抓屏木马，在用户亲手按下 `Ctrl+Alt+Q` 进行 `RestoreAllCloakedWindows` + 3× `DwmFlush()` 的数十毫秒空窗内，仍存在蹭拍到 1–2 帧的概率（需绝对免空窗可开 `--lock-vram` 或使用仓库自带的 `AegisVault` 独立看图）。
3.  **32 位 WOW64 旧宿主 / 纯传统 GDI `V19` / 同级管理员对抗边界**：Special-APC 为保稳定性跳过 32 位 WOW64 进程；对抗已获 Administrator 或 Ring-0 驱动权限的木马则已超出用户态防线能力范围（其中用户态盒子 B 确实不防 Ring-0 内核抓捕，而硬件层盒子 A 在面对 Ring-0/DMA 强读显存时的真实效力与影子代理边界已在上文 7.4 节单独拆解）。

### 9\. 下期预告：无驱动「键盘防记录 + 剪贴板防窃取」防护实战

屏幕像素已经能稳稳锁在显存和 DWM 里了，上面第 8 节暴露出来的另外两条比截屏更容易无感窃密的通道—— **键盘输入与全局剪贴板**——就是下一篇直接动手解决的目标：

-   **无驱动键盘防记录**：深度对比用户态三类主流窃键手段—— `SetWindowsHookEx(WH_KEYBOARD_LL)` 全局钩子链路、 `GetAsyncKeyState` 定时轮询扫描、以及同样借用 `RegisterRawInputDevices(RIDEV_INPUTSINK)` 后台静默抓键的对抗手法，实测无 `.sys` 驱动环境下如何发现、阻断与隔离高敏输入。
-   **剪贴板防窃取与特权截图闭环**：针对 `AddClipboardFormatListener` / `SetClipboardViewer` / `GetClipboardData` 的静默窥探和地址劫持篡改，实现 `Ctrl+Alt+Q` 特权截图加密落盘（彻底绕过全局剪贴板）、剪贴板限时自动擦除以及进程级剪贴板访问门禁。

* * *

### 源码与预编译包 (v4.1.0)

完整工程源码（含 `AegisBlackout v4.1.0` 、 `AegisBlackoutSvc` 、 `GhostSwap v2.1` 、硬件 DRM 看图器 `AegisVault` 、 `CaptureAuditSuite` 29 项审计套件与部署控制脚本）已同步推送至 GitHub 并发布 `v4.1.0` Tag：

-   GitHub 仓库： `https://github.com/verg-fe/AegisBlackout`
-   Release / Tag (v4.1.0)： `https://github.com/verg-fe/AegisBlackout/releases/tag/v4.1.0`

欢迎坛友拉源码运行 `build.bat` 并执行 `CaptureAuditSuite.exe` / `GhostSwap.exe --self-test` ，有 NVIDIA 或 Intel 核显环境的兄弟也欢迎评论区反馈各家驱动在 `0x420` / `0x20` 与 `Special-APC` 下的实测结果，下期「键盘与剪贴板防护」很快继续更新。

[#系统底层](https://bbs.kanxue.com/forum-4-1-2.htm) [#软件保护](https://bbs.kanxue.com/forum-4-1-3.htm) [#加密算法](https://bbs.kanxue.com/forum-4-1-5.htm)

* * *

## 评论

> **mb_tkndfqkv · 2 楼**
> 
> 宿主机同权限按 HWND 定向抓单窗口（PrintWindow(PW_RENDERFULLCONTENT=2) / WGC CreateForWindow）直接穿透：桌面全屏遮罩管得了整个桌面合成和按显示器截图，但如果跟你想防的软件同跑在宿主机同权限下，对方手里只要有目标窗口句柄，Windows 原生就允许它们直接从 DWM 视觉树把那个窗口的像素拎走（实测 V11/V18 都是 100% 透出）。对于权限胃口大、自带截屏录屏或爱扫用户目录的常见桌面聊天软件 / Electron 客户端，我的做法是把它们塞进 Sandboxie-Plus，开 BlockScreenCapture=y、降权、ClosedFilePath 封掉 GraphicsCapture.dll / Magnification.dll / CaptureService.dll 以及客户端自带的截屏/录屏/D3D Hook/远控插件（顺便一坑：带通配符的版本号子目录在 ClosedFilePath 里路径末尾一定要带 \*，只写目录斜杠挡不住里面的具体.exe/.dll）。套上沙箱以后再拿同一个审计工具在盒子里测，宿主机 V11 和 V18 全部变成 0.00% 和 0x80070005，敏感盘扫描也是 0 文件命中。 已修

> **wx\_空白格 · 3 楼**
> 
> 我感觉用GPU缓冲区的方法截图应该能截图的到。

> **mb_tkndfqkv · 4 楼**
> 
> > [wx\_空白格](https://bbs.kanxue.com/user-856237.htm) 我感觉用GPU缓冲区的方法截图应该能截图的到。
> 
> 不行的（正文 7.4 节也专门拆了这个边界）

> **mb_tkndfqkv · 5 楼**
> 
> 原生 0x420 HW_PROTECTED（AegisVault 路线）对“GPU 缓冲区抓屏”是真硬件级免疫：  
> 从 EXP-3C 和 EXP-4B 可见：就算恶意代码已经用同一块 GPU 设备做 CopyResource、Pixel Shader SRV 采样、甚至跨设备 OpenSharedResource1(NT)，读回 Staging/CPU 的都是随每帧明文动态变化的 TMZ 密文（洋红与青色哈希完全不同，且非黑像素 100%、不同色值数 16384+），明文还原率 0%；交换链后备缓冲调用 CreateSharedHandle/GetSharedHandle 更是直接被驱动返回 E_INVALIDARG (0x80070057)。

> **mb_tkndfqkv · 6 楼**
> 
> > [wx\_空白格](https://bbs.kanxue.com/user-856237.htm) 我感觉用GPU缓冲区的方法截图应该能截图的到。
> 
> 所以理论上只有一个办法在shield给被保护窗口打上不可截屏标签之前！给此窗口强行拦截（比如hook chrome让窗口永远不可被打上不可截屏标签）

> **mb_tkndfqkv · 7 楼**
> 
> > [mb_tkndfqkv](https://bbs.kanxue.com/user-1098976.htm) 所以理论上只有一个办法在shield给被保护窗口打上不可截屏标签之前！给此窗口强行拦截（比如hook chrome让窗口永远不可被打上不可截屏标签）
> 
> 4.2版本将会修复受保护进程的被注入问题

> **Cohen · 8 楼**
> 
> 有没有那种百分百识别是远控的,免杀都没用的
