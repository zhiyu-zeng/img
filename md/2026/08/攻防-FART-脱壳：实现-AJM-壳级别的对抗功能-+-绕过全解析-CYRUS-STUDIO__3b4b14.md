---
title: 攻防 FART 脱壳：实现 AJM 壳级别的对抗功能 + 绕过全解析 // CYRUS STUDIO
source: https://cyrus-studio.github.io/blog/posts/%E6%94%BB%E9%98%B2-fart-%E8%84%B1%E5%A3%B3%E5%AE%9E%E7%8E%B0-ajm-%E5%A3%B3%E7%BA%A7%E5%88%AB%E7%9A%84%E5%AF%B9%E6%8A%97%E5%8A%9F%E8%83%BD-+-%E7%BB%95%E8%BF%87%E5%85%A8%E8%A7%A3%E6%9E%90/
source_host: cyrus-studio.github.io
clip_date: 2026-08-04T13:58:39+08:00
trace_id: 3df4b839-c07b-441f-b651-7d32f1d863a8
content_hash: 6e65a57f7ee2d72a2d2a5fbabc4363e6682c945630c5e2b0e10d12db5403d6a2
status: synced
tags:
  - 脱壳与加固
  - Android逆向
series: null
feed_source: Cyrus Studio·安卓逆向
ai_summary: AJM 壳通过扫描内存映射文件检测 FART 脱壳框架的特征函数名并触发崩溃，文章提出了重命名敏感符号并定制 ROM 的对抗方案，实现了绕过检测的正常脱壳。
ai_summary_style: key-points
images_status:
  total: 14
  succeeded: 14
  failed_urls: []
notion_page_id: 3b275244-d011-81d2-b93f-c35f65dfd940
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> AJM 壳通过扫描内存映射文件检测 FART 脱壳框架的特征函数名并触发崩溃，文章提出了重命名敏感符号并定制 ROM 的对抗方案，实现了绕过检测的正常脱壳。
> 
> - **壳端检测机制：** 某视频 App 的 AJM 壳在启动时读取 /proc/self/maps 获取加载的 so 和 dex 文件，搜索包含 “dumpDexFileByExecute”、“fart”、“loadClassAndInvoke” 等 FART 特有方法名的二进制内容，命中后立即 kill 进程。
> - **FART 特征定位：** FART 的特征分布在 Java 层 ActivityThread 类的新增方法（如 fart、fartthread）、DexFile 中的 dumpMethodCode，以及 native 层 art_method.cc、dalvik_system_DexFile.cc 等文件中导出的函数符号。
> - **对抗思路：** 通过 Python 脚本自动遍历 FART 源码，将黑名单中的方法名全部替换为无意义的别名（例如 fart→startCodeInspection），同时修改函数调用引用，生成定制化 ROM。
> - **实施效果：** 刷入修改后的 ROM，再次扫描已无法检测到任何 FART 特征；成功对目标 App 脱壳，dump 出的 dex 文件为标准魔数（dex 035/039），且通过清除 oat 目录避免生成 cdex 格式。

> 版权归作者所有，如有转发，请注明文章出处： [https://cyrus-studio.github.io/blog/](https://cyrus-studio.github.io/blog/)

## 实现类似 AJM 壳的 FART 对抗功能

某视频 app 的壳在启动的时候会检测 FART 特征，日志输出如下：

```yaml
2025-05-29 02:16:25.612  2557-2557  ActivityThread          cn.cntv                              E  go into handleBindApplication
2025-05-29 02:16:25.630  2557-2557  cn.cntv                 cn.cntv                              I  The ClassLoaderContext is a special shared library.
2025-05-29 02:16:25.807  1512-17245 ActivityManager         system_process                       I  Process cn.cntv (pid 2557) has died: fore TOP 
2025-05-29 02:16:25.875  1512-1588  ActivityManager         system_process                       I  Start proc 2628:cn.cntv/u0a140 for top-activity {cn.cntv/com.cctv.mcctv.ui.activity.SplashActivity}
2025-05-29 02:16:25.932  2628-2628  ActivityThread          cn.cntv                              E  go into handleBindApplication
2025-05-29 02:16:25.945  2628-2628  cn.cntv                 cn.cntv                              I  The ClassLoaderContext is a special shared library.
2025-05-29 02:16:26.113  1512-4110  ActivityManager         system_process                       I  Process cn.cntv (pid 2628) has died: fore TOP 
2025-05-29 02:16:26.179  1512-1588  ActivityManager         system_process                       I  Start proc 2716:cn.cntv/u0a140 for top-activity {cn.cntv/com.cctv.mcctv.ui.activity.SplashActivity}
2025-05-29 02:16:26.233  2716-2716  ActivityThread          cn.cntv                              E  go into handleBindApplication
2025-05-29 02:16:26.245  2716-2716  cn.cntv                 cn.cntv                              I  The ClassLoaderContext is a special shared library.
2025-05-29 02:16:26.291  2716-2716  cn.cntv                 cn.cntv                              W  type=1400 audit(0.0:126069): avc: granted { execute } for path="/data/data/cn.cntv/files/libexec.so" dev="mmcblk0p64" ino=157243 scontext=u:r:untrusted_app:s0:c140,c256,c512,c768 tcontext=u:object_r:app_data_file:s0:c140,c256,c512,c768 tclass=file app=cn.cntv
2025-05-29 02:16:26.304  2716-2716  cn.cntv                 cn.cntv                              W  type=1400 audit(0.0:126070): avc: granted { execute } for path="/data/data/cn.cntv/files/libexecmain.so" dev="mmcblk0p64" ino=157244 scontext=u:r:untrusted_app:s0:c140,c256,c512,c768 tcontext=u:object_r:app_data_file:s0:c140,c256,c512,c768 tclass=file app=cn.cntv
2025-05-29 02:16:26.324  2716-2716  cn.cntv                 cn.cntv                              W  type=1400 audit(0.0:126071): avc: denied { execmod } for path="/apex/com.android.runtime/lib64/libart.so" dev="mmcblk0p61" ino=313 scontext=u:r:untrusted_app:s0:c140,c256,c512,c768 tcontext=u:object_r:system_lib_file:s0 tclass=file permissive=0 app=cn.cntv
2025-05-29 02:16:26.334  2716-2716  cn.cntv                 cn.cntv                              W  type=1400 audit(0.0:126072): avc: denied { execmod } for path="/system/lib64/liblog.so" dev="mmcblk0p61" ino=3229 scontext=u:r:untrusted_app:s0:c140,c256,c512,c768 tcontext=u:object_r:system_lib_file:s0 tclass=file permissive=0 app=cn.cntv
2025-05-29 02:16:26.385  1512-17245 ActivityManager         system_process                       I  Process cn.cntv (pid 2716) has died: fore TOP 
2025-05-29 02:16:26.441  1512-1588  ActivityManager         system_process                       I  Start proc 2807:cn.cntv/u0a140 for top-activity {cn.cntv/com.cctv.mcctv.ui.activity.SplashActivity}
2025-05-29 02:16:26.491  2807-2807  ActivityThread          cn.cntv                              E  go into handleBindApplication
2025-05-29 02:16:26.506  2807-2807  cn.cntv                 cn.cntv                              I  The ClassLoaderContext is a special shared library.
2025-05-29 02:16:26.682  1512-17245 ActivityManager         system_process                       I  Process cn.cntv (pid 2807) has died: fore TOP 
2025-05-29 02:16:26.731  1512-1588  ActivityManager         system_process                       I  Start proc 2872:cn.cntv/u0a140 for top-activity {cn.cntv/com.cctv.mcctv.ui.activity.SplashActivity}
2025-05-29 02:16:26.783  2872-2872  ActivityThread          cn.cntv                              E  go into handleBindApplication
```

使用的是 AJM 的壳，App 加载 so 文件，主动检测 FART 特征

```lua
avc: granted { execute } for path="/data/data/cn.cntv/files/libexec.so"
avc: granted { execute } for path="/data/data/cn.cntv/files/libexecmain.so"
```

一旦发现异常就触发崩溃（kill）

```
Process cn.cntv (pid 2628) has died: fore TOP 
```

如何实现类似的功能？

1.  首先找到 FART 的特征
    
2.  FART 特征检测识别
    
3.  识别到 FART 特征 kill 进程，没有识别到正常进入 app
    

## FART特征

FART 有什么特征？通过查看 FART 源码可以找到。

FART 开源地址： [https://github.com/CYRUS-STUDIO/FART](https://github.com/CYRUS-STUDIO/FART)

关于 FART 的详细介绍参考下面的文章：

-   [干掉抽取壳！FART 自动化脱壳框架与 Execute 脱壳点解析](https://cyrus-studio.github.io/blog/posts/%E5%B9%B2%E6%8E%89%E6%8A%BD%E5%8F%96%E5%A3%B3fart-%E8%87%AA%E5%8A%A8%E5%8C%96%E8%84%B1%E5%A3%B3%E6%A1%86%E6%9E%B6%E4%B8%8E-execute-%E8%84%B1%E5%A3%B3%E7%82%B9%E8%A7%A3%E6%9E%90/)
    
-   [FART 主动调用组件深度解析：破解 ART 下函数抽取壳的终极武器](https://cyrus-studio.github.io/blog/posts/fart-%E4%B8%BB%E5%8A%A8%E8%B0%83%E7%94%A8%E7%BB%84%E4%BB%B6%E6%B7%B1%E5%BA%A6%E8%A7%A3%E6%9E%90%E7%A0%B4%E8%A7%A3-art-%E4%B8%8B%E5%87%BD%E6%95%B0%E6%8A%BD%E5%8F%96%E5%A3%B3%E7%9A%84%E7%BB%88%E6%9E%81%E6%AD%A6%E5%99%A8/)
    
-   [一步步带你移植 FART 到 Android 10，实现自动化脱壳](https://cyrus-studio.github.io/blog/posts/%E4%B8%80%E6%AD%A5%E6%AD%A5%E5%B8%A6%E4%BD%A0%E7%A7%BB%E6%A4%8D-fart-%E5%88%B0-android-10%E5%AE%9E%E7%8E%B0%E8%87%AA%E5%8A%A8%E5%8C%96%E8%84%B1%E5%A3%B3/)
    
-   [FART 自动化脱壳框架优化实战：Bug 修复与代码改进记录](https://cyrus-studio.github.io/blog/posts/fart-%E8%87%AA%E5%8A%A8%E5%8C%96%E8%84%B1%E5%A3%B3%E6%A1%86%E6%9E%B6%E4%BC%98%E5%8C%96%E5%AE%9E%E6%88%98bug-%E4%BF%AE%E5%A4%8D%E4%B8%8E%E4%BB%A3%E7%A0%81%E6%94%B9%E8%BF%9B%E8%AE%B0%E5%BD%95/)
    
-   [Frida + FART 联手：解锁更强大的 Android 脱壳新姿势](https://cyrus-studio.github.io/blog/posts/frida-+-fart-%E8%81%94%E6%89%8B%E8%A7%A3%E9%94%81%E6%9B%B4%E5%BC%BA%E5%A4%A7%E7%9A%84-android-%E8%84%B1%E5%A3%B3%E6%96%B0%E5%A7%BF%E5%8A%BF/)
    
-   [FART 脱壳不再全量！用一份配置文件精准控制节奏与范围](https://cyrus-studio.github.io/blog/posts/fart-%E8%84%B1%E5%A3%B3%E4%B8%8D%E5%86%8D%E5%85%A8%E9%87%8F%E7%94%A8%E4%B8%80%E4%BB%BD%E9%85%8D%E7%BD%AE%E6%96%87%E4%BB%B6%E7%B2%BE%E5%87%86%E6%8E%A7%E5%88%B6%E8%8A%82%E5%A5%8F%E4%B8%8E%E8%8C%83%E5%9B%B4/)
    

## ActivityThread

源码： [https://github.com/CYRUS-STUDIO/FART/blob/master/fart10/frameworks/base/core/java/android/app/ActivityThread.java](https://github.com/CYRUS-STUDIO/FART/blob/master/fart10/frameworks/base/core/java/android/app/ActivityThread.java)

FART 在 ActivityThread 新增了以下方法，这些都可以作为 FART 的特征

```typescript
public static Field getClassField(ClassLoader classloader, String class_name, String filedName)
public static Object getClassFieldObject(ClassLoader classloader, String class_name, Object obj, String filedName)
public static Object invokeStaticMethod(String class_name, String method_name, Class[] pareTyple, Object[] pareVaules)
public static Object getFieldOjbect(String class_name, Object obj, String filedName)
public static ClassLoader getClassloader()
public static void loadClassAndInvoke(ClassLoader appClassloader, String eachclassname, Method dumpMethodCode_method) 
public static void fart() 
public static void fartwithClassloader(ClassLoader appClassloader)
public static void fartthread()
```

## DexFile

源码： [https://github.com/CYRUS-STUDIO/FART/blob/master/fart10/libcore/dalvik/src/main/java/dalvik/system/DexFile.java](https://github.com/CYRUS-STUDIO/FART/blob/master/fart10/libcore/dalvik/src/main/java/dalvik/system/DexFile.java)

FART 在 DexFile 新增了 dumpMethodCode 方法同样也可以作为 FART 的特征

```
private static native void dumpMethodCode(Object m);
```

## art_method.cc

FART 在 art/runtime/art_method.cc 中新增以下方法

```objectivec
uint8_t* codeitem_end(const uint8_t **pData)
extern "C" char *base64_encode(char *str,long str_len,long* outlen)
extern "C" void dumpDexFileByExecute(ArtMethod* artmethod)
extern "C" void dumpArtMethod(ArtMethod* artmethod)
extern "C" void myfartInvoke(ArtMethod* artmethod)
```

## dalvik_system_DexFile.cc

FART 在 art/runtime/native/dalvik_system_DexFile.cc 中新增了以下方法

```
static void DexFile_dumpMethodCode(JNIEnv* env, jclass,jobject method)
```

## java_lang_reflect_Method.cc

FART 在 art/runtime/native/java_lang_reflect_Method.cc 中新增了以下方法

```
extern "C" ArtMethod* jobject2ArtMethod(JNIEnv* env, jobject javaMethod)
```

上面这些都可以作为 FART 特征。

FART 特征有的在 native 层，最终编译成 so 文件；有的在 java 层，最终编译成 dex 相关文件。

如何找到这些 so 和 dex 相关文件？

## /proc/self/maps

/proc/self/maps 是 Linux（含 Android）系统中一个非常重要的伪文件，它提供了当前进程内存映射（memory mapping）信息，是分析当前进程加载了哪些资源的重要窗口。

包括：

-   加载的.so 动态库
    
-   加载的.dex 文件（包含 ODEX / VDEX）
    
-   映射的 Java 堆、native 堆、stack 等
    
-   匿名 mmap 内存区域
    
-   JIT 编译生成的代码段
    
-   映射的 /system/, /data/, /apex/, /dev/ashmem 等文件
    

比如，进入 adb shell ，通过下面命令读取包名 com.cyrus.example 下的 maps 文件

```
cat /proc/$(pidof com.cyrus.example)/maps
```

输出结果如下：

```bash
12c00000-12c80000 rw-p 00000000 00:00 0                                  [anon:dalvik-main space (region space)]
12c80000-132c0000 ---p 00000000 00:00 0                                  [anon:dalvik-main space (region space)]
132c0000-13580000 rw-p 00000000 00:00 0                                  [anon:dalvik-main space (region space)]
13580000-26280000 ---p 00000000 00:00 0                                  [anon:dalvik-main space (region space)]
26280000-2a940000 ---p 00000000 00:00 0                                  [anon:dalvik-main space (region space)]
2a940000-2a980000 ---p 00000000 00:00 0                                  [anon:dalvik-main space (region space)]
2a980000-2a9c0000 ---p 00000000 00:00 0                                  [anon:dalvik-main space (region space)]
2a9c0000-2aac0000 ---p 00000000 00:00 0                                  [anon:dalvik-main space (region space)]
2aac0000-2ab80000 ---p 00000000 00:00 0                                  [anon:dalvik-main space (region space)]
2ab80000-2abc0000 ---p 00000000 00:00 0                                  [anon:dalvik-main space (region space)]
2abc0000-2ac00000 rw-p 00000000 00:00 0                                  [anon:dalvik-main space (region space)]
708d5000-70b5a000 rw-p 00000000 103:1d 1863                              /system/framework/arm64/boot.art
70b5a000-70c4a000 rw-p 00000000 103:1d 1833                              /system/framework/arm64/boot-core-libart.art
70c4a000-70c80000 rw-p 00000000 103:1d 1848                              /system/framework/arm64/boot-okhttp.art
70c80000-70cc1000 rw-p 00000000 103:1d 1830                              /system/framework/arm64/boot-bouncycastle.art
70cc1000-70cd1000 rw-p 00000000 103:1d 1827                              /system/framework/arm64/boot-apache-xml.art
70cd1000-71595000 rw-p 00000000 103:1d 1839                              /system/framework/arm64/boot-framework.art
71595000-715c9000 rw-p 00000000 103:1d 1836                              /system/framework/arm64/boot-ext.art
715c9000-716c1000 rw-p 00000000 103:1d 1854                              /system/framework/arm64/boot-telephony-common.art
716c1000-716cf000 rw-p 00000000 103:1d 1860                              /system/framework/arm64/boot-voip-common.art
716cf000-716e4000 rw-p 00000000 103:1d 1842                              /system/framework/arm64/boot-ims-common.art
716e4000-716e7000 rw-p 00000000 103:1d 1824                              /system/framework/arm64/boot-android.test.base.art
716e7000-716e9000 rw-p 00000000 103:1d 1851                              /system/framework/arm64/boot-org.ifaa.android.manager.art
716e9000-716f0000 rw-p 00000000 103:1d 1845                              /system/framework/arm64/boot-ims-ext-common_system.art
716f0000-716f4000 rw-p 00000000 103:1d 1857                              /system/framework/arm64/boot-telephony-ext.art
716f4000-716fc000 rw-p 00000000 103:1d 1821                              /system/framework/arm64/boot-WfdCommon.art
716fc000-717b2000 r--p 00000000 103:1d 1864                              /system/framework/arm64/boot.oat
717b2000-71a4d000 r-xp 000b6000 103:1d 1864                              /system/framework/arm64/boot.oat
71a4d000-71a4e000 rw-p 00000000 00:00 0                                  [anon:.bss]
71a4e000-71a50000 r--s 00000000 103:1d 1882                              /system/framework/boot.vdex
71a50000-71a51000 r--p 00351000 103:1d 1864                              /system/framework/arm64/boot.oat
71a51000-71a52000 rw-p 00352000 103:1d 1864                              /system/framework/arm64/boot.oat
71a52000-71a9b000 r--p 00000000 103:1d 1834                              /system/framework/arm64/boot-core-libart.oat
71a9b000-71ba3000 r-xp 00049000 103:1d 1834                              /system/framework/arm64/boot-core-libart.oat
...
```

比如：

```
71a9b000-71ba3000 r-xp 00049000 103:1d 1834  /system/framework/arm64/boot-core-libart.oat
```

**字段解析如下：**

| 字段  | 示例值 | 含义  |
| --- | --- | --- |
| 71a9b000-71ba3000 | 起始地址 - 结束地址 | 表示这段内存从 0x71a9b000 映射到 0x71ba3000（大约 1MB） |
| r-xp | 权限  | r = 可读，x = 可执行，p = 私有 |
| 00049000 | 文件偏移 | 映射文件时从 offset=0x49000 开始 |
| 103:1d | 设备编号 | 表示该文件所在设备的主/次设备号 |
| 1834 | inode 号 | 文件在设备上的 inode 编号 |
| /system/framework/arm64/boot-core-libart.oat | 文件路径 | 表示映射的文件路径，来源是系统的 OAT 文件 |

所有我们可以通过读取 /proc/self/maps 得到当前 app 加载的所有资源文件，实现如下：

```rust
extern "C"
JNIEXPORT jobjectArray JNICALL
Java_com_cyrus_example_fart_AntiFART_listLoadedFiles(JNIEnv *env, jclass) {
    std::ifstream maps("/proc/self/maps");
    std::string line;
    std::vector<std::string> paths;

    while (std::getline(maps, line)) {
        std::size_t pathPos = line.find('/');
        if (pathPos != std::string::npos) {
            std::string path = line.substr(pathPos);
            if (std::find(paths.begin(), paths.end(), path) == paths.end()) {
                paths.push_back(path);
            }
        }
    }

    jclass stringClass = env->FindClass("java/lang/String");
    jobjectArray result = env->NewObjectArray(paths.size(), stringClass, nullptr);
    for (size_t i = 0; i < paths.size(); ++i) {
        env->SetObjectArrayElement(result, i, env->NewStringUTF(paths[i].c_str()));
    }

    return result;
}
```

效果如下：

[![word/media/image1.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/a46fc127fa90ab40.png)](data:image/png;base64,inline-233154B)

## so 文件 FART 特征检测

对于 FART 在 C/C++ 层添加的函数特征码检测。

通过检测 /proc/self/maps下的加载 so库列表得到各个库文件绝对路径

```ruby
// 读取 /proc/self/maps 获取加载的 .so 路径
std::set<std::string> get_loaded_so_paths() {
    std::set<std::string> so_paths;
    std::ifstream maps("/proc/self/maps");
    std::string line;
    std::regex so_regex(".+\\.so(\\s|$)");

    while (std::getline(maps, line)) {
        std::size_t path_pos = line.find('/');
        if (path_pos != std::string::npos) {
            std::string path = line.substr(path_pos);
            if (std::regex_search(path, so_regex)) {
                so_paths.insert(path);
            }
        }
    }
    return so_paths;
}
```

再通过 fopen 函数将 so 库的内容以16进制读进来放在内存，采用字符串模糊查找来检测是否命中黑名单中的方法特征码。

```cpp
// so 黑名单函数特征
std::vector<std::string> so_symbols_blacklist = {
        "dumpDexFileByExecute",
        "dumpArtMethod",
        "myfartInvoke",
        "DexFile_dumpMethodCode"
};

// 读取文件内容为字符串
std::string read_file_content(const std::string &path) {
    FILE *file = fopen(path.c_str(), "rb");
    if (!file) {
        LOGI("Failed to open: %s", path.c_str());
        return "";
    }

    fseek(file, 0, SEEK_END);
    long size = ftell(file);
    rewind(file);

    std::string buffer(size, 0);
    fread(&buffer[0], 1, size, file);
    fclose(file);

    return buffer;
}

// 单词边界检查
bool is_word_boundary(char ch) {
    return !std::isalnum(static_cast<unsigned char>(ch)) && ch != '_';
}

// 返回匹配到的特征列表
std::vector<std::string> get_matched_signatures(const std::string &content, const std::vector<std::string> &patterns) {
    std::vector<std::string> matched;
    for (const auto &pattern : patterns) {
        size_t pos = content.find(pattern);
        if (pos != std::string::npos) {
            // 类似 DexFile_dumpMethodCode 这种，带 _ 的不需要做单词边界检查
            if (pattern.find('_') != std::string::npos) {
                matched.push_back(pattern);
            }else{
                // 单词边界检查
                // 这样就不会匹配 farther、himmelfart，但可以匹配像 void fart()、"fart"、 call fart 等形式。
                char prev = (pos == 0) ? '\0' : content[pos - 1];
                char next = (pos + pattern.length() < content.size()) ? content[pos + pattern.length()] : '\0';

                if (is_word_boundary(prev) && is_word_boundary(next)) {
                    matched.push_back(pattern);
                }
            }
        }
    }
    return matched;
}

// JNI 方法：检测已加载 .so 中是否包含黑名单符号
extern "C"
JNIEXPORT jobjectArray JNICALL
Java_com_cyrus_example_fart_AntiFART_detectFartInLoadedSO(JNIEnv *env, jclass clazz) {
    std::vector<std::string> detected_logs;
    auto so_paths = get_loaded_so_paths();

    for (const auto &path: so_paths) {
        std::string content = read_file_content(path);
        if (!content.empty()) {
            std::vector<std::string> matched = get_matched_signatures(content, so_symbols_blacklist);
            if (!matched.empty()) {
                std::ostringstream oss;
                oss << "[FART DETECTED] " << path << " => ";
                for (size_t i = 0; i < matched.size(); ++i) {
                    oss << matched[i];
                    if (i != matched.size() - 1) oss << ", ";
                }
                LOGI("%s", oss.str().c_str());
                detected_logs.push_back(oss.str());
            }
        }
    }

    jclass stringClass = env->FindClass("java/lang/String");
    jobjectArray result = env->NewObjectArray(detected_logs.size(), stringClass, nullptr);
    for (int i = 0; i < detected_logs.size(); ++i) {
        env->SetObjectArrayElement(result, i, env->NewStringUTF(detected_logs[i].c_str()));
    }

    return result;
}
```

可以看到在 libart.so 中命中了多个 FART 特征。

[![word/media/image2.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/21fac2ba969fef96.png)](data:image/png;base64,inline-150678B)

## dex 文件 FART 特征检测

对于 FART 在 Java 层添加的方法特征码检测也是类似。

但是 dex 相关文件格式有多种，包括：

-   .dex 文件（原始 dex）
    
-   .odex（优化过的 dex）
    
-   .vdex（Verified DEX）
    
-   .art（预编译的 ART 文件）
    
-   以及.jar、.apk 中可能包含 dex 文件的路径
    

读取 /proc/self/maps 获取加载的 dex 或 dex 相关文件路径

```ruby
// 读取 /proc/self/maps 获取加载的 dex 或 dex 相关文件路径
std::set<std::string> get_loaded_dex_paths() {
    std::set<std::string> dex_paths;
    std::ifstream maps("/proc/self/maps");
    std::string line;

    // 匹配 dex、odex、vdex、art、apk、jar 文件
    std::regex dex_regex(R"((\.dex|\.odex|\.vdex|\.art|\.apk|\.jar)(\s|$))");

    while (std::getline(maps, line)) {
        std::size_t path_pos = line.find('/');
        if (path_pos != std::string::npos) {
            std::string path = line.substr(path_pos);
            if (std::regex_search(path, dex_regex)) {
                dex_paths.insert(path);
            }
        }
    }
    return dex_paths;
}
```

再通过 fopen 函数将 dex 相关文件的内容以16进制读进来放在内存，采用字符串模糊查找来检测是否命中黑名单中的方法特征码。

```cpp
// dex 黑名单函数特征
const std::vector<std::string> dex_method_blacklist = {
        "loadClassAndInvoke",
        "fart",
        "fartwithClassloader",
        "fartthread"
};

// JNI 方法：检测已加载 dex 中是否包含黑名单符号
extern "C"
JNIEXPORT jobjectArray JNICALL
Java_com_cyrus_example_fart_AntiFART_detectFartInLoadedDex(JNIEnv *env, jclass clazz) {
    std::vector<std::string> detected_logs;
    auto dex_paths = get_loaded_dex_paths();

    for (const auto &path: dex_paths) {
        std::string content = read_file_content(path);
        if (!content.empty()) {
            std::vector<std::string> matched = get_matched_signatures(content, dex_method_blacklist);
            if (!matched.empty()) {
                std::ostringstream oss;
                oss << "[FART DETECTED] " << path << " => ";
                for (size_t i = 0; i < matched.size(); ++i) {
                    oss << matched[i];
                    if (i != matched.size() - 1) oss << ", ";
                }
                LOGI("%s", oss.str().c_str());
                detected_logs.push_back(oss.str());
            }
        }
    }

    jclass stringClass = env->FindClass("java/lang/String");
    jobjectArray result = env->NewObjectArray(detected_logs.size(), stringClass, nullptr);
    for (int i = 0; i < detected_logs.size(); ++i) {
        env->SetObjectArrayElement(result, i, env->NewStringUTF(detected_logs[i].c_str()));
    }

    return result;
}
```

可以看到在 framework.jar 中检测到了多个 FART 特征。

[![word/media/image3.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/bb4882d92f435948.png)](data:image/png;base64,inline-139070B)

## 反 FART 对抗

绕过 FART 对抗只需要定制个性化的 ROM，抹除这些 FART 特征就好了。

## 抹除 FART 特征

比如把这些 FART 中默认的方法名重命名一下就好了。

```java
public static Field getClassField(ClassLoader classloader, String class_name, String filedName)
public static Object getClassFieldObject(ClassLoader classloader, String class_name, Object obj, String filedName)
public static Object invokeStaticMethod(String class_name, String method_name, Class[] pareTyple, Object[] pareVaules)
public static Object getFieldOjbect(String class_name, Object obj, String filedName)
public static ClassLoader getClassloader()
public static void loadClassAndInvoke(ClassLoader appClassloader, String eachclassname, Method dumpMethodCode_method) 
public static void fart() 
public static void fartwithClassloader(ClassLoader appClassloader)
public static void fartthread()
private static native void dumpMethodCode(Object m);

uint8_t* codeitem_end(const uint8_t **pData)
extern "C" char *base64_encode(char *str,long str_len,long* outlen)
extern "C" void dumpDexFileByExecute(ArtMethod* artmethod)
extern "C" void dumpArtMethod(ArtMethod* artmethod)
extern "C" void myfartInvoke(ArtMethod* artmethod)

static void DexFile_dumpMethodCode(JNIEnv* env, jclass,jobject method)

extern "C" ArtMethod* jobject2ArtMethod(JNIEnv* env, jobject javaMethod)
```

假设把函数重命名如下：

**Java 层重命名:**

| 原方法名 | 替代方法名 |
| --- | --- |
| getClassField | resolveDeclaredField |
| getClassFieldObject | extractFieldValue |
| invokeStaticMethod | invokeStaticByName |
| getFieldOjbect | getInstanceFieldValue |
| getClassloader | obtainAppClassLoader |
| loadClassAndInvoke | dispatchClassTask |
| fart | startCodeInspection |
| fartwithClassloader | startCodeInspectionWithCL |
| fartthread | launchInspectorThread |
| dumpMethodCode | nativeDumpCode |

**Native 层函数重命名：**

| 原函数名 | 替代函数名 |
| --- | --- |
| codeitem_end | getDexCodeItemEnd |
| base64_encode | encodeBase64Buffer |
| dumpDexFileByExecute | traceDexExecution |
| dumpArtMethod | traceMethodCode |
| myfartInvoke | callNativeMethodInspector |
| DexFile_dumpMethodCode | DexFile_nativeDumpCode |
| jobject2ArtMethod | convertToArtMethodPtr |

记得相关函数调用也要做修改。

## 自动化脚本

但是一个个修改太麻烦了，写个脚本自动修改（可以自定义 RENAME_MAP 中的值去定制一个只属于自己的 FART ROM，这样就不容易被检测）：

```python
import os
import re

# 敏感方法名及其替代名映射表
RENAME_MAP = {
    "getClassField": "resolveDeclaredField",
    "getClassFieldObject": "extractFieldValue",
    "invokeStaticMethod": "invokeStaticByName",
    "getFieldOjbect": "getInstanceFieldValue",
    "getClassloader": "obtainAppClassLoader",
    "loadClassAndInvoke": "dispatchClassTask",
    "fart\\b": "startCodeInspection",
    "fartwithClassloader": "startCodeInspectionWithCL",
    "fartthread": "launchInspectorThread",
    "dumpMethodCode": "nativeDumpCode",
    "codeitem_end": "getDexCodeItemEnd",
    "base64_encode": "encodeBase64Buffer",
    "dumpDexFileByExecute": "traceDexExecution",
    "dumpArtMethod": "traceMethodCode",
    "myfartInvoke": "callNativeMethodInspector",
    "DexFile_dumpMethodCode": "DexFile_nativeDumpCode",
    "jobject2ArtMethod": "convertToArtMethodPtr"
}

SOURCE_SUFFIX = (".java", ".kt", ".cc", ".c", ".cpp", ".h", ".js")

def replace_in_file(file_path):
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()

        original_content = content

        for old, new in RENAME_MAP.items():
            content = re.sub(r'\b' + old + r'\b', new, content)

        if content != original_content:
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(content)
            print(f"[UPDATED] {file_path}")
        else:
            print(f"[SKIPPED] {file_path}")

    except Exception as e:
        print(f"[ERROR] {file_path}: {e}")

def scan_directory(root_dir):
    for dirpath, _, filenames in os.walk(root_dir):
        for file in filenames:
            if file.endswith(SOURCE_SUFFIX):
                replace_in_file(os.path.join(dirpath, file))

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python rename_fart_symbols.py <source_directory>")
        sys.exit(1)

    scan_directory(sys.argv[1])

    input("Press Enter to exit...")
```

执行脚本：

```
D:\Projects\FART\rename_fart_symbols.py D:\Projects\FART\fart10
```

替换完成。

[![word/media/image4.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/963c55414f8a72d0.png)](data:image/png;base64,inline-56158B)

同时也可以用来修改 frida_fart 的 js 源码

```
D:\Projects\FART\rename_fart_symbols.py  D:\Python\anti-app\frida_fart
```

参考： [Frida + FART 联手：解锁更强大的 Android 脱壳新姿势](https://cyrus-studio.github.io/blog/posts/frida-+-fart-%E8%81%94%E6%89%8B%E8%A7%A3%E9%94%81%E6%9B%B4%E5%BC%BA%E5%A4%A7%E7%9A%84-android-%E8%84%B1%E5%A3%B3%E6%96%B0%E5%A7%BF%E5%8A%BF/)

[![word/media/image5.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/77ef9f812e0731f3.png)](data:image/png;base64,inline-52154B)

## 重新编译系统

把修改后的 FART 代码替换到 Android 系统里面，重新编译。

```bash
# 初始化编译环境
source build/envsetup.sh

# 设置编译目标
breakfast wayne

# 回到 Android 源码树的根目录
croot

# 开始编译
brunch wayne
```

如何编译 FART ROM 参考这篇文章： [一步步带你移植 FART 到 Android 10，实现自动化脱壳](https://cyrus-studio.github.io/blog/posts/%E4%B8%80%E6%AD%A5%E6%AD%A5%E5%B8%A6%E4%BD%A0%E7%A7%BB%E6%A4%8D-fart-%E5%88%B0-android-10%E5%AE%9E%E7%8E%B0%E8%87%AA%E5%8A%A8%E5%8C%96%E8%84%B1%E5%A3%B3/)

生成 OTA 包

```
./sign_ota_wayne.sh
```

编译完成

[![word/media/image6.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/26e69aa05a999384.png)](data:image/png;base64,inline-67798B)

## 刷机

由于我这里是在 WSL 中编译，先把 ota 文件 copy 到 windwos 目录下

```
cp ./signed-ota_update.zip /mnt/e/lineageos/xiaomi6x_wayne_lineageos-17.1_signed-ota_update_fart_cyrus.zip
```

设备进入 recovery 模式（或者同时按住【音量+】和【开机键】）

```
adb reboot recovery
```

【Apply update】【Apply from adb】开启 adb sideload

[![word/media/image7.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/b11cf79ed4071fe6.png)](data:image/png;base64,inline-339002B)

开始刷机

```
adb sideload E:\lineageos\xiaomi6x_wayne_lineageos-17.1_signed-ota_update_fart_cyrus.zip
```

成功刷入后重启手机。

## 测试

可以看到 so 中已经检测不出 FART 特征

[![word/media/image8.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/cbcda25455fd278c.png)](data:image/png;base64,inline-120454B)

dex 相关文件也没有检测出 FART 特征

[![word/media/image9.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/ca7b4f30b257eeb9.png)](data:image/png;base64,inline-120786B)

使用 [frida_fart](https://cyrus-studio.github.io/blog/posts/%E4%BD%BF%E7%94%A8-frida-%E5%A2%9E%E5%BC%BA-fart%E5%AE%9E%E7%8E%B0%E6%9B%B4%E5%BC%BA%E5%A4%A7%E7%9A%84-android-%E8%84%B1%E5%A3%B3%E8%83%BD%E5%8A%9B/) 发起主动调用

[![word/media/image10.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/2cd9ef7a0c8816e8.png)](data:image/png;base64,inline-371930B)

成功脱壳

[![word/media/image11.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/0219374b85a7350a.png)](data:image/png;base64,inline-123382B)

测试某视频 app 的 ajm 壳成功脱壳，能正常进入 app 没有被 kill 掉

[![word/media/image12.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/ba6cba8f4e725860.png)](data:image/png;base64,inline-73138B)

## 禁止加载 cdex

另外，dump 下来的 dex 文件头有可能是 cdex001，cdex 文件是不可以直接通过 dex 反编译工具反编译的

[![word/media/image13.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/1594346f6f1f94fe.png)](data:image/png;base64,inline-211182B)

Android 9 引入 CompactDex（.cdex，magic 为 cdex001），是 DEX 的压缩优化版本，导致 dump 后无法直接反编译。

优化后的 dex/cdex 通常存放在：

```swift
/data/app/package_name/oat/arm64/base.odex
/data/app/package_name/oat/arm64/base.vdex
```

在 Android 9（Pie）中，APP 的.cdex 文件 是由 dex2oat 优化生成的，通常以 odex, vdex 或直接优化后的.art 文件形式存在。

进入 adb shell 找到 目标app 存放 oat 文件的路径并删除所有 oat 文件

```bash
wayne:/sdcard/Android/data/com.cyrus.example/dump_dex # cd /data/app
wayne:/data/app # ls
com.android.chrome-b1d3YEy1eVrwwjPOa1oq5A==       com.iflytek.inputmethod-s1r9JFv0-eKNskzHyrh_vQ==
com.cyrus.example-uIsySv7lFm21qMVPnPJ-pw==        com.shizhuang.duapp-fTxemmnM8l6298xbBELksQ==
com.cyrus.example.plugin-YsXrxPvfWYdsWHxFKjcusw== com.tencent.mm-ql7ajyK9JqKXli5pgu88nw==
com.cyrus.example.test-R06ZNyf5doqJFOcZ6EaYHQ==   com.xingin.xhs-HeYr1dfB-rU7NjxJiLiDeg==
wayne:/data/app # cd com.shizhuang.duapp-fTxemmnM8l6298xbBELksQ==
wayne:/data/app/com.shizhuang.duapp-fTxemmnM8l6298xbBELksQ== # ls
base.apk lib oat
wayne:/data/app/com.shizhuang.duapp-fTxemmnM8l6298xbBELksQ== # cd oat
wayne:/data/app/com.shizhuang.duapp-fTxemmnM8l6298xbBELksQ==/oat # ls
arm64
wayne:/data/app/com.shizhuang.duapp-fTxemmnM8l6298xbBELksQ==/oat # cd arm64/
wayne:/data/app/com.shizhuang.duapp-fTxemmnM8l6298xbBELksQ==/oat/arm64 # ls
base.art base.odex base.vdex
wayne:/data/app/com.shizhuang.duapp-fTxemmnM8l6298xbBELksQ==/oat/arm64 # rm -rf *
```

再重新 dump dex，这时可以看到 dump 下来的 dex 魔数都是 dex 039 / dex 035 （标准 Dex 文件的魔数）不是 cdex001，可以直接用 jadx 去反编译了。

[![word/media/image14.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/a1d8b4019b4d1cff.png)](data:image/png;base64,inline-102250B)

## 完整源码

开源地址：

相关文章：
