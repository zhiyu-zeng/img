---
title: Frida 实战：Android JNI 数组 (jobjectArray) 操作全流程解析 // CYRUS STUDIO
source: https://cyrus-studio.github.io/blog/posts/frida-%E5%AE%9E%E6%88%98android-jni-%E6%95%B0%E7%BB%84-jobjectarray-%E6%93%8D%E4%BD%9C%E5%85%A8%E6%B5%81%E7%A8%8B%E8%A7%A3%E6%9E%90/
source_host: cyrus-studio.github.io
clip_date: 2026-08-04T14:06:56+08:00
trace_id: bd91e74d-e630-4408-9b2a-589ba70da7e5
content_hash: fd1969a75afa73fb665591ba9cfb3458b27258a28b6f025bae5a09d74dd146fe
status: synced
tags:
  - Android逆向
  - Frida
series: null
feed_source: Cyrus Studio·安卓逆向
ai_summary: 在 Frida Hook 中，通过 `Java.vm.tryGetEnv()` 获取 JNIEnv 引用即可使用 env.js 封装好的 JNI 接口操作 Native 层的 jobjectArray 参数，实现读取、打印、动态构造数组并调用 Native 函数。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 3b275244-d011-812d-a724-c1e8e50e8522
ioc:
  cves: []
  cwes: []
  hashes:
    - 1e4e9a461f9b4fb09d6a4ae12c1eca83
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 在 Frida Hook 中，通过 `Java.vm.tryGetEnv()` 获取 JNIEnv 引用即可使用 env.js 封装好的 JNI 接口操作 Native 层的 jobjectArray 参数，实现读取、打印、动态构造数组并调用 Native 函数。
> 
> - **JNIEnv 入口：** 使用 `let env = Java.vm.tryGetEnv()` 获取 JNIEnv，之后可直接调用 `env.getArrayLength`、`env.getObjectArrayElement`、`env.newObjectArray` 等函数，无需自行实现 JNI 调用。
> - **元素读取与类型转换：** `env.getObjectArrayElement(objArray, i)` 获取的是 jobject，需根据元素类型用 `Java.cast(...)` 转换为对应的 Java 包装类（如 `Integer`、`Double`、`String`）或先用 `getObjectClassName` 判断类型再转换。
> - **字符串提取方式：** 可直接调用 `env.stringFromJni(element)` 获取字符串值，也可使用 `Java.cast(element, Java.use('java.lang.String'))`，两者效果相同。
> - **创建并填充 jobjectArray：** 通过 `env.newObjectArray(length, objectClass, NULL)` 创建数组，再用 `env.setObjectArrayElement(objectArray, idx, elementHandle)` 填入数据，可直接构造参数调用 `NativeFunction`，无需依赖原调用链。

> 版权归作者所有，如有转发，请注明文章出处： [https://cyrus-studio.github.io/blog/](https://cyrus-studio.github.io/blog/)

## 前言

在 Android 的 Native 层，Java 中的 Object\[\] 类型参数会以 jobjectArray 的形式传递到 C/C++ 代码中。

与 JS 数组不同，你不能直接对 jobjectArray 进行索引访问或直接操作其元素。要获取或修改其中的内容，必须借助 JNI 提供的接口，例如获取数组长度、读取单个元素或创建新的数组等操作。

## env.js

常用的 JNI 函数在 frida 的 env.js 中都已经封装好了

[https://github.com/frida/frida-java-bridge/blob/main/lib/env.js](https://github.com/frida/frida-java-bridge/blob/main/lib/env.js)

[![word/media/image1.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/4d02deaa2936f7c4.png)](data:image/png;base64,inline-201190B)

通过下面代码获取 JNIEnv 引用，就可以调用相关的 JNI 函数

```
let env = Java.vm.tryGetEnv()
```

[![word/media/image2.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/a72b451b9f548364.png)](data:image/png;base64,inline-174302B)

文档： [https://frida.re/docs/javascript-api/](https://frida.re/docs/javascript-api/)

## 获取数组长度

```
let arrLen = env.getArrayLength(objArray)
console.log('array length is: ' + arrLen);
```

## 元素类型判断

通过 getObjectClassName 可以获取到对象的类名进而判断该元素的类型。

```javascript
// 获取对象的类名
let className = env.getObjectClassName(objArray)
console.log('className: ' + className);

// 判断是否 jobjectArray
if (className === '[Ljava.lang.Object;') {

}
```

## 获取数组元素

```
let element = env.getObjectArrayElement(objArray, i)
```

## Int 元素读取

```javascript
let intElement = Java.cast(env.getObjectArrayElement(objArray, i), Java.use('java.lang.Integer'))
console.log(`element ${i} value: ${intElement}`);
```

## Long 元素读取

```javascript
let longElement = Java.cast(env.getObjectArrayElement(objArray, i), Java.use('java.lang.Long'))
console.log(`element ${i} value: ${longElement}`);
```

## Float 元素读取

```javascript
let floatElement = Java.cast(env.getObjectArrayElement(objArray, i), Java.use('java.lang.Float'))
console.log(`element ${i} value: ${floatElement}`);
```

## Double 元素读取

```javascript
let doubleElement = Java.cast(env.getObjectArrayElement(objArray, i), Java.use('java.lang.Double'))
console.log(`element ${i} value: ${doubleElement}`);
```

## 字符串 元素读取

通过 env.js 中定义的 stringFromJni 函数可以直接获取到字符串对象的值

[![word/media/image3.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/e3a274a342d1ee0d.png)](data:image/png;base64,inline-51254B)

```
let stringElement = env.stringFromJni(env.getObjectArrayElement(objArray, i))
console.log(`element ${i} value: ${stringElement}`);
```

或者

```javascript
let stringElement = Java.cast(env.getObjectArrayElement(objArray, i), Java.use('java.lang.String'))
console.log(`element ${i} value: ${stringElement}`);
```

## Object 元素读取

```javascript
let element = env.getObjectArrayElement(objArray, i)

let elementClassName = env.getObjectClassName(element)

// 元素类型转换
let castElement = Java.cast(element, Java.use(elementClassName))

console.log(`element ${i} value: ${castElement}`);
```

## 打印 jobjectArray

打印 jobjectArray 中所有元素

```javascript
/**
 * 打印 jobjectArray 中所有元素
 * 
 * @param objArray
 * @returns {string|null}
 */
function printObjectArray(objArray) {
    if (objArray.isNull()) {
        console.log('Object array is null');
        return null;
    }

    // 获取 JNIEnv
    let env = Java.vm.tryGetEnv();
    let className = env.getObjectClassName(objArray);

    // 不是 jobjectArray，则直接打印类型
    if (!className.startsWith('[L')) {
        return `Argument is not a jobjectArray, actual type: ${className}`;
    }

    let arrLen = env.getArrayLength(objArray);
    let result = `Object array of type ${className}, length: ${arrLen}\n`;

    for (let i = 0; i < arrLen; i++) {
        let element = env.getObjectArrayElement(objArray, i);
        let elementClassName = env.getObjectClassName(element);
        let castElement = Java.cast(element, Java.use(elementClassName));

        result += `  [${i}] ${elementClassName}: ${castElement}\n`;
    }

    return result.trim() + '\n';
}
```

hook native 函数并打印 jobjectArray 传参

```javascript
function hook_native_func(targetAddress) {
    // Hook 目标地址
    Interceptor.attach(targetAddress, {
        onEnter: function (args) {
            this.log = 'Entering native function at: ' + targetAddress + '\n';
            this.log += printObjectArray(args[2])
        },

        onLeave: function (retval) {
            // 检查是否包含 "283"
            if (this.log.includes("283") && !retval.isNull()) {
                // 类型转换
                let className = Java.vm.tryGetEnv().getObjectClassName(retval)
                retval = Java.cast(retval, Java.use(className));
            }
            this.log += 'Leaving native function，retval: ' + retval
            console.log(this.log);
        }
    });
}

setImmediate(function () {
    Java.perform(function () {
        var baseAddress = Module.findBaseAddress("libGameVMP.so");
        hook_native_func(baseAddress.add(0xdfa8))
    });
})
```

执行脚本

```
frida -H 127.0.0.1:1234 -F -l hook_native_func.js
```

输出如下：

```
Entering native function at: 0x7802455fa8
Object array of type [Ljava.lang.Object;, length: 3
  [0] java.lang.Integer: 283
  [1] com.shizhuang.duapp.modules.app.DuApplication: com.shizhuang.duapp.modules.app.DuApplication@d3fdf19
  [2] java.lang.String: cipherParamuserNamecountryCode86loginTokenpasswordca85e501ec201e140c97d4480a724cffplatformandroidtimestamp1243532540699typepwduserName4860cc943262bab5ef4712e3bf0db355_1uuidac6abb3d17c8fb63v5.43.0
Leaving native function，retval: dWWoXlbR3K87j2N27Dkv4uOPUnOIN8Kof9Gm2x1kil7S/jpBEVaMS8QgdCHBIMPhVX/bK7s5MFUyLCOl
B7InMGNA682aYZfSsu0VK8TERMuSq3Bg3C3ATNGKaJPVMWtogFXteBS1/CxbFUdhtv0v1U8zrQCT6QLeaQvM8nBmXDKSOvivdG7xhLLNWmSGP8gdVL0CuAKDFH2Xj9Krb/0jNsPgNnA==
```

## jobjectArray 转换 JS 数组

封装一个方法将解析 jobjectArray 并返回元素转换为真实类型后的 JS 数组

```javascript
/**
 * 解析 jobjectArray 并返回元素转换为真实类型后的 JS 数组
 *
 * @param objArray          jobjectArray
 * @returns {array|null}    数组
 */
function parseObjectArray(objArray) {
    if (objArray.isNull()) {
        console.log('Object array is null');
        return null;
    }

    // 获取 JNIEnv
    let env = Java.vm.tryGetEnv();
    let className = env.getObjectClassName(objArray);

    // 不是 jobjectArray
    if (!className.startsWith('[L')) {
        console.log(`Argument is not a jobjectArray, actual type: ${className}`);
        return null;
    }

    let arrLen = env.getArrayLength(objArray);
    let result = []

    for (let i = 0; i < arrLen; i++) {
        let element = env.getObjectArrayElement(objArray, i);
        let elementClassName = env.getObjectClassName(element);
        let castElement = Java.cast(element, Java.use(elementClassName));

        result.push(castElement)
    }

    return result;
}
```

比如 jobjectArray 中第一个元素是 java.lang.Integer，经过 parseObjectArray 后可以直接访问元素中的 intValue() 方法判断 值是否等于 283

```javascript
function hook_native_func(targetAddress) {
    // Hook 目标地址
    Interceptor.attach(targetAddress, {
        onEnter: function (args) {
            let arr = parseObjectArray(args[2])
            // 判断数组中第一个元素是否 283
            if (arr[0].intValue() === 283) {
                this.log = 'Entering native function at: ' + targetAddress + '\n';
                this.log += printObjectArray(args[2])
            }
        },

        onLeave: function (retval) {
            if (this.log) {
                if (!retval.isNull()) {
                    let className = Java.vm.tryGetEnv().getObjectClassName(retval)
                    retval = Java.cast(retval, Java.use(className));
                }
                this.log += 'Leaving native function，retval: ' + retval
                console.log(this.log);
            }
        }
    });
}
```

执行脚本

```
frida -H 127.0.0.1:1234 -F -l hook_native_func.js
```

输出如下：

```
Entering native function at: 0x6f22493fa8
Object array of type [Ljava.lang.Object;, length: 3
  [0] java.lang.Integer: 283
  [1] com.abc.duapp.modules.app.DuApplication: com.abc.duapp.modules.app.DuApplication@b68b4ae
  [2] java.lang.String: cipherParamuserNamecountryCode86loginTokenpassword675d0c16c532e8dc96ab17490beplatformandroidtimestamp2195743174404typepwduserNamef573fa1fa140cf340018011db67c963cd733_1uuid84c3a328fb63819bv5.43.0
Leaving native function，retval: dWWoXlbR3K87j2N27Dkv4uOPUnOsh...
```

## 创建 jobjectArray

通过 frida 创建 jobjectArray 填充数据，调用 NativeFunction

```javascript
function NCall_IL() {
    Java.perform(function () {
        let targetAddress = Module.findBaseAddress("libGameVMP.so").add(0xdfa8)

        let IL = new NativeFunction(
            ptr(targetAddress),                 // 函数地址
            'pointer',                          // 返回值类型：jstring
            ['pointer', 'pointer', 'pointer']   // 参数类型列表（JNIEnv* , jclass, jobjectArray）
        );

        // 获取 env 和 jclass
        const env = Java.vm.tryGetEnv();
        const clazz = env.findClass("java.lang.Object");

        // 构造元素
        const arg0 = 283;
        const arg1 = Java.use("com.cyrus.duapp.modules.app.DuApplication").instance.value; // 读取 static 字段 instance
        const arg2 = "cipherParamuserNamecoun...";

        // 获取 java.lang.Object class (jclass)
        const objectClass = env.findClass("java.lang.Object");

        // 创建一个长度为 3 的 jobjectArray（即 Object[]）
        const arrayLength = 3;
        const objectArray = env.newObjectArray(arrayLength, objectClass, ptr(0));

        // int 参数
        const intArg = Memory.alloc(4);
        intArg.writeS32(arg0);

        // 填充数据
        env.setObjectArrayElement(objectArray, 0, intArg);
        env.setObjectArrayElement(objectArray, 1, arg1.$handle); //  $handle 是 Java 层对象的 native JNI 指针表示
        env.setObjectArrayElement(objectArray, 2, env.newStringUtf(arg2));

        // 调用
        let result = IL(env.handle, clazz, objectArray);
        console.log("函数返回值:", result);
    })
}
```

调用输出如下：

```
[Remote::CYRUS]-> NCall_IL()
Entering native function at: 0x6f22499fa8
Object array of type [Ljava.lang.Object;, length: 3
  [0] java.lang.Integer: 283
  [1] com.cyrus.duapp.modules.app.DuApplication: com.cyrus.duapp.modules.app.DuApplication@89c9f57
  [2] java.lang.String: appKey1e4e9a461f9b4fb09d6a4ae12c1eca83loginTokenplatformandroidsymbol...
Leaving native function，retval: AC8aG5GIwLORLMYNGmc6BE2c3IgGXgoBn3fqYpySA+...
```
