---
title: Debugging An Undebuggable App
source: https://bryce.co/undebuggable/
source_host: bryce.co
clip_date: 2026-11-03T10:29:12+08:00
trace_id: f5c13a16-2a5a-431e-a120-95df9d5f36a1
content_hash: 0ff1f476ce690840b6871a0f54a2e6092543e5c094f787292b765b18b8a2fb28
status: synced
tags:
  - iOS逆向
  - 反调试
series: null
feed_source: Bryce Bostwick·iOS逆向
ai_summary: iOS 应用叠加 ptrace 阻断、内联汇编系统调用、故意搞崩手机等三重反调试，可用 lldb `--waitfor` 提前附加并跳过关键指令逐一绕过。
ai_summary_style: key-points
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 40d75244-d011-81db-a1f5-f998a6487495
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> iOS 应用叠加 ptrace 阻断、内联汇编系统调用、故意搞崩手机等三重反调试，可用 lldb `--waitfor` 提前附加并跳过关键指令逐一绕过。
> 
> - **反调试原理：** 应用调用私有 API `ptrace(PT_DENY_ATTACH, 0, 0, 0)` 拒绝调试器；且未走函数调用，而是内联汇编直接发起系统调用（`x16=26` + `svc #0x80`），使对 `ptrace` 符号下断点的常规绕过失效。
> - **定位内联系统调用：** 借助 armconverter.com 把 `mov w16, #26` 转成机器码字节在二进制中搜索（`w16`/`x16` 是同一寄存器的 32/64 位视图，两种都要搜），命中 4 处，其中一处正是完整的 PT_DENY_ATTACH 参数序列；在 SVC 地址下断点，命中后 `jump` 跳过该指令即保住调试器。
> - **搞崩手机的手段：** 应用监听 `com.apple.tw.twrr` 通知执行风控，未通过时进入无限循环反复调用 `snapshotViewAfterScreenUpdates:` 且不使用结果，快速耗尽内存导致整机 respring（某越狱插件也用此手法）；在该函数入口断点后 `thread return` 跳过即可。
> - **注入崩溃的真相：** 注入框架需重签名，会丢掉 app group，导致 `containerURLForSecurityApplicationGroupIdentifier:` 返回 nil 被强解包崩溃，并非有意防护；越狱设备注入框架可免重签名，非越狱可 swizzle 该方法返回临时目录作权宜绕过（可能损坏扩展，主应用可用）。

I recently ran into an [app](https://apps.apple.com/us/app/top-widgets-icons-themes/id6446477593) that:

1.  Blocks debuggers from being attached
2.  Exits early if you try to inject any code
3.  Crashes your whole phone if you run it with a jailbreak on (!)

Like — who even does that last one???

The sorts of things we do here, like [modding TikTok](https://youtu.be/YW3jL2gI9IE) to only show cat videos or [fixing freezes](https://youtu.be/SpHl5_0n3Ps) in other peoples’ apps, all require the ability to take an app and poke at it to see how it works.

But it’s not uncommon for iOS apps to include additional protections to keep prying eyes away — like jailbreak detection or [code obfuscation](https://bryce.co/youtube-code).

Though it looks like this app has a surprisingly fun combination of them. A lot more than I’d expect for a regular old Widget app.

> It turns out this app does a few things more interesting than a regular old Widget app — but that’s for a future post!

Let’s take a look at each of these protections one-by-one, and figure out how to circumvent them.

## Video Version

There’s a video version of this post here that shows off this process in even more detail:

  

If you prefer text though, you’re in the right place — let’s get into it!

## Table of Contents

## PT_DENY_ATTACH

Let’s start with getting the debugger attached, because that might help us with sorting out the other protections later.

I’m running this app on a jailbroken phone, which usually makes it pretty easy to attach a debugger to an app. Normally, we can `ssh` into the phone and then start `debugserver` attached to a given app:

```objc
$ /var/jb/usr/bin/debugserver 0.0.0.0:4445 -a AppStore
```

And then attach to that `debugserver` from another computer using `lldb`:

```objc
$ lldb
(lldb) platform select remote-ios
(lldb) process connect connect://localhost:4445
Process 303 stopped
Target 0: (AppStore) stopped.
```

And now we can interact with the app however we want; print debug information, set breakpoints to follow the code flow, etc.

That’s how it should work — but if we try to do the same thing with this widget app, we run into a problem launching `debugserver`:

```objc
$ /var/jb/usr/bin/debugserver 0.0.0.0:4445 -a TopWidget
debugserver-@(#)PROGRAM:LLDB  PROJECT:lldb-1403.2.3.13
 for arm64.
Attaching to process TopWidget...
Segmentation fault
```

We get a segmentation fault, and the debugger doesn’t actually attach.

… and then the whole phone soft-reboots/resprings because of one of the other protections. We’ll get to that!

  

This failure to attach a debugger is thanks to a function called `ptrace`. `ptrace` is a private API on iOS, but it’s a public API on macOS, which means we can easily access the [documentation](https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/ptrace.2.html) for it.

`ptrace` is super cool — it is the thing that powers most of the debugging functionality that we know and love. But there’s one operation that we’re particularly interested in here — `PT_DENY_ATTACH`. From the docs:

> PT_DENY_ATTACH
> 
> This request is the other operation used by the traced process; it allows a process that is not currently being traced to deny future traces by its parent. All other arguments are ignored. If the process is currently being traced, it will exit with the exit status of ENOTSUP; otherwise, it sets a flag that denies future traces. An attempt by the parent to trace a process which has set this flag will result in a segmentation violation in the parent.

Calling `ptrace` with the `PT_DENY_ATTACH` request type will prevent any future debugging requests, and if the app has already been debugged, it will exit out of the app entirely. Very useful if you don’t want anyone poking around your app!

There are effectively two ways an iOS app can include this functionality, and how we deal with circumventing it depends on which strategy the app is using.

The simplest way for an app to integrate this is to just call the `ptrace` function like you’d expect. The method call itself is fairly straightforward:

```objc
ptrace(PT_DENY_ATTACH, 0, 0, 0);
```

We specify the type of `ptrace` request, `PT_DENY_ATTACH`, to indicate that we want to prevent debuggers from attaching; there are then three more required parameters, but per the docs, they’re all unused for this request type, so we just set them to `0`.

However, because this is a private API, the full setup to invoke it is a bit more annoying — you have to look up a pointer to the method first, define the function’s type information yourself, etc.

```objc
#import <dlfcn.h>
#import <sys/types.h>

// A type representing the `ptrace` function
typedef int (*ptrace_ptr_t)(
    int request,
    pid_t pid,
    caddr_t addr,
    int data
);

// The requst value for `PT_DENY_ATTACH`
#define PT_DENY_ATTACH 31

void __attribute__((constructor)) prevent_debugging(void) {
    // Get a handle to `libsystem_kernel.dylib`
    void *libsystem_kernel_handle = dlopen(
        "/usr/lib/system/libsystem_kernel.dylib",
        RTLD_GLOBAL | RTLD_NOW
    );

    // Find the symbol `ptrace` within that handle
    ptrace_ptr_t ptrace = dlsym(
        libsystem_kernel_handle,
        "ptrace"
    );

    // Call ptrace w/ PT_DENY_ATTACH .
    // All other arguments are ignored
    ptrace(PT_DENY_ATTACH, 0, 0, 0);

    // Close the handle
    dlclose(libsystem_kernel_handle);
}
```

If you add this snippet to an iOS app, and try to launch it, you’ll see the app flash alive for just a second before being killed — but only if a debugger is being attached! If you tell Xcode to not debug the launched executable (via unchecking `Scheme > Edit Scheme > Run > Info > Debug executable`), then the app launches fine!

### Bypassing PT_DENY_ATTACH (Easy Mode)

So that’s how `PT_DENY_ATTACH` works - now how do we work around it?

Well there’s one easy weakness to this function, which is that it only blocks the debugger *after* it’s been called.

So if we put a breakpoint anywhere before that call — say, at the start of the `prevent_debugging` function above — and then rerun, we’ll see that the debugger attaches just fine.

This gives us a lot of control to actually circumvent that `ptrace` call later. There’s a bunch of ways we could do that, but probably the easiest is to just set a breakpoint on `ptrace` itself:

```objc
b ptrace
```

Then when we continue execution, we can see the debugger stop execution when the `ptrace` function is invoked:

```objc
(lldb) bt
* thread #1, queue = 'com.apple.main-thread',
  stop reason = breakpoint 2.1
  * frame #0: 0x000000010109d7d0
    libsystem_kernel.dylib`__ptrace
```

We’re currently stopped right at the start of the `ptrace` function — which means we can use `thread return` to back out to where we were before the call without actually invoking the function, and then continue execution again.

```objc
thread return
con
```

And now we’ve successfully skipped the ptrace call — the app is launched and our debugger is still attached!

We can try this strategy in the widget app by launching `debugserver` again, but this time not attaching it to any currently running process:

```objc
$ /var/jb/usr/bin/debugserver 0.0.0.0:4445
```

Instead, we’ll specify the process we’re interested in from the `lldb` side, this time using the `--waitfor` flag to indicate that the process hasn’t launched yet, but that we want to attach to it as soon as it does:

```objc
$ lldb
(lldb) platform select remote-ios
(lldb) process connect connect://localhost:4445
(lldb) process attach --name TopWidget --waitfor
```

Now if we try launching the app again, we’ll see `lldb` successfully attach to the app before any of its code is executed, including the code that tries to kick out the debugger!

```objc
Process 707 stopped
* thread #1, stop reason = signal SIGSTOP
    frame #0: 0x0000000108ff85b0 dyld`stat64 + 8
Target 0: (TopWidget) stopped.
(lldb)
```

But if we set a breakpoint on `ptrace` and then continuing execution, like we did in our above example, something goes wrong:

```objc
(lldb) b ptrace
Breakpoint 1: no locations (pending).
WARNING:  Unable to resolve breakpoint
          to any actual locations.
(lldb) con
Process 707 resuming
1 location added to breakpoint 1
Process 707 exited with status = 45 (0x0000002d)
```

The breakpoint is eventually resolved, but it’s never hit, and we’re kicked out of the app with an error code. And then a couple seconds later, the whole phone reboots again, just for fun!

Clearly, we’ll need something a bit more involved here.

### Bypassing PT_DENY_ATTACH (Hard Mode)

I mentioned there are two ways to integrate this `ptrace` functionality on iOS, and the method discussed above actually has some downsides.

For one, it’s super easy to find and skip this `ptrace` call, just like we saw in our earlier example — just setting a breakpoint on `ptrace` allows it to be quickly identified and bypassed.

And two, you have to do that suspicious-looking runtime lookup using `dlopen` and `dlsym` — which can make it much easier for Apple to recognize that you’re calling a private API.

We can actually feed two birds with one scone here and skip this `ptrace` function call altogether. If we run our earlier example in a sample app, and set a breakpoint in the `ptrace` function again, `lldb` will show us a disassembly of that function:

```asm
libsystem_kernel.dylib`__ptrace:
->  0x1039517d0 <+0>:  adrp   x9, 59
    0x1039517d4 <+4>:  add    x9, x9, #0x48     ; errno
    0x1039517d8 <+8>:  str    wzr, [x9]
    0x1039517dc <+12>: mov    x16, #0x1a        ; =26 
    0x1039517e0 <+16>: svc    #0x80
    0x1039517e4 <+20>: b.lo   0x103951800       ; <+48>
    0x1039517e8 <+24>: stp    x29, x30, [sp, #-0x10]!
    0x1039517ec <+28>: mov    x29, sp
    0x1039517f0 <+32>: bl     0x10394acf4       ; cerror
    0x1039517f4 <+36>: mov    sp, x29
    0x1039517f8 <+40>: ldp    x29, x30, [sp], #0x10
    0x1039517fc <+44>: ret    
    0x103951800 <+48>: ret
```

We can see that the actual implementation is surprisingly short. There’s some error handling at the top and bottom, but the only really critical part of the function is the `scv` instruction in the middle.

That’s a system call, meaning this function is delegating to the kernel to do the actual heavy lifting — which makes sense for something as low level as a debugging integration.

So what some developers will do, instead of calling this `ptrace` function, is to just make this same system call themselves using essentially the same assembly:

```objc
void __attribute__((constructor)) prevent_debugging(void) {
    asm volatile(
        // pass the same arguments we
        // were passing to ptrace.
        // PT_DENY_ATTACH = 31;
        // the other arguments are unused
        "mov x0, #31   \n"
        "mov x1, #0    \n"
        "mov x2, #0    \n"
        "mov x3, #0    \n"

        // x16 holds the type of syscall we
        // want to make; in this case,
        // ptrace = 26
        "mov x16, #26  \n"

        // Make the actual syscall
        "svc #0x80     \n"
    );
}
```

> Note: This style of inline-assembly code has some issues - if you were building similar within your app, you’ll likely want to use [extended asm](https://gcc.gnu.org/onlinedocs/gcc/Extended-Asm.html) instead. But this style makes for an easier walkthrough.

If you’re not well-versed in assembly, don’t worry — this one’s easier than it looks.

First we have the same four parameters that we’re passing in our original `ptrace` function call. There’s `PT_DENY_ATTACH` (which is literally just the integer value 31), followed by three 0’s. We’re passing all of those in registers `x0` through `x3`.

Then we need to tell the kernel which system call we actually want to make. iOS expects that to be passed along in register `x16`, which we’re setting to the value `26`. That’s the value corresponding to `ptrace`, which we can actually see in the disassembled version of the real `ptrace` function above — it sets register `x16` to `0x1a` (`26` in decimal).

And then we actually make the system call itself. The `0x80` here is also unused — We’re just required to pass a value, and iOS uses that value [by convention](https://stackoverflow.com/a/56993314).

That’s the entire assembly. If we re-run our sample app with this function added, we’ll see the same behavior as before — the app will kick us out as soon as a debugger is attached — all without ever calling the private `ptrace` function.

This is a little harder for Apple to detect, and a little harder for us to work around. There’s now no common function like `ptrace` that we could set a breakpoint on to detect and skip. We instead have to figure out where in the binary the system call happens, and then decide from there how we want to bypass it.

To do that, we need to open a decrypted copy of the app in a disassembler and then figure out a way to search for these instructions.

Luckily, if we look back at those instructions, one of them sticks out as a good candiate to search for:

```asm
mov x16, #26
```

That’s a very specific value being set to a very specific register. I wouldn’t expect this to appear in regular app code very frequently. So looking for this instruction might be a good way to narrow our search space down.

Most disassemblers should give you an option to search through their raw disassembled output text, but that can be super slow, plus it can be tripped up by small formatting differences, like whether numbers are displayed in hexadecimal or decimal.

It’s an option if we need it — but we may have a better option here, which is to search for the exact bytes corresponding to this instruction.

I like [armconverter.com](https://armconverter.com/) for this. It lets you paste in an assembly instruction, like

```asm
mov x16, #26
```

and get the corresponding bytes out — in this case:

```txt
50 03 80 D2
```

So we can search for those bytes in the binary to find potential places where this `ptrace` system call is being made. One consideration here is that there is another way that you could write this instruction, which is to use `w16` instead of `x16`. That’s the same underlying register — `w16` is just a 32-bit view, and `x16` is a 64-bit view. Both would be valid ways to write this assembly, so we should search for both in the binary.

Searching for the bytes corresponding to `mov x16, #26`, we find nothing — but searching for the bytes for `mov w16, #26`, we get four results:

```txt
Address                  Function       Instruction
__text:00000001013BB18C	 sub_1013BA900	MOV W16, #0x1A
__text:0000000102A21D80	 sub_102A21868	MOV W16, #0x1A
__text:0000000102A2BB10	 sub_102A2B984	MOV W16, #0x1A
__text:0000000102A2BB64	 sub_102A2B984	MOV W16, #0x1A
```

That’s pretty manageable. Clicking into each result, this first two don’t look very suspicious — meaning that the surrounding instructions don’t look much like the assembly we expected from the example above.

```asm
; sub_1013BA900
MOV   W15, #8
STURB W15, [X29,#var_F8+0xC]
MOV   W16, #0x1A
STURB W16, [X29,#var_F8+0xD]
STURB W12, [X29,#var_F8+0xE]
```

But looking at the third result — we find *exactly* the assembly we were looking for!

```asm
; sub_102A2B984
MOV X0, #0x1F
MOV X1, #0
MOV X2, #0
MOV X3, #0
MOV W16, #0x1A
SVC 0x80 ; addr=0x102A2BB14
```

Perfect — this is the part of the app that is preventing us from attaching our debugger. And it turns out the fourth occurrence is just a different branch in the same function further down. So it’s very clear that this is the function that we’ll want to patch out.

We’ll attach a debugger to the app again, with the exact same setup as before, using the `--waitfor` command to instruct `lldb` to wait til the process has loaded. But this time, we’ll set a breakpoint on the addresses where these system calls are being made. According to the disassembler, that was address `0x102A2BB14` and address `0x102A2BB68`.

```objc
(lldb) br s -a 0x102A2BB14 -s TopWidget
(lldb) br s -a 0x102A2BB68 -s TopWidget
```

We use `br s` (short for `breakpoint set`), with `-a` for address, and finally `-s` to indicate that the address is relative to the given binary name; since our disassembler knows nothing about where the binary was actually loaded into memory, we need `lldb` to convert for us.

Now if we continue execution, one of our breakpoints is hit!

```objc
(lldb) con
Process 865 resuming
Process 865 stopped
* thread #1, queue = 'com.apple.main-thread',
  stop reason = breakpoint 1.1
    frame #0: 0x000000010327bb14
    TopWidget`___lldb_unnamed_symbol254690 + 400
TopWidget`___lldb_unnamed_symbol254690:
->  0x10327bb14 <+400>: svc    #0x80
    0x10327bb18 <+404>: and    w10, w9, #0x1
    0x10327bb1c <+408>: mov    w9, #0x7149
    0x10327bb20 <+412>: movk   w9, #0xd7ad, lsl #16
Target 0: (TopWidget) stopped.
```

We can see that we’re stopped at an `svc` instruction, just like we expected.

There are a couple options here to prevent this call from taking effect, but one of the easiest is to simply bypass the instruction altogether. We can do that by taking the address of the next instruction (in this case, `0x10327bb18`) and asking `lldb` to jump there:

```objc
(lldb) jump *0x10327bb18
```

If we run `di` (for `disassemble`), we can see that we’ve now moved to the instruction right *after* the `svc` one:

```objc
    0x10327bb14 <+400>: svc    #0x80
->  0x10327bb18 <+404>: and    w10, w9, #0x1
    0x10327bb1c <+408>: mov    w9, #0x7149
    0x10327bb20 <+412>: movk   w9, #0xd7ad, lsl #16
```

And now if we continue execution… we’re in, with a debugger attached!

Right up until we hit that second protection that causes the whole phone to soft-reboot.

## Killing The Phone

There’s now a very important difference from the other times we’ve run into the phone soft-rebooting/respringing during this process, which is that this time, `lldb` is *still attached*:

```objc
Process 865 stopped
* thread #1, queue = 'com.apple.main-thread',
  stop reason = signal SIGKILL
    frame #0: 0x0000000211445030
    libsystem_kernel.dylib`mach_msg2_trap + 8
libsystem_kernel.dylib`mach_msg2_trap:
->  0x211445030 <+8>: ret

libsystem_kernel.dylib`macx_swapon:
    0x211445034 <+0>: mov    x16, #-0x30
    0x211445038 <+4>: svc    #0x80
    0x21144503c <+8>: ret
Target 0: (TopWidget) stopped.
(lldb)
```

By fixing the debugger, we now have the ability to get some insights into the whole soft-reboot thing. We can see that the process was sent a kill signal, and we run `bt` to see the current stacktrace, We can see what it was doing when it was killed:

```objc
(lldb) bt
* thread #1, queue = 'com.apple.main-thread', stop reason = signal SIGKILL
  * frame #0: 0x0000000211445030 libsystem_kernel.dylib`mach_msg2_trap + 8
    frame #4: 0x00000001d72b1690 QuartzCore`CARenderServerCaptureDisplayWithTransform_ + 628
    frame #5: 0x00000001d70e5cdc QuartzCore`CARenderServerSnapshot_(unsigned int, NSDictionary*) + 1844
    frame #6: 0x00000001d719d6f0 QuartzCore`CARenderServerSnapshot + 12
    frame #7: 0x00000001d8881628 UIKitCore`___UISnapshotScreenWindowsRectBlock_block_invoke + 368
    frame #8: 0x00000001d8030e40 UIKitCore`_performAfterCommitUnderCoverAllowDefer + 328
    frame #9: 0x00000001d887fe30 UIKitCore`_UISnapshotScreenWindowsRectAfterCommit + 388
    frame #10: 0x00000001d888009c UIKitCore`_UISnapshotScreenCompatibilityRectAfterCommit + 564
    frame #11: 0x0000000100891898 TopWidget`___lldb_unnamed_symbol7950 + 76
    frame #12: 0x00000001ddb9f490 Combine`Combine.Subscribers.Sink.receive(τ_0_0) -> Combine.Subscribers.Demand + 88
    // ...
    frame #28: 0x00000001054a0344 dyld`start + 1860
```

It’s running a function to capture the screen contents, which is… interesting? We can also find the last address where we are going through the app’s code itself — on `frame #11`.

The first thing we’ll want to do is look at that function in a disassembler, but there’s a disconnect here in that this is the address relative to wherever this process was loaded into memory, which our disassembler knows nothing about.

But we can ask `lldb` for more information on that address:

```objc
(lldb) image lookup -a 0x0000000100891898
      Address: TopWidget[0x0000000100041898] (TopWidget.__TEXT.__text + 235672)
      Summary: TopWidget`___lldb_unnamed_symbol7950 + 76
```

The second line of that output includes the address relative to the binary itself — `0x100041898` We can take that address and jump to it in our disassembler to find the function we were running when we crashed.

The decompilation of this function looks like this:

```objc
void __noreturn sub_10004184C() {
  void *v0; // x19
  id v1; // x20

  v0 = (void *)objc_opt_self(&OBJC_CLASS___UIScreen);
  while ( 1 )
  {
    v1 = objc_retainAutoreleasedReturnValue(
        objc_msgSend(v0, "mainScreen")
    );

    objc_release(objc_retainAutoreleasedReturnValue(
        objc_msgSend(v1, "snapshotViewAfterScreenUpdates:", 1LL)
    ));

    objc_release(v1);
  }
}
```

In an infinite loop, we call `+[UIScreen mainScreen]`, and on the result, we call `snapshotViewAfterScreenUpdates:`. This is a public API and a fairly common one — it just creates a snapshot of a view.

But it’s the surrounding implementation that’s so interesting here. This is a very memory-intensive method, but we don’t do anything with the result; We’re just taking snapshots in an infinite loop!

Sometimes a decompilation can get things wrong, but if we look at the graph view of this function, we see the exact same thing — we’re in an infinite loop, and all we do within that loop is call `snapshotViewAfterScreenUpdates:`. The result is never referenced. There are no other methods called. We have no way to break out of the loop.

I need to emphasize how crazy this is. Using too much memory can of course get your app killed, but it seems like somebody found a method that, if you call it too quickly, will soft-reboot the whole phone (in fact, I later found that this is the strategy that at least [one jailbreak tweak](https://github.com/haxi0/TrollLock-Reborn/blob/484616412a6b056f8fb241db14422ad471d9c1f9/TrollLock/TrollLock/ViewController.m#L115) uses to respring the phone upon a user’s request) — and then they chose to take that information and write a function to call it in an infinite loop, and just torpedo the phone of whoever’s running this code, in a regular old app.

That’s delightful!

In this post’s [associated video](https://youtu.be/ih6gWZDuNME), we trace back the origin of this call a bit further, and learn that it’s run whenever a notification named `com.apple.tw.twrr` is fired, and that it appears to be tied to the app running a risk check on the phone. If we don’t pass the check, it resprings our phone.

The underlying setup is interesting, but we don’t need to dive too far into it in order to bypass this protection — if we start `lldb` again, bypass the anti-debugging call, but this time set an additional breakpoint on the start of the function that intentionally crashes the phone — we can just use `thread return` to skip its execution:

```objc
(lldb) br s -a 0x102A2BB68 -s TopWidget
Breakpoint 2:
  where = TopWidget`___lldb_unnamed_symbol256584 + 756,
  address = 0x0000000107003b68
// Later, on breakpoint hit:
* thread #1, queue = 'com.apple.main-thread',
  stop reason = breakpoint 2.1
(lldb) thread return
(lldb) con
```

And now we are fully into the app with our debugger attached!

![The main screen of the Top Widgets app](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6d9ad32025b52d55.png)

## Injecting Code

We listed one more issue at the start of all this — which is that when we try to inject new code into this app, it *also* crashes.

I’ll often do that when I have a debugger attached, when I need some more complex utilities to help me dive into an app — like wanting to quickly log the accessibility information of all buttons on screen, for example. You could do that just from `lldb`, but it would be somewhat painful — it’s easier to just write that in a framework, inject that into the app, and then call your utility function from the debugger.

But you might also want to inject code if you don’t have a jailbroken phone in the first place — injecting tools like [Frida](https://frida.re/docs/ios/) or [Flex](https://github.com/FLEXTool/FLEX) let you get some initial exploration of an app without actually needing a jailbreak. You would usually inject these using a tool that resigns the app (I like [Sideloadly](https://sideloadly.io/)) — but if you do so here, you’ll see an immediate crash launching the app.

So is this one more protection, checking what frameworks are loaded at runtime and crashing if anything unexpected appears?

Luckily, no. Some apps do that!

But we have a much simpler explanation here. We can look at the crash — using either `lldb` or, in the event we were doing this because we didn’t have a jailbreak in the first place, by pulling crash logs right from the device.

In our case, the crash shows the top of the stack trace as `0x1002027D4`. Jumping there in our disassembler, we can see a `BRK` instruction — which is exactly what we’d expect in a scenario where the app was intentionally crashing, like from force-unwrapping a nil value.

The decompilation of this method is a bit longer, but scanning through, there’s one line that jumps out as our likely issue:

```objc
v13 = objc_retainAutoreleasedReturnValue(objc_msgSend(
    v8, "containerURLForSecurityApplicationGroupIdentifier:", v12)
);
```

`containerURLForSecurityApplicationGroupIdentifier:` is a public, perfectly normal method that returns a folder that multiple apps or extensions in a single group can access together. Usually apps are completely sandboxed from each other, but putting them in a shared group means that they can access shared resources.

The problem is that app groups are defined as part of the code signing process, and we just threw away the existing app signature by injecting code and resigning the app — and threw away any groups in the process.

So this method which is supposed to return a URL pointing to the local file system is probably returning `nil`, and then the app is likely force-unwrapping that and crashing as a result.

This is actually a pretty common problem — and even though it’s acting like a defense here, it’s probably not on purpose. This is a widget app, and it makes sense that it would need to be in an app group with its widget app extension that actually controls displaying widgets on the home screen.

By far the easiest way to work around this kind of issue is to just… not resign the app. A jailbroken phone makes this significantly easier — you can inject frameworks into an app using a jailbreak tweak without ever having to resign it. Or you can even run code that has invalid signatures; you can add whatever apps to whatever groups you want. Jailbreaking makes a lot of codesign issues just go away.

In a pinch, though, if you were injecting a debugging framework because you don’t have a jailbroken device, you can still sometimes work around things like this even while resigning the app.

The app is crashing because it’s expecting a URL to be returned here and it’s not getting one back. We can create a small framework that swizzles this method to make sure that a URL is always returned:

```objc
@implementation NSFileManager (Swizzle)

+ (void)load {
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        Class class = [self class];

        SEL originalSelector
            = @selector(containerURLForSecurityApplicationGroupIdentifier:);
        SEL swizzledSelector
            = @selector(swizzled_containerURLForSecurityApplicationGroupIdentifier:);

        Method originalMethod
            = class_getInstanceMethod(class, originalSelector);
        Method swizzledMethod
            = class_getInstanceMethod(class, swizzledSelector);

        method_exchangeImplementations(
            originalMethod,
            swizzledMethod
        );
    });
}

- (NSURL *)swizzled_containerURLForSecurityApplicationGroupIdentifier:(NSString *)groupIdentifier {
    return [self temporaryDirectory];
}

@end
```

In this case, we’re making it so that anytime `containerURLForSecurityApplicationGroupIdentifier:` method is called, we’re going to invoke our replacement method instead, which just returns some temporary directory.

It’s worth noting this is **not** an equivalent replacement for what the app is actually trying to do — this method is being called because the app wants a shared folder that both it and its app extensions can access, and we’re lying to it and saying, “Here you go. Here’s your shared folder” — even though that is definitely not a shared folder.

But depending on what you’re trying to do, that might actually be fine. I’ve found little patches like this will often break the app extensions themselves, But I usually don’t care about them — I just want the main app to work fine, especially if my goal is to just poke around at how the app does something, and I just need that basic functionality to work.

You can maybe do something more advanced here like create your own app group, resign the main app and all its extensions using it, and swizzle this method (along with any others you run into) to use your new group identifier instead. That would be a much larger effort though, and not likely to be worth it unless you really need it — at some point, finding a jailbroken device instead is probably worth your while.

Either way, if we build this framework, and inject it into the app alongside whatever else we wanted (like `Flex`), now the app launches perfectly fine on a normal device! On a jailbroken device, we still need to attach a debugger and bypass the earlier protections again, but once we do, we’re back in the app, this time with `Flex` successfully injected, giving us a whole bunch of other useful debugging tools:

![The main screen of the Top Widgets app](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6803042e8fd5e09f.png)

### Wrapping Up

We’re in the app with a debugger attached, jailbreak detection bypassed, and code successfully injected!

… what were we here for again?

Oh, yeah - that’s for next time.

Until then, if you bypass any anti-debugging protections thanks to this article, or decide to add them to your own app because you’re just learning about them for the first time — let me know!
