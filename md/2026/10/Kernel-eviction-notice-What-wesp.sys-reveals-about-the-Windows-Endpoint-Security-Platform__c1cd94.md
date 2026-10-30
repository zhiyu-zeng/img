---
title: "Kernel eviction notice: What wesp.sys reveals about the Windows Endpoint Security Platform"
source: https://www.elastic.co/security-labs/blog/windows-endpoint-security-platform-wesp
source_host: www.elastic.co
clip_date: 2026-10-31T04:31:00+08:00
trace_id: 0151bfab-3b38-4939-bc26-b7381b3a9db6
content_hash: 82aca82b35e5a2317832a15f03fdc409b217dc3d222894f13d75ce0dcc30f52e
status: synced
tags:
  - Windows逆向
  - 内核
series: null
feed_source: Elastic Security Labs
ai_summary: 微软推出 Windows Endpoint Security Platform（WESP），旨在把 EDR 从内核迁至用户态；通过分析 wesp.sys 与 espclient.dll 揭示其现状与局限。
ai_summary_style: key-points
images_status:
  total: 5
  succeeded: 5
  failed_urls: []
notion_page_id: 40975244-d011-8182-9240-c3d3cffe7e6c
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 微软推出 Windows Endpoint Security Platform（WESP），旨在把 EDR 从内核迁至用户态；通过分析 wesp.sys 与 espclient.dll 揭示其现状与局限。
> 
> - **动因：** 2024 年 7 月 CrowdStrike 错误配置更新导致全球约 850 万台机器蓝屏，微软因此推动 EDR 退出内核，改为自行维护唯一内核驱动以降低 BSOD 风险。
> - **组件：** WESP 已随 Windows Insider 预览版出现，包含内核驱动 wesp.sys（位于 System32\Drivers）和用户态 API espclient.dll，暂无公开文档，但符号可从微软公共符号服务器获取，便于内核调试分析。
> - **驱动形态：** wesp.sys 无设备对象、所有 IRP 分发例程均指向默认处理函数，注册表 Type=2 且依赖 FltMgr，确认是文件系统微过滤驱动，altitude 为 329500，通过 FilterCommunicationPort（对象管理器中的 ESPFilterPort）与用户态双向通信，而非 DeviceIoControl。
> - **能力现状：** espclient.dll 导出约 120 个 Esp 前缀的 C 风格 API（含规则/过滤相关函数），仅引用 FltLib 的连接、收消息、发消息三个函数；缺少 FilterReplyMessage，表明用户态暂无“回复决策”能力，尚不能否决进程创建。
> - **迁移要求：** EDR 采用 WESP 需其覆盖全部通知类型（进程/线程/句柄、注册表、文件、WFP 网络）、支持在驱动侧过滤注册表与文件读等高噪声事件、保留内核级阻断能力，客户端进程预计需以微软签名的 PPL 方式提权运行。

Microsoft is building a way for EDR products to run outside the Windows kernel. It is called the Windows Endpoint Security Platform, and two of its binaries already ship in Windows Insider build. One is the kernel driver wesp.sys, the other the user-mode API `espclient.dll`. Microsoft wants one kernel driver it maintains itself, in place of the one every security vendor currently ships, after the July 2024 CrowdStrike update crashed 8.5 million machines. WESP is undocumented, but the binaries carry public symbols, so a kernel debugging session gets you a fair way in. `wesp.sys` is a file system mini-filter at altitude 329500, talking to user mode over a filter communication port.

## Kernel mode vs user mode: How EDR works today

Are you tired of the Windows Blue Screen of Death? Well, Microsoft decided to take significant action to remove security products from running within the Windows kernel, as kernel components are the ones that can cause Windows to Blue Screen, which can have a significant impact, as was demonstrated a couple of years ago with a bug in a third-party kernel component.

Typical Endpoint Detection and Response (EDR) software consists of two main components: a kernel-mode driver and a user-mode service, communicating in some way, as the following image shows:

![EDR architecture diagram showing kernel mode driver and user mode service either side of the kernel boundary](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/785114f93f108182.png)

The process boxes represent normal user applications running on a system, like Word, Explorer, or Paint. The Service and Kernel Driver are installed by the EDR product.

The kernel driver’s main purpose is to register for various kernel notifications, such as process creation and file writes. Any notification of interest is typically forwarded to the user-mode service where more processing can be done:

-   Forward the notification data to a server for further analysis and aggregation.
    
-   Consult a set of rules that may lead to blocking the operation entirely.
    
-   Alert the human user of the operation, perhaps requiring an interactive decision.
    

This is all well and good, if everything works as planned. Unfortunately, kernel drivers cannot perform illegal operations, such as dereferencing a bad pointer. In that case, the system crashes with the infamous “Blue Screen of Death” (BSOD), and restarting the machine is the only way back in, assuming the offending driver doesn't crash when it loads early at boot.

### Why the CrowdStrike outage changed Microsoft’s mind

That is exactly what happened on July 19, 2024, when a bad configuration file update caused CrowdStrike’s EDR kernel driver to crash on millions of machines worldwide. The risk of kernel drivers crashing systems has existed in Windows since its inception, but this incident was particularly nasty because it rendered so many machines unusable, taking airports, banks, and other critical facilities offline for hours.

Microsoft took this to heart; after all, it's Windows. They launched a new initiative to move EDR products out of the kernel so similar incidents can’t happen. This is non-trivial, however, for a few reasons:

-   The Windows kernel will now have to deliver notifications that EDR kernel drivers expect to the EDR’s user-mode service. This has to be efficient to be usable.
    
-   Existing products will take time to migrate, even if Microsoft provides a full solution, so we must support the existing behavior.
    
-   Any such framework must be flexible enough, and complete enough, to be adopted successfully. If features EDR products require are missing, adoption and migration will be partial at best.
    

## What is the Windows Endpoint Security Platform (WESP)?

The Windows Endpoint Security Platform is Microsoft’s framework for moving EDR products to user space. The project is in its early stages, as shown in Windows Insider builds that include the new platform’s binaries. The main component is a kernel driver, `wesp.sys`, built by Microsoft, and a user-mode API implemented in `espclient.dll` that EDR’s user-mode service would use to connect and receive notifications of interest.

It may seem ironic that the implementation centers on a kernel driver (`wesp.sys`), but there is no way around it; at the end of the day, the kernel must provide the notifications the EDR service expects. So, `wesp.sys` will play the role of an EDR `kernel driver`, but since Microsoft implements it, there will be only one driver to test and debug properly, rather than the current state where every EDR platform has its own in-house kernel driver.

### What EDR vendors need from WESP

At the time of writing, the WESP platform is not publicly documented. There are some expectations, however, that the platform must provide if EDR systems are to adopt it:

-   It should be comprehensive. EDRs today register for notifications in several different ways, each with its own mechanism:
    

**Event type**

**Current registration mechanism**

Process, thread, image, handle

Registration functions with a callback

Registry

Registration functions with a callback

File system

File system mini-filter

Network

WFP callout driver

All these variations add to the complexity of EDR drivers. WESP should provide all of these; otherwise, EDR drivers will continue to exist, albeit with less code for what WESP covers. It’s reasonable to assume that not everything will be provided on day one, but I expect everything to be provided eventually.

-   Some notifications a kernel driver can register for are very “noisy”. For example, Registry and file read operations are happening all the time in large quantities. You can get a sense of that by running Process Monitor (*ProcMon*) from Sysinternals and watching the hundreds of events (or more) displayed every second related to the Registry and the file system (especially read operations). Passing all such events to user mode is not feasible; it would be too slow, or at least inefficient. This means WESP will have to provide some filtering capability, so that events that are not interesting can be dropped “at the source” (the WESP driver), rather than being sent to user mode and dropped there. Flexibility in these rules is paramount, as it can significantly lower the load on the user-mode service.
    
-   A power that only certain kernel notifications have is blocking an operation, something that cannot be done in user mode. The classic example is creating a process – a kernel driver can register for such events with `PsSetCreateProcessNotifyRoutineEx` – a documented function all EDRs use. The callback is invoked while process creation is in progress, allowing it to set a failure status for the process creation if it so desires (for example, by inspecting the new process command line and deciding it’s malicious). Such power does not exist in user mode – you can get notified when a process is created, but you cannot veto creation. WESP clients (user mode) must be given this power so they can block process creation under certain conditions. These conditions should be flexible enough to be configured in most cases. Ideally, it should let the user-mode service run custom code before replying to the driver `with` whether to allow or block process creation.
    
-   Client processes that work with ESP must run elevated to access the platform. They will likely need to run as Protected Processes Light (PPL), signed by Microsoft, which is how EDR services run today, at least with most vendors, since it’s not currently required.
    

## Inside wesp.sys: What the binaries reveal

Though not documented yet, we can get some WESP details by examining the binaries provided. As a nice bonus, the symbols for these binaries are provided by the Microsoft public symbol server.

Running a local kernel debugging session on a VM with WESP installed can give us some insights into how WESP works. First, the WESP driver file is `wesp.sys` located in the `System32\Drivers` directory, where most drivers live. We can examine the Registry where drivers are installed to find the key name, which is also the driver kernel object name:

![Registry Editor showing the wesp service key with ImagePath system32\\drivers\\wesp.sys and Type 2 file system driver](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ab1154820f4e0ceb.png)

R e g i s t r y E d i t o r s h o w i n g t h e w e s p s e r v i c e k e y w i t h I m a g e P a t h s y s t e m 32 \\drivers \\wesp.s y s a n d T y p e 2 f i l e s y s t e m d r i v e r

Clearly, the driver’s name is simply `wesp`. With that detail in hand, we can look in WinDbg for the major functions supported by the driver (some formatting done for better readability):

lkd>!drvobj wesp f Driver object (ffffc0e9fe2e6310) is for: \\FileSystem\\wesp Driver Extension List: (id, addr) Device Object list: Flags: 0x00000012 0x00000002 DRVO_LEGACY_DRIVER 0x00000010 DRVO_INITIALIZED DriverEntry: fffff80564281000 wesp!DriverEntry DriverStartIo: 00000000 DriverUnload: 00000000 AddDevice: 00000000 Dispatch routines: \[00\] IRP_MJ_CREATE fffff805d07a14d0 nt!IopInvalidDeviceRequest \[01\] IRP_MJ_CREATE_NAMED_PIPE fffff805d07a14d0 nt!IopInvalidDeviceRequest \[02\] IRP_MJ_CLOSE fffff805d07a14d0 nt!IopInvalidDeviceRequest \[03\] IRP_MJ_READ fffff805d07a14d0 nt!IopInvalidDeviceRequest \[04\] IRP_MJ_WRITE fffff805d07a14d0 nt!IopInvalidDeviceRequest \[05\] IRP_MJ_QUERY_INFORMATION fffff805d07a14d0 nt!IopInvalidDeviceRequest \[06\] IRP_MJ_SET_INFORMATION fffff805d07a14d0 nt!IopInvalidDeviceRequest \[07\] IRP_MJ_QUERY_EA fffff805d07a14d0 nt!IopInvalidDeviceRequest \[08\] IRP_MJ_SET_EA fffff805d07a14d0 nt!IopInvalidDeviceRequest … \[0e\] IRP_MJ_DEVICE_CONTROL fffff805d07a14d0 nt!IopInvalidDeviceRequest \[0f\] IRP_MJ_INTERNAL_DEVICE_CONTROL fffff805d07a14d0 nt!IopInvalidDeviceRequest \[10\] IRP_MJ_SHUTDOWN fffff805d07a14d0 nt!IopInvalidDeviceRequest \[11\] IRP_MJ_LOCK_CONTROL fffff805d07a14d0 nt!IopInvalidDeviceRequest \[12\] IRP_MJ_CLEANUP fffff805d07a14d0 nt!IopInvalidDeviceRequest \[13\] IRP_MJ_CREATE_MAILSLOT fffff805d07a14d0 nt!IopInvalidDeviceRequest \[14\] IRP_MJ_QUERY_SECURITY fffff805d07a14d0 nt!IopInvalidDeviceRequest \[15\] IRP_MJ_SET_SECURITY fffff805d07a14d0 nt!IopInvalidDeviceRequest … \[1b\] IRP_MJ_PNP fffff805d07a14d0 nt!IopInvalidDeviceRequest Device Object stacks: Processed 0 device objects.

From the output, we can see there are no driver-provided major function code handlers (I omitted a few for brevity, but they all point to the kernel-provided handler, `IopInvalidDeviceRequest`); in fact, no device objects exist at all. This means talking to this driver cannot be done with a classic `DeviceIoControl`, where a device is opened by name with `CreateFile` (really a symbolic link) or `NtOpenFile` (actual device name); there is no device to open. We see the driver object is stored in the `\FileSystem` object manager directory, where file-system mini-filters are typically stored. Another clue leading to the same conclusion is the Registry showing the “Type” value as `2`, which represents a file system-related driver.

We expect the WESP driver to register for the various notifications a “standard” EDR driver would. We can see that when opening `wesp.sys` in some PE viewer (screenshot is from one of my tools, Total PE):

![wesp.sys imports in Total PE showing FLTMGR.SYS and process, thread and image notify routines from ntoskrnl.exe](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/610ec0ae585182a5.png)

It also depends on `FltMgr.Sys`, which is the Filter Manager driver, managing file system mini-filters, proving that *wesp.sys* is a file system mini-filter. Another tool you can run to reinforce this conclusion is the built-in **fltmc** command-line tool in an elevated command window:

Filter Name Num Instances Altitude Frame ------------------------------ ------------- ------------ ----- bindflt 1 409800 0 UCPD 5 385250.5 0 wesp 7 329500 0 WdFilter 5 328010 0 storqosflt 0 244000 0 wcifs 0 189900 0 PrjFlt 0 189800 0 CldFlt 1 180451 0 FileCrypt 0 141100 0 luafv 1 135000 0 UnionFS 0 130850 0 bfs 7 100010 0 npsvctrig 1 46000 0 Wof 3 40700 0 FileInfo 5 40500 0 WinSetupMon 1 40300 0

WESP is in the list, showing its altitude (higher altitude drivers get notifications before lower altitude drivers).

### How wesp.sys talks to user mode

How is the driver communicating with user mode if it has no device objects, taking `DeviceIoControl` off the table? File system mini-filters have a mechanism available to them, which is using `FilterCommunicationPort` kernel objects. These provide bidirectional communication with user mode clients, which is more flexible than `DeviceIoControl` -style communication, which is unidirectional in nature (user to kernel). We can also see this in the imports called from `FltMgr.sys`, like `FltCreateCommunicationPort`, the fundamental API for creating such an object. You can also see a port named `ESPFilterPort` under the root object manager directory (shown in `WinObj` from Sysinternals):

![WinObj showing EspFilterPort as a FilterConnectionPort in the Windows object manager root directory](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/33382b935de45600.png)

### Can a user-mode client block process creation?

What about the user mode client? We can open *espclient.dll* (located in the System32 directory) in Total PE to get some hints:

![espclient.dll exports in Total PE showing 120 Esp-prefixed functions for filters, rules and event queues](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/157f39cc17e0a42d.png)

As you can see, the DLL exports lots of functions, all starting with Esp. We can identify rules and filters, confirming the assumption that these are necessary, so events can be filtered at the source, i.e., not sent to user mode if there is no interest. The API is C-based (not COM) – at least as it’s exposed to consumers. The client DLL’s imports include `FltLib.Dll`, which is the client DLL for using filter communication port objects. The three functions being used by `EspClient.Dll` are `FilterConnectCommunicationPort` (open a handle to a `FilterCommunicationPort` object), `FilterGetMessage`, and `FilterSendMessage`. A missing function (in my mind) is `FilterReplyMessage`, which allows a direct reply to a message from the driver. This missing function implies that user mode has no “response” capability, and that communication is one-way. This means that running custom code in user mode and then “replying” to the driver with a “decision” (such as blocking a process from being created) is probably not implemented, at least not yet.

## Conclusion: What WESP means for EDR vendors

WESP is Microsoft’s attempt to reduce third-party kernel code that Microsoft can't fully control. It aims to increase Windows reliability by reducing the chances of BSODs or other nastiness that could result from kernel driver code. The hope is that, by leveraging WESP, we can reduce the need for third-party kernel code and potentially remove it entirely. WESP isn't broadly available or well documented yet, but EDR providers are preparing to use it. Elastic is among them: Elastic Defend, Elastic’s XDR solution, is preparing to support WESP.

*Information is based on analysis conducted at the time of writing; subject to change. All product names, trademarks, and registered trademarks mentioned herein are the property of their respective owners. The release and timing of any features or functionality described in this post remain at Elastic's sole discretion. Any features or functionality not currently available may not be delivered on time or at all.*
