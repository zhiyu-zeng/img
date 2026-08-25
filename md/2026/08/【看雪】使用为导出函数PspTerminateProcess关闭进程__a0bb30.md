---
title: 【看雪】使用为导出函数PspTerminateProcess关闭进程
source: https://bbs.kanxue.com/thread-292766.htm
source_host: bbs.kanxue.com
clip_date: 2026-08-25T08:29:09+08:00
trace_id: 9d1ffb23-08ea-4fad-b984-8c52f2c9fe5f
content_hash: 0c956ed2a92f8020fac3e6c3644836a30c029592a745967321b3c235a9223a21
status: synced
tags:
  - 看雪
  - 内核
  - 驱动开发
series: null
feed_source: 看雪·逆向工程
ai_summary: 使用DriverSection遍历内核模块基址，再用特征码匹配定位未导出函数PspTerminateProcess，最终调用该函数成功结束指定notepad.exe进程。
ai_summary_style: key-points
images_status:
  total: 5
  succeeded: 5
  failed_urls: []
notion_page_id: 3c775244-d011-8151-b157-f35f579a84a1
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 使用DriverSection遍历内核模块基址，再用特征码匹配定位未导出函数PspTerminateProcess，最终调用该函数成功结束指定notepad.exe进程。
> 
> - **函数定位思路：** PspTerminateProcess 虽未导出但实际存在，文章选择特征码匹配方式而非解析 PDB；特征码选取需避开硬编码地址和公共代码，只取函数特有区域。
> - **模块遍历：** 通过 Driver_OBJECT 的 DriverSection 指向 LDR_DATA_TABLE_ENTRY 链表遍历内核模块，识别并取得 ntoskrnl.exe 的基址和镜像大小。
> - **参数推导：** 用 IDA 去除分页并查看交叉引用，发现导出函数 PsTerminateProcess 内部直接调用 PspTerminateProcess；由此确定其签名为 `NTSTATUS func(PEPROCESS, NTSTATUS)`。
> - **代码实现：** 驱动程序先用 RtlCompareMemory 在 ntoskrnl 镜像中扫描特征码（如 `f6 47 01 20 74 12...`），再按特征码相对函数起始偏移 -0x22 计算出函数地址，定义函数指针并调用。
> - **实测效果：** 将驱动中 PID 设置为 1664，注册并运行驱动后，notepad.exe 被成功终止。

环境：winXP

\`PspTerminateProcess\`是为导出函数，所以无法直接通过dll进行调用，\*\*函数只是没有导出，而不是不存在\*\*，对于未导出的函数，我们有两种解决办法，1.特征码匹配，2.解析内核PDB文件，我打算采取特征码匹配的方式得到为导出的函数地址。

思路

1\. 确定\`PspTerminateProcess\`所在的模块

通过\`Driver\_OBJECT\`的成员\`DriverSection

\`指向的\`LDR_DATA_TABLE_ENTRY\`结构，得到内核空间中的各个模块，确定模块之后，即可查找的基地址

## 特征码选取

2\. 在windbg中查看函数\`PspTerminateProcess\`，选取特征码

特征码需要避开硬编码地址(全局变量、间接Call(FF))，硬编码地址可能会因为系统重启而导致模块装载位置变化，从而影响硬编码地址，避开公共代码部分，选择该函数特有的部分

关于特征码我使用的如下区域

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/d02e59af879877a0.webp)

3\. 从基地址开始进行特征码匹配，如果匹配成功会得到我们获取特征码的位置，根据特征码相当于函数开始处的偏移，即可得到该函数的地址

4\. 定义函数指针

## 参数推导

在定义函数指针之前，我们需要搞清楚\`PspTerminateProcess\`的参数，在10-10-12分页下IDA去分页一下函数\`PspTerminateProcess\`，使用交叉引用就可以知道有谁调用了这个函数，最终我们确定了函数\`PsTerminateProcess\`

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/8b81fdfd523e1666.webp) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/d4f8aa7bc4232736.webp)

我们去查阅关于\`PsTerminateProcess\`的资料，会发现该函数是个导出函数

```cpp
NTSTATUS NTAPI PsTerminateProcess(IN PEPROCESS Process,
                   IN NTSTATUS ExitStatus)
{
    /* Call the internal API */
    return PspTerminateProcess(Process, ExitStatus);
}
```

所以我们就可以确定\`PspTerminateProcess\`的函数指针

```cpp
typedef NTSTATUS(*funcPspTerminateProcess)(PEPROCESS process, NTSTATUS ExitStatus);
funcPspTerminateProcess PspTerminateProcess;
```

## 驱动代码实现

代码示例

```cpp
#include <ntifs.h>
 
NTSTATUS UnloadDriver(PDRIVER_OBJECT DriverObject)
{
    DbgPrint("Driver Uninstall!!\n");
}
 
NTSTATUS DriverEntry(PDRIVER_OBJECT DriverObject, PUNICODE_STRING RegistryPath)
{
    DbgPrint("Driver Loading!!\n");
    DriverObject->DriverUnload = UnloadDriver;
 
    //1.获取PspTerminateProcess所在模块的基址
    PDRIVER_OBJECT Driver = DriverObject;
    LIST_ENTRY* pListHead = Driver->DriverSection;
    LIST_ENTRY* pCurrent = pListHead->Flink;
    UINT32 DllBase = 0;
    UINT32 SizeOfImage = 0;
 
    UNICODE_STRING targetName;
    RtlInitUnicodeString(&targetName, L"ntoskrnl.exe");
    while (pCurrent != pListHead)
    {
        PUNICODE_STRING pDllName = (PUNICODE_STRING)((UINT32)pCurrent + 0x2c);
 
        DbgPrint("DllName: %wZ", pDllName);
        UINT32 BaseAddr = *(UINT32*)((UINT32)pCurrent + 0x18);
 
 
 
        if (!RtlCompareUnicodeString(pDllName, &targetName, FALSE))
        {
            DllBase = BaseAddr;
            SizeOfImage = *(UINT32*)((UINT32)pCurrent + 0x20);
            DbgPrint("ntoskrnl GET! Base: %X, Size: %X\n", DllBase, SizeOfImage);
            break;
        }
        pCurrent = pCurrent->Flink;
    }
 
    //2.获取特征码,进行特征码匹配
    UCHAR Buffer1[12] = { 0xf6, 0x47, 0x01, 0x20, 0x74, 0x12, 0x8d, 0x86, 0x74, 0x01, 0x00, 0x00 };
    PUCHAR pBase = (PUCHAR)DllBase;
     
    //特征码匹配
    UINT32 signature_offset; //特征码相对于函数开始处的偏移
    for (UINT32 i = 0; i < SizeOfImage - sizeof(Buffer1); i++)
    {
        __try
        {
            if (RtlCompareMemory(Buffer1, pBase + i, sizeof(Buffer1)) == sizeof(Buffer1))
            {
 
                DbgPrint("PspTerminateProcess GET!!!!!\n");
                DbgPrint("PspTerminateProcess signature found at offset: 0x%X\n", i);
                signature_offset = i;
                break;
            }
        }
        __except (EXCEPTION_EXECUTE_HANDLER)
        {
            continue;
        }
    }
 
    //3.定义PspTerminateProcess的函数指针
    typedef NTSTATUS(*funcPspTerminateProcess)(PEPROCESS process, NTSTATUS ExitStatus);
    funcPspTerminateProcess PspTerminateProcess;
 
    //4.获取PspTerminateProcess函数地址
    PspTerminateProcess = (funcPspTerminateProcess)((UINT32)pBase + signature_offset - 0x22);//特征码相对于函数开始处的偏移，计算出PspTerminateProcess函数地址
    DbgPrint("PspTerminateProcess: %x\n", PspTerminateProcess);
     
    //5.定义PspTerminateProcess函数的参数
    PEPROCESS pEProc;//每个进程都有一个 EPROCESS 结构，里面保存着进程的各种信息，和相关结构的指针。
    HANDLE pid = 1796;//输入要结束的进程PID
    NTSTATUS status = PsLookupProcessByProcessId(pid, &pEProc);//PsLookupProcessByProcessId 函数用于根据进程ID查找对应的EPROCESS结构指针。
 
    //6.调用PspTerminateProcess的函数指针 杀死指定pid的进程
    __try
    {
        PspTerminateProcess(pEProc, 0);
 
    }
    __except (EXCEPTION_EXECUTE_HANDLER)
    {
 
    }
 
    return STATUS_SUCCESS;
}
```

测试

使用PspTerminateProcess函数杀死\`notepad.exe\`

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/665e52a5e6d884a1.webp)

此处的\`pid = 1664\`，修改驱动程序中定义的\`pid\`，生成驱动程序

```cpp
HANDLE pid = 1664;//要结束的进程PID
```

## 实测验证

注册并运行驱动

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/525ad77c56cf1db3.webp)

成功杀死了\`notepad.exe\`

[#调试逆向](https://bbs.kanxue.com/forum-4-1-1.htm) [#其他内容](https://bbs.kanxue.com/forum-4-1-10.htm)
