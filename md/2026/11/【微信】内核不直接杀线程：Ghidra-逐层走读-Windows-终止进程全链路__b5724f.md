---
title: 【微信】内核不直接杀线程：Ghidra 逐层走读 Windows 终止进程全链路
source: https://mp.weixin.qq.com/s/mOpgYlIGxjRLDpDVJgKh-Q
source_host: mp.weixin.qq.com
clip_date: 2026-11-26T08:51:11+08:00
trace_id: 61c6c939-3a92-4517-86e4-5dc5d919eb4f
content_hash: 93f0aba8f4e8b84e3526ce382b0fd7bbb39e404076847f22abb0c0343385aa3d
status: synced
tags:
  - 微信
  - Windows逆向
  - 内核
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: Windows 终止进程采用“强制协作终止”：内核不直接杀线程，而是为每个线程排队工作项，等线程重新被调度时自己退出。
ai_summary_style: key-points
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 42475244-d011-8157-90c4-ce89d313b057
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Windows 终止进程采用“强制协作终止”：内核不直接杀线程，而是为每个线程排队工作项，等线程重新被调度时自己退出。
> 
> - **调用链：** kernel32 只是转发壳，kernelbase 校验句柄后调用 ntdll 的 NtTerminateProcess 发起 syscall，随后进入 ntoskrnl 同名函数。
> - **拒绝条件：** 目标为当前进程或 System 进程返回 0xc0000022；PPL 保护级别不足返回 0xc0000712；WoW64 机器类型不匹配返回 0xc00000bb。
> - **幂等控制：** EPROCESS+0x1e8 的 rundown protection 防止重复终止，已终止进程返回 0xc000010a；终止标志在 EPROCESS+0x1F4 原子置位。
> - **终止机制：** PspBuildThreadList 给线程排队工作项，线程恢复调度后执行 PspExitThread；PspTerminateProcess 遍历并摘链，再延迟清理句柄与对象引用。
> - **遥测线索：** PspTerminateThreadList 在进程死亡时逐 DLL 发送 ETW unload 通知，可与 DLL 加载记录对账。

**赛博生存指南** *2026年11月23日 18:58*

> 原文：https://medium.com/@s12deff/how-windows-terminate-processes-efc0ef7523b1  
> 作者：S12 - 0x12Dark Development  
> 发布时间：2026-11-19  
> 翻译模型：GLM-5.3  
> 质量评分：★★★½（3.5/5） ｜ 标签：内核攻防 · 分析工具与方法论 · 检测基础设施

**AI 摘要**：本文用 Ghidra 从 Win32 的 TerminateProcess 出发逐层下钻到内核：kernel32 只是转发壳，kernelbase 做句柄校验后调 ntdll 的 NtTerminateProcess 发起 syscall；内核侧依次经过 'DbgO' tag 的对象引用、自杀与 System 进程拒绝（0xc0000022）、PPL 保护级别比对（0xc0000712）、WoW64 机器类型检查，以及 EPROCESS+0x1e8 的 rundown protection 防重复终止。核心机制是“强制协作终止”：内核不直接杀线程，而是经 PspBuildThreadList 给每个线程排队工作项，线程重新被调度时自己执行 PspExitThread，最后由 PspTerminateProcess 摘链并延迟清理资源。

“杀进程”是每天都要做的动作，但任务管理器点下“结束任务”之后内核里发生了什么，很少有机会完整看一遍。本篇是 S12 的 Ghidra 走读，从 kernel32 一路拆到 ntoskrnl，把这条链上的每一道关卡摆出来。它跟仓库里几篇旧文能对上：PPL 保护比对与《Fairy Law（滥用 MicrosoftSignedOnly）》互为表里，逐 DLL 的 ETW unload 通知接着《深入解析 Windows 遥测》的检测主线。想弄明白为什么有些进程杀不掉、为什么线程终止是“排队自杀”，这篇把底层路径完整走了一遍。

欢迎来到这篇新文章。今天我们打开 Ghidra，目标是搞清楚 Windows 内部是怎么终止进程的。做法是从 Win32 的 **TerminateProcess** 函数出发（它住在 kernel32.dll 里），然后一层一层往下剥，直到最后一个内核调用。

我们先查这个函数的文档：

https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-terminateprocess

在页面底部我们看到了这个：

![Microsoft 文档页底部的 Requirements 表：DLL 一栏标注 Kernel32.dll](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/741c488fdbac9b86.png)

库是 kernel32.dll，那就把 kernel32.dll 拖进 Ghidra，搜索 TerminateProcess 函数。

## kernel32.dll

```objectivec
BOOL __stdcall TerminateProcess(HANDLE hProcess,UINT uExitCode)

{  
  BOOL BVar1;

/* WARNING: Could not recover jumptable at 0x0001800424a0. Too many branches */  
                    /* WARNING: Treating indirect jump as call */  
                    /* 0x424a0  1503  TerminateProcess */  
  BVar1 = TerminateProcess(hProcess,uExitCode);  
  return BVar1;  
}
```

这段反编译代码看着有点迷惑，它在调用自己？ **不是。**

实际情况更简单：kernel32 里没有代码，它只是 kernelbase.dll 的转发壳。所以接下来要把 kernelbase.dll 导入 Ghidra，再搜 TerminateProcess。

## kernelbase.dll

```objectivec
BOOL __stdcall TerminateProcess(HANDLE hProcess,UINT uExitCode)

{  
  int iVar1;

/* 0x100230  1810  TerminateProcess */  
  if (hProcess == (HANDLE)0x0) {  
    RtlSetLastWin32Error(6);  
  }  
  else {  
    RtlReportSilentProcessExit();  
    iVar1 = NtTerminateProcess(hProcess,uExitCode);  
    if (-1 < iVar1) {  
      return 1;  
    }  
    FUN_180022e50();  
  }  
  return 0;  
}
```

很好，这正是我们要找的。这个函数先检查第一个参数传入的句柄是否有效，有效就调用下一层——NtTerminateProcess，它住在 ntdll.dll 里。

## ntdll.dll

现在把 ntdll.dll 导入 Ghidra，搜索 NtTerminateProcess：

![Ghidra 中 ntdll.dll 的 NtTerminateProcess 反编译视图](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8d82abd1dd7eb2b7.png)

```
undefined8 NtTerminateProcess(void)

{  
  code *pcVar1;  
  undefined8 uVar2;

/* 0x1622c0  659  NtTerminateProcess  
                       0x1622c0  2311  ZwTerminateProcess */  
  if ((DAT_7ffe0308 & 1) == 0) {  
    syscall();  
    return 0x2c;  
  }  
  pcVar1 = (code *)swi(0x2e);  
  uVar2 = (*pcVar1)();  
  return uVar2;  
}
```

很好，syscall 就在这里。

syscall 指令把执行流从用户态（ring 3）切进内核（ring 0）。

接下来要把 ntoskrnl.exe（内核本体）导入 Ghidra。

## ntoskrnl.exe

内核里的第一层是 NtTerminateProcess：

```java
ulonglong FUN_140a0fc60(undefined8 param_1,undefined8 param_2)

{  
  undefined1 uVar1;  
  longlong lVar2;  
  longlong lVar3;  
  char cVar4;  
  uint uVar5;  
  undefined4 uVar6;  
  ulonglong uVar7;  
  undefined1 auStack_f8 [32];  
  longlong *local_d8;  
  longlong *local_d0;  
  undefined8 local_c8;  
  undefined8 local_c0;  
  longlong local_b8;  
  undefined8 local_b0;  
  undefined1 local_a8 [8];  
  ulonglong local_a0;  
  undefined8 local_98;  
  ulonglong local_38;

local_38 = DAT_140e0a740 ^ (ulonglong)auStack_f8;  
  local_c0 = 0;  
  local_c8 = 0;  
  uVar1 = *(undefined1 *)((longlong)SystemReserved1[0xf] + 0x232);  
  local_d0 = &local_b8;  
  local_b8 = 0;  
  local_b0 = 0;  
  local_d8 = (longlong *)CONCAT44(local_d8._4_4_,0x4f676244);  
  uVar7 = FUN_140869650(param_1,0x800,PsProcessType,uVar1);  
  lVar3 = local_b8;  
  if ((int)uVar7 < 0) {  
    return uVar7;  
  }  
  lVar2 = *(longlong *)((longlong)SystemReserved1[0xf] + 0xb8);  
  if ((local_b8 == lVar2) || (local_b8 == PsInitialSystemProcess)) {  
    uVar7 = 0xc0000022;  
  }  
  else {  
    cVar4 = FUN_140a1003c(uVar1,lVar2,local_b8);  
    if (cVar4 == '\0') {  
      uVar7 = *(ulonglong *)(lVar3 + 0x170);  
      if ((uVar7 & 1) != 0) {  
        FUN_1406c6c40(local_a8,0,0x68);  
        local_98 = 1;  
        local_a0 = uVar7;  
        uVar5 = FUN_140235e50(2,0xc,0,local_a8);  
        uVar7 = (ulonglong)uVar5;  
        if ((int)uVar5 < 0) goto LAB_140a0fddf;  
      }  
      if (((*(longlong *)(lVar2 + 0x310) == 0) ||  
          ((*(short *)(lVar2 + 0x6ec) != 0x14c && (*(short *)(lVar2 + 0x6ec) != 0x1c4)))) ||  
         ((*(longlong *)(lVar3 + 0x310) != 0 &&  
          ((*(short *)(lVar3 + 0x6ec) == 0x14c || (*(short *)(lVar3 + 0x6ec) == 0x1c4)))))) {  
        local_d8 = &local_b8;  
        local_d0 = (longlong *)0x0;  
        local_b8 = 0;  
        uVar5 = ObReferenceObjectByHandle(param_2,2,DAT_140fc5140,uVar1);  
        uVar7 = (ulonglong)uVar5;  
        if (-1 < (int)uVar5) {  
          cVar4 = FUN_140216620(lVar3 + 0x1e8);  
          lVar2 = local_b8;  
          if (cVar4 == '\0') {  
            uVar7 = 0xc000010a;  
          }  
          else {  
            uVar6 = FUN_140a10780(lVar3,local_b8,&local_b0);  
            uVar5 = FUN_140a10468(lVar3,lVar2,uVar6,local_b0);  
            uVar7 = (ulonglong)uVar5;  
            FUN_140349e80(lVar3 + 0x1e8);  
          }  
          ObfDereferenceObject(lVar2);  
        }  
      }  
      else {  
        uVar7 = 0xc00000bb;  
      }  
    }  
    else {  
      uVar7 = 0xc0000712;  
    }  
  }  
LAB_140a0fddf:  
  ObfDereferenceObjectWithTag(lVar3,0x4f676244);  
  return uVar7;  
}
```

1.  `ObReferenceObjectByHandleWithTag(handle, 0x800, PsProcessType)`

```
(FUN_140869650 = ObReferenceObjectByHandleWithTag, tag 'DbgO')
```

2.  目标是当前进程或 PsInitialSystemProcess 时拒绝
    

```
STATUS_ACCESS_DENIED (0xc0000022)
```

3.  PspProcessSecurityCheck：PPL 级别比对
    

```
STATUS_PROCESS_IS_PROTECTED (0xc0000712) if blocked
```

4.  WoW64 兼容性检查（机器类型 0x14c/0x1c4）
    

```
STATUS_NOT_SUPPORTED (0xc00000bb) on mismatch
```

5.  `ObReferenceObjectByHandle(ExitStatus, JOB_OBJECT_TERMINATE)`
    
6.  `ExAcquireRundownProtection(EPROCESS+0x1e8)`
    

```
STATUS_PROCESS_IS_TERMINATING (0xc000010a) if already dying
```

7.  PspTerminateAllThreads -> PspBuildThreadList + PspTerminateThreadList
    
8.  PspTerminateProcess（遍历线程，延迟清理）
    
9.  `ExReleaseRundownProtection`
    
10.  `ObfDereferenceObjectWithTag`
     

先看 **PspTerminateAllThreads**：

```
undefined8 FUN_140a10780(undefined8 param_1,undefined8 param_2,undefined8 *param_3)

{  
  undefined8 uVar1;  
  undefined8 uVar2;  
  undefined1 auStack_98 [32];  
  undefined8 *local_78;  
  undefined8 local_68;  
  undefined8 local_60;  
  undefined8 local_58;  
  undefined8 uStack_50;  
  undefined8 local_48;  
  undefined8 uStack_40;  
  undefined8 local_38;  
  undefined8 uStack_30;  
  ulonglong local_28;

local_28 = DAT_140e0a740 ^ (ulonglong)auStack_98;  
  local_78 = &local_60;  
  local_68 = 0;  
  local_58 = 0;  
  uStack_50 = 0;  
  local_60 = 0;  
  local_48 = 0;  
  uStack_40 = 0;  
  local_38 = 0;  
  uStack_30 = 0;  
  uVar1 = FUN_140a108cc(0,param_2,0,&local_68); // PspBuildThreadList  
  uVar2 = 0;  
  if (-1 < (int)uVar1) {  
    FUN_140216820(param_1,0,&local_58);  
    FUN_140a5f86c(param_1,local_68,param_2); // PspTerminateThreadList  
    FUN_140217d30(&local_58,0);  
    ObfDereferenceObjectWithTag(local_68,0x4f676244);  
    uVar1 = 0;  
    uVar2 = local_60;  
  }  
  *param_3 = uVar2;  
  return uVar1;  
}
```

有个关键点在 **PspBuildThreadList** 里：它内部会调 FUN_1408a31c0，而这正是最重要的一环——内核不直接杀线程，而是给 job/container 列表里的每个线程排队一个工作项。

每个线程在重新变为可运行时（比如退出一次等待、或从 syscall 返回），会处理自己的工作项、调用 `PspExitThread` 终止自己。与此同时，PspTerminateProcess 负责清掉那些已经退出的线程、释放它们的资源。

这是一种“强制协作终止”（forced cooperative termination）：线程本质上是在调度器给它 CPU 时间去处理挂起的 APC/工作项之后，“自己杀掉自己”。

```go
int FUN_1408a31c0(  
    longlong param_1,  
    longlong param_2,  
    longlong *param_3,  
    uint param_4,  
    longlong param_5  
)  
{  
    longlong *plVar6;  
    longlong *plVar10;  
    longlong *plVar13;  
    int iVar14;

// Initialize work item  
    if ((param_4 & 2) == 0)  
    {  
        ExAcquireFastMutex(&DAT_140f8f220);

// Resolve job context and check termination conditions  
        param_5 = *(longlong *)(param_1 + 0x308);

KeInitializeEvent(local_1a8, 1);  
    }  
    else  
    {  
        // Allocate work item  
        plVar6 = (longlong *)ExAllocatePool2(0x41, 0x168, 0x45676244);

if (plVar6 == NULL)  
            return -0x3fffff66;

// Reference process and job objects  
        ObfReferenceObjectWithTag(param_1, 0x4f676244);  
        ObfReferenceObjectWithTag(param_2, 0x4f676244);  
    }

// Store process and job references  
    plVar6[7] = param_1;  
    plVar6[8] = param_2;

// Copy input data into work item  
    // (original function copies approximately 0x90 bytes)

// Copy additional job context  
    // ...

if (param_5 == 0)  
    {  
        iVar14 = -0x3ffffcad;  
    }  
    else  
    {  
        // Acquire job lock  
        ExAcquireFastMutex(param_5 + 0x18);

if ((*(uint *)(param_5 + 0x60) & 1) == 0)  
        {  
            // Insert work item into job's linked list  
            plVar10 = *(longlong **)(param_5 + 0x58);

*plVar6 = param_5 + 0x50;  
            plVar6[1] = (longlong)plVar10;

*plVar10 = (longlong)plVar6;  
            *(longlong **)(param_5 + 0x58) = plVar6;

// Signal pending work  
            if ((param_4 & 2) == 0)  
                KeSetEvent(param_5, 0, 0);  
        }  
        else  
        {  
            iVar14 = -0x3ffffcac;  
        }

ExReleaseFastMutex(param_5 + 0x18);  
    }

// Release global lock  
    ExReleaseFastMutex(&DAT_140f8f220);

if (iVar14 >= 0)  
    {  
        // Wait for work item completion  
        KeWaitForMutexObject(plVar6 + 2, 0, 0, 0);

// Retrieve updated data  
        iVar14 = (int)plVar6[9];

// Copy updated data back to caller  
        // ...  
    }

// Cleanup on failure  
    if (iVar14 < 0)  
    {  
        ObfDereferenceObjectWithTag(param_1, 0x4f676244);  
        ObfDereferenceObjectWithTag(param_2, 0x4f676244);  
        ExFreePoolWithTag(plVar6, 0);  
    }

return iVar14;  
}
```

这一步做完，流程走到 **PspTerminateThreadList**——它只是枚举垂死进程里加载的 DLL，给每一个发一条 ETW unload 通知。

最后到达终点，PspTerminateProcess：

```go
ulonglong FUN_140a10468(longlong param_1,longlong param_2,uint param_3)

{  
  longlong ****pppplVar1;  
  uint uVar2;  
  longlong ****pppplVar3;  
  longlong ***ppplVar4;  
  code *pcVar5;  
  longlong lVar6;  
  undefined1 *puVar7;  
  ulonglong uVar8;  
  longlong ****pppplVar9;  
  undefined1 *puVar10;  
  longlong ***ppplVar11;  
  longlong ***ppplVar12;  
  longlong ****pppplVar13;  
  undefined8 uStack_a0;  
  undefined1 auStack_98 [48];  
  undefined8 local_68;  
  longlong **local_60;  
  longlong local_58;  
  longlong ***local_50;  
  longlong ***local_48;

ppplVar12 = SystemReserved1[0xf];  
  puVar10 = auStack_98;  
  local_48 = (longlong ***)&local_50;  
  local_68 = 0;  
  local_50 = (longlong ***)&local_50;  
  local_60 = SystemReserved1[0xf];  
  if (-1 < (int)param_3) {  
    uVar8 = FUN_140b36a42();  
    return uVar8;  
  }  
  local_58 = param_2 + 0x18;  
  ExAcquireFastMutex(local_58);  
  if (-1 < (int)param_3) {  
    if ((*(uint *)(param_2 + 0x60) & 1) == 0) {  
      LOCK();  
      *(uint *)(param_1 + 500) = *(uint *)(param_1 + 500) | 3;  
      UNLOCK();  
      ObfReferenceObject(param_2);  
    }  
    else {  
      *(undefined8 *)(param_1 + 0x308) = 0;  
      param_3 = 0xc0000354;  
    }  
  }  
  pppplVar1 = (longlong ****)(param_2 + 0x50);  
  pppplVar13 = (longlong ****)*pppplVar1;  
  puVar7 = auStack_98;  
  ppplVar11 = ppplVar12;  
  pppplVar9 = pppplVar13;  
  if (pppplVar13 == pppplVar1) goto LAB_140a10576;  
  do {  
    pppplVar13 = (longlong ****)*pppplVar9;  
    uVar2 = *(uint *)((longlong)pppplVar9 + 0x4c);  
    if ((uVar2 & 4) == 0) goto LAB_140a1056d;  
    if (pppplVar9[10] != ppplVar12) goto LAB_140a1056d;  
    ppplVar11 = pppplVar9[8];  
    if ((int)param_3 < 0) {  
      if (((longlong ****)pppplVar13[1] == pppplVar9) &&  
         (pppplVar12 = pppplVar9[1], (longlong ****)*pppplVar12 == pppplVar9)) {  
        *pppplVar12 = (longlong **)pppplVar13;  
        pppplVar13[1] = ppplVar12;  
LAB_140a1052a:  
        if ((longlong ****)*local_48 == &local_50) goto LAB_140a1053e;  
      }  
    }  
    else {  
      if ((uVar2 & 0x10) == 0) {  
        *(uint *)((longlong)pppplVar9 + 0x4c) = uVar2 & 0xfffffffb;  
        *(undefined8 *)(puVar10 + -8) = 0x140a1066d;  
        KeSetEvent(param_2,0,0);  
        uVar8 = FUN_140b36b0f();  
        return uVar8;  
      }  
      LOCK();  
      *(uint *)(ppplVar11 + 0xb4) = *(uint *)(ppplVar11 + 0xb4) | 0x80;  
      UNLOCK();  
      ppplVar12 = *pppplVar9;  
      if (((longlong ****)pppplVar12[1] == pppplVar9) &&  
         (pppplVar4 = pppplVar9[1], (longlong ****)*pppplVar4 == pppplVar9)) {  
        *pppplVar4 = (longlong **)pppplVar12;  
        ppplVar12[1] = (longlong **)pppplVar4;  
        goto LAB_140a1052a;  
      }  
    }  
    while( true ) {  
      pcVar5 = (code *)swi(0x29);  
      local_48 = (longlong ***)(*pcVar5)(3);  
      puVar10 = puVar10 + 8;  
LAB_140a1053e:  
      *pppplVar9 = (longlong ***)&local_50;  
      pppplVar9[1] = local_48;  
      *local_48 = (longlong **)pppplVar9;  
      ppplVar12 = (longlong ***)local_60;  
      local_48 = (longlong ***)pppplVar9;  
      if ((*(uint *)((longlong)pppplVar9 + 0x4c) & 8) != 0) {  
        *(uint *)((longlong)pppplVar9 + 0x4c) = *(uint *)((longlong)pppplVar9 + 0x4c) & 0xfffffff7;  
        *(undefined8 *)(puVar10 + -8) = 0x140a10569;  
        FUN_140349e80(ppplVar11 + 0xb1);  
        ppplVar12 = (longlong ***)local_60;  
      }  
LAB_140a1056d:  
      puVar7 = puVar10;  
      ppplVar11 = ppplVar12;  
      pppplVar9 = pppplVar13;  
      if (pppplVar13 != pppplVar1) break;  
LAB_140a10576:  
      puVar10 = puVar7;  
      lVar6 = local_58;  
      pppplVar9 = (longlong ****)0x0;  
      *(undefined8 *)(puVar10 + -8) = 0x140a1057f;  
      ExReleaseFastMutex(lVar6);  
      while( true ) {  
        if ((longlong ****)local_50 == &local_50) {  
          if (-1 < (int)param_3) {  
            *(undefined8 *)(puVar10 + -8) = 0x140a106a1;  
            FUN_140ac8d0c(param_1);  
          }  
          return (ulonglong)param_3;  
        }  
        if (((longlong ****)local_50[1] != &local_50) ||  
           (pppplVar3 = (longlong ****)*local_50, pppplVar3[1] != local_50)) break;  
        pppplVar3[1] = (longlong ***)&local_50;  
        local_50 = (longlong ***)pppplVar3;  
        *(undefined8 *)(puVar10 + -8) = 0x140a105c3;  
        FUN_140a106ac();  
      }  
    }  
  } while( true );  
}
```

到 PspTerminateProcess 被调用时，有些线程可能已经执行完自己的终止 APC 死掉了，另一些可能还在跑、还没处理到自己的那个。

这个函数的任务就是遍历所有这些工作项，处理每个线程的当前状态，把它们从共享链表里摘下来，然后清理所有已分配的资源（句柄、对象引用……）

-   第一阶段返回非错误状态时提前退出
    

```
if (-1 < (int)param_3) return FUN_140b36a42();
```

-   拿 job/container 的 FastMutex，锁住线程链表
    

```
ExAcquireFastMutex(param_2 + 0x18);
```

-   原子地在 EPROCESS 上设置 terminating 标志位
    

```
LOCK();  
*(param_1 + 500) |= 3; // EPROCESS+0x1F4  
UNLOCK();  
ObfReferenceObject(param_2);
```

-   从链表头开始遍历工作项链表
    

```toml
pppplVar1 = param_2 + 0x50; // LIST_ENTRY head  
pppplVar13 = *pppplVar1; // first entry (Fli
```

-   跳过没在排队或不属于当前线程的条目
    

```
if ((flags & 4) == 0) skip; // not queued  
if (entry[10] != currentThread) skip; // not ours  
ppplVar11 = entry[8]; // ETHREAD*
```

这里有两种情况：

1.  正常路径：把 ETHREAD 标记为已终止并从链表摘除
    

```
LOCK();  
*(ETHREAD + 0x5A0) |= 0x80; // terminated flag  
UNLOCK();  
prev->Flink = next; // RemoveEntryList  
next->Blink = prev;
```

2.  错误路径：取消工作项并唤醒等待者
    

```
*(entry + 0x4c) &= ~4; // clear queued bit  
KeSetEvent(param_2, 0, 0);  
return FUN_140b36b0f();
```

-   把摘下来的条目挪进栈上的延迟清理队列
    

```
entry->Flink = &local_head; // InsertTailList  
entry->Blink = local_tail;  
*local_tail = entry;  
local_tail = entry;
```

-   释放 FastMutex，让别人也能访问链表
    

```
ExReleaseFastMutex(param_2 + 0x18);
```

-   排空延迟清理队列：关句柄、解引用对象、释放 pool
    

```
while (local_head != &local_head)
```

-   发终止通知，把状态码返回给调用者
    

```
FUN_140ac8d0c(EPROCESS);  
return param_3;
```

Windows 终止进程的过程就是这样。有不少辅助函数我略过了——写到这里人已经累了——但最关键的东西都在上面了。

再见;)

## 译者补充：几点解读与延伸

先说这篇和仓库旧文的接口。PPL（Protected Process Light）比对是链路上最常被撞到的一堵墙：PspProcessSecurityCheck 拦的是「保护级别低的调用方去终止级别高的目标」，返回 STATUS_PROCESS_IS_PROTECTED。EDR、杀软的自保护，系统关键进程杀不掉，内核依据都在这一步。它和已译的《Fairy Law（滥用 MicrosoftSignedOnly）》正好是一体两面：Fairy Law 讲的是签名门槛如何被拿来做坏事，这一篇讲的是保护级别如何在终止路径上被执行。两篇对照着读，Windows 的进程保护体系就比较完整了。

EPROCESS+0x1e8 的 rundown protection 值得单独记一笔。它给“正在终止”这个状态加了幂等性：第一次调用会把 rundown 计数拿下来，重复调用直接返回 STATUS_PROCESS_IS_TERMINATING（0xc000010a）。用户态看到的“进程正在终止、再点一次也没用”，底层就是它。终止是异步的——syscall 返回时线程可能还活着，要等调度器逐一安排它们“自杀”完毕，进程对象才真正干净。所以任务管理器里“结束了但还挂着”的窗口期，不是 bug，是这条链的设计。

检测侧的看点在 PspTerminateThreadList：进程死亡时逐 DLL 发 ETW unload 通知。也就是说，进程终止本身就是遥测事件源，DLL 的加载／卸载记录是可以在进程生命周期两端对账的——注入进目标进程的 DLL， unload 通知能否与合法加载记录对上，是《深入解析 Windows 遥测》和 WESP 那条检测主线上可以直接利用的点。

一点引申：以下这层是译者延伸，原文未展开。既然线程要等重新被调度才能处理终止工作项，那么卡在不可调度状态的线程就会拖住整个进程的清理——任务管理器“杀不掉”的进程，除了 PPL 保护，还有这一种形态。反过来对红队也是提示：干扰线程调度或 APC 投递的对抗手法，影响的不只是执行流，还有进程死亡的速度。

最后交代口径：作者自述“略过了不少辅助函数”，本文是主干走读而非穷尽清单；代码里的 FUN\_ 前缀是 Ghidra 对未命名函数的默认命名，作者在文中标注了对应关系（如 FUN_140869650＝ObReferenceObjectByHandleWithTag），阅读时以注释为准。

前沿资讯 · 目录
