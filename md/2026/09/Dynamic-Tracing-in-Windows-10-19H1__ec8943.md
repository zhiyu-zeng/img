---
title: Dynamic Tracing in Windows 10 19H1
source: https://www.alex-ionescu.com/dynamic-tracing-in-windows-10-19h1/
source_host: www.alex-ionescu.com
clip_date: 2026-09-14T10:31:16+08:00
trace_id: 2b7725ff-1b05-402c-af32-6650eceaeab5
content_hash: c83256a27ca134b0ef4d82fb64623b60213e8b21e41a1a01352d7ae9a10f469e
status: synced
tags:
  - 内核
  - Windows逆向
series: null
feed_source: Alex Ionescu
ai_summary: "**TL;DR：** Windows 10 19H1 内建动态跟踪机制，仅在内核调试开启时分三类能力放出：内核态 ETW 事件回调、官方系统调用钩子、kprobes 式跟踪点。"
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3db75244-d011-818e-9b55-ea54651defb8
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> **TL;DR：** Windows 10 19H1 内建动态跟踪机制，仅在内核调试开启时分三类能力放出：内核态 ETW 事件回调、官方系统调用钩子、kprobes 式跟踪点。
> 
> - **启动与门槛：** 系统调用 KiInitDynamicTraceSupport，仅当内核调试启用时才调用 ext-win-ms-ntos-trace-L-1-1-0 API Set 的 TraceInitSystem，传入 KeSetSystemServiceCallback、KeSetTracepoint、EtwRegisterEventCallback、MmDbgCopyMemory 四个函数的回调表；成功则置位 KiDynamicTraceEnabled。所有回调须经 KeIsValidTraceCallbackTarget 校验（动态跟踪已启用，且驱动以 /INTEGRITYCHECK 链接）。
> - **ETW 回调：** 按 Logger ID 关联内核态事件回调，从池中分配 ETW_EVENT_CALLBACK_CONTEXT（标签 EtwC）挂到日志器上下文；由 EtwpInvokeEventCallback 传入事件起始偏移与长度调用，源头覆盖 EtwTraceEvent/EtwTraceRaw、EtwpLogKernelEvent、EtwpEventWriteFull、EtwpTraceMessageVa 等，首次支持内核态消费 ETW 事件（含 WPP/TraceLog 调试消息）。
> - **系统调用钩子：** KiServicesTab 每项为 32 位函数名哈希 + 32 位参数个数 + 64 位绝对地址；哈希算法为 `1025*(h+c)>>6 ^ 1025*(h+c)`，且名字须去掉 Nt 前缀。KiSystemServiceTraceCallbackTable 以红黑树存放 pre/post 回调，KiSystemServiceCopyEnd 依 KiDynamicTraceMask 最低位决定是否走 KiTrackSystemCallEntry/Exit；注销时用 KiSystemServiceTraceCallbacksActive 计数做屏障，全程持锁。回调目前不能改参数和返回值。
> - **跟踪点：** 按地址注册（排除 INIT 与 KVASCODE 段），同一函数只允许一个跟踪点；启用时改写为 INT 3，异常经 KiDispatchException 转 KiTpHandleTrap，命中后执行回调，回调返回 FALSE 则模拟原指令继续执行；禁用/注销用 KiTpActiveTrapsCount 与 KiTpStateLock 防竞争。
> - **安全影响：** KiDynamicTraceEnabled 受 PatchGuard 的 PsKernelRangeList 监控，篡改会触发；但内核调试本身会关闭 PatchGuard，故可自建驱动合法启用。该 API Set 无公开宿主模块，短期内可能仅供微软内部使用。

Windows 10 introduces an exciting new feature with potential security implications – *dynamic tracing* which finally enables long awaited-for features in the operating system.

At boot, the OS now calls KiInitDynamicTraceSupport, which only if kernel debugging is enabled, will call into the TraceInitSystem export provided by the ext-win-ms-ntos-trace-L-1-1-0 API Set, which is not currently shipping in the public OS schemas. This export receives a callback table with the following 4 functions:

-   KeSetSystemServiceCallback
-   KeSetTracepoint
-   EtwRegisterEventCallback
-   MmDbgCopyMemory

If the function returns successfully, KiDynamicTraceEnabled is now set.

The last routine is not terribly interesting, as it is already used by the debugger when accessing physical memory through commands such as!dd or dd /p. But the other three routines, well, Christmas came early this year.

## Kernel Mode ETW Event Callbacks

EtwRegisterEventCallback is a new internal function, accessible only by the dynamic trace system, which allows associating a custom ETW event callback routine, and associated context, with any ETW Logger ID. The function validates that the callback function is valid by calling KeIsValidTraceCallbackTarget, which does two things:

1.  Is Dynamic Tracing Enabled? (i.e.: KiDynamicTraceEnabled == 1)
2.  Is this a valid callback (same requirements as Ps and Ob callbacks, i.e.: was the driver containing the callback linked with /INTEGRITYCHECK)

Once the check succeeds, the matching logger context structure (WMI_LOGGER_CONTEXT) is looked up, and an appropriate ETW_EVENT_CALLBACK_CONTEXT structure is allocated from the pool (tag EtwC), and inserted into the CallbackContext field of the logger context.

At this point, any time an ETW event is thrown by this logger, this kernel-mode callback is also called, introducing, for the first time, support for kernel-mode consumption of ETW events, one of the biggest asks of the security industry in the last decade. This call is done by EtwpInvokeEventCallback, which calls the registered ETW callback with the raw ETW buffer data at the correct offset where this event starts, and the size of the event in the buffer. This new callback is called from:

-   EtwTraceEvent and EtwTraceRaw
-   EtwpLogKernelEvent and EtwpWriteUserEvent
-   EtwpEventWriteFull
-   EtwpTraceMessageVa
-   EtwpLogSystemEventUnsafe

This essentially gives access to the callback to any and all ETW event data, including even WPP and TraceLog debug messages.

## System Call Hooks

KeSetSystemServiceCallback, on the other hand, fulfills the second Christmas wish of every Windows security researcher: officially implemented system call hooks. The API allows the dynamic trace system to register a system call hook by name and pass an associated callback function and context. It introduces a new table, called the KiSystemServiceTraceCallbackTable, which copies the contents of the KiServicesTab (a new, more comprehensive system call table) into a Red-Black tree which contains an entry for each system call with its absolute location, number of arguments, and a *pre* and *post* callback (and context).

Before continuing, it’s worth talking about the format of the new KiServicesTab structure, as it introduces some valuable information for reverse engineering:

-   The first 32-bit value is the hash of the system call function’s name
-   The second 32-bit value is the argument count of the function
-   The last 64-bit value, is the absolute pointer to the function

The hash function, implemented in a sane language as C looks as follows:

```
for (nameHash = 0; *CallName != ANSI_NULL; CallName++
{     
    nameHash = (1025 * (nameHash + *CallName) >> 6) ^
                1025 * (nameHash + *CallName);
}
```

With some cringy JavaScript, we can write a simple WinDbg imperative script:

```javascript
"use strict";
function hashName(callName)
{
    var hash = 0;
    [...callName].forEach(
       c => hash = 1025*(hash + c.charCodeAt(0)) >>> 6 ^
                   1025*(hash + c.charCodeAt(0))
       );
    return hash >>> 0;
}
```

The trick, of course, is that the function name must be passed in without its *Nt* prefix – countless hours having been wasted trying to debug the hash algorithm by yours truly. Let’s take a look at some debugger output:

```
lkd> dps nt!KiServicesTab L2
fffff803`0e102e50  00000004`b74a2d8f
fffff803`0e102e58  fffff803`0dfe2ac0 nt!NtOpenKeyTransacted
```

```
lkd> dx @$scriptContents.hashName("OpenKeyTransacted")
@$scriptContents.hashName("OpenKeyTransacted") : 0xb74a2d8f
```

Back to KeSetSystemServiceCallback, if a system call callback is being registered, the KiSystemServiceTraceCallbackCount variable is incremented, and the KiDynamicTraceMask has its lowest bit set (the operations are reversed in the case of a system call callback unregistration). Unregistration is done by looping while KiSystemServiceTraceCallbacksActive is set, acting as a barrier to avoid unregistration in the middle of a call. All of these operations are further done under a lock (KiSystemServiceTraceCallbackLock).

Once the callback is registered (which must also satisfy the checks done by KeIsValidTraceCallbackTarget), it will interact with the system call handler as follows: inside of KiSystemServiceCopyEnd, a check is made with KiDynamicTraceMask to verify if the lowest bit is set, if so, system call execution goes through a path where KiTrackSystemCallEntry is called, passing in all of the register-based arguments in a single stack-based structure. This uses the KiSystemServiceTraceCallbackTable Red-Black Tree to locate any matching callbacks, and if one is present, and KiDynamicTraceEnabled is set, KiSystemServiceTraceCallbacksActive is incremented, the callback is made, and then the KiSystemServiceTraceCallbacksActive is decremented.

When this function returns, the return value is captured, and the actual system call handler is called. Then, KiTrackSystemCallExit is called, passing in both the capture result from earlier, as well as the return value of the system call handler. It performs the same operations as the entry routine, but calling the exit callback instead. Note that callbacks cannot override input parameters nor the return value, at the moment.

## Trace Points

KeSetTracepoint is the last of the new capabilities, and introduces an ability to register dynamic trace points, enable and disable them, and finally unregister them. The idea of a ‘trace point’ should be familiar with anyone that has used Linux-based *kprobes* before.

A trace point is registered by passing in an address and which is then looked up against any currently loaded kernel modules. As long as the address is not part of the INIT (which is discarded by now, or soon will be) or KVASCODE section (which is the KVA Shadow space used to mitigate Meltdown), a trace point structure is allocated in non-paged pool (with the Ftrp tag). Next, the KiTpHashTable is used to scan for existing trace points on the same address. If one is found, an error is returned, as only a single trace point is supported per function. Note that trace point callbacks are also validated by calling KeIsValidTraceCallbackTarget just like in the case of the previous callbacks.

KiTpSetupCompletion is used to finalize registration of a trace point, which first calls KiTpReadImageData based on the instruction size that was specified. An instruction parser (KiTpParseInstructionPrefix, KiTpFetchInstructionBytes) is used, followed by an emulator (KiTpEmulateInstruction, KiTpEmulateMovzx, and many more) are used to determine the instruction size that is required. Once the information is known, the original instructions are copied. For what it’s worth, KiTpReadImageData is a simple function which attaches to the input process and basically does a memcpy of the address and specified bytes.

Once registered, the KiTpRegisteredCount variable is incremented, and the trace point can now be enabled. The first time this happens, KiTpEnabledCount is incremented, and the KiDynamicTraceMask is modified, this time setting the next lowest bit. Then, KiTpWriteMemory is called, which follows a similar code path as when using the debugger to set breakpoints (attaching to the process, if any, calling MmDbgCopyMemory to probe the address, and then using MmDbgCopyMemory wrapped inside of KdEnterDebugger and KdExitDebugger to make the patch.

Disabling a trace point follows the same pattern, but in the opposite direction. Just like system call callback unregistration, a variable, this time called KiTpActiveTrapsCount, is used to avoid removing a trace point while it is still active, and all operations are done by holding a lock (KiTpStateLock).

So how are trace points actually triggered? Simple (again, no surprise to kprobe users) – an “INT 3” instruction is what ends up getting patched on top of the existing code at the target address, which will result in an eventual exception to be handled by KiDispatchException. If the status code is STATUS_BREAKPOINT, and KiDynamicTraceMask has Bit 1 set, KiTpHandleTrap is called.

This increments KiTpActiveTrapsCount to protect against racing unregistration, and looks up the address in KiTpHashTable. If there’s a match, it then makes sure that an INT 3 is actually present at the address. In case of a match, the handler checks if this is a first chance exception and if dynamic tracing is enabled. If so, the callback is executed, and its return value is used to determine if the exception should be raised or not. If the function returns FALSE, then KiTpEmulateInstruction is called to emulate the original instruction stream and resume execution. Otherwise, if dynamic tracing is not enabled, or if this is a second chance exception, KiTpWriteMemory is used to restore the original code to avoid any further traps on that address.

## Conclusion

Well, there you have it – the latest 19H1 release of Windows should introduce some exciting new functionality for tracing and debugging. Realistically, it’s unlikely that this will ever be exposed for 3 rd security product party use (or even to internal competing security tools), but the addition of these capabilities may one day lead to that functionality being exposed in some way (especially the ETW tracing capability). Since there is no publicly shipping host module for the Tracing API Set, it may be that this functionality will only ever internally be used by Microsoft for their own testing, but it would be great to one day see it for 3 rd party debugging and tracing as well.

Finally, it’s worth noting that the KiDynamicTraceEnabled variable is protected by the PsKernelRangeList, which is PatchGuard’s internal way of monitoring specific variables and tables outside of its regular set of behaviors, so attackers that try to manipulate this behavior illicitly will likely incur its wrath. Still, since this functionality is meant to be used when a kernel debugger is attached (which disables PatchGuard), it’s certainly possible to build a custom hand-crafted driver that enables and uses this functionality for legitimate purposes inside of say, a sandbox product.
