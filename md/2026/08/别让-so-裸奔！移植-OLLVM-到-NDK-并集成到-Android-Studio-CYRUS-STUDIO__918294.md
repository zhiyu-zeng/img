---
title: 别让 so 裸奔！移植 OLLVM 到 NDK 并集成到 Android Studio // CYRUS STUDIO
source: https://cyrus-studio.github.io/blog/posts/%E5%88%AB%E8%AE%A9-so-%E8%A3%B8%E5%A5%94%E7%A7%BB%E6%A4%8D-ollvm-%E5%88%B0-ndk-%E5%B9%B6%E9%9B%86%E6%88%90%E5%88%B0-android-studio/
source_host: cyrus-studio.github.io
clip_date: 2026-08-04T14:17:21+08:00
trace_id: 2f93d99c-a6b1-4e78-940e-e4492eedfb9e
content_hash: 6d77c26588a52cfc0acf1f5694acf10309f08e9639caabb98b7c254cddcbbdaf
status: synced
tags:
  - 编译器保护
  - Android逆向
series: null
feed_source: Cyrus Studio·安卓逆向
ai_summary: OLLVM 可通过移植到 NDK 工具链，让 Android Studio 的 Native so 在编译期获得控制流平坦化、虚假控制流、指令替换等混淆保护，且 Release 模式下需对目标关闭 -O2/-O3 才能保住混淆效果。
ai_summary_style: key-points
images_status:
  total: 12
  succeeded: 12
  failed_urls: []
notion_page_id: 3b275244-d011-81d5-bd93-d35d41639dc6
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
> OLLVM 可通过移植到 NDK 工具链，让 Android Studio 的 Native so 在编译期获得控制流平坦化、虚假控制流、指令替换等混淆保护，且 Release 模式下需对目标关闭 -O2/-O3 才能保住混淆效果。
> 
> - **工具链背景：** NDK r18 起官方使用 LLVM/Clang，OLLVM 是基于 LLVM 的扩展，通过插入混淆 Pass 保护 C/C++ 代码；编译流程为源码→Clang 生成 IR→OLLVM 混淆→后端优化→链接生成 so。
> - **移植步骤：** 根据 NDK 内置 clang 版本（示例为 18.0.2）下载相近 LLVM 源码，cmake 配置 `-DLLVM_ENABLE_PROJECTS="clang;lld"` 后 ninja 编译，将构建产物的 bin、include、lib 目录覆盖到 `<ndk>/toolchains/llvm/prebuilt/<host>/` 路径下。
> - **工程集成：** 在 local.properties 设置 `ndk.dir` 指向替换后的 NDK；CMake 中用 `-mllvm` 参数启用混淆，如 `add_definitions("-mllvm -sub")` 全局开启指令替换，或用 `target_compile_options` 对特定动态库开启 `-bcf`、`-fla`、`-sobf`；多个 `-mllvm` 参数需用 `"SHELL:-mllvm -xxx"` 包裹防止 CMake 拆分。
> - **函数级控制：** 使用 `__attribute__((annotate("nobcf,fla")))` 可针对单个 JNI 函数禁用/启用指定混淆，例如禁用虚假控制流并启用控制流平坦化。
> - **Release 失效与修复：** Debug 运行混淆正常，但 assembleRelease 默认 -O2/-O3 的后续优化会消除假控制流、折叠加密字符串；解决方式是使用 `set_source_files_properties` 或 `target_compile_options` 对需要混淆的源码/库添加 `-O0` 再叠加 OLLVM 参数，并配合 `-fvisibility=hidden` 隐藏符号。

> 版权归作者所有，如有转发，请注明文章出处： [https://cyrus-studio.github.io/blog/](https://cyrus-studio.github.io/blog/)

## 前言

在 Android 应用安全中， **Native 层 so 库往往是最容易被逆向分析的目标**。无论是游戏的核心逻辑，还是 App 的关键算法，一旦 so 被反编译，核心代码就可能暴露无遗。

传统的 Java 层混淆工具（如 ProGuard、R8）对 C/C++ 代码无能为力，因此 **NDK 层代码的保护** 成了安全加固中的难点。解决思路： **在编译阶段对 so 进行混淆处理**，让逆向难度大幅提升。

LLVM 生态中有一个安全扩展 —— **OLLVM (Obfuscator-LLVM)**，它在编译流程里插入了混淆 Pass，能对 C/C++ 代码做 **控制流平坦化、虚假控制流、指令替换** 等处理，从而显著增加逆向门槛。

本文将带你实战： **如何将 OLLVM 移植到 LLVM/NDK，并在 Android Studio 工程中使用它，为 Native 代码加上一层混淆保护。**

## OLLVM、LLVM 与 Android NDK

**LLVM** 是一个高度模块化的编译器框架，它能够将 C/C++ 等高级语言源码编译为中间表示（LLVM IR），再经过优化、生成目标机器码。它不仅仅是一个编译器，更是一个“编译基础设施”。

在 Android 平台上，自 **NDK r18** 开始，Google 就全面弃用了 GCC，转而采用 **LLVM/Clang** 作为官方工具链。也就是说，所有的 C/C++ 代码编译、优化、生成 so 库的过程，底层都是由 LLVM 驱动完成的。

**OLLVM (Obfuscator-LLVM)** 则是在 LLVM 基础上扩展的一个安全项目。它在 LLVM 编译流程中增加了混淆 Pass，可以对 C/C++ 代码进行 **控制流平坦化、虚假控制流、指令替换** 等混淆处理，从而有效提高逆向分析和反编译的难度，保护 Android 应用中 Native so 层的核心逻辑不被轻易破解。

最终实现编译流程大概如下：

```
          ┌──────────────────┐
          │   C / C++ 源码    │
          └────────┬─────────┘
                   │
                   ▼
          ┌──────────────────┐
          │   LLVM (Clang)   │  ← Android NDK 内置的官方编译器工具链
          │   前端：生成 IR   │
          └────────┬─────────┘
                   │ LLVM IR
                   ▼
          ┌──────────────────┐
          │    OLLVM Pass    │  ← 基于 LLVM 的扩展：混淆（控制流平坦化、指令替换等）
          │   （插入在中间） │
          └────────┬─────────┘
                   │ 混淆后的 IR
                   ▼
          ┌──────────────────┐
          │   LLVM 后端优化   │
          │   + 代码生成      │
          └────────┬─────────┘
                   │ 汇编
                   ▼
          ┌──────────────────┐
          │   链接生成 so     │ ← 最终供 Android 应用调用的 native 库
          └──────────────────┘
```

## 编译 LLVM

## 1\. 下载源码

NDK 中 LLVM 所在路径：<android-ndk>/toolchains/llvm/prebuilt/<host-system>/bin/

[![word/media/image1.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/f0448869110ad954.png)](data:image/png;base64,inline-125170B)

查看 clang 版本，这里版本是 18.0.2

```swift
(base) PS D:\App\android\sdk\ndk\27.1.12297006\toolchains\llvm\prebuilt\windows-x86_64\bin> ./clang --version

Android (12285214, based on r522817b) clang version 18.0.2 (https://android.googlesource.com/toolchain/llvm-project d8003a456d14a3deb8054cdaa529ffbf02d9b262)
Target: x86_64-w64-windows-gnu
Thread model: posix
InstalledDir: D:/App/android/sdk/ndk/27.1.12297006/toolchains/llvm/prebuilt/windows-x86_64/bin
```

根据 NDK 中 clang 的版本，下载和编译版本相近的 LLVM。

关于 LLVM 源码下载和编译参考： [LLVM 全面解析：NDK 为什么离不开它？如何亲手编译调试 clang](https://cyrus-studio.github.io/blog/posts/llvm-%E5%85%A8%E9%9D%A2%E8%A7%A3%E6%9E%90ndk-%E4%B8%BA%E4%BB%80%E4%B9%88%E7%A6%BB%E4%B8%8D%E5%BC%80%E5%AE%83%E5%A6%82%E4%BD%95%E4%BA%B2%E6%89%8B%E7%BC%96%E8%AF%91%E8%B0%83%E8%AF%95-clang/)

## 2\. 构建环境设置

创建并进入构建目录

```
mkdir build && cd build
```

配置编译目标

```
cmake -G "Ninja" -DCMAKE_BUILD_TYPE=Release -DCMAKE_CXX_FLAGS="/utf-8" -DLLVM_ENABLE_RTTI=ON -DLLVM_ENABLE_EH=ON -DLLVM_ENABLE_PROJECTS="clang;lld" ../llvm
```

## 3\. 编译

编译目标设置完成后，执行 ninja 开始编译。

```
D:\Projects\llvm-project\build>ninja
[1651/2426] Building CXX object tools\lld\ELF\CMakeFiles\lldELF.dir\Arch\LoongArch.cpp.obj
D:\Projects\llvm-project\lld\ELF\Arch\LoongArch.cpp(705): warning C4334: “<<”: 32 位移位的结果被隐式转换为 64 位(是否希望进行 64 位移位?)
[2426/2426] Linking CXX executaset PATH=%PATH%;D:\Projects\llvm-project\build\bin
```

## 移植 OLLVM 到 Android NDK

 [![word/media/image2.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/2f476713f544a0ac.png)](data:image/png;base64,inline-72434B)这是 Android NDK 中 toolchains\\llvm\\prebuilt\\windows-x86_64 目录下的文件夹结构

其中主要几个文件夹：

-   bin：包含可执行文件，例如编译器（clang、clang++）、链接器（ld）等，主要用于 NDK 工具链的操作。
    
-   include：包含头文件，提供编译时所需的接口定义。例如，标准 C/C++ 库的头文件以及与 Android 平台相关的头文件。
    
-   lib：包含静态库和动态库，提供编译和链接时使用的库文件。例如，支持标准 C/C++ 函数的实现库。
    

这些文件共同组成了 Android NDK 的工具链，用于开发和调试 Android native 代码。

当我们成功把 OLLVM 移植到 LLVM，并编译完成后可以在构建目录下看到同样也有相关目录

[![word/media/image3.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/fff5e1ae2a6cf15d.png)](data:image/png;base64,inline-73014B)

关于 OLLVM 移植到 LLVM 过程参考：

-   [OLLVM 移植 LLVM 18 实战，轻松实现 C&C++ 代码混淆](https://cyrus-studio.github.io/blog/posts/ollvm-%E7%A7%BB%E6%A4%8D-llvm-18-%E5%AE%9E%E6%88%98%E8%BD%BB%E6%9D%BE%E5%AE%9E%E7%8E%B0-cc++-%E4%BB%A3%E7%A0%81%E6%B7%B7%E6%B7%86/)
    
-   [OLLVM 移植 LLVM18 踩坑：一步步调试修复控制流平坦化](https://cyrus-studio.github.io/blog/posts/ollvm-%E7%A7%BB%E6%A4%8D-llvm18-%E8%B8%A9%E5%9D%91%E4%B8%80%E6%AD%A5%E6%AD%A5%E8%B0%83%E8%AF%95%E4%BF%AE%E5%A4%8D%E6%8E%A7%E5%88%B6%E6%B5%81%E5%B9%B3%E5%9D%A6%E5%8C%96/)
    

复制并替换 bin、include、lib 目录到 ndk 中

[![word/media/image4.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/c96d6c89faf3531b.png)](data:image/png;base64,inline-181070B)

## Android Studio 中使用 OLLVM

## 1\. 创建 native 工程

[![word/media/image5.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/078e78ff0dd86a03.png)](data:image/png;base64,inline-131166B)

## 2\. 配置 OLLVM NDK

编辑 local.properties 添加 ndk.dir 配置为 ollvm ndk 路径

```
ndk.dir=D\:\\App\\android\\sdk\\ndk\\27.1.12297006
```

[![word/media/image6.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/689bd31dc2cdb563.png)](data:image/png;base64,inline-90206B)

## 3\. 代码实现

创建 OLLVMActivity，定义并调用 native 方法

```kotlin
/**
 * 移植 OLLVM 到 Android NDK
 */
class OLLVMActivity : AppCompatActivity() {

    // 声明 native 方法
    external fun sub(a: Int, b: Int): Int
    external fun bcf(input: String?): String?
    external fun fla(x: Int, y: Int): String?

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_ollvmactivity)
        // 加载本地库
        System.loadLibrary("ollvm-lib");

        // 调用 native 方法并显示结果
        val textView = findViewById<TextView>(R.id.textView)

        val subResult = sub(10, 5)
        val bcfResult = bcf("Hello OLLVM!")
        val flaResult = fla(3, 2)

        val resultText = """
            sub(10, 5) = $subResult
            bcf("Hello OLLVM!") = $bcfResult
            fla(x, y) = $flaResult
            """.trimIndent()

        textView.text = resultText
    }

}
```

创建 ollvm-lib.cpp 实现 native 方法

```cpp
#include <jni.h>
#include <string>

// sub 方法：两个整数相减
extern "C" JNIEXPORT jint JNICALL
Java_com_cyrus_example_ollvm_OLLVMActivity_sub(JNIEnv* env, jobject, jint a, jint b) {
    return a - b;
}

// bcf 方法：接收字符串并返回拼接后的字符串
extern "C" JNIEXPORT jstring JNICALL
Java_com_cyrus_example_ollvm_OLLVMActivity_bcf(JNIEnv* env, jobject, jstring input) {
    const char* inputStr = env->GetStringUTFChars(input, nullptr);
    std::string result = std::string("BCF: ") + inputStr;
    env->ReleaseStringUTFChars(input, inputStr);
    return env->NewStringUTF(result.c_str());
}

// fla 方法：两个int相加判断大小并返回结果字符串
extern "C" JNIEXPORT jstring JNICALL
Java_com_cyrus_example_ollvm_OLLVMActivity_fla(JNIEnv *env, jobject , jint x, jint y) {
    int sum = x + y;

    // 使用字符串流拼接结果
    std::ostringstream result;

    if (sum < 5) {
        result << "x = " << x << ", y = " << y << ", x + y " << "小于 5";
    } else if(sum == 5){
        result << "x = " << x << ", y = " << y << ", x + y " << "等于 5";
    } else{
        result << "x = " << x << ", y = " << y << ", x + y " << "大于 5";
    }

    // 返回拼接好的字符串
    return env->NewStringUTF(result.str().c_str());
}
```

编辑 CMakeLists.txt，添加动态库 ollvm-lib

```
add_library( # 设置库的名称
        ollvm-lib

        # 设置库的类型
        SHARED

        # 设置源文件路径
        ollvm-lib.cpp)
```

## 4\. 全局混淆

编辑 CMakeLists.txt，添加如下配置启用 OLLVM 混淆

```
# 全局启用指令替换
add_definitions("-mllvm -sub")
```

通过 -mllvm 选项开启 OLLVM 的代码混淆功能：

-   \-mllvm -bcf：启用基本块控制流混淆。
    
-   \-mllvm -fla：启用控制流平坦化。
    
-   \-mllvm -sub：启用指令替换。
    

## 5\. 动态库混淆

编辑 CMakeLists.txt，只为 ollvm-lib 动态库启用虚假控制流

```
# 为 ollvm-lib 动态库启用虚假控制流
target_compile_options(ollvm-lib PRIVATE
        # 关闭优化
        -O0
        # 抹除符号
        -fvisibility=hidden
        -fvisibility-inlines-hidden
        # 虚假控制流
        -mllvm -bcf
)
```

如果有多个编译项

```powershell
target_compile_options(ollvm-lib PRIVATE
        # 关闭优化
        -O0
        # 抹除符号
        -fvisibility=hidden
        -fvisibility-inlines-hidden
        # 字符串加密
        "SHELL:-mllvm -sobf"
        # 虚假控制流
        "SHELL:-mllvm -bcf"
        # 指令替换
        "SHELL:-mllvm -sub"
        # 控制流平坦化
        "SHELL:-mllvm -fla"
)
```

SHELL: 的作用是告诉 CMake 将 -mllvm -bcf 作为一个完整参数传递给 clang，避免在构建过程中被拆成 -mllvm 和 -bcf 两个独立参数，多个 -mllvm 参数时容易被错误拆分。

## 6\. 函数混淆

通过注解为 fla 方法禁用虚假控制流和启用控制流平坦化

```cpp
extern "C" JNIEXPORT jstring JNICALL
__attribute__((annotate("nobcf,fla"))) Java_com_cyrus_example_ollvm_OLLVMActivity_fla(JNIEnv *env, jobject, jint x, jint y) {
    int sum = x + y;

    // 使用字符串流拼接结果
    std::ostringstream result;

    if (sum < 5) {
        result << "x = " << x << ", y = " << y << ", x + y " << "小于 5";
    } else if(sum == 5){
        result << "x = " << x << ", y = " << y << ", x + y " << "等于 5";
    } else{
        result << "x = " << x << ", y = " << y << ", x + y " << "大于 5";
    }

    // 返回拼接好的字符串
    return env->NewStringUTF(result.str().c_str());
}
```

## 测试与验证

编译运行正常

[![word/media/image7.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/604dc008ee669b35.png)](data:image/png;base64,inline-63586B)

把 apk 中的 so 文件解压出来

[![word/media/image8.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/d3deb8297d9fe7b4.png)](data:image/png;base64,inline-52290B)

使用 IDA 打开 libollvm-lib.so，可以看到 sub 函数反汇编视图如下（启用虚假控制流+指令替换）

[![word/media/image9.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/e0b6a59c9beb9331.png)](data:image/png;base64,inline-61302B)

bcf 函数反汇编视图（启用虚假控制流+指令替换）

[![word/media/image10.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/91ba6554a711ce8d.png)](data:image/png;base64,inline-73190B)

fla 函数反汇编视图（禁用虚假控制流并启用控制流平坦化）

[![word/media/image11.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/fb749625ff83571b.png)](data:image/png;base64,inline-69258B)

其他动态库中函数（未启用 OLLVM 混淆）

[![word/media/image12.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/8c3685cb4f37ac05.png)](data:image/png;base64,inline-115858B)

## OLLVM 在 Release 模式下失效的问题分析

Android Studio Run（Debug）时，OLLVM 混淆正常生效

使用 assembleRelease 打包后，发现：

```

.\gradlew.bat clean :library:assembleRelease
```

-   字符串没有加密
    
-   Bogus Control Flow（BCF）部分失效
    

## 1\. 问题原因

OLLVM 的 -bcf 、-sobf 、-fla 本质上都是 LLVM IR Pass。

这些 Pass 通常在 LLVM 优化流水线的前期执行。

而 Release 模式默认会启用：

```
-O2
```

甚至：

```
-O3
```

后续 LLVM 优化阶段会继续对代码进行大量优化，例如：

-   ConstantMerge（字符串合并）
    
-   GlobalOpt（全局优化）
    
-   SimplifyCFG（控制流简化）
    
-   InstCombine（指令折叠）
    

这些优化会把：

-   假控制流重新优化掉
    
-   加密字符串重新折叠成常量
    
-   冗余逻辑直接删除
    

因此就会出现：

```
OLLVM 已经执行，但混淆结果又被后续优化恢复
```

## 2\. 解决方案

最简单的方法：对需要混淆的源码单独关闭优化。

```
set_source_files_properties(
        crypto.cpp
        native_bridge.cpp
        PROPERTIES COMPILE_FLAGS
        "-O0 -mllvm -bcf -mllvm -sobf"
)
```

或者针对需要混淆的 so 动态库关闭优化：

```powershell
target_compile_options(corelogic PRIVATE
        # 关闭优化
        -O0
        # 抹除符号
        -fvisibility=hidden
        -fvisibility-inlines-hidden
        # 虚假控制流
        "SHELL:-mllvm -bcf"
        # 字符串加密
        "SHELL:-mllvm -sobf"
)
```
