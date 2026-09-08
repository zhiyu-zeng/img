---
title: An End to KASLR Bypasses? – Winsider Seminars & Solutions Inc.
source: https://windows-internals.com/an-end-to-kaslr-bypasses/
source_host: windows-internals.com
clip_date: 2026-09-09T01:36:33+08:00
trace_id: 231bf752-8edc-4e65-a6bf-eadfe9eea5c6
content_hash: d99cefae247f27323be5fa7f423bc055e39bf757814bf40078cd7a0d9b004ac0
status: synced
tags:
  - Windows安全
  - ETW
series: null
feed_source: null
ai_summary: 微软在 Win11 23H2 新增 ETW 事件，标记非管理员进程调用可泄露内核指针等可疑系统调用，但这不足以终结 KASLR 绕过，只是为 EDR 多一层可见性。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 3d575244-d011-81f8-8ff8-c36fce416bad
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 微软在 Win11 23H2 新增 ETW 事件，标记非管理员进程调用可泄露内核指针等可疑系统调用，但这不足以终结 KASLR 绕过，只是为 EDR 多一层可见性。
> 
> - **新增事件：** 面向 Threat Intelligence ETW 通道的 `THREATINT_PROCESS_SYSCALL_USAGE`，监控 `NtQuerySystemInformation` 与 `NtSystemDebugControl` 中约 27 个可疑信息类，如 SystemModuleInformation、SystemFirmwareTableInformation、SysDbgGetLiveKernelDump 等。
> - **触发限制：** 仅对用户态非管理员进程生效；同一进程每个信息类只上报一次；只有调用成功才上报。`EPROCESS` 新增 `SyscallUsage` 位图记录已用类别，管理员进程也会置位但不触发事件。
> - **背景意图：** 目的是替代 EDR 常见的用户态 `NtQuery*` hook，以非侵入方式让安全产品观察 KASLR 绕过、VM 检测、物理内存访问、固件持久化等行为，但 ETW 异步且无阻断能力。
> - **现实局限：** Threat Intelligence 通道只有 PPL 能注册，很多安全产品无法访问；实验显示部分受监控类别（如 SystemFirmwareTableInformation）在普通机器也频繁出现，可能被 EDR 忽略或导致误报。
> - **作者展望：** 该事件不会立刻检测现有漏洞利用；23H2 正式发布尚早，安全产品全面采纳还需数年，且只覆盖部分已知指标，其余仍可被绕过。

Edit: this post initially discussed the new changes only in the context of KASLR bypasses. In reality this new event covers other suspicious behaviors as well and the post was edited to reflect that. The title is left as it was for convenience.

* * *

In recent years, in addition to mitigating and patching specific malware or exploits, Microsoft is targeting bug classes. With a wide range of mitigations, such as zero-initialized pool allocations, CET, XFG and the most recent CastGuard, exploiting bugs is becoming more and more challenging. On top of that, there is improved visibility into malware and exploit techniques through ETW and specifically the Threat Intelligence ETW channel, available to EDRs.

In `23H2` preview builds, Microsoft is introducing a new ETW event, this time aimed at NT APIs that could point at various suspicious behaviors.

## Syscall Usage Visibility

With this new change, Microsoft is focusing on several system calls that normally shouldn’t be used by many applications but might be used by exploits either in their pre- or post- exploitation stage for various purposes, such as KASLR bypasses, VM detection or physical memory access. Many of the cases covered by this new event are already restricted to privileged processes — some require privileges reserved to admin or system processes, others restricted to low IL or untrusted callers. But an attempt to call any of those system calls could indicate suspicious activity, so it could be interesting regardless.

Until now, the only way EDRs could detect this type of activity was to place user-mode hooks on all the different `NtQuery` functions that leak kernel pointers. For many reasons, this is not ideal. Microsoft has been trying to keep EDRs away from user-mode hooks for a while, mostly by adding ETW events that allow EDRs to consume the same information through non-invasive means (though asynchronously and with no blocking capabilities).

Keeping up with this trend, Windows 11 `23H2` adds a new ETW event to the Threat Intelligence channel – `THREATINT_PROCESS_SYSCALL_USAGE`. This ETW event is generated to indicate that a non-admin process has made an API call to an API + information class that could indicate some unusual (and potentially malicious) activity. This event will be generated for information classes in two APIs:

-   `NtQuerySystemInformation`
-   `NtSystemDebugControl`

These APIs have many information classes and many of them are “innocent” and commonly used by many applications. To avoid spamming information that isn’t interesting or useful, the following information classes will generate an ETW event:

-   `SystemModuleInformation`
-   `SystemModuleInformationEx`
-   `SystemLocksInformation`
-   `SystemStackTraceInformation`
-   `SystemHandleInformation`
-   `SystemExtendedHandleInformation`
-   `SystemObjectInformation`
-   `SystemBigPoolInformation`
-   `SystemExtendedProcessInformation`
-   `SystemSessionProcessInformation`
-   `SystemMemoryTopologyInformation`
-   `SystemMemoryChannelInformation`
-   `SystemCoverageInformation`
-   `SystemPlatformBinaryInformation`
-   `SystemFirmwareTableInformation`
-   `SystemBootMetadataInformation`
-   `SystemWheaIpmiHardwareInformation`
-   `SystemSuperfetchInformation + SuperfetchPrefetch`
-   `SystemSuperfetchInformation + SuperfetchPfnQuery`
-   `SystemSuperfetchInformation + SuperfetchPrivSourceQuery`
-   `SystemSuperfetchInformation + SuperfetchMemoryListQuery`
-   `SystemSuperfetchInformation + SuperfetchMemoryRangesQuery`
-   `SystemSuperfetchInformation + SuperfetchPfnSetPriority`
-   `SystemSuperfetchInformation + SuperfetchMovePages`
-   `SystemSuperfetchInformation + SuperfetchPfnSetPageHeat`
-   `SysDbgGetTriageDump`
-   `SysDbgGetLiveKernelDump`

These information classes are included for different reasons – some are known to [leak kernel addresses](http://www.alex-ionescu.com/?p=82), [some](https://twitter.com/gsuberland/status/996079563536027649) can be used for [VM detection](https://evasions.checkpoint.com/techniques/firmware-tables.html), another used in [hardware persistence](https://persistence-info.github.io/Data/wpbbin.html), and some indicate previous knowledge of physical memory that most applications should not have. Overall, this new event covers various indicators that an application isn’t behaving as it should.

Every mitigation must also take into consideration the potential performance impact, and ETW event generation can slow down the system when done in a code path that is called frequently. So, a few restrictions apply to this:

1.  The events will only be generated for user-mode non-admin callers. Since Admin->Kernel is not considered a boundary on Windows, many mitigations don’t apply to admin processes to lower the performance impact on the system.
2.  An event will only be generated once per information class for each process. This means if `NtQuerySystemInformation` is called 10 times by a single process, all with the same information class, only one ETW event will be sent.
3.  The event will only be sent if the call succeeded. Failed calls will be ignored and will not generate any events.

To support requirement `2` and keep track of which information class were involved by a process, a new field was added to the `EPROCESS` structure:

`union`  
`{`  
    `unsigned long SyscallUsage;`  
    `struct`  
    `{`  
        `struct /* bitfield */`  
        `{`  
            `unsigned long SystemModuleInformation : 1; /* bit position: 0 */`  
            `unsigned long SystemModuleInformationEx : 1; /* bit position: 1 */`  
            `unsigned long SystemLocksInformation : 1; /* bit position: 2 */`  
            `unsigned long SystemStackTraceInformation : 1; /* bit position: 3 */`  
            `unsigned long SystemHandleInformation : 1; /* bit position: 4 */`  
            `unsigned long SystemExtendedHandleInformation : 1; /* bit position: 5 */`  
            `unsigned long SystemObjectInformation : 1; /* bit position: 6 */`  
            `unsigned long SystemBigPoolInformation : 1; /* bit position: 7 */`  
            `unsigned long SystemExtendedProcessInformation : 1; /* bit position: 8 */`  
            `unsigned long SystemSessionProcessInformation : 1; /* bit position: 9 */`  
            `unsigned long SystemMemoryTopologyInformation : 1; /* bit position: 10 */`  
            `unsigned long SystemMemoryChannelInformation : 1; /* bit position: 11 */`  
            `unsigned long SystemCoverageInformation : 1; /* bit position: 12 */`  
            `unsigned long SystemPlatformBinaryInformation : 1; /* bit position: 13 */`  
            `unsigned long SystemFirmwareTableInformation : 1; /* bit position: 14 */`  
            `unsigned long SystemBootMetadataInformation : 1; /* bit position: 15 */`  
            `unsigned long SystemWheaIpmiHardwareInformation : 1; /* bit position: 16 */`  
            `unsigned long SystemSuperfetchPrefetch : 1; /* bit position: 17 */`  
            `unsigned long SystemSuperfetchPfnQuery : 1; /* bit position: 18 */`  
            `unsigned long SystemSuperfetchPrivSourceQuery : 1; /* bit position: 19 */`  
            `unsigned long SystemSuperfetchMemoryListQuery : 1; /* bit position: 20 */`  
            `unsigned long SystemSuperfetchMemoryRangesQuery : 1; /* bit position: 21 */`  
            `unsigned long SystemSuperfetchPfnSetPriority : 1; /* bit position: 22 */`  
            `unsigned long SystemSuperfetchMovePages : 1; /* bit position: 23 */`  
            `unsigned long SystemSuperfetchPfnSetPageHeat : 1; /* bit position: 24 */`  
            `unsigned long SysDbgGetTriageDump : 1; /* bit position: 25 */`  
            `unsigned long SysDbgGetLiveKernelDump : 1; /* bit position: 26 */`  
            `unsigned long SyscallUsageValuesSpare : 5; /* bit position: 27 */`  
        `}; /* bitfield */`  
    `}  SyscallUsageValues;`  
`};`

The first time a process successfully invokes one of the monitored information classes, the bit corresponding to that information class is set – this happens for admin processes, even if the ETW event isn’t sent for those processes. An ETW event is only sent if the bit is not set, guaranteeing that an event is only sent once for every class. And while there is no API to query this `EPROCESS` field, it does have the nice side effect of leaving a record of which information classes are used by each process – something to look at if you analyze a system! (But only if the Syscall Usage event is enabled in the system, otherwise the bits don’t get set).

## Examining the Data

Currently nothing is enabling this event, and no one consumes it, but I expect to see Windows Defender start using it soon, and hopefully other EDRs as well. I went and enabled this event manually to see whether those “suspicious” APIs get used on a regular machine, using my I/O ring exploit as a sanity test (since I know it uses `NtQuerySystemInformation` to leak kernel pointers). Here are some of the results from a few minutes of normal execution:

`dx -g @$cursession.Processes.Where(p => p.KernelObject.SyscallUsage).Select(p => new {Name = p.Name, SyscallUsage = p.KernelObject.SyscallUsage})`

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/19de5c54ddfe4c45.png)](https://windows-internals.com/wp-content/uploads/2022/11/Screenshot_20221122_111650.png)

Obviously, there are a few information classes that are used pretty frequently on the machine, with the main one (so far) being `SystemFirmwareTableInformation`. Those common classes might get ignored by EDRs early on, and therefore become more popular with exploits that will be able to abuse them. Other classes are not as common and are more unique to exploits, though valid software may use it as well, resulting in false detections.

## Conclusion

Does this mean there are no more API-based KASLR bypasses? Or that all existing exploits will immediately get detected? Probably not. EDRs will take a while to start registering for these events and using them, especially since `23H2` will only be officially released some time next fall and it’ll probably be another year or two until most security products realize this event exists. And since this event is sent to the Threat Intelligence channel, which only PPLs can register for, many products can’t access this or other exploit-related events at all. Besides, even for the security products that will register for this event, this isn’t a world-changing addition. This ETW event simply replaces a few user-mode hooks that some EDRs were already using, without supplying entirely new capabilities. This event will enable EDRs to get information for some additional calls done by malicious processes, but that is only a single step in an exploit and will undoubtedly lead to many false positive if security products rely on it too heavily. And anyway, this event only covers some known indicators, leaving many others as potential bypasses

To summarize, this is a cool addition that I hope security products will use to add another layer of visibility into potential exploits. While it’s not a game changer just yet, it’s definitely something for both EDRs and exploit developers to consider in the near future.
