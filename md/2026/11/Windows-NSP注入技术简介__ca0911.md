---
title: Windows NSP注入技术简介
source: https://fjqisba.github.io/2026/03/30/2026/Windows%20NSP%E6%B3%A8%E5%85%A5%E7%AE%80%E4%BB%8B/
source_host: fjqisba.github.io
clip_date: 2026-11-19T10:55:12+08:00
trace_id: 39ca683a-42c2-4e78-9449-b954c7bfd931
content_hash: f1b348eddcb40827de167465f0f61711cb604cd8175e4689a3d7b1d1d2a62fac
status: synced
tags: []
series: null
feed_source: fjqisba·Android/Hook
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41d75244-d011-81b5-a92c-f59090c7bfeb
ioc: null
---

## Windows NSP 注入：一种基于 Winsock 命名空间提供程序的 DLL 注入技术

## 前言

在 Windows 平台上，DLL 注入是一个经典话题。常见的方式有 `CreateRemoteThread` + `LoadLibrary` 、 `SetWindowsHookEx` 、AppInit_DLLs 注册表、DLL 劫持等。本文介绍一种相对冷门但非常优雅的注入方式—— **Winsock NSP（Name Space Provider）注入**。

它利用 Windows 网络子系统的合法扩展机制，让自定义 DLL 随 Winsock 初始化被自动加载到目标进程中，无需操纵目标进程的内存或线程。

## 核心原理

### Winsock 的可扩展架构

Windows Sockets 2（Winsock2）采用分层可扩展架构。除了核心的传输服务提供者（Transport Service Provider），还有一类 **命名空间提供者（Name Space Provider, NSP）**，用于将协议无关的名称解析（如 DNS、NetBIOS）以插件形式接入 Winsock 体系。

关键事实： **当任何进程加载 `ws2_32.dll` 并初始化 Winsock 时，操作系统会自动枚举注册表中所有已注册的 NSP，并依次调用它们 DLL 中的 `NSPStartup` 导出函数。**

注册表路径：

```
HKLM\SYSTEM\CurrentControlSet\Services\WinSock2\Parameters\NameSpace_Catalog5\Catalog_Entries64\
MOONSCRIPT
```

每个子项对应一个已注册的 NSP，包含 `LibraryPath` （DLL 路径）和 `ProviderId` （GUID）等字段。

### 注入流程

整个注入过程分为两步：

```
┌─────────────────────────────────────────────────────┐
│                 1. 注册阶段（一次性）                  │
│                                                     │
│   install_nsp.exe  ──WSCInstallNameSpace()──►  注册表  │
│   (管理员权限)          注册自定义 NSP                  │
│                         写入 DLL 路径和 GUID           │
└─────────────────────────────────────────────────────┘
                          │
                          │ 注册完成后，对所有后续启动的
                          │ 使用 Winsock 的进程生效
                          ▼
┌─────────────────────────────────────────────────────┐
│              2. 注入阶段（自动触发）                    │
│                                                     │
│   目标进程启动                                        │
│       │                                             │
│       ├─► 加载 ws2_32.dll                            │
│       │                                             │
│       ├─► Winsock 初始化                              │
│       │    └─► 枚举注册表中的 NSP 列表                  │
│       │         └─► LoadLibrary("nsp_payload.dll")   │
│       │              └─► 调用 NSPStartup()            │
│       │                   └─► 执行 payload 逻辑       │
│       │                        (检查进程 → 加载目标DLL) │
│       │                                             │
│       └─► 进程正常继续运行                              │
└─────────────────────────────────────────────────────┘
SCSS
```

## 技术实现细节

### 1\. NSP Payload DLL

NSP DLL 的核心要求非常简单： **导出一个 `NSPStartup` 函数**。

```c
// nsp_payload.def
LIBRARY nsp_payload
EXPORTS
    NSPStartup
C
```

`NSPStartup` 是 Winsock 规定的 NSP 入口点，签名如下：

```c
int WSPAPI NSPStartup(LPGUID lpProviderId, LPNSP_ROUTINE lpnspRoutines);
C
```

当 Winsock 加载此 NSP 时，会调用 `NSPStartup` 并传入一个 `NSP_ROUTINE` 结构体指针，要求我们填充回调函数表。我们只需用空壳函数填充即可——因为我们的目的不是提供真正的名称解析服务，而是借此机会获得目标进程内的执行权：

```c
int WSPAPI NSPStartup(LPGUID lpProviderId, LPNSP_ROUTINE lpnspRoutines)
{
    // 保证 payload 只执行一次
    if (InterlockedCompareExchange(&g_initialized, 1, 0) == 0)
        DoPayload();

    // 填充空壳回调，满足 Winsock 的接口要求
    lpnspRoutines->cbSize                = sizeof(NSP_ROUTINE);
    lpnspRoutines->dwMajorVersion        = 1;
    lpnspRoutines->dwMinorVersion        = 0;
    lpnspRoutines->NSPCleanup            = NSPCleanup;
    lpnspRoutines->NSPLookupServiceBegin = NSPLookupServiceBegin;
    lpnspRoutines->NSPLookupServiceNext  = NSPLookupServiceNext;
    lpnspRoutines->NSPLookupServiceEnd   = NSPLookupServiceEnd;
    lpnspRoutines->NSPSetService         = NSPSetService;
    lpnspRoutines->NSPInstallServiceClass = NSPInstallServiceClass;
    lpnspRoutines->NSPRemoveServiceClass = NSPRemoveServiceClass;
    lpnspRoutines->NSPGetServiceClassInfo = NSPGetServiceClassInfo;
    return NO_ERROR;
}
C
```

`DoPayload` 是实际的注入逻辑。典型实现是检查当前进程是否为目标，然后加载真正的功能 DLL：

```c
static void DoPayload()
{
    if (!IsTargetProcess())
        return;

    // 从 NSP DLL 所在目录加载目标 DLL
    wchar_t selfDir[MAX_PATH] = { 0 };
    GetModuleFileNameW(g_hSelfModule, selfDir, MAX_PATH);
    PathRemoveFileSpecW(selfDir);
    PathAppendW(selfDir, L"TargetPayload.dll");

    // 防止重复加载
    if (GetModuleHandleW(L"TargetPayload.dll") != NULL)
        return;

    LoadLibraryW(selfDir);
}
C
```

### 2\. NSP 注册器

注册通过 `WSCInstallNameSpace` API 完成，需要管理员权限：

```c
GUID g_nspGuid = { 0xA1B2C3D4, 0xE5F6, 0x7890,
    { 0xAB, 0xCD, 0xEF, 0x12, 0x34, 0x56, 0x78, 0x90 } };

int DoInstall()
{
    WSADATA wsa;
    WSAStartup(MAKEWORD(2, 2), &wsa);

    // 先清理可能存在的旧注册
    WSCUnInstallNameSpace(&g_nspGuid);

    wchar_t displayName[] = L"MyNSP_Provider";
    int ret = WSCInstallNameSpace(
        displayName,     // 显示名称
        dllPath,         // DLL 完整路径
        NS_DNS,          // 命名空间类型
        0,               // 版本
        &g_nspGuid       // 唯一 GUID
    );

    WSACleanup();
    return ret;
}
C
```

卸载同样简洁：

```c
int DoUninstall()
{
    WSADATA wsa;
    WSAStartup(MAKEWORD(2, 2), &wsa);
    WSCUnInstallNameSpace(&g_nspGuid);
    WSACleanup();
}
C
```

### 3\. 注入时机与初始化保护

NSP DLL 在 Winsock 初始化时被加载，这意味着：

-   **时机极早**：在目标进程的网络功能初始化阶段就已获得执行权
-   **可能被多次调用**：某些进程可能多次初始化 Winsock，需要用 `InterlockedCompareExchange` 保证 payload 只执行一次
-   **DllMain 中不应做复杂操作**：遵循 Windows loader lock 规则，真正的 payload 放在 `NSPStartup` 中而非 `DllMain`

```c
BOOL APIENTRY DllMain(HMODULE hModule, DWORD dwReason, LPVOID lpReserved)
{
    if (dwReason == DLL_PROCESS_ATTACH)
    {
        g_hSelfModule = hModule;           // 仅保存模块句柄
        DisableThreadLibraryCalls(hModule); // 减少不必要的回调
    }
    return TRUE;
}
C
```

## 与其他注入方式的对比

| 特性  | NSP 注入 | CreateRemoteThread | AppInit_DLLs | DLL 劫持 |
| --- | --- | --- | --- | --- |
| 需要操纵目标进程 | 否   | 是   | 否   | 否   |
| 需要管理员权限 | 安装时需要 | 需要  | 需要  | 不需要 |
| 持久性（重启生效） | 是   | 否   | 是   | 是   |
| 目标范围 | 所有使用 Winsock 的进程 | 指定进程 | 所有加载 user32.dll 的进程 | 指定程序目录 |
| 注入时机 | Winsock 初始化时 | 任意时刻 | 进程启动时 | DLL 搜索时 |
| 稳定性 | 高（系统机制） | 中（可能被拦截） | 中（已被部分弃用） | 低（依赖搜索顺序） |
| 隐蔽性 | 高   | 低   | 低   | 中   |
| 使用的 API | WSCInstallNameSpace | OpenProcess 等 | 注册表 | 无   |

## 局限性

1.  **仅对使用 Winsock 的进程有效**：不加载 `ws2_32.dll` 的纯计算程序不会触发
2.  **全局影响**：注册后影响系统上所有使用 Winsock 的进程，payload 中必须做好进程过滤
3.  **需要管理员权限注册**： `WSCInstallNameSpace` 需要写入 `HKLM` 注册表
4.  **NSP DLL 路径变更需要重新注册**：注册表中记录的是绝对路径

## 安全与清理

-   注册信息写入注册表 `NameSpace_Catalog5` ，可通过 `WSCUnInstallNameSpace` 清除
-   Payload DLL 应在非目标进程中尽快返回，避免不必要的性能开销
-   建议在 payload 中加入版本检查或开关文件机制，方便远程禁用
