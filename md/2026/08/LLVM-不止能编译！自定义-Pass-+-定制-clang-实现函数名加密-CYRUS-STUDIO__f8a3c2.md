---
title: LLVM 不止能编译！自定义 Pass + 定制 clang 实现函数名加密 // CYRUS STUDIO
source: https://cyrus-studio.github.io/blog/posts/llvm-%E4%B8%8D%E6%AD%A2%E8%83%BD%E7%BC%96%E8%AF%91%E8%87%AA%E5%AE%9A%E4%B9%89-pass-+-%E5%AE%9A%E5%88%B6-clang-%E5%AE%9E%E7%8E%B0%E5%87%BD%E6%95%B0%E5%90%8D%E5%8A%A0%E5%AF%86/
source_host: cyrus-studio.github.io
clip_date: 2026-08-04T14:00:25+08:00
trace_id: 0e706e61-f570-4d9a-84dc-8efdb18129e9
content_hash: b17c8ad7d87b65d9ba8ba29038c2a3d322ce5db7fbcc9f280949ec623d804c2b
status: synced
tags:
  - 编译器保护
  - LLVM
series: null
feed_source: Cyrus Studio·安卓逆向
ai_summary: 通过编写 LLVM Function Pass 将函数名替换为 MD5 哈希值，并修改 clang 源码实现自动加载该 Pass，达成编译阶段函数名加密。
ai_summary_style: key-points
images_status:
  total: 18
  succeeded: 18
  failed_urls: []
notion_page_id: 3b275244-d011-81ed-b936-e39f37dd8ca7
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 通过编写 LLVM Function Pass 将函数名替换为 MD5 哈希值，并修改 clang 源码实现自动加载该 Pass，达成编译阶段函数名加密。
> 
> - **加密策略：** Pass 跳过外部声明、标准库函数（如 printf）、comdat 函数以及 main 函数，仅对用户定义的普通函数名进行 MD5 哈希替换。
> - **Pass 注册与加载：** 使用新 Pass 管理器，通过 `PB.registerPipelineParsingCallback` 注册名为 `md5-function-name-pass` 的 Function Pass，由 `opt --load-pass-plugin` 或 `clang -Xclang -fpass-plugin` 动态加载。
> - **定制 clang 自动加载：** 在 `BackendUtil.cpp` 中利用 `LoadLibrary` / `GetProcAddress` 加载自定义 DLL，调用其导出的 `clangAddPass` 将 Pass 注入 `FunctionPassManager`，并通过 `createModuleToFunctionPassAdaptor` 适配到模块级管道，使 clang 编译时自动应用加密。
> - **开发与调试方法：** 可在 CLion 中配置 opt 可执行文件并传入 `.ll` 文件与插件路径作为实参，在 Pass 的 `run` 函数内设置断点进行调试；Windows 平台需用 `export.def` 显式导出 `llvmGetPassPluginInfo`。

> 版权归作者所有，如有转发，请注明文章出处： [https://cyrus-studio.github.io/blog/](https://cyrus-studio.github.io/blog/)

## 前言

**LLVM 是一个编译器框架**，用来把 C/C++ 源码编译成目标文件，似乎和日常的 GCC、Clang 没什么两样。事实上，LLVM 的能力远不止于此。

相关文章： [LLVM 全面解析：NDK 为什么离不开它？如何亲手编译调试 clang](https://cyrus-studio.github.io/blog/posts/llvm-%E5%85%A8%E9%9D%A2%E8%A7%A3%E6%9E%90ndk-%E4%B8%BA%E4%BB%80%E4%B9%88%E7%A6%BB%E4%B8%8D%E5%BC%80%E5%AE%83%E5%A6%82%E4%BD%95%E4%BA%B2%E6%89%8B%E7%BC%96%E8%AF%91%E8%B0%83%E8%AF%95-clang/)

凭借它灵活的 **中间表示（LLVM IR）** 和强大的 **Pass 插件机制**，我们不仅能优化代码，还能在编译阶段对程序进行“改造”——比如 **函数名加密、混淆、代码保护**，让逆向工程变得更加困难。

本文带你从零开始，体验一次完整的 LLVM 定制之旅：

-   学习如何生成和操作 LLVM IR
    
-   使用 opt 和 CLion 调试 LLVM Pass
    
-   编写自定义 Pass，实现 **函数名加密保护**
    
-   最终定制 clang，让它自动加载我们的加密插件
    

## 1\. LLVM IR 介绍

LLVM IR（Intermediate Representation，中间表示）是 LLVM 编译框架的核心。它是一种 **介于高级语言（如 C/C++）与底层机器码之间的中间语言**，既能表达高级语言的语义，又足够接近机器指令，便于优化和生成目标代码。

LLVM IR 的两种存储形式：

-   文本格式（.ll）：人类可读，方便分析和调试。
    
-   二进制格式（.bc）：Bitcode 文件，适合存储和传输。
    

LLVM IR 与具体 CPU 架构解耦，可以跨平台复用优化逻辑。

**一个简单示例** （C 代码 → LLVM IR）：

```
int add(int a, int b) {
    return a + b;
}
```

对应的 LLVM IR（.ll 文本）：

```
define i32 @add(i32 %a, i32 %b) {
entry:
  %0 = add i32 %a, %b
  ret i32 %0
}
```

LLVM IR 语言参考手册： [https://llvm.org/docs/LangRef.html](https://llvm.org/docs/LangRef.html)

在这个例子中：

-   define i32 @add 定义了一个返回 i32 的函数 add；
    
-   %a 和 %b 是函数参数；
    
-   add i32 %a, %b 表示整数相加；
    
-   ret i32 %0 返回结果。
    

通过 LLVM IR，编译器就能在架构无关的层面做优化，然后再交由 LLVM 后端翻译成目标平台的机器码。

## 1.1 将 C 文件转换为 LLVM IR

生成文本形式的 LLVM IR（.ll 文件）

```
clang -S -emit-llvm hello.c -o hello.ll
```

以 hello.ll 为例，生成的内容大概如下

```
; Function Attrs: noinline nounwind optnone uwtable
; 这行注释了函数的属性
; - noinline: 该函数不会被内联（inline）。
; - nounwind: 该函数不会引发异常（不会 unwind stack）。
; - optnone: 编译器不会对此函数进行任何优化。
; - uwtable: 该函数有一个可用的异常处理表（unwind table）。

define dso_local i32 @main() #0 {
; define: 定义一个函数。
; dso_local: 该函数在本地动态库中可见（仅限于当前编译单元）。
; i32: 返回类型为 32 位整数。
; @main: 函数名为 'main'。
; #0: 函数使用属性组 0 中定义的属性（即上面注释的那一行）。

entry:
; entry: 函数的入口基本块（Basic Block）的标签。

  %retval = alloca i32, align 4
  ; alloca: 在栈上分配内存。这里分配了一个 32 位整数（i32）。
  ; align 4: 分配的内存对齐到 4 字节边界。
  ; %retval: 变量的名称（SSA 变量），用于存储 main 函数的返回值。

  store i32 0, ptr %retval, align 4
  ; store: 将一个值存储到内存地址中。
  ; i32 0: 要存储的值是 32 位整数 0（即 main 函数的返回值）。
  ; ptr %retval: 存储的位置是之前分配的栈变量 %retval。
  ; align 4: 存储操作按 4 字节对齐。

  %call = call i32 (ptr, ...) @printf(ptr noundef @"??_C@_0P@MHJMLPNF@Hello?0?5World?$CB?6?$AA@")
  ; call: 调用一个函数，这里调用了 C 标准库的 printf 函数。
  ; i32 (ptr, ...): printf 函数的原型。它接受一个指针（通常是 C 字符串格式化字符串）和可变参数列表（...）。
  ; ptr noundef @"??_C@_0P@MHJMLPNF@Hello?0?5World?$CB?6?$AA@": 这是一个字符串常量的地址（指针）。
  ; noundef: 表示传递给函数的参数不会是未定义的（undefined）。
  ; %call: 保存 printf 的返回值（返回打印的字符数）。

  ret i32 0
  ; ret: 返回指令，用于结束函数的执行。
  ; i32 0: main 函数返回 0（表示正常退出）。
}
```

## 1.2 生成二进制 LLVM IR（.bc 文件）

生成二进制 LLVM IR（.bc 文件）

```
clang -emit-llvm -c hello.c -o hello.bc
```

可以使用 llvm-dis 转换回文本形式

```
llvm-dis hello.bc -o hello.ll
```

## 1.3 使用 clang 编译 IR 文件

运行以下命令将.ll 文件编译为可执行程序

```
clang hello.ll -o hello.exe
```

## 2\. opt 介绍

opt 是 LLVM 提供的一个命令行工具，主要用于 **对 LLVM IR 进行分析和优化**。它不会直接生成目标机器码，而是专注于 **IR 层面的处理**，通常在编译流程中作为“优化器”环节出现。

opt 工具通过应用各种优化 Pass，可以实现 \*\*“优化/分析” \*\* 的目的。

```
LLVM IR (.ll / .bc)
      ↓
   opt 工具
      ↓  （加载并执行多个 Pass）
   ┌───────────────┐
   │ Pass A (分析) │
   │ Pass B (优化) │
   │ Pass C (混淆) │
   └───────────────┘
      ↓
优化/变换后的 LLVM IR
```

显示所有可用的 Pass

```
opt --help
```

优化 LLVM IR 文件

```
opt -O3 hello.ll -o hello_opt.bc
```

参数说明：

-   \-O3：表示应用最高级别的优化（与 clang 的 -O3 类似）。
    
-   \-o hello_opt.bc：输出优化后的文件
    

生成可读的 LLVM IR 文件

```
opt -O3 hello.bc -S -o hello_opt.ll
```

参数说明：

-   \-S：表示输出可读的文本格式（.ll 文件）。

应用特定的 Pass，并查看优化效果。例如

```
opt -passes=mem2reg hello.ll -S -o hello_mem2reg.ll
```

参数说明：

-   \-passes：应用特定的优化 pass
    
-   mem2reg：把内存变量提升为寄存器变量（SSA 形式）。
    
-   \-S：输出可读的.ll 文件。
    

函数内联优化，将函数调用替换为函数体，从而减少函数调用的开销。

```
opt -passes=inline hello.ll -S -o hello_inline.ll
```

可以同时应用多个 Pass（前一个 Pass 的输出就是后一个 Pass 的输入）

```
opt -passes="mem2reg,inline,constprop" input.ll -o output.ll
```

生成函数的控制流图（Control Flow Graph），输出为.dot 文件，可以用 Graphviz 进行可视化。

```
opt -passes=dot-cfg hello.ll
```

## 3\. 使用 Clion 调试 opt

使用 CLion 打开 llvm-project\\llvm\\CMakeLists.txt

[![word/media/image1.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/464e8f865adebdcc.png)](data:image/png;base64,inline-58034B)

作为项目打开

[![word/media/image2.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/7d60e996d0374c8f.png)](data:image/png;base64,inline-20474B)

打开 CMake 设置，工具链使用 Visual Studio，点击应用

[![word/media/image3.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/cf8461b4903ccf58.png)](data:image/png;base64,inline-207930B)

等待 Cmake 执行完成后，可以看到 opt 的运行/调试配置

[![word/media/image4.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/ed5be5776989c04c.png)](data:image/png;base64,inline-279942B)

编辑 opt 运行/调试配置，添加程序实参，比如

```
-O3 "D:\Projects\llvm-project\build\hello.ll" -o "D:\Projects\llvm-project\build\hello_opt.bc"
```

[![word/media/image5.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/86b8f49d9b10288a.png)](data:image/png;base64,inline-142130B)

找到 main 函数（llvm/tools/opt/opt.cpp），并下断点

[![word/media/image6.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/062862b522cb4047.png)](data:image/png;base64,inline-241126B)

调试 opt，并成功在 main 函数断点

[![word/media/image7.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/ef789b94a2e6ba72.png)](data:image/png;base64,inline-244434B)

## 4\. Pass 介绍

LLVM Pass 是 LLVM 的扩展机制， **Pass** 是一种对程序中间表示（IR）进行分析或转换的模块，由 Pass Manager 统一调度。

通过编写自定义 Pass，开发者可以插入自己的逻辑来优化代码、分析性能或插入调试信息等。

## 5\. Pass 的分类

1、Module Pass

-   作用于整个 llvm::Module 。
    
-   适用于需要全局视角的操作，例如链接优化或全局变量分析。
    

2、 Function Pass

-   针对每个函数 llvm::Function。
    
-   适用于优化单个函数内的代码，例如循环优化、死代码删除等。
    

3、 Basic Block Pass

-   针对函数内的每个基本块（Basic Block）。
    
-   通常用于优化基本块内部，例如指令合并、无用指令消除等。
    

## 6\. Pass 的实现

## 6.1 实现 Module Pass

创建 MyModulePass.cpp，定义一个模块级别的 Pass，run 函数实现了对模块的遍历，并输出每个函数的名称。

```cpp
#include "llvm/IR/PassManager.h"  // 包含 LLVM 新 Pass Manager 的头文件
#include "llvm/Passes/PassBuilder.h"  // 提供 PassBuilder，用于注册和管理 Pass
#include "llvm/Passes/PassPlugin.h"  // 用于实现动态插件的接口
#include "llvm/IR/Module.h"  // 定义了 Module 类，用于表示 LLVM IR 的顶层结构
#include "llvm/Support/raw_ostream.h"  // 提供 LLVM 的输出支持，如 errs() 输出到标准错误流

using namespace llvm;  // 使用 LLVM 命名空间简化代码

// 定义一个 Module Pass
// Module Pass 是对整个模块进行操作的 Pass
struct MyModulePass : PassInfoMixin<MyModulePass> {
    // run 函数：Pass 的主入口，用于实现实际的操作逻辑
    // 参数说明
    // Module &M: 表示当前处理的模块
    // ModuleAnalysisManager &MAM: 提供对模块级分析的访问
    PreservedAnalyses run(Module &M, ModuleAnalysisManager &MAM) {
        // 输出当前模块的名称
        errs() << "Processing Module: " << M.getName() << "\n";

        // 遍历模块中的每个函数
        for (auto &F: M) {
            // 输出每个函数的名称
            errs() << "Function: " << F.getName() << "\n";
        }

        // 返回 PreservedAnalyses::all()，表示此 Pass 不修改 IR
        return PreservedAnalyses::all();
    }
};

// 动态插件入口函数，LLVM 在加载插件时会调用此函数
// 函数名固定为 llvmGetPassPluginInfo，返回插件的描述信息
extern "C" PassPluginLibraryInfo llvmGetPassPluginInfo() {
    // 返回插件的信息
    return {
            LLVM_PLUGIN_API_VERSION,      // LLVM 插件 API 的版本号
            "MyPass",               // 插件的名称
            LLVM_VERSION_STRING,          // 当前 LLVM 的版本号
            [](PassBuilder &PB) {         // PassBuilder 的回调函数，用于注册 Pass
                // 注册解析 Pipeline 的回调函数
                PB.registerPipelineParsingCallback(
                        [](StringRef Name, ModulePassManager &MPM,
                           ArrayRef<PassBuilder::PipelineElement>) {
                            // 检查 Pipeline 中的 Pass 名称是否为 "my-module-pass"
                            if (Name == "my-module-pass") {
                                // 将 MyModulePass 注册到模块 Pass 管理器中
                                MPM.addPass(MyModulePass());
                                return true;  // 表示 Pass 已成功注册
                            }
                            return false;  // 名称不匹配，忽略
                        });
            }};
}
```

## 6.2 实现 Function / Basic Block Pass

创建 MyFunctionPass.cpp，定义一个函数级别的 Pass，run 遍历函数中的基本块以及基本块中的每条指令，并将其输出。

```cpp
#include "llvm/IR/PassManager.h"  // 包含 LLVM 新 Pass 管理器的头文件
#include "llvm/Passes/PassBuilder.h"  // 提供 PassBuilder，用于构建和注册 Pass
#include "llvm/Passes/PassPlugin.h"  // 提供 Pass 插件接口的支持
#include "llvm/IR/Module.h"  // 定义 LLVM IR 的模块类
#include "llvm/Support/raw_ostream.h"  // 提供 LLVM 的输出支持，比如 errs()

using namespace llvm;  // 使用 LLVM 的命名空间，简化后续代码编写

// 定义一个函数级别的 Pass
struct MyFunctionPass : public PassInfoMixin<MyFunctionPass> {
    // 函数级别的运行入口
    // 参数
    //   - Function &F: 当前正在处理的函数
    //   - FunctionAnalysisManager &FAM: 函数级别的分析管理器
    PreservedAnalyses run(Function &F, FunctionAnalysisManager &FAM) {
        // 输出当前函数的名称
        errs() << "Processing Function: " << F.getName() << "\n";

        // 遍历函数中的每个基本块（Basic Block）
        for (auto &BB : F) {
            errs() << "Basic Block:\n";
            // 遍历基本块中的每条指令
            for (auto &I : BB) {
                // 输出当前指令
                errs() << I << "\n";
            }
        }

        // 返回 PreservedAnalyses::all()，表明该 Pass 不修改 IR
        return PreservedAnalyses::all();
    }
};

// 定义插件的入口函数，注册 Pass 到 Pass 管理器
llvm::PassPluginLibraryInfo getPassPluginInfo() {
    // 返回插件的元信息
    return {
        LLVM_PLUGIN_API_VERSION,  // LLVM 插件的 API 版本
        "MyPass",                 // 插件名称
        LLVM_VERSION_STRING,      // 当前 LLVM 的版本号
        [](PassBuilder &PB) {     // 一个回调，用于将 Pass 注册到 PassBuilder 中
            // 注册管道解析回调函数，用于支持命令行参数调用
            PB.registerPipelineParsingCallback(
                [](StringRef Name, FunctionPassManager &FPM,
                   ArrayRef<PassBuilder::PipelineElement>) {
                    // 检查命令行中的 Pass 名称是否匹配 "my-function-pass"
                    if (Name == "my-function-pass") {
                        // 如果匹配，将自定义 Pass 添加到函数 Pass 管理器中
                        FPM.addPass(MyFunctionPass());
                        return true;  // 表明注册成功
                    }
                    return false;  // 未匹配，跳过此 Pass
                });
        }};
}

// 必须导出符号 `llvmGetPassPluginInfo`，这是 LLVM 插件的入口点
extern "C" LLVM_ATTRIBUTE_WEAK ::llvm::PassPluginLibraryInfo llvmGetPassPluginInfo() {
    return getPassPluginInfo();  // 调用自定义的插件入口函数
}
```

## 6.3 编译 Pass

创建 CMake 项目配置文件 CMakeLists.txt，内容如下

```bash
cmake_minimum_required(VERSION 4.20.0)

# 设置 LLVM 安装目录的路径，LLVM_DIR 指向 LLVM 的 cmake 配置目录。
#set(LLVM_DIR "D:/Projects/llvm-project/build/lib/cmake/llvm")

# 项目名称
project(pass)

# 查找已安装的 LLVM，要求是通过 CONFIG 模式查找
find_package(LLVM REQUIRED CONFIG)
# 将 LLVM 的 CMake 模块路径添加到 CMake 模块路径中
list(APPEND CMAKE_MODULE_PATH "${LLVM_CMAKE_DIR}")
# 包含 LLVM 的 CMake 配置文件，用于导入其编译选项和头文件路径
include(LLVMConfig)

# 设置 C++ 标准为 C++17，并强制启用标准特性
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED YES)
set(CMAKE_CXX_EXTENSIONS NO)

# /MD   使用多线程的动态运行时库（Release 模式常用）。
# /MDd  使用多线程的动态运行时库（带调试符号，Debug 模式）。
set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} /MD")

# 设置 LLVM 编译标志
separate_arguments(LLVM_DEFINITIONS_LIST NATIVE_COMMAND ${LLVM_DEFINITIONS})
add_definitions(${LLVM_DEFINITIONS_LIST})

# 包含 LLVM 头文件路径
include_directories(${LLVM_INCLUDE_DIRS})

# 链接 LLVM 的库目录，确保链接阶段可以找到需要的库
link_directories(${LLVM_LIBRARY_DIRS})

# 添加自定义 Pass
add_library(MyPass SHARED
        MyFunctionPass.cpp
#        MyModulePass.cpp
)

# 自动映射并链接需要的 LLVM 组件库（如 core、support 等）
llvm_map_components_to_libnames(LLVM_LIBS core support)

# 将生成的共享库与必要的 LLVM 库链接起来
target_link_libraries(MyPass ${LLVM_LIBS})

# 在 Windows 平台上，显式指定要导出的符号（如 llvmGetPassPluginInfo）
if (WIN32)
    # 使用 export.def 文件来控制导出符号
    set_target_properties(MyPass PROPERTIES LINK_FLAGS "/DEF:${CMAKE_CURRENT_SOURCE_DIR}/export.def")
endif ()
```

在 Windows 上，动态链接库（DLL）的符号导出通常需要显式指定。否则，运行时的链接器（linker）无法正确找到并加载这些符号。

创建一个 export.def 文件，用于显式导出 llvmGetPassPluginInfo

```
LIBRARY MyPass
EXPORTS
    llvmGetPassPluginInfo
```

参数说明：

-   LIBRARY: DLL 的名称（不需要扩展名），这里是 MyPass。
    
-   EXPORTS: 列出需要导出的函数名。
    

执行下面命令编译 pass

```bash
# 创建 build 目录
mkdir build && cd build

# 运行 CMake 命令生成构建文件
cmake -G "Ninja" -DCMAKE_BUILD_TYPE=Debug ..

# 编译项目
cmake --build .
```

编译完成后，可以看到 MyPass.dll 以及生成在 build 目录

[![word/media/image8.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/7d3a672d2a4dff9a.png)](data:image/png;base64,inline-87014B)

## 6.4 测试

编译插件后，可以通过 opt 命令运行 Pass

其中：

-   \-load-pass-plugin 加载插件。
    
-   \-passes 指定运行的 Pass 名称。
    

创建 test.ll LLVM IR 文件，内容如下

```
define i32 @main() {
  ret i32 0
}
```

使用 opt 工具加载 MyPass.dll 插件，运行自定义的 my-function-pass ，对 test.ll 进行优化处理，并将结果输出到 test_opt.ll。

```
opt --load-pass-plugin=./MyPass.dll --passes=my-function-pass -S ../test.ll -o ../test_opt.ll

Processing Function: main
Basic Block:
  ret i32 0
```

使用 opt 工具加载 MyPass.dll 插件，运行自定义的 my-module-pass ，对 test.ll 进行优化处理，并将结果输出到 test.bc。

```
opt --load-pass-plugin=./MyPass.dll --passes=my-module-pass ../test.ll -o ../test.bc

Processing Module: ../test.ll
Function: main
```

参考：

-   [Writing an LLVM Pass](https://llvm.org/docs/WritingAnLLVMNewPMPass.html#introduction-what-is-a-pass)
    
-   [Developing LLVM passes out of source](https://llvm.org/docs/CMake.html#developing-llvm-passes-out-of-source)
    

## 7\. 使用 Clion 调试自定义 Pass

1.  编辑 MyPass 运行/调试配置
    
2.  可执行文件选择 opt 程序
    

[![word/media/image9.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/577b3a578db8ad8b.png)](data:image/png;base64,inline-106458B)

3.  添加程序实参，比如

```
--load-pass-plugin="D:\Projects\MyPass\build\MyPass.dll" --passes=my-function-pass -S "D:\Projects\MyPass\test.ll" -o "D:\Projects\MyPass\test_opt.ll"
```

4.  在 MyFunctionPass 的 run 函数中下断点，运行调试配置

[![word/media/image10.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/dc7b31a0cc40fe6e.png)](data:image/png;base64,inline-299482B)

## 8\. 实现函数名加密 Pass

## 8.1 编写 Pass 源码

创建 MD5FunctionNamePass.cpp，源码如下

```cpp
#include "llvm/IR/PassManager.h"
#include "llvm/Passes/PassPlugin.h"
#include "llvm/Passes/PassBuilder.h"
#include "llvm/IR/Function.h"
#include "llvm/Support/MD5.h"
#include "llvm/Support/raw_ostream.h"

using namespace llvm;

struct MD5FunctionNamePass : public PassInfoMixin<MD5FunctionNamePass> {

    PreservedAnalyses run(Function &F, FunctionAnalysisManager &) {

        // 获取函数名
        std::string originalName = F.getName().str();

        // 跳过外部声明（非定义的函数）
        if (F.isDeclaration()) {
            errs() << "Skipping external function: " << originalName << "\n";
            return PreservedAnalyses::all(); // IR 未被修改
        }

        // 排除标准库函数名
        std::set<std::string> standardFunctions = {"printf", "sprintf", "vsprintf"};
        if (standardFunctions.count(F.getName().str())) {
            errs() << "Skipping standard library function: " << F.getName() << "\n";
            return PreservedAnalyses::all();
        }

        // 排除 comdat 函数
        if (F.getComdat()) {
            errs() << "Skipping comdat function: " << F.getName() << "\n";
            return PreservedAnalyses::all();
        }

        // 排除 "main" 函数
        if (originalName == "main") {
            errs() << "Skipping encryption for function: " << originalName << "\n";
            return PreservedAnalyses::all();
        }

        // 打印原始函数名
        errs() << "Original Function Name: " << originalName << "\n";

        // 计算 MD5 哈希值
        MD5 hash;
        MD5::MD5Result result;
        hash.update(originalName);
        hash.final(result);

        // 转换 MD5 结果为字符串
        SmallString<32> hashString;
        MD5::stringifyResult(result, hashString);

        errs() << "MD5 Hash: " << hashString << "\n";

        // 修改函数名为哈希值
        F.setName(hashString);

        return PreservedAnalyses::none(); // 函数 IR 已被修改
    }


    // 当函数带有 optnone 属性时，Pass 默认会被跳过。通过重写 isRequired，可以强制框架认为当前 Pass 对所有函数都是必要的。
    static bool isRequired() {
        return true;
    }
};

// 插件入口
llvm::PassPluginLibraryInfo getPassPluginInfo() {

    errs() << "MD5FunctionNamePass Plugin Loaded Successfully.\n";

    return {LLVM_PLUGIN_API_VERSION, "MD5FunctionNamePass", LLVM_VERSION_STRING,
            [](PassBuilder &PB) {
                PB.registerPipelineParsingCallback(
                        [](StringRef Name, FunctionPassManager &FPM,
                           ArrayRef<PassBuilder::PipelineElement>) {
                            if (Name == "md5-function-name-pass") {
                                FPM.addPass(MD5FunctionNamePass());
                                return true;
                            }
                            return false;
                        });
            }};
}

extern "C" LLVM_ATTRIBUTE_WEAK ::llvm::PassPluginLibraryInfo llvmGetPassPluginInfo() {
    return getPassPluginInfo();
}
```

## 8.2 CMakeLists.txt

创建 CMakeLists.txt，内容如下

```bash
cmake_minimum_required(VERSION 3.20)
project(MD5FunctionNamePass)

# 设置 LLVM 安装目录的路径，LLVM_DIR 指向 LLVM 的 cmake 配置目录。
set(LLVM_DIR "D:/Projects/llvm-project/build/lib/cmake/llvm")

find_package(LLVM REQUIRED CONFIG)
list(APPEND CMAKE_MODULE_PATH "${LLVM_CMAKE_DIR}")
include(LLVMConfig)

set(CMAKE_CXX_STANDARD 17)

include_directories(${LLVM_INCLUDE_DIRS})
link_directories(${LLVM_LIBRARY_DIRS})

# 添加自定义 Pass
add_library(MD5FunctionNamePass SHARED
        MD5FunctionNamePass.cpp
)

# 链接 LLVM 支持库
llvm_map_components_to_libnames(LLVM_LIBS core support)
target_link_libraries(MD5FunctionNamePass ${LLVM_LIBS})


if (WIN32)
    set_target_properties(MD5FunctionNamePass PROPERTIES LINK_FLAGS "/DEF:${CMAKE_CURRENT_SOURCE_DIR}/export.def")
endif ()
```

## 8.3 导入项目到CLion

导入项目到 CLion，打开 CMakeLists.txt，作为项目打开

[![word/media/image11.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/72fd16fe403cde4a.png)](data:image/png;base64,inline-19834B)

工具链选择 Visual Studio

 [![word/media/image12.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/9fb61891b3de4a30.png)](data:image/png;base64,inline-130950B)关于工具链的配置可以参考： [LLVM 全面解析：NDK 为什么离不开它？如何亲手编译调试 clang](https://cyrus-studio.github.io/blog/posts/llvm-%E5%85%A8%E9%9D%A2%E8%A7%A3%E6%9E%90ndk-%E4%B8%BA%E4%BB%80%E4%B9%88%E7%A6%BB%E4%B8%8D%E5%BC%80%E5%AE%83%E5%A6%82%E4%BD%95%E4%BA%B2%E6%89%8B%E7%BC%96%E8%AF%91%E8%B0%83%E8%AF%95-clang/)

## 8.4 编译

```
# 进入 build 目录
cd cmake-build-debug-visual-studio

# 编译项目 
ninja MD5FunctionNamePass
```

编译完成，MD5FunctionNamePass.dll 就在在 build 目录下

[![word/media/image13.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/adee52e1fad1aff9.png)](data:image/png;base64,inline-115718B)

## 8.5 测试

新建 hello.c，内容如下

```cpp
#include <stdio.h>

const char *getHello() {
    return "Hello,";
}

const char *getWorld() {
    return "World!";
}

// 主函数
int main() {
    // 调用两个函数并打印结果
    const char *hello = getHello();
    const char *world = getWorld();

    printf("%s %s\n", hello, world);
    return 0;
}
```

把 hello.c 转换为 hello.ll

```
clang -S -emit-llvm ../hello.c -o ../hello.ll
```

使用 md5-function-name-pass 优化 test.ll，导出优化后的 IR 文件 test_opt.ll

```
opt --load-pass-plugin=./MD5FunctionNamePass.dll --passes=md5-function-name-pass -S ../hello.ll -o ../hello_opt.ll

MD5FunctionNamePass Plugin Loaded Successfully.
Skipping standard library function: sprintf
Skipping standard library function: vsprintf
Skipping comdat function: _snprintf
Skipping comdat function: _vsnprintf
Original Function Name: getHello
MD5 Hash: 9d55bba946**********d85490c913
Original Function Name: getWorld
MD5 Hash: f612c236a8**********efab4376d2
Skipping encryption for function: main
Skipping standard library function: printf
Skipping comdat function: _vsprintf_l
Skipping comdat function: _vsnprintf_l
Skipping comdat function: __local_stdio_printf_options
Skipping comdat function: _vfprintf_l
```

打开 test_opt.ll 可以看到 getHello 和 getWorld 函数名字都已经替换成 MD5 加密串了

[![word/media/image14.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/51374a0064088074.png)](data:image/png;base64,inline-237078B)

使用 clang 把 test_opt.ll 编译成可执行程序

```
clang ../hello_opt.ll -o hello_opt.exe
```

运行 hello_opt.exe，正常输出 Hello, World!

[![word/media/image15.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/9c5a6845d3c6e833.png)](data:image/png;base64,inline-22406B)

## 9\. clang 使用自定义 Pass

运行以下命令直接加载插件并应用于编译流程

```
clang -Xclang -load -Xclang ./MD5FunctionNamePass.dll ../hello.c -o hello.exe
```

或者

```
clang -Xclang -fpass-plugin=./MD5FunctionNamePass.dll ../hello.c -o hello.exe
```

## 10\. 定制 clang 自动加载 Pass 插件

定制化 clang，让其在运行时自动加载自定义的 Pass 插件。

## 10.1. 编写导出接口

编写导出函数，创建 pass 并添加到 FunctionPassManager

```javascript
extern "C" __declspec(dllexport) void __stdcall clangAddPass(
        FunctionPassManager &FPM) {

    errs() << "call clangAddPass.\n";

    // 将Pass添加到PassManager
    FPM.addPass(MD5FunctionNamePass());
}
```

执行 ninja 命令重新编译 dll ，并把 dll 文件复制到 clang 可执行文件同级目录下。

## 10.2. 修改 BackendUtil.cpp

BackendUtil.cpp 是代码生成阶段调用 Pass 的地方。

代码路径：llvm-project/clang/lib/CodeGen/BackendUtil.cpp

编写一个函数，用于加载 dll，并调用 dll 中的导出函数 clangAddPass，代码如下

```cpp
#if defined(_WIN32) || defined(_WIN64) // Windows 平台
#include <windows.h> // Windows 的动态库加载 API

static void registerMD5FunctionNamePassPlugin(FunctionPassManager &FPM) {
  errs() << "call registerMD5FunctionNamePassPlugin.\n";

  // 动态加载 MD5FunctionNamePass.dll
  HMODULE PluginHandle = LoadLibrary(TEXT("MD5FunctionNamePass.dll"));
  if (!PluginHandle) {
    errs() << "Failed to load plugin: MD5FunctionNamePass.dll\n";
    return;
  }

  // 查找 DLL 导出的函数 clangAddPass
  using AddPassFuncType = void(__stdcall *)(FunctionPassManager &);
  auto AddPass = (AddPassFuncType)GetProcAddress(PluginHandle, "clangAddPass");
  if (!AddPass) {
    errs() << "Failed to find exported function: clangAddPass\n";
    FreeLibrary(PluginHandle);
    return;
  }

  AddPass(FPM); // 调用动态库中的注册逻辑

  llvm::errs() << "Successfully added md5-function-pass.\n";
}
#endif
```

把上面代码添加到 BackendUtil.cpp 顶部区域

[![word/media/image16.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/2da87a0fbbbedbb7.png)](data:image/png;base64,inline-164650B)

搜索 if (!CodeGenOpts.DisableLLVMPasses) 在该判断代码块后面加上下面代码，动态加载插件并调用注册函数

```cpp
#if defined(_WIN32) || defined(_WIN64) // 判断是否为 Windows 平台
                                       
  // 创建一个 FunctionPassManager 对象，用于管理和调度函数级的 Pass
  FunctionPassManager FPM;

  // 调用动态加载的插件注册函数，将 MD5FunctionNamePass 添加到 FunctionPassManager 中
  registerMD5FunctionNamePassPlugin(FPM);

  // 将 FunctionPassManager 适配为 ModulePassManager 所需要的格式，并添加到 ModulePassManager 中
  // 这样就能将 FunctionPass 管道添加到模块级别的优化管道中
  MPM.addPass(createModuleToFunctionPassAdaptor(std::move(FPM)));

#endif
```

[![word/media/image17.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/22d4655532b4ae2e.png)](data:image/png;base64,inline-158102B)

最后，执行 ninja clang 重新编译 clang。

## 10.3 测试

调用 clang 把 hello.c 编译成 IR 文件

```yaml
D:\Projects\llvm-project\build>clang -S -emit-llvm hello.c -o hello.ll

call registerMD5FunctionNamePassPlugin.
call clangAddPass.
Successfully added md5-function-pass.
Skipping standard library function: sprintf
Skipping standard library function: vsprintf
Skipping comdat function: _snprintf
Skipping comdat function: _vsnprintf
Original Function Name: getHello
MD5 Hash: 9d55bba946**********d85490c913
Original Function Name: getWorld
MD5 Hash: f612c236a8**********efab4376d2
Skipping encryption for function: main
Skipping standard library function: printf
Skipping comdat function: _vsprintf_l
Skipping comdat function: _vsnprintf_l
Skipping comdat function: __local_stdio_printf_options
Skipping comdat function: _vfprintf_l
```

可以看到 getHello 和 getWorld 函数名字都已经替换成 MD5 加密串了

[![word/media/image18.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/5f6fc6325516f9a8.png)](data:image/png;base64,inline-575594B)

## 完整源码

开源地址： [https://github.com/CYRUS-STUDIO/MD5FunctionNamePass](https://github.com/CYRUS-STUDIO/MD5FunctionNamePass)
