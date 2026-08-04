---
title: 利用 Linux 信号机制（SIGTRAP）实现 Android 下的反调试 // CYRUS STUDIO
source: https://cyrus-studio.github.io/blog/posts/%E5%88%A9%E7%94%A8-linux-%E4%BF%A1%E5%8F%B7%E6%9C%BA%E5%88%B6sigtrap%E5%AE%9E%E7%8E%B0-android-%E4%B8%8B%E7%9A%84%E5%8F%8D%E8%B0%83%E8%AF%95/
source_host: cyrus-studio.github.io
clip_date: 2026-08-04T14:05:37+08:00
trace_id: 88fc0617-9c26-480d-89d2-398c0818a9bb
content_hash: 1932db2f9b5cd66b7e81297481f7dcb7b064b6a15224aa9aeb13d583c65f54f5
status: synced
tags:
  - Android逆向
  - 反调试
series: null
feed_source: Cyrus Studio·安卓逆向
ai_summary: 利用 Linux SIGTRAP 信号可检测 Android 调试器：主动触发 SIGTRAP 后，若自定义信号处理函数被调用则无调试器，若信号被调试器截获则判定被调试。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 3b275244-d011-816a-a1e7-f5090f559111
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 利用 Linux SIGTRAP 信号可检测 Android 调试器：主动触发 SIGTRAP 后，若自定义信号处理函数被调用则无调试器，若信号被调试器截获则判定被调试。
> 
> - **检测原理：** SIGTRAP 是调试器用于断点、单步的陷阱信号。程序主动 `raise(SIGTRAP)` 并注册 handler；若 handler 执行，说明信号未被调试器劫持；若 handler 未执行，信号被调试器拦截，可判定处于调试状态。
> - **实现步骤：** native 代码中用 `signal(SIGTRAP, handler)` 注册处理函数，调用 `raise(SIGTRAP)`，通过 `volatile` 标志位判断 handler 是否被调用；检测到调试器则 `sleep(3)` 后 `exit()` 退出。
> - **对抗措施：** 除退出外，可触发异常崩溃、执行假逻辑或延时退出，增加逆向对抗复杂性。
> - **测试表现：** 无调试器时程序正常返回；IDA Pro 附加后 SIGTRAP 被调试器捕获，handler 未执行，3 秒后进程终止。

> 版权归作者所有，如有转发，请注明文章出处： [https://cyrus-studio.github.io/blog/](https://cyrus-studio.github.io/blog/)

## 利用 SIGTRAP 检测调试器

在 Linux 的进程管理中， **信号（Signal）** 是调试器与被调试进程沟通的核心机制。断点、单步执行、进程暂停与恢复等操作，背后都依赖于特定信号的传递。

其中， **SIGTRAP** （陷阱信号）尤为特殊。通常它由调试器在调试过程中触发，例如执行断点指令或单步运行时都会引发 SIGTRAP。

如果一个程序主动触发 SIGTRAP，并设置了对应的信号处理函数，就能实现一种“自检”：

-   若信号处理函数被成功调用，说明 SIGTRAP 没有被调试器截获，此时可以推断程序处于 **非调试状态**；
    
-   若信号处理函数未被调用，反而被调试器捕获并消费，则意味着程序正被调试。
    

由此，利用 SIGTRAP 信号进行 **反调试检测**，就成为 Android 应用中一种更隐蔽、更底层的安全防护手段。

## 常见 Linux 信号列表（基于 signal.h）

| 编号  | 名称  | 说明  |
| --- | --- | --- |
| 1   | SIGHUP | 挂起信号，通常在控制终端关闭时发送给进程 |
| 2   | SIGINT | 中断信号，通常由 Ctrl+C 触发 |
| 3   | SIGQUIT | 退出信号，通常由 Ctrl+\\ 触发，并生成 core dump |
| 4   | SIGILL | 非法指令（非法 CPU 指令执行） |
| 5   | SIGTRAP | 陷阱信号，主要用于调试（断点、单步） |
| 6   | SIGABRT | 异常终止，通常由 abort() 触发 |
| 7   | SIGBUS | 总线错误（非法内存访问，例如未对齐访问） |
| 8   | SIGFPE | 浮点异常（除零、溢出等算术错误） |
| 9   | SIGKILL | 强制终止信号，无法被捕获或忽略 |
| 11  | SIGSEGV | 无效内存访问（段错误） |
| 13  | SIGPIPE | 向无读端的管道写数据时触发 |
| 14  | SIGALRM | 定时器超时，由 alarm() 触发 |
| 15  | SIGTERM | 终止信号，可被捕获和处理 |
| 17  | SIGCHLD | 子进程状态发生变化时通知父进程 |
| 18  | SIGCONT | 继续执行（与 SIGSTOP 配合使用） |
| 19  | SIGSTOP | 停止进程，无法被捕获或忽略 |
| 20  | SIGTSTP | 终端暂停信号，通常由 Ctrl+Z 触发 |
| 21  | SIGTTIN | 后台进程尝试从终端读输入时触发 |
| 22  | SIGTTOU | 后台进程尝试往终端写输出时触发 |
| 23  | SIGURG | socket 上的紧急数据到达 |
| 24  | SIGXCPU | 超过 CPU 时间限制 |
| 25  | SIGXFSZ | 文件大小超过限制 |
| 26  | SIGVTALRM | 虚拟时钟超时 |
| 27  | SIGPROF | profiling 定时器超时 |
| 28  | SIGWINCH | 窗口大小发生变化（终端调整大小） |
| 29  | SIGIO / SIGPOLL | 异步 I/O 事件 |
| 30  | SIGPWR | 电源故障 |
| 31  | SIGSYS | 非法系统调用 |

此外，Linux 还支持 **实时信号（Real-Time Signals）**，编号从 **32 开始**，具体上限依赖于系统实现（通常是 SIGRTMIN 到 SIGRTMAX），通常是用于用户自定义的信号，应用程序可根据需要使用这些信号。

## Android 下利用 SIGTRAP 反调试流程

在 Android 环境中，利用 **SIGTRAP** 进行反调试的核心思路是：让程序主动触发 SIGTRAP，并观察信号是否能够进入我们自己定义的处理器。如果信号能被捕获，说明程序运行正常；如果信号被调试器拦截，则说明进程正处于被调试状态。

Android 下利用 SIGTRAP + 自定义 Handler 的反调试流程：

```
                ┌─────────────────────────────┐
                │   App 进程启动 (目标进程)   │
                └──────────────┬──────────────┘
                               │
                               ▼
                   ┌──────────────────────────┐
                   │ 注册 SIGTRAP Handler     │
                   │ sigaction(SIGTRAP, ...)  │
                   └───────────┬─────────────┘
                               │
                               ▼
                   ┌────────────────────┐
                   │ 调用 raise(SIGTRAP)│
                   └───────────┬────────┘
                               │
               ┌───────────────┼─────────────────┐
               │                                 │
   ┌───────────▼────────────┐        ┌───────────▼────────────┐
   │ 无调试器存在            │        │ 有调试器附加           │
   │ ──────────────          │        │ ──────────────         │
   │ 信号交由自定义 handler  │        │ 调试器捕获 SIGTRAP     │
   │ handler 正常执行        │        │ handler 未被调用       │
   └───────────┬────────────┘        └───────────┬────────────┘
               │                                 │
               ▼                                 ▼
       [App 判定未被调试]                [App 判定被调试]
               │                                 │
               ▼                                 ▼
 ┌───────────────────────────┐     ┌───────────────────────────┐
 │   正常运行 (继续业务逻辑) │     │ 采取对抗动作：             │
 │                           │     │  - exit() / 延时退出       │
 │                           │     │  - 触发异常崩溃           │
 │                           │     │  - 执行混淆/假逻辑        │
 └───────────────────────────┘     └───────────────────────────┘
```

## Android 下利用 SIGTRAP 反调试实现

## 1\. 定义信号处理器并检测调试器

首先，我们在 C 代码中编写反调试逻辑，核心是通过 raise(SIGTRAP) 触发 SIGTRAP 信号，并判断信号是否被捕获。

```cpp
#include <jni.h>
#include <signal.h>
#include <stdlib.h>
#include <unistd.h>
#include <android/log.h>

#define LOG_TAG "AntiDebug"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)

// 标志变量，判断 SIGTRAP 是否被捕获
volatile int sigtrap_caught = 0;

// SIGTRAP 信号处理函数
void sigtrap_handler(int sig) {
    LOGI("Caught SIGTRAP. No debugger present.");
    sigtrap_caught = 1; // 标记 SIGTRAP 被捕获
}

// JNI 方法，触发 SIGTRAP 信号并检测调试器
JNIEXPORT jboolean JNICALL
Java_com_cyrus_example_antidebug_AntiDebug_detectDebugger(JNIEnv *env, jobject instance) {
    // 注册 SIGTRAP 处理器
    signal(SIGTRAP, sigtrap_handler);

    // 触发 SIGTRAP 信号
    raise(SIGTRAP);

    // 检查信号是否被捕获
    if (sigtrap_caught) {
        LOGI("No debugger detected.");
        return JNI_FALSE; // 没有检测到调试器
    } else {
        // 如果信号未被捕获，说明有调试器
        LOGI("Debugger detected! The program will exit in 3 seconds...");
        sleep(3); // 等待 3 秒
        exit(EXIT_FAILURE); // 退出程序
        return JNI_TRUE; // 返回 true，表示检测到调试器
    }
}
```

配置 CMakeLists.txt 文件

```r
cmake_minimum_required(VERSION 3.4.1)



find_library( # 查找 log 库
              log-lib

              # 库名
              log )

add_library( # 库名称
             antidebug

             # 库类型
             SHARED

             # 源文件
             anti_debug.c )

target_link_libraries( # 绑定库到 log 库
                       antidebug
                       ${log-lib} )
```

## 2\. Kotlin 层调用 JNI 方法

在 Kotlin 层，我们通过 JNI 调用 detectDebugger 函数，以检测是否存在调试器。根据结果，程序可以作出不同的响应。

```kotlin
package com.cyrus.example.antidebug

import android.util.Log

object AntiDebug {

    init {
        // 加载 native 库
        System.loadLibrary("antidebug")
    }

    external fun detectDebugger(): Boolean

    fun isDebuggerDetected(): Boolean {
        val detected = detectDebugger()
        if (detected) {
            Log.i("AntiDebug", "Debugger detected!")
        } else {
            Log.i("AntiDebug", "No debugger detected.")
        }
        return detected
    }
}
```

## 3\. 调用反调试功能

```kotlin
val debuggerDetected = AntiDebug.isDebuggerDetected()
if (debuggerDetected) {
    Toast.makeText(this, "Debugger Detected", Toast.LENGTH_SHORT).show()
} else {
    Toast.makeText(this, "No Debugger Detected", Toast.LENGTH_SHORT).show()
}
```

## 测试反调试

## 1\. 无调试状态

无调式状态 App 中点击 “SIGTRAP 反调试” 按钮调用反调试功能，未检测到调试器，程序正常运行。

[![word/media/image1.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/468e39813eea688a.png)](data:image/png;base64,inline-60978B)

## 2\. 调试状态下

通过 IDA Pro 附加到当前应用

[![word/media/image2.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/e9245f6a5be51818.png)](data:image/png;base64,inline-85730B)

相关文章： [静态分析根本不够！IDA Pro 动态调试 Android 应用的完整实战](https://cyrus-studio.github.io/blog/posts/%E9%9D%99%E6%80%81%E5%88%86%E6%9E%90%E6%A0%B9%E6%9C%AC%E4%B8%8D%E5%A4%9Fida-pro-%E5%8A%A8%E6%80%81%E8%B0%83%E8%AF%95-android-%E5%BA%94%E7%94%A8%E7%9A%84%E5%AE%8C%E6%95%B4%E5%AE%9E%E6%88%98/)

App 中点击 “SIGTRAP 反调试” 按钮调用反调试功能，SIGTRAP 信号 被 IDA Pro 调试器捕获。

[![word/media/image3.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/db5bd77fcefc97f0.png)](data:image/png;base64,inline-113694B)

触发程序反调试机制，程序在 3 秒后退出。

[![word/media/image4.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/91f6e6236ee2ff28.png)](data:image/png;base64,inline-245622B)

## 完整源码

开源地址： [https://github.com/CYRUS-STUDIO/AndroidExample](https://github.com/CYRUS-STUDIO/AndroidExample)
