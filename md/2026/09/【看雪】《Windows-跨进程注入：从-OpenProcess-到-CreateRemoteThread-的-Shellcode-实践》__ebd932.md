---
title: 【看雪】《Windows 跨进程注入：从 OpenProcess 到 CreateRemoteThread 的 Shellcode 实践》
source: https://bbs.kanxue.com/thread-292973.htm
source_host: bbs.kanxue.com
clip_date: 2026-09-17T21:44:16+08:00
trace_id: cb52153f-1253-4c86-ab5e-230110641096
content_hash: 541904f9fd9780a668abb5858b62d226962309ba822edc0f49471ccba1770328
status: synced
tags:
  - 看雪
  - Windows逆向
  - 跨进程注入
series: null
feed_source: 看雪·逆向工程
ai_summary: 跨进程注入需在目标进程执行位置无关 shellcode，通过 PEB 与 PE 导出表动态解析 API，并管理易失寄存器与堆栈平衡。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3de75244-d011-81c2-a098-e97ee7fe7714
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 跨进程注入需在目标进程执行位置无关 shellcode，通过 PEB 与 PE 导出表动态解析 API，并管理易失寄存器与堆栈平衡。
> 
> - **注入链：** OpenProcess → VirtualAllocEx → WriteProcessMemory → CreateRemoteThread；先取 kernel32 基址，再解析 LoadLibraryA/GetProcAddress 加载 user32.dll 并调用 MessageBoxA。
> - **API 定位：** 32 位 PEB 在 fs:[0x30]，64 位在 gs:[0x60]；遍历 PEB->Ldr 的 InMemoryOrderModuleList，用 LDR_DATA_TABLE_ENTRY 偏移取 DllBase，再从 PE 导出表匹配函数名。
> - **Shellcode 约束：** 不能依赖导入表、CRT 和绝对地址；必须用汇编重写，所有 API 地址通过 PEB 与导出表动态解析，保证位置无关。
> - **踩坑：** eax/ecx/edx 易被 API 破坏，LoadLibraryA 会冲掉 edx 保存的 GetProcAddress，导致 0xC0000005；pushad/popad 若中间压栈未清理会堆栈不平衡，关闭弹窗后进程崩溃。
> - **调试：** x64dbg 附加目标进程，在 VirtualAllocEx 后取分配基址下断，写入 payload 后对比代码，单步观察寄存器。

**前言：**

最近在学习Windwos Api, 学到了一些可以操作内存以及进程的函数：OpenProcess/CreateRemoteThread...

忽然发现，可以通过 OpenProcess->VirtualAllocEx->WriteProcessMemory->CreateRemoteThread，通过查阅

了一番资料后，开始了一段惊险刺激的跨进程注入

**目标与思路：**

在目标程序内弹出一个弹窗:

1.先获取到Kernel32.dll的基地址(通过取到基地址来获取到 dos头，pe头，以及函数的实际运行地址)

2.获取LoadLibraryA函数以及GetProcAddress函数的地址

3.调用LoadLibraryA函数加载user32.dll并获取到user32.dll的模块句柄

4.通过GetProcAddress找到MessageBoxA函数的地址

5.调用MessageBoxA函数并成功弹窗

## 前置知识：PEB与导出表

**前置知识：**

**1\. PEB与模块链表**

PEB是什么？

PEB（Process Environment Block，进程环境块）是 Windows 为每个进程维护的核心数据结构，存储该进程的全局信

息。每个进程只有一个 PEB，而每个线程的 TEB 中都有一个指针指向所属进程的 PEB。 本质上就是一个套娃的过程，最后

套出模块地址

如何获取？

32位下： 位于fs:\[0x30\]

64位下： 位于gs:\[0x60\]

PEB->Ldr (Ldr指向 PEB_LDR_DATA，模块链表)

```cpp
// PEB_LDR_DATA结构体定义:
typedef struct _PEB_LDR_DATA {
    BYTE  Reserved1[8];
    PVOID Reserved2[3];
    LIST_ENTRY InMemoryOrderModuleList;  // <-----按模块在内存中的基址顺序排序的双向链表头
} PEB_LDR_DATA, *PPEB_LDR_DATA;
 
// LIST_ENTRY结构体定义:
typedef struct _LIST_ENTRY {
   struct    _LIST_ENTRY *Flink;  // <-----指向下一个模块的 InMemoryOrderLinks
   struct    _LIST_ENTRY *Blink;  // <-----指向上一个模块的 InMemoryOrderLinks
} LIST_ENTRY, *PLIST_ENTRY, *RESTRICTED_POINTER PRLIST_ENTRY;
 
// InMemoryOrderLinks其实是LDR_DATA_TABLE_ENTRY结构体内的一个字段，我们只是使用他来遍历LDR_DATA_TABLE_ENTRY
// 来获取到对应的模块名称
 
// MY_LDR_DATA_TABLE_ENTRY自定义结构体:（这是根据32位Windows实际布局简化的结构体）
typedef struct _MY_LDR_DATA_TABLE_ENTRY {
    LIST_ENTRY InLoadOrderLinks;              // +0x00
    LIST_ENTRY InMemoryOrderLinks;            // +0x08  ← 链表节点在这里，通过遍历这个双向链表来获取程序加载所有的模块
    LIST_ENTRY InInitializationOrderLinks;    // +0x10
    PVOID      DllBase;                       // +0x18  ← 模块基址
    PVOID      EntryPoint;                    // +0x1C
    ULONG      SizeOfImage;                   // +0x20
    UNICODE_STRING FullDllName;               // +0x24
    UNICODE_STRING BaseDllName;               // +0x2C  ← Buffer
} MY_LDR_DATA_TABLE_ENTRY, * PMY_LDR_DATA_TABLE_ENTRY;
 
// UNICODE_STRING结构体定义：
typedef struct _UNICODE_STRING {
    USHORT Length;
    USHORT MaximumLength;
    PWSTR  Buffer;
} UNICODE_STRING;
// 注意：这些结构体属于 Windows 内部实现，未在官方文档中公开，不同 Windows 版本可能有差异。本文基于 32 位 Windows 10 实测
```

**2\. PE导出表**

```cpp
// 导出表结构体：
typedef struct _IMAGE_EXPORT_DIRECTORY {
    DWORD   Characteristics;
    DWORD   TimeDateStamp;
    WORD    MajorVersion;
    WORD    MinorVersion;
    DWORD   Name;
    DWORD   Base;
    DWORD   NumberOfFunctions;
    DWORD   NumberOfNames;          // AddressOfNameOrdinals/AddressOfNames数组的长度
    DWORD   AddressOfFunctions;     // 函数地址数组
    DWORD   AddressOfNames;         // 函数名称数组
    DWORD   AddressOfNameOrdinals;  // 函数名索引到函数地址索引的映射关系，每个元素都是AddressOfFunctions的索引
} IMAGE_EXPORT_DIRECTORY, * PIMAGE_EXPORT_DIRECTORY;
 
// 导出表获取方式：dos头->pe头->OptionalHeader->DataDirectory->export
```

**在理解了PEB和导出表的结构后，先用C代码在本机验证思路，确认能正确拿到kernel32基址和函数地址。**

```cpp
HMODULE GetKernel32Base() {
 
    PPEB peb = (PPEB)__readfsdword(0x30);
    PPEB_LDR_DATA ldr = *(PPEB_LDR_DATA*)((DWORD)peb + 0x0c);
 
    LIST_ENTRY* head = &ldr->InMemoryOrderModuleList;
    LIST_ENTRY* curr = head->Flink;
 
    // 遍历链表获取kernel32.dll的基地址
    while (curr != head) {
 
        // Flink 指向的是下一个模块的 InMemoryOrderLinks，
        // 而 InMemoryOrderLinks 位于 MY_LDR_DATA_TABLE_ENTRY 的 +0x08 处。
        // 所以要用 CONTAINING_RECORD 减去这个偏移，才能拿到结构体首地址。
        PMY_LDR_DATA_TABLE_ENTRY entry = CONTAINING_RECORD(curr, MY_LDR_DATA_TABLE_ENTRY, InMemoryOrderLinks);
 
        // 在对比字符串时，使用_wcsicmp是因为在BaseDllName.Buffer中存储的是宽字符，每个字符占用2个字节
        if (entry->BaseDllName.Buffer && _wcsnicmp(entry->BaseDllName.Buffer, L"KERNEL32.DLL", 12) == 0) {
            return (HMODULE)entry->DllBase;
        }
 
        curr = curr->Flink;
    }
 
    return NULL;
}
 
// 获取函数地址
// HMODULE hModule： 模块的基地址
// const char* findFuncName：要寻找的函数名称
FARPROC GetFuncAddress(HMODULE hModule, const char* findFuncName) {
 
    // dos头
    IMAGE_DOS_HEADER* dos = (IMAGE_DOS_HEADER*)hModule;
 
    // nt头
    IMAGE_NT_HEADERS* nt = (IMAGE_NT_HEADERS*)((BYTE*)hModule + dos->e_lfanew);
 
    IMAGE_DATA_DIRECTORY* exportDir = &nt->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_EXPORT];
 
    // 导出表
    IMAGE_EXPORT_DIRECTORY* exportDirAddress = (IMAGE_EXPORT_DIRECTORY*)((BYTE*)hModule + exportDir->VirtualAddress);
 
    // 函数地址数组
    DWORD* functions = (DWORD*)((BYTE*)hModule + exportDirAddress->AddressOfFunctions);
 
    // 函数名称数组
    DWORD* names = (DWORD*)((BYTE*)hModule + exportDirAddress->AddressOfNames);
 
    // 函数索引数组  每个元素是 AddressOfFunctions 的索引
    WORD* ordinals = (WORD*)((BYTE*)hModule + exportDirAddress->AddressOfNameOrdinals);
 
    // 匹配名称，找到对应的函数地址
    for (DWORD i = 0; i < exportDirAddress->NumberOfNames; ++i) {
 
        char* funcName = (char*)((BYTE*)hModule + names[i]);
 
        // 这里使用strcmp比较字符是因为导出表里的函数名是ANSI字符串，每个字符大小1字节
        if (strcmp(funcName, findFuncName) == 0) {
 
            WORD ord = ordinals[i];
            DWORD funcRva = functions[ord];
            return (FARPROC)((BYTE*)hModule + funcRva);
        }
    }
 
    return NULL;
 
}
```

## 从C到汇编

**从C到汇编：**

在真实的payload的编写过程中，并不能直接使用c语言去编写payload，因为：

1.不能依赖导入表：shellcode 不是 PE 文件，加载器不会为它解析 MessageBoxA 等函数的地址。

2.不能依赖 CRT：strcmp、malloc、printf 这些来自 C 运行时库，目标进程不一定加载，且需要初始化。

3.必须位置无关：VirtualAllocEx 返回的地址不确定，shellcode 里不能出现绝对地址。

所以必须用汇编重写，所有 API 地址通过 PEB + 导出表动态解析

## 实战与踩坑点

**实战以及踩坑点：**

**坑1：eax/ecx/edx 被 API 破坏**

> push 00007373h; 's' 's' '\\0' '\\0'
> 
> push 65726464h; 'd' 'd' 'r' 'e'
> 
> push 41636F72h; 'r' 'o' 'c' 'A'
> 
> push 50746547h; 'G' 'e' 't' 'P'
> 
> mov edx, esp
> 
> push 0eh; count
> 
> push edx; findFuncName
> 
> push ebx; hMoudule
> 
> call GetFuncAddress
> 
> mov edx, eax; edx = GetProcAddress; <----------这里不应该使用edx保存GetProcAddress的地址
> 
> push 00006C6Ch; "ll\\0\\0"
> 
> push 642E3233h; "32.d"
> 
> push 72657375h; "user"
> 
> push esp
> 
> call ecx; LoadLibraryA("user32.dll"); <---------这里执行完毕后 LoadLibraryA内部做了很多事情，损坏了edx中的值
> 
> push 0041786Fh; "oxA\\0"
> 
> push 42656761h; "ageB"
> 
> push 7373654Dh; "Mess"
> 
> push esp
> 
> push eax
> 
> call edx; GetProcAddress(hMoudule, "MessAgeBoxA"); <--------------调用函数时跳转地址错误导致出现异常
> 
> mov ebx, eax
> 
> 现象：弹窗没弹出来，目标进程直接0xC0000005
> 
> 排查：通过x64dbg附加目标进程，发现在edx在调用时变成了一个无关地址
> 
> 原因：eax/ecx/edx 是易失寄存器，LoadLibraryA 内部大量使用它们，不负责恢复。
> 
> 解决：把跨 API 调用的值放到 ebx/esi/edi 或栈上。

**坑2：pushad/popad导致堆栈不平衡**

> pushad
> 
> push 0; \\0
> 
> push 41797261h; 'a' 'r' 'y' 'A'
> 
> push 7262694Ch; 'L' 'i' 'b' 'r'
> 
> push 64616F4Ch; 'L' 'o' 'a' 'd'
> 
> ......
> 
> popad
> 
> ret
> 
> 现象：弹窗能弹出来，但关闭弹窗后进程立刻 0xC0000005
> 
> 排查：通过x64dbg附加目标进程，对比pushad和popad时的值，发现堆栈不平衡
> 
> 原因：popad 只做 esp += 32，它假设当前 esp 就是 pushad 保存的位置，但中间压栈没清理
> 
> 解决：在popad前进行平栈操作，将之前压入的字符全部出栈
> 
> ps：不能粗心大意

## 调试方法

**调试方法：**

1\. 通过x64dbg附加目标进程

2\. 在执行完VirtualAllocEx函数后，获取到页面分配区域的基址处，通过x64dbg找到该地址并下断点

3\. 写入payload后对比代码是否正确加载

4\. 在可能出现问题的地方下断点，单步执行观察前后寄存器的值

**总结：**

跨进程注入的核心是“在目标进程里创建线程执行代码”，难点在于shellcode的位置无关性和寄存器/栈管理。

这篇文章记录了我从理解 PEB、PE 导出表，到用汇编实现跨进程 shellcode 的完整过程，虽然踩了不少坑但也收获了不少知识，

如果有理解错误的地方欢迎指正。

本文所有实验均在自己的虚拟机、自己的测试程序上完成，仅用于学习 Windows 系统编程原理。 如果有在学习逆向的同学，欢迎交流。
