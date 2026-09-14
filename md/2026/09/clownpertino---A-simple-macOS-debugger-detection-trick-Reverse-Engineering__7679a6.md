---
title: clownpertino - A simple macOS debugger detection trick | Reverse Engineering
source: https://reverse.put.as/2025/04/04/clownpertino/
source_host: reverse.put.as
clip_date: 2026-09-14T10:29:09+08:00
trace_id: 55727ca7-336f-4673-acb0-4bf878817fdd
content_hash: 1e101735aecc7be0223ddc45522f00a4a365c9f1f9cc35ee8a7f2b11ce1803ec
status: synced
tags:
  - iOS逆向
  - 反调试
series: null
feed_source: reverse.put.as·macOS/iOS
ai_summary: "macOS 上的 LLDB 会始终在 dyld 的镜像通知函数上写入内部断点指令（INT3 / BRK #0），读取该处字节即可廉价、可靠地判断进程是否被调试。"
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3db75244-d011-8128-8446-e2b5afd55899
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> macOS 上的 LLDB 会始终在 dyld 的镜像通知函数上写入内部断点指令（INT3 / BRK #0），读取该处字节即可廉价、可靠地判断进程是否被调试。
> 
> - **核心机制：** LLDB 内部固定设置 ID 为 -1 的 `shared-library-event` 断点，挂在 `lldb_image_notifier`（dyld 17+），与是否启用 stop on library events 选项无关。
> - **触发经过：** macOS 15.4 下 lldbinit 崩溃，`GetStopReasonDataAtIndex(0)` 返回 18446744073709551615，转为 break_id_t 时溢出；根源是内部断点的负 ID 与代码类型假设不符。
> - **检测实现：** 用 `TASK_DYLD_INFO` 取得 `dyld_all_image_infos` 地址，读 notifier 处字节，x86_64 为 0xCC（INT3）、ARM64 为 0xd4200000（BRK #0）即判定有调试器。
> - **版本差异：** dyld 17+ 用单一 `lldb_image_notifier`；旧版（如 551.5）断点落在 `__ZL18gdb_image_notifier...` 等函数，`TASK_DYLD_INFO` 给不出正确地址，需按符号偏移（如其 0xf7ce）手工定位。
> - **验证范围：** 在 macOS 15.4（x86_64 / ARM64）与 Sonoma 14.7.1 上均实测有效，PoC 见 github.com/gdbinit/clownpertino，可用 `breakpoint list -i` 查看内部断点。

I haven’t seen this trick in the wild (and couldn’t find any references) and I’m dumbfounded as to why I didn’t notice it before. I knew and used this feature a lot, but assumed that the underlying breakpoint was only set when the option was enabled (assumptions, assumptions…tss tss tss).

The story starts with an upgrade to macOS 15.4. Given Apple’s recent software quality issues, it comes as no surprise that this update broke some custom debugger-related code I was using. The same code worked without problems in all previous macOS versions, so something is broken in the new release (it is!).

While trying to debug the issue, I revisited a bug that I had previously identified in [lldbinit](https://github.com/gdbinit/lldbinit) after pushing some updates.

## 停止于镜像加载功能

The feature in question is stop on images loading, which causes the debugger to stop execution whenever an image is linked into the process. This can be useful for stopping before shared libraries are loaded, a trick I’ve used many times. Because I use it so often, I’ve added a feature (`bm` command) to lldbinit to stop execution whenever a specific image is loaded, making it faster to identify the image I’m interested in.

Reproducing the bug is quite straightforward:

```bash
(lldbinit) enablesolib
[+] Enabled stop on library events trick.
(lldbinit) c
Process 981 resuming
Traceback (most recent call last):
  File "/Users/timapple/lldbinit.py", line 5784, in HandleHookStopOnTarget
    bpx = target.FindBreakpointByID(bp_id)
  File "/Library/Developer/CommandLineTools/Library/PrivateFrameworks/LLDB.framework/Resources/Python/lldb/__init__.py", line 12100, in FindBreakpointByID
    return _lldb.SBTarget_FindBreakpointByID(self, break_id)
OverflowError: in method 'SBTarget_FindBreakpointByID', argument 2 of type 'lldb::break_id_t'
Process 981 stopped
* thread #1, stop reason = shared-library-event
    frame #0: 0x000000010003c130 dyld`lldb_image_notifier
Target 0: (clownpertino) stopped.
(lldbinit) 
```

The issue is with this block of code, which implements a feature to display breakpoint names:

```python
    if stop_reason == lldb.eStopReasonBreakpoint:
        if thread.GetStopReasonDataCount() > 0:
            # this gives us the breakpoint id
            bp_id = thread.GetStopReasonDataAtIndex(0)
            # now we can try to locate it
            bpx = target.FindBreakpointByID(bp_id)
```

Let’s examine the values to understand the problem:

```bash
(lldbinit) script
Python Interactive Interpreter. To exit, type 'quit()', 'exit()' or Ctrl-D.
>>> lldb.thread.GetStopReasonDataCount()
2
>>> lldb.thread.GetStopReasonDataAtIndex(0)
18446744073709551615
>>> ^D
now exiting InteractiveConsole...
(lldbinit) 
```

## LLDB 内部断点

Beyond the type mismatch between the code and UI, the value doesn’t appear logical. So, while investigating the LLDB source code, I discovered that it sets internal breakpoints, one of them on `lldb_image_notifier`. I also found out an option to display the internal breakpoints, previously unnoticed.

```bash
% lldb ./clownpertino
(lldb) target create "./clownpertino"
Current executable set to '/Users/timapple/clownpertino' (x86_64).
(lldb) process launch -s
Process 749 stopped
* thread #1, stop reason = signal SIGSTOP
    frame #0: 0x0000000100007d90 dyld`_dyld_start
dyld`_dyld_start:
->  0x100007d90 <+0>:  movq   %rsp, %rdi
    0x100007d93 <+3>:  andq   $-0x10, %rsp
    0x100007d97 <+7>:  movq   $0x0, %rbp
    0x100007d9e <+14>: pushq  $0x0
Target 0: (clownpertino) stopped.
Process 749 launched: '/Users/timapple/clownpertino' (x86_64)
(lldb) breakpoint list -i
Current breakpoints:
Kind: shared-library-event
-1: name = 'lldb_image_notifier', module = dyld, locations = 1, resolved = 1, hit count = 0

  -1.1: where = dyld`lldb_image_notifier, address = 0x000000010003c130, resolved, hit count = 0 

(lldb) 
```

The takeaway is that `LLDB` always sets an internal breakpoint on the image notifier. This makes it a straightforward and obvious way to determine if a debugger has been attached to the process. It really can’t get much simpler than this.:-).

To implement this easily, we just need to find the address of `dyld_all_image_infos`. This can be done by manually parsing `dyld` symbols after finding its address. Alternatively, an even simpler approach is to use `TASK_DYLD_INFO`, which will provide us with the address of that structure, either locally or remotely (if we have the necessary mach port).

```c
    task_dyld_info_data_t info;
    mach_msg_type_number_t size = TASK_DYLD_INFO_COUNT;
    kern_return_t kret;
    kret = task_info(mach_task_self(), TASK_DYLD_INFO, (void*)&info, &size);
    if (kret != KERN_SUCCESS) {
        printf("Error: task_info failed: %s\n", mach_error_string(kret));
        return 0;
    }
    struct dyld_all_image_infos *ai = (struct dyld_all_image_infos*)info.all_image_info_addr;
    printf("dyld base address: 0x%llx\n", (uint64_t)ai->dyldImageLoadAddress);
```

## 检测实现原理

Given that we’re in the same process space, we can simply read directly from the `TASK_DYLD_INFO` pointer to extract the address of the image notifier. The final step is to dereference this pointer and inspect its contents. If it contains a breakpoint instruction – an `INT3` (0xCC) for x86_64 targets or `BRK #0` (0xd420000) for ARM64 – then we can be certain that a debugger is attached to our process. Otherwise, everything appears fine, and no debugger is present. Easy peasy!

If we run the PoC on a 15.4 x86_64 host, there is no debugger detected:

```bash
% ./clownpertino
dyld version:      17
dyld string:       1284.13
dyld base address: 0x7ff80225f000
dyld base magic:   0xfeedfacf
Notifier address:  0x7ff802298130
Notifier symbol:   0x39130
Notifier content:  0xe5894855

No debugger detected :)
```

But if we run it under `LLDB`, we can see the `int3` patched at the notifier address:

```bash
% lldb ./clownpertino
(lldb) target create "./clownpertino"
Current executable set to '/Users/timapple/clownpertino' (x86_64).
(lldb) r
Process 728 launched: '/Users/timapple/clownpertino' (x86_64)
dyld version:      17
dyld string:       1284.13
dyld base address: 0x7ff80225f000
dyld base magic:   0xfeedfacf
Notifier address:  0x7ff802298130
Notifier symbol:   0x39130
Notifier content:  0xe58948cc

DEBUGGER DETECTED! Hey Tim Apple, why don't you give me a $1m instead of selling out to Trump?
Process 728 exited with status = 1 (0x00000001) 
(lldb) 
```

The same result on a ARM64 15.4 host:

```bash
% ./clownpertino 
dyld version:      17
dyld string:       1284.13
dyld base address: 0x184f34000
dyld base magic:   0xfeedfacf
Notifier address:  0x184f7e05c
Notifier symbol:   0x4a05c
Notifier content:  0xd65f03c0

No debugger detected :)
% lldb ./clownpertino
(lldb) target create "./clownpertino"
Current executable set to '/Users/timapple/clownpertino' (arm64).
(lldb) r
Process 25191 launched: '/Users/timapple/clownpertino' (arm64)
dyld version:      17
dyld string:       1284.13
dyld base address: 0x184f34000
dyld base magic:   0xfeedfacf
Notifier address:  0x184f7e05c
Notifier symbol:   0x4a05c
Notifier content:  0xd4200000

DEBUGGER DETECTED! Hey Tim Apple, why don't you give me a $1m instead of selling out to Trump?
Process 25191 exited with status = 1 (0x00000001) 
(lldb) 
```

And testing against Sonoma 14.7.1 x86_64:

```yaml
% ./clownpertino     
dyld version:      17
dyld string:       1165.3
dyld base address: 0x7ff81b4e2000
dyld base magic:   0xfeedfacf
Notifier address:  0x7ff81b51e6c0
Notifier symbol:   0x3c6c0
Notifier content:  0xe5894855

No debugger detected :)
% lldb ./clownpertino
(lldb) target create "./clownpertino"
Current executable set to '/Users/timapple/clownpertino' (x86_64).
(lldb) r
Process 818 launched: '/Users/timapple/clownpertino' (x86_64)
dyld version:      17
dyld string:       1165.3
dyld base address: 0x7ff81b4e2000
dyld base magic:   0xfeedfacf
Notifier address:  0x7ff81b51e6c0
Notifier symbol:   0x3c6c0
Notifier content:  0xe58948cc

DEBUGGER DETECTED! Hey Tim Apple, why don't you give me a $1m instead of selling out to Trump?
Process 818 exited with status = 1 (0x00000001) 
(lldb) 
```

## 旧版 dyld 的差异

This works for any recent `dyld` versions (I believe 17+) which implement a single `lldb_image_notifier`. Older `dyld` versions implement it in a different way. If we look at the source code for dyld 551.4, available in High Sierra 10.13.6:

```c
// @ src/glue.c
    void _dyld_debugger_notification(enum dyld_notify_mode mode, unsigned long count, uint64_t machHeaders[])
    {
            // Do nothing.  This exists for the debugger to set a break point on to see what images have been loaded or unloaded.
    }

    extern "C"      void _dyld_debugger_notification(enum dyld_notify_mode mode, unsigned long count, uint64_t machHeaders[]);

// @ src/dyld_debugger.cpp
    static void gdb_image_notifier(enum dyld_image_mode mode, uint32_t infoCount, const dyld_image_info info[])
    {
        uint64_t machHeaders[infoCount];
        for (uint32_t i=0; i < infoCount; ++i) {
            machHeaders[i] = (uintptr_t)(info[i].imageLoadAddress);
        }
        switch ( mode ) {
             case dyld_image_adding:
                _dyld_debugger_notification(dyld_notify_adding, infoCount, machHeaders);
                break;
             case dyld_image_removing:
                _dyld_debugger_notification(dyld_notify_removing, infoCount, machHeaders);
                break;
             default:
                break;
        }
        // do nothing
        // gdb sets a break point here to catch notifications
        (...)
    }
```

Which one does lldb internally breakpoints?

```bash
(lldbinit) break list -i
Current breakpoints:
Kind: shared-library-event
-1: address = dyld[0x0000000000010076], locations = 1, resolved = 1, hit count = 0

  -1.1: where = dyld`_dyld_debugger_notification, address = 0x0000000100013076, resolved, hit count = 0 
```

If we run the proof-of-concept (PoC), we obtain an incorrect address via `TASK_DYLD_INFO`:

```bash
$ ./clownpertino
dyld version:      15
dyld string:       551.5
dyld base address: 0x105636000
dyld base magic:   0xfeedfacf
Notifier address:  0x1056457ce
Notifier symbol:   0xf7ce
Notifier content:  0xe5894855

No debugger detected :)

$ lldb ./clownpertino
(lldb) target create "./clownpertino"
Current executable set to './clownpertino' (x86_64).
(lldb) r
Process 21010 launched: './clownpertino' (x86_64)
dyld version:      15
dyld string:       551.5
dyld base address: 0x100003000
dyld base magic:   0xfeedfacf
Notifier address:  0x1000127ce
Notifier symbol:   0xf7ce
Notifier content:  0xe5894855

No debugger detected :)
Process 21010 exited with status = 0 (0x00000000) 
(lldb) 
```

We need to examine the dyld symbols to understand which one this is:

```bash
$ nm /usr/lib/dyld | grep notif
000000000000f4e4 t __Z9notifyGDB17dyld_image_statesjPK15dyld_image_info
000000000000f7ce t __ZL18gdb_image_notifier15dyld_image_modejPK15dyld_image_info
0000000000001b16 t __ZN4dyld12notifyKernelERK11ImageLoaderb
00000000000054da t __ZN4dyld22notifyKernelAboutImageEPK12macho_headerPKc
0000000000009218 t __ZN4dyldL11notifyBatchE17dyld_image_statesb
0000000000002001 t __ZN4dyldL12notifySingleE17dyld_image_statesPK11ImageLoaderPNS1_21InitializerTimingListE
0000000000004836 t __ZN4dyldL18notifyBatchPartialE17dyld_image_statesbPFPKcS0_jPK15dyld_image_infoEbb
0000000000008efb t __ZN4dyldL20notifyMonitoringDyldEbjjPK15dyld_image_info
0000000000012c2e t __ZNK11ImageLoader10notifyObjCEv
000000000001e7d0 t __ZNK16ImageLoaderMachO10notifyObjCEv
0000000000010076 T __dyld_debugger_notification
000000000000eb98 t __dyld_objc_notify_register
0000000000025c88 t _coresymbolication_load_notifier
0000000000025d38 t _coresymbolication_unload_notifier
```

Given that dyld base address is `0x100003000` and the reported address is `0x1000127ce`, we can calculate the corresponding symbol: `0x1000127ce - 0x100003000 = 0xf7ce`. This points to `__ZL18gdb_image_notifier15dyld_image_modejPK15dyld_image_info`, a C++ symbol which demangles to `_gdb_image_notifier(dyld_image_mode, unsigned int, dyld_image_info const*)`.

Modifying the code to manually apply this offset, in case a breakpoint is not detected at the expected notifier address (address not shown in the output):

```bash
$ lldb ./clownpertino
(lldb) target create "./clownpertino"
Current executable set to './clownpertino' (x86_64).
(lldb) r
Process 21653 launched: './clownpertino' (x86_64)
dyld version:      15
dyld string:       551.5
dyld base address: 0x100003000
dyld base magic:   0xfeedfacf
Notifier address:  0x1000127ce
Notifier symbol:   0xf7ce
Notifier content:  0xe5894855

DEBUGGER DETECTED! Hey Tim Apple, why don't you give me a $1m instead of selling out to Trump?
Process 21653 exited with status = 1 (0x00000001) 
(lldb) 
```

## 旧版适配与结论

This means that older LLDB versions set breakpoints in a less interesting function (because it only contains information about the Mach-O header instead of `struct dyld_image_info`) so we need to discover and use that function to detect LLDB, instead of using `TASK_DYLD_INFO`.

This provides a simple yet effective means of detecting whether a process is running under LLDB.

PoC code available [here](https://github.com/gdbinit/clownpertino).

Have fun,  
fG!
