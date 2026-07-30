---
title: 【看雪】Windows调试体系揭秘
source: https://bbs.kanxue.com/thread-292227.htm
source_host: bbs.kanxue.com
clip_date: 2026-07-30T15:09:44+08:00
trace_id: 6d2b4e15-5426-4ad1-81f6-34ec36ee874d
content_hash: 74e7975c0308eb6846851c8cfeaf0949738a0781a84fd1875efd6cc4c1324f2e
status: synced
tags:
  - 看雪
  - Windows逆向
  - 内核
series: null
feed_source: 看雪·逆向工程
ai_summary: 调试器通过内核调试对象与事件链表实现调试事件传递，附加时注入远程断点线程并同步事件，同时存在利用线程隐藏位绕过的反调试技巧。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ad75244-d011-817b-8add-e0f2e150899c
ioc:
  cves: []
  cwes: []
  hashes:
    - bd8137a324a8476723cc573f97133cb1
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 调试器通过内核调试对象与事件链表实现调试事件传递，附加时注入远程断点线程并同步事件，同时存在利用线程隐藏位绕过的反调试技巧。
> 
> - **调试对象与事件链表：** `DEBUG_OBJECT` 的 `EventList` 是双向循环链表，串联所有 `DEBUG_EVENT`；`EventsPresent` 为信号量，事件到来时置位以唤醒等待的调试器。
> - **附加流程核心调用：** `DebugActiveProcess` 先通过 `NtCreateDebugObject` 创建调试对象并关联调试器，再由 `NtDebugActiveProcess` 将其挂到被调试进程的 `DebugPort`，然后注入远程 `DbgUiRemoteBreakin` 线程触发 `int3` 初始断点。
> - **假消息机制：** `DbgkpPostFakeProcessCreateMessages` 遍历所有线程和模块，构造 `DBGKM_APIMSG`，经 `DbgkpQueueMessage` 转成 `DEBUG_EVENT` 并插入链表，模拟进程创建、线程创建等事件，供调试器显示。
> - **事件同步模型：** 被调试进程异常时调用 `DbgkpQueueMessage`（Flags=0）尾插入链表并置信号量，自身等待 `ContinueEvent`；调试器通过 `NtWaitForDebugEvent` 取件事处理，`NtDebugContinue` 设置返回状态并置位 `ContinueEvent`，恢复被调试线程执行。
> - **ThreadHideFromDebugger 反调试：** 设置线程 `CrossThreadFlags.ThreadHideFromDebugger` 位后，`DbgkForwardException` 会将 `DebugPort` 清空，该线程的异常不再交给调试器；可利用 `NtSetInformationThread(0x11)` 实现。

身为一名逆向人员，ida，x64dbg几乎是我们无法离开的工具，这些调试器的背后的原理是什么  
所谓各路五花八门的反调试，调试器检测，无痕hook，线程逃逸又是什么  
接下来的几篇博客，我将带大家深入内核，探究windows内核里的调试体系

## 一个简单的调试器

我们来看一个最简的调试器代码

```c
#include <windows.h>
#include <stdio.h>
int main(int argc, char *argv[]) {
    if (argc < 2) {
        printf("Usage: %s <pid>\n", argv[0]);
        return 1;
    }
    DWORD pid = (DWORD)atoi(argv[1]);
    if (!DebugActiveProcess(pid)) {
        printf("DebugActiveProcess failed: %lu\n", GetLastError());
        return 1;
    }
    printf("Attached to PID %lu\n", pid);
    DEBUG_EVENT de;
    for (;;) {
        WaitForDebugEvent(&de, INFINITE);              /* debugwaitforsignal */
        switch (de.dwDebugEventCode) {
        case EXCEPTION_DEBUG_EVENT:
            printf("[EXCEPTION] addr=%p code=%08lx\n",
                   de.u.Exception.ExceptionRecord.ExceptionAddress,
                   de.u.Exception.ExceptionRecord.ExceptionCode);
            break;
        case EXIT_PROCESS_DEBUG_EVENT:
            printf("[EXIT_PROCESS]\n");
            goto done;
        }
        ContinueDebugEvent(de.dwProcessId, de.dwThreadId, DBG_CONTINUE); /* debugcontinue */
    }
done:
    ContinueDebugEvent(de.dwProcessId, de.dwThreadId, DBG_CONTINUE);
    DebugActiveProcessStop(pid);
    return 0;
}
```

这边就涉及3个重要函数：  
DebugActiveProcess WaitForDebugEvent ContinueDebugEvent  
接下来这些函数就是我的分析重点  
我这里不卖关子，直接告诉你这几个函数的功能

-   DebugActiveProcess  
    激活调试，将调试器与被调试进程关联
-   WaitForDebugEvent  
    等待调试事件
-   ContinueDebugEvent  
    预示着调试器处理完成调试事件，被调试进程继续执行

这里我们不难想到第一个问题，调试器是如何与被调试对象关联的呢？

## 调试对象

当我们执行DebugActiveProcess，就会将创建一个调试对象，他既挂在被调试进程上，也挂在调试器上  
![img1](https://bbs.kanxue.com/upload/attach/202607/1055387_ZGMWB5FZ3SCFRCH.png "img1")  
什么是调试对象？我们直接从wrk里拿定义

```c
#define DEBUG_OBJECT_DELETE_PENDING (0x1) // Debug object is delete pending.
#define DEBUG_OBJECT_KILL_ON_CLOSE  (0x2) // Kill all debugged processes on close

typedef struct _DEBUG_OBJECT {
    //
    // Event thats set when the EventList is populated.
    //
    KEVENT EventsPresent;
    //
    // Mutex to protect the structure
    //
    FAST_MUTEX Mutex;
    //
    // Queue of events waiting for debugger intervention
    //
    LIST_ENTRY EventList;
    //
    // Flags for the object
    //
    ULONG Flags;
} DEBUG_OBJECT, *PDEBUG_OBJECT;
```

EventsPresent就是调试器监听的信号量，当调试事件来临，被调试进程就会给信号量置位，唤起调试器  
EventList就是时一个win内核最喜欢的双向循环链表头，他串联着整个调试事件  
![img2](https://bbs.kanxue.com/upload/attach/202607/1055387_ZUBFZT2JXDSS9GS.png "img2")  
每当发生调试事件，被调试进程就会进行如下操作  
1.检测是否被调试  
2.创建调试事件（DEBUG_EVENT），并且挂入链表  
3.置位调试对象的EventsPresent，调试器会被激活  
4.开始死等ContinueEvent的信号量  
5.收到来自调试器的ContinueEvent信号量，恢复执行，同时reset调试对象的EventsPresent（也有可能不会）

调试器流程:  
1.我用WaitForDebugEvent死等  
2.我的EventsPresent被激活，我检测EventList串起来的一大串链表是否有东西  
3.发现有东西，开始处理，处理完成一个就发送ContinueEvent信号量，然后摘除这个节点  
4.处理到链表为空，reset调试对象的EventsPresent  
5.WaitForDebugEvent继续死等

DEBUG_EVENT定义

```c
#define DEBUG_EVENT_READ            (0x01)  // Event had been seen by win32 app
#define DEBUG_EVENT_NOWAIT          (0x02)  // No waiter one this. Just free the pool
#define DEBUG_EVENT_INACTIVE        (0x04)  // The message is in inactive. It may be activated or deleted later
#define DEBUG_EVENT_RELEASE         (0x08)  // Release rundown protection on this thread
#define DEBUG_EVENT_PROTECT_FAILED  (0x10)  // Rundown protection failed to be acquired on this thread
#define DEBUG_EVENT_SUSPEND         (0x20)  // Resume thread on continue


#define DBGKP_FIELD_FROM_IMAGE_OPTIONAL_HEADER(hdrs,field) \
            ((hdrs)->OptionalHeader.##field)

typedef struct _DEBUG_EVENT {
    LIST_ENTRY EventList;      // Queued to event object through this
    KEVENT ContinueEvent;
    CLIENT_ID ClientId;
    PEPROCESS Process;         // Waiting process
    PETHREAD Thread;           // Waiting thread
    NTSTATUS Status;           // Status of operation
    ULONG Flags;
    PETHREAD BackoutThread;    // Backout key for faked messages
    DBGKM_APIMSG ApiMsg;       // Message being sent
} DEBUG_EVENT, *PDEBUG_EVENT;
```

从图结合定义我们可用看到DEBUG_EVENT和DEBUG_OBJECT都有EventList，像一条链子一样把DEBUG_OBJECT和一堆DEBUG_EVENT串起来  
当然你可能现在云里雾里，我们结合代码分析

## DebugActiveProcess分析

DebugActiveProcess为kernelBase.dll的导出函数，在ida里是

```c
BOOL __stdcall DebugActiveProcess(DWORD dwProcessId)
{
  NTSTATUS v2; // eax
  __int64 v3; // rcx
  HANDLE hProcess; // rax
  HANDLE hProcess_copy; // rbx
  NTSTATUS active; // edi

  v2 = DbgUiConnectToDbg();                     // 创建调试对象并且挂到上面去
  if ( v2 < 0 )
  {
    v3 = (unsigned int)v2;
LABEL_3:
    BaseSetLastNTError(v3);
    return 0;
  }
  hProcess = ProcessIdToHandle(dwProcessId);
  hProcess_copy = hProcess;
  if ( !hProcess )
    return 0;
  active = DbgUiDebugActiveProcess(hProcess);
  if ( active < 0 )
  {
    NtClose(hProcess_copy);
    v3 = (unsigned int)active;
    goto LABEL_3;
  }
  NtClose(hProcess_copy);
  return 1;
}
```

DbgUiConnectToDbg的功能就是初始化调试对象，并且先将调试对象挂到调试器上  
我们来到ntdll

```c
__int64 DbgUiConnectToDbg()
{
  unsigned int v0; // ecx
  OBJECT_ATTRIBUTES ObjectAttributes; // [rsp+20h] [rbp-38h] BYREF

  v0 = 0;
  if ( !NtCurrentTeb()->DbgSsReserved[1] )
  {
    memset(&ObjectAttributes.RootDirectory, 0, 20);
    *(_OWORD *)&ObjectAttributes.SecurityDescriptor = 0;// set ObjectAttributes
    ObjectAttributes.Length = 48;
    return (unsigned int)NtCreateDebugObject(&NtCurrentTeb()->DbgSsReserved[1], 0x1F000Fu, &ObjectAttributes, 1u);
  }
  return v0;
}
```

emmm，很简单的中转一下直接进入内核  
注意看一下&NtCurrentTeb()->DbgSsReserved\[1\]的汇编

```
mov     rcx, gs:30h
add     rcx, 16A8h      ; DebugObjectHandle
```

16A8的偏移应该刻进dna，这就是调试器该被挂入调试对象的地方，放的是个句柄

## NtCreateDebugObject分析

我们来看ntoskrnl

```c
NTSTATUS NtCreateDebugObject(
        PHANDLE DebugObjectHandle,
        ACCESS_MASK DesiredAccess,
        POBJECT_ATTRIBUTES ObjectAttributes,
        ULONG Flags)
{
  char Flags_copy; // si
  KPROCESSOR_MODE PreviousMode; // r10
  __int64 v8; // rcx
  NTSTATUS result; // eax
  PDEBUG_OBJECT pDebugObject_copy; // rbx
  _EWOW64PROCESS *is_wow64; // rax
  unsigned __int16 machine; // ax
  char *v13; // [rsp+20h] [rbp-68h]
  __int64 v14; // [rsp+20h] [rbp-68h]
  PDEBUG_OBJECT pDebug_Object; // [rsp+58h] [rbp-30h] BYREF
  void *handle; // [rsp+60h] [rbp-28h]

  Flags_copy = Flags;
  handle = 0;
  pDebug_Object = 0;
  PreviousMode = KeGetCurrentThread()->PreviousMode;
  if ( PreviousMode )
  {
    v8 = 0x7FFFFFFF0000LL;
    if ( (unsigned __int64)DebugObjectHandle < 0x7FFFFFFF0000LL )
      v8 = (__int64)DebugObjectHandle;
    *(_QWORD *)v8 = *(_QWORD *)v8;
  }
  *DebugObjectHandle = 0;
  if ( (Flags & 0xFFFFFFFE) != 0 )
    return 0xC000000D;                          // STATUS_INVALID_PARAMETER
  result = ObCreateObjectEx(
             PreviousMode,
             DbgkDebugObjectType,               // 创建调试对象
             ObjectAttributes,
             PreviousMode,
             v13,                               // optional
             0x68u,
             0,
             0,
             (PVOID *)&pDebug_Object);
  if ( result >= 0 )
  {
    pDebugObject_copy = pDebug_Object;
    pDebug_Object->Mutex.Count = 1;
    pDebugObject_copy->Mutex.Owner = 0;
    pDebugObject_copy->Mutex.Contention = 0;
    KeInitializeEvent(&pDebugObject_copy->Mutex.Event, SynchronizationEvent, 0);// 同步事件
    pDebugObject_copy->EventList.Blink = &pDebugObject_copy->EventList;
    pDebugObject_copy->EventList.Flink = &pDebugObject_copy->EventList;// 清空链表
    KeInitializeEvent(&pDebugObject_copy->EventsPresent, NotificationEvent, 0);
    if ( (Flags_copy & 1) != 0 )
      pDebugObject_copy->Flags = 2;             // #define DEBUG_OBJECT_KILL_ON_CLOSE  (0x2) // Kill all debugged processes on close
    else
      pDebugObject_copy->Flags = 0;
    is_wow64 = (_EWOW64PROCESS *)KeGetCurrentThread()->ApcState.Process[1].AffinityPadding[10];// 判断是否wow64
    if ( is_wow64 )
    {
      machine = is_wow64->Machine;
      if ( machine == 332 || machine == 452 )
        pDebugObject_copy->Flags |= 4u;
    }
    LODWORD(v14) = 0;
    result = ObInsertObjectEx(pDebug_Object, 0, DesiredAccess, 0, (PVOID *)v14, 0);// ObInsertObjectEx(pDebug_Object, 0, DesiredAccess, 0, (PVOID *)v14, 0,handle);
    if ( result >= 0 )
      *DebugObjectHandle = handle;            // 调试对象挂上去了
  }
  return result;
}
```

代码不难  
主要就是创建调试对象，初始化一下，然后挂上去，注意时先挂调试器  
当然里面的结构体我都是导入的，你们看起来肯定没这么好看，之后我会把我自己用的idb文件放重来供大家学习  
创建好了就要激活

## DbgUiDebugActiveProcess分析

我们来到ntdll

```c
__int64 __fastcall DbgUiDebugActiveProcess(HANDLE hProcess)
{
  int active; // ebx

  active = NtDebugActiveProcess(hProcess, NtCurrentTeb()->DbgSsReserved[1]);
  if ( active >= 0 )
  {
    active = DbgUiIssueRemoteBreakin(hProcess);
    if ( active < 0 )
      ZwRemoveProcessDebug(hProcess, NtCurrentTeb()->DbgSsReserved[1]);
  }
  return (unsigned int)active;
}
```

NtDebugActiveProcess就是将调试对象与被调试进程关联的地方，在ntoskrnl里比较复杂，我们先看DbgUiIssueRemoteBreakin

```c
__int64 __fastcall DbgUiIssueRemoteBreakin(HANDLE hProcess)
{
  int v1; // ebx
  __int64 v3; // [rsp+30h] [rbp-48h]
  __int128 v4; // [rsp+60h] [rbp-18h] BYREF
  HANDLE Handle; // [rsp+88h] [rbp+10h] BYREF

  v1 = RtlpCreateUserThreadEx((__int64)hProcess, 0, 2, 0, 0, 0x4000, v3, (__int64)DbgUiRemoteBreakin, 0, &Handle, &v4);
  if ( v1 >= 0 )
    NtClose(Handle);
  return (unsigned int)v1;
}

void __noreturn DbgUiRemoteBreakin()
{
  if ( (NtCurrentPeb()->BeingDebugged || (MEMORY[0x7FFE02D4] & 2) != 0) && (NtCurrentTeb()->SameTebFlags & 0x20) == 0 )
  {
    if ( UseWOW64 )
    {
      if ( g_LdrpWow64PrepareForDebuggerAttach )
        g_LdrpWow64PrepareForDebuggerAttach();
    }
    DbgBreakPoint();
  }
  RtlExitUserThread(0);
}
```

嗯，很简单，就是创建一个远程线程，然后这个线程有个int3会把程序中断下来  
解释了为什么我们附加会让程序暂停下来  
当然这也是一个反调试点，如果我们让DbgUiRemoteBreakin没有int3，不就断不下来了？

## NtDebugActiveProcess

接下来时最复杂的

```python
active = NtDebugActiveProcess(hProcess, NtCurrentTeb()->DbgSsReserved[1]);
```

NtCurrentTeb()->DbgSsReserved\[1\]依旧16A8  
我们来到ntoskrnl

```c
//hProcess为被调试进程
NTSTATUS __fastcall NtDebugActiveProcess(HANDLE hProcess, HANDLE hDebugObject)
{
  KPROCESSOR_MODE PreviousMode; // bp
  NTSTATUS result; // eax
  __int64 v5; // rcx
  struct _KTHREAD *CurrentThread; // rax
  PEPROCESS pProcess_copy; // rdi
  PEPROCESS Process; // rsi
  int ntstatus; // ebx
  unsigned __int64 v10; // rax
  __int16 v11; // cx
  unsigned __int64 v12; // rax
  __int16 v13; // cx
  BOOLEAN v14; // al
  struct _DEBUG_OBJECT *pDebugObject_copy; // rsi
  NTSTATUS Messages; // eax
  PETHREAD LastThread[5]; // [rsp+40h] [rbp-28h] BYREF
  _EPROCESS *pProcess; // [rsp+80h] [rbp+18h] BYREF
  _DEBUG_OBJECT *pDebugObject; // [rsp+88h] [rbp+20h] BYREF

  pProcess = 0;
  PreviousMode = KeGetCurrentThread()->PreviousMode;
  LastThread[0] = 0;
  result = ObReferenceObjectByHandleWithTag(
             hProcess,
             0x800u,
             (POBJECT_TYPE)PsProcessType,
             PreviousMode,
             'OgbD',
             (PVOID *)&pProcess,
             0);
  if ( result >= 0 )
  {
    CurrentThread = KeGetCurrentThread();
    pProcess_copy = &pProcess->Pcb;
    Process = CurrentThread->ApcState.Process;
    if ( pProcess == (_EPROCESS *)Process || pProcess == (_EPROCESS *)PsInitialSystemProcess )// 这个就是system进程
    {
      ntstatus = 0xC0000022;                    // STATUS_ACCESS_DENIED
    }
    else
    {
      LOBYTE(v5) = PreviousMode;
      if ( (unsigned __int8)PsTestProtectedProcessIncompatibility(v5, CurrentThread->ApcState.Process, pProcess) )
      {
        ntstatus = 0xC0000712;
      }
      else if ( (pProcess_copy->?.SecureHandle & 1) == 0
             || (ntstatus = PsRequestDebugSecureProcess(pProcess_copy), ntstatus >= 0) )
      {
        v10 = Process[1].AffinityPadding[10];
        if ( !v10
          || (v11 = *(_WORD *)(v10 + 8), v11 != 332) && v11 != 452
          || (v12 = pProcess_copy[1].AffinityPadding[10]) != 0
          && ((v13 = *(_WORD *)(v12 + 8), v13 == 332) || v13 == 452) )
        {
          pDebugObject = 0;
          ntstatus = ObReferenceObjectByHandle(
                       hDebugObject,
                       2u,
                       DbgkDebugObjectType,
                       PreviousMode,
                       (PVOID *)&pDebugObject,
                       0);
          if ( ntstatus >= 0 )
          {
            v14 = ExAcquireRundownProtection((PEX_RUNDOWN_REF)&pProcess_copy[1].ProfileListHead.Blink);// 获取rundown保护锁，防止你在我们挂调试对象时退出
            pDebugObject_copy = pDebugObject;
            if ( v14 )
            {
              Messages = DbgkpPostFakeProcessCreateMessages(pProcess_copy, pDebugObject, LastThread);
              ntstatus = DbgkpSetProcessDebugObject(pProcess_copy, pDebugObject_copy, Messages, LastThread[0]);
              ExReleaseRundownProtection((PEX_RUNDOWN_REF)&pProcess_copy[1].ProfileListHead.Blink);
            }
            else
            {
              ntstatus = 0xC000010A;            // STATUS_PROCESS_IS_TERMINATING
            }
            HalPutDmaAdapter((PADAPTER_OBJECT)pDebugObject_copy);
          }
        }
        else
        {
          ntstatus = 0xC00000BB;                //     STATUS_NOT_SUPPORTED
        }
      }
    }
    ObfDereferenceObjectWithTag(pProcess_copy, 'OgbD');
    return ntstatus;
  }
  return result;
}
```

进行了前面一些无关紧要的操作，什么增加引用计数，system和psp保护的进程不让你调试，然后获取目标进程rundown保护锁，最关键两个操作是

```c
Messages = DbgkpPostFakeProcessCreateMessages(pProcess_copy, pDebugObject, LastThread);
ntstatus = DbgkpSetProcessDebugObject(pProcess_copy, pDebugObject_copy, Messages, LastThread[0]);
```

DbgkpPostFakeProcessCreateMessages是发假消息，就是每次你用ida附加，不是底下会刷屏一大堆信息，什么创建了几个线程，加载了什么dll，exe镜像在哪，就是这个发的  
DbgkpSetProcessDebugObject就是将被调试进程也挂上调试对象的函数

## DbgkpPostFakeProcessCreateMessages

```c
// Process -> 被调试进程对象
// 
// 
// NTSTATUS
// DbgkpPostFakeProcessCreateMessages (
//     IN PEPROCESS Process,
//     IN PDEBUG_OBJECT DebugObject,
//     IN PETHREAD *pLastThread
//     )
NTSTATUS DbgkpPostFakeProcessCreateMessages(PEPROCESS Process, PDEBUG_OBJECT DebugObject, PETHREAD *pLastThread)
{
  struct _KTHREAD *v4; // rbx
  NTSTATUS result; // eax
  PETHREAD FirstThread; // [rsp+30h] [rbp-68h] BYREF
  PETHREAD LastThread; // [rsp+38h] [rbp-60h] BYREF
  _KAPC_STATE apc; // [rsp+40h] [rbp-58h] BYREF

  v4 = 0;
  FirstThread = 0;
  memset(&apc, 0, sizeof(apc));
  LastThread = 0;
  result = DbgkpPostFakeThreadMessages(Process, DebugObject, 0, &FirstThread, &LastThread);
  if ( result >= 0 )
  {
    KiStackAttachProcess((ULONG_PTR)Process);
    DbgkpPostModuleMessages(Process, FirstThread, &DebugObject->EventsPresent);
    KiUnstackDetachProcess(&apc, 0);
    ObfDereferenceObjectWithTag(FirstThread, 0x4F676244u);
    result = 0;
    v4 = LastThread;
  }
  *pLastThread = v4;
  return result;
}
```

有发送线程假消息和和模块假消息  
模块假消息不难，发的主要是一些加载了哪些dll啦之类的，但是我们要拿这些信息需要被调试进程的上下文，所以KiStackAttachProcess一下  
DbgkpPostModuleMessages不难，我们重点看DbgkpPostFakeThreadMessages

```c
NTSTATUS DbgkpPostFakeThreadMessages(
        PEPROCESS Process,
        PDEBUG_OBJECT DebugObject,
        PETHREAD StartThread,
        PETHREAD *pFirstThread,
        PETHREAD *pLastThread)
{
  PETHREAD CurrentProcessThread; // rbx
  struct _ETHREAD *FirstThread; // r15
  struct _ETHREAD *LastThread; // rdi
  int status; // r12d
  bool IsFirstThread; // r13
  ULONG flag; // esi 这边的flag都是debug_event的flag
  char IsProcessCreate; // r13
  void *SectionObject; // rcx
  PIMAGE_NT_HEADERS NT_HEADERS; // rax
  bool NotFirstThread; // [rsp+30h] [rbp-1E8h]
  struct _KTHREAD *CurrentThread; // [rsp+68h] [rbp-1B0h]
  DBGKM_APIMSG DbgKM_ApiMSG; // [rsp+90h] [rbp-188h] BYREF 
                             //                            typedef struct _DBGKM_APIMSG {
                             //                                PORT_MESSAGE h;
                             //                                DBGKM_APINUMBER ApiNumber;
                             //                                NTSTATUS ReturnedStatus;
                             //                                union {
                             //                                    DBGKM_EXCEPTION Exception;
                             //                                    DBGKM_CREATE_THREAD CreateThread;
                             //                                    DBGKM_CREATE_PROCESS CreateProcessInfo;
                             //                                    DBGKM_EXIT_THREAD ExitThread;
                             //                                    DBGKM_EXIT_PROCESS ExitProcess;
                             //                                    DBGKM_LOAD_DLL LoadDll;
                             //                                    DBGKM_UNLOAD_DLL UnloadDll;
                             //                                } u;
                             //                            } DBGKM_APIMSG, *PDBGKM_APIMSG;
  struct _KAPC_STATE ApcState; // [rsp+1A0h] [rbp-78h] BYREF

  CurrentProcessThread = StartThread;
  memset(&ApcState, 0, sizeof(ApcState));
  memset(&DbgKM_ApiMSG, 0, 0x110u);
  FirstThread = 0;
  LastThread = 0;
  CurrentThread = KeGetCurrentThread();
  status = 0xC0000001;                          // STATUS_UNSUCCESSFUL
  if ( CurrentProcessThread )
  {
    FirstThread = CurrentProcessThread;
    ObfReferenceObjectWithTag(CurrentProcessThread, 'OgbD');
  }
  else
  {
    CurrentProcessThread = PsGetNextProcessThread(Process, 0);
  }
  IsFirstThread = StartThread == 0;
  NotFirstThread = StartThread == 0;
  while ( CurrentProcessThread )
  {
    if ( LastThread )
      ObfDereferenceObjectWithTag(LastThread, 'OgbD');
    LastThread = CurrentProcessThread;
    ObfReferenceObjectWithTag(CurrentProcessThread, 'OgbD');
    if ( (CurrentProcessThread->Tcb.MiscFlags & 0x400) == 0 )
    {
      if ( (CurrentProcessThread->CrossThreadFlags & 2) != 0
        || (PsSynchronizeWithThreadInsertion(
              (__int64)CurrentProcessThread,
              (__int64)CurrentThread),          // 等待rundown保护锁
            (CurrentProcessThread->CrossThreadFlags & 2) != 0) )
      {
        if ( ExAcquireRundownProtection(&CurrentProcessThread->RundownProtect) )// 
                                                // #define DEBUG_EVENT_READ            (0x01)  // Event had been seen by win32 app
                                                // #define DEBUG_EVENT_NOWAIT          (0x02)  // No waiter one this. Just free the pool
                                                // #define DEBUG_EVENT_INACTIVE        (0x04)  // The message is in inactive. It may be activated or deleted later
                                                // #define DEBUG_EVENT_RELEASE         (0x08)  // Release rundown protection on this thread
                                                // #define DEBUG_EVENT_PROTECT_FAILED  (0x10)  // Rundown protection failed to be acquired on this thread
                                                // #define DEBUG_EVENT_SUSPEND         (0x20)  // Resume thread on continue
        {
          flag = 0xA;                           // A = 2+8
                                                // DEBUG_EVENT_NOWAIT
                                                // DEBUG_EVENT_RELEASE
          if ( (int)PsSuspendThread(CurrentProcessThread, 0) >= 0 )
            flag = 0x2A;                        // 多并一个DEBUG_EVENT_SUSPEND 
        }
        else
        {
          flag = 0x12;
        }
        memset(&DbgKM_ApiMSG, 0, 0x110u);
        if ( !IsFirstThread || (flag & 0x10) != 0 )
        {
          IsProcessCreate = 0;
          DbgKM_ApiMSG.ApiNumber = DbgKmCreateThreadApi;
          DbgKM_ApiMSG.u.CreateProcessInfo.FileHandle = CurrentProcessThread->Win32StartAddress;
        }
        else                                    // 发送进程创建假消息
        {
          IsProcessCreate = 1;
          DbgKM_ApiMSG.ApiNumber = DbgKmCreateProcessApi;
          SectionObject = Process->SectionObject;
          if ( SectionObject )
            DbgKM_ApiMSG.u.CreateProcessInfo.FileHandle = DbgkpSectionToFileHandle(SectionObject);
          else
            DbgKM_ApiMSG.u.CreateProcessInfo.FileHandle = 0;
          DbgKM_ApiMSG.u.CreateProcessInfo.BaseOfImage = Process->SectionBaseAddress;// exe基址
          KeStackAttachProcess(&Process->Pcb, &ApcState);
          NT_HEADERS = RtlImageNtHeader(Process->SectionBaseAddress);
          if ( NT_HEADERS )
          {
            DbgKM_ApiMSG.u.Exception.ExceptionRecord.ExceptionInformation[1] = 0;
            *(_QWORD *)&DbgKM_ApiMSG.u.CreateProcessInfo.DebugInfoFileOffset = *(_QWORD *)&NT_HEADERS->FileHeader.PointerToSymbolTable;// 拿pdb
          }
          KeUnstackDetachProcess(&ApcState);
        }
        status = DbgkpQueueMessage(Process, CurrentProcessThread, &DbgKM_ApiMSG, flag, DebugObject);// 将DBGKM_APIMSG转成DEBUG_EVENT并插入DEBUG_OBJECT的链表
        if ( status < 0 )
        {                                       // 发生错误，清理并跳出循环
          if ( (flag & 0x20) != 0 )
            PsResumeThread(CurrentProcessThread, 0);
          if ( (flag & 8) != 0 )
            ExReleaseRundownProtection(&CurrentProcessThread->RundownProtect);
          if ( DbgKM_ApiMSG.ApiNumber == DbgKmCreateProcessApi
            && DbgKM_ApiMSG.u.Exception.ExceptionRecord.ExceptionRecord )
          {
            ObCloseHandle(DbgKM_ApiMSG.u.Exception.ExceptionRecord.ExceptionRecord, 0);
          }
          PsQuitNextProcessThread(CurrentProcessThread);
          break;
        }
        if ( IsProcessCreate )
        {
          IsFirstThread = 0;
          NotFirstThread = 0;
          ObfReferenceObjectWithTag(CurrentProcessThread, 'OgbD');
          FirstThread = CurrentProcessThread;
          DbgkSendSystemDllMessages((char *)CurrentProcessThread, &DebugObject->EventsPresent, &DbgKM_ApiMSG);
        }
        else
        {
          IsFirstThread = NotFirstThread;
        }
      }
    }
    CurrentProcessThread = PsGetNextProcessThread(Process, CurrentProcessThread);
  }
  if ( status >= 0 )
  {
    if ( FirstThread )
    {
      *pFirstThread = FirstThread;
      *pLastThread = LastThread;
    }
    else
    {
      if ( LastThread )
        ObfDereferenceObjectWithTag(LastThread, 'OgbD');
      return 0xC0000001;
    }
  }
  else
  {
    if ( FirstThread )
      ObfDereferenceObjectWithTag(FirstThread, 'OgbD');
    if ( LastThread )
      ObfDereferenceObjectWithTag(LastThread, 'OgbD');
  }
  return status;
}
```

首先我们看到多了一个结构体也就是DBGKM_APIMSG，这个是debugevent的成员，记录着关键的调试信息  
我们可用看到有个大循环，一开始传进来的StartThread是0  
然后一直PsGetNextProcessThread，得到每一个线程的一些关键信息，并且填入DBGKM_APIMSG  
最后调用最关键的函数DbgkpQueueMessage  
![img3](https://bbs.kanxue.com/upload/attach/202607/1055387_UC6XVQZ9ZGK32RK.png "img3")  
我们可用看到交叉应用，他被很多关键函数调用，比如DbgkpSendApiMessage，这就是异常啦之类的发送调试事件必须用到的函数  
这个函数的作用就是，创建一个调试事件，然后把收到的DBGKM_APIMSG写道调试事件的ApiMsg成员里，最后挂入调试对象的双向循环链表里，然后置位调试器信号量，激活调试器

```c
NTSTATUS DbgkpQueueMessage(
        PEPROCESS Process,
        PETHREAD Thread,
        PDBGKM_APIMSG ApiMsg,
        ULONG Flags,
        PDEBUG_OBJECT TargetDebugObject)
{
  __int64 v10; // r12
  DEBUG_EVENT *alloc_debug_event; // rax
  DEBUG_EVENT *p_debug_event; // r14
  DBGKM_APINUMBER ApiNumber; // ecx
  DBGKM_APIMSG *p_ApiMsg; // rbx
  DBGKM_APIMSG *ApiMsg_From_Debug_Event; // rax
  PDBGKM_APIMSG In_ApiMsg; // rcx
  __int64 v18; // rdx
  __int128 v19; // xmm1
  NTSTATUS Status; // esi
  struct _FAST_MUTEX *p_Mutex; // r12
  struct _LIST_ENTRY *Blink; // rcx
  __int128 v23; // xmm1
  ULONG is_no_wait; // [rsp+30h] [rbp-1C8h]
  DEBUG_EVENT debug_event; // [rsp+40h] [rbp-1B8h] BYREF
                                                //                                                 #define DEBUG_EVENT_READ            (0x01)  // Event had been seen by win32 app
                                                //                                                 #define DEBUG_EVENT_NOWAIT          (0x02)  // No waiter one this. Just free the pool
                                                //                                                 #define DEBUG_EVENT_INACTIVE        (0x04)  // The message is in inactive. It may be activated or deleted later
                                                //                                                 #define DEBUG_EVENT_RELEASE         (0x08)  // Release rundown protection on this thread
                                                //                                                 #define DEBUG_EVENT_PROTECT_FAILED  (0x10)  // Rundown protection failed to be acquired on this thread
                                                //                                                 #define DEBUG_EVENT_SUSPEND         (0x20)  // Resume thread on continue
                                                //                                                 
                                                //                                              
  memset(
    &debug_event,
    0,
    0x168u);
  v10 = 2;
  is_no_wait = Flags & 2;
  if ( (Flags & 2) == 0 )                       // 需等待事件
  {
    debug_event.Flags = Flags;
    p_debug_event = &debug_event;
    ExAcquireFastMutex(&DbgkpProcessDebugPortMutex);
    ApiNumber = ApiMsg->ApiNumber;
    TargetDebugObject = (PDEBUG_OBJECT)Process->DebugPort;// 需等待事件必须有debug port
    if ( (unsigned int)(ApiNumber - 1) <= 1 && (Thread->CrossThreadFlags & 0x40) != 0 )
      TargetDebugObject = 0;
    if ( ApiNumber == DbgKmLoadDllApi )
    {
      if ( ((unsigned __int8)Flags & Thread->CrossThreadFlags & 0x40) == 0 )
      {
LABEL_14:
        KeInitializeEvent(&debug_event.ContinueEvent, SynchronizationEvent, 0);
        goto LABEL_15;
      }
      TargetDebugObject = 0;
    }
    if ( (unsigned int)(ApiNumber - 3) <= 1 && SLOBYTE(Thread->CrossThreadFlags) < 0 )
      TargetDebugObject = 0;
    goto LABEL_14;
  }
  alloc_debug_event = (DEBUG_EVENT *)ExAllocatePoolWithQuotaTag((POOL_TYPE)520, 0x168u, 'EgbD');
  p_debug_event = alloc_debug_event;
  if ( !alloc_debug_event )
    return 0xC000009A;                          // STATUS_INSUFFICIENT_RESOURCES
  alloc_debug_event->Flags = Flags | 4;
  ObfReferenceObjectWithTag(Process, 0x4F676244u);
  ObfReferenceObjectWithTag(Thread, 0x4F676244u);
  p_debug_event->BackoutThread = (PETHREAD)KeGetCurrentThread();
LABEL_15:
  p_ApiMsg = &p_debug_event->ApiMsg;
  p_debug_event->Process = Process;
  ApiMsg_From_Debug_Event = &p_debug_event->ApiMsg;
  p_debug_event->Thread = Thread;
  In_ApiMsg = ApiMsg;
  v18 = 2;
  do                                            // 复制
  {
    *(_OWORD *)&ApiMsg_From_Debug_Event->h.u1.s1.DataLength = *(_OWORD *)&In_ApiMsg->h.u1.s1.DataLength;
    *(union _PORT_MESSAGE::$BD8137A324A8476723CC573F97133CB1 *)((char *)&ApiMsg_From_Debug_Event->h.8 + 8) = *(union _PORT_MESSAGE::$BD8137A324A8476723CC573F97133CB1 *)((char *)&In_ApiMsg->h.8 + 8);
    *(_OWORD *)&ApiMsg_From_Debug_Event->h.ClientViewSize = *(_OWORD *)&In_ApiMsg->h.ClientViewSize;
    *(_OWORD *)&ApiMsg_From_Debug_Event->u.Exception.ExceptionRecord.ExceptionCode = *(_OWORD *)&In_ApiMsg->u.Exception.ExceptionRecord.ExceptionCode;
    *((_OWORD *)&ApiMsg_From_Debug_Event->u.UnloadDll + 1) = *((_OWORD *)&In_ApiMsg->u.UnloadDll + 1);
    *((_OWORD *)&ApiMsg_From_Debug_Event->u.UnloadDll + 2) = *((_OWORD *)&In_ApiMsg->u.UnloadDll + 2);
    *((_OWORD *)&ApiMsg_From_Debug_Event->u.UnloadDll + 3) = *((_OWORD *)&In_ApiMsg->u.UnloadDll + 3);
    ApiMsg_From_Debug_Event = (DBGKM_APIMSG *)((char *)ApiMsg_From_Debug_Event + 128);
    v19 = *((_OWORD *)&In_ApiMsg->u.UnloadDll + 4);
    In_ApiMsg = (PDBGKM_APIMSG)((char *)In_ApiMsg + 128);
    *((_OWORD *)&ApiMsg_From_Debug_Event[-1].u.UnloadDll + 9) = v19;
    --v18;
  }
  while ( v18 );
  *(_OWORD *)&ApiMsg_From_Debug_Event->h.u1.s1.DataLength = *(_OWORD *)&In_ApiMsg->h.u1.s1.DataLength;
  p_debug_event->ClientId = Thread->Cid;
  if ( TargetDebugObject )
  {
    p_Mutex = &TargetDebugObject->Mutex;
    ExAcquireFastMutex(&TargetDebugObject->Mutex);
    if ( (TargetDebugObject->Flags & 1) != 0 )
    {
      Status = 0xC0000354;
    }
    else
    {
      Blink = TargetDebugObject->EventList.Blink;
      if ( Blink->Flink != &TargetDebugObject->EventList )
        __fastfail(3u);                         // 检查完整性
      p_debug_event->EventList.Flink = &TargetDebugObject->EventList;
      p_debug_event->EventList.Blink = Blink;
      Blink->Flink = &p_debug_event->EventList; // 尾插法
      TargetDebugObject->EventList.Blink = &p_debug_event->EventList;
      if ( !is_no_wait )                        // 需等待，假消息不走这
        KeSetEvent(&TargetDebugObject->EventsPresent, 0, 0);
      Status = 0;
    }
    KeReleaseGuardedMutex(p_Mutex);
    v10 = 2;
  }
  else
  {
    Status = 0xC0000353;                        // STATUS_PORT_NOT_SET
  }
  if ( is_no_wait )
  {
    if ( Status < 0 )
    {
      ObfDereferenceObjectWithTag(Process, 0x4F676244u);
      ObfDereferenceObjectWithTag(Thread, 0x4F676244u);
      ExFreePoolWithTag(p_debug_event, 0);
    }
  }
  else
  {
    KeReleaseGuardedMutex(&DbgkpProcessDebugPortMutex);
    if ( Status >= 0 )
    {
      KeWaitForSingleObject(&p_debug_event->ContinueEvent, Executive, 0, 0, 0);
      Status = p_debug_event->Status;
      do
      {
        *(_OWORD *)&ApiMsg->h.u1.s1.DataLength = *(_OWORD *)&p_ApiMsg->h.u1.s1.DataLength;
        *(union _PORT_MESSAGE::$BD8137A324A8476723CC573F97133CB1 *)((char *)&ApiMsg->h.8 + 8) = *(union _PORT_MESSAGE::$BD8137A324A8476723CC573F97133CB1 *)((char *)&p_ApiMsg->h.8 + 8);
        *(_OWORD *)&ApiMsg->h.ClientViewSize = *(_OWORD *)&p_ApiMsg->h.ClientViewSize;
        *(_OWORD *)&ApiMsg->u.Exception.ExceptionRecord.ExceptionCode = *(_OWORD *)&p_ApiMsg->u.Exception.ExceptionRecord.ExceptionCode;
        *((_OWORD *)&ApiMsg->u.UnloadDll + 1) = *((_OWORD *)&p_ApiMsg->u.UnloadDll + 1);
        *((_OWORD *)&ApiMsg->u.UnloadDll + 2) = *((_OWORD *)&p_ApiMsg->u.UnloadDll + 2);
        *((_OWORD *)&ApiMsg->u.UnloadDll + 3) = *((_OWORD *)&p_ApiMsg->u.UnloadDll + 3);
        ApiMsg = (PDBGKM_APIMSG)((char *)ApiMsg + 128);
        v23 = *((_OWORD *)&p_ApiMsg->u.UnloadDll + 4);
        p_ApiMsg = (DBGKM_APIMSG *)((char *)p_ApiMsg + 128);
        *((_OWORD *)&ApiMsg[-1].u.UnloadDll + 9) = v23;
        --v10;
      }
      while ( v10 );
      *(_OWORD *)&ApiMsg->h.u1.s1.DataLength = *(_OWORD *)&p_ApiMsg->h.u1.s1.DataLength;
    }
  }
  return Status;
}
```

当然他的功能很多，我们发假消息用的flag是

```python
                                                // #define DEBUG_EVENT_READ            (0x01)  // Event had been seen by win32 app
                                                // #define DEBUG_EVENT_NOWAIT          (0x02)  // No waiter one this. Just free the pool
                                                // #define DEBUG_EVENT_INACTIVE        (0x04)  // The message is in inactive. It may be activated or deleted later
                                                // #define DEBUG_EVENT_RELEASE         (0x08)  // Release rundown protection on this thread
                                                // #define DEBUG_EVENT_PROTECT_FAILED  (0x10)  // Rundown protection failed to be acquired on this thread
                                                // #define DEBUG_EVENT_SUSPEND         (0x20)  // Resume thread on continue
          flag = 0xA;                           // A = 2+8
                                                // DEBUG_EVENT_NOWAIT
                                                // DEBUG_EVENT_RELEASE
```

也就是走的NOWAIT这条路，只会干复制apimsg并且挂到循环链表上面去的活

```c
  p_ApiMsg = &p_debug_event->ApiMsg;
  p_debug_event->Process = Process;
  ApiMsg_From_Debug_Event = &p_debug_event->ApiMsg;
  p_debug_event->Thread = Thread;
  In_ApiMsg = ApiMsg;
  v18 = 2;
  do                                            // 复制
  {
    *(_OWORD *)&ApiMsg_From_Debug_Event->h.u1.s1.DataLength = *(_OWORD *)&In_ApiMsg->h.u1.s1.DataLength;
    *(union _PORT_MESSAGE::$BD8137A324A8476723CC573F97133CB1 *)((char *)&ApiMsg_From_Debug_Event->h.8 + 8) = *(union _PORT_MESSAGE::$BD8137A324A8476723CC573F97133CB1 *)((char *)&In_ApiMsg->h.8 + 8);
    *(_OWORD *)&ApiMsg_From_Debug_Event->h.ClientViewSize = *(_OWORD *)&In_ApiMsg->h.ClientViewSize;
    *(_OWORD *)&ApiMsg_From_Debug_Event->u.Exception.ExceptionRecord.ExceptionCode = *(_OWORD *)&In_ApiMsg->u.Exception.ExceptionRecord.ExceptionCode;
    *((_OWORD *)&ApiMsg_From_Debug_Event->u.UnloadDll + 1) = *((_OWORD *)&In_ApiMsg->u.UnloadDll + 1);
    *((_OWORD *)&ApiMsg_From_Debug_Event->u.UnloadDll + 2) = *((_OWORD *)&In_ApiMsg->u.UnloadDll + 2);
    *((_OWORD *)&ApiMsg_From_Debug_Event->u.UnloadDll + 3) = *((_OWORD *)&In_ApiMsg->u.UnloadDll + 3);
    ApiMsg_From_Debug_Event = (DBGKM_APIMSG *)((char *)ApiMsg_From_Debug_Event + 128);
    v19 = *((_OWORD *)&In_ApiMsg->u.UnloadDll + 4);
    In_ApiMsg = (PDBGKM_APIMSG)((char *)In_ApiMsg + 128);
    *((_OWORD *)&ApiMsg_From_Debug_Event[-1].u.UnloadDll + 9) = v19;

   ...
                                                  // 挂循环链表上去
    else
    {
      Blink = TargetDebugObject->EventList.Blink;
      if ( Blink->Flink != &TargetDebugObject->EventList )
        __fastfail(3u);                         // 检查完整性
      p_debug_event->EventList.Flink = &TargetDebugObject->EventList;
      p_debug_event->EventList.Blink = Blink;
      Blink->Flink = &p_debug_event->EventList; // 尾插法
      TargetDebugObject->EventList.Blink = &p_debug_event->EventList;
      if ( !is_no_wait )                        // 需等待，假消息不走这
        KeSetEvent(&TargetDebugObject->EventsPresent, 0, 0);
      Status = 0;
    }
    KeReleaseGuardedMutex(p_Mutex);
```

最后DbgkpPostFakeThreadMessages还会传出处理后的最后一个线程,接下来有用

```python
      *pFirstThread = FirstThread;
      *pLastThread = LastThread;
```

## DbgkpSetProcessDebugObject

show code

```c
NTSTATUS DbgkpSetProcessDebugObject(
        PEPROCESS Process,
        PDEBUG_OBJECT DebugObject,
        NTSTATUS MsgStatus,
        PETHREAD LastThread)
{
  struct _ETHREAD *CurrentThread; // r13
  int v5; // edi
  PETHREAD pLastThread_copy; // rbx
  struct _ETHREAD *NextProcessThread; // r14
  struct _LIST_ENTRY *Entry; // r14
  PDEBUG_EVENT DebugEvent; // rbx
  ULONG Flags; // eax
  PETHREAD Thread; // r13
  struct _LIST_ENTRY *Flink; // rcx
  struct _LIST_ENTRY *v15; // rax
  struct _LIST_ENTRY *Blink; // rax
  struct _LIST_ENTRY *p_EventList; // rax
  ULONG v18; // eax
  PVOID v19; // rcx
  __int64 v20; // rax
  PVOID Object; // [rsp+30h] [rbp-30h] BYREF
  struct _ETHREAD *v23; // [rsp+38h] [rbp-28h]
  PKGUARDED_MUTEX Mutex; // [rsp+40h] [rbp-20h]
  PVOID clear_link; // [rsp+48h] [rbp-18h] BYREF
  PDEBUG_EVENT p_clear_link; // [rsp+50h] [rbp-10h]
  bool first; // [rsp+A8h] [rbp+48h]
  char v28; // [rsp+B0h] [rbp+50h]
  PETHREAD pLastThread; // [rsp+B8h] [rbp+58h] BYREF

  pLastThread = LastThread;
  CurrentThread = (struct _ETHREAD *)KeGetCurrentThread();
  Object = 0;
  p_clear_link = (PDEBUG_EVENT)&clear_link;
  clear_link = &clear_link;
  v5 = MsgStatus;
  v23 = CurrentThread;
  first = 1;
  v28 = 0;
  if ( MsgStatus >= 0 )
  {
    pLastThread_copy = pLastThread;
    v5 = 0;
  }
  else
  {
    pLastThread_copy = 0;
    pLastThread = 0;
  }
  if ( v5 >= 0 )
  {
    ExAcquireFastMutex(&DbgkpProcessDebugPortMutex);
    while ( 1 )
    {
      if ( Process->DebugPort )
      {
        v5 = 0xC0000048;                        //     STATUS_PORT_ALREADY_SET
        v28 = 1;
        goto LABEL_11;
      }
      Process->DebugPort = DebugObject;         // 设置被调试进程debugport
      ObfReferenceObjectWithTag(pLastThread_copy, 'OgbD');
      v28 = 1;
      NextProcessThread = PsGetNextProcessThread(Process, pLastThread_copy);
      if ( !NextProcessThread )
        goto LABEL_11;
      Process->DebugPort = 0;                   // 说明又创建了一个线程，再去发假消息
      KeReleaseGuardedMutex(&DbgkpProcessDebugPortMutex);
      v28 = 0;
      ObfDereferenceObjectWithTag(pLastThread_copy, 'OgbD');
      v5 = DbgkpPostFakeThreadMessages(Process, DebugObject, NextProcessThread, (PETHREAD *)&Object, &pLastThread);
      if ( v5 < 0 )
        break;
      ObfDereferenceObjectWithTag(Object, 0x4F676244u);
      ExAcquireFastMutex(&DbgkpProcessDebugPortMutex);
      pLastThread_copy = pLastThread;
    }
    pLastThread_copy = 0;
    pLastThread = 0;
  }
LABEL_11:
  Mutex = &DebugObject->Mutex;
  ExAcquireFastMutex(&DebugObject->Mutex);
  if ( v5 >= 0 )
  {
    if ( (DebugObject->Flags & 1) != 0 )        // 
                                                // #define DEBUG_OBJECT_DELETE_PENDING (0x1) // Debug object is delete pending.
                                                // #define DEBUG_OBJECT_KILL_ON_CLOSE  (0x2) // Kill all debugged processes on close
    {
      Process->DebugPort = 0;
      v5 = 0xC0000354;                          //     STATUS_DEBUGGER_INACTIVE
    }
    else
    {
      _InterlockedOr((volatile signed __int32 *)&Process->___u6, 3u);
      ObfReferenceObject(DebugObject);
      pLastThread_copy = pLastThread;
    }
  }
  Entry = DebugObject->EventList.Flink;
  if ( Entry == &DebugObject->EventList )       // 空链表
    goto empty_link;
  do
  {
    DebugEvent = (PDEBUG_EVENT)Entry;
    Entry = Entry->Flink;
    Flags = DebugEvent->Flags;
    if ( (Flags & 4) == 0 || DebugEvent->BackoutThread != CurrentThread )
      continue;
    Thread = DebugEvent->Thread;
    if ( v5 < 0 )
    {
      if ( (PDEBUG_EVENT)Entry->Blink != DebugEvent
        || (Blink = DebugEvent->EventList.Blink, (PDEBUG_EVENT)Blink->Flink != DebugEvent) )// 链表完整性判断
      {
check_fail:
        __fastfail(3u);
      }
      Blink->Flink = Entry;
      Entry->Blink = Blink;
      goto LABEL_30;
    }
    if ( (Flags & 0x10) != 0 )
    {
      _InterlockedOr((volatile signed __int32 *)&Thread->___u21, 0x80u);
      Flink = DebugEvent->EventList.Flink;
      if ( (PDEBUG_EVENT)DebugEvent->EventList.Flink->Blink != DebugEvent )
        goto check_fail;
      v15 = DebugEvent->EventList.Blink;
      if ( (PDEBUG_EVENT)v15->Flink != DebugEvent )
        goto check_fail;
      v15->Flink = Flink;
      Flink->Blink = v15;
LABEL_30:
      p_EventList = &p_clear_link->EventList;
      if ( (PVOID *)p_clear_link->EventList.Flink != &clear_link )
        goto check_fail;
      DebugEvent->EventList.Flink = (struct _LIST_ENTRY *)&clear_link;
      DebugEvent->EventList.Blink = p_EventList;
      p_EventList->Flink = &DebugEvent->EventList;
      p_clear_link = DebugEvent;
      goto LABEL_32;
    }
    if ( first )
    {
      DebugEvent->Flags = Flags & 0xFFFFFFFB;
      KeSetEvent(&DebugObject->EventsPresent, 0, 0);// 激活调试器
      first = 0;
    }
    DebugEvent->BackoutThread = 0;
    _InterlockedOr((volatile signed __int32 *)&Thread->___u21, 0x40u);
LABEL_32:
    v18 = DebugEvent->Flags;
    if ( (v18 & 8) != 0 )
    {
      DebugEvent->Flags = v18 & 0xFFFFFFF7;
      ExReleaseRundownProtection(&Thread->RundownProtect);
    }
    CurrentThread = v23;
  }
  while ( Entry != &DebugObject->EventList );
  pLastThread_copy = pLastThread;
empty_link:
  KeReleaseGuardedMutex(Mutex);
  if ( v28 )
    KeReleaseGuardedMutex(&DbgkpProcessDebugPortMutex);
  if ( pLastThread_copy )
    ObfDereferenceObjectWithTag(pLastThread_copy, 0x4F676244u);
  while ( 1 )
  {
    v19 = clear_link;
    if ( clear_link == &clear_link )
      break;
    if ( *((PVOID **)clear_link + 1) != &clear_link )
      goto check_fail;
    v20 = *(_QWORD *)clear_link;
    if ( *(PVOID *)(*(_QWORD *)clear_link + 8LL) != clear_link )
      goto check_fail;
    clear_link = *(PVOID *)clear_link;
    *(_QWORD *)(v20 + 8) = &clear_link;
    DbgkpWakeTarget(v19);
  }
  if ( v5 >= 0 )
    DbgkpMarkProcessPeb((ULONG_PTR)Process);
  return v5;
}
```

注意看  
我们传入的LastThread，他又拿去PsGetNextProcessThread，如果拿到了，那说明这期间你又偷偷创建线程了，拿去重新发假消息

```c
NextProcessThread = PsGetNextProcessThread(Process, pLastThread_copy);
if ( !NextProcessThread )
    goto LABEL_11;
Process->DebugPort = 0;                   // 说明又创建了一个线程，再去发假消息
KeReleaseGuardedMutex(&DbgkpProcessDebugPortMutex);
v28 = 0;
ObfDereferenceObjectWithTag(pLastThread_copy, 'OgbD');
v5 = DbgkpPostFakeThreadMessages(Process, DebugObject, NextProcessThread, (PETHREAD *)&Object, &pLastThread);
if ( v5 < 0 )
break;
ObfDereferenceObjectWithTag(Object, 0x4F676244u);
ExAcquireFastMutex(&DbgkpProcessDebugPortMutex);
pLastThread_copy = pLastThread;
```

终于在这一步，我们将调试对象与被调试进程关联了

```c
      Process->DebugPort = DebugObject;         // 设置被调试进程debugport
```

经过一些杂七杂八的检查，比如检查链表完整性  
然后就会激活调试器,让他去收那些假消息

```c
KeSetEvent(&DebugObject->EventsPresent, 0, 0);// 激活调试器
```

然后轮询链表，摘下那些没用的，已读的事件，放入clear_link，让DbgkpWakeTarget处理

```c
void DbgkpWakeTarget(PDEBUG_EVENT DebugEvent)
{
  ULONG Flags; // eax
  PETHREAD Thread; // rdi

  Flags = DebugEvent->Flags;
  Thread = DebugEvent->Thread;
  if ( (Flags & 0x20) != 0 )
  {
    PsResumeThread(DebugEvent->Thread, 0);
    Flags = DebugEvent->Flags;
  }
  if ( (Flags & 8) != 0 )
  {
    ExReleaseRundownProtection(&Thread->RundownProtect);
    Flags = DebugEvent->Flags;
  }
  if ( (Flags & 2) != 0 )
    DbgkpFreeDebugEvent(DebugEvent);
  else
    KeSetEvent(&DebugEvent->ContinueEvent, 0, 0);
}
```

我们来看WaitForDebugEvent和ContinueDebugEvent

## WaitForDebugEvent

```c
BOOL __stdcall WaitForDebugEvent(LPDEBUG_EVENT lpDebugEvent, DWORD dwMilliseconds)
{
  return WaitForDebugEventWorker(lpDebugEvent);
}


// r3的DEBUG_EVENT
// 
// typedef struct _DEBUG_EVENT {
//     DWORD dwDebugEventCode;  // 调试事件类型
//     DWORD dwProcessId;       // 发生事件的进程ID
//     DWORD dwThreadId;        // 发生事件的线程ID
//     union {
//         EXCEPTION_DEBUG_INFO Exception;
//         CREATE_THREAD_DEBUG_INFO CreateThread;
//         CREATE_PROCESS_DEBUG_INFO CreateProcessInfo;
//         EXIT_THREAD_DEBUG_INFO ExitThread;
//         EXIT_PROCESS_DEBUG_INFO ExitProcess;
//         LOAD_DLL_DEBUG_INFO LoadDll;
//         UNLOAD_DLL_DEBUG_INFO UnloadDll;
//         OUTPUT_DEBUG_STRING_INFO DebugString;
//         RIP_INFO RipInfo;
//     } u;
// } DEBUG_EVENT, *LPDEBUG_EVENT;
// 
__int64 __fastcall WaitForDebugEventWorker(LPDEBUG_EVENT DebugEvent, DWORD WaitTime, char ZeroBit)
{
  union _LARGE_INTEGER *time; // rsi
  NTSTATUS status; // eax
  DWORD dwDebugEventCode; // eax
  _BYTE *i; // rcx
  HANDLE hThread; // r8
  _BYTE WaitTime_1[16]; // [rsp+20h] [rbp-E8h] BYREF
  struct _DBGUI_WAIT_STATE_CHANGE DbgUiWaitStateCange; // [rsp+30h] [rbp-D8h] BYREF

  time = (union _LARGE_INTEGER *)BaseFormatTimeOut(WaitTime_1);
  do
  {
    do
      status = DbgUiWaitStateChange(&DbgUiWaitStateCange, time);
    while ( status == 0x101 );                  // 00000101    STATUS_ALERTED
  }
  while ( status == 0xC0 );                     // 000000C0    STATUS_USER_APC
  if ( status < 0 )
    goto Failed;
  if ( status == 0x102 )                        // 00000102    STATUS_TIMEOUT
  {
    RtlSetLastWin32Error(0x79u);
    return 0;
  }
  status = ZeroBit
         ? DbgUiConvertStateChangeStructureEx(&DbgUiWaitStateCange, DebugEvent)
         : DbgUiConvertStateChangeStructure(&DbgUiWaitStateCange, DebugEvent);
  if ( status < 0 )
  {
Failed:
    BaseSetLastNTError((unsigned int)status);
    return 0;
  }
  dwDebugEventCode = DebugEvent->dwDebugEventCode;
  if ( DebugEvent->dwDebugEventCode != 1 )
  {
    if ( dwDebugEventCode == 2 )
    {
      hThread = DebugEvent->u.CreateThread.hThread;
    }
    else
    {
      if ( dwDebugEventCode != 3 )
      {
        if ( dwDebugEventCode == 4 )
        {
          MarkThreadHandle(DebugEvent->dwThreadId);
        }
        else if ( dwDebugEventCode == 5 )
        {
          MarkThreadHandle(DebugEvent->dwThreadId);
          for ( i = NtCurrentTeb()->DbgSsReserved[0]; i; i = *(_BYTE **)i )
          {
            if ( *((_DWORD *)i + 6) == DebugEvent->dwProcessId && !*((_DWORD *)i + 7) )
            {
              i[32] = 1;
              return 1;
            }
          }
        }
        else if ( dwDebugEventCode != 6 && dwDebugEventCode != 7 && (dwDebugEventCode <= 7 || dwDebugEventCode > 9) )
        {
          return 0;
        }
        return 1;
      }
      SaveProcessHandle(DebugEvent->dwProcessId, DebugEvent->u.Exception.ExceptionRecord.ExceptionRecord);
      hThread = DebugEvent->u.Exception.ExceptionRecord.ExceptionAddress;
    }
    SaveThreadHandle(DebugEvent->dwProcessId, DebugEvent->dwThreadId, hThread);
  }
  return 1;
}
```

我们回忆一下r3也有一个debugevent，两个是不一样的，你总不能和r0一样一堆r0的地址吧  
代码不难，关键点是

```c
status = DbgUiWaitStateChange(&DbgUiWaitStateCange, time);
...
DbgUiConvertStateChangeStructureEx(&DbgUiWaitStateCange, DebugEvent)
```

死等，然后拿到了个DbgUiWaitStateCange，然后转换为r3的DebugEvent，最后返回

```c
__int64 __fastcall DbgUiWaitStateChange(__int64 a1, __int64 a2)
{
  __int64 v2; // r8

  v2 = a2;
  LOBYTE(a2) = 1;
  return ZwWaitForDebugEvent(NtCurrentTeb()->DbgSsReserved[1], a2, v2, a1);
}

// from ntoskrnl
NTSTATUS NtWaitForDebugEvent(
        HANDLE DebugObjectHandle,
        BOOLEAN Alertable,
        PLARGE_INTEGER Timeout,
        PDBGUI_WAIT_STATE_CHANGE WaitStateChange)
{
  char is_got_event; // r14
  KPROCESSOR_MODE IsPreviousMode; // r15
  __int64 v9; // rcx
  NTSTATUS status; // eax
  BOOLEAN v11; // r9
  PDEBUG_OBJECT DebugObject; // rdi
  struct _DEBUG_EVENT *p_EventListHead; // rdx
  PDEBUG_EVENT entry; // rax
  PDEBUG_EVENT debug_event; // rbx
  ULONG Flags; // r8d
  PDEBUG_EVENT Flink; // rcx
  int status1; // ebx
  bool v19; // sf
  unsigned __int64 *v20; // rsi
  LONGLONG QuadPart; // [rsp+38h] [rbp-150h] BYREF
  PLARGE_INTEGER Timeouta; // [rsp+40h] [rbp-148h]
  PVOID Object; // [rsp+48h] [rbp-140h] BYREF
  __int64 v25; // [rsp+50h] [rbp-138h]
  PVOID Process; // [rsp+58h] [rbp-130h]
  PVOID Thread; // [rsp+60h] [rbp-128h]
  _OWORD v28[12]; // [rsp+80h] [rbp-108h] BYREF

  Timeouta = Timeout;
  is_got_event = 0;
  QuadPart = 0;
  v25 = 0;
  IsPreviousMode = KeGetCurrentThread()->PreviousMode;
  memset(v28, 0, 0xB8u);
  if ( Timeouta )
  {
    QuadPart = Timeouta->QuadPart;
    Timeouta = (PLARGE_INTEGER)&QuadPart;
    v25 = MEMORY[0xFFFFF78000000014];
  }
  if ( IsPreviousMode )
  {
    v9 = (__int64)WaitStateChange;
    if ( (unsigned __int64)WaitStateChange >= 0x7FFFFFFF0000LL )
      v9 = 0x7FFFFFFF0000LL;                    // 判断越界
    *(_BYTE *)v9 = *(_BYTE *)v9;
    *(_BYTE *)(v9 + 183) = *(_BYTE *)(v9 + 183);
  }
  Object = 0;
  status = ObReferenceObjectByHandle(DebugObjectHandle, 1u, DbgkDebugObjectType, IsPreviousMode, &Object, 0);
  if ( status >= 0 )
  {
    Process = 0;
    Thread = 0;
    v11 = Alertable;
    DebugObject = (PDEBUG_OBJECT)Object;
    while ( 1 )
    {
      status1 = KeWaitForSingleObject(DebugObject, Executive, IsPreviousMode, v11, Timeouta);
      if ( status1 < 0 || status1 == 0xC0 || (unsigned int)(status1 - 0x101) <= 1 )
        break;
      ExAcquireFastMutex(&DebugObject->Mutex);
      if ( (DebugObject->Flags & 1) != 0 )      // #define DEBUG_OBJECT_DELETE_PENDING (0x1) // Debug object is delete pending.
                                                // #define DEBUG_OBJECT_KILL_ON_CLOSE  (0x2) // Kill all debugged processes on close
      {
        status1 = 0xC0000354;                   //     STATUS_DEBUGGER_INACTIVE
      }
      else
      {
        p_EventListHead = (struct _DEBUG_EVENT *)&DebugObject->EventList;
        for ( entry = (PDEBUG_EVENT)DebugObject->EventList.Flink; ; entry = (PDEBUG_EVENT)entry->EventList.Flink )// 遍历debug_event
        {
          if ( entry == p_EventListHead )
          {
            KeResetEvent(&DebugObject->EventsPresent);
            goto LABEL_24;
          }
          debug_event = entry;
          Flags = entry->Flags;
          if ( (Flags & 5) == 0 )               // #define DEBUG_EVENT_READ            (0x01)  // Event had been seen by win32 app
                                                // #define DEBUG_EVENT_NOWAIT          (0x02)  // No waiter one this. Just free the pool
                                                // #define DEBUG_EVENT_INACTIVE        (0x04)  // The message is in inactive. It may be activated or deleted later
                                                // #define DEBUG_EVENT_RELEASE         (0x08)  // Release rundown protection on this thread
                                                // #define DEBUG_EVENT_PROTECT_FAILED  (0x10)  // Rundown protection failed to be acquired on this thread
                                                // #define DEBUG_EVENT_SUSPEND         (0x20)  // Resume thread on continue
                                                // 
                                                // 5 = 1 + 4
          {
            is_got_event = 1;
            Flink = (PDEBUG_EVENT)p_EventListHead->EventList.Flink;
            if ( (PDEBUG_EVENT)p_EventListHead->EventList.Flink != entry )
            {
              while ( entry->ClientId.UniqueProcess != Flink->ClientId.UniqueProcess )
              {
                Flink = (PDEBUG_EVENT)Flink->EventList.Flink;
                if ( Flink == entry )
                  goto LABEL_19;
              }
              entry->Flags = Flags | 4;
              entry->BackoutThread = 0;
              is_got_event = 0;
            }
LABEL_19:
            if ( is_got_event )
              break;
          }
        }
        Process = entry->Process;
        Thread = entry->Thread;
        ObfReferenceObjectWithTag(Thread, 0x4F676244u);
        ObfReferenceObjectWithTag(Process, 0x4F676244u);
        DbgkpConvertKernelToUserStateChange(v28, debug_event);
        debug_event->Flags |= 1u;               // 标记已读
LABEL_24:
        status1 = 0;
      }
      KeReleaseGuardedMutex(&DebugObject->Mutex);
      if ( status1 < 0 )
        break;
      if ( is_got_event )
      {
        DbgkpOpenHandles(v28, Process, Thread);
        ObfDereferenceObjectWithTag(Thread, 0x4F676244u);
        ObfDereferenceObjectWithTag(Process, 0x4F676244u);
        break;
      }
      is_got_event = 0;
      if ( QuadPart < 0 )
      {
        v19 = MEMORY[0xFFFFF78000000014] - v25 + QuadPart < 0;
        QuadPart += MEMORY[0xFFFFF78000000014] - v25;
        v25 = MEMORY[0xFFFFF78000000014];
        DebugObject = (PDEBUG_OBJECT)Object;
        if ( !v19 )
        {
          status1 = 258;
          break;
        }
      }
      v11 = Alertable;
    }
    HalPutDmaAdapter((PADAPTER_OBJECT)DebugObject);
    *(_OWORD *)&WaitStateChange->NewState = v28[0];
    *(_OWORD *)&WaitStateChange->AppClientId.UniqueThread = v28[1];
    *(_OWORD *)(&WaitStateChange->StateInfo.UnloadDll + 1) = v28[2];
    *(_OWORD *)(&WaitStateChange->StateInfo.UnloadDll + 3) = v28[3];
    *(_OWORD *)(&WaitStateChange->StateInfo.UnloadDll + 5) = v28[4];
    *(_OWORD *)(&WaitStateChange->StateInfo.UnloadDll + 7) = v28[5];
    *(_OWORD *)(&WaitStateChange->StateInfo.UnloadDll + 9) = v28[6];
    v20 = &WaitStateChange->StateInfo.Exception.ExceptionRecord.ExceptionInformation[9];
    *((_OWORD *)v20 - 1) = v28[7];
    *(_OWORD *)v20 = v28[8];
    *((_OWORD *)v20 + 1) = v28[9];
    *((_OWORD *)v20 + 2) = v28[10];
    v20[6] = *(_QWORD *)&v28[11];
    return status1;
  }
  return status;
}
```

大概流程是

```c
//一个大循环死等DebugObject的信号量被置位
status1 = KeWaitForSingleObject(DebugObject, Executive, IsPreviousMode, v11, Timeouta);
// 特别注意，KeWaitForSingleObject如果status == true就会reset信号位
//拿一个就跑
p_EventListHead = (struct _DEBUG_EVENT *)&DebugObject->EventList;
   ...
is_got_event = 1;
   ...
if ( is_got_event )
    break;
//填写WaitStateChange，然后返回
*(_OWORD *)&WaitStateChange->NewState = v28[0];
*(_OWORD *)&WaitStateChange->AppClientId.UniqueThread = v28[1];
*(_OWORD *)(&WaitStateChange->StateInfo.UnloadDll + 1) = v28[2];
*(_OWORD *)(&WaitStateChange->StateInfo.UnloadDll + 3) = v28[3];
*(_OWORD *)(&WaitStateChange->StateInfo.UnloadDll + 5) = v28[4];
*(_OWORD *)(&WaitStateChange->StateInfo.UnloadDll + 7) = v28[5];
*(_OWORD *)(&WaitStateChange->StateInfo.UnloadDll + 9) = v28[6];
v20 = &WaitStateChange->StateInfo.Exception.ExceptionRecord.ExceptionInformation[9];
*((_OWORD *)v20 - 1) = v28[7];
*(_OWORD *)v20 = v28[8];
*((_OWORD *)v20 + 1) = v28[9];
*((_OWORD *)v20 + 2) = v28[10];
v20[6] = *(_QWORD *)&v28[11];
return status1;
```

然后转换一下，r3调试器就高高兴兴的跑去处理调试事件了

## ContinueDebugEvent

```c
// from kernelbase
BOOL __stdcall ContinueDebugEvent(DWORD dwProcessId, DWORD dwThreadId, DWORD dwContinueStatus)
{
  NTSTATUS v5; // eax
  struct _CLIENT_ID v7; // [rsp+20h] [rbp-18h] BYREF

  v7.UniqueProcess = (HANDLE)(int)dwProcessId;
  v7.UniqueThread = (HANDLE)(int)dwThreadId;
  v5 = DbgUiContinue(&v7, dwContinueStatus);
  if ( v5 >= 0 )
  {
    RemoveHandles(dwThreadId, dwProcessId);
    return 1;
  }
  else
  {
    BaseSetLastNTError((unsigned int)v5);
    return 0;
  }
}
// from ntdll
__int64 __fastcall DbgUiContinue(__int64 a1, unsigned int a2)
{
  return NtDebugContinue(NtCurrentTeb()->DbgSsReserved[1], a1, a2);
}
// from ntoskrnl
NTSTATUS NtDebugContinue(HANDLE DebugObjectHandle, PCLIENT_ID ClientId, NTSTATUS ContinueStatus)
{
  KPROCESSOR_MODE PreviousMode; // r9
  NTSTATUS status; // eax
  NTSTATUS status1; // edi
  char find; // r15
  PDEBUG_EVENT v8; // rsi
  PDEBUG_OBJECT DebugObject; // r14
  PDEBUG_EVENT DebugEvent; // rcx
  PDEBUG_EVENT Flink; // rdx
  PDEBUG_EVENT Blink; // rax
  CLIENT_ID ClientId_copy; // [rsp+40h] [rbp-28h]
  PVOID Object; // [rsp+88h] [rbp+20h] BYREF

  PreviousMode = KeGetCurrentThread()->PreviousMode;
  ClientId_copy = *ClientId;
  if ( ContinueStatus != 0x80010001
    && (ContinueStatus <= 0x10000
     || ContinueStatus > 0x10002
     && ContinueStatus != 0x40010001
     && (ContinueStatus <= 0x40010002 || ContinueStatus > 0x40010004)) )
  {
    return 0xC000000D;                          //     STATUS_INVALID_PARAMETER
  }
  Object = 0;
  status = ObReferenceObjectByHandle(DebugObjectHandle, 1u, DbgkDebugObjectType, PreviousMode, &Object, 0);
  status1 = status;
  if ( status >= 0 )
  {
    find = 0;
    v8 = 0;
    DebugObject = (PDEBUG_OBJECT)Object;
    ExAcquireFastMutex((PFAST_MUTEX)((char *)Object + 24));
    DebugEvent = (PDEBUG_EVENT)DebugObject->EventList.Flink;
    if ( DebugEvent == (PDEBUG_EVENT)&DebugObject->EventList )
      goto empty_link;
    while ( 1 )
    {
      if ( DebugEvent->ClientId.UniqueProcess == ClientId_copy.UniqueProcess )
      {
        if ( find )
        {
          DebugEvent->Flags &= ~4u;
          KeSetEvent(&DebugObject->EventsPresent, 0, 0);
empty_link:
          KeReleaseGuardedMutex(&DebugObject->Mutex);
          HalPutDmaAdapter((PADAPTER_OBJECT)DebugObject);
          if ( !find )
            return -1073741811;                 // STATUS_INVALID_PARAMETER
          if ( (PerfGlobalGroupMask & 0x400000) != 0 )
            EtwTraceDebuggerEvent(v8->Process, v8->Thread, 2);
          v8->ApiMsg.ReturnedStatus = ContinueStatus;
          v8->Status = 0;
          DbgkpWakeTarget((char *)v8);          // 放行被调试进程
          return status1;
        }
        if ( DebugEvent->ClientId.UniqueThread == ClientId_copy.UniqueThread && (DebugEvent->Flags & 1) != 0 )// 必须读过
                                                // #define DEBUG_EVENT_READ            (0x01)  // Event had been seen by win32 app
                                                // #define DEBUG_EVENT_NOWAIT          (0x02)  // No waiter one this. Just free the pool
                                                // #define DEBUG_EVENT_INACTIVE        (0x04)  // The message is in inactive. It may be activated or deleted later
                                                // #define DEBUG_EVENT_RELEASE         (0x08)  // Release rundown protection on this thread
                                                // #define DEBUG_EVENT_PROTECT_FAILED  (0x10)  // Rundown protection failed to be acquired on this thread
                                                // #define DEBUG_EVENT_SUSPEND         (0x20)  // Resume thread on continue
        {
          Flink = (PDEBUG_EVENT)DebugEvent->EventList.Flink;
          Blink = (PDEBUG_EVENT)DebugEvent->EventList.Blink;
          if ( (PDEBUG_EVENT)DebugEvent->EventList.Flink->Blink != DebugEvent
            || (PDEBUG_EVENT)Blink->EventList.Flink != DebugEvent )
          {
            __fastfail(3u);
          }
          Blink->EventList.Flink = &Flink->EventList;// 双向循环链表特有的去掉节点方法
          Flink->EventList.Blink = &Blink->EventList;
          v8 = DebugEvent;
          find = 1;
        }
      }
      DebugEvent = (PDEBUG_EVENT)DebugEvent->EventList.Flink;
      if ( DebugEvent == (PDEBUG_EVENT)&DebugObject->EventList )
        goto empty_link;
    }
  }
  return status;
}
```

他会遍历链表摘除读过的事件，如果还有就恢复被前面KeWaitForSingleObject清空的信号量，给通过DebugEvent的信号置位通行，DbgkpWakeTarget放行线程然后返回

```c
          DebugEvent->Flags &= ~4u;
          KeSetEvent(&DebugObject->EventsPresent, 0, 0);
empty_link:
          KeReleaseGuardedMutex(&DebugObject->Mutex);
          HalPutDmaAdapter((PADAPTER_OBJECT)DebugObject);
          if ( !find )
            return -1073741811;                 // STATUS_INVALID_PARAMETER
          if ( (PerfGlobalGroupMask & 0x400000) != 0 )
            EtwTraceDebuggerEvent(v8->Process, v8->Thread, 2);
          v8->ApiMsg.ReturnedStatus = ContinueStatus;
          v8->Status = 0;
          DbgkpWakeTarget((char *)v8);          // 放行被调试进程
          return status1;
```

如果判断调试事件链表是否为空，

```c
    DebugEvent = (PDEBUG_EVENT)DebugObject->EventList.Flink;
    if ( DebugEvent == (PDEBUG_EVENT)&DebugObject->EventList )
      goto empty_link;
```

对于双向循环链表，前一个等于后一个等于自己就意味着空  
如果为空就不置位debugobject的信号，直接放行

```c
DbgkpWakeTarget((char *)v8);          // 放行被调试进程
```

至此，整体框架构建完成

这次我们来看被调试进程是如何发送调试事件的，以及送大家一个有趣反调试  
拿异常举例，当发生异常，如果检测到有调试器，会先发给调试器，调用这个函数

## DbgkForwardException 分析

```c
BOOLEAN DbgkForwardException(PEXCEPTION_RECORD ExceptionRecord, BOOLEAN DebugException, BOOLEAN SecondChance)
{
  struct _ETHREAD *CurrentThread; // rax
  struct _EPROCESS *Process; // rsi
  struct _DMA_ADAPTER *DebugPort; // rbx
  char v9; // r14
  int v11; // esi
  NTSTATUS ReturnedStatus; // eax
  int info[4]; // [rsp+20h] [rbp-E0h] BYREF
  struct _DBGKM_APIMSG v14; // [rsp+30h] [rbp-D0h] BYREF

  *(_QWORD *)info = 0;
  memset(&v14, 0, 0x110u);
  if ( SecondChance )
  {
    info[0] = 1;
    PsSetProcessFaultInformation((ULONG_PTR)KeGetCurrentThread()->ApcState.Process, info);
  }
  v14.ApiNumber = DbgKmExceptionApi;
  v14.h.u1.Length = 13631656;
  v14.h.u2.ZeroInit = 8;
  CurrentThread = (struct _ETHREAD *)KeGetCurrentThread();
  Process = (struct _EPROCESS *)CurrentThread->Tcb.ApcState.Process;
  if ( DebugException )
  {
    if ( (*(_DWORD *)(&KeGetCurrentThread()[1].SwapListEntry + 1) & 4) != 0 )
      DebugPort = 0;
    else
      DebugPort = (struct _DMA_ADAPTER *)Process->DebugPort;
    v9 = 0;
  }
  else
  {
    DebugPort = (struct _DMA_ADAPTER *)PsCaptureExceptionPort(CurrentThread->Tcb.ApcState.Process);
    v14.h.u2.ZeroInit = 7;
    v9 = 1;
  }
  if ( !DebugPort && DebugException )
    return 0;
  KeCopyExceptionRecord(&v14.u, ExceptionRecord);
  v14.u.Exception.FirstChance = SecondChance == 0;
  if ( v9 )
  {
    if ( DebugPort )
    {
      v11 = DbgkpSendApiMessageLpc((__int64)&v14, (int)DebugPort, DebugException);
      HalPutDmaAdapter(DebugPort);
    }
    else
    {
      v11 = 0;
      v14.ReturnedStatus = -2147418111;
    }
  }
  else
  {
    v11 = DbgkpSendApiMessage(Process, DebugException != 0, &v14);
  }
  if ( v11 < 0 )
    return 0;
  ReturnedStatus = v14.ReturnedStatus;
  if ( v14.ReturnedStatus == -2147418111 )
  {
    if ( DebugException )
      return 0;
    ReturnedStatus = DbgkpSendErrorMessage(ExceptionRecord, 2, &v14);
  }
  return ReturnedStatus >= 0;
}
```

这里填写了根据异常apimsg的类型啦，一些异常记录，然后主动调用DbgkpSendApiMessage

```c
__int64 __fastcall DbgkpSendApiMessage(struct _EPROCESS *Object, char a2, struct _DBGKM_APIMSG *a3)
{
  int v6; // ebp
  NTSTATUS v7; // esi

  if ( (PerfGlobalGroupMask & 0x400000) != 0 )
    EtwTraceDebuggerEvent(KeGetCurrentThread()->ApcState.Process, KeGetCurrentThread(), 1);
  do
  {
    v6 = 0;
    if ( Object == (struct _EPROCESS *)KeGetCurrentThread()->ApcState.Process && (a2 & 1) != 0 )
      v6 = (unsigned __int8)DbgkpSuspendProcess(Object);
    a3->ReturnedStatus = 259;
    v7 = DbgkpQueueMessage(Object, (PETHREAD)KeGetCurrentThread(), a3, 32 * (a2 & 2), 0);
    if ( v6 )
    {
      PsThawProcess(Object, 0);
      KeLeaveCriticalRegion();
    }
  }
  while ( v7 >= 0 && a3->ReturnedStatus == 1073807361 );
  return (unsigned int)v7;
}
```

可以看到调用了DbgkpQueueMessage，我们前面分析过了

```c
NTSTATUS DbgkpQueueMessage(
        PEPROCESS Process,
        PETHREAD Thread,
        PDBGKM_APIMSG ApiMsg,
        ULONG Flags,
        PDEBUG_OBJECT TargetDebugObject)
{
  __int64 v10; // r12
  DEBUG_EVENT *alloc_debug_event; // rax
  DEBUG_EVENT *p_debug_event; // r14
  DBGKM_APINUMBER ApiNumber; // ecx
  DBGKM_APIMSG *p_ApiMsg; // rbx
  DBGKM_APIMSG *ApiMsg_From_Debug_Event; // rax
  PDBGKM_APIMSG In_ApiMsg; // rcx
  __int64 v18; // rdx
  __int128 v19; // xmm1
  NTSTATUS Status; // esi
  struct _FAST_MUTEX *p_Mutex; // r12
  struct _LIST_ENTRY *Blink; // rcx
  __int128 v23; // xmm1
  ULONG is_no_wait; // [rsp+30h] [rbp-1C8h]
  DEBUG_EVENT debug_event; // [rsp+40h] [rbp-1B8h] BYREF
                                                //                                                 #define DEBUG_EVENT_READ            (0x01)  // Event had been seen by win32 app
                                                //                                                 #define DEBUG_EVENT_NOWAIT          (0x02)  // No waiter one this. Just free the pool
                                                //                                                 #define DEBUG_EVENT_INACTIVE        (0x04)  // The message is in inactive. It may be activated or deleted later
                                                //                                                 #define DEBUG_EVENT_RELEASE         (0x08)  // Release rundown protection on this thread
                                                //                                                 #define DEBUG_EVENT_PROTECT_FAILED  (0x10)  // Rundown protection failed to be acquired on this thread
                                                //                                                 #define DEBUG_EVENT_SUSPEND         (0x20)  // Resume thread on continue
                                                //                                                 
                                                //                                              
  memset(
    &debug_event,
    0,
    0x168u);
  v10 = 2;
  is_no_wait = Flags & 2;
  if ( (Flags & 2) == 0 )                       // 需等待事件
  {
    debug_event.Flags = Flags;
    p_debug_event = &debug_event;
    ExAcquireFastMutex(&DbgkpProcessDebugPortMutex);
    ApiNumber = ApiMsg->ApiNumber;
    TargetDebugObject = (PDEBUG_OBJECT)Process->DebugPort;// 需等待事件必须有debug port
    if ( (unsigned int)(ApiNumber - 1) <= 1 && (Thread->CrossThreadFlags & 0x40) != 0 )
      TargetDebugObject = 0;
    if ( ApiNumber == DbgKmLoadDllApi )
    {
      if ( ((unsigned __int8)Flags & Thread->CrossThreadFlags & 0x40) == 0 )
      {
LABEL_14:
        KeInitializeEvent(&debug_event.ContinueEvent, SynchronizationEvent, 0);
        goto LABEL_15;
      }
      TargetDebugObject = 0;
    }
    if ( (unsigned int)(ApiNumber - 3) <= 1 && SLOBYTE(Thread->CrossThreadFlags) < 0 )
      TargetDebugObject = 0;
    goto LABEL_14;
  }
  alloc_debug_event = (DEBUG_EVENT *)ExAllocatePoolWithQuotaTag((POOL_TYPE)520, 0x168u, 'EgbD');
  p_debug_event = alloc_debug_event;
  if ( !alloc_debug_event )
    return 0xC000009A;                          // STATUS_INSUFFICIENT_RESOURCES
  alloc_debug_event->Flags = Flags | 4;
  ObfReferenceObjectWithTag(Process, 0x4F676244u);
  ObfReferenceObjectWithTag(Thread, 0x4F676244u);
  p_debug_event->BackoutThread = (PETHREAD)KeGetCurrentThread();
LABEL_15:
  p_ApiMsg = &p_debug_event->ApiMsg;
  p_debug_event->Process = Process;
  ApiMsg_From_Debug_Event = &p_debug_event->ApiMsg;
  p_debug_event->Thread = Thread;
  In_ApiMsg = ApiMsg;
  v18 = 2;
  do                                            // 复制
  {
    *(_OWORD *)&ApiMsg_From_Debug_Event->h.u1.s1.DataLength = *(_OWORD *)&In_ApiMsg->h.u1.s1.DataLength;
    *(union _PORT_MESSAGE::$BD8137A324A8476723CC573F97133CB1 *)((char *)&ApiMsg_From_Debug_Event->h.8 + 8) = *(union _PORT_MESSAGE::$BD8137A324A8476723CC573F97133CB1 *)((char *)&In_ApiMsg->h.8 + 8);
    *(_OWORD *)&ApiMsg_From_Debug_Event->h.ClientViewSize = *(_OWORD *)&In_ApiMsg->h.ClientViewSize;
    *(_OWORD *)&ApiMsg_From_Debug_Event->u.Exception.ExceptionRecord.ExceptionCode = *(_OWORD *)&In_ApiMsg->u.Exception.ExceptionRecord.ExceptionCode;
    *((_OWORD *)&ApiMsg_From_Debug_Event->u.UnloadDll + 1) = *((_OWORD *)&In_ApiMsg->u.UnloadDll + 1);
    *((_OWORD *)&ApiMsg_From_Debug_Event->u.UnloadDll + 2) = *((_OWORD *)&In_ApiMsg->u.UnloadDll + 2);
    *((_OWORD *)&ApiMsg_From_Debug_Event->u.UnloadDll + 3) = *((_OWORD *)&In_ApiMsg->u.UnloadDll + 3);
    ApiMsg_From_Debug_Event = (DBGKM_APIMSG *)((char *)ApiMsg_From_Debug_Event + 128);
    v19 = *((_OWORD *)&In_ApiMsg->u.UnloadDll + 4);
    In_ApiMsg = (PDBGKM_APIMSG)((char *)In_ApiMsg + 128);
    *((_OWORD *)&ApiMsg_From_Debug_Event[-1].u.UnloadDll + 9) = v19;
    --v18;
  }
  while ( v18 );
  *(_OWORD *)&ApiMsg_From_Debug_Event->h.u1.s1.DataLength = *(_OWORD *)&In_ApiMsg->h.u1.s1.DataLength;
  p_debug_event->ClientId = Thread->Cid;
  if ( TargetDebugObject )
  {
    p_Mutex = &TargetDebugObject->Mutex;
    ExAcquireFastMutex(&TargetDebugObject->Mutex);
    if ( (TargetDebugObject->Flags & 1) != 0 )
    {
      Status = 0xC0000354;
    }
    else
    {
      Blink = TargetDebugObject->EventList.Blink;
      if ( Blink->Flink != &TargetDebugObject->EventList )
        __fastfail(3u);                         // 检查完整性
      p_debug_event->EventList.Flink = &TargetDebugObject->EventList;
      p_debug_event->EventList.Blink = Blink;
      Blink->Flink = &p_debug_event->EventList; // 尾插法
      TargetDebugObject->EventList.Blink = &p_debug_event->EventList;
      if ( !is_no_wait )                        // 需等待，假消息不走这
        KeSetEvent(&TargetDebugObject->EventsPresent, 0, 0);
      Status = 0;
    }
    KeReleaseGuardedMutex(p_Mutex);
    v10 = 2;
  }
  else
  {
    Status = 0xC0000353;                        // STATUS_PORT_NOT_SET
  }
  if ( is_no_wait )
  {
    if ( Status < 0 )
    {
      ObfDereferenceObjectWithTag(Process, 0x4F676244u);
      ObfDereferenceObjectWithTag(Thread, 0x4F676244u);
      ExFreePoolWithTag(p_debug_event, 0);
    }
  }
  else
  {
    KeReleaseGuardedMutex(&DbgkpProcessDebugPortMutex);
    if ( Status >= 0 )
    {
      KeWaitForSingleObject(&p_debug_event->ContinueEvent, Executive, 0, 0, 0);
      Status = p_debug_event->Status;
      do
      {
        *(_OWORD *)&ApiMsg->h.u1.s1.DataLength = *(_OWORD *)&p_ApiMsg->h.u1.s1.DataLength;
        *(union _PORT_MESSAGE::$BD8137A324A8476723CC573F97133CB1 *)((char *)&ApiMsg->h.8 + 8) = *(union _PORT_MESSAGE::$BD8137A324A8476723CC573F97133CB1 *)((char *)&p_ApiMsg->h.8 + 8);
        *(_OWORD *)&ApiMsg->h.ClientViewSize = *(_OWORD *)&p_ApiMsg->h.ClientViewSize;
        *(_OWORD *)&ApiMsg->u.Exception.ExceptionRecord.ExceptionCode = *(_OWORD *)&p_ApiMsg->u.Exception.ExceptionRecord.ExceptionCode;
        *((_OWORD *)&ApiMsg->u.UnloadDll + 1) = *((_OWORD *)&p_ApiMsg->u.UnloadDll + 1);
        *((_OWORD *)&ApiMsg->u.UnloadDll + 2) = *((_OWORD *)&p_ApiMsg->u.UnloadDll + 2);
        *((_OWORD *)&ApiMsg->u.UnloadDll + 3) = *((_OWORD *)&p_ApiMsg->u.UnloadDll + 3);
        ApiMsg = (PDBGKM_APIMSG)((char *)ApiMsg + 128);
        v23 = *((_OWORD *)&p_ApiMsg->u.UnloadDll + 4);
        p_ApiMsg = (DBGKM_APIMSG *)((char *)p_ApiMsg + 128);
        *((_OWORD *)&ApiMsg[-1].u.UnloadDll + 9) = v23;
        --v10;
      }
      while ( v10 );
      *(_OWORD *)&ApiMsg->h.u1.s1.DataLength = *(_OWORD *)&p_ApiMsg->h.u1.s1.DataLength;
    }
  }
  return Status;
}
```

计算最后传入DbgkpQueueMessage的flag是0，也就是要wait的需等待事件，与nowait走一些不一样的路，最终会走到这里

```c
KeWaitForSingleObject(&p_debug_event->ContinueEvent, Executive, 0, 0, 0);
```

这时候这个线程就开死等直到调试器处理完成，然后还会传出ApiMsg供外面的函数分析使用

## 有趣的反调试

我们看DbgkForwardException的这里

```c
    if ( (*(_DWORD *)(&KeGetCurrentThread()[1].SwapListEntry + 1) & 4) != 0 )
      DebugPort = 0;
```

汇编准确一点

```
mov     rax, gs:610o
mov     ecx, [rax+_ETHREAD.___u21.CrossThreadFlags]
```

这个是CrossThreadFlags的ThreadHideFromDebugger位，如果该位置位，直接就是DebugPort = 0，啥都发不过去了  
这里给出利用代码

```c
#include <windows.h>
#include <winternl.h>
#include <stdio.h>

// 未公开的 ThreadInformationClass 常量
#define ThreadHideFromDebugger 0x11

// NtSetInformationThread 函数原型
typedef NTSTATUS (NTAPI *pNtSetInformationThread)(
    HANDLE ThreadHandle,
    THREADINFOCLASS ThreadInformationClass,
    PVOID ThreadInformation,
    ULONG ThreadInformationLength
);

// 隐藏当前线程，使调试器无法接收该线程的异常
void HideCurrentThreadFromDebugger() {
    // 1. 动态获取 ntdll!NtSetInformationThread 地址
    HMODULE hNtdll = GetModuleHandleW(L"ntdll.dll");
    if (!hNtdll) {
        printf("[!] 无法加载 ntdll.dll\n");
        return;
    }

    auto NtSetInformationThread = (pNtSetInformationThread)GetProcAddress(hNtdll, "NtSetInformationThread");
    if (!NtSetInformationThread) {
        printf("[!] 无法获取 NtSetInformationThread 地址\n");
        return;
    }

    // 2. 调用未公开功能，隐藏当前线程
    NTSTATUS status = NtSetInformationThread(
        GetCurrentThread(),                // 当前线程句柄
        (THREADINFOCLASS)ThreadHideFromDebugger, // 0x11
        nullptr,                           // 无额外数据
        0                                  // 长度0
    );

    if (status == 0) {
        printf("[+] 当前线程已成功从调试器隐藏\n");
    } else {
        printf("[!] 隐藏失败，NTSTATUS = 0x%08X\n", status);
    }
}

int main() {
    // 执行反调试：隐藏自身线程
    HideCurrentThreadFromDebugger();

    // 正常业务代码（示例：每隔一秒打印一次）
    printf("[*] 程序正常运行，请尝试用调试器附加并触发异常...\n");
    while (true) {
        Sleep(1000);
        // 可以取消下面注释来触发一个异常，验证调试器是否还能捕获
        // __try { *(int*)0 = 0; } __except(EXCEPTION_EXECUTE_HANDLER) {}
        // 如果线程已隐藏，调试器将收不到异常，程序会自己处理。
    }

    return 0;
}
```

我们直接使用NtSetInformationThread这个导出函数就可以设置线程teb的某些值

## 结语

至此，所有的调试原理都讲完了  
本博客只作为学习过程上的记录，可能不太详细，大家可以去看oxygen或者火哥的教程
