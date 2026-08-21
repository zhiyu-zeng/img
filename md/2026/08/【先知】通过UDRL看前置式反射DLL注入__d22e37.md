---
title: 【先知】通过UDRL看前置式反射DLL注入
source: https://xz.aliyun.com/news/92712
source_host: xz.aliyun.com
clip_date: 2026-08-21T14:16:49+08:00
trace_id: f79b10ca-a72b-413f-9536-52b268a39a16
content_hash: eb96ee72145eda8fc538e86901396f0d9d73da981069dbd84ce535ee8a1eedd3
status: synced
tags:
  - 先知
  - 恶意样本
  - Windows逆向
series: null
feed_source: 先知安全技术社区
ai_summary: UDRL通过自写反射加载器替换默认RDI，改变Beacon内存加载方式；其前置加载器位于DLL前，自行完成PE映射、IAT修复、重定位并调用入口。
ai_summary_style: key-points
images_status:
  total: 99
  succeeded: 99
  failed_urls: []
notion_page_id: 3c375244-d011-81f2-8964-c903400d879d
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> UDRL通过自写反射加载器替换默认RDI，改变Beacon内存加载方式；其前置加载器位于DLL前，自行完成PE映射、IAT修复、重定位并调用入口。
> 
> - **核心区别：** 普通Loader加shellcode加密只改变投递方式，UDRL直接替换Beacon默认ReflectiveLoader，改变beacon.dll在内存中的展开/加载流程。
> - **Release前置形态：** 内存布局为[前置UDRL加载器][原始DLL文件字节]；加载器从L开始，解析MZ/PE头并VirtualAlloc按SizeOfImage分配新映像D，再按节复制、修复IAT、执行重定位，最后调用入口E。
> - **API解析：** Release裸代码不携带IAT，因此加载器通过PEB（x64下GS:[0x60]）遍历模块链表，用模块/函数哈希匹配kernel32.dll与LoadLibraryA，再解析导出表取得VirtualAlloc、NtFlushInstructionCache等API地址。
> - **IAT与重定位：** 修复IAT时用LoadLibraryA加载依赖模块、GetProcAddress查真实地址并写入槽位（如D+0x2028写入MessageBoxW）；重定位按.reloc目录的DIR64项把旧指针0x180002040修正为D+0x2040。
> - **入口调用：** 计算E=D+AddressOfEntryPoint后，加载器调用E并传入(newImageBase, DLL_PROCESS_ATTACH, NULL)；测试DLL弹窗且g_labLastReason变为1，确认手工映射流程成功。

参考文章

```plain
https://www.cobaltstrike.com/blog/revisiting-the-udrl-part-1-simplifying-development
https://www.cobaltstrike.com/blog/revisiting-the-udrl-part-2-obfuscation-masking
https://www.freebuf.com/articles/network/383273.html
```

## 一、UDRL介绍

## 简介

-   UDRL并不是一种新技术，而是反射DLL注入（RDI）的演进版本
-   随着安全厂商对标准RDI的特征（如固定的内存分配大小、特定的API调用顺序、内存中的MZ/PE头残留）的精准捕获，RDI在一些场景下已经无法实现免杀
-   UDRL允许攻击者编写或定制自己的反射加载逻辑，自定义核心植入物（beacon.dll）在内存中的展开和装载过程，UDRL（User Defined Reflective Loader）指的是一种用户自定义的反射式加载器实现机制，它的本质是由用户自己实现PE文件的内存加载流程，从而替代默认的RDI加载器

## Loader和UDRL的区别

-   Loader的作用是负责将shellcode送入目标执行环境，并完成执行前的准备工作，例如：读取/解密shellcode、申请内存、写入数据、创建执行线程等。它解决的是“如何把东西送进去并启动”的问题，本质属于投递和执行入口控制层。以Cobalt Strike为例，Loader可以将`.bin` （shellcode）加载到内存，但它通常并不负责完整解析Beacon PE的结构，后续仍然依赖Beacon自带的Reflective Loader完成PE（beacon.dll这个核心植入物）映射
-   UDRL实现的不是负责把shellcode送入内存，而是负责替换Beacon内部默认的Reflective Loader，控制PE（beacon.dll）在内存中的加载过程。它解决的是shellcode进入内存以后，如何被展开、映射和初始化的问题。UDRL可以重新实现PE加载逻辑，例如自定义内存分配方式、Section映射、重定位处理、Import解析、内存权限设置等，因此它改变的是beacon.dll的内存加载机制，而不是简单改变shellcode的投递方式
-   日常我们对shellcode（如CS原生生成的`.bin` ）进行加密、混淆、压缩等处理，本质上只是改变了shellcode的存储和传输形式，并没有改变Beacon最终的加载路径。解密后的`.bin` 仍然会进入原本的反射DLL注入流程（由Beacon自带的Reflective Loader去完成 `beacon.dll` 的PE映射、重定位和导入解析）。所以就算外部再套一个Loader，对shellcode做加密、隐藏、包装，最终核心加载逻辑仍然是默认Reflective Loader
-   而UDRL的作用在于直接替换这个默认Reflective Loader，也就是从“外部包装shellcode”转变为“改变Beacon自身如何被加载”。使用UDRL后，重点不再是继续对`.bin` 做各种处理，而是通过自定义Loader改变Beacon.dll在内存中的展开方式。因此链路有以下改变：

```plain
// 传统：
外部Loader
    ↓
解密 beacon.bin
    ↓
默认Reflective Loader
    ↓
加载Beacon.dll



// UDRL：
外部Loader
    ↓
beacon.bin
    ↓
自定义Reflective Loader
    ↓
加载Beacon.dll
```

-   核心区别：

-   普通Loader + shellcode加密：改变“怎么送进去”
-   UDRL：改变“进去以后怎么加载”

## 二、UDRL基本使用

-   用VS打开解决方案（路径： `arsenal-kit20240125\kits\udrl-vs\udrl-vs.sln` ）

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/cc66c107257aed62.png)

-   将解决方案配置设置成Release

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/2e6307542181f413.png)

-   设置解决方案属性

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/5eca8ba8519094ee.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/dbea2e6f9a4cfdda.png)

-   禁用 `library` 和 `obfuscation-loader` 的优化

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/38a6c7eef11af77b.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/8c93fe1fc6b09d72.png)

-   右键 `obfuscation-loader` 进行编译生成

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/84eed79dbe7ef046.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/33692fd5ba3abcda.png)

-   编译成功后，在CS中加载插件（路径： `arsenal-kit20240125\kits\udrl-vs\bin\obfuscation-loader\prepend-udrl.cna` ）

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/cdcf278b56e2b1c1.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/880f2445b85a5008.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/24625d2df0de17f6.png)

-   加载完插件以后生成原生shellcode

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/c81ce4f2384ffa85.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/ca21f6e558259154.png)

## 三、反射&&前置

## 反射DLL注入

-   以CS为例，核心植入物beacon实际上是一个动态链接库（dll），所以必须被加载才能运行。Stephen Fewer在2008年首次公开的Reflective DLL Injection（反射DLL注入），提供了一种完全在内存中加载DLL的方式，其中的反射加载器大致实现了以下功能（项目地址： [https://github.com/stephenfewer/ReflectiveDLLInjection](https://github.com/stephenfewer/ReflectiveDLLInjection) ）

```plain
分配内存；
将目标DLL复制到该内存分配中
解析目标DLL的imports、加载所需module、解析function address（PE结构解析）
对DLL进行rebase，即修正relocations（重定位）
定位DLL的Entry Point（入口点）
执行Entry Point
```

-   在Stephen Fewer的原始实现中，用于将DLL加载到内存的代码会被编译进DLL，并作为导出函数提供，这也是CS的Beacon默认反射加载的工作方式，检查Beacon的导出函数时，可以找到名为 `ReflectiveLoader()` 的函数，如下CS官方的截图

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/cbb927ee85957945.png)

-   以这种方式实现反射加载时，通常还会在PE文件开头（覆盖DOS header）写入一个小型shellcode stub，确保执行流能正确跳转到 `ReflectiveLoader()` 。这使其具备position independent（位置无关）特性，只需将DLL写入内存、创建线程并运行即可

## 前置式反射DLL注入

-   2017年，Shadow Brokers泄露的Double Pulsar User Mode Injector（Double Pulsar）分析文章展示了另一种反射加载方法。Double Pulsar的区别在于，加载器并不编译进DLL，而是被prepended（前置）在DLL前面，这个方法使其能够反射加载任意DLL。同年发布的Shellcode Reflective DLL Injection（sRDI）项目也采用了类似方法。sRDI可将任意PE文件转化为position independent，因此也可用于加载 Beacon
-   CS官方的文章中的一战图展示了Stephen Fewer方法与Double Pulsar方法中 `ReflectiveLoader()` 的不同位置

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/01bab4feedb7611c.png)

## 四、前置式反射DLL注入（UDRL代码调试）

-   本次分析使用CS泄露的的arsenal-kit套件中的UDRL作为案例（为了让效果更直观，用AI改过部分代码）
-   修改版地址： [https://github.com/MissLe0/UDRL-Chnage-AI-](https://github.com/MissLe0/UDRL-Chnage-AI-)

## 整体形态

-   Release前置载荷在内存中的形态大致如下

```plain
低地址
┌──────────────────────────────┐
│ 前置反射加载器 UDRL          │ ← CPU 从这里开始执行
│ ReflectiveLoader + 辅助函数  │
├──────────────────────────────┤
│ 原始 DLL 文件                │ ← 仍然是磁盘文件布局
│ MZ / PE / .text / .data ...  │
└──────────────────────────────┘
高地址
```

-   关键地址（后续调试使用）

```plain
L = loaderStart            前置加载器入口地址
R = rawDllBaseAddress      后置原始 DLL 文件地址
D = loadedDllBaseAddress   手工映射产生的新映像基址
E = entryPoint             新映像中 DLL 入口地址
```

-   执行流程

```plain
CPU 从 L 开始
    ↓
加载器取得自己的地址 L
    ↓
加载器找到后面的原始 DLL：R
    ↓
解析 R 处的 MZ、PE 头和节表
    ↓
VirtualAlloc 分配 SizeOfImage 大小的新区域 D
    ↓
把 R 的磁盘文件布局转换为 D 的内存映像布局
    ↓
修复 D 中的导入地址表 IAT
    ↓
按照 D 与偏好 ImageBase 的差值修复基址重定位
    ↓
计算 E = D + AddressOfEntryPoint
    ↓
调用 E，进入测试 DLL 的 DllMain
```

-   反射加载：目标DLL没有通过 `LoadLibrary("lab-test.dll")` 交给Windows正常加载，而是由已经在内存中执行的加载器自行完成PE映射工作，加载器需要自己处理：

```plain
PE头解析
内存分配
节区复制
导入表修复
基址重定位
入口调用
```

-   何为前置式：加载器字节放在原始DLL文件字节之前，外层执行器从整段缓冲区第一个字节开始执行，所以加载器先运行。加载器知道自己的结束位置，可以直接取得紧随其后的DLL地址

```plain
[Loader][Raw DLL]
```

## 环境准备

-   双击解决方案进入VS

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/a4ab83b73775f3ed.png)

-   VS顶部工具栏选择 `Debug-x64`

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/2acdf26cefc3f5b2.png)

-   右键 `default-loader` ，点击“设为启动项目”

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/b3af3b5efc6398d2.png)

-   右键 `default-loader` ，点击生成

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/2ca3dc464b4f4e72.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/10e69220a0de6bd8.png)

## 调试代码

### 阶段一：进入前置加载器

-   打开 `default-loader/ReflectiveLoader.cpp` ，在45行打下断点

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/18238ee3feb54a07.png)

-   按下 `F5` 运行调试， 程序会停在 `ReflectiveLoader` 开头

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/5534b8463b9b4058.png)

-   之所以会进入到这个位置，是因为在 `\udrl-lab\loader.props` 中有如下定义，这个定义让链接器使用类似 `/ENTRY:ReflectiveLoader` 的设置

-   正常C/C++编译的EXE程序一般先进入CRT启动代码，再由CRT调用 `main` ，但是这个项目中把PE的 `AddressOfEntryPoint` 改成了 `ReflectiveLoader` ，所以Windows完成EXE的基础映射和系统初始化后，第一个进入的项目代码就是它，不会先调用 `main`
-   准确来说， `ReflectiveLoader` 是第一个执行的本项目入口代码，而不是整个进程生命周期的第一条CPU指令

```plain
<EntryPointSymbol>ReflectiveLoader</EntryPointSymbol>
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/a17609afadf60e37.png)

-   按下 `F10` ，跳到75行（ `loaderStart` 是函数内部的局部变量，只有第49行赋值执行完后才有有效值），在监视1中输入监测表达式

```plain
// 表达式如下
(void*)&ReflectiveLoader
loaderStart

// 表达式的作用
ReflectiveLoader：函数符号
&ReflectiveLoader：&是取地址运算符，得到函数地址
(void*)：把函数指针转换为普通地址显示形式（不会修改程序）

loaderStart：代码49行定义的局部变量（void* loaderStart = &ReflectiveLoader;）
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/7b08feae8aad6109.png)

-   此时监视器的结果应该是 `loaderStart == (void*)&ReflectiveLoader` ，表示加载器保存的入口地址与 `ReflectiveLoader` 函数地址相同，但由于当前Debug构建启用了增量链接，链接器在真正函数体前生成了一个跳转入口，所以 `loaderStart` 此时指向的是入口跳板，而VS根据PDB（VS编译 `C/C++` 项目时生成的调试信息文件）显示的 `&ReflectiveLoader` 指向真正函数体，两者相差 `0xC1` ，可以通过下面的监视表达式来验证
-   继续输入监测表达式

```plain
// 表达式如下
(ULONG_PTR)(void*)&ReflectiveLoader - (ULONG_PTR)loaderStart,x
*(unsigned char*)loaderStart,x
*(LONG*)((BYTE*)loaderStart + 1),x
(void*)((BYTE*)loaderStart + 5 + *(LONG*)((BYTE*)loaderStart + 1))
(void*)((BYTE*)loaderStart + 5 + *(LONG*)((BYTE*)loaderStart + 1)) == (void*)&ReflectiveLoader

// 表达式的作用
(ULONG_PTR)....,x：用于计算地址差值，把两个地址转换为与指针同宽的无符号整数，然后相减，并以十六进制显示。

*(unsigned char*)loaderStart,x：读取入口第一个字节
把loaderStart当作指向单字节的指针
*-读取该地址的一个字节
,x-以十六进制显示

*(LONG*)((BYTE*)loaderStart + 1),x：读取四字节相对位移
(BYTE*)loaderStart + 1：跳过第一个操作码字节 E9
把后面地址解释成 LONG*
*-读取 4 字节有符号相对位移

(void*)....loaderStart + 1))：计算JMP目标
公式：下一条指令地址 = loaderStart + 5；跳转目标 = 下一条指令地址 + rel32


(void*)...loaderStart + 1)) == (void*)&ReflectiveLoader：验证跳转目标
验证Debug PE入口跳板的JMP目标是否为PDB映射的ReflectiveLoader源码函数体
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/29a29e35edd35926.png)

-   通过第二段监视表达式， 证明了Windows使用的Debug PE入口 `loaderStart` 最终确实进入了 `ReflectiveLoader` ：读取了 `loaderStart` 处的 `E9 rel32` 跳转指令、取出相对位移，并计算跳转目标，结果显示 `loaderStart + 5 + 0xBC` 正好等于 `&ReflectiveLoader` ，所以说明控制流先到达加载器入口跳板，再立即跳入 `ReflectiveLoader` 真正函数体
-   还可以在反汇编窗口确认（快捷键： `Ctrl+Alt+D` ）：在顶部地址框输入 `0x00007ff70bde100f` （当前Debug EXE的PE入口 `loaderStart` ），这个地址处的 `jmp ReflectiveLoader (...)` 会直接跳入 `ReflectiveLoader` ，也是就是真正的函数体

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/4b6c28c1baf62994.png)

-   RIP（指令指针寄存器）：它保存了下一条准备执行的机器指令地址（VS根据PDB把RIP所在的机器指令映射回对应源码行，并用黄色箭头显示）

```plain
// 当前的实际地址
loaderStart              = 00007FF70BDE100F
&ReflectiveLoader        = 00007FF70BDE10D0

// 程序刚进入项目时，控制流为
RIP = 00007FF70BDE100F

00007FF70BDE100F  jmp         ReflectiveLoader (07FF70BDE10D0h)  

// CPU执行jmp后，不会继续执行下一行，而是把RIP直接改成跳转目标
执行 JMP 前：RIP = 00007FF70BDE100F
执行 JMP 后：RIP = 00007FF70BDE10D0

// 所以在代码45行的断点处，看到的RIP为00007FF70BDE10D0，可以在上方地址框输入以下指令查看
ReflectiveLoader(void)
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/ce3eda228ae4d0a5.png)

-   总的来说，这个阶段通过调试证明了以下几点

-   Windows使用的Debug PE入口是loaderStart
-   loaderStart处会执行JMP跳转，JMP的目标是ReflectiveLoader真正函数体
-   项目控制流确实先进入加载器入口（加载器前置）

### 阶段二：找到加载器后面的原始DLL

-   打开 `library/Utils.cpp` ，在46行下断点，按下 `F5` 继续执行，执行到 `default-loader/ReflectiveLoader.cpp` 第81行调用时会进入这个断点处

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/4d8222381cdd57d4.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/ea8c28b47f4fe518.png)

-   条件编译

-   当前使用的是 `Debug | x64` ，所以编译器选择：

```cpp
#if _DEBUG
    return (ULONG_PTR)debug_dll;
```

-   而 `Release|x64` 前置模式选择：

```cpp
#elif _WIN64
    return (ULONG_PTR)&LdrEnd + 1;
```

-   这两个分支解决的是同一个问题：得到原始DLL起始地址（R）

-   此时按 `F10` ，使得黄色箭头到达 `return (ULONG_PTR)debug_dll;`

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/4170ad61bd8baf9e.png)

-   补充概念：Debug中的 `debug_dll` 是什么

-   构建测试DLL后，项目运行 `udrl.py xxd` ，把整个 `lab-test.dll` 文件逐字节转换成了C++数组

```cpp
// 代码
unsigned char debug_dll[] = {
    0x4D, 0x5A, ...
};

// 过程
磁盘上的 lab-test.dll 文件
              ↓ 逐字节转换
Debug EXE 中的 debug_dll[] 数组
```

-   `debug_dll[]` 保存的是完整DLL文件字节，而不是已经加载好的DLL内存映像，可以把它理解为：

```plain
地址                         内容
&debug_dll[0]，即 R          0x4D
&debug_dll[1]，即 R+1        0x5A
&debug_dll[2]，即 R+2        下一个文件字节
...
```

-   检查前两个字节

-   此时在监视器输入以下监测表达式

```cpp
// 表达式
(void*)&debug_dll[0]
debug_dll[0],x
debug_dll[1],x

// 解释
&debug_dll[0] = 数组第一个字节的地址，也是就是Debug模式中的R
debug_dll[0]  = DLL 文件第一个字节
debug_dll[1]  = DLL 文件第二个字节
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/0bb6c4e0bc24ba8d.png)

-   Windows PE文件都以DOS头开始，DOS头的第一个字段是 `e_magic` ，签名字符是 `MZ` ，对应的字节如下

```cpp
M = 0x4D
Z = 0x5A
```

-   所以原始DLL文件开头必须是 `4D 5A` （PE知识），而监视 `debug_dll[0],x` 和 `debug_dll[1],x` ，就是读取 `R` 和 `R+1` 处的内容，判断是不是 `4D 5A` 开头

-   此时代码执行到/黄色箭头停在 `return` 这一行时，该行还没有返回，此时键盘按 `F10` 执行后， `default-loader/ReflectiveLoader.cpp` 第81行调用已执行完成， `rawDllBaseAddress` 才获得返回值

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/f3e918cdb03e855a.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/bc434eedc401ff5d.png)

-   继续 `F10` 执行，此时在监视器再输入以下监测表达式

```cpp
// 表达式
(void*)rawDllBaseAddress
(void*)&debug_dll[0]
rawDllBaseAddress == (ULONG_PTR)&debug_dll[0]

// 解释
(void*)rawDllBaseAddress：将原始DLL地址R转换为void*指针类型
(void*)&debug_dll[0]：获取debug_dll数组第0个元素的地址，即原始DLL数据的起始地址
rawDllBaseAddress == (ULONG_PTR)&debug_dll[0]：判断R是否等于debug_dll数组的起始地址，确认rawDllBaseAddress是否正确指向原始DLL数据
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/68b13ccbae45f2aa.png)

-   这个结果证明了完整的地址传递过程

```cpp
debug_dll[] 的起始地址
          ↓ return
FindBufferBaseAddress 返回
          ↓ 赋值
rawDllBaseAddress，也就是 R
```

-   此时在监视器再输入以下监测表达式

```cpp
// 表达式
(void*)loaderStart
(void*)rawDllBaseAddress
rawDllBaseAddress > (ULONG_PTR)loaderStart
rawDllBaseAddress - (ULONG_PTR)loaderStart,x
((PIMAGE_DOS_HEADER)rawDllBaseAddress)->e_magic == 0x5A4D

// 解释
(void*)loaderStart：获取加载器入口地址L
(void*)rawDllBaseAddress：获取原始DLL地址R
R > L：作比较，判断是否为[Loader代码][DLL数据]结构，如果R < L，说明Loader找错了或者、DLL没有按预期布局等
R - L：ReflectiveLoader需要通过自己的算法找到DLL（自身地址 + 偏移），所以要计算两者之间的距离
((PIMAGE_DOS_HEADER)rawDllBaseAddress)->e_magic == 0x5A4D：签名是否等于合法MZ值（PE知识）
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/11caebbfa1e95f02.png)

-   用内存窗口直接观察MZ（调试 → 窗口 → 内存 → 内存 1）：在地址框输入 `rawDllBaseAddress` ，看到PE头，说明R指向的是一份未经Windows正常加载的原始PE文件字节

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/81b4a18af917a45a.png)

-   总的来说，这个阶段证明了

-   加载器取得了一个位于他后面的原始DLL地址R
-   R确实以合法MZ签名开始（PE文件）

### 阶段三：解析原始DLL的PE头

-   在 `default-loader/ReflectiveLoader.cpp` 第101行下断点，按 `F5` 执行

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/81540c2ba4f789d1.png)

-   断点停在这里的时候，已经执行了下面的代码，并且已经验证MZ、PE签名和 `SizeOfImage`

```plain
// 解析内存中PE/DLL的DOS Header和NT Header
// 先将rawDllBaseAddress转换为PIMAGE_DOS_HEADER获取DOS头
// 再通过e_lfanew找到NT Header的偏移，从而定位PE的核心头部信息

PIMAGE_DOS_HEADER rawDllDosHeader =
    (PIMAGE_DOS_HEADER)rawDllBaseAddress;

PIMAGE_NT_HEADERS rawDllNtHeader =
    (PIMAGE_NT_HEADERS)(rawDllBaseAddress + rawDllDosHeader->e_lfanew);
```

-   此时在监视器输入以下监测表达式，可以在ReflectiveLoader手动加载DLL的过程中，观察关键变量和PE结构解析结果，确认加载器是否按照预期找到原始DLL地址、正确解析DOS Header和NT Header，并验证关键字段（如PE签名、节数量、ImageBase、SizeOfImage、入口点 RVA 等）是否符合预期
-   通过监视这些表达式，可以定位加载流程中的错误，例如DLL地址定位失败、PE 头解析异常、RVA/地址计算错误等，从而理解ReflectiveLoader如何替代Windows Loader完成PE文件映射过程，并保证后续内存分配、节复制、重定位和导入解析能够正常执行

```plain
// 表达式
rawDllDosHeader->e_magic,x
rawDllDosHeader->e_lfanew,x
(void*)(rawDllBaseAddress + rawDllDosHeader->e_lfanew)
(void*)rawDllNtHeader
rawDllNtHeader->Signature,x
rawDllNtHeader->OptionalHeader.Magic,x
rawDllNtHeader->FileHeader.NumberOfSections
rawDllNtHeader->OptionalHeader.ImageBase,x
rawDllNtHeader->OptionalHeader.SizeOfImage,x
rawDllNtHeader->OptionalHeader.SizeOfHeaders,x
rawDllNtHeader->OptionalHeader.AddressOfEntryPoint,x


// 解释（大部分PE的知识）
rawDllDosHeader->e_magic,x：读取原始DLL的DOS头签名

rawDllDosHeader->e_lfanew,x：读取DOS Header中的e_lfanew字段（表示从DLL起始地址R到NT Header的文件偏移）
例如：
e_lfanew = 0xD8，表示NT Header地址 = R + 0xD8
ReflectiveLoader通过这个偏移定位PE NT Header

(void*)(rawDllBaseAddress + rawDllDosHeader->e_lfanew)
计算NT Header实际地址：NT Header地址 = Raw DLL地址R + e_lfanew
用于验证通过DOS Header计算出的NT Header位置是否正确

(void*)rawDllNtHeader
查看当前保存的NT Header指针地址，这个地址要和上一步的地址一致
如果两个地址不一致，说明NT Header定位错误

rawDllNtHeader->Signature,x：读取NT Header签名，确认DOS Header之后的数据确实是PE NT Header
正常PE文件的结果为：PE\0\0（内存字节为：50 45 00 00）

rawDllNtHeader->OptionalHeader.Magic,x：读取Optional Header类型，判断PE的架构
常见值如下：
0x10B：PE32（x86）
0x20B：PE32+（x64）

rawDllNtHeader->FileHeader.NumberOfSections：读取PE文件节数量，确认DLL包含多少个Section
如果为6，说明包含6个节，ReflectiveLoader后续复制Section时会根据这个数量遍历节表

rawDllNtHeader->OptionalHeader.ImageBase,x：读取DLL默认加载基址
例如：0x180000000，表示编译DLL时希望Windows将它加载到：0x180000000
如果实际加载地址不同，需要通过Relocation表修复地址。

rawDllNtHeader->OptionalHeader.SizeOfImage,x：读取DLL映像展开后的总大小
表示DLL按照PE格式映射到内存后需要占用多少空间
例如：0x7000表示：ReflectiveLoader需要申请-VirtualAlloc(SizeOfImage)大小的内存区域

rawDllNtHeader->OptionalHeader.SizeOfHeaders,x：读取PE头部大小。
例如：0x400表示，DOS Header + NT Header + Section Table，这些头部数据需要复制到新映像的前0x400字节

rawDllNtHeader->OptionalHeader.AddressOfEntryPoint,x：读取DLL入口点RVA
RVA不是实际地址，真正入口地址为：加载基址D + AddressOfEntryPoint
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/61c5ce0a4b6a0f68.png)

-   注意，以下两个地址必须相等

```plain
(void*)(rawDllBaseAddress + rawDllDosHeader->e_lfanew)
(void*)rawDllNtHeader
```

### 阶段四：通过PEB动态解析API

-   为什么要通过PEB来解析：Release的编译产物只提取EXE的`.text` 作为裸加载器，不携带原EXE的完整PE头、导入表和加载状态，如果裸`.text` 直接按普通EXE方式调用（例如VirtualAlloc），编译器通常要通过原EXE的IAT取得函数地址，但裸代码被复制到任意地址后，原来预期的IAT就不存在了，所以需要加载器先自行找到 `LoadLibraryA、GetProcAddress、VirtualAlloc、NtFlushInstructionCache` 等等需要的API函数，然后保存在 `WINDOWSAPIS winApi` 结构里面
-   在 `library/Utils.cpp` 31行设置断点，按 `F5 --> f10` ，x64分支会执行

```plain
// 获取当前进程的PEB地址：x64下通过GS:[0x60]读取并转换为_PPEB指针
return (_PPEB)__readgsqword(0x60);
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/9c3c094fa5dcc504.png)

-   x64 Windows当前线程通过 `GS` 段访问TEB， `GS:[0x60]` 保存了当前进程的PEB地址（PEB中包含加载器数据及已加载模块链表），这个地址可以通过按 `F10` 执行完以后看见返回的PEB地址

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/5e6f7d036d5b5823.png)

-   `GetProcAddressByHash` ：在 `library/FunctionResolving.cpp` 19行设置断点，按 `F5 --> f10` 执行，第一次调用用于寻找 `LoadLibraryA` （PEB动态解析API），可以在监视输入以下表达式，观察hash

-   `GetProcAddressByHash` 不知道自己要找的是kernel32.dll或 `LoadLibraryA`
-   它只知道两个数字哈希值，它通过遍历模块和导出函数，将当前遇到的名字计算哈希，如果哈希相等，就认为找到了目标API，并返回真实函数地址
-   代码没有保存明文目标模块名和函数名，而是比较预先计算的哈希

```plain
// 表达式
(void*)pebAddress
moduleHash,x
functionHash,x

// 解释
(void*)pebAddress：查看传入的 PEB 地址。

moduleHash,x：查看DLL模块的哈希值（比如kernel32.dll的）

functionHash,x：查看函数的哈希（比如LoadLibraryA的）
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/730584a53f7581f0.png)

-   遍历PEB模块链表：代码从 `ldrData->InMemoryOrderModuleList` 取得已经记载模块的链表，此时在 `library/FunctionResolving.cpp` 48行设置断点，按 `F5` 执行（只有模块名哈希匹配时才会执行这里），可以通过下面的监测表达式进行监测

```plain
// 表达式
currentLdrDataTableEntry->BaseDllName.pBuffer,su
(void*)moduleBaseAddress
moduleNameHash,x
moduleHash,x
moduleNameHash == moduleHash


// 解释
currentLdrDataTableEntry->BaseDllName.pBuffer,su：获取当前遍历到的模块名称
ReflectiveLoader通过PEB->Ldr->InMemoryOrderModuleList遍历当前进程已经加载的DLL
例如：ntdll.dll、kernel32.dll、KernelBase.dll、user32.dll
这里查看当前循环走到了哪个DLL
,su 表示按照 Unicode 字符串格式显示，因为Windows DLL名称使用宽字符（wchar_t）

(void*)moduleBaseAddress：查看当前模块的基地址，每个加载到内存中的 DLL 都有一个起始地址。
例如：kernel32.dll可能为0x7FF800000000，这个地址就是模块PE文件在内存中的起点，后续解析导出表时，需要从这个地址开始

moduleNameHash,x：查看当前遍历模块名称计算出来的哈希值
代码不会直接比较kernel32.dll，而是kernel32.dll-->Hash算法-->0x62BCA17,然后与目标模块的哈希比较

moduleHash,x：查看目标模块的哈希值，这个值是在调用GetProcAddressByHash()时传入的
例如：moduleHash = kernel32.dll的哈希，ReflectiveLoader不保存“kernel32.dll”字符串
kernel32.dll-->计算哈希-->moduleHash
遍历过程中：当前DLL哈希-->moduleNameHash和目标DLL哈希-->moduleHash进行比较

moduleNameHash == moduleHash：判断当前遍历到的DLL是否是目标DLL
如果：moduleNameHash == moduleHash，说明当前模块名称哈希 = 目标模块名称哈希
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/5672268a8d4f4269.png)

-   遍历模块导出表：匹配模块后，需要解析PE导出目录 `AddressOfNames` （导出名称RVA数组）、 `AddressOfNameOrdinals` （名称对应的序号索引数组）、 `AddressOfFunctions` （导出函数RVA数组），此时可以在 `library/FunctionResolving.cpp` 74行设置断点，按 `F5` （这里只在函数名哈希匹配后才执行），可以通过下面的监测表达式进行监测

```plain
// 表达式
(char*)(moduleBaseAddress + *(DWORD*)nameArray),s
functionNameHash,x
functionHash,x
functionNameHash == functionHash


// 解释
(char*)(moduleBaseAddress + *(DWORD*)nameArray),s：获取当前遍历到的导出函数名称
找到目标DLL（如kernel32.dll）后，接下来需要解析DLL的导出表，寻找目标API
注意：PE导出表中的AddressOfNames保存的是函数名称的RVA
计算公式：函数名称地址 = DLL基址 + 函数名称RVA
也就是：moduleBaseAddress + *(DWORD*)nameArray
moduleBaseAddress = kernel32.dll内存基址
*(DWORD*)nameArray = 某个函数名称的RVA
相加后得到：LoadLibraryA
",s"：按照ASCII字符串格式显示函数名称

functionNameHash,x：查看当前遍历到的导出函数名称计算出的哈希值
ReflectiveLoader不直接保存函数名称LoadLibraryA，而是对函数名称进行哈希计算
LoadLibraryA-->Hash算法-->0x8A8B4676
遍历导出表时，每获取一个函数名，就计算一次哈希，并保存到functionNameHash用于后续比较

functionHash,x：查看目标函数的哈希值
该值是在调用：GetProcAddressByHash()时传入的目标函数哈希
例如目标函数LoadLibraryA，代码中不保存"LoadLibraryA"，而是保存functionHash = 0x8A8B4676
表示：需要寻找哪个 API

functionNameHash == functionHash：比较当前遍历到的函数哈希是否等于目标函数哈希
如果：functionNameHash == functionHash，结果为true，说明当前导出的函数就是目标函数

// 解析过程
在AddressOfNames找到目标名称
        ↓
用相同位置读取AddressOfNameOrdinals
        ↓
序号索引选择AddressOfFunctions中的RVA
        ↓
moduleBaseAddress + 函数RVA
        ↓
得到实际 API 地址
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/0c1fb917bd3e7bc7.png)

-   判断需要的Windows API是否解析都动态成功，在 `default-loader/ReflectiveLoader.cpp` 113行设置断点，按 `F5` 到断点处，可以通过下面的监测表达式进行监测

```plain
// 表达式
(void*)winApi.LoadLibraryA
(void*)winApi.GetProcAddress
(void*)winApi.VirtualAlloc
(void*)winApi.NtFlushInstructionCache
winApi.LoadLibraryA != nullptr
winApi.GetProcAddress != nullptr
winApi.VirtualAlloc != nullptr
winApi.NtFlushInstructionCache != nullptr


// 解释
(void*)winApi.LoadLibraryA：查看解析得到的LoadLibraryA函数地址，确认API地址是否正确
(void*)winApi.GetProcAddress：查看解析得到的GetProcAddress函数地址，用于后续动态获取其他API
(void*)winApi.VirtualAlloc：查看解析得到的VirtualAlloc函数地址，用于申请内存空间完成DLL映射
(void*)winApi.NtFlushInstructionCache：查看解析得到的NtFlushInstructionCache函数地址，用于刷新指令缓存，保证修改后的内存代码能够正常执行

winApi.LoadLibraryA != nullptr：判断LoadLibraryA地址是否为空，true表示解析成功
winApi.GetProcAddress != nullptr：判断GetProcAddress 地址是否为空，true表示解析成功
winApi.VirtualAlloc != nullptr：判断VirtualAlloc地址是否为空，true表示解析成功
winApi.NtFlushInstructionCache != nullptr：判断NtFlushInstructionCache地址是否为空，true表示解析成功
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/049c74f7c6cfafc2.png)

-   总的来说，这一个阶段实现了通过PEB动态解析API

-   加载器通过当前进程PEB找到了已有系统模块
-   加载器自行解析模块导出表
-   加载器取得了后续映射所需的API

### 阶段五：为目标DLL分配新映像

-   在 `default-loader/ReflectiveLoader.cpp` 124行设置断点，此处为 `VirtualAlloc()` 函数，此时按下 `F5` ，黄色箭头停在这一行时，还没有执行 `VirtualAlloc()` 函数来分配内存，可以通过以下监测指令来查看

```plain
// 表达式
rawDllNtHeader->OptionalHeader.SizeOfImage,x
rawDllNtHeader->OptionalHeader.ImageBase,x
loadedDllBaseAddress

// 解释
rawDllNtHeader->OptionalHeader.SizeOfImage,x：获取DLL映射到内存后所需要的总空间大小
ReflectiveLoader 后续会根据这个值调用VirtualAlloc分配内存
rawDllNtHeader->OptionalHeader.ImageBase,x：获取DLL编译时指定的默认加载基址
例如：ImageBase = 0x180000000，表示该DLL希望被加载到0x180000000，如果实际加载地址不同，需要通过 Relocation（重定位）修正地址
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/bcd967dd69c198a4.png)

-   补充： `VirtualAlloc()` 函数的四个参数

```plain
// 函数
VirtualAlloc(
    NULL,
    0x7000,
    MEM_RESERVE | MEM_COMMIT,
    PAGE_EXECUTE_READWRITE)
```

|     |     |
| --- | --- | 
| 参数  | 含义  |
| `NULL` | 让系统自己选择可用地址 |
| `0x7000` | 按PE的 `SizeOfImage` 分配完整映像空间 |
| `MEM_RESERVE \| MEM_COMMIT` | 同时保留地址+分配物理内存 |
| `PAGE_EXECUTE_READWRITE` | 整块内存区域可读、可写、可执行 |

-   执行 `VirtualAlloc()` 函数，按一次 `F10` ，黄色箭头离开调用行后，输入以下监测语句

```plain
// 表达式
(void*)loadedDllBaseAddress
loadedDllBaseAddress != 0
loadedDllBaseAddress != rawDllBaseAddress
loadedDllBaseAddress == rawDllNtHeader->OptionalHeader.ImageBase

// 解释
(void*)loadedDllBaseAddress：查看ReflectiveLoader为DLL分配的目标加载地址
这个地址是VirtualAlloc分配出来的新内存区域，用于存放经过手动映射后的DLL内存映像

loadedDllBaseAddress != 0：判断内存分配是否成功

loadedDllBaseAddress != rawDllBaseAddress：比较目标加载地址和原始DLL数据地址是否不同
rawDllBaseAddress：原始DLL文件数据所在位置
loadedDllBaseAddress：新申请的内存映像地址
正常 ReflectiveLoader 流程：
原始DLL(R)
        |
        | 复制、重定位、修复
        v
加载DLL(D)
两个地址通常不同，true表示DLL没有直接在原始缓冲区执行，而是进行了重新映射

loadedDllBaseAddress == rawDllNtHeader->OptionalHeader.ImageBase：判断实际加载地址是否等于PE头中指定的ImageBase
ImageBase：DLL编译时期的默认加载地址
如果为false，表示表示实际地址和默认地址不同，需要执行Relocation修复
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/f5e943c87ab1b8b5.png)

-   此时查看分配的新内存：打开“内存2”，地址输入 `loadedDllBaseAddress` （刚分配的提交内存通常由系统清零，所以开头主要是 `00` ）

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/aab90cc899994b63.png)

-   为什么需要重定位：如果 `loadedDllBaseAddress == rawDllNtHeader->OptionalHeader.ImageBase` 为false，说明 `实际基址D != 编译时偏好基址（0x180000000）` ，DLL中所有记录了偏好绝对地址的位置都必须按照差值修正，这就是后面的基址重定位

### 阶段六：复制PE头和各节，完成布局转换

-   复制PE头

-   在 `library/Utils.cpp` 98行设置断点，按下 `F5-->F10` ，然后通过以下监测指令来查看

```plain
// 表达式
(void*)srcImage
(void*)dstAddress


// 解释
(void*)srcImage：查看当前复制操作的源地址
srcImage指向原始DLL数据中的某个位置，表示原始文件布局中的节数据地址

(void*)dstAddress：查看当前复制操作的目标地址
dstAddress 指向新申请内存中的对应位置，表示按照PE内存布局展开后的节地址
ReflectiveLoader会把srcImage 中的数据复制到这里

// 对应关系
srcImage  = R
dstAddress = D
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/a93be7df76a1b34a.png)

-   此时在 `library/Utils.cpp` 106行设置断点，按下 `F5` 跳到断点处，此时还没有返回复制结果，然后通过以下监测指令来查看

```plain
// 表达式
sizeOfHeaders,x
((PIMAGE_DOS_HEADER)srcImage)->e_magic,x
((PIMAGE_DOS_HEADER)dstAddress)->e_magic,x

// 解释
sizeOfHeaders,x：查看需要复制的PE头大小
表示DOS Header + NT Header + Section Table这些PE头信息需要从原始DLL复制到新申请的内存中

((PIMAGE_DOS_HEADER)srcImage)->e_magic,x：查看源地址srcImage开头的DOS Header签名
srcImage当前指向原始 DLL 数据
正常值为0x5A4D（MZ），说明源数据仍然是合法PE文件头

((PIMAGE_DOS_HEADER)dstAddress)->e_magic,x：查看目标地址dstAddress复制后的DOS Header签名
dstAddress是新申请的DLL内存区域，复制Header后，这里应该也显示0x5A4D说明PE头已经成功从原始 DLL复制到了新的内存映像
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/bb5562515d754162.png)

-   此时按两次 `F10` 完成执行复制并返回，然后通过以下监测指令来查看

```plain
// 表达式
((PIMAGE_DOS_HEADER)loadedDllBaseAddress)->e_magic,x

// 解释
((PIMAGE_DOS_HEADER)loadedDllBaseAddress)->e_magic,x：查看已经加载到新内存区域中的DLL的DOS Header签名
loadedDllBaseAddress：表示ReflectiveLoader通过VirtualAlloc分配并映射后的DLL基址
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/2f605b5561e1ec8e.png)

-   进入节区复制循环

-   在 `library/Utils.cpp` 129行设置断点，按下 `F5` ，每一轮处理一个节

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/f93281a1adff9737.png)

```plain
// 该节数据最终要写入的目标内存地址
dstSection = D + sectionHeader->VirtualAddress;

// 该节数据在原始 dll 文件中的字节偏移
srcSection = R + sectionHeader->PointerToRawData;

// 当前这个节在文件中真实占用的字节大小，作为memcpy拷贝数据时的长度参数
sizeOfData = sectionHeader->SizeOfRawData;
```

-   观察第一轮`.text` ： `F10` 单步到 `srcSection` 、 `dstSection` 和 `sizeOfData` 都完成赋值后，展开sectionHeader，通过以下监测指令来查看

```plain
// 表达式
sectionHeader->VirtualAddress,x
sectionHeader->PointerToRawData,x
sectionHeader->SizeOfRawData,x
(void*)srcSection
(void*)dstSection
srcSection == (PBYTE)srcImage + sectionHeader->PointerToRawData
dstSection == (PBYTE)dstAddress + sectionHeader->VirtualAddress

// 解释
sectionHeader->VirtualAddress,x：查看当前节加载到内存中的RVA
VirtualAddress表示该节相对于DLL映像基址的位置

sectionHeader->PointerToRawData,x：查看当前节在原始DLL数据中的文件偏移
PointerToRawData表示该节在原始文件布局中的位置。

sectionHeader->SizeOfRawData,x：查看当前节在原始文件中的大小，表示需要从原始DLL中复制多少字节

(void*)srcSection：查看当前节复制时的源地址，srcSection指向原始DLL中该节的数据

(void*)dstSection：查看当前节复制后的目标地址
dstSection指向新映射DLL中对应节的位置

srcSection == (PBYTE)srcImage + sectionHeader->PointerToRawData：验证源节地址计算是否正确
也就是当前srcSection是否 = 原始DLL基址 + 节的文件偏移。
为true则表示读取原始节数据的位置正确

dstSection == (PBYTE)dstAddress + sectionHeader->VirtualAddress：验证目标节地址计算是否正确。
也就是当前dstSection是否 = 新映像基址 + 节的RVA。
为true：表示复制目标位置正确

//第一轮 .text 预期
PointerToRawData = 0x400
VirtualAddress   = 0x1000
SizeOfRawData    = 0x200
srcSection       = R + 0x400
dstSection       = D + 0x1000
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/989b7cddbd9e2825.png)

-   观察执行复制前后的内存

-   执行到 `if (!_memcpy(dstSection, srcSection, sizeOfData))` 时，复制还未执行，此时设置内存1地址 `srcSection` 和内存2地址 `dstSection` ，可以观察到复制前目标处为0

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/02d1f247ece741d2.png)

-   按F10执行 `memcpy` 复制以后，目标处出现与源相同的机器代码字节

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/8a6ed2ca2b257e9f.png)

-   观察全部六个节：在 `library/Utils.cpp` 142行打印语句设置断点，之后按 `F5` ，每一轮都会再次停下，可以发现规律

```plain
.text： R+0x400  → D+0x1000
.rdata：R+0x600  → D+0x2000
.data： R+0xC00  → D+0x3000
.pdata：R+0xE00  → D+0x4000
.rsrc： R+0x1000 → D+0x5000
.reloc：R+0x1200 → D+0x6000
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/fd317912aabbc061.png)

-   总的来说，这个阶段说明了

-   加载器不是把整个DLL文件原样复制到D
-   而是根据每个节的PointerToRawData读取文件内容
-   加载器根据每个节的VirtualAddress放入内存映像位置
-   此时D已经具有PE预期的虚拟布局

### 阶段七：修复目标DLL的导入地址表IAT

-   进入这个阶段以前，已经完成了以下内容，但是D中的目标DLL还不能正常调用系统函数

```cpp
找到原始 DLL：R
分配新映像：D
把 PE 头复制到 D
把 .text、.rdata、.data 等节复制到 D 的 RVA 位置
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/4aea642b660c4acf.png)

-   IAT是什么

-   测试DLL的源码调用了以下函数，但是编译后的DLL不会把这些系统函数的最终地址固定写死，因为每个进程中系统DLL的实际基址可能不同

```cpp
GetEnvironmentVariableW(...);
GetStdHandle(...);
WriteFile(...);
OutputDebugStringW(...);
MessageBoxW(...);
```

-   编译后的DLL不会把这些系统函数的最终地址固定写死，因为每个进程中系统DLL的实际基址可能不同，DLL中有一张IAT（导入地址表），可以把每个IAT槽理解成一个待填写的函数指针格子

```cpp
修复前：格子中保存导入名称结构的RVA
修复后：格子中保存当前进程里的真实API地址
```

-   如果不修复，目标DLL执行 `MessageBoxW` 调用时会把一个原本的RVA当成函数地址，会发生访问异常

-   此时先取消所有断点（Ctrl + Shift + F9），在 `default-loader/ReflectiveLoader.cpp` 第144行下断点， `F5` 到144行断点处，此时还未执行解析DLL（ResolveImports还没有进入，目标DLL的IAT仍保持修复前状态），接下需要做的是

```plain
读取目标 DLL 需要哪些函数
        ↓
加载这些函数所在的 DLL
        ↓
查到每个函数的真实地址
        ↓
把真实地址写入新映像的 IAT
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/0162d4ccc83e252c.png)

-   按 `F11` ，进入 `Utils.cpp` 第156行（ `ResolveImports` 函数），参数含义如下

```plain
ntHeader   = 原始测试 DLL 的 NT 头，用于读取导入数据目录 RVA
dstAddress = D，新映射 DLL 的基址
winApi     = 加载器此前解析出的 LoadLibraryA、GetProcAddress 等地址

数据目录中的地址是RVA，所以导入描述符位置计算为：D + ImportDirectory.VirtualAddress（不是R + RVA）
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/75b1a3b9b0206b79.png)

-   按一次 `F10` 进入函数内部，此时输入监视语句

```plain
// 表达式
(void*)ntHeader
(void*)dstAddress
(void*)winApi
dstAddress != 0

// 解释
(void*)ntHeader：该地址指向原始测试DLL的PE NT Headers，ResolveImports将从这里读取导入目录的RVA和大小
(void*)dstAddress：表示目标DLL被重新映射到内存后的新映像基址，也就是D，后续通过“D + RVA”定位新映像中的导入描述符、INT和IAT

(void*)winApi：它指向一个WINDOWSAPIS结构，该结构保存LoadLibraryA、GetProcAddress等Windows API的函数地址，供ResolveImports加载依赖模块并查询导入函数地址

dstAddress != 0：判断目标映像基址是否非空
结果为 true，说明VirtualAlloc返回的地址不是NULL；但它只能证明地址非零，不能单独证明该地址中的所有数据都正确
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/e28ee8d5aff22e4c.png)

-   继续 `F10` ，直到黄色箭头到达 `Utils.cpp` 第159行，此时即将从PE可选头的 `DataDirectory` （数据目录）数组中找到导入目录项，并让指针变量 `importDataDirectoryEntry` 指向这个 `IMAGE_DATA_DIRECTORY` 结构（此时不会修复IAT，也没有直接得到导入描述符表的实际内存地址，这里只取得描述导入表位置的信息，其中 `VirtualAddress` 保存导入描述符表的RVA， `Size` 保存导入目录的总大小。后续还需要使用 `dstAddress + VirtualAddress` 才能计算出导入描述符表在新映像中的实际地址），再执行一次 `F10` ，然后输入以下监测语句

```plain
// 表达式
importDataDirectoryEntry->VirtualAddress,x
importDataDirectoryEntry->Size,x

// 解释
importDataDirectoryEntry->VirtualAddress,x：
读取PE可选头中导入目录的VirtualAddress字段，并使用十六进制显示
这个值是导入描述符表的RVA，不是完整内存地址
当前测试DLL的结果为0x2430，因此导入描述符表在新映像中的实际地址是：dstAddress + 0x2430
也就是：D + 0x2430

importDataDirectoryEntry->Size,x：
读取PE可选头中导入目录的Size字段，并使用十六进制显示
当前测试DLL的结果为0x3C，也就是十进制60字节。
一个IMAGE_IMPORT_DESCRIPTOR占20字节，因此0x3C对应：
20字节的KERNEL32.dll导入描述符 + 20字节的USER32.dll导入描述符 + 20 字节的全零结束描述符
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/646f8e7c66ee7d5d.png)

-   上一步 `F10` 执行到 `Utils.cpp` 第164行，此时准备根据PE导入目录中记录的RVA（VirtualAddress），加上目标DLL重新映射后的新映像基址 `dstAddress` ，计算出新映像中导入描述符表的实际内存地址，并让指针变量 `importDescriptor` 指向表中的第一个 `IMAGE_IMPORT_DESCRIPTOR` 结构体 ，也就是让一个导入描述符指针变量指向内存中的第一个导入描述符结构体（这一步只是定位导入描述符表，还没加载依赖模块或修复IAT），此时再执行一次 `F10` ，然后输入以下监测语句

```plain
// 指向表中的第一个IMAGE_IMPORT_DESCRIPTOR
importDescriptor 指针
            │
            ▼
第一个 IMAGE_IMPORT_DESCRIPTOR：KERNEL32.dll
第二个 IMAGE_IMPORT_DESCRIPTOR：USER32.dll
第三个 IMAGE_IMPORT_DESCRIPTOR：全零结束项

// 表达式
(void*)importDescriptor
(void*)(dstAddress + 0x2430)
importDescriptor == (PIMAGE_IMPORT_DESCRIPTOR)(dstAddress + 0x2430)
importDescriptor->Name,x
importDescriptor->OriginalFirstThunk,x
importDescriptor->FirstThunk,x

// 解释
(void*)importDescriptor：
此时表示的是第一个导入描述符IMAGE_IMPORT_DESCRIPTOR的实际内存地址
当前运行的结果为dstAddress + 0x2430，也就是D + 导入目录RVA

(void*)(dstAddress + 0x2430)：
计算当前测试DLL导入描述符表的实际地址
dstAddress是新映像基址D，0x2430是当前DLL的导入目录RVA

importDescriptor == (PIMAGE_IMPORT_DESCRIPTOR)(dstAddress + 0x2430)：
比较计算出的importDescriptor，是否等于手动计算的D + 0x2430
结果为true证明加载器已经在新映像中正确找到了第一个导入描述符

importDescriptor->Name,x：
读取第一个导入描述符的Name字段，并以十六进制显示
它是依赖模块名称字符串的RVA，不是完整内存地址
当前为0x24F4，那么实际字符串地址为：dstAddress + 0x24F4
该地址保存的字符串为KERNEL32.dll

importDescriptor->OriginalFirstThunk,x：
读取OriginalFirstThunk字段，并以十六进制显示
它是原始导入名称表INT的 RVA，当前预期0x2470。
加载器通过INT中的条目确定目标DLL导入的是哪个函数，例如GetEnvironmentVariableW
INT的实际地址为：dstAddress + 0x2470

importDescriptor->FirstThunk,x：
读取FirstThunk字段，并以十六进制显示
它是导入地址表IAT的RVA，当前为0x2000，加载器找到函数的真实地址后，会把地址写入这个IAT
IAT 的实际地址为：dstAddress + 0x2000
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/c2da4021e66fc42a.png)

-   上一步 `F10` 执行到 `Utils.cpp` 第167行，即将进入进入第一轮外层循环并取得模块名，此时执行一次 `F10` ，执行到168行，此时即将读取当前 `IMAGE_IMPORT_DESCRIPTOR` 结构体的 `Name` 字段，这个字段保存的是依赖模块名称字符串相对于映像基址的RVA，而不是字符串的完整内存地址，所以此时将新映像基址 `dstAddress` 与 `importDescriptor->Name` 相加，计算出模块名称字符串在新映像中的实际地址，再将结果转换为 `LPCSTR` 类型并保存到指针变量 `libraryName` 中（这一步只是定位依赖模块的名称字符串，尚未加载该模块，第一次循环中， `Name` 的值为 `0x24F4` ，因此 `libraryName` 指向 `dstAddress + 0x24F4` ，该地址保存字符串为 `KERNEL32.dll` ），此时再执行一次 `F10` 进行赋值，然后输入以下监测语句

```plain
// 表达式
libraryName,s
(void*)libraryName
(void*)(dstAddress + importDescriptor->Name)

// 解释
libraryName,s：
把libraryName指向的内存按照以\0结尾的ANSI字符串显示
第一次循环中的预期结果为：KERNEL32.dll
这证明当前导入描述符描述的是KERNEL32.dll

(void*)libraryName：
把libraryName转换为通用指针void*，显示模块名称字符串的实际内存地址
第一次循环中，libraryName指向新映像中的：dstAddress + 0x24F4

(void*)(dstAddress + importDescriptor->Name)：
根据新映像基址dstAddress和当前导入描述符的Name RVA，计算模块名称字符串的实际地址
(void*)libraryName与(void*)(dstAddress + importDescriptor->Name)结果应完全相同
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/af56fda59355e8a4.png)

-   上一步 `F10` 执行到 `Utils.cpp` 第170行， 此时即将通过 `winApi` 结构中保存的 `LoadLibraryA` 函数指针，加载当前导入描述符指定的依赖模块（这里加载的是目标DLL所依赖的系统模块，而不是再次加载测试DLL本身）。传入的 `libraryName` 是前一步得到的模块名称（例如第一次循环中的 `"KERNEL32.dll"` ）， `LoadLibraryA` 成功后返回这个模块在当前进程中的模块句柄，在Windows中这个值可以看作模块映像的加载基址，然后代码将返回值转换为能够保存指针大小整数的 `ULONG_PTR` 再存入 `libraryBaseAddress` （这一步只负责确保依赖模块已经加载并取得其基址，还没有查询具体导入函数，也没有写入IAT ）。此时再执行一次 `F10` ，然后输入以下监测语句

```plain
// 表达式
(void*)libraryBaseAddress
libraryBaseAddress != 0
libraryName,s

// 解释
(void*)libraryBaseAddress：
把libraryBaseAddress转换为通用指针void*，按照内存地址的形式显示LoadLibraryA返回的模块句柄
该值可以看作依赖模块在当前进程中的映像基址
第一次循环中，它是KERNEL32.dll的模块基址；第二次外层循环中，它是USER32.dll的模块基址

libraryBaseAddress != 0：
判断LoadLibraryA是否返回了非空模块句柄。
结果为true，说明当前依赖模块已经成功加载，或者原本已经加载并由LoadLibraryA返回了现有模块句柄
结果为false，说明LoadLibraryA返回NULL，后续无法从该模块中查询导入函数

libraryName,s：
将libraryName指向的内容按照以\0结尾的ANSI字符串显示
它说明libraryBaseAddress当前对应的是哪个依赖模块
第一次循环的结果为：KERNEL32.dll
第二次外层循环的预期结果为USER32.dll

// 这一步的作用
确保KERNEL32.dll这些相关的模块已在当前进程中，并取得它的模块基址，供后面的GetProcAddress使用
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/0d83b558ce0943ec.png)

-   第一个IAT槽被修复

-   `F10` 执行到 `Utils.cpp` 第175行，再按 `F10` 执行INT赋值。此时程序使用新映像基址 `dstAddress` 加上当前导入描述符中 `OriginalFirstThunk` 保存的RVA，计算出INT（导入名称表）在新映像中的实际地址（ `dstAddress + 0x2470` ），并让指针变量 `INT` 指向第一个INT条目（INT中的每个条目用于说明需要导入哪个函数，内容可能是 `IMAGE_IMPORT_BY_NAME` 结构的 RVA，也可能是导入序号）

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/f622abdd91434f7e.png)

-   上一次 `F10` 执行到 `Utils.cpp` 第177行，再按 `F10` 执行IAT赋值。此时程序使用新映像基址 `dstAddress` 加上当前导入描述符中 `FirstThunk` 保存的 RVA，计算出IAT（导入地址表）在新映像中的实际地址（ `dstAddress + 0x2000` ），并让指针变量 `IAT` 指向第一个IAT槽。修复前，IAT槽通常保存函数名称结构的RVA，找到函数的真实地址后，反射加载器会将该地址写入对应的IAT槽。然后输入以下监测语句

```plain
// 表达式
(void*)INT
(void*)IAT
INT == (PIMAGE_THUNK_DATA)(dstAddress + 0x2470)
IAT == (PIMAGE_THUNK_DATA)(dstAddress + 0x2000)
*(UINT_PTR*)IAT,x

// 解释
(void*)INT：
把INT转换为通用指针void*，显示导入名称表INT在新映像中的实际地址
当前第一次循环中为：dstAddress + 0x2470

(void*)IAT：
把 IAT 转换为通用指针 void*，显示导入地址表 IAT 中第一个槽的实际地址。
当前第一次循环中为：dstAddress + 0x2000

INT == (PIMAGE_THUNK_DATA)(dstAddress + 0x2470)：
比较INT是否指向当前测试DLL的预期INT地址
结果为true，证明OriginalFirstThunk的RVA已经正确转换为实际内存地址

IAT == (PIMAGE_THUNK_DATA)(dstAddress + 0x2000)：
比较IAT是否指向当前测试DLL的预期第一个IAT槽
结果为true，证明FirstThunk的RVA已经正确转换为实际内存地址

*(UINT_PTR*)IAT,x：
读取IAT当前指向的第一个槽中保存的64位数值，并以十六进制显示
注意，(void*)IAT查看的是IAT槽本身位于哪里，而*(UINT_PTR*)IAT查看的是槽里面保存了什么
修复前的值为：x24B8，此时0x24B8不是函数真实地址，而是指向IMAGE_IMPORT_BY_NAME结构的RVA
后续解析出GetEnvironmentVariableW的真实地址后，这个槽会被替换为对应的API地址
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/a38a9b138e08e062.png)

-   此时在 `library/Utils.cpp` 207行设置断点，按下 `F5` 跳到断点处（执行 `while (DEREF(IAT))` 、序号判断、 `importName` 和 `functionName` 赋值，直接停在 `GetProcAddress` 调用前），断点命中207行时，此时 `GetProcAddress` 还没有调用，输入以下监测语句

```plain
// 表达式
libraryName,s
functionName,s
(void*)IAT
*(UINT_PTR*)IAT,x
(void*)importName
(void*)(dstAddress + *(UINT_PTR*)IAT)

// 解释
libraryName,s：
把libraryName指向的内容显示为以\0结尾的 ANSI 字符串，表示当前正在处理哪个依赖模块
第一次循环的结果为：KERNEL32.dll

functionName,s：
把functionName指向的内容显示为以\0结尾的 ANSI 字符串，表示当前正在解析哪个导入函数
第一个导入函数的结果为：GetEnvironmentVariableW
functionName实际指向importName->Name，也就是IMAGE_IMPORT_BY_NAME结构中的函数名称字段

(void*)IAT：
显示当前IAT槽本身的实际内存地址
第一个IAT槽的地址为：dstAddress + 0x2000

*(UINT_PTR*)IAT,x：
读取当前IAT槽中保存的值，并以十六进制显示。
在IAT尚未修复时，第一个槽的值为：0x24B8
这个值目前不是函数真实地址，而是IMAGE_IMPORT_BY_NAME结构的RVA

(void*)importName：
显示当前IMAGE_IMPORT_BY_NAME结构的实际内存地址
当前第一个函数的 importName地址为：dstAddress + 0x24B8

(void*)(dstAddress + *(UINT_PTR*)IAT)：
使用新映像基址dstAddress，加上当前IAT槽在修复前保存的RVA，计算IMAGE_IMPORT_BY_NAME结构的实际地址
计算结果应当与 (void*)importName 完全相同：dstAddress + 0x24B8

// 此时的状态
IAT 槽 D+0x2000
       │ 保存 0x24B8
       ↓
名字结构 D+0x24B8
       │
       └── "GetEnvironmentVariableW"
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/88237c535ae1c1ad.png)

-   此时 `F10` ，执行 `GetProcAddress` ，此时将通过 `winApi` 结构中保存的 `GetProcAddress` 函数指针，在 `libraryBaseAddress` 对应的依赖模块中查找 `functionName` 指定的导入函数，并将返回的真实函数地址转换为 `ULONG_PTR` 后保存到 `functionAddress` 。第一次循环中，就是在 `KERNEL32.dll` 中查找 `GetEnvironmentVariableW` ，这一步只取得函数地址，还没有写入IAT。输入以下监测语句

```plain
// 表达式
(void*)functionAddress
functionAddress != 0
*(UINT_PTR*)IAT,x

// 解释
(void*)functionAddress：
把functionAddress转换为通用指针void*，显示GetProcAddress返回的导入函数真实内存地址
第一次循环中，该地址对应KERNEL32.dll中的GetEnvironmentVariableW

functionAddress != 0：
判断GetProcAddress是否成功找到了当前导入函数。
结果为true，说明functionAddress不是 ULL，当前函数名称已经成功解析为可调用的真实地址

*(UINT_PTR*)IAT,x：
读取当前IAT槽中保存的64位数值，并以十六进制显示
此时还没执行IAT写入语句：DEREF(IAT) = functionAddress;
第一个 IAT 槽的值仍然是：0x24B8，仍然是IMAGE_IMPORT_BY_NAME结构的RVA，还不是函数真实地址

// 三个结果共同说明
已经保存GetProcAddress找到的真实API地址
确认函数查找成功
*(UINT_PTR*)IAT仍然是 0x24B8，说明真实地址尚未写入IAT
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/22f4e21b66d1b14f.png)

-   此时继续F10，执行到 `library/Utils.cpp` 209行，停在IAT写入前，此时输入以下监测语句

```plain
// 表达式
*(UINT_PTR*)IAT,x
functionAddress,x
*(UINT_PTR*)IAT == functionAddress

// 解释
*(UINT_PTR*)IAT,x：
读取当前IAT槽中保存的值，并以十六进制显示
在第209行执行前，第一个槽仍为0x24B8；执行第209行后（写入IAT），会变为真实的API地址

functionAddress,x：
以十六进制显示GetProcAddress查找到的真实函数地址
第一次循环中，该地址对应GetEnvironmentVariableW
在执行第209行前，先记录这个地址

*(UINT_PTR*)IAT == functionAddress：
比较当前IAT槽中的值是否等于GetProcAddress返回的函数地址
在第209行执行前为false，因为IAT中仍保存0x24B8
执行第209行后，从程序逻辑上说二者应当相等
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/e6d572f29a5abb56.png)

-   此时继续F10，执行IAT写入（执行后箭头会到达第212行，此时第201–210行的 `else` 代码块已经结束，局部变量 `functionAddress` 已经离开他的作用域，VS有时会显示它最后一次的缓存值，但此时继续用它参与新的监测表达式会得到不可靠的 `false` ），此时可以通过以下监测语句来判断当前IAT槽中的值是否等于GetProcAddress返回的函数地址

```plain
// 表达式
*(UINT_PTR*)IAT == (UINT_PTR)0x00007ffc8699dbb0

// 解释
*(UINT_PTR*)IAT：
读取当前IAT槽中保存的64位数值
执行第209行的IAT写入后，这里保存刚才由GetProcAddress返回的真实函数地址

(UINT_PTR)0x00007FFF0F2DE400
把之前在第209行记录的functionAddress地址转换为UINT_PTR类型
这个值为当前这一次调试、当前这个导入函数对应的functionAddress，不能使用其他运行或其他函数的地址
==：
比较当前IAT槽中的值，是否等于之前记录的真实函数地址
结果为true，表示第209行已经成功把GetProcAddress返回的函数地址写入当前IAT槽

// 执行这行代码前后的变化就是IAT修复的核心
写入前：D+0x2000 保存 0x24B8
写入后：D+0x2000 保存 GetEnvironmentVariableW 的实际地址
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/597ef06ead1df1bf.png)

-   前面观察了一次IAT修复的过程，现在只需要再观察和最终弹窗直接相关的 `MessageBoxW`

-   `library/Utils.cpp` 207行已经下过断点，此时右键该红点（断点处），选择“条件…”，选择条件表达式为true，输入以下内容，确认并关闭条件窗口

```plain
functionName[0] == 'M' && functionName[1] == 'e' && functionName[2] == 's' && functionName[3] == 's'
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/1c6b0ce5fef6edd2.png)

-   此时按 `F5` 跨过剩余循环，程序会自动完成以下工作，然后在 `functionName` 为 `MessageBoxW` 的第207行命中条件断点

```plain
WriteFile
OutputDebugStringW
GetStdHandle
切换到 USER32.dll 导入描述符
LoadLibraryA("USER32.dll")
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/d19388ac8660ea51.png)

-   此时通过以下监测表达式观察 `MessageBoxW` 修复前状态，说明 `D+0x2028` 就是测试DLL调用 `MessageBoxW` 时使用的IAT槽

```plain
// 表达式
libraryName,s
functionName,s
(void*)IAT
IAT == (PIMAGE_THUNK_DATA)(dstAddress + 0x2028)
*(UINT_PTR*)IAT,x
(void*)importName

// 解释
libraryName,s：
将libraryName指向的内容显示为ANSI字符串
结果为USER32.dll，说明当前正在处理USER32.dll的导入描述符

functionName,s：
将functionName指向的内容显示为ANSI字符串
结果为MessageBoxW，说明当前正在解析MessageBoxW

(void*)IAT：
将IAT转换为通用指针void*，显示当前IAT槽本身的实际内存地址
当前槽是MessageBoxW对应的IAT槽，位于：dstAddress + 0x2028

IAT == (PIMAGE_THUNK_DATA)(dstAddress + 0x2028)：
比较IAT是否指向当前测试DLL中MessageBoxW对应的预期槽位
预期结果为true，证明当前处理的是RVA为0x2028的IAT槽

*(UINT_PTR*)IAT,x：
读取当前IAT槽中保存的值，并以十六进制显示
修复前的预期值为0x2502，它不是MessageBoxW的真实函数地址，而是对应IMAGE_IMPORT_BY_NAME结构的RVA

(void*)importName：
显示当前IMAGE_IMPORT_BY_NAME结构在新映像中的实际地址
结果应该为：dstAddress + 0x2502
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/15eb326235527573.png)

-   此时按下 `F10` 执行 `GetProcAddress` ，通过以下监测表达式观察此时的查询和写入

```plain
// 表达式
(void*)functionAddress
functionAddress != 0
*(UINT_PTR*)IAT,x

// 解释
(void*)functionAddress：
把functionAddress转换为通用指针void*，显示GetProcAddress返回的MessageBoxW真实函数地址

functionAddress != 0：
判断GetProcAddress是否成功找到MessageBoxW
预期结果为true，说明functionAddress中已经保存MessageBoxW的真实函数地址

*(UINT_PTR*)IAT,x：
读取MessageBoxW对应的当前IAT槽值，并以十六进制显示
此时第209行的IAT写入尚未执行，因此仍为：0x2502
该值仍是IMAGE_IMPORT_BY_NAME结构的RVA，还不是MessageBoxW的真实地址
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/ffd72ee64b6131c3.png)

-   按下 `F10` 继续执行到 `library/Utils.cpp` 209行，这一行代码还未执行（即将写入IAT），再按一次 `F10` 执行写入IAT，然后通过以下监测语句观察

```plain
// 表达式
*(UINT_PTR*)IAT,x

// 解释
*(UINT_PTR*)IAT,x：
读取当前MessageBoxW对应的IAT槽值，并以十六进制显示
执行第209行的IAT写入后，该值会从修复前的0x2502，变为GetProcAddress返回的MessageBoxW真实函数地址

// 最终效果
LabDll.cpp 调用 MessageBoxW
          ↓
代码读取 D+0x2028 的 IAT 槽
          ↓
该槽已经被加载器写成真实 MessageBoxW 地址
          ↓
CPU 才能进入 USER32 中的 MessageBoxW
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/c52331e52f21c8d2.png)

-   前面观察了IAT修复的过程，现在可以退出导入循环并验证所有IAT已完成

-   取消 `library/Utils.cpp` 207行的断点，然后在 `default-loader/ReflectiveLoader.cpp` 147行下断点，然后 `F5` 执行，程序会自动完成导入循环、从 `ResolveImports` 返回，并停在 `ProcessRelocations` （此时即将处理重定位，还没执行重新定位的逻辑）还没执行的位置

```plain
// 表达式
*(ULONG_PTR*)(loadedDllBaseAddress + 0x2000),x
*(ULONG_PTR*)(loadedDllBaseAddress + 0x2008),x
*(ULONG_PTR*)(loadedDllBaseAddress + 0x2010),x
*(ULONG_PTR*)(loadedDllBaseAddress + 0x2018),x
*(ULONG_PTR*)(loadedDllBaseAddress + 0x2028),x

// 解释
*(ULONG_PTR*)(loadedDllBaseAddress + 0x2000),x：
读取 D + 0x2000 处的第一个 IAT 槽，对应 GetEnvironmentVariableW

*(ULONG_PTR*)(loadedDllBaseAddress + 0x2008),x
读取 D + 0x2008 处的第二个 IAT 槽，对应 WriteFile

*(ULONG_PTR*)(loadedDllBaseAddress + 0x2010),x：
读取 D + 0x2010 处的第三个 IAT 槽，对应 OutputDebugStringW

*(ULONG_PTR*)(loadedDllBaseAddress + 0x2018),x：
读取 D + 0x2018 处的第四个 IAT 槽，对应 GetStdHandle

*(ULONG_PTR*)(loadedDllBaseAddress + 0x2028),x：
读取 D + 0x2028 处的 MessageBoxW IAT 槽

// 说明
这五项现在都是类似0x00007FFF...的完整地址，而不再是原来的较小RVA
这证明ResolveImports已经遍历两个导入描述符，并修复当前测试DLL的五个IAT槽
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/b7210e33530fd3ac.png)

-   这个阶段总的来说，完成了

-   加载器从目标DLL的导入目录找到模块名和函数名
-   加载器使用 `LoadLibraryA` 取得依赖模块
-   加载器使用 `GetProcAddress` 取得实际函数地址
-   加载器把每个实际地址写入D中对应IAT槽
-   目标DLL已具备调用五个系统API的能力

### 阶段八：执行重定位

-   为什么节已经复制完还必须重定位

-   测试DLL编译时希望加载到 `期望的ImageBase = 0x180000000` 这个地址
-   但 `VirtualAlloc(NULL, ...)` 实际分配得到的是本次运行中的D，不等于 `0x180000000` （期望值）
-   测试DLL中的的代码为 `static const wchar_t* volatile g_message = kMessage` ，此时磁盘DLL中 `g_message` 保存的是编译时绝对地址（ `期望的ImageBase 0x180000000 + kMessage RVA 0x2040` ），映射到D后，它必须变成 `D + 0x2040` ，否则 `MessageBoxW` 会收到错误字符串指针

-   上一步已经执行到 `default-loader/ReflectiveLoader.cpp` 147行断点处，此时按下 `F11` 进入到处理重定向函数的逻辑中

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/3645d55193b411a1.png)

-   继续 `F10` 执行到 `library/Utils.cpp` 233行，此时即将用目标DLL当前实际映射的新映像基址 `dstAddress` ，减去PE可选头中记录的首选映像基址ImageBase，计算本次加载产生的基址偏移量，并将结果保存到delta。如果DLL恰好映射到首选基址delta就为0，不需要调整绝对地址；如果不同，反射加载器就必须根据重定位表，将需要修复的地址加上delta（当前测试DLL的首选基址 `ImageBase` 为 `0x180000000` ，所以计算关系为 `delta = dstAddress - 0x180000000` ，此时通过以下监测语句观察

```plain
// 表达式
(void*)dstAddress
ntHeader->OptionalHeader.ImageBase,x
((__int64)dstAddress - (__int64)ntHeader->OptionalHeader.ImageBase),x

// 解释
(void*)dstAddress：
把dstAddress转换为通用指针void*，显示目标DLL实际映射后的新映像基址D

ntHeader->OptionalHeader.ImageBase,x：
读取目标DLL的PE可选头中记录的首选映像基址，并以十六进制显示
它表示链接器原本希望 DLL 被加载到的基址，并不保证等于本次实际映射地址

((__int64)dstAddress - (__int64)ntHeader->OptionalHeader.ImageBase),x：
用实际映像基址减去首选映像基址，并将结果按有符号64位整数显示
它表示目标 DLL 本次加载产生的基址偏移量
实际基址：D - 首选基址 ImageBase
如果结果为0，说明DLL恰好映射到了首选基址
果结果非0，说明映射位置发生变化，后续必须根据重定位表修正受影响的地址
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/10d72d7823ad7319.png)

-   按 `F10` 执行delta赋值，通过以下监测语句观察

```plain
// 表达式
delta,x
delta == dstAddress - ntHeader->OptionalHeader.ImageBase

// 解释
delta,x：
读取第233行计算并保存到变量delta中的基址偏移量，并以十六进制显示
它等于目标DLL的实际映像基址dstAddress减去PE可选头中记录的首选映像基址ImageBase

delta == dstAddress - ntHeader->OptionalHeader.ImageBase：
重新计算实际映像基址减去首选映像基址，并将结果与变量delta比较
结果为true，证明第233行已经执行，而且delta正确保存了本次加载产生的基址偏移量
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/cbaf3a030ff266db.png)

-   继续 `F10` 执行，直到 `library/Utils.cpp` 236行被执行完，此时将通过 `IMAGE_DIRECTORY_ENTRY_BASERELOC` 这个固定索引（Windows PE头中定义的一个固定索引常量，表示 `DataDirectory` 数组里的基址重定位目录项），访问目标DLL的PE可选头中 `DataDirectory` 数组的基址重定位目录项，并取得该目录项的地址，让指针变量 `relocDataDirectoryEntry` 指向对应的 `IMAGE_DATA_DIRECTORY` 结构体（这一步只取得重定位目录的元数据，没有定位具体的重定位块，也没有修改任何需要重定位的地址。 `VirtualAddress` 保存基址重定位表相对于映像基址的RVA， `Size` 保存PE头中记录的重定位目录总大小。后续要用 `dstAddress + relocDataDirectoryEntry->VirtualAddress` ，才能得到新映像中第一个 `IMAGE_BASE_RELOCATION` 重定位块的实际内存地址），此时可以通过监视语句进行观察

```plain
// 表达式
relocDataDirectoryEntry->VirtualAddress,x
relocDataDirectoryEntry->Size,x

// 解释
relocDataDirectoryEntry->VirtualAddress,x：
读取PE可选头中基址重定位目录项的VirtualAddress字段，并以十六进制显示
该值是整个基址重定位表相对于映像基址的RVA，不是完整内存地址
当前测试DLL的预期值为0x6000，因此，重定位表在新映像中的实际地址为dstAddress + 0x6000

relocDataDirectoryEntry->Size,x：
读取基址重定位目录项的Size字段，并以十六进制显示
该值表示PE头中记录的整个基址重定位目录大小，单位是字节
当前测试DLL的预期值需要以实际调试结果为准；它用于判断是否存在重定位信息，并帮助确定重定位目录的范围
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/1f8cd2517e26a833.png)

-   接下来可以观察反射加载器把DLL中仍然按照首选映像基址计算的绝对地址修正为本次实际映射地址的过程

-   此时在进入循环之前，先通过以下监视语句查询

```plain
// 表达式
*(ULONG_PTR*)(dstAddress + 0x3000),x

// 解释
dstAddress + 0x3000：
使用目标DLL的实际映像基址dstAddress，加上当前重定位目标的RVA 0x3000，计算出需要修复的64位指针变量在新映像中的实际内存地址
当前调试代码中，这个位置对应全局指针变量g_message
(ULONG_PTR*)：
把dstAddress + 0x3000转换为指向ULONG_PTR的指针
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/01172228d60bcdb6.png)

-   此时在 `library/Utils.cpp` 264行下断点，然后右键红点，选择“条件…”，输入以下内容

```plain
relocation->type == 10

// 为什么是10
IMAGE_REL_BASED_DIR64是PE基址重定位表中的一种重定位类型
表示：目标位置保存的是一个64位绝对地址，需要把映像的基址偏移量delta加到这个64位地址上
它由Windows SDK固定定义为：#define IMAGE_REL_BASED_DIR64 10
经过预处理后本质上就是：relocation->type == 10，等价于relocation->type == IMAGE_REL_BASED_DIR64
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/877c25759ef4c761.png)

-   然后按 `F5` 执行，程序会完成以下内容，只在 `type == 10` 的有效x64重定位项上停止

```plain
baseRelocation = D + 0x6000
读取重定位块页 RVA
计算 relocationCount
进入内层循环
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/2794ee01846614a6.png)

-   此时命中断点后（停在 `library/Utils.cpp` 264行），通过以下监视语句观察重定位项的组成（证明加载器是根据PE重定位表的记录，找到 `D + 0x3000` ，并准备修复其中的旧指针，而不是随意修改这个地址）

```plain
// 表达式
(void*)baseRelocation
baseRelocation->VirtualAddress,x
baseRelocation->SizeOfBlock,x
(void*)relocationBlock
relocation->type
relocation->offset,x
(void*)(relocationBlock + relocation->offset)
*(ULONG_PTR*)(relocationBlock + relocation->offset),x

// 解释
(void*)baseRelocation：
显示当前IMAGE_BASE_RELOCATION重定位块头的实际内存地址（重定位表的位置）
当前值为dstAddress + 0x6000

baseRelocation->VirtualAddress,x：
显示当前重定位块所负责页面的RVA
当前值0x3000，表示该块负责新映像中从 D + 0x3000 开始的页面（真正需要修改的数据位置）

baseRelocation->SizeOfBlock,x：
显示当前重定位块的总大小，包含块头和后面的所有重定位条目
当前值为0xC，即12字节（8字节IMAGE_BASE_RELOCATION头 + 2个2字节重定位条目）

(void*)relocationBlock：
显示当前重定位块所负责页面的实际内存地址
由dstAddress + baseRelocation->VirtualAddress计算得到，当前值为D + 0x3000。

relocation->type：
显示当前重定位条目的类型。
当前值为10，即IMAGE_REL_BASED_DIR64，表示需要修复一个64位绝对地址

relocation->offset,x：
显示当前重定位目标相对于该页面起点的偏移
当前值为0，因此目标就在relocationBlock指向的页面起始位置

(void*)(relocationBlock + relocation->offset)：
显示当前需要修复的目标位置的实际内存地址
综合页面地址和页内偏移，计算最终修复位置：D + 0x3000 + 0 = D + 0x3000

*(ULONG_PTR*)(relocationBlock + relocation->offset),x：
读取目标位置中尚未修复的64位地址（读取该位置目前保存的旧指针），并以十六进制显示
当前值为 0x180002040，它仍然是按照DLL首选映像基址计算的旧地址

// 监视结论
PE 重定位表位于 D + 0x6000
        ↓
它要求修复 D + 0x3000 页面
        ↓
条目页内偏移为 0
        ↓
最终修复位置为 D + 0x3000
        ↓
其中旧指针是 0x180002040
        ↓
接下来将它修正为 D + 0x2040
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/a37f8a36d5e8e203.png)

-   此时继续按 `F10` ，直到黄色箭头离开 `library/Utils.cpp` 265行，执行重定位写入（264-265两行代码执行时，先判断当前重定位条目是否为 `IMAGE_REL_BASED_DIR64` ，也就是类型10，表示目标位置保存的是一个需要修正的64位绝对地址。条件成立后，通过“ `当前页面的实际地址 relocationBlock + 页内偏移 relocation->offset` ”找到需要修复的位置，读取其中的旧地址，再加上实际基址与首选基址之间的差值delta，最后写回原位置），通过以下监视语句观察执行的结果

```plain
// 表达式
*(ULONG_PTR*)(dstAddress + 0x3000),x
dstAddress + 0x2040,x
*(ULONG_PTR*)(dstAddress + 0x3000) == dstAddress + 0x2040

// 解释
*(ULONG_PTR*)(dstAddress + 0x3000),x：
读取D + 0x3000位置中保存的64位指针，并以十六进制显示
这个位置是全局指针变量g_message自身的存储位置
完成重定位后，结果回从旧值0x180002040变为D + 0x2040

dstAddress + 0x2040,x：
手动计算g_message应该指向的正确地址，并以十六进制显示。
dstAddress是目标DLL的实际映像基址D，0x2040是目标字符串在映像中的RVA
因此该表达式得到字符串在本次新映像中的实际地址

*(ULONG_PTR*)(dstAddress + 0x3000) == dstAddress + 0x2040：
比较g_message当前保存的指针值，是否等于目标字符串在新映像中的实际地址
结果为true，证明DIR64重定位已经成功把旧指针0x180002040修正为D + 0x2040

// 计算方式
目标位置 = relocationBlock + offset
         = (D + 0x3000) + 0
         = D + 0x3000

旧值     = 0x180002040

delta    = D - 0x180000000

新值     = 旧值 + delta
         = 0x180002040 + (D - 0x180000000)
         = D + 0x2040
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/2bb4465cac463a40.png)

-   此时取消 `library/Utils.cpp` 264行的断点（避免程序再次因检查后续重定位条目停下）
-   在 `default-loader/ReflectiveLoader.cpp` 150行下断点，然后按 `F5` ，调试器会继续运行 `ProcessRelocations`

-   当前 `DIR64` 条目处理完毕后（根据新映像基址修正64位绝对地址），代码通过 `++relocation` 移到下一个条目（通常是类型 `0` 的 `IMAGE_REL_BASED_ABSOLUTE` 对齐项，表示这个条目不需要修复任何地址， 通常用于填充对齐，加载器直接跳过），当前重定位块包含的内容如下

```plain
8字节的IMAGE_BASE_RELOCATION块头
2字节的DIR64有效条目
2字节的ABSOLUTE填充条目
一共12字节，即0xC
```

-   当前项目只处理 `DIR64` （ `if (relocation->type == IMAGE_REL_BASED_DIR64)` ），当读到类型为 `0` 时，条件不成立，所以不会修改任何内存，只会继续移动到下一个条目，它的作用只是让重定位块大小满足格式对齐要求

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/9afd43b9f53671e3.png)

-   内层循环结束后，程序根据 `SizeOfBlock` 移到下一个重定位块，发现已经到达重定位目录末尾，于是退出外层循环并从 `ProcessRelocations` 返回

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/d62eb1e593d2560b.png)

-   调用栈此时回到 `ReflectiveLoader` ，继续执行第147行调用（处理重定位）之后的代码，在第150行我们下的断点处停下

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/3e82f286e928c24a.png)

-   总的来说，这个阶段的调试说明了

-   实际映像D与偏好ImageBase不同
-   加载器从`.reloc` 目录找到DIR64项
-   加载器定位到 `D+0x3000` 的绝对指针
-   加载器把旧值 `0x180002040` 修复为 `D+0x2040`
-   执行完以后，测试DLL的 `g_message` 现在指向新映像中的正确字符串

### 阶段九：计算目标DLL入口

-   在上一阶段末尾，调试已经执行到 `default-loader/ReflectiveLoader.cpp` 150行下断点的地方，此时程序即将使用目标DLL重新映射后的新映像基址 `loadedDllBaseAddress` ，加上PE可选头中 `AddressOfEntryPoint` 保存的入口点RVA，计算目标DLL入口函数在新映像中的实际内存地址，并将结果保存到 `entryPoint` （当前测试DLL的入口点RVA预期为 `0x1070` ，所以计算结果为 `loadedDllBaseAddress + 0x1070` 。此时只是计算入口点地址，还没调用该地址，也没有执行目标DLL的 `DllMain` ），可以通过以下监视语句进行观察

```plain
// 表达式
(void*)loadedDllBaseAddress
rawDllNtHeader->OptionalHeader.AddressOfEntryPoint,x
entryPoint

// 解释
(void*)loadedDllBaseAddress：
把loadedDllBaseAddress转换为通用指针void*，显示目标DLL重新映射后的新映像基址D

rawDllNtHeader->OptionalHeader.AddressOfEntryPoint,x：
读取目标DLL的PE可选头中记录的入口点RVA，并以十六进制显示
当前测试DLL的预期值为0x1070，它是相对于映像基址的偏移，不是完整内存地址

entryPoint：
显示程序计算出的目标DLL入口点实际地址，由于断点在这一行，所以entryPoint还没赋值
计算关系为：entryPoint = loadedDllBaseAddress + 0x1070
这个地址是后续准备调用的DLL入口函数地址，但此时入口函数还没执行
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/df679824e5ec8c60.png)

-   此时 `F10` 执行入口地址计算，通过以下监视语句进行观察

```plain
// 表达式
(void*)entryPoint
(void*)(loadedDllBaseAddress + 0x1070)
entryPoint == loadedDllBaseAddress + rawDllNtHeader->OptionalHeader.AddressOfEntryPoint

// 解释
(void*)entryPoint：
把entryPoint转换为通用指针void*，显示程序计算出的目标DLL入口函数实际内存地址
该地址是后续准备调用的DLL入口点，但此时入口函数尚未执行

(void*)(loadedDllBaseAddress + 0x1070)：
使用目标DLL的新映像基址loadedDllBaseAddress，加上当前测试DLL的入口点RVA(0x1070)，手动计算入口点的实际内存地址
结果会(void*)entryPoint完全相同

entryPoint == loadedDllBaseAddress + rawDllNtHeader->OptionalHeader.AddressOfEntryPoint：
比较entryPoint是否等于“新映像基址 + PE头中记录的入口点RVA”
结果为true，证明加载器已经根据PE头正确计算出目标DLL的入口地址
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/8c6b6f1889481189.png)

-   此时在 `default-loader/ReflectiveLoader.cpp` 157行下断点，然后 `F5` 执行到断点处。此时程序即将通过之前解析出的 `NtFlushInstructionCache` 函数地址，刷新当前进程的CPU指令缓存。 `(HANDLE)-1` 是当前进程的伪句柄， `NULL` 和 `0` 表示不限定具体内存区域。由于加载器刚刚复制了DLL代码并完成IAT和重定位修复，刷新指令缓存可以确保CPU接下来从新映像入口执行时读取最新的机器指令，而不是可能残留的旧缓存内容。这一步不会调用DLL入口点，它只是为随后执行 `entryPoint` 做准备，通过以下监视语句进行观察

```plain
// 表达式
(void*)winApi.NtFlushInstructionCache
winApi.NtFlushInstructionCache != nullptr

// 解释
(void*)winApi.NtFlushInstructionCache：
把winApi结构中保存的NtFlushInstructionCache函数指针转换为通用指针void*，显示该Windows API的实际函数地址

winApi.NtFlushInstructionCache != nullptr：
判断NtFlushInstructionCache函数指针是否为空
结果为true，说明反射加载器已经成功找到该API的地址，可以通过这个函数指针调用NtFlushInstructionCache
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/09210c8e975c2d1f.png)

-   此时按 `F10` 执行指令缓存刷新（加载器刚刚向D写入代码和数据并完成修复，刷新当前进程的指令缓存，确保CPU后面从D执行时读取到最新内容）

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/57924f99c7abb07c.png)

### 阶段十：第一次执行DllMain

-   此时在 `default-loader/ReflectiveLoader.cpp` 161行下断点，然后 `F5` 执行到断点处。程序将会把前面计算出的 `entryPoint` 转换为 `DLLMAIN` 函数指针并调用目标DLL的入口函数，三个参数如下，入口函数的返回值保存在 `processAttachResult` 中

-   `loadedDllBaseAddress` ：表示目标DLL的新映像基址（D）
-   `DLL_PROCESS_ATTACH` ：表示DLL正在被加载到当前进程（表示这个DLL刚刚被加载进进程的一个事件标志）
-   `NULL` ：表示没有额外保留参数

-   此时第一次入口调用尚未执行，可以先通过以下监视语句进行观察

```plain
// 表达式
(void*)entryPoint
(void*)loadedDllBaseAddress
*(DWORD*)(loadedDllBaseAddress + 0x3008)

// 解释
(void*)entryPoint：
把entryPoint转换为通用指针void*，显示目标DLL入口函数的实际内存地址E
当前测试DLL中，它等于：loadedDllBaseAddress + 0x1070（E = D + 0x1070）

(void*)loadedDllBaseAddress：
把loadedDllBaseAddress转换为通用指针void*，显示目标DLL反射映射后的新映像基址D
该地址稍后会作为DllMain的第一个参数hinstDLL传入

*(DWORD*)(loadedDllBaseAddress + 0x3008)：
读取新映像中D + 0x3008位置保存的32位整数
当前测试DLL中，该位置是全局变量g_labLastReason，用来记录DllMain最近一次收到的调用原因
在DLL_PROCESS_ATTACH调用前，值为0
进入并执行DllMain后，它会被更新为1
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/c9ce540ad7582886.png)

-   此时打开 `调试 → 窗口 → 反汇编` （快捷键： `Ctrl+Alt+D` ），在顶部地址框输入本 `entryPoint` 的具体数值，此时反汇编窗口跳到E地址（目标DLL入口函数的实际内存地址），E地址处能够显示有效的x64机器指令，说明复制到 `D + 0x1070` 的`.text` 代码现在可以被调试器解释为机器指令

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/b919401c197d7a1d.png)

-   此时在E地址处下断点，便于后续观察第161行调用 `entryPoint` 后，CPU是否真的到达了E（调用的DLL入口点），截住控制流真正进入目标DLL的瞬间

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/d2ae403fcce7b1d6.png)

-   此时在 `default-loader/ReflectiveLoader.cpp` 162行下断点（让第一次 `DllMain` 完整执行并返回后，程序立即停下来），当前代码的关系如下

```plain
// 161行：第一次调用 DllMain
BOOL processAttachResult = ((DLLMAIN)entryPoint)((HINSTANCE)loadedDllBaseAddress, DLL_PROCESS_ATTACH, NULL);


// 162行：下一次调用
BOOL privateInitResult = ((DLLMAIN)entryPoint)((HINSTANCE)loaderStart, 4, NULL);
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/fbb68ecc90dd632a.png)

-   此时按 `F5` 执行， 程序会正常执行第161行的函数调用，但由于 `E` 上存在断点，CPU刚到 `E` 就会停，不会直接执行完整个 `DllMain`

```plain
ReflectiveLoader 161行
        ↓ 间接调用 entryPoint
CPU 到达 E = D + 0x1070
        ↓
目标 DLL 入口即将开始执行
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/108203c24fcfabd8.png)

-   此时，在VS中点击 `调试 → 窗口 → 寄存器` ，然后关注 `RIP、RCX、RDX、R8` ，观测结果如下

```plain
RCX：第一个参数值，也就是目标DLL的新映像基址（D）
RDX：第二个参数的值，此时为1，表示DLL正在进行进程加载初始化
R8：第三个保留参数的值（NULL），此时为0
RIP：RIP保存CPU下一条要执行的指令地址，它等于或位于E的第一条指令处，证明CPU已经进入目标DLL的实际入口了
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/dc231711e100c68b.png)

-   通过观察寄存器，可以发现，不仅跳到了正确入口，而且按照 `DllMain` 约定传入了正确参数
-   此时继续 `F5` ，使得程序从入口第一条指令继续执行，此时测试DLL会完成以下操作

```plain
把g_labLastReason设置为1
输出调试信息
读取环境变量
通过已经修复的IAT调用MessageBoxW（弹窗）
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/61a29940b6fb164d.png)

-   弹窗是整条手工映射流程成功的综合结果，依赖于以下几个前置的阶段

-   入口代码已复制到 `D`
-   入口地址 `E` 计算正确
-   IAT中的 `MessageBoxW` 地址已经修复
-   内部指针 `g_message` 已完成重定位
-   CPU正确进入了 `E`

-   此时关闭弹窗，可以发现命中 `default-loader/ReflectiveLoader.cpp` 162行的断点，此时第161行的 `DLL_PROCESS_ATTACH` 调用已经执行并返回结果，第162行的第二次调用还没有执行，可以通过以下监视语句观察

```plain
// 表达式
processAttachResult
*(DWORD*)(loadedDllBaseAddress + 0x3008)

// 解释
processAttachResult：
查看第一次DllMain调用的返回值
预期为1，表示目标DLL初始化成功

*(DWORD*)(loadedDllBaseAddress + 0x3008)：
读取DLL中的g_labLastReason
从调用前的0变成1，证明DllMain确实收到了DLL_PROCESS_ATTACH
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/447aa11c00ac6a69.png)

-   这个阶段可以观察到以下步骤，也是就DLLMain第一次执行的过程（前置式反射DLL注入算是初步执行成功了）

```plain
entryPoint = D + 0x1070
        ↓
RIP 到达 entryPoint
        ↓
RCX=D、RDX=1、R8=0
        ↓
DLL 输出信息并弹出消息框
        ↓
processAttachResult = TRUE
        ↓
g_labLastReason = 1
```

-   `default-loader/ReflectiveLoader.cpp` 162行

-   161行第一次执行是标准的Windows DLL入口调用，目的就是告诉DLL“你已经被加载到这个进程了，现在执行你的初始化代码”
-   162行第二次执行的不是Windows标准的DllMain reason，Loader在完成标准DLL初始化后，又利用同一个入口地址执行了一次自定义初始化/通知流程
