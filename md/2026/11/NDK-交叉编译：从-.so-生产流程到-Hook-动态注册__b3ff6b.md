---
title: NDK / 交叉编译：从 .so 生产流程到 Hook 动态注册
source: https://ip2867.github.io/post/jni-ndk-crosscompile-and-registernatives-hook/
source_host: ip2867.github.io
clip_date: 2026-11-25T11:02:05+08:00
trace_id: 411a7f36-2d76-4815-b210-f12b4a4de2db
content_hash: 10e4c9eec5d01e3dcdb740d7f78ab5a8bddb14a819295c7c28f35d45b83b6477
status: synced
tags: []
series: null
feed_source: Ip2867·Android/逆向
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 42375244-d011-8135-a8ba-d8d1dabbf38d
ioc: null
---

> 很多人学 Android Native 逆向时会把三个概念混在一起： **JNI、NDK、交叉编译**。它们不在同一个层面上——
> 
> -   **JNI** 是「两个国家之间的外交协议」：规定 Java 和 C/C++ 怎么互相调用。
> -   **NDK** 是「外交部」：装着编译器、头文件、构建脚本的工具箱。
> -   **交叉编译** 是「外交部里专门做翻译的人」：让 x86 电脑产出 ARM 手机能跑的代码。
> 
> 协议不依赖外交部存在，但没有外交部，你很难按协议高效生产出可用的东西。搞清这三层之后，再回头看 Frida 为什么必须 Hook `RegisterNatives` ，逻辑就是自然的了。

* * *

## 零、先记住这几条

1.  **JNI 是规范，NDK 是工具，交叉编译是 NDK 里的能力**。三者不在同一层面，不要混着理解。
2.  **JavaVM 是进程级的，JNIEnv 是线程级的**。不同线程的 `JNIEnv*` 不能混用。
3.  **JNIEnv 是指向函数表的二级指针**，所有 JNI 函数通过它按固定索引调用。这是 Frida 能「无符号 Hook」的底层原因。
4.  **静态注册靠命名约定** （ `Java_包名_类名_方法名` ）， **动态注册靠 `JNI_OnLoad` + `RegisterNatives`**。
5.  **`RegisterNatives` 在 JNIEnv 函数表里的索引是 215**，由 JNI 规范固定，不随 Android 版本变——这是最稳的定位方式。
6.  **`JNINativeMethod` 是 3 个指针**：64 位 24 字节、32 位 12 字节。 **不要硬编码 12**。
7.  **动态注册无法彻底隐藏**：ART 必须以明文接收方法名和签名才能去类里查找，这个交汇点堵不住。

* * *

## 一、第一层：三个东西各自是什么

### 1.1 JNI：Java 和 Native 的「合同」

Java 的跨平台优势，反过来限制了它直接操作底层的能力。 **JNI（Java Native Interface）** 就是 Java 官方定义的一套双向调用规范：Java 可以调 C/C++（向下），C/C++ 也可以调 Java（向上）。

JNI 本身 **不是 Android 专属**，它是 Java 平台的标准。你在桌面 JDK 上写 JNI，和 Android 上用的是同一套 `jni.h` 规范——只是 Android 的实现叫 ART，桌面叫 HotSpot。

### 1.2 NDK：Android 的「Native 生产工具包」

**NDK（Native Development Kit）** 是 Google 提供的一套工具集合，核心作用是把 C/C++ 源码编译成 Android 能加载的 `.so` 动态库。它包含：

| 组成  | 作用  |
| --- | --- |
| 交叉编译工具链 | clang/clang++，按目标 CPU 架构分组 |
| JNI 头文件 | `jni.h` 、 `jni_md.h` |
| 构建前端 | `ndk-build` （Android.mk）或 CMake（CMakeLists.txt） |
| 各 API 级别的 sysroot | 对应 Android 版本的系统头文件和库 |

一句话： **JNI 是规范，NDK 是把规范落地的生产工具。**

### 1.3 交叉编译：在 A 平台编译，在 B 平台运行

你写代码的电脑是 x86_64，目标手机是 ARM64。编译环境和运行环境不同，这就是交叉编译。

NDK 的 `toolchains` 目录下，每个目标架构对应一个工具链前缀：

```text
armv7a-linux-androideabi-*   → 32 位 ARM（armeabi-v7a）
aarch64-linux-android-*      → 64 位 ARM（arm64-v8a）
i686-linux-android-*         → 32 位 x86
x86_64-linux-android-*       → 64 位 x86
```

交叉编译时用的不是系统自带 `gcc` ，而是 NDK 里的 `aarch64-linux-android-clang` ——它知道要生成 ARM64 机器码，并链接 Android sysroot 里的库。

不过实际开发几乎不会手拼这一长串参数。NDK 把它封装成了 `ndk-build` 或 CMake 的 toolchain 文件，你只需要声明 `abiFilters 'arm64-v8a'` 。

* * *

## 二、第二层：JNI 的核心模型——两个指针，一张函数表

如果 JNI 只记一件事，就记这个：

> **JavaVM 是进程级的「虚拟机遥控器」，JNIEnv 是线程级的「当前线程的操作手柄」。**

### 2.1 JavaVM 与 JNIEnv

|     | JavaVM | JNIEnv |
| --- | --- | --- |
| 作用域 | 进程级，全局唯一 | 线程级，每个 Java 线程一份 |
| 获取方式 | `JNI_OnLoad` 的第 1 个参数 | 函数调用的第 1 个参数 |
| 主要用途 | 创建/销毁 VM、获取当前线程的 JNIEnv | 调用所有 JNI 函数 |
| 跨线程 | 可以  | **不可以**，不同线程的 JNIEnv 不能混用 |

每个 Java 线程第一次进入 Native 代码时，虚拟机会为它生成一个独立的 `JNIEnv*` 。把一个线程的 `JNIEnv*` 存到全局变量，然后在另一个线程里用——这是 Native 崩溃最经典的原因之一。

### 2.2 JNIEnv 的本质：指向函数表的二级指针

这是理解后续所有 Hook 的关键。

`JNIEnv` 并 **不是** 一个包含函数的结构体，它是 `const struct JNINativeInterface_ **` ——即 **指向「函数指针表」的指针**。

```text
JNIEnv*  ──▶  ┌──────────────────┐
              │  JNINativeInterface*  │  （函数表基址）
              └──────────────────┘
                        │
                        ▼
              ┌──────────────────────────┐
   index 0    │  reserved0               │
   index 4    │  GetVersion              │
   ...        │  ...                     │
   index 215  │  RegisterNatives         │  ← 我们关心的
   index 216  │  UnregisterNatives       │
   index 219  │  GetJavaVM               │
              └──────────────────────────┘
```

所以 C 里写 `(*env)->NewStringUTF(env, "hi")` ，实际做的是： `*env` 取到函数表基址 → 加上 `NewStringUTF` 的索引 × 指针大小 → 取出函数指针 → 调用，并把 `env` 作为第一个参数传进去。

**这就是 Frida 能「无符号 Hook 任意 JNI 函数」的底层原因**：不需要符号表，只需要 `env` 指针 + 索引。

> ⚠️ 注意：索引是 **由 JNI 规范固定** 的，不是随 Android 版本变化的实现细节。 `jni.h` 里 `JNINativeInterface_` 的成员顺序一旦改动就会破坏所有已编译的 native 库，所以任何 Android 版本上 `RegisterNatives` 都是 215。网上有些说法称「不同版本索引不同」，不准确。

### 2.3 普通 JNI 函数的「两个额外参数」

一个 native 方法在 C 侧的函数签名，总比 Java 侧多出两个参数：

```c
JNIEXPORT jstring JNICALL
Java_com_example_MainActivity_stringFromJNI(JNIEnv *env, jobject thiz) {
    return env->NewStringUTF("Hello from C++");
}
```

| 参数  | 含义  |
| --- | --- |
| `env` | JNI 环境指针，调用所有 JNI 函数都靠它 |
| `thiz` | 实例方法时是 `jobject` （Java 的 `this` ）； **static 方法时是 `jclass`** |

因为这是 C++ 风格， `env->NewStringUTF(...)` 看起来像成员调用，实际上编译器展开成 `(*env)->NewStringUTF(env, ...)` ， `env` 仍然是显式的第一个参数。

**这个「第一个参数是 env」的约定，在 Hook 时直接决定了参数索引**——后面第八节会用到。

* * *

## 三、第三层：类型映射与签名

### 3.1 类型映射表

JNI 不能直接用 Java 类型，必须映射：

| Java 类型 | JNI 类型 | 签名  |
| --- | --- | --- |
| `boolean` | `jboolean` | `Z` |
| `byte` | `jbyte` | `B` |
| `char` | `jchar` | `C` |
| `short` | `jshort` | `S` |
| `int` | `jint` | `I` |
| `long` | `jlong` | `J` |
| `float` | `jfloat` | `F` |
| `double` | `jdouble` | `D` |
| `void` | `void` | `V` |
| `String` | `jstring` | `Ljava/lang/String;` |
| `Object` | `jobject` | `Ljava/lang/Object;` |
| `int[]` | `jintArray` | `[I` |
| `String[]` | `jobjectArray` | `[Ljava/lang/String;` |
| `byte[][]` | `jobjectArray` | `[[B` |

### 3.2 方法签名怎么读

签名的格式是 **`(参数列表)返回值`**，中间不加分隔符：

```text
(ILjava/lang/String;)V
 │└──────────────┘│└┬┘
 │   参数2: String│  └── 返回值: void
 └── 参数1: int
```

再看几个例子：

| Java 方法 | 签名  |
| --- | --- |
| `void foo()` | `()V` |
| `int bar(int a)` | `(I)I` |
| `String getSign(String s, long t)` | `(Ljava/lang/String;J)Ljava/lang/String;` |
| `byte[] enc(byte[] data, int len)` | `([BI)[B` |
| `boolean check()` | `()Z` |

> **实践要点**：签名错一个字母，动态注册就会失败（ `RegisterNatives` 返回负值），Hook 时也找不到目标方法。这是新手最常见的错误之一。建议用 `javap -s` 直接从 class 文件里导出签名，不要手写。

* * *

## 四、第四层：两种注册方式——JNI 的入口从哪来

Java 调 native 方法时，JVM 需要知道「这个方法对应 C 里的哪个函数」。有两种告诉它的方式。

### 4.1 静态注册：靠命名约定

C 函数名必须严格遵循：

```text
Java_包名_类名_方法名
```

其中 `.` 换成 `_` ， `_` 换成 `_1` （下划线转义）。

```c
// Java: com.example.MainActivity.stringFromJNI()
JNIEXPORT jstring JNICALL
Java_com_example_MainActivity_stringFromJNI(JNIEnv *env, jobject thiz) {
    ...
}
```

JVM 在第一次调用 native 方法时，按这个规则去 `.so` 的符号表里找。

|     | 静态注册 |
| --- | --- |
| 优点  | 不需要额外写注册代码，简单直接 |
| 缺点  | 包名/类名一改，C 函数名就得跟着改；函数名暴露在符号表里，容易被逆向识别 |

### 4.2 动态注册：在 JNI_OnLoad 里主动交表

`.so` 被 `System.loadLibrary()` 加载时，JVM 会调用库里的 `JNI_OnLoad(JavaVM* vm, void* reserved)` 。在这个函数里手动构造映射表，调 `RegisterNatives` 把 Java 方法和 C 函数指针绑定：

```c
static jstring stringFromJNI(JNIEnv *env, jobject thiz) {
    return env->NewStringUTF("Hello from C++");
}

static const JNINativeMethod methods[] = {
    {"stringFromJNI", "()Ljava/lang/String;", (void *)stringFromJNI},
};

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM *vm, void *reserved) {
    JNIEnv *env = nullptr;
    vm->GetEnv((void **)&env, JNI_VERSION_1_6);

    jclass clazz = env->FindClass("com/example/MainActivity");
    env->RegisterNatives(clazz, methods, sizeof(methods) / sizeof(methods[0]));

    return JNI_VERSION_1_6;
}
```

|     | 动态注册 |
| --- | --- |
| 优点  | 灵活，改名不影响 C 函数名；符号表里看不到 `Java_` 开头的明显特征 |
| 缺点  | 需要手写 `JNI_OnLoad` 和签名，代码稍多 |

### 4.3 逆向视角：动态注册是重点

|     | 静态注册 | 动态注册 |
| --- | --- | --- |
| 符号表特征 | `Java_com_xxx_yyy` 一眼可见 | 可能就是 `sub_1234` 或普通名字 |
| 定位方式 | `findExportByName` 直接找 | 必须 Hook `RegisterNatives` |
| 混淆难度 | 低   | 高（可配合 OLLVM、字符串加密） |

这就是为什么加固方案偏爱动态注册——它把「Java 方法 ↔ Native 函数」的映射关系从符号表挪到了运行时内存里。

但这也带来了它的死穴： **`RegisterNatives` 这个调用点藏不住**。ART 必须以明文接收方法名和签名才能去类里查找，所以只要在这个关口截获，整张映射表就完整暴露了。第八节详细展开。

* * *

## 五、第五层：引用管理与线程——Native 侧最容易踩的坑

### 5.1 三种引用

JNI 传给 Native 的 Java 对象 **不是直接指针，而是引用句柄**，因为垃圾回收器需要知道哪些对象还被 Native 代码持有。

| 引用类型 | 创建方式 | 生命周期 | 跨线程 | 阻止 GC |
| --- | --- | --- | --- | --- |
| 局部引用（LocalRef） | 返回值自动是 | 当前 Native 方法调用期间 | 不能  | 是   |
| 全局引用（GlobalRef） | `NewGlobalRef` | 直到 `DeleteGlobalRef` | 能   | 是   |
| 弱全局引用（WeakGlobalRef） | `NewWeakGlobalRef` | 直到 `DeleteWeakGlobalRef` | 能   | **否** |

**局部引用在 Native 方法返回时自动释放**，所以绝对不能存到全局变量里跨调用使用——存下来的句柄在下次调用时可能指向完全不同的对象，或者直接崩。

要跨调用持久持有：

```c
static jobject g_callback = nullptr;

JNIEXPORT void JNICALL
Java_com_example_Native_setCallback(JNIEnv *env, jclass clazz, jobject cb) {
    if (g_callback != nullptr) {
        env->DeleteGlobalRef(g_callback);   // 先释放旧的
    }
    g_callback = env->NewGlobalRef(cb);     // 建全局引用
}
```

### 5.2 Native 线程怎么「接回」JVM

如果线程是由 `pthread_create` 或 `std::thread` 创建的，它一开始 **没有 JNIEnv**。必须先附加到 JVM：

```c
JavaVM *g_vm = nullptr;   // 在 JNI_OnLoad 里保存下来

void *thread_func(void *arg) {
    JNIEnv *env = nullptr;
    // 附加当前线程到 JVM
    g_vm->AttachCurrentThread(&env, nullptr);

    // 现在可以调 JNI 函数了
    jclass clazz = env->FindClass("com/example/MainActivity");
    ...

    // 线程退出前必须 detach，否则 ART 会报错
    g_vm->DetachCurrentThread();
    return nullptr;
}
```

**三条铁律**：

1.  Native 线程想调 Java，先 `AttachCurrentThread` ；
2.  线程退出前 `DetachCurrentThread` ，否则 ART 会拒绝后续 attach；
3.  **绝不在 A 线程用 B 线程的 `JNIEnv*`**。

* * *

## 六、第六层：把 JNI 和 NDK 放回生产流程

### 6.1 一次典型的「Java → Native」调用链

```text
Java 侧：
  System.loadLibrary("native-lib")
       │
       ▼
  JVM 加载 libnative-lib.so
       │
       ▼
  存在 JNI_OnLoad？ → 调用它（动态注册在这里发生）
       │
       ▼
  Java 调用 native 方法 stringFromJNI()
       │
       ▼
  JVM 查找对应的 C 函数
       ├─ 静态注册：按 Java_... 命名查找符号表
       └─ 动态注册：从 RegisterNatives 注册的表中查找
       │
       ▼
  C 函数执行，通过 JNIEnv 回调 Java 或返回结果
```

> `System.loadLibrary("native-lib")` 传入的是 **去掉 `lib` 前缀和 `.so` 后缀** 的名字。

### 6.2 NDK 在流程中的位置

```text
C/C++ 源码 + jni.h
       │
       ▼
NDK 交叉编译工具链（aarch64-linux-android-clang）
       │
       ▼
libnative-lib.so（ARM64 机器码）
       │
       ▼
打包进 APK 的 lib/arm64-v8a/ 目录
       │
       ▼
运行时由 System.loadLibrary 加载
```

`ndk-build` 和 CMake 只是 **驱动交叉编译的两种前端**：

| 前端  | 配置文件 | 特点  |
| --- | --- | --- |
| ndk-build | `Android.mk` + `Application.mk` | NDK 原生，老项目多 |
| CMake | `CMakeLists.txt` | 现在官方推荐，Android Studio 默认 |

底层调用的都是同一套 clang 工具链。

* * *

## 七、为什么在逆向 / Frida 里这些知识「突然变得重要」

回到 Frida 里的实际困惑：为什么 Hook SO 层要 `Module.findBaseAddress` + `Interceptor.attach` ，还要专门 Hook `RegisterNatives` ？

**因为注册方式决定了定位方式**：

-   **静态注册** 的函数，符号表里直接有 `Java_com_...`， `findExportByName` 就能找到；
-   **动态注册** 的函数，符号表里可能只是一个普通名字甚至被混淆。唯一可靠的拦截点，是在 `RegisterNatives` 被调用时，把 `JNINativeMethod` 数组里的 `name` 、 `signature` 、 `fnPtr` 抓出来。

**而 JNIEnv 的二级指针结构，解释了另一件事**：为什么 Frida 可以通过 `env` 指针 + 索引来 Hook 任意 JNI 函数，完全不需要符号。

所以 JNI / NDK / 交叉编译不是「开发者的知识」，而是逆向和 Hook 的 **地图**：

-   你知道 `.so` 是怎么被生产出来的，就知道它里面有什么；
-   你知道 JNI 的注册方式，就知道该在哪里下 Hook。

* * *

## 八、实战：Hook RegisterNatives 捕获动态注册

### 8.1 核心数据结构：JNINativeMethod

```c
typedef struct {
    const char *name;       // Java 方法名（C 字符串）
    const char *signature;  // 方法签名（C 字符串）
    void       *fnPtr;      // Native 函数指针
} JNINativeMethod;
```

内存布局（设 `methods` 是数组首地址）：

```text
methods + i * S           →  name 指针
methods + i * S + ptrSize →  signature 指针
methods + i * S + ptrSize*2 → fnPtr
```

其中 `S = 3 * Process.pointerSize` ：

| 架构  | 单个结构体大小 |
| --- | --- |
| arm64 / x86_64 | **24 字节** |
| arm / x86 | **12 字节** |

> ⚠️ **网上大量脚本写死 12，在 64 位设备上会把 name/signature/fnPtr 全部解析错位**，输出看起来像乱码但不报错，极难排查。永远用 `Process.pointerSize * 3` 动态算。

### 8.2 RegisterNatives 的调用约定

```c
jint RegisterNatives(JNIEnv *env, jclass clazz,
                     const JNINativeMethod *methods, jint nMethods);
```

从函数表里取出这个函数指针后 hook， **`args` 的索引是这样对应的**：

| Frida 索引 | 实际含义 |
| --- | --- |
| `args[0]` | `JNIEnv *` （函数表的第一个参数） |
| `args[1]` | `jclass` （Java 类引用） |
| `args[2]` | `const JNINativeMethod *` （方法表） |
| `args[3]` | `jint` （方法数量） |

这里有个容易误解的地方： **`env` 不是「隐藏的 this」，它就是实打实的第一个参数**。C++ 里 `env->RegisterNatives(...)` 看着像成员调用，编译器展开后仍是 `(*env)->RegisterNatives(env, ...)` ， `env` 照样压进第一个参数槽。所以 **类在 `args[1]` 、方法表在 `args[2]` 、数量在 `args[3]`**——这是 Hook 时最容易错位的地方。

### 8.3 定位 RegisterNatives：两条路径

**路径一：按符号查找（不稳定，但有时代码短）**

普通名字找不到：

```javascript
// 这样几乎总是返回 null
Module.findExportByName("libart.so", "RegisterNatives");
```

因为它是 C++ mangled 符号，全名取决于 ART 内部的命名空间和模板参数，例如：

```text
_ZN3art3JNI15RegisterNativesEP7_JNIEnvP7_jclassPK15JNINativeMethodi
```

这个字符串 **随 Android 版本和厂商定制变化**，还可能被 strip 掉，不能作为通用方案。

**路径二：通过 JNIEnv 函数表（稳定，推荐）**

```javascript
Java.perform(function () {
    var env = Java.vm.getEnv();              // 当前线程的 JNIEnv*
    var table = env.handle.readPointer();    // 解引用一次 → 函数表基址
    var fn = table.add(215 * Process.pointerSize).readPointer();
    // fn 就是 RegisterNatives 的真实地址
});
```

这段代码需要理解两次解引用：

```text
env.handle          →  JNIEnv*（值的本身）
  .readPointer()    →  *env = JNINativeInterface*（函数表基址）
  .add(215 * 8)     →  第 215 个槽位的地址
  .readPointer()    →  该槽位里的函数指针
```

不依赖符号表，在 stripped 的 libart.so 上照样工作。

### 8.4 完整脚本

```javascript
// hook_register_natives.js
Java.perform(function () {
    var env = Java.vm.getEnv();
    var table = env.handle.readPointer();
    var REGISTER_NATIVES_IDX = 215;

    var fn = table.add(REGISTER_NATIVES_IDX * Process.pointerSize).readPointer();
    if (fn.isNull()) {
        console.log("[-] 定位失败，请检查 JNIEnv 解引用");
        return;
    }

    var stride = Process.pointerSize * 3;   // JNINativeMethod 大小

    Interceptor.attach(fn, {
        onEnter: function (args) {
            var clazz = args[1];
            var methods = args[2];
            var count = args[3].toInt32();

            // 类名是加分项，拿不到不影响主要信息
            var className = "(unknown)";
            try {
                var ClassCls = Java.use("java.lang.Class");
                className = Java.cast(clazz, ClassCls).getName();
            } catch (e) {
                // Java.cast 在部分场景会失败，忽略即可
            }

            console.log("\n[RegisterNatives] class: " + className
                + "  methods: " + count);

            for (var i = 0; i < count; i++) {
                var base = methods.add(i * stride);

                var namePtr = base.readPointer();
                var sigPtr = base.add(Process.pointerSize).readPointer();
                var fnPtr = base.add(Process.pointerSize * 2).readPointer();

                var name = namePtr.readCString();
                var sig = sigPtr.readCString();

                // 反查这个 native 函数属于哪个模块
                var mod = Process.findModuleByAddress(fnPtr);
                var where = mod
                    ? mod.name + "+0x" + fnPtr.sub(mod.base).toString(16)
                    : "?";

                console.log("  [" + i + "] " + name + sig
                    + "\n        fnPtr = " + fnPtr + "  (" + where + ")");
            }
        }
    });

    console.log("[*] RegisterNatives hooked at " + fn);
});
```

### 8.5 运行

```bash
# spawn 模式：从进程启动就注入，确保赶在 JNI_OnLoad 之前
frida -U -f com.example.app -l hook_register_natives.js
```

> `frida-tools` 13 之后已移除 `--no-pause` 参数（spawn 后默认继续运行）。旧版本才需要显式加上，新版加了会报 `unrecognized arguments` 。

输出示例：

```text
[RegisterNatives] class: com.example.game.NativeBridge  methods: 2
  [0] init(Ljava/lang/String;)V
        fnPtr = 0x7a3e4c00  (libnative-lib.so+0x1c00)
  [1] getSign(Ljava/lang/String;J)Ljava/lang/String;
        fnPtr = 0x7a3e5100  (libnative-lib.so+0x2100)
```

有了 `fnPtr` 和模块偏移，就可以直接拿去 IDA 里定位函数了。

### 8.6 第二步：Hook 截获到的 Native 函数

拿到 `fnPtr` 后可以直接 `Interceptor.attach` ，但 **参数索引和 Hook `RegisterNatives` 时不同**：

```javascript
Interceptor.attach(fnPtr, {
    onEnter: function (args) {
        // 普通 JNI 函数（非 static）：
        //   args[0] = JNIEnv*
        //   args[1] = jobject（Java 的 this）
        //   args[2] = 第 1 个 Java 参数
        console.log("[>] getSign called");
        console.log("    JNIEnv :", args[0]);
        console.log("    this   :", args[1]);

        // 第 1 个参数是 String（jstring），要转字符串得走 JNI
        try {
            var s = Java.cast(args[2], Java.use("java.lang.String"));
            console.log("    arg0   :", s);
        } catch (e) {
            console.log("    arg0   :", args[2]);
        }
    },
    onLeave: function (retval) {
        console.log("    retval :", retval);
        try {
            var r = Java.cast(retval, Java.use("java.lang.String"));
            console.log("    retval(str) :", r);
        } catch (e) {}
    }
});
```

**参数偏移速记**：

| 方法类型 | `args[0]` | `args[1]` | `args[2]` 起 |
| --- | --- | --- | --- |
| 普通实例方法 | `JNIEnv*` | `jobject` （this） | Java 参数 |
| static 方法 | `JNIEnv*` | `jclass` | Java 参数 |

> `jstring` 是句柄不是 `char*` ，不能直接 `readCString()` 。要拿字符串必须走 `Java.cast` 或 JNI 的 `GetStringUTFChars` 。这是另一个高频错误。

* * *

## 九、常见坑速查

| 现象  | 原因  | 解法  |
| --- | --- | --- |
| Hook 注册成功但函数不触发 | 脚本在 `JNI_OnLoad` 之后才注入 | 用 `-f` spawn 模式，或注入后立即 Hook |
| 解析出的 name/signature 是乱码 | `JNINativeMethod` 步长写死 12 | 用 `Process.pointerSize * 3` |
| 索引错位，把 methods 当成了类 | 忽略了 `args[0]` 是 env | 类在 `args[1]` ，方法表在 `args[2]` |
| `findExportByName` 返回 null | `RegisterNatives` 不是普通导出符号 | 走 JNIEnv 函数表索引 215 |
| 拿到 `jstring` 直接 `readCString()` 崩溃 | `jstring` 是句柄不是 C 字符串 | 用 `Java.cast` 或 `GetStringUTFChars` |
| 类名打印成 `(unknown)` | `Java.cast` 在该上下文失败 | 属正常，靠方法名+签名反查类 |
| Native 线程调 Java 崩溃 | 线程没有 JNIEnv | 先 `AttachCurrentThread` |
| 局部引用跨调用后失效 | 方法返回后自动释放 | 用 `NewGlobalRef` 持持久引用 |
| 动态注册返回负值 | 签名写错 | 用 `javap -s` 导出，别手写 |

* * *

## 十、从浅到深的自学顺序

```text
第 1 遍：分开三个概念
        └─ 能用自己的话说出 JNI / NDK / 交叉编译各自解决什么问题

第 2 遍：JNI 的最小闭环
        └─ 写一个 Java native 方法 + 静态注册的 C 函数，
           跑通 System.loadLibrary → 调用

第 3 遍：类型与签名
        └─ 能手写 (ILjava/lang/String;)V 这样的签名，解释每个字符的含义

第 4 遍：动态注册
        └─ 在 JNI_OnLoad 中用 RegisterNatives 注册一个方法，
           观察不再需要 Java_ 命名

第 5 遍：引用与线程
        └─ 理解局部引用为什么不能跨调用保存；
           写一个 AttachCurrentThread 的 Native 线程

第 6 遍：构建视角
        └─ 用 ndk-build 或 CMake 交叉编译一个 .so，
           用 file / readelf -h 确认目标架构

第 7 遍：Hook 视角
        └─ 用 Frida Hook 静态注册函数，
           再 Hook RegisterNatives 捕获动态注册函数，
           把 fnPtr 反查到模块偏移后回 IDA 定位
```

* * *

## 十一、关键记忆点

1.  **JNI 是规范，NDK 是工具，交叉编译是 NDK 里的能力**，三者不在同一层面。
2.  **JavaVM 进程级，JNIEnv 线程级**；不同线程的 `JNIEnv*` 绝不能混用。
3.  **JNIEnv 是指向函数表的二级指针**，所有 JNI 函数靠「env + 索引」调用——这是无符号 Hook 的基础。
4.  **普通 JNI 函数的额外两参数**： `env` 在前， `thiz` / `jclass` 在后；Java 参数从第 3 个开始。
5.  **JNI 签名是密码本**： `I` =int， `Z` =boolean， `Ljava/lang/String;`\=String， `(参数)返回值` 。
6.  **静态注册靠命名约定，动态注册靠 `JNI_OnLoad` + `RegisterNatives`**；动态注册是逆向 Hook 的重点。
7.  **`RegisterNatives` 的函数表索引是 215**，由 JNI 规范固定，不随版本变化。
8.  **`JNINativeMethod` = 3 个指针**：64 位 24 字节、32 位 12 字节，用 `pointerSize * 3` 算。
9.  **Hook `RegisterNatives` 时**： `args[0]` =env、 `args[1]` =jclass、 `args[2]` =方法表、 `args[3]` =数量。
10.  **局部引用不能跨线程/跨调用保存**，需要持久持有就用 `NewGlobalRef` ；Native 线程要调 Java，先 `AttachCurrentThread` 。
11.  **`.so` 生产流程**：C/C++ + jni.h → NDK 交叉编译 → libxxx.so → 打包进 APK → `System.loadLibrary` 加载 → `JNI_OnLoad` （可选）→ 方法调用。
12.  **动态注册无法彻底隐藏**：ART 必须以明文接收 name 和 signature， `RegisterNatives` 这个交汇点堵不住。

* * *

## 附：.so 体检常用命令

分析一个陌生 `.so` 时，先跑这几条确认基本信息：

```bash
# 确认目标架构（是 arm64 还是 arm）
file libnative-lib.so

# 看 ELF 头：Machine 字段能看出 ARM aarch64
readelf -h libnative-lib.so | grep Machine

# 找静态注册的 JNI 函数（Java_ 开头）
readelf -sW libnative-lib.so | grep "Java_"

# 找 JNI_OnLoad（说明可能用了动态注册）
readelf -sW libnative-lib.so | grep "JNI_OnLoad"

# 列出依赖库
readelf -d libnative-lib.so | grep NEEDED
```

判断逻辑很直接：

-   **有 `Java_xxx` 导出** → 至少部分用静态注册， `findExportByName` 可以直接挂；
-   **有 `JNI_OnLoad` 但没有 `Java_xxx`** → 几乎确定是动态注册，必须 Hook `RegisterNatives` ；
-   **两者都没有** → 可能不是 JNI 库（只是普通 so），或者被 strip + 混淆了。
