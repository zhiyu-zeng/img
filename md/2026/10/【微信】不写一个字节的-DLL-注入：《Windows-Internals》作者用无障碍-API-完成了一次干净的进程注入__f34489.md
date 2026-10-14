---
title: 【微信】不写一个字节的 DLL 注入：《Windows Internals》作者用无障碍 API 完成了一次"干净"的进程注入
source: https://mp.weixin.qq.com/s/Oz7LROVUuJuzOf35s9v_vg
source_host: mp.weixin.qq.com
clip_date: 2026-10-14T22:05:40+08:00
trace_id: c9a1546a-f100-4c41-ac24-af8ccd3b42fc
content_hash: c1b2c295d324a7ee852b766ed191f4a30bc10c600d8c4bb70d5f1a2d36bf7931
status: synced
tags:
  - 微信
  - Windows逆向
  - 恶意样本
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: '`SetWinEventHook` 可在不写入目标内存的前提下，把 DLL 注入到有 UI 的同桌面进程，实现"干净"注入。'
ai_summary_style: key-points
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 3f975244-d011-81cf-986f-ec79e0e654a0
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> `SetWinEventHook` 可在不写入目标内存的前提下，把 DLL 注入到有 UI 的同桌面进程，实现"干净"注入。
> 
> - **原理：** 与 `SetWindowsHookEx` 同源，传入 DLL 模块句柄 + 回调，系统按需把 DLL 加载进目标进程，无需 `WriteProcessMemory` / `CreateRemoteThread`。
> - **注入三要素：** 先在自身进程 `LoadLibrary` 加载 DLL（用 `GetModuleFileName` + `wcsrchr` 拼全路径）、回调放在 DLL 中并 `extern "C"` + `__declspec(dllexport)` 导出、标志必须用 `WINEVENT_INCONTEXT`（`OUTOFCONTEXT` 只封送事件，不注入）。
> - **三个坑：** 无 `GetMessage`/`DispatchMessage` 消息泵则一个事件都收不到（仅 OUTOFCONTEXT 需要）；回调未导出导致 `GetProcAddress` 返回 NULL；标志用错则目标模块列表中看不到 DLL。
> - **卸载与检测：** `UnhookWinEvent` 不会卸载 DLL，注入不可逆；检测可监控带 `INCONTEXT` 的 `SetWinEventHook` 调用、用 `PsSetLoadImageNotifyRoutine` 比对 DLL 来源，规则可与 `SetWindowsHookEx` 复用。
> - **覆盖边界：** 仅对同一桌面、存在 UI 的进程有效；会话 0 服务与无窗口进程不适用。

**Ots安全** *2026年10月14日 14:05*

**威胁简报**

**恶意软件**

**漏洞攻击**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/85618f568236ec50.jpg)

如果你觉得 DLL 注入这个话题已经被讲烂了—— `CreateRemoteThread` 写内存、 `QueueUserAPC` 排队、 `SetWindowsHookEx` 挂全局钩子——Pavel Yosifovich 大概也会同意你。但他上周又在 TrainSec 知识库加了一笔：这次借道的是一个存在了二十多年、本来为屏幕阅读器服务的 API—— `SetWinEventHook` 。

这篇文章是视频演示的文字版，全程实录了作者"先看它失败、再把它修好"的过程。对 Windows 系统程序员、恶意代码分析师，以及所有想弄清一个机制再谈检测的人，这是一份少见的完整素材。

## 一、它是什么：一个为无障碍设计的 API，长着钩子的形状

`SetWinEventHook` 的名字和 `SetWindowsHookEx` 只差一个字母，两者都围绕 UI 事件做文章，但层级不同：后者工作在 Windows 消息层面，前者工作在更高层——屏幕阅读器、自动化工具订阅的就是它。

它的原型并不复杂：

```javascript
HWINEVENTHOOK SetWinEventHook(
    DWORD eventMin, DWORD eventMax,      // 事件范围
    HMODULE hmodWinEventProc,            // DLL 模块句柄（注入的钥匙）
    WINEVENTPROC pfnWinEventProc,        // 回调函数
    DWORD idProcess, DWORD idThread,     // 作用范围
    DWORD dwFlags);                      // 标志位
```

关键的相似性在于： **你也可以像 `SetWindowsHookEx` 那样，把一个位于 DLL 里的回调交给系统，然后由基础设施把它加载进目标进程**。你不需要 `WriteProcessMemory` ，不需要 `CreateRemoteThread` ，甚至不需要知道目标进程的内存布局。注册事件、递上 DLL，剩下的事 Windows 自己完成。

Pavel 在个人博客上更早记过这个机制：模块句柄只需要是本进程内已加载的模块，DLL 会"按需"自动进入目标进程——与 `SetWindowsHookEx` 的行为如出一辙。

## 二、前置回顾：注入方法图谱里，它站在哪

在讲新花样之前，先把已有的家底列一遍。这决定了新技术的位置感：

| 方法  | 动作方式与覆盖面 |
| --- | --- |
| CreateRemoteThread | 在目标建线程跑 LoadLibrary，不要求 UI |
| QueueUserAPC | 排队 APC，线程警觉时执行，不要求 UI |
| QueueUserAPC2 | 用户态 APC，免警觉等待，不要求 UI |
| SetWindowsHookEx | 挂钩子，user32 代为注入，要求目标有 UI |
| **SetWinEventHook** | **订事件，基础设施代为加载，要求目标有 UI** |
| Shellcode | 想干什么就能干什么，不要求 UI |

注意最后两行之前的共同点：两个钩子类方法都不对目标做任何显式写入。代价是覆盖范围——只对存在 UI、且与调用线程处于同一桌面的进程有效。会话 0 里的服务、没有窗口的进程，都够不着。

## 三、初次尝试：什么都不会发生

原文相当诚实，最初那段代码就跑不起来，而且错得很有教育意义。

最直觉的写法是：注册全部事件（ `EVENT_MIN` 到 `EVENT_MAX` ），模块传 NULL 让回调留在本进程，标志用 `WINEVENT_OUTOFCONTEXT` 把事件封送回自己，顺手加上 `WINEVENT_SKIPOWNPROCESS | WINEVENT_SKIPOWNTHREAD` 屏蔽自己的噪音。写一个 `WINEVENTPROC` 原型的回调，打印参数，跑。

然后进程直接退出——当然，没有消息循环它留不住。于是加 `sleep` 死循环，打开记事本疯狂点击， **依然一个事件都没有**。

这个问题只能靠读文档解决：来自其他进程的事件，投递机制是普通的 Windows 消息队列。所以必须有消息泵—— `GetMessage` 循环加 `DispatchMessage` 。

加上之后，在回调里下断点可以看清整条暗渠： `SetWinEventHook` 创建了一个 **隐藏窗口**，其他进程的通知以它为目的地， `DispatchMessage` 触发它的窗口过程，窗口过程再调用你的回调。去掉断点，事件会倾泻而来——一个普通桌面的 UI 活动远比你想的密集。

## 四、从"封送"到"注入"：三处改动，一个标志

到这一步还只是事件监测，没有 DLL，没有注入。要让它变成注入，需要三处改动加一个标志。

### 改动一：DLL 必须先在自己进程里加载

模块句柄不能再是 NULL。你得先把想注入的 DLL 用 `LoadLibrary` 加载进自己进程——感觉上这很反直觉，但 API 就是这么设计的：本进程加载过一次，之后系统才拿得到它去别处注入。甚至加载完你就可以退出，DLL 只要被加载过一次就可供注入。

路径拼接有个坑：按裸名 `LoadLibrary` 依赖当前目录，而调试器下的当前目录往往不是你想要的。正确做法是用 `GetModuleFileName` 拿到可执行文件全路径， `wcsrchr` 截到最后一个反斜杠，拼上 DLL 名再加载。

### 改动二：回调必须住在 DLL 里，而且必须导出

回调不能留在 EXE 里——被注入的可不是你的可执行文件。它甚至不需要干什么实事，不需要打印，只需要存在：初次被调用时，DLL 已经进目标进程了，目的达成。

用 `GetProcAddress` 从已加载的 DLL 里取回调地址。然后就是作者在镜头前踩的那个坑： **`GetProcAddress` 返回了 NULL**。原因是 DLL 里的回调只是个普通函数，函数不会被链接器自动导出。解法两条路：DEF 文件，或者更短的—— `extern "C"` 去掉 C++ 名称修饰，加 `__declspec(dllexport)` 强制导出。重新编译，指针就有了。

### 一个标志：WINEVENT_INCONTEXT

到这里 DLL 也加载了、回调也导出了、钩子句柄也拿到了。用 `idProcess` 锁定一个记事本做试验（别一上来注入半个桌面），打开 Process Explorer—— **目标进程的模块列表里，你的 DLL 并不在**。

原因还是标志：此时挂的还是 `WINEVENT_OUTOFCONTEXT` ，它的语义是"把事件封送回调用方"，从来不注入任何东西。真正执行注入的是 `WINEVENT_INCONTEXT` ——系统会把回调放到事件发生的那个进程的上下文里执行。

换上 `INCONTEXT` 再跑：消息泵不再是刚需（通知在对方进程内投递），但注入器进程至少要存活到有事件到达， `sleep` 是最简单的占位。不带调试器直接运行，打开记事本，Process Explorer 里你的 DLL 赫然在列。注入完成。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f36c1d3663cec2c6.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4f03db852dccff70.png)

## 五、原文实录的三个坑

这篇素材的价值一半在"怎么做"，另一半在"哪儿会错"。按踩坑顺序整理：

**坑一：没有消息泵，一个事件都收不到。** 现象是注册后进程静默退出，加死循环也无反应。根因是事件经隐藏窗口加普通消息队列投递，必须有 `GetMessage` / `DispatchMessage` 循环。调试时下断点可以看到， `SetWinEventHook` 创建的隐藏窗口就是通知的落点， `DispatchMessage` 触发窗口过程再调回调。注意此条只对 `OUTOFCONTEXT` 模式成立， `INCONTEXT` 下事件在目标进程内投递。

**坑二： `GetProcAddress` 返回 NULL。** DLL 里的回调是普通函数，未导出，链接器不会把它写进导出表。 `extern "C"` 加 `__declspec(dllexport)` 解决，或者用 DEF 文件。附带一个路径问题：注入器应先用 `GetModuleFileName` 取自身全路径、 `wcsrchr` 截到反斜杠、拼上 DLL 名再 `LoadLibrary` ，否则裸名加载依赖当前目录，调试器下的当前目录常常不是你想要的位置。

**坑三：标志用错，注入根本不发生。** DLL 本地加载了、回调导出了，目标模块列表里就是看不到它——因为还挂着 `WINEVENT_OUTOFCONTEXT` 。换成 `WINEVENT_INCONTEXT` 即可。验证时先用 `idProcess` 锁定单个记事本，避免误伤半个桌面。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/9313cd03f273bc99.png)

## 六、收尾：卸载钩子 ≠ 卸载 DLL

`sleep` 只是占位。更干净的设计是：创建一个事件对象，让被注入的 DLL 加载成功后发信号，注入器等待这个事件而不是死睡。事件就绪后调用 `UnhookWinEvent` 拆掉钩子。

要注意两点。其一， **卸载钩子不会把 DLL 从目标进程里请出去**——注入本身不可逆，拆钩子只是停止在目标内持续跑你的回调。第二，从对抗视角看这很重要：回调在目标进程里每个事件都触发一次，既烧时间又留显眼信号。想安静，就注入一次、随即卸载。

## 七、防御视角：行为特征与检测思路

这个技术的威胁模型与 `SetWindowsHookEx` 滥用高度重合，检测规则可以直接借鉴：

**可观察痕迹**——目标进程模块列表出现来源异常的 DLL（路径与被注入进程的业务毫无关系）；进程内存在 user32 win-event 相关活动；回调在目标内持续触发形成持续的 CPU 痕迹；DLL 加载路径与调用方路径存在关联；卸载钩子后 DLL 仍驻留，驻留状态本身就是线索。

**检测思路**——监控 `user32!SetWinEventHook` 调用，重点留意带 `WINEVENT_INCONTEXT` 标志的注册；用镜像加载回调（ `PsSetLoadImageNotifyRoutine` ）比对注入方与目标进程的 DLL 来源一致性； `SetWindowsHookEx` 与 `SetWinEventHook` 的检测规则可以交叉复用。

**缓解思路**——该技术要求调用方与目标同一桌面且目标有 UI，隔离会话、限制交互桌面可以压缩暴露面；对高价值进程启用模块加载白名单，拦截来源不明的 DLL 映射。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/1d1e671c2d75ecff.png)

## 八、边界说明

-   `WINEVENT_INCONTEXT`
    
    加 DLL 模块即可注入，这一行为由 API 语义决定，在微软官方文档对 `SetWinEventHook` 的说明中可查（"hmodWinEventProc: 回调位于 DLL 中时必须提供模块句柄，DLL 会按需加载进目标进程"）。
    
-   本文为技术原理解析与防御视角整理，未给出可直接运行的完整利用代码。
    
-   事件范围 `EVENT_MIN` 到 `EVENT_MAX` 覆盖全部事件，任意一个事件即足以触发 DLL 加载——这一结论来自原文实测。
    

## 参考来源

1.  TrainSec 知识库原文：DLL Injection with SetWinEventHook: The Accessibility Hook as an Injector — https://trainsec.net/library/windows-internals/dll-injection-with-setwineventhook-the-accessibility-hook-as-an-injector/
    
2.  Pavel Yosifovich 个人博客（同一机制的早期记录）— https://scorpiosoftware.net/author/zodiacon/
    
3.  微软文档：SetWinEventHook 函数 — https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwineventhook
    
4.  微软文档：Event Constants — https://learn.microsoft.com/en-us/windows/win32/winauto/event-constants
    
5.  TrainSec 课程：Malware Analysis and Development — https://trainsec.net/courses/malware-analysis-and-development/
    

原文：DLL Injection with SetWinEventHook: The Accessibility Hook as an Injector  
作者：Pavel Yosifovich（《Windows Internals 第七版》合著者 / TrainSec 创始人）  
参考地址：https://trainsec.net/library/windows-internals/dll-injection-with-setwineventhook-the-accessibility-hook-as-an-injector/

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e5c7386d8a4fbd4c.jpg)

**END**

公众号内容都来自国外等平台- 搜索的内容通过结合编写 -

公众号 | AnQuan7 (Ots安全)

漏洞分析 · 目录
