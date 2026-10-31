---
title: "[Learning] Kernel Debugging, Basic Driver Programming, and Basic BYOVD"
source: https://iss4cf0ng.github.io/2026/10/31/2026-10-31-KernelDebugging/
source_host: iss4cf0ng.github.io
clip_date: 2026-10-31T23:47:01+08:00
trace_id: 9f7ed4d3-59cf-4d77-9f6d-dff06c02b2ba
content_hash: d217714d5a51d070aa53c0703a71373825f2ec61621dcacb3db112564ab1a23e
status: synced
tags:
  - 内核
  - 驱动开发
series: null
feed_source: iss4cf0ng·漏洞利用学习
ai_summary: WinDbg 搭建 Windows 内核调试环境的完整流程：XP 用命名管道、现代系统用 KDNET，并在 XP 上开发首个驱动、触发 BSOD、实现最小 BYOVD 示例。
ai_summary_style: key-points
images_status:
  total: 36
  succeeded: 36
  failed_urls: []
notion_page_id: 40a75244-d011-8171-a271-c998753b809c
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> WinDbg 搭建 Windows 内核调试环境的完整流程：XP 用命名管道、现代系统用 KDNET，并在 XP 上开发首个驱动、触发 BSOD、实现最小 BYOVD 示例。
> 
> - **调试方式选择：** 虚拟机可用命名管道（COM）调试——XP 需改 `boot.ini` 加 `/debug /debugport=COM1 /baudrate=115200` 并在 VMware 添加串口；Vista 起改用 `bcdedit /dbgsettings serial debugport:1 baudrate:115200` 与 `bcdedit /debug on`；Win8+ 微软建议改用 KDNET。
> - **KDNET 网络调试：** 配置命令为 `bcdedit /dbgsettings net hostip:192.168.X.X port:50000`，可调试远程物理机且速度比串口快；底层用 UDP 传输但表现可靠，作者推测微软实现了自定义可靠性机制。连接串：`net:port=50000,key=<KEY>,target=<IP>`；命名管道为 `com:port=\\.\pipe\com_debug,pipe,reconnect`。
> - **其它调试技术：** USB 调试物理机必须用带调试电路的专用线（普通 USB-A 对 USB-A 线会损坏硬件）；EXDI 可做固件级（UEFI/BIOS）调试，适合分析 rootkit/bootkit；1394 因 DMA 可被物理接触攻击者直接读内存且硬件已淘汰，不再是现代可行方案。
> - **XP 驱动开发：** 安装 WDK 7.1.0（ISO 挂载），写 `helloworld.c` + 无扩展名 `makefile` + `sources` 三件套，WDK 构建环境跑 `build` 生成 `helloworld.sys`，用 `sc create helloworld type= kernel binPath=...` 加载，DebugView 勾选 Capture Kernel 即可看到 `KdPrint` 输出。
> - **内核态异常与 BYOVD 入门：** 内核驱动未处理异常会直接蓝屏，可用 `KeBugCheckEx(0xDEADBEEF,...)` 主动触发；BYOVD 通过 `IoCreateDevice` + `IoCreateSymbolicLink` 暴露设备，Ring3 用 `CreateFile` + `DeviceIoControl` 传 IOCTL；`CTL_CODE` 四参数中 `METHOD_NEITHER` 不复制不校验、直接传用户态虚拟地址给驱动，处理不当即成漏洞，示例实现了 Ring3 数据经 Ring0 回写的 PoC。

## Introduction

This article explains how to set up a Windows kernel debugging environment using **WinDbg** and how to develop a simple driver.

Recently, I have been studying MS12-020, a Windows vulnerability that requires an understanding of kernel debugging. Before working on this vulnerability, I had never performed kernel debugging before.

Therefore, I decided to write this article to document the process of setting up an experimental environment and developing a simple driver.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0e20987b88df78b8.png)

## Kernel Debugging

Kernel debugging is an essential technique when studying kernel exploitation and kernel-level backdoors.

WinDbg is Microsoft’s official debugging tool and one of the most commonly used tools for Windows kernel debugging.

In this section, I will introduce several debugging methods and demonstrate how to perform kernel debugging on Windows XP, Windows 7, and Windows 10. These examples cover both legacy and modern Windows systems, as well as virtual machines and physical machines.

## Named Pipe (COM)

This method is designed for debugging a **virtual machine**.

A named pipe is a named, one-way or duplex communication channel between a pipe server and one or more pipe clients. All instances of a named pipe share the same pipe name, but each instance has its own buffers and handles, providing a separate communication channel between the client and server.

> Note: If you are interested in this technique, you can refer to [the MSDN documentation](https://learn.microsoft.com/en-us/windows/win32/ipc/named-pipes).

**Modern Windows systems (Windows 8 and later) should preferably not be debugged using this method. Instead, Microsoft recommends using KDNET.**

The general procedure for debugging the Windows kernel through a named pipe is almost the same across different Windows versions, with a few differences.

First, we need to configure the Boot Configuration Data (BCD) to enable kernel debugging during the Windows boot process.

On Windows XP, we need to modify `C:\boot.ini`. However, this file is read-only by default.

Therefore, we need to change its permissions to make it writable:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/17ab072a71e988de.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6431f34332559ebd.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c48c18c0f694c3a2.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/998b91d464d20c83.png)

Then, append the following arguments to the `[operating systems]` entry and save the file:

```
/debug /debugport=COM1 /baudrate=115200
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/efce91d425914410.png)

Next, shut down the virtual machine.

Open the Settings panel of your Windows XP virtual machine in VMware Workstation, add a new serial port, and configure it as follows:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/39c98a932e1eb34e.png)

Here, I chose the named pipe option:

```
\\.\pipe\com_debug
```

Finally, we can connect to the Windows XP kernel using WinDbg:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/15e1da0fb2b92a17.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/61276359ceb7306b.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d2180bc1ca10d663.png)

Starting with Windows Vista, Microsoft replaced `C:\boot.ini` with the Boot Configuration Data (BCD) store, which can be configured using `bcdedit.exe`.

Therefore, we can enable kernel debugging by running the following commands with administrative privileges:

```
bcdedit /dbgsettings serial debugport:1 baudrate:115200
bcdedit /debug on
```

After configuring the target machine, the remaining steps for connecting to it with WinDbg are similar to those for Windows XP.

## KDNET (Kernel Debugging over Network)

Kernel Debugging over Network (KDNET) is a network-based debugging solution designed for remote Windows kernel debugging.

Named pipe debugging is primarily used to debug virtual machines running on the same host. KDNET, however, allows us to debug not only virtual machines but also remote physical devices over a network. In addition, it generally provides faster communication than traditional serial debugging.

We can use the command below to check if KDNET is available:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f5c7ee7dd708e2f1.png)

We can configure KDNET by running the following commands with administrative privileges:

```
bcdedit /debug on
bcdedit /dbgsettings net hostip:192.168.X.X port:50000
bcdedit /dbgsettings
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/29bf0d584b3edc2d.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/494f19a0be820045.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/23709853de4b03f9.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/53913022f813c3cb.png)

Here, I noticed something interesting. Although KDNET uses UDP as its transport protocol, the communication still appears to be reliable. Since I couldn’t find any detailed information about its implementation, I suspect that Microsoft may have implemented a custom mechanism to ensure reliable data transmission.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/827f775dd8f8f341.png)

## Paste Connection String

After configuring the target machine, WinDbg provides connection strings that we can use to connect to it.

For KDNET:

```
net:port=50000,key=<KEY>,target=<Target IP>
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0c0981ccd78716b5.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0e623f58bddf9470.png)

For named pipe debugging:

```
com:port=\\.\pipe\com_debug,pipe,reconnect
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/be7fa9e499dfa225.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7f03d5939880d631.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/739434e2b68470b0.png)

## Local

This method is designed for debugging the local machine.

In practice, however, we rarely use it to debug the currently running Windows operating system in the same way that we debug a separate target machine.

Instead, local kernel debugging is useful for examining kernel data structures, memory, and Windows APIs.

## Other Techniques

-   **USB:** This method is used for debugging physical machines. In certain scenarios, we may prefer to debug a physical Windows system, or the target machine may need to remain isolated from a network. In these cases, we need to connect directly to the target machine using a **special USB debug cable**.
    
    If the target device supports USB 2.0 debugging, we need a compatible USB 2.0 debug cable with the required debugging circuitry. If the target device supports USB 3.0 debugging, we need a compatible Microsoft USB 3.0 debug cable. This cable uses two male USB Type-A connectors and does not provide a VBUS connection.
    
    **We CANNOT use an ordinary USB-A-to-USB-A cable for this purpose.** Using an incompatible cable can damage the connected hardware.
    
-   **EXDI:** This technique can be used for kernel debugging and **firmware debugging**. It allows us to perform debugging at a lower level, potentially before the operating system has been loaded, such as when analyzing UEFI or BIOS firmware. In other words, this technique can help us investigate the system beyond the operating system itself. Depending on the hardware and debugging interface, it can also be useful when analyzing rootkits and bootkits.
    
-   **1394:** This is a legacy debugging method. Before USB 3.0 became widely available, FireWire (IEEE 1394) provided relatively high-speed communication, with transfer rates of 400 Mbps to 800 Mbps. It also supports Direct Memory Access (DMA), which allows connected devices to access system memory directly.
    
    However, this capability also introduces security risks. An attacker with physical access to a system and a suitable DMA-capable device could potentially access memory without logging into the operating system.
    
    Due to these security concerns and changes in hardware and Windows support, 1394 debugging is no longer a practical choice for modern Windows systems. For low-level debugging on modern platforms, we can consider alternatives such as Intel Direct Connect Interface (DCI) or virtual machines with EXDI support.
    

Due to hardware requirements and physical limitations, I will not cover these techniques in this article. However, I may introduce them in future articles if I get the opportunity!

## Writing a Simple Custom Driver

Lastly, I want to introduce how to develop a simple custom driver and debug it. I believe this will help us take our first steps into the world of driver development and **BYOVD (Bring Your Own Vulnerable Driver) attacks!**

In this article, I will demonstrate how to develop a custom driver **on Windows XP only**. However, I plan to write another article covering driver development on modern Windows systems in the future.

## Environment Setup

First, download the [Windows Driver Kit (WDK) for Windows XP/7 (Windows Driver Kit Version 7.1.0)](https://www.microsoft.com/en-us/download/details.aspx?id=11800). The downloaded file is an ISO image, so we need to mount it on our Windows XP virtual machine:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/24217447f0cfea94.png)

Then, install it just like [VMware Tools](https://iss4cf0ng.github.io/2026/02/21/2026-2-21-WinXpVMWareTool/):

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/dd699312858f435f.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ab329a2275c16640.png)

## Development

Create a new folder to serve as our workspace. Then, save the following code as `helloworld.c`:

```c
// helloworld.c

#include <ntddk.h>

VOID DriverUnload(IN PDRIVER_OBJverObject)
{
    UNREFERENCED_PARAMETER(driverObject);
    KdPrint(("DriverUnload: Bye bye!\n"));
}

NTSTATUS DriverEntry(IN PDRIVER_OBJECT driverObject, IN PUNICODE_STRING registryPath)
{
    UNREFERENCED_PARAMETER(registryPath);

    KdPrint(("DriverEntry: Hello world driver demo!\n"));

    driverObject->DriverUnload = DriverUnload;

    return STATUS_SUCCESS;
}
```

Next, we also need a `makefile` (without a file extension):

```
!IF 0
Copyright (C) Microsoft Corporation, 1999 - 2002
Module Name:
makefile.
Notes:
DO NOT EDIT THIS FILE!!! Edit .\sources. if you want to add a new source
file to this component. This file merely indirects to the real make file
that is shared by all the components of Windows NT (DDK)
!ENDIF
!INCLUDE $(NTMAKEENV)\makefile.def
```

Finally, save the following content in a file named `sources` (also without a file extension):

```toml
TARGETNAME=helloworld
TARGETTYPE=DRIVER
SOURCES=helloworld.c
```

These are the essential files required to build our driver.

Once everything is ready, open the WDK Build Environment and run:

```
build
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/e3c5af3222c678ac.png)

After the compilation process finishes, the driver file `helloworld.sys` should be generated.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c439541629b57ca1.png)

## Loading the Driver

To load our driver into the operating system, we can use the following commands:

```powershell
sc create helloworld type= kernel binPath= "system32\driver\helloworld.sys"
sc start helloworld
sc stop helloworld
sc delete helloworld
```

Alternatively, we can use other tools designed for driver development:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0015e8b969a38986.png)

After compiling, we should have the `helloworld.sys` file.

Move it to the following directory:

```
C:\Windows\system32\drivers\helloworld.sys
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/95981da29c1d77c1.png)

Next, open **DebugView** (included in the Sysinternals Suite) and enable `Capture Kernel`.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b08692cd10420f24.png)

Then, register our custom driver and start the service. We should be able to see the debug messages generated by our driver, confirming that it has been successfully loaded.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/519061554e7b8bd2.png)

We can also demonstrate this using WinDbg:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f83c4f5553cbb8c9.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0f713a1d747e1b7a.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a124e4b822b4cf69.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6f9d10cfb4bdbc48.png)

## Crashing

One of the biggest headaches when developing drivers is dealing with exceptions.

When developing a user-mode application, an exception does not necessarily cause the entire application to terminate. Depending on how the exception is handled, the application may be able to continue running.

For example, if we find a buffer overflow vulnerability, we may be able to trigger an exception and crash the application, just like what I demonstrated in [From Bug To Exploit](https://iss4cf0ng.github.io/FromBugToExploit/).

However, things are quite different in kernel mode. If a driver causes an unhandled exception or encounters a fatal error, the operating system may trigger a **Blue Screen of Death (BSoD)**.

The following code demonstrates how to intentionally trigger a BSoD using `KeBugCheckEx()`. Alternatively, we can trigger a kernel-mode exception that may eventually lead to a system crash.

```c
// bsod.c

#include <ntddk.h>

VOID DriverUnload(IN PDRIVER_OBJECT driverObject)
{
    UNREFERENCED_PARAMETER(driverObject);
    KdPrint(("DriverUnload: out\n"));
}

NTSTATUS DriverEntry(IN PDRIVER_OBJECT driverObject, IN PUNICODE_STRING registryPath)
{
    UNREFERENCED_PARAMETER(registryPath);

    KdPrint(("DriverEntry: BSOD\n"));

    driverObject->DriverUnload = DriverUnload;

    KeBugCheckEx(0xDEADBEEF, 0x1111, 0x2222, 0x3333, 0x4444);

    return STATUS_SUCCESS;
}
```

## Basic BYOVD

Lastly, I want to introduce the basic concepts behind BYOVD.

In short, BYOVD (Bring Your Own Vulnerable Driver) is a technique commonly used for privilege escalation and security evasion. An attacker takes advantage of a vulnerable driver that can be loaded into the operating system. Since drivers run in Kernel Mode, exploiting an unsafe driver interface may allow an attacker to perform privileged operations that would otherwise be restricted in User Mode.

```c
// exploitme.c

#include <ntddk.h>

#define DEVICE_NAME L"\\Device\\ExploitMe"
#define DEVICE_LINK L"\\DosDevices\\ExploitMe"
#define FILE_DEVICE_EXPLOIT_ME 0x00008888
#define IOCTL_EXPLOIT_ME (ULONG)CTL_CODE(FILE_DEVICE_EXPLOIT_ME, 0x800, METHOD_NEITHER, FILE_WRITE_ACCESS)

NTSTATUS DrvDispatch(IN PDEVICE_OBJECT driverObject, IN PIRP pIrp);
VOID DrvUnload(IN PDRIVER_OBJECT DriverObject);

NTSTATUS DrvDispatch(IN PDEVICE_OBJECT driverObject, IN PIRP pIrp)
{
    PIO_STACK_LOCATION pIrpStack;
    PVOID Type3InputBuffer;
    PVOID UserBuffer;
    ULONG inputBufferLength;
    ULONG outputBufferLength;
    ULONG ioControlCode;
    PIO_STATUS_BLOCK IoStatus;
    NTSTATUS ntStatus = STATUS_SUCCESS;

    pIrpStack = IoGetCurrentIrpStackLocation(pIrp);
    Type3InputBuffer = pIrpStack->Parameters.DeviceIoControl.Type3InputBuffer;
    UserBuffer = pIrp->UserBuffer;
    inputBufferLength = pIrpStack->Parameters.DeviceIoControl.InputBufferLength;
    outputBufferLength = pIrpStack->Parameters.DeviceIoControl.OutputBufferLength;
    ioControlCode = pIrpStack->Parameters.DeviceIoControl.IoControlCode;
    IoStatus = &pIrp->IoStatus;
    IoStatus->Status = STATUS_SUCCESS;
    IoStatus->Information = 0;

    switch (ioControlCode)
    {
        case IOCTL_EXPLOIT_ME:
            if (inputBufferLength >= 4 && outputBufferLength >= 4)
            {
                // Passing Ring 3 data to Ring 0

                *(ULONG *)UserBuffer = *(ULONG *)Type3InputBuffer;
                IoStatus->Information = sizeof(ULONG);
            }
            break;
    }

    IoStatus->Status = ntStatus;
    IoCompleteRequest(pIrp, IO_NO_INCREMENT);

    return ntStatus;
}

VOID DrvUnload(IN PDRIVER_OBJECT DriverObject)
{
    UNICODE_STRING symbolicLinkName;
    RtlInitUnicodeString(&symbolicLinkName, L"\\DosDevices\\ExploitMe");
    IoDeleteSymbolicLink(&symbolicLinkName);
    IoDeleteDevice(DriverObject->DeviceObject);
}

NTSTATUS DriverEntry(IN PDRIVER_OBJECT DriverObject, IN PUNICODE_STRING RegistryPath)
{
    NTSTATUS ntStatus;
    UNICODE_STRING deviceName;
    UNICODE_STRING symbolicLinkName;
    PDEVICE_OBJECT deviceObject = NULL;

    RtlInitUnicodeString(&deviceName, L"\\Device\\ExploitMe");

    ntStatus = IoCreateDevice(
        DriverObject,
        0,
        &deviceName,
        FILE_DEVICE_EXPLOIT_ME,
        0,
        FALSE,
        &deviceObject
    );

    if (!NT_SUCCESS(ntStatus)) {
        return ntStatus;
    }

    RtlInitUnicodeString(&symbolicLinkName, L"\\DosDevices\\ExploitMe");
    ntStatus = IoCreateSymbolicLink(&symbolicLinkName, &deviceName);

    if (!NT_SUCCESS(ntStatus)) {
        IoDeleteDevice(deviceObject);
        return ntStatus;
    }

    DriverObject->MajorFunction[IRP_MJ_DEVICE_CONTROL] = DrvDispatch;
    DriverObject->DriverUnload = DrvUnload;

    return STATUS_SUCCESS;
}
```

As shown above, this driver creates a symbolic link named `\\DosDevices\\ExploitMe`. This allows a User Mode application to open the device using the `CreateFile` API and communicate with the driver through `DeviceIoControl`, passing an IOCTL code along with input and output buffers.

We can implement a simple proof of concept as follows:

```cpp
// poc.c
// Ring 3 application

#include <windows.h>
#include <stdio.h>

#define FILE_DEVICE_EXPLOIT_ME 0x00008888
#define IOCTL_EXPLOIT_ME CTL_CODE(FILE_DEVICE_EXPLOIT_ME, 0x800, METHOD_NEITHER, FILE_WRITE_ACCESS)

#define DEVICE_PATH L"\\DosDevices\\ExploitMe"

int main()
{
    printf("[*] Starting ExploitMe PoC...\n");

    HANDLE hDevice = CreateFileW(
        L"\\\\.\\ExploitMe",
        GENERIC_WRITE,
        FILE_SHARE_WRITE,
        NULL,
        OPEN_EXISTING,
        0,
        NULL
    );
    if (INVALID_HANDLE_VALUE == hDevice)
    {
        printf("[-] Error code: %d\n", GetLastError());
        return 1;
    }

    printf("[+] Successfully opened device! Handle=%p\n", hDevice);

    ULONG inputVal = 0xDEADBEEF; //PoC
    ULONG outputVal = 0;

    printf("----- Before DeviceIoControl -----\n");
    printf("[*] inputVal (Source) = 0x%08X\n", inputVal);
    printf("[*] outputVal (Target) = 0x%08X (Address: %p)\n", outputVal, &outputVal);

    DWORD bytesReturned = 0;

    printf("[*] Triggering IOCTL_EXPLOIT_ME...\n");

    BOOL result = DeviceIoControl(
        hDevice,
        IOCTL_EXPLOIT_ME,
        &inputVal,
        sizeof(inputVal),
        &outputVal,
        sizeof(outputVal),
        &bytesReturned,
        NULL
    );

    printf("----- After DeviceIoControl -----\n");

    if (result)
    {
        printf("[+] DeviceIoControl executed successfully\n");
        printf("[*] outputVal (Target) = 0x%08X\n", outputVal);

        if (outputVal == inputVal)
        {
            printf("[!] SUCCESS! Data successfully made a round trip through Ring 0!\n");
            printf("[!] The driver running in Ring 0 wrote 0x%08X directly into your Ring 3 memory.\n", outputVal);
        }
        else
        {
            printf("[-] Data mismatch. outputVal did not change.\n");
        }
    }
    else
    {
        printf("[-] DeviceIoControl failed. Error code: %lu\n", GetLastError());
    }

    CloseHandle(hDevice);

    printf("[*] PoC finished.\n");

    return 0;
}
```

When our application calls `DeviceIoControl` from Ring 3, the following steps take place:

1.  The I/O manager receives the request and packages it into an I/O Request Packet (IRP).
2.  The I/O manager dispatches the IRP to the appropriate driver by calling its corresponding dispatch routine, in this case, `DrvDispatch`.
3.  After the driver finishes processing the request, it completes the IRP by calling `IoCompleteRequest`, allowing the I/O manager to return the result to the application.

Instead of simply reading or writing a stream of bytes, an application can request a specific operation by passing a control code to `DeviceIoControl`. This control code is known as an **IOCTL (I/O Control) code**.

In Windows, an IOCTL code is a 32-bit value generated using the `CTL_CODE` macro:

```c
#define FILE_DEVICE_EXPLOIT_ME 0x00008888
#define IOCTL_EXPLOIT_ME CTL_CODE(FILE_DEVICE_EXPLOIT_ME, 0x800, METHOD_NEITHER, FILE_WRITE_ACCESS)
```

The macro takes four parameters:

-   **Device Type (`FILE_DEVICE_EXPLOIT_ME`):** Defines the device type. Vendor-defined device types generally use values from `0x8000` to `0xFFFF`.
-   **Function Code (`0x800`):** Identifies the operation to be performed by the driver. Vendor-defined function codes generally use values from `0x800` to `0xFFF`. You can think of it as a route in a web API.
-   **Transfer Method (`METHOD_NEITHER`):** Determines how the I/O manager handles the input and output buffers. With `METHOD_NEITHER`, the I/O manager passes the original user-mode virtual addresses to the driver without copying or validating the buffers. The driver is responsible for safely accessing these addresses. As we will see later, mishandling these pointers can introduce serious security vulnerabilities.
-   **Required Access (`FILE_WRITE_ACCESS`):** Specifies the access required on the device handle for the I/O manager to allow this IOCTL request.

In User Mode (Ring 3), the application calls `DeviceIoControl` and provides the IOCTL code, along with the input and output buffers:

```c
DeviceIoControl(
    hDevice,
    IOCTL_EXPLOIT_ME,
    &inputVal, sizeof(inputVal),
    &outputVal, sizeof(outputVal),
    &bytesReturned,
    NULL
);
```

In Kernel Mode (Ring 0), the driver’s dispatch routine retrieves the IOCTL code from the IRP stack and processes the request using a `switch` statement:

```c
switch (ioControlCode) {
    case IOCTL_EXPLOIT_ME:
        // Handle the request...
        break;
}
```

Now, let’s run the PoC program!

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/9e953c448690e0fd.png)

## Conclusion

In this article, I introduced several methods of Windows kernel debugging. I then demonstrated how to develop a simple driver and eventually explored the basic concepts of BYOVD.

Driver development is actually much more complicated than I expected. In addition, BYOVD is an advanced technique used in modern red teaming. The content covered in this article is far from sufficient to fully understand these techniques, and the simple BYOVD example demonstrated above is nowhere near enough for real-world applications.

However, I will keep learning and exploring this field, and hopefully introduce more advanced topics in future articles!

Lastly, I feel like I have finally taken my first steps into the world of kernel and driver development. From webshells and bootkits to buffer overflows, kernel exploitation, and driver programming… It still feels unreal.

If you have any comments or suggestions, please feel free to leave them below!

## THANKS FOR READING!

Well, tough days recently… no new drawing `T.T`

But! I am working on a new one! Hopefully I will share it in next article!

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/3503e9cd600fe7d3.jpg)
