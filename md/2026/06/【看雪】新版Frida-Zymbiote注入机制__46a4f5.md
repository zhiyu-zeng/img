---
title: 【看雪】新版Frida-Zymbiote注入机制
source: https://bbs.kanxue.com/thread-289866.htm
source_host: bbs.kanxue.com
clip_date: 2026-06-16T17:05:55+08:00
trace_id: 5b2ad72a-7f25-4e3f-8b80-641bdbe8fefa
content_hash: e0310cf41d9019013e5b7adbb50e013a6f7bce5a286c87160fc2e5c9ddacc5ac
status: summarized
tags:
  - 看雪
series: null
ai_summary: Frida 17.6.0 采用新型 Zymbiote 机制，通过外部内存操作和轻量级通信实现进程注入，显著提升了稳定性和隐蔽性。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 38175244-d011-81a1-ba66-d3e9b737b4a5
---

> 💡 **AI 总结（key-points）**
>
> Frida 17.6.0 采用新型 Zymbiote 机制，通过外部内存操作和轻量级通信实现进程注入，显著提升了稳定性和隐蔽性。
> 
> - **远程读写优化：** 采用直接读写 `/proc/<zygote>/mem` 的方式，替代了传统的 ptrace 进程注入，减少了对目标进程的侵入。
> - **Hook 机制改变：** 针对触发点 `android_os_Process_setArgV0` 的 Java 方法，直接修改其 ArtMethod 的 `entry_point` 字段，而非进行 inline hook。
> - **精准定位技巧：** 通过解析 `libandroid_runtime.so` 符号找到函数地址，再在 zygote 的堆内存中搜索指向该地址的指针，从而定位到目标 ArtMethod 的 `entry_point`。
> - **Payload 设计与注入：** 将一小段精心设计的机器码（Payload）注入到 `libstagefright.so` 末尾有空闲且可执行的内存页。Payload 内包含 libc 函数指针等数据，需由 Frida Server 手动重定位填充。
> - **无痕清理机制：** Hook 触发后仅通过 Unix socket 与 Server 通信获取时机，再由 Server 通过 ptrace 注入真正的 `frida-gadget.so`，成功后立即清理 zygote 进程中的 Payload 痕迹。

## 0x00 前言

Frida 17.6.0在Android端的Zygote注入机制上进行了一次值得关注的重构。它展示了一种更加稳定的注入设计思路

传统的ptrace注入方案虽然在功能上强大，但在实际应用中常常面临稳定性挑战：在子进程中残留痕迹容易被检测、与其他工具的兼容性也时有冲突等。而新引入的“zymbiote”机制采用了完全不同的实现路径——通过外部内存操作和轻量级通信，在几乎不留下痕迹的情况下完成了进程监控。

理解这套机制不仅能帮助我们更好地使用新版工具，更重要的是，它为我们思考Android系统层级的动态分析技术提供了新的视角。本文将详细解析zymbiote的技术原理和实现细节

## 0x01 回顾之前

去年我在这篇文章中介绍了spawn模式注入so的实现原理： [spawn模式注入so](https://bbs.kanxue.com/elink@1e5K9s2c8@1M7s2y4Q4x3@1q4Q4x3V1k6Q4x3V1k6&6N6i4g2C8K9g2\)9J5k6h3y4G2L8$3I4Q4x3V1k6H3L8%4y4@1M7#2\)9J5c8X3W2F1K9X3g2U0N6s2y4G2x3W2\)9J5c8R3%60.%60.)

它的核心思想是先向zygote进程注入一个mon.so，这样它运行在zygote进程，就可以轻而易举的实现对zygote进程中函数的hook，通过hook fork系列函数，在fork触发之后再安装对setArgV0的hook，在setArgV0函数触发时判断是否是目标app，从而确定是否dlopen需要注入的so，现在看来这套设计是有问题的，因为setArgV0函数是用于设置进程名的，在app启动时它会被稳定触发，所以完全可以跳过对fork函数的hook，直接hook setArgV0。其次就是zygote里驻留的so不是很好清理，以及selinux的问题处理的也很粗糙

当然，Frida之前的注入也有这些问题，server一启动，对libc的hook就安装了，这会导致很多app打开就闪退，我在校时吃饭需要用到 `完美校园` 这个app，经常付钱的时候才想起来刚用过frida，手机还没重启，就会很尴尬

## 0x02 正片

可以看到之前的注入方式(**开源的** ， **公开的**)大多都是通过ptrace注入zygote，其中ptrace负责实现远程读写+远程调用，再通过hook监控fork相关的函数实现的，而这次Frida更新，带来了一种新的思路

但是核心逻辑是不变的，仍然需要远程读写+hook，但是这里它两个模块都做了优化

**远程读写：**

当前frida采用直接读写 `/proc/<zygote>/mem` 的形式进行远程读写(这个操作挂圈好像用的很多)。在我的理解中 `/proc/[pid]/mem` 是通过文件系统接口暴露的进程虚拟内存空间的直接读写通道，它像一个窗户，窗户内部是进程的完整虚拟地址空间，那么要如何精准的在这块空间里找到我们想要的东西呢？那就需要先去读 `/proc/[pid]/maps` ，map翻译过来是地图的意思，事实也的确如此， `maps` 就像是这块空间的一张地图，通过它就可以定位到我们想要的位置

**hook**

再次回顾一下之前，我们的安装hook是通过运行在zygote进程内部的代码 修改目标函数开始处的指令为跳转指令，从而使运行到该函数时自动跳转到我们自己的hook函数的

frida选择的是setArgV0函数作为触发点，这个函数之前介绍过的，它会在app启动时稳定被调用

```c
voidandroid_os_Process_setArgV0(JNIEnv* env, jobject clazz, jstring name)
```

值得注意的是，这是一个JNI函数，对于JNI函数，它在java层就会有一个对应的java函数，那我们直接hook对应的java函数就好了。这个就很熟悉了，直接修改对应java函数的ArtMethod的 `entry_point` 即可，完全不需要inline hook了，frida就是这样做的，当然对于JNI函数，还有别的hook方法，但是frida在这个注入场景，修改 `entry_point` 是最简洁的做法

那么hook如何安装呢？回顾刚刚的hook方案，核心是修改目标函数的 `entry_point` ，而目标函数是系统库里的函数，那他在开机之后，app启动之前，就存在zygote进程的内存里面了。那么我们只需要在zygote的内存里找到目标函数的 `entry_point` 字段，然后把它的值修改到我们的hook函数的地址就行了，那么现在就需要解决两个问题

1.  如何定位目标函数的 `entry_point` 并修改
2.  我们的hook函数该如何注入到zygote进程

## 0x03 问题 一

Frida 采用了一个巧妙的方法来定位 `android_os_Process_setArgV0` 对应的 ArtMethod 的 entry\_point：

#### step1：找到 JNI 函数的地址

首先，通过解析 `libandroid_runtime.so` 这个ELF 文件，找到 JNI 函数的符号地址：

```kotlin
// src/linux/linux-host-session.vala:986-995
uint64 set_argv0_address = 0;
runtime.enumerate_exports (e => {
    // JNI 函数的 mangled name
    if (e.name == "_Z27android_os_Process_setArgV0P7_JNIEnvP8_jobjectP8_jstring") {
        // 计算运行时地址 = 基址 + 偏移
        set_argv0_address = runtime_entry.base_address + e.address;
        return false;
    }
    return true;
});
```

这里得到的 `set_argv0_address` 是函数在内存中的实际地址

#### step2：在内存中搜索指向该地址的指针

Frida 通过读取 zygote 进程的堆内存，搜索包含这个地址的位置：

```java
// src/linux/linux-host-session.vala:1007-1027
uint pointer_size = ("/lib64/" in libc_path) ? 8 : 4;

var original_ptr = new uint8[pointer_size];
var replaced_ptr = new uint8[pointer_size];

// 将地址编码为字节数组
(new Buffer (new Bytes.static (original_ptr), ByteOrder.HOST, pointer_size))
    .write_pointer (0, set_argv0_address);
(new Buffer (new Bytes.static (replaced_ptr), ByteOrder.HOST, pointer_size))
    .write_pointer (0, payload_base);

var fd = open_process_memory (pid);

uint64 art_method_slot = 0;
bool already_patched = false;

// 遍历堆内存区域
foreach (var candidate in heap_candidates) {
    var heap = new uint8[candidate.size];
    var n = fd.pread (heap, candidate.base_address);
    
    // 在堆内存中搜索这个指针值
    void * p = memmem (heap, original_ptr);
    if (p == null) {
        p = memmem (heap, replaced_ptr);
        already_patched = p != null;
    }
    
    if (p != null) {
        // 找到了，计算 ArtMethod 的 entry_point 字段地址
        art_method_slot = candidate.base_address + ((uint8 *) p - (uint8 *) heap);
        break;
    }
}
```

这样就拿到了 `art_method_slot` 的地址，即存储了指向 `android_os_Process_setArgV0` 地址的字段的地址，接下来通过上面提到的，读写 `/proc/<zygote>/mem` 来实现修改该字段，但在修改之前，需要备份一下原始指向的函数地址，后面注入成功/失败之后需要unhook，会用到原本的值

那么应该把 `art_method_slot` 里存储的值改成什么呢？这就该解决第二个问题了

## 0x04 问题 二

传统的做法是通过 ptrace 注入一个.so 文件到 zygote 进程，hook 函数就在这个.so 里。但 Frida 的 zymbiote 机制采用了不同的思路： **不注入.so，而是注入一小段精心设计的机器码（payload）**

这个payload该如何设计我们放到后面再来讨论，目前先解决 `该把它放在哪` 的问题

payload 应该放在哪里？这个位置需要满足几个条件：

1.  **已经具有执行权限** （避免调用 mprotect 修改权限，不然又要ptrace）
2.  **有足够的空闲空间** （payload 大约 2KB）
3.  **不会破坏原有代码** （不能覆盖正在使用的代码）

Frida 选择了 `libstagefright.so` 的最后一页：

```php
// 遍历 zygote 进程的内存映射
foreach (var entry in entries) {
    if (path.has_suffix ("/libstagefright.so") && "x" in flags) {
        // 选择该库的最后一页作为 payload 注入位置
        payload_base = iter.end_address - Gum.query_page_size ();
    }
}
```

选择 `libstagefright.so` 的原因很简单，因为它的最后一页往往有未使用的空间，足够我们写入payload

#### payload的设计

先看一下frida的zymbiote吧，源代码 [zymbiote.c](https://bbs.kanxue.com/elink@5d2K9s2c8@1M7s2y4Q4x3@1q4Q4x3V1k6Q4x3V1k6Y4K9i4c8Z5N6h3u0Q4x3X3g2U0L8$3#2Q4x3V1k6X3M7X3W2V1j5g2\)9J5c8X3k6J5K9h3c8S2i4K6u0V1j5$3!0J5k6g2\)9J5c8X3u0D9L8$3u0Q4x3V1j5^5j5K6j5J5x3K6f1%4j5U0V1@1z5e0l9^5k6U0b7$3k6X3u0U0k6r3q4W2y4K6j5&6y4o6u0U0x3$3g2X3x3h3x3I4z5e0R3&6x3e0j5H3i4K6u0r3M7%4u0U0i4K6u0r3L8r3W2F1N6i4S2Q4x3V1k6Z5k6h3I4H3k6i4u0K6i4K6u0r3P5Y4W2E0j5X3W2G2N6r3g2Q4x3X3g2U0)

```c
struct_FridaApi
{
  charname[64];                    // MAGIC
  
  void** art_method_slot;       // ArtMethod 的 entry_point 地址
  void(* original_set_argv0)(); // 原始 JNI 函数地址
  
  // libc 函数指针
  int(* socket) (...);
  int(* connect) (...);
  int*   (* __errno) (void);
  pid_t   (* getpid) (void);
  pid_t   (* getppid) (void);
  ssize_t (* sendmsg) (...);
  ssize_t (* recv) (...);
  int(* close) (intfd);
  int(* raise) (intsig);
};
 
staticvolatileconstFridaApi frida = {
  .name = "/frida-zymbiote-00000000000000000000000000000000",
};
```

这里定义了一些libc里的函数，运行时会被用到。但是由于这段代码并不是像linker加载so那样被加载进内存的，所以它缺少 `重定位` 步骤，后续需要自己手动重定位

```c
__attribute__ ((section (".text.entrypoint")))
__attribute__ ((visibility ("default")))
int
frida_zymbiote_replacement_set_argv0 (JNIEnv * env, jobject clazz, jstring name)
{
  boolsuccess = false;
  intfd = -1;
  structsockaddr_un addr;
  socklen_t addrlen;
  unsigned intname_len;
 
  // 1. 立即恢复原始 entry_point（避免重复触发）
  *frida.art_method_slot = frida.original_set_argv0;
 
  // 2. 调用原始函数（保证 app 正常运行）
  frida.original_set_argv0 (env, clazz, name);
 
  // 3. 创建 Unix socket
  fd = frida.socket (AF_UNIX, SOCK_STREAM, 0);
  if(fd == -1)
    gotobeach;
 
  // 4. 构造 socket 地址（abstract namespace）
  addr.sun_family = AF_UNIX;
  addr.sun_path[0] = '\0';  // abstract socket 标志
 
  name_len = 0;
  for(unsigned inti = 0; i != sizeof(frida.name); i++)
  {
    if(frida.name[i] == '\0')
      break;
    if(1u + i >= sizeof(addr.sun_path))
      break;
    addr.sun_path[1u + i] = frida.name[i];
    name_len++;
  }
 
  addrlen = (socklen_t) (offsetof (structsockaddr_un, sun_path) + 1u + name_len);
 
  // 5. 连接 Frida Server
  if(frida_connect (fd, (conststructsockaddr *) &addr, addrlen) == -1)
    gotobeach;
 
  // 6. 发送进程信息
  {
    constchar* name_utf8;
    struct
    {
      uint32_t pid;
      uint32_t ppid;
      uint32_t package_name_len;
    } header;
    structiovec iov[2];
 
    name_utf8 = (*env)->GetStringUTFChars (env, name, NULL);
 
      header.package_name_len++;
 
    iov[1].iov_base = (void*) name_utf8;
 
    if(!frida_sendmsg_all (fd, iov, 2, MSG_NOSIGNAL))
      gotobeach;
 
    (*env)->ReleaseStringUTFChars (env, name, name_utf8);
  }
 
  // 7. 等待 Frida Server 确认
  {
    uint8_t rx;
    if(frida_recv (fd, &rx, 1, 0) != 1)
      gotobeach;
  }
 
  success = true;
 
beach:
  if(fd != -1)
    frida.close (fd);
 
  // 8. 暂停进程
  if(success)
  {
    __attribute__ ((musttail))
    returnfrida_stop_and_return (env, clazz, name);
  }
 
  return0;
}
```

这个就是android\_os\_Process\_setArgV0的hook函数，流程总结下来就是 恢复 hook → 调用原始函数 → 连接 Server → 发送信息 → 等待确认 → 暂停进程

```c
__attribute__ ((naked, noinline))
staticint
frida_stop_and_return (JNIEnv * env, jobject clazz, jstring name)
{
#if defined (__aarch64__)
  __asm__ __volatile__ (
      "mov    w0, #%[sig]\n"// 参数：SIGSTOP
      "adrp   x16, frida\n"// 获取 frida 地址（位置无关）
      "add    x16, x16, :lo12:frida\n"
      "ldr    x16, [x16, %[raise_off]]\n"// 读取 raise 函数指针
      "br     x16\n"// 跳转（不会返回）
    :
    : [sig] "i"(SIGSTOP),
      [raise_off] "i"(offsetof (FridaApi, raise))
    : "x16", "memory"
  );
#elif defined (__arm__)
  __asm__ __volatile__ (
      "mov    r0, %[sig]\n"
      "adr    r12, frida\n"
      "ldr    r12, [r12, %[raise_off]]\n"
      "bx     r12\n"
    :
    : [sig] "i"(SIGSTOP),
      [raise_off] "i"(offsetof (FridaApi, raise))
    : "r12", "memory"
  );
#elif defined (__x86_64__)
  __asm__ __volatile__ (
      "mov    $%c[sig], %%edi\n"
      "leaq   frida(%%rip), %%r11\n"
      "movq   %c[raise_off](%%r11), %%r11\n"
      "jmp    *%%r11\n"
    :
    : [sig] "i"(SIGSTOP),
      [raise_off] "i"(offsetof (FridaApi, raise))
    : "r11", "rdi", "memory"
  );
#elif defined (__i386__)
  __asm__ __volatile__ (
      "movl   $%c[sig], 4(%%esp)\n"
      "call   1f\n"
      "1: pop %%eax\n"
      "addl   $(frida-1b), %%eax\n"
      "movl   %c[raise_off](%%eax), %%eax\n"
      "jmp    *%%eax\n"
    :
    : [sig] "i"(SIGSTOP),
      [raise_off] "i"(offsetof (FridaApi, raise))
    : "eax", "memory"
  );
#else
# error Unsupported architecture
#endif
}
```

这个是暂停函数，用于发送 `SIGSTOP` 暂停进程。其他的辅助函数就不介绍了，感兴趣的自己去看

#### payload的重定位

前面提到， `_FridaApi` 结构体里定义了一些 libc 函数指针，但这些指针在编译时都是空的。因为 payload 是纯机器码，不会经过动态链接器的重定位过程，所以需要 Frida Server 手动填充这些函数地址。

**重定位过程：**

```go
// src/linux/linux-host-session.vala

var blob = (pointer_size == 8)
    ? Frida.Data.Android.get_zymbiote_arm64_bin_blob ()
    : Frida.Data.Android.get_zymbiote_arm_bin_blob ();

// 2. 在payload中通过MAGIC查找数据区
void * p = memmem (payload_template, "/frida-zymbiote-00000000000000000000000000000000".data);
size_t data_offset = (uint8 *) p - (uint8 *) payload_template;

// 3. 创建可写的 payload 副本
var payload = new Buffer (new Bytes (payload_template), ByteOrder.HOST, pointer_size);

// 4. 填充数据区
size_t cursor = data_offset;

// 写入 socket 名称
payload.write_string (cursor, server_name);  // "/frida-zymbiote-<UUID>"
cursor += 64;

// 写入 art_method_slot 地址
payload.write_pointer (cursor, art_method_slot);
cursor += pointer_size;

// 写入原始 setArgV0 函数地址
payload.write_pointer (cursor, set_argv0_address);
cursor += pointer_size;

// 5. 填充 libc 函数地址
string[] wanted = {
    "socket",
    "connect",
    "__errno",
    "getpid",
    "getppid",
    "sendmsg",
    "recv",
    "close",
    "raise",
};

// 从 libc.so 中查找这些函数的地址
var addrs = new uint64[wanted.length];
libc.enumerate_exports (e => {
    if (index_of.has_key (e.name)) {
        int idx = index_of[e.name];
        addrs[idx] = libc_entry.base_address + e.address;
        pending--;
    }
    return pending != 0;
});

// 将函数地址写入 payload
for (int i = 0; i != addrs.length; i++) {
    payload.write_pointer (cursor, addrs[i]);
    cursor += pointer_size;
}
```

#### payload的注入

填充完数据后，就可以注入了：

```
// 通过 /proc/[pid]/mem 将 payload 写入目标位置
fd.pwrite (payload.bytes, payload_base);

// 修改 ArtMethod 的 entry_point，使其指向 payload
fd.pwrite (replaced_ptr, art_method_slot);
```

这里直接指向payload是因为链接脚本将hook函数所在的段放在了payload的起始位置（偏移 0）。通过在函数定义时指定section，再配合链接脚本控制段的顺序，就能确保hook函数位于payload开头。

```c
__attribute__ ((section (".text.entrypoint")))
```

```javascript
SECTIONS {
  . = 0;  // 从地址 0 开始
 
  .payload : ALIGN(4096)
  {
    KEEP(*(.text.entrypoint))  // 函数放在最前面
    *(.text*)                   // 其他代码
    *(.rodata*)                 // 只读数据
  }
  
  // 其他段（会被 objcopy 去掉）
  .dynstr : { *(.dynstr) }
  .dynsym : { *(.dynsym) }
  // ...
}
```

至此就完成了payload的注入与 `android_os_Process_setArgV0` 函数的hook

## 0x05 半小结

做完上面的工作， `setArgV0` 就被替换了。在app启动之后， `setArgV0` 被调用，然后走到 `frida_zymbiote_replacement_set_argv0` 里，执行里面的逻辑。这个函数上面介绍过了，Frida并没有选择直接在这里进行注入，而是仅仅获取了这个“时机”，拿到了这个时机之后，就启动Socket与外部通信，在外部通过ptrace把 `frida-gadget.so` 注入进目标进程，注入成功后再清理掉zygote进程里 `libandroid_runtime.so` 最后一页的数据，以此恢复对zygote的污染，从而避免了之前那种一启动server，一堆加壳软件就打不开的尴尬问题

## 0x06 实践

经过之前的学习，可以发现这种注入方式和之前的相比简洁了很多，核心代码也没有多少，而且只做注入的话，还有优化的空间，所以直接开抄，但是明天要上班了，我抄不动了

[#HOOK注入](https://bbs.kanxue.com/forum-161-1-125.htm)

* * *

## 评论

> **Yangser · 2 楼**
> 
> 看雪的markdown解析器好像不支持vala的，，，

> **Imxz · 3 楼**
> 
> tql

> **mb\_asiwnxyv · 4 楼**
> 
> 感谢分享

> **酒仙桥之虎 · 5 楼**
> 
> 666

> **MaYil · 6 楼**
> 
> 感谢分享

> **wx\_huhu\_859 · 7 楼**
> 
> 11

> **Kill\_Log · 8 楼**
> 
> 6666

> **Gryffindoss · 9 楼**
> 
> 666

> **mb\_ysegxpmv · 10 楼**
> 
> 感谢分享

> **wx\_Huber Barrientos · 11 楼**
> 
> 为你点赞！

> **jw8888 · 12 楼**
> 
> 6666666

> **XCicada · 13 楼**
> 
> 为你点赞！

> **黑屏 · 14 楼**
> 
> 666

> **wx\_插曲 · 15 楼**
> 
> 66

> **wx\_范迪塞尔 · 16 楼**
> 
> 6666

> **GEKEZYX · 17 楼**
> 
> 6666

> **mb\_hxjodkds · 18 楼**
> 
> 犇

> **hekes · 19 楼**
> 
> 看看

> **fei3ei · 20 楼**
> 
> 学习

> **蜕无痕 · 21 楼**
> 
> 大侠强啊

> **Yangser · 22 楼**
> 
> > [蜕无痕](https://bbs.kanxue.com/user-813639.htm) 大侠强啊
> 
> 还是造哥更吊

> **wx\_小白\_266 · 23 楼**
> 
> 666

> **mb\_cbgtaveo · 24 楼**
> 
> 66666666666

> **wx\_霿凇 · 25 楼**
> 
> 666
