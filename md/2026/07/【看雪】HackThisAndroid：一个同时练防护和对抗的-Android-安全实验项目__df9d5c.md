---
title: 【看雪】HackThisAndroid：一个同时练防护和对抗的 Android 安全实验项目
source: https://bbs.kanxue.com/thread-291864.htm
source_host: bbs.kanxue.com
clip_date: 2026-07-02T23:10:40+08:00
trace_id: 61ffd081-31c7-4f7c-963d-0844dcd4fcc7
content_hash: a34924fa3b3b5d23a25251076801a39bdf1c530c1c81244a5e319f284c476afe
status: summarized
tags:
  - 看雪
series: null
feed_source: 看雪·Android安全
ai_summary: 这个项目是一个集成了防护检测和对抗绕过的 Android 安全实验平台，帮助用户实践安全攻防技术。
ai_summary_style: key-points
images_status:
  total: 8
  succeeded: 8
  failed_urls: []
notion_page_id: 39175244-d011-81e5-8573-f80247935759
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 这个项目是一个集成了防护检测和对抗绕过的 Android 安全实验平台，帮助用户实践安全攻防技术。
> 
> - **项目结构：** 将防守侧（Native 检测引擎）、进攻侧（Frida 脚本）和展示侧（Compose UI）整合在一个仓库中，实现协同工作。
> - **检测能力：** 内置两套引擎，可检测模拟器、Root、Frida、调试及 so 库完整性（LibPatch）等安全威胁，通过循环线程实时报警。
> - **对抗方法：** 提供 Frida 脚本绕过检测，如 hook pthread_create 或 clone 阻止检测线程，但项目也演示了如何通过代码段检查检测这些篡改。
> - **使用环境：** 需要 Android Studio 和 Frida 17，通过克隆项目并运行 app 模块，可在三个 Tab 中查看检测结果。
> - **适用人群：** 面向 Android 安全初学者，帮助理解“检测-绕过-再加固”闭环，项目可直接改造用于教学和实验。

大家好，最近做了一个 Android 安全练手项目 [HackThisAndroid](https://bbs.kanxue.com/elink@04cK9s2c8@1M7s2y4Q4x3@1q4Q4x3V1k6Q4x3V1k6Y4K9i4c8Z5N6h3u0Q4x3X3g2U0L8$3#2Q4x3V1k6Z5j5h3&6V1K9r3q4F1k6q4\)9J5c8V1S2S2j5$3E0f1K9r3W2K6b7h3&6V1M7X3!0A6k6l9%60.%60.) ，  
如果你也刚入门 Android 安全、逆向对抗、Frida 检测绕过，欢迎试试这个项目，非常欢迎提 PR / 打星

## 功能简介

这个项目把“防守侧”和“进攻侧”放在了同一个仓库里：

-   **防守侧（App）**
    -   内置两套 Native 检测引擎：
    -   检测项包括：模拟器、Root、Frida、调试/反调试、关键 so 完整性（LibPatch）等
-   **进攻侧（Frida 脚本）**
    -   提供多份脚本用于观察和验证对抗效果（例如 hook libc / pthread_create / clone 等）
-   **展示侧（Compose UI）**
    -   三个 Tab： `Simple RASP` 、 `AndroidSecurityGuard` 、 `HTTP Request`
    -   能直观看到引擎的检测结果

* * *

## 2) 如何使用

### 环境建议

-   Android Studio（支持 NDK / CMake）
-   Frida 17

### 运行方式

1.  克隆项目后，用 Android Studio 打开并完成 Gradle Sync
2.  直接运行 `app` 模块
3.  打开后可以看到三个 Tab：
    -   `Simple RASP` ：自己编写的 Native 检测模块的结果
    -   `AndroidSecurityGuard` ：第三方 Native 保护库的结果
    -   `HTTP Request` ：一个简单的网络请求页面，适合做抓包、证书和注入实验

## 以下来自项目readme

### 1.运行正常的设备

在一台没有root的真机上运行的结果如图，有两个不同的库进行检查，一个叫SimpleRasp，另一个叫AndroidSecurityGuard，分别显示在不同的tab上

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/94bb0365213d8113.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/90fef93584697f9d.webp)

AndroidSecurityGuard是一个第三方库，代码在 https://github.com/aimardcr/AndroidNativeGuard

### 2.1 模拟器检测

SimpleRasp会在启动时通过pthread_create创建检测线程，循环检测当前时否运行在模拟器或root环境，如果是的话会在UI报警

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/58a964ad62048688.webp)

### 2.2 frida检测

检测线程同时也会检测frida，使用了两种方式进行检查

-   打开当前进程的内存映射文件/proc/self/maps，查看时否有frida或gadget相关的库被加载到内存中；
-   查看/proc/self/task/文件夹，这个文件夹包含了当前进程的所有的线程信息；读取每一个线程的status文件，如果线程名包含gmain, gum-js-loop, pool-frida, gdbus这些和frida有关的字符，则表示frida hook了我们的进程；  
    可以使用 native_hook_libc_open.js 脚本来进行测试，这个脚本会hook libc库，并把对open方法的调用打印到终端；  
    当用这个脚本hook了进程时，可以看到SimpleRasp成功检测到了frida:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/cb2707b33375d01c.webp)

### 2.3 root检测

在模拟器上一般的进程没有权限调用su，所以在模拟器上检测root是通过的，这里暂时没有演示；

#### Attack!

攻击者可以通过noop pthread_create阻止检测线程的创建，见脚本 frida-scripts/simple/native_noop_pthread.js  
参考:

-   https://bbs.kanxue.com/thread-285932.htm
-   https://bbs.kanxue.com/thread-284838.htm  
    Noop pthread_create之后的页面是这样的:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/74df4f6acf4f3d06.webp)

这时emulator检测和frida已经不会报警了，不过由于java层接收不到native的callback，所以会有warning  
虽然emulator检测可以通过，但是可以看到SimpleRasp通过两种不同的方法都检查到了pthread_create()方法被修改了，详见下文。

### 3.检测pthread_create

为了防止关键的线程创建方法被修改，在启动的时候会用这个 [文章](https://bbs.kanxue.com/elink@362K9s2c8@1M7s2y4Q4x3@1q4Q4x3V1k6Q4x3V1k6%4N6%4N6Q4x3X3f1#2x3Y4m8G2K9X3W2W2i4K6u0W2j5$3&6Q4x3V1k6@1K9s2u0W2j5h3c8Q4x3X3b7I4z5e0t1I4x3o6M7K6i4K6u0V1x3g2\)9J5k6o6q4Q4x3X3g2Z5N6r3#2D9) 介绍的方法进行检测。  
代码见frida_function_hook_detection.cpp

#### Attack!

由于我们只对 pthread_create() 进行了保护，攻击者可以通过修改 pthread_create() 调用的更底层的方法(如clone)来修改线程创建的逻辑。  
参考这篇文章: https://bbs.kanxue.com/thread-285932.htm  
可以使用脚本 frida-scripts/simple/native_bypass_pthread_hook_detection.js 来绕过对pthread_create()的保护

注意要测试hook clone，需要禁用LibPatch检测 -> 注释掉SimpleRasp.so的create_thread(doLibPatchDetection)这一行，因为LibPatch检测直接使用了clone，上述脚本修改clone方法会crash掉线程(这也是LibPatch对clone修改的防护)  
运行脚本的结果:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/bba5001baa33feeb.webp)

可以看到由于线程没有启动，java层没有收到任何结果

### 4.检测so库内容时否被修改(LibPatch)

为了防止so库被hook，我们可以通过对比so文件可执行段，和加载到内存后的可执行段，来判断内存中的内容时否被修改了。  
首先读取so的program header，获取可执行的段，读取并计算checksum，比如libc.so的program header是这样的: (通过readelf查看)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/344dfc2679dac1c4.webp)

我们需要读取的是具有read和executable属性的段，也就是.plt和.text

然后读取我们线程的map文件/proc/self/maps，从里边找到需要检测的库对应的行，过滤出可执行的段(属性要带x)，比如：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/96ed6286bde4d892.webp)

然后读取这一段内存的内容并计算checksum

最后对比硬盘内容和内存内容的checksum时否一致来判断so时否被动态修改了。  
可以通过

另外，为了多一层防护，防止pthread_create()函数被noop的情况，这个检测的线程是通过调用clone创建的；  
如果使用上边的脚本去修改clone，整个app会crash。

> 友情提醒：请只在你授权的设备和应用里做测试

* * *

## 按源码梳理模块功能（简要原理）

### App UI 与状态管理（Kotlin）

-   `app/src/main/java/com/handhandlab/hackThisAndroid/MainActivity.kt`
    -   Compose 入口，三个 Tab 对应三类运行面
    -   检测结果以卡片方式展示，按风险等级显示不同图标
-   `app/src/main/java/com/handhandlab/hackThisAndroid/HackThisViewModel.kt`
    -   统一接收 JNI 回调并更新 UI
    -   同时初始化 `SimpleRasp` 与 `AndroidSecurityGuard`
    -   维护 HTTP demo 请求状态
-   `app/src/main/java/com/handhandlab/hackThisAndroid/model/DetectionData.kt`
    -   通过消息关键字（ `detected/pass/warning` ）映射风险等级

### JNI 桥接层

-   `app/src/main/java/com/handhandlab/hackThisAndroid/jni/RaspInterface.kt`
    -   `System.loadLibrary("SimpleRasp")`
    -   调 `startRuntimeApplicationSelfProtection(...)` 启动 Native 检测
    -   额外开本地 socket（ `127.0.0.1:12345` ）接收 LibPatch 线程的检测结果
-   `app/src/main/java/com/handhandlab/hackThisAndroid/AndroidSecurityGuard.kt`
    -   `System.loadLibrary("NativeGuard")`
    -   暴露静态 `addLog` 供第三方 Native 回调
-   `app/src/main/java/com/handhandlab/hackThisAndroid/jni/JniCallback.kt`
    -   检测类型码与文本映射（Emulator/Root/Frida/LibPatch/Debugger 等）

### 检测引擎 SimpleRasp（C/C++）

-   `app/src/main/cpp/SimpleRasp/simple_rasp.cpp`
    -   JNI 启动后创建检测线程，循环执行 Emulator/Root/Frida 检查
    -   检测 `pthread_create` 是否被 inline hook
    -   通过 `clone` 路径启动 LibPatch 检测线程，并用本地 socket 把结果回传给 Kotlin
-   `frida_detection.cpp`
    -   读 `/proc/self/maps` 与线程状态，匹配常见 Frida 特征
-   `root_detection.cpp`
    -   常规 root 信号检测
-   `emulator_detection.cpp`
    -   基于设备/环境特征做模拟器判断
-   `frida_function_hook_detection.cpp`
    -   检查关键函数（如 `pthread_create` ）代码段是否被篡改
-   `lib_patch_detection.c`
    -   对比磁盘 ELF 可执行段与内存映射段 checksum，判断 so 是否被动态改写

### 第三方引擎 AndroidSecurityGuard

-   路径： `app/src/main/cpp/aimardcr/AndroidSecurityGuard/`
-   `main.cpp` 在 `JNI_OnLoad` 中初始化并后台启动多个检测模块
-   模块包括：
-   结果通过 JNI 静态回调给 Kotlin 层显示

### Frida 对抗脚本

-   路径： `frida-scripts/`
-   包含证书相关绕过与 Native hook 实验脚本
-   `frida-scripts/simple/` 下有针对 `open/pthread_create/clone` 的实验脚本

* * *

## 这个项目能帮到谁

-   想入门 Android Native 安全检测的人
-   想系统理解“检测-绕过-再加固”闭环的人
-   想找一个可直接改造的教学/实验仓库的人

等之后工作没这么忙了，会继续学习其他攻防技术，持续更新项目。如果你觉得项目有一点点帮助， **欢迎点个 Star** ⭐哈～
