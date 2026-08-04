---
title: 手写 Android Dex VMP 壳：自定义虚拟机 + 指令解释执行全流程 // CYRUS STUDIO
source: https://cyrus-studio.github.io/blog/posts/%E6%89%8B%E5%86%99-android-dex-vmp-%E5%A3%B3%E8%87%AA%E5%AE%9A%E4%B9%89%E8%99%9A%E6%8B%9F%E6%9C%BA-+-%E6%8C%87%E4%BB%A4%E8%A7%A3%E9%87%8A%E6%89%A7%E8%A1%8C%E5%85%A8%E6%B5%81%E7%A8%8B/
source_host: cyrus-studio.github.io
clip_date: 2026-08-04T14:08:28+08:00
trace_id: ef55a9fa-52d9-4d2c-8881-4a126c7a7fbe
content_hash: e4e308cbb60f04a1c73746aa2f9b00379904eec3222d4f47fdb22476727bd4c9
status: synced
tags:
  - Android逆向
  - 脱壳与加固
series: null
feed_source: Cyrus Studio·安卓逆向
ai_summary: 通过将Dex方法体替换为自定义字节码，由C++编写的虚拟机解释器逐条执行，实现对Android应用关键算法的代码隐藏与抗逆向保护。
ai_summary_style: key-points
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 3b275244-d011-81e5-8cc3-ddd040f7f716
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 通过将Dex方法体替换为自定义字节码，由C++编写的虚拟机解释器逐条执行，实现对Android应用关键算法的代码隐藏与抗逆向保护。
> 
> - **核心思路：** 将原始Dex指令流映射为自定义字节码数组，存储在加密壳中；运行时由Native层虚拟机解释器加载、解析并模拟执行，隐藏真实逻辑。
> - **解释器结构：** 使用C++构建基于`switch-case`的取指-解码-执行循环，支持const-string、invoke-static、invoke-virtual、move-result-object、sget-object、return-object等关键指令的模拟。
> - **指令映射示例：** `const-string v0, "SHA-256"`被编码为`1A 00 2C 00`字节码，解释器通过操作码`0x1A`定位，从模拟字符串池获取字符串并写入虚拟寄存器v0。
> - **寄存器与常量池模拟：** 使用`std::variant`实现多类型虚拟寄存器数组；采用`std::unordered_map`维护字符串索引到内容的映射，替代真实的Dex字符串池。
> - **安全性增强方向：** 提出字节码流AES加密、动态加载、多态指令集和反调试检测等进阶保护措施，以提升抗静态分析与动态调试的能力。

> 版权归作者所有，如有转发，请注明文章出处： [https://cyrus-studio.github.io/blog/](https://cyrus-studio.github.io/blog/)

## 前言

在 Android 安全领域， **VMP（Virtual Machine Protection，虚拟机保护）壳** 一直被视为最难攻克的加固技术之一。它通过将 Dex 指令转换为自定义字节码，再由虚拟机解释执行，从而大幅增加逆向分析的门槛。

带你 **一步步手写一个 Dex VMP 壳**：

-   如何把 Java/Dex 转换为字节码指令流
    
-   如何构建一个最小可用的解释器
    
-   如何模拟寄存器、字符串池
    
-   如何解析并执行典型指令（const-string、invoke、return 等）
    

## Android Dex VMP 壳执行流程

Android Dex VMP 壳执行流程图述：

```typescript
┌─────────────────────────┐
│  Java/Kotlin 源代码      │
└─────────────┬───────────┘
              │
              ▼
┌─────────────────────────┐
│   编译 → Dex 字节码      │
│  (标准 Android APK)     │
└─────────────┬───────────┘
              │
              ▼
┌─────────────────────────┐
│  VMP 转换层              │
│  - 扫描目标类/方法        │
│  - 将指令映射为自定义字节码│
│  - 生成指令流 (Custom IR) │
└─────────────┬───────────┘
              │
              ▼
┌─────────────────────────┐
│  VMP 虚拟机解释器        │
│  - 初始化寄存器池         │
│  - 加载字符串常量池       │
│  - 逐条取指、解析、执行   │
└─────────────┬───────────┘
              │
              ▼
┌─────────────────────────┐
│   指令解析与执行逻辑     │
│   1. const-string        │
│   2. invoke-static       │
│   3. move-result-object  │
│   4. sget-object         │
│   5. invoke-virtual      │
│   6. return-object       │
└─────────────┬───────────┘
              │
              ▼
┌─────────────────────────┐
│   最终运行效果           │
│   - 表面上像普通代码执行  │
│   - 实际走自定义 VM 流程  │
│   - 增加逆向/还原难度    │
└─────────────────────────┘
```

**流程说明**：

1.  源代码 → Dex 字节码：普通编译产物。
    
2.  VMP 转换层：把 Dex 中的方法替换为“虚拟机入口函数”，真实逻辑转为自定义字节码流存储。
    
3.  虚拟机解释器：运行时加载自定义字节码，模拟执行环境（寄存器 + 常量池）。
    
4.  指令执行：一步步解析、执行，还原原始逻辑。
    
5.  对抗逆向：逆向者即使拿到 Dex，也只能看到“VM.run()”，逻辑被隐藏在虚拟机里。
    

## Android 示例代码

比如，通过实现一个 Android 下的 Dex VMP 保护壳，用来保护 Kotlin 层 sign 算法，防止被逆向。

假设 sign 算法源码如下：

```kotlin
package com.cyrus.example.vmp

import java.security.MessageDigest
import java.util.Base64

object SignUtil {

    /**
     * 对输入字符串进行签名并返回 Base64 编码后的字符串
     * @param input 要签名的字符串
     * @return Base64 编码后的字符串
     */
    fun sign(input: String): String {
        // 使用 SHA-256 计算摘要
        val digest = MessageDigest.getInstance("SHA-256")
        val hash = digest.digest(input.toByteArray())

        // 使用 Base64 编码
        return Base64.getEncoder().encodeToString(hash)
    }
}
```

## 把 Java/Dex 转换为字节码指令流

把 apk 拖入 GDA，找到 sign 方法，右键选择 SmaliJava（F5）

[![word/media/image1.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/4885badca6d712fb.png)](data:image/png;base64,inline-658238B)

GDA 是一个开源的 Android 逆向分析工具，可反编译 APK、DEX、ODEX、OAT、JAR、AAR 和 CLASS 文件，支持恶意行为检测、隐私泄露检测、漏洞检测、路径解密、打包器识别、变量跟踪、反混淆、python 和 Java 脚本等等…

-   GDA 下载地址： [http://www.gda.wiki:9090/](http://www.gda.wiki:9090/)
    
-   GDA 项目地址： [https://github.com/charles2gan/GDA-android-reversing-Tool](https://github.com/charles2gan/GDA-android-reversing-Tool)
    

Show ByteCode

[![word/media/image2.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/21d6f6ca9b541e55.png)](data:image/png;base64,inline-457934B)

得到字节码和对应的 smali 指令如下：

```swift
1a004e00            | const-string v0, "input"
712020000500        | invoke-static{v5, v0}, Lkotlin/jvm/internal/Intrinsics;->checkNotNullParameter(Ljava/lang/Object;Ljava/lang/String;)V
1a002c00            | const-string v0, "SHA-256"
71101c000000        | invoke-static{v0}, Ljava/security/MessageDigest;->getInstance(Ljava/lang/String;)Ljava/security/MessageDigest;
0c00                | move-result-object v0
62010900            | sget-object v1, Lkotlin/text/Charsets;->UTF_8:Ljava/nio/charset/Charset;
6e2016001500        | invoke-virtual{v5, v1}, Ljava/lang/String;->getBytes(Ljava/nio/charset/Charset;)[B
0c01                | move-result-object v1
1a024a00            | const-string v2, "getBytes\(...\)"
71201f002100        | invoke-static{v1, v2}, Lkotlin/jvm/internal/Intrinsics;->checkNotNullExpressionValue(Ljava/lang/Object;Ljava/lang/String;)V
6e201b001000        | invoke-virtual{v0, v1}, Ljava/security/MessageDigest;->digest([B)[B
0c01                | move-result-object v1
71001e000000        | invoke-static{}, Ljava/util/Base64;->getEncoder()Ljava/util/Base64$Encoder;
0c02                | move-result-object v2
6e201d001200        | invoke-virtual{v2, v1}, Ljava/util/Base64$Encoder;->encodeToString([B)Ljava/lang/String;
0c02                | move-result-object v2
1a034400            | const-string v3, "encodeToString\(...\)"
71201f003200        | invoke-static{v2, v3}, Lkotlin/jvm/internal/Intrinsics;->checkNotNullExpressionValue(Ljava/lang/Object;Ljava/lang/String;)V
1102                | return-object v2
```

## VMP 虚拟机解释器

解释器的任务是执行这些虚拟机指令。我们需要写一个虚拟机，它能够按照虚拟指令集中的指令依次执行操作。

创建 cpp 文件，定义一个 JNI 方法 execute，接收字节码数组和字符串参数，每个字节码指令会被映射为我们定义的虚拟指令。

```cpp
#define CONST_STRING_OPCODE 0x1A  // const-string 操作码
#define INVOKE_STATIC_OPCODE 0x71  // invoke-static 操作码
#define MOVE_RESULT_OBJECT_OPCODE 0x0c  // move-result-object 操作码
#define SGET_OBJECT_OPCODE 0x62  // sget-object 操作码
#define INVOKE_VIRTUAL_OPCODE 0x6e  // invoke-virtual 操作码
#define RETURN_OBJECT_OPCODE 0x11  // return-object 操作码


jstring execute(JNIEnv *env, jobject thiz, jbyteArray bytecodeArray, jstring input) {

    // 传参存到 v5 寄存器
    registers[5] = input;

    // 获取字节码数组的长度
    jsize length = env->GetArrayLength(bytecodeArray);
    std::vector <uint8_t> bytecode(length);
    env->GetByteArrayRegion(bytecodeArray, 0, length, reinterpret_cast<jbyte *>(bytecode.data()));

    size_t pc = 0;  // 程序计数器
    try {
        // 执行字节码中的指令
        while (pc < bytecode.size()) {
            uint8_t opcode = bytecode[pc];

            switch (opcode) {
                case CONST_STRING_OPCODE:
                    handleConstString(env, bytecode.data(), pc);
                    break;
                case INVOKE_STATIC_OPCODE:
                    handleInvokeStatic(env, bytecode.data(), pc);
                    break;
                case SGET_OBJECT_OPCODE:
                    handleSgetObject(env, bytecode.data(), pc);
                    break;
                case INVOKE_VIRTUAL_OPCODE:
                    handleInvokeVirtual(env, bytecode.data(), pc);
                    break;
                case RETURN_OBJECT_OPCODE:
                    handleReturnResultObject(env, bytecode.data(), pc);
                    break;
                default:
                    throw std::runtime_error("Unknown opcode encountered");
            }
        }

        if (std::holds_alternative<jstring>(registers[0])) {
            jstring result = std::get<jstring>(registers[0]);   // 返回寄存器 v0 的值
            // 清空寄存器
            std::fill(std::begin(registers), std::end(registers), nullptr);
            return result;
        }
    } catch (const std::exception &e) {
        env->ThrowNew(env->FindClass("java/lang/RuntimeException"), e.what());
    }

    // 清空寄存器
    std::fill(std::begin(registers), std::end(registers), nullptr);
    return nullptr;
}
```

## 模拟寄存器

使用 std::variant 来定义一个可以存储多种类型的寄存器值。

```
// 定义支持的寄存器类型（比如 jstring、jboolean、jobject 等等）
using RegisterValue = std::variant<
        jstring,
        jboolean,
        jbyte,
        jshort,
        jint,
        jlong,
        jfloat,
        jdouble,
        jobject,
        jbyteArray,
        jintArray,
        jlongArray,
        jfloatArray,
        jdoubleArray,
        jbooleanArray,
        jshortArray,
        jobjectArray,
        std::nullptr_t
>;
```

std::variant 是 C++17 引入的一个模板类，用于表示一个可以存储多种类型中的一种的类型。它类似于联合体（union），但是比联合体更安全，因为它可以明确地跟踪当前存储的是哪一种类型。

定义寄存器个数和寄存器数组

```
// 定义寄存器数量
constexpr size_t NUM_REGISTERS = 10;

// 定义寄存器数组
RegisterValue registers[NUM_REGISTERS];
```

写寄存器

```cpp
// 存储不同类型的值到寄存器
template <typename T>
void setRegisterValue(uint8_t reg, T value) {
    // 通过模板将类型 T 存储到寄存器
    registers[reg] = value;
}
```

读寄存器

```rust
// 根据类型从寄存器读取对应的值
jvalue getRegisterAsJValue(int regIdx, const std::string &paramType) {
    const RegisterValue &val = registers[regIdx];
    jvalue result;

    if (paramType == "I") {  // int 类型
        if (std::holds_alternative<jint>(val)) {
            result.i = std::get<jint>(val);
        } else {
            throw std::runtime_error("Type mismatch: Expected jint.");
        }
    } else if (paramType == "J") {  // long 类型
        if (std::holds_alternative<jlong>(val)) {
            result.j = std::get<jlong>(val);
        } else {
            throw std::runtime_error("Type mismatch: Expected jlong.");
        }
    } else if (paramType == "F") {  // float 类型
        if (std::holds_alternative<jfloat>(val)) {
            result.f = std::get<jfloat>(val);
        } else {
            throw std::runtime_error("Type mismatch: Expected jfloat.");
        }
    } else if (paramType == "D") {  // double 类型
        if (std::holds_alternative<jdouble>(val)) {
            result.d = std::get<jdouble>(val);
        } else {
            throw std::runtime_error("Type mismatch: Expected jdouble.");
        }
    } else if (paramType == "Z") {  // boolean 类型
        if (std::holds_alternative<jboolean>(val)) {
            result.z = std::get<jboolean>(val);
        } else {
            throw std::runtime_error("Type mismatch: Expected jboolean.");
        }
    } else if (paramType == "B") {  // byte 类型
        if (std::holds_alternative<jbyte>(val)) {
            result.b = std::get<jbyte>(val);
        } else {
            throw std::runtime_error("Type mismatch: Expected jbyte.");
        }
    } else if (paramType == "S") {  // short 类型
        if (std::holds_alternative<jshort>(val)) {
            result.s = std::get<jshort>(val);
        } else {
            throw std::runtime_error("Type mismatch: Expected jshort.");
        }
    } else if (paramType == "Ljava/lang/String;") {  // String 类型
        if (std::holds_alternative<jstring>(val)) {
            result.l = std::get<jstring>(val);
        } else {
            throw std::runtime_error("Type mismatch: Expected jstring.");
        }
    } else if (paramType[0] == 'L') {  // jobject 类型（以 L 开头）
        if (std::holds_alternative<jstring>(val)) {
            result.l = std::get<jstring>(val);
        } else if (std::holds_alternative<jobject>(val)) {
            result.l = std::get<jobject>(val);
        } else {
            throw std::runtime_error("Type mismatch: Expected jobject.");
        }
    } else if (paramType[0] == '[') {  // 数组类型
        // 处理数组类型，判断是基础类型数组还是对象数组
        if (paramType == "[I") {  // jintArray 类型
            if (std::holds_alternative<jintArray>(val)) {
                result.l = std::get<jintArray>(val);  // jvalue 直接存储数组
            } else {
                throw std::runtime_error("Type mismatch: Expected jintArray.");
            }
        } else if (paramType == "[J") {  // jlongArray 类型
            if (std::holds_alternative<jlongArray>(val)) {
                result.l = std::get<jlongArray>(val);
            } else {
                throw std::runtime_error("Type mismatch: Expected jlongArray.");
            }
        } else if (paramType == "[F") {  // jfloatArray 类型
            if (std::holds_alternative<jfloatArray>(val)) {
                result.l = std::get<jfloatArray>(val);
            } else {
                throw std::runtime_error("Type mismatch: Expected jfloatArray.");
            }
        } else if (paramType == "[D") {  // jdoubleArray 类型
            if (std::holds_alternative<jdoubleArray>(val)) {
                result.l = std::get<jdoubleArray>(val);
            } else {
                throw std::runtime_error("Type mismatch: Expected jdoubleArray.");
            }
        } else if (paramType == "[Z") {  // jbooleanArray 类型
            if (std::holds_alternative<jbooleanArray>(val)) {
                result.l = std::get<jbooleanArray>(val);
            } else {
                throw std::runtime_error("Type mismatch: Expected jbooleanArray.");
            }
        } else if (paramType == "[B") {  // jbyteArray 类型
            if (std::holds_alternative<jbyteArray>(val)) {
                result.l = std::get<jbyteArray>(val);
            } else {
                throw std::runtime_error("Type mismatch: Expected jbyteArray.");
            }
        } else if (paramType == "[S") {  // jshortArray 类型
            if (std::holds_alternative<jshortArray>(val)) {
                result.l = std::get<jshortArray>(val);
            } else {
                throw std::runtime_error("Type mismatch: Expected jshortArray.");
            }
        } else if (paramType == "[Ljava/lang/String;") {  // String[] 类型
            if (std::holds_alternative<jobjectArray>(val)) {
                result.l = std::get<jobjectArray>(val);
            } else {
                throw std::runtime_error("Type mismatch: Expected String array.");
            }
        } else if (paramType[0] == '[' && paramType[1] == 'L') {  // jobject[] 类型（数组的元素为对象）
            if (std::holds_alternative<jobjectArray>(val)) {
                result.l = std::get<jobjectArray>(val);
            } else {
                throw std::runtime_error("Type mismatch: Expected jobject array.");
            }
        } else {
            throw std::runtime_error("Unsupported array type.");
        }
    } else {
        throw std::runtime_error("Unsupported parameter type.");
    }
    return result;
}
```

## 模拟字符串常量池

由于指令中用到字符串，所以需要模拟一个字符串常量池去实现指令中字符串的引用。

在 dex 文件中，字符串常量池（string_ids）是一个数组，其中每个条目存储一个字符串的偏移量，这个偏移量指向 dex 文件中 string_data 区域。

[![word/media/image3.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/48be4c8fad6d6288.png)](data:image/png;base64,inline-117018B)

这里简单通过字符串索引和字符串做关联，代码实现如下：

```cpp
// 模拟字符串常量池
std::unordered_map <uint32_t, std::string> stringPool = {
        {0x004e00, "input"},
        {0x002c00, "SHA-256"},
        {0x024a00, "getBytes\\(...\\)"},
        {0x034400, "encodeToString\\(...\\)"},
};
```

## 指令解析执行

虚拟机接收到字节指令流，经过解析操作码并分发到各指令执行函数。接下来实现指令执行函数。

## 1\. const-string

该指令将一个预定义的字符串常量加载到指定的寄存器中。例如：

```
const-string v0, "Hello, World!"
```

这条指令的作用是将字符串 “Hello, World!” 加载到寄存器 v0 中。

### 指令结构

const-string v0, “input” 的字节码为：

```
1A 00 4E 00
```

结构解释：

-   1A (操作码)： 表示 const-string 指令。
    
-   00 (目标寄存器 v0)： 表示字符串将存储到寄存器 v0 中。
    
-   4E 00 (字符串索引 0x004E)： 表示字符串在字符串常量池中的位置。
    

### 具体代码实现

```cpp
// 处理 const-string 指令
void handleConstString(JNIEnv *env, const uint8_t *bytecode, size_t &pc) {
    uint8_t opcode = bytecode[pc];
    if (opcode != CONST_STRING_OPCODE) {  // 检查是否为 const-string 指令
        throw std::runtime_error("Unexpected opcode");
    }

    // 获取目标寄存器索引 reg 和字符串索引
    uint8_t reg = bytecode[pc + 1];  // 目标寄存器
    // 读取字符串索引（第 2、3、4 字节）
    uint32_t stringIndex = (bytecode[pc + 1] << 16) | (bytecode[pc + 2] << 8) | bytecode[pc + 3];

    // 从字符串常量池获取字符串
    const std::string &value = stringPool[stringIndex];

    // 创建 jstring 并将其存储到目标寄存器
    jstring str = env->NewStringUTF(value.c_str());
    registers[reg] = str;

    // 更新程序计数器
    pc += 4;  // const-string 指令占用 4 字节
}
```

## 2\. invoke-static

invoke-static 指令用于执行类的静态方法。例如：

```
invoke-static {v5, v0}, Lkotlin/jvm/internal/Intrinsics;->checkNotNullParameter(Ljava/lang/Object;Ljava/lang/String;)V
```

各部分的解释：

-   invoke-static：这是调用静态方法的指令
    
-   {v5, v0}：这是方法调用时传递的参数寄存器
    
-   Lkotlin/jvm/internal/Intrinsics;：目标类的名称。
    
-   \->checkNotNullParameter：这是要调用的静态方法的名称
    
-   (Ljava/lang/Object;Ljava/lang/String;)：这是方法的参数签名
    
-   V：表示方法的返回类型是 void。
    

### 指令结构

一个标准的 invoke-static 字节码指令通常如下所示（6个字节）：

```
71 <reg_count> <method_index> <reg> 00

操作码 (1 字节) | 寄存器数量 (1 字节) | 方法索引 (2 字节) | 目标寄存器 (1 字节) | 填充字节，指令对齐 (1 字节)
```

-   71：操作码，表示 invoke-static。
    
-   <reg_count>：寄存器数量，参数个数。
    
-   <method_index>：目标方法在方法表中的索引。
    
-   ：目标寄存器，表示要将传参存储到的寄存器。
    
-   00：填充字节，指令对齐
    

实现 invoke 指令，需要根据指令中的 method index 从 dex 中找到 method，然后通过 jni 接口发起调用。

[![word/media/image4.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/0fae6453ffabf67c.png)](data:image/png;base64,inline-140398B)

### 具体代码实现

```rust
// 解析并执行 invoke-static 指令
void handleInvokeStatic(JNIEnv *env, const uint8_t *bytecode, size_t &pc) {
    uint8_t opcode = bytecode[pc];
    if (opcode != INVOKE_STATIC_OPCODE) {  // 检查是否为 invoke-static
        throw std::runtime_error("Unexpected opcode for invoke-static");
    }

    // 第 5 个字节表示了要使用的寄存器
    uint8_t reg1 = bytecode[pc + 4] & 0xF;         // 低4位表示第一个寄存器
    uint8_t reg2 = (bytecode[pc + 4] >> 4) & 0xF;  // 高4位表示第二个寄存器

    // 读取方法索引（第 2、3、4 字节）
    uint32_t methodIndex = (bytecode[pc + 1] << 16) | (bytecode[pc + 2] << 8) | bytecode[pc + 3];

    // 类名和方法信息
    std::string className;
    std::string methodName;
    std::string methodSignature;

    // 根据 methodIndex 来解析并设置类名、方法名、签名
    switch (methodIndex) {
        case 0x202000:  // checkNotNullParameter
            className = "kotlin/jvm/internal/Intrinsics";
            methodName = "checkNotNullParameter";
            methodSignature = "(Ljava/lang/Object;Ljava/lang/String;)V";
            break;
        case 0x101c00:  // getInstance (MessageDigest)
            className = "java/security/MessageDigest";
            methodName = "getInstance";
            methodSignature = "(Ljava/lang/String;)Ljava/security/MessageDigest;";
            break;
        case 0x201f00:  // checkNotNullExpressionValue
            className = "kotlin/jvm/internal/Intrinsics";
            methodName = "checkNotNullExpressionValue";
            methodSignature = "(Ljava/lang/Object;Ljava/lang/String;)V";
            break;
        case 0x001e00:  // getEncoder (Base64)
            className = "java/util/Base64";
            methodName = "getEncoder";
            methodSignature = "()Ljava/util/Base64$Encoder;";
            break;
        default:
            throw std::runtime_error("Unknown method index");
    }

    // 获取目标类
    jclass targetClass = env->FindClass(className.c_str());
    if (targetClass == nullptr) {
        throw std::runtime_error("Class not found: " + className);
    }

    // 获取方法 ID
    jmethodID methodID = env->GetStaticMethodID(targetClass, methodName.c_str(), methodSignature.c_str());
    if (methodID == nullptr) {
        throw std::runtime_error("Method not found: " + methodName);
    }

    // 解析方法签名，得到参数个数和返回值类型
    std::vector<std::string> paramTypes;
    std::string returnType;
    parseMethodSignature(methodSignature, paramTypes, returnType);
    int paramCount = paramTypes.size();

    // 动态获取参数
    uint8_t reg_list[] = {reg1, reg2};
    std::vector <jstring> params(paramCount);
    for (size_t i = 0; i < paramCount; ++i) {
        // 获取寄存器中的值并转化为 JNI 参数
        jvalue value = getRegisterAsJValue(reg_list[i], paramTypes[i]);
        params[i] = static_cast<jstring>(value.l);
    }

    // 更新程序计数器
    pc += 6;  // invoke-static 指令占用 6 字节

    // 调用静态方法
    // 根据返回值类型决定调用方式
    if (returnType == "V") {  // void 返回值
        if (paramCount == 0) {
            env->CallStaticVoidMethod(targetClass, methodID);  // 无参数
        } else if (paramCount == 1) {
            env->CallStaticVoidMethod(targetClass, methodID, params[0]);
        } else {
            env->CallStaticVoidMethod(targetClass, methodID, params[0], params[1]);
        }
    } else if (returnType == "Z") {  // boolean 返回值
        jboolean boolResult;
        if (paramCount == 0) {
            boolResult = env->CallStaticBooleanMethod(targetClass, methodID);  // 无参数
        } else if (paramCount == 1) {
            boolResult = env->CallStaticBooleanMethod(targetClass, methodID, params[0]);
        } else {
            boolResult = env->CallStaticBooleanMethod(targetClass, methodID, params[0], params[1]);
        }

        // move-result
        handleMoveResultObject(env, bytecode, pc, boolResult);

    } else if (returnType == "B") {  // byte 返回值
        jbyte byteResult;
        if (paramCount == 0) {
            byteResult = env->CallStaticByteMethod(targetClass, methodID);  // 无参数
        } else if (paramCount == 1) {
            byteResult = env->CallStaticByteMethod(targetClass, methodID, params[0]);
        } else {
            byteResult = env->CallStaticByteMethod(targetClass, methodID, params[0], params[1]);
        }

        // move-result
        handleMoveResultObject(env, bytecode, pc, byteResult);

    } else if (returnType == "S") {  // short 返回值
        jshort shortResult;
        if (paramCount == 0) {
            shortResult = env->CallStaticShortMethod(targetClass, methodID);  // 无参数
        } else if (paramCount == 1) {
            shortResult = env->CallStaticShortMethod(targetClass, methodID, params[0]);
        } else {
            shortResult = env->CallStaticShortMethod(targetClass, methodID, params[0], params[1]);
        }

        // move-result
        handleMoveResultObject(env, bytecode, pc, shortResult);

    } else if (returnType == "I") {  // int 返回值
        jint intResult;
        if (paramCount == 0) {
            intResult = env->CallStaticIntMethod(targetClass, methodID);  // 无参数
        } else if (paramCount == 1) {
            intResult = env->CallStaticIntMethod(targetClass, methodID, params[0]);
        } else {
            intResult = env->CallStaticIntMethod(targetClass, methodID, params[0], params[1]);
        }

        // move-result
        handleMoveResultObject(env, bytecode, pc, intResult);

    } else if (returnType == "J") {  // long 返回值
        jlong longResult;
        if (paramCount == 0) {
            longResult = env->CallStaticLongMethod(targetClass, methodID);  // 无参数
        } else if (paramCount == 1) {
            longResult = env->CallStaticLongMethod(targetClass, methodID, params[0]);
        } else {
            longResult = env->CallStaticLongMethod(targetClass, methodID, params[0], params[1]);
        }

        // move-result
        handleMoveResultObject(env, bytecode, pc, longResult);

    } else if (returnType == "F") {  // float 返回值
        jfloat floatResult;
        if (paramCount == 0) {
            floatResult = env->CallStaticFloatMethod(targetClass, methodID);  // 无参数
        } else if (paramCount == 1) {
            floatResult = env->CallStaticFloatMethod(targetClass, methodID, params[0]);
        } else {
            floatResult = env->CallStaticFloatMethod(targetClass, methodID, params[0], params[1]);
        }

        // move-result
        handleMoveResultObject(env, bytecode, pc, floatResult);

    } else if (returnType == "D") {  // double 返回值
        jdouble doubleResult;
        if (paramCount == 0) {
            doubleResult = env->CallStaticDoubleMethod(targetClass, methodID);  // 无参数
        } else if (paramCount == 1) {
            doubleResult = env->CallStaticDoubleMethod(targetClass, methodID, params[0]);
        } else {
            doubleResult = env->CallStaticDoubleMethod(targetClass, methodID, params[0], params[1]);
        }

        // move-result
        handleMoveResultObject(env, bytecode, pc, doubleResult);

    } else if (returnType[0] == 'L') {  // 对象返回值
        jobject objResult;
        if (paramCount == 0) {
            objResult = env->CallStaticObjectMethod(targetClass, methodID);  // 无参数
        } else if (paramCount == 1) {
            objResult = env->CallStaticObjectMethod(targetClass, methodID, params[0]);
        } else {
            objResult = env->CallStaticObjectMethod(targetClass, methodID, params[0], params[1]);
        }

        // 处理返回的对象
        if (objResult) {
            if(returnType == "Ljava/lang/String;"){
                jstring strResult = static_cast<jstring>(objResult);
                handleMoveResultObject(env, bytecode, pc, strResult);
            }else{
                handleMoveResultObject(env, bytecode, pc, objResult);
            }
        }
    } else {
        throw std::runtime_error("Unsupported return type: " + returnType);
    }
}
```

## 3\. move-result-object

move-result-object 用于从方法调用的结果中将对象类型的返回值移动到指定的寄存器中。例如：

```
move-result-object v0
```

解释：

-   move-result-object：这条指令的作用是将最近一次方法调用的返回结果移动到指定的寄存器中。
    
-   v0：指定目标寄存器，返回的对象会被存储在 v0 寄存器中。
    

### 指令结构

一个标准的 move-result-object 字节码指令通常如下所示（2个字节）：

```
0c <reg>

操作码 (1 字节)  | 目标寄存器 (1 字节)  
```

### 具体代码实现

```cpp
// move-result-object
template <typename T>
void handleMoveResultObject(JNIEnv *env, const uint8_t *bytecode, size_t &pc, T result) {
    uint8_t opcode = bytecode[pc];
    if (opcode == MOVE_RESULT_OBJECT_OPCODE) {
        uint8_t reg = bytecode[pc + 1];  // 目标寄存器
        setRegisterValue(reg, result);
        // 更新程序计数器
        pc += 2;  // move-result-object 指令占用 2 字节
    }
}
```

## 4\. sget-object

sget-object 是一条静态字段读取指令。它用于从一个类的静态字段中获取一个引用类型（对象）的值，并存储到指定的寄存器中。

例如：

```ruby
sget-object v1, Lkotlin/text/Charsets;->UTF_8:Ljava/nio/charset/Charset;
```

解释：

-   sget-object：表示从类的静态字段中获取对象类型的值。
    
-   v1：目标寄存器，指令执行后，字段值（一个对象）会被存储在 v1 寄存器中。
    
-   Lkotlin/text/Charsets;：目标类的名称。
    
-   \->UTF_8：表示静态字段 UTF_8。
    
-   :Ljava/nio/charset/Charset;：字段的类型描述符，表示该字段的类型是 java.nio.charset.Charset。
    

### 指令结构

一个标准的 sget-object 字节码指令通常如下所示（4个字节）：

```
62 <reg> <field_index>

操作码 (1 字节)  | 目标寄存器 (1 字节)  | 字段索引 (2 字节)  
```

### 具体代码实现

```cpp
// 解析和执行 sget-object 指令
void handleSgetObject(JNIEnv *env, const uint8_t *bytecode, size_t &pc) {
    uint8_t opcode = bytecode[pc];
    if (opcode != SGET_OBJECT_OPCODE) {  // 检查是否为 sget-object
        throw std::runtime_error("Unexpected opcode for sget-object");
    }

    // 解析指令
    uint8_t reg = bytecode[pc + 1];          // 目标寄存器
    uint16_t fieldIndex = (bytecode[pc + 2] << 8) | bytecode[pc + 3]; // 字段索引

    // 类名和方法信息
    std::string className;
    std::string fieldName;
    std::string fieldType;

    // 解析每条指令，依据方法的不同来设置类名、方法名、签名
    switch (fieldIndex) {
        case 0x0900:  // Lkotlin/text/Charsets;->UTF_8:Ljava/nio/charset/Charset;
            className = "kotlin/text/Charsets";
            fieldName = "UTF_8";
            fieldType = "Ljava/nio/charset/Charset;"; // 字段类型为 Charset
            break;
        default:
            throw std::runtime_error("Unknown field index");
    }

    // 1. 获取 Java 类
    jclass clazz = env->FindClass(className.c_str());
    if (clazz == nullptr) {
        LOGI("Failed to find class %s", className.c_str());
        return;
    }

    // 2. 获取静态字段的 Field ID
    jfieldID fieldID = env->GetStaticFieldID(clazz, fieldName.c_str(), fieldType.c_str());
    if (fieldID == nullptr) {
        LOGI("Failed to get field ID for %s", fieldName.c_str());
        return;
    }

    // 3. 获取静态字段的值
    jobject field = env->GetStaticObjectField(clazz, fieldID);
    if (field == nullptr) {
        LOGI("%s field is null", fieldName.c_str());
        return;
    }

    // 保存到目标寄存器
    setRegisterValue(reg, field);

    // 更新程序计数器
    pc += 4; // sget-object 指令占用 4 字节
}
```

## 5\. invoke-virtual

invoke-virtual 指令会调用指定对象的实例方法。例如

```
invoke-virtual {v5, v1}, Ljava/lang/String;->getBytes(Ljava/nio/charset/Charset;)[B
```

解释：

-   invoke-virtual：表示调用对象的实例方法。
    
-   {v5, v1}：传递给目标方法的参数寄存器。这里，v5 和 v1 寄存器的值会作为参数传递给方法。
    
-   Ljava/lang/String;：目标类的名称。
    
-   \->getBytes：目标方法的名称。
    
-   (Ljava/nio/charset/Charset;)：方法的参数签名。
    
-   \[B：方法的返回类型签名，表示该方法返回一个字节数组。
    

### 指令结构

一个标准的 invoke-virtual 字节码指令通常如下所示（6个字节）：

```
6e <reg_count> <method_index> <reg> 00

操作码 (1 字节) | 寄存器数量 (1 字节) | 方法索引 (2 字节) | 目标寄存器 (1 字节) | 填充字节，指令对齐 (1 字节)
```

-   6e：操作码，表示 invoke-static。
    
-   <reg_count>：寄存器数量，参数个数。
    
-   <method_index>：目标方法在方法表中的索引。
    
-   ：目标寄存器，表示要将传参存储到的寄存器。
    
-   00：填充字节，指令对齐
    

### 具体代码实现

```cpp
// invoke-virtual 指令
void handleInvokeVirtual(JNIEnv* env, const uint8_t* bytecode, size_t& pc) {
    // 解析指令
    uint8_t opcode = bytecode[pc];  // 获取操作码
    if (opcode != INVOKE_VIRTUAL_OPCODE) {  // 确保是 invoke-virtual 操作码
        throw std::runtime_error("Expected invoke-virtual opcode");
    }

    // 获取寄存器数量
    uint8_t regCount = (bytecode[pc + 1] >> 4) & 0xF;

    // 第 5 个字节表示了要使用的寄存器
    uint8_t reg1 = bytecode[pc + 4] & 0xF;         // 低4位表示第一个寄存器
    uint8_t reg2 = (bytecode[pc + 4] >> 4) & 0xF;  // 高4位表示第二个寄存器

    // 读取方法索引（第 2、3、4 字节）
    uint32_t methodIndex = (bytecode[pc + 1] << 16) | (bytecode[pc + 2] << 8) | bytecode[pc + 3];

    // 类名和方法信息
    std::string className;
    std::string methodName;
    std::string methodSignature;

    // 根据 methodIndex 来解析并设置类名、方法名、签名
    switch (methodIndex) {
        case 0x201600:  // Ljava/lang/String;->getBytes(Ljava/nio/charset/Charset;)[B
            className = "java/lang/String";
            methodName = "getBytes";
            methodSignature = "(Ljava/nio/charset/Charset;)[B";
            break;
        case 0x201b00:  // Ljava/security/MessageDigest;->digest([B)[B
            className = "java/security/MessageDigest";
            methodName = "digest";
            methodSignature = "([B)[B";
            break;
        case 0x201d00:  // Ljava/util/Base64$Encoder;->encodeToString([B)Ljava/lang/String;
            className = "java/util/Base64$Encoder";
            methodName = "encodeToString";
            methodSignature = "([B)Ljava/lang/String;";
            break;
        default:
            throw std::runtime_error("Unknown method index: " + std::to_string(methodIndex));
    }

    // 查找类和方法
    jclass clazz = env->FindClass(className.c_str());
    if (!clazz) {
        throw std::runtime_error("Class not found: " + className);
    }

    // 获取方法 ID
    jmethodID methodID = env->GetMethodID(clazz, methodName.c_str(), methodSignature.c_str());
    if (!methodID) {
        throw std::runtime_error("Method not found: " + methodName);
    }

    // 解析方法签名，得到参数个数和返回值类型
    std::vector<std::string> paramTypes;
    std::string returnType;
    parseMethodSignature(methodSignature, paramTypes, returnType);
    int paramCount = paramTypes.size();

    // 目标对象的类型
    std::stringstream ss;
    ss << "L" << className << ";";
    std::string classType = ss.str();

    // 获取目标对象（寄存器中的第一个参数，通常是方法的目标对象）
    jobject targetObject = getRegisterAsJValue(reg1, classType).l;

    // 参数
    std::vector <jvalue> params(paramCount);
    if(paramCount > 0){
        params[0] = getRegisterAsJValue(reg2, paramTypes[0]);
    }

    // 更新程序计数器
    pc += 6;

    // 检查返回值的类型，并调用适当的方法
    if (returnType == "V") {  // 如果没有返回值 (void 方法)
        // 调用 void 方法
        env->CallVoidMethodA(targetObject, methodID, params.data());
    } else if (returnType == "[B") {  // 如果返回值是 byte 数组
        jbyteArray result = (jbyteArray) env->CallObjectMethodA(targetObject, methodID, params.data());
        // 处理返回的 byte 数组
        if (result) {
            handleMoveResultObject(env, bytecode, pc, result);
        }
    } else if (returnType[0] == 'L') {  // 如果返回值是对象
        jobject objResult = env->CallObjectMethodA(targetObject, methodID, params.data());
        // 处理返回的对象
        if (objResult) {
            if(returnType == "Ljava/lang/String;"){
                jstring strResult = static_cast<jstring>(objResult);
                handleMoveResultObject(env, bytecode, pc, strResult);
            }else{
                handleMoveResultObject(env, bytecode, pc, objResult);
            }
        }
    } else if (returnType == "I") {  // 如果返回值是 int
        jint result = env->CallIntMethodA(targetObject, methodID, params.data());
        // 处理返回的 int
        handleMoveResultObject(env, bytecode, pc, result);
    } else if (returnType == "Z") {  // 如果返回值是 boolean
        jboolean result = env->CallBooleanMethodA(targetObject, methodID, params.data());
        // 处理返回的 boolean
        handleMoveResultObject(env, bytecode, pc, result);
    } else if (returnType == "D") {  // 如果返回值是 double
        jdouble result = env->CallDoubleMethodA(targetObject, methodID, params.data());
        // 处理返回的 double
        handleMoveResultObject(env, bytecode, pc, result);
    } else if (returnType == "F") {  // 如果返回值是 float
        jfloat result = env->CallFloatMethodA(targetObject, methodID, params.data());
        // 处理返回的 float
        handleMoveResultObject(env, bytecode, pc, result);
    } else {
        throw std::runtime_error("Unsupported return type in method: " + returnType);
    }
}
```

## 6\. return-object

这条指令通常用于结束一个方法的执行，并将指定寄存器中的对象作为返回值返回给调用者。

例如：

```
return-object v2
```

解释：

-   return-object：表示方法执行结束时，返回一个对象类型的值。
    
-   v2：表示返回的对象存储在寄存器 v2 中。执行这条指令时，寄存器 v2 中的对象将作为方法的返回值。
    

### 指令结构

一个标准的 return-object 字节码指令通常如下所示（2个字节）：

```
11 <reg>

操作码 (1 字节)  | 目标寄存器 (1 字节)  
```

### 具体代码实现

```cpp
// return-object
void handleReturnResultObject(JNIEnv *env, const uint8_t *bytecode, size_t &pc) {
    uint8_t opcode = bytecode[pc];
    if (opcode == RETURN_OBJECT_OPCODE) {
        uint8_t reg = bytecode[pc + 1];  // 目标寄存器
        // 把目标寄存器中的值设置到 v0 寄存器
        setRegisterValue(0, registers[reg]);
        // 更新程序计数器
        pc += 2;
    }
}
```

## 注册 VMP 虚拟机解释器

在 kotlin 层中定义 VMP 入口方法 execute

```kotlin
package com.cyrus.example.vmp

class SimpleVMP {

    companion object {
        // 加载本地库
        init {
            System.loadLibrary("vmp-lib")
        }

        // 定义静态方法 execute
        @JvmStatic
        external fun execute(bytecode: ByteArray, input: String): String
    }
}
```

在 JNI_Onload 中调用 RegisterNatives 方法动态注册 C++ 中的 execute 方法到 com/cyrus/example/vmp/SimpleVMP

```cpp
// 定义方法签名
static JNINativeMethod gMethods[] = {
        {"execute", "([BLjava/lang/String;)Ljava/lang/String;", (void*)execute}
};

// JNI_OnLoad 动态注册方法
extern "C" JNIEXPORT jint JNICALL
JNI_OnLoad(JavaVM *vm, void *reserved) {
    JNIEnv *env = nullptr;

    if (vm->GetEnv(reinterpret_cast<void**>(&env), JNI_VERSION_1_6) != JNI_OK) {
        return JNI_ERR;
    }

    jclass clazz = env->FindClass("com/cyrus/example/vmp/SimpleVMP");
    if (clazz == nullptr) {
        return JNI_ERR; // 类未找到
    }

    // 注册所有本地方法
    jint result = env->RegisterNatives(clazz, gMethods, sizeof(gMethods) / sizeof(gMethods[0]));
    if (result != JNI_OK) {
        return JNI_ERR; // 注册失败
    }

    return JNI_VERSION_1_6;
}
```

## 测试

把 sign 方法的调用改为通过 VMP 执行 sign 算法计算 input 参数的加密结果。

```kotlin
// 参数
val input = "example"

// 模拟 smali 指令的字节流
val bytecode = byteArrayOf(
    0x1A, 0x00, 0x4E, 0x00, // const-string v0, "input"
    0x71, 0x20, 0x20, 0x00, 0x05, 0x00, // invoke-static{v5, v0}, checkNotNullParameter
    0x1A, 0x00, 0x2C, 0x00, // const-string v0, "SHA-256"
    0x71, 0x10, 0x1C, 0x00, 0x00, 0x00, // invoke-static{v0}, getInstance
    0x0C, 0x00, // move-result-object v0
    0x62, 0x01, 0x09, 0x00, // sget-object v1, UTF_8
    0x6E, 0x20, 0x16, 0x00, 0x15, 0x00, // invoke-virtual{v5, v1}, getBytes
    0x0C, 0x01, // move-result-object v1
    0x6E, 0x20, 0x1B, 0x00, 0x10, 0x00, // invoke-virtual{v0, v1}, digest
    0x0C, 0x01, // move-result-object v1
    0x71, 0x00, 0x1E, 0x00, 0x00, 0x00, // invoke-static{}, getEncoder
    0x0C, 0x02, // move-result-object v2
    0x6E, 0x20, 0x1D, 0x00, 0x12, 0x00, // invoke-virtual{v2, v1}, encodeToString
    0x0C, 0x02, // move-result-object v2
    0x11, 0x02  // return-object v2
)

// 通过 VMP 解析器执行指令流
val result = SimpleVMP.execute(bytecode, input)

// 显示 Toast
Toast.makeText(this, result, Toast.LENGTH_SHORT).show()
```

通过 VMP 执行结果如下：

[![word/media/image5.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/ad04c980856aa9f9.png)](data:image/png;base64,inline-98938B)

和原来算法对比结果是一样的。

[![word/media/image6.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/ae26d208a37efd8b.png)](data:image/png;base64,inline-99090B)

## 安全性增强

1.  指令流加密：比如使用 AES 加密指令流，在运行时解密执行。
    
2.  动态加载：使用 dex 动态加载虚拟机和指令流。
    
3.  多态指令集：每次保护代码时动态生成不同的指令集，防止通过固定指令集逆向。
    
4.  反调试检测：检测调试器附加、内存修改或运行环境，防止虚拟机被分析。
    

## 优点与局限

优点

-   提高逆向难度：通过指令集和虚拟机隐藏关键逻辑。
    
-   动态保护：运行时加载和执行，防止静态分析。
    

局限

-   性能开销：解释执行比原生代码慢。
    
-   开发成本：需要设计和实现虚拟机框架。
    

通过上述方法，可以实现一个基本的自定义 Android 虚拟机保护，并根据需要逐步增强安全性。
