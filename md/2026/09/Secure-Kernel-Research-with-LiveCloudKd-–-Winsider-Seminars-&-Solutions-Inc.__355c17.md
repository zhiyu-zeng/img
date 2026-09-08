---
title: Secure Kernel Research with LiveCloudKd – Winsider Seminars & Solutions Inc.
source: https://windows-internals.com/secure-kernel-research-with-livecloudkd/
source_host: windows-internals.com
clip_date: 2026-09-09T01:29:48+08:00
trace_id: ff29c63d-d957-4b91-ae78-1715bd85af17
content_hash: 9b9f6bd12740863a75cabc85f3d1b36073675f1fa08521bbe9985603e40d0b25
status: synced
tags:
  - 内核
  - 安全工具
series: null
feed_source: null
ai_summary: 无需逆向 hypervisor 即可用 LiveCloudKd 附加内核调试器调试 Windows VTL1 安全内核；文章给出可复现的部署步骤、符号修复与模块枚举方法。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 3d575244-d011-811d-8c79-c31d51842cc2
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 无需逆向 hypervisor 即可用 LiveCloudKd 附加内核调试器调试 Windows VTL1 安全内核；文章给出可复现的部署步骤、符号修复与模块枚举方法。
> 
> - **背景与目的：** 直接调试安全内核/secure 进程很困难，此前做法需解析 hypervisor 物理内存并人工匹配无符号偏移，构建间难以复用；LiveCloudKd 可在虚拟机环境中附加调试器到 VTL1 安全内核。
> - **环境要求：** 客户机需 Windows 10+ 并启用 VBS（Hyper-V 中默认关闭嵌套虚拟化）；作者用 Hyper-V 中的 Windows 11 客户机，在真实主机安装 Windows SDK、VC++ 运行时并注册 `ExdiKdSample.dll`，无需关闭 Secure Boot。
> - **符号缺陷修复：** LiveCloudKd 依赖 `ntoskrnl.exe` 和 `securekernel.exe` 的符号；若符号路径未被识别，可从客户机复制这两个 exe，用 `symchk.exe` 下载对应 PDB，并将 `ntoskrnl.pdb`/`ntkrnlmp.pdb` 重命名为 `nt.pdb` 放入 LiveCloudKd 目录。
> - **启动与断点连接：** 先运行 `LiveCloudKd /v 2` 打印 NT/securekernel 基址，再把所选 VM 索引写入 `HKLM\SOFTWARE\LiveCloudKd\Parameters\VmId`；随后用 `windbg.exe -d -v -kx exdi:CLSID={53838F70-...},Kd=Guess`（或另一 CLSID 对应 active debugger）启动，并在调试器中执行 `.reload /f securekernel.exe=<基址>` 加载符号。
> - **枚举 VTL1 模块：** securekernel 用与正常内核相同的 `_KLDR_DATA_TABLE_ENTRY` 结构维护模块列表，可通过 `securekernel!SkLoadedModuleList` 配合 DX 命令列出模块名与基址；示例输出包含 `securekernel.exe`、`skci.dll`、`symcryptk.dll`、`cng.sys`。

Let’s say you want to research the secure kernel. You heard about hypervisors and VTL1 and you’d like to see it for yourself, and static analysis is just not always good enough. You need a debugger.

You immediately run into a problem: you can’t debug the secure kernel. Or secure processes. Or anything running in VTL1. Sure, you can debug the hypervisor, and through painful analysis of physical memory and memorizing a lot of offsets and byte patterns you can find the secure kernel and work your way from there. That’s exactly what [Francisco Falcon](https://twitter.com/fdfalcon) (then from Quarkslab) did a few months ago to debug an Isolated User Mode (IUM) process (also known as secure process). He published his work [here](https://blog.quarkslab.com/debugging-windows-isolated-user-mode-ium-processes.html). His process was extremely impressive, but hard to reproduce since the hypervisor binaries don’t ship with public symbols and offsets and structures change between builds, so you’d have to find the correct one for every individual build.

If you want to debug the hypervisor itself, you don’t have much of a choice but to deal with the painful process. But for debugging the secure kernel (and through it, IUM processes), you can try [LiveCloudKd](https://github.com/gerhart01/LiveCloudKd/tree/master) instead.

Originally developed by Matt Suiche and maintained by [Gerhart](https://twitter.com/gerhart_x) since 2020, LiveCloudKd allows you to attach a live debugger to a virtual machine and debug the secure kernel. The repository does have instructions for how to set up the debugger, but they didn’t fully work for me, so I’ll document my process here in hopes it helps someone else and show some uses for having a kernel debugger attached to the secure kernel.

## Initial Setup

Download the latest release of LiveCloudKd. Or, if you want to have the ability to attach a full debugger (and potentially step through code in VTL1), download the LiveCloudKd [debugger](https://github.com/gerhart01/LiveCloudKd/blob/master/ExdiKdSample/LiveDebugging.md).  
In my setup, I’m using the LiveCLoudKd debugger, build v1.0.22021109.You can find it [here](https://github.com/gerhart01/LiveCloudKd/releases/download/v1.0.22021109/LiveCloudKd.EXDi.debugger.v1.0.22021109.zip).

### Choose a VM Setup

Set up a VM that you’d like to debug. The VM needs to support Virtualization Based Security (otherwise what’s the point of all this?), so it has to have at least Windows 10 installed on it. I used Hyper-V as my VM infrastructure and created a VM running Windows 11.

In the documentation, Gerhart recommends a nested VM setup: one VM (with Server 2019 installed on it) acts as the host, and inside it you create another VM that acts as the guest. You set up everything in the host VM and debug the guest VM. This setup works, but I found it inconvenient to work with nested VMs so I set up everything on my host (64-bit Windows 11 23H2) and debugged a VM.

### Set Up the Host Machine

Set up the host machine (whether that’s your real host or the host VM):

1.  1.  Install the latest Windows SDK on your host machine. You can download the latest one [here](https://developer.microsoft.com/en-us/windows/downloads/windows-sdk/) or use the Insider Preview SDK if you prefer.
    2.  Install Visual Studio 2022 runtime libraries on your host machine. You can download them [here](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist?view=msvc-170).
    3.  Unzip LiveCloudKd that you downloaded in step 1 and copy its contents into the WinDbg directory (c:\\Program Files (x86)\\Windows Kits\\10\\Debuggers\\x64).  
        If you prefer to use the [new and improved WinDbg](https://learn.microsoft.com/en-us/windows-hardware/drivers/debugger/), copy WinDbgX and all its dependencies into a new folder and copy all the LiveCloudKd binaries into the same folder.
        -   In my attempts to run LiveCloudKd, some only worked with the legacy WinDbg and some only worked with the new WinDbg. I encourage you to try both and see what works.
    4.  In an elevated command line, navigate to the directory where you placed LiveCloudKd and install ExdiKdSample with:
        
        `regsvr32.exe ExdiKdSample.dll`
        
        (If you’re using the LiveCloudKd from the main repo, and not the debugger, then the DLL you’ll need to install is called HvmmEXDi.dll)
        
    5.  Configure your symbol path (c:\\symbols, or whatever other directory you choose, must exist):
        
        `setx /m _NT_SYMBOL_PATH SRV*C:\Symbols*http://msdl.microsoft.com/download/symbols`
        

### Set Up the Guest Machine

1.  Do not enable nested virtualization for the guest system. It should be disabled by default, but if you need to disable it you can follow [this guide](https://learn.microsoft.com/en-us/virtualization/hyper-v-on-windows/user-guide/enable-nested-virtualization) to disable it for Hyper-V machines (you’ll need to do that on your host, not inside the guest machine).
2.  Enable Virtualization Based Security in your guest machine. You can enable it by going to your security settings -> Device Security -> Core Isolation and enabling Memory Integrity.  
    Or if you prefer to enable it through the registry or through group policy, you can follow [these](https://learn.microsoft.com/en-us/windows/security/hardware-security/enable-virtualization-based-protection-of-code-integrity) instructions.
    -   You don’t need to disable secure boot in the guest machine to debug it with LiveCloudKd. If you still want to disable secure boot, you’ll need to set this registry value to zero allow Virtualization Based Security to run without secure boot:  
        
        `HKLM\SYSTEM\CurrentControlSet\Control\DeviceGuard\RequirePlatformSecurityFeatures`
        

Now, in an elevated command line, navigate to the directory where you set up LiveCloudKd and run it. Choose the index or the virtual machine you’d like to debug, then choose “Start EXDi plugin” (or “Live Kernel Debugger” if you’re using the debugger build, like me). If you’re lucky, you now have a kernel debugger attached to the secure kernel of your guest machine. If that didn’t work, you might be running into the same issue I did. Even though my symbol path was configured correctly, LiveCloudKd ignored it and failed to find the symbols it needed. So, I had to set them up myself.

## Symbols

LiveCloudKd the symbols of two modules from the guest machine:

-   Ntoskrnl.exe
-   Securekernel.exe

So, if you ran into the same issue as me, log into your guest machine and grab both of those binaries from c:\\Windows\\System32. Copy them to your host machine. Then, download the symbols for both of them using symchk.exe (you can find it in the same directory as the legacy WinDbg):

`symchk.exe /r c:\guest_binaries\ntoskrnl.exe /s SRV*C:\Symbols*http://msdl.microsoft.com/download/symbols /v`

`symchk.exe /r c:\guest_binaries\securekernel.exe /s SRV*C:\Symbols*http://msdl.microsoft.com/download/symbols /v`

The output will show you the paths of the two pdb files you’ve downloaded. Copy both of them to the same folder as LiveCloudKd. You’ll also need to rename ntoskrnl.pdb (or ntkrnlmp.pdb) to nt.pdb, since that’s the file name used by LiveCloudKd. No need to rename securekernel.pdb to anything.  
Now, try running LiveCloudKd again. If it works, perfect! If it doesn’t, follow me to the next stage.

## Multi-phase Solution

Another issue I ran into is that sometimes LiveCloudKd manages to locate ntoskrnl.exe and securekernel.exe but fails at another step further down in its initialization. I haven’t actually found a solution to that, just a way to bypass it. If you suspect that this is what’s happening in your case, try running LiveCloudKd in verbose mode:

`LiveCloudKd /v 2`

Hopefully, you’ll get an output like this:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0033c28572adccdf.png)](https://windows-internals.com/wp-content/uploads/2024/05/livecloudkd_start.png)

Your output might look different, have more errors or fail at a different stage. But if LiveCloudKd successfully printed the base addresses of NT-kernel and securekernel, you’re good to go. The process will not always exit on its own, so you can break out of it now.

In the registry, set this registry value to the index of the VM you chose to debug (the same ID you chose in the LiveCLoudKd interactive input):

`HKLM\SOFTWARE\LiveCloudKd\Parameters\VmId`

Then, start the live debugger:

`windbg.exe -d -v -kx exdi:CLSID={53838F70-0936-44A9-AB4E-ABB568401508},Kd=Guess`

Or, if you prefer the active debugger, where you can (potentially) set breakpoints and walk through code, run:

`windbg.exe -d -v -kx exdi:CLSID={67030926-1754-4FDA-9788-7F731CBDAE42},Kd=Guess`

(If you’re using the new debugger. Replace windbg.exe with WinDbgX. If it doesn’t work, try the legacy debugger instead and vice versa)

And…. Success!

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0336f3cd1c915b11.png)](https://windows-internals.com/wp-content/uploads/2024/05/livecloudkd_windbg.png)

Only the legacy WinDbg worked this time, but a win is a win.

Now, grab the address of securekernel.exe from the previous output, and run in the debugger:

`.reload`

`.reload /f securekernel.exe=<base address>`

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9fc2d8bfc69b435e.png)](https://windows-internals.com/wp-content/uploads/2024/05/livecloudkd_securekernel.png)

Now you have the addresses of all the loaded kernel modules as well as the secure kernel, all accessible through the debugger. But the debugger doesn’t know about the other modules loaded in VTL1. Let’s go find them.

## VTL1 Loaded Modules

Securekernel.exe is the VTL1 version of the kernel. Just like the regular kernel, the secure kernel is in charge of keeping track of the modules loaded in its address space and loading new ones. It keeps information about the loaded modules in a list that starts at securekernel!SkLoadedModules, which we can read with DX:

`dx @$skLoadedModules = (nt!_LIST_ENTRY*)&securekernel!SkLoadedModuleList`  
`@$skLoadedModules = (nt!_LIST_ENTRY*)&securekernel!SkLoadedModuleList : 0xfffff8005c11d750 [Type: _LIST_ENTRY *]`  
    `[+0x000] Flink : 0xffffb300022020c0 [Type: _LIST_ENTRY *]`  
    `[+0x008] Blink : 0xffffb30002202720 [Type: _LIST_ENTRY *]`

Luckily, the entries in this list use the same data structure used by the normal kernel to manage its modules: `KLDR_DATA_TABLE_ENTRY`. So we can easily parse the list:

`dx @$skModules = Debugger.Utility.Collections.FromListEntry(*@$skLoadedModules, "nt!_KLDR_DATA_TABLE_ENTRY", "InLoadOrderLinks")`  
`@$skModules = Debugger.Utility.Collections.FromListEntry(*@$skLoadedModules, "nt!_KLDR_DATA_TABLE_ENTRY", "InLoadOrderLinks")`  
    `[0x0] [Type: _KLDR_DATA_TABLE_ENTRY]`  
    `[0x1] [Type: _KLDR_DATA_TABLE_ENTRY]`  
    `[0x2] [Type: _KLDR_DATA_TABLE_ENTRY]`  
    `[0x3] [Type: _KLDR_DATA_TABLE_ENTRY]`

And find the names and addresses of all VTL1 kernel modules:

`dx -g @$skModules.Select(m => new { Name = m.BaseDllName, Base = m.DllBase, Size = m.SizeOfImage })`  
`==========================================================================`  
`=          = (+) Name              = Base                  = Size        =`  
`==========================================================================`  
`= [0x0]    - "securekernel.exe"    - 0xfffff8005c00a000    - 0x161000    =`  
`= [0x1]    - "skci.dll"            - 0xfffff8005c16e000    - 0x4e000     =`  
`= [0x2]    - "symcryptk.dll"       - 0xfffff80058762000    - 0xb000      =`  
`= [0x3]    - "cng.sys"             - 0xfffff8005c1bf000    - 0xd3000     =`  
`==========================================================================`

We can, of course, do more complicated things with our new debugger. Like enabling secure kernel debugging, patching variables and functions to allow us to run unsigned code in VTL1 for testing or do lots of other things. But those require more work and effort, so I’ll leave this post an introductory one and leave all those other ideas for future posts.
