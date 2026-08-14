---
title: 【GitHub】LSPlant/README.md at master
source: https://github.com/LSPosed/LSPlant/blob/master/README.md
source_host: github.com
clip_date: 2026-08-14T17:25:13+08:00
trace_id: 05c64ba5-3ce5-4886-9f0c-658c56b15a48
content_hash: 51071adb971c1daea11d3d6ba7c42093d52a7ee2c39b73a4e18ba377e628f210
status: synced
tags:
  - GitHub
  - Android逆向
  - Hook
series: null
feed_source: null
ai_summary: LSPlant 是 Android ART Hook 库，提供 Java 方法 hook/unhook 与内联反优化，支持 Android 5.0 至 17 及多架构。
ai_summary_style: key-points
images_status:
  total: 5
  succeeded: 5
  failed_urls: []
notion_page_id: 3bc75244-d011-811c-9cb9-c41d3d58a663
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> LSPlant 是 Android ART Hook 库，提供 Java 方法 hook/unhook 与内联反优化，支持 Android 5.0 至 17 及多架构。
> 
> - **核心定位：** LSPlant 是 LSPosed 框架的一部分，采用 LGPL-3.0 许可，提供 Java 方法 hook/unhook 与内联反优化能力。
> - **兼容范围：** 支持 Android 5.0 到 17（API 21-37），架构覆盖 armeabi-v7a、arm64-v8a、x86、x86-64、riscv64。
> - **快速接入：** 通过 Maven Central 引入依赖，构建需开启 prefab；可选 lsplant-standalone 以避免打包 libc++_shared.so。
> - **Hook 流程：** 需在 JNI_OnLoad 中初始化，回调方法签名固定为 `public Object callback_method(Object[] args)`；Hook 返回 backup method，UnHook 后调用 backup 是未定义行为。
> - **反优化场景：** 当被 hook 的短方法被调用者内联时，可对调用者执行 Deoptimize 强制回退，但需确保覆盖全部调用者；对已 hook 方法执行 Deoptimize 是安全的。

## LSPlant

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/b9b9c300fa530cc3.svg)](https://camo.githubusercontent.com/9637063be6f511379d2940d577f6dd098412bf5037766fa0df97399c5f5eea4a/68747470733a2f2f696d672e736869656c64732e696f2f62616467652f6c6963656e73652d4c47504c2d2d332e302d6f72616e67652e737667) [![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/b28d696c61653634.svg)](https://camo.githubusercontent.com/ed262740b8d54b1fa10ae42de482424f9e4a63ac1b97fd0e98fae12f9551b888/68747470733a2f2f696d672e736869656c64732e696f2f62616467652f416e64726f69642d352e302532302d2d25323031372d626c75652e737667) [![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/956decd95acd1a13.svg)](https://camo.githubusercontent.com/3aeaa10b28420754144fb3fa0ab973dc2101570fc7becdb06fd1a27a2e9d218c/68747470733a2f2f696d672e736869656c64732e696f2f62616467652f617263682d61726d656162692d2d76376125323025374325323061726d36342d2d7638612532302537432532307838362532302537432532307838362d2d3634253230253743253230726973637636342d627269676874677265656e2e737667) [![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/3b39c55110f11a97.svg)](https://github.com/LSPosed/LSPlant/actions/workflows/build.yml/badge.svg?branch=master&event=push) [![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/b367bf3a58321e62.svg)](https://camo.githubusercontent.com/a2cb84b3bb9ed2109319abc20fab68f5f5ed0796495a1a73c0ae01d5455fd1fc/68747470733a2f2f696d672e736869656c64732e696f2f6d6176656e2d63656e7472616c2f762f6f72672e6c73706f7365642e6c73706c616e742f6c73706c616e742e737667)

LSPlant is an Android ART hook library, providing Java method hook/unhook and inline deoptimization.

This project is part of LSPosed framework under GNU Lesser General Public License.

## Features

-   Support Android 5.0 - 17 (API level 21 - 37)
-   Support armeabi-v7a, arm64-v8a, x86, x86-64, riscv64
-   Support customized inline hook framework and ART symbol resolver

## Documentation

[https://lsposed.org/LSPlant/namespacelsplant.html](https://lsposed.org/LSPlant/namespacelsplant.html)

## Quick Start

```
repositories {
    mavenCentral()
}

android {
    buildFeatures {
        prefab true
    }
}

dependencies {
    implementation "org.lsposed.lsplant:lsplant:+"
}
```

If you don't want to include `libc++_shared.so` in your APK, you can use `lsplant-standalone` instead:

```
dependencies {
    implementation "org.lsposed.lsplant:lsplant-standalone:+"
}
```

### 1\. Init LSPlant within JNI_OnLoad

Initialize LSPlant for the proceeding hook. It mainly prefetch needed symbols and hook some functions.

-   `env` is the Java environment.
    
-   `info` is the information for initialized.
    
    Basically, the info provides the inline hooker and unhooker together with a symbol resolver of `libart.so` to hook and extract needed native functions of ART.
    

```
bool Init(JNIEnv *env,
          const InitInfo &info);
```

Returns whether initialization succeed. Behavior is undefined if calling other LSPlant interfaces before initialization or after a fail initialization.

### 2\. Hook

Hook a Java method by providing the `target_method` together with the context object `hooker_object` and its callback `callback_method`.

-   `env` is the Java environment.
    
-   `target_method` is an `Method` object to the method you want to hook.
    
-   `hooker_object` is an object to store the context of the hook.
    
    The most likely usage is to store the backup method into it so that when `callback_method` is invoked, it can call the original method. Another scenario is that, for example, in Xposed framework, multiple modules can hook the same Java method and the `hooker_object` can be used to store all the callbacks to allow multiple modules work simultaneously without conflict.
    
-   `callback_method` is an `Method` object, the callback method to the `hooker_object` used to replace the `target_method`.
    
    Whenever the `target_method` is invoked, the callback_method will be invoked instead of the original `target_method`. The signature of the `callback_method` must be: `public Object callback_method(Object []args)`.
    
    That is, the return type must be `Object` and the parameter type must be `Object[]`. Behavior is undefined if the signature does not match the requirement. Extra info can be provided by defining member variables of `hooker_object`. This method must be a method to `hooker_object`.
    

```
jobject Hook(JNIEnv *env,
             jobject target_method,
             jobject hooker_object,
             jobject callback_method);
```

Returns the backup method. You can invoke it by reflection to invoke the original method. null if fails.

This function will automatically generate a stub class for hook. To help debug, you can set the generated class name, its field name, its source name and its method name by setting `generated_*` in `InitInfo`.

This function thread safe (you can call it simultaneously from multiple thread) but it's not atomic to the same `target_method`. That means `UnHook` or `IsUnhook` does not guarantee to work properly on the same `target_method` before it returns. Also, simultaneously call on this function with the same target_method does not guarantee only one will success. If you call this with different `hooker_object` on the same `target_method` simultaneously, the behavior is undefined.

### 3\. Check

Check if a Java function is hooked by LSPlant or not.

```
bool IsHooked(JNIEnv *env,
              jobject method);
```

Returns whether the method is hooked.

### 4\. Unhook

Unhook a Java function that is previously hooked.

-   `env` is the Java environment.
    
-   `target_method` is an `Method` object to the method you want to hook.
    

```
bool UnHook(JNIEnv *env,
            jobject target_method);
```

Returns whether the unhook succeed.

Calling backup (the return method of `Hook()`) after unhooking is undefined behavior. Please read `Hook()` 's note for more details.

### 5\. Deoptimize

Deoptimize a method to avoid hooked callee not being called because of inline.

-   `env` is the Java environment.
    
-   `method` is an `Method` object to the method to deoptimize.
    
    By deoptimizing the method, the method will back all callee without inlining. For example, if you hooked a short method B that is invoked by method A, and you find that your callback to B is not invoked after hooking, then it may mean A has inlined B inside its method body. To force A to call your hooked B, you can deoptimize A and then your hook can take effect. Generally, you need to find all the callers of your hooked callee and that can be hardly achieve. Use this function if you are sure the deoptimized callers are all you need. Otherwise, it would be better to change the hook point or to deoptimize the whole app manually (by simple reinstall the app without uninstalled).
    

```
bool Deoptimize(JNIEnv *env,
                jobject method);
```

Returns whether the deoptimizing succeed or not.

It is safe to call deoptimizing on a hooked method because the deoptimization will perform on the backup method instead.

## Credits

Inspired by the following frameworks:

-   [YAHFA](https://github.com/PAGalaxyLab/YAHFA)
-   [SandHook](https://github.com/asLody/SandHook)
-   [Pine](https://github.com/canyie/pine)
-   [Epic](https://github.com/tiann/epic)
