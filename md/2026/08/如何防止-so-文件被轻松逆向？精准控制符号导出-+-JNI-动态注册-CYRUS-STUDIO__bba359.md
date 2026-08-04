---
title: 如何防止 so 文件被轻松逆向？精准控制符号导出 + JNI 动态注册 // CYRUS STUDIO
source: https://cyrus-studio.github.io/blog/posts/%E5%A6%82%E4%BD%95%E9%98%B2%E6%AD%A2-so-%E6%96%87%E4%BB%B6%E8%A2%AB%E8%BD%BB%E6%9D%BE%E9%80%86%E5%90%91%E7%B2%BE%E5%87%86%E6%8E%A7%E5%88%B6%E7%AC%A6%E5%8F%B7%E5%AF%BC%E5%87%BA-+-jni-%E5%8A%A8%E6%80%81%E6%B3%A8%E5%86%8C/
source_host: cyrus-studio.github.io
clip_date: 2026-08-04T14:04:53+08:00
trace_id: 9a116902-7e50-4f08-9d5f-8dea73c82935
content_hash: 2ce7d914651b9151c99f3062fca968605dff23c71e52c102973bf0c25c0772af
status: synced
tags:
  - Android逆向
  - 编译器保护
series: null
feed_source: Cyrus Studio·安卓逆向
ai_summary: 通过链接器版本脚本与动态注册 JNI 方法隐藏不必导出的符号，可大幅提升 so 文件的逆向分析门槛。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 3b275244-d011-8173-b92e-df500dd2daa5
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 通过链接器版本脚本与动态注册 JNI 方法隐藏不必导出的符号，可大幅提升 so 文件的逆向分析门槛。
> 
> - **符号隐藏机制：** 使用 GNU 链接器版本脚本（.map 文件），将全局导出限定为 `JNI_*` 和 `Java_*`，其余所有符号标记为 local（隐藏），这样 IDA 等工具就看不到内部函数名。
> - **静态注册风险：** 默认导出的 `Java_com_example_...` 命名会直接暴露 Java 类名与方法名，让攻击者快速定位调用关系。
> - **动态注册阻断线索：** 在 `JNI_OnLoad` 中通过 `RegisterNatives` 把 Java 方法与普通的 C/C++ 函数指针绑定，生成的 so 不再包含暴露名字的 JNI 导出符号，逆向时无法通过函数名反推入口。
> - **编译配置与收益：** 只需在 CMakeLists.txt 添加 `-Wl,--version-script=${CMAKE_SOURCE_DIR}/hide.map` 即可，不影响内部调用和运行时，还能减少 so 文件的体积。

> 版权归作者所有，如有转发，请注明文章出处： [https://cyrus-studio.github.io/blog/](https://cyrus-studio.github.io/blog/)

## 前言

在使用 **Android NDK 编译 so 文件** 时， **默认情况下，所有 public C/C++ 函数都会被导出**。这意味着无论函数是否真正需要对外使用，它们的符号表都会出现在 so 文件中。只要把 so 丢进 **IDA、GHIDRA 等逆向工具**，攻击者就能轻松看到完整的函数名列表，进而快速定位核心逻辑。

[![word/media/image1.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/a00ee75ce272ed67.png)](data:image/png;base64,inline-253730B)

实际上，除了必须导出的 **JNI 函数** 外，其余大多数 C/C++ 函数根本不需要对外暴露。即便不导出，这些函数在 **编译器/链接器内部依然可以正常调用**，运行时也不会受到影响。换句话说，大量符号的默认导出既没有必要，还无形中增加了被逆向的风险。

**必须导出的 JNI 函数：**

| 函数名 | 是否必须导出 | 说明  |
| --- | --- | --- |
| JNI_OnLoad | ✅ 是（总是） | 系统通过 dlsym() 查找，初始化用 |
| Java\_… | ✅ 是（如果用静态注册） | Java 层方法通过名称匹配 |
| JNI_OnUnload | ❌ 否（可选） | 卸载时调用，不导出也不会出错 |
| JNI_OnLoad_LibName（非标准） | ❌ 否（特殊系统扩展） | Android 未使用 |
| JNI_GetCreatedJavaVMs、JNI_CreateJavaVM | ❌ 否 | 仅在 native 启动 JVM 时使用（一般用不到） |

因此，为了提升安全性， **我们需要通过精细化控制导出符号，只保留最小必要的导出集**。这就是 **linker version script** 发挥作用的地方：它能让我们像“白名单”一样，只暴露需要的 JNI 接口，隐藏其他实现函数，从而显著提升逆向门槛。

## 使用 linker version script 精细控制导出

linker version script 是 GNU 链接器（ld）提供的一种机制，用来控制.so 或.a 文件中哪些符号可以导出、哪些必须隐藏。

**一个简单示例：**

创建 hide.map 文件（仅导出所有 JNI\_ 和 Java\_ 开头的 JNI 方法）

```
{
    global:
        JNI_*;
        Java_*;

    local:
        *;
};
```

**含义：**

-   global: 表示这些符号会被导出，可供外部（如 ART）通过 dlsym() 使用。
    
-   Java\_\* 会匹配所有以 Java\_ 开头的方法 —— 即静态注册 JNI 方法。
    
-   local: \*; 表示其余全部符号（如内部 C 函数、C++ mangled 符号、加密算法、字符串处理等）一律隐藏，无法通过 IDA 等工具直接查看函数名。
    

编译时在 CMakeLists.txt 中加上：

```
# 抹除符号
set_target_properties(native-lib PROPERTIES LINK_FLAGS "-Wl,--version-script=${CMAKE_SOURCE_DIR}/hide.map")
```

这样生成的 so 文件中，只有指定的 JNI 函数会对外可见，其他 C/C++ 函数即使是 public 也不会暴露。

参考： [https://android-docs.cn/ndk/guides/symbol-visibility](https://android-docs.cn/ndk/guides/symbol-visibility)

## 测试

重新编译运行，使用 IDA Pro 打开 so ，可以看到只导出了 JNI 相关函数

[![word/media/image2.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/1189bb211456c441.png)](data:image/png;base64,inline-236510B)

只控制导出符号，不影响内部调用，程序运行时不会出错。

[![word/media/image3.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/0183c97e7c45c4d6.png)](data:image/png;base64,inline-110982B)

除了增加逆向难度，同时还能减少 so 文件的体积

[![word/media/image4.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/eec47d752bc471c5.png)](data:image/png;base64,inline-23890B)

## 动态注册 JNI 方法：进一步隐藏调用入口

即使我们通过 **linker version script** 精准控制了导出符号，只保留必要的 JNI 接口，逆向人员依然可以在 so 符号表中看到这些 JNI 函数的完整名字，例如：

```
Java_com_example_native_NativeUtils_secretMethod
```

这种函数名一眼就暴露了 Java 层的类名、方法名，逆向者很容易定位和跟踪调用关系。

Android 的 ART 虚拟机会用 dlsym() 查找你导出的 JNI 方法，所以这些你不能隐藏，否则会导致运行时崩溃。

为了解决这一问题，可以使用 **JNI 动态注册**。动态注册的思路是：

-   在 C/C++ 层不再定义形如 Java_xxx 的函数名；而是通过一个普通的本地函数实现逻辑；
    
-   再在 JNI_OnLoad 中调用 RegisterNatives，把 Java 方法与对应的 native 函数指针绑定。
    

例如：

```cpp
#include <jni.h>

// 定义方法签名
static JNINativeMethod methods[] = {
    {"secretMethod", "()V", (void *)secretMethod},
};

// JNI_OnLoad 动态注册方法
jint JNI_OnLoad(JavaVM* vm, void* reserved) {
    JNIEnv* env = nullptr;
    vm->GetEnv((void**)&env, JNI_VERSION_1_6);

    jclass clazz = env->FindClass("com/example/native/NativeUtils");
    env->RegisterNatives(clazz, methods, sizeof(methods)/sizeof(methods[0]));

    return JNI_VERSION_1_6;
}
```

函数名字可以自定义：

```
void secretMethod(JNIEnv *env, jobject obj) {
    // your native code
}
```

这样生成的 so 文件里，已经看不到带有类名/方法名信息的 JNI 符号，逆向者无法直接通过函数名反推出调用入口。即使在 IDA、GHIDRA 中分析 so，也只能看到一些无意义的 C/C++ 函数符号，而找不到明确的 Java 关联。

## 完整源码

开源地址： [https://github.com/CYRUS-STUDIO/AndroidExample](https://github.com/CYRUS-STUDIO/AndroidExample)

相关文章：

-   [OLLVM 移植 LLVM 18 实战，轻松实现 C&C++ 代码混淆](https://cyrus-studio.github.io/blog/posts/ollvm-%E7%A7%BB%E6%A4%8D-llvm-18-%E5%AE%9E%E6%88%98%E8%BD%BB%E6%9D%BE%E5%AE%9E%E7%8E%B0-cc++-%E4%BB%A3%E7%A0%81%E6%B7%B7%E6%B7%86/)
    
-   [C&C++ 代码安全再升级：用 OLLVM 给 so 加上字符串加密保护](https://cyrus-studio.github.io/blog/posts/cc++-%E4%BB%A3%E7%A0%81%E5%AE%89%E5%85%A8%E5%86%8D%E5%8D%87%E7%BA%A7%E7%94%A8-ollvm-%E7%BB%99-so-%E5%8A%A0%E4%B8%8A%E5%AD%97%E7%AC%A6%E4%B8%B2%E5%8A%A0%E5%AF%86%E4%BF%9D%E6%8A%A4/)
