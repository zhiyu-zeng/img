---
title: OLLVM 移植 LLVM 18 实战，轻松实现 C&C++ 代码混淆 // CYRUS STUDIO
source: https://cyrus-studio.github.io/blog/posts/ollvm-%E7%A7%BB%E6%A4%8D-llvm-18-%E5%AE%9E%E6%88%98%E8%BD%BB%E6%9D%BE%E5%AE%9E%E7%8E%B0-cc++-%E4%BB%A3%E7%A0%81%E6%B7%B7%E6%B7%86/
source_host: cyrus-studio.github.io
clip_date: 2026-08-04T14:02:43+08:00
trace_id: 2c9944d1-c34c-4787-8d26-6848bd911257
content_hash: 8f29388f7f8fc45b540470f0a8369b8a35cefb1358e89b94849f0fca104b97b3
status: synced
tags:
  - 编译器保护
  - 安全工具
series: null
feed_source: Cyrus Studio·安卓逆向
ai_summary: 将OLLVM代码混淆插件成功移植到LLVM 18，通过集成Pass、修复4项API不兼容并验证指令替换、虚假控制流等功能有效。
ai_summary_style: key-points
images_status:
  total: 10
  succeeded: 10
  failed_urls: []
notion_page_id: 3b275244-d011-814b-a355-dcb6d1ae315f
ioc:
  cves: []
  cwes: []
  hashes:
    - ef434b52242435ea693926d9d658fc783cfbf3be
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 将OLLVM代码混淆插件成功移植到LLVM 18，通过集成Pass、修复4项API不兼容并验证指令替换、虚假控制流等功能有效。
> 
> - **移植路径：** 基于llvm17的Obfuscation代码复制到llvm/lib/Passes/Obfuscation，并在同目录CMakeLists.txt中添加所有混淆源文件。
> - **Pass注册：** 在PassBuilder.cpp中定义命令行开关（-sub/-fla/-bcf等），并在PipelineStartEPCallback中按字符串加密→间接调用→基本块分割→平坦化→指令替换→虚假控制流→间接分支/全局变量的顺序插入Pass。
> - **LLVM 18适配：** 修复4个编译错误：将`getInt8PtrTy`替换为`PointerType::get`；手动实现`valueEscapes`函数；`getBasicBlockList`私有化改用`splice`；`DemoteRegToStack`/`DemotePHIToStack`参数去除迭代器。
> - **混淆验证：** 编译`add.c`并开启`-sub`后，`add eax, [var_C]`被替换为`xor ecx,ecx; sub ecx,edx; sub eax,ecx`等价序列，程序输出不变；开启`-bcf`或`-fla`后IDA控制流图显著复杂化。
> - **精细控制：** 支持通过`__attribute__((annotate("bcf")))`等注解对单个函数启用/禁用特定混淆，无需全局编译选项。

> 版权归作者所有，如有转发，请注明文章出处： [https://cyrus-studio.github.io/blog/](https://cyrus-studio.github.io/blog/)

## OLLVM 简介

OLLVM（Obfuscator-LLVM）是基于 **LLVM 编译器框架** 的一个开源扩展项目，主要用于程序代码混淆与保护。

OLLVM 基于 LLVM 的 **Pass 插件机制**，在优化环节增加 **代码混淆功能**，从而增加二进制程序的逆向难度。

常见的混淆手段包括：

-   控制流平坦化（Control Flow Flattening）：打乱程序的控制流结构，使其执行路径不再直观。
    
-   指令替换（Instruction Substitution）：将简单指令替换为等价的复杂指令序列。
    
-   伪控制流（Bogus Control Flow）：引入大量无用的分支或跳转，干扰逆向分析。
    
-   字符串加密：防止敏感字符串在二进制中被直接提取。
    

## OLLVM 源码下载

OLLVM 项目地址： [https://github.com/obfuscator-llvm/obfuscator](https://github.com/obfuscator-llvm/obfuscator)

目前最新版本的是分支名为 llvm-4.0，基于 LLVM 团队发布的版本 4.0.1

[![word/media/image1.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/3d5e65b626a8cc5a.png)](data:image/png;base64,inline-152278B)

下载 OLLVM 的 llvm-4.0 分支源码到本地

```bash
git clone -b llvm-4.0 https://github.com/obfuscator-llvm/obfuscator.git
```

构建 OLLVM

```
mkdir build
cd build
cmake -DCMAKE_BUILD_TYPE=Release ../obfuscator/
make -j7
```

## OLLVM 项目介绍

```bash
obfuscator/
│
├── include/llvm/Transforms/Obfuscation # 公共头文件目录
│   ├── BogusControlFlow.h              # 虚假控制流头文件
│   ├── Flattening.h                    # 控制流平坦化头文件
│   ├── Split.h                         # 基本块拆分头文件
│   ├── Substitution.h                  # 指令替换头文件
│   └── ...                             # 其他混淆技术相关头文件
│
├── lib/Transforms/Obfuscation   # 核心实现代码目录
│   ├── BogusControlFlow.cpp       # 虚假控制流实现
│   ├── Flattening.cpp             # 控制流平坦化实现
│   ├── SplitBasicBlocks.cpp       # 基本块拆分实现
│   ├── Substitution.cpp           # 指令替换实现
│   └── ...                      # 其他混淆技术的实现文件
```

## 移植 OLLVM 到 LLVM 18

## 1\. 下载 LLVM 源码

LLVM 的源码下载和编译参考： [LLVM 全面解析：NDK 为什么离不开它？如何亲手编译调试 clang](https://cyrus-studio.github.io/blog/posts/llvm-%E5%85%A8%E9%9D%A2%E8%A7%A3%E6%9E%90ndk-%E4%B8%BA%E4%BB%80%E4%B9%88%E7%A6%BB%E4%B8%8D%E5%BC%80%E5%AE%83%E5%A6%82%E4%BD%95%E4%BA%B2%E6%89%8B%E7%BC%96%E8%AF%91%E8%B0%83%E8%AF%95-clang/)

## 2\. 复制 Obfuscation

OLLVM 主要核心代码在：lib/Transforms/Obfuscation

[![word/media/image2.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/97f89eb9abd2129e.png)](data:image/png;base64,inline-611030B)

Initial LLVM and Clang 4.0 之外的都是基于 LLVM 4.0 改动过的代码

[![word/media/image3.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/f025b75220f2a210.png)](data:image/png;base64,inline-141462B)

由于 obfuscator 中的代码已经 7 年多没有维护更新了，移植到 llvm18 变动太大。

所以使用下面 github 链接中基于 llvm17 的 Obfuscation：

[https://github.com/DreamSoule/ollvm17/tree/main/llvm-project/llvm/lib/Passes](https://github.com/DreamSoule/ollvm17/tree/main/llvm-project/llvm/lib/Passes)

拷贝 [Obfuscation](https://github.com/DreamSoule/ollvm17/tree/main/llvm-project/llvm/lib/Passes/Obfuscation) 到 LLVM 工程 llvm/lib/Passes/Obfuscation 下

[![word/media/image4.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/1d1a368c1070ce63.png)](data:image/png;base64,inline-61882B)

## 3\. CMakeLists.txt

编辑 llvm/lib/Passes/CMakeLists.txt 添加 Obfuscation 源码

```
add_llvm_component_library(LLVMPasses
...

  Obfuscation/Utils.cpp
  Obfuscation/CryptoUtils.cpp
  Obfuscation/ObfuscationOptions.cpp
  Obfuscation/BogusControlFlow.cpp
  Obfuscation/IPObfuscationContext.cpp
  Obfuscation/Flattening.cpp
  Obfuscation/StringEncryption.cpp
  Obfuscation/SplitBasicBlock.cpp
  Obfuscation/Substitution.cpp
  Obfuscation/IndirectBranch.cpp
  Obfuscation/IndirectCall.cpp
  Obfuscation/IndirectGlobalVariable.cpp

 ...
  )
```

## 4\. PassBuilder.cpp

编辑 llvm/lib/Passes/PassBuilder.cpp，添加如下修改：

```rust
// 导入 Obfuscation 相关头文件
#include "Obfuscation/BogusControlFlow.h" // 虚假控制流
#include "Obfuscation/Flattening.h"  // 控制流平坦化
#include "Obfuscation/SplitBasicBlock.h" // 基本块分割
#include "Obfuscation/Substitution.h" // 指令替换
#include "Obfuscation/StringEncryption.h" // 字符串加密
#include "Obfuscation/IndirectGlobalVariable.h" // 间接全局变量
#include "Obfuscation/IndirectBranch.h" // 间接跳转
#include "Obfuscation/IndirectCall.h" // 间接调用
#include "Obfuscation/Utils.h" // 为了控制函数名混淆开关 (bool obf_function_name_cmd;)


// 添加命令行支持
static cl::opt<bool> s_obf_split("split", cl::init(false), cl::desc("SplitBasicBlock: split_num=3(init)"));
static cl::opt<bool> s_obf_sobf("sobf", cl::init(false), cl::desc("String Obfuscation"));
static cl::opt<bool> s_obf_fla("fla", cl::init(false), cl::desc("Flattening"));
static cl::opt<bool> s_obf_sub("sub", cl::init(false), cl::desc("Substitution: sub_loop"));
static cl::opt<bool> s_obf_bcf("bcf", cl::init(false), cl::desc("BogusControlFlow: application number -bcf_loop=x must be x > 0"));
static cl::opt<bool> s_obf_ibr("ibr", cl::init(false), cl::desc("Indirect Branch"));
static cl::opt<bool> s_obf_igv("igv", cl::init(false), cl::desc("Indirect Global Variable"));
static cl::opt<bool> s_obf_icall("icall", cl::init(false), cl::desc("Indirect Call"));
static cl::opt<bool> s_obf_fn_name_cmd("fncmd", cl::init(false), cl::desc("use function name control obfuscation(_ + command + _ | example: function_fla_bcf_)"));


PassBuilder::PassBuilder( ... ) : ... {
...
    // 注册 Obfuscation 相关 Pass
    this->registerPipelineStartEPCallback(
        [](llvm::ModulePassManager &MPM,
           llvm::OptimizationLevel Level) {
          outs() << "[OLLVM] run.PipelineStartEPCallback\n";
          obf_function_name_cmd = s_obf_fn_name_cmd;
          if (obf_function_name_cmd) {
            outs() << "[OLLVM] enable function name control obfuscation(_ + command + _ | example: function_fla_)\n";
          }
          MPM.addPass(StringEncryptionPass(s_obf_sobf)); // 先进行字符串加密 出现字符串加密基本块以后再进行基本块分割和其他混淆 加大解密难度
          llvm::FunctionPassManager FPM;
          FPM.addPass(IndirectCallPass(s_obf_icall)); // 间接调用
          FPM.addPass(SplitBasicBlockPass(s_obf_split)); // 优先进行基本块分割
          FPM.addPass(FlatteningPass(s_obf_fla)); // 对于控制流平坦化
          FPM.addPass(SubstitutionPass(s_obf_sub)); // 指令替换
          FPM.addPass(BogusControlFlowPass(s_obf_bcf)); // 虚假控制流
          MPM.addPass(createModuleToFunctionPassAdaptor(std::move(FPM)));
          MPM.addPass(IndirectBranchPass(s_obf_ibr)); // 间接指令 理论上间接指令应该放在最后
          MPM.addPass(IndirectGlobalVariablePass(s_obf_igv)); // 间接全局变量
          MPM.addPass(RewriteSymbolPass()); // 根据yaml信息 重命名特定symbols
        }
    );
}
```

## 5\. 兼容 LLVM18

### 5.1 error C2039: “getInt8PtrTy”: 不是 “llvm::Type” 的成员

```swift
D:\App\VisualStudio\IDE\VC\Tools\MSVC\14.42.34433\bin\Hostx64\x64\cl.exe  /nologo /TP -DUNICODE -D_CRT_NONSTDC_NO_DEPRECATE -D_CRT_NONSTDC_NO_WARNINGS -D_CRT_SECURE_NO_DEPRECATE -D_CRT_SECURE_NO_WARNINGS -D_GLIBCXX_ASSERTIONS -D_SCL_SECURE_NO_DEPRECATE -D_SCL_SECURE_NO_WARNINGS -D_UNICODE -D__STDC_CONSTANT_MACROS -D__STDC_FORMAT_MACROS -D__STDC_LIMIT_MACROS -ID:\Projects\llvm-project\build\lib\Passes -ID:\Projects\llvm-project\llvm\lib\Passes -ID:\Projects\llvm-project\build\include -ID:\Projects\llvm-project\llvm\include /utf-8 /Zc:inline /Zc:preprocessor /Zc:__cplusplus /Oi /bigobj /permissive- /W4 -wd4141 -wd4146 -wd4244 -wd4267 -wd4291 -wd4351 -wd4456 -wd4457 -wd4458 -wd4459 -wd4503 -wd4624 -wd4722 -wd4100 -wd4127 -wd4512 -wd4505 -wd4610 -wd4510 -wd4702 -wd4245 -wd4706 -wd4310 -wd4701 -wd4703 -wd4389 -wd4611 -wd4805 -wd4204 -wd4577 -wd4091 -wd4592 -wd4319 -wd4709 -wd5105 -wd4324 -w14062 -we4238 /Zi /Ob0 /Od /RTC1 -std:c++17 -MDd  /EHsc /GR /showIncludes /Folib\Passes\CMakeFiles\LLVMPasses.dir\Obfuscation\IndirectGlobalVariable.cpp.obj /Fdlib\Passes\CMakeFiles\LLVMPasses.dir\LLVMPasses.pdb /FS -c D:\Projects\llvm-project\llvm\lib\Passes\Obfuscation\IndirectGlobalVariable.cpp
D:\Projects\llvm-project\llvm\lib\Passes\Obfuscation\IndirectGlobalVariable.cpp(149): error C2039: "getInt8PtrTy": 不是 "llvm::Type" 的成员
D:\Projects\llvm-project\llvm\include\llvm/IR/Type.h(45): note: 参见“llvm::Type”的声明
D:\Projects\llvm-project\llvm\lib\Passes\Obfuscation\IndirectGlobalVariable.cpp(149): error C3861: “getInt8PtrTy”: 找不到标识符
D:\Projects\llvm-project\llvm\lib\Passes\Obfuscation\IndirectGlobalVariable.cpp(156): error C2039: "getInt8PtrTy": 不是 "llvm::Type" 的成员
D:\Projects\llvm-project\llvm\include\llvm/IR/Type.h(45): note: 参见“llvm::Type”的声明
D:\Projects\llvm-project\llvm\lib\Passes\Obfuscation\IndirectGlobalVariable.cpp(156): error C3861: “getInt8PtrTy”: 找不到标识符
[32/2360] Building CXX object lib\Passes\CMakeFiles\LLVMPasses.dir\Obfuscation\IPObfuscationContext.cpp.obj
FAILED: lib/Passes/CMakeFiles/LLVMPasses.dir/Obfuscation/IPObfuscationContext.cpp.obj
```

在较新版本的 LLVM 中，llvm::Type::getInt8PtrTy 已经被移除或更改，取而代之的是通过 llvm::PointerType::get 创建指针类型。

将 getInt8PtrTy 的调用替换为：

```
llvm::PointerType::get(llvm::Type::getInt8Ty(Context), 0);
```

### 5.2 error C3861: “valueEscapes”: 找不到标识符

```
D:\Projects\llvm-project\llvm\lib\Passes\Obfuscation\Utils.cpp(193): error C3861: “valueEscapes”: 找不到标识符
```

valueEscapes 检查一个值是否可能被当前函数之外的其他代码使用。

在 Utils.cpp 添加如下代码（参考：llvm/lib/Transforms/Scalar/Reg2Mem.cpp）：

```rust
static bool valueEscapes(const Instruction &Inst) {
  if (!Inst.getType()->isSized())
    return false;

  const BasicBlock *BB = Inst.getParent();
  for (const User *U : Inst.users()) {
    const Instruction *UI = cast<Instruction>(U);
    if (UI->getParent() != BB || isa<PHINode>(UI))
      return true;
  }
  return false;
}
```

### 5.3 error C2248: “llvm::Function::getBasicBlockList”: 无法访问 private 成员

```php
D:\Projects\llvm-project\llvm\lib\Passes\Obfuscation\IPObfuscationContext.cpp(232): error C2248: “llvm::Function::getBasicBlockList”: 无法访问 private 成员(在“llvm::Function”类中声明)
D:\Projects\llvm-project\llvm\include\llvm/IR/Function.h(772): note: 参见“llvm::Function::getBasicBlockList”的声明
D:\Projects\llvm-project\llvm\include\llvm/IR/Function.h(61): note: 参见“llvm::Function”的声明
D:\Projects\llvm-project\llvm\lib\Passes\Obfuscation\IPObfuscationContext.cpp(232): error C2248: “llvm::Function::getBasicBlockList”: 无法访问 private 成员(在“llvm::Function”类中声明)
D:\Projects\llvm-project\llvm\include\llvm/IR/Function.h(772): note: 参见“llvm::Function::getBasicBlockList”的声明
D:\Projects\llvm-project\llvm\include\llvm/IR/Function.h(61): note: 参见“llvm::Function”的声明
```

LLVM18 中已经把 getBasicBlockList 改为了 private，但是增加了splice等函数。

把 llvm/lib/Passes/Obfuscation/IPObfuscationContext.cpp 中

```
NF->getBasicBlockList().splice(NF->begin(), F->getBasicBlockList());
```

改为

```
NF->splice(NF->begin(), F)
```

参考： [https://github.com/DreamSoule/ollvm17/issues/37](https://github.com/DreamSoule/ollvm17/issues/37)

### 5.4 error C2664: “llvm::AllocaInst llvm::DemoteRegToStack

```ruby
[193/2642] Building CXX object lib\Passes\CMakeFiles\LLVMPasses.dir\Obfuscation\Utils.cpp.obj
FAILED: lib/Passes/CMakeFiles/LLVMPasses.dir/Obfuscation/Utils.cpp.obj
D:\App\VisualStudio\IDE\VC\Tools\MSVC\14.42.34433\bin\Hostx64\x64\cl.exe  /nologo /TP -DUNICODE -D_CRT_NONSTDC_NO_DEPRECATE -D_CRT_NONSTDC_NO_WARNINGS -D_CRT_SECURE_NO_DEPRECATE -D_CRT_SECURE_NO_WARNINGS -D_SCL_SECURE_NO_DEPRECATE -D_SCL_SECURE_NO_WARNINGS -D_UNICODE -D__STDC_CONSTANT_MACROS -D__STDC_FORMAT_MACROS -D__STDC_LIMIT_MACROS -ID:\Projects\llvm-project\build\lib\Passes -ID:\Projects\llvm-project\llvm\lib\Passes -ID:\Projects\llvm-project\build\include -ID:\Projects\llvm-project\llvm\include /utf-8 /Zc:inline /Zc:preprocessor /Zc:__cplusplus /Oi /bigobj /permissive- /W4 -wd4141 -wd4146 -wd4244 -wd4267 -wd4291 -wd4351 -wd4456 -wd4457 -wd4458 -wd4459 -wd4503 -wd4624 -wd4722 -wd4100 -wd4127 -wd4512 -wd4505 -wd4610 -wd4510 -wd4702 -wd4245 -wd4706 -wd4310 -wd4701 -wd4703 -wd4389 -wd4611 -wd4805 -wd4204 -wd4577 -wd4091 -wd4592 -wd4319 -wd4709 -wd5105 -wd4324 -w14062 -we4238 /Gw /O2 /Ob2 /DNDEBUG -std:c++17 -MD  /EHsc /GR /showIncludes /Folib\Passes\CMakeFiles\LLVMPasses.dir\Obfuscation\Utils.cpp.obj /Fdlib\Passes\CMakeFiles\LLVMPasses.dir\LLVMPasses.pdb /FS -c D:\Projects\llvm-project\llvm\lib\Passes\Obfuscation\Utils.cpp
D:\Projects\llvm-project\llvm\lib\Passes\Obfuscation\Utils.cpp(213): error C2664: “llvm::AllocaInst *llvm::DemoteRegToStack(llvm::Instruction &,bool,llvm::Instruction *)”: 无法将参数 3 从“llvm::ilist_iterator_w_bits<OptionsT,false,false>”转换为“llvm::Instruction *”
        with
        [
            OptionsT=llvm::ilist_detail::node_options<llvm::Instruction,false,false,llvm::ilist_detail::extract_tag<>::type,true>
        ]
D:\Projects\llvm-project\llvm\lib\Passes\Obfuscation\Utils.cpp(213): note: 没有可用于执行该转换的用户定义的转换运算符，或者无法调用该运算符
D:\Projects\llvm-project\llvm\include\llvm/Transforms/Utils/Local.h(207): note: 参见“llvm::DemoteRegToStack”的声明
D:\Projects\llvm-project\llvm\lib\Passes\Obfuscation\Utils.cpp(213): note: 尝试匹配参数列表“(llvm::Instruction, bool, llvm::ilist_iterator_w_bits<OptionsT,false,false>)” 时
        with
        [
            OptionsT=llvm::ilist_detail::node_options<llvm::Instruction,false,false,llvm::ilist_detail::extract_tag<>::type,true>
        ]
D:\Projects\llvm-project\llvm\lib\Passes\Obfuscation\Utils.cpp(225): error C2664: “llvm::AllocaInst *llvm::DemotePHIToStack(llvm::PHINode *,llvm::Instruction *)”: 无法将 参数 2 从“llvm::ilist_iterator_w_bits<OptionsT,false,false>”转换为“llvm::Instruction *”
        with
        [
            OptionsT=llvm::ilist_detail::node_options<llvm::Instruction,false,false,llvm::ilist_detail::extract_tag<>::type,true>
        ]
D:\Projects\llvm-project\llvm\lib\Passes\Obfuscation\Utils.cpp(225): note: 没有可用于执行该转换的用户定义的转换运算符，或者无法调用该运算符
D:\Projects\llvm-project\llvm\include\llvm/Transforms/Utils/Local.h(214): note: 参见“llvm::DemotePHIToStack”的声明
D:\Projects\llvm-project\llvm\lib\Passes\Obfuscation\Utils.cpp(225): note: 尝试匹配参数列表“(llvm::PHINode *, llvm::ilist_iterator_w_bits<OptionsT,false,false>)”时
        with
        [
            OptionsT=llvm::ilist_detail::node_options<llvm::Instruction,false,false,llvm::ilist_detail::extract_tag<>::type,true>
        ]
```

DemoteRegToStack 函数调用：在LLVM 18.1.8中，DemoteRegToStack 的参数包括：

-   需要转为栈变量的 Instruction。
    
-   一个布尔值表示是否添加调试信息。
    
-   一个插入点指针，指定插入位置。
    

把

```
DemoteRegToStack(*I, false, AllocaInsertionPoint->getIterator());
```

改为

```
DemoteRegToStack(*Inst, false, AllocaInsertionPoint); // 修复函数调用
```

把

```
DemotePHIToStack(cast<PHINode>(I), AllocaInsertionPoint->getIterator());
```

改为

```
DemotePHIToStack(cast<PHINode>(Inst), AllocaInsertionPoint); // 修复函数调用
```

## 编译 OLLVM

执行 ninja 命令编译集成了 Obfuscation 插件的 LLVM 工程

```sql
D:\Projects\llvm-project\build>ninja

[0/1] Re-running CMake...CMake Deprecation Warning at D:/Projects/llvm-project/cmake/Modules/CMakePolicy.cmake:6 (cmake_policy):
  The OLD behavior for policy CMP0114 will be removed from a future version
  of CMake.

  The cmake-policies(7) manual explains that the OLD behaviors of all
  policies are deprecated and that a policy should be set to OLD only under
  specific short-term circumstances.  Projects should be ported to the NEW
  behavior and not rely on setting a policy to OLD.
Call Stack (most recent call first):
  CMakeLists.txt:6 (include)


CMake Deprecation Warning at D:/Projects/llvm-project/cmake/Modules/CMakePolicy.cmake:11 (cmake_policy):
  The OLD behavior for policy CMP0116 will be removed from a future version
  of CMake.

  The cmake-policies(7) manual explains that the OLD behaviors of all
  policies are deprecated and that a policy should be set to OLD only under
  specific short-term circumstances.  Projects should be ported to the NEW
  behavior and not rely on setting a policy to OLD.
Call Stack (most recent call first):
  CMakeLists.txt:6 (include)


-- bolt project is disabled
-- clang project is enabled
-- clang-tools-extra project is disabled
-- compiler-rt project is disabled
-- cross-project-tests project is disabled
-- libc project is disabled
-- libclc project is disabled
-- lld project is disabled
-- lldb project is disabled
-- mlir project is disabled
-- openmp project is disabled
-- polly project is disabled
-- pstl project is disabled
-- flang project is disabled
-- Could NOT find ZLIB (missing: ZLIB_LIBRARY ZLIB_INCLUDE_DIR)
-- Could NOT find LibXml2 (missing: LIBXML2_LIBRARY LIBXML2_INCLUDE_DIR)
-- Could NOT find Backtrace (missing: Backtrace_LIBRARY Backtrace_INCLUDE_DIR)
-- LLVM host triple: x86_64-pc-windows-msvc
-- Native target architecture is X86
-- Threads enabled.
-- Doxygen disabled.
-- Ninja version: 1.12.1
-- Could NOT find OCaml (missing: OCAMLFIND OCAML_VERSION OCAML_STDLIB_PATH)
-- OCaml bindings disabled.
-- LLVM default target triple: x86_64-pc-windows-msvc
-- LLVMHello ignored -- Loadable modules not supported on this platform.
-- Obfuscation ignored -- Loadable modules not supported on this platform.
-- Registering Obfuscation as a pass plugin (static build: OFF)
-- Targeting AArch64
-- Targeting AMDGPU
-- Targeting ARM
-- Targeting AVR
-- Targeting BPF
-- Targeting Hexagon
-- Targeting Lanai
-- Targeting LoongArch
-- Targeting Mips
-- Targeting MSP430
-- Targeting NVPTX
-- Targeting PowerPC
-- Targeting RISCV
-- Targeting Sparc
-- Targeting SystemZ
-- Targeting VE
-- Targeting WebAssembly
-- Targeting X86
-- Targeting XCore
CMake Deprecation Warning at D:/Projects/llvm-project/cmake/Modules/CMakePolicy.cmake:6 (cmake_policy):
  The OLD behavior for policy CMP0114 will be removed from a future version
  of CMake.

  The cmake-policies(7) manual explains that the OLD behaviors of all
  policies are deprecated and that a policy should be set to OLD only under
  specific short-term circumstances.  Projects should be ported to the NEW
  behavior and not rely on setting a policy to OLD.
Call Stack (most recent call first):
  D:/Projects/llvm-project/clang/CMakeLists.txt:6 (include)


CMake Deprecation Warning at D:/Projects/llvm-project/cmake/Modules/CMakePolicy.cmake:11 (cmake_policy):
  The OLD behavior for policy CMP0116 will be removed from a future version
  of CMake.

  The cmake-policies(7) manual explains that the OLD behaviors of all
  policies are deprecated and that a policy should be set to OLD only under
  specific short-term circumstances.  Projects should be ported to the NEW
  behavior and not rely on setting a policy to OLD.
Call Stack (most recent call first):
  D:/Projects/llvm-project/clang/CMakeLists.txt:6 (include)


-- Clang version: 18.1.8
-- BugpointPasses ignored -- Loadable modules not supported on this platform.
-- git version: v0.0.0-dirty normalized to 0.0.0
-- Version: 1.6.0
-- Performing Test HAVE_GNU_POSIX_REGEX -- failed to compile
-- Performing Test HAVE_POSIX_REGEX -- failed to compile
CMake Warning at D:/Projects/llvm-project/third-party/benchmark/CMakeLists.txt:308 (message):
  Using std::regex with exceptions disabled is not fully supported


-- Performing Test HAVE_STEADY_CLOCK -- success
-- Configuring done (11.6s)
-- Generating done (6.0s)
-- Build files have been written to: D:/Projects/llvm-project/build

[90/91] Linking CXX executable bin\clang-repl.exe
```

或者清理编译目录，强制 Ninja 重编译

```
ninja -t clean && ninja
```

编译完成后，clang 可执行程序就在 bin 目录下

执行下面命令添加 bin 目录到环境变量

```
set PATH=%PATH%;D:\Projects\llvm-project\build\bin
```

查看 clang 版本

```
D:\Projects\llvm-project\build>clang --version
clang version 18.1.8 (https://github.com/CYRUS-STUDIO/LLVM.git ef434b52242435ea693926d9d658fc783cfbf3be)
Target: x86_64-pc-windows-msvc
Thread model: posix
InstalledDir: D:\Projects\llvm-project\build\bin
```

## 测试

编写 add.c 源码

```cpp
#include <stdio.h>

int main() {
    int a = 1;
    int b = 1;
    int sum;

    // 执行加法运算
    sum = a + b;

    // 输出运算结果
    printf("结果是: %d + %d = %d\n", a, b, sum);

    return 0;
}
```

使用 clang 编译 add.c

```
clang add.c -o add.exe
```

执行 add 程序

[![word/media/image5.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/bda9a4a769a954e4.png)](data:image/png;base64,inline-8718B)

使用 IDA 反汇编 main 方法的汇编代码如下

```
var_10= dword ptr -10h   ; 局部变量 var_10，相对于栈顶 rsp 偏移 -10h
var_C= dword ptr -0Ch    ; 局部变量 var_C，相对于栈顶 rsp 偏移 -0Ch
var_8= dword ptr -8      ; 局部变量 var_8，相对于栈顶 rsp 偏移 -8
var_4= dword ptr -4      ; 局部变量 var_4，相对于栈顶 rsp 偏移 -4

sub     rsp, 38h                   ; 为栈帧分配 56 字节 (38h)，调整栈指针 rsp
mov     [rsp+38h+var_4], 0         ; 初始化局部变量 var_4 为 0
mov     [rsp+38h+var_8], 1         ; 初始化局部变量 var_8 为 1
mov     [rsp+38h+var_C], 1         ; 初始化局部变量 var_C 为 1
mov     eax, [rsp+38h+var_8]       ; 将 var_8 (值为 1) 加载到 eax
add     eax, [rsp+38h+var_C]       ; 将 eax 加上 var_C 的值 (1)，结果 eax = 1 + 1 = 2
mov     [rsp+38h+var_10], eax      ; 将计算结果 (2) 存储到局部变量 var_10
mov     r9d, [rsp+38h+var_10]      ; 将 var_10 的值 (2) 加载到寄存器 r9d
mov     r8d, [rsp+38h+var_C]       ; 将 var_C 的值 (1) 加载到寄存器 r8d
mov     edx, [rsp+38h+var_8]       ; 将 var_8 的值 (1) 加载到寄存器 edx
lea     rcx, unk_140016320         ; 将地址 unk_140016320 加载到寄存器 rcx
call    sub_140001050              ; 调用函数 sub_140001050，传递的参数为：
                                    ; rcx = unk_140016320
                                    ; rdx = var_8 (值 1)
                                    ; r8 = var_C (值 1)
                                    ; r9 = var_10 (值 2)
xor     eax, eax                   ; 将 eax 置为 0，通常用于函数返回值
add     rsp, 38h                   ; 恢复栈指针 rsp，撤销栈帧分配
retn                               ; 返回调用者
```

编译 add.c 并启用使用指令替换混淆

```
# 使用指令替换混淆代码
clang -mllvm -sub add.c -o add.exe
# 或者
clang -mllvm -sub -mllvm -sub_loop=3 add.c -o add.exe
```

使用 IDA 反汇编混淆后的程序汇编代码如下

```
sub     rsp, 38h                   ; 为栈帧分配 56 字节的空间 (38h = 56)，调整栈指针 rsp
mov     [rsp+38h+var_4], 0         ; 将局部变量 var_4 初始化为 0
mov     [rsp+38h+var_8], 1         ; 将局部变量 var_8 初始化为 1
mov     [rsp+38h+var_C], 1         ; 将局部变量 var_C 初始化为 1
mov     eax, [rsp+38h+var_8]       ; 将局部变量 var_8 的值 (1) 加载到 eax 中
mov     edx, [rsp+38h+var_C]       ; 将局部变量 var_C 的值 (1) 加载到 edx 中
xor     ecx, ecx                   ; 使用异或指令将 ecx 清零 (ecx = 0)
sub     ecx, edx                   ; 计算 ecx = 0 - edx (此时 ecx = -1)
sub     eax, ecx                   ; 计算 eax = eax - ecx，即 eax = 1 - (-1) = 2
mov     [rsp+38h+var_10], eax      ; 将结果 eax (2) 存储到局部变量 var_10
mov     r9d, [rsp+38h+var_10]      ; 将局部变量 var_10 的值 (2) 加载到 r9d
mov     r8d, [rsp+38h+var_C]       ; 将局部变量 var_C 的值 (1) 加载到 r8d
mov     edx, [rsp+38h+var_8]       ; 将局部变量 var_8 的值 (1) 加载到 edx
lea     rcx, unk_140016320         ; 加载地址 unk_140016320 到 rcx
call    sub_140001050              ; 调用子函数 sub_140001050，参数顺序：
                                    ; rcx (地址 unk_140016320)
                                    ; rdx (局部变量 var_8 的值 1)
                                    ; r8  (局部变量 var_C 的值 1)
                                    ; r9  (局部变量 var_10 的值 2)
xor     eax, eax                   ; 清零 eax，通常用于设置函数返回值为 0
add     rsp, 38h                   ; 恢复栈指针 rsp，撤销之前的栈帧分配
retn                               ; 返回调用者
```

可以看到 add eax, \[rsp+38h+var_C\] 指令已经被替换成

```
xor     ecx, ecx                   ; 使用异或指令将 ecx 清零 (ecx = 0)
sub     ecx, edx                   ; 计算 ecx = 0 - edx (此时 ecx = -1)
sub     eax, ecx                   ; 计算 eax = eax - ecx，即 eax = 1 - (-1) = 2
```

但程序的执行输出结果是一样的

[![word/media/image6.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/8bc1095de7029fa9.png)](data:image/png;base64,inline-8598B)

## 功能介绍

OLLVM 文档： [https://github.com/obfuscator-llvm/obfuscator/wiki/Features](https://github.com/obfuscator-llvm/obfuscator/wiki/Features)

[![word/media/image7.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/0ceffd118ab9ff4b.png)](data:image/png;base64,inline-92626B)

## 1\. Instructions Substitution（指令替换）

Instruction Substitution 是将一些常用的简单指令替换为具有等效逻辑但更加复杂的指令序列，从而提高代码逆向分析的难度。

使用 clang 编译时通过添加下面的参数启用指令替换功能

```
-mllvm -sub
```

或者，启用指令替换功能，并对每个指令应用3次替换操作（默认为1次）

```
-mllvm -sub -mllvm -sub_loop=3
```

实现原理：

-   在 LLVM 的 Pass 管道中实现一个 Transformation Pass。
    
-   遍历 IR 指令，将目标指令替换为复杂的等效指令序列。
    

目前已实现加、减、与、或、异或指令的替换。比如加法运算 a + b：

替换为：a - (-b)

等价 LLVM IR 为：

```
%0 = load i32* %a, align 4       ; 从指针 %a 加载一个 32 位整数到 %0，%a 是一个 4 字节对齐的内存地址
%1 = load i32* %b, align 4       ; 从指针 %b 加载一个 32 位整数到 %1，%b 是一个 4 字节对齐的内存地址
%2 = sub i32 0, %1               ; 计算 0 - %1，结果存储到 %2，相当于取 %1 的相反数（-b）
%3 = sub nsw i32 %0, %2          ; 计算 %0 - %2，结果存储到 %3，其中 nsw（No Signed Wrap）指示结果不会发生有符号溢出
```

参考： [Instructions Substitution](https://github.com/obfuscator-llvm/obfuscator/wiki/Instructions-Substitution)

## 2\. Bogus Control Flow（虚假控制流）

Bogus Control Flow（BCF） 是 OLLVM（Obfuscation LLVM）的一种控制流混淆技术。

BCF 的核心思想是通过增加虚假的分支语句，构造看似复杂的控制流图（CFG），让逆向分析者难以理解程序的真实逻辑。这些分支通常通过难以猜测的条件判断来决定执行路径，但无论选择哪条路径，最终的逻辑都保持正确。

比如，未混淆的代码示例：

```
int add(int a, int b) {
    return a + b;
}
```

经过 Bogus Control Flow 混淆后的代码可能变成这样：

```java
int add(int a, int b) {
    int bogus_condition = (a ^ b) & 0x1;  // 伪条件
    if (bogus_condition) {
        // 虚假路径
        for (int i = 0; i < 10; i++) {
            a += i;  // 无意义的计算
        }
    } else {
        // 真正的逻辑
        return a + b;
    }
    // 伪条件的控制下，总是返回正确的值
    return a + b;
}
```

使用 clang 编译时通过添加下面的参数启用虚假控制流功能

```
-mllvm -bcf
```

启用虚假控制流，并对一个函数应用 3 次虚假控制流转换。默认值为 1。

```
-mllvm -bcf -mllvm -bcf_loop=3
```

启用虚假控制流，并以 40% 的概率对基本块进行混淆。默认值为 30%。

```
-mllvm -bcf -mllvm -bcf_prob=40
```

创建 bcf.c，源码如下：

```cpp
#include <stdlib.h>  

int main(int argc, char** argv) {

    int a = atoi(argv[1]);  
    // 使用 `atoi` 函数将命令行的第一个参数（argv[1]）转换为整数，并赋值给变量 `a`。

    if (a == 0)  
        // 检查变量 `a` 是否为 0。
        return 1;  
        // 如果 `a` 为 0，返回值 1，程序结束。

    else  
        return 10;  
        // 如果 `a` 不为 0，返回值 10，程序结束。

    return 0;  
}
```

编译 bcf.c ，并启用虚假控制流

```
clang -mllvm -bcf bcf.c -o bcf.exe
```

测试混淆后的程序，输出一致

```
D:\Projects\llvm-project\build>bcf.exe 0

D:\Projects\llvm-project\build>echo %errorlevel%
1

D:\Projects\llvm-project\build>bcf.exe 1

D:\Projects\llvm-project\build>echo %errorlevel%
10
```

程序未混淆时 main 方法的控制流图如下

[![word/media/image8.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/289ce98288c865b2.png)](data:image/png;base64,inline-148722B)

经过 Bogus Control Flow 混淆后

[![word/media/image9.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/6c10e48677e21191.png)](data:image/png;base64,inline-26486B)

参考： [Bogus Control Flow](https://github.com/obfuscator-llvm/obfuscator/wiki/Bogus-Control-Flow)

## 3\. Control Flow Flattening（控制流平坦化）

Control Flow Flattening（控制流平坦化）通过引入一个调度变量和统一的调度循环，将程序的所有基本块按编号管理，使用条件跳转动态调度执行顺序，从而隐藏原始控制流结构。

例如，原始代码如下

```java
int calculate(int x) {
    if (x > 0) {
        return x * 2;
    } else {
        return -x;
    }
}
```

平坦化后的代码

```java
int calculate(int x) {
    int dispatcher = 0;
    int result = 0;

    while (1) {
        switch (dispatcher) {
            case 0:  // 起始块
                if (x > 0) {
                    dispatcher = 1;  // 跳转到正数处理
                } else {
                    dispatcher = 2;  // 跳转到负数处理
                }
                break;

            case 1:  // 正数处理块
                result = x * 2;
                dispatcher = 3;  // 跳转到结束块
                break;

            case 2:  // 负数处理块
                result = -x;
                dispatcher = 3;  // 跳转到结束块
                break;

            case 3:  // 结束块
                return result;

            default:
                return -1;  // 错误路径
        }
    }
}
```

使用 clang 编译时通过添加下面的参数，启用控制流平坦化（Control Flow Flattening）。

```
-mllvm -fla
```

启用基本块拆分，将目标基本块分割为更小的基本块，与平坦化结合使用直接增加控制流的复杂性。

```
-mllvm -split
```

指定对每个基本块拆分的次数。默认值为 1。

```
-mllvm -split_num=3
```

创建 fla.c，源码如下

```cpp
#include <stdlib.h>
int main(int argc, char** argv) {
  int a = atoi(argv[1]);
  if(a == 0)
    return 1;
  else
    return 10;
  return 0;
}
```

编译 fla.c ，并启用控制流平坦化

```
clang -mllvm -fla fla.c -o fla.exe
```

测试 fla.exe 执行结果

```
D:\Projects\llvm-project\build>fla 0

D:\Projects\llvm-project\build>echo %errorlevel%
1
```

参考： [Control Flow Flattening](https://github.com/obfuscator-llvm/obfuscator/wiki/Control-Flow-Flattening)

## 4\. Functions annotations

Function Annotations（函数注解） 是 OLLVM 提供的一种灵活的配置机制，允许开发者通过注解的方式对特定函数应用或排除混淆优化。

通过这种方式，可以精确控制混淆的范围和强度，从而在安全性和性能之间找到平衡点。

你可以为每个函数添加一个或多个注释。如果你想禁用函数上的混淆，你还可以使用“反向标志”（例如，如果你想禁用函数上的虚假控制流，使用注释“nobcf”）。

```javascript
__attribute__((annotate("bcf"))) void obfuscated_function() {
    // 此函数将被应用虚假控制流混淆
}

 __attribute__((annotate("fla,split"))) void secure_function() {
    // 同时应用控制流平坦化和基本块拆分混淆
}

__attribute__((annotate("nobcf"))) void critical_function() {
    // 禁止虚假控制流混淆
}
```

OLLVM 常用注解如下：

-   sub：启用指令替换（Instructions Substitution）。
    
-   fla：启用控制流平坦化（Control Flow Flattening）。
    
-   split：启用基本块拆分（Basic Block Splitting）。
    
-   bcf：启用虚假控制流（Bogus Control Flow）。
    
-   no_xxx：禁止 OLLVM 对该函数应用 xxx 混淆。
    

创建 fa.c，源码如下

```cpp
#include <stdlib.h>
__attribute__((annotate("bcf"))) int main(int argc, char** argv) {
  int a = atoi(argv[1]);
  if(a == 0)
    return 1;
  else
    return 10;
  return 0;
}
```

编译 fa.c

```
clang fa.c -o fa.exe
```

测试 fa.exe 正常运行

```
D:\Projects\llvm-project\build>fa 0

D:\Projects\llvm-project\build>echo %errorlevel%
1
```

使用 IDA 打开 fa.exe 可以看到 main 函数成功应用了虚假控制流

[![word/media/image10.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/a9faa2741c7d7ea8.png)](data:image/png;base64,inline-119234B)

参考： [Functions annotations](https://github.com/obfuscator-llvm/obfuscator/wiki/Functions-annotations)

## 完整源码

开源地址： [https://github.com/CYRUS-STUDIO/LLVM](https://github.com/CYRUS-STUDIO/LLVM)

参考：

-   [https://github.com/wwh1004/ollvm-16](https://github.com/wwh1004/ollvm-16)
    
-   [https://github.com/DreamSoule/ollvm17](https://github.com/DreamSoule/ollvm17)
    
-   [移植到19.1.0所需要的diff文件](https://github.com/DreamSoule/ollvm17/issues/38)
