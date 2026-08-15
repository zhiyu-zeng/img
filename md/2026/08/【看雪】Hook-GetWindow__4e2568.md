---
title: 【看雪】Hook GetWindow
source: https://bbs.kanxue.com/thread-292527.htm
source_host: bbs.kanxue.com
clip_date: 2026-08-15T11:03:55+08:00
trace_id: 4b1ebdfa-eb2c-4a36-b9d4-d14cfc2c1aec
content_hash: 59a508f2fb6ac6a9a28bf7aee44108170e107022ab3c720d33a5e06f2a1ea80c
status: synced
tags:
  - 看雪
  - Windows逆向
  - Hook
series: null
feed_source: 看雪·逆向工程
ai_summary: GetWindow可通过共享内存直接解析应用层tagWND；通过修改win32k共享内存中v11+0x10的值强制其走NtUserMapDesktopObject并hook该系统调用，即可隐藏窗口，但需处理版本、卡死和调用来源等细节。
ai_summary_style: key-points:weak
images_status:
  total: 7
  succeeded: 7
  failed_urls: []
notion_page_id: 3bd75244-d011-8108-9987-fce5aa54e844
ioc: null
---

> 💡 **AI 总结（key-points:weak）**
>
> GetWindow可通过共享内存直接解析应用层tagWND；通过修改win32k共享内存中v11+0x10的值强制其走NtUserMapDesktopObject并hook该系统调用，即可隐藏窗口，但需处理版本、卡死和调用来源等细节。
> 
> - **核心机制：** Win11 25H2中GetWindow正常用`(*v11 + Win32ClientInfo[5])`从共享内存获取tagWND；修改共享内存的v11+0x10值后，对指定hwnd改走`NtUserMapDesktopObject`，从而拦截遍历。
> - **版本差异：** WIN11及以上hook `NtUserMapDesktopObject`，WIN10需hook `NtUserCallOneParam`。
> - **防卡死：** hook内若全部返回空tagWND会导致窗口卡死；需用`PsGetCurrentThreadProcessId`识别调用进程，实测需放行进程自身和dwm进程。
> - **调用来源区分：** user32中多个函数（DispatchMessageWorker/ValidateHwnd、GetForegroundWindow、EnumWindows等）都会进入该分支；需用`KeGetCurrentThread()->TrapFrame->Rsp`取得用户栈指针，判断是否为GetWindow调用。
> - **正确返回方式：** 直接返回空tagWND会令GetNextWindow遍历截断；应先取受保护窗体的Previous/Next Window句柄并调用NtUserMapDesktopObject获取对应tagWND，再按uCmd参数替换返回；同时需注意应用层tagWND共享内存挂页问题。
> - **检测手段：** 可校验共享内存中`*(v11+16) == *v13`是否被破坏，也可直接对比内核遍历窗口与应用层遍历结果。

属于很古旧的方式，放在很多年以前确实还是比较好用的，目前的话属于没什么用，当然对抗纯R3的Api遍历依旧有效果。

## 通过IDA查看GetWindow伪代码并使用CE查看修改数值

演示系统版本：WIN11 25H2（因为应用层的结构非常稳定，不会像内核tagWND一样经常改变，所以你使用你自己的操作系统按照这里的偏移依旧可以轻松复现）  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/a84c3599641921dd.webp)  
这里的qword_1800D02C8就是我们的gSharedInfo地址+8解引用的值。这里的dword_1800D02D0就是我们的gSharedInfo地址+0x10解引用的值,所以我们在内核中只需要解析user32.dll的pdb，拿到gSharedInfo的地址我们就可以获取到这两个数值。  
接下来我们在CE中打开winlogon.exe，因为winlogon.exe是系统进程能确保所有的操作系统都有这个进程，另外打开一个有窗口的演示进程，我们使用spy获取到这个窗口的窗口句柄。  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/d909a33eb9b92cff.webp)  
这里我们依旧计算出了v11的值，因为不同进程这两个全局变量对应的值是不一样的，具体来说这里计算出的值也就是如果在winlogon.exe中调用GetWindow，且参数1是0x3003E时，v11经计算出来的值。  
在正常流程下，GetWindow函数拿到v11后，通过 调用

```python
v5 = (*v11 + Win32ClientInfo[5]);// 拿到应用层的tagWND结构
```

那么我们要让系统所有进程调用GetWindow函数时，在某些情况下进入内核，那么就需要修改

```python
if ( v13 && *(v11 + 16) == *v13 ) 
```

让这个if语句不再返回真即可，我们到CE中查看v11+0x10这个地址的值  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/93f9ab21b5fb12e5.webp)  
因为我们要让所有进程都生效，正是因为他是共享内存，所以我们便可以使用物理写来修改这个地址，那么任何进程调用GetWindow函数，参数1只要是我们修改v11+0x10地址的值后的hwnd，那么他就一定会走

```python
v5 = NtUserMapDesktopObject(hWnd);// 获取应用层tagWND
```

那么现在我们在CE中具体操作一下，我们右键查看（v11+0x10）的  
内存区域，获取到这个地址对应的物理地址。  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/d336fab6d0f69f45.webp)  
然后我们在Windbg中查看并修改第一字节  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/b009c43a03d21c0e.webp)  
修改后我们就可以，用CE打开spy对NtUserMapDesktopObject的调用点下断，CE从winlogon进程切换到spy的原因是spy调用了GetWindow函数方便查看效果。  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/dce41c0b7ea1d75b.webp)  
可以看到调用GetWindow时，如果hwnd是我们修改过v11+0x10的值的hwnd，那么获取应用层tagWND时，就要调用NtUserMapDesktopObject函数不再通过共享内存获取。

## Hook NtUserMapDesktopObject时应注意的问题

## 第一就是版本问题：

大于等于WIN11就hook NtUserMapDesktopObject，WIN10就hook NtUserCallOneParam。

## 第二就是解决如果传入的hwnd是我们自己设定的保护窗体链表内的hwnd：

全部return 0时会出现窗口卡死的问题。我们只需要在我们的hook函数内调用PsGetCurrentThreadProcessId函数，打印一下进程名肯定更好，然后开始拖动窗体，点击窗体的按钮，看看有哪些进程被打印了，测试发现基本就是进程自身还有dwm进程，当这两个进程调用NtUserMapDesktopObject如果我们返回空tagWND，窗体将无法正常使用。

## 第三就是因为因为user32.dll中其实非常多的函数都进行了tagWND的分支判断：

当要获取应用层tagWND时都会进行前文提到的这个if判断，我们修改v11+0x10地址的值后会导致其他函数也进入了NtUserMapDesktopObject，比如  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/78314a9a248f23cb.webp)  
user32!DispatchMessageWorker->user32!ValidateHwnd内部就进入了我们的NtUserMapDesktopObject。再比如调用GetForegroundWindow、EnumWindows、IsWindowVisible等都进入了这个分支，但是像GetForegroundWindow我们不希望他返回空tagWND，这时候我们就需要像windbg的kv指令一样，KeGetCurrentThread()->TrapFrame->Rsp 就是用户栈指针，不理解的话直接让AI复现即可。

## 第四就是并非直接返回空tagWND：

我们的目标是让GetWindow函数遍历不到我们的窗体，但是hook NtUserMapDesktopObject后直接返回空tagWND显然是不对的，因为我们遍历时调用GetNextWindow这个宏，当我们的Previous Window的handle作为参数1调用GetNextWindow时是可以返回我们处理了v11+0x10位置的这个hwnd的，当这个hwnd作为参数调用GetNextWindow时才会无效，并且出现截断（也就是这个hwnd之后用GetNextWindow，或者获取child window的窗体都因为这里返回空tagWND导致遍历结果列表中不再出现这些窗体），所以正确的方法是先获取到我们要保护的窗体的Previous Window的handle以及Next Window的Handle，并且判断该调用来源于GetWindow函数，然后判断uCmd参数，直接用Previous Window的handle以及Next Window的Handle先调用NtUserMapDesktopObject，获取到这两个窗口的应用层tagWND，然后根据参数替换为对应的tagWND进行返回即可。

## 第五就是额外注意的点：

因为应用层的tagWND通过共享内存映射到每个进程的地址空间内，调用相关使用到应用层tagWND的函数后操作系统才会向对应进程的共享内存挂页。所以你要注意挂页的问题。

## 该如何检测

最省事省力的方法肯定是校验

```python
*(v11 + 16) == *v13
```

因为修改了共享内存中地址的值，并且通过

```python
v5 = (*v11 + Win32ClientInfo[5]);//应用层tagWND
```

手动解析可以获取到tagWND的值，然后通过pdb调用GetWindowWorker对比直接调用GetWindow的结果即可。  
当然如果防守方直接内核遍历窗口也可以完美检测这种隐藏，内核遍历与应用层遍历进行结果对比即可。
