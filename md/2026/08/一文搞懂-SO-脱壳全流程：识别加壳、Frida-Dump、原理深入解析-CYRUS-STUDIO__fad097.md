---
title: 一文搞懂 SO 脱壳全流程：识别加壳、Frida Dump、原理深入解析 // CYRUS STUDIO
source: https://cyrus-studio.github.io/blog/posts/%E4%B8%80%E6%96%87%E6%90%9E%E6%87%82-so-%E8%84%B1%E5%A3%B3%E5%85%A8%E6%B5%81%E7%A8%8B%E8%AF%86%E5%88%AB%E5%8A%A0%E5%A3%B3frida-dump%E5%8E%9F%E7%90%86%E6%B7%B1%E5%85%A5%E8%A7%A3%E6%9E%90/
source_host: cyrus-studio.github.io
clip_date: 2026-08-04T13:53:27+08:00
trace_id: 752bca44-31ee-4696-aaf3-104823e06622
content_hash: 1bbafa549248a2c7ec6ac8ecfc14407db91c41a2246cbb0d510829b0e255882d
status: synced
tags:
  - Android逆向
  - 脱壳与加固
series: null
feed_source: Cyrus Studio·安卓逆向
ai_summary: 通过 Frida 从内存转储加壳 SO 并用 SoFixer 修复链接视图，即可完成 SO 脱壳。
ai_summary_style: key-points
images_status:
  total: 7
  succeeded: 7
  failed_urls: []
notion_page_id: 3b275244-d011-81ca-b7da-d16f923ec342
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 通过 Frida 从内存转储加壳 SO 并用 SoFixer 修复链接视图，即可完成 SO 脱壳。
> 
> - **加壳识别：** IDA 打开 SO 时出现 ELF 结构无法解析、section 无效、大量红色汇编代码块等异常，通常表明 SO 已加壳或混淆。
> - **脱壳工具：** `frida_dump` 通过 Frida 连接进程，执行 `python dump_so.py 目标SO名` 可将内存中解密后的 SO 转储为 `.dump.so`，并自动调用 SoFixer 修复生成 `.fix.so`。
> - **修复必要性：** 内存 dump 出的数据是程序执行视图（以 segment 为主），缺少 SO 链接视图（以 section 为主）中的节头表等信息，SoFixer 重建 ELF 结构后 IDA 才能正常解析。
> - **模块定位原理：** Frida 遍历 Android linker 内部维护的 `soinfo` 单向链表（全局 `solist`），获取目标 SO 的基址和大小，作为 dump 的范围依据；也可通过脚本的 `findmodule` 和 `allmodule` 手动查询模块信息。

> 版权归作者所有，如有转发，请注明文章出处： [https://cyrus-studio.github.io/blog/](https://cyrus-studio.github.io/blog/)

## 如何快速判断 SO 是否加壳

使用 IDA 打开 so 提示无法正确识别 ELF 文件结构。

[![word/media/image1.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/7c11e655bdc1877a.png)](data:image/png;base64,inline-54154B)

section 定义无效或不符合预期格式。

[![word/media/image2.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/45f23c05e409e285.png)](data:image/png;base64,inline-39762B)

有很多红色的汇编代码块，表示错误或者未能正常解析的地址/数据

[![word/media/image3.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/11ee83042976d070.png)](data:image/png;base64,inline-296690B)

这通常就是 so 可能被“混淆”、“裁剪”或“加壳”了。

## Frida Dump 脱壳实战

frida_dump 是基于 frida 的 so 和 dex 的脱壳工具。

-   开源地址： [https://github.com/lasting-yang/frida_dump](https://github.com/lasting-yang/frida_dump)
    
-   关于 Frida 的使用参考： [一文搞懂如何使用 Frida Hook Android App](https://cyrus-studio.github.io/blog/posts/%E4%B8%80%E6%96%87%E6%90%9E%E6%87%82%E5%A6%82%E4%BD%95%E4%BD%BF%E7%94%A8-frida-hook-android-app/)
    

先把 frida_dump 源码 clone 到本地。

如果使用的是远程链接，把 dump_so.py 中的

```
device: frida.core.Device = frida.get_usb_device()
```

改成

```
device = frida.get_device_manager().add_remote_device("127.0.0.1:1234")
```

比如目标 so 是 libGameVMP.so，通过下面命令执行 dump_so.py

```
python dump_so.py libGameVMP.so
```

输出如下：

```lua
(anti-app) PS D:\Python\anti-app\frida_dump> python dump_so.py libGameVMP.so
{'name': 'libGameVMP.so', 'base': '0x7bd7b81000', 'size': 462848, 'path': '/data/app/com.shizhuang.duapp-fTxemmnM8l6298xbBELksQ==/lib/arm64/libGameVMP.so'}
libGameVMP.so.dump.so
android/SoFixer64: 1 file pushed, 0 skipped. 66.8 MB/s (186656 bytes in 0.003s)
libGameVMP.so.dump.so: 1 file pushed, 0 skipped. 217.6 MB/s (462848 bytes in 0.002s)
adb shell /data/local/tmp/SoFixer -m 0x7bd7b81000 -s /data/local/tmp/libGameVMP.so.dump.so -o /data/local/tmp/libGameVMP.so.dump.so.fix.so
[main_loop:87]start to rebuild elf file
[Load:69]dynamic segment have been found in loadable segment, argument baseso will be ignored.
[RebuildPhdr:25]=============LoadDynamicSectionFromBaseSource==========RebuildPhdr=========================
[RebuildPhdr:37]=====================RebuildPhdr End======================
[ReadSoInfo:549]=======================ReadSoInfo=========================
[ReadSoInfo:696]soname
[ReadSoInfo:621] constructors (DT_INIT) found at 1bd68
[ReadSoInfo:629] constructors (DT_INIT_ARRAY) found at 6e9e8
[ReadSoInfo:633] constructors (DT_INIT_ARRAYSZ) 27
[ReadSoInfo:637] destructors (DT_FINI_ARRAY) found at 6eac0
[ReadSoInfo:641] destructors (DT_FINI_ARRAYSZ) 2
[ReadSoInfo:580]string table found at ec0
[ReadSoInfo:584]symbol table found at 518
[ReadSoInfo:595] plt_rel_count (DT_PLTRELSZ) 93
[ReadSoInfo:591] plt_rel (DT_JMPREL) found at 1c78
[ReadSoInfo:699]Unused DT entry: type 0x00000009 arg 0x00000018
[ReadSoInfo:699]Unused DT entry: type 0x00000018 arg 0x00000000
[ReadSoInfo:699]Unused DT entry: type 0x6ffffffb arg 0x00000001
[ReadSoInfo:699]Unused DT entry: type 0x6ffffffe arg 0x000012d0
[ReadSoInfo:699]Unused DT entry: type 0x6fffffff arg 0x00000003
[ReadSoInfo:699]Unused DT entry: type 0x6ffffff0 arg 0x00001202
[ReadSoInfo:699]Unused DT entry: type 0x6ffffff9 arg 0x0000004c
[ReadSoInfo:703]=======================ReadSoInfo End=========================
[RebuildShdr:42]=======================RebuildShdr=========================
[RebuildShdr:536]=====================RebuildShdr End======================
[RebuildRelocs:783]=======================RebuildRelocs=========================
[RebuildRelocs:809]=======================RebuildRelocs End=======================
[RebuildFin:709]=======================try to finish file rebuild =========================
[RebuildFin:733]=======================End=========================
[main:123]Done!!!
/data/local/tmp/libGameVMP.so.dump.so.fix.so: 1 file pulled, 0 skipped. 18.6 MB/s (463793 bytes in 0.024s)
libGameVMP.so_0x7bd7b81000_462848_fix.so
```

可以看到本地多个一个 \_fix 后缀的 so 文件，这个就是 脱壳并修复好的 so。

[![word/media/image4.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/704b6241c1e3185e.png)](data:image/png;base64,inline-31354B)

使用 ida 打开 so 可以看到能正常打开，而且多了很多函数，代码块都能正常识别。

[![word/media/image5.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/02b5655880cdcc81.png)](data:image/png;base64,inline-233366B)

## 查找目标 SO（单个 & 批量打印所有 SO）

除了用来脱壳 so ，也可以用 dump_so.js 中的函数查找 so 或打印所有 so 信息。

执行 dump_so.js 脚本

```
frida -H 127.0.0.1:1234 -F -l dump_so.js
```

输出如下：

```rust
[Remote::cyrus]-> rpc.exports.findmodule("libGameVMP.so")
{
    "base": "0x7b6ae0e000",
    "name": "libGameVMP.so",
    "path": "/data/app/com.shizhuang.duapp-fTxemmnM8l6298xbBELksQ==/lib/arm64/libGameVMP.so",
    "size": 462848
}
[Remote::cyrus]-> rpc.exports.allmodule()
[
    {
        "base": "0x6545887000",
        "name": "app_process64",
        "path": "/system/bin/app_process64",
        "size": 40960
    },
    {
        "base": "0x7c69419000",
        "name": "linker64",
        "path": "/system/bin/linker64",
        "size": 225280
    },
    ...
]
```

## Frida Dump 中 SO 脱壳流程解析

1、使用 Frida 连接目标 Android 进程，加载 dump_so.js 脚本。

```css
def read_frida_js_source():
    with open("dump_so.js", "r") as f:
        return f.read()


def on_message(message, data):
    pass


if __name__ == "__main__":
    # device: frida.core.Device = frida.get_usb_device()
    device = frida.get_device_manager().add_remote_device("127.0.0.1:1234")
    pid = device.get_frontmost_application().pid
    session: frida.core.Session = device.attach(pid)
    script = session.create_script(read_frida_js_source())
    script.on('message', on_message)
    script.load()
```

2、在 dump_so.js 的 dumpmodule 中获取目标.so 文件的基地址和大小，返回内存中的 so 数据

```javascript
rpc.exports = {
    findmodule: function(so_name) {
        var libso = Process.findModuleByName(so_name);
        return libso;
    },
    dumpmodule: function(so_name) {
        // 根据 so_name 查找已加载的模块（共享库）
        var libso = Process.findModuleByName(so_name);
        
        // 如果没找到对应模块，返回 -1 表示失败
        if (libso == null) {
            return -1;
        }
        
        // 修改模块内存权限为 可读(r)、可写(w)、可执行(x)
        // 这样后面才能安全地读取和修改该内存区域
        Memory.protect(ptr(libso.base), libso.size, 'rwx');
        
        // 从模块基址开始，读取整个模块大小的字节数组
        var libso_buffer = ptr(libso.base).readByteArray(libso.size);
        
        // 把读取到的字节数组缓存到 libso 对象的 buffer 属性，方便后续使用
        libso.buffer = libso_buffer;
        
        // 返回读取到的字节数组
        return libso_buffer;        
    },
    allmodule: function() {
        return Process.enumerateModules()
    },
    arch: function() {
        return Process.arch;
    }
}
```

3、从内存中转储目标.so 文件，保存为 <name>.dump.so。

```python
module_buffer = script.exports.dumpmodule(origin_so_name)
if module_buffer != -1:
    dump_so_name = origin_so_name + ".dump.so"
    print(dump_so_name)

    with open(dump_so_name, "wb") as f:
        f.write(module_buffer)
        f.close()
```

4、使用 SoFixer 工具修复转储的内存数据，重建 ELF 文件结构，使 IDA 可以正常识别。

5、下载修复后的.so 文件到本地，清理设备上的临时文件。

```css
def fix_so(arch, origin_so_name, so_name, base, size):
    if arch == "arm":
        os.system("adb push android/SoFixer32 /data/local/tmp/SoFixer")
    elif arch == "arm64":
        os.system("adb push android/SoFixer64 /data/local/tmp/SoFixer")
    os.system("adb shell chmod +x /data/local/tmp/SoFixer")
    os.system("adb push " + so_name + " /data/local/tmp/" + so_name)
    print("adb shell /data/local/tmp/SoFixer -m " + base + " -s /data/local/tmp/" + so_name + " -o /data/local/tmp/" + so_name + ".fix.so")
    os.system("adb shell /data/local/tmp/SoFixer -m " + base + " -s /data/local/tmp/" + so_name + " -o /data/local/tmp/" + so_name + ".fix.so")
    os.system("adb pull /data/local/tmp/" + so_name + ".fix.so " + origin_so_name + "_" + base + "_" + str(size) + "_fix.so")
    os.system("adb shell rm /data/local/tmp/" + so_name)
    os.system("adb shell rm /data/local/tmp/" + so_name + ".fix.so")
    os.system("adb shell rm /data/local/tmp/SoFixer")

    return origin_so_name + "_" + base + "_" + str(size) + "_fix.so"
```

## 为什么要用 SoFixer 进行修复

dump 下来的.so 是执行视图（段为主），而 IDA 需要的是链接视图（节为主），SoFixer 就是桥梁，用来还原链接视图结构。

[![word/media/image6.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/f606389457d1c437.png)](data:image/png;base64,inline-51766B)

SoFixer 开源地址： [https://github.com/F8LEFT/SoFixer](https://github.com/F8LEFT/SoFixer)

## 如何定位内存中的目标 SO

Frida 在 Android 上枚举模块（如 Process.enumerateModules()）时，核心机制是：👉 遍历 linker（动态链接器）内部维护的 soinfo 链表，dlopen 成功后，linker 会将.so 加入 solist。

frida-gum 是 Frida 内部用来实现这些功能的核心组件，Frida-Gum 是 Frida 的底层动态插桩引擎，提供跨平台的 C/C++ 接口。

开源地址： [https://github.com/frida/frida-gum](https://github.com/frida/frida-gum)

frida 在 android 下 Process.enumerateModules() 的调用链大概如下：

```ruby
gum_android_enumerate_modules
  └── 枚举 Android 中已加载模块的统一入口，对外暴露 API。
  
  └── gum_enumerate_soinfo
        ├── gum_linker_api_get
        │     └── 获取 linker API（dlopen、solist 等）的单例结构。
        │
        │     └── gum_linker_api_try_init
        │           └── 初始化 linker API，识别 linker 结构，并提取关键符号地址。
        │
        │           └── gum_android_get_linker_module
        │                 └── 获取 linker 自身的 GumModule 实例（包含 ELF 基址等信息）。
        │
        │                 └── gum_try_init_linker_module   ← maps查找linker
        │                       └── 遍历 /proc/self/maps，查找 `/linker` 或 `/linker64` 映射段，
        │                           构造用于后续符号查找的 `GumModule`。
        │
        └── for (si = api->solist_get_head (); carry_on && si != NULL; si = next)
              └── 遍历 linker 内部维护的 `soinfo` 链表，代表所有已加载模块（包括 `dlopen` 的模块）。
              
              └── gum_emit_module_from_soinfo
                    └── 将每个 `soinfo` 对象转换为 `GumModule` 结构，提取模块名、基址、路径、大小等信息。
                    
                    └── 回调用户传入的 func(GumModule*)，最终将模块信息传给调用方
```

[https://github.com/frida/frida-gum/blob/d83ae3ea30f7de5dad23d763a0724b5e9d451e47/gum/backend-linux/gumandroid.c#L917](https://github.com/frida/frida-gum/blob/d83ae3ea30f7de5dad23d763a0724b5e9d451e47/gum/backend-linux/gumandroid.c#L917)

所以 frida 是通过 solist 找到内存中的 so 信息的。

## 脱壳点：solist 与 soinfo

脱壳的关键：定位解密后的.so 在内存中的地址和大小，dump 出来再修复结构即可。

solist 是 linker 中的静态变量，把 linker64 拉取到本地：

```
 adb pull  /apex/com.android.runtime/bin/linker64
```

可以看到 solist 位于.bss 段，其真实符号是 \__dl\__ZL6solist

[![word/media/image7.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/cfdc4ceb002af6f8.png)](data:image/png;base64,inline-136306B)

solist 在 android 源码中定义如下：

```
static soinfo* solist;
```

[https://cs.android.com/android/platform/superproject/+/android10-release:bionic/linker/linker_main.cpp;l=71](https://cs.android.com/android/platform/superproject/+/android10-release:bionic/linker/linker_main.cpp;l=71)

在 Android linker 源码中，soinfo 是一个结构体，用来记录每个已加载.so 模块的各种信息：

```cpp
struct soinfo {
  const char* name;  // 共享库的文件名（通常是 .so 文件的路径或名称）
  Elf_Addr    base;  // 共享库加载到内存的基地址
  size_t      size;  // 共享库在内存中的大小（以字节为单位）
  ...             
  soinfo*     next;  // 指向链表中下一个已加载共享库的 soinfo 结构体的指针
};
```

[https://cs.android.com/android/platform/superproject/+/android10-release:bionic/linker/linker_soinfo.h;l=116](https://cs.android.com/android/platform/superproject/+/android10-release:bionic/linker/linker_soinfo.h;l=116)

在 Android 的动态链接器（linker）中，soinfo 结构体的 next 字段用于构建一个单向链表，指向下一个已加载的共享库（.so 文件）。通过全局的 solist（共享库列表的头节点），可以遍历所有已加载的共享库。

因此，通过 solist 可以轻松找到所有已加载的库，再通过 soinfo 的 base 和 size 把 so 从内存 dump 到本地。
