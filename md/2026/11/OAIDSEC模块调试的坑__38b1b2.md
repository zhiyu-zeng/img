---
title: OAIDSEC模块调试的坑
source: https://fjqisba.github.io/2026/10/19/2026/OAIDSEC%E6%A8%A1%E5%9D%97%E8%B0%83%E8%AF%95%E7%9A%84%E5%9D%91/
source_host: fjqisba.github.io
clip_date: 2026-11-19T10:56:25+08:00
trace_id: 4f878a8c-eac4-40ac-aae6-d6d8c8cd1a1f
content_hash: 58bdd3594f50d0a3334c840a94170eb3be8bed72a0be9be74c58572303e1bf29
status: synced
tags: []
series: null
feed_source: fjqisba·Android/Hook
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41d75244-d011-8158-97ba-f22ccfb23e73
ioc: null
---

## OAIDSEC模块调试的坑

OAIDSEC模块网上资料很多，这里就不细讲了，检测点貌似就两种：

1、 `exit` 、 `_exit` 正常系统调用是一种

2、 `mmap` 申请内存 `shellcode` 退出是一种

通过交叉引用就可以迅速找到检测关键点，OLLVM CFF混淆在现在的AI面前也不值一提。

这里记录点需要记录的

## 关于ART中的PrettyMethod检查

检测逻辑大概是这样的：

```cpp
// 按 SDK 选择并解析 art::PrettyMethod，失败返回 nullptr。
PrettyMethodFn lookup_pretty_method(int sdk) {
    if (sdk >= 21 && sdk <= 22) {
        return lookup_via_dlopen("_ZN3art12PrettyMethodEPNS_6mirror9ArtMethodEb");
    }
    if (sdk >= 23 && sdk <= 25) {
        return lookup_via_custom_loader("_ZN3art12PrettyMethodEPNS_9ArtMethodEb");
    }
    if (sdk >= 26) {
        return lookup_via_custom_loader("_ZN3art9ArtMethod12PrettyMethodEb");
    }
    return nullptr;  // SDK < 21
}

constexpr std::uint32_t kStubLdrX16 = 0x58000050;  // LDR X16, #8
constexpr std::uint32_t kStubLdrX17 = 0x58000051;  // LDR X17, #8

PrettyMethodFn pretty_method = lookup_pretty_method(sdk_level());
const std::uint32_t first = *reinterpret_cast<const std::uint32_t*>(pretty_method);
if (first == kStubLdrX16 || first == kStubLdrX17){
    // kill self
}
C++
```

这是在检测Frida对PrettyMethod方法的hook，使用了 `Java.perform` 就会触发，Frida要hook这个方法是为了修复ART的一个BUG。

### 一、ART 的 bug 是什么

`art::Thread::QuickDeliverException()` 是 ART 投递 Java 异常的入口，它有个隐含前提： **抛异常时当前线程栈上至少有一个托管（Java）栈帧**——因为异常通常是从 Java 代码里 `throw` 出来的。

但 **native 线程也能抛 Java 异常**。最典型的就是 `JNIEnv->FindClass()` 找不到类时，ART 内部会 `ThrowNoClassDefFoundError` 。此刻线程栈上全是 native 帧，没有任何 Java 帧， `QuickDeliverException()` 仍按”有 Java 帧”去取当前方法，拿到 `nullptr` ，程序就会炸。

`art::Thread::QuickDeliverException()` 是 ART 投递 Java 异常的入口，它有个隐含前提： **抛异常时当前线程栈上至少有一个托管（Java）栈帧**——因为异常通常是从 Java 代码里 `throw` 出来的。但 **native 线程也能抛 Java 异常**。最典型的就是 `JNIEnv->FindClass()` 找不到类时，ART 内部会 `ThrowNoClassDefFoundError` 。此刻线程栈上全是 native 帧，没有任何 Java 帧， `QuickDeliverException()` 仍按”有 Java 帧”去取当前方法，拿到 `nullptr` ，后面拿它去查处理器、拼错误信息，就炸了。 **Frida的脚本往往在任意线程（JS 线程、RPC 线程）里按名字 `FindClass` ，是主动高频触发者**。

Frida 的注释就是这么说的：

```
There is a bug in art::Thread::QuickDeliverException() where it assumes
there is a Java stack frame present on the art::Thread's stack. This is
not the case if a native thread calls a throwing method like FindClass().
VBNET
```

### 二、Frida 怎么”修”的

它改不了系统库，所以选择在 **ART 打印方法名的那一刻把空指针换掉** （ `lib/android.js:1990` ）：

```cpp
void on_art_method_pretty_method (GumInvocationContext * ic) {
  gpointer method = gum_invocation_context_get_nth_argument (ic, 0);  // this
  if (method == NULL)
    gum_invocation_context_replace_nth_argument (ic, 0, last_seen_art_method);
  else
    last_seen_art_method = method;
}
C++
```

逻辑很朴素：

-   每次 `PrettyMethod` 被调用时，记下这个 `ArtMethod*` ；
-   一旦 ART 拿 `nullptr` 来调 `PrettyMethod` ，就把第一个参数替换成 **上一次记录到的合法 ArtMethod**。

于是 ART 内部后续访问 `method->...` 时不再是空指针，进程活着。这是个 **启发式补丁**，语义上未必对（打印出来的方法名可能是错的），但能避免崩溃。

### 三、为什么非得挂 PrettyMethod

因为它是异常投递路径上”描述这个方法”的 **唯一汇聚点**——ART 在崩之前一定会走到这里，把方法名/签名渲染出来。劫持它，等于在最靠近故障点的位置拦一刀。

## 和Frida的冲突

如果你找到了OAIDSEC模块的所有检测点，尝试使用Frida来Patch所有的检测点，还是有可能会遇到程序崩溃引起的死锁。

1、问题的关键在于Frida存在一个mmap机制，js脚本尝试执行寻找导出函数类似的代码时，例如执行\*\* `findExportByName` \*\*，需要拿到模块的句柄

gum 不使用公共 `dlopen` ，而是直接调用 linker 内部的 `do_dlopen` / `dlopen` 。要拿到这两个函数地址， `gum_linker_api_try_init` 会在 linker 的 **符号表** 里找：

```lisp
linker = _gum_native_module_get_elf_module (GUM_NATIVE_MODULE (gum_android_get_linker_module ()));
gum_elf_module_enumerate_symbols (linker, gum_store_linker_symbol_if_needed, &pending);  // :954
LISP
```

`enumerate_symbols` 先枚举 \*\*`.symtab` \*\*：

```
gum_elf_module_enumerate_symbols_in_section (self, GUM_ELF_SECTION_SYMTAB, ...);  // :2152
GAMS
```

而内存里的 linker 镜像只有 `PT_LOAD` 段：section header table 在 `e_shoff` 处，如果 **不在任何 `PT_LOAD` 段内**， ONLINE 模式就拿不到 `shdr` ：

于是在 ONLINE 模式下改为打开磁盘文件，而“读整个文件”的实现就是 `g_mapped_file_new` （`:589` ）： `mmap(fd, 0, size, PROT_READ, MAP_PRIVATE)` ，即frida将整份 linker64进行了一份只读映射。

2、而OAIDSEC模块则刚好有一段CRC32校验检测代码，其中要用到 `linker64` 来定位模块，它的选择是遍历 `/proc/self/maps` ，选择第一个遇到的 `linker64` 作为基址，这将会有很大概率选错 `linker64` ，选中的是Frida的那份文件映射内存。最终导致程序崩溃。

这种情况就属于是，OAIDSEC和Frida这两个吊毛代码，单个看起来都问题，组合起来就会出问题。

而崩溃和死锁往往是有关联的，特殊的地方的崩溃，是有很高概率引起死锁的。。。最终看起来表现就是应用卡住了。OAIDSEC无意中又写出了一个 `anti frida` 的检测机制。
