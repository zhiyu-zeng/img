---
title: Frida on Android 0x1 - Hooking Native Libraries |
source: https://noobexon1.github.io/posts/frida_on_android_hooking_native_libraries_post/
source_host: noobexon1.github.io
clip_date: 2026-10-13T10:14:49+08:00
trace_id: cda97e4d-f878-4c62-98af-9d7bfdb9e6d0
content_hash: 2b52d508467c24529a1a3e1b9634aa040f79483584774bd6c8699f5ebe5c0581
status: synced
tags:
  - Frida
  - Android逆向
series: null
feed_source: noobexon1·Frida/Android
ai_summary: Hook native 库时 Frida 直接 attach 会因目标 so 尚未加载而失败，正确做法是先 Hook `android_dlopen_ext` 等待库加载完成再安装 Hook。
ai_summary_style: key-points
images_status:
  total: 19
  succeeded: 19
  failed_urls: []
notion_page_id: 3f875244-d011-818f-a615-cb9439b78b3f
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Hook native 库时 Frida 直接 attach 会因目标 so 尚未加载而失败，正确做法是先 Hook `android_dlopen_ext` 等待库加载完成再安装 Hook。
> 
> - **目标：** 让 `libnativeexample.so` 中恒返回 `false` 的 `should_say_hello()` 返回 `true`，避免应用启动后自杀。
> - **地址计算：** 绝对地址 = 模块 base（`Process.findModuleByName` 获取）+ 函数在库中的偏移（本例 `0x4668`，反编译器中需切换为相对 image base 的显示方式）。
> - **失败原因：** Frida 执行过快，在 APP 还没来得及 dlopen 目标库时就 attach，`module` 返回 `null`，脚本打印 "Failed to find module"。
> - **解决方案：** Hook `Module.getGlobalExportByName("android_dlopen_ext")`，在其 `onEnter` 读第一参数路径字符串匹配目标库名，置标记位，在 `onLeave` 中确认加载完成后再安装真正的 Hook。
> - **取值修改：** `Interceptor.attach` 的 `onLeave` 中用 `retval.replace(1)` 把返回值由 0 改为 1；作者主张放弃轮询内存映射的忙等待方案，认为其浪费且脆弱。

![
Frida on Android 0x1 - Hooking Native Libraries - Featured image
](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b2a1e8f5ada29d27.png)

In this part of the **Frida on Android** series, I’ll show you how to **properly** hook functions from Android native libraries using `Frida`. I created a demo application to demonstrate the issues that can arise from doing things wrong, and I’ll explain why and how the method I’m using solves them.

## Demo App Overview

The demo application’s source code can be found at the [GitHub repository](https://github.com/noobexon1/NativeExample). You can clone and build the application yourself, or you can simply download the prebuilt `APK` file from the repository’s [releases](https://github.com/noobexon1/NativeExample/releases/tag/demo) page.

Install it on your device, run it once or twice, and let’s briefly go over the code.

### nativeexample.cpp

This is the native code of the application. Compiled into a native library named `"libnativeexample.so"`.

#### Code

```c
#include <jni.h>

extern "C" JNIEXPORT jboolean JNICALL
Java_com_noobexon_nativeexample_MainActivity_should_1say_1hello(
    JNIEnv *env,
    jobject thiz
) {
    return JNI_FALSE;
}
```

#### Flow

1.  Declares `should_say_hello()`: a simple boolean native function that always returns `false`.

### MainActivity.java

This is the code for the main activity of the application.

#### Code

```java
package com.noobexon.nativeexample;

import android.os.Bundle;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity {

    static {
        System.loadLibrary("nativeexample");
    }

    private native boolean should_say_hello();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (should_say_hello()) {
            Toast.makeText(this, "Hello from native!", Toast.LENGTH_LONG).show();
        } else {
            Toast.makeText(this, "Nope!", Toast.LENGTH_LONG).show();
            finishAffinity();
            android.os.Process.killProcess(android.os.Process.myPid());
        }
    }
}
```

#### Flow

1.  App starts.
2.  Native library `libnativeexample.so` is loaded.
3.  Boolean native function `should_say_hello()` is called from `libnativeexample.so`.
4.  Based on the return value:
    -   `true` Returned -> Shows the message `"Hello from native!"` in a `Toast`.
    -   `false` Returned -> Shows the message `"Nope!"` in a `Toast`. The application is also immediately killed.

## Goal

As things stand now, the function `should_say_hello()` always returns `false`, making the app immediately kill itself.

Our goal is to use `Frida` to hook said function, so that it returns `true`. If we manage to do that, a different message will be shown and the app won’t kill itself on launch.

## Hook Requirements

To hook a function from a native library, we need to supply `Frida` with two pieces of information:

1.  The memory base address where the native library is loaded.
2.  The offset of the target function from that base address.

Why? Because `Frida` must know the exact place where it needs to install the hook. That exact place is the absolute memory address of the function. To get the absolute memory address of the function, we can compute the following:

`[func_absolute_addr] = [lib_base_addr] + [func_offset_from_base]`

Lucky for us, `Frida` can enumerate the application’s memory map at runtime and give us the base address of the library for free. Therefore, all that remains for us to do is find the offset of the function from the native library base address and we are set.

### Finding the Offset

To find the offset, you can use your preferred disassembler or decompiler to explore `libnativeexample.so`:

1.  Open a terminal and navigate to the folder in which you downloaded the `apk` file:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/cee7f20dfac0776e.png)

2.  Decompile it using [apktool](https://apktool.org/). You should see an output folder:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7d735a4c9b4a44a3.png) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4701c76db3208dde.png)

3.  Inside of the output folder, you can find the native library at the following location:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ad4fdbff38b4fd0a.png)

4.  Open the native library in your decompiler (I’ll be using [Binary Ninja](https://binary.ninja/)). You should immediately see our target function. Click on it:

 [![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/500a569f6574a74e.png)](https://noobexon1.github.io/images/screenshots/hooking_native_functions/offset_5.png)[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/73bdd47ac784b5c9.png)](https://noobexon1.github.io/images/screenshots/hooking_native_functions/offset_6.png)

5.  Make sure the decompiler is configured to show you the offset of the function from the image base:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ea9905d854f47b8d.png)](https://noobexon1.github.io/images/screenshots/hooking_native_functions/offset_7.png)

6.  Once verified, the offset is as seen here:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/152b05a3e13465c3.png)](https://noobexon1.github.io/images/screenshots/hooking_native_functions/offset_8.png)

## First Hook Attempt (Fail)

Now that we have the offset of the target function from the base address of the native library (`0x4668`), we can try plugging our results into a generic native hook pattern.

### Generic Native Hook Pattern

The following is my common pattern to hook a native function using `Frida`:

#### Frida Snippet

```javascript
(function () {
    const moduleName = "libnativeexample.so"; // <-- Native library name
    const functionName = "should_say_hello"; // <-- Name of the function
    const functionOffset = "0x4668"; // <-- The offset we just found

    const module = Process.findModuleByName(moduleName);
    if (module != null) {
        const targetAddr = module.base.add(functionOffset);
        console.log(`[+] Hook installed for [${functionName}]`);
        Interceptor.attach(targetAddr, {
            onEnter: function (args) { 
                console.log(`-> entered [${functionName}] at [${targetAddr}]`);

                // Your code goes here...
            }, 
            onLeave: function (retval) {
                console.log(`<- leaving [${functionName}] at [${this.context.pc}]`);

                console.log(`[+] Original return value was: ${retval.toInt32()}`);
                retval.replace(1);
                console.log(`[+] Modified to: ${retval.toInt32()}`);
            }
        });   
    } else {
        console.log("[!] Failed to find module");
    }
})(); 
```

#### Code Breakdown

Let’s understand how this `Frida` script works.

1.  We plug in our findings from the previous section into the constant variables:

```javascript
...
const moduleName = "libnativeexample.so"; // <-- Native library name
const functionName = "should_say_hello"; // <-- Name of the function
const functionOffset = "0x4668"; // <-- The offset we just found
...
```

2.  We ask `Frida` to find the native library from the application’s memory map at runtime. If successful, we perform the calculation of adding the target function’s offset to the module base address to get the function’s absolute memory address.

```javascript
...
const module = Process.findModuleByName(moduleName);
    if (module != null) {
        const targetAddr = module.base.add(functionOffset);
...
```

3.  Finally, we use `Frida's` `Interceptor` to install the hook at the calculated `targetAddr` and provide the callbacks for when we enter the function and for when we leave it. Inside the `onLeave` callback, we modify the return value from `0` to `1`, which corresponds to changing the return value from `false` to `true`.

```javascript
...
Interceptor.attach(targetAddr, {
    onEnter: function (args) { 
        console.log(`-> entered [${functionName}] at [${targetAddr}]`);

        // Your code goes here...
    }, 
    onLeave: function (retval) {
        console.log(`<- leaving [${functionName}] at [${this.context.pc}]`);
        
        console.log(`[+] Original return value was: ${retval.toInt32()}`);
        retval.replace(1);
        console.log(`[+] Modified to: ${retval.toInt32()}`);
    }
});
...
```

### Testing the Hook

All that is left to do is run the script on the target application and see if it works.

1.  In the same folder where you put the `apk`, create a file named `script.js` and paste our `Frida` code snippet in it:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ff1432f17f2bf659.png)](https://noobexon1.github.io/images/screenshots/hooking_native_functions/first_hook_1.png)

2.  Run `frida-server` if you haven’t already:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0b23cb50ee5e7c68.png)

3.  Get the package name of our demo application using `Frida`:

```bash
frida-ps -Uai
```

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/328a82fbd5e633f7.png)](https://noobexon1.github.io/images/screenshots/hooking_native_functions/first_hook_3.png)

4.  Finally, make `Frida` spawn the target application and immediately execute our `script.js` file:

```bash
frida -U -f com.noobexon.nativeexample -l script.js
```

As you may have already guessed from this section’s title, our script fails. But why?

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0c0a4e4224156ada.png)

## What went wrong?

### The problem

To understand what went wrong, we just need to read the output from `Frida`:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/fe3f5eba49a35f80.png)

In fact, if we take a closer look at our code in `script.js`, we can see that this message is actually from our logs:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b8ddcfc011a90d6a.png)

And if we zoom further in on the issue, we can see that it stemmed from this part of the code:

```javascript
...
const module = Process.findModuleByName(moduleName);
if (module != null) {
    ...
} else {
    console.log("[!] Failed to find module");
}
...
```

This means `Frida` couldn’t find the native library in memory and therefore returned `null` … But why? After all, if we run the application without `Frida`, then we do see that everything works perfectly, so the native library must have been loaded **at some point**, right?

And that is exactly the problem here. `Frida` is fast. Very fast. The moment we run the command in our shell, it immediately tries to install the hook as fast as possible, even before the application had a chance to load the native library to memory, **and `Frida` can’t find the library in memory if it hasn’t been loaded yet.**

So what can we do?…

Well, our problem is in fact a **timing issue**. `Frida` attempts to hook the native library before it has been loaded to memory, and therefore fails. If we can somehow tell `Frida` **when** it needs to install the hook, then our problems will be solved. And that is exactly what we are going to do!

### The solution

How can we let Frida know for sure that the library is loaded and that it’s now ok to install the hook? There are many solutions out there, but most of them are based on busy-waiting – constantly polling the memory map every few milliseconds until the target library appears. This works only sometimes, and it’s wasteful and fragile.

We will take a different approach. To know **when** our target library has been loaded to memory, we can hook the function that actually loads libraries to memory. This function is called `android_dlopen_ext` and it takes the path of the library to be loaded as its first argument.

Modify the contents of `script.js` with the following and run the same command:

```javascript
(function () {
    const dlopenAddr = Module.getGlobalExportByName("android_dlopen_ext");
    if (dlopenAddr != null) {
        Interceptor.attach(dlopenAddr, {
            onEnter: function (args) {
                const loadPath = args[0].readCString();
                console.log(`[+] loading ${loadPath}!`);
            },
        });
    }
})();
```

This snippet will print every library being dynamically loaded:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/cd7aa3aaba7ef84f.png)

Therefore, we can use the following hook as a mechanism to let `Frida` know **when** to install the hook:

```javascript
(function () {
    const targetLibName = "libnativeexample.so"; 

    const dlopenAddr = Module.getGlobalExportByName("android_dlopen_ext");
    if (dlopenAddr != null) {
        Interceptor.attach(dlopenAddr, {
            onEnter: function (args) {
                const loadPath = args[0].readCString();
                if (loadPath != null && loadPath.includes(targetLibName)) {
                    this.isTarget = true;
                }
            },
            onLeave: function () {
                if (this.isTarget) {
                    console.log(`[+] ${targetLibName} loaded!`);

                    // ** Your code goes in here... **

                    this.isTarget = false;
                }
            }
        });
    }
})();
```

Modify the contents of `script.js` to include the above snippet, and run. The script tells us exactly when the target library has been loaded.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d125a1caaf236e33.png)

## Second Attempt (Success)

Now that we figured out the solution to the timing problem, all we have to do is take our original script and compose it over our timing mechanism:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a379cb683a81f9fc.png)](https://noobexon1.github.io/images/screenshots/hooking_native_functions/second_hook_1.png)

### Frida Snippet

```javascript
(function () {
    const targetLibName = "libnativeexample.so"; 

    const dlopenAddr = Module.getGlobalExportByName("android_dlopen_ext");
    if (dlopenAddr != null) {
        Interceptor.attach(dlopenAddr, {
            onEnter: function (args) {
                const loadPath = args[0].readCString();
                if (loadPath != null && loadPath.includes(targetLibName)) {
                    this.isTarget = true;
                }
            },
            onLeave: function () {
                if (this.isTarget) {
                    console.log(`[+] ${targetLibName} loaded!`);

                    // ------- ORIGINAL HOOK ---------------
                    (function () {
                        const moduleName = "libnativeexample.so"; 
                        const functionName = "should_say_hello"; 
                        const functionOffset = "0x4668"; 

                        const module = Process.findModuleByName(moduleName);
                        if (module != null) {
                            const targetAddr = module.base.add(functionOffset);
                            console.log(`[+] Hook installed for [${functionName}]`);
                            Interceptor.attach(targetAddr, {
                                onEnter: function (args) { 
                                    console.log(`-> entered [${functionName}] at [${targetAddr}]`);

                                    // Your code goes here...
                                }, 
                                onLeave: function (retval) {
                                    console.log(`<- leaving [${functionName}] at [${this.context.pc}]`);

                                    console.log(`[+] Original return value was: ${retval.toInt32()}`);
                                    retval.replace(1);
                                    console.log(`[+] Modified to: ${retval.toInt32()}`);
                                }
                            });   
                        } else {
                            console.log("[!] Failed to find module");
                        }
                    })(); 

                    // ----------------------------------

                    this.isTarget = false;
                }
            }
        });
    }
})();
```

### Testing the Hook

As expected, everything works now and the app no longer crashes!

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0bfdea5a1b4d1464.png)](https://noobexon1.github.io/images/screenshots/hooking_native_functions/second_hook_2.png)

## Conclusion & Template

### Templates You Should Save

#### android_dlopen_ext Hook

```javascript
(function () {
    // ** Change to target library name... **
    const targetLibName = "[MODULE_NAME_PLACEHOLDER]"; 

    const dlopenAddr = Module.getGlobalExportByName("android_dlopen_ext");
    if (dlopenAddr != null) {
        Interceptor.attach(dlopenAddr, {
            onEnter: function (args) {
                const loadPath = args[0].readCString();
                if (loadPath != null && loadPath.includes(targetLibName)) {
                    this.isTarget = true;
                }
            },
            onLeave: function () {
                if (this.isTarget) {
                    console.log(`[+] ${targetLibName} loaded!`);

                    // ** Your code goes in here... **

                    this.isTarget = false;
                }
            }
        });
    }
})();
```

#### Generic Native Hook

```javascript
(function () {
    
    const moduleName = "[MODULE_NAME_PLACEHOLDER]"; // <-- Change to target library name... 
    const functionRelativeAddress = "[FUNCTION_RELATIVE_ADDRESS_PLACEHOLDER]"; // <-- Change to function offset from the library base address... 
    const functionName = "[FUNCTION_NAME_PLACEHOLDER]"; // <-- Change to target function name... 

    const module = Process.findModuleByName(moduleName);
    if (module != null) {
        const targetAddr = module.base.add(functionRelativeAddress);
        console.log(`[+] Hook installed for [${functionName}]`);
        Interceptor.attach(targetAddr, {
            onEnter: function (args) { 
                console.log(`-> entered [${functionName}] at [${targetAddr}]`);

                // Your code goes here...

            }, 
            onLeave: function (retval) {
                console.log(`<- leaving [${functionName}] at [${this.context.pc}]`);
                
                // Your code goes here...

            }
        });   
    } else {
        console.log("[!] Failed to find module");
    }
})(); 
```
