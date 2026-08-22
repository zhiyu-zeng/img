---
title: 【看雪】【APP 逆向】哔哩哔哩 sign 参数逆向（一）：Frida 反调试绕过与 unidbg 黑盒调用
source: https://bbs.kanxue.com/thread-292722.htm
source_host: bbs.kanxue.com
clip_date: 2026-08-22T20:30:06+08:00
trace_id: 43cb5b2b-f72a-49cd-b368-0f063d5a2064
content_hash: cbe18acfeb427272c8f89e3592b5526fadff8ad12759e5adbab182926798f442
status: synced
tags:
  - 看雪
  - Frida
  - 模拟执行
series: 【看雪】【APP 逆向】哔哩哔哩 sign 参数逆向
feed_source: 看雪·逆向工程
ai_summary: 通过 hook dlsym 伪造 pthread_create 绕过B站 frida 反调试，再用 unidbg 黑盒调用 libbili.so 的 s() 方法成功得到 sign。
ai_summary_style: key-points
images_status:
  total: 19
  succeeded: 19
  failed_urls: []
notion_page_id: 3c475244-d011-818f-a988-dec648f7424d
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 通过 hook dlsym 伪造 pthread_create 绕过B站 frida 反调试，再用 unidbg 黑盒调用 libbili.so 的 s() 方法成功得到 sign。
> 
> - **反调试表现：** B站8.0.0加载 libmsaoaidsec.so 时通过 dlsym 间接调用 pthread_create 创建检测线程，常规 hook pthread_create 无效；spawn 模式 hook 会在0.5秒内自动重启，attach 模式直接闪退。
> - **绕过方法：** hook android_dlopen_ext 检测到 libmsaoaidsec.so 后启用 dlsym 拦截，把返回的 pthread_create 地址替换为 NativeCallback 伪函数；伪函数前若干次直接返回0，不真实创建线程，之后放行真函数，成功绕过检测。
> - **sign定位：** hook libart.so 的 NewStringUTF 并过滤32位字符串，结合Java/native调用栈定位到 com.bilibili.nativelibrary.LibBili 的动态注册 native 方法 s()，返回值 SignedQuery 中包含 sign，实现在 libbili.so。
> - **unidbg 黑盒：** 用 unidbg 0.9.7 模拟64位Android环境、加载apk和libbili.so、执行JNI_OnLoad后调用s()；从 JADX 复制 SignedQuery 类并替换 TextUtils.isEmpty 等依赖完成补环境，最终输出 rawParams 和 sign，可打成 jar 交给 Python 调用。
> - **后续：** 黑盒只拿到结果，sign 内部算法为 libbili.so 中 OLLVM 混淆的 sub_162A8，留待白盒分析。

## 声明

**本文章中所有内容仅供学习交流使用，不用于其他任何目的，不提供完整代码，抓包内容、敏感网址、数据接口等均已做脱敏处理，严禁用于商业用途和非法用途，否则由此产生的一切后果均与作者无关！**

**本文章未经许可禁止转载，禁止任何修改后二次传播，擅自使用本文讲解的技术而导致的任何意外，作者均不负责，若有侵权，请联系作者立即删除！**

## 逆向目标

目标：哔哩哔哩 APP

apk 版本：8.0.0

下载地址：aHR0cHM6Ly93d3cud2FuZG91amlhLmNvbS9hcHBzLzI4MTI5MS9oaXN0b3J5X3Y4MDAwMjAw

## 工具总结

| 工具  | 用途  |
| --- | --- |
| Reqable | 抓包，获取接口的请求参数 |
| JADX | APK 反编译，静态定位 Java 层代码 |
| Frida | 动态注入，hook NewStringUTF / dlopen / dlsym 等函数 |
| unidbg（0.9.7） | 模拟 Android 设备，黑盒执行 so 中的算法 |
| IntelliJ IDEA | 运行 unidbg 测试工程 |

## 逆向分析

### 一、抓包

我们打开 reqable 进行抓包，在 app 中进行操作。这里演示的是 achives 接口，也就是哔哩哔哩创作者中心的作品页。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/6a19adb38705fe20.webp)

可以看到接口是 GET 请求，参数中有一个 sign 参数，这个就是我们需要分析的参数。

### 二、参数定位

我们打开 jadx，将 apk 拖入，然后搜索 sign，可以看到出现了非常多的结果。  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/04d88eea3a77325d.webp)

为什么这么多？因为 sign 在代码里可能被用于校验、缓存、拼接，到处都有引用，一个个点击去看不现实。因此，我们先做一个假设：sign 参数是在 so 层生成，然后返回给 Java 层使用的。

如果假设成立，那么 so 层肯定需要将字符串转换后返回给 Java，此时会调用 **NewStringUTF**——这是 JNI 返回字符串的唯一必经之路。

我们可以对它进行 hook，并进行相关特征的匹配，例如 sign 的长度是 32 位（32 个十六进制字符，典型的 MD5 hex 特征）。hook 脚本如下：

```javascript
function hook_NewStringUTF() {
    // 1. 枚举 libart.so 的所有符号
    var symbols = Module.enumerateSymbolsSync("libart.so");
    var addrNewStringUTF = null;

    // 2. 找 NewStringUTF 符号(排除 CheckJNI 包装版本)
    for (var i = 0; i < symbols.length; i++) {
        var symbol = symbols[i];
        if (symbol.name.indexOf("NewStringUTF") >= 0 && symbol.name.indexOf("CheckJNI") < 0) {
            addrNewStringUTF = symbol.address;
            console.log("[+] NewStringUTF is at " + symbol.address + " (" + symbol.name + ")");
            break;
        }
    }

    if (addrNewStringUTF === null) {
        console.log("[-] NewStringUTF symbol not found in libart.so");
        return;
    }

    // 3. attach 到该符号地址
    Interceptor.attach(addrNewStringUTF, {
        onEnter: function (args) {
            // NewStringUTF(JNIEnv* env, const char* utf): args[1] = char*
            try {
                var c_string = args[1].readCString();
            } catch (e) {
                return;
            }
            // 4. 只打 32 位长度的字符串(MD5 hex 特征)
            if (c_string && c_string.length === 32) {
                console.log("[NSU] " + c_string);
                // 5. 打印 native backtrace(看哪个 so 调用的)
                console.log(Thread.backtrace(this.context, Backtracer.ACCURATE).map(DebugSymbol.fromAddress).join('\n') + '\n');
                // 6. 打印 Java stack trace(看哪个 Java 方法调用的)
                try {
                    console.log(Java.use("android.util.Log").getStackTraceString(Java.use("java.lang.Throwable").$new()));
                } catch (e) {
                    console.log("[!] Java stack trace failed: " + e);
                }
            }
        }
    });
}
```

运行它，然后这里出现了一个很奇怪的现象：用 spawn 模式打开 app hook 时，在 app 刚启动加载时会打印很多 NewStringUTF 的日志，当进入 app主页 之后会立即停止打印，之后无论做什么操作都不会再打印日志。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/2da0a91e9f41067b.webp)

这一块卡了我很久。后来发现，原来是新版的哔哩哔哩增加了对 frida 的检测：

当使用 spawn 模式 hook 时，哔哩哔哩的 app 会自动重启，并且是在 0.5s 内，肉眼几乎无法察觉，然后 hook 就会失效。这也是为什么之前 hook 到一半就断掉了的原因。

当使用 attach 模式 hook 时，app 会直接闪退。

好，接下来第一个重难点：frida 反调试的绕过。

### 三、Frida 反调试绕过

先补个知识点。Android 系统加载一个 SO 库的顺序如下：

| 阶段  | 说明  |
| --- | --- |
| dlopen / android_dlopen_ext | 系统调用加载器，将 SO 映射到内存，获得基地址 |
| .init /.init_proc | 执行初始化段的代码 |
| .init_array | 执行初始化数组中的函数（C++ 全局构造函数等） |
| JNI_OnLoad | 最后执行，通常用于注册 JNI 方法 |

检测代码一般就埋在这条链路的某一步里——通常是加载完成前后启动一个专属线程，专门扫描进程里有没有 frida 的特征（端口、线程名、内存中的特定字符串等）。

绕过原理：一般来说，有两种方式，一种是主动出击，一种是被动隐藏。

-   主动出击，就是找到它检测的位置，赶在它检测开启之前把它 nop 掉。
    
-   被动隐藏，就是利用 frida 的增强版，例如 strong_frida、huloda、florida 等等，隐藏 frida 的特征再去 hook。
    

哔哩哔哩的 app，我尝试了被动隐藏，比如使用 frida 增强版 florida 等，发现还是会被检测到（有兴趣的可以自己试试，我这里做的可能不够严谨）。

因此本文主要采用主动出击。

app 启动时一般会在 so 加载中启动新的线程用于检测 hook（主线程用于更新 UI），所以我们只要找到哪个 so 文件加载了检测线程，然后趁它还没来得及启动就把它干掉。

so 文件通常是通过 dlopen 方法加载进来的，我们可以 hook 它，看看 app 到底加载了哪些 so 文件。dlopen 的原型如下：

```c
void *dlopen(const char *filename, int flag);
```

| 参数  | 说明  |
| --- | --- |
| filename | so 文件的路径，例如 "libfoo.so" 或完整路径 /data/app/.../libfoo.so |
| flag | 加载选项：RTLD_LAZY 按需解析符号；RTLD_NOW 立即解析所有未定义符号；RTLD_GLOBAL 符号导出，可被后续库使用；RTLD_LOCAL 符号仅在本库内可见（默认） |

hook 代码如下：

```javascript
function hook_dlopen() {
    console.log("[+] Hook script loaded");
    try {
        const funcName = "android_dlopen_ext";
        var funcPtr = Module.findExportByName(null, funcName);

        if (funcPtr !== null && funcPtr !== undefined) {
            Interceptor.attach(funcPtr, {
                onEnter: function (args) {
                    var path = args[0].readCString();
                    if (path) {
                        console.log("[dlopen] " + path);
                    }
                }
            });
        }
        console.log("[+] hooked success!");
    } catch (e) {
        console.log("[-] Hook failed: " + e);
    }
}
```

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/8890de5a8d97c93a.webp)

结果如下：  

可以看到，程序运行到 libmsaoaidsec.so 就卡住闪退了。前面几十个 so 都正常通过，唯独卡在它这里——说明检测点就在这个 so 里。

在 Android 中，用于线程创建的方法一般为 pthread_create，因此，我们需要在 hook dlopen 加载 msaoaidsec 的同时，hook pthread_create 函数，并查看创建的线程有哪些。

```javascript
function hook_pthread_create() {
    var pthread_create_addr = Module.findExportByName("libc.so", "pthread_create");
    console.log("pthread_create_addr: ", pthread_create_addr);
    Interceptor.attach(pthread_create_addr, {
        onEnter: function (args) {
            // args[2] 是线程函数 start_routine，看它属于哪个模块
            console.log(args[2], Process.findModuleByAddress(args[2]).name);
        }
    });
}
```

但是 B 站做了反调试机制，hook pthread_create 是没用的，hook 不到东西（这里大家也可以自己去试试）。

经过实测，发现 B 站通过 dlsym 间接调用了 pthread_create 去创建线程。dlsym 可以通过获取函数的地址间接调用它，可以很好地防止被我们直接 hook。因此，我们可以尝试 hook dlsym 函数。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/1880a2cea7e601c2.webp)

可以看到，B 站通过 dlsym 调用了 pthread_create。既然如此，我们可以尝试在它通过 dlsym 间接创建线程时，给它返回一个假线程，让它以为自己创建成功了。代码如下：

```javascript
function build_fake_pthread_create() {
    if (real_pthread_create === null) {
        // 保存系统真实的 pthread_create 地址（此时还没被替换，拿到的就是原版）
        real_pthread_create = new NativeFunction(
            Module.findExportByName(null, "pthread_create"),
            'int',
            ['pointer', 'pointer', 'pointer', 'pointer']
        );
    }

    return new NativeCallback(function (thread, attr, start_routine, arg) {
        create_counter++;

        if (create_counter <= MAX_FAKE) {
            console.log(`[假pthread_create] 第 ${create_counter} 次拦截，返回 0（欺骗成功）`);
            // 注意：这里不调用 start_routine，线程实际并未创建
            return 0; // pthread_create 成功返回 0
        } else {
            console.log(`[假pthread_create] 第 ${create_counter} 次，放行给真实函数`);
            return real_pthread_create(thread, attr, start_routine, arg);
        }
    }, 'int', ['pointer', 'pointer', 'pointer', 'pointer']);
}

function hook_dlsym() {
    console.log("=== HOOKING dlsym ===");
    Interceptor.attach(Module.findExportByName(null, "dlsym"), {
        onEnter: function (args) {
            this.name = ptr(args[1]).readCString();
        },
        onLeave: function (retval) {
            // 当检测到 dlsym 返回 pthread_create 时，替换为假函数
            if (this.name === "pthread_create") {
                console.log("[dlsym] 检测到加载 pthread_create，正在替换为假函数...");
                if (fake_pthread_create === null) {
                    fake_pthread_create = build_fake_pthread_create();
                }
                // 关键：把返回值改成我们伪造的 NativeCallback 指针
                retval.replace(ptr(fake_pthread_create));
            }
        }
    });
}

function hook_dlopen() {
    console.log("[+] Hook script loaded");
    try {
        const funcName = "android_dlopen_ext";
        var funcPtr = Module.findExportByName(null, funcName);

        if (funcPtr !== null && funcPtr !== undefined) {
            Interceptor.attach(funcPtr, {
                onEnter: function (args) {
                    this.pathPtr = args[0];
                    if (this.pathPtr !== null && this.pathPtr !== undefined) {
                        try {
                            var path = this.pathPtr.readCString();
                            if (path && path.indexOf("libmsaoaidsec.so") !== -1) {
                                console.log("[dlopen] 已进入 libmsaoaidsec.so，激活 dlsym 拦截");
                                // 只 attach 一次，用全局标志控制
                                if (typeof globalThis.__dlsym_hooked === "undefined") {
                                    hook_dlsym();
                                    globalThis.__dlsym_hooked = true;
                                }
                            }
                        } catch (e) {
                            console.log("[!] Error reading path string");
                        }
                    }
                }
            });
        } else {
            console.log("[-] Warning: " + funcName + " not found in exports.");
        }
        console.log("[+] hooked success!");
    } catch (e) {
        console.log("[-] Hook failed: " + e);
    }
}
```

fake_pthread_create 是一个 NativeCallback 伪造的假函数，签名和 pthread_create 完全一致。它维护一个计数器：前 N 次调用直接返回 0（pthread_create 成功时返回 0，即"线程创建成功"），但实际上没有创建任何线程；超过 N 次后放行给真实的 pthread_create，保证 app 的正常功能不受影响。而 hook_dlsym 的作用，就是在检测到 dlsym 返回 pthread_create 的地址时，把返回值替换成这个假函数——这样 so 里所有通过 dlsym 间接创建线程的调用，都会被假装返回成功。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/37a371dac7b19d67.webp)

可以看到 app 不再闪退重启，成功绕过了检测。

### 四、定位 sign 生成点

绕过反调试后，我们继续 hook NewStringUTF 方法，并且同时打开抓包，在包中提取 sign 值，去 hook 日志进行搜索。  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/51c2a1116e07afd6.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/c66f05b145148bb4.webp)

可以看到成功打印了相关调用栈。我们从上往下看，可以看到首先是 libbili 的 s 方法，紧接着往上就是 signQuery 方法。我们顺着它打开 jadx 去查看。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/4256b232e2d38fc2.webp)

可以看到这个 s 是一个 native 方法，传入了一个 map，我们的 sign 大概率就是在这里进行生成的。我们可以尝试对这个 s 方法进行 hook，并进行抓包。

```javascript
function hook_s() {
    Java.perform(function () {
        var LibBili = Java.use("com.bilibili.nativelibrary.LibBili");
        var originalS = LibBili.s;

        LibBili.s.implementation = function (map) {
            console.log("[s] Called");

            // 调用原方法
            var result;
            try {
                result = originalS.call(this, map);
            } catch (e) {
                console.log("[!] originalS.call failed: " + e);
                result = originalS(map);
            }

            // 打印返回值中的关键字段
            if (result != null) {
                try {
                    var clazz = result.getClass();
                    var fields = clazz.getDeclaredFields();
                    for (var i = 0; i < fields.length; i++) {
                        var field = fields[i];
                        field.setAccessible(true);
                        var name = field.getName();
                        var value = field.get(result);
                        console.log("    " + name + " = " + value);
                    }
                } catch (e) {
                    console.log("[!] Error reading result fields: " + e);
                    console.log("    result.toString() = " + result.toString());
                }
            } else {
                console.log("    result is null");
            }

            return result;
        };
        console.log("[+] hook_s installed");
    });
}
```

可以发现，s 方法传入的 map 就是我们的请求体，返回的内容中就有我们的 sign。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/d6c57ce0e5bfb4f0.webp)

往上滑，可以看到 s 是在 libbili.so 中定义的。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/de9bcc1b2ca9f967.webp)

我们解压 apk，在 lib 目录中找到 libbili.so（arm64-v8a）。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/4e1df6596fedee8d.webp)

### 五、unidbg 调用

其实走到这里，我们已经可以将 sign 模拟出来了，也就是黑盒调用：既可以用 frida 主动调用，也可以直接用 unidbg 模拟执行拿到值。

本文采用 unidbg。

unidbg 是什么？一句话：unidbg 是一个 Java 开源项目，基于 unicorn 引擎，可以帮我们模拟一个 Android 或 iOS 设备，直接执行 so 文件中的算法，从而不需要再去逆向他内部的算法。

下载地址： [Releases · zhkl0228/unidbg](https://github.com/zhkl0228/unidbg/releases)

下载之后，用 IDE 打开，然后在根目录新建一个 apks 文件夹，把安装包和 so 文件一起放进去。

然后在 unidbg-android 下方新建 src/test/java/com/nb/demo/BiliSign.java，把代码 copy 进去。

```java
package com.nb.demo;

import com.github.unidbg.AndroidEmulator;
import com.github.unidbg.Module;
import com.github.unidbg.linux.android.AndroidEmulatorBuilder;
import com.github.unidbg.linux.android.AndroidResolver;
import com.github.unidbg.linux.android.dvm.*;
import com.github.unidbg.linux.android.dvm.jni.ProxyClassFactory;
import com.github.unidbg.linux.android.dvm.jni.ProxyDvmObject;
import com.github.unidbg.memory.Memory;

import java.io.File;
import java.util.TreeMap;

/**
 * 用 unidbg 模拟执行 bilibili 的 s() 签名函数。
 * 继承 AbstractJni：native 回调 Java 时优先反射执行 classpath 里的真实类，
 * 没实现的回调由 AbstractJni 兜底打日志，避免崩掉。
 */
public class BiliSign extends AbstractJni {

    public static AndroidEmulator emulator;   // 模拟出来的"手机"
    public static Memory memory;              // 模拟内存
    public static VM vm;                      // 模拟虚拟机（解析 apk、管理 Java 类）
    public static DalvikModule dm;            // so 被加载进虚拟机
    public static Module module;              // so 在内存中的模块（含 base 地址）
    public static DvmClass cLibBili;          // apk 里的 LibBili 类

    public BiliSign() {
        // 第 1 步：造一台 64 位"手机"（libbili.so 是 arm64-v8a，不能选 32 位）
        emulator = AndroidEmulatorBuilder.for64Bit()
                .setProcessName("tv.danmaku.bili")   // 进程名，模拟出来给 so 看的
                .build();
        memory = emulator.getMemory();
        // 第 2 步：设置 SDK 版本 + 系统库解析器（so 依赖的 libc 等按此定位）
        memory.setLibraryResolver(new AndroidResolver(23));
        // 第 3 步：创建虚拟机，把 apk 喂进去（SignedQuery、LibBili 类都定义在 apk 里）
        vm = emulator.createDalvikVM(new File("D:/study-programs/spider-projects/app-study/bilibili/哔哩哔哩_8.0.0.apk"));
        vm.setDvmClassFactory(new ProxyClassFactory()); // apk 里没有的类 → 自动生成代理，不报错
        vm.setVerbose(false); // true 会打印每一步 JNI 调用细节，排错时再打开
        // 第 4 步：加载 so
        dm = vm.loadLibrary(new File("D:/study-programs/spider-projects/app-study/bilibili/res/lib/arm64-v8a/libbili.so"), false);
        module = dm.getModule();
        // 第 5 步：拿到 LibBili 类（注意是斜杠分隔）
        cLibBili = vm.resolveClass("com/bilibili/nativelibrary/LibBili");
        // 第 6 步：执行 JNI_OnLoad（s() 是"动态注册"的，必须注册后才能调用）
        dm.callJNI_OnLoad(emulator);
    }

    public void sign() throws Exception {
        // 构造请求参数（抓包拿到的请求体原样搬过来）
        TreeMap<String, String> map = new TreeMap<>();
        map.put("access_key", "【脱敏：发布前替换为真实值或打码】");
        map.put("appkey", "1d8b6e7d45233436");
        map.put("build", "8000200");
        map.put("c_locale", "zh_CN");
        map.put("channel", "alifenfa");
        map.put("class", "is_pubing,pubed,not_pubed");
        map.put("coop", "1");
        map.put("disable_rcmd", "0");
        map.put("mobi_app", "android");
        map.put("order", "senddate");
        map.put("platform", "android");
        map.put("pn", "1");
        map.put("ps", "20");
        map.put("s_locale", "zh_CN");
        map.put("statistics", "{\"appId\":1,\"platform\":3,\"version\":\"8.0.0\",\"abtest\":\"\"}");
        map.put("ts", "1786939135");

        // JNI 方法签名：(参数类型)返回类型，用 JNI 描述符
        String methodSign = "s(Ljava/util/SortedMap;)Lcom/bilibili/nativelibrary/SignedQuery;";

        // 调用 s()，返回 SignedQuery 对象（ProxyDvmObject 把 Java 的 TreeMap 包装成 native 能操作的 jobject）
        DvmObject<?> obj = cLibBili.callStaticJniMethodObject(
                emulator,
                methodSign,
                ProxyDvmObject.createObject(vm, map));

        // 反射读取返回对象的字段（测试工程里没有 SignedQuery 类，无法直接强转）
        Object signedQuery = obj.getValue();
        String rawParams = (String) signedQuery.getClass().getField("rawParams").get(signedQuery);
        String sign = (String) signedQuery.getClass().getField("sign").get(signedQuery);
        System.out.println("rawParams=" + rawParams);
        System.out.println("sign=" + sign);
    }

    public static void main(String[] args) throws Exception {
        BiliSign biliSign = new BiliSign();
        biliSign.sign();
    }
}
```

至于代码，基本都是模板，这里就不多做解释了，我们只需要改一些特定的地方就可以直接运行：apk 路径、so 路径、想主动调用的方法（s）、传入的参数（请求体 map）等等。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/384595219b82aea0.webp)

可以看到运行后报错，我们只需要特别关注：

```python
java.lang.UnsupportedOperationException create breakpoint : com/bilibili/nativelibrary/SignedQuery->r(Ljava/util/Map;)Ljava/lang/String;
```

还有：

```python
java.lang.ClassNotFoundException Create breakpoint : com.bilibili.nativelibrary.SignedQuery
```

这个提示很明显：unidbg 在尝试运行 s 方法时，发现缺少 SignedQuery 这个类。对于 unidbg 的补环境，内容比较多，包括 C 在调用 Java 的某些方法时，可能会访问 Java JDK 或者 Android SDK 的一些内容，这些都是需要补的，具体大家可以去网上查询一些资料，这里不过多陈述。

因此，我们需要主动补给它 SignedQuery：直接在 jadx 中把 SignedQuery 代码全部 copy 出来，然后新建 src/test/java/com/bilibili/nativelibrary/SignedQuery.java 放进去，这样我们的 BiliSign 就可以直接访问它了。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/7cbb21604d6b1a21.webp)

紧接着我们会发现，SignedQuery 类报了很多错，其中大部分都是由于这个类访问了 Java 和 Android 中特有的方法，而在我们的 unidbg 中是没有的。接下来我们需要对这些报错一一进行处理。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/a10f075941ea941b.webp)

比如第一个报错 TextUtils：这个类主要是用了 isEmpty 判断是否为空。TextUtils.isEmpty(CharSequence str) 的内部实现是 str == null || str.length() == 0，因此 if (!TextUtils.isEmpty(key)) 可以用以下写法完全替代：

```java
if (key != null && key.length() > 0)
```

然后是 ascii 这个报错：在 SignedQuery 类中，通过 ASCII 访问了某个值，我们可以在 jadx 中找到这个位置，看它具体是什么——是一个固定值 15，那么我们直接写死就行了。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/e70826f69cd8bb2c.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/4b5e9e13a779a450.webp)

然后以此类推，把报错全部修复。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/b6602c7df19153b1.webp)

最后运行，成功出值，unidbg 黑盒执行成功。我们后续可以把它打成 jar 包，然后直接用 Python 调用就行。

## 总结

至此，第一篇就结束了。我们做了两件事：绕过了 frida 反调试（hook dlsym + fake pthread_create 欺骗），以及用 unidbg 黑盒调用拿到了 sign。

但黑盒只告诉我们"能算"，没告诉我们"怎么算"——sign 内部的算法到底是什么？so 里藏着 OLLVM 混淆的 sub_162A8。下一篇文章，我们从白盒角度彻底还原这个算法。
