---
title: 【看雪】AXE逆向(一)
source: https://bbs.kanxue.com/thread-292267.htm
source_host: bbs.kanxue.com
clip_date: 2026-07-31T23:59:24+08:00
trace_id: 470aa380-0c5c-4677-bf10-7d5a1a003495
content_hash: f2731377efb078207862b3ffc01fef1b5b594c79ecec51db5b5e60e614f0e937
status: synced
tags:
  - 看雪
  - Windows逆向
  - 内核
series: 【看雪】AXE逆向
feed_source: 看雪·逆向工程
ai_summary: AXE驱动通过动态获取系统函数地址、搜索内核结构偏移及特征码完成初始化，为后续操作建立底层能力基础。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ae75244-d011-812e-9654-e51c31fad95b
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> AXE驱动通过动态获取系统函数地址、搜索内核结构偏移及特征码完成初始化，为后续操作建立底层能力基础。
> 
> - **导入函数表构建：** InitImport通过GetKernelFunctionAddress解析了100余个内核API（如ObfDereferenceObject、PsSetCreateProcessNotifyRoutine、MmCopyMemory等），覆盖进程/线程管理、内存操作、回调注册等关键功能。
> - **全局项初始化细节：** InitGloableItem获取Csrss/Lsass进程ID、物理内存范围、SSDT表地址、页表自映射入口及内核池信息，大量依赖SSDT序号查询和特征码扫描。
> - **SeSetAuditParameter跳转表搜索：** FindSeSetAuditParameterSwitchJump在SeSetAuditParameter函数体内搜索`FF E1`指令序列，疑似用于Patch Hook相关审计行为。
> - **内核结构偏移获取：** InitKernelStruct确定EPROCESS/ETHREAD中DebugPort、PreviousMode、VadRoot、ThreadListEntry等关键字段偏移，其中sub_140019B68返回的偏移（0x158/0x178/0x1A0）在不同构建版本下不一致，可能对应某个尚未确定的成员。
> - **ZwQueryVirtualMemory修复与XOR混淆：** sub_14001859C在Build 2600系统中通过SSDT序号178重新获取ZwQueryVirtualMemory；随后调用的sub_140017910使用XOR混淆字符串解析多个函数（如sub_14001B43C），因混淆未完全还原而未深入分析。

最近在游历天外域得到了一个去虚拟化的AXE副本（某些未修复，但够分析大部分），打算有时间就分析，先做一个初始化的分析：

```cpp
__int64Init()
{
  unsigned intv0; // ebx
  v0 = 0xC0000001;
  if( !(unsigned int)InitImport() )
  {
    InitGloableItem();
    InitKernelStruct();
    sub_14001859C();
    return0;
  }
  returnv0;
}
```

## 导入函数初始化

初始化的东西比较杂，有导入，有内核结构的偏移（如EPROCESS），也有特征码搜索一大堆函数或者内核全局变量，咱们一一分析：

```cpp
__int64InitImport()
{
  unsigned intv0; // ebx
  v0 = -1073741823;
  ObfDereferenceObject_0 = (NTSTATUS (__fastcall *)(_QWORD, _QWORD))GetKernelFunctionAddress_0(L"ObfDereferenceObject");
  if( ObfDereferenceObject_0 )
  {
    ObfReferenceObject = GetKernelFunctionAddress_0(L"ObfReferenceObject");
    if( ObfReferenceObject )
    {
      ObReferenceObjectByHandle_0 = GetKernelFunctionAddress_0(L"ObReferenceObjectByHandle");
      if( ObReferenceObjectByHandle_0 )
      {
        ObReferenceObjectByName = GetKernelFunctionAddress_0(L"ObReferenceObjectByName");
        if( ObReferenceObjectByName )
        {
          ZwQueryObject_0 = GetKernelFunctionAddress_0(L"ZwQueryObject");
          if( ZwQueryObject_0 )
          {
            ZwDuplicateObject = GetKernelFunctionAddress_0(L"ZwDuplicateObject");
            if( ZwDuplicateObject )
            {
              ZwClose_0 = GetKernelFunctionAddress_0(L"ZwClose");
              if( ZwClose_0 )
              {
                RtlGetVersion_0 = GetKernelFunctionAddress_0(L"RtlGetVersion");
                if( RtlGetVersion_0 )
                {
                  ZwQuerySystemInformation_0 = (__int64(*)(void))GetKernelFunctionAddress_0(L"ZwQuerySystemInformation");
                  if( ZwQuerySystemInformation_0 )
                  {
                    PsSetLoadImageNotifyRoutine = GetKernelFunctionAddress_0(L"PsSetLoadImageNotifyRoutine");
                    if( PsSetLoadImageNotifyRoutine )
                    {
                      PsRemoveLoadImageNotifyRoutine = GetKernelFunctionAddress_0(L"PsRemoveLoadImageNotifyRoutine");
                      if( PsRemoveLoadImageNotifyRoutine )
                      {
                        PsSetCreateProcessNotifyRoutine = GetKernelFunctionAddress_0(L"PsSetCreateProcessNotifyRoutine");
                        if( PsSetCreateProcessNotifyRoutine )
                        {
                          PsSetCreateThreadNotifyRoutine = GetKernelFunctionAddress_0(L"PsSetCreateThreadNotifyRoutine");
                          if( PsSetCreateThreadNotifyRoutine )
                          {
                            PsRemoveCreateThreadNotifyRoutine = GetKernelFunctionAddress_0(L"PsRemoveCreateThreadNotifyRoutine");
                            if( PsRemoveCreateThreadNotifyRoutine )
                            {
                              PsGetProcessExitStatus = GetKernelFunctionAddress_0(L"PsGetProcessExitStatus");
                              if( PsGetProcessExitStatus )
                              {
                                IoGetCurrentProcess_0 = GetKernelFunctionAddress_0(L"IoGetCurrentProcess");
                                if( IoGetCurrentProcess_0 )
                                {
                                  IoThreadToProcess = GetKernelFunctionAddress_0(L"IoThreadToProcess");
                                  if( IoThreadToProcess )
                                  {
                                    PsGetCurrentThread = GetKernelFunctionAddress_0(L"PsGetCurrentThread");
                                    if( PsGetCurrentThread )
                                    {
                                      PsGetCurrentProcessId_0 = GetKernelFunctionAddress_0(L"PsGetCurrentProcessId");
                                      if( PsGetCurrentProcessId_0 )
                                      {
                                        PsGetProcessId = GetKernelFunctionAddress_0(L"PsGetProcessId");
                                        if( PsGetProcessId )
                                        {
                                          PsGetProcessInheritedFromUniqueProcessId = GetKernelFunctionAddress_0(
                                                                                       L"PsGetProcessInheritedFromUniqueProcessId");
                                          if( PsGetProcessInheritedFromUniqueProcessId )
                                          {
                                            PsLookupProcessByProcessId_0 = (__int64(*)(void))GetKernelFunctionAddress_0(
                                                                                                L"PsLookupProcessByProcessId");
                                            if( PsLookupProcessByProcessId_0 )
                                            {
                                              KeStackAttachProcess_0 = GetKernelFunctionAddress_0(L"KeStackAttachProcess");
                                              if( KeStackAttachProcess_0 )
                                              {
                                                KeUnstackDetachProcess_0 = (__int64(*)(void))GetKernelFunctionAddress_0(
                                                                                                L"KeUnstackDetachProcess");
                                                if( KeUnstackDetachProcess_0 )
                                                {
                                                  PsGetProcessImageFileName = GetKernelFunctionAddress_0(L"PsGetProcessImageFileName");
                                                  if( PsGetProcessImageFileName )
                                                  {
                                                    MmGetPhysicalMemoryRanges = (__int64(*)(void))GetKernelFunctionAddress_0(L"MmGetPhysicalMemoryRanges");
                                                    if( MmGetPhysicalMemoryRanges )
                                                    {
                                                      PsGetProcessSectionBaseAddress = GetKernelFunctionAddress_0(
                                                                                         L"PsGetProcessSectionBaseAddress");
                                                      if( PsGetProcessSectionBaseAddress )
                                                      {
                                                        MmIsAddressValid_0 = (__int64(*)(void))GetKernelFunctionAddress_0(L"MmIsAddressValid");
                                                        if( MmIsAddressValid_0 )
                                                        {
                                                          PsLookupThreadByThreadId = GetKernelFunctionAddress_0(L"PsLookupThreadByThreadId");
                                                          if( PsLookupThreadByThreadId )
                                                          {
                                                            PsCreateSystemThread_0 = GetKernelFunctionAddress_0(L"PsCreateSystemThread");
                                                            if( PsCreateSystemThread_0 )
                                                            {
                                                              ZwQueryInformationThread = GetKernelFunctionAddress_0(L"ZwQueryInformationThread");
                                                              if( ZwQueryInformationThread )
                                                              {
                                                                IoCreateSymbolicLink = GetKernelFunctionAddress_0(L"IoCreateSymbolicLink");
                                                                if( IoCreateSymbolicLink )
                                                                {
                                                                  IoCreateDevice_0 = GetKernelFunctionAddress_0(L"IoCreateDevice");
                                                                  if( IoCreateDevice_0 )
                                                                  {
                                                                    PsReferencePrimaryToken = GetKernelFunctionAddress_0(
                                                                                                L"PsReferencePrimaryToken");
                                                                    if( PsReferencePrimaryToken )
                                                                    {
                                                                      ExSetTimerResolution = GetKernelFunctionAddress_0(L"ExSetTimerResolution");
                                                                      if( ExSetTimerResolution )
                                                                      {
                                                                        PsGetCurrentThreadId_0 = GetKernelFunctionAddress_0(
                                                                                                   L"PsGetCurrentThreadId");
                                                                        if( PsGetCurrentThreadId_0 )
                                                                        {
                                                                          KeInitializeDpc = GetKernelFunctionAddress_0(L"KeInitializeDpc");
                                                                          if( KeInitializeDpc )
                                                                          {
                                                                            KeSetTargetProcessorDpc = GetKernelFunctionAddress_0(L"KeSetTargetProcessorDpc");
                                                                            if( KeSetTargetProcessorDpc )
                                                                            {
                                                                              KeInitializeTimerEx = GetKernelFunctionAddress_0(L"KeInitializeTimerEx");
                                                                              if( KeInitializeTimerEx )
                                                                              {
                                                                                KeSetTimerEx = GetKernelFunctionAddress_0(L"KeSetTimerEx");
                                                                                if( KeSetTimerEx )
                                                                                {
                                                                                  KeCancelTimer = GetKernelFunctionAddress_0(L"KeCancelTimer");
                                                                                  if( KeCancelTimer )
                                                                                  {
                                                                                    MmMapIoSpaceEx_0 = GetKernelFunctionAddress_0(L"MmMapIoSpaceEx");
                                                                                    MmMapIoSpace_0 = GetKernelFunctionAddress_0(L"MmMapIoSpace");
                                                                                    RtlTimeFieldsToTime = GetKernelFunctionAddress_0(L"RtlTimeFieldsToTime");
                                                                                    RtlTimeToSecondsSince1980 = GetKernelFunctionAddress_0(L"RtlTimeToSecondsSince1980");
                                                                                    KeQueryPerformanceCounter = GetKernelFunctionAddress_0(L"KeQueryPerformanceCounter");
                                                                                    KdRefreshDebuggerNotPresent = GetKernelFunctionAddress_0(L"KdRefreshDebuggerNotPresent");
                                                                                    ZwQueryInformationProcess = GetKernelFunctionAddress_0(L"ZwQueryInformationProcess");
                                                                                    KeQueryPrcbAddress = GetKernelFunctionAddress_0(L"KeQueryPrcbAddress");
                                                                                    ExQueryTimerResolution = GetKernelFunctionAddress_0(L"ExQueryTimerResolution");
                                                                                    ObRegisterCallbacks = GetKernelFunctionAddress_0(L"ObRegisterCallbacks");
                                                                                    ObUnRegisterCallbacks = GetKernelFunctionAddress_0(L"ObUnRegisterCallbacks");
                                                                                    HalQueryRealTimeClock = GetKernelFunctionAddress_0(L"HalQueryRealTimeClock");
                                                                                    KeSetAffinityThread = GetKernelFunctionAddress_0(L"KeSetAffinityThread");
                                                                                    KeQueryUnbiasedInterruptTime = GetKernelFunctionAddress_0(L"KeQueryUnbiasedInterruptTime");
                                                                                    ExfUnblockPushLock = GetKernelFunctionAddress_0(L"ExfUnblockPushLock");
                                                                                    DbgCommandString = GetKernelFunctionAddress_0(L"DbgCommandString");
                                                                                    KdDisableDebugger = GetKernelFunctionAddress_0(L"KdDisableDebugger");
                                                                                    ZwAllocateVirtualMemory = GetKernelFunctionAddress_0(L"ZwAllocateVirtualMemory");
                                                                                    ZwFreeVirtualMemory = GetKernelFunctionAddress_0(L"ZwFreeVirtualMemory");
                                                                                    RtlLookupFunctionEntry = GetKernelFunctionAddress_0(L"RtlLookupFunctionEntry");
                                                                                    RtlVirtualUnwind = GetKernelFunctionAddress_0(L"RtlVirtualUnwind");
                                                                                    ExGetFirmwareEnvironmentVariable = GetKernelFunctionAddress_0(L"ExGetFirmwareEnvironmentVariable");
                                                                                    HalGetEnvironmentVariableEx = GetKernelFunctionAddress_0(L"HalGetEnvironmentVariableEx");
                                                                                    MmAddPhysicalMemory = GetKernelFunctionAddress_0(L"MmAddPhysicalMemory");
                                                                                    MmRemovePhysicalMemory = GetKernelFunctionAddress_0(L"MmRemovePhysicalMemory");
                                                                                    MmMarkPhysicalMemoryAsBad = GetKernelFunctionAddress_0(L"MmMarkPhysicalMemoryAsBad");
                                                                                    MmCopyMemory = GetKernelFunctionAddress_0(L"MmCopyMemory");
                                                                                    ObOpenObjectByPointer = GetKernelFunctionAddress_0(L"ObOpenObjectByPointer");
                                                                                    PsAcquireProcessExitSynchronization = GetKernelFunctionAddress_0(L"PsAcquireProcessExitSynchronization");
                                                                                    PsReleaseProcessExitSynchronization = GetKernelFunctionAddress_0(L"PsReleaseProcessExitSynchronization");
                                                                                    ExEnumHandleTable = GetKernelFunctionAddress_0(L"ExEnumHandleTable");
                                                                                    InbvAcquireDisplayOwnership = GetKernelFunctionAddress_0(L"InbvAcquireDisplayOwnership");
                                                                                    InbvResetDisplay = GetKernelFunctionAddress_0(L"InbvResetDisplay");
                                                                                    ZwQueryVirtualMemory = (NTSTATUS (__stdcall *)(HANDLE, PROCESSINFOCLASS, PVOID, ULONG))GetKernelFunctionAddress_0(L"ZwQueryVirtualMemory");
                                                                                    PsGetProcessWin32Process = GetKernelFunctionAddress_0(L"PsGetProcessWin32Process");
                                                                                    PsSuspendProcess = GetKernelFunctionAddress_0(L"PsSuspendProcess");
                                                                                    PsResumeProcess = GetKernelFunctionAddress_0(L"PsResumeProcess");
                                                                                    ZwTerminateProcess = GetKernelFunctionAddress_0(L"ZwTerminateProcess");
                                                                                    PsReferenceProcessFilePointer = GetKernelFunctionAddress_0(L"PsReferenceProcessFilePointer");
                                                                                    ZwOpenProcess = GetKernelFunctionAddress_0(L"ZwOpenProcess");
                                                                                    PsGetProcessSessionId = GetKernelFunctionAddress_0(L"PsGetProcessSessionId");
                                                                                    PsGetProcessCreateTimeQuadPart = GetKernelFunctionAddress_0(L"PsGetProcessCreateTimeQuadPart");
                                                                                    PsGetProcessWow64Process = GetKernelFunctionAddress_0(L"PsGetProcessWow64Process");
                                                                                    PsSetCreateProcessNotifyRoutineEx_0 = GetKernelFunctionAddress_0(L"PsSetCreateProcessNotifyRoutineEx");
                                                                                    RtlCaptureContext = GetKernelFunctionAddress_0(L"RtlCaptureContext");
                                                                                    KeCapturePersistentThreadState = GetKernelFunctionAddress_0(L"KeCapturePersistentThreadState");
                                                                                    SeQueryInformationToken = GetKernelFunctionAddress_0(L"SeQueryInformationToken");
                                                                                    ObGetObjectType = GetKernelFunctionAddress_0(L"ObGetObjectType");
                                                                                    ZwPowerInformation = GetKernelFunctionAddress_0(L"ZwPowerInformation");
                                                                                    ExAcquirePushLockSharedEx = GetKernelFunctionAddress_0(L"ExAcquirePushLockSharedEx");
                                                                                    ExReleasePushLockSharedEx = GetKernelFunctionAddress_0(L"ExReleasePushLockSharedEx");
                                                                                    VslGetSecurePciEnabled = GetKernelFunctionAddress_0(L"VslGetSecurePciEnabled");
                                                                                    return0;
                                                                                  }
                                                                                }
                                                                              }
                                                                            }
                                                                          }
                                                                        }
                                                                      }
                                                                    }
                                                                  }
                                                                }
                                                              }
                                                            }
                                                          }
                                                        }
                                                      }
                                                    }
                                                  }
                                                }
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  returnv0;
}
```

InitImport没什么好看的，就是填充一大堆导入，给一些函数指针赋值在改个名，方便后续分析

```cpp
__int64InitGloableItem()
{
  __int64result; // rax
  result = sub_140017848(&unk_140030D30);
  if( (int)result >= 0 )
  {
    CsrssProcessID = FindCsrssProcessID();
    GetPhysicalMemoryRanges();
    DumpPhysicalMemoryRanges();
    ZwQuerySystemInformation_1();
    InitializeProcessorStateSnapshot();
    IoDriverObjectType_0 = GetKernelFunctionAddress_0(L"IoDriverObjectType");
    PsProcessType = (POBJECT_TYPE *)GetPsProcessType();
    SeSetAuditParameterSwitchJump = (NTSTATUS (__stdcall *)(PSE_ADT_PARAMETER_ARRAY, SE_ADT_PARAMETER_TYPE, ULONG, PVOID))FindSeSetAuditParameterSwitchJump();
    lsassProcessID = FindlsassProcessID();
    Win32kbaseVar = FindWin32kbaseVar_0();
    KeServiceDescriptorTable = (PVOID)FindKeServiceDescriptorTable(0);
    KeServiceDescriptorTable_0 = FindKeServiceDescriptorTable(1);
    Win32kFunction = (PVOID)FindWin32kFunction();
    UnknownSSDTFunction = GetUnknownSSDTFunction();
    UnknownSSDTFunction_0 = (PVOID)GetUnknownSSDTFunction_0();
    UnknownWin32kFunction = FindUnknownWin32kFunction();
    SystemModuleInformation = QuerySystemModuleInformation(&SystemModuleInformation_0);
    FindSelfRemap();
    PoolAddressInfo = GetPoolAddressInfo();
    PoolAddressInfo_0 = MatchModuleInPool();
    DumpNonPagedPool_0 = DumpNonPagedPool();
    UnknownFunction = sub_140014BD4();
    MmUnsecureVirtualMemoryKey = GetMmUnsecureVirtualMemoryKey();
    MiAddSecureEntry = GetMiAddSecureEntry();
    MmSecureVirtualMemoryKey_0 = GetMmSecureVirtualMemoryKey();
    qword_1400312A8 = sub_1400151F4();
    qword_1400312B0 = sub_1400144A4();
    qword_1400312B8 = sub_140015878();
    MiSystemPartition = FindMiSystemPartition();
    qword_1400312C8 = sub_140014AFC();
    PspCreateProcessNotifyRoutine = FindPspCreateProcessNotifyRoutine();
    qword_1400312E0 = sub_140014560();
    return0;
  }
  returnresult;
}
```

## 全局项初始化

这个函数进行了一堆比较杂的初始化，具体有 win32k、物理内存、快照、SSDT、页表自映射、内核POOL、等等的一堆初始化，目前看起来塞到这一个函数看起来没什么关联，后续继续分析可能这样做是有意义的。初始化的时候使用了大量的SSDT序列号找函数已经特征码搜索等操作，核心函数为：

```cpp
__int64__fastcall GetSSDTFunction(__int64n5125)
{
  IRP *Irp_1; // rsi
  __int64v2; // rbp
  intn5125_1; // edi
  charv4; // al
  __int64*KeServiceDescriptorTable; // rbx
  IRP *Irp; // rax
  __int64v7; // r14
  unsigned __int64v8; // rdx
  __int64Dst[7]; // [rsp+20h] [rbp-38h] BYREF
  Irp_1 = 0;
  v2 = 0;
  n5125_1 = n5125;
  if( (_DWORD)n5125 != -1 )
  {
    v4 = 0;
    if( (int)n5125 >= 4096 )
    {
      Irp = (IRP *)sub_14001E464();
      Irp_1 = Irp;
      if( !Irp )
        returnv2;
      KeStackAttachProcess_1(Irp, Dst);
      KeServiceDescriptorTable = (__int64*)KeServiceDescriptorTable_0;
      v4 = 1;
      n5125_1 &= 0xFFFu;
    }
    else
    {
      KeServiceDescriptorTable = (__int64*)KeServiceDescriptorTable;
    }
    if( KeServiceDescriptorTable )
    {
      if( v4 )
        KeServiceDescriptorTable += 4;
      if( KeServiceDescriptorTable && MmIsAddressValid(KeServiceDescriptorTable) )
      {
        v7 = *KeServiceDescriptorTable;
        if( (unsigned __int8)sub_140019488() || (unsigned __int8)sub_140019470() )
          v8 = *(int*)(*KeServiceDescriptorTable + 4LL * n5125_1) >> 4;
        else
          v8 = *(int*)(*KeServiceDescriptorTable + 4LL * n5125_1) & 0xFFFFFFFFFFFFFFF0uLL;
        v2 = v7 + v8;
      }
    }
    if( Irp_1 )
      KeUnstackDetachProcess_1(Dst);
  }
  returnv2;
}
```

```cpp
__int64__fastcall SearchPattern(__int64a1, unsigned inta2, __int64a3, unsigned inta4, chara5)
{
  __int64v5; // rbx
  intv10; // edi
  intv11; // esi
  v5 = 0;
  if( a1 && a2 && a3 && a4 )
  {
    v10 = 0;
    while( 1 )
    {
      v11 = 0;
      if( !a4 )
        break;
      while( MatchByte((_BYTE *)(v11 + a1 + v10), (_BYTE *)(v11 + a3), a5) )
      {
        if( ++v11 >= a4 )
          returna1 + v10;
      }
      if( ++v10 >= a2 )
        returnv5;
    }
    returna1 + v10;
  }
  returnv5;
}
```

## 搜索审计参数表

有一个地方比较好奇，目前没继续分析不知道是拿来做什么的，他搜索了SeSetAuditParameter函数的switch jmp表 ：

```cpp
_BYTE *FindSeSetAuditParameterSwitchJump()
{
  __int64v0; // rdi
  __int64v1; // rax
  _BYTE *v2; // rbx
  _BYTE *v3; // rsi
  v0 = 0;
  if( !(unsigned __int8)IsMicrosoftHyperV() )
  {
    v1 = GetKernelFunctionAddress_0(L"SeSetAuditParameter");
    if( v1 )
    {
      v2 = (_BYTE *)(v1 + 0x10);
      v3 = (_BYTE *)(v1 + 0x210);
      while( v2 != v3 )
      {
        if( (unsigned __int8)((__int64(__fastcall *)(_BYTE *))MmIsAddressValid_1)(v2)
          && (unsigned __int8)((__int64(__fastcall *)(_BYTE *))MmIsAddressValid_1)(v2 + 1)
          && *v2 == 0xFF
          && v2[1] == 0xE1 )
        {
          returnv2;
        }
        ++v2;
      }
    }
  }
  return(_BYTE *)v0;
}
```

## 内核结构偏移初始化

然后看第二个函数InitKernelStruct，主要是初始化了EPROCESS和ETHREAD的结构

```cpp
__int64InitKernelStruct()
{
  __int64ThreadListEntryOffset; // rax
  DebugPortOffset = GetDebugPortOffset();
  PreviousModeOffset = GetPreviousModeOffset();
  VadRootOffset = GetVadRootOffset();
  dword_140031660 = sub_14001979C();
  ThreadStartAddressOffset = GetThreadStartAddressFieldOffset();
  dword_140031668 = sub_140019BC8();
  dword_14003166C = sub_140019B68();
  InterruptDescriptorOffsetForHal = GetInterruptDescriptorOffsetForHal();
  ThreadCidOffset = GetThreadCidOffset();
  ThreadListEntryOffset = GetEthreadThreadListEntryOffset();
  ::ThreadListEntryOffset = ThreadListEntryOffset;
  returnThreadListEntryOffset;
}
```

其中sub_140019B68 没分析出是什么，对比EP和ET的各版本偏移没有对的上的，有知道的可以告知在下

```cpp
__int64sub_140019B68()
{
  unsigned intv0; // ebx
  intn17134; // eax
  v0 = 0;
  if( sub_140019448() )
  {
    return0x158;
  }
  elseif( sub_140019418() )
  {
    n17134 = GetNtBuildNumber();
    if( n17134 == 15063 || n17134 == 16299 )
    {
      return0x178;
    }
    elseif( n17134 == 17134 || n17134 == 17763 || n17134 == 18362 )
    {
      return0x1A0;
    }
  }
  returnv0;
}
```

sub_14001979C由于去虚拟化不完全，也没分析出是什么

```cpp
__int64sub_14001979C()
{
  unsigned intv0; // ebx
  _QWORD *v1; // rdi
  unsigned __int64n0x800; // rcx
  PEPROCESS Process; // [rsp+30h] [rbp+8h] BYREF
  v0 = 0;
  v1 = (_QWORD *)sub_140016A50();
  if( v1 )
  {
    Process = 0;
    if( !PsLookupProcessByProcessId((HANDLE)4, &Process) )
    {
      ObfDereferenceObject(Process);
      n0x800 = *v1 - (_QWORD)Process;
      if( n0x800 > 0x800 )
        LODWORD(n0x800) = 0;
      return(unsigned int)n0x800;
    }
  }
  returnv0;
}
```

看着像是计算EP的大小？还是取了其他什么东西

## ZwQueryVirtualMemory修复

最后的sub_14001859C函数如下：

```cpp
__int64sub_14001859C()
{
  if( !ZwQueryVirtualMemory && (unsigned int)GetNtBuildNumber() == 2600 )
    ZwQueryVirtualMemory = GetSSDTFunction(178);
  returnsub_140017910();
}
```

单独放一块肯定有啥说法

sub_140017910由于涉及到字符串xor混淆，写到这有点饿了，下次再还原

```cpp
voidsub_140017910()
{
  charv0; // di
  __int64v1; // rax
  struct_KPROCESS *VirtualAddress; // rax
  struct_KPROCESS *PROCESS; // rsi
  __int64ProcessPeb; // rax
  __int64v5; // rax
  _QWORD *n16_1; // rdx
  _QWORD *n16; // rcx
  __int16n102; // r8
  unsigned __int64n9; // rax
  char*v10; // rax
  char*v11; // r10
  intv12; // r9d
  intv13; // r8d
  __int64v14; // rsi
  unsigned __int64n0xE; // rcx
  __int64v16; // rax
  unsigned __int64n0xF; // rcx
  __int64v18; // rax
  unsigned __int64n0x10; // rcx
  __int64v20; // rax
  unsigned __int64n0x13; // rcx
  __int64v22; // rax
  unsigned __int64n0x15; // rcx
  __int64v24; // rax
  unsigned __int64n0x16; // rcx
  __int64v26; // rax
  _DWORD v27[4]; // [rsp+20h] [rbp-118h] BYREF
  __int64n655370; // [rsp+30h] [rbp-108h]
  __m128i v29; // [rsp+38h] [rbp-100h] BYREF
  charLmEMORY[8]; // [rsp+48h] [rbp-F0h] BYREF
  __m128i v31; // [rsp+50h] [rbp-E8h] BYREF
  charH_hjw_[7]; // [rsp+60h] [rbp-D8h] BYREF
  __m128i v33; // [rsp+67h] [rbp-D1h] BYREF
  intn251926811; // [rsp+77h] [rbp-C1h]
  charv35; // [rsp+7Bh] [rbp-BDh]
  __m128i v36; // [rsp+7Ch] [rbp-BCh] BYREF
  __int16n28; // [rsp+8Ch] [rbp-ACh]
  __m128i v38; // [rsp+8Eh] [rbp-AAh] BYREF
  charv39; // [rsp+9Eh] [rbp-9Ah]
  __m128i si128; // [rsp+9Fh] [rbp-99h] BYREF
  unsigned __int64n9_1; // [rsp+B0h] [rbp-88h]
  unsigned __int64n0xE_1; // [rsp+B8h] [rbp-80h]
  unsigned __int64n0xF_1; // [rsp+C0h] [rbp-78h]
  unsigned __int64n0x10_1; // [rsp+C8h] [rbp-70h]
  unsigned __int64n0x13_1; // [rsp+D0h] [rbp-68h]
  unsigned __int64n0x15_1; // [rsp+D8h] [rbp-60h]
  unsigned __int64n0x16_1; // [rsp+E0h] [rbp-58h]
  struct_KAPC_STATE ApcState; // [rsp+E8h] [rbp-50h] BYREF
  v0 = 0;
  v1 = sub_140016310();
  if( v1 )
  {
    VirtualAddress = (struct_KPROCESS *)sub_14001E000(v1);
    PROCESS = VirtualAddress;
    if( VirtualAddress )
    {
      if( MmIsAddressValid(VirtualAddress) )
      {
        if( !(unsigned __int8)j_IsProcessExit(PROCESS) )
        {
          KeStackAttachProcess(PROCESS, &ApcState);
          v0 = 1;
          ProcessPeb = PsGetProcessPeb(PROCESS);
          if( ProcessPeb )
          {
            v5 = *(_QWORD *)(ProcessPeb + 24);
            if( v5 )
            {
              n16_1 = *(_QWORD **)(v5 + 32);
              n16 = n16_1;
              if( n16_1 )
              {
                while( 1 )
                {
                  if( n16 != (_QWORD *)16 )
                  {
                    n102 = 102;
                    v27[0] = 524390;
                    v27[1] = 131090;
                    v27[2] = 655370;
                    v27[3] = 131144;
                    n655370 = 655370;
                    n9 = 0;
                    n9_1 = 0;
                    while( n9 < 9 )
                    {
                      *((_WORD *)v27 + ++n9) ^= n102;
                      n9_1 = n9;
                      n102 = v27[0];
                    }
                    WORD2(n655370) = 0;
                    v10 = (char*)n16[10];
                    v11 = (char*)((char*)v27 + 2 - v10);
                    do
                    {
                      v12 = *(unsigned __int16*)&v11[(_QWORD)v10];
                      v13 = *(unsigned __int16*)v10 - v12;
                      if( v13 )
                        break;
                      v10 += 2;
                    }
                    while( v12 );
                    if( !v13 )
                      break;
                  }
                  n16 = (_QWORD *)*n16;
                  if( n16 == n16_1 )
                    gotoLABEL_48;
                }
                v14 = n16[4];
                if( v14 )
                {
                  si128 = _mm_load_si128((const__m128i *)&xmmword_14002A550);
                  n0xE = 0;
                  n0xE_1 = 0;
                  while( n0xE < 0xE )
                  {
                    si128.m128i_i8[++n0xE] ^= si128.m128i_i8[0];
                    n0xE_1 = n0xE;
                  }
                  si128.m128i_i8[15] = 0;
                  v16 = sub_14001B43C(v14, &si128.m128i_i8[1]);
                  if( v16 )
                    qword_1400315C0 = sub_1400178E4(v16);
                  v38 = _mm_load_si128((const__m128i *)&xmmword_14002A590);
                  v39 = 0;
                  n0xF = 0;
                  n0xF_1 = 0;
                  while( n0xF < 0xF )
                  {
                    v38.m128i_i8[++n0xF] ^= v38.m128i_i8[0];
                    n0xF_1 = n0xF;
                  }
                  v39 = 0;
                  v18 = sub_14001B43C(v14, &v38.m128i_i8[1]);
                  if( v18 )
                    qword_1400315C8 = sub_1400178E4(v18);
                  v36 = _mm_load_si128((const__m128i *)&xmmword_14002A540);
                  n28 = 28;
                  n0x10 = 0;
                  n0x10_1 = 0;
                  while( n0x10 < 0x10 )
                  {
                    v36.m128i_i8[++n0x10] ^= v36.m128i_i8[0];
                    n0x10_1 = n0x10;
                  }
                  HIBYTE(n28) = 0;
                  v20 = sub_14001B43C(v14, &v36.m128i_i8[1]);
                  qword_140031638 = v20;
                  if( v20 )
                    qword_1400315D0 = sub_1400178E4(v20);
                  v33 = _mm_load_si128((const__m128i *)&xmmword_14002A560);
                  n251926811 = 251926811;
                  v35 = 0;
                  n0x13 = 0;
                  n0x13_1 = 0;
                  while( n0x13 < 0x13 )
                  {
                    v33.m128i_i8[++n0x13] ^= v33.m128i_i8[0];
                    n0x13_1 = n0x13;
                  }
                  v35 = 0;
                  v22 = sub_14001B43C(v14, &v33.m128i_i8[1]);
                  if( v22 )
                    qword_1400315E0 = sub_1400178E4(v22);
                  v31 = _mm_load_si128((const__m128i *)&xmmword_14002A580);
                  strcpy(H_hjw_, "H`hjw|");
                  n0x15 = 0;
                  n0x15_1 = 0;
                  while( n0x15 < 0x15 )
                  {
                    v31.m128i_i8[++n0x15] ^= v31.m128i_i8[0];
                    n0x15_1 = n0x15;
                  }
                  H_hjw_[6] = 0;
                  v24 = sub_14001B43C(v14, &v31.m128i_i8[1]);
                  if( v24 )
                    qword_1400315E8 = sub_1400178E4(v24);
                  v29 = _mm_load_si128((const__m128i *)&xmmword_14002A570);
                  strcpy(LmEMORY, "LmEMORY");
                  n0x16 = 0;
                  n0x16_1 = 0;
                  while( n0x16 < 0x16 )
                  {
                    v29.m128i_i8[++n0x16] ^= v29.m128i_i8[0];
                    n0x16_1 = n0x16;
                  }
                  LmEMORY[7] = 0;
                  v26 = sub_14001B43C(v14, &v29.m128i_i8[1]);
                  if( v26 )
                    qword_1400315D8 = sub_1400178E4(v26);
                }
              }
            }
          }
        }
      }
    }
  }
LABEL_48:
  if( v0 )
    KeUnstackDetachProcess(&ApcState);
}
```

欢迎各位道友批评指正
