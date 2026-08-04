---
title: 结合AI对WhatsApp的分析（二） - 奋飞安全
source: http://91fans.com.cn/post/whatsapptwo/
source_host: 91fans.com.cn
clip_date: 2026-08-04T14:29:40+08:00
trace_id: 41fb8ed6-1054-405a-832a-8ca15fe38fcb
content_hash: f4288ee048295327465a94aa470de1631547fe2ea0c7ffb8c5efd83d67350c68
status: synced
tags:
  - Android逆向
  - JNI Trace
series: null
feed_source: 91fans·逆向
ai_summary: H 参数的计算隐藏在 Native 层通过 JNI 回调 Java 的过程中，最终定位到 `com.whatsapp.wamsys.JniBridge.jnidispatchOO`。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 3b275244-d011-81b4-89a0-c99ad31f2d66
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> H 参数的计算隐藏在 Native 层通过 JNI 回调 Java 的过程中，最终定位到 `com.whatsapp.wamsys.JniBridge.jnidispatchOO`。
> 
> - **定位思路：** 优先 Hook Java 层 `JniBridge.jvidispatchIOOOOOOOOOO`，确认返回值 0 但无有效线索，排除纯 Java 计算，转向检查 Native 层。
> - **弯路教训：** 直接进行 Native 层汇编级 Trace 无法找到 H，实际计算由 Native 通过 JNI 调起 Java 逻辑完成，需结合 JNI Trace 才能发现。
> - **代码模块化：** 使用 Frida 模块化编程，将 `buf2hex` 等工具函数放入 `utils/byteTolib.js`，并用 `frida-compile -w` 实时编译，提高 Hook 脚本可维护性。
> - **关键突破：** 在 `jvidispatchIOOOOOOOOOO` 中启用 `hook_all_jni()`，观察到 `CallStaticObjectMethodV` 与 `GetByteArrayElements` 取出 70 字节签名数据（R/S 格式），再通过 `traceClass("com.whatsapp.wamsys.JniBridge")` 锁定调用来自 `jnidispatchOO`。

一、目标

## 一、目标

书接上文 [结合AI对WhatsApp的分析（一）](http://91fans.com.cn/post/whatsappone/) ，我们已经定位了 H 参数，下一步就是分析一下它的来历。

## 二、步骤

### 堆栈定位

H 被计算的位置有两种可能，一种是java层，一种是Native层，我们先顺着堆栈往上找

![stack1](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/d0549944ed210d8b.png)

1:stack1

柿子得找软的捏，我们先从java层找起，hook 这个 com.whatsapp.wamsys.JniBridge.jvidispatchIOOOOOOOOOO

```javascript
let JniBridge = Java.use("com.whatsapp.wamsys.JniBridge");

JniBridge["jvidispatchIOOOOOOOOOO"].implementation = function (i, obj, obj2, obj3, obj4, obj5, obj6, obj7, obj8, obj9, obj10) {
    console.log(`======== JniBridge.jvidispatchIOOOOOOOOOO is called: i=${i}, obj=${obj}, obj2=${obj2}, obj3=${obj3}, obj4=${obj4}, obj5=${obj5}, obj6=${obj6}, obj7=${obj7}, obj8=${obj8}, obj9=${obj9}, obj10=${obj10}`);


    let bCls = Java.use('[B')
    let buffer = Java.cast(obj6, bCls);
    let rc = Java.array('byte', buffer);

    console.log("obj6 = " + buf2hex(rc));

    buffer = Java.cast(obj7, bCls);
    rc = Java.array('byte', buffer);
    console.log("obj7 = " + buf2hex(rc));

    let result = this["jvidispatchIOOOOOOOOOO"](i, obj, obj2, obj3, obj4, obj5, obj6, obj7, obj8, obj9, obj10);
    console.log(` ======== JniBridge.jvidispatchIOOOOOOOOOO result=${result}`);
    return result;
};
```

跑这个 hook 的时候，可以先把之前的Base64的hook代码注释掉，这样看上去清晰一些。

jvidispatchIOOOOOOOOOO 的入参是一大堆明文，返回值 是 0 。 貌似是成功的意思，

摸不到头脑，这时候不得不怀疑 H 是在Native层去计算的，下一步的解决方案就是Native层的Trace，然后汇编层一行一行去找。不过悲催的是，这条路是错的，我就不给大家展开了，下次走对了，我再介绍这个玩法。

### frida模块化编程,代码也要精致生活

在进行下一步之前，我们先把代码整整，一个js越写越多，多的都有几千行了，太不帅了，咱们得搞个起码的模块化，把一些常用的函数封装到单独的js中，buf2hex 之类的

首先新建一个目录 utils,在目录下面新建一个byteTolib.js，然后把buf2hex拷贝进去，函数名之前加一个export

```javascript
// 将意大利面条代码改造成米其林餐厅
// ./utils/byteTolib.js
export function buf2hex(buffer) {
....
}

// ws2demo.js
import {
    buf2hex,
} from "./utils/byteTolib.js";
```

然后在ws2demo.js加一个import就可以调用buf2hex函数了。

实际跑的时候不再是直接跑ws2demo.js

而是先启动一个控制台

```javascript
frida-compile -w ws2demo.js -o ws2demo-agent.js
```

把ws2demo.js编译成ws2demo-agent.js， 这个控制台就不要关了 ，他会监控原始文件的修改，实时生成编译后的文件。

```javascript
frida -Uf com.whatsapp --runtime=v8 -l ws2demo-agent.js
```

在另外一个控制台中实际执行ws2demo-agent.js，这下代码就清晰多了

### JNI Trace

飞哥已经花了几天功夫走了一下弯路，证明了H的计算不在Native里面，但是我们从java的堆栈X.6zL这些类里面又没有发现蛛丝马迹。

真相只有一个，那就是Native中通过JNI调用java来计算。要分析这种类型的调用，我们只需要参照以前的文章 [Trace大盘点](http://91fans.com.cn/post/traceinfo),用上飞哥独家定制的jniTreace工具。

在hook jvidispatchIOOOOOOOOOO的时候增加一个 hook_all_jni()

```javascript
ffJNITrace: ======== /* TID 18362 */ JNIENv->CallObjectMethod java/lang/Class->0x6f6eb168 0x81
...
ffJNITrace: ======== /* TID 18362 */ JNIENv->CallStaticObjectMethodV java/lang/Class->0x7082dd30 rc = 0x75
...

ffJNITrace:/* TID 18362 */  JNIENv->GetByteArrayElements was called args[1] = 0x29, args[2] = 0x0
ffJNITrace: ======== byteLen = 71
ffJNITrace: ======== 3045022100830c97dd97a5526a29d6b8639b26b341a50b629d40462ed0b992b8521e47972502200e09492a06883ddb4d4350bb65ef9f1796d309e5c87245cba4842d994d14302b
```

又接近了一点，本以为可以从 CallObjectMethod 或者 CallStaticObjectMethodV 找到线索，也许是我的hook代码有问题，这里还是没有精准定位的东西。

### traceClass

从之前的分析来看 com.whatsapp.wamsys.JniBridge 类可能是个很重要的类，我们把它也trace上

```javascript
traceClass("com.whatsapp.wamsys.JniBridge");
```

再跑一下，

```javascript
....
*** exiting com.whatsapp.wamsys.JniBridge.jnidispatchOO
ffJNITrace: ======== /* TID 18938 */ JNIENv->CallStaticObjectMethodV java/lang/Class->0x9e37e2e0 rc = 0x29
ffJNITrace:/* TID 18938 */  JNIENv->GetByteArrayElements was called args[1] = 0x29, args[2] = 0x0
ffJNITrace: ======== byteLen = 70
ffJNITrace: ======== 304402205492ecfb34b84941e1179d1e7aab840f6430e55a279f7f6958f20d29a2efefbd022006a9dce0cebc6d02b6e3359384bfb82a30c0e77c9fdd8aed89e2963e3029da29
```

兄弟们，这下跑不掉了，就是 jnidispatchOO

## 三、总结

当Java层过于干净时，记得检查它有没有Native层的"外国亲戚"，每个完美的隐身，都可能在JNI调用中露出马脚。

![ffshow](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/05ccf6ca6a4e186e.png)

1:ffshow

你要是一直被带着跑，就像跟着波浪起起伏伏；但如果你能看透一切波动，直接做那片安静的水，那你就赢了！

![100](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/897edc78d5c0d2b3.png)
