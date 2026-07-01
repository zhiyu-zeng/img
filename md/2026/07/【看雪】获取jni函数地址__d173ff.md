---
title: 【看雪】获取jni函数地址
source: https://bbs.kanxue.com/thread-291836.htm
source_host: bbs.kanxue.com
clip_date: 2026-07-01T15:42:51+08:00
trace_id: e67e2056-fb25-45a1-b1af-79ca98929ab5
content_hash: b44940a7724b6608584c771f7a13e9423ef3ad20d76a27344b726b374d13abb3
status: summarized
tags:
  - 看雪
series: null
feed_source: 看雪·Android安全
ai_summary: 通过强制 ART 使用指针模式、Hook 绑定写入点，并新增查询接口，可获取 JNI 函数地址并监控 native 方法的延迟绑定。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 39075244-d011-8109-bd85-e4ac4fdbd577
ioc:
  cves: []
  cwes: []
  hashes: []
  domains:
    - bbs.kanxue.com
    - cdn.jsdelivr.net
    - runtime.cc
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 通过强制 ART 使用指针模式、Hook 绑定写入点，并新增查询接口，可获取 JNI 函数地址并监控 native 方法的延迟绑定。
> 
> - **JNI ID 模式切换**：ART 在 Android 11 起支持 kIndices（Debuggable 应用默认，存储索引）和 kPointer（Release 应用默认，存储真实函数指针）模式，影响 `entry_point_from_jni` 的存储方式。
> - **懒加载与跳板桩**：native 方法首次调用前，ART 通过 `GetJniDlsymLookupStub` 跳板进行延迟绑定，使用 `dlsym` 查找真实函数后更新入口点。
> - **强制指针模式**：修改 ART 源码（`art/runtime/runtime.cc`），关闭 kIndices 模式，强制使用 kPointer，确保 `data_` 字段存储真实函数地址而非索引。
> - **绑定监控**：Hook `ArtMethod::SetDataPtrSize` 作为唯一写入口，捕获绑定瞬间，并通过系统属性（如 `debug.jnidump.trace`）控制日志输出，兼容子进程。
> - **主动查询接口**：新增 `dumpNativeBindings` 方法，使用 `dladdr` 反查函数地址，输出所属 so 库、符号和偏移，允许任意时刻拍快照分析绑定状态。

在ART中，每一个Java方法在虚拟机内部都对应着一个C++对象：Artmethod。对native方法来说在Artmethod中有两个很关键的指针：

一个是 `entry_point_from_jni` ：专门用于JNI调用的入口点。当Java层不论是静态注册还是动态注册最终都是这个入口。

再一个就是 `entry_point_from_quick_compiled_code_` ：这个就是ART 执行代码的通用入口

我们重点关注 `entry_point_from_jni`

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/2b7a86055818532b.png)

Android 11 起，ART 把 JNI ID 从裸指针改造成了可切换的间接寻址体系，Android 12 沿用了这套设计

**kindices** 是Debuggable App 默认的模式 在这个模式下 `entry_point_from_jni` 存放的就不是函数地址 而是一个索引。真正的函数地址被放在了一个全局的间接寻址表中。

**kPointer** 则是Release App 默认的模式 在这里就是直接存储的是函数的内存地址

## 懒加载与跳板桩

在一个Native方法被实际调用之前，ART并不知道它对应的C/C++函数在哪里。为了处理这种未决的状态，ART使用了跳板桩。

当类被加载的时候，ArtMethod被创建，他的Native入口点被统一设置为一个名为GetJniDlsymLookupStub的跳板地址。当Java代码第一次调用这个native方法时,执行流跳到了这个Stub。这个Stub的内部逻辑是拿着方法名和签名，去通过dlsym在已加载的.so库中寻找真实的C++函数。找到真实的函数后,Stub会修改ArtMethod的内部指针，将入口点更新为真实的函数地址。这样在下一次再调用这个方法的时候，就直接跳入真实的函数了 不再去走Stub。这被称为 **延迟绑定** 。

根据上面的内容不难看出 要实现目标需要解决kindices模式 懒加载 还需要向外提供一个接口 方便随时frida查看绑定状态

Patch 1 关掉 kIndices，保证 data\_ 里存的是真实函数指针；Patch 2 在 SetDataPtrSize 这个唯一写入口下钩，抓绑定发生的瞬间；Patch 3 和 Patch 4 提供 dumpNativeBindings 接口，任意时刻把 data\_ 读出来并用 dladdr 解析成 so!symbol+offset。

## Patch

### Patch 1：关闭 kIndices 模式

`art/runtime/runtime.cc` 原本根据 App 是否 debuggable 切换 JNI ID 模式：

```cpp
if (IsJavaDebuggable()) {
    SetJniIdType(JniIdType::kIndices);
} else {
    SetJniIdType(JniIdType::kPointer);
}
```

Debuggable App 走 kIndices，直接改成一律 kPointer：

```cpp
SetJniIdType(JniIdType::kPointer);
```

这样 data\_ 里一定是真实函数指针。

### Patch 2：Hook 唯一的写入口

ArtMethod::data\_ 的写入路径很多，但最后都会走到 `ArtMethod::SetDataPtrSize` 。在这里做处理，所有绑定行为都能抓到。

先判 IsNative()，因为 data\_ 是 union 语义，非 native 方法里存的是别的东西。

用 static std::atomic<int> s_enabled{-1} 做三态缓存，因为 SetDataPtrSize 是热路径，每次都读 prop 会拖慢启动。读 /proc/self/cmdline 做前缀匹配是为了兼容:xxx 子进程。

```java
if (IsNative()) {
  static std::atomic<int> s_enabled{-1};
  int t = s_enabled.load(std::memory_order_acquire);
  if (t < 0) {
    char trace_buf[8] = {0};
    char pkg_buf[256] = {0};
#ifdef __ANDROID__
    ::__system_property_get("debug.jnidump.trace", trace_buf);
    ::__system_property_get("debug.jnidump.pkg", pkg_buf);
#endif
    int decision = 0;
    if (trace_buf[0] == '1') {
      // ... 读 /proc/self/cmdline 做前缀匹配 ...
    }
    s_enabled.store(decision, std::memory_order_release);
    t = decision;
  }
  if (t == 1) {
    void* old_data = GetNativePointer<void*>(DataOffset(pointer_size), pointer_size);
    if (old_data != nullptr && old_data != data) {
      LOG(INFO) << "JNIBIND: this=" << reinterpret_cast<void*>(this)
                << " " << old_data << " -> " << data;
    }
  }
}
```

### Patch 3：新增主动查询接口

Patch 2 抓过程，Patch 3 抓快照。在 VMDebug 里加 dumpNativeBindings(Class)，让 Frida 主动查任意类的绑定状态。

C++ 里做三件事：遍历 ArtMethod 只留 IsNative()，读 GetEntryPointFromJniPtrSize；用 dladdr 反查拿到 so、符号、偏移；

```java
PointerSize ptr_size = Runtime::Current()->GetClassLinker()->GetImagePointerSize();
const void* stub1 = GetJniDlsymLookupStub();
const void* stub2 = GetJniDlsymLookupCriticalStub();

for (ArtMethod& m : h_klass->GetMethods(ptr_size)) {
  if (!m.IsNative()) continue;
  const void* entry = m.GetEntryPointFromJniPtrSize(ptr_size);

  Dl_info info;
  memset(&info, 0, sizeof(info));
  const char* lib = "?";
  const char* sym = "(no-symbol)";
  uintptr_t off = 0;
  if (entry != nullptr && dladdr(entry, &info) != 0) {
    if (info.dli_fname) lib = info.dli_fname;
    if (info.dli_sname) sym = info.dli_sname;
    if (info.dli_fbase) {
      off = reinterpret_cast<uintptr_t>(entry) -
            reinterpret_cast<uintptr_t>(info.dli_fbase);
    }
  }
  bool is_trampoline = (entry == stub1 || entry == stub2);
  // ... snprintf 拼输出 ...
}
```

### Patch 4：Java 侧声明

```java
public static native String[] dumpNativeBindings(Class<?> cls);
```

Patch 2 看绑定何时发生、何时被改，适合分析延迟注册和动态改绑。Patch 3 任意时刻拍快照，适合定位可疑方法。

先用 Patch 3 找可疑点（比如落在匿名内存的），再用 Patch 2 回看它怎么被绑上去的。

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/787550a5fc6f2a80.png)

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/d7c7c10bf4d51ed4.png)

## 效果

真实函数入口不在 data\_ 里。只要绕开 data\_ 这个字段，这两个 patch 就同时失效。

## 参考文章

https://bbs.kanxue.com/thread-282707.htm#msg_header_h1_5

https://bbs.kanxue.com/thread-290351.htm#msg_header_h1_2
