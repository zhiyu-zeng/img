---
title: 逆向 JNI 函数找不到入口？动态注册定位技巧全解析 // CYRUS STUDIO
source: https://cyrus-studio.github.io/blog/posts/%E9%80%86%E5%90%91-jni-%E5%87%BD%E6%95%B0%E6%89%BE%E4%B8%8D%E5%88%B0%E5%85%A5%E5%8F%A3%E5%8A%A8%E6%80%81%E6%B3%A8%E5%86%8C%E5%AE%9A%E4%BD%8D%E6%8A%80%E5%B7%A7%E5%85%A8%E8%A7%A3%E6%9E%90/
source_host: cyrus-studio.github.io
clip_date: 2026-08-04T14:20:25+08:00
trace_id: c2ee3d49-b913-450d-9035-305cf620e5ca
content_hash: a5e4576fe1e1d96031e5775d10b27232ef176e55a505f5571ff473c809c4e4f8
status: synced
tags:
  - Android逆向
  - Frida
series: null
feed_source: Cyrus Studio·安卓逆向
ai_summary: JNI 动态注册会让函数不在 so 导出表，IDA 找不到入口；借助 Frida 扫描 ArtMethod 中 entry_point_from_jni_ 偏移，可批量还原每个 native 方法在 so 中的真实地址与偏移。
ai_summary_style: key-points
images_status:
  total: 5
  succeeded: 5
  failed_urls: []
notion_page_id: 3b275244-d011-81e9-816c-c1c7192c86f2
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> JNI 动态注册会让函数不在 so 导出表，IDA 找不到入口；借助 Frida 扫描 ArtMethod 中 entry_point_from_jni_ 偏移，可批量还原每个 native 方法在 so 中的真实地址与偏移。
> 
> - **原理：** Android 9 起 ArtMethod 的 entry_point_from_jni_ 即 `ptr_sized_fields_.data_` 字段，存的就是 JNI 函数指针；拿到该字段偏移后用“ArtMethod 地址 + 偏移”读取即可得到入口。
> - **核心思路：** 选一个已知 native 方法（如 android.os.Process.getUidForName），先在 libandroid_runtime.so 导出符号中定位它的地址，再通过 Java 反射 `getDeclaredMethods` / `getArtMethod` 拿到该方法对应 ArtMethod，逐字节扫描字段值，匹配到该地址的字段位置即为 entry_point_from_jni_ 偏移。
> - **定位实现：** Frida 脚本先用 `Module.enumerateExportsSync` 匹配符号（排除 CheckJNI 包装版本），再用 `getModifiers() & 256` 筛选 native 方法，最后 `Memory.readPointer(art_method + offset)` 读取真实 native 地址。
> - **输出与落地：** 对目标类（如 lte.NCall）遍历所有 native 方法，输出方法签名、ArtMethod 指针、Native 地址、所属模块、模块内偏移；示例中 13 个 native 方法均位于 libGameVMP.so，如 `IL` 方法偏移 0xdfa8，可直接在 IDA 中跳转到该偏移查看反汇编。
> - **注意点：** rpc.exports 导出的方法名需全小写且不能有下划线；entry_point_from_jni_ 偏移会随 Android 版本变化，因此用已知方法扫描推导更通用。

> 版权归作者所有，如有转发，请注明文章出处： [https://cyrus-studio.github.io/blog/](https://cyrus-studio.github.io/blog/)

## 前言

使用 IDA Pro 静态分析时，JNI 函数并没有出现在导出表中，根本找不到函数实现的位置。

这是因为很多 App 为了安全性和混淆目的，采用了 JNI 动态注册（RegisterNatives） 的方式，绕开了传统的静态绑定机制。

 [![word/media/image1.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/d2b9bd5627705958.png)](data:image/png;base64,inline-126038B)那么遇到这种情况我们该怎么办？

## 通过源码分析JNI 函数调用流程

ArtMethod 是 ART 虚拟机中用于表示 Java 方法的底层结构体，Java 中每个方法在运行时都会对应一个 ArtMethod 实例，用于管理其执行入口、访问标志、Dex 信息等元数据。

entry_point_from_jni\_ 是 ArtMethod 结构体的一个字段，专门用于存储 Java 方法对应的 JNI 函数地址。

在编译 JNI 方法时，ArtJniCompileMethodInternal 中通过调用 EntryPointFromJniOffset 方法获取 entry_point_from_jni\_ 字段的偏移，并生成一条调用该 jni 函数的机器指令插入到编译结果中。

```rust
// 9. Plant call to native code associated with method.

// 计算 ArtMethod 中 JNI 入口地址的字段偏移（即 ptr_sized_fields_.data_ 偏移）
// 根据目标指令集（如 arm64、x86）传入对应的指针大小（PointerSize::k64 或 k32）
MemberOffset jni_entrypoint_offset =
    ArtMethod::EntryPointFromJniOffset(InstructionSetPointerSize(instruction_set));

// 这部分代码生成了一条机器指令，用于调用 ArtMethod::entry_point_from_jni 所指向的 native 函数：
__ Call(main_jni_conv->MethodStackOffset(),  // 栈中 ArtMethod* 相对偏移
        jni_entrypoint_offset,              // ArtMethod 内部 entry_point_from_jni 字段的偏移
        mr_conv->InterproceduralScratchRegister());  // 用于保存临时地址的寄存器
```

[https://cs.android.com/android/platform/superproject/+/android10-release:art/compiler/jni/quick/jni_compiler.cc;l=497](https://cs.android.com/android/platform/superproject/+/android10-release:art/compiler/jni/quick/jni_compiler.cc;l=497)

EntryPointFromJniOffset 内部调用 DataOffset 获取 PtrSizedFields 结构的 data\_ 字段偏移

```cpp
  static constexpr MemberOffset DataOffset(PointerSize pointer_size) {
    return MemberOffset(PtrSizedFieldsOffset(pointer_size) + OFFSETOF_MEMBER(
        PtrSizedFields, data_) / sizeof(void*) * static_cast<size_t>(pointer_size));
  }

  static constexpr MemberOffset EntryPointFromJniOffset(PointerSize pointer_size) {
    return DataOffset(pointer_size);
  }
```

[https://cs.android.com/android/platform/superproject/+/android10-release:art/runtime/art_method.h;l=457](https://cs.android.com/android/platform/superproject/+/android10-release:art/runtime/art_method.h;l=457)

在 android 9 以后，entry_point_from_jni\_ 实际上是 ArtMethod 中 ptr_sized_fields\_.data\_

```cpp
  // Must be the last fields in the method.
  struct PtrSizedFields {
    // Depending on the method type, the data is
    //   - native method: pointer to the JNI function registered to this method
    //                    or a function to resolve the JNI function,
    //   - conflict method: ImtConflictTable,
    //   - abstract/interface method: the single-implementation if any,
    //   - proxy method: the original interface method or constructor,
    //   - other methods: the profiling data.
    void* data_;

    // Method dispatch from quick compiled code invokes this pointer which may cause bridging into
    // the interpreter.
    void* entry_point_from_quick_compiled_code_;
  } ptr_sized_fields_;
```

当 Java 代码调用一个 native 方法时，ART 会通过 GetEntryPointFromJni 找到对应的 JNI 函数入口，然后切换到 C/C++ 层执行该方法。

 [![word/media/image2.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/f94723785195680a.png)](data:image/png;base64,inline-327326B)[https://cs.android.com/android/platform/superproject/+/android10-release:art/runtime/interpreter/interpreter.cc;l=48](https://cs.android.com/android/platform/superproject/+/android10-release:art/runtime/interpreter/interpreter.cc;l=48)

实际返回的是 ArtMethod 中 ptr_sized_fields\_.data\_ 字段的值

```cpp
  void* GetEntryPointFromJni() {
    DCHECK(IsNative());
    return GetEntryPointFromJniPtrSize(kRuntimePointerSize);
  }

  ALWAYS_INLINE void* GetEntryPointFromJniPtrSize(PointerSize pointer_size) {
    return GetDataPtrSize(pointer_size);
  }
  
  // 返回 ArtMethod 中 data_ 字段的值，该字段在 native 方法中就是 JNI 函数指针
  ALWAYS_INLINE void* GetDataPtrSize(PointerSize pointer_size) {
    DCHECK(IsImagePointerSize(pointer_size));
    return GetNativePointer<void*>(DataOffset(pointer_size), pointer_size);
  }
```

[https://cs.android.com/android/platform/superproject/+/android10-release:art/runtime/art_method.h;l=524](https://cs.android.com/android/platform/superproject/+/android10-release:art/runtime/art_method.h;l=524)

所以只要拿到 ArtMethod 和 EntryPointFromJniOffset 就可以得到 jni 方法的入口地址。

## 如何拿到 ArtMethod

我们可以通过 java 的反射技术，getDeclaredMethods 方法拿到类的所有 Method

[![word/media/image3.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/0c1538d5099b177b.png)](data:image/png;base64,inline-233102B)

Method 继承 Executable，Executable 中的 getArtMethod 方法可以拿到 ArtMethod 的地址

[![word/media/image4.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/07a8d2f910766904.png)](data:image/png;base64,inline-170374B)

## 如何得到 EntryPointFromJniOffset

动态推导出 ArtMethod 结构中 entry_point_from_jni\_ 字段的偏移量，用于后续从 ArtMethod\* 中取出 native 函数地址。

1.  选择一个已知的 Java native 方法作为“参考样本”。 该方法需要在系统中真实存在并且能找到其 native 地址。
    
2.  调用 findNativeAddress 查找对应的 native 函数地址
    
3.  获取类中所有方法并筛选 native 方法
    
4.  获取 ArtMethod 指针并逐字节扫描字段
    
5.  比较每个字段的值是否等于我们前面获取到的 native 函数地址，找到即返回偏移
    

代码实现如下：

```javascript
/**
 * 查找指定类和方法名对应的 native 函数地址（排除 CheckJNI 包装版本）
 *
 * @param {string} soName             - 包含目标 native 方法的 so 库名（如 "libandroid_runtime.so"）
 * @param {string} javaClassName      - Java 类名（如 "android.os.Process"）
 * @param {string} targetMethodName   - 方法名（如 "getUidForName"）
 * @returns {NativePointer|null}      - 找到的 native 函数地址或 null
 */
function findNativeAddress(soName, javaClassName, targetMethodName) {
    // 获取指定 so 中的导出符号列表
    const exports = Module.enumerateExportsSync(soName);

    // 将 Java 类名转为 native C++ 符号格式（如 android_os_Process）
    const lowerClassName = javaClassName.replace(/\./g, "_");

    // 遍历导出符号，寻找符合条件的 native 方法
    for (let exp of exports) {
        if (
            exp.type === "function" &&
            exp.name.indexOf(lowerClassName) !== -1 &&         // 包含类名
            exp.name.indexOf(targetMethodName) !== -1 &&       // 包含方法名
            exp.name.indexOf("CheckJNI") === -1     // 排除 CheckJNI 包装版本
        ) {
            console.log(`[+] Found native method: ${exp.name} @ ${exp.address}`);
            return ptr(exp.address);  // 找到匹配的符号地址
        }
    }

    // 未找到匹配的符号
    return null;
}

/**
 * 找到 entry_point_from_jni_ 在 ArtMethod 结构体中的偏移量（根据 Android 版本不同可能会变化）
 *
 * @returns {number} 返回 entry_point_from_jni_ 的偏移量，若未找到返回 -1
 */
function entryPointFromJniOffset() {

    // 1. 选择一个已知的 Java native 方法作为“参考样本”。 该方法需要在系统中真实存在并且能找到其 native 地址。
    const soName = "libandroid_runtime.so";
    const className = "android.os.Process";
    const methodName = "getUidForName";

    // 2. 查找对应的 native 函数地址
    const native_addr = findNativeAddress(soName, className, methodName);
    if (native_addr === null) {
        console.log("[-] Native function not found.");
        return -1;
    }

    let clazz = Java.use(className).class;
    let methods = clazz.getDeclaredMethods();

    // 3. 获取类中所有方法并筛选 native 方法
    for (let i = 0; i < methods.length; i++) {

        // 获取方法签名
        let methodName = methods[i].toString();

        // 获取方法的修饰符，如 public、private、static、native 等
        let flags = methods[i].getModifiers();

        // 256 代表 native 修饰符
        if (flags & 256) {

            // 如果方法名中包含 methodName 说明找到了目标方法
            if (methodName.indexOf("getUidForName") != -1) {

                // 4. 获取 ArtMethod 指针并逐字节扫描字段
                let art_method = methods[i].getArtMethod();

                for (let j = 0; j < 30; j = j + 1) {

                    let jni_entrypoint_offset = Memory.readPointer(ptr(art_method + j));

                    // 比较每个字段的值是否等于我们前面获取到的 native 函数地址。
                    if (native_addr.equals(jni_entrypoint_offset)) {
                        // 找到即返回偏移
                        return j;
                    }
                }
            }
        }
    }

    // 未找到 JNI 方法对应的偏移量，返回 -1
    return -1;
}
```

## 打印指定类的所有 JNI 函数地址

得到当前系统中 entry_point_from_jni\_ 的偏移量后，通过 ArtMethod 的内存地址 + entry_point_from_jni\_ 的偏移量 就可以得到 JNI 函数地址。

遍历类中的 native 方法，打印 JNI 函数地址、所属模块信息，结构化输出。

```javascript
/**
 * 遍历类中的 native 方法，打印 JNI 函数地址、所属模块信息，结构化输出。
 *
 * @param {string} className - Java 类名（如 "android.os.Process"）
 */
function getJniMethodAddr(className) {
    Java.perform(function () {
        const obj = Java.use(className);
        const clazz = obj.class;
        const jni_entrypoint_offset = entryPointFromJniOffset();

        console.log("========== [ JNI Method Info Dump ] ==========");
        console.log("[*] Target class: " + className);
        console.log("[*] entry_point_from_jni_ offset = " + jni_entrypoint_offset + " bytes\n");

        const methods = clazz.getDeclaredMethods();
        let count = 0;

        for (let i = 0; i < methods.length; i++) {
            const m = methods[i];
            const flags = m.getModifiers();
            const methodName = m.toString();

            // 256 表示 native 方法
            if ((flags & 256) !== 0) {
                count++;
                const art_method = m.getArtMethod();
                const native_addr = Memory.readPointer(ptr(art_method).add(jni_entrypoint_offset));

                const module = Process.getModuleByAddress(native_addr);
                const offset = module ? native_addr.sub(module.base) : ptr(0);

                // 结构化打印信息
                console.log("------------ [ #" + count + " Native Method ] ------------");
                console.log("Method Name     : " + methodName);
                console.log("ArtMethod Ptr   : " + ptr(art_method));
                console.log("Native Addr     : " + native_addr);
                if (module) {
                    console.log("Module Name     : " + module.name);
                    console.log("Module Offset   : 0x" + offset.toString(16));
                    console.log("Module Base     : " + module.base);
                    console.log("Module Size     : " + module.size + " bytes");
                    console.log("Module Path     : " + module.path);
                } else {
                    console.log("Module Info     : [ Not Found ]");
                }
                console.log("------------------------------------------------\n");
            }
        }

        if (count === 0) {
            console.log("[-] No native methods found in class: " + className);
        } else {
            console.log("[*] Total native methods found: " + count);
        }

        console.log("===============================================");
    });
}
```

## 在 python 中调用

通过 rpc 把 getJniMethodAddr 暴露给 Python 调用

```
// 暴露给 Python 调用（注意：exports中函数名需要全部小写，而且不能有下划线，不然会找不到方法）
rpc.exports.getjnimethodaddr = getJniMethodAddr
```

在 python 中加载 frida js 并调用 getJniMethodAddr 函数打印指定类的所有 native 方法地址

```python
import frida


def read_frida_js_source(script):
    with open(script, "r", encoding='utf-8') as f:
        return f.read()


def on_message(message, data):
    print(f"消息: {message['type']}, 数据: {message['payload']}")


def main():
    class_name = "lte.NCall"
    # class_name = "com.cyrus.example.MainActivity"

    device = frida.get_device_manager().add_remote_device("127.0.0.1:1234")
    pid = device.get_frontmost_application().pid
    session: frida.core.Session = device.attach(pid)
    script = session.create_script(read_frida_js_source("jni_addr.js"))
    script.on('message', on_message)
    script.load()

    script.exports.getjnimethodaddr(class_name)

    # 退出
    session.detach()


if __name__ == "__main__":
    main()
```

关于 Frida 的详细使用可以参考这篇文章： [一文搞懂如何使用 Frida Hook Android App](https://cyrus-studio.github.io/blog/posts/%E4%B8%80%E6%96%87%E6%90%9E%E6%87%82%E5%A6%82%E4%BD%95%E4%BD%BF%E7%94%A8-frida-hook-android-app/)

## 调用示例

比如，获取 lte.NCall 类中 native 方法地址

```
class_name = "lte.NCall"
```

首先打开 APP，再运行 python 脚本，输出如下

```yaml
[+] Found native method: _Z32android_os_Process_getUidForNameP7_JNIEnvP8_jobjectP8_jstring @ 0x7c65c0d648
========== [ JNI Method Info Dump ] ==========
[*] Target class: lte.NCall
[*] entry_point_from_jni_ offset = 24 bytes

------------ [ #1 Native Method ] ------------
Method Name     : public static native byte lte.NCall.IB(java.lang.Object[])
ArtMethod Ptr   : 0x9f63a590
Native Addr     : 0x7b6b454fa8
Module Name     : libGameVMP.so
Module Offset   : 0xdfa8
Module Base     : 0x7b6b447000
Module Size     : 462848 bytes
Module Path     : /data/app/com.shizhuang.duapp-fTxemmnM8l6298xbBELksQ==/lib/arm64/libGameVMP.so
------------------------------------------------

------------ [ #2 Native Method ] ------------
Method Name     : public static native char lte.NCall.IC(java.lang.Object[])
ArtMethod Ptr   : 0x9f63a5b8
Native Addr     : 0x7b6b454fa8
Module Name     : libGameVMP.so
Module Offset   : 0xdfa8
Module Base     : 0x7b6b447000
Module Size     : 462848 bytes
Module Path     : /data/app/com.shizhuang.duapp-fTxemmnM8l6298xbBELksQ==/lib/arm64/libGameVMP.so
------------------------------------------------

------------ [ #3 Native Method ] ------------
Method Name     : public static native double lte.NCall.ID(java.lang.Object[])
ArtMethod Ptr   : 0x9f63a5e0
Native Addr     : 0x7b6b455028
Module Name     : libGameVMP.so
Module Offset   : 0xe028
Module Base     : 0x7b6b447000
Module Size     : 462848 bytes
Module Path     : /data/app/com.shizhuang.duapp-fTxemmnM8l6298xbBELksQ==/lib/arm64/libGameVMP.so
------------------------------------------------

------------ [ #4 Native Method ] ------------
Method Name     : public static native float lte.NCall.IF(java.lang.Object[])
ArtMethod Ptr   : 0x9f63a608
Native Addr     : 0x7b6b454fe8
Module Name     : libGameVMP.so
Module Offset   : 0xdfe8
Module Base     : 0x7b6b447000
Module Size     : 462848 bytes
Module Path     : /data/app/com.shizhuang.duapp-fTxemmnM8l6298xbBELksQ==/lib/arm64/libGameVMP.so
------------------------------------------------

------------ [ #5 Native Method ] ------------
Method Name     : public static native int lte.NCall.II(java.lang.Object[])
ArtMethod Ptr   : 0x9f63a630
Native Addr     : 0x7b6b454fa8
Module Name     : libGameVMP.so
Module Offset   : 0xdfa8
Module Base     : 0x7b6b447000
Module Size     : 462848 bytes
Module Path     : /data/app/com.shizhuang.duapp-fTxemmnM8l6298xbBELksQ==/lib/arm64/libGameVMP.so
------------------------------------------------

------------ [ #6 Native Method ] ------------
Method Name     : public static native long lte.NCall.IJ(java.lang.Object[])
ArtMethod Ptr   : 0x9f63a658
Native Addr     : 0x7b6b454fa8
Module Name     : libGameVMP.so
Module Offset   : 0xdfa8
Module Base     : 0x7b6b447000
Module Size     : 462848 bytes
Module Path     : /data/app/com.shizhuang.duapp-fTxemmnM8l6298xbBELksQ==/lib/arm64/libGameVMP.so
------------------------------------------------

------------ [ #7 Native Method ] ------------
Method Name     : public static native java.lang.Object lte.NCall.IL(java.lang.Object[])
ArtMethod Ptr   : 0x9f63a680
Native Addr     : 0x7b6b454fa8
Module Name     : libGameVMP.so
Module Offset   : 0xdfa8
Module Base     : 0x7b6b447000
Module Size     : 462848 bytes
Module Path     : /data/app/com.shizhuang.duapp-fTxemmnM8l6298xbBELksQ==/lib/arm64/libGameVMP.so
------------------------------------------------

------------ [ #8 Native Method ] ------------
Method Name     : public static native short lte.NCall.IS(java.lang.Object[])
ArtMethod Ptr   : 0x9f63a6a8
Native Addr     : 0x7b6b454fa8
Module Name     : libGameVMP.so
Module Offset   : 0xdfa8
Module Base     : 0x7b6b447000
Module Size     : 462848 bytes
Module Path     : /data/app/com.shizhuang.duapp-fTxemmnM8l6298xbBELksQ==/lib/arm64/libGameVMP.so
------------------------------------------------

------------ [ #9 Native Method ] ------------
Method Name     : public static native void lte.NCall.IV(java.lang.Object[])
ArtMethod Ptr   : 0x9f63a6d0
Native Addr     : 0x7b6b454fa8
Module Name     : libGameVMP.so
Module Offset   : 0xdfa8
Module Base     : 0x7b6b447000
Module Size     : 462848 bytes
Module Path     : /data/app/com.shizhuang.duapp-fTxemmnM8l6298xbBELksQ==/lib/arm64/libGameVMP.so
------------------------------------------------

------------ [ #10 Native Method ] ------------
Method Name     : public static native boolean lte.NCall.IZ(java.lang.Object[])
ArtMethod Ptr   : 0x9f63a6f8
Native Addr     : 0x7b6b454fa8
Module Name     : libGameVMP.so
Module Offset   : 0xdfa8
Module Base     : 0x7b6b447000
Module Size     : 462848 bytes
Module Path     : /data/app/com.shizhuang.duapp-fTxemmnM8l6298xbBELksQ==/lib/arm64/libGameVMP.so
------------------------------------------------

------------ [ #11 Native Method ] ------------
Method Name     : public static native int lte.NCall.dI(int)
ArtMethod Ptr   : 0x9f63a720
Native Addr     : 0x7b6b45293c
Module Name     : libGameVMP.so
Module Offset   : 0xb93c
Module Base     : 0x7b6b447000
Module Size     : 462848 bytes
Module Path     : /data/app/com.shizhuang.duapp-fTxemmnM8l6298xbBELksQ==/lib/arm64/libGameVMP.so
------------------------------------------------

------------ [ #12 Native Method ] ------------
Method Name     : public static native long lte.NCall.dL(long)
ArtMethod Ptr   : 0x9f63a748
Native Addr     : 0x7b6b452ad0
Module Name     : libGameVMP.so
Module Offset   : 0xbad0
Module Base     : 0x7b6b447000
Module Size     : 462848 bytes
Module Path     : /data/app/com.shizhuang.duapp-fTxemmnM8l6298xbBELksQ==/lib/arm64/libGameVMP.so
------------------------------------------------

------------ [ #13 Native Method ] ------------
Method Name     : public static native java.lang.String lte.NCall.dS(java.lang.String)
ArtMethod Ptr   : 0x9f63a770
Native Addr     : 0x7b6b452aec
Module Name     : libGameVMP.so
Module Offset   : 0xbaec
Module Base     : 0x7b6b447000
Module Size     : 462848 bytes
Module Path     : /data/app/com.shizhuang.duapp-fTxemmnM8l6298xbBELksQ==/lib/arm64/libGameVMP.so
------------------------------------------------

[*] Total native methods found: 13
===============================================
```

比如，native 方法 lte.NCall.IL 在 libGameVMP.so 中偏移量为 0xdfa8。

在 IDA Pro 中跳转到 0xdfa8 就是 native 方法的入口点。

[![word/media/image5.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/a12b543ee1f76e84.png)](data:image/png;base64,inline-231166B)

## 完整源码

## 1\. jni_addr.js

```javascript
/**
 * 查找指定类和方法名对应的 native 函数地址（排除 CheckJNI 包装版本）
 *
 * @param {string} soName             - 包含目标 native 方法的 so 库名（如 "libandroid_runtime.so"）
 * @param {string} javaClassName      - Java 类名（如 "android.os.Process"）
 * @param {string} targetMethodName   - 方法名（如 "getUidForName"）
 * @returns {NativePointer|null}      - 找到的 native 函数地址或 null
 */
function findNativeAddress(soName, javaClassName, targetMethodName) {
    // 获取指定 so 中的导出符号列表
    const exports = Module.enumerateExportsSync(soName);

    // 将 Java 类名转为 native C++ 符号格式（如 android_os_Process）
    const lowerClassName = javaClassName.replace(/\./g, "_");

    // 遍历导出符号，寻找符合条件的 native 方法
    for (let exp of exports) {
        if (
            exp.type === "function" &&
            exp.name.indexOf(lowerClassName) !== -1 &&         // 包含类名
            exp.name.indexOf(targetMethodName) !== -1 &&       // 包含方法名
            exp.name.indexOf("CheckJNI") === -1     // 排除 CheckJNI 包装版本
        ) {
            console.log(`[+] Found native method: ${exp.name} @ ${exp.address}`);
            return ptr(exp.address);  // 找到匹配的符号地址
        }
    }

    // 未找到匹配的符号
    return null;
}

/**
 * 找到 entry_point_from_jni_ 在 ArtMethod 结构体中的偏移量（根据 Android 版本不同可能会变化）
 *
 * @returns {number} 返回 entry_point_from_jni_ 的偏移量，若未找到返回 -1
 */
function entryPointFromJniOffset() {

    // 1. 选择一个已知的 Java native 方法作为“参考样本”。 该方法需要在系统中真实存在并且能找到其 native 地址。
    const soName = "libandroid_runtime.so";
    const className = "android.os.Process";
    const methodName = "getUidForName";

    // 2. 查找对应的 native 函数地址
    const native_addr = findNativeAddress(soName, className, methodName);
    if (native_addr === null) {
        console.log("[-] Native function not found.");
        return -1;
    }

    let clazz = Java.use(className).class;
    let methods = clazz.getDeclaredMethods();

    // 3. 获取类中所有方法并筛选 native 方法
    for (let i = 0; i < methods.length; i++) {

        // 获取方法签名
        let methodName = methods[i].toString();

        // 获取方法的修饰符，如 public、private、static、native 等
        let flags = methods[i].getModifiers();

        // 256 代表 native 修饰符
        if (flags & 256) {

            // 如果方法名中包含 methodName 说明找到了目标方法
            if (methodName.indexOf("getUidForName") != -1) {

                // 4. 获取 ArtMethod 指针并逐字节扫描字段
                let art_method = methods[i].getArtMethod();

                for (let j = 0; j < 30; j = j + 1) {

                    let jni_entrypoint_offset = Memory.readPointer(ptr(art_method + j));

                    // 比较每个字段的值是否等于我们前面获取到的 native 函数地址。
                    if (native_addr.equals(jni_entrypoint_offset)) {
                        // 找到即返回偏移
                        return j;
                    }
                }
            }
        }
    }

    // 未找到 JNI 方法对应的偏移量，返回 -1
    return -1;
}

/**
 * 遍历类中的 native 方法，打印 JNI 函数地址、所属模块信息，结构化输出。
 *
 * @param {string} className - Java 类名（如 "android.os.Process"）
 */
function getJniMethodAddr(className) {
    Java.perform(function () {
        const obj = Java.use(className);
        const clazz = obj.class;
        const jni_entrypoint_offset = entryPointFromJniOffset();

        console.log("========== [ JNI Method Info Dump ] ==========");
        console.log("[*] Target class: " + className);
        console.log("[*] entry_point_from_jni_ offset = " + jni_entrypoint_offset + " bytes\n");

        const methods = clazz.getDeclaredMethods();
        let count = 0;

        for (let i = 0; i < methods.length; i++) {
            const m = methods[i];
            const flags = m.getModifiers();
            const methodName = m.toString();

            // 256 表示 native 方法
            if ((flags & 256) !== 0) {
                count++;
                const art_method = m.getArtMethod();
                const native_addr = Memory.readPointer(ptr(art_method).add(jni_entrypoint_offset));

                const module = Process.getModuleByAddress(native_addr);
                const offset = module ? native_addr.sub(module.base) : ptr(0);

                // 结构化打印信息
                console.log("------------ [ #" + count + " Native Method ] ------------");
                console.log("Method Name     : " + methodName);
                console.log("ArtMethod Ptr   : " + ptr(art_method));
                console.log("Native Addr     : " + native_addr);
                if (module) {
                    console.log("Module Name     : " + module.name);
                    console.log("Module Offset   : 0x" + offset.toString(16));
                    console.log("Module Base     : " + module.base);
                    console.log("Module Size     : " + module.size + " bytes");
                    console.log("Module Path     : " + module.path);
                } else {
                    console.log("Module Info     : [ Not Found ]");
                }
                console.log("------------------------------------------------\n");
            }
        }

        if (count === 0) {
            console.log("[-] No native methods found in class: " + className);
        } else {
            console.log("[*] Total native methods found: " + count);
        }

        console.log("===============================================");
    });
}

// 暴露给 Python 调用（注意：exports中函数名需要全部小写，而且不能有下划线，不然会找不到方法）
rpc.exports.getjnimethodaddr = getJniMethodAddr

// getJniMethodAddr("lte.NCall")
// getJniMethodAddr("com.cyrus.example.MainActivity")

// frida -H 127.0.0.1:1234 -F -l jni_addr.js
```

## 2\. jni_addr.py

```python
import frida


def read_frida_js_source(script):
    with open(script, "r", encoding='utf-8') as f:
        return f.read()


def on_message(message, data):
    print(f"消息: {message['type']}, 数据: {message['payload']}")


def main():
    # class_name = "lte.NCall"
    class_name = "com.cyrus.example.MainActivity"

    device = frida.get_device_manager().add_remote_device("127.0.0.1:1234")
    pid = device.get_frontmost_application().pid
    session: frida.core.Session = device.attach(pid)
    script = session.create_script(read_frida_js_source("jni_addr.js"))
    script.on('message', on_message)
    script.load()

    script.exports.getjnimethodaddr(class_name)

    # 退出
    session.detach()


if __name__ == "__main__":
    main()
```
