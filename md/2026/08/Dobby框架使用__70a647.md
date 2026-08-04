---
title: Dobby框架使用
source: https://yuuki.cool/posts/dobby/
source_host: yuuki.cool
clip_date: 2026-08-04T11:24:49+08:00
trace_id: d6016934-c831-4c25-9807-29265628ff69
content_hash: e601d6f434ac9fdafabd38105f19f7a70254e5df7cae3dc14829911da774c9e9
status: synced
tags:
  - Android逆向
  - Hook
series: null
feed_source: Yuuki·移动安全
ai_summary: 通过静态库将 Dobby 集成到 Android 原生项目，使用 `DobbyHook` 实现函数 inline hook，需注意内存权限与符号解析局限。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3b275244-d011-815e-8aac-f72b146702c3
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 通过静态库将 Dobby 集成到 Android 原生项目，使用 `DobbyHook` 实现函数 inline hook，需注意内存权限与符号解析局限。
> 
> - **编译与集成：** 克隆老版本源码，执行 `scripts/setup_linux_cross_compile.sh` 下载工具链，再用 `platform_builder.py` 编译出各架构的静态库（.a）；在 Android Studio 中配置 CMake 链接 `libdobby.a` 并导入 `dobby.h` 即可使用。
> - **核心 API：** `DobbyHook` 完成函数替换，接收原始地址、替换函数指针和保存原函数的指针；`DobbyInstrument` 可做指令插桩回调；`DobbyDestroy` 用于移除钩子；`DobbyImportTableReplace` 用于替换导入表项。
> - **内存权限前置：** 调用 `DobbyHook` 前通常需要修改目标内存页权限（如 `mprotect`），否则部分版本可能出现无限递归调用。
> - **符号解析限制：** `DobbySymbolResolver` 只能查找导出符号，实际开发中常配合 `elf_utils` 等工具定位非导出符号。
> - **模块拆分实践：** 为避免影响自身，常将 hook 逻辑封装进独立 .so，与 JNI 接口所在的 .so 分离加载。

## 0x01环境配置：

#### 环境：wsl2

#### 工具：无需额外自己安装

首先把Dobby整个项目克隆下来，但是原项目直接编译会爆缺少Cpu.h，我这里用的是老版本的，亲测没问题

正常流程：

1.下载源码

```bash
cd workspace
git clone https://github.com/jmpews/Dobby.git //我下的最新版没法直接编译，原因刚刚说了
```

2.编译

我这里是要在安卓中使用。参考 [compile.md](https://github.com/jmpews/Dobby/blob/master/docs/compile.md)

```bash
# prepare and download cmake/llvm/ndk
sh scripts/setup_linux_cross_compile.sh
python3 scripts/platform_builder.py --platform=android --arch=all --cmake_dir=$HOME/opt/cmake-3.25.2 --llvm_dir=$HOME/opt/llvm-15.0.6 --android_ndk_dir=$HOME/opt/ndk-r25b
```

执行第一个脚本之后它会自动下载特定版本的工具链，然后执行py脚本进行编译。编译的文件在`./workspace/Dobby/build` 下，包含各个架构的`.a` 和`.so` 文件

这里我们需要用到静态库(.a文件)，和我们的so一起链接。

在Android Studio里新建native app项目，在 `/app/src/main/cpp/` 下创建 **Dobby** 文件夹，当然叫啥都随你，我习惯这样啊，接着把刚刚编译生成的各个架构的.a文件复制进去，接着改一下cmake就行了

```bash
cmake_minimum_required(VERSION 3.22.1)

project("fakelocation")

# 添加头文件路径（dobby.h 所在目录）
include_directories(${CMAKE_CURRENT_SOURCE_DIR})

# 指定 libdobby.a 静态库路径
set(LIBDOBBY_PATH ${CMAKE_CURRENT_SOURCE_DIR}/Dobby/${CMAKE_ANDROID_ARCH_ABI}/libdobby.a)

# 添加共享库目标
add_library(${CMAKE_PROJECT_NAME} SHARED
        yuuki.cpp)

# 链接库：libdobby.a、android、log
target_link_libraries(${CMAKE_PROJECT_NAME}
        ${LIBDOBBY_PATH}
        android
        log)
```

然后需要把dobby项目里的 `dobby.h` 拷贝到自己的项目里，到这就差不多了，可以跑一个简单的demo试试看

```cpp
#include <jni.h>
#include <android/log.h>
#include <dlfcn.h>
#include <stdio.h>
#include "dobby.h"

#define LOG_TAG "FakeLocation"
#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

// 原始函数：返回固定值
int get_number() {
    LOGD("Original get_number called");
    return 42;
}

// Hook 替换函数
int hooked_get_number() {
    LOGD("Hooked get_number called");
    return 100;
}

// JNI 接口：测试 Hook
extern "C" JNIEXPORT jstring JNICALL
Java_com_yuuki_fakelocation_MainActivity_stringFromJNI(JNIEnv* env, jobject /* this */) {
    LOGD("Entering stringFromJNI");

    // 调用原始函数
    int original_result = get_number();
    LOGD("Original get_number result: %d", original_result);

    // 检查 Dobby 符号是否可用
    void* dobby_hook = dlsym(RTLD_DEFAULT, "DobbyHook");
    if (!dobby_hook) {
        LOGE("Failed to find DobbyHook symbol");
        return env->NewStringUTF("DobbyHook symbol not found");
    }
    LOGD("DobbyHook symbol found at %p", dobby_hook);

    // 执行 Hook
    void* orig_func = (void*)get_number;
    void* hook_func = (void*)hooked_get_number;
    LOGD("Attempting to hook get_number at %p with %p", orig_func, hook_func);
    int result = DobbyHook(orig_func, hook_func, nullptr);
    if (result == 0) {
        LOGD("DobbyHook succeeded");
    } else {
        LOGE("DobbyHook failed with code: %d", result);
        char error_msg[128];
        snprintf(error_msg, sizeof(error_msg), "Hook failed: %d", result);
        return env->NewStringUTF(error_msg);
    }

    // 调用 Hook 后的函数
    int hooked_result = get_number();
    LOGD("Hooked get_number result: %d", hooked_result);

    // 返回结果
    char buffer[128];
    snprintf(buffer, sizeof(buffer), "Original: %d, Hooked: %d", original_result, hooked_result);
    LOGD("Returning: %s", buffer);
    return env->NewStringUTF(buffer);
}
```

```java
package com.yuuki.fakelocation;

import android.app.Activity;
import android.os.Bundle;
import android.view.View;
import android.widget.TextView;

import com.yuuki.fakelocation.utils.Miscellaneous;

public class MainActivity extends Activity {

    static {
        System.loadLibrary("fakelocation");
    }


    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Miscellaneous.setImmersiveStatusBar(this);
        setContentView(R.layout.activity_main);
        View rootView = findViewById(R.id.main);
        Miscellaneous.setViewTopPadding(rootView, this);

        TextView tv = findViewById(R.id.sample_text);
        tv.setText(stringFromJNI());
    }

    public native String stringFromJNI();

}
```

可以看看是否输出了预期的结果

但是通常我们写xposed模块不会这么写，因为这样你的hook是会影响自身的，所以我喜欢把hook的逻辑和自己jni的逻辑分别打包成两个so

## 0x02API介绍：

其实能用的Api都在dobby.h里写好了，我们来看看这个头文件里写了啥吧

```cpp
#ifndef dobby_h
#define dobby_h

#ifdef __cplusplus
extern "C" {
#endif

#include <stdbool.h>
#include <stdint.h>

typedef uintptr_t addr_t;
typedef uint32_t addr32_t;
typedef uint64_t addr64_t;

typedef void *dobby_dummy_func_t;
typedef void *asm_func_t;

#if defined(__arm__)
typedef struct {
  uint32_t dummy_0;
  uint32_t dummy_1;

  uint32_t dummy_2;
  uint32_t sp;

  union {
    uint32_t r[13];
    struct {
      uint32_t r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12;
    } regs;
  } general;

  uint32_t lr;
} DobbyRegisterContext;
#elif defined(__arm64__) || defined(__aarch64__)
#define ARM64_TMP_REG_NDX_0 17

typedef union _FPReg {
  __int128_t q;
  struct {
    double d1;
    double d2;
  } d;
  struct {
    float f1;
    float f2;
    float f3;
    float f4;
  } f;
} FPReg;

// register context
typedef struct {
  uint64_t dmmpy_0; // dummy placeholder
  uint64_t sp;

  uint64_t dmmpy_1; // dummy placeholder
  union {
    uint64_t x[29];
    struct {
      uint64_t x0, x1, x2, x3, x4, x5, x6, x7, x8, x9, x10, x11, x12, x13, x14, x15, x16, x17, x18, x19, x20, x21, x22,
          x23, x24, x25, x26, x27, x28;
    } regs;
  } general;

  uint64_t fp;
  uint64_t lr;

  union {
    FPReg q[32];
    struct {
      FPReg q0, q1, q2, q3, q4, q5, q6, q7;
      // [!!! READ ME !!!]
      // for Arm64, can't access q8 - q31, unless you enable full floating-point register pack
      FPReg q8, q9, q10, q11, q12, q13, q14, q15, q16, q17, q18, q19, q20, q21, q22, q23, q24, q25, q26, q27, q28, q29,
          q30, q31;
    } regs;
  } floating;
} DobbyRegisterContext;
#elif defined(_M_IX86) || defined(__i386__)
typedef struct _RegisterContext {
  uint32_t dummy_0;
  uint32_t esp;

  uint32_t dummy_1;
  uint32_t flags;

  union {
    struct {
      uint32_t eax, ebx, ecx, edx, ebp, esp, edi, esi;
    } regs;
  } general;

} DobbyRegisterContext;
#elif defined(_M_X64) || defined(__x86_64__)
typedef struct {
  uint64_t dummy_0;
  uint64_t rsp;

  union {
    struct {
      uint64_t rax, rbx, rcx, rdx, rbp, rsp, rdi, rsi, r8, r9, r10, r11, r12, r13, r14, r15;
    } regs;
  } general;

  uint64_t dummy_1;
  uint64_t flags;
} DobbyRegisterContext;
#endif

#define install_hook_name(name, fn_ret_t, fn_args_t...)                                                                \
  static fn_ret_t fake_##name(fn_args_t);                                                                              \
  static fn_ret_t (*orig_##name)(fn_args_t);                                                                           \
  /* __attribute__((constructor)) */ static void install_hook_##name(void *sym_addr) {                                 \
    DobbyHook(sym_addr, (dobby_dummy_func_t)fake_##name, (dobby_dummy_func_t *)&orig_##name);                          \
    return;                                                                                                            \
  }                                                                                                                    \
  fn_ret_t fake_##name(fn_args_t)

// memory code patch
int DobbyCodePatch(void *address, uint8_t *buffer, uint32_t buffer_size);

// function inline hook
int DobbyHook(void *address, dobby_dummy_func_t replace_func, dobby_dummy_func_t *origin_func);

// dynamic binary instruction instrument
// for Arm64, can't access q8 - q31, unless enable full floating-point register pack
typedef void (*dobby_instrument_callback_t)(void *address, DobbyRegisterContext *ctx);
int DobbyInstrument(void *address, dobby_instrument_callback_t pre_handler);

// destroy and restore code patch
int DobbyDestroy(void *address);

const char *DobbyGetVersion();

// symbol resolver
void *DobbySymbolResolver(const char *image_name, const char *symbol_name);

// import table replace
int DobbyImportTableReplace(char *image_name, char *symbol_name, dobby_dummy_func_t fake_func,
                            dobby_dummy_func_t *orig_func);

// for arm, Arm64, try use b xxx instead of ldr absolute indirect branch
// for x86, x64, always use absolute indirect jump
void dobby_enable_near_branch_trampoline();
void dobby_disable_near_branch_trampoline();

#ifdef __cplusplus
}
#endif

#endif
```

常用的就底下那几个，而且dobby提供的 **DobbySymbolResolver** 只能查找导出符号，所以一般不用，通常都会用elf_utils去查找符号，而且 **DobbyHook** 使用之前需要先修改内存段权限，不加的话似乎会无限循环调用，可能只有我这个版本会。
