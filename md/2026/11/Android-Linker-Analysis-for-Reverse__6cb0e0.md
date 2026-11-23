---
title: Android Linker Analysis for Reverse
source: https://tsingshui.art/work/android/linker/
source_host: tsingshui.art
clip_date: 2026-11-23T10:25:48+08:00
trace_id: 89ae3384-1a3c-4dc2-870a-1ed028fcf341
content_hash: 1a3ade17c177071c59d68c255a2b8cc5a0bdff097d70c43d6ad97d94023f2c00
status: imaged
tags: []
series: null
feed_source: 清水·Android/内核逆向
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: null
ioc:
  cves: []
  cwes: []
  hashes:
    - 42992d6413ea2b241d245fa456d36cd8b4eae2d8
  domains: []
  tools: []
  techniques: []
---

## 前言

安卓源码会持续更新，本文分析基于如下版本。

```bash
git clone https://android.googlesource.com/platform/bionic
git check out 42992d6413ea2b241d245fa456d36cd8b4eae2d8
```

## 0\. System.loadLibrary

安卓 App 中使用 `native` 关键字标记的函数具体实现在相应的 `so` 文件中，也就是说 App 需要先加载相应的 `so` 文件。关于 `so` 文件的具体格式，在后文会详细解释重点的内容，在这只需要知道是 linux 的动态链接库即可，和 windows 下的 `dll` 文件类似。

在实现上，安卓代码会使用 `static {}` 块调用 `System.loadLibrary` 来进行初始化。使用 `static{}` 包裹的代码会在这个类第一次被加载的时候调用。这是一个相当早的时机，可以确保 `native` 方法被正常注册，避免后续逻辑中调用 `native` 方法出现错误。不过 `System.loadLibrary` 本身并不是 `native` 函数，不过它在实际的调用的时候，会通过反射跳转到 `nativeLoad` 这个 `native` 方法，切入 `native` 层。

```java
public class MainActivity extends AppCompatActivity {
    static {
        System.loadLibrary("myapplication");  // 1. 加载此类时，优先执行。
    }
    public native String stringFromJNI();
    public void test(){
        String str = stringFromJNI();
    }
}
```

刚才说过，安卓 App 会使用 `static {}` 块先初始化，再调用 `native` 方法，但 `nativeLoad` 是用来实现加载 `so` 的 `native` 方法，为什么它可以不用加载相应的 `so` 呢？原因是 `nativeLoad` 的实现是由安卓虚拟机提供的，对于大于安卓 10 的版本，可以在 `/apex/com.android.art/lib64/libopenjdkjvm.so` 路径下找到这个文件，用反编译器或者类似的工具都可以看到 `nativeLoad` 的具体实现，在启动一个应用的时候，安卓虚拟机会加载这个 `so` 文件，由系统完成相应的方法注册，所以可以直接用。 [`nativeLoad` 的源码可以在这里找到](https://cs.android.com/android/platform/superproject/main/+/main:libcore/ojluni/src/main/native/Runtime.c) 。中间还会有几层跳转，这里我们只给出关键的调用关系，分析相对重要的函数。

大致的调用链如下，建议直接打开 [LoadNativeLibrary](https://cs.android.com/android/platform/superproject/main/+/main:art/runtime/jni/java_vm_ext.cc;l=948;drc=725fc18d701f2474328b8f21710da13d9bbb7eaf;bpv=0;bpt=1) 的实现。最关键的两个部分都在这里实现。

```
Runtime_nativeLoadJVM_NativeLoadJavaVMExt::LoadNativeLibraryOpenNativeLibrary
```

## 1\. JavaVMExt::LoadNativeLibrary

这个函数做了两件比较关键的事：先是调用 `OpenNativeLibrary` ，在它的内部调用了 `android_ext_dlopen` 链接 `so` 文件。然后是调用了 `so` 文件的 `JNI_Onload` 函数。这也是常说的， `JNI_OnLoad` 函数会在 `so` 被加载的时候调用，但就和 C 语言的 `main` 函数不是程序最早的入口点一样。在 `android_ext_dlopen` 也会执行两部分 `so` 内部的函数进行初始化，这里提前说一下是 `DT_INIT` 和 `DT_INIT_ARRAY` 。并且是优先执行 `DT_INIT` ，再执行 `DT_INIT_ARRAY` 。

`LoadNativeLibrary` 的代码比较长，有比较多的处理错误的逻辑，主要是一个承上启下的作用。这里我只留下和 `OpenNativeLibrary` 、 `JNI_Onload` 有调用关系的部分，并且修改了大部分函数的参数，太长了影响观看，在这里知道先后调用顺序即可。修改的参数用形如 `$PARAMS["lib_path"]` 表示，知道大概传递了什么即可，后文也会使用类似的表达。

这里需要注意调用 OpenNativeLibrary 传入的 `needs_native_bridge` 为 `false`

```cpp
bool JavaVMExt::LoadNativeLibrary(...const std::string& path,...) 
{
  bool needs_native_bridge = false;
  // 函数调用了  android_dlopen_ext, 传递了这个内部函数的返回值。
  void* handle = android::OpenNativeLibrary($PARAMS["lib_path",&needs_native_bridge]); 
  Check(handle) // * 实际不存在！中间过程的抽象
  
  void* sym = library->FindSymbol("JNI_OnLoad", nullptr, android::kJNICallTypeRegular); // * 实际上会调用 dlsym 来查找 JNI_Onload。
  if (sym == nullptr) 
  { // 对于一个 so 来说可以没有 JNI_OnLoad
    was_successful = true;
  } else {
    using JNI_OnLoadFn = int(*)(JavaVM*, void*);
    JNI_OnLoadFn jni_on_load = reinterpret_cast<JNI_OnLoadFn>(sym);
    int version = (*jni_on_load)(this, nullptr); // 此处调用 JNI_Onload 
    if (IsSdkVersionSetAndAtMost(runtime_->GetTargetSdkVersion(), SdkVersion::kL)) {
      EnsureFrontOfChain(SIGSEGV);
    }
    if (version == JNI_ERR) { // JNI Onload 的返回版本号，比较特殊。
      log(Fault)
    } else if (JavaVMExt::IsBadJniVersion(version)) {
      log(Fault)
    } else {
      was_successful = true;
    }
  }

  library->SetResult(was_successful);
  return was_successful;
}
```

## 2\. OpenNativeLibrary

这个函数里面的分支也相当的多，前面的一些处理主要是为了系统库的 `so` 加载准备的，比较容易触发的函数优先处理。对于 App 只看最下面这个分支就好了。这里应该是实际 App 加载 `so` 会执行的流程。这里主要的逻辑是找到 App 的 `namespace` ，把 `so` 加载到对应的 `namespace` 。通过调用 `ns->Load(path)` 进行实际的加载。

```cpp
void* OpenNativeLibrary(JNIEnv* env,
                        const char* path,
                        jobject class_loader,
                        const char* caller_location,
                        bool* needs_native_bridge,
                        char** error_msg) 
{
  ...
  NativeLoaderNamespace* ns;
  const char* ns_descr;
  {
    ...
    std::lock_guard<std::mutex> guard(g_namespaces_mutex);
    ns = g_namespaces->FindNamespaceByClassLoader(env, class_loader);
    ns_descr = "class loader";
    ...
  }
  *needs_native_bridge = ns->IsBridged();
  Result<void*> handle = ns->Load(path); // -> 在此处调用 `android_dlopen_ext`
  if (!handle.ok()) {
    *error_msg = strdup(handle.error().message().c_str());
    return nullptr;
  }
}
```

### 2.1 NativeLoaderNamespace::Load

`needs_native_bridge` 在前文说过，为 `false` 所以这里会调用上面的分支，也就是函数最终调用到了 `android_dlopen_ext` 实现功能。这个函数是 `android` 为 `dlopen` 这个函数的扩展，大体上他们的功能是类似的，都是动态加载一个 `so` 文件。

```cpp
Result<void*> NativeLoaderNamespace::Load(const char* lib_name) const {
  if (!IsBridged()) {
    android_dlextinfo extinfo;
    extinfo.flags = ANDROID_DLEXT_USE_NAMESPACE;
    extinfo.library_namespace = this->ToRawAndroidNamespace();
    void* handle = android_dlopen_ext(lib_name, RTLD_NOW, &extinfo);
    if (handle != nullptr) {
      return handle;
    }
  } else {
    ...
  }
  return Error() << GetLinkerError(IsBridged());
}
```

## 3\. android_dlopen_ext -> do_dlopen

这个函数开始，就进入了真正对一个 `so` 文件进行处理的过程，同样在开始的时候会有较多的跳转，中间几乎没有什么逻辑处理，这里我只给出 `android_dlopen_ext` 和 `do_dlopen` 的参数，大部分参数都在重复的传递。

```
android_dlopen_ext__loader_android_dlopen_extdlopen_extdo_dlopen
```

```cpp
__attribute__((__weak__))
void* android_dlopen_ext(const char* filename, int flag, const android_dlextinfo* extinfo) {
  const void* caller_addr = __builtin_return_address(0);
  return __loader_android_dlopen_ext(filename, flag, extinfo, caller_addr);
}
void* __loader_android_dlopen_ext($PARMS) {
  return dlopen_ext(filename, flags, extinfo, caller_addr);
}
static void* dlopen_ext($PARMS) 
{
  ScopedPthreadMutexLocker locker(&g_dl_mutex);
  g_linker_logger.ResetState();
  void* result = do_dlopen(filename, flags, extinfo, caller_addr);
  if (result == nullptr) {
    __bionic_format_dlerror("dlopen failed", linker_get_error_buffer());
    return nullptr;
  }
  return result;
}
```

### 3.1 dl_dlopen

`dl_open` 也是个胶水层的函数，第一部分的逻辑主要是在进行路径转换，安卓有一部分的库 `so` 并不直接在 `system` 路径下，可能在 `apex` 路径下。第二歩处理的逻辑查看是否启用了 `HWASAN || ASAN` 两个内存检查工具，如果启用则使用由工具处理过的系统代替。对于一般的 `so` 可以直接看最后一部分即可。

```cpp
void* do_dlopen(const char* name, int flags,
                const android_dlextinfo* extinfo,
                const void* caller_addr) {

  soinfo* const caller = find_containing_library(caller_addr);
  android_namespace_t* ns = get_caller_namespace(caller);  
  ... 这里省略两个路径转化的部分代码。
  // * 加载一般的 So.
  ProtectedDataGuard guard;
  // * 链接过程
  soinfo* si = find_library(ns, translated_name, flags, extinfo, caller);
  loading_trace.End();
  // * link 成功
  if (si != nullptr) {
    void* handle = si->to_handle();
    // * call init function
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

这个函数的结构是需要关注的，首先通过 `translated_name` 进行链接，接着再调用了 `si->call_constructors()` ，来执行 `so` 的自定义的初始化函数。这种初始化的函数一般是由 `__attribute__((constructor))` 标明的。所以当 `JNIOnload` 中没有对文件进行解密之类的操作的时候，有可能是在更早的时机，比如这里。同时，对于一个动态链接库来说，也不有再早的时机执行代码了。

```cpp
void soinfo::call_constructors() {
  .../*调用 DT_INIT 指向的函数*/
  call_function("DT_INIT", init_func_, get_realpath());
  // 调用 `DT_INIT_ARRAY` 里的函数
  call_array("DT_INIT_ARRAY", init_array_, init_array_count_, false, get_realpath());
  ...
}
```

### 3.2 find_library

`find_library` 会调用到 `find_libraries` ，并且处理了大部分链接的工作，处理依赖、加载到内存、符号重定位等。

下面的内容则是 `find_libraries` 的片段，包含主要的逻辑。首先并不是只能处理一个 `so` ，实际上是可以同时处理很多的，它毕竟是通过 `so` 的名字去查找的，代码则如下所示。当我们动态链接一个 `so` 的时候， `load_tasks` 的数据结构则类似于 `load_task = ["LoadTask("libA.so",caller,ns,<ptr,readers_map>)"]` 。 `ElfReader` 是安卓 `Bionic` 用来读取 `Elf` 文件格式的结构体，这里会为每一个 `so` 分配一个相应的 `ElfReade` 。

```cpp
typedef std::vector<LoadTask*> LoadTaskList;
std::unordered_map<const soinfo*, ElfReader> readers_map;
LoadTaskList load_tasks;
//* 存储要被加载的 so,这里只有一个
for (size_t i = 0; i < library_names_count; ++i) {
  const char* name = library_names[i];
  load_tasks.push_back(LoadTask::create(name, start_with, ns, &readers_map));
}
```

接着会为 `so_info` 这个结构体分配内存，没什么特别的， `c` 语言的风格的 `new Obj` 。

```cpp
if (soinfos == nullptr) {
  // * 计算加载的 soinfos_size, 对于 dlopen 来说,只是一个的大小。
  // * 同时分配了内存大小
  size_t soinfos_size = sizeof(soinfo*)*library_names_count;
  soinfos = reinterpret_cast<soinfo**>(alloca(soinfos_size));
  memset(soinfos, 0, soinfos_size);
}
```

### 3.3 find_library_internal

之后，会开始优先将所有依赖的 `so` 添加至 `load_tasks` 的任务队列中，展平化的加载可以避免单个 `so` 单次处理的重复判断。

```cpp
// Step 1: expand the list of load_tasks to include
// all DT_NEEDED libraries (do not load them just yet)
for (size_t i = 0; i<load_tasks.size(); ++i) {
  LoadTask* task = load_tasks[i]; // * LoadTask: libA.so
  soinfo* needed_by = task->get_needed_by(); //* need_by : caller
  // * is_dt_needed = true && ((caller != start_with:caller) || false ) = false
  bool is_dt_needed = needed_by != nullptr && (needed_by != start_with || add_as_children);
  // * task.extinfo = extinfo
  task->set_extinfo(is_dt_needed ? nullptr : extinfo);
  // * task.dt_needed = false
  task->set_dt_needed(is_dt_needed);

  // Note: start from the namespace that is stored in the LoadTask. This namespace
  // is different from the current namespace when the LoadTask is for a transitive
  // dependency and the lib that created the LoadTask is not found in the
  // current namespace but in one of the linked namespaces.
  // * for dlopen -> start_ns = ns
  android_namespace_t* start_ns = const_cast<android_namespace_t*>(task->get_start_from());
  
  LD_LOG(kLogDlopen, "find_library_internal(ns=%s@%p): task=%s, is_dt_needed=%d",
         start_ns->get_name(), start_ns, task->get_name(), is_dt_needed);
  // * ns,task,stack_var,load_task[],unkown
  // * 加载 ELF头, PHT头, SHT头, 把 DT_NEED , 依赖库添加进去。 不会把自己设置成 linked.
  if (!find_library_internal(start_ns, task, &zip_archive_cache, &load_tasks, rtld_flags)) {
    return false;
  }

  soinfo* si = task->get_soinfo();

  if (is_dt_needed) {
    needed_by->add_child(si);
  }

  // When ld_preloads is not null, the first
  // ld_preloads_count libs are in fact ld_preloads.
  bool is_ld_preload = false;
  if (ld_preloads != nullptr && soinfos_count < ld_preloads_count) {
    ld_preloads->push_back(si);
    is_ld_preload = true;
  }

  if (soinfos_count < library_names_count) {
    soinfos[soinfos_count++] = si;
  }

}
```
