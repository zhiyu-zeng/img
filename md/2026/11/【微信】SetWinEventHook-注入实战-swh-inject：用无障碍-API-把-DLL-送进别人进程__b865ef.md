---
title: 【微信】SetWinEventHook 注入实战 | swh-inject：用无障碍 API 把 DLL 送进别人进程
source: https://mp.weixin.qq.com/s/9bH4djJR1u3jVFd0sSPvKQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-15T08:49:24+08:00
trace_id: 79656bb2-a014-415d-b2d0-46a5ddbf5c25
content_hash: 5bee2146d5b29b55c8f75d85ec41bfcea77ed8e0442d1ef9a54148947a866dd3
status: synced
tags:
  - 微信
  - Windows逆向
  - 注入
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: |-
  - **注入原理：** `SetWinEventHook` + `WINEVENT_INCONTEXT` + 本进程已加载的 DLL 模块句柄，Windows 会把该模块加载进事件源进程并在其 UI 线程调用回调，全程无 WriteProcessMemory、无远程线程。
  - **三个坑：** `hMod` 必须是已加载模块句柄（先 LoadLibrary 自己）；回调需 `extern "C" __declspec(dllexport)` 导出；路径必须绝对。
  - **用握手代替 Sleep：** `SetWinEventHook` 返回非 NULL 只代表注册成功，注入是惰性的；工具用目标进程 DllMain 里 `SetEvent` 具名事件 + 注入器等待的方式证明注入真实发生，再用 Toolhelp32Snapshot 交叉校验模块表。
  - **两个反常识实测：** `--trigger` 发窗口消息是概率性的（WinUI3 记事本有效，charmap.exe 老式对话框无效）；DLL 不驻留——注入器退出后钩子消亡，DLL 随之被卸载，故重活须在回调窗口期内完成。
  - **局限：** 仅适用于同 desktop、有 UI、位数一致的进程；回调跑在目标 UI 线程不能做耗时操作；跨进程加载 DLL 是标准注入特征，必然触发杀软。
ai_summary_style: key-points
images_status:
  total: 8
  succeeded: 8
  failed_urls: []
notion_page_id: 41975244-d011-816e-835c-e612c68df91a
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> - **注入原理：** `SetWinEventHook` + `WINEVENT_INCONTEXT` + 本进程已加载的 DLL 模块句柄，Windows 会把该模块加载进事件源进程并在其 UI 线程调用回调，全程无 WriteProcessMemory、无远程线程。
> - **三个坑：** `hMod` 必须是已加载模块句柄（先 LoadLibrary 自己）；回调需 `extern "C" __declspec(dllexport)` 导出；路径必须绝对。
> - **用握手代替 Sleep：** `SetWinEventHook` 返回非 NULL 只代表注册成功，注入是惰性的；工具用目标进程 DllMain 里 `SetEvent` 具名事件 + 注入器等待的方式证明注入真实发生，再用 Toolhelp32Snapshot 交叉校验模块表。
> - **两个反常识实测：** `--trigger` 发窗口消息是概率性的（WinUI3 记事本有效，charmap.exe 老式对话框无效）；DLL 不驻留——注入器退出后钩子消亡，DLL 随之被卸载，故重活须在回调窗口期内完成。
> - **局限：** 仅适用于同 desktop、有 UI、位数一致的进程；回调跑在目标 UI 线程不能做耗时操作；跨进程加载 DLL 是标准注入特征，必然触发杀软。

**星夜AI安全** *2026年11月11日 14:32*

## 0x00 写在前面

`SetWinEventHook` 是 Windows 给读屏软件、自动化测试工具准备的无障碍 API。它的名字和 `SetWindowsHookEx` 很像，但用的人少得多——少到很多人不知道它还能当注入器用。

这个思路最早由《Windows Internals》合著者 Pavel Yosifovich 在一篇技术博客里系统讲过：注册一个 UI 事件钩子，丢给它一个 DLL 模块句柄，然后 Windows 自己会把那个 DLL 加载进「抛出事件的那个进程」。

**整个过程你一次 `WriteProcessMemory` 都没调用过，也没创建过远程线程。**

但原博客是教学式的，代码跑通就算完，工程化落地有三个坑它没解决：怎么确认真的注进去了、目标空闲时怎么触发、以及注完之后 DLL 到底在不在。这篇介绍我按这三点重写的工具 **swh-inject**，以及实测出来的两个跟原文相反的结论。

* * *

## 0x01 项目概览

| 属性  | 说明  |
| --- | --- |
| 项目名称 | swh-inject |
| 核心语言 | C++17（纯 Win32 API，无第三方依赖） |
| 注入原理 | `SetWinEventHook`<br><br>\+ `WINEVENT_INCONTEXT` + 已加载的 DLL 模块句柄 |
| 目标对象 | 同一 desktop、有 UI、位数一致的任意进程 |
| 产物  | 注入器 + 演示载荷 DLL + 测试靶子，共 3 个 PE |
| 支持架构 | x64（32 位需重编工具链） |
| 不做什么 | 不写 shellcode、不分配 RWX、不远程线程、不结束进程、不做持久化 |

**文件结构：**

```bash
swh-inject/
├── bin/
│   ├── swh-inject.exe    # 注入器（全静态，仅依赖系统 DLL）
│   ├── payload.dll       # 演示载荷，导出 WinEventProc
│   └── swh-target.exe    # 测试靶子，自己不停抛 UI 事件
├── src/                  # 注入器源码（CLI / 注入编排 / 进程工具 / 日志）
├── payload/              # 载荷源码 + 导出表
├── test/target.cpp       # 靶子源码
├── docs/TECH.md          # 原理与踩坑详解
├── build.bat / build.sh  # MSVC 与 MinGW 双构建
└── README.md
```

* * *

## 0x02 核心原理

### 2.1 为什么一个无障碍 API 能注入

`SetWinEventHook` 的签名长这样：

```
HWINEVENTHOOK SetWinEventHook(
    DWORD eventMin, DWORD eventMax,
    HMODULE hmodWinEventProc,      // ← 关键
    WINEVENTPROC pfnWinEventProc,  // ← 关键
    DWORD idProcess, DWORD idThread,
    UINT dwFlags                   // ← 关键
);
```

当你把 `hmodWinEventProc` 填成一个 **已经用 `LoadLibrary` 载入自己进程** 的模块句柄，并且 `dwFlags` 带上 `WINEVENT_INCONTEXT` 时，语义就变了：

> 系统在「事件发生的那个进程」里加载这个模块，并在那个进程自己的 UI 线程里调用导出的回调。

DLL 一被映射， `DllMain` 就跑了。 **注入完成。**

这正是它的隐蔽之处：调用链外观上只是「一个进程正常使用了无障碍 API」，没有跨进程写内存、没有远程线程创建，跟传统注入手法完全不在一个特征维度上。

### 2.2 INCONTEXT 与 OUTOFCONTEXT 的分水岭

这是整件事唯一真正的开关，也是最容易漏的一点：

| 标志  | 行为  | 是否注入 |
| --- | --- | --- |
| `WINEVENT_OUTOFCONTEXT` | 事件被 marshaling 回 **调用方** 进程，回调在你自己的进程跑 | ❌ 不注入 |
| `WINEVENT_INCONTEXT` | 回调在 **事件源** 进程的 UI 线程跑，模块被映射进去 | ✅ 注入 |

配套的第二个差异在消息泵上： `OUTOFCONTEXT` **必须** 有 `GetMessage` / `DispatchMessage` 循环，因为事件是通过一个隐藏窗口投递到你的消息队列的； `INCONTEXT` 则不需要，因为事件根本不在你这边派发。

工具里 `--probe` 模式就是这句话的活体演示——它用 `OUTOFCONTEXT` 加消息泵，只观察事件流，绝不注入。

### 2.3 三个必踩的坑

**坑一： `hMod` 不能是路径字符串。** 它必须是本进程已加载的模块句柄。所以要先 `LoadLibrary` 自己，再把这个句柄交给钩子。听起来很反直觉——DLL 得先进自己的进程，才能进别人的。

**坑二：回调必须导出。** `void CALLBACK WinEventProc(...)` 单独写不够，必须 `extern "C" __declspec(dllexport)` （或者.def 文件）。少了 `extern "C"` ，C++ 名字修饰会把它变成 `?WinEventProc@@YGX...`， `GetProcAddress("WinEventProc")` 永远返回 NULL。

**坑三：路径必须绝对。** 用裸文件名 `LoadLibrary("payload.dll")` 会走当前工作目录，从调试器启动时那个目录往往不是 exe 所在目录。

还有一个签名层面的硬约束：回调和 `WINEVENTPROC` 必须逐字一致，七个参数、 `CALLBACK` （x86 下是 `__stdcall` ）一个都不能错，否则系统在目标进程里会调用到错误地址。

### 2.4 用「握手」代替 Sleep

原始示例的做法是： `SetWinEventHook` 之后 `Sleep(60000)` ，然后当它成功了。

问题在于——\*\* `SetWinEventHook` 返回非 NULL 只代表注册成功\*\*。DLL 有没有被送进目标、 `DllMain` 有没有跑，一概不知道。注入是惰性的，发生在目标下一次抛 UI 事件的时候，可能 3 毫秒，也可能永远不来。

swh-inject 改成让 **目标进程自己发信号**：

1.  注入器先 `CreateEventW` 建一个具名事件 Local\\SWHINJECT_READY\_<目标PID>；
    
2.  载荷 DLL 在 `DllMain(DLL_PROCESS_ATTACH)` 里用 `GetCurrentProcessId()` 拼出同名事件， `OpenEventW` + `SetEvent` ；
    
3.  注入器 `WaitForSingleObject` 收到信号 → 才是真的注入成功。
    

顺序不能反，因为 DLL 一被映射就立刻 `OpenEventW` ， `DllMain` 里没有重试的机会。

`DllMain` 里也只允许做这一件事。 `LoadLibrary` 、 `CreateThread` 、任何同步等待都会踩 loader lock 死锁。这条红线在载荷代码里是硬性遵守的。

### 2.5 生命周期真相：DLL 其实不驻留

原文和各类资料都说「 `UnhookWinEvent` 不卸载 DLL，注入不可逆，DLL 会一直留在目标进程里」。

**实测不是这样。**

注入器退出后，我用两条独立路径查目标模块表—— `tasklist /m` 和 PowerShell 的 `Get-Process -Module` —— `payload.dll` 都不见了。加 `--keep-hook` 也一样。目标进程本身健康，内存占用没变。

合理推断是：user32 持有 INCONTEXT 钩子对模块的引用，钩子随注入器进程一起消亡，模块引用被释放，DLL 就被卸载了。

这个发现反过来解释了另一件事——为什么网上那些基于这个 API 的载荷，都把 `VirtualAlloc` + `CreateThread` **写在回调里** 而不是指望 `DllMain` ：因为窗口期只有「钩子活着」的这段时间，指望它常驻是不成立的。

* * *

## 0x03 执行流程

```
① 解析目标（--pid / --name / --all），校验有可见窗口 + 位数一致
          ↓
② LoadLibraryW 自己的 payload.dll（拼绝对路径，先本进程加载）
          ↓
③ GetProcAddress 取导出回调 WinEventProc
          ↓
④ CreateEventW 建具名事件 Local\SWHINJECT_READY_<pid>
          ↓
⑤ SetWinEventHook(EVENT_MIN, EVENT_MAX, hMod, pfn,
                  pid, 0, INCONTEXT | SKIPOWNPROCESS)
          ↓
⑥ （可选）--trigger 主动制造目标 UI 事件
          ↓
⑦ WaitForSingleObject 等握手信号
   ┌─ 收到 → payload 已在目标内跑完 DllMain
   └─ 超时 → 退出码 6，按四步排查顺序自查
          ↓
⑧ Toolhelp32Snapshot 交叉校验目标模块表
          ↓
⑪ UnhookWinEvent（DLL 随钩子一起释放）
```

* * *

## 0x04 使用方法

### Step 1 — 编译

**MinGW-w64（推荐，产物全静态）：**

```
./build.sh
```

**MSVC：** 在 x64 Native Tools 命令行里执行 `build.bat` ，脚本优先用 `cl` ，找不到会自动回退 g++。

产物统一落在 `bin/` ： `swh-inject.exe` 、 `payload.dll` 、 `swh-target.exe` 。

### Step 2 — 先看参数

```
bin\swh-inject.exe --help
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a4ed9f9fe692a0d2.jpg)

### Step 3 — 找到目标

```
bin\swh-inject.exe --list
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f44642168a20925f.jpg)

只列「有可见顶层窗口」的进程——没有窗口的进程永远等不到 UI 事件，注进去也没有意义。注意 `wps.exe` 那行： **32 位**。64 位工具注不进 32 位进程，这个检查会在注入前直接拦掉。

### Step 4 — 注入

```
bin\swh-inject.exe --dll bin\payload.dll --name notepad.exe --trigger -v
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b7b044d135a6d1ad.jpg)

关键看最后三行：收到就绪信号 → 模块表校验通过 → 注入流程成功，退出码 0。

`--trigger` 会主动给目标窗口发窗口消息，破解「目标空闲、等不到事件」。 **但它是概率性的**——见 0x06。

### Step 5 — 诊断模式（超时了就先用它）

```
bin\swh-inject.exe --probe --timeout 3
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7af07f13be792363.jpg)

`--probe` 不注入，只观察桌面事件流。它收到 0 条，说明你的会话根本没有可交互桌面（远程断连、锁屏、session 0），这时候再怎么调注入参数都是白费。

* * *

## 0x05 测试验证

测试环境：Windows 11（26200）+ x64 + MSYS2 MinGW-w64 g++ 15.2.0，非管理员权限。

| 测试项 | 命令  | 结果  |
| --- | --- | --- |
| 参数帮助 | `--help` | ✅ 正常，中文不乱码 |
| 目标枚举 | `--list` | ✅ 正确识别位数（ `wps.exe` = 32 位） |
| 事件流诊断 | `--probe` | ✅ 静止桌面 0 条，有活动时收到 `EVENT_OBJECT_NAMECHANGE` |
| 端到端注入 | `--name notepad.exe --trigger` | ✅ 退出码 0，握手 + 模块校验双通过 |
| 空闲目标（对照） | `--name notepad.exe`<br><br>（不加 trigger） | ⚠️ 退出码 6，3 秒/25 秒均超时 |
| 老式对话框目标 | `--name charmap.exe --trigger` | ⚠️ 退出码 6，窗口消息不吃这套 |

**成功与失败的对照：**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7daf09db83638625.jpg)

同一个记事本、同一条命令，只差一个 `--trigger` ：加了退出码 0，不加就一直等到超时。这张图就是「为什么不能靠 `Sleep` 猜」的最好说明——SetWinEventHook 注册成功 那行是绿的，但注入其实一点没发生。

**两个必须知道的实测结论：**

1.  **`--trigger` 不是万能的。** WinUI3 版记事本能吃窗口消息并产生事件；老式对话框（ `charmap.exe` ）同样参数就一直超时。遇到不吃这套的程序，只能靠真实鼠标/键盘操作。
    
2.  **DLL 不驻留。** 注入器一退出， `payload.dll` 就从目标模块表消失了（见 2.5）。想观察驻留，得在注入器还没退出的那几秒里查。
    

* * *

## 0x06 局限性与改进方向

| 局限  | 说明  | 改进思路 |
| --- | --- | --- |
| 只能打有 UI 的进程 | session 0 服务、控制台程序、无窗口进程全部无效 | 换用 APC / 线程池等其它注入路径 |
| 位数必须一致 | 64 位工具注不进 32 位进程 | 拆 32/64 两套产物 |
| `--trigger`<br><br>概率性生效 | 发窗口消息不保证产生 WinEvent | 改用 `SetForegroundWindow` 激活窗口，产生 `EVENT_SYSTEM_FOREGROUND` |
| 回调跑在目标 UI 线程 | 做耗时操作会直接卡死目标界面 | 回调内只做最小动作，重活挪到自建线程 |
| DLL 随钩子释放 | 无法长期驻留 | 在回调窗口期内做完全部动作 |
| 必然触发杀软 | 跨进程加载 DLL 是标准注入特征 | 不做规避，教学工程不该往这个方向走 |
| 事件范围全量 | `EVENT_MIN`<br><br>~ `EVENT_MAX` ，鼠标一动上千次回调 | 收窄到 `EVENT_SYSTEM_*` 等少量事件 |

* * *

## 0x07 总结

swh-inject 把一个冷门的无障碍 API 拆成了可验证的工程实现，核心就三件事：

-   **注入机制**： `INCONTEXT` + 已加载的模块句柄，系统代劳，全程不碰目标内存；
    
-   **结果可信**：用目标进程内点亮具名事件代替 `Sleep` 猜测，再用模块表交叉校验；
    
-   **可诊断**： `--probe` 先证明桌面有事件流， `--list` 先确认目标有窗口且位数对得上，把「超时」这个黑盒拆成可排查的步骤。
    

更重要的是它验证了两件跟流行说法相反的事： `--trigger` 发窗口消息并不总能产生事件； `UnhookWinEvent` 之后 DLL 也确实不会留在目标进程里。

**工具的价值不在于多一个注入手法，而在于把「我以为它成功了」变成「我能证明它成功了，也能证明它什么时候没成功」。**

> 安全研究的意义在于理解攻击，从而更好地防御。所有内容仅供授权环境下的安全测试与学习研究，请遵守相关法律法规。向不属于你的进程注入 DLL，在多数司法辖区可能构成违法行为。

* * *

**关注「星夜AI安全」，持续追踪最前沿的 Windows 安全研究 🌙**

## 项目获取

**圈子** 内获取

## 圈子介绍

现任职于某头部网络安全企业攻防研究部，核心红队成员。2021-2023年间累计参与40+场国家级、行业级攻防实战演练，精通漏洞挖掘、红蓝对抗策略制定、恶意代码分析、内网横向渗透及应急响应等技术领域。在多次大型演练中，主导突破多个高防护目标网络，曾获"最佳攻击手""突出贡献个人"等荣誉。

已产出的安全工具及成果包括：

-   多款主流杀软通杀工具（兼容卡巴斯基、诺顿、瑞星、360等终端防护，无感知运行，突破多引擎联合检测）
    
-   XXByPassBehinder v1.1 冰蝎免杀生成器（定制化冰蝎免杀工具，绕过主流终端防护与EDR动态检测，支持自定义载荷）
    
-   哥斯拉二开免杀定制版（二开优化，深度免杀，突破终端防护与EDR检测，适配多场景植入）
    
-   NeoCS4.9终极版（高级免杀加载工具，强化载荷注入与进程劫持，适配多系统版本，无兼容问题）
    
-   WinDump\_免杀版（浏览器凭证窃取工具，支持Chrome/Edge/Firefox等主流浏览器，一键提取敏感数据，免杀过防护）\_
    
-   fscan二开版（二开优化内网扫描工具，增强指纹精度、弱口令爆破与结果标准化输出，适配复杂内网）
    
-   RingQ加载器二开版（二开优化免杀加载器，支持Shellcode内存执行，绕过各类终端防护与EDR检测）
    
-   多款免杀Webshell集合（覆盖PHP/JSP/ASPX，过主流WAF与终端防护，适配不同Web场景）
    
-   免杀360专属加载器（支持Shellcode内存执行，针对性绕过360全系防护检测，无感知运行）
    
-   一键Kill 火绒 defender 工具 **HDKiller** （包含源码）
    
-   win11 一键kill 360工具 **InjectKill** （包含源码）
    
-   win11 一键kill defender工具 **win11_df-killer** （包含源码）
    
-   免杀火绒6.0内存防护加载器 **BypassMemLoader**
    
-   单文件过360 免杀loader **exe_bypass_360**
    
-   单文件过火绒 df 免杀loader **exe_bypass_df** (包含源码)
    
-   LNK钓鱼文件生成工具V1.0
    
-   EXE捆绑启动器 v2.0
    
-   火绒6内存免杀加载器 **bypasshr6**
    
-   火绒一键Kill专杀工具 **HRKiller**
    
-   Ring3 内存免杀工具 **Ring3bypasshr.exe**
    
-   win11 一键kill 360工具 **Kill360_V2**
    
-   win11 一键kill 360工具 **Kill360_V3.1**
    
-   win11 一键kill 360工具 **Kill360_V4**
    
-   **bypassEDR_hashdump_V1** bypass EDR 导出hash工具
    
-   AWD防御工具 **望楼Watchtower**
    
-   进程注入工具 **swh-inject** 后续将不断更新到内部圈子中 欢迎加入圈子
    

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ac1f3498225a3f0d.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/82ed9d66974db643.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d7b25c0f3224be0e.jpg)

```
情深不寿，强极则辱，谦谦君子，温润如玉。
```

二开工具 · 目录
