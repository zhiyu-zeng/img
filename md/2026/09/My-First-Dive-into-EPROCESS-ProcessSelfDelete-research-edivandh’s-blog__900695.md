---
title: "My First Dive into EPROCESS: ProcessSelfDelete research | edivandh’s blog"
source: https://edivandh.github.io/my-first-dive-into-eprocess/
source_host: edivandh.github.io
clip_date: 2026-09-16T10:25:13+08:00
trace_id: 7ff5bbc5-fb76-42bd-8410-83e5f3d5779d
content_hash: dbc6eae4636066f15ab699c173b4c6eaebd2e6c0c24d53cd00f088c63ae50ddb
status: synced
tags:
  - Windows逆向
  - 内核
series: null
feed_source: edivandh
ai_summary: 设置 EPROCESS 中 Flags 的 ProcessSelfDelete 位后，进程变得无法被任务管理器、管理员权限甚至杀毒软件终止。
ai_summary_style: key-points
images_status:
  total: 32
  succeeded: 32
  failed_urls: []
notion_page_id: 3dd75244-d011-8148-b5c2-fdc1172143df
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 设置 EPROCESS 中 Flags 的 ProcessSelfDelete 位后，进程变得无法被任务管理器、管理员权限甚至杀毒软件终止。
> 
> - **定位方法：** WinDbg 用 `!process 0 0` 列出进程与 EPROCESS 地址，`dt _EPROCESS <addr>` 展开结构，`dt nt!_EPROCESS -b` 直接查看位布局。
> - **位与掩码：** ProcessSelfDelete 是 Flags 的第 30 位，掩码 `2^30 = 0x40000000`；原 Flags `0x144d0c01` 经 OR 变为 `0x544d0c01` 即置位成功。
> - **关键字段：** UniqueProcessId 标识进程，Token 决定安全上下文（提权/仿冒目标），Pcb 指向 KPROCESS（含 DirectoryTableBase/CR3、优先级），另有 PEB 供程序自省运行环境。
> - **实测行为：** 任务管理器、`Stop-Process`、管理员强杀均无效；仅内核驱动能杀死，且进程随后以挂起状态重启。
> - **对安全产品：** 对 Mimikatz 与 Sliver 植入体置位后 Defender 持续告警却无法终止进程，但 Sliver 约 10 分钟后连接自行中断而进程仍存活。

## What is the EPROCESS Structure?

The `EPROCESS` structure is a data structure within the Windows kernel that holds essential information about a process. This includes details such as the process’s current state, its address space, security context, and the resources it utilizes.

While primarily used internally by the Windows operating system to manage processes, it can also be analyzed in areas like malware development or reverse engineering to better understand how Windows handles process management. Although not intended for direct use by user-mode applications, certain system functions expose parts of this structure, allowing limited interaction with the kernel.

### Understanding the EPROCESS Structure and Its Use in Offensive Security

This structure is particularly intriguing for malware developers, as it can be leveraged to perform a variety of advanced techniques. Among its most common uses are process injection, where malicious code is inserted into a legitimate process’s memory space, privilege escalation, which involves manipulating security tokens to gain higher system access and process hiding, allowing the malware to evade detection by removing its presence from standard process listings. These capabilities make the `EPROCESS` structure a valuable asset for creating stealthy and persistent threats within the Windows operating system.

## Windows 11 24H2

In this section, we will take a closer look at some of the most important structures within the `EPROCESS` block in Windows 11 24H2. Understanding these key components is essential for analyzing how the operating system manages processes, handles resources, and enforces security mechanisms. We will highlight the structures that have the greatest relevance for tasks such as debugging, forensic analysis, and kernel exploitation research.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f0752d456d2a1022.png)

-   [https://www.vergiliusproject.com/kernels/x64/windows-11/24h2/\_EPROCESS](https://www.vergiliusproject.com/kernels/x64/windows-11/24h2/_EPROCESS)

To locate the address of an `EPROCESS` structure using WinDbg, you typically start by identifying the target process. One common approach is to use the `!process` command, which lists active processes along with their `EPROCESS` addresses.

For example:

```
!process 0 0
```

This command displays all processes in the system. In the output, you’ll see entries like:

```
PROCESS ffffc58f1a5b8040 SessionId: 1 Cid: 04ac    Peb: 00000000c3610000 ParentCid: 03f8
```

Here, `ffffc58f1a5b8040` is the address of the `EPROCESS` block for that specific process.

Alternatively, if you know the PID, you can use:

```
!process <PID> 1
```

The `1` at the end shows a detailed dump of the `EPROCESS` block.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f1da60059c5d3081.png)

In the previous image, information about the chrome.exe process is shown, and important aspects such as the PEB, Token, or the `EPROCESS` address can be observed.

Once you have the address of the `EPROCESS` structure, you can inspect its fields using the `dt` (Display Type) command. The `dt` command shows the layout and contents of a data structure in memory.

For example, if you have the `EPROCESS` address `ffffc58f1a5b8040`, you can expand it like this:

```
dt _EPROCESS ffffc58f1a5b8040
```

This will dump all members of the **\_EPROCESS** structure at that address.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2052df6a1d81fd28.png)

If you want to look at a specific member or nested structure, you can specify it:

```
dt _EPROCESS ffffc58f1a5b8040 Token
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1d50235ea6911235.png)

Within the `EPROCESS` structure, several fields and embedded structures are particularly important for process management, security, and analysis. Here are some of the key ones:

-   UniqueProcessId

The unique ID for the process. This is used internally by the Windows operating system to identify processes.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/91713235a504b4a3.png)

-   Token

Contains the security token that defines the process’s security context. Crucial for privilege escalation and impersonation; attackers may replace this to gain SYSTEM privileges.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2052df6a1d81fd28.png)

-   **Pcb**

This field points to the `KPROCESS` structure, which contains scheduling information for the process. This includes details about its priority, state, and context.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/92a32367c1a9cc70.png)

**What is KPROCESS?**

`KPROCESS` (or `_KPROCESS`) is the kernel-mode control block for a process. It contains the low-level scheduling and execution context information that the Windows kernel needs to manage the process at the CPU level.

The structure is as follows:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/301f4726b26a3e49.png)

You can see the complete structure at:

-   [https://www.vergiliusproject.com/kernels/x64/windows-11/24h2/\_KPROCESS](https://www.vergiliusproject.com/kernels/x64/windows-11/24h2/_KPROCESS)

**Main components:**

| **Field** | **Purpose** |
| --- | --- |
| Header | Dispatcher header for kernel objects |
| ProfileListHead | Profiling info for performance analysis |
| DirectoryTableBase | Page table base (CR3) defines process’s virtual address space |
| ThreadListHead | List of ETHREADs belonging to this KPROCESS |
| Affinity | Processor affinity mask which cores the process can run on |
| BasePriority | Base priority for scheduling |
| QuantumReset | Time quantum for the process |
| ActiveProcessors | Tracks which CPUs are active for this process |
| Flags | Various status flags |

-   PEB

In simple terms, the PEB (Process Environment Block) is like an information hub that stores various details about a process for the operating system.

The PEB serves useful purposes for both the OS and the application itself. For the operating system, it provides a standardized structure to access key information about a process such as runtime data, loaded modules (DLLs), environment variables, and more.

For the application, the PEB offers a way to read and interact with this information directly. This can be helpful for legitimate programs but in the context of malware, it becomes even more interesting.

Malware can use the PEB to learn about its own execution environment, understand how it was launched, and adjust its behavior dynamically at runtime. This ability to self-inspect and manipulate execution is at the core of many common malware techniques, some of which we’ll explore next.

The PEB address can be observed in several ways, for example using Process Hacker:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/016839d05a3424d8.png)

Or using WinDBG:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/378f51b779b7f379.png)

We use the dt command to expand the PEB structure (it is another chrome.exe process, the previous one was closed):

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1243f4db58944b90.png)

Within the PEB you can find several interesting structures such as Ldr but we will not go into details, if you wish I recommend you the following reading:

-   [https://mohamed-fakroud.gitbook.io/red-teamings-dojo/windows-internals/peb](https://mohamed-fakroud.gitbook.io/red-teamings-dojo/windows-internals/peb)

## Flags in the EPROCESS

Flags within the `EPROCESS` structure are bitfields used to store multiple Boolean indicators related to the state, behavior, or properties of the process. There are several Flags fields in the structure, such as Flags or Flags2. Each one groups different bits with specific meanings, and their exact definition can vary between Windows versions. Complete list of Flags:

-   Flags
-   Flags2
-   Flags3
-   Flags4
-   MitigationFlags
-   MitigationFlags2
-   MitigationFlags3

With all this in mind, I started reading one by one the `EPROCESS` values and my eyes stopped at DisallowUserTerminate inside Flags3:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/250744042ce712f7.png)

But before I started to investigate I searched the internet and found that Alex Ionescu had already investigated this value so I read his article which I recommend and continued looking for another value.

Alex Ionescu blog: [https://windows-internals.com/dut-processes-in-windows-10/](https://windows-internals.com/dut-processes-in-windows-10/)

The next one I looked at is `ProcessSelfDelete` within Flags and to my surprise when I googled it I found no results so I decided to focus on it. But before we start, what are Flags?

### Flags

The Flags structure is a “ULONG”, that is 32 bits, and if you look at the image you can see that to the right of each of the components of said structure there is a number (e.g.: `CreateReported:1;`) that is the bit (from 0 to 31) and thanks to that bit we can count and know the exact position of each component.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/58ab50a4ad61a9df.png)

Personally, I was drawn to `ProccessSelfDelete` because the name seemed odd to me and I didn’t find much information on the Internet.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9a42ca7d3713a391.png)

The question is, how can I activate this flag in a process?

Open notepad and WinDBG to find the `EPROCESS`:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/31fdd4610a12a980.png)

We expand the structure and observe that ProcessSelfDelete is at 0:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d0e25f995f017c61.png)

Now we need to find out what position ProcessSelfDelete is in, this can be done by manually counting the bits in the Flags structure and we will notice that it is located at position number 30.

On the other hand this can be observed in a more visual way using the command `dt nt!_EPROCESS -b`:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6f86b5d4f52c4326.png)

Or `dt nt!_EPROCESS -v`:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/63eb64fe00abb324.png)

Now to activate the flag we must “patch” the function using its mask which we can find on the following page:

-   [https://www.geoffchappell.com/studies/windows/km/ntoskrnl/inc/ntos/ps/eprocess/flags.htm?tx=185](https://www.geoffchappell.com/studies/windows/km/ntoskrnl/inc/ntos/ps/eprocess/flags.htm?tx=185)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/bd7d02ab09e6037d.png)

Or you can calculate the mask, the operation is `2^30 = 0x40000000` (hexadecimal).

Next, we list the current flags:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/10af088c9d3bed39.png)

So Flags = `0x144d0c01`.

And we overwrite them using OR operation:

```
0x144d0c01 | 0x40000000 = 0x544d0c01
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/965ee7df8d8d9b17.png)

Let’s look at the structure of `EPROCESS` again:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/dad3e6d7b65e030e.png)

Now that we have the flag activated, what can we do? Well, we can investigate its behavior, so I was doing some tests and discovered the following:

First, I tried to kill the process:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/dcefd0f5df76126b.png)

Let’s see what happens when we list the processes again:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/605487b6d572150e.png)

Failed to kill the process (this was done with administrator privileges). An attempt has been made to force the deletion but it still has no effect:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c4aa36b5308a442c.png)

Another attempt is made using Stop-Process but the result is similar:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/26a420ed25022d63.png)

And if we do it with graphical environment using the task manager the same thing:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/cbcac5483908ca79.png)

Finally, I loaded a driver and killed the process from the kernel but once successfully killed, the process restarted in a weird suspended state.

This behavior got me thinking and it occurred to me to try this every hacker’s favorite binary, yes, I’m talking about Mimikatz;)

To do this, I disabled Defender, loaded Mimikatz and set the ProcessSelfDelete bit in its process. Then, I re-activated the Defender to see how it behaved:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f3868f093c064fcc.png)

The Antivirus starts sending alerts and the more I interact with Mimikatz the more alerts it sends, this is a lot of fun.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/58313be14374d54d.png)

The antivirus is unable to kill my process so I can use it “without problems” (it is the least stealthy thing I have ever seen).

Finally, it occurred to me to try a Sliver implant, so bit 30 was modified by setting the flag:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3a5c04328da1d51a.png)

As can be seen in the image, the connection is established and the first alerts begin to appear:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a0dc17d272550437.png)

After 5 minutes of sending commands like crazy, some commands start to fail and the connection slows down:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c912dd39bbb73a81.png)

At the end, after about 10 minutes the connection dies but the implant process is still active, Windows Defender is not able to remove this process.

### Conclusions

This has been one of my first investigations about EPROCESS, the result has caught my attention since apparently the security products are not able to kill a process with this flag active, the investigation is my own so I may have made a mistake in something (usually happens) comments or updates are welcome.
