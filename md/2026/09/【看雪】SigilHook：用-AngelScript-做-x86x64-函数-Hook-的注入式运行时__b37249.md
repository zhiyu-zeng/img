---
title: 【看雪】SigilHook：用 AngelScript 做 x86/x64 函数 Hook 的注入式运行时
source: https://bbs.kanxue.com/thread-293112.htm
source_host: bbs.kanxue.com
clip_date: 2026-09-30T19:33:17+08:00
trace_id: 401f2ba4-6f49-4aae-8a76-76b9368416e7
content_hash: f10237c2b0c7aac975a73e4681a92409c97bb6b9ca6b2162dc0f55d416d35c9a
status: synced
tags:
  - 看雪
  - Hook
  - 安全工具
series: null
feed_source: 看雪·逆向工程
ai_summary: SigilHook 是基于 PolyHook 2 的 x86/x64 注入式 Hook 运行时，用 AngelScript 脚本驱动 Hook 逻辑，改逻辑无需重编译 DLL、重启工具链。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3eb75244-d011-8109-9f06-eacc54f893f4
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> SigilHook 是基于 PolyHook 2 的 x86/x64 注入式 Hook 运行时，用 AngelScript 脚本驱动 Hook 逻辑，改逻辑无需重编译 DLL、重启工具链。
> 
> - **核心机制：** 在 PolyHook 2（Detour、IAT/EAT、VFunc/VTable 等）之上加稳定 C ABI，导出统一用 `extern "C"` + `sigilhook_*` 前缀与 opaque handle，不暴露 C++ 类 ABI、STL 与异常；用 AsmJit 重写 JIT 回调桥，支持参数、返回值、GPR、flags 可读写。
> - **调用约定与 Hook 语义：** 覆盖 cdecl/stdcall/fastcall/thiscall/vectorcall 及自定义 usercall 映射（`argN=<reg|stack+offset>` 等），x86/x64 共用一套描述语法；支持 mid-hook（`shHookMid`/`shResumeMid`）、寄存器与 XMM0-XMM15、flags 的脚本级读写（SP 只读）。
> - **脚本模型：** 递归编译脚本目录为单一 `SigilHook.Application` 模块，各 .as 间可直接互调全局函数、共享全局变量，无需 import；.ash 支持 `#include` 与 include-once；严格单入口，只认根目录 main.as 的 `void main()` 与可选 `unload()`。
> - **热重载与生命周期：** 命名管道 `\\.\pipe\SigilHook.` 配合 `SigilHookReload.bat` 按进程或全量触发，不用重新注入；停止时先拒绝新回调，`sigilhook_runtime_stop_with_timeout()` 超时则返回 BUSY 并保留 engine/hooks。
> - **使用方式：** 注入 SigilHook.dll → 同目录放 `SigilHook\main.as` 并 include `SigilHook.ash` → 写 Hook 与回调 → 热重载；x86/x64 DLL 分开构建，只注入同位数进程。

分享一下我自己做的项目 SigilHook

GitHub：  
https://github.com/StackAndPointer/SigilHook

发布页：  
https://github.com/StackAndPointer/SigilHook/releases

一句话概括：这是一个基于 PolyHook 2、用 AngelScript 驱动脚本 Hook 的 x86/x64 注入式运行时。目标是让常见的 Hook 逻辑尽量写在脚本里，改逻辑不用反复编译 DLL、重启工具链。

在 PolyHook 2 基础上的拓展：

## PolyHook 2 上的运行时扩展

-   原始 PolyHook 2 的核心是 C++ 类接口（Detour、BreakPointHook、IatHook、EatHook、VFuncSwapHook、VTableSwapHook 等）。SigilHook 在这些之上加了一层稳定的 C ABI，全部导出函数用 extern "C" 和 sigilhook\_\* 前缀，用 opaque handle 传递，不把 C++ 类 ABI、STL 容器和异常暴露给调用方。
-   加了真正的可注入输出：编译出 SigilHook.dll，带 DllMain 和独立初始化线程，初始化放在工作线程而不是 loader lock 里。
-   用 AsmJit 重做了运行时回调桥。原来的 ILCallback 只适合简单回调，存在回调内存生命周期、错误处理和线程安全问题，不能直接给脚本用。SigilHook 重写了 JIT 回调，支持参数、返回值、GPR、flags 的可读写。
-   在 PolyHook 的基础上补了调用约定层：cdecl、stdcall、fastcall、thiscall、vectorcall，以及自定义 usercall 映射（argN=<reg|stack+offset>、ret=、x86 cleanup=）。这块是靠 AsmJit 生成汇编桩实现的，x86/x64 共用一套描述语法。
-   补了 mid-hook 语义：shHookMid + shResumeMid，把指令指针重定向到 trampoline，在原函数入口前插入代码再继续执行原函数体。
-   补了通用寄存器、XMM 寄存器、flags 的脚本级读写，包括低 8/16/32 位的部分读写（shReg16 / shSetReg16 等），SP 只读以避免破坏回调返回路径。
-   补了内存读写、内存保护修改、特征码扫描、Zydis 反汇编、CMP/TEST 标志计算、FXSAVE/FXRSTOR、可执行返回和栈指针跳转片段等辅助能力。
-   补了热重载：命名管道 \\.\\pipe\\SigilHook.，配套 SigilHookReload.bat，可按进程或全量触发热重载，不需要重新注入。
-   补了原生 DLL 动态绑定：运行时 LoadLibraryW/GetProcAddress、PE 位数校验、导出缓存、引用计数、逆序 FreeLibrary，还有 header_to_ash.py 把受支持的 C ABI 头文件转成 AngelScript 包装。

在 AngelScript 基础上的拓展：

## AngelScript 绑定与生命周期

-   把整个脚本目录递归编译成一个 SigilHook.Application 模块，所有.as 文件都是这个模块的 section。这样拆文件的.as 之间可以直接互调全局函数、直接读写共享全局变量，不需要 import/export，写起来接近普通 C/C++ 项目。
-   加了.ash 头文件语义：支持 #include "..." 和 #include <...>，相对当前文件和脚本根目录解析，规范化绝对路径做循环检测，同一个头文件在应用内只展开一次，不要求护宏。可选识别并移除 #pragma once。这不是完整的 C 预处理器，#ifndef/#define 之类不支持。
-   严格单入口：只允许根目录 main.as 提供 void main() 和可选 void unload()。缺 main.as、缺 main()、入口写在别的文件、重复入口都会返回 SIGILHOOK_ERROR_SCRIPT 并写明确日志，避免一个目录里的测试脚本被误当成入口。
-   加了 AngelScript 的完整绑定层：核心 Hook、Detour、Breakpoint、IAT/EAT、VFunc/VTable、内存、寄存器、XMM、flags、调用约定、usercall、JIT、脚本入口调用、共享值、日志和错误码，都注册成脚本对象或全局函数。标准头 scripts/SigilHook.ash 是唯一入口，脚本侧看到一个统一 API 面。
-   加了自己的.ash 标准库 scripts/SigilHook.ash：常量、枚举、便捷包装、保留 C ABI 状态的 Sh...Status 版本、寄存器/XMM/flags 读写、内存与扫描、汇编与反汇编、DLL 调用包装等。
-   加了跨模块能力：SigilHook 的应用层是单模块共享全局；AngelScript 原生多模块仍然受保护，跨模块调用需要 import... from "Module" 声明和 BindAllImportedFunctions()，原始全局变量在模块间不共享。两条路径都有测试覆盖。
-   加了运行时生命周期管理：独立工作线程初始化 AngelScript，DllMain 只做最少工作；停止时先拒绝新回调，用 AngelScript 行回调请求活动脚本中止，带超时的 sigilhook_runtime_stop_with_timeout()，无法结束则返回 BUSY 并保持 engine/hooks 存活，避免半初始化状态和悬空跳转。
-   加了脚本异常回传和状态接口：脚本编译错误、Hook 错误、运行日志统一写到 \\SigilHook\\logs\\SigilHook.log，调用方可以通过 shLastError / shStatusString 等拿到错误。
-   原生 AngelScript 代码本身没有大改，主要是构建集成和外围运行时接入；SigilHook 自己的绑定和运行时代码是新增的。

它能做什么：

## 功能清单

-   编译出可注入的 SigilHook.dll，x86/x64 分开构建，只注入同位数进程
-   DLL 同目录下的 SigilHook\\ 目录递归加载.as /.ash，脚本编译成一个 Application 模块
-   只认 main.as 作为入口，其他.as 可以像正常 C/C++ 项目一样拆文件、共享全局函数和全局变量
-   .ash 作为脚本头文件使用，支持 #include、嵌套 include、自动 include-once
-   支持 detour、软件断点、硬件断点、IAT、EAT、VFunc、VTable 等 Hook 类型
-   支持 cdecl / stdcall / fastcall / thiscall / vectorcall，以及自定义 usercall 映射
-   脚本里能读改通用寄存器、flags、XMM0-XMM15，能改参数和返回值
-   支持 callOriginal、skipOriginal、early return、mid-hook
-   支持内存读写、内存保护修改、特征码扫描、Zydis 反汇编
-   自带命名管道热重载，改脚本后可以用 SigilHookReload.bat 触发，不用重新注入
-   提供了 C ABI 和标准头 scripts/SigilHook.ash，C/C++ 侧和脚本侧都能接
-   还带了一个 header_to_ash.py，可以把受支持的 C ABI 头文件转成 AngelScript 包装

一些设计取向：

## 设计取向

-   运行时不暴露 C++ 类 ABI，导出统一是 C ABI + opaque handle
-   地址统一用 uint64_t 传递，兼容 x86/x64
-   x86 和 x64 DLL 分开构建，避免位数不匹配
-   脚本停跑/热重载有超时和 busy 保护，不会直接撕掉正在执行的 Hook 回调

使用它的典型流程大概是：

1.  把 SigilHook.dll 注入目标进程
2.  在 DLL 同目录放 SigilHook\\main.as
3.  main.as 里 include SigilHook.ash
4.  写 Hook、写回调逻辑
5.  改脚本后跑 SigilHookReload.bat 热重载

比较适合的用途：

-   快速试 Hook 逻辑，不想每改一行都重编译
-   需要覆盖多种调用约定，或者目标函数是非标准 usercall
-   想用脚本管理一批地址、函数 Hook 和内存 patch

欢迎使用、报 bug、提 issue。
