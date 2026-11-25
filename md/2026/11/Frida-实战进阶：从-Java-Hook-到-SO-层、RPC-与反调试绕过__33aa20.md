---
title: Frida 实战进阶：从 Java Hook 到 SO 层、RPC 与反调试绕过
source: https://ip2867.github.io/post/frida-advanced-hook-guide/
source_host: ip2867.github.io
clip_date: 2026-11-25T11:00:49+08:00
trace_id: 3d86e7dd-03ae-4ade-8ab9-d38ba5b0aa41
content_hash: ea17f590efe391097fc592549ba872dd281a512626415d527da5e0198696b206
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
notion_page_id: 42375244-d011-816b-a92c-d9cadf37c242
ioc: null
---

> 这篇按「Java 层 → SO 层 → JNI 内核 → 主动调用与 RPC → 自动化 → 对抗实战」六层递进整理 Frida 用法。目标不是罗列 API，而是让你清楚 **每一层能做什么、边界在哪、什么时候必须往下一层走**。
> 
> 环境约定：Frida 16.x、Android 8.0+（arm64）、Python 3。所有脚本都在真机或模拟器上实际跑过。Frida 各版本 API 有出入，文中标注了需要注意的地方。

* * *

## 零、先记住这几条

1.  **Java 层三件套**： `Java.perform()` + `Java.use()` + `method.implementation` 改写，是所有 Java Hook 的基础。
2.  **SO 层三件套**： `Module.findBaseAddress` / `findExportByName` 定位地址， `Interceptor.attach` 拦截调用。
3.  **JNI 函数在 libart.so 里**：通过枚举符号或 `JNIEnv` 指针偏移定位； `RegisterNatives` 是动态注册 JNI 函数的入口，静态分析找不到名字时盯它。
4.  **RPC 让脚本可编程**： `rpc.exports` 导出函数，Python 侧驱动调用，是从手工调试走向自动化的分水岭。
5.  **Hook 要在「数据被判断之前」下手**：反调试优先 Hook `fgets` 过滤特征串，无效再 Hook `exit` / `kill` 反向定位。
6.  **SSL Pinning 绕过本质是让校验函数永远返回成功**，不是「装个证书」。
7.  **全量 trace 一定会崩**：Frida 的 Java trace 只能白名单，别指望 trace 所有方法。

* * *

## 学习路线总览

```text
阶段 1  Java 层 Hook：从 Java.use 到方法追踪
  ↓
阶段 2  SO 层 Hook：模块基址、导出函数与 Interceptor
  ↓
阶段 3  JNI 与 libart.so：深入到 Native 调用链
  ↓
阶段 4  主动调用与 RPC：让 Hook 脚本可被 Python 驱动
  ↓
阶段 5  自动化与群控：从单次 Hook 到批量流水线
  ↓
阶段 6  实战对抗：反调试与 SSL Pinning 绕过
```

这六层不是并列关系，而是 **能力递进**：Java 层解决不了的去 SO 层，SO 层找不到名字的进 JNI，需要批量跑就上 RPC，遇到检测就进对抗。实际做题时，你可能从任意一层进去，但往下走的方向是固定的。

* * *

## 一、阶段 1：Java 层 Hook——最常用、最基础的入口

### 1.1 核心 API 三件套

```javascript
Java.perform(function () {
    var TargetClass = Java.use("com.target.ClassName");

    TargetClass.targetMethod.implementation = function (a, b) {
        console.log("[*] targetMethod called:", a, b);

        // 调用原函数（注意 this 和参数传递方式）
        var ret = this.targetMethod(a, b);

        console.log("[*] returned:", ret);
        return ret;
    };
});
```

三个 API 各管一件事：

| API | 作用  | 关键点 |
| --- | --- | --- |
| `Java.perform()` | 确保代码在 JVM 初始化完成后执行 | **必须包住所有 Java 层操作**，否则报 `Java is not defined` 或类找不到 |
| `Java.use()` | 获取类的引用（包装成 JS 对象） | 参数是完整类名；内部类用 `$` 分隔 |
| `method.implementation` | 替换方法实现 | 赋值一个 JS 函数即完成 Hook |

**关于调用原函数**，两种写法都常见，但语义不同：

```javascript
// 写法一：显式传参（推荐，参数个数固定时最清晰）
TargetClass.targetMethod.implementation = function (a, b) {
    return this.targetMethod(a, b);   // 这里调的是原方法（因为已经备份）
};

// 写法二：透传所有参数（参数个数不定或不想关心签名时）
TargetClass.targetMethod.implementation = function () {
    return this.targetMethod.apply(this, arguments);
};
```

> ⚠️ **一个容易踩的坑**：在重写的 `implementation` 内部再调用 `this.targetMethod(...)` ，Frida 会调用 **原始实现** 而不是递归调用你替换的函数。这是 Frida 的机制保证的，可以放心用。但如果你在 Hook 里又 `Java.use` 同一个类并重新赋值 `implementation` ，就会出问题——改之前先备份到局部变量。

### 1.2 重载方法怎么 Hook

Java 有重载，同名方法可能有多个签名。Frida 用 `overload()` 明确指定：

```javascript
var TargetClass = Java.use("com.target.ClassName");

// 只 Hook 签名是 (int, String) 的那一个
TargetClass.targetMethod
    .overload('int', 'java.lang.String')
    .implementation = function (a, b) {
        console.log("[*] int/String overload:", a, b);
        return this.targetMethod(a, b);
    };

// 枚举所有重载
TargetClass.targetMethod.overloads.forEach(function (m) {
    var types = m.argumentTypes
        .map(function (t) { return t.className; })
        .join(', ');
    console.log("[*] overload: (" + types + ")");
});
```

如果不指定 `overload()` 而方法有多个重载，Frida 会抛错提示 `has more than one overload` 。这是新手最常见的报错之一。

### 1.3 内部类与类加载器枚举

**内部类**：类名用 `$` 引用。

```javascript
// Java 源码里的 Outer.Inner → Frida 里写 Outer$Inner
var Inner = Java.use("com.example.Activity$InnerClasses");
```

**枚举类加载器**：应对「动态加载 DEX」的场景。加固壳通常把真正的业务代码放在解密后 `DexClassLoader` 加载的 DEX 里，默认的 `Java.use` 找不到这些类。

```javascript
Java.enumerateClassLoaders({
    onMatch: function (loader) {
        try {
            // 尝试用这个 loader 加载目标类，成功说明找到了
            var factory = Java.ClassFactory.get(loader);
            var cls = factory.use("com.target.ClassName");
            console.log("[+] Found class in loader:", loader);
        } catch (e) {
            // 这个 loader 加载不了目标类，继续下一个
        }
    },
    onComplete: function () {
        console.log("[*] enumeration complete");
    }
});
```

这是脱壳和反加固场景的核心套路： **遍历所有 ClassLoader，逐个尝试加载目标类，哪个成功用哪个**。

**枚举已加载类**：

```javascript
Java.enumerateLoadedClasses({
    onMatch: function (className) {
        if (className.indexOf("com.target") >= 0) {
            console.log(className);
        }
    },
    onComplete: function () {}
});
```

### 1.4 方法追踪（Trace）

轻量级白名单 trace 是 Frida 在 Java 层最实用的功能之一，尤其适合「不知道关键方法叫什么，但知道大概在哪个类」的场景。

**为什么必须白名单**：全量 trace 会把每个方法调用都拦一遍，性能直接崩掉——Frida 的 Java 层 Hook 开销本来就大，一个 App 启动期几千个方法调用，全拦一遍基本就是 ANR。实测下来，单个类里 trace 十几个方法是舒适的，上百个就要开始担心了。

核心逻辑：

```text
遍历所有类 → 按规则匹配目标类 → 枚举类的方法 → 枚举重载 → Hook implementation
  → 记录入参 → 调用原函数 → 记录返回值
```

完整实现：

```javascript
function traceClass(classNamePattern, methodWhitelist) {
    Java.perform(function () {
        Java.enumerateLoadedClasses({
            onMatch: function (className) {
                if (!className.match(classNamePattern)) return;

                var cls;
                try {
                    cls = Java.use(className);
                } catch (e) {
                    return;   // 某些系统类无法 use，跳过
                }

                var methods;
                try {
                    methods = cls.class.getDeclaredMethods();   // 反射拿方法列表
                } catch (e) {
                    return;
                }

                methods.forEach(function (method) {
                    var name = method.getName();
                    // 没有白名单就 trace 全部；有白名单只 trace 指定方法
                    if (methodWhitelist && methodWhitelist.indexOf(name) < 0) return;

                    // 拿到这个方法的所有重载
                    var overloads;
                    try {
                        overloads = cls[name].overloads;
                    } catch (e) {
                        return;
                    }

                    overloads.forEach(function (overload) {
                        var sig = overload.argumentTypes
                            .map(function (t) { return t.className; })
                            .join(', ');
                        console.log("[+] hooking " + className + "." + name + "(" + sig + ")");

                        overload.implementation = function () {
                            var args = Array.prototype.slice.call(arguments);
                            console.log("[>] " + name + "(" + args.join(', ') + ")");

                            var ret = overload.apply(this, arguments);

                            console.log("[<] " + name + " -> " + ret);
                            return ret;
                        };
                    });
                });
            },
            onComplete: function () {
                console.log("[*] trace setup done");
            }
        });
    });
}

// 用法：只 trace com.target.crypto 包里，且只关心这三个方法
traceClass(/com\.target\.crypto/, ['encrypt', 'decrypt', 'getKey']);
```

**优缺点**：

|     | 说明  |
| --- | --- |
| 优点  | 方便、灵活、轻量级，几行代码就能看清一个类的调用链和参数 |
| 缺点  | Frida 框架效率较低，trace 方法过多容易崩溃， **无法做全量 trace** |

> 如果真要全量 trace，那就不该用 Frida 的 Java Hook，改用 ART 层的方法级 trace（ `am trace` 、simpleperf，或自己写 inline hook 打 `ArtMethod::Invoke` ）。

### 1.5 Java 层还能做什么

除了改方法实现，Java 层还能：

```javascript
// 主动调用静态方法
Java.perform(function () {
    var cls = Java.use("com.target.Util");
    var result = cls.calcKey("input");
    console.log("[*] calcKey('input') =", result);
});

// 读写类的静态字段
var cls = Java.use("com.target.Config");
console.log(cls.API_KEY.value);      // 读
cls.API_KEY.value = "hacked";        // 写

// 创建实例（new 一个对象）
var obj = cls.$new();                // 无参
var obj2 = cls.$new(1, "arg");       // 带参
```

* * *

## 二、阶段 2：SO 层 Hook——进入 Native 世界

Java 层解决不了两种情况：目标逻辑在 native 代码里（加密、协议签名居多），或者 Java 层被加固到 Hook 不上。这时候进 SO 层。

### 2.1 定位模块与函数

```javascript
// 1. 获取模块基址
var base = Module.findBaseAddress("libmyjni.so");
console.log("[*] libmyjni.so base:", base);

// 2. 按名称查找导出函数（最简单，但只能找导出符号）
var n2 = Module.findExportByName("libmyjni.so", "n2");
console.log("[*] n2 addr:", n2);

// 3. 通过模块 + 偏移定位未导出函数（偏移需自己逆向分析）
var module = Process.findModuleByName("libart.so");
var addr = module.base.add(0x1234);

// 4. 枚举模块的所有导出
var mod = Process.findModuleByName("libmyjni.so");
mod.enumerateExports().forEach(function (exp) {
    if (exp.name.indexOf("Java_") >= 0) {
        console.log("[+] export:", exp.name, exp.address);
    }
});
```

**几个 API 的区别** （Frida 15 之后 `Module.findExportByName` 改过签名，注意版本）：

| 目的  | 旧写法（≤14） | 新写法（≥15） |
| --- | --- | --- |
| 找导出地址 | `Module.findExportByName(mod, name)` | 同左，但 mod 可为 null 表示全局搜索 |
| 找模块 | `Process.findModuleByName(name)` | 同左  |
| 模块基址 | `Module.findBaseAddress(name)` | 同左  |

`Java_` 前缀的导出是 **静态注册** 的 JNI 函数，命名规则是 `Java_包名_类名_方法名` （`.` 换成 `_` ）。这一眼就能看出 Java 方法和 native 函数的对应关系。

### 2.2 Interceptor.attach：拦截函数调用

这是 SO 层最核心的 API：

```javascript
Interceptor.attach(n2, {
    onEnter: function (args) {
        // args 是 NativePointer 数组，args[0] 是第一个参数
        console.log("[>] n2 called");
        console.log("    arg0:", args[0]);
        console.log("    arg1:", args[1]);

        // 读字符串参数（x0/x1 指向 C 字符串时）
        if (!args[0].isNull()) {
            console.log("    arg0 as string:", args[0].readCString());
        }

        // 保存现场，方便 onLeave 或后续分析使用
        this.arg0 = args[0];
        this.backtrace = Thread.backtrace(this.context, Backtracer.ACCURATE)
            .map(DebugSymbol.fromAddress).join('\n');
    },
    onLeave: function (retval) {
        console.log("[<] n2 returned:", retval);
        console.log("    call stack:\n" + this.backtrace);

        // 修改返回值（常见需求：让校验函数返回 true）
        // retval.replace(ptr(1));
    }
});
```

**几个高频操作**：

```javascript
// 读内存
args[0].readCString();        // 读 C 字符串（遇到 \0 停）
args[0].readUtf8String(16);   // 按长度读 UTF-8
args[0].readU32();            // 读 32 位无符号整数
args[0].readPointer();        // 读一个指针

// 写内存
args[0].writeU32(0x1234);

// 修改返回值
onLeave: function (retval) {
    retval.replace(ptr(0));     // 返回 NULL
    // 或 retval.replace(1);    // 返回整数 1
}

// 拿到调用地址（定位是谁调用了这个函数）
onEnter: function (args) {
    console.log("caller:", this.returnAddress);
}
```

### 2.3 Inline Hook

`Interceptor.attach` 是在函数 **入口** 插桩，属于「函数级 Hook」。Inline Hook 是直接改目标函数开头的指令，跳到自定义逻辑，适用于：

-   目标函数 **没有导出**，但你知道地址；
-   需要在函数 **中部** 插入逻辑（比如跳过某段校验）；
-   函数被内联、 `Interceptor.attach` 挂不上（少见但存在）。

Frida 里做 inline hook 一般用 `Interceptor.replace` （替换整个函数）或配合 `ARM64Writer` 手写跳转：

```javascript
// 用 Interceptor.replace 完全替换函数实现
var target = Module.findExportByName("libmyjni.so", "check_license");
Interceptor.replace(target, new NativeCallback(function (key) {
    console.log("[*] check_license bypassed");
    return 1;   // 永远返回 1（通过）
}, 'int', ['pointer']));
```

`Interceptor.replace` 比 `attach` 更激进——前者直接换掉整个函数，后者只是旁听。 **绕过校验类需求， `replace` 更省事；只想打印参数，用 `attach` 。**

### 2.4 主动调用：NativeFunction

把地址转成可调用的 JS 函数：

```javascript
var n2 = Module.findExportByName("libmyjni.so", "n2");
var n2Func = new NativeFunction(n2, 'int', ['int', 'pointer']);

// 主动调用
var ret = n2Func(42, Memory.allocUtf8String("hello"));
console.log("[*] n2(42, 'hello') =", ret);
```

`NativeFunction` 的签名参数必须准确，否则会崩： `'int'` 、 `'pointer'` 、 `'void'` 、 `'float'` 、 `'double'` 、 `'uint64'` 等。猜错类型的典型表现是「调用后进程直接退出」。

* * *

## 三、阶段 3：JNI 与 libart.so——深入 Native 调用链

### 3.1 JNI 函数在哪里

在 Android 8.0+（ART）中， **所有 JNI 函数都位于 `libart.so`**。原因是 ART 重写了 JNI 的实现， `JNIEnv` 结构体里的函数指针全部指向 libart.so 内部。

要 Hook JNI 函数，标准路径是：

```text
枚举 libart.so 的符号 → 找到目标 JNI 函数 → 计算地址 → Interceptor.attach
```

```javascript
var module = Process.findModuleByName("libart.so");
var symbols = module.enumerateSymbols();

symbols.forEach(function (sym) {
    if (sym.name.indexOf("NewStringUTF") >= 0) {
        console.log("[+] symbol:", sym.name, sym.address);
    }
});
```

> ⚠️ **实际会有多个匹配**。libart.so 里同一个 JNI 函数可能有多个符号（不同命名空间、不同重载、C++ mangled name）。比如 `NewStringUTF` 可能同时出现：
> 
> -   `_ZN3art3JNI12NewStringUTFEP7_JNIEnvPKc` （mangled）
> -   `art::JNI<false>::NewStringUTF` （demangled，需 `DebugSymbol` 解析）
> 
> 选哪个取决于你的目标——通常选带 `JNI` 命名空间的那个，因为它是对外暴露的 JNI 实现。

### 3.2 更可靠的方式：JNIEnv 指针 + 偏移

枚举符号有时会漏（特别是被 strip 过的 ROM），更稳的做法是 **通过 `JNIEnv` 结构体的函数表偏移**：

`JNIEnv` 在 C 层是一个指向 `JNINativeInterface` 结构体的指针，结构体内是一串函数指针，顺序由 JNI 规范固定。

```javascript
// JNI 函数表顺序（节选，完整表见 JNI 规范 jni.h）
const jniStructArray = [
    "reserved0", "reserved1", "reserved2", "reserved3",
    "GetVersion",
    "DefineClass", "FindClass",
    "FromReflectedMethod", "FromReflectedField",
    "ToReflectedMethod",
    "GetSuperclass", "IsAssignableFrom",
    "ToReflectedField",
    "Throw", "ThrowNew",
    "ExceptionOccurred", "ExceptionDescribe", "ExceptionClear", "FatalError",
    "PushLocalFrame", "PopLocalFrame",
    "NewGlobalRef", "DeleteGlobalRef", "DeleteLocalRef", "IsSameObject",
    "NewLocalRef", "EnsureLocalCapacity",
    "AllocObject", "NewObject", "NewObjectV", "NewObjectA",
    "GetObjectClass", "IsInstanceOf",
    "GetMethodID",
    "CallObjectMethod", "CallObjectMethodV", "CallObjectMethodA",
    // ... 后面还有几百个，按 jni.h 顺序补全
    "GetStringUTFLength", "GetStringUTFChars",
    "ReleaseStringUTFChars",
    "GetArrayLength", "NewObjectArray",
    "NewStringUTF",
];

// 定位 NewStringUTF 的地址
var env = Java.vm.getEnv();        // 拿到 JNIEnv*
var envPtr = env.handle.readPointer();  // 解引用到 JNINativeInterface*

var offset = jniStructArray.indexOf("NewStringUTF") * Process.pointerSize;
var newStringUTFAddr = envPtr.add(offset).readPointer();

console.log("[*] NewStringUTF at:", newStringUTFAddr);

Interceptor.attach(newStringUTFAddr, {
    onEnter: function (args) {
        // args[0] = env, args[1] = const char*
        console.log("[>] NewStringUTF:", args[1].readCString());
    },
    onLeave: function (retval) {
        // retval = jstring
    }
});
```

这个方法的 **关键前提是偏移表必须完整且顺序正确**。少一项、错一位，找到的就是别的函数——挂上去可能不崩，但完全不生效，很难排查。建议直接从 AOSP 的 `jni.h` 复制完整列表。

### 3.3 Hook RegisterNatives：捕获动态注册的 JNI 函数

很多加固或自定义 SO 不用静态注册（ `Java_xxx` 导出），而是用 `RegisterNatives` 动态注册。这样静态分析找不到函数名，只能看到一堆匿名地址。

**Hook `RegisterNatives` 就能在注册发生的瞬间拿到「Java 方法名 → native 地址」的映射**，这是逆向动态注册 SO 的最有效手段。

```javascript
// 找到 RegisterNatives 地址（同样可以用 JNIEnv 偏移法）
var idx = jniStructArray.indexOf("RegisterNatives");
var regNativesAddr = envPtr
    .add(idx * Process.pointerSize)
    .readPointer();

var JNINativeMethod = {
    "name": "pointer",      // const char* name
    "signature": "pointer", // const char* signature
    "fnPtr": "pointer"      // void* fnPtr
};

Interceptor.attach(regNativesAddr, {
    onEnter: function (args) {
        // args[0]=env, args[1]=jclass
        // args[2]=JNINativeMethod*, args[3]=nMethods
        var methods = args[2];
        var count = parseInt(args[3]);

        console.log("[*] RegisterNatives count =", count);

        // JNINativeMethod 是 3 个指针，步长 = 3 * pointerSize
        var stride = Process.pointerSize * 3;

        for (var i = 0; i < count; i++) {
            var base = methods.add(i * stride);

            var namePtr = base.readPointer();
            var sigPtr  = base.add(Process.pointerSize).readPointer();
            var fnPtr   = base.add(Process.pointerSize * 2).readPointer();

            var name = namePtr.readCString();
            var sig  = sigPtr.readCString();

            console.log("    [" + i + "] " + name + sig + " -> " + fnPtr);

            // 顺手 Hook 上这个函数
            Interceptor.attach(fnPtr, {
                onEnter: function (a) {
                    console.log("    [>] " + name + " called");
                }
            });
        }
    }
});
```

`JNINativeMethod` 结构体在 64 位下是 3 个指针（name、signature、fnPtr），每个 8 字节，所以步长是 `3 * pointerSize` 。

> **注意**：想同时拿到类名，可以调用 `JNIEnv` 的 `GetObjectClass` + `GetClassName` ，更省事的做法是遍历 `Java.enumerateLoadedClassesSync()` 把 jclass 和类名对起来。实际脚本里通常用后者。

### 3.4 阶段 2 和阶段 3 的关系

很多人会混淆「SO 层 Hook」和「JNI Hook」：

|     | 目标  | 手段  |
| --- | --- | --- |
| SO 层 Hook | 你自己 SO 里的函数（ `libmyjni.so` 的 `n2` ） | `findExportByName` / `base+offset` + `attach` |
| JNI Hook | **JNI 框架函数** （ `NewStringUTF` 、 `RegisterNatives` 、 `CallObjectMethod` ） | libart.so 符号 / JNIEnv 偏移 |

前者是「Hook 业务代码」，后者是「Hook 框架能力」。实际利用中经常一起用：先用 JNI Hook 找到动态注册的函数地址，再用 SO 层 Hook 挂上具体业务函数。

* * *

## 四、阶段 4：主动调用与 RPC——让脚本可被外部驱动

### 4.1 主动调用的意义

Hook 是「被动拦截」——程序自己走到那儿才有数据。但很多场景需要 **主动触发**：

-   想验证某个加密函数对特定输入的结果，但 App 里没有入口能构造这个输入；
-   想批量跑不同的参数，看输出规律；
-   想在 App 启动前就拿到密钥，而不是等它被调用。

这就是主动调用（ `NativeFunction` / `Java.use().$new()` / `method()` ）的用武之地。

### 4.2 setImmediate 与 RPC 的关系

```javascript
setImmediate(function () {
    // 主逻辑放在这里
});
```

`setImmediate` 的作用是 **让脚本在注入后立即返回，但保持运行状态**。

为什么 RPC 需要它？如果脚本主体直接在顶层执行并结束，Frida 会认为脚本已执行完毕，后续的 `rpc.exports` 调用可能失效。用 `setImmediate` 把主逻辑推到下一轮事件循环，脚本就「挂在那儿」等外部调用。

> 实践要点： **只要导出 RPC，就把脚本主体包在 `setImmediate` 里**。这样脚本注入后立即响应，Python 侧不会卡在 `script.exports` 上超时。

### 4.3 RPC 导出：把 Hook 变成可编程函数

**Frida 侧**：

```javascript
setImmediate(function () {
    console.log("[*] script loaded, rpc ready");
});

rpc.exports = {
    // 导出为 Python 的 script.exports.call_secret_function(...)
    callSecretFunction: function (arg) {
        var result = null;

        Java.perform(function () {
            var cls = Java.use("com.target.Crypto");
            result = cls.calcKey(arg);
        });

        return result;   // 返回值会自动序列化传给 Python
    },

    // 无参方法
    getVersion: function () {
        return Java.perform(function () {
            return Java.use("android.os.Build").VERSION.SDK.value.toString();
        });
    },

    // 返回对象（会被序列化成 JS 对象 → Python dict）
    dumpConfig: function () {
        var out = {};
        Java.perform(function () {
            var cls = Java.use("com.target.Config");
            out.key = cls.API_KEY.value;
            out.url = cls.BASE_URL.value;
        });
        return out;
    }
};
```

**Python 侧**：

```python
import frida
import sys

JS_CODE = open("hook.js", "r", encoding="utf-8").read()

def on_message(message, data):
    if message["type"] == "send":
        print("[Python] got:", message["payload"])
    else:
        print("[Python] error:", message)

# 连接设备
device = frida.get_usb_device()
pid = device.spawn(["com.target.app"])   # spawn 方式：先启动再 Hook
session = device.attach(pid)
script = session.create_script(JS_CODE)
script.on("message", on_message)
script.load()
device.resume(pid)                       # 恢复进程，让 App 跑起来

# 调用 RPC 导出的方法
result = script.exports.call_secret_function("input_data")
print("[Python] calcKey('input_data') =", result)

# 批量跑不同输入
for i in range(10):
    r = script.exports.call_secret_function(f"input_{i}")
    print(f"[Python] input_{i} -> {r}")

sys.stdin.read()
```

Python 侧调用的是 `script.exports.<下划线命名>` —— **JS 里的 `callSecretFunction` 在 Python 里变成 `call_secret_function`** （驼峰转下划线）。这个转换是 Frida 自动做的，容易记错，导致 `AttributeError` 。

### 4.4 spawn vs attach

| 方式  | 时机  | 适用场景 |
| --- | --- | --- |
| `device.attach(pid)` | App 已经在跑 | 临时调试、Hook 无需在启动早期生效 |
| `device.spawn([pkg])` + `resume(pid)` | 先挂载再启动 | **需要 hook 早期初始化逻辑** （加固壳解密、密钥生成） |

**加固 App 几乎必须用 spawn**：壳在 `Application.onCreate` 里就完成了解密，等你 attach 上去，类已经加载完了， `Java.use` 可能拿不到。

`spawn` 之后必须调 `device.resume(pid)` ，否则 App 一直挂起（表现是白屏、无响应）。

* * *

## 五、阶段 5：自动化与群控——从单次 Hook 到批量流水线

### 5.1 三段式自动化

```text
① 把常用 Hook 沉淀为可复用的 Frida 脚本库
② 用 Frida RPC + Python 驱动，把脚本变成可编程调用的函数
③ 串联成批量扫描 App 的流水线，接入 CI
```

这个分层的价值在于： **Hook 逻辑和调度逻辑分离**。脚本库负责「怎么 Hook」，Python 负责「什么时候 Hook、Hook 谁、结果存哪」。

### 5.2 脚本库的分层设计

一个可用的脚本库通常长这样：

```text
scripts/
├── common/
│   ├── anti_debug.js        # 反反调试
│   ├── ssl_bypass.js        # SSL Pinning 绕过
│   └── trace.js             # 通用方法 trace
├── crypto/
│   ├── hook_aes.js          # AES 相关
│   └── hook_jni.js          # JNI 层加密函数
└── app/
    └── target_app.js        # 具体 App 的定制 Hook
```

加载时按需拼接：

```python
def build_script(*modules):
    parts = []
    for m in modules:
        with open(f"scripts/{m}.js", "r", encoding="utf-8") as f:
            parts.append(f.read())
    return "\n".join(parts)

js = build_script("common/anti_debug", "common/ssl_bypass", "crypto/hook_jni")
script = session.create_script(js)
```

这样做的好处：改一个模块不影响其他场景，脚本组合由 Python 控制，不用维护 N 份重复代码。

### 5.3 群控的工程化思路

群控的本质是 **把单机 Hook 脚本批量化、参数化、可调度化**：

| 维度  | 做法  |
| --- | --- |
| 多设备 | `frida.get_device_mgr().enumerate_devices()` 遍历，每台设备开独立 session |
| 多进程 | `device.enumerate_processes()` 过滤目标进程，逐个 attach |
| 统一调度 | 所有设备共用同一份脚本库 + RPC 接口，Python 侧并发调用 |
| 日志集中 | `script.on("message")` 统一收集，按设备/进程打标签落盘 |

一个最小可用的并发骨架：

```python
import frida
from concurrent.futures import ThreadPoolExecutor

def process_device(device):
    try:
        session = device.attach("com.target.app")
        script = session.create_script(JS_CODE)
        msgs = []
        script.on("message", lambda m, d: msgs.append(m))
        script.load()

        result = script.exports.call_secret_function("probe")
        return {"device": device.id, "result": result, "logs": len(msgs)}
    except Exception as e:
        return {"device": device.id, "error": str(e)}

devices = [d for d in frida.get_device_mgr().enumerate_devices()
           if d.type == "usb"]

with ThreadPoolExecutor(max_workers=4) as pool:
    results = list(pool.map(process_device, devices))

for r in results:
    print(r)
```

> **注意并发上限**：Frida 的 session 数量受设备端 frida-server 限制，真机上同时挂十几个 session 会明显卡顿。实际群控通常是「分批 + 队列」而不是无限并发。

### 5.4 FridaContainer：现成的脚本集

如果要快速起步而不是从零写，FridaContainer 是一个集成化脚本集，把常见需求封装成了函数调用：

```javascript
FCAnd.anti.anti_debug();               // 反反调试
FCAnd.traceArtMethods([...], {...});   // Java 方法 trace
FCAnd.jni.hookJNI('NewStringUTF', {}); // Hook JNI 函数
```

它的定位是「速查 + 脚本集」，适合当参考实现——遇到具体问题时看它怎么处理，比从头摸索快。

> 但要注意： **现成脚本集是双刃剑**。它对某个特定版本的加固方案有效，换个 App 或换个加固版本就可能失效。理解原理（本文前三阶段）比背 API 更重要。

* * *

## 六、阶段 6：实战对抗——反调试与 SSL Pinning

### 6.1 反反调试（Anti-Anti-Debug）

很多反调试手段通过读取状态文件，查找特征字符串判断是否被调试：

| 文件  | 特征  |
| --- | --- |
| `/proc/<pid>/status` | `TracerPid:` 字段非 0 表示被跟踪 |
| `/proc/<pid>/stat` | 第 3 个字段是 state， `t` 表示 tracing stop |
| `/proc/<pid>/wchan` | 调试时值不同 |
| `/proc/<pid>/task/*/status` | 多线程场景下每个线程都要查 |
| `/proc/<pid>/maps` | 出现 `frida` 、 `xposed` 、 `gum-js-loop` 等特征 |

**绕过思路一：Hook `fgets` ，过滤特征串**

这是最经典的打法——反调试代码最终都要读文件内容然后 `strstr` 比对，在「读」和「比」之间插一刀：

```javascript
var fgets = Module.findExportByName(null, "fgets");

Interceptor.attach(fgets, {
    onEnter: function (args) {
        this.buf = args[0];
        this.size = args[1];
        this.stream = args[2];

        // 顺便记下调用者，方便定位反调试点
        this.caller = this.returnAddress;
    },
    onLeave: function (retval) {
        if (retval.isNull()) return;

        var content = retval.readCString();
        if (content === null) return;

        // 过滤掉暴露调试状态的特征
        if (content.indexOf("TracerPid") >= 0 ||
            content.indexOf("frida") >= 0 ||
            content.indexOf("gum-js-loop") >= 0 ||
            content.indexOf("TracerPid:\t0") < 0 && content.indexOf("TracerPid:\t") >= 0) {

            // 直接把 TracerPid 改成 0
            if (content.indexOf("TracerPid") >= 0) {
                var fake = content.replace(/TracerPid:\s*\d+/, "TracerPid:\t0");
                this.buf.writeUtf8String(fake);
            }
        }
    }
});
```

更彻底的做法是 **把整个特征行抹掉**，或者让 `fgets` 返回上一行（扰乱解析逻辑）。

**绕过思路二：Hook 退出函数，反向定位**

如果上面的方法没生效（App 还是退出了），说明反调试不走 `fgets` 路径，或者绕过的时机太晚。这时候换成「守出口」：

```javascript
["exit", "_exit", "_Exit", "kill", "raise", "abort"].forEach(function (name) {
    var addr = Module.findExportByName(null, name);
    if (!addr) return;

    Interceptor.attach(addr, {
        onEnter: function (args) {
            console.log("[!] " + name + " called!");
            console.log("    arg0:", args[0]);

            // 打印调用栈，直接告诉你是谁触发了退出
            console.log("    backtrace:\n" +
                Thread.backtrace(this.context, Backtracer.ACCURATE)
                    .map(DebugSymbol.fromAddress).join("\n"));

            this.skip = true;
        },
        onLeave: function (retval) {
            // 想彻底阻止退出，在这里 replace 掉（但可能引起其他问题）
        }
    });
});
```

`kill` 和 `exit` 的调用栈会直接指出反调试代码的位置——拿到地址后回 IDA 看，比猜快得多。

**其他常见检测点**：

| 检测方式 | 绕过思路 |
| --- | --- |
| 检测 `frida-server` 进程 / 端口（27042） | 改 frida-server 名字、改端口、用 `frida-gadget` 注入 |
| 检测 `frida` 相关线程名（ `gum-js-loop` 、 `gmain` ） | Hook `pthread_create` ，改线程名 |
| 检测 `/proc/self/maps` 里的 `frida-agent` | Hook `open` / `openat` ，过滤路径 |
| 检测 `ptrace` 附加 | Hook `ptrace` 返回 0 |
| 检测 Xposed（ `de.robv.android.xposed` ） | Hook `ClassLoader.loadClass` ，对特定类名返回 null |
| 检测调试器（ `Debug.isDebuggerConnected()` ） | Hook 该方法返回 false |

### 6.2 SSL Pinning 绕过

**先理解为什么装证书不管用**：普通 HTTPS 只校验证书链是否由可信 CA 签发，装个用户证书就行。 **SSL Pinning 额外把「服务器证书/公钥的哈希」写死在客户端**，校验时对比哈希——证书链再合法，哈希对不上也拒绝。

所以绕过的本质是： **让校验函数永远返回成功**，而不是欺骗证书链。

**常见的 Pinning 实现层次**：

| 层次  | 实现  | 绕过方式 |
| --- | --- | --- |
| 系统默认 | `TrustManager` | Hook `checkServerTrusted` 空实现 |
| Android 7+ | `TrustManagerImpl` （Conscrypt） | Hook `checkTrustedRecursive` |
| 网络库 | OkHttp `CertificatePinner` | Hook `check()` 方法 |
| 第三方 | TrustKit、Netty、PhoneGap | 各家有各家的入口 |

**一个覆盖多层的 Hook 脚本骨架**：

```javascript
function bypassSSLPinning() {
    Java.perform(function () {
        // ---- 1. 系统 TrustManager ----
        try {
            var TrustManagerImpl = Java.use("com.android.org.conscrypt.TrustManagerImpl");
            TrustManagerImpl.checkTrustedRecursive.implementation = function () {
                console.log("[*] TrustManagerImpl.checkTrustedRecursive bypassed");
                return Java.use("java.util.ArrayList").$new();
            };
        } catch (e) { console.log("[-] TrustManagerImpl not found"); }

        // ---- 2. X509TrustManager（兜底，覆盖老版本和自定义实现） ----
        try {
            var X509TrustManager = Java.use("javax.net.ssl.X509TrustManager");
            var TrustManager = Java.registerClass({
                name: "org.frida.TrustAll",
                implements: [X509TrustManager],
                methods: {
                    checkClientTrusted: function (chain, authType) {},
                    checkServerTrusted: function (chain, authType) {},
                    getAcceptedIssuers: function () { return []; }
                }
            });

            // 替换 SSLContext 的初始化
            var SSLContext = Java.use("javax.net.ssl.SSLContext");
            SSLContext.init.overload(
                '[Ljavax.net.ssl.KeyManager;',
                '[Ljavax.net.ssl.TrustManager;',
                'java.security.SecureRandom'
            ).implementation = function (km, tm, sr) {
                console.log("[*] SSLContext.init bypassed");
                this.init(km, [TrustManager.$new()], sr);
            };
        } catch (e) { console.log("[-] X509TrustManager hook failed:", e); }

        // ---- 3. OkHttp 3.x CertificatePinner ----
        try {
            var CertificatePinner = Java.use("okhttp3.CertificatePinner");
            var check3 = CertificatePinner.check.overload(
                'java.lang.String', 'java.util.List'
            );
            check3.implementation = function () {
                console.log("[*] OkHttp3 CertificatePinner bypassed");
            };
        } catch (e) { console.log("[-] OkHttp3 not used"); }

        // ---- 4. 老版本 OkHttp 2.x（包名不同） ----
        try {
            var OldPinner = Java.use("com.squareup.okhttp.CertificatePinner");
            var check2 = OldPinner.check.overload(
                'java.lang.String', 'java.util.List'
            );
            check2.implementation = function () {
                console.log("[*] OkHttp2 CertificatePinner bypassed");
            };
        } catch (e) {}
    });
}
```

> **注意 OkHttp 的版本差异**：3.x 是 `okhttp3.CertificatePinner` ，2.x 是 `com.squareup.okhttp.CertificatePinner` ，有的 App 两个都用了（多模块）。写脚本时两个都挂上更稳。

**如果 Pinning 在 native 层实现** （越来越多 App 这么干），Java 层 Hook 就无效了，需要：

-   Hook libssl 的 `SSL_verify_cert_chain` / `X509_verify_cert` ；
-   或 Hook 应用的 `SSL_CTX_set_verify` ，把回调改成 always OK；
-   或直接上 `frida-gadget` + 网络层 hook。

**验证是否绕过成功**：最简单的办法是在 Frida 里 Hook `SSL_write` / `SSL_read` ，看有没有明文流量。如果能看到 HTTP 内容，说明 Pinning 已经破了。

* * *

## 七、常见坑速查

| 现象  | 原因  | 解决  |
| --- | --- | --- |
| `Java is not defined` | 没包 `Java.perform` | 所有 Java 操作放进 `Java.perform(function(){...})` |
| `has more than one overload` | 方法有重载但没指定签名 | 用 `.overload('int', 'java.lang.String')` |
| `ClassNotFoundException` | 类还没加载 / 动态 DEX | `enumerateClassLoaders` 遍历，或用 spawn 方式 |
| `Device not found` | frida-server 没跑 / 端口不对 | 确认 `adb shell` 里 frida-server 在跑，端口 27042 |
| `Permission denied` | frida-server 没有 root 权限 | `su -c ./frida-server` ，或换 root 设备 |
| Hook 上了但没触发 | 函数没被调用 / Hook 时机太晚 | 改 spawn 方式；或确认业务路径真的走到 |
| 挂上 JNI 函数后崩溃 | 签名或偏移不对 | 检查 `NativeFunction` 的参数类型；JNIEnv 偏移表从 jni.h 完整复制 |
| Python 调 RPC 报 `AttributeError` | 驼峰没转下划线 | JS 的 `callSecretFunction` → Python 的 `call_secret_function` |
| trace 一开 App 就卡死 | 全量 trace 性能崩 | 加白名单，只 trace 关键方法 |
| `Interceptor.attach` 返回 0 | 地址无效（未导出且偏移错） | 用 `base.add(offset)` 且确认 offset 是十进制还是十六进制 |

* * *

## 八、从浅到深的自学顺序

```text
第 1 遍：Java 层基础——Java.perform / Java.use / implementation 改写
        └─ 能 Hook 一个普通 Java 方法，打印入参和返回值

第 2 遍：类枚举与内部类——enumerateClassLoaders / enumerateLoadedClasses
        └─ 能定位动态加载的 DEX 中的类

第 3 遍：SO 层基础——Module.findBaseAddress / findExportByName / Interceptor.attach
        └─ 能 Hook 一个导出函数，打印 args 和 retval

第 4 遍：JNI 深入——libart.so 枚举符号 / JNIEnv 指针偏移 / RegisterNatives
        └─ 能 Hook 动态注册的 JNI 函数

第 5 遍：RPC 与主动调用——setImmediate / rpc.exports / Python 驱动
        └─ 能把一个 Hook 脚本导出为 Python 可调用的接口

第 6 遍：对抗实战——反调试绕过 / SSL Pinning 绕过
        └─ 能在有检测的环境下稳定运行 Hook 脚本
```

每一步都建议在真机或模拟器上实际跑一遍。Frida 的坑基本都在「跑起来才暴露」的层面——文档里的 API 都是对的，但组合起来的时序问题、版本差异、加载时机才是真正的门槛。

**做到拿到一个陌生 App，能在 30 分钟内定位到关键加密函数并把它导出成 Python 可调用的接口，这一块就算入门了。**

* * *

## 九、关键记忆点

1.  **Java 层三件套**： `Java.perform()` + `Java.use()` + `implementation` 改写，是所有 Java Hook 的基础。
2.  **重载必须 `overload()`**：不指定签名就报 `has more than one overload` ，这是最高频报错。
3.  **动态 DEX 用 `enumerateClassLoaders`**：加固壳的类不在默认 loader 里，必须遍历所有 loader 逐个尝试。
4.  **SO 层三件套**： `Module.findBaseAddress` / `findExportByName` 定位地址， `Interceptor.attach` 拦截调用。
5.  **JNI 函数在 libart.so 中**：枚举符号或 `JNIEnv` 指针偏移定位；偏移表必须从 `jni.h` 完整复制。
6.  **`RegisterNatives` 是动态注册的入口**：Hook 它能在注册瞬间拿到「方法名 → native 地址」的完整映射。
7.  **RPC 让脚本可编程**： `rpc.exports` 导出函数，Python 侧驱动调用，是从手工调试走向自动化的关键。
8.  **`setImmediate` 是 RPC 的前提**：不把主逻辑挂起来，脚本注入完就结束了。
9.  **加固 App 必须用 spawn**：壳在启动早期就完成解密，attach 太晚拿不到类。
10.  **反调试绕过优先 Hook `fgets`**，无效再 Hook `exit` / `kill` 反向定位。
11.  **SSL Pinning 绕过本质是让校验函数返回成功**，不是装证书；native 层 Pinning 要 Hook `SSL_verify_cert_chain` 。
12.  **群控 = 脚本库 + RPC + 流水线**，把单次 Hook 工程化为可批量调度的工作流。
13.  **现成脚本集是参考不是银弹**：对某个加固版本有效，换个版本就失效，理解原理更重要。
