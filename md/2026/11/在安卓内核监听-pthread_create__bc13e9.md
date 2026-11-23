---
title: 在安卓内核监听 pthread_create
source: https://tsingshui.art/work/ebpf/aya-pthread_prase/
source_host: tsingshui.art
clip_date: 2026-11-23T10:27:19+08:00
trace_id: 7deb2cfd-da58-47dd-af47-1fbad515d19d
content_hash: 7441f18275b1dc52095611141bbb01b85b9075a074ba4ec664054993f0d7beaa
status: synced
tags: []
series: null
feed_source: 清水·Android/内核逆向
ai_summary: null
ai_summary_style: null
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 42175244-d011-816d-841e-d2c9366615a7
ioc: null
---

## pthread_create

对于大型软件来说，安全检查几乎都是异步进行的。这是由 **安全** 本身定位所决定的，实现安全绝不可能以牺牲业务性能为代价进行。而对于 App 来说，一个常见的异步方式，则是通过 **线程** 来执行异步操作。

通常来说，体量越是大的 App 就越会选择 **异步方案** 进行安全环境检查。尽可能的避免阻塞主线程，加快应用的加载速度，避免影响用户体验。相对的，一些小的 App 会以"安全"优先，在主线程进行一些高危操作的检查，提高逆向的“门槛”。

在 Android 中， **线程** 是最主要的异步方式， `pthread_create` 是最常用的线程创建函数。分析 `pthread_create` 的实现可以让我们在定位的时候更有信心。

## pthread_create 使用

`pthread_create` 的函数原型如下所示，其中我们重点关注 `start_routine` 和 `arg` 这两个参数。

```cpp
// 成功返回0，失败返回错误码
int pthread_create(
  pthread_t** thread_out,
  pthread_attr_t const** attr,
  void** (**start_routine)(void**),
  void** arg
)
```

`start_routine` 是新线程开始执行时的入口函数， `arg` 是传给这个函数的唯一参数。 在 Python 中等价的代码如下:

```python
# 创建线程对象，target 是线程入口函数，args 是传递给它的参数
thread = threading.Thread(target=start_routine, args=arg)
thread.start()  # 注意：还需要显式调用 start() 才会真正启动线程
```

使用线程其实并不复杂，你可以把它想象成在一个新的执行流中调用一个函数。如果你了解程序是如何从 `main` 函数开始运行的，那么线程的执行方式与之类似，只是它拥有自己独立的上下文和栈空间。

> C++ 的 `void** arg` 和 Python 的 `args` 都用于传参，前者是结构体指针，后者是元组，本质都是指向一组参数的数据结构。现代 C++ 的 `std::thread` 语法更简洁，风格接近 Python，但本质是对底层 API（如 `pthread_create` ）的封装。了解线程创建的过程，分析 `pthread_create` 就足够了。

## pthread_create 实现过程

这里有一个比较关键的结构体 `pthread_internal_t**` ，新线程的入口函数以及它的参数被存储在这个结构体内。对于逆向来说，想要知道是到底哪里创建了函数，就需要解析这个结构，获取 `start_routine` 的偏移位置，从而获取应用在用户态创建的检测线程入口函数。

```cpp
pthread_internal_t** thread = tcb->thread();
thread->start_routine = start_routine;
thread->start_routine_arg = arg;
thread->set_cached_pid(getpid());
```

这段代码有比较明显的特征,会调用 `getpid()` 获取一次 `pid` ，也存到这个结构中。于是我们可以快速地逆向手机本身的 `libc.so` 文件中定位到结构体相应的偏移。

以一加为例，相应的 IDA 反汇编代码如下：

```cpp
**(_QWORD **)(v34 + 96) = a3;
**(_QWORD **)(v34 + 104) = v56;
**(_DWORD **)(v34 + 20) = **(_DWORD **)(v34 + 20) & 0x80000000 | getpid(inited) & 0x7FFFFFFF;
...
v40 = clone((__int64)__pthread_start, v23, 4001536LL, v34);
```

这里的 `v34` 就对应了 `pthread_internal_t` 结构体， `+96` 和 `+104` 就分别对应 `start_routine` 和 `start_routine_arg` 。并且 `v34` 作为 `clone` 函数第四个参数传入，我们可以通过 Hook `clone` 函数来解析出 `start_routine` 的值。但缺点是这仍然是用户层级的 Hook，被检测的可能就会更大。

> `pthread_internal_t` 理论上来说也不是一个稳定的结构，这个偏移是可能随着版本变化的，不过看起来到 linux 6.1 也没变化。

这部分对应的C++ 源码如下

```cpp
int flags = CLONE_VM
            | CLONE_FS | CLONE_FILES | CLONE_SIGHAND | CLONE_THREAD | CLONE_SYSVSEM | CLONE_SETTLS | CLONE_PARENT_SETTID | CLONE_CHILD_CLEARTID;

int rc = clone(__pthread_start, child_stack, flags, thread, &(thread->tid), tls, &(thread->tid));
```

> 源码里的 `flags` 被内联成了 `4001536LL` ，并且参数的数量也不能完全对上。这有可能是因为版本不同，也有可能是 IDAPro 反编译的缺陷。

## clone

`clone` 函数是 `libc` 对 `sys_clone` 的用户层包装,实际进行系统调用的部分如下:

```cpp
//https://cs.android.com/android/platform/superproject/main/+/main:bionic/libc/bionic/clone.cpp;l#71?q#clone&sq#
int clone_result;
if (fn != nullptr) {
  clone_result = __bionic_clone(flags, child_stack, parent_tid, new_tls, child_tid, fn, arg);
} else {
  ....
}
```

这里的 `fn` 对于 `pthread_create` 来说是永远不会为空的，仔细留心刚才的代码就可以知道 `fn # __pthread_start` ，所以一定会走 `__bionic_clone` 的逻辑。

`__bionic_clone` 是谷歌给ARM安卓实现的一段汇编调用， `else{...}` 省略的部分则是针对其他架构的处理器的系统调用， [\__bionic_clone 汇编](https://tsingshui.art/work/ebpf/aya-pthread_prase/%22https://cs.android.com/android/platform/superproject/main/+/main:bionic/libc/arch-arm/bionic/__bionic_clone.S;l#31?q#bionic_clone%22) 摘要如下：

```python
// pid_t __bionic_clone(int flags, void** child_stack, pid_t** parent_tid, void** tls, pid_t** child_tid, int (**fn)(void**), void** arg);
ENTRY_PRIVATE(__bionic_clone)
    ...
    # 把 'fn'和 'arg' 压入到子进程的栈，作为第一个参数->
    stmdb   r1!, {r5, r6}
    # 进行系统调用, __NR_clone 对应的系统号是 220。
    ldr     r7, #__NR_clone
    swi     #0
    # 判断当前是否在子进程，__NR_clone 类似 fork() 会根据进程的不同返回不一样的值，从而判断是否运行在子进程。
    movs    r0, r0
    beq     .L_bc_child

.L_bc_child:
    # We're in the child now. Set the end of the frame record chain.
    mov    fp, #0
    # Setting lr to 0 will make the unwinder stop at __start_thread.
    mov    lr, #0
    # Call __start_thread with the 'fn' and 'arg' we stored on the child stack.
    pop    {r0, r1}
    b      __start_thread
END(__bionic_clone)
```

这里比较巧妙的是直接把 `fn` 和 `arg` 压到了子进程的栈内，于是在子进程创建好的时候，直接就可以将其作为参数传递给 `__start_thread` 来使用。

> 内核不区分"进程"和"线程"，这里不是笔误。

## \__start_thread 和 \__pthread_start

`__bionic_clone` 这段汇编没有直接调用 `pthread_start` ，而是调用了一个包装函数 `start_thread` ，这个函数的功能比较简单,对理解行为来说，关键的只有调用 `(**fn)(arg)` 这一部分。

```cpp
extern "C" __LIBC_HIDDEN__ void __start_thread(int (**fn)(void**), void** arg) {
  BIONIC_STOP_UNWIND;

  pthread_internal_t** self = __get_thread();
  if (self && self->tid == -1) {
    self->tid # syscall(__NR_gettid);
  }

  int status = (**fn)(arg);
  __exit(status);
}
```

当通过 `(**fn)(arg)` 拉起 `__pthread_start(arg)` 的时候，就可以很清楚的看到入口函数被调用的过程了:

```cpp
static int __pthread_start(void** arg) {
  pthread_internal_t** thread = reinterpret_cast<pthread_internal_t**>(arg);
  ...
  void** result = thread->start_routine(thread->start_routine_arg);
  pthread_exit(result);
  return 0;
}
```

`__pthread_start` 是 `libc` 库内的静态非导出函数，通过 Hook 这个函数来获取 `phtread_interal_t**` 是可行的。但相比于在 `clone` 做 Hook 它的缺陷更明显，这个方式不得不要求手动逆向手机的 `libc.so` 来获取 `__pthread_start` 在 `libc.so` 内的偏移。不过这样也有一个极大的好处，这说明 `__pthread_start` 是"不稳定"的函数。对于App来说，是没有办法直接检测 `__pthread_start` 是否被篡改的。如果要检测，那么需要付出很高的代价，通常对于业务来说不可接受。

> 这里其实是不对的，只是我当时调研的时候搞错了，这个符号是可以直接动态的获取出来的。不过我觉得展现自己的思考过程一样重要，所以依然这么写。eg. Frida 就能直接获取到 `Process.findModuleByName("libc.so").enumerateSymbols().forEach(it => {if (it.name.includes("__pthread_start")) console.log(it.name,it.address)});`。

## \__NR_clone

进程的创建是只有内核才能完成的工作，但前面的分析跳过了 `__NR_clone` 的内部实现，这里展开讲讲。

**从\__NR_clone到sys_clone**

在汇编里 \__NR_clone 会被扩展成 220 这个序号， `svc\swi` 指令则是用于触发系统调用(系统中断)。触发中断之后，并不会改变当时的寄存器的值，只是控制权的转移到内核，所以仍然可以通过寄存器传递参数。内核通过读取 `r7` 寄存器的值来决定究竟执行哪一个 `syscall` 。

```
ldr     r7, =__NR_clone // r7 # 220
swi     #0 // ==> syscall(220,...)
```

`__NR_clone` 的 Handler 是 `sys_clone` 函数，调用号和Handler对应关系可以在 [syscall_table](https://cs.android.com/android/kernel/superproject/+/common-android-mainline:common/scripts/syscall.tbl;l#1?q#.tbl&ss#android%2Fkernel%2Fsuperproject) 查阅。

> 系统调用和系统中断是一回事， svc 指令和 swi 是同一个指令的两个不同符号，如同 ÷ 和 \\ 一样。

**sys_clone的定义**

直接在源码搜索 `sys_clone` 找不到相应的实现，主要是实现的时候实际上用了宏展开 `SYSCALL_DEFINE5` 会把后面的内容扩展成 `sys_clone` 的声明， `sys_clone` 在 `fork.c` 中实现，代码摘要如下：

```cpp
SYSCALL_DEFINE5(clone, unsigned long, clone_flags, unsigned long, newsp,
         int __user **, parent_tidptr,
         int __user **, child_tidptr,
         unsigned long, tls)
{
    struct kernel_clone_args args = {
        .flags        = (lower_32_bits(clone_flags) & ~CSIGNAL),
        .pidfd        = parent_tidptr,
        .child_tid    = child_tidptr,
        .parent_tid    = parent_tidptr,
        .exit_signal    = (lower_32_bits(clone_flags) & CSIGNAL),
        .stack        = newsp,
        .tls        = tls,
    };
    return kernel_clone(&args);
}
```

**ebpf 观测 sys_clone**

对于逆向来说，找到这里就足够了。因为 `sys_clone` 可以在 `/proc/kallsyms` 中找到。这意味着可以通过 ebpf 的 kprobe 来 Hook 此处，获取 `newsp` 的值。 `newsp` 对应的则是在 `__bionic_clone` 调用的时候压入的 `fn` 和 `arg` 的栈的地址。

```
    # Push 'fn' and 'arg' onto the child stack.
    stmdb   r1!, {r5, r6} # 这里的 r1 就是 newsp
    ldr     r7, =__NR_clone
    swi     #0
```

`arg` 正是 `pthread_internal_t` ，只需要在此处解析即可得到 `start_routine` 。这个方法比 Hook `__pthread_start` 更隐蔽，因为操作都在内核中完成。并且也更通用，bpf 总是能稳定的找到 `sys_clone` 。

#note-box\[ 可以通过 `cat /proc/kallsysm` 查找 krpbe 可以附加的点。

SYSCALL_DEFINE5 会扩展 sys_clone 到 \__arm64_sys_clone，所以 `grep sys_clone` 没有看到完全吻合的内容不用担心。 \]

**尽信书，则不如无书**

实际上如果在 `__arm64__sys_clone` 去 Krpobe 是观测不到 `chile_stack` 的值。因为从 `syscall(__NR_clone)` 到真正执行函数的地方还有一些距离，里面会还会对参数做一些处理。

这里需要一个比较早的时机来观察进入 `syscall` 的时候寄存器的值，可以使用 `tracepoint` 来进行观测。对应的 `event` 是 `raw_syscalls:sys_enter` 。在此处解析即可得到具体的值。

效果如下：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/72b26de7cb4b5d46.webp)
