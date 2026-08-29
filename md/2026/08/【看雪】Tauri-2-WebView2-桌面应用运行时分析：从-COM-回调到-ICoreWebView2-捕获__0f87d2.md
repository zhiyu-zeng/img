---
title: 【看雪】Tauri 2 / WebView2 桌面应用运行时分析：从 COM 回调到 ICoreWebView2 捕获
source: https://bbs.kanxue.com/thread-292806.htm
source_host: bbs.kanxue.com
clip_date: 2026-08-30T04:17:17+08:00
trace_id: cbe49b1b-0d0c-444e-bedb-939c9a092746
content_hash: 7ff60888c9d9db6f0c062c882f5b8aa2d2c834c30f6a6745d885ee9ff2f4a9ad
status: synced
tags:
  - 看雪
  - Windows逆向
  - WebView2
series: null
feed_source: 看雪·逆向工程
ai_summary: 通过代理dwmapi.dll在进程启动早阶段Hook WebView2生命周期，捕获ICoreWebView2并在STA线程注入JS，实现免登录离线解锁Tauri应用。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3cb75244-d011-81d2-9c18-cd8c39adce18
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 通过代理dwmapi.dll在进程启动早阶段Hook WebView2生命周期，捕获ICoreWebView2并在STA线程注入JS，实现免登录离线解锁Tauri应用。
> 
> - **核心思路：** 放弃追踪Rust Native业务层，改为从WebView2生命周期截取宿主创建的ICoreWebView2，通过其API直接控制前端JavaScript，从而实现免登录离线解锁。
> - **捕获链路：** 先Hook CreateCoreWebView2EnvironmentWithOptions并以COM Proxy包装异步Handler，再对Environment的vtable hook Controller创建接口，最终调用get_CoreWebView2拿到ICoreWebView2。
> - **关键坑（STA线程）：** WebView2基于COM STA，必须在创建线程调用其API；解决方案是在WebView线程创建Message-Only Window作为Dispatcher，其他线程用PostMessage将操作送回该线程，包括Release也尽量回到原线程。
> - **入口覆盖与时机：** 除Hook WebView2Loader公开API外，还需通过Hook GetProcAddress补装内部函数CreateWebViewEnvironmentWithOptionsInternal；Proxy DLL选择加载最早的dwmapi.dll，确保在Environment创建前完成Hook。
> - **注入时机：** 使用AddScriptToExecuteOnDocumentCreated而非ExecuteScript，它会在全局对象创建后、HTML解析及页面脚本前执行，适合观察fetch、localStorage等初始化行为。

最近研究了一下 iShellPro。

这是一个基于 **Tauri 2 + WebView2** 的 Windows 程序，最后实现了免登录、纯离线解锁全部本地功能。

一开始按传统思路去逆 Rust Native 层，但很快发现一个问题：

> 对于 Tauri 这类 Hybrid Desktop Application，大量真正的业务逻辑其实运行在 WebView 的 JavaScript 环境中。

与其在几十 MB 的 Rust Release 二进制里追业务函数，不如换个目标：

> **直接拿到宿主创建的 `ICoreWebView2` 。**

最终实现的核心链路如下：

```
Proxy DLL
    ↓
进入目标进程
    ↓
Hook WebView2 Environment 创建
    ↓
ICoreWebView2Environment
    ↓
Hook Controller 创建
    ↓
ICoreWebView2Controller
    ↓
get_CoreWebView2()
    ↓
ICoreWebView2
    ↓
切回 WebView 所在线程
    ↓
AddScriptToExecuteOnDocumentCreated
    ↓
JavaScript Runtime
```

本文主要记录实现过程中几个比较关键的点。

* * *

## 0x01 为什么直接盯 WebView2

Tauri 2 在 Windows 上的结构大致可以理解成：

```
Rust / Tauri
    ↓
WRY
    ↓
WebView2
    ↓
HTML / JavaScript
```

如果目标逻辑最终由前端消费，那么持续追踪 Rust Native 层并不一定是效率最高的路线。

WebView2 本身有一套比较清晰的生命周期：

```
Create Environment
    ↓
ICoreWebView2Environment
    ↓
Create Controller
    ↓
ICoreWebView2Controller
    ↓
get_CoreWebView2()
    ↓
ICoreWebView2
```

所以思路也很直接：

**不去关心 Tauri 内部究竟怎么保存 WebView，而是在 WebView2 生命周期中把对象截出来。**

* * *

## 0x02 捕获 ICoreWebView2Environment

第一步 Hook：

```cpp
CreateCoreWebView2EnvironmentWithOptions
```

WebView2 的 Environment 创建是异步的，最终结果通过 COM Completion Handler 返回：

```cpp
handler->Invoke(
    HRESULT,
    ICoreWebView2Environment*
);
```

这里没有直接修改宿主原本的 Handler，而是在外面套一层 Proxy：

```cpp
HRESULT EnvironmentCompletedProxy::Invoke(
    HRESULT error,
    ICoreWebView2Environment* environment)
{
    if (SUCCEEDED(error) && environment)
        InstallEnvironmentHooks(environment);

    return original_->Invoke(
        error,
        environment
    );
}
```

这样做有两个目的：

1.  捕获 `ICoreWebView2Environment`
2.  不破坏宿主原来的初始化流程

COM Proxy 中的：

```
QueryInterface
AddRef
Release
```

也必须正确实现。

否则即使 Hook 本身没有问题，也很容易因为引用计数或对象生命周期出现随机崩溃。

* * *

## 0x03 从 Environment 截获 Controller 创建

拿到：

```cpp
ICoreWebView2Environment*
```

之后，就可以继续从 COM vtable 中截获 Controller 创建函数。

项目里处理了几条常见路径：

```
CreateCoreWebView2Controller
CreateCoreWebView2CompositionController
CreateCoreWebView2ControllerWithOptions
CreateCoreWebView2CompositionControllerWithOptions
```

这里不能只盯着最基础的 `CreateCoreWebView2Controller` 。

不同的 WebView2 Runtime、框架版本以及初始化方式，可能会走不同的 Environment Interface。

所以我的处理方式是：

> 先通过 `QueryInterface` 探测高版本 Environment Interface，再对实际存在的创建入口分别安装 Hook。

这样比单押某一个接口稳定得多。

* * *

## 0x04 捕获 ICoreWebView2

Controller 的创建同样通过 Completion Handler 完成。

因此继续使用 Proxy：

```cpp
HRESULT ControllerCompletedProxy::Invoke(
    HRESULT error,
    ICoreWebView2Controller* controller)
{
    ICoreWebView2* webview = nullptr;

    if (SUCCEEDED(error) && controller)
        controller->get_CoreWebView2(&webview);

    auto hr = original_->Invoke(
        error,
        controller
    );

    if (webview) {
        SaveWebView(webview);
        webview->Release();
    }

    return hr;
}
```

到这里，真正需要的对象就拿到了：

```cpp
ICoreWebView2*
```

理论上接下来已经可以通过 WebView2 API 与页面交互。

但这里有一个比 Hook 本身更容易踩的坑。

* * *

## 0x05 最大的坑：COM STA 线程

一开始拿到 `ICoreWebView2*` 后，我直接尝试：

```cpp
webview->ExecuteScript(...)
```

然后很快遇到了：

```
RPC_E_WRONG_THREAD
```

原因是 WebView2 基于 COM STA。

简单理解：

```
WebView 在线程 A 创建
        ↓
相关 WebView2 API
通常也必须在线程 A 调用
```

所以不能在一个工作线程里保存 `ICoreWebView2*` ，然后想什么时候调就什么时候调。

最后采用的方案是：

> **在 WebView 所在线程创建一个 Message-Only Window，把它作为 Dispatcher。**

```cpp
CreateWindowExW(
    0,
    className,
    L"",
    0,
    0, 0, 0, 0,
    HWND_MESSAGE,
    nullptr,
    module,
    nullptr
);
```

其他线程只负责：

```cpp
PostMessageW(...)
```

真正涉及 WebView2 的操作统一回到窗口所属线程：

```
Worker Thread
    ↓
PostMessage
    ↓
WebView UI Thread
    ↓
ICoreWebView2 API
```

包括部分 COM 对象的 `Release()` ，也最好回到原线程完成。

这个问题在单窗口、短时间测试时可能并不明显，但到了：

```
多窗口
Reload
窗口关闭
WebView 重建
```

之后，对稳定性的影响会非常明显。

整个项目里，我认为这一点比单纯“拿到 `ICoreWebView2` ”更值得注意。

* * *

## 0x06 补齐创建入口，以及为什么必须足够早

仅仅 Hook：

```
WebView2Loader.dll
```

并不一定能覆盖所有情况。

实际运行中，框架还可能动态解析内部入口：

```
CreateWebViewEnvironmentWithOptionsInternal
```

因此项目同时 Hook 了：

```cpp
GetProcAddress
```

当目标程序解析该内部函数时，再补装对应 Hook。

也就是说，Environment 的捕获实际上覆盖了两类入口：

```
Public WebView2Loader
        │
        ├──────────────┐
        ↓              ↓
 Public Hook      Internal Runtime
                       ↓
                  GetProcAddress
                       ↓
                  Internal Hook
        └───────┬──────┘
                ↓
       Environment Proxy
                ↓
        Controller Hook
                ↓
          ICoreWebView2
```

但这里还有一个前提：

> **这些 Hook 必须在 WebView2 Environment 创建之前安装完成。**

所以 Proxy DLL 真正重要的并不是“代理哪个 DLL”，而是：

> **哪个可利用 DLL 能在目标进程启动阶段足够早地被加载。**

实际观察模块加载顺序后，我排除了几类不适合作为入口的 DLL：

```
KnownDLLs
COM 方式加载的 DLL
由其他模块间接加载的 DLL
```

最后选择了剩余候选中加载时机最早的 **dwmapi.dll**。

原因很简单。

如果发生：

```
WebView2 Environment 已创建
        ↓
Proxy DLL 才进入进程
```

那么即使后面的 Hook 实现完全正确，也已经错过最关键的生命周期节点。

代理 DLL 本身，只需要保证原有导出正常转发，不影响宿主启动即可。

真正的核心仍然是后面的 WebView2 Capture。

* * *

## 0x07 为什么用 AddScriptToExecuteOnDocumentCreated

拿到 `ICoreWebView2` 后，可以直接：

```cpp
ExecuteScript(...)
```

但 `ExecuteScript` 更适合页面已经运行之后临时执行 JavaScript。

如果目标是观察页面初始化阶段，比如：

```
fetch
localStorage
全局对象
框架初始化
```

更合适的是：

```cpp
AddScriptToExecuteOnDocumentCreated
```

它的执行时机更早，大致可以理解成：

```
Global Object Created
        ↓
Injected Script
        ↓
HTML Parse
        ↓
Page JavaScript
```

* * *

## 0x08 从 Target Patch 到 Framework Instrumentation

如果只是针对单一版本做修改，传统思路通常是：

```
找到业务判断
    ↓
修改分支
    ↓
结束
```

问题是这种方式往往高度依赖：

```
版本
Offset
具体编译结果
```

而这次做的事情不太一样。

Hook 的目标主要是：

```
WebView2 生命周期
COM Interface
Framework Runtime
```

关注点从：

```
Target Specific Patch
```

变成了：

```
Framework Level Instrumentation
```

因此 WebView2 Capture 这一层并不完全依赖 iShellPro 本身。

对于其他使用 WebView2 的程序，例如：

```
Tauri
WPF WebView2
WinForms WebView2
WinUI WebView2
```

同样具有一定复用价值。

这也是这次分析里我觉得最有意思的地方。

* * *

## 0x09 总结

整个项目真正想解决的问题其实只有一个：

> **如何稳定地拿到宿主程序创建的 `ICoreWebView2` ，并在正确的 STA 线程上，在页面脚本之前进入 JavaScript Runtime。**

围绕这个目标，最终串起来的知识点包括：

```
DLL Proxy / API Forwarding
Inline Hook
COM / vtable
Reference Counting
WebView2 Lifecycle
STA
Windows Message Pump
JavaScript Runtime
```

对于 Tauri / WebView2 这类 Hybrid Desktop Application，我觉得比较值得记住的并不是某个具体业务字段，而是一个分析思路：

> **不一定非要从业务代码本身下手，也可以从承载业务代码的 Framework Runtime 和生命周期下手。**

目前代码中，我认为最值得单独抽象出来的也是 WebView2 Capture 这一层。

以后遇到类似目标，基本可以沿着：

```
Environment
    ↓
Controller
    ↓
ICoreWebView2
```

继续往下分析。

仓库：

```
https://github.com/lwtw123456/iShellPro-Hack
```

如有错误，欢迎各位师傅指正。
