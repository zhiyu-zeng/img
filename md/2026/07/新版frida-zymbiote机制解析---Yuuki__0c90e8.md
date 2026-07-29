---
title: 新版frida-zymbiote机制解析 - Yuuki
source: https://yuuki.cool/posts/frida-zymbiote/
source_host: yuuki.cool
clip_date: 2026-07-29T09:55:15+08:00
trace_id: 4fe7bf93-5fd0-4997-9109-f7300c6e6db9
content_hash: 36853c21dae16d3ae8fd79c189c2ca1a4fb44ccd460caa9ef8a6efa2df59c568
status: synced
tags:
  - Android逆向
  - Frida
series: null
feed_source: null
ai_summary: Frida 17.6.0 重构了 Android 端 Zygote 注入，用读写`/proc/pid/mem`替代 ptrace，并通过 shellcode + `setArgV0` hook 实现无残留注入。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ac75244-d011-81df-b8c1-ccbfef1dfed8
ioc:
  cves: []
  cwes: []
  hashes:
    - "00000000000000000000000000000000"
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Frida 17.6.0 重构了 Android 端 Zygote 注入，用读写`/proc/pid/mem`替代 ptrace，并通过 shellcode + `setArgV0` hook 实现无残留注入。
> 
> - **注入机制核心：** 通过直接读写`/proc/<zygote_pid>/mem`完成远程内存访问，避免 ptrace 附加产生的痕迹与兼容性问题。
> - **Hook 点与方式：** 挂钩 JNI 函数 `android_os_Process_setArgV0`，修改其 ArtMethod 的 `entry_point` 字段，使之指向注入的机器码，该函数在 App 启动时稳定触发。
> - **Payload 注入位置：** 选取 `libstagefright.so` 的最后一页写入约 2KB 的自定义 shellcode，该页已具备执行权限且有空闲空间。
> - **Shellcode 工作流：** 恢复原始 `entry_point` → 调用原函数 → 通过 Unix abstract socket 连接 frida-server → 发送进程信息并等待确认 → 发送 `SIGSTOP` 暂停进程。
> - **痕迹清理：** 注入完成后，外部工具通过暂停 zygote 与子进程，将内存中被修改的 `entry_point` 和 shellcode 恢复为原始内容，并删除注入的 so 文件。

## Frida-Zymbiote注入机制

## 0x00 前言

Frida 17.6.0在Android端的Zygote注入机制上进行了一次值得关注的重构。它展示了一种更加稳定、优雅的注入设计思路。

传统的ptrace注入方案虽然在功能上强大，但在实际应用中常常面临稳定性挑战：在子进程中残留痕迹容易被检测、与其他工具的兼容性也时有冲突等。而新引入的“zymbiote”机制采用了完全不同的实现路径——通过外部内存操作和轻量级通信，在几乎不留下痕迹的情况下完成了进程监控。

理解这套机制不仅能帮助我们更好地使用新版工具，更重要的是，它为我们思考Android系统层级的动态分析技术提供了新的视角。本文将详细解析zymbiote的技术原理和实现细节

## 0x01 回顾之前

去年我在这篇文章中介绍了spawn模式注入so的实现原理： [spawn模式注入so](https://yuuki.cool/posts/injectso2/)

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

```cpp
void android_os_Process_setArgV0(JNIEnv* env, jobject clazz, jstring name)
```

值得注意的是，这是一个JNI函数，对于JNI函数，它在java层就会有一个对应的java函数，那我们直接hook对应的java函数就好了。这个就很熟悉了，直接修改对应java函数的ArtMethod的 `entry_point` 即可，完全不需要inline hook了，frida就是这样做的，当然对于JNI函数，还有别的hook方法，但是frida在这个注入场景，修改 `entry_point` 是最简洁的做法

那么hook如何安装呢？回顾刚刚的hook方案，核心是修改目标函数的 `entry_point` ，而目标函数是系统库里的函数，那他在开机之后，app启动之前，就存在zygote进程的内存里面了。那么我们只需要在zygote的内存里找到目标函数的 `entry_point` 字段，然后把它的值修改到我们的hook函数的地址就行了，那么现在就需要解决两个问题

1.  如何定位目标函数的 `entry_point` 并修改
2.  我们的hook函数该如何注入到zygote进程

## 0x03 问题 一

Frida 采用了一个巧妙的方法来定位 `android_os_Process_setArgV0` 对应的 ArtMethod 的 entry_point：

#### step1：找到 JNI 函数的地址

首先，通过解析 `libandroid_runtime.so` 这个ELF 文件，找到 JNI 函数的符号地址：

```vala
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

```vala
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

```vala
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

先看一下frida的zymbiote吧，源代码 [zymbiote.c](https://github.com/frida/frida-core/blob/8c62357b94908f46fbcdae76942c3ef1c1989160/src/linux/helpers/zymbiote.c)

```c
struct _FridaApi
{
  char name[64];          // MAGIC

  void    ** art_method_slot;       // ArtMethod 的 entry_point 地址
  void    (* original_set_argv0)(); // 原始 JNI 函数地址

  // libc 函数指针
  int     (* socket) (...);
  int     (* connect) (...);
  int *   (* __errno) (void);
  pid_t   (* getpid) (void);
  pid_t   (* getppid) (void);
  ssize_t (* sendmsg) (...);
  ssize_t (* recv) (...);
  int     (* close) (int fd);
  int     (* raise) (int sig);
};

static volatile const FridaApi frida = {
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
  bool success = false;
  int fd = -1;
  struct sockaddr_un addr;
  socklen_t addrlen;
  unsigned int name_len;

  // 1. 立即恢复原始 entry_point（避免重复触发）
  *frida.art_method_slot = frida.original_set_argv0;

  // 2. 调用原始函数（保证 app 正常运行）
  frida.original_set_argv0 (env, clazz, name);

  // 3. 创建 Unix socket
  fd = frida.socket (AF_UNIX, SOCK_STREAM, 0);
  if (fd == -1)
    goto beach;

  // 4. 构造 socket 地址（abstract namespace）
  addr.sun_family = AF_UNIX;
  addr.sun_path[0] = '\0';  // abstract socket 标志

  name_len = 0;
  for (unsigned int i = 0; i != sizeof (frida.name); i++)
  {
    if (frida.name[i] == '\0')
      break;
    if (1u + i >= sizeof (addr.sun_path))
      break;
    addr.sun_path[1u + i] = frida.name[i];
    name_len++;
  }

  addrlen = (socklen_t) (offsetof (struct sockaddr_un, sun_path) + 1u + name_len);

  // 5. 连接 Frida Server
  if (frida_connect (fd, (const struct sockaddr *) &addr, addrlen) == -1)
    goto beach;

  // 6. 发送进程信息
  {
    const char * name_utf8;
    struct
    {
      uint32_t pid;
      uint32_t ppid;
      uint32_t package_name_len;
    } header;
    struct iovec iov[2];

    name_utf8 = (*env)->GetStringUTFChars (env, name, NULL);

    header.pid = frida.getpid ();
    header.ppid = frida.getppid ();
    header.package_name_len = 0;
    while (name_utf8[header.package_name_len] != '\0')
      header.package_name_len++;

    iov[0].iov_base = &header;
    iov[0].iov_len = sizeof (header);
    iov[1].iov_base = (void *) name_utf8;
    iov[1].iov_len = header.package_name_len;

    if (!frida_sendmsg_all (fd, iov, 2, MSG_NOSIGNAL))
      goto beach;

    (*env)->ReleaseStringUTFChars (env, name, name_utf8);
  }

  // 7. 等待 Frida Server 确认
  {
    uint8_t rx;
    if (frida_recv (fd, &rx, 1, 0) != 1)
      goto beach;
  }

  success = true;

beach:
  if (fd != -1)
    frida.close (fd);

  // 8. 暂停进程
  if (success)
  {
    __attribute__ ((musttail))
    return frida_stop_and_return (env, clazz, name);
  }

  return 0;
}
```

这个就是android_os_Process_setArgV0的hook函数，流程总结下来就是 恢复 hook → 调用原始函数 → 连接 Server → 发送信息 → 等待确认 → 暂停进程

```c
__attribute__ ((naked, noinline))
static int
frida_stop_and_return (JNIEnv * env, jobject clazz, jstring name)
{
#if defined (__aarch64__)
  __asm__ __volatile__ (
      "mov    w0, #%[sig]\n"           // 参数：SIGSTOP
      "adrp   x16, frida\n"            // 获取 frida 地址（位置无关）
      "add    x16, x16, :lo12:frida\n"
      "ldr    x16, [x16, %[raise_off]]\n" // 读取 raise 函数指针
      "br     x16\n"                   // 跳转（不会返回）
    :
    : [sig] "i" (SIGSTOP),
      [raise_off] "i" (offsetof (FridaApi, raise))
    : "x16", "memory"
  );
#elif defined (__arm__)
  __asm__ __volatile__ (
      "mov    r0, %[sig]\n"
      "adr    r12, frida\n"
      "ldr    r12, [r12, %[raise_off]]\n"
      "bx     r12\n"
    :
    : [sig] "i" (SIGSTOP),
      [raise_off] "i" (offsetof (FridaApi, raise))
    : "r12", "memory"
  );
#elif defined (__x86_64__)
  __asm__ __volatile__ (
      "mov    $%c[sig], %%edi\n"
      "leaq   frida(%%rip), %%r11\n"
      "movq   %c[raise_off](%%r11), %%r11\n"
      "jmp    *%%r11\n"
    :
    : [sig] "i" (SIGSTOP),
      [raise_off] "i" (offsetof (FridaApi, raise))
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
    : [sig] "i" (SIGSTOP),
      [raise_off] "i" (offsetof (FridaApi, raise))
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

```vala
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

```vala
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

经过之前的学习，可以发现这种注入方式和之前的相比简洁了很多，核心代码也没有多少，而且还有优化的空间，所以直接开抄

### payload设计

写代码之前先明确我们需要什么

首先我们需要一个与外部通信的机制，因为在注入结束之后，我们要通知外部进程(Injector)清理目标APP进程里的payload代码(继承自zygote)，以及zygote进程里的payload代码等等其他痕迹，以防被目标APP和其他APP检测到环境异常。同时我们需要一个暂停机制，在目标APP内存里的payload代码没有清理干净之前，进程应该处于暂停状态

其次，我希望避免使用ptrace，而是直接在 `setArgV0` 里dlopen要注入的so，所以所以后续还需要写入 `dlopen` 的地址。同时这里还涉及判断是否是目标进程的问题，frida是通过uid的比较，但是我感觉用包名应该也可以，但是得写入 `strcmp` 的函数指针，或者自己实现一个，自己实现的话有点浪费空间了，这一块还是抄frida吧

最后我们需要打印日志，所以还需要写入 `log_print` 的函数地址，当然这个看个人喜好吧

总结一下，我们的api，姑且就叫 `uki_tools` 吧，它应该至少包含这些内容

```c
struct uki_tools {
  char magic[64];                    // Magic 字符串，用于定位数据区

  void    ** art_method_slot;        // ArtMethod 的 entry_point 地址
  void    (* original_set_argv0)();  // 原始 setArgV0 函数地址

  uid_t   target_uid;                // 目标 app 的 UID
  char    so_path[128];              // 要注入的 SO 路径

  // 通信相关
  int     (* socket) (int domain, int type, int protocol);
  int     (* connect) (int sockfd, const struct sockaddr * addr, socklen_t addrlen);
  int *   (* __errno) (void);
  ssize_t (* write) (int fd, const void * buf, size_t count);
  ssize_t (* read) (int fd, void * buf, size_t count);
  int     (* close) (int fd);

  // 进程相关
  uid_t   (* getuid) (void);
  int     (* raise) (int sig);

  // 注入相关
  void *  (* dlopen) (const char * filename, int flag);

  // 日志相关
  int     (* log_print) (int prio, const char * tag, const char * fmt, ...);
};

static volatile const struct uki_tools tools = {
  .magic = "/uki-injector-00000000000000000000000000000000000000000",
};
```

接下来就是我们的hook函数了，姑且叫 `uki_replacement_set_argv0` ，先设计一下时序吧

#### 时序设计

完整的注入时序如下：

##### App 进程侧

**T0.** 外部 Injector 进程始终运行，监听 socket

**T1.** 恢复 hook（避免重复触发）

```c
*tools.art_method_slot = tools.original_set_argv0;
```

**T2.** 调用原始函数（保证 app 正常运行）

```c
tools.original_set_argv0 (env, clazz, name);
```

**T3.** 检查 UID，判断是否是目标进程

```c
if (tools.getuid() != tools.target_uid)
    return 0;  // 不是目标进程，直接返回
```

**T4.** 创建并连接 socket

```c
fd = tools.socket(AF_UNIX, SOCK_STREAM, 0);
uki_connect(fd, &addr, addrlen);
```

**T5.** 如果连接失败，进程自杀

```c
if (connect_failed) {
    tools.raise(SIGKILL);  // Injector 有超时机制，超时后清理 zygote
}
```

**T6.** 连接成功，dlopen 目标 SO

```c
void *handle = tools.dlopen(tools.so_path, RTLD_NOW);
```

**T7.** 如果 dlopen 失败

```c
if (handle == NULL) {
    // 发送失败消息给 Injector
    uint8_t status = 0x00;
    uki_write(fd, &status, 1);

    // 进程自杀
    tools.raise(SIGKILL);
}
```

**T8.** 如果 dlopen 成功

```c
// 发送成功消息给 Injector
uint8_t status = 0x01;
uki_write(fd, &status, 1);

// 等待 Injector 确认收到
uint8_t ack;
uki_read(fd, &ack, 1);

// 收到确认后，调用 raise(SIGSTOP) 暂停自己
uki_stop_and_return(env, clazz, name);
```

##### Injector 进程侧

**T9.** 发送确认后的清理流程

```c
// 发送确认
uint8_t ack = 0x42;
write(client_fd, &ack, 1);

// 轮询 /proc/[pid]/stat，等待进程暂停（应有超时机制）
wait_until_stopped(child_pid, 5);

// 清理 zygote 的 payload
kill(zygote_pid, SIGSTOP);
pwrite(zygote_mem_fd, &original_entry_point, sizeof(ptr), art_method_slot);
pwrite(zygote_mem_fd, original_payload, payload_size, shellcode_base);
kill(zygote_pid, SIGCONT);

// 清理 app 进程的 payload
pwrite(child_mem_fd, &original_entry_point, sizeof(ptr), art_method_slot);
pwrite(child_mem_fd, original_payload, payload_size, shellcode_base);

// 删除私有目录的 SO
unlink(so_path);

// 发送 SIGCONT 恢复进程
kill(child_pid, SIGCONT);
```

**T10.** Injector 退出

**时序图：**

```bash
App 进程                          Injector 进程
    |                                  |
    |                                  | [T0] 监听 socket
    |                                  |
    |-- [T1] 恢复 entry_point -------->|
    |-- [T2] 调用原始函数 ------------->|
    |-- [T3] 检查 UID ----------------->|
    |                                  |
    |-- [T4] 连接 socket -------------->|
    |                                  |<- 接受连接
    |                                  |
    |-- [T6] dlopen SO ---------------->|
    |                                  |
    |-- [T8] 发送成功消息 (0x01) ------>|
    |                                  |<- 收到成功消息
    |                                  |
    |                                  |-- [T9] 发送确认 (0x42)
    |<- 收到确认 -----------------------|
    |                                  |
    |-- raise(SIGSTOP) --------> 内核  |
    |   (进入内核态)                   |
    |                                  |
    |   [进程暂停]                     |-- 轮询 /proc/[pid]/stat
    |                                  |   state = 'S' → 'T'
    |                                  |
    |                                  |<- 进程已 STOPPED
    |                                  |
    |                                  |-- 暂停 zygote
    |                                  |-- 清理 zygote payload
    |                                  |-- 恢复 zygote
    |                                  |
    |                                  |-- 清理 app payload
    |                                  |-- 删除 SO 文件
    |                                  |
    |                                  |-- SIGCONT
    |<- 恢复 --------------------------|
    |   (从内核态返回)                 |
    |                                  |
    |-- 继续执行 ---------------------->|
    |                                  |
    |                                  |-- [T10] 退出
```

### hook函数

```c
__attribute__ ((section (".text.yuuki")))
__attribute__ ((visibility ("default")))
int
uki_replacement_set_argv0 (JNIEnv * env, jobject clazz, jstring name)
{
  int fd = -1;
  struct sockaddr_un addr;
  const char * name_utf8;
  bool inject_success = false;

  // T1. 立即恢复 hook（避免重复触发）
  *tools.art_method_slot = tools.original_set_argv0;

  // T2. 调用原始函数（保证 app 正常运行）
  tools.original_set_argv0 (env, clazz, name);

  // T3. 检查 UID，判断是否是目标进程
  if (tools.getuid () != tools.target_uid)
    return 0;  // 不是目标进程，直接返回

  name_utf8 = (*env)->GetStringUTFChars (env, name, NULL);
  LOGI((&tools), "Target app detected: %s, UID: %d", name_utf8, tools.target_uid);

  // T4. 创建 Unix socket
  fd = tools.socket (AF_UNIX, SOCK_STREAM, 0);
  if (fd == -1) {
    LOGE((&tools), "Failed to create socket");
    goto suicide;
  }

  // 构造 socket 地址（abstract namespace）
  addr.sun_family = AF_UNIX;
  addr.sun_path[0] = '\0';

  unsigned int name_len = 0;
  for (unsigned int i = 0; i != sizeof (tools.magic); i++)
  {
    if (tools.magic[i] == '\0')
      break;
    if (1u + i >= sizeof (addr.sun_path))
      break;
    addr.sun_path[1u + i] = tools.magic[i];
    name_len++;
  }

  socklen_t addrlen = (socklen_t) (offsetof (struct sockaddr_un, sun_path) + 1u + name_len);

  // 连接 Injector
  if (uki_connect (fd, (const struct sockaddr *) &addr, addrlen) == -1) {
    LOGE((&tools), "Failed to connect to Injector");
    goto suicide;  // T5. 连接失败，进程自杀
  }

  LOGI((&tools), "Connected to Injector, injecting SO: %s", tools.so_path);

  // T6. dlopen 注入 SO
  void * handle = tools.dlopen (tools.so_path, RTLD_NOW);

  if (handle == NULL) {
    // T7. dlopen 失败
    LOGE((&tools), "Failed to dlopen SO");

    // 发送失败消息
    uint8_t status = 0x00;  // 0x00 = 失败
    uki_write (fd, &status, 1);

    (*env)->ReleaseStringUTFChars (env, name, name_utf8);
    tools.close (fd);

    // 进程自杀
    tools.raise (SIGKILL);
    return 0;  // 不会执行到这里
  }

  // T8. dlopen 成功
  LOGI((&tools), "Successfully loaded SO at handle: %p", handle);
  inject_success = true;

  // 发送成功消息
  uint8_t status = 0x01;  // 0x01 = 成功
  if (uki_write (fd, &status, 1) != 1) {
    LOGE((&tools), "Failed to send success status");
    goto beach;
  }

  // 等待 Injector 确认清理完成
  uint8_t ack;
  if (uki_read (fd, &ack, 1) != 1) {
    LOGE((&tools), "Failed to receive ack");
    goto beach;
  }

  LOGI((&tools), "Received ack from Injector, stopping process");

beach:
  (*env)->ReleaseStringUTFChars (env, name, name_utf8);

  if (fd != -1)
    tools.close (fd);

  // 如果注入成功，暂停进程等待清理
  if (inject_success)
  {
    __attribute__ ((musttail))
    return uki_stop_and_return (env, clazz, name);
  }

  return 0;

suicide:
  // T5. 连接失败，进程自杀
  (*env)->ReleaseStringUTFChars (env, name, name_utf8);
  if (fd != -1)
    tools.close (fd);

  LOGE((&tools), "Connection failed, committing suicide");
  tools.raise (SIGKILL);
  return 0;  // 不会执行到这里
}
```

ok主体就是这样，接下来就是Injector侧的设计

### Injector

```c
int main(int argc, char *argv[]) {
    if (argc < 3) {
        printf("Usage: %s <package_name> <so_path>\n", argv[0]);
        return 1;
    }

    const char *package_name = argv[1];
    const char *so_path = argv[2];

    // 查找 zygote 和目标 app 的 UID
    pid_t zygote_pid = find_pid_by_name("zygote64");
    uid_t target_uid = get_uid_from_package(package_name);

    printf("[*] Zygote PID: %d, Target UID: %d\n", zygote_pid, target_uid);

    // 创建 Unix socket 监听器
    char socket_name[64];
    snprintf(socket_name, sizeof(socket_name), "/uki-injector-%d", getpid());

    int server_fd = create_unix_socket(socket_name);
    if (server_fd < 0) {
        printf("[-] Failed to create socket\n");
        return 1;
    }

    // 暂停 zygote
    kill(zygote_pid, SIGSTOP);

    // 打开 /proc/[pid]/mem
    char mem_path[64];
    snprintf(mem_path, sizeof(mem_path), "/proc/%d/mem", zygote_pid);
    int mem_fd = open(mem_path, O_RDWR);
    if (mem_fd < 0) {
        perror("[-] Failed to open /proc/pid/mem");
        kill(zygote_pid, SIGCONT);
        return 1;
    }

    // 定位注入位置
    uintptr_t shellcode_base = find_shellcode_base(zygote_pid);
    uintptr_t art_method_slot = find_art_method_slot(zygote_pid, mem_fd);

    if (!shellcode_base || !art_method_slot) {
        printf("[-] Failed to find injection location\n");
        close(mem_fd);
        kill(zygote_pid, SIGCONT);
        return 1;
    }

    // 保存原始数据
    uintptr_t original_entry_point;
    pread(mem_fd, &original_entry_point, sizeof(uintptr_t), art_method_slot);

    std::vector<uint8_t> original_shellcode(payload_size);
    pread(mem_fd, original_shellcode.data(), payload_size, shellcode_base);

    // 准备 SO 文件（复制到 app 私有目录）
    char target_so_path[256];
    snprintf(target_so_path, sizeof(target_so_path),
             "/data/data/%s/cache/lib%d.so", package_name, target_uid);

    char cmd[512];
    snprintf(cmd, sizeof(cmd), "cp %s %s", so_path, target_so_path);
    system(cmd);

    snprintf(cmd, sizeof(cmd), "chown %d:%d %s", target_uid, target_uid, target_so_path);
    system(cmd);

    // 准备 payload
    prepare_payload(payload, socket_name, target_uid, target_so_path,
                   art_method_slot, original_entry_point, zygote_pid);

    // 注入 payload
    pwrite(mem_fd, payload, payload_size, shellcode_base);
    pwrite(mem_fd, &shellcode_base, sizeof(uintptr_t), art_method_slot);

    printf("[+] Payload injected successfully\n");

    // 恢复 zygote
    kill(zygote_pid, SIGCONT);

    // 启动目标 app
    snprintf(cmd, sizeof(cmd), "am force-stop %s", package_name);
    system(cmd);

    snprintf(cmd, sizeof(cmd),
             "am start $(cmd package resolve-activity --brief '%s' | tail -n 1)",
             package_name);
    system(cmd);

    printf("[*] Waiting for payload notification...\n");

    // 设置超时
    struct timeval timeout;
    timeout.tv_sec = 10;
    timeout.tv_usec = 0;
    setsockopt(server_fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));

    // 等待 payload 连接
    int client_fd = accept(server_fd, NULL, NULL);
    if (client_fd < 0) {
        perror("[-] Failed to accept connection or timeout");
        goto cleanup_zygote;
    }

    // 接收状态消息
    uint8_t status;
    if (read(client_fd, &status, 1) != 1) {
        printf("[-] Failed to receive status\n");
        close(client_fd);
        goto cleanup_zygote;
    }

    if (status == 0x00) {
        // dlopen 失败
        printf("[-] Payload reported dlopen failure\n");
        close(client_fd);
        goto cleanup_zygote;
    }

    printf("[+] Received success notification from payload\n");

    // 查找子进程 PID
    sleep(1);  // 等待进程完全启动
    pid_t child_pid = find_pid_by_package(package_name);
    if (child_pid <= 0) {
        printf("[-] Failed to find child process\n");
        close(client_fd);
        goto cleanup_zygote;
    }

    printf("[*] Child PID: %d\n", child_pid);

    // T9. 发送确认
    uint8_t ack = 0x42;
    write(client_fd, &ack, 1);
    close(client_fd);

    // 等待进程进入 STOPPED 状态
    if (!wait_until_stopped(child_pid, 5)) {
        printf("[-] Process did not stop in time\n");
        goto cleanup_zygote;
    }

    // 清理 zygote 的 payload
    printf("[*] Cleaning zygote payload...\n");
    kill(zygote_pid, SIGSTOP);

    pwrite(mem_fd, &original_entry_point, sizeof(uintptr_t), art_method_slot);
    pwrite(mem_fd, original_shellcode.data(), payload_size, shellcode_base);

    kill(zygote_pid, SIGCONT);
    printf("[+] Zygote payload cleaned\n");

    // 清理子进程的 payload
    printf("[*] Cleaning child process payload...\n");
    char child_mem_path[64];
    snprintf(child_mem_path, sizeof(child_mem_path), "/proc/%d/mem", child_pid);
    int child_mem_fd = open(child_mem_path, O_RDWR);
    if (child_mem_fd >= 0) {
        pwrite(child_mem_fd, &original_entry_point, sizeof(uintptr_t), art_method_slot);
        pwrite(child_mem_fd, original_shellcode.data(), payload_size, shellcode_base);
        close(child_mem_fd);
        printf("[+] Child process payload cleaned\n");
    }

    // 删除 SO 文件
    unlink(target_so_path);
    printf("[+] SO file deleted\n");

    // 恢复子进程
    kill(child_pid, SIGCONT);
    printf("[+] Child process resumed\n");

    printf("[+] Injection completed successfully!\n");

    close(mem_fd);
    close(server_fd);
    return 0;

cleanup_zygote:
    // 清理 zygote
    printf("[*] Cleaning up zygote...\n");
    kill(zygote_pid, SIGSTOP);
    pwrite(mem_fd, &original_entry_point, sizeof(uintptr_t), art_method_slot);
    pwrite(mem_fd, original_shellcode.data(), payload_size, shellcode_base);
    kill(zygote_pid, SIGCONT);

    close(mem_fd);
    close(server_fd);
    return 1;
}
```

其他工具函数就不贴了，自己实现一下吧

## 0x07 小结

为什么我想不到这样的注入方式呢？(´･\_･\`)?

[](#)

Twikoo 评论管理

密码
