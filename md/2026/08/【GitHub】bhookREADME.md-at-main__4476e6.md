---
title: 【GitHub】bhook/README.md at main
source: https://github.com/bytedance/bhook/blob/main/README.md
source_host: github.com
clip_date: 2026-08-14T17:24:46+08:00
trace_id: 3f753aeb-68c3-4d77-926d-73364703d02c
content_hash: a96e6f18c18ba28105cbf5f94ae61823a72d6857ad32753068e013f4b428d881
status: synced
tags:
  - GitHub
  - Android逆向
  - Hook
series: null
feed_source: null
ai_summary: ByteHook 是字节跳动开源的 Android PLT Hook 库，主打生产环境稳定、API/ABI 向后兼容和低性能开销，支持 Android 4.1–17 与四类主流 ABI。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 3bc75244-d011-816c-98a7-d01ff38a1852
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> ByteHook 是字节跳动开源的 Android PLT Hook 库，主打生产环境稳定、API/ABI 向后兼容和低性能开销，支持 Android 4.1–17 与四类主流 ABI。
> 
> - **兼容范围：** 支持 Android 4.1–17（API 16–37），覆盖 armeabi-v7a、arm64-v8a、x86、x86_64。
> - **功能特性：** 同一函数可多次 hook/unhook 且互不冲突；可挂钩单个、部分或全部动态库，并能自动挂钩新加载的库；代理函数之间自动避免递归与循环调用。
> - **接入方式：** 通过 Maven Central 发布，依赖使用 Prefab 格式；Android Gradle Plugin 低于 7.1.0 时需在 gradle.properties 中配置 `android.prefabVersion=2.0.0`。
> - **核心 API：** 提供 `bytehook_hook_single`、`bytehook_hook_partial`、`bytehook_hook_all` 三个 hook 入口，用 `bytehook_unhook` 卸载；代理函数中调用原函数需使用 `BYTEHOOK_CALL_PREV()`，函数返回前需调用 `BYTEHOOK_POP_STACK()` 或使用 `BYTEHOOK_STACK_SCOPE()`。
> - **打包建议：** SDK 项目应在 packagingOptions 中 `exclude '**/libbytehook.so'` 避免重复打包；App 项目可用 `pickFirst '**/libbytehook.so'` 处理冲突；x86/x86_64 架构使用 prefab 依赖时需额外 apply `prefab_bypass.gradle`。

## ByteHook

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/c857a2ee625c7f66.svg)](https://camo.githubusercontent.com/f251623e510f5909f16ae3f4e6e548dac11340b9fde1a99be26b015b39272c00/68747470733a2f2f696d672e736869656c64732e696f2f62616467652f6c6963656e73652d4d49542d627269676874677265656e2e7376673f7374796c653d666c6174) [![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/2c647137461145b3.svg)](https://camo.githubusercontent.com/cc141b232d38b2721e969d365d46a93491706673597e67ba846ec7e75d8289e4/68747470733a2f2f696d672e736869656c64732e696f2f62616467652f72656c656173652d312e312e322d7265642e7376673f7374796c653d666c6174) [![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/9f76e7d8ee37a22d.svg)](https://camo.githubusercontent.com/586e639316d67fee1f723d3ba921c4dba7ff35ab17429aa9ab4782ab0705bc44/68747470733a2f2f696d672e736869656c64732e696f2f62616467652f416e64726f69642d342e312532302d2d25323031372d626c75652e7376673f7374796c653d666c6174) [![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/5599b25d2d08e0f0.svg)](https://camo.githubusercontent.com/a7b7670dd118bbc718970ce6b8639c1bd35ec8f196aa4278debdc1c870712ebd/68747470733a2f2f696d672e736869656c64732e696f2f62616467652f617263682d61726d656162692d2d76376125323025374325323061726d36342d2d7638612532302537432532307838362532302537432532307838365f5f36342d626c75652e7376673f7374796c653d666c6174)

[简体中文](https://github.com/bytedance/bhook/blob/main/README.zh-CN.md)

**ByteHook is an Android PLT hook library.** Its goals are:

-   **Stability** - Can be stably used in production apps.
-   **Compatibility** - Always maintains backward compatibility of API and ABI in new versions.
-   **Performance** - Continuously reduces API call overhead and additional runtime overhead introduced by hooks.

> If you need an Android inline hook library, try [shadowhook](https://github.com/bytedance/android-inline-hook).

## Android OS Compatibility

**Android `4.1` - `17 QPR1 Beta 4`**

> We will test and support the latest Android OS Beta versions as promptly as possible, and list the supported Android OS versions here.

## Features

-   Support Android 4.1 - 17 (API level 16 - 37).
-   Support armeabi-v7a, arm64-v8a, x86 and x86_64.
-   Multiple hooks and unhooks for the same function do not conflict with each other.
-   Hook a single, partial or all of the dynamic libraries in the process.
-   Hook the newly loaded dynamic libraries automatically.
-   Avoid recursive-calls and circular-calls between proxy functions automatically.
-   Support unwinding backtrace in proxy function.
-   MIT licensed.

## Documentation

[ByteHook Documentation](https://github.com/bytedance/bhook/blob/main/doc#readme)

## Quick Start

There is a sample app in the [bytehook-sample](https://github.com/bytedance/bhook/blob/main/bytehook_sample) you can refer to.

### 1\. Add dependency in build.gradle

ByteHook is published on [Maven Central](https://search.maven.org/), and uses [Prefab](https://google.github.io/prefab/) package format for [native dependencies](https://developer.android.com/studio/build/native-dependencies), which is supported by [Android Gradle Plugin 4.0+](https://developer.android.com/studio/releases/gradle-plugin?buildsystem=cmake#native-dependencies).

```
android {
    buildFeatures {
        prefab true
    }
}

dependencies {
    implementation 'com.bytedance:bytehook:x.y.z'
}
```

Replace `x.y.z` with the version number. It's recommended to use the latest [release](https://github.com/bytedance/bhook/releases) version.

**Note**: ByteHook uses the [prefab package schema v2](https://github.com/google/prefab/releases/tag/v2.0.0), which is configured by default since [Android Gradle Plugin 7.1.0](https://developer.android.com/studio/releases/gradle-plugin?buildsystem=cmake#7-1-0). If you are using Android Gradle Plugin earlier than 7.1.0, please add the following configuration to `gradle.properties`:

```
android.prefabVersion=2.0.0
```

### 2\. Add dependency in CMakeLists.txt or Android.mk

> CMakeLists.txt

```
find_package(bytehook REQUIRED CONFIG)

add_library(mylib SHARED mylib.c)
target_link_libraries(mylib bytehook::bytehook)
```

> Android.mk

```ruby
include $(CLEAR_VARS)
LOCAL_MODULE           := mylib
LOCAL_SRC_FILES        := mylib.c
LOCAL_SHARED_LIBRARIES += bytehook
include $(BUILD_SHARED_LIBRARY)

$(call import-module,prefab/bytehook)
```

### 3\. Specify one or more ABI(s) you need

```
android {
    defaultConfig {
        ndk {
            abiFilters 'armeabi-v7a', 'arm64-v8a', 'x86', 'x86_64'
        }
    }
}
```

### 4\. Add packaging options

If you are using ByteHook in an SDK project, you may need to avoid packaging libbytehook.so into your AAR, so as not to encounter duplicate libbytehook.so file when packaging the app project.

```
android {
    packagingOptions {
        exclude '**/libbytehook.so'
    }
}
```

On the other hand, if you are using ByteHook in an APP project, you may need to add some options to deal with conflicts caused by duplicate libbytehook.so file.

```
android {
    packagingOptions {
        pickFirst '**/libbytehook.so'
    }
}
```

Note: If you use prefab dependency bytehook under x86 and x86_64 architectures, you need to add [prefab_bypass.gradle](https://github.com/bytedance/bhook/blob/main/gradle/prefab_bypass.gradle) to the module's build.gradle.

```
apply from: rootProject.file('gradle/prefab_bypass.gradle')
```

### 5\. Initialize

```java
import com.bytedance.android.bytehook.ByteHook;

public class MySdk {
    public static synchronized void init() {
        ByteHook.init();
    }
}
```

### 6\. Hook and Unhook

```
#include "bytehook.h"
```

```cpp
bytehook_stub_t bytehook_hook_single(
    const char *caller_path_name,
    const char *callee_path_name,
    const char *sym_name,
    void *new_func,
    bytehook_hooked_t hooked,
    void *hooked_arg);

bytehook_stub_t bytehook_hook_partial(
    bytehook_caller_allow_filter_t caller_allow_filter,
    void *caller_allow_filter_arg,
    const char *callee_path_name,
    const char *sym_name,
    void *new_func,
    bytehook_hooked_t hooked,
    void *hooked_arg);

bytehook_stub_t bytehook_hook_all(
    const char *callee_path_name,
    const char *sym_name,
    void *new_func,
    bytehook_hooked_t hooked,
    void *hooked_arg);

int bytehook_unhook(bytehook_stub_t stub);
```

These three hook functions are used to hook single, partial, and all caller dynamic libraries in the process.

Notice:

-   If you need to call the original function in the proxy function, please always use the `BYTEHOOK_CALL_PREV()` macro.
-   Make sure to call `BYTEHOOK_POP_STACK()` macro before proxy function returning. In the CPP source file, you can also call `BYTEHOOK_STACK_SCOPE()` macro at the beginning of the proxy function instead.

## Contributing

-   [Code of Conduct](https://github.com/bytedance/bhook/blob/main/CODE_OF_CONDUCT.md)
-   [Contributing Guide](https://github.com/bytedance/bhook/blob/main/CONTRIBUTING.md)
-   [Reporting Security vulnerabilities](https://github.com/bytedance/bhook/blob/main/SECURITY.md)

## License

ByteHook is licensed under the [MIT License](https://github.com/bytedance/bhook/blob/main/LICENSE).

ByteHook uses the following third-party source code or libraries:

-   [queue.h](https://github.com/bytedance/bhook/blob/main/bytehook/src/main/cpp/third_party/bsd/queue.h)  
    BSD 3-Clause License  
    Copyright (c) 1991, 1993 The Regents of the University of California.
-   [linux-syscall-support](https://chromium.googlesource.com/linux-syscall-support/)  
    BSD 3-Clause License  
    Copyright (c) 2005-2011 Google Inc.
