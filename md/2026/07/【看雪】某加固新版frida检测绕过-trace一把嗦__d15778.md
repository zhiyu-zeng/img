---
title: 【看雪】某加固新版frida检测绕过-trace一把嗦
source: https://bbs.kanxue.com/thread-289545.htm
source_host: bbs.kanxue.com
clip_date: 2026-07-14T21:58:40+08:00
trace_id: 6f57ebcf-9d37-4ed1-b938-f5aa72238bdf
content_hash: 864017f2512bb464e71b654d3a790e5539fe8116a54a23fc384bbb49eedf75a0
status: summarized
tags:
  - 看雪
  - Frida
  - 逆向工程
series: null
feed_source: null
ai_summary: 通过 hook clone 和函数替换，成功绕过某加固企业版（含新版）的 Frida 检测机制。
ai_summary_style: key-points
images_status:
  total: 46
  succeeded: 46
  failed_urls: []
notion_page_id: 39d75244-d011-8184-af5f-db2c415027d8
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 通过 hook clone 和函数替换，成功绕过某加固企业版（含新版）的 Frida 检测机制。
> 
> - **定位检测线程：** 常规 hook `pthread_create` 无效后，转而 hook 更底层的 `clone` 系统调用。通过解析其参数，成功定位到由加固 SO（libDexHelper.so）创建的多个检测线程函数地址。
> - **绕过策略：** 对定位到的检测线程函数地址，使用 Frida 的 `Arm64Writer` 写入 `ret` 指令进行 NOP；对于关键的前置检测函数（如 sub_36390, sub_54b20），则使用 `Interceptor.replace` 强制其返回 0，以绕过对 libc/libart 关键函数（如 pthread_create）的 hook 检测。
> - **新版加固分析：** 新版加固在旧版基础上增加了 `sub_36390` 等函数的检测。绕过该新增检测后，后续的线程检测与绕过思路与旧版基本一致。
> - **工具辅助定位：** 对于无法通过 hook 直接获取信息的场景（如进程被直接杀掉），使用 `stalker_trace_so` 或 `vm-trace` 等工具 trace 指令执行流，从崩溃点反向定位到具体的检测函数。
> - **通用性：** 此绕过方法成功应用于包括四大行在内的多个采用同款加固方案的样本，并总结了可复用的 Frida 脚本流程。

学习frida检测原理后, 向朋友寻找样本练手, 正好是某\*加固企业版

根据网上资料成功绕过大部分样本的检测, 但某icbc是新版加固, 原方案不起作用

最终通过trace成功定位检测点并绕过, 写下此篇分享思路

**注意: 由于复现时疏忽, 在Pixel6a上绕过旧版加固时使用了 [florida](https://github.com/Ylarod/Florida), 原版frida hook clone时进程仍然会被杀而非打印线程函数, 在Pixel3XL上绕过新版加固全程使用原版frida, 可参考新版定位和绕过思路 (我的锅)**

工具:

-   IDA Pro 9.2
-   Frida 16.1.4
-   Unidbg 0.9.8
-   010 editor
-   [vm-trace](https://github.com/jiqiu2022/vm-trace-release)
-   [SoFixer](https://github.com/LunFengChen/SoFixer)

设备环境:

-   Pixel 3XL Android 10
-   Pixel 6A Android 14
-   Apatch 11142
-   ZygiskNext 1.3.1
-   Zygisk LSPosed 1.10.2

文中样本均下载自应用商店,日期为12.8-12.10

**声明**:

1.  本文所述内容仅为技术研究与学习交流之目的, 所分析的 App 版权归其所属公司所有
2.  作者未对任何 App 进行非法篡改, 破解, 数据窃取或商业利用, 亦不鼓励或支持任何违反法律法规的行为
3.  读者不得将本文内容用于任何非法用途, 由此产生的一切法律责任由使用者自行承担
4.  请遵守《中华人民共和国网络安全法》及相关法律法规

## 某\*加固(旧版)

关键SO: libDexHelper.so

样本: com.jxbank.mbank

## 基本信息搜集

搜集包名,加固方案,lib库等信息

## 定位检测so

hook dlopen 定位检测so, 低版本使用"dlopen", 高版本"android_dlopen_ext"

```javascript
functionhook_dlopen() {
    const funcName = "android_dlopen_ext";                  // old version is "dlopen", 
    const libc = Module.findBaseAddress("libc.so");
    varfuncPtr = Module.findExportByName(null, funcName);  // 查找导出函数 (null 代表搜索所有模块)
 
    if(funcPtr !== null&& funcPtr !== undefined) {
        console.log(`[*] Hooking ${funcName} at libc.so!0x${(funcPtr - libc.base).toString(16)}`);
        // hook dlopen
        Interceptor.attach(funcPtr, {
            onEnter: function(args) {
                this.pathPtr = args[0];
                if(this.pathPtr !== null&& this.pathPtr !== undefined) {
                    try{
                        // 读取加载的so名称字符串并打印
                        varpath = this.pathPtr.readCString();  
                        console.log("\x1b[36m[dlopen] \x1b[0m"+ path);
                    } catch(e) {
                        console.log("[!] Error reading path string in "+ this.funcName);
                    }
                }
            }
        });
    } else{
        console.log("[-] Warning: "+ funcName + " not found in exports.");
    }
}
functionmain(){
    hook_dlopen();
}
setImmediate(main);
```

如果加载该so时, 在init, init_array, JNI_OnLoad等位置检测, 则加载该so后会立马杀掉进程

但在加载libDexHelper.so后一段时间才退出进程, 说明该so中创建了子线程进行检测

![6-dlopen-load-so](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/3004a4a3c53a2841.png)

## 定位检测线程

linux中最常用的线程创建函数是pthread_create, 定义如下

```cpp
#include <pthread.h>
intpthread_create(pthread_t *thread,               //  保存新创建线程的线程标识符tid
                   constpthread_attr_t *attr,      //  线程属性对象的指针
                   void*(*start_routine)(void*),  //  线程入口函数地址
                   void*arg);                      //  线程函数的参数
```

在hook dlopen中添加代码, 当加载libDexHelper.so时hook pthread_create减少多余输出(libart也会创建很多线程)

hook_pthread_create函数中打印创建的线程函数所在so以及偏移地址

```javascript
functionhook_pthread_create() {
    varpthread_create_addr = Module.findExportByName("libc.so", "pthread_create");
    console.log("pthread_create addr: ", pthread_create_addr);
    Interceptor.attach(pthread_create_addr, {
        onEnter: function(args) {
            varthread_func_addr = args[2];
            varmodule = Process.findModuleByAddress(thread_func_addr);
            console.log(`pthread_create thread func: ${module.name}+0x${(thread_func_addr - module.base).toString(16)}`);
        }, onLeave: function(retval) {
        }
    });
}
 
functionhook_dlopen() {
    const funcName = "android_dlopen_ext";
    const libc = Module.findBaseAddress("libc.so");
    varfuncPtr = Module.findExportByName(null, funcName);
 
    if(funcPtr !== null&& funcPtr !== undefined) {
        console.log(`[*] Hooking ${funcName} at libc.so!0x${(funcPtr - libc.base).toString(16)}`);
 
        Interceptor.attach(funcPtr, {
            onEnter: function(args) {
                this.pathPtr = args[0];
 
                if(this.pathPtr !== null&& this.pathPtr !== undefined) {
                    try{
                        varpath = this.pathPtr.readCString();
                        console.log("\x1b[36m[dlopen] \x1b[0m"+ path);
                        if(path.indexOf("libDexHelper.so") !== -1) {
                            this.isTarget = true;
                        }
                    } catch(e) {
                        console.log("[!] Error reading path string in "+ this.funcName);
                    }
                }
            }, onLeave: function(retval) {
                if(this.isTarget) {
                    hook_pthread_create();
                }
            }
        });
    } else{
        console.log("[-] Warning: "+ funcName + " not found in exports.");
    }
}
functionmain(){
    hook_dlopen();
}
setImmediate(main);
```

结果如下, 没有成功打印

![7-hook-pthread-create](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/52cc7a7243ee04ba.png)

所以可能并没有走pthread_create创建线程,而是更底层的系统调用clone

```cpp
#define _GNU_SOURCE
#include <sched.h>
// clone参数: 函数地址, 栈, 共享资源flag, 函数参数
intclone(int(*fn)(void*), void*stack, intflags, void*arg, ...);
```

hook clone, 打印线程函数所在模块和偏移

注意: 不能同时hook pthread_thread, 否则崩溃, 推测是因为libDexHelper检测了有没有hook libc的pthread_thread

```javascript
functionhook_clone() {
    // int clone(int (*fn)(void *), void *child_stack, int flags, void *arg, ...);
    varclone_addr = Module.findExportByName("libc.so", "clone");
    if(clone_addr) {
        Interceptor.attach(clone_addr, {
            onEnter: function(args) {
                varaddr = args[0];
                if(!addr.isNull()) {
                    varmod = Process.findModuleByAddress(addr);    // 获取地址所在的模块
 
                    if(mod) {
                        varoffset = addr.sub(mod.base);    // 计算偏移
                        console.log(`[+]${mod.name}!${offset}`);
                    } else{
                        console.log(`[+] Unknown Module (Anonymous Memory), Addr: ${addr}`);
                    }
                }
            }
        });
    } else{
        console.log("[-] clone export not found in libc.so");
    }
}
functionhook_dlopen() {
    const funcName = "android_dlopen_ext";
    const libc = Module.findBaseAddress("libc.so");
    varfuncPtr = Module.findExportByName(null, funcName);
 
    if(funcPtr !== null&& funcPtr !== undefined) {
        console.log(`[*] Hooking ${funcName} at libc.so!0x${(funcPtr - libc.base).toString(16)}`);
 
        Interceptor.attach(funcPtr, {
            onEnter: function(args) {
                this.pathPtr = args[0];
 
                if(this.pathPtr !== null&& this.pathPtr !== undefined) {
                    try{
                        varpath = this.pathPtr.readCString();
                        console.log("\x1b[36m[dlopen] \x1b[0m"+ path);
                        if(path.indexOf("libDexHelper.so") !== -1) {
                            this.isTarget = true;
                        }
                    } catch(e) {
                        console.log("[!] Error reading path string in "+ this.funcName);
                    }
                }
            }, onLeave: function(retval) {
                if(this.isTarget) {
                    //hook_pthread_create();    // 注意: 不能同时hook pthread_thread, 否则崩溃
                    hook_clone();
                }
            }
        });
    } else{
        console.log("[-] Warning: "+ funcName + " not found in exports.");
    }
}
functionmain() {
    hook_dlopen();
}
setImmediate(main);
```

结果如下, 输出的线程函数都在libc.so+0xc9c00中  
**注意: 由于复现时疏忽, 在Pixel6a上绕过旧版加固使用了 [florida](https://github.com/Ylarod/Florida), 原版frida hook clone时进程仍然会被杀而非打印线程函数**  
**在Pixel3XL上绕过新版加固全程使用原版frida, 可参考新版定位和绕过思路**  
![19-hook-clone-libc](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/ffe52a011642cf7c.png)

拉取libc.so扔进ida分析该地址

```bash
adb pull /system/lib64/libc.so ./libc64.so
```

0xc9c00对应函数是"\__pthread_start", 交叉引用发现在libc的"pthread_create"函数中通过clone封装了该函数

即 **pthread_create本质上通过clone创建子线程**, 子线程函数地址作为clone的参数传递

可以发现pthread_create的参数3线程函数地址传给此处v30+96, 封装后作为clone的参数4

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/2ca7de7fef0db45e.png)

所以, 修改hook_clone, 通过参数4+96即可拿到真正的子线程函数地址

参考文章 [【APP 逆向百例】某当劳 Frida 检测](https://www.freebuf.com/articles/others-articles/447681.html) 中的解释

```javascript
functionhook_clone() {
    varclone = Module.findExportByName('libc.so', 'clone');
    Interceptor.attach(clone, {
        onEnter: function(args) {
            //只有当 args[3] 不为 NULL 时，才说明上层确实把 “线程控制块指针” 传进来了
            if(args[3] != 0) {
                varthread_func_addr = args[3].add(96).readPointer()        // 真正的用户线程函数地址
                varmodule = Process.findModuleByAddress(thread_func_addr); // 根据线程函数地址 addr，找它属于哪个模块
                varoffset = (thread_func_addr - module.base);              // 获取相对于 base 的偏移
                console.log(`[+]libc.so clone thread func: ${module.name}+0x${offset.toString(16)}`);
            }
        }
    });
}
```

可以发现成功输出libDexHelper.so中创建了哪些线程检测函数

![8-hook-clone](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/18afaef1955f4cd1.png)

## 绕过检测线程

一个简单的思路是直接nop检测函数

```javascript
functionnopFunc(addr) {
    Memory.protect(addr, 4, 'rwx');  // 修改该地址的权限为可读可写
    varwriter = newArm64Writer(addr);
    writer.putRet();   // 直接将函数首条指令设置为ret指令
    writer.flush();    // 写入操作刷新到目标内存，使得写入的指令生效
    writer.dispose();  // 释放 Arm64Writer 使用的资源
    console.log("nop "+ addr + " success");
}
functionbypass_detect_func() {
    varbase = Module.findBaseAddress("libDexHelper.so")
    // jxbank
    nopFunc(base.add(0x561d0));
    nopFunc(base.add(0x52cc0));
    nopFunc(base.add(0x5ded4));
    nopFunc(base.add(0x5e410));
    nopFunc(base.add(0x5fb48));
    nopFunc(base.add(0x592c8));
    nopFunc(base.add(0x69470));
}
functionhook_dlopen() {
    const funcName = "android_dlopen_ext";
    const libc = Module.findBaseAddress("libc.so");
    varfuncPtr = Module.findExportByName(null, funcName);
 
    if(funcPtr !== null&& funcPtr !== undefined) {
        console.log(`[*] Hooking ${funcName} at libc.so!0x${(funcPtr - libc.base).toString(16)}`);
 
        Interceptor.attach(funcPtr, {
            onEnter: function(args) {
                this.pathPtr = args[0];
 
                if(this.pathPtr !== null&& this.pathPtr !== undefined) {
                    try{
                        varpath = this.pathPtr.readCString();
                        console.log("\x1b[36m[dlopen] \x1b[0m"+ path);
                        if(path.indexOf("libDexHelper.so") !== -1) {
                            this.isTarget = true;
                        }
                    } catch(e) {
                        console.log("[!] Error reading path string in "+ this.funcName);
                    }
                }
            }, onLeave: function(retval) {
                if(this.isTarget) {
                    //hook_pthread_create();
                    //hook_clone();
                    bypass_detect_func();
                }
            }
        });
    } else{
        console.log("[-] Warning: "+ funcName + " not found in exports.");
    }
}
functionmain() {
    hook_dlopen();
}
setImmediate(main);
```

成功绕过检测进入app

![9-nop-detect-thread](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/7dc253ad26f7b20b.png)

至此某\*加固旧版的frida检测成功绕过, 但检测函数到底做了什么? 有待进一步分析

## dump libDexHelper.so

想分析检测函数中具体做了什么需要分析libDexHelper.so, 直接提取apk中的so可以发现是加密状态

start没有指令全是数据, init_proc则是有elf相关结构, 可能是自定义linker

![11-init-start](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/762364f1bf7890f2.png)

在dlopen刚加载该so后进行dump, 此时从文件加载到内存中, 应是解密状态

```javascript
functiondump_so(so_name, package_name) {
    varlibso = Process.getModuleByName(so_name);
    console.log("[name]:", libso.name);
    console.log("[base]:", libso.base);
    console.log("[size]:", ptr(libso.size));
    console.log("[path]:", libso.path);
    //包名需要设置
    varfile_path = "/data/data/"+ package_name + "/"+ libso.name + "_"+ libso.base + "_"+ ptr(libso.size) + ".so";
    varfile_handle = newFile(file_path, "wb");
    if(file_handle && file_handle != null) {
        Memory.protect(ptr(libso.base), libso.size, 'rwx');
        varlibso_buffer = ptr(libso.base).readByteArray(libso.size);
        file_handle.write(libso_buffer);
        file_handle.flush();
        file_handle.close();
        console.log("[dump]:", file_path);
    }
}
 
functionhook_dlopen_dump_so(soName, package_name) {
    // hook android_dlopen_ext,该函数是Android系统加载so的函数
    // 当使用该函数加载指定so时,设置is_can_hook为true,表示可以hook,之后执行dump_so
    // 也就是加载so后马上dump,可以防止被反调试
    varonce_flag = true;
    Interceptor.attach(Module.findExportByName(null, "android_dlopen_ext"),
        {
            onEnter: function(args) {
                varpathptr = args[0];
                if(pathptr !== undefined && pathptr != null) {
                    varpath = ptr(pathptr).readCString();
                    if(path.indexOf(soName) >= 0) {
                        this.is_can_hook = true;
                    }
                }
            },
            onLeave: function(retval) {
                if(this.is_can_hook && once_flag) {
                    dump_so(soName, package_name);
                    once_flag = false;
                }
            }
        }
    );
}
functionmain(){
    hook_dlopen_dump_so("libDexHelper.so","com.icbc");
}
setImmediate(main);
```

dump成功, 进入手机端的shell复制到"/sdcard/Download"下方便pull

![10-dump-so](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/6874bf899d7c31e6.png)

adb pull到电脑端后使用SoFixer修复

![12-FixSO](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/160a581ebbd7b487.png)

修复后可以正常分析so, 这里贴上2个检测函数

![14-detect-thread-5d8cc-status-maps](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/d96abbdde7728525.png) ![13-detect-thread-func](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/dde6778bd49b7565.png)

## 通杀脚本

经过以上分析, 可以总结出通杀脚本如下

首次执行时注释bypass_detect_func, 打印libDexHelper.so创建的线程函数地址

之后修改bypass_detect_func中nopFunc的偏移地址, 再次执行即可绕过

```javascript
functionhook_pthread_create() {
    varpthread_create_addr = Module.findExportByName("libc.so", "pthread_create");
    console.log("pthread_create addr: ", pthread_create_addr);
    Interceptor.attach(pthread_create_addr, {
        onEnter: function(args) {
            varthread_func_addr = args[2];
            varmodule = Process.findModuleByAddress(thread_func_addr);
            console.log(`pthread_create thread func: ${module.name}+0x${(thread_func_addr - module.base).toString(16)}`);
        }, onLeave: function(retval) {
        }
    });
}
 
functionhook_clone() {
    varclone = Module.findExportByName('libc.so', 'clone');
    Interceptor.attach(clone, {
        onEnter: function(args) {
            //只有当 args[3] 不为 NULL 时，才说明上层确实把 “线程控制块指针” 传进来了
            if(args[3] != 0) {
                varthread_func_addr = args[3].add(96).readPointer()        // 真正的用户线程函数地址
                varmodule = Process.findModuleByAddress(thread_func_addr); // 根据线程函数地址 addr，找它属于哪个模块
                varoffset = (thread_func_addr - module.base);              // 获取相对于 base 的偏移
                console.log(`[+]libc.so clone thread func: ${module.name}+0x${offset.toString(16)}`);
            }
        }
    });
}
 
functionnopFunc(addr) {
    Memory.protect(addr, 4, 'rwx');  // 修改该地址的权限为可读可写
    varwriter = newArm64Writer(addr);
    writer.putRet();   // 直接将函数首条指令设置为ret指令
    writer.flush();    // 写入操作刷新到目标内存，使得写入的指令生效
    writer.dispose();  // 释放 Arm64Writer 使用的资源
    console.log("nop "+ addr + " success");
}
 
functionbypass_detect_func() {
    varbase = Module.findBaseAddress("libDexHelper.so")
    // jxbank
    nopFunc(base.add(0x561d0));
    nopFunc(base.add(0x52cc0));
    nopFunc(base.add(0x5ded4));
    nopFunc(base.add(0x5e410));
    nopFunc(base.add(0x5fb48));
    nopFunc(base.add(0x592c8));
    nopFunc(base.add(0x69470));
}
functionhook_dlopen() {
    const funcName = "android_dlopen_ext";
    const libc = Module.findBaseAddress("libc.so");
    varfuncPtr = Module.findExportByName(null, funcName);
 
    if(funcPtr !== null&& funcPtr !== undefined) {
        console.log(`[*] Hooking ${funcName} at libc.so!0x${(funcPtr - libc.base).toString(16)}`);
 
        Interceptor.attach(funcPtr, {
            onEnter: function(args) {
                this.pathPtr = args[0];
 
                if(this.pathPtr !== null&& this.pathPtr !== undefined) {
                    try{
                        varpath = this.pathPtr.readCString();
                        console.log("\x1b[36m[dlopen] \x1b[0m"+ path);
                        if(path.indexOf("libDexHelper.so") !== -1) {
                            this.isTarget = true;
                        }
                    } catch(e) {
                        console.log("[!] Error reading path string in "+ this.funcName);
                    }
                }
            }, onLeave: function(retval) {
                if(this.isTarget) {
                    //hook_pthread_create(); // 如果hook会由于检测libc.so而崩溃
                    hook_clone();            // hook clone打印检测线程正常运行
                    bypass_detect_func();
                }
            }
        });
    } else{
        console.log("[-] Warning: "+ funcName + " not found in exports.");
    }
}
functionmain() {
    hook_dlopen();
}
setImmediate(main);
```

## 其他案例

除此之外, 其他bank样本也可以使用相同方法绕过检测

大部分bank是某\*企业版, 招商是网易易盾, 兴业是爱加密

BOC

![14-BOC](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/aec7a14cd53263c6.png)

ABC

![15-ABC](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/a20b302f924cbf2c.png)

CCB

![16-CCB](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/8f165cc189fb16dc.png)

四大行中ICBC比较特殊, 是新版某\*加固, 且无法使用旧版的思路定位检测点

## 问题

假设hook clone, 绕过了线程检测函数, 此时再hook pthread_create进程仍会结束

不难猜测是libDexHelper.so中检测了libc.so的pthread_create是否被hook

整理文章时发现此问题, 但由于新版加固中已经绕过该检测, 故不再深究旧版

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/c8e54af1ca15cfcd.png)

## 某\*加固(新版)

## 定位新检测点

继续使用上述通杀脚本, 分别hook pthread_create和clone, 均没有打印出线程函数, 进程直接被杀

hook pthread_create

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/666520c0d48c1471.png)

hook clone

![23-bangbang-new-hook-clone](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/68264173e0faa6a4.png)

进程被杀, 没有其他信息, 但可以尝试trace进程崩溃前的函数执行流从而定位检测点

oacia师傅的 [stalker_trace_so](https://github.com/oacia/stalker_trace_so) 插件可以实现该功能, 使用插件前需要dump so, 同上操作类似不多赘述

将stalker_trace_so.py复制到ida的plugins目录下即可使用

使用方式为Edit > Plugins > stalker trace so, 自动生成trace脚本, spawn模式运行即可

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/1d3a3ec3f0563a55.png)

脚本需要修改so_name为app运行时so的真实名称 (默认为ida打开的文件名)

hook_dlopen 当加载目标so时, 执行trace

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/7eaf9ff69a4ec616.png)

spawn模式执行脚本

```python
frida -Uf com.icbc -l trace_libDexHelper_fixed_icbc_kwajw.js
```

trace结果如下

```python
[Pixel 3XL::com.icbc ]-> start Stalker!
Stalker end!
call1:JNI_OnLoad
call2:readlink
call3:j_p5SS$Sl5S5IS55I5_5ISI5I5SS5SIS0SlSISlS5S55_SOSI5lS0SlSIS_SOS05$S0
call4:p5SS$Sl5S5IS55I5_5ISI5I5SS5SIS0SlSISlS5S55_SOSI5lS0SlSIS_SOS05$S0  
call5:j_pSO5_5SSI5$S$SI5I5l5ISlSOS05l5ISISISIS0SISISI5$5_S$SISIS5S05S5$SI
call6:pSO5_5SSI5$S$SI5I5l5ISlSOS05l5ISISISIS0SISISI5$5_S$SISIS5S05S5$SI  
call7:j_pS_5$SlSO5SS$SI5ISlSISOSl5SSIS0Sl5I5S5I5S5IS$S_SISI5I5ISl5I5_S$S5
call8:pS_5$SlSO5SS$SI5ISlSISOSl5SSIS0Sl5I5S5I5S5IS$S_SISI5I5ISl5I5_S$S5
call9:sub_41FE0
call10:setsockopt
call11:j_pS$SlS_S_S$5ISI5_5S5ISlSI5_SlS55lSIS0SI5IS$SIS0SOS05_5IS_Sl5_SI5I
call12:pS$SlS_S_S$5ISI5_5S5ISlSI5_SlS55lSIS0SI5IS$SIS0SOS05_5IS_Sl5_SI5I
call13:j_pSl5I5$S5Sl5lSOSISOSIS0Sl5$5lSlS05lSlSI5_SISlS5SlSOSl5S5I5ISlSIS0
call14:pSl5I5$S5Sl5lSOSISOSIS0Sl5$5lSlS05lSlSI5_SISlS5SlSOSl5S5I5ISlSIS0
call15:getppid
call16:j_p5lS05ISISOSl5lS$SIS$5S5I5ISIS$S_5lSIS05S5I5SS_5I5lSO5_SOSI5_S05I
call17:p5lS05ISISOSl5lS$SIS$5S5I5ISIS$S_5lSIS05S5I5SS_5I5lSO5_SOSI5_S05I
call18:sub_32B78
call19:sched_yield
call20:socket
call21:fscanf
call22:atoi
call23:strrchr
call24:__strlen_chk
call25:__strncpy_chk2
call26:__vsprintf_chk
call27:connect
call28:fread
call29:regfree
call30:readdir
call31:__strncpy_chk
call32:wcstoul
call33:__errno
call34:sub_42098
call35:fputc
call36:dl_iterate_phdr
call37:j__ZN63p5lS5SISISlSl5lSlSl5SIS05l5SIS5I5ISI5SISlS5Sl5IS0SI5S5S5SI5lSl563p5lS5SISISlSl5lSlSl5SIS05l5SIS5I5ISI5SISIS5Sl5IS0SI5S5S5SI5lSl5C2ENSt6__ndk117basic_string_viewIcNS1_11char_traitsIcEEEE
call38:_ZN63p5lS5SISISlSl5lSlSl5SIS05l5SIS5I5ISI5SISlS5Sl5IS0SI5S5S5SI5lSl563p5lS5SISISlSl5lSlSl5SIS05l5SIS5I5ISI5SISIS5Sl5IS0SI5S5S5SI5lSl5C2ENSt6__ndk117basic_string_viewIcNS1_11char_traitsIcEEEE
call39:j__ZN63p5lS5SISISlSl5lSlSl5SIS05l5SIS5I5ISI5SISlS5Sl5IS0SI5S5S5SI5lSl563p5lS5SISISlSl5lSlSl5SIS05l5SIS5I5ISI5SISIS5Sl5IS0SI5S5S5SI5lSl562p5lS_SISISlSl5lSlSl5SIS05l5SIS5I5ISI5SISlS5Sl5IS0SI5S5S5SIlS5_Ev     
call40:_ZN63p5lS5SISISlSl5lSlSl5SIS05l5SIS5I5ISI5SISlS5Sl5IS0SI5S5S5SI5lSl563p5lS5SISISlSl5lSlSl5SIS05l5SIS5I5ISI5SISIS5Sl5IS0SI5S5S5SI5lSl562p5lS_SISISlSl5lSlSl5SIS05l5SIS5I5ISI5SISlS5Sl5IS0SI5S5S5SIlS5_Ev       
call41:fileno
call42:__sF
call43:sub_309C0
call44:sub_72CA8
call45:sub_308E0
call46:sub_45D38
call47:sub_2F8A0
call48:sub_B3B40
call49:sub_30270
call50:sub_B85DC
call51:sub_30E50
call52:sub_33590
call53:sub_335FC
call54:sub_3360C
call55:strtoll
call56:j_j_strtol
call57:j_strtol
call58:strtol
call59:sub_31500
call60:sub_35E24
call61:memcmp
call62:strtoul
call63:pthread_mutex_lock
call64:j__ZN63p5lS5SISISlSl5lSlSl5SIS05l5SIS5I5ISI5SISlS5Sl5IS0SI5S5S5SI5lSl563p5lS5SISISlSl5lSlSl5SIS05l5SIS5I5ISI5SISIS5Sl5IS0SI5S5S5SI5lSl55parseEP9elf64_hdr
call65:_ZN63p5lS5SISISlSl5lSlSl5SIS05l5SIS5I5ISI5SISlS5Sl5IS0SI5S5S5SI5lSl563p5lS5SISISlSl5lSlSl5SIS05l5SIS5I5ISI5SISIS5Sl5IS0SI5S5S5SI5lSl55parseEP9elf64_hdr
call66:__strchr_chk
call67:j__ZNK63p5lS5SISISlSl5lSlSl5SIS05l5SIS5I5ISI5SISlS5Sl5IS0SI5S5S5SI5lSl563p5lS5SISISlSl5lSlSl5SIS05l5SIS5I5ISI5SISIS5Sl5IS0SI5S5S5SI5lSl563p5lS5SISISlSl5lSlSl5SIS05l5SIS5I5ISISSISlS5Sl5IS0SI5S5S5SI5lSl5Ev   
call68:_ZNK63p5lS5SISISlSl5lSlSl5SIS05l5SIS5I5ISI5SISlS5Sl5IS0SI5S5S5SI5lSl563p5lS5SISISlSl5lSlSl5SIS05l5SIS5I5ISI5SISIS5Sl5IS0SI5S5S5SI5lSl563p5lS5SISISlSl5lSlSl5SIS05l5SIS5I5ISISSISlS5Sl5IS0SI5S5S5SI5lSl5Ev     
call69:fdopen
call70:j__ZNK63p5lS5SISISlSl5lSlSl5SIS05l5SIS5I5ISI5SISlS5Sl5IS0SI5S5S5SI5lSl563p5lS5SISISlSl5lSlSl5SIS05l5SIS5I5ISI5SISIS5Sl5IS0SI5S5S5SI5lSl512validAddressEPvS1_
call71:_ZNK63p5lS5SISISlSl5lSlSl5SIS05l5SIS5I5ISI5SISlS5Sl5IS0SI5S5S5SI5lSl563p5lS5SISISlSl5lSlSl5SIS05l5SIS5I5ISI5SISIS5Sl5IS0SI5S5S5SI5lSl512validAddressEPvS1_
call72:__open_2
call73:mprotect
Process terminated
[Pixel 3XL::com.icbc ]->
 
Thank you forusing Frida!
```

不难看出在JNI_OnLoad中执行了一系列操作以及检测, 调用 "\_ZNK63p5lS5SISISlSl5lSlSl5SIS05l5SIS5I5ISI5SISlS5Sl5IS0SI5S5S5SI5lSl563p5lS5SISISlSl5lSlSl5SIS05l5SIS5I5ISI5SISIS5Sl5IS0SI5S5S5SI5lSl512validAddressEPvS1" 后进程被杀

直接搜索validaddress, 向上交叉引用发现JNI_OnLoad中调用了

"p5lS5SISISlSl5lSlSl5SIS05l5SIS5I5ISI5SISlS5Sl5IS0SI5S5S5SI5lSl5::p5lS5SISISlSl5lSlSl5SIS05l5SIS5I5ISI5SISIS5Sl5IS0SI5S5S5SI5lSl5::p5lS5SISISlSl5lSlSl5SIS05l5SIS5I5ISISSISlS5Sl5IS0SI5S5S5SI5lSl5"

很明显的检查操作并根据返回值决定是否杀掉进程, 没有调用exit, kill等函数, 而是jump 非法内存

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/23399b1244ead8fc.png)

## 绕过新检测点

观察if条件, 当该函数返回0时, if条件必定不满足, 那么hook replace该函数, 强制返回值为0便可以绕过

```javascript
functionhook_36390() {
    vartargetAddr = Module.findBaseAddress("libDexHelper.so").add(0x36390);
    // 定义替换函数
    varpatch_detection = newNativeCallback(function(arg0) {
        console.log(">>> 检测函数 sub_36390 已触发, 拦截并返回 0");
        return0; // 这里的返回值会自动存入 x0
    }, 'int', ['pointer']);
    // 实施替换
    Interceptor.replace(targetAddr, patch_detection);
 
}
functionhook_dlopen() {
    const funcName = "android_dlopen_ext";
    const libc = Module.findBaseAddress("libc.so");
    varfuncPtr = Module.findExportByName(null, funcName);
 
    if(funcPtr !== null&& funcPtr !== undefined) {
        console.log(`[*] Hooking ${funcName} at libc.so!0x${(funcPtr - libc.base).toString(16)}`);
 
        Interceptor.attach(funcPtr, {
            onEnter: function(args) {
                this.pathPtr = args[0];
 
                if(this.pathPtr !== null&& this.pathPtr !== undefined) {
                    try{
                        varpath = this.pathPtr.readCString();
                        console.log("\x1b[36m[dlopen] \x1b[0m"+ path);
                        if(path.indexOf("libDexHelper.so") !== -1) {
                            this.isTarget = true;
                        }
                    } catch(e) {
                        console.log("[!] Error reading path string in "+ this.funcName);
                    }
                }
            }, onLeave: function(retval) {
                if(this.isTarget) {
                    hook_36390();
                }
            }
        });
    } else{
        console.log("[-] Warning: "+ funcName + " not found in exports.");
    }
}
functionmain() {
    hook_dlopen();
}
setImmediate(main);
```

成功绕过该检测, 但仍有其他检测

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/bcfc0d98764dd057.png)

绕过该检测后继续尝试hook pthread_create 和 clone

```javascript
functionhook_pthread_create() {
    varpthread_create_addr = Module.findExportByName("libc.so", "pthread_create");
    console.log("pthread_create addr: ", pthread_create_addr);
    Interceptor.attach(pthread_create_addr, {
        onEnter: function(args) {
            varthread_func_addr = args[2];
            varmodule = Process.findModuleByAddress(thread_func_addr);
            console.log(`pthread_create thread func: ${module.name}+0x${(thread_func_addr - module.base).toString(16)}`);
        }, onLeave: function(retval) {
        }
    });
}
 
functionhook_clone() {
    varclone = Module.findExportByName('libc.so', 'clone');
    Interceptor.attach(clone, {
        onEnter: function(args) {
            //只有当 args[3] 不为 NULL 时，才说明上层确实把 “线程控制块指针” 传进来了
            if(args[3] != 0) {
                varthread_func_addr = args[3].add(96).readPointer()        // 真正的用户线程函数地址
                varmodule = Process.findModuleByAddress(thread_func_addr); // 根据线程函数地址 addr，找它属于哪个模块
                varoffset = (thread_func_addr - module.base);              // 获取相对于 base 的偏移
                if(module.name.indexOf("libDexHelper.so") != -1){
                    console.log(`[+]libc.so clone thread func: ${module.name}+0x${offset.toString(16)}`);
                }
            }
        }
    });
}
 
functionhook_36390() {
    vartargetAddr = Module.findBaseAddress("libDexHelper.so").add(0x36390);
    // 定义替换函数
    varpatch_detection = newNativeCallback(function(arg0) {
        //console.log(">>> 检测函数 sub_36390已触发, 拦截并返回 0");
        return0; // 这里的返回值会自动存入 x0
    }, 'int', ['pointer']);
    // 实施替换
    Interceptor.replace(targetAddr, patch_detection);
 
}
 
functionhook_dlopen() {
    const funcName = "android_dlopen_ext";
    const libc = Module.findBaseAddress("libc.so");
    varfuncPtr = Module.findExportByName(null, funcName);
 
    if(funcPtr !== null&& funcPtr !== undefined) {
        console.log(`[*] Hooking ${funcName} at libc.so!0x${(funcPtr - libc.base).toString(16)}`);
 
        Interceptor.attach(funcPtr, {
            onEnter: function(args) {
                this.pathPtr = args[0];
 
                if(this.pathPtr !== null&& this.pathPtr !== undefined) {
                    try{
                        varpath = this.pathPtr.readCString();
                        console.log("\x1b[36m[dlopen] \x1b[0m"+ path);
                        if(path.indexOf("libDexHelper.so") !== -1) {
                            this.isTarget = true;
                        }
                    } catch(e) {
                        console.log("[!] Error reading path string in "+ this.funcName);
                    }
                }
            }, onLeave: function(retval) {
                if(this.isTarget) {
                    hook_36390();
                    hook_clone();
                    //hook_pthread_create();// hook后进程依然会崩溃, 存在libc.so的pthread_create检测
                }
            }
        });
    } else{
        console.log("[-] Warning: "+ funcName + " not found in exports.");
    }
}
functionmain() {
    hook_dlopen();
}
setImmediate(main);
```

结果如下, hook pthread_create和旧版类似, 仍然会被杀(检测libc.so的pthread_create是否被hook)

但hook clone成功输出创建的检测线程 (此处可能出现6或7个, 似乎有2个并不是检测frida)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/3c80a0ffc4052855.png)

基于此, 同旧版类似, 尝试直接nop线程检测函数

```javascript
functionhook_36390() {
    vartargetAddr = Module.findBaseAddress("libDexHelper.so").add(0x36390);
    // 定义替换函数
    varpatch_detection = newNativeCallback(function(arg0) {
        //console.log(">>> 检测函数 sub_36390已触发, 拦截并返回 0");
        return0; // 这里的返回值会自动存入 x0
    }, 'int', ['pointer']);
    // 实施替换
    Interceptor.replace(targetAddr, patch_detection);
 
}
functionnopFunc(addr) {
    Memory.protect(addr, 4, 'rwx');  // 修改该地址的权限为可读可写
    varwriter = newArm64Writer(addr);
    writer.putRet();   // 直接将函数首条指令设置为ret指令
    writer.flush();    // 写入操作刷新到目标内存，使得写入的指令生效
    writer.dispose();  // 释放 Arm64Writer 使用的资源
    console.log("nop "+ addr + " success");
}
functionbypass_detect_func() {
    varbase = Module.findBaseAddress("libDexHelper.so");
    // nop 检测线程函数
    nopFunc(base.add(0x58404));
    nopFunc(base.add(0x54ef4))
    nopFunc(base.add(0x5fd78));
    nopFunc(base.add(0x5b218));
    nopFunc(base.add(0x602b0));
    nopFunc(base.add(0x667f4));
}
 
functionhook_dlopen() {
    const funcName = "android_dlopen_ext";
    const libc = Module.findBaseAddress("libc.so");
    varfuncPtr = Module.findExportByName(null, funcName);
 
    if(funcPtr !== null&& funcPtr !== undefined) {
        console.log(`[*] Hooking ${funcName} at libc.so!0x${(funcPtr - libc.base).toString(16)}`);
 
        Interceptor.attach(funcPtr, {
            onEnter: function(args) {
                this.pathPtr = args[0];
 
                if(this.pathPtr !== null&& this.pathPtr !== undefined) {
                    try{
                        varpath = this.pathPtr.readCString();
                        console.log("\x1b[36m[dlopen] \x1b[0m"+ path);
                        if(path.indexOf("libDexHelper.so") !== -1) {
                            this.isTarget = true;
                        }
                    } catch(e) {
                        console.log("[!] Error reading path string in "+ this.funcName);
                    }
                }
            }, onLeave: function(retval) {
                if(this.isTarget) {
                    hook_36390();
                    //hook_clone();
                    bypass_detect_func();
                }
            }
        });
    } else{
        console.log("[-] Warning: "+ funcName + " not found in exports.");
    }
}
functionmain() {
    hook_dlopen();
}
setImmediate(main);
```

绕过线程检测函数后成功进入app

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/80e9e71431785a0a.png)

至此可以得出结论: 新版相对旧版额外添加了检测函数0x36390, 绕过后和旧版思路基本相同

## libc & libart检测点

新旧版都检测了libc.so的pthread_create, 到底在哪里检测? 这是接下来的重点内容

在stalker_trace_so脚本中绕过检测并trace

```javascript
functionhook_36390() {
    vartargetAddr = Module.findBaseAddress("libDexHelper.so").add(0x36390);
    // 定义替换函数
    varpatch_detection = newNativeCallback(function(arg0) {
        //console.log(">>> 检测函数 sub_36390已触发, 拦截并返回 0");
        return0; // 这里的返回值会自动存入 x0
    }, 'int', ['pointer']);
    // 实施替换
    Interceptor.replace(targetAddr, patch_detection);
 
}
functionhook_pthread_create() {
    varpthread_create_addr = Module.findExportByName("libc.so", "pthread_create");
    console.log("pthread_create addr: ", pthread_create_addr);
    Interceptor.attach(pthread_create_addr, {
        onEnter: function(args) {
            varthread_func_addr = args[2];
            varmodule = Process.findModuleByAddress(thread_func_addr);
            //console.log("pthread_create called!")
            if(module&& module.name.indexOf("libDexHelper.so")>=0){
                console.log(`pthread_create thread func: ${module.name}+0x${(thread_func_addr - module.base).toString(16)}`);
            }
        }, onLeave: function(retval) {
        }
    });
}
functionnopFunc(addr) {
    Memory.protect(addr, 4, 'rwx');  // 修改该地址的权限为可读可写
    varwriter = newArm64Writer(addr);
    writer.putRet();   // 直接将函数首条指令设置为ret指令
    writer.flush();    // 写入操作刷新到目标内存，使得写入的指令生效
    writer.dispose();  // 释放 Arm64Writer 使用的资源
    console.log("nop "+ addr + " success");
}
functionbypass_detect_func() {
    varbase = Module.findBaseAddress("libDexHelper.so");
    // nop 检测线程函数
    nopFunc(base.add(0x58404));
    nopFunc(base.add(0x54ef4))
    nopFunc(base.add(0x5fd78));
    nopFunc(base.add(0x5b218));
    nopFunc(base.add(0x602b0));
    nopFunc(base.add(0x667f4));
   // nopFunc(base.add(0x594c8));
}
functionhook_dlopen() {
    Interceptor.attach(Module.findExportByName(null, "android_dlopen_ext"),
        {
            onEnter: function(args) {
                varpathptr = args[0];
                if(pathptr !== undefined && pathptr != null) {
                    varpath = ptr(pathptr).readCString();
                    //console.log(path);
                    if(path.indexOf(so_name) >= 0) {
                        this.is_can_hook = true;
                    }
                }
            },
            onLeave: function(retval) {
                if(this.is_can_hook) {
                    // note: you can do any thing before or after stalker trace so.
                    trace_so();
                    hook_36390();
                    bypass_detect_func();
                    hook_pthread_create();
                }
            }
        }
    );
}
```

可以发现最后崩溃时调用了几个函数,逐一查看后发现sub_54B20函数疑似检测libc和libart

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/24bd347fc668d3bf.png)

交叉引用可以发现该函数有多处调用, 并且传入了libart.so

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/f396ab2fd7d8ef92.png)

libc.so有1处调用, 并且根据结果判断是否要jump 非法内存退出

![33-bangbang-new-func-54b20-libc](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/623c2a3dc41c3c12.png)

绕过思路同上类似, replace该函数, 强制返回0, 打印函数参数观察检测了哪些东西

同时hook pthread_create观察进程是否会被杀

```javascript
functionhook_pthread_create() {
    varpthread_create_addr = Module.findExportByName("libc.so", "pthread_create");
    console.log("pthread_create addr: ", pthread_create_addr);
    Interceptor.attach(pthread_create_addr, {
        onEnter: function(args) {
            varthread_func_addr = args[2];
            varmodule = Process.findModuleByAddress(thread_func_addr);
            //console.log("pthread_create called!")
            if(module&& module.name.indexOf("libDexHelper.so")>=0){
                console.log(`pthread_create thread func: ${module.name}+0x${(thread_func_addr - module.base).toString(16)}`);
            }
        }, onLeave: function(retval) {
        }
    });
}
functionhook_36390() {
    vartargetAddr = Module.findBaseAddress("libDexHelper.so").add(0x36390);
    // 定义替换函数
    varpatch_detection = newNativeCallback(function(arg0) {
        //console.log(">>> 检测函数 sub_36390已触发, 拦截并返回 0");
        return0; // 这里的返回值会自动存入 x0
    }, 'int', ['pointer']);
    // 实施替换
    Interceptor.replace(targetAddr, patch_detection);
 
}
functionnopFunc(addr) {
    Memory.protect(addr, 4, 'rwx');  // 修改该地址的权限为可读可写
    varwriter = newArm64Writer(addr);
    writer.putRet();   // 直接将函数首条指令设置为ret指令
    writer.flush();    // 写入操作刷新到目标内存，使得写入的指令生效
    writer.dispose();  // 释放 Arm64Writer 使用的资源
    console.log("nop "+ addr + " success");
}
functionbypass_detect_func() {
    varbase = Module.findBaseAddress("libDexHelper.so");
    // nop 检测线程函数
    nopFunc(base.add(0x58404));
    nopFunc(base.add(0x54ef4))
    nopFunc(base.add(0x5fd78));
    nopFunc(base.add(0x5b218));
    nopFunc(base.add(0x602b0));
    nopFunc(base.add(0x667f4));
    nopFunc(base.add(0x594c8));
}
// 检测libart关键函数
functionhook_54b20() {
    vartargetAddr = Module.findBaseAddress("libDexHelper.so").add(0x54b20);
    // 定义替换函数
    varpatch_detection = newNativeCallback(function(arg0, arg1, arg2) {
        console.log(">>> 检测函数 sub_54b20 已触发, 拦截并返回 0");
        console.log("   arg0:", arg0);
        console.log("   arg1:", arg1.readCString());
        console.log("   arg2:", arg2.readCString());
        return0; // 这里的返回值会自动存入 x0
    }, 'int64', ['int', 'pointer', 'pointer']);
    // 实施替换
    Interceptor.replace(targetAddr, patch_detection);
}
functionhook_clone() {
    varclone = Module.findExportByName('libc.so', 'clone');
    Interceptor.attach(clone, {
        onEnter: function(args) {
            //只有当 args[3] 不为 NULL 时，才说明上层确实把 “线程控制块指针” 传进来了
            if(args[3] != 0) {
                varthread_func_addr = args[3].add(96).readPointer()        // 真正的用户线程函数地址
                varmodule = Process.findModuleByAddress(thread_func_addr); // 根据线程函数地址 addr，找它属于哪个模块
                varoffset = (thread_func_addr - module.base);              // 获取相对于 base 的偏移
                if(module.name.indexOf("libDexHelper.so") != -1){
                    console.log(`[+]libc.so clone thread func: ${module.name}+0x${offset.toString(16)}`);
                }
            }
        }
    });
}
functionhook_dlopen() {
    const funcName = "android_dlopen_ext";
    const libc = Module.findBaseAddress("libc.so");
    varfuncPtr = Module.findExportByName(null, funcName);
 
    if(funcPtr !== null&& funcPtr !== undefined) {
        console.log(`[*] Hooking ${funcName} at libc.so!0x${(funcPtr - libc.base).toString(16)}`);
 
        Interceptor.attach(funcPtr, {
            onEnter: function(args) {
                this.pathPtr = args[0];
 
                if(this.pathPtr !== null&& this.pathPtr !== undefined) {
                    try{
                        varpath = this.pathPtr.readCString();
                        console.log("\x1b[36m[dlopen] \x1b[0m"+ path);
                        if(path.indexOf("libDexHelper.so") !== -1) {
                            this.isTarget = true;
                        }
                    } catch(e) {
                        console.log("[!] Error reading path string in "+ this.funcName);
                    }
                }
            }, onLeave: function(retval) {
                if(this.isTarget) {
                    hook_36390();
                    bypass_detect_func();
                    hook_54b20();  
                    hook_clone();
                    hook_pthread_create();
                }
            }
        });
    } else{
        console.log("[-] Warning: "+ funcName + " not found in exports.");
    }
}
functionmain() {
    hook_dlopen();
}
setImmediate(main);
```

可以发现成功绕过了检测libc.so

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/66ece10d40ab027a.png)

那么libart.so在哪里检测的呢? 只需要注释 bypass_detect_func (nop线程检测函数) 即可

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/53fff26b23a095f5.png)

完整日志如下, libart主要检测用于注册/注销native方法的函数, 以及修复静态类的跳板函数

```python
>>> 检测函数 sub_54b20 已触发, 拦截并返回 0
   arg0: 29
   arg1: libc.so       
   arg2: pthread_create
>>> 检测函数 sub_54b20 已触发, 拦截并返回 0
   arg0: 29
   arg1: libart.so
   arg2: _ZN3art6mirror9ArtMethod14RegisterNativeEPNS_6ThreadEPKvb
>>> 检测函数 sub_54b20 已触发, 拦截并返回 0
   arg0: 29
   arg1: libart.so
   arg2: _ZN3art6mirror9ArtMethod16UnregisterNativeEPNS_6ThreadE
>>> 检测函数 sub_54b20 已触发, 拦截并返回 0
   arg0: 29
   arg1: libart.so
   arg2: _ZN3art9ArtMethod14RegisterNativeEPKvb
>>> 检测函数 sub_54b20 已触发, 拦截并返回 0
   arg0: 29
   arg1: libart.so
   arg2: _ZN3art9ArtMethod16UnregisterNativeEv
>>> 检测函数 sub_54b20 已触发, 拦截并返回 0
   arg0: 29
   arg1: libart.so
   arg2: _ZN3art9ArtMethod14RegisterNativeEPKv
>>> 检测函数 sub_54b20 已触发, 拦截并返回 0
   arg0: 29
   arg1: libart.so
   arg2: _ZN3art11ClassLinker14RegisterNativeEPNS_6ThreadEPNS_9ArtMethodEPKv
>>> 检测函数 sub_54b20 已触发, 拦截并返回 0
   arg0: 29
   arg1: libart.so
   arg2: _ZN3art11ClassLinker16UnregisterNativeEPNS_6ThreadEPNS_9ArtMethodE
>>> 检测函数 sub_54b20 已触发, 拦截并返回 0
   arg0: 29
   arg1: libart.so
   arg2: _ZN3art11ClassLinker22FixupStaticTrampolinesENS_6ObjPtrINS_6mirror5ClassEEE
>>> 检测函数 sub_54b20 已触发, 拦截并返回 0
   arg0: 29
   arg1: libart.so
   arg2: _ZN3art11ClassLinker22FixupStaticTrampolinesEPNS_6ThreadENS_6ObjPtrINS_6mirror5ClassEEE
>>> 检测函数 sub_54b20 已触发, 拦截并返回 0
   arg0: 29
   arg1: libart.so
   arg2: _ZN3art11ClassLinker22FixupStaticTrampolinesEPNS_6mirror5ClassE
```

关于绕过某\*加固的新版和旧版frida检测的绕过至此结束, 以上分析比较基础, 没有深入检测原理, 以及深究是否存在其他检测

整理时发现不够细心没考虑到不同情况导致走了很多弯路, 下面介绍trace指令流定位而非函数调用链定位

以下内容基于最初认为: 新版加固没有创建线程检测函数 (不走pthread_create以及clone,可能有其他创建线程的骚操作), 而是在JNI_OnLoad进行所有检测, 仅通过stalker_trace_so无法成功定位, 必须使用更强大的trace工具, 从trace函数调用链向指令流进发

## VM Trace

那么,回到最开始的地方: hook pthread_create, 并通过trace JNI_OnLoad的指令流定位检测点

工具使用追佬的 [vm-trace](https://github.com/jiqiu2022/vm-trace-release), 详情可参考文章 [\[原创\]基于VM的全新Trace框架发布!功能强大,一分钟1.5g，提高你的逆向体验~](https://bbs.kanxue.com/thread-285471.htm)

使用前需要准备环境:

1.  Android 14以下的测试机
    
2.  推送test.so到app私有目录 "/data/data/<package_name>/"
    
    由于我的Pixel 3XL Android10关闭selinux后有bug, 不能spawn启动app
    
    所以不将test.so推送到/data/local/tmp, 而是app私有目录
    
    虽然提取log更麻烦但不需要额外权限
    

脚本如下:

-   hook_soload 和 prepareArgs 是原脚本自带的函数
    
    hook_soload主动加载了test.so到app中, 加载目标so后执行hook和trace函数
    
-   hook_JNI_OnLoad 是hook函数模版, 用于hook指定地址的函数, 可自定义
    
    设置好函数偏移地址即可, 注意函数参数个数和类型不能弄错
    
    调用了test.so的vmtrace进行trace
    
-   test.so和log均使用app私有目录
    

```javascript
functionprepareArgs(args) {
    if(args === undefined || !Array.isArray(args)) {
        args = [];
    }
    varargNum = args.length;
    varargSize = Process.pointerSize * argNum;
    varargsPtr = Memory.alloc(argSize);
 
    for(vari = 0; i < argNum; i++) {
        vararg = args[i];
        varargPtr;
        if(!arg) {
            arg = 0
        }
        if(arg instanceofNativePointer) {
            // 如果是 NativePointer，直接使用
            argPtr = arg;
        } elseif(typeofarg === 'number') {
            // 如果是数字，直接转换为指针
            argPtr = ptr(arg);
        } elseif(typeofarg === 'string') {
            // 如果是字符串，分配内存并获取指针
            argPtr = Memory.allocUtf8String(arg);
        } elseif(typeofarg === 'object'&& arg.hasOwnProperty('handle')) {
            // 如果是带有 handle 属性的对象（如 JNIEnv）
            argPtr = arg.handle;
        } elseif(typeofarg === 'object'&& arg instanceofArrayBuffer) {
            // 如果是二进制数据，分配内存并写入数据
            vardataPtr = Memory.alloc(arg.byteLength);
            Memory.writeByteArray(dataPtr, arg);
            argPtr = dataPtr;
        } else{
            console.error('Unsupported argument type at index '+ i + ':', typeofarg);
            thrownewTypeError('Unsupported argument type at index '+ i + ': '+ typeofarg);
        }
 
        // 将参数指针写入参数数组
        Memory.writePointer(argsPtr.add(i * Process.pointerSize), argPtr);
    }
 
    return{
        argsPtr: argsPtr,
        argNum: argNum
    };
}
 
varvmtraceAddr;
varvmtrace;
 
functionhook_pthread_create() {
    varpthread_create_addr = Module.findExportByName("libc.so", "pthread_create");
    console.log("pthread_create addr: ", pthread_create_addr);
    Interceptor.attach(pthread_create_addr, {
        onEnter: function(args) {
            varthread_func_addr = args[2];
            varmodule = Process.findModuleByAddress(thread_func_addr);
            if(module&& module.name.indexOf("libDexHelper.so")>=0){
                console.log(`pthread_create thread func: ${module.name}+0x${(thread_func_addr - module.base).toString(16)}`);
            }
        }, onLeave: function(retval) {
        }
    });
}
 
functionhook_JNI_OnLoad() {
    varaimbase = Module.findBaseAddress("libDexHelper.so");
    console.log("start hook libDexHelper.so JNI_OnLoad");
    vartargetFuncAddr = aimbase.add(0x36618);
    Interceptor.replace(targetFuncAddr, newNativeCallback(function(arg0, arg1) {  // 注意参数个数
        console.log("[+] trace JNI_OnLoad");
        Interceptor.revert(targetFuncAddr);
        Interceptor.flush();
        varargs = [arg0, arg1];    // 注意函数参数个数
        var{ argsPtr, argNum } = prepareArgs(args);
        varargPtr1 = Memory.allocUtf8String("/data/data/com.icbc/log.txt");    // log写入app私有目录
        varres = vmtrace(targetFuncAddr, argsPtr, argNum, argPtr1, 0);         // 开始trace
        console.log(res)
        returnres;
    }, 'int', ['pointer', 'pointer'])); // 注意参数和返回值类型
}
 
functionhook_soload() {
    vardlopenPtr = Module.findExportByName(null, 'dlopen');
    vardlopen = newNativeFunction(dlopenPtr, 'pointer', ['pointer', 'int']);
    varsoPath = "/data/data/com.icbc/test.so";     
    varsoPathPtr = Memory.allocUtf8String(soPath);
    varhandle = dlopen(soPathPtr, 2);              // 主动加载so用于trace
    console.log(handle);
    vmtraceAddr = Module.findExportByName("test.so", 'vm_call');
    console.log("vmtraceAddr: ", vmtraceAddr);
    vmtrace = newNativeFunction(vmtraceAddr, 'pointer', ['pointer', 'pointer', 'uint32', 'pointer', 'uint32']);
 
    varisinit = 0;
    vardlopen_addr = Module.findExportByName(null, "android_dlopen_ext");
    varfind = 0;
    console.log("android_dlopen_ext: ", dlopen_addr);
    Interceptor.attach(dlopen_addr, {
        onEnter: function(args) {
            varaddr = args[0];
            varstr = ptr(addr).readCString();
            this.name = str;
 
            console.log("dlopen: "+ str);
            if(str.indexOf("libDexHelper.so") >= 0) {
                console.log("dlopen==> "+ (str));
                find = 1;
            } else{
                find = 0;
            }
        },
        onLeave: function(retval) {
            if(find > 0) {
                if(isinit == 0) {
                    hook_JNI_OnLoad();
                    hook_pthread_create();
                    isinit = 1;
                }
            }
        }
    })
}
setImmediate(hook_soload)
```

spawn模式启动

```python
frida -Uf com.icbc -l vmtrace.js
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/9237c3b5d1458feb.png)

这里有个小技巧:

我们的主要目的是定位崩溃点和检测函数, 而非根据trace还原算法

log.txt可能几千万行代码, 4-5GB, 提取到pc再分析太慢, 使用tail命令打印最后几行trace即可

tail命令默认打印10行, 可通过-n参数指定行数

不难发现在0x382c4处跳转到非法内存0x12dc导致app进程被杀

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/9c2d7b34514cd1ee.png)

跟进so发现关键检测函数, 根据上述内容, 直接hook replace该函数并强制返回0即可绕过

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/0a697e8a16d34eba.png)

绕过函数

```javascript
functionhook_36390() {
    vartargetAddr = Module.findBaseAddress("libDexHelper.so").add(0x36390);
    // 定义替换函数
    varpatch_detection = newNativeCallback(function(arg0) {
        console.log(">>> 检测函数 sub_36390 已触发, 拦截并返回 0");
        return0; // 这里的返回值会自动存入 x0
    }, 'int', ['pointer']);
    // 实施替换
    Interceptor.replace(targetAddr, patch_detection);
}
```

trace结果, 成功绕过

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/72ae6510fbf99f56.png)

新的崩溃点在0x3a5d8

![40-bangbang-new-vmtrace-result2](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/e274603e7d840e5a.png)

跟进后发现调用sub_54B20后根据返回值判断是否jump非法内存

而54b20前文提到过, 用于检测libc.so和libart.so的关键函数是否被hook

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/916ff99cf9d74a80.png)

同上, replace该函数, 强制返回0

```javascript
functionhook_54b20() {
    vartargetAddr = Module.findBaseAddress("libDexHelper.so").add(0x54b20);
    // 定义替换函数
    varpatch_detection = newNativeCallback(function(arg0, arg1, arg2) {
        console.log(">>> 检测函数 sub_54b20 已触发, 拦截并返回 0");
        console.log("   arg0:", arg0);
        console.log("   arg1:", arg1.readCString());
        console.log("   arg2:", arg2.readCString());
        return0; // 这里的返回值会自动存入 x0
    }, 'int64', ['int', 'pointer', 'pointer']);
    // 实施替换
    Interceptor.replace(targetAddr, patch_detection);
}
```

绕过该检测后trace发现hook pthread_create成功, 打印出检测线程函数

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/899a948f7f67a512.png)

同上nop这些检测函数即可

```javascript
functionnopFunc(addr) {
    Memory.protect(addr, 4, 'rwx');  // 修改该地址的权限为可读可写
    varwriter = newArm64Writer(addr);
    writer.putRet();   // 直接将函数首条指令设置为ret指令
    writer.flush();    // 写入操作刷新到目标内存，使得写入的指令生效
    writer.dispose();  // 释放 Arm64Writer 使用的资源
    console.log("nop "+ addr + " success");
}
functionbypass_detect_func() {
    varbase = Module.findBaseAddress("libDexHelper.so");
    // nop 检测线程函数
    nopFunc(base.add(0x58404));
    nopFunc(base.add(0x54ef4))
    nopFunc(base.add(0x5fd78));
    nopFunc(base.add(0x5b218));
    nopFunc(base.add(0x602b0));
    nopFunc(base.add(0x667f4));
    nopFunc(base.add(0x594c8));
}
```

绕过检测函数后成功进入app

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/6390810c10bf06e1.png)

另外虽然此处崩溃, 但trace结果反复循环一段代码, 即单字节读取maps的内容

![43-bangbang-new-vmtrace-result3](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/972e6c4305f1b78f.png)

跟进发现代码属于sub_5d368函数, 扫描maps

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/c0f854ccee267d61.png)

值得一提的是之前使用stalker_trace_so没有发现该函数, 不hook该函数也能正常绕过检测

测试发现如果trace JNI_OnLoad, 无论是否hook该函数都会崩溃, 推测有其他检测, 或者trace对环境有影响

不hook 5D368时

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/9eac1c8e1f93b57f.png)

hook 5D368时

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/d576f593b94dab06.png)

trace结果如下 (两次trace报错结果一致)

![48-bangbang-new-vmtrace-result4](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/cd9cac08d51cc315.png)

## 其他检测函数

列举分析过程中遇到的检测函数和疑似的检测函数

### inline hook 0xae1f4

函数内部有多处疑似inline hook检测的特征

![46-inline-hook-detect](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/4f4324f22a8b5958.png)

交叉引用该函数发现疑似hook 了自身的read, open, openat等函数

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/c2ebd5fdbf4fa605.png)

所以该函数大概率是hook自身的read/open系列函数, 使用自定义的函数, 防止被逆向人员hook

在尝试hook ae1f4后会导致崩溃, 即执行到frida的hook跳转代码后被识别为非法内存

### maps检测 0x42098

0x42098函数伪代码如下, 打开maps后单字节读取指定so的部分内存属性, 但没有杀进程

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/6a6a05bba52b3c82.png)

### 特征检测 0x32e64

检测root, frida, xposed, hook等特征

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/9f5d576cab2a2ed8.png)

## SoFixer导入表符号问题

使用原版 [SoFixer](https://github.com/F8LEFT/SoFixer) 会出现导入表符号不匹配问题  
如图所示左边是正确符号,右边是错误符号, 非常影响分析  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/3151779c6e85059f.webp)  
修复方案参考 [\[原创\] SoFixer导入表问题修复及ELF解析简记](https://bbs.kanxue.com/thread-282221.htm) 但修复版 [SoFixer](https://github.com/Chenyangming9/SoFixer) 没有Release包  
感谢小风提供编译好的修复版 [SoFixer](https://github.com/LunFengChen/SoFixer)

## References

[【APP 逆向百例】某当劳 Frida 检测](https://www.freebuf.com/articles/others-articles/447681.html)

[从inlinehook角度检测frida](https://bbs.kanxue.com/thread-269862.htm)

[\[原创\]《安卓逆向这档事》第十九课、表哥，你也不想你的Frida被检测吧!(下)](https://bbs.kanxue.com/thread-282623.htm)

[\[原创\]基于VM的全新Trace框架发布!功能强大,一分钟1.5g，提高你的逆向体验~](https://bbs.kanxue.com/thread-285471.htm)

[#逆向分析](https://bbs.kanxue.com/forum-161-1-118.htm) [#HOOK注入](https://bbs.kanxue.com/forum-161-1-125.htm)

* * *

## 评论

> **寻梦之璐 · 2 楼**
> 
> 666

> **ChenSem · 3 楼**
> 
> 表哥牛逼

> **夜惜风雨 · 4 楼**
> 
> 66666666666

> **棕熊 · 5 楼**
> 
> 太强了，支持一波～

> **东方玻璃 · 6 楼**
> 
> > [棕熊](https://bbs.kanxue.com/user-967562.htm) 太强了，支持一波～
> 
> 感谢佬的vmtrace,强推 ![](https://bbs.kanxue.com/view/img/face/003.gif)

> **丶咖啡猫丶 · 7 楼**
> 
> 666

> **git_94730eaydwshawke-gif · 8 楼**
> 
> 前排

> **\_thouger · 9 楼**
> 
> 牛逼

> **mb_mlyojneh · 10 楼**
> 
> 太强了

> **mb_lakweznz · 11 楼**
> 
> 太厉害了

> **bullyxy · 12 楼**
> 
> 太厉害了!!

> **嘎嘎真的很棒 · 13 楼**
> 
> 太厉害了!!

> **机车王子 · 14 楼**
> 
>   
> 你的帖子非常有用，感谢分享！

> **ldehua · 15 楼**
> 
> 太厉害了!!

> **artake · 16 楼**
> 
> 很经典的过检测文章。

> **我不是卷王 · 17 楼**
> 
> 66

> **Yangser · 18 楼**
> 
> 已严肃学习

> **mb_asiwnxyv · 19 楼**
> 
> 感谢分享

> **wx\_故事与酒 · 20 楼**
> 
> 666666666666666666666666666

> **mb_qimctavn · 21 楼**
> 
> 6

> **cpannn · 22 楼**
> 
> 66666

> **xianhuimin · 23 楼**
> 
> tql，666

> **mb_ldbucrik · 24 楼**
> 
> 感谢分享

> **黑屏 · 25 楼**
> 
> 6666
