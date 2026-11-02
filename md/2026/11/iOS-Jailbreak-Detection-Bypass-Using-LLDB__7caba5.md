---
title: iOS Jailbreak Detection Bypass Using LLDB
source: https://0xk3r0.github.io/posts/jailbreak-detection-bypass-using-lldb/
source_host: 0xk3r0.github.io
clip_date: 2026-11-02T10:39:23+08:00
trace_id: 19d46d5c-24c6-464b-b6ba-9f23e5da32fc
content_hash: c105dd015f7ab02a797a028f8d64eb039b596fbe8de1bc52a4a8649cedb0e748
status: synced
tags:
  - iOS逆向
  - 动态调试
series: null
feed_source: Kyrillos Nady·iOS/Android RE
ai_summary: 用 LLDB 真机动态调试绕过 iOS 越狱检测：定位 isJailbroken 函数的 ret 指令，命中断点后将 ARM64 返回值寄存器 x0 改写为 0，不修改二进制即可让应用正常运行并显示 flag。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 40c75244-d011-81c0-80ba-ca369b6838dd
ioc:
  cves: []
  cwes: []
  hashes:
    - bce8f13474e5a52c60853ea803f80a81
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 用 LLDB 真机动态调试绕过 iOS 越狱检测：定位 isJailbroken 函数的 ret 指令，命中断点后将 ARM64 返回值寄存器 x0 改写为 0，不修改二进制即可让应用正常运行并显示 flag。
> 
> - **检测逻辑：** 逆向发现 Swift 函数 `$s9No_Escape12isJailbrokenSbyF`，内部由四个检查组成布尔 OR 链——越狱文件、系统目录可写、能否打开 Cydia、沙箱违规，任一为真即判定越狱。
> - **调试环境：** iPhone 上运行 `debugserver <IP>:4444 --waitfor="No Escape"` 启动应用（黑屏挂起属正常），电脑端 LLDB 通过 `process connect connect://<iPhoneIP>:4444` 附加进程。
> - **对抗 ASLR：** 用 `image list -o -f "No Escape"` 取镜像基址 0x102674000，加上 Ghidra 中 ret 指令的静态偏移 0xa114，得到运行时地址 0x10267e114，并在该处下断点。
> - **改返回值：** ARM64 调用约定中函数返回值存于 x0；断点命中时 x0=1（越狱），执行 `register write x0 0` 后 continue，应用恢复正常并展示隐藏 flag。
> - **优势：** 相比 Frida 脚本或重打包改 Mach-O，此方法完全不修改二进制文件，且思路可复用于多数越狱检测实现。

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0c051f8fee073034.webp)](https://0xk3r0.github.io/Images/iOS/Back.png) First, I’d like to point out that this lab can be solved using easier approaches such as Frida scripts or patching the Mach‑O binary and reinstalling the modified application. However, I challenged myself to solve it in a different way—specifically using low‑level debugging with **LLDB** on a real device.

This approach helps deepen understanding of ARM64 architecture, return values, and runtime behavior, so let’s get started.

## Prerequisite Tools

### On your machine:

-   A disassembler such as **Ghidra**, **Hopper**, or **IDA**
-   **LLDB**

### On your iPhone:

-   **debugserver** (LLDB)
-   **SSH** for remote connection

* * *

## Application Behavior

After downloading the lab files and installing the IPA on the device, let’s observe the application behavior:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a2cd634968e15e66.png)](https://0xk3r0.github.io/Images/iOS/IMG_0003.PNG)

As we can see, the app displays a simple screen indicating that the device is jailbroken. When pressing the OK button, the application exits.

* * *

## Static Analysis (Ghidra)

Now we will analyze the **Mach-O** binary using Ghidra. Since this is a jailbreak detection challenge, it makes sense that the responsible function contains the word **“jailbreak”**. Using Ghidra, we search for relevant symbols:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/691de573cc21e49b.png)](https://0xk3r0.github.io/Images/iOS/ghidraEdited.png)

We find this function named `isJailbroken`: `_$s9No_Escape12isJailbrokenSbyF` So this is the function we will focus on.

### Understanding the Logic

By analyzing the function, we see that it calls four different jailbreak checks. Conceptually, the function can be simplified as follows:

```
bool isJailbroken() {
    return checkForJailbreakFiles()
        || checkForWritableSystemDirectories()
        || canOpenCydia()
        || checkSandboxViolation();
}
```

This is a **Boolean OR** chain—if any check returns true, the device is considered jailbroken. Our goal is to force this function to return **false** at runtime using a debugger.

* * *

## Dynamic Analysis with LLDB

### 1\. Start debugserver

Start `debugserver` on the iPhone using: `debugserver <machineIP>:4444 --waitfor="No Escape"`

Launch the app on the device. It will appear stuck on a black screen, which is expected. A connection will be received by debugserver.

```bash
iPhone:/ root# debugserver 192.168.1.6:4444                                     
debugserver-@(#)PROGRAM:LLDB  PROJECT:lldb-16.0.0 for arm64.
Listening to port 4444 for a connection from 192.168.1.6...
```

### 2\. Connect LLDB

On the machine, attach the process to LLDB using: `process connect connect://<iPhoneIP>:4444`

* * *

## Handling ASLR

Because iOS uses **Address Space Layout Randomization (ASLR)**, we must calculate the runtime address of the `ret` instruction.

### Calculate the Runtime Address

1.  List the image base address: `image list -o -f "No Escape"`
    
    ```
    (lldb) process connect connect://192.168.1.11:4444
    Process 3156 stopped and restarted: thread 1 received signal: SIGCHLD
    (lldb) image list -o -f "No Escape"
    [  0] 0x0000000002674000 /../No Escape.app/No Escape(0x0000000102674000)
    ```
    
    So, we can see the image base address is `0x102674000`.
    
2.  From Ghidra, the offset of the `ret` instruction is `0xa114` as shown below:
    
    ```perl
    LAB_10000a104
    10000a104 e8 03 40 b9 ldr w8,[sp]=>local_20 
    10000a108 00 01 00 12 and w0,w8,#0x1 
    10000a10c fd 7b 41 a9 ldp x29=>local_10,x30,[sp, #0x10] 
    10000a110 ff 83 00 91 add sp,sp,#0x20 
    10000a114 c0 03 5f d6 ret // Note Here
    ```
    
    The runtime address becomes: **0x102674000 + 0xa114 = 0x10267e114**
    

* * *

## Setting the Breakpoint

First, we confirm the instruction address using `dis -s 0x10267e114`.

```ruby
(lldb) dis -s 0x10267e114 
No Escape$s9No_Escape12isJailbrokenSbyF: 
0x10267e114 <+172>: ret // Note Here 

No Escape$s9No_Escape22checkForJailbreakFiles33_03F80A81LLSbyF: 
0x10267e118 <+0>: sub sp, sp, #0xf0 
0x10267e11c <+4>: stp x20, x19, [sp, #0xd0] 
0x10267e120 <+8>: stp x29, x30, [sp, #0xe0] 
0x10267e124 <+12>: add x29, sp, #0xe0 
0x10267e128 <+16>: stur xzr, [x29, #-0x18] 
0x10267e12c <+20>: sub x8, x29, #0x28 
0x10267e130 <+24>: stur x8, [x29, #-0x60]
```

It works fine; then set a breakpoint and continue execution:

```
(lldb) breakpoint set -a 0x10267e114
(lldb) c
```

After a short wait, the breakpoint is triggered:

```ruby
(lldb) breakpoint set -a 0x10267e114
Breakpoint 1: where = No Escape`$s9No_Escape12isJailbrokenSbyF + 172, address = 0x000000010267e114
(lldb) c 
Process 3156 stopped
* thread #1, queue = 'com.apple.main-thread', stop reason = breakpoint 1.1
    frame #0: 0x000000010267e114 No Escape`$s9No_Escape12isJailbrokenSbyF + 172
No Escape`$s9No_Escape12isJailbrokenSbyF:
->  0x10267e114 <+172>: ret  // Note Here

No Escape`$s9No_Escape22checkForJailbreakFiles33_BCE8F13474E5A52C60853EA803F80A81LLSbyF:
    0x10267e118 <+0>:   sub    sp, sp, #0xf0
    0x10267e11c <+4>:   stp    x20, x19, [sp, #0xd0]
    0x10267e120 <+8>:   stp    x29, x30, [sp, #0xe0]
```

* * *

## Modifying the Return Value

Reading the registers:

```perl
(lldb) register read 
General Purpose Registers:
        x0 = 0x0000000000000001
        x1 = 0x0000000000000000
        x2 = 0x0000000000000000
        x3 = 0x000000028135e140
                ........
       x23 = 0x0000000000000001
       x24 = 0x0000000000000000
       x25 = 0x00000001ed176000  (void *)0x00000001f210ca18: UIAnimatablePropertyBase + 160
       x26 = 0x00000001ed18c000  UIKitCore`UIPeripheralHost._interfaceAutorotationDisabled + 5052
       x27 = 0x000000002b870064
       x28 = 0x0000000000000010
        fp = 0x000000016d78ad10
        lr = 0x000000010267a970  No Escape`$s9No_Escape11AppDelegateC11application_29didFinishLaunchingWithOptionsSbSo13UIApplicationC_SDySo0k6LaunchJ3KeyaypGSgtF + 48
        sp = 0x000000016d78acd0
        pc = 0x000000010267e114  No Escape`$s9No_Escape12isJailbrokenSbyF + 172
      cpsr = 0x60000000
```

> **Note:** On ARM64, the return value of a function is stored in the **x0** register.

You’ll notice that `x0 = 1`. A value of `1` means the function is returning `true` (jailbroken). To bypass the detection, overwrite the return value to `0` (false).

```
(lldb) register write x0 0 
(lldb) c 
Process 3156 resuming
```

* * *

## Result

After continuing execution, the jailbreak detection is successfully bypassed at runtime, and the application proceeds normally, revealing the flag:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/839fd4a70ad50224.png)](https://0xk3r0.github.io/Images/iOS/hiddenFlag.PNG)

## Final Notes

-   This method does **not modify** the binary.
-   It demonstrates how understanding **ARM64** calling conventions enables powerful runtime analysis.
-   The same approach applies to **many jailbreak** detection implementations.

**THANKS FOR READING ❤️**
