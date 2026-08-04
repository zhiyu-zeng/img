---
title: 过Frida检测的一般思路
source: https://yuuki.cool/posts/passfridacheck/passfridacheck/
source_host: yuuki.cool
clip_date: 2026-08-04T10:36:46+08:00
trace_id: 0166beb4-7bf7-4f9a-afa9-43d92f36e7a5
content_hash: fb7fca9c0528fecb624c009c6d0d7daaa8408cb6c953b4389ad4c8ab777c633d
status: synced
tags:
  - 反调试
  - Frida
series: null
feed_source: Yuuki·移动安全
ai_summary: 应用中 Frida 注入因 `libmsaoaidsec.so` 的早期初始化检测而被 kill，通过 hook `linker64::call_constructors` 在 SO 加载后直接替换检测函数可成功绕过。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3b275244-d011-8162-9923-d99e3f50daa1
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 应用中 Frida 注入因 `libmsaoaidsec.so` 的早期初始化检测而被 kill，通过 hook `linker64::call_constructors` 在 SO 加载后直接替换检测函数可成功绕过。
> 
> - **检测触发点：** `libmsaoaidsec.so` 在 `.init_proc` 或 `.init_array` 中执行反 Frida 逻辑，导致 `android_dlopen_ext` 未执行 `OnLeave` 即终止进程。
> - **绕过时机：** 由于 `call_constructors` 非导出函数，需按设备获取 linker 偏移（本例 `0x623d8`），在调用构造器后立刻注入替换或 NOP。
> - **定位方式：** 通过 Hook `pthread_create` 记录线程创建函数地址，结合 IDA 偏移计算，确定检测线程函数（如 `0x1B924`），然后替换其逻辑。
> - **侵入式修改：** 可直接删除 APK 中的 `libmsaoaidsec.so` 或在 `dlopen` 时修改路径为空字符串，使安全模块不加载，不影响业务逻辑。
> - **替换策略：** 文中采用 `Interceptor.replace` 将检测函数替换为空函数，并设置 `void` 返回，确保不干扰流程。

## 0x00：环境

设备：MEIzu21PRO

系统版本：Android 14

Frida-Server：16.4.10

小猿口算：3.93.3

## 0x01：问题

在我使用frida尝试注入，进程直接被杀

```bash
PS D:\frida_hook\xiaoyuan> frida -U -l hook.js -f com.fenbi.android.leo
     ____
    / _  |   Frida 16.4.10 - A world-class dynamic instrumentation toolkit
   | (_| |
    > _  |   Commands:
   /_/ |_|       help      -> Displays the help system
   . . . .       object?   -> Display information about 'object'
   . . . .       exit/quit -> Exit
   . . . .
   . . . .   More info at https://frida.re/docs/home/
   . . . .
   . . . .   Connected to MEIZU 21 Pro (id=481QFGE9227R3)
Spawned `com.fenbi.android.leo`. Resuming main thread!              
[MEIZU 21 Pro::com.fenbi.android.leo ]-> Process terminated
[MEIZU 21 Pro::com.fenbi.android.leo ]->

Thank you for using Frida!
```

## 0x02：分析

大多数frida检测都是在so层，少部分在java层，我们可以先hook一下dlopen查看一下app加载了哪些so文件。

JS代码：

```javascript
function hook_dlopen() {
    Interceptor.attach(Module.findExportByName(null, "android_dlopen_ext"),
        {
            onEnter: function (args) {
                this.fileName = args[0].readCString()
                console.log(`dlopen onEnter: ${this.fileName}`)
            }, onLeave: function(retval){
                console.log(`dlopen onLeave fileName: ${this.fileName}`)
                if(this.fileName != null && this.fileName.indexOf("libmsaoaidsec.so") >= 0){
                    let JNI_OnLoad = Module.getExportByName(this.fileName, 'JNI_OnLoad')
                    console.log(`dlopen onLeave JNI_OnLoad: ${JNI_OnLoad}`)
                }
            }
        }
    );
}

setImmediate(hook_dlopen)
```

输出日志：

```bash
PS D:\frida_hook\xiaoyuan> frida -U -l hook.js -f com.fenbi.android.leo
     ____
    / _  |   Frida 16.4.10 - A world-class dynamic instrumentation toolkit
   | (_| |
    > _  |   Commands:
   /_/ |_|       help      -> Displays the help system
   . . . .       object?   -> Display information about 'object'
   . . . .       exit/quit -> Exit
   . . . .
   . . . .   More info at https://frida.re/docs/home/
   . . . .
   . . . .   Connected to MEIZU 21 Pro (id=481QFGE9227R3)
Spawned `com.fenbi.android.leo`. Resuming main thread!              
[MEIZU 21 Pro::com.fenbi.android.leo ]-> dlopen onEnter: /system/framework/oat/arm64/org.apache.http.legacy.odex
dlopen onLeave fileName: /system/framework/oat/arm64/org.apache.http.legacy.odex
dlopen onEnter: /data/app/~~A55TKEnXig6YeUSXhnkLPg==/com.fenbi.android.leo-O_2O3vNIVRfTPnY4TgeayQ==/oat/arm64/base.odex
dlopen onLeave fileName: /data/app/~~A55TKEnXig6YeUSXhnkLPg==/com.fenbi.android.leo-O_2O3vNIVRfTPnY4TgeayQ==/oat/arm64/base.odex
dlopen onEnter: libframework-connectivity-jni.so
dlopen onLeave fileName: libframework-connectivity-jni.so
dlopen onEnter: /data/app/~~A55TKEnXig6YeUSXhnkLPg==/com.fenbi.android.leo-O_2O3vNIVRfTPnY4TgeayQ==/lib/arm64/libmmkv.so
dlopen onLeave fileName: /data/app/~~A55TKEnXig6YeUSXhnkLPg==/com.fenbi.android.leo-O_2O3vNIVRfTPnY4TgeayQ==/lib/arm64/libmmkv.so
dlopen onEnter: /data/app/~~A55TKEnXig6YeUSXhnkLPg==/com.fenbi.android.leo-O_2O3vNIVRfTPnY4TgeayQ==/lib/arm64/libmsaoaidsec.so
Process terminated
[MEIZU 21 Pro::com.fenbi.android.leo ]->

Thank you for using Frida!
```

可以看到最终是断在了 **libmsaoaidsec.so**，而且并没有走 **OnLeave**，说明检测函数就在这个so文件里。并且没有执行 **JNI_OnLoad**，说明检测frida的操作是在\*\*.init_proc **或者**.init_array\*\*中完成的

#### linker部分代码：

```rust
void* do_dlopen(const char* name, int flags,
                const android_dlextinfo* extinfo,
                const void* caller_addr) {
    std::string trace_prefix = std::string("dlopen: ") + (name == nullptr ? "(nullptr)" : name);
    ScopedTrace trace(trace_prefix.c_str());
    ScopedTrace loading_trace((trace_prefix + " - loading and linking").c_str());
    soinfo* const caller = find_containing_library(caller_addr);
    android_namespace_t* ns = get_caller_namespace(caller);

    LD_LOG(kLogDlopen,
           "dlopen(name=\"%s\", flags=0x%x, extinfo=%s, caller=\"%s\", caller_ns=%s@%p) ...",
           name,
           flags,
           android_dlextinfo_to_string(extinfo).c_str(),
           caller == nullptr ? "(null)" : caller->get_realpath(),
           ns == nullptr ? "(null)" : ns->get_name(),
           ns);

    auto failure_guard = android::base::make_scope_guard(
        [&]() { LD_LOG(kLogDlopen, "... dlopen failed: %s", linker_get_error_buffer()); });

    if ((flags & ~(RTLD_NOW|RTLD_LAZY|RTLD_LOCAL|RTLD_GLOBAL|RTLD_NODELETE|RTLD_NOLOAD)) != 0) {
        DL_ERR("invalid flags to dlopen: %x", flags);
        return nullptr;
    }

    if (extinfo != nullptr) {
        if ((extinfo->flags & ~(ANDROID_DLEXT_VALID_FLAG_BITS)) != 0) {
            DL_ERR("invalid extended flags to android_dlopen_ext: 0x%" PRIx64, extinfo->flags);
            return nullptr;
        }

        if ((extinfo->flags & ANDROID_DLEXT_USE_LIBRARY_FD) == 0 &&
            (extinfo->flags & ANDROID_DLEXT_USE_LIBRARY_FD_OFFSET) != 0) {
            DL_ERR("invalid extended flag combination (ANDROID_DLEXT_USE_LIBRARY_FD_OFFSET without "
                   "ANDROID_DLEXT_USE_LIBRARY_FD): 0x%" PRIx64, extinfo->flags);
            return nullptr;
        }

        if ((extinfo->flags & ANDROID_DLEXT_LOAD_AT_FIXED_ADDRESS) != 0 &&
            (extinfo->flags & (ANDROID_DLEXT_RESERVED_ADDRESS | ANDROID_DLEXT_RESERVED_ADDRESS_HINT)) != 0) {
            DL_ERR("invalid extended flag combination: ANDROID_DLEXT_LOAD_AT_FIXED_ADDRESS is not "
                   "compatible with ANDROID_DLEXT_RESERVED_ADDRESS/ANDROID_DLEXT_RESERVED_ADDRESS_HINT");
            return nullptr;
        }

        if ((extinfo->flags & ANDROID_DLEXT_USE_NAMESPACE) != 0) {
            if (extinfo->library_namespace == nullptr) {
                DL_ERR("ANDROID_DLEXT_USE_NAMESPACE is set but extinfo->library_namespace is null");
                return nullptr;
            }
            ns = extinfo->library_namespace;
        }
    }

    std::string asan_name_holder;

    const char* translated_name = name;
    if (g_is_asan && translated_name != nullptr && translated_name[0] == '/') {
        char original_path[PATH_MAX];
        if (realpath(name, original_path) != nullptr) {
            asan_name_holder = std::string(kAsanLibDirPrefix) + original_path;
            if (file_exists(asan_name_holder.c_str())) {
                soinfo* si = nullptr;
                if (find_loaded_library_by_realpath(ns, original_path, true, &si)) {
                    PRINT("linker_asan dlopen NOT translating \"%s\" -> \"%s\": library already loaded", name,
                          asan_name_holder.c_str());
                } else {
                    PRINT("linker_asan dlopen translating \"%s\" -> \"%s\"", name, translated_name);
                    translated_name = asan_name_holder.c_str();
                }
            }
        }
    }

    ProtectedDataGuard guard;
    soinfo* si = find_library(ns, translated_name, flags, extinfo, caller);
    loading_trace.End();

    if (si != nullptr) {
        void* handle = si->to_handle();
        LD_LOG(kLogDlopen,
               "... dlopen calling constructors: realpath=\"%s\", soname=\"%s\", handle=%p",
               si->get_realpath(), si->get_soname(), handle);
        si->call_constructors();
        failure_guard.Disable();
        LD_LOG(kLogDlopen,
               "... dlopen successful: realpath=\"%s\", soname=\"%s\", handle=%p",
               si->get_realpath(), si->get_soname(), handle);
        return handle;
    }

    return nullptr;
}
```

直接看重要的部分：

```swift
ProtectedDataGuard guard;
    //查找并加载so
    soinfo* si = find_library(ns, translated_name, flags, extinfo, caller);
    loading_trace.End();

    if (si != nullptr) {
        void* handle = si->to_handle();
        LD_LOG(kLogDlopen,
               "... dlopen calling constructors: realpath=\"%s\", soname=\"%s\", handle=%p",
               si->get_realpath(), si->get_soname(), handle);
        si->call_constructors();//进入之后会调用.init_xxx函数
        failure_guard.Disable();
        LD_LOG(kLogDlopen,
               "... dlopen successful: realpath=\"%s\", soname=\"%s\", handle=%p",
               si->get_realpath(), si->get_soname(), handle);
        return handle;
    }
```

我们可以看到在 **dlopen** 函数调用完成之后\*\*.init_xxx\*\*已经执行完成了，所以我们要选择一个适当的时机去hook。这里时机的选择有两种方案：

1.  hook **call_constructors**，并在OnEnter里注入代码
    
2.  在.init_xxx中寻找一个被调用时机较早的外部函数进行hook
    

这里为了通用一点，选择方案一。但是由于 **call_constructors** 并不是一个 **导出函数**，所以我们在hook的时候需要先得到它相对于linker的偏移地址，这个偏移量不同设备大概是不同的，我们需要自己获取一下

```
readelf -sW /apex/com.android.runtime/bin/linker64 | grep call_constructors
```

输出：

```
meizu21Pro:/ # readelf -sW /apex/com.android.runtime/bin/linker64 | grep call_constructors
   767: 00000000000623d8   888 FUNC    LOCAL  HIDDEN    11 __dl__ZN6soinfo17call_constructorsEv
```

JS代码：

```javascript
function hook_linker_call_constructors() {
    let linker64_base_addr = Module.getBaseAddress('linker64')
    let offset = 0x623d8
    let call_constructors = linker64_base_addr.add(offset)
    let listener = Interceptor.attach(call_constructors,{
        onEnter:function(args){
            console.log('hook_linker_call_constructors onEnter')
            let secmodule = Process.findModuleByName("libmsaoaidsec.so")
            if (secmodule != null){
                //todo
            }
        }
    })
}
```

确定hook点了之后，接下来定位具体的Frida检测点。对Frida的检测通常会使用openat、open、strstr、pthread_create、snprintf、sprintf、readlinkat等一系列函数。这里选择 **pthread_create** 函数，因为要检测就首先会创建线程。所以可以先看看那些函数调用了pthread_create

#### hook pthread_create 定位检测点

```javascript
function hook_pthred_create(){
    console.log("libmsaoaidsec.so --- " + Process.findModuleByName("libmsaoaidsec.so").base)
    Interceptor.attach(Module.findExportByName('libc.so','pthread_create'),{
        onEnter(args){
            let func_addr = args[2]
            console.log(`The thread Called function address is: ${func_addr}`)
        }
    })
}
```

输出：

```yaml
PS D:\frida_hook\xiaoyuan> frida -U -l hook.js -f com.fenbi.android.leo
     ____
    / _  |   Frida 16.4.10 - A world-class dynamic instrumentation toolkit
   | (_| |
    > _  |   Commands:
   /_/ |_|       help      -> Displays the help system
   . . . .       object?   -> Display information about 'object'
   . . . .       exit/quit -> Exit
   . . . .
   . . . .   More info at https://frida.re/docs/home/
   . . . .
   . . . .   Connected to MEIZU 21 Pro (id=481QFGE9227R3)
Spawned `com.fenbi.android.leo`. Resuming main thread!                  
[MEIZU 21 Pro::com.fenbi.android.leo ]-> libmsaoaidsec.so --- 0x7656840000
libmsaoaidsec.so --- 0x7656840000
libmsaoaidsec.so --- 0x7656840000
libmsaoaidsec.so --- 0x7656840000
libmsaoaidsec.so --- 0x7656840000
The thread Called function address is: 0x76e6683c84
The thread Called function address is: 0x76e6683c84
The thread Called function address is: 0x76e6683c84
The thread Called function address is: 0x76e6683c84
The thread Called function address is: 0x76e6683c84
libmsaoaidsec.so --- 0x7656840000
The thread Called function address is: 0x76e6683c84
The thread Called function address is: 0x76e6683c84
The thread Called function address is: 0x76e6683c84
The thread Called function address is: 0x76e6683c84
The thread Called function address is: 0x76e6683c84
libmsaoaidsec.so --- 0x7656840000
The thread Called function address is: 0x76e6683c84
The thread Called function address is: 0x76e6683c84
The thread Called function address is: 0x76e6683c84
The thread Called function address is: 0x76e6683c84
The thread Called function address is: 0x76e6683c84
The thread Called function address is: 0x76e6683c84
libmsaoaidsec.so --- 0x7656840000
The thread Called function address is: 0x765685c544
The thread Called function address is: 0x765685c544
The thread Called function address is: 0x765685c544
The thread Called function address is: 0x765685c544
The thread Called function address is: 0x765685c544
The thread Called function address is: 0x765685c544
The thread Called function address is: 0x765685c544
The thread Called function address is: 0x765685c544
The thread Called function address is: 0x76e6683c84
The thread Called function address is: 0x76e6683c84
The thread Called function address is: 0x76e6683c84
The thread Called function address is: 0x76e6683c84
The thread Called function address is: 0x76e6683c84
The thread Called function address is: 0x76e6683c84
The thread Called function address is: 0x76e6683c84
The thread Called function address is: 0x76e6683c84
The thread Called function address is: 0x765685b8d4
The thread Called function address is: 0x765685b8d4
The thread Called function address is: 0x765685b8d4
The thread Called function address is: 0x765685b8d4
The thread Called function address is: 0x765685b8d4
The thread Called function address is: 0x765685b8d4
The thread Called function address is: 0x765685b8d4
The thread Called function address is: 0x765685b8d4
The thread Called function address is: 0x76e6683c84
The thread Called function address is: 0x76e6683c84
The thread Called function address is: 0x76e6683c84
The thread Called function address is: 0x76e6683c84
The thread Called function address is: 0x76e6683c84
The thread Called function address is: 0x76e6683c84
The thread Called function address is: 0x76e6683c84
The thread Called function address is: 0x76e6683c84
libmsaoaidsec.so --- 0x7656840000
The thread Called function address is: 0x76e6683c84
The thread Called function address is: 0x76e6683c84
The thread Called function address is: 0x76e6683c84
The thread Called function address is: 0x76e6683c84
The thread Called function address is: 0x76e6683c84
The thread Called function address is: 0x76e6683c84
The thread Called function address is: 0x76e6683c84
The thread Called function address is: 0x76e6683c84
The thread Called function address is: 0x76e6683c84
The thread Called function address is: 0x76e6683c84
The thread Called function address is: 0x76e6683c84
The thread Called function address is: 0x76e6683c84
The thread Called function address is: 0x76e6683c84
The thread Called function address is: 0x76e6683c84
The thread Called function address is: 0x76e6683c84
The thread Called function address is: 0x76e6683c84
The thread Called function address is: 0x7656866e5c
The thread Called function address is: 0x7656866e5c
The thread Called function address is: 0x7656866e5c
The thread Called function address is: 0x7656866e5c
Process terminated
[MEIZU 21 Pro::com.fenbi.android.leo ]->

Thank you for using Frida!
```

可以看到libmsaoaidsec.so在内存中的地址是 --- 0x7656840000

分析日志可知有三个线程是由libmsaoaidsec.so创建的，他们相对so的偏移地址分别是： **0x765685c544 - 0x7656840000 = 0x1c544**

**0x765685b8d4 - 0x7656840000 = 0x1b8d4**

**0x7656866e5c - 0x7656840000 = 0x26e5c**

知道了偏移地址，我们就可以使用IDA打开so开始分析了

按下 **G** 跳转到上述地址，我们可以一个个尝试，比如我们先打开 **0x1b8d4** 处的函数

```
LOAD:000000000001B8D4                               ; void __noreturn sub_1B8D4()
LOAD:000000000001B8D4                               sub_1B8D4                               ; DATA XREF: sub_1B924+520↓o
LOAD:000000000001B8D4                                                                       ; sub_1B924+52C↓o
LOAD:000000000001B8D4
LOAD:000000000001B8D4                               var_10= -0x10
LOAD:000000000001B8D4
LOAD:000000000001B8D4 F3 7B BF A9                   STP             X19, X30, [SP,#var_10]!
LOAD:000000000001B8D8 94 C4 FF 97                   BL              sub_CB28
LOAD:000000000001B8D8
LOAD:000000000001B8DC 08 90 90 52                   MOV             W8, #0x8480
LOAD:000000000001B8E0 1F 90 01 71                   CMP             W0, #0x64 ; 'd'
LOAD:000000000001B8E4 C8 03 A0 72                   MOVK            W8, #0x1E,LSL#16
LOAD:000000000001B8E8 13 31 80 1A                   CSEL            W19, W8, W0, CC
LOAD:000000000001B8EC 03 00 00 14                   B               loc_1B8F8
LOAD:000000000001B8EC
LOAD:000000000001B8F0                               ; ---------------------------------------------------------------------------
LOAD:000000000001B8F0
LOAD:000000000001B8F0                               loc_1B8F0                               ; CODE XREF: sub_1B8D4+44↓j
LOAD:000000000001B8F0                                                                       ; sub_1B8D4+4C↓j
LOAD:000000000001B8F0 E0 03 13 2A                   MOV             W0, W19                 ; useconds
LOAD:000000000001B8F4 F3 AF FF 97                   BL              usleep
LOAD:000000000001B8F4
LOAD:000000000001B8F8
LOAD:000000000001B8F8                               loc_1B8F8                               ; CODE XREF: sub_1B8D4+18↑j
LOAD:000000000001B8F8 54 FD FF 97                   BL              sub_1AE48
LOAD:000000000001B8F8
LOAD:000000000001B8FC 1F 04 00 31                   CMN             W0, #1
LOAD:000000000001B900 E0 00 00 54                   B.EQ            loc_1B91C
LOAD:000000000001B900
LOAD:000000000001B904 60 00 00 34                   CBZ             W0, loc_1B910
LOAD:000000000001B904
LOAD:000000000001B908 93 FC FF 97                   BL              sub_1AB54
LOAD:000000000001B908
LOAD:000000000001B90C 80 00 00 36                   TBZ             W0, #0, loc_1B91C
LOAD:000000000001B90C
LOAD:000000000001B910
LOAD:000000000001B910                               loc_1B910                               ; CODE XREF: sub_1B8D4+30↑j
LOAD:000000000001B910 88 FF FF 97                   BL              sub_1B730
LOAD:000000000001B910
LOAD:000000000001B914 1F 24 0C 71                   CMP             W0, #0x309
LOAD:000000000001B918 C1 FE FF 54                   B.NE            loc_1B8F0
LOAD:000000000001B918
LOAD:000000000001B91C
LOAD:000000000001B91C                               loc_1B91C                               ; CODE XREF: sub_1B8D4+2C↑j
LOAD:000000000001B91C                                                                       ; sub_1B8D4+38↑j
LOAD:000000000001B91C A2 D9 FF 97                   BL              sub_11FA4
LOAD:000000000001B91C
LOAD:000000000001B920 F4 FF FF 17                   B               loc_1B8F0
LOAD:000000000001B920
LOAD:000000000001B920                               ; End of function sub_1B8D4
```

根据交叉引用确定了它在 **sub_1B924** 函数中被调用，那么这个函数应该就是frida检测逻辑所在的函数了，我们有两种方式过掉这个检测

1.  直接nop掉 **pthread_create**
    
2.  直接replace **sub_1B924**
    

都很简单，这里选择第二种方式

JS代码：

```javascript
let isHooked = false;
function hook_sub_1b924() {
    if (isHooked) {
        console.log('Function already hooked, skipping...');
        return;
    }

    let secmodule = Process.findModuleByName("libmsaoaidsec.so");
    Interceptor.replace(secmodule.base.add(0x1B924), new NativeCallback(function () {
        console.log(`hook_sub_1b924 >>>>>>>>>>>>>>>>> replace`);
    }, 'void', []));

    isHooked = true; // Mark as hooked
}
```

## 0x03：全部代码

```javascript
function hook_dlopen() {
    Interceptor.attach(Module.findExportByName(null, "android_dlopen_ext"),
        {
            onEnter: function (args) {
                this.fileName = args[0].readCString()
                console.log(`dlopen onEnter: ${this.fileName}`)
            }, onLeave: function(retval){
                console.log(`dlopen onLeave fileName: ${this.fileName}`)
                if(this.fileName != null && this.fileName.indexOf("libmsaoaidsec.so") >= 0){
                    let JNI_OnLoad = Module.getExportByName(this.fileName, 'JNI_OnLoad')
                    console.log(`dlopen onLeave JNI_OnLoad: ${JNI_OnLoad}`)
                }
            }
        }
    );
}

function hook_linker_call_constructors() {
    let linker64_base_addr = Module.getBaseAddress('linker64')
    let offset = 0x623d8
    let call_constructors = linker64_base_addr.add(offset)
    let listener = Interceptor.attach(call_constructors,{
        onEnter:function(args){
            //console.log('hook_linker_call_constructors onEnter')
            let secmodule = Process.findModuleByName("libmsaoaidsec.so")
            if (secmodule != null){
                // do something
                //hook_pthred_create()
                hook_sub_1b924()
            }
        }
    })
}

function hook_pthred_create(){
    console.log("libmsaoaidsec.so --- " + Process.findModuleByName("libmsaoaidsec.so").base)
    Interceptor.attach(Module.findExportByName('libc.so','pthread_create'),{
        onEnter(args){
            let func_addr = args[2]
            console.log(`The thread Called function address is: ${func_addr}`)
        }
    })
}

let isHooked = false;
function hook_sub_1b924() {
    if (isHooked) {
        console.log('Function already hooked, skipping...');
        return;
    }

    let secmodule = Process.findModuleByName("libmsaoaidsec.so");
    Interceptor.replace(secmodule.base.add(0x1B924), new NativeCallback(function () {
        console.log(`hook_sub_1b924 >>>>>>>>>>>>>>>>> replace`);
    }, 'void', []));

    isHooked = true; // Mark as hooked
}


setImmediate(hook_linker_call_constructors)

//frida -U -l hook.js -f com.fenbi.android.leo
```

## 0x04：总结&简单过掉libmsaoaidsec.so的方法

#### 总结：

这里直接去查看 **0x1b8d4** 是因为我知道它是有问题的函数，正常分析需要三处都去分析一下，当然可以直接尝试nop掉，这样可以节省许多时间，毕竟分析也是很累人的。这只是个过frida检测的例子，实际上有更简单的方法，我只是觉得这种方法比较通用。

#### 简单过掉libmsaoaidsec.so的方法：

可以直接删去/data/app/~~A55TKEnXig6YeUSXhnkLPg==/com.fenbi.android.leo-O_2O3vNIVRfTPnY4TgeayQ==/lib/arm64/libmsaoaidsec.so或者直接在apk包中把这个so删掉。因为这个so纯纯是一个安全相关的so，与app本身的业务逻辑毫无关系，直接删掉就好了(与linker的实现也有关，之前写过一篇详细介绍)。bilibili，爱奇艺之类的很多软件都有这个so

也可以在frida中简易的过掉（本段代码来自看雪论坛）：

```javascript
function hook_dlopen(soName = '') {
    Interceptor.attach(Module.findExportByName(null, "android_dlopen_ext"), {
        onEnter: function (args) {
            var pathptr = args[0];
            if (pathptr !== undefined && pathptr != null) {
                var path = ptr(pathptr).readCString();
                if(path.indexOf('libmsaoaidsec.so') >= 0){
                    ptr(pathptr).writeUtf8String("");
                }
                console.log('path: ',path)
            }
        }
    });
}
hook_dlopen()
```
