---
title: LLVM 全面解析：NDK 为什么离不开它？如何亲手编译调试 clang // CYRUS STUDIO
source: https://cyrus-studio.github.io/blog/posts/llvm-%E5%85%A8%E9%9D%A2%E8%A7%A3%E6%9E%90ndk-%E4%B8%BA%E4%BB%80%E4%B9%88%E7%A6%BB%E4%B8%8D%E5%BC%80%E5%AE%83%E5%A6%82%E4%BD%95%E4%BA%B2%E6%89%8B%E7%BC%96%E8%AF%91%E8%B0%83%E8%AF%95-clang/
source_host: cyrus-studio.github.io
clip_date: 2026-08-04T14:01:38+08:00
trace_id: ed846061-7c82-4964-8ccc-5f4436779157
content_hash: fdf14e46974a16b055283f7f4175b7c71c952074db52d1927949519d96378967
status: synced
tags:
  - 编译工具
  - Android逆向
series: null
feed_source: Cyrus Studio·安卓逆向
ai_summary: NDK 编译工具链的核心是 LLVM/Clang，要在 Windows 上编译出与 NDK 版本一致的 Clang 并调试，需使用指定版本源码、64 位 MSVC 工具链及正确的 CMake 配置。
ai_summary_style: key-points
images_status:
  total: 22
  succeeded: 22
  failed_urls: []
notion_page_id: 3b275244-d011-818e-9058-cc3440cac564
ioc:
  cves: []
  cwes: []
  hashes:
    - d8003a456d14a3deb8054cdaa529ffbf02d9b262
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> NDK 编译工具链的核心是 LLVM/Clang，要在 Windows 上编译出与 NDK 版本一致的 Clang 并调试，需使用指定版本源码、64 位 MSVC 工具链及正确的 CMake 配置。
> 
> - **版本对应关系：** Android NDK 27.1 自带的 clang 版本为 18.0.2，编译调试时应使用对应的 LLVM 18.1.8 源码分支 `llvmorg-18.1.8`。
> - **Windows 编译配置：** 必须使用 “x64 Native Tools Command Prompt for VS” 配置 64 位编译环境，CMake 生成命令需指定 `-G "Ninja"`、`-DCMAKE_BUILD_TYPE=Debug`、`-DLLVM_ENABLE_RTTI=ON` 以启用 RTTI 和异常，并添加 `-DCMAKE_CXX_FLAGS="/utf-8"` 解决 MSVC 编码警告。
> - **编译错误的修复：** 若缺少 `atlbase.h` 需通过 Visual Studio Installer 安装 ATL/MFC 支持；若出现 `LLVM ERROR: out of memory` 则是误用了 32 位环境，必须切换到 64 位工具链后清理构建缓存重试；编译后磁盘占用约 104GB。
> - **导入 CLion 调试：** 以 CMake 项目打开 `clang` 子目录后，需设置 CMake 参数 `-DLLVM_DIR` 指向已构建的 LLVM 目录，并添加 `-DLLVM_INCLUDE_TESTS=OFF` 禁用测试；调试 clang 时须将 CLion 工具链从 MinGW 切换为 Visual Studio 以避免链接错误。

> 版权归作者所有，如有转发，请注明文章出处： [https://cyrus-studio.github.io/blog/](https://cyrus-studio.github.io/blog/)

## 1\. LLVM 简介

LLVM（Low Level Virtual Machine）最初是一个编译器研究项目，如今已发展成一个模块化、可重用的编译器框架。

它包含前端（Frontend）、中间表示（IR, Intermediate Representation）、优化器（Optimizer）和后端（Backend, Code Generator）等组件。

开发者可以使用 LLVM 将高级语言源代码（如 C/C++、Rust、Swift 等）转换成中间表示，再经过优化和代码生成，最终编译为机器码。与传统编译器不同，LLVM 的设计高度模块化，方便扩展、优化和跨平台支持。

相关链接：

-   LLVM 官网： [https://llvm.org/](https://llvm.org/)
    
-   [Getting Started with LLVM Core Libraries（中文版）](https://getting-started-with-llvm-core-libraries-zh-cn.readthedocs.io/zh-cn/latest/)
    
-   LLVM Release 版本下载地址： [https://github.com/llvm/llvm-project/releases](https://github.com/llvm/llvm-project/releases)
    

## 2\. LLVM 与 Android NDK 的关系

在 Android NDK 中，我们通常用 C/C++ 编写性能敏感的模块，最终需要编译为运行在 ARM、ARM64、x86 等架构上的本地机器码。这个过程的核心就是 LLVM/Clang。

整个编译大致可以分为以下几个阶段：

```
C/C++ 源码  
   ↓ (Clang 前端)  
LLVM IR  
   ↓ (LLVM 优化器)  
优化后的 IR  
   ↓ (LLVM 后端 CodeGen)  
汇编 / 机器码  
   ↓ (链接器 lld)  
.so 动态库
```

NDK 中 LLVM/Clang 所在路径

[![word/media/image1.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/f0448869110ad954.png)](data:image/png;base64,inline-125170B)

查看 clang 版本，这里版本是 18.0.2

```swift
(base) PS D:\App\android\sdk\ndk\27.1.12297006\toolchains\llvm\prebuilt\windows-x86_64\bin> ./clang --version

Android (12285214, based on r522817b) clang version 18.0.2 (https://android.googlesource.com/toolchain/llvm-project d8003a456d14a3deb8054cdaa529ffbf02d9b262)
Target: x86_64-w64-windows-gnu
Thread model: posix
InstalledDir: D:/App/android/sdk/ndk/27.1.12297006/toolchains/llvm/prebuilt/windows-x86_64/bin
```

自 Android NDK r18 开始，Google 弃用了 GCC，全面转向使用 LLVM/Clang 作为 NDK 的编译工具链。

**为什么 NDK 要用 LLVM？**

-   跨平台：一次编写，轻松编译成适配多架构的库。
    
-   高性能优化：LLVM 提供强大的优化工具，能在有限硬件环境下榨干性能。
    
-   现代化生态：相比 GCC，LLVM/Clang 更新更快、支持 C++ 标准更完善，也更利于 Android 长期维护。
    

## 3\. 下载 LLVM

LLVM 下载地址： [https://releases.llvm.org/](https://releases.llvm.org/)

 [![word/media/image2.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/1cb27bea7cdfe40e.png)](data:image/png;base64,inline-115794B)选择与 NDK 中 LLVM/Clang 版本相近的下载，比如这里是 ndk 版本 27.1.12297006，clang 版本 18.0.2，所以选择版本相近的 LLVM 18.1.8 。

通过下面命令，把 LLVM 18.1.8 版本源码下载到本地

```bash
git clone --depth 1 --branch llvmorg-18.1.8 https://github.com/llvm/llvm-project.git
```

## 4\. LLVM 项目结构

```python
llvm-project/
├── .clang-tidy                 # Clang-Tidy 配置文件，用于代码静态分析和代码质量检查
├── .gitattributes              # Git 属性配置文件，控制文件的检查、合并和不同平台的换行符设置
├── .git-blame-ignore-revs      # Git blame 忽略特定提交，用于排除格式化提交的影响
├── .gitignore                  # Git 忽略文件配置，定义哪些文件和目录不应纳入版本控制
├── .mailmap                    # Git 邮件映射文件，用于规范化提交者的邮箱地址
├── CODE_OF_CONDUCT.md          # 社区行为规范，规定贡献者的行为守则
├── CONTRIBUTING.md             # 贡献指南，介绍如何为项目做贡献
├── LICENSE.TXT                 # 项目开源许可证，通常为 Apache License 2.0
├── README.md                   # 项目简介和快速入门指南
├── SECURITY.md                 # 安全报告流程，说明如何报告安全漏洞
├── .ci                         # 持续集成相关配置文件
├── .github                     # GitHub 特定文件（如 issue 模板、pull request 模板、CI 配置等）

├── bolt                        # BOLT (Binary Optimization and Layout Tool)，用于对二进制文件进行优化和布局调整
├── clang                       # Clang 编译器前端，支持 C、C++、Objective-C 等语言
├── clang-tools-extra           # Clang 相关的额外工具，如 clang-tidy、clangd、include-fixer 等
├── cmake                       # CMake 模块和工具，辅助构建 LLVM 项目
├── compiler-rt                 # 运行时库，包括 AddressSanitizer、ThreadSanitizer、UBSan 等
├── cross-project-tests         # 跨项目测试，确保各个子项目在一起工作时的兼容性
├── flang                       # Fortran 编译器前端，将 Fortran 代码编译为 LLVM IR
├── libc                        # LLVM 实现的标准 C 库 (libc)，专为高性能场景设计
├── libclc                      # OpenCL C 标准库实现，主要用于 GPU 计算
├── libcxx                      # LLVM 的 C++ 标准库实现（如 `<iostream>`、`<vector>`）
├── libcxxabi                   # C++ ABI 支持库，用于异常处理和 RTTI（运行时类型识别）
├── libunwind                   # 轻量级栈展开库，用于实现异常处理时的栈展开功能
├── lld                         # LLVM 项目的高效链接器，替代 GNU ld
├── lldb                        # LLVM 调试器，类似于 GDB，支持调试 C、C++、Swift 等语言
├── llvm                        # LLVM 核心库，包括 IR 生成、优化和代码生成
├── llvm-libgcc                 # 提供 GCC 兼容的库（如 `__builtin` 函数的实现）
├── mlir                        # 多层次中间表示（MLIR），用于 DSL 和机器学习编译器开发
├── openmp                      # OpenMP 运行时库，支持并行编程
├── polly                       # LLVM 的循环优化器，用于自动并行化和矢量化
├── pstl                        # 并行 STL（C++ 标准模板库）实现，提升算法性能
├── runtimes                    # 各种运行时库的集合（如 libc、libc++、compiler-rt）
├── third-party                 # 第三方依赖库，如 googletest（用于单元测试）
├── utils                       # 辅助工具和脚本（如更新文档、构建脚本等）

├── .arcconfig                  # Phabricator 配置文件，用于项目代码审查
├── .arclint                    # Phabricator Lint 配置文件，用于代码风格检查
├── .clang-format              # Clang-Format 配置文件，用于统一代码风格
```

## 5\. 编译 LLVM

Getting Started with the LLVM System： [https://llvm.org/docs/GettingStarted.html](https://llvm.org/docs/GettingStarted.html)

## 5.1 下载并安装必需的软件

 [![word/media/image3.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/71735881bd19e8ce.png)](data:image/png;base64,inline-153502B)比如，我这里是 Windows 11，先安装 Visual Studio

## 5.2 安装 Python 依赖项

```bash
pip install pygments pyyaml
```

## 5.3 创建构建目录

搜索 **“x64 Native Tools Command Prompt for VS”** （这个工具默认配置 64 位环境）

[![word/media/image4.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/415c4196275ad601.png)](data:image/png;base64,inline-340834B)

创建构建目录

```
cd D:\Projects\llvm-project

mkdir build
```

进入 build 目录，并检测 cmake 和 ninja 是否能正常运行

```rust
**********************************************************************
** Visual Studio 2022 Developer Command Prompt v17.12.0
** Copyright (c) 2022 Microsoft Corporation
**********************************************************************
[vcvarsall.bat] Environment initialized for: 'x64'

D:\App\VisualStudio\IDE>cd D:\Projects\llvm-project\build

D:\Projects\llvm-project\build>cmake --version
cmake version 3.29.5-msvc4

CMake suite maintained and supported by Kitware (kitware.com/cmake).

D:\Projects\llvm-project\build>ninja --version
1.12.1
```

## 5.4 生成编译配置

### 运行 CMake 生成编译配置

```
cmake -G "Ninja" -DCMAKE_BUILD_TYPE=Debug -DCMAKE_CXX_FLAGS="/utf-8" -DLLVM_ENABLE_RTTI=ON -DLLVM_ENABLE_EH=ON -DLLVM_ENABLE_PROJECTS="llvm;clang;lld" ../llvm
```

### 命令参数说明

**1\. CMAKE_BUILD_TYPE（构建类型）**

-   Release: 生成优化后的构建，无断言和调试信息。适合用于发布。
    
-   Debug: 生成未优化的构建，包含断言和调试信息。适合用于调试。
    
-   RelWithDebInfo: 生成优化后的构建，无断言，但包含调试信息。适合需要调试符号但仍然希望性能接近 Release 的情况。
    
-   MinSizeRel: 生成针对最小尺寸优化的构建，而非速度优化。适合用于空间受限的环境。
    

**2\. LLVM_ENABLE_RTTI / LLVM_ENABLE_EH**

RTTI（Runtime Type Information）是运行时类型信息，用于在运行时获取对象的实际类型（如通过 typeid 和 dynamic_cast），主要用于支持多态类型检查和类型安全的类型转换。

启用 RTTI：

-   LLVM_ENABLE_RTTI：启用 RTTI 支持。
    
-   LLVM_ENABLE_EH：启用异常处理支持，许多需要 RTTI 的场景也依赖异常处理。
    

## 5.5 开始编译

执行下面命令开始编译项目

```
ninja
```

编译完成后大概 104GB

[![word/media/image5.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/4cd78e1a9664f588.png)](data:image/png;base64,inline-44962B)

## 5.6 验证编译结果

编译成功后，你可以验证 clang 或其他工具是否已正确生成。

```
D:\Projects\llvm-project\build\bin\clang --version
```

如果能正常输出版本号应该就是编译成功了。

[![word/media/image6.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/ba6cbc72b08048b0.png)](data:image/png;base64,inline-35198B)

## 6\. 解决编译报错

## 6.1 编码警告 (warning C4819)

```swift
[94/3656] Building CXX object lib\Support\CMakeFiles\LLVMSupport.dir\Parallel.cpp.obj
D:\Projects\llvm-project\llvm\lib\Support\Parallel.cpp(1): warning C4819: 该文件包含不能在当前代码页(936)中表示的字符。请将该文件保存为 Unicode 格式以防止数据丢失
[300/3656] Building CXX object lib\BinaryFormat\CMakeFiles\LLVMBinaryFormat.dir\ELF.cpp.obj
D:\Projects\llvm-project\llvm\include\llvm\BinaryFormat\ELFRelocs/LoongArch.def(1): warning C4819: 该文件包含不能在当前代码页(936)中 表示的字符。请将该文件保存为 Unicode 格式以防止数据丢失
[306/3656] Building CXX object lib\BinaryFormat\CMakeFiles\LLVMBinaryFormat.dir\DXContainer.cpp.obj
D:\Projects\llvm-project\llvm\include\llvm/BinaryFormat/DXContainer.h(1): warning C4819: 该文件包含不能在当前代码页(936)中表示的字符 。请将该文件保存为 Unicode 格式以防止数据丢失
[347/3656] Building CXX object lib\IR\CMakeFiles\LLVMCore.dir\DebugInfo.cpp.obj
D:\Projects\llvm-project\llvm\lib\IR\DebugInfo.cpp(1504): warning C4819: 该文件包含不能在当前代码页(936)中表示的字符。请将该文件保存 为 Unicode 格式以防止数据丢失
[396/3656] Building CXX object lib\MC\CMakeFiles\LLVMMC.dir\DXContainerPSVInfo.cpp.obj
D:\Projects\llvm-project\llvm\include\llvm/BinaryFormat/DXContainer.h(1): warning C4819: 该文件包含不能在当前代码页(936)中表示的字符 。请将该文件保存为 Unicode 格式以防止数据丢失
[404/3656] Building CXX object lib\MC\CMakeFiles\LLVMMC.dir\MCAsmBackend.cpp.obj
D:\Projects\llvm-project\llvm\include\llvm\BinaryFormat\ELFRelocs/LoongArch.def(1): warning C4819: 该文件包含不能在当前代码页(936)中 表示的字符。请将该文件保存为 Unicode 格式以防止数据丢失
[411/3656] Building CXX object lib\MC\CMakeFiles\LLVMMC.dir\ELFObjectWriter.cpp.obj
D:\Projects\llvm-project\llvm\include\llvm\BinaryFormat\ELFRelocs/LoongArch.def(1): warning C4819: 该文件包含不能在当前代码页(936)中 表示的字符。请将该文件保存为 Unicode 格式以防止数据丢失
[415/3656] Building CXX object lib\MC\CMakeFiles\LLVMMC.dir\MCAsmInfoELF.cpp.obj
D:\Projects\llvm-project\llvm\include\llvm\BinaryFormat\ELFRelocs/LoongArch.def(1): warning C4819: 该文件包含不能在当前代码页(936)中 表示的字符。请将该文件保存为 Unicode 格式以防止数据丢失
[418/3656] Building CXX object lib\MC\CMakeFiles\LLVMMC.dir\MCELFObjectTargetWriter.cpp.obj
D:\Projects\llvm-project\llvm\include\llvm\BinaryFormat\ELFRelocs/LoongArch.def(1): warning C4819: 该文件包含不能在当前代码页(936)中 表示的字符。请将该文件保存为 Unicode 格式以防止数据丢失
[424/3656] Building CXX object lib\MC\CMakeFiles\LLVMMC.dir\MCDXContainerWriter.cpp.obj
D:\Projects\llvm-project\llvm\include\llvm/BinaryFormat/DXContainer.h(1): warning C4819: 该文件包含不能在当前代码页(936)中表示的字符 。请将该文件保存为 Unicode 格式以防止数据丢失
[427/3656] Building CXX object lib\MC\CMakeFiles\LLVMMC.dir\MCContext.cpp.obj
D:\Projects\llvm-project\llvm\include\llvm\BinaryFormat\ELFRelocs/LoongArch.def(1): warning C4819: 该文件包含不能在当前代码页(936)中 表示的字符。请将该文件保存为 Unicode 格式以防止数据丢失
[428/3656] Building CXX object lib\MC\CMakeFiles\LLVMMC.dir\MCELFStreamer.cpp.obj
D:\Projects\llvm-project\llvm\include\llvm\BinaryFormat\ELFRelocs/LoongArch.def(1): warning C4819: 该文件包含不能在当前代码页(936)中 表示的字符。请将该文件保存为 Unicode 格式以防止数据丢失
[445/3656] Building CXX object lib\MC\CMakeFiles\LLVMMC.dir\MCSectionELF.cpp.obj
D:\Projects\llvm-project\llvm\include\llvm\BinaryFormat\ELFRelocs/LoongArch.def(1): warning C4819: 该文件包含不能在当前代码页(936)中 表示的字符。请将该文件保存为 Unicode 格式以防止数据丢失
[447/3656] Building CXX object lib\MC\CMakeFiles\LLVMMC.dir\MCObjectFileInfo.cpp.obj
D:\Projects\llvm-project\llvm\include\llvm\BinaryFormat\ELFRelocs/LoongArch.def(1): warning C4819: 该文件包含不能在当前代码页(936)中 表示的字符。请将该文件保存为 Unicode 格式以防止数据丢失
[454/3656] Building CXX object lib\MC\CMakeFiles\LLVMMC.dir\MCSymbolELF.cpp.obj
D:\Projects\llvm-project\llvm\include\llvm\BinaryFormat\ELFRelocs/LoongArch.def(1): warning C4819: 该文件包含不能在当前代码页(936)中 表示的字符。请将该文件保存为 Unicode 格式以防止数据丢失
[488/3656] Building CXX object lib\MC\MCParser\CMakeFiles\LLVMMCParser.dir\ELFAsmParser.cpp.obj
D:\Projects\llvm-project\llvm\include\llvm\BinaryFormat\ELFRelocs/LoongArch.def(1): warning C4819: 该文件包含不能在当前代码页(936)中 表示的字符。请将该文件保存为 Unicode 格式以防止数据丢失
[519/3656] Building CXX object lib\Object\CMakeFiles\LLVMObject.dir\Decompressor.cpp.obj
D:\Projects\llvm-project\llvm\include\llvm\BinaryFormat\ELFRelocs/LoongArch.def(1): warning C4819: 该文件包含不能在当前代码页(936)中 表示的字符。请将该文件保存为 Unicode 格式以防止数据丢失
[522/3656] Building CXX object lib\Object\CMakeFiles\LLVMObject.dir\DXContainer.cpp.obj
D:\Projects\llvm-project\llvm\include\llvm/BinaryFormat/DXContainer.h(1): warning C4819: 该文件包含不能在当前代码页(936)中表示的字符 。请将该文件保存为 Unicode 格式以防止数据丢失
D:\Projects\llvm-project\llvm\lib\Object\DXContainer.cpp(344): warning C4018: “<”: 有符号/无符号不匹配
[526/3656] Building CXX object lib\Object\CMakeFiles\LLVMObject.dir\BuildID.cpp.obj
D:\Projects\llvm-project\llvm\include\llvm\BinaryFormat\ELFRelocs/LoongArch.def(1): warning C4819: 该文件包含不能在当前代码页(936)中 表示的字符。请将该文件保存为 Unicode 格式以防止数据丢失
[533/3656] Building CXX object lib\Object\CMakeFiles\LLVMObject.dir\ELF.cpp.obj
D:\Projects\llvm-project\llvm\include\llvm\BinaryFormat\ELFRelocs/LoongArch.def(1): warning C4819: 该文件包含不能在当前代码页(936)中 表示的字符。请将该文件保存为 Unicode 格式以防止数据丢失
D:\Projects\llvm-project\llvm\include\llvm/BinaryFormat/ELFRelocs/LoongArch.def(1): warning C4819: 该文件包含不能在当前代码页(936)中 表示的字符。请将该文件保存为 Unicode 格式以防止数据丢失
[535/3656] Building CXX object lib\Object\CMakeFiles\LLVMObject.dir\ELFObjectFile.cpp.obj
D:\Projects\llvm-project\llvm\include\llvm\BinaryFormat\ELFRelocs/LoongArch.def(1): warning C4819: 该文件包含不能在当前代码页(936)中 表示的字符。请将该文件保存为 Unicode 格式以防止数据丢失
[543/3656] Building CXX object lib\Object\CMakeFiles\LLVMObject.dir\RelocationResolver.cpp.obj
D:\Projects\llvm-project\llvm\include\llvm\BinaryFormat\ELFRelocs/LoongArch.def(1): warning C4819: 该文件包含不能在当前代码页(936)中 表示的字符。请将该文件保存为 Unicode 格式以防止数据丢失
[546/3656] Building CXX object lib\Object\CMakeFiles\LLVMObject.dir\SymbolSize.cpp.obj
D:\Projects\llvm-project\llvm\include\llvm\BinaryFormat\ELFRelocs/LoongArch.def(1): warning C4819: 该文件包含不能在当前代码页(936)中 表示的字符。请将该文件保存为 Unicode 格式以防止数据丢失
[548/3656] Building CXX object lib\Object\CMakeFiles\LLVMObject.dir\OffloadBinary.cpp.obj
D:\Projects\llvm-project\llvm\include\llvm\BinaryFormat\ELFRelocs/LoongArch.def(1): warning C4819: 该文件包含不能在当前代码页(936)中 表示的字符。请将该文件保存为 Unicode 格式以防止数据丢失
[579/3656] Building CXX object lib\DebugInfo\PDB\CMakeFiles\LLVMDebugInfoPDB.dir\PDB.cpp.obj
FAILED: lib/DebugInfo/PDB/CMakeFiles/LLVMDebugInfoPDB.dir/PDB.cpp.obj
D:\App\VisualStudio\IDE\VC\Tools\MSVC\14.42.34433\bin\Hostx86\x86\cl.exe  /nologo /TP -DGTEST_HAS_RTTI=0 -DUNICODE -D_CRT_NONSTDC_NO_DEPRECATE -D_CRT_NONSTDC_NO_WARNINGS -D_CRT_SECURE_NO_DEPRECATE -D_CRT_SECURE_NO_WARNINGS -D_FILE_OFFSET_BITS=64 -D_HAS_EXCEPTIONS=0 -D_LARGEFILE_SOURCE -D_SCL_SECURE_NO_DEPRECATE -D_SCL_SECURE_NO_WARNINGS -D_UNICODE -D__STDC_CONSTANT_MACROS -D__STDC_FORMAT_MACROS -D__STDC_LIMIT_MACROS -ID:\Projects\llvm-project\build\lib\DebugInfo\PDB -ID:\Projects\llvm-project\llvm\lib\DebugInfo\PDB -ID:\Projects\llvm-project\build\include -ID:\Projects\llvm-project\llvm\include -external:I"D:\App\VisualStudio\IDE\DIA SDK\include" -external:W0 /Zc:inline /Zc:preprocessor /Zc:__cplusplus /Oi /bigobj /permissive- /W4 -wd4141 -wd4146 -wd4244 -wd4267 -wd4291 -wd4351 -wd4456 -wd4457 -wd4458 -wd4459 -wd4503 -wd4624 -wd4722 -wd4100 -wd4127 -wd4512 -wd4505 -wd4610 -wd4510 -wd4702 -wd4245 -wd4706 -wd4310 -wd4701 -wd4703 -wd4389 -wd4611 -wd4805 -wd4204 -wd4577 -wd4091 -wd4592 -wd4319 -wd4709 -wd5105 -wd4324 -w14062 -we4238 -std:c++17 -MDd  /EHs-c- /GR- /showIncludes /Folib\DebugInfo\PDB\CMakeFiles\LLVMDebugInfoPDB.dir\PDB.cpp.obj /Fdlib\DebugInfo\PDB\CMakeFiles\LLVMDebugInfoPDB.dir\LLVMDebugInfoPDB.pdb /FS -c D:\Projects\llvm-project\llvm\lib\DebugInfo\PDB\PDB.cpp
```

这些警告表明某些源文件包含在当前代码页（936，即简体中文 GBK 编码）中无法表示的字符。

可以通过设置编译器选项 -DCMAKE_CXX_FLAGS="/utf-8" 来避免这些编码问题。

```
cmake -G "Ninja" -DCMAKE_BUILD_TYPE=Debug -DCMAKE_CXX_FLAGS="/utf-8" ../llvm
```

这将告诉 MSVC 编译器以 UTF-8 编码处理所有源文件。

## 6\. 2 缺少 atlbase.h 头文件 (fatal error C1083)

```
D:\Projects\llvm-project\llvm\include\llvm\DebugInfo\PDB\DIA\DIASupport.h(25): fatal error C1083: 无法打开包括文件: “atlbase.h”: No such file or directory
[592/3656] Building CXX object lib\DebugInfo\DWARF\CMakeFiles\LLVMDebugInfoDWARF.dir\DWARFVerifier.cpp.obj
D:\Projects\llvm-project\llvm\lib\DebugInfo\DWARF\DWARFVerifier.cpp(1513): warning C4819: 该文件包含不能在当前代码页(936)中表示的字符。请将该文件保存为 Unicode 格式以防止数据丢失
ninja: build stopped: subcommand failed.
```

错误信息提示 atlbase.h 头文件无法找到，这通常是因为未安装 **ATL/MFC 支持**。这是 Visual Studio 的可选组件，默认情况下可能未安装。

解决方法：

1.  打开 Visual Studio Installer
    
2.  修改 Visual Studio 安装
    
3.  添加 ATL/MFC 支持
    

[![word/media/image7.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/ebfe2155ca12bbed.png)](data:image/png;base64,inline-358078B)

安装完成后，再次运行 ninja 重新编译

## 6.3 LLVM ERROR: out of memory

```bash
[1/281] Building RISCVGenDAGISel.inc...
FAILED: lib/Target/RISCV/RISCVGenDAGISel.inc D:/Projects/llvm-project/build/lib/Target/RISCV/RISCVGenDAGISel.inc
C:\Windows\system32\cmd.exe /C "cd /D D:\Projects\llvm-project\build && D:\Projects\llvm-project\build\bin\llvm-tblgen.exe -gen-dag-isel -I D:/Projects/llvm-project/llvm/lib/Target/RISCV -ID:/Projects/llvm-project/build/include -ID:/Projects/llvm-project/llvm/include -I D:/Projects/llvm-project/llvm/lib/Target --long-string-literals=0 D:/Projects/llvm-project/llvm/lib/Target/RISCV/RISCV.td --write-if-changed -o lib/Target/RISCV/RISCVGenDAGISel.inc -d lib/Target/RISCV/RISCVGenDAGISel.inc.d"
LLVM ERROR: out of memory
Allocation failed
PLEASE submit a bug report to https://github.com/llvm/llvm-project/issues/ and include the crash backtrace.
Stack dump:
0.      Program arguments: D:\\Projects\\llvm-project\\build\\bin\\llvm-tblgen.exe -gen-dag-isel -I D:/Projects/llvm-project/llvm/lib/Target/RISCV -ID:/Projects/llvm-project/build/include -ID:/Projects/llvm-project/llvm/include -I D:/Projects/llvm-project/llvm/lib/Target --long-string-literals=0 D:/Projects/llvm-project/llvm/lib/Target/RISCV/RISCV.td --write-if-changed -o lib/Target/RISCV/RISCVGenDAGISel.inc -d lib/Target/RISCV/RISCVGenDAGISel.inc.d
Exception Code: 0x80000003
 #0 0x0104f4e9 (D:\Projects\llvm-project\build\bin\llvm-tblgen.exe+0x2af4e9)
 #1 0x6a4528b4 (C:\Windows\SYSTEM32\ucrtbased.dll+0xc28b4)
 #2 0x6a453ed2 (C:\Windows\SYSTEM32\ucrtbased.dll+0xc3ed2)
 #3 0x010075ca (D:\Projects\llvm-project\build\bin\llvm-tblgen.exe+0x2675ca)
 #4 0x01007e3f (D:\Projects\llvm-project\build\bin\llvm-tblgen.exe+0x267e3f)
 #5 0x6a566608 (C:\Windows\SYSTEM32\MSVCP140D.dll+0x26608)
 #6 0x6a43fb72 (C:\Windows\SYSTEM32\ucrtbased.dll+0xafb72)
 #7 0x01112357 (D:\Projects\llvm-project\build\bin\llvm-tblgen.exe+0x372357)
 #8 0x00db004c (D:\Projects\llvm-project\build\bin\llvm-tblgen.exe+0x1004c)
 #9 0x00daa176 (D:\Projects\llvm-project\build\bin\llvm-tblgen.exe+0xa176)
#10 0x00daa06f (D:\Projects\llvm-project\build\bin\llvm-tblgen.exe+0xa06f)
#11 0x00db0e69 (D:\Projects\llvm-project\build\bin\llvm-tblgen.exe+0x10e69)
#12 0x00daa0a1 (D:\Projects\llvm-project\build\bin\llvm-tblgen.exe+0xa0a1)
#13 0x00daa135 (D:\Projects\llvm-project\build\bin\llvm-tblgen.exe+0xa135)
#14 0x00dac0c7 (D:\Projects\llvm-project\build\bin\llvm-tblgen.exe+0xc0c7)
#15 0x00db103b (D:\Projects\llvm-project\build\bin\llvm-tblgen.exe+0x1103b)
#16 0x0102c922 (D:\Projects\llvm-project\build\bin\llvm-tblgen.exe+0x28c922)
#17 0x01009a87 (D:\Projects\llvm-project\build\bin\llvm-tblgen.exe+0x269a87)
#18 0x01008d00 (D:\Projects\llvm-project\build\bin\llvm-tblgen.exe+0x268d00)
#19 0x00da66da (D:\Projects\llvm-project\build\bin\llvm-tblgen.exe+0x66da)
#20 0x00da6694 (D:\Projects\llvm-project\build\bin\llvm-tblgen.exe+0x6694)
#21 0x00eba51f (D:\Projects\llvm-project\build\bin\llvm-tblgen.exe+0x11a51f)
#22 0x00eb90b8 (D:\Projects\llvm-project\build\bin\llvm-tblgen.exe+0x1190b8)
#23 0x00ebb1d4 (D:\Projects\llvm-project\build\bin\llvm-tblgen.exe+0x11b1d4)
#24 0x00eb90b8 (D:\Projects\llvm-project\build\bin\llvm-tblgen.exe+0x1190b8)
#25 0x00eba414 (D:\Projects\llvm-project\build\bin\llvm-tblgen.exe+0x11a414)
#26 0x00eb90b8 (D:\Projects\llvm-project\build\bin\llvm-tblgen.exe+0x1190b8)
#27 0x00ebb1d4 (D:\Projects\llvm-project\build\bin\llvm-tblgen.exe+0x11b1d4)
#28 0x00eb90b8 (D:\Projects\llvm-project\build\bin\llvm-tblgen.exe+0x1190b8)
#29 0x00eb87ca (D:\Projects\llvm-project\build\bin\llvm-tblgen.exe+0x1187ca)
#30 0x00eb65a0 (D:\Projects\llvm-project\build\bin\llvm-tblgen.exe+0x1165a0)
#31 0x00eb6a07 (D:\Projects\llvm-project\build\bin\llvm-tblgen.exe+0x116a07)
#32 0x010e06a8 (D:\Projects\llvm-project\build\bin\llvm-tblgen.exe+0x3406a8)
#33 0x00fe7d1a (D:\Projects\llvm-project\build\bin\llvm-tblgen.exe+0x247d1a)
#34 0x01113143 (D:\Projects\llvm-project\build\bin\llvm-tblgen.exe+0x373143)
#35 0x0111304a (D:\Projects\llvm-project\build\bin\llvm-tblgen.exe+0x37304a)
#36 0x01112eed (D:\Projects\llvm-project\build\bin\llvm-tblgen.exe+0x372eed)
#37 0x011131a8 (D:\Projects\llvm-project\build\bin\llvm-tblgen.exe+0x3731a8)
#38 0x77507ba9 (C:\Windows\System32\KERNEL32.DLL+0x17ba9)
#39 0x77dac0cb (C:\Windows\SYSTEM32\ntdll.dll+0x6c0cb)
#40 0x77dac04f (C:\Windows\SYSTEM32\ntdll.dll+0x6c04f)
ninja: build stopped: subcommand failed.
```

如果你使用的是 32 位编译环境（工具链或 llvm-tblgen.exe），它可能受到 2GB 内存使用限制。

通过下面命令验证是否生成 64 位可执行文件

```
D:\Projects\llvm-project\build>dumpbin /headers D:\Projects\llvm-project\build\bin\llvm-tblgen.exe | findstr machine
             14C machine (x86)
                   32 bit word machine
```

如果不是，搜索 **“x64 Native Tools Command Prompt for VS”** （这个工具默认配置 64 位环境）

[![word/media/image8.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/9be307649083da22.png)](data:image/png;base64,inline-329890B)

验证当前编译器配置，输出中应包含 x64，表示 64 位环境已成功配置。

```rust
**********************************************************************
** Visual Studio 2022 Developer Command Prompt v17.12.0
** Copyright (c) 2022 Microsoft Corporation
**********************************************************************
[vcvarsall.bat] Environment initialized for: 'x64'

D:\App\VisualStudio\IDE>cl
用于 x64 的 Microsoft (R) C/C++ 优化编译器 19.42.34433 版
版权所有(C) Microsoft Corporation。保留所有权利。

用法: cl [ 选项... ] 文件名... [ /link 链接选项... ]

D:\Projects\llvm-project\build>where cl.exe
D:\App\VisualStudio\IDE\VC\Tools\MSVC\14.42.34433\bin\Hostx64\x64\cl.exe
```

清理之前的缓存，重新生成构建目录

```
rmdir /s /q build

mkdir build

cd build
```

最后，重新生成配置和编译。

## 6.4 LNK1104: 无法打开文件“tools\\llvm-nm\\CMakeFiles\\llvm-nm.dir/intermediate.manifest”

```swift
[3117/3660] Linking CXX executable bin\llvm-nm.exe
FAILED: bin/llvm-nm.exe
C:\Windows\system32\cmd.exe /C "cd . && D:\App\VisualStudio\IDE\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe -E vs_link_exe --intdir=tools\llvm-nm\CMakeFiles\llvm-nm.dir --rc=C:\PROGRA~2\WI3CF2~1\10\bin\100226~1.0\x64\rc.exe --mt=C:\PROGRA~2\WI3CF2~1\10\bin\100226~1.0\x64\mt.exe --manifests  -- D:\App\VisualStudio\IDE\VC\Tools\MSVC\14.42.34433\bin\Hostx64\x64\link.exe /nologo @CMakeFiles\llvm-nm.rsp  /out:bin\llvm-nm.exe /implib:lib\llvm-nm.lib /pdb:bin\llvm-nm.pdb /version:0.0 /machine:x64 /STACK:10000000 /debug /INCREMENTAL /subsystem:console && cd ."
FINAL LINK: command "D:\App\VisualStudio\IDE\VC\Tools\MSVC\14.42.34433\bin\Hostx64\x64\link.exe /nologo @CMakeFiles\llvm-nm.rsp /out:bin\llvm-nm.exe /implib:lib\llvm-nm.lib /pdb:bin\llvm-nm.pdb /version:0.0 /machine:x64 /STACK:10000000 /debug /INCREMENTAL /subsystem:console /MANIFEST /MANIFESTFILE:tools\llvm-nm\CMakeFiles\llvm-nm.dir/intermediate.manifest tools\llvm-nm\CMakeFiles\llvm-nm.dir/manifest.res" failed (exit code 1104) with the following output:
LINK : fatal error LNK1104: 无法打开文件“tools\llvm-nm\CMakeFiles\llvm-nm.dir/intermediate.manifest”
[3130/3660] Building CXX object tools\llvm-exegesis\lib\CMakeFiles\LLVMExegesis.dir\UopsBenchmarkRunner.cpp.obj
ninja: build stopped: subcommand failed.
```

查看 tools\\llvm-nm\\CMakeFiles\\llvm-nm.dir/intermediate.manifest 文件是存在的而且也能正常打开，重新执行 ninja 命令再编译一遍试试。

[![word/media/image9.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/82fdc060d5d70b98.png)](data:image/png;base64,inline-86710B)

接下来报错 LNK1104: 无法打开文件“bin\\llvm-rc.exe”

```swift
[297/531] Linking CXX executable bin\llvm-rc.exe
FAILED: bin/llvm-rc.exe
C:\Windows\system32\cmd.exe /C "cd . && D:\App\VisualStudio\IDE\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe -E vs_link_exe --intdir=tools\llvm-rc\CMakeFiles\llvm-rc.dir --rc=C:\PROGRA~2\WI3CF2~1\10\bin\100226~1.0\x64\rc.exe --mt=C:\PROGRA~2\WI3CF2~1\10\bin\100226~1.0\x64\mt.exe --manifests  -- D:\App\VisualStudio\IDE\VC\Tools\MSVC\14.42.34433\bin\Hostx64\x64\link.exe /nologo tools\llvm-rc\CMakeFiles\llvm-rc.dir\llvm-rc.cpp.obj tools\llvm-rc\CMakeFiles\llvm-rc.dir\ResourceFileWriter.cpp.obj tools\llvm-rc\CMakeFiles\llvm-rc.dir\ResourceScriptCppFilter.cpp.obj tools\llvm-rc\CMakeFiles\llvm-rc.dir\ResourceScriptParser.cpp.obj tools\llvm-rc\CMakeFiles\llvm-rc.dir\ResourceScriptStmt.cpp.obj tools\llvm-rc\CMakeFiles\llvm-rc.dir\ResourceScriptToken.cpp.obj tools\llvm-rc\CMakeFiles\llvm-rc.dir\llvm-rc-driver.cpp.obj tools\llvm-rc\CMakeFiles\llvm-rc.dir\__\__\resources\windows_version_resource.rc.res  /out:bin\llvm-rc.exe /implib:lib\llvm-rc.lib /pdb:bin\llvm-rc.pdb /version:0.0 /machine:x64 /STACK:10000000 /debug /INCREMENTAL /subsystem:console  lib\LLVMObject.lib  lib\LLVMOption.lib  lib\LLVMSupport.lib  lib\LLVMTargetParser.lib  lib\LLVMIRReader.lib  lib\LLVMBitReader.lib  lib\LLVMAsmParser.lib  lib\LLVMCore.lib  lib\LLVMRemarks.lib  lib\LLVMBitstreamReader.lib  lib\LLVMMCParser.lib  lib\LLVMMC.lib  lib\LLVMDebugInfoCodeView.lib  lib\LLVMTextAPI.lib  lib\LLVMBinaryFormat.lib  lib\LLVMTargetParser.lib  lib\LLVMSupport.lib  psapi.lib  shell32.lib  ole32.lib  uuid.lib  advapi32.lib  ws2_32.lib  delayimp.lib  -delayload:shell32.dll  -delayload:ole32.dll  lib\LLVMDemangle.lib  kernel32.lib user32.lib gdi32.lib winspool.lib shell32.lib ole32.lib oleaut32.lib uuid.lib comdlg32.lib advapi32.lib && cd ."
FINAL LINK: command "D:\App\VisualStudio\IDE\VC\Tools\MSVC\14.42.34433\bin\Hostx64\x64\link.exe /nologo tools\llvm-rc\CMakeFiles\llvm-rc.dir\llvm-rc.cpp.obj tools\llvm-rc\CMakeFiles\llvm-rc.dir\ResourceFileWriter.cpp.obj tools\llvm-rc\CMakeFiles\llvm-rc.dir\ResourceScriptCppFilter.cpp.obj tools\llvm-rc\CMakeFiles\llvm-rc.dir\ResourceScriptParser.cpp.obj tools\llvm-rc\CMakeFiles\llvm-rc.dir\ResourceScriptStmt.cpp.obj tools\llvm-rc\CMakeFiles\llvm-rc.dir\ResourceScriptToken.cpp.obj tools\llvm-rc\CMakeFiles\llvm-rc.dir\llvm-rc-driver.cpp.obj tools\llvm-rc\CMakeFiles\llvm-rc.dir\__\__\resources\windows_version_resource.rc.res /out:bin\llvm-rc.exe /implib:lib\llvm-rc.lib /pdb:bin\llvm-rc.pdb /version:0.0 /machine:x64 /STACK:10000000 /debug /INCREMENTAL /subsystem:console lib\LLVMObject.lib lib\LLVMOption.lib lib\LLVMSupport.lib lib\LLVMTargetParser.lib lib\LLVMIRReader.lib lib\LLVMBitReader.lib lib\LLVMAsmParser.lib lib\LLVMCore.lib lib\LLVMRemarks.lib lib\LLVMBitstreamReader.lib lib\LLVMMCParser.lib lib\LLVMMC.lib lib\LLVMDebugInfoCodeView.lib lib\LLVMTextAPI.lib lib\LLVMBinaryFormat.lib lib\LLVMTargetParser.lib lib\LLVMSupport.lib psapi.lib shell32.lib ole32.lib uuid.lib advapi32.lib ws2_32.lib delayimp.lib -delayload:shell32.dll -delayload:ole32.dll lib\LLVMDemangle.lib kernel32.lib user32.lib gdi32.lib winspool.lib shell32.lib ole32.lib oleaut32.lib uuid.lib comdlg32.lib advapi32.lib /MANIFEST /MANIFESTFILE:tools\llvm-rc\CMakeFiles\llvm-rc.dir/intermediate.manifest tools\llvm-rc\CMakeFiles\llvm-rc.dir/manifest.res" failed (exit code 1104) with the following output:
LINK : fatal error LNK1104: 无法打开文件“bin\llvm-rc.exe”
[310/531] Generating export list for LLVM-C
ninja: build stopped: subcommand failed.
```

再次执行 ninja 命令编译，接下来的 LNK1104 报错同理。

[![word/media/image10.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/6398936300c88a6a.png)](data:image/png;base64,inline-176894B)

## 7\. 使用 clang 编译 C 代码

执行下面命令把 bin 目录配置到环境变量

```
set PATH=%PATH%;D:\Projects\llvm-project\build\bin
```

编写 hello.c 源码

```cpp
#include <stdio.h>

int main() {
    printf("Hello, World!\n");
    return 0;
}
```

执行下面命令把 hello.c 编译成可执行程序

```
clang hello.c -o hello.exe
```

执行 hello.exe

[![word/media/image11.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/3f3a320c23e7454c.png)](data:image/png;base64,inline-15758B)

## 8\. 使用 CLion 调试 clang

## 8.1 导入项目

使用 CLion 打开 llvm-project\\clang\\CMakeLists.txt

[![word/media/image12.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/b0eea652a6094899.png)](data:image/png;base64,inline-55338B)

作为项目打开

[![word/media/image13.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/0ab359ff61e6117e.png)](data:image/png;base64,inline-19526B)

## 8.2 设置 LLVM_DIR

执行 CMake 报错如下

```swift
CMake Error at CMakeLists.txt:31 (find_package):
  Could not find a package configuration file provided by "LLVM" with any of
  the following names:

    LLVMConfig.cmake
    llvm-config.cmake

  Add the installation prefix of "LLVM" to CMAKE_PREFIX_PATH or set
  "LLVM_DIR" to a directory containing one of the above files.  If "LLVM"
  provides a separate development package or SDK, be sure it has been
  installed.


-- Configuring incomplete, errors occurred!
```

这因为 Clang 依赖于已构建的 LLVM 库。如果你之前已经成功构建了 LLVM，你需要告知 CMake 该文件的位置。

打开 CMake 设置，在 CMake Options 字段中，添加以下配置

```
-DLLVM_DIR="D:/Projects/llvm-project/build/lib/cmake/llvm"
```

或者

```
-DCMAKE_PREFIX_PATH="D:/Projects/llvm-project/build"
```

这会告知 CMake 在构建项目时去哪里寻找 LLVM 库。

点击应用，重新执行 cmake

[![word/media/image14.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/f66f45f1b1e78adb.png)](data:image/png;base64,inline-201430B)

## 8.3 禁用 llvm-gtest

接着报错如下

```
CMake Error at CMakeLists.txt:117 (message):
  llvm-gtest not found.  Please install llvm-gtest or disable tests with
  -DLLVM_INCLUDE_TESTS=OFF


-- Configuring incomplete, errors occurred!
```

这个错误表明 CMake 在配置 LLVM 项目时找不到 llvm-gtest，因此无法继续。

不需要运行测试，可以通过设置 LLVM_INCLUDE_TESTS=OFF 来跳过测试模块。

```
-DLLVM_INCLUDE_TESTS=OFF
```

在 CMake Options 字段中，添加禁用测试选项

[![word/media/image15.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/0aebf76c86aab8ab.png)](data:image/png;base64,inline-166290B)

cmake 执行成功后，可以看到 clang 项目所有的运行/调试配置

[![word/media/image16.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/980da5a277b5b4fa.png)](data:image/png;base64,inline-215446B)

## 8.4 配置调试信息

编辑 clang 调试配置

[![word/media/image17.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/f16bccfb5b7a99b2.png)](data:image/png;base64,inline-103410B)

添加 Program arguments，比如

```
"D:\Projects\llvm-project\build\hello.c" -o "D:\Projects\llvm-project\build\hello.exe"
```

找到 main 函数（clang/tools/driver/driver.cpp），并下断点

[![word/media/image18.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/6d3bf4fbb4f338e4.png)](data:image/png;base64,inline-311046B)

## 8.5 切换 Visual Studio 工具链

运行调试 clang，但是报错如下

```rust
D:/Projects/llvm-project/llvm/include/llvm/ADT/SmallVector.h:304: undefined reference to `llvm::SmallVectorBase<unsigned int>::size() const'
D:\App\CLion 2024.2.3\bin\mingw\bin/ld.exe: utils/TableGen/CMakeFiles/clang-tblgen.dir/TableGen.cpp.obj: in function `void llvm::cl::generic_parser_base::printOptionDiff<llvm::cl::OptionValue<ActionType> >(llvm::cl::Option const&, llvm::cl::OptionValue<ActionType> const&, llvm::cl::OptionValue<ActionType> const&, unsigned long long) const':
D:/Projects/llvm-project/llvm/include/llvm/Support/CommandLine.h:783: undefined reference to `llvm::cl::generic_parser_base::printGenericOptionDiff(llvm::cl::Option const&, llvm::cl::GenericOptionValue const&, llvm::cl::GenericOptionValue const&, unsigned long long) const'
D:\App\CLion 2024.2.3\bin\mingw\bin/ld.exe: utils/TableGen/CMakeFiles/clang-tblgen.dir/TableGen.cpp.obj:TableGen.cpp:(.rdata$.refptr._ZTVN4llvm2cl3optINSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEELb0ENS0_6parserIS7_EEEE[.refptr._ZTVN4llvm2cl3optINSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEELb0ENS0_6parserIS7_EEEE]+0x0): undefined reference to `vtable for llvm::cl::opt<std::__cxx11::basic_string<char, std::char_traits<char>, std::allocator<char> >, false, llvm::cl::parser<std::__cxx11::basic_string<char, std::char_traits<char>, std::allocator<char> > > >'
D:\App\CLion 2024.2.3\bin\mingw\bin/ld.exe: utils/TableGen/CMakeFiles/clang-tblgen.dir/TableGen.cpp.obj:TableGen.cpp:(.rdata$.refptr._ZTVN4llvm2cl11OptionValueINSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEEEE[.refptr._ZTVN4llvm2cl11OptionValueINSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEEEE]+0x0): undefined reference to `vtable for llvm::cl::OptionValue<std::__cxx11::basic_string<char, std::char_traits<char>, std::allocator<char> > >'
D:\App\CLion 2024.2.3\bin\mingw\bin/ld.exe: utils/TableGen/CMakeFiles/clang-tblgen.dir/TableGen.cpp.obj:TableGen.cpp:(.rdata$.refptr._ZTVN4llvm23PrettyStackTraceProgramE[.refptr._ZTVN4llvm23PrettyStackTraceProgramE]+0x0): undefined reference to `vtable for llvm::PrettyStackTraceProgram'
D:\App\CLion 2024.2.3\bin\mingw\bin/ld.exe: utils/TableGen/CMakeFiles/clang-tblgen.dir/TableGen.cpp.obj:TableGen.cpp:(.rdata$.refptr._ZTVN4llvm2cl6parserINSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEEEE[.refptr._ZTVN4llvm2cl6parserINSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEEEE]+0x0): undefined reference to `vtable for llvm::cl::parser<std::__cxx11::basic_string<char, std::char_traits<char>, std::allocator<char> > >'
D:\App\CLion 2024.2.3\bin\mingw\bin/ld.exe: utils/TableGen/CMakeFiles/clang-tblgen.dir/TableGen.cpp.obj:TableGen.cpp:(.rdata$.refptr._ZTVN4llvm2cl12basic_parserINSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEEEE[.refptr._ZTVN4llvm2cl12basic_parserINSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEEEE]+0x0): undefined reference to `vtable for llvm::cl::basic_parser<std::__cxx11::basic_string<char, std::char_traits<char>, std::allocator<char> > >'
D:\App\CLion 2024.2.3\bin\mingw\bin/ld.exe: utils/TableGen/CMakeFiles/clang-tblgen.dir/TableGen.cpp.obj:TableGen.cpp:(.rdata$.refptr._ZTVN4llvm2cl17basic_parser_implE[.refptr._ZTVN4llvm2cl17basic_parser_implE]+0x0): undefined reference to `vtable for llvm::cl::basic_parser_impl'
D:\App\CLion 2024.2.3\bin\mingw\bin/ld.exe: utils/TableGen/CMakeFiles/clang-tblgen.dir/TableGen.cpp.obj:TableGen.cpp:(.rdata$.refptr._ZTVN4llvm2cl19generic_parser_baseE[.refptr._ZTVN4llvm2cl19generic_parser_baseE]+0x0): undefined reference to `vtable for llvm::cl::generic_parser_base'
D:\App\CLion 2024.2.3\bin\mingw\bin/ld.exe: utils/TableGen/CMakeFiles/clang-tblgen.dir/TableGen.cpp.obj:TableGen.cpp:(.rdata$.refptr._ZTVN4llvm2cl18GenericOptionValueE[.refptr._ZTVN4llvm2cl18GenericOptionValueE]+0x0): undefined reference to `vtable for llvm::cl::GenericOptionValue'
D:\App\CLion 2024.2.3\bin\mingw\bin/ld.exe: utils/TableGen/CMakeFiles/clang-tblgen.dir/TableGen.cpp.obj:TableGen.cpp:(.rdata$.refptr._ZTVN4llvm2cl6OptionE[.refptr._ZTVN4llvm2cl6OptionE]+0x0): undefined reference to `vtable for llvm::cl::Option'
collect2.exe: error: ld returned 1 exit status
ninja: build stopped: subcommand failed.
```

这个错误信息表明在使用 MinGW 编译 LLVM 时，链接器找不到某些 LLVM 函数和虚表（vtable）的定义。

默认是使用 MinGW 编译器来编译 LLVM。LLVM 通常更适合使用 MSVC（Microsoft Visual C++）编译器在 Windows 上进行编译。

切换到 MSVC 编译器，应该能解决 undefined reference 的链接错误。

打开 Visual Studio Installer，确认已经安装 MSVC

[![word/media/image19.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/cecc1027ade94365.png)](data:image/png;base64,inline-286886B)

在设置窗口中，导航到 Build, Execution, Deployment > Toolchains。添加新的 toolchain，选择 Visual Studio，工具集选择 VisualStudio\\IDE 目录，等待工具检测完毕点击应用。

 [![word/media/image20.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/afab0966e8ed9c23.png)](data:image/png;base64,inline-172694B)参考： [https://www.jetbrains.com/help/clion/quick-tutorial-on-configuring-clion-on-windows.html#MSVC](https://www.jetbrains.com/help/clion/quick-tutorial-on-configuring-clion-on-windows.html#MSVC)

修改 Cmake 配置，工具链选择 Visual Studio

[![word/media/image21.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/df2e5efeaedbf0ab.png)](data:image/png;base64,inline-216790B)

重新运行调试 clang，成功触发断点！

[![word/media/image22.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/e90c2dc4bd4d5584.png)](data:image/png;base64,inline-274186B)
