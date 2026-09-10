---
title: 【微信】VT调试器原理揭秘--DebugPort转移与重建调试体系
source: https://mp.weixin.qq.com/s?__biz=MjM5NTc2MDYxMw==&mid=2458619748&idx=1&sn=3da8fd74ca09ea5d3b1a7e5df02207ca
source_host: mp.weixin.qq.com
clip_date: 2026-09-10T20:42:04+08:00
trace_id: 385e11e7-e717-4a16-92e0-bb34d5f896e0
content_hash: e0bf6e826484080d7d8e4a32116e405cd51aced1b899cfe98fe1d95496c35456
status: synced
tags:
  - 微信
  - Windows逆向
  - 反调试
series: null
feed_source: 公众号·看雪学院
ai_summary: 绕过 Windows 调试体系的 DebugPort 检测，可用 EPT/NPT 无痕 Hook 配合内核自建调试对象映射表，实现全版本可调试带反调试的 VMP 目标。
ai_summary_style: key-points:weak
images_status:
  total: 11
  succeeded: 11
  failed_urls: []
notion_page_id: 3d775244-d011-81ad-bcbd-c8f5ef7bb9a6
ioc: null
---

> 💡 **AI 总结（key-points:weak）**
>
> 绕过 Windows 调试体系的 DebugPort 检测，可用 EPT/NPT 无痕 Hook 配合内核自建调试对象映射表，实现全版本可调试带反调试的 VMP 目标。
> 
> - **核心矛盾：** `Process->DebugPort` 与 `PEB->BeingDebugged` 是内核中唯一的调试状态落点，直接在 Windows 调试体系内无法隐藏 DebugPort。
> - **无痕 Hook 选型：** EPT/NPT 页级 Hook 通过分离"读"与"执行"绕过内存 CRC 与 PatchGuard；三种方案中"MTF 置位全程可执行"最实用，适合 Hook 内核函数，高频 CRC 函数不适用。
> - **调试对象重构：** 维护 `g_Debuginfo` 双向链表（调戏器 PID / 目标 PID / 假 DebugObject），使 `DbgkpQueueMessage`、`DbgkForwardException`、`DbgkMapViewOfSection` 等在 DebugPort 为空时仍能路由事件。
> - **关键 Hook 点：** `NtDebugActiveProcess` 建链、`DbgkpPostFakeThreadMessages`（不 hook 会卡住）、`DbgkpSetProcessDebugObject`（跳过 DebugPort 写入与 `DbgkpMarkProcessPeb`）、`KiDispatchException`/`DbgkForwardException`（处理 int3 与单步异常）。
> - **创建调试处理：** 调用原版 `NtCreateUserProcess` 后，把 `Process->DebugPort` 清 0、`BeingDebugged` 复位、清除 `NO_DEBUG_INHERIT`，并记录新进程 PID；这些高频函数不宜加 DbgPrint，以防被 PatchGuard 发现蓝屏。
> - **验证结果：** 基于 AMD SVM/NPT 实现的开源调试器可调试全版本启动反调试的 VMP，项目地址为 github.com/Qmeimei10086/svm-dbg。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/455989c1e84db4a2.jpg)

看雪论坛作者ID：Qmeimei10086

-   走无附加读写，利用驱动直接读写物理内存，不会调用KeStackAttachProcess，自然也不会留下句柄的痕迹，利用vt本身的MFT技术实现单步调试，断点，优点是完全无痕，缺点也很明显，实现难度很大，从反汇编引擎到VT框架，代码量大，自然也会增加不少不稳定性，而且脱离x64dbg，CE之类的主流调试器生态，缺少各种插件，如果是商业使用对用户来说也不习惯
    
-   走重建调试体系，大部分其实都是这种，通过ept/npt hook和重写windows调试体系，直接对接传统调试器，优点是代码量小，稳定而且符合使用习惯，缺点自然是相对容易被检测，也就是本文的办法
    

当我们回忆一下windows的调试体系，其实上相当精简，内核真正置位的只有几个地方，一个是peb->BeingDebugged，这个是老生常谈的，很好处理，你把他改回去就行了。另一个就是Process->DebugPort，这是连接调试器与被调试进程的地方，所有的通信都在这里发生，这里不可能隐藏，也许你会说我hook NtQueryInformationProcess不就行了，但是如果我直接获取结构体偏移，去查Process->DebugPort，你怎么办。所以，只要是在windows调试体系之下，我们是绝对无可能隐藏的了Process->DebugPort

但是如果我们不走windows调试体系，自建一个呢？

**浅谈ept/npt hook**

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/19403b7da01bbb95.jpg)

ept hook，是启动利用启动虚拟化之后增加的额外页表的功能，对于Guest机来说，是完全无法察觉到还存在另一层页表的，开启EPT后，真正的物理内存就被隐藏起来了，Guest中的所有人都访问不到，只有Host能访问到，同时我们还可以设置额外页表的属性，衍生出来几种方法：

摘自： [https://qi4l.github.io/2024/08/04/%E6%B5%85%E8%B0%88EPT%E6%97%A0%E7%97%95HOOK%E7%9A%84%E6%96%B9%E6%B3%95/](https://qi4l.github.io/2024/08/04/%E6%B5%85%E8%B0%88EPT%E6%97%A0%E7%97%95HOOK%E7%9A%84%E6%96%B9%E6%B3%95/)

无需MTF置位的无痕Hook

设置EPT页级Hook，使整读和写页无效，而只留下可执行属性。

分配一个新的物理内存（P2），EPT中的EPT Pml1Entry的PhyFrameNumber（原来的P1）替换成新分配的。

修改P2，使其变成一个绝对跳转，跳转到Hook的地方去执行。

页面受到读写访问，EPT Violation，此时将此页面为可读写，不可执行。

下次执行的时候，遇到不可执行内存，EPT Violation再次恢复可执行，不可读写  
缺点。

此Hook有个很大的缺陷，考虑如下。

```
hook_4kb_addr:
    mov rax, ds:[hook_4kb_addr]
```

这样就会无限MTF，不断的切换不可读写，可读写，导致CPU卡死

仿内存执行断点的无痕Hook

设置页面HOOK，全程可读写，不可执行。

这样有可能就会某一次到要HOOK的地方，但是页可能不到。

如果没到，而是其他地址，恢复可执行，并设置MTF，在MTF Handler中恢复不可执行。

直到遇到要Hook的地方，HOST中直接VMWRITE，修改GUEST_RIP。

缺点:遇到4kb页面访问次数多的，会巨卡无比。

MTF置位全程可执行的无痕Hook

设置EPT页级Hook，使整读和写页无效，而只留下可执行属性。

分配一个新的物理内存（P2），EPT中的EPT Pml1Entry的PhyFrameNumber（原来的P1）替换成新分配的。

修改P2，使其变成一个绝对跳转，跳转到Hook的地方去执行。

页面受到读写访问，EPT Violation，此时将此页面可读/写，并设置MTF位  
MTF VM Exit，判断是否是EPT Hook导致的，是则设置不可读写，并替换回P2物理内存。

缺点不太明显，适合Hook内核函数，而对于高频CRC校验的函数，不太适合，总的来说是最适合的EPT无痕Hook了。

总之就是，实现读与执行分离，读出来的是正常的，执行的却是另一套代码，这样就可以规避内存检测，实现绕过patchguard或者其他内存crc检测。

至于npt，就是amd-v技术下的拓展页表，也有着一套相似的流程。

有了npt/ept hook,我们就可以放心大胆的hook这些系统函数了 。

**附加调试重构**

请先食用： [https://bbs.kanxue.com/thread-292227.htm](https://bbs.kanxue.com/thread-292227.htm)

以下代码大部分来此某佬的仓库 [https://github.com/xyddnljydd/vt-ReloadDbg](https://github.com/xyddnljydd/vt-ReloadDbg)

我们首先思考，不通过debug_port，被调试进程怎么找到属于他自己的DEBUG_OBJECT

我们在全局维护起一个g_Debuginfo双向循环链表：

```
typedefstruct_DebugInfomation {
    LIST_ENTRY List;
    HANDLE SourceProcessId;      // 调试器进程 PID
    HANDLE TargetProcessId;      // 被调试进程 PID
    DEBUG_OBJECT* DebugObject;   // 假调试对象
} DebugInfomation, *PDebugInfomation;
```

通过pid查到到属于自己的DebugObject

## NtDebugActiveProces

将DEBUG_OBJECT挂到被调试进程的是调试器，所以我们要在第一个入口点hook，也就是NtDebugActiveProcess，在这里我们插入一个独立的g_Debuginfo

```swift
NTSTATUS  NtDebugActiveProcess(
    HANDLE ProcessHandle,
    HANDLE DebugObjectHandle)
{
    DbgPrintEx(77, 0, "[DbgHook] NtDebugActiveProcess enter pid=%lu\n", (ULONG)PsGetCurrentProcessId());
    NTSTATUS status;
    KPROCESSOR_MODE PreviousMode;
    PDEBUG_OBJECT DebugObject;
    BOOLEAN DebugObjectReferenced = FALSE;
    PEPROCESS Process, CurrentProcess;
    PETHREAD LastThread = NULL;
    PreviousMode = ExGetPreviousMode();
    status = ObReferenceObjectByHandle(
        ProcessHandle,
0x800,
        *PsProcessType,
        PreviousMode,
        (PVOID*)& Process,
        NULL);
if (!NT_SUCCESS(status)) {
        DbgPrintEx(77, 0, "[DbgHook] NtDebugActiveProcess ObRefProcess failed 0x%08X\n", status);
return status;
    }
    DbgPrintEx(77, 0, "[DbgHook] NtDebugActiveProcess target pid=%lu\n", (ULONG)PsGetProcessId(Process));
if (Process == (PEPROCESS)PsGetCurrentProcess() || Process == (PEPROCESS)PsInitialSystemProcess) {
        ObfDereferenceObject(Process);
return STATUS_ACCESS_DENIED;
    }
    CurrentProcess = (PEPROCESS)PsGetCurrentProcess();
    status = ObReferenceObjectByHandle(
        DebugObjectHandle,
0x2,
        *g_DbgkDebugObjectType,
        PreviousMode,
        (PVOID*)& DebugObject,
        NULL);
    DbgPrintEx(77, 0, "[DbgHook] NtDebugActiveProcess ObRefDebugObject status=0x%08X\n", status);
if (NT_SUCCESS(status))
    {
        DebugObjectReferenced = TRUE;
    }
    KIRQL OldIrql = { 0 };
    KeAcquireSpinLock(&g_DebugLock, &OldIrql);
for (PLIST_ENTRY pListEntry = g_Debuginfo.List.Flink; pListEntry != &g_Debuginfo.List; pListEntry = pListEntry->Flink)   //建立独立的g_Debuginfo
    {
        PDebugInfomation pDebuginfo = CONTAINING_RECORD(pListEntry, DebugInfomation, List);
if (pDebuginfo->SourceProcessId == PsGetCurrentProcessId())
        {
            pDebuginfo->TargetProcessId = PsGetProcessId(Process);
break;
        }
    }
    KeReleaseSpinLock(&g_DebugLock, OldIrql);
if (NT_SUCCESS(status)) {
        DbgPrintEx(77, 0, "[DbgHook] Acquire   RundownProtection ... \n");
        PEX_RUNDOWN_REF RundownProtect = (PEX_RUNDOWN_REF)GetProcess_RundownProtect(Process);
if (ExAcquireRundownProtection(RundownProtect))
        {
            DbgPrintEx(77, 0, "[DbgHook] Acquire   RundownProtection success\n");
            DbgPrintEx(77, 0,
"[DbgHook] before DbgkpPostFakeProcessCreateMessages Process=%p DebugObject=%p LastThread=%p\n",
                Process, DebugObject, LastThread);
            DbgPrintEx(77, 0,
"[DbgHook] posting initial process event Process=%p DebugObject=%p\n",
                Process, DebugObject);
            status = DbgkpPostFakeProcessCreateMessages(Process, DebugObject, &LastThread);
            DbgPrintEx(77, 0,
"[DbgHook] DbgkpPostFakeProcessCreateMessages status=0x%08X LastThread=%p\n",
                status, LastThread);
if (NT_SUCCESS(status))
            {
                status = DbgkpSetProcessDebugObject(
                    (PEPROCESS)Process,
                    DebugObject,
                    STATUS_SUCCESS,
                    LastThread);
                DbgPrintEx(77, 0,
"[DbgHook] DbgkpSetProcessDebugObject status=0x%08X\n",
                    status);
            }
            ExReleaseRundownProtection(RundownProtect);
        }
else {
            status = STATUS_PROCESS_IS_TERMINATING;
        }
    }
    ObfDereferenceObject(Process);
if (DebugObjectReferenced)
    {
        ObfDereferenceObject(DebugObject);
    }
    DbgPrintEx(77, 0, "[DbgHook] NtDebugActiveProcess return with status%d\n", status);
return status;
}
```

这里为了调试，日志写多了一点，反正这个函数的调用不是很高频。

来到DbgkpPostFakeThreadMessages

## DbgkpPostFakeThreadMessages

这个函数很奇妙，你必须hook，哪怕只是做个中转，不hook就会卡住，估计是和页有关系。

```cpp
NTSTATUS DbgkpPostFakeThreadMessagesHook(
    PEPROCESS Process,
    PDEBUG_OBJECT DebugObject,
    PETHREAD StartThread,
    PETHREAD* pFirstThread,
    PETHREAD* pLastThread)
{
    DbgPrintEx(77, 0,
"[DbgHook] DbgkpPostFakeThreadMessages enter Process=%p DebugObject=%p StartThread=%p\n",
        Process, DebugObject, StartThread);
    NTSTATUS Status = OriginalDbgkpPostFakeThreadMessages(
        Process,
        DebugObject,
        StartThread,
        pFirstThread,
        pLastThread);
    DbgPrintEx(77, 0,
"[DbgHook] DbgkpPostFakeThreadMessages return status=0x%08X FirstThread=%p LastThread=%p\n",
        Status,
        pFirstThread ? *pFirstThread : NULL,
        pLastThread ? *pLastThread : NULL);
return Status;
}
```

## DbgkpQueueMessage

这个函数会在两个地方用到，比如：

```
DbgkpPostFakeProcessCreateMessages(
    Process,
    DebugObject,
    ...
);
后续调用：
DbgkpQueueMessage(
    Process,
    Thread,
    ApiMsg,
    Flags,
    DebugObject);
```

这时：TargetDebugObject已经是正确对象，不需要再从：Process->DebugPort读取。

因此当前代码：  
DebugObject = TargetDebugObject; 但是不是所有事件调用路径都一定传入有效的 TargetDebugObject

有些路径可能是：  
TargetDebugObject == NULL

或者原版逻辑本来就是在函数内部读取Process->DebugPort，比如被调试进程触发异常时像调试器假消息，此时因为我们是自建debugport：  
Process->DebugPort == NULL

于是两种来源都没有：  
显式 TargetDebugObject 为空  
Process->DebugPort 也为空

这时需要一个替代关系：  
目标进程 PID -> DEBUG_OBJECT

g_Debuginfo 就承担了这个作用：

```objectivec
NTSTATUS DbgkpQueueMessage(
    PEPROCESS Process,
    PETHREAD Thread,
    PDBGKM_APIMSG ApiMsg,
    ULONG Flags,
    PDEBUG_OBJECT TargetDebugObject)
{
DbgPrintEx(77, 0,
"[DbgHook] DbgkpQueueMessage enter pid=%lu api=%lu flags=0x%08X explicit=%p\n",
        (ULONG)PsGetProcessId(Process),
        (ULONG)ApiMsg->ApiNumber,
        Flags,
        TargetDebugObject);
    PDEBUG_EVENT DebugEvent;
    DEBUG_EVENT StaticDebugEvent;
    PDEBUG_OBJECT DebugObject = NULL;
    NTSTATUS Status;
RtlZeroMemory(&StaticDebugEvent, sizeof(StaticDebugEvent));
if (Flags & DEBUG_EVENT_NOWAIT)
    {
        DebugEvent = (PDEBUG_EVENT)ExAllocatePoolWithQuotaTag((POOL_TYPE)(NonPagedPool | POOL_QUOTA_FAIL_INSTEAD_OF_RAISE), sizeof(DEBUG_EVENT), 'EgbD');//sizeof (DEBUG_EVENT)=0x168
if (!DebugEvent)
        {
return  STATUS_INSUFFICIENT_RESOURCES;
        }
        DebugEvent->Flags = Flags | DEBUG_EVENT_INACTIVE;//offset: 0x13
ObReferenceObject(Thread);
ObReferenceObject(Process);
        DebugObject = TargetDebugObject;
        DebugEvent->BackoutThread = PsGetCurrentThread();
// Create-process notifications are commonly queued with NOWAIT before
// NtCreateUserProcess returns. In that window the explicit object and
// the PID map may both be unavailable, while the native DebugPort still
// temporarily identifies the debug object.
if (DebugObject == NULL)
        {
            PVOID DebugPortAddress = GetProcess_DebugPort(Process);
if (DebugPortAddress != NULL)
            {
                DebugObject = *(PDEBUG_OBJECT*)DebugPortAddress;
if (DebugObject != NULL)
                {
DbgPrintEx(77, 0,
"[DbgHook] DbgkpQueueMessage NOWAIT using transient DebugPort pid=%lu object=%p\n",
                        (ULONG)PsGetProcessId(Process), DebugObject);
                }
            }
        }
    }
else
    {
        DebugEvent = &StaticDebugEvent;
        DebugEvent->Flags = Flags;
// The kernel caller already resolved the object for this event.  This is
// important during attach, before the PID mapping is fully observable.
        DebugObject = TargetDebugObject;
// During NtCreateUserProcess, the process DebugPort is populated by the
// native path before the first create event is queued.  The user-process
// wrapper cannot establish the PID mapping yet because it has not returned.
// Use that transient native value only for routing this event; the wrapper
// still clears it after process creation completes.
if (DebugObject == NULL)
        {
            PVOID DebugPortAddress = GetProcess_DebugPort(Process);
if (DebugPortAddress != NULL)
            {
                DebugObject = *(PDEBUG_OBJECT*)DebugPortAddress;
if (DebugObject != NULL)
                {
DbgPrintEx(77, 0,
"[DbgHook] DbgkpQueueMessage using transient Process->DebugPort pid=%lu object=%p\n",
                        (ULONG)PsGetProcessId(Process), DebugObject);
                }
            }
        }
ExAcquireFastMutex(DbgkpProcessDebugPortMutex);
if (DebugObject == NULL)
        {
            KIRQL OldIrql = { 0 };
KeAcquireSpinLock(&g_DebugLock, &OldIrql);
for (PLIST_ENTRY pListEntry = g_Debuginfo.List.Flink; pListEntry != &g_Debuginfo.List; pListEntry = pListEntry->Flink)
            {
                PDebugInfomation pDebuginfo = CONTAINING_RECORD(pListEntry, DebugInfomation, List);
if (pDebuginfo->TargetProcessId == PsGetProcessId(Process))
                {
                    DebugObject = pDebuginfo->DebugObject;
break;
                }
            }
// During CreateProcess, the first debug events are emitted before
// NtCreateUserProcess returns, so TargetProcessId is not known yet.
// The creator PID is the debugger PID for this synchronous path.
if (DebugObject == NULL &&
PsGetProcessId(Process) != PsGetCurrentProcessId())
            {
for (PLIST_ENTRY pListEntry = g_Debuginfo.List.Flink; pListEntry != &g_Debuginfo.List; pListEntry = pListEntry->Flink)
                {
                    PDebugInfomation pDebuginfo = CONTAINING_RECORD(pListEntry, DebugInfomation, List);
if (pDebuginfo->SourceProcessId == PsGetCurrentProcessId())
                    {
                        DebugObject = pDebuginfo->DebugObject;
                        pDebuginfo->TargetProcessId = PsGetProcessId(Process);
DbgPrintEx(77, 0,
"[DbgHook] DbgkpQueueMessage creator fallback source=%lu target=%lu object=%p\n",
                            (ULONG)PsGetCurrentProcessId(),
                            (ULONG)PsGetProcessId(Process),
                            DebugObject);
break;
                    }
                }
            }
KeReleaseSpinLock(&g_DebugLock, OldIrql);
        }
        PVOID CrossThreadFlags = GetThread_CrossThreadFlags(Thread);
if (ApiMsg->ApiNumber == DbgKmCreateThreadApi || ApiMsg->ApiNumber == DbgKmCreateProcessApi) {
if (*(PULONG)(CrossThreadFlags)& PS_CROSS_THREAD_FLAGS_SKIP_CREATION_MSG) {
                DebugObject = NULL;
            }
        }
if (ApiMsg->ApiNumber == DbgKmExitThreadApi || ApiMsg->ApiNumber == DbgKmExitProcessApi) {
if (*(PULONG)(CrossThreadFlags)& PS_CROSS_THREAD_FLAGS_SKIP_TERMINATION_MSG) {
                DebugObject = NULL;
            }
        }
    }
KeInitializeEvent(&DebugEvent->ContinueEvent, SynchronizationEvent, FALSE);
    DebugEvent->Process = Process;
    DebugEvent->Thread = Thread;
    DebugEvent->ApiMsg = *ApiMsg;
    DebugEvent->ClientId.UniqueProcess = PsGetThreadProcessId(Thread);
    DebugEvent->ClientId.UniqueThread = PsGetThreadId(Thread);
//KIRQL irql = KeGetCurrentIrql();//win7 ������ܻᱨirql bsod���������ֱ�ӷ���
if (DebugObject == NULL/* || irql >= APC_LEVEL*/)
    {
DbgPrintEx(77, 0,
"[DbgHook] DbgkpQueueMessage no debug object pid=%lu api=%lu flags=0x%08X\n",
                (ULONG)PsGetProcessId(Process),
                (ULONG)ApiMsg->ApiNumber,
                Flags);
            Status = STATUS_PORT_NOT_SET;
    }
else
    {
ExAcquireFastMutex(&DebugObject->Mutex);
if ((DebugObject->Flags & DEBUG_OBJECT_DELETE_PENDING) == 0) {
InsertTailList(&DebugObject->EventList, &DebugEvent->EventList);
if ((Flags & DEBUG_EVENT_NOWAIT) == 0) {
KeSetEvent(&DebugObject->EventsPresent, 0, FALSE);
            }
            Status = STATUS_SUCCESS;
DbgPrintEx(77, 0,
"[DbgHook] DbgkpQueueMessage queued pid=%lu api=%lu flags=0x%08X nowait=%d\n",
                (ULONG)PsGetProcessId(Process),
                (ULONG)ApiMsg->ApiNumber,
                Flags,
                (Flags & DEBUG_EVENT_NOWAIT) != 0);
        }
else
        {
            Status = STATUS_DEBUGGER_INACTIVE;
        }
ExReleaseFastMutex(&DebugObject->Mutex);
    }
if ((Flags & DEBUG_EVENT_NOWAIT) == 0) {
ExReleaseFastMutex(DbgkpProcessDebugPortMutex);
if (NT_SUCCESS(Status)) {
KeWaitForSingleObject(
                &DebugEvent->ContinueEvent,
                Executive,
                KernelMode,
                FALSE,
                NULL);
            Status = DebugEvent->Status;
            *ApiMsg = DebugEvent->ApiMsg;
        }
    }
else {
if (!NT_SUCCESS(Status)) {
ObfDereferenceObject(Process);
ObfDereferenceObject(Thread);
ExFreePool(DebugEvent);
        }
    }
DbgPrintEx(77, 0,
"[DbgHook] DbgkpQueueMessage return status=0x%08X pid=%lu api=%lu flags=0x%08X\n",
        Status,
        (ULONG)PsGetProcessId(Process),
        (ULONG)ApiMsg->ApiNumber,
        Flags);
return Status;
}
```

## DbgkpSetProcessDebugObject

DbgkpSetProcessDebugObject是把调试对象挂到被调试进程的地方,同时也是置位peb->BeingDebugged，我们肯定要hook，只要不让他干这些事就行了。

```rust
NTSTATUS DbgkpSetProcessDebugObject(
    PEPROCESS Process,
    PDEBUG_OBJECT DebugObject,
    NTSTATUS MsgStatus,
    PETHREAD LastThread)
{
    NTSTATUS Status;
    PETHREAD ThisThread;
    LIST_ENTRY TempList;
    PLIST_ENTRY Entry;
    PDEBUG_EVENT DebugEvent;
    BOOLEAN First;
    PETHREAD Thread;
    BOOLEAN GlobalHeld;
    PETHREAD FirstThread = NULL;
    ThisThread = (PETHREAD)PsGetCurrentThread();
InitializeListHead(&TempList);
    First = TRUE;
    GlobalHeld = FALSE;
if (!NT_SUCCESS(MsgStatus)) {
        LastThread = NULL;
        Status = MsgStatus;
    }
else {
        Status = STATUS_SUCCESS;
    }
if (NT_SUCCESS(Status)) {
while (TRUE) {
////��������DebugPort����������
//PVOID DebugPort__ = GetProcess_DebugPort(Process);
//*(ULONG64 *)(DebugPort__) = (ULONG64)DebugObject;
ExAcquireFastMutex(DbgkpProcessDebugPortMutex);
            GlobalHeld = TRUE;
if (LastThread != NULL) {
ObfReferenceObject(LastThread);
            }
            Thread = (PETHREAD)PsGetNextProcessThread((PEPROCESS)Process, (PETHREAD)LastThread);
if (Thread != NULL) {
ExReleaseFastMutex(DbgkpProcessDebugPortMutex);
                GlobalHeld = FALSE;
if (LastThread != NULL) {
ObfDereferenceObject(LastThread);
                }
                Status = DbgkpPostFakeThreadMessages(
                    Process,
                    DebugObject,
                    Thread,
                    &FirstThread,
                    &LastThread);
if (!NT_SUCCESS(Status)) {
                    LastThread = NULL;
break;
                }
if (FirstThread != NULL) {
ObfDereferenceObject(FirstThread);
                    FirstThread = NULL;
                }
            }
else {
break;
            }
        }
    }
// Keep the real DebugPort hidden. DbgkpQueueMessage uses g_Debuginfo to
// route normal events while the target process remains non-debuggable to
// callers that inspect EPROCESS.
ExAcquireFastMutex(&DebugObject->Mutex);
if (NT_SUCCESS(Status)) {
if ((DebugObject->Flags & DEBUG_OBJECT_DELETE_PENDING) == 0) {
ObfReferenceObject(DebugObject);
        }
else {
            Status = STATUS_DEBUGGER_INACTIVE;
        }
    }
for (Entry = DebugObject->EventList.Flink; Entry != &DebugObject->EventList;) {
        DebugEvent = CONTAINING_RECORD(Entry, DEBUG_EVENT, EventList);
        Entry = Entry->Flink;
if ((DebugEvent->Flags & DEBUG_EVENT_INACTIVE) != 0 && DebugEvent->BackoutThread == (PETHREAD)ThisThread) {
            Thread = DebugEvent->Thread;
if (NT_SUCCESS(Status)) {
if ((DebugEvent->Flags & DEBUG_EVENT_PROTECT_FAILED) != 0) {
                    PVOID CrossThreadFlags = GetThread_CrossThreadFlags(Thread);
RtlInterlockedSetBitsDiscardReturn(CrossThreadFlags, 0x100);
RemoveEntryList(&DebugEvent->EventList);
InsertTailList(&TempList, &DebugEvent->EventList);
                }
else {
if (First) {
                        DebugEvent->Flags &= ~DEBUG_EVENT_INACTIVE;
KeSetEvent(&DebugObject->EventsPresent, 0, FALSE);
                        First = FALSE;
                    }
                    DebugEvent->BackoutThread = NULL;
                    PVOID CrossThreadFlags = GetThread_CrossThreadFlags(Thread);
RtlInterlockedSetBitsDiscardReturn(CrossThreadFlags, 0x80);
                }
            }
else {
RemoveEntryList(&DebugEvent->EventList);
InsertTailList(&TempList, &DebugEvent->EventList);
            }
if (DebugEvent->Flags & DEBUG_EVENT_RELEASE) {
                DebugEvent->Flags &= ~DEBUG_EVENT_RELEASE;
                PVOID RundownProtect = GetThread_RundownProtect(Thread);
ExReleaseRundownProtection((PEX_RUNDOWN_REF)RundownProtect);
            }
        }
    }
ExReleaseFastMutex(&DebugObject->Mutex);
if (GlobalHeld)
    {
ExReleaseFastMutex(DbgkpProcessDebugPortMutex);
    }
if (LastThread != NULL) {
ObDereferenceObject(LastThread);
    }
while (!IsListEmpty(&TempList)) {
        Entry = RemoveHeadList(&TempList);
        DebugEvent = CONTAINING_RECORD(Entry, DEBUG_EVENT, EventList);
DbgkpWakeTarget(DebugEvent);
    }
//������������BeingDebugged��
//if (NT_SUCCESS(Status)) {
// DbgkpMarkProcessPeb(Process);
//}
return Status;
}
```

## KiDispatchException

对于被调试调试器来说，真正要hook的只有KiDispatchException，和DbgkForwardException，因为只有这里会用上debugport，向调试器发生异常，比如int3。

当触发异常时会来到KiDispatchException，此处有：

```
if ( Process->DebugPort )
  {
if ( (v5 & 1) != 0 )
    {
if ( (Thread->CrossThreadFlags & 4) == 0 )
      {
memset(&APIMSG, 0, 0x40u);
        APIMSG.u.Exception.ExceptionRecord.ExceptionRecord = (_EXCEPTION_RECORD *)Thread->Win32StartAddress;
        APIMSG.h.u1.Length = 0x400018;
        APIMSG.h.u2.ZeroInit = 8;
        APIMSG.ApiNumber = DbgKmCreateThreadApi;
DbgkpSendApiMessage(Process, 1, &APIMSG);
      }
    }
else
```

假如异常发生且Process->DebugPort有值，才会发给调试器，但是显然我们没有，所以这里需要寻找, 没找到跳回原来的KiDispatchException即可。

```objectivec
VOID KiDispatchException(
    PEXCEPTION_RECORD ExceptionRecord,
void* ExceptionFrame,
    PKTRAP_FRAME TrapFrame,
    KPROCESSOR_MODE PreviousMode,
    BOOLEAN FirstChance)
{
if (PreviousMode != KernelMode)
    {
        BOOLEAN isDebug = FALSE;
        KIRQL OldIrql = { 0 };
        KeAcquireSpinLock(&g_DebugLock, &OldIrql);
for (PLIST_ENTRY pListEntry = g_Debuginfo.List.Flink; pListEntry != &g_Debuginfo.List; pListEntry = pListEntry->Flink)
        {
            PDebugInfomation pDebuginfo = CONTAINING_RECORD(pListEntry, DebugInfomation, List);
if (pDebuginfo->TargetProcessId == PsGetCurrentProcessId())
            {
                isDebug = TRUE;
break;
            }
        }
        KeReleaseSpinLock(&g_DebugLock, OldIrql);
if (isDebug)
        {
            BOOLEAN Wow64ExceptionCode = FALSE;
if ((TrapFrame->SegCs & 0xfff8) == KGDT64_R3_CMCODE)
            {
switch (ExceptionRecord->ExceptionCode)
                {
case STATUS_BREAKPOINT:
                    ExceptionRecord->ExceptionCode = STATUS_WX86_BREAKPOINT;
                    Wow64ExceptionCode = TRUE;
break;
case STATUS_SINGLE_STEP:
                    ExceptionRecord->ExceptionCode = STATUS_WX86_SINGLE_STEP;
                    Wow64ExceptionCode = TRUE;
break;
                }
            }
if (DbgkForwardException(ExceptionRecord, TRUE, FALSE))
            {
return;
            }
if (Wow64ExceptionCode)
            {
switch (ExceptionRecord->ExceptionCode)
                {
case STATUS_WX86_BREAKPOINT:
                    ExceptionRecord->ExceptionCode = STATUS_BREAKPOINT;
break;
case STATUS_WX86_SINGLE_STEP:
                    ExceptionRecord->ExceptionCode = STATUS_SINGLE_STEP;
break;
                }
            }
        }
    }
    OrignalKiDispatchException(ExceptionRecord, ExceptionFrame, TrapFrame, PreviousMode, FirstChance);
return;
}
```

## DbgkForwardException

然后来到DbgkForwardException，这里还是从g_Debuginfo里面找DEBUG_OBJECT，同时把检测ThreadHideFromDebugger的地方删掉就行了。

```objectivec
BOOLEAN  DbgkForwardException(
    PEXCEPTION_RECORD ExceptionRecord,
    BOOLEAN DebugException,
    BOOLEAN SecondChance)
{
    DbgPrintEx(77, 0, "[DbgHook] DbgkForwardException enter pid=%lu DebugException=%d ExceptionCode=0x%08X\n", (ULONG)PsGetCurrentProcessId(), DebugException, ExceptionRecord->ExceptionCode);
    NTSTATUS		st;
    PEPROCESS		Process;
    PVOID			ExceptionPort;
    PDEBUG_OBJECT	DebugObject;
    BOOLEAN			bLpcPort;
    DBGKM_APIMSG m;
    PDBGKM_EXCEPTION args;
    RtlZeroMemory(&m, sizeof(m));
    DebugObject = NULL;
    ExceptionPort = NULL;
    bLpcPort = FALSE;
    args = &m.u.Exception;
    m.h.u1.Length = 0xD000A8;
    m.h.u2.ZeroInit = 8;
    m.ApiNumber = DbgKmExceptionApi;
    Process = (PEPROCESS)PsGetCurrentProcess();
if (DebugException == TRUE)
    {
        KIRQL OldIrql = { 0 };
        KeAcquireSpinLock(&g_DebugLock, &OldIrql);
for (PLIST_ENTRY pListEntry = g_Debuginfo.List.Flink; pListEntry != &g_Debuginfo.List; pListEntry = pListEntry->Flink)
        {
            PDebugInfomation pDebuginfo = CONTAINING_RECORD(pListEntry, DebugInfomation, List);
if (pDebuginfo->TargetProcessId == PsGetCurrentProcessId())
            {
                DebugObject = pDebuginfo->DebugObject;
break;
            }
        }
        KeReleaseSpinLock(&g_DebugLock, OldIrql);
    }
else
    {
        ExceptionPort = PsCaptureExceptionPort(Process);
        m.h.u2.ZeroInit = 0x7;
        bLpcPort = TRUE;
    }
    DbgPrintEx(77, 0, "[DbgHook] DbgkForwardException DebugObject=%p ExceptionPort=%p\n", DebugObject, ExceptionPort);
if ((ExceptionPort == NULL && DebugObject == NULL) &&
        DebugException == TRUE)
    {
returnFALSE;
    }
    args->ExceptionRecord = *ExceptionRecord;
    args->FirstChance = !SecondChance;
if (bLpcPort == FALSE)
    {
#ifdef WIN7
        st = DbgkpSendApiMessage(DebugException, &m);
#else
        st = DbgkpSendApiMessage(PsGetThreadProcess(KeGetCurrentThread()), DebugException, &m);
#endif
    }
elseif (ExceptionPort) {
        st = DbgkpSendApiMessageLpc(&m, ExceptionPort, DebugException);
        ObfDereferenceObject(ExceptionPort);
    }
else {
        m.ReturnedStatus = DBG_EXCEPTION_NOT_HANDLED;
        st = STATUS_SUCCESS;
    }
    DbgPrintEx(77, 0, "[DbgHook] DbgkForwardException st=0x%08X ReturnedStatus=0x%08X\n", st, m.ReturnedStatus);
if (NT_SUCCESS(st))
    {
        st = m.ReturnedStatus;
if (m.ReturnedStatus == DBG_EXCEPTION_NOT_HANDLED)
        {
if (DebugException == TRUE)
            {
                DbgPrintEx(77, 0, "[DbgHook] DbgkForwardException return FALSE (not handled)\n");
returnFALSE;
            }
            st = DbgkpSendErrorMessage(ExceptionRecord, 0, &m);
        }
    }
    DbgPrintEx(77, 0, "[DbgHook] DbgkForwardException return %d\n", NT_SUCCESS(st));
return NT_SUCCESS(st);
}
```

此时附加调试就hook完毕。

**创建调试重构**

请先食用： [https://qmeimei10086.github.io/2026/08/14/win%E5%86%85%E6%A0%B8%E8%B0%83%E8%AF%95%E5%8E%9F%E7%90%86%E6%8F%AD%E7%A7%985-%E5%88%9B%E5%BB%BA%E8%B0%83%E8%AF%95/](https://qmeimei10086.github.io/2026/08/14/win%E5%86%85%E6%A0%B8%E8%B0%83%E8%AF%95%E5%8E%9F%E7%90%86%E6%8F%AD%E7%A7%985-%E5%88%9B%E5%BB%BA%E8%B0%83%E8%AF%95/)

注意：创建调试hook的都是高频使用函数，请不要使用dbgprint了，而且有概率会在hook时就被pg发现从而蓝屏。

创建调试顾名思义会创建进程，最终会走到NtCreateUserProcess

核心流程如下：  
因为太长了，所以我们先完全调用原版创建流程。

status = OrignalNtCreateUserProcess(...);然后检查当前进程是否存在调试记录：

```
if (pDebuginfo->SourceProcessId == PsGetCurrentProcessId())  
{  
    TmpDebuginfo = pDebuginfo;  
    isDebug = TRUE;  
}  
```

这里的含义是：  
当前进程 PID == 调试器 PID

如果成立，就认为这是“由当前调试器创建的进程”。

接着根据返回的进程句柄获取新进程对象：

```
status = ObReferenceObjectByHandle(  
    *ProcessHandle,
0x0400,
    *PsProcessType,
ExGetPreviousMode(),
    (void**)&temp_process,
NULL);
```

然后执行以下额外逻辑。

记录新创建进程的 PID

```
HANDLEtarget_pid= PsGetProcessId(temp_process);
TmpDebuginfo->TargetProcessId = target_pid;
```

它把调试器 PID -> 新创建进程 PID 写入g_Debuginfo

因此后续事件可以通过：TargetProcessId -> DebugObject -> 找到调试对象。

清除新进程的 DebugPort

```
PVOID DebugPort__ = GetProcess_DebugPort(temp_process);
if (*(ULONG64*)(DebugPort__) != 0)
{
*(ULONG64*)(DebugPort__) = 0;
}
```

这一步是当前 hook 最重要的行为：原版创建流程可能已经设置(如果在creatprocess里携带了相应信息)：

```
new_process->DebugPort = DebugObject 
```

当前 hook 随后改回：

```
new_process->DebugPort = NULL
```

也就是说，原版流程先建立真实调试关联，你的 hook 在返回前把它隐藏掉，再依赖自己的 g_Debuginfo 路由后续事件。

更新 PEB 的 BeingDebugged  
DbgkpMarkProcessPeb(temp_process)可能会置位Peb->BeingDebugged，我们直接让PEB.BeingDebugged = FALSE

清除 NO_DEBUG_INHERIT

```
PVOIDFlags= GetProcess_ProcessFlags(temp_process);
*(PULONG64)Flags &= ~PS_PROCESS_FLAGS_NO_DEBUG_INHERIT;
```

这一步清除：PS_PROCESS_FLAGS_NO_DEBUG_INHERIT

目的是让目标进程后续创建的子进程继续继承调试关系，或者避免该标志阻止调试事件继承。

最终代码：

```objectivec
NTSTATUS NtCreateUserProcess(
    PHANDLE ProcessHandle,
    PETHREAD ThreadHandle,
    ACCESS_MASK ProcessDesiredAccess,
    ACCESS_MASK ThreadDesiredAccess,
    PVOID ProcessObjectAttributes,
    PVOID ThreadObjectAttributes,
    ULONG ProcessFlags,
    ULONG ThreadFlags,
    PVOID ProcessParameters,
void* CreateInfo,
void* AttributeList)
{
NTSTATUSstatus=;

    status = OrignalNtCreateUserProcess(ProcessHandle,
        ThreadHandle,
        ProcessDesiredAccess,
        ThreadDesiredAccess,
        ProcessObjectAttributes,
        ThreadObjectAttributes,
        ProcessFlags,
        ThreadFlags,
        ProcessParameters,
        CreateInfo,
        AttributeList);
if (NT_SUCCESS(status) && ProcessHandle != NULL)
    {
PDebugInfomationTmpDebuginfo= NULL;
BOOLEANisDebug= FALSE;
KIRQLOldIrql= { 0 };
        KeAcquireSpinLock(&g_DebugLock, &OldIrql);
for (PLIST_ENTRYpListEntry= g_Debuginfo.List.Flink; pListEntry != &g_Debuginfo.List; pListEntry = pListEntry->Flink)
        {
PDebugInfomationpDebuginfo= CONTAINING_RECORD(pListEntry, DebugInfomation, List);
if (pDebuginfo->SourceProcessId == PsGetCurrentProcessId())
            {
                TmpDebuginfo = pDebuginfo;
                isDebug = TRUE;
break;
            }
        }
        KeReleaseSpinLock(&g_DebugLock, OldIrql);
if (isDebug)
        {
PEPROCESStemp_process= NULL;
            status = ObReferenceObjectByHandle(*ProcessHandle, 0x0400, *PsProcessType, ExGetPreviousMode(), (void**)&temp_process, NULL);
if (!NT_SUCCESS(status))
return status;
PVOIDDebugPort__= GetProcess_DebugPort(temp_process);
if (*(ULONG64*)(DebugPort__) != 0)
            {
HANDLEtarget_pid= PsGetProcessId(temp_process);
                TmpDebuginfo->TargetProcessId = target_pid;
                *(ULONG64*)(DebugPort__) = 0;
                DbgkpMarkProcessPeb(temp_process);
PVOIDFlags= GetProcess_ProcessFlags(temp_process);
                *(PULONG64)Flags &= ~PS_PROCESS_FLAGS_NO_DEBUG_INHERIT;
            }
        }
    }
return status;
}
```

## DbgkMapViewOfSection 和 DbgkUnMapViewOfSection

这几个函数可能会在加载dll比如loadlibraryA之类的地方被调用，如果检测到有调试对象，就发送模块加载的信息。

但是显然我们没有调试对象，因此逻辑如下：

通过当前进程 PID  
\-> g_Debuginfo.TargetProcessId  
\-> DebugObject

如果查不到：  
if (!DebugObject)  
return;

也就是直接丢弃模块加载事件。

```cpp
VOID DbgkMapViewOfSection(
    PEPROCESS	Process,
    PVOID SectionObject,
    PVOID BaseAddress
){
    PTEB	Teb;
    HANDLE	hFile;
    DBGKM_APIMSG ApiMsg;
    PEPROCESS	CurrentProcess;
    PETHREAD	CurrentThread;
    PIMAGE_NT_HEADERS	pImageHeader;
    hFile = NULL;
    CurrentProcess = (PEPROCESS)PsGetCurrentProcess();
    CurrentThread = (PETHREAD)PsGetCurrentThread();
if (ExGetPreviousMode() == KernelMode)
return;
    PDEBUG_OBJECT	DebugObject = NULL;
    KIRQL OldIrql = { 0 };
KeAcquireSpinLock(&g_DebugLock, &OldIrql);
for (PLIST_ENTRY pListEntry = g_Debuginfo.List.Flink; pListEntry != &g_Debuginfo.List; pListEntry = pListEntry->Flink)
    {
        PDebugInfomation pDebuginfo = CONTAINING_RECORD(pListEntry, DebugInfomation, List);
if (pDebuginfo->TargetProcessId == PsGetCurrentProcessId())
        {
            DebugObject = pDebuginfo->DebugObject;
break;
        }
    }
KeReleaseSpinLock(&g_DebugLock, OldIrql);
if (!DebugObject)
return;
    Teb = (PTEB)PsGetThreadTeb(CurrentThread);
if (Teb != NULL && Process == CurrentProcess)
    {
if (!DbgkpSuppressDbgMsg(Teb))
        {
            ApiMsg.u.LoadDll.NamePointer = Teb->NtTib.ArbitraryUserPointer;
        }
else {
return;
        }
    }
else {
        ApiMsg.u.LoadDll.NamePointer = NULL;
    }
    hFile = DbgkpSectionToFileHandle(SectionObject);
    ApiMsg.u.LoadDll.FileHandle = hFile;
    ApiMsg.u.LoadDll.BaseOfDll = BaseAddress;
    ApiMsg.u.LoadDll.DebugInfoFileOffset = 0;
    ApiMsg.u.LoadDll.DebugInfoSize = 0;
    _try{
        pImageHeader = RtlImageNtHeader(BaseAddress);
if (pImageHeader != NULL)
        {
            ApiMsg.u.LoadDll.DebugInfoFileOffset = pImageHeader->FileHeader.PointerToSymbolTable;
            ApiMsg.u.LoadDll.DebugInfoSize = pImageHeader->FileHeader.NumberOfSymbols;
        }
    }_except(EXCEPTION_EXECUTE_HANDLER) {
        ApiMsg.u.LoadDll.DebugInfoFileOffset = 0;
        ApiMsg.u.LoadDll.DebugInfoSize = 0;
        ApiMsg.u.LoadDll.NamePointer = NULL;
    }
    ApiMsg.h.u1.Length = 0x500028;
    ApiMsg.h.u2.ZeroInit = 8;
    ApiMsg.ApiNumber = DbgKmLoadDllApi;
#ifdef WIN7
DbgkpSendApiMessage(0x1, &ApiMsg);
#else
DbgkpSendApiMessage(PsGetThreadProcess(KeGetCurrentThread()), 0x1, &ApiMsg);
#endif
if (ApiMsg.u.LoadDll.FileHandle != NULL)
    {
ObCloseHandle(ApiMsg.u.LoadDll.FileHandle, KernelMode);
    }
}
VOID DbgkUnMapViewOfSection(
    PEPROCESS	Process,
    PVOID	BaseAddress){
    PTEB	Teb;
    DBGKM_APIMSG ApiMsg;
    PEPROCESS	CurrentProcess;
    PETHREAD	CurrentThread;
    CurrentProcess = (PEPROCESS)PsGetCurrentProcess();
    CurrentThread = (PETHREAD)PsGetCurrentThread();
if (ExGetPreviousMode() == KernelMode)
return;
    PDEBUG_OBJECT	DebugObject = NULL;
    KIRQL OldIrql = { 0 };
KeAcquireSpinLock(&g_DebugLock, &OldIrql);
for (PLIST_ENTRY pListEntry = g_Debuginfo.List.Flink; pListEntry != &g_Debuginfo.List; pListEntry = pListEntry->Flink)
    {
        PDebugInfomation pDebuginfo = CONTAINING_RECORD(pListEntry, DebugInfomation, List);
if (pDebuginfo->TargetProcessId == PsGetCurrentProcessId())
        {
            DebugObject = pDebuginfo->DebugObject;
break;
        }
    }
KeReleaseSpinLock(&g_DebugLock, OldIrql);
if (!DebugObject)
return;
//����ʡ����ϵͳ���̺͹ҿ����̵��ж�
    Teb = (PTEB)PsGetThreadTeb(CurrentThread);
if (Teb != NULL && Process == CurrentProcess)
    {
if (DbgkpSuppressDbgMsg(Teb))
        {
return;
        }
    }
    ApiMsg.u.UnloadDll.BaseAddress = BaseAddress;
    ApiMsg.h.u1.Length = 0x380010;
    ApiMsg.h.u2.ZeroInit = 8;
    ApiMsg.ApiNumber = DbgKmUnloadDllApi;
#ifdef WIN7
DbgkpSendApiMessage(0x1, &ApiMsg);
#else
DbgkpSendApiMessage(PsGetThreadProcess(KeGetCurrentThread()), 0x1, &ApiMsg);
#endif
}
```

## DbgkCreateThread

通过前面创建调试的知识，我们知道创建好的进程第一次被调度会执行PspUserThreadStartup，进而来到DbgkCreateThread，这里就是第一次向调试器发送事件的地方，也是断下来的地方。

这里我们的处理也很简单，还是通过g_Debuginfo找到调试对象，然后发送调试事件，然后直接在此调用原版的DbgkCreateThread，因为没有debugport，就不会再发一次，而且会帮我们完成剩下的工作

```rust
VOID  DbgkCreateThread(
    PETHREAD Thread)
{
    PVOID Port;
    DBGKM_APIMSG m;
    PDBGKM_CREATE_THREAD CreateThreadArgs;
    PDBGKM_CREATE_PROCESS CreateProcessArgs;
    PEPROCESS Process = PsGetCurrentProcess();
    HANDLE ProcessId = PsGetCurrentProcessId();
    PDBGKM_LOAD_DLL LoadDllArgs;
    NTSTATUS Status;
    OBJECT_ATTRIBUTES Obja;
    IO_STATUS_BLOCK IoStatusBlock;
    PIMAGE_NT_HEADERS NtHeaders;
    PTEB Teb;
RtlZeroMemory(&m, sizeof(m));
    BOOLEAN isDebug = FALSE;
    KIRQL OldIrql = { 0 };
KeAcquireSpinLock(&g_DebugLock, &OldIrql);
for (PLIST_ENTRY pListEntry = g_Debuginfo.List.Flink; pListEntry != &g_Debuginfo.List; pListEntry = pListEntry->Flink)
    {
        PDebugInfomation pDebuginfo = CONTAINING_RECORD(pListEntry, DebugInfomation, List);
if (pDebuginfo->TargetProcessId == PsGetCurrentProcessId())
        {
            isDebug = TRUE;
break;
        }
    }
KeReleaseSpinLock(&g_DebugLock, OldIrql);
if (isDebug)
    {
        PVOID ProFlag = GetProcess_ProcessFlags(Process);
        ULONG OldFlags = RtlInterlockedSetBits(ProFlag, 0x400001);	//RtlInterlockedSetBits(&Process->Flags, 0x400001);֮ǰ���bug��win7�ͻ���֣����Ұ���
if ((OldFlags & PS_PROCESS_FLAGS_CREATE_REPORTED) == 0)
        {
            CreateThreadArgs = &m.u.CreateProcessInfo.InitialThread;
            CreateThreadArgs->SubSystemKey = 0;
            CreateProcessArgs = &m.u.CreateProcessInfo;
            CreateProcessArgs->SubSystemKey = 0;
            CreateProcessArgs->FileHandle = DbgkpSectionToFileHandle((PVOID) * (PULONG64)GetProcess_SectionObject(Process));
            CreateProcessArgs->BaseOfImage = (PVOID) * (PULONG64)GetProcess_SectionBaseAddress(Process);
            CreateThreadArgs->StartAddress = NULL;
            CreateProcessArgs->DebugInfoFileOffset = 0;
            CreateProcessArgs->DebugInfoSize = 0;
            __try
            {
                NtHeaders = RtlImageNtHeader((PVOID) * (PULONG64)GetProcess_SectionBaseAddress(Process));
if (NtHeaders)
                {
if (PsGetProcessWow64Process(Process) != NULL)
                    {
                        CreateThreadArgs->StartAddress = UlongToPtr(DBGKP_FIELD_FROM_IMAGE_OPTIONAL_HEADER((PIMAGE_NT_HEADERS32)NtHeaders, ImageBase) + DBGKP_FIELD_FROM_IMAGE_OPTIONAL_HEADER((PIMAGE_NT_HEADERS32)NtHeaders, AddressOfEntryPoint));
                    }
else {
                        CreateThreadArgs->StartAddress = (PVOID)(DBGKP_FIELD_FROM_IMAGE_OPTIONAL_HEADER(NtHeaders, ImageBase) + DBGKP_FIELD_FROM_IMAGE_OPTIONAL_HEADER(NtHeaders, AddressOfEntryPoint));
                    }
                    CreateProcessArgs->DebugInfoFileOffset = NtHeaders->FileHeader.PointerToSymbolTable;
                    CreateProcessArgs->DebugInfoSize = NtHeaders->FileHeader.NumberOfSymbols;
                }
            }
            __except (EXCEPTION_EXECUTE_HANDLER)
            {
                CreateThreadArgs->StartAddress = NULL;
                CreateProcessArgs->DebugInfoFileOffset = 0;
                CreateProcessArgs->DebugInfoSize = 0;
            }
            m.h.u1.Length = 0x600038;
            m.h.u2.ZeroInit = 8;
            m.ApiNumber = DbgKmCreateProcessApi;
#ifdef WIN7
DbgkpSendApiMessage(FALSE, &m);
#else
DbgkpSendApiMessage(Process, FALSE, &m);
#endif
if (CreateProcessArgs->FileHandle != NULL) {
ObCloseHandle(CreateProcessArgs->FileHandle, KernelMode);
            }
DbgkSendSystemDllMessages(0, 0, &m);
        }
else
        {
            CreateThreadArgs = &m.u.CreateThread;
            CreateThreadArgs->SubSystemKey = 0;
            CreateThreadArgs->StartAddress = (PVOID) * (PULONG64)GetThread_StartAddress(Thread);
            m.h.u1.Length = 0x400018;
            m.h.u2.ZeroInit = 8;
            m.ApiNumber = DbgKmCreateThreadApi;
#ifdef WIN7
DbgkpSendApiMessage(TRUE, &m);
#else
DbgkpSendApiMessage(Process, TRUE, &m);
#endif
        }
    }
OriginalDbgkCreateThread(Thread);
}
```

**成品**

因为我的电脑是amd的，而且目前市面上开源svm调试器比较少，所以基于npt hook写了一个。

效果：  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/48a5d7739acf699a.jpg)

这是普通调试器：  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3b1778104269f190.jpg)

经过测试可以调试全版本启动了反调试的vmp

视频演示： [https://b23.tv/8Jo38Bh](https://b23.tv/8Jo38Bh)

项目地址： [https://github.com/Qmeimei10086/svm-dbg](https://github.com/Qmeimei10086/svm-dbg)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7ad18434c936275d.png)

看雪ID：Qmeimei10086

[https://bbs.kanxue.com/user-home-1055387.htm](https://bbs.kanxue.com/user-home-1055387.htm)

\*本文为看雪论坛优秀文章，由 Qmeimei10086原创，转载请注明来自看雪社区

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a38918b04b4308d7.jpg)](https://mp.weixin.qq.com/s?__biz=MjM5NTc2MDYxMw==&mid=2458619143&idx=1&sn=e439f1791d5352b3ab2ee823dd02fb1c&scene=21#wechat_redirect)

9月10日【议题征集】截止

\# 往期推荐

[App 抽取壳的内存脱壳与请求签名逆向](https://mp.weixin.qq.com/s?__biz=MjM5NTc2MDYxMw==&mid=2458619713&idx=1&sn=ec61b7e3afb64384c71693657e53d117&scene=21#wechat_redirect)

[ART 执行链与 Nterp：解析 FART Android12‑16 失效问题](https://mp.weixin.qq.com/s?__biz=MjM5NTc2MDYxMw==&mid=2458619676&idx=1&sn=2c4d3a7a8e4001824f3a0a2f5bc5c8f8&scene=21#wechat_redirect)

[Hitcon-2016-babytrick 解题报告](https://mp.weixin.qq.com/s?__biz=MjM5NTc2MDYxMw==&mid=2458619656&idx=2&sn=e2518e55f8b66c6b10176910c3fd00e6&scene=21#wechat_redirect)

[Windows调试体系揭秘](https://mp.weixin.qq.com/s?__biz=MjM5NTc2MDYxMw==&mid=2458619528&idx=2&sn=24940f883e8435ecda20073eec37fb9b&scene=21#wechat_redirect)

[RP2350 硬件固化 CVE‑2022‑38694：突破 Unisoc BSP 安全启动链](https://mp.weixin.qq.com/s?__biz=MjM5NTc2MDYxMw==&mid=2458619521&idx=2&sn=1a084ce77235787ce7e11a74374a537f&scene=21#wechat_redirect)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3bda3987c6441739.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c953c0b9b281634c.gif)

**球分享**

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c953c0b9b281634c.gif)

**球点赞**

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c953c0b9b281634c.gif)

**球在看**

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/bc51e60a1ab9953f.gif)

点击阅读原文查看更多
