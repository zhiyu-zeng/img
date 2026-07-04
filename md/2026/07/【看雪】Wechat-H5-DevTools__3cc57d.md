---
title: 【看雪】Wechat H5 DevTools
source: https://bbs.kanxue.com/thread-291879.htm
source_host: bbs.kanxue.com
clip_date: 2026-07-04T16:52:42+08:00
trace_id: 05e016e7-0e27-4984-815c-8c8e82686771
content_hash: cfb46f5bf54f5a53c4e5a65075ff1ffd0c5c64bd00e8fe1aaf946e11c97ffda4
status: summarized
tags:
  - 看雪
series: null
feed_source: 看雪·Android安全
ai_summary: 通过Frida Hook强制微信使用系统WebView内核渲染H5页面，从而启用`chrome://inspect`标准调试功能。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 39375244-d011-8109-bf7d-f443761c740f
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 通过Frida Hook强制微信使用系统WebView内核渲染H5页面，从而启用`chrome://inspect`标准调试功能。
> 
> - **根本原因：** 微信默认使用自研的Pinus内核渲染H5，它通过私有WebSocket隧道调试，不开放标准`webview_devtools_remote`调试端口；而`setWebContentsDebuggingEnabled(true)`仅能开启系统WebView的标准调试端口，两者不匹配导致无法连接。
> - **核心原理：** 内核选择由`com.tencent.xweb.WebView.H0`函数决定且进程内只决策一次。通过Hook此函数，强制其返回枚举值`WV_KIND_SYS`，可使微信使用系统WebView（标准Chromium）渲染页面。
> - **具体操作：** 在微信UI进程`com.tencent.mm`中，使用Frida注入脚本，在首次打开H5网页前Hook住`H0`函数并强制返回`SYS`，同时调用`setWebContentsDebuggingEnabled(true)`开启标准调试。
> - **操作流程：** 1) 完全关闭微信；2) 重新打开微信但暂不点击链接；3) 用Frida附加UI进程并注入Hook脚本；4) 在微信内点击目标H5链接；5) 此时`chrome://inspect`即可发现并调试该页面的真实DOM、控制台和网络请求。
> - **局限说明：** 此方法仅针对微信内通过浏览器引擎打开的H5网页，不适用于小程序。

环境:Android Wechat 8.0.69  
目标:让 `chrome://inspect` 能看到并调试微信内打开的 H5 网页 (真实 DOM / Console / Network / 断点), 不包括小程序

## 背景

**微信有两套浏览器内核**

微信打开网页不是用一个固定的浏览器,而是在 **XWeb** 框架下可选多个内核。本文只关心两个:

### Pinus 内核(默认)

**Pinus 是腾讯基于 Chromium 自研裁剪的浏览器内核** (源码路径里叫 `weblayer`,基于 Chrome 116),  
以 `libxwebcore.so` (135MB)的形式打包在微信里,类名 `com.tencent.xweb.pinus.sdk.WebView`,  
内核类型枚举值 `WV_KIND_PINUS`

**它的调试不走标准通道**:Pinus 不开标准的 `webview_devtools_remote` 调试端口,而是走微信  
自己的私有远程调试(往 `xweb.weixin.qq.com` 拨 WebSocket 隧道),chrome 连不上

### 系统 WebView 内核

就是 Android 系统自带的 WebView(本机是 `libmonochrome_64.so`,171MB,Chrome 130),  
内核类型 `WV_KIND_SYS` 。它是 **标准 Chromium**,开启调试后会 bind 标准的  
`webview_devtools_remote_<pid>` 端口,`chrome://inspect` 直接就能连

### 开启 webview 调试为什么无法连接上

调用 `android.webkit.WebView.setWebContentsDebuggingEnabled(true)` 想开调试但因为 **渲染页面的是 Pinus,开调试端口的却是系统 WebView** 。所以 `chrome://inspect` 里能看到"远程浏览器",却没有可点的 page。

```python
com.tencent.mm (UI 进程)
├── Pinus 内核 (libxwebcore, Chrome116)
│     渲染 H5 页面 ✓    不开标准调试端口 ✗  -> 走私有隧道 → xweb.weixin.qq.com
└── 系统 WebView 内核 (libmonochrome, Chrome130)
      开调试端口 ✓        默认不渲染页面 ✗  -> /json 恒为 [],无法 inspect
```

## 1\. 做法总览

强制微信用系统 WebView 渲染 H5 + 开启系统 WebView 调试。 `setWebContentsDebuggingEnabled(true)` 只对 系统 WebView 那套生效

## 2\. 选择内核

```python
WebView.I0(ctx, kind, module, cb)       initWebviewCore — 真正的初始化入口
  ├─ WebView.H0(kind, module)           getPreferedWebviewType — 解析用哪个内核
  │    └─ t0.a.c(module)                t0.a = new u0()  (u0 的静态单例)
  │         └─ u0.c(module)             读 HardCodeWebView<module> → ABTestWebView<module>
  │              └─ z3.f()              打开 SharedPreferences "xweb_debug"
  └─ WebView.J0(ctx, H0 返回值, …)       成功则 WebView.m = kind, 进程内只决策一次
```

### 2.1 枚举 f1

```java
// com.tencent.xweb.f1  (X5 字段已移除, 仅留在 values 数组)
public enum f1 {
    WV_KIND_NONE,   // ordinal 0 → 字段 d
    WV_KIND_CW,     // ordinal 1 → 字段 e
    WV_KIND_X5,     // ordinal 2 (无字段, 已移除)
    WV_KIND_SYS,    // ordinal 3 → 字段 f
    WV_KIND_PINUS   // ordinal 4 → 字段 g
}
```

### 2.2 WebView.H0 — 决策入口

```java
// com.tencent.xweb.WebView.H0(f1 kind, String module) 原名 getPreferedWebviewType
public static f1 H0(f1 f10, String s) {
    f1 f11 = f1.d;                                   // d = NONE
    if (WebView.m != f11) return WebView.m;          // ★ 已决策过 → 直接用缓存 (进程内只一次)
    if (br5.a.c()) { br5.s0.d(69L, 1); return f1.f; } // x86 → f = SYS

    f1 f13 = t0.a.c(s);                              // 读 HardCodeWebView<module> (见 2.3)
    if (f13 == f11) {                                // 没配 HardCode
        String s1 = b.m().g("setwebtype", s);        //   退而读服务器 cmd 配置
        if (s1 != null && !s1.isEmpty()) f10 = f1.valueOf(s1);
    } else {
        f10 = f13;                                   // 用 HardCode (优先级最高, 跳过 cmd 配置)
    }

    f1 f12 = f1.f;                                   // 默认 = SYS
    if (f10 != f1.e && f10 != f1.g) {                // 非 CW(e) 且 非 PINUS(g)
        f12 = f10;                                   //   采用 f10
    } else {
        WebView.p = true;                            //   标记 xweb 不可用, 兜底 SYS
    }
    return f12;                                      // 交给 I0→J0 写进 WebView.m
}
```

代码里直接读出三点:

-   **只决策一次**:`WebView.m != NONE` 就直接返回。 `WebView.m` 由 `I0` (`initWebviewCore`)→ `J0` 在第一个 WebView 创建时写一次(`WebView.m = f10`),之后全进程复用 —— 运行时改 `WebView.m` 或刷页面没用,旧 WebView 早用 Pinus 建好了。
-   **HardCode 优先级最高**:`t0.a.c(module)` 返回非 NONE 就直接采用,根本不读服务器 `setwebtype` 。
-   **CW / PINUS 兜底成 SYS**:落 else 分支 `WebView.p=true` 。我们写 `WV_KIND_SYS` 不触发兜底,稳走 SYS。

### 2.3 u0.c — 读 HardCodeWebView

```java
// com.tencent.xweb.u0.c(String module)
public f1 c(String s) {
    f1 f10 = f1.d;                                                  // NONE
    if (s == null || s.isEmpty() || this.a == null) return f10;
    SharedPreferences sp = z3.f();                                  // 打开 "xweb_debug" (见 2.4)
    if (sp == null) return f10;
    String s1 = sp.getString("HardCodeWebView" + s, "");            // ★ 先 HardCode
    if (s1 == null || s1.isEmpty() || s1.equals("WV_KIND_NONE")) {
        s1 = sp.getString("ABTestWebView" + s, "");                 //   再 ABTest 兜底
    }
    if (s1 == null || s1.isEmpty()) return f10;
    try { this.b = f1.valueOf(s1); } catch (Throwable t) { this.b = f10; }
    return this.b;
}
```

### 2.4 z3.f — 打开 xweb_debug

```java
// br5.z3
public static SharedPreferences f() { return z3.h("xweb_debug"); }

public static SharedPreferences h(String s) {        // z3.h = 经典 SP (非 MMKV)
    Context context0 = z3.b;
    if (context0 == null) return null;
    return context0.getSharedPreferences(s, 4);       // MODE_MULTI_PROCESS
}
```

串起来:往 `xweb_debug` 写 `HardCodeWebViewmm = WV_KIND_SYS` → `u0.c("mm")` 返回 SYS → `H0` 采用、返回 SYS → `I0/J0` 写进 `WebView.m` → 系统内核渲染、标准调试端口有页面。

## 3\. 落地代码

```typescript
function hookDevTools() {
    // 选择内核 H0 恒返回 SYS
    const W = Java.use('com.tencent.xweb.WebView')
    const F: any = Java.use('com.tencent.xweb.f1')
    const SYS = F.valueOf('WV_KIND_SYS')
    W.H0.implementation = function (kind: any, m: any) {
        W.m.value = SYS
        log('call com.tencent.xweb.WebView.H0', kind, m, '->', SYS)
        return SYS
    }
    // 启用调试
    Java.perform(() => {
        Java.scheduleOnMainThread(() => {
            Java.use('android.webkit.WebView').setWebContentsDebuggingEnabled(true);
            utils.log('call WebView.setWebContentsDebuggingEnabled(true)')
        })
    })
}
```

## 4\. 注入哪个进程、具体怎么做

**核心前提**:`hookDevTools` 只要保证 `WebView.H0` 在 **首次点开 H5 网页之前** 被 hook 住即可。

**注入进程**:UI 进程 `com.tencent.mm` (无后缀)。它是最终渲染 H5、 `H0` 选择内核的进程。

**完整流程**:

```bash
# 1. 完全关闭微信
adb shell am force-stop com.tencent.mm

# 2. 手动打开微信 App 先别点任何网页

# 3. frida attach UI 进程, 加载脚本

# 4. 在微信里点开目标 H5 网页
#    → 首次点击触发 H0 → 被 hook 强制成系统 WebView 内核渲染
#    → setWebContentsDebuggingEnabled(true) 已开, 页面注册进标准调试端口

# 5. 电脑 chrome 打开 chrome://inspect
#    → Devices 里直接出现该页面 → 点 inspect (真 DOM/Console/Network/断点)
```

* * *

## 附:关键符号

| 符号  | 作用  |
| --- | --- |
| `com.tencent.xweb.f1` | 内核类型枚举 (WV_KIND\_\*) |
| `com.tencent.xweb.WebView.H0(f1, String)` | 内核决策入口 (getPreferedWebviewType) |
| `com.tencent.xweb.WebView.m` | 缓存已决策内核的静态字段 |
| `com.tencent.xweb.u0.c(String)` | 从 xweb_debug SP 读 HardCodeWebView |
| `br5.z3.f()` | 打开 SharedPreferences “xweb_debug” |
| `com.tencent.xweb.pinus.sdk.WebView` | Pinus 内核 WebView |

Native 模块:

| 模块  | 说明  |
| --- | --- |
| `libxwebcore.so` | Pinus 内核 (Chrome 116),渲染页面 |
| `libmonochrome_64.so` | 系统 WebView (Chrome 130),标准调试端口 |
| socket `webview_devtools_remote_<pid>` | 系统 WebView 的调试端口 |

`libxwebcore.so` Pinus 私有调试函数(`libxwebcore.so.i64`):

| RVA | 名字  | 作用  |
| --- | --- | --- |
| `0x2715658` | `XWebFrameHelper_CreateXWebExtend` | 注入 `window.xweb_remote_debug` |
| `0x2715ABC` | (AddRemoteDebugMethods) | 注册 JS 方法;`RemoteDebugStart` 有域名锁 |
| `0x2716500` | (HandleRemoteDebugStart) | Start 处理,二次域名校验 + 取 token |
| `0x2711A18` | `XWeb_RD_CreateDevice` | 注册设备,硬编码 create_device URL |
| `0x2711F64` | (device tunnel WS) | 开设备隧道 rd/device |
| `0x270EB0C` | `XWebDevTools_OnTunnelData` | 设备隧道命令分发 |
| `0x270D194` | `XWebTarget_StartClientProxy` | 开目标隧道,硬编码 rd/target URL |
| `0x270CF24` | (target onMessage) | 目标隧道 server→CDP 入口 |
| `0x3627EEC` | (session dispatch) | CDP→server 出口 |
| `0x270A3D4` | `XWebWebSocketAdapter::Write` | 裸字节写 WS(无自定义封包) |
| `0x26D8860` | `std::string::operator==(char*)` | 域名锁字符串比较(绕过点) |
| `0x3615C5C` | `XWeb_GetTabHostById` | 按 targetId 查真实 DevToolsAgentHost |

提取 `libxwebcore.so`:解 `split_delivery.config.arm64_v8a.apk` → 取 `libxwebfullpack.so`  
(是个 zip)→ 再解出 `libxwebcore.so` 。  
提取 `libmonochrome_64.so`:从 `com.google.android.trichromelibrary_*` 的 `base.apk`  
取 `lib/arm64-v8a/libmonochrome_64.so` 。
