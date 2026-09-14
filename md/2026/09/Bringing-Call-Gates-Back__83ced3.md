---
title: Bringing Call Gates Back
source: https://www.alex-ionescu.com/bringing-call-gates-back/
source_host: www.alex-ionescu.com
clip_date: 2026-09-14T10:30:54+08:00
trace_id: dacfe3da-1d44-444c-94cd-8d2fb6d306f9
content_hash: 0723793bcf5cbb7cc8860d1bc9028a40b14b43507895118ae93e6b67b8c41ff9
status: synced
tags:
  - Windows逆向
  - 内核
series: null
feed_source: Alex Ionescu
ai_summary: x64 长模式仍支持 LDT 与 64 位 Call Gate，Windows 曾用它们实现 UMS，直到 Windows 10 周年更新才彻底移除。
ai_summary_style: key-points
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 3db75244-d011-81a1-92e7-f2b4f20bdc2b
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> x64 长模式仍支持 LDT 与 64 位 Call Gate，Windows 曾用它们实现 UMS，直到 Windows 10 周年更新才彻底移除。
> 
> - **分段语义被误解：** AMD64 手册（4.8.2）说明 FS/GS 数据段在 64 位模式基址不被忽略，`mov gs`/`pop gs` 只装载 32 位基址并清零高 32 位，因此 fs/gs 分段仍完整可用并覆盖 MSR_GS_BASE。
> - **UMS 如何拿到 LDT：** x64 无公开 API 建 LDT（NtSetLdtEntries、ProcessLdtInformation 均返回 STATUS_NOT_SUPPORTED），但调用 EnterUmsSchedulingMode → NtSetInformationThread(ThreadUmsInformation) 会经 KeInitializeProcessLdt 分配 64KB 静态 LDT（LdtTableLength 硬编码 8192），并由 DPC 写入 GDT：Win10 偏移 0x60、Win8.1 为 0x70；TEB 超 4GB 时需重映射到低址（Win10 起改用 FSGSBASE）。
> - **64 位 Call Gate 仍存在：** AMD 重新定义了 16 字节 Call Gate 描述符（去掉参数计数、容纳 64 位偏移），far call/jmp 依旧生效；把 LDT 里 TEB 数据段 type 从 0x13 改成 0x0C 即可造门，配合栈迁移 gadget 绕过 SMEP。
> - **绕过 PatchGuard：** LDT 不受 PatchGuard 保护，且是 tag kLDT 的 64KB 非分页池大分配、易从用户态枚举；更省事的是直接改 EPROCESS->LdtSystemDescriptor（最少 4 字节，如写 0x00008201 令 LDT 指向 0x10000），下次上下文切换 GDT 自动加载。
> - **载荷与缓解：** Ring 0 载荷须先 `swapgs`、SS 设 0x18、RSP 取自 TSS.Rsp0、退出用 retfq（rex.w retf）；Win10 周年更新删除全部 LDT 代码并让 PatchGuard 校验 LDTR 非零即崩，PTE 基址随机化与 KCFG 进一步封堵。

## Introduction

A few months ago, as part of looking through the changes in Windows 10 Anniversary Update for the Windows Internals 7th Edition book, I noticed that the kernel began enforcing usage of the CR4\[FSGSBASE\] feature (introduced in Intel Ivy Bridge processors, see Section 4.5.3 in the [AMD Manuals](http://developer.amd.com/wordpress/media/2012/10/24593_APM_v21.pdf)) in order to allow usage of [User Mode Scheduling](https://msdn.microsoft.com/en-us/library/windows/desktop/dd627187\(v=vs.85\).aspx) (UMS).

This led me to further analyze how UMS worked before this processor feature was added – something which I knew a little bit about, but not enough to write on.

What I discovered completely changed my understanding of 64-bit Long Mode semantics and challenged many assumptions I was making – pinging a few other experts, it seems they were as equally surprised as I was (even Mateusz”j00ru” Jurczyk wasn’t aware!).

Throughout this blog post, you’ll see how x64 processors, even when operating in 64-bit long mode:

-   Still support the usage of a Local Descriptor Table (LDT)
-   Still support the usage of Call Gates, using a new descriptor format
-   Still support descriptor-table-based (GDT/LDT) segmentation using the fs/gs segment – ignoring the new MSR-based mechanism that was intended to “replace” it

Plus, we’ll see how x64 Windows still allows user-mode applications to create an LDT (with specific limitations).

At the end of the day, we’ll show that j00ru’s and Gynvael Coldwind’s amazing [paper](http://j00ru.vexillium.org/?p=290) on abusing Descriptor Tables is still relevant, even on x64 systems, on systems up to Windows 10 Anniversary Update. As such, reading that paper should be considered a prerequisite to this post.

Please, take into consideration that all these techniques no longer work on Anniversary Update systems or later, nor will they work on Intel Ivy Bridge processors or later, which is why I am presenting them now. Additionally, there is no “vulnerability” or “zero-day” presented here, so there is no cause for alarm. This is simply an interesting combination of CPU, System, and OS Internals, which on older systems, could’ve been used as a way to gain code execution in Ring 0, in the presence of an already existing vulnerability.

## A brief primer on User Mode Scheduling

UMS efficiently allows user-mode processes to switch between multiple “user” threads without involving the kernel – an extension and large improvement of the older “ [fiber](https://msdn.microsoft.com/en-us/library/windows/desktop/ms682661\(v=vs.85\).aspx) ” mechanism. A number of [videos on Channel 9](https://channel9.msdn.com/Shows/Going+Deep/Dave-Probert-Inside-Windows-7-User-Mode-Scheduler-UMS) explain how this is done, as does the [patent](http://www.google.com/patents/US20100083275).

One of the key issues that arises, when trying to switch between threads without involving the kernel, is the per-thread register that’s used on x86 systems and x64 systems to point to the TEB. On x86 systems, the FS segment is used, leveraging an entry in the GDT (KGDT_R3_TEB), and on x64, the GS segment is used, leveraging the two Model Specific Registers (MSRs) that AMD implemented: MSR_GS_BASE and MSR_KERNEL_GS_SWAP.

Because UMS would now need to allow switching the base address of this per-thread register from user-mode (as involving a kernel transition would defy the whole point), two problems exist:

1.  On x86 systems, this could be implemented through segmentation, allowing a process to have additional FS segments. But doing so in the GDT would limit the number of UMS threads available on the system (plus cause performance degradation if multiple processes use UMS), while doing so in the LDT would clash with the existing usage of the LDT in the system (such as NTVDM).
2.  On x64 systems, modifying the base address of the GS segment requires modifying the aforementioned MSRs — which is a Ring 0 operation.

It is worth bringing up the fact that fibers never solved this problem –instead having all fibers share a single thread (and TEB). But the whole point of UMS is to provide true thread isolation. So, what can Windows do?

Well, it turns out that close reading of the AMD Manuals (Section 4.8.2) indicate the following:

-   “Segmentation is disabled in 64-bit mode”
-   “Data segments referenced by the FS and GS segment registers receive special treatment in 64-bit mode.”
-   “For these segments, the base address field is not ignored, and a non-zero value can be used in virtual-address calculations.

I can’t begin to count how many times I’ve heard, seen, and myself repeated the first bullet. But that FS/GS can *still* be used with a data segment, even in 64-bit long mode? This literally brought back memories of Unreal Mode.

Clearly, though, Microsoft was paying attention (did they request this?). As you can probably now guess, UMS leverages this particular feature (which is why it is only available on x64 versions of Windows). As a matter of fact, the kernel creates a Local Descriptor Table as soon as one UMS thread is present in the process.

This was my second surprise, as I had no idea LDTs were still something supported when executing native 64-bit code (i.e.: ‘long mode’). But they still are, and so adding in the TABLE_INDICATOR (TI) bit (0x4) in a segment will result in the processor reading the LDTR to recover the LDT base address and dereference the segment indicated by the other bits.

Let’s see how we can get our own LDT for a process.

## Local Descriptor Table on x64

Unlike the x86 NtSetLdtEntries API and the ProcessLdtInformation information class, the x64 Windows kernel does not provide a mechanism for arbitrary user-mode applications to create an LDT. In fact, these APIs all return STATUS_NOT_SUPPORTED.

That being said, by calling the user-mode API EnterUmsSchedulingMode, which basically calls NtSetInformationThread with the ThreadUmsInformation class, the kernel will go through the creation of an LDT (KeInitializeProcessLdt).

This, in turn, will populate the following fields in KPROCESS:

1.  LdtFreeSelectorHint which indicates the first free selector index in the LDT
2.  LdtTableLength which stores the total number of LDT entries – this is hardcoded to 8192, revealing the fact that a static 64K LDT is allocated
3.  LdtSystemDescriptor which stores the LDT entry that will be stored in the GDT
4.  LdtBaseAddress which stores a pointer to the LDT of this process
5.  LdtProcessLock which is a FAST_MUTEX used to synchronize changes to the LDT

Finally, a DPC is sent to all processors which loads the LDT into all the processors.

This is done by reading the KPROCESS->LdtSystemDescriptor and writing into the GDT at offset 0x60 on Windows 10, or offset 0x70 on Windows 8.1 (bonus round: we’ll see why there’s a difference a bit later).

Then, the LLDT instruction is used, and the selector is stored in the KPRCB->LdtSelector field. At this point, the process has an LDT. The next step is to fill it out.

The function now reads the address of the TEB. If the TEB happens to fall in the 32-bit portion of the address space (i.e.: than 0xFFFFFF000), it is set as the base address of a new segment in the LDT (using LdtFreeSelectorHint to choose which selector – in this case, 0x00), and the TebMappedLowVa field in KTHREAD replicates the real TEB address.

On the other hand, if the TEB address is above 4GB, Windows 8.1 and earlier will transform the private allocation holding the TEB into a shared mapping (using a prototype PTE) and re-allocate a second copy at the first available top-down address available (which would usually be 0xFFFFE000). Then, TebMappedLowVa will have this re-mapped address below 4GB.

Additionally, the VAD, which remains “private” (and this will not show up as a truly shared allocation) will be marked as NoChange, and further will have the VadFlags.Teb field set to indicate it is a special allocation. This prevents any changes to be made to this address through calls such as VirtualProtect.

Why this 4GB limitation and re-mapping? How does an LDT help here? Well, it turns out that the AMD64 manuals are pretty clear about the fact that the mov gs, XXX and pop gs instructions:

-   Wipe the upper 32-bit address of the GS base address shadow register
-   Load the lower 32-bit address of the GS base address shadow register with the contents of the descriptor table entry at the given selector

Therefore, x86-style segmentation is still fully supported when it comes to FS and GS, even when operating in long mode, and overrides the 64-bit base address stored in MSR_GS_BASE. However, because there is no 64-bit data segment descriptor table entry, only a 32-bit base address can be used, requiring this complex remapping done by the kernel.

On Windows 10, however, this functionality is not present, and instead, the kernel checks for presence of the FSGSBASE CPU feature. If the feature is present, an LDT is not created at all, and instead the fact that user-mode applications can use the WRGSBASE and RDGSBASE instructions is leveraged to avoid having to re-map a < 4GB TEB. On the other hand, if the CPU feature is *not* available, as long as the real TEB ends up below 4GB, an LDT will *still* be used.

A further, and final change, occurs in Anniversary Update, where the LDT functionality is completely removed – even if the TEB is below 4GB, FSGSBASE is enforced for UMS availability.

Lastly, during every context switch, if the KPROCESS of the newly scheduled thread contains an LDT base address that’s different than the one currently loaded in the GDT, the new LDT base address is loaded in the GDT, and the LDT selector is loaded against (hardcoded from 0x60 or 0x70 again).

Note that if the new KPROCESS does not have an LDT, the LDT entry in the GDT is not deleted – therefore the GDT will always have an LDT entry now that at least one UMS thread in a process has been created, as can be seen in this debugger output:

```
lkd> $$>a< c:\class\dumpgdt.wds 70 70
                                                    P Si Gr Pr Lo
Sel        Base              Limit          Type    l ze an es ng
---- ----------------- ----------------- ---------- - -- -- -- --
0070 ffffe000`2037d000 00000000`0000ffff LDT        0 Nb By P  Nl
```

You can see how this matches the LDT descriptor of “UMS Test” application:

```
lkd> dt nt!_KPROCESS ffffe0002143e080 Ldt*
+0x26c LdtFreeSelectorHint : 1
+0x26e LdtTableLength : 0x2000
+0x270 LdtSystemDescriptor : _KGDTENTRY64
+0x280 LdtBaseAddress : 0xffffe000`2037d000 Void
```

```
lkd> dx ((nt!_KGDTENTRY64 *)0xffffe0002143e2f0)
[+0x000] LimitLow : 0xffff [Type: unsigned short]
[+0x002] BaseLow : 0xd000 [Type: unsigned short]
[+0x004] Bytes [Type: ]
[+0x004] Bits [Type: ]
[+0x008] BaseUpper : 0xffffe000 [Type: unsigned long]
[+0x00c] MustBeZero : 0x0 [Type: unsigned long]
```

## Call Gates on x64

Call gates are a mechanism which allows 16-bit and 32-bit legacy applications to go from a lower privilege level to a higher privilege level. Although Windows NT never used such call gates internally, a number of poorly written AV software did, a few emulators, as well as exploits, both on 9x and NT systems, because of the easy way they allowed someone with access to physical memory (or with a Write-What-Where vulnerability in virtual memory) to create a backdoor way to elevate privileges.

With the advent of Supervisor Mode Execution Prevention (SMEP), however, this technique seems to have fallen out of fashion. Additionally, on x64 systems, since Call Gates are expected to be inserted into the Global Descriptor Table (GDT), which PatchGuard is known to protect, the technique is even further degraded. On top of that, most people (myself included) assumed that AMD had simply removed this oft-unused feature completely from the x64 architecture.

Yet, interestingly, AMD *did* go through the trouble of re-defining a new x64 long mode call gate descriptor format, removing the legacy “parameter count”, and extending it to a 16-byte format to make room for a 64-bit offset, as shown below:

![](http://www.alex-ionescu.com/wp-content/uploads/callgate.png)

That means that if a call gate were to find itself into a descriptor table, the processor would still support the usage of a far call or far jmp in order to reference a call gate descriptor and change CS:RIP to a new location!

## Exploit Technique: Finding the LDT

First, although SMEP makes a Ring 3 RIP unusable for the purposes of getting Ring 0 execution, setting the Target Offset of a 64-bit Call Gate to a stack pivot instruction, then RET’ing into a disable-SMEP gadget will allow Ring 0 code execution to continue.

Obviously, HyperGuard now prevents this behavior, but HyperGuard was only added in Anniversary Update, which disables usage of the LDT anyway.

This means that the ability to install a 64-bit Call Gate is still a viable technique for getting controlled execution with Ring 0 privileges.

That being said, if the GDT is protected by PatchGuard, then it means that inserting a call gate is not really viable – there’s a chance that it may be detected as soon as its inserted, and even an attempt to clean-up the call gate after using it might come too late. When trying to implement a stable, persistent, exploit technique, it’s best to avoid things which PatchGuard will detect.

On the other hand, now we know that x64 processors still support using an LDT, and that Windows leverages this when implementing UMS. Additionally, since arbitrary processes can have arbitrary LDTs, PatchGuard does *not* guard individual process’ LDT entries, unlike the GDT.

That still leaves the question of how do we find the LDT of the current process, once we’ve enabled UMS? Well, given that the LDT is a static, 64KB allocation, from non-paged pool, this does still leave us with an option. As explained a few years ago on [my post about the Big Pool](http://www.alex-ionescu.com/?p=231), such a large allocation will be easily enumerable from user-mode as long as its tag is known:

```
lkd> !pool ffffe000`22f3b000
```

```
Pool page ffffe00022f3b000 region is Nonpaged pool
*ffffe00022f3b000 : large allocation, tag kLDT, size 0x10000 bytes
```

While this is a nice information leak even on Windows 10, a mitigation comes into play unfortunately in Windows 8.1: Low IL processes can no longer use the API I described, meaning that the LDT address can only be leaked (without an existing Ring 0 arbitrary read/infoleak vulnerability) at Medium IL or higher.

Given that this is a fairly large size allocation, however, it means that if a controlled 64KB allocation can be made in non-paged pool and its address leaked from Low IL, one can still guess the LDT address. Ways for doing so are left as an exercise to the reader

![🙂](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c7a2c052f383509a.png)

Alternatively, if an arbitrary read vulnerability is available to the attacker, the LDT address is easily retrievable from the KPROCESS structure by reading the LdtBaseAddress field or by computing it from the LdtSystemDescriptor field. Getting the KPROCESS is easy through a variety of undocumented APIs, although these are now also blocked on Windows 8.1 from Low IL.

Therefore, another common technique is to use a GDI or User object which has an owner such a tagTHREADINFO, which then points to ETHREAD (which then points to EPROCESS). Alternatively, one could retrieve the GDT base address from the KPCR’s GdtBase field, if a way of leaking the KPCR is available, and then read the segment base address at offset 0x60 or 0x70. The myriad ways of leaking pointers and bypassing KASLR, even from Low IL, is beyond (beneath?) the content of this post.

## Exploit Technique: Building a Call Gate

The next step is to now write a call gate in one of the selectors present in the LDT. By default, if this is the initial scheduler thread, we expect to find its TEB. Indeed, on this sample Windows 8.1 VM, we can see the re-mapped TEB at 0xFFFFE000:

```
lkd> dq 0xffffe000`2037d000
ffffe000`2037d000 fffff3ff`e0001820
```

```yaml
lkd> dt nt!_KGDTENTRY64 ffffe000`2037d000 -b
+0x000 LimitLow : 0x1820
+0x002 BaseLow : 0xe000
+0x004 Bytes :
+0x000 BaseMiddle : 0xff ''
+0x001 Flags1 : 0xf3 ''
+0x002 Flags2 : 0xff ''
+0x003 BaseHigh : 0xff ''
+0x004 Bits :
+0x000 BaseMiddle : 0y11111111 (0xff)
+0x000 Type : 0y10011 (0x13)
+0x000 Dpl : 0y11
+0x000 Present : 0y1
+0x000 LimitHigh : 0y1111
+0x000 System : 0y1
+0x000 LongMode : 0y1
+0x000 DefaultBig : 0y1
+0x000 Granularity : 0y1
+0x000 BaseHigh : 0y11111111
+0x008 BaseUpper : 0
+0x00c MustBeZero : 0
```

Converting this data segment into a call gate can be achieved by merely converting the type from 0x13 (User Data Segment, R/W, Accessed) to 0x0C (System Segment, Call Gate).

However, doing so will now create a call gate with the following CS:\[RIP\] => E000:00000000FFFF1820

We have thus two problems:

1.  0xE000 is not a valid segment
2.  0xFFFF1820 is a user-mode address, which will cause a SMEP violation on most modern systems.

The first problem is not easy to solve – while we could create thousands of UMS threads, causing 0xE000 to become a valid segment (which we’d then convert into a Ring 0 Code Segment), this would be segment 0xE004. And if one can change 0xE000, might as well avoid the trouble, and set it to its correct value – (KGDT64_R0_CODE) 0x10, from the get go.

The second problem can be fixed in a few ways.

1.  An arbitrary write can be used to set BaseUpper, BaseHigh, LimitHigh, Flags2, and LimitLow (which make up the 64-bits of Code Offset) to the desired Ring 0 RIP that contains a stack pivot or some other interesting instruction or gadget.
2.  Or, an arbitrary write to modify the PTE to make it Ring 0, since the PTE base address is not randomized on the Windows versions vulnerable to an LDT-based attack.
3.  Lastly, if one is only interested in SYSTEM->Ring 0 escalation, systems prior to Windows 10 can be attacked through the AWE-based attack I described at Infiltrate 2015, which will allow the creation of an executable Ring 0 page.

It is also worth mentioning that since Windows 7 has all of non-paged pool marked as executable, and the LDT is itself a 64KB non-paged pool allocation, it is made up of entirely executable pages, so an arbitrary write could be used to set the Call Gate offset to somewhere within the LDT allocation itself.

## Exploit Technique: Writing the Ring 0 Payload

Writing x64 Ring 0 payload code is a lot harder than x86.

For starters, the GS segment must be immediately set to its correct value, else a triple fault could occur. This is done through the swapgs instruction.

Next, it’s important to realize that a call gate sets the stack segment selector (SS) to 0. While x64 natively operates in this fashion, Windows expects SS to be KGDT64_R0_DATA, or 0x18, and it may be a good idea to respect that.

Additionally, note that the value to which RSP will be set to is equal to the TSS’s Rsp0, normally used for interrupts, while a typical system call would use the KPRCB’s RspBase field. These ought to be in sync, but keep in mind that a call gate does not disable interrupts automatically, unlike an interrupt gate.

A reliable exploit must take note of all these details to avoid crashing the machine.

Further, exiting from a call gate *must* be done with the ‘far return’ instruction. Once again, another caveat applies: some assemblers may not generate a true 64-bit far return (i.e.: lacking a rex.w prefix), which will incorrectly pop 32-bit data from the stack. Make sure that a ‘retfq’ or ‘retfl’ or ‘rex.w retf’ is generated instead.

## Exploit Techniques Bonus: Corrupting the LDT Address, Hidden Segment, Lazy GDT Clear

Note that we’ve gone through some difficulty in obtaining the address of the LDT, and describing the ways in which the UMS TEB entries could be corrupted in a way to convert them to Call Gate entries, it’s useful to mention that perhaps a much easier (depending on the attack parameters and vulnerability) technique is to just overwrite the LdtSystemDescriptor field in EPROCESS (something which j00ru’s x86-based paper also pointed out).

That’s because, at the next context switch, the GDT will automatically be updated a copy of this descriptor, which could be set to a user-mode base address (due to a lack of SMAP in the OS), avoiding the need to either patch the GDT (and locating it — which is hard when Hyper-V’s NPIEP feature is enabled) or modifying the true kernel LDT (and leaking its address).

Indeed, for this to work, a single 32-bit (in fact, even less) arbitrary write is required, which must, at minimum, set the fields:

-   P to 1 (Making the segment present)
-   Type to 2 (Setting the segment as an LDT entry)
-   BaseMid to 1 (Setting the base to 0x10000, as an example, as addresses below this are no longer allowed)

Therefore, a write of 0x00008201, for example, is sufficient to achieve the desired result of setting this process’ LDT to 0x10000.

As soon as a context switch occurs back to the process, the GDT will have this LDT segment descriptor loaded:

```
lkd> $$>a< c:\class\dumpgdt.wds 70 70
                                                    P Si Gr Pr Lo
Sel        Base              Limit          Type    l ze an es ng
---- ----------------- ----------------- ---------- - -- -- -- --
0070 00000000`00010000 00000000`00000000 LDT        0 Nb By P  Nl
```

But wait – isn’t setting a limit of 0 creating an empty LDT? Not to worry! In long mode, limits on LDT descriptor entries are completely ignored… unfortunately though, although this is what the AMD64 manual states, I get access violations, at least on Hyper-V x64, if the limit is not large enough to contain the segment. So your mileage my vary.

But that’s all right – we can still limit this to a simple 4-byte overwrite! The trick lies into simply going through the process of creating a real LDT in the first place, then leaking its address (as described). Following that, allocate the user-mode fake LDT at the same lower 32-bit address, keeping the upper 32-bits zeroed. Then, use the 4-byte overwrite to clear the KPROCESS’ LdtSystemDescriptor’s BaseUpper field.

Even if the kernel LDT address cannot be leaked for some reason, one can easily “guess” every possibility (knowing it will be page aligned) and spray the entire 32-bit address space. This sounds like a lot, but is really only about a million allocations.

Finally, an alternate technique is to leverage exception handling: if the wrong LDT is overwritten, the kernel won’t crash when loading the invalid LDT segment (as long as it’s canonical, the PTE isn’t checked for validity). Instead, only when the exploit attempts to *use* the call gate, will a GPF be generated, and only in the context of the Ring 3 application. As such, one can progressively try each possible lower 32-bit LDT address until a GPF is no longer issued. Voila: we have found the correct lower 32-bits.

As another bonus, why is it that the selector for the LDT is 0x70 on Windows 8.1 and earlier, but 0x60 on Windows 10?

The answer lies in an even lesser known fact: up until the latter, the kernel created a Ring 0 Compatibility Mode Segment at offset 0x60! This means that a sneaky attacker can set CS to 0x60 and enjoy a weird combination of 32-bit legacy code execution with Ring 0 privileges (a number of caveats apply, including what an interrupt would do when returning, and the fact that no kernel API could be used at all).

Finally, note that even once a UMS-leveraging process exists, the GDT entry is not cleared, and points to a freed pool allocation. This means that if a way to allocate 64KB of controlled non-paged pool memory is known (such as some of the ways described in my Big Pool blog post), the GDT entry could be made to point to controlled memory (such as a named pipe buffer) which will re-use the same pointer. Then, some way to make the system continue to trust this address/entry should be achieved (either by causing an LLDT of 0x60/0x70 to be issued or having an EPROCESS’s LdtSystemDescriptor field re-use this address).

This is more of an anti-forensics technique than anything, because it keeps the GDT pointing to a kernel-mode LDT, even though it’s attacker controlled.

## PoC||GTFO

While I won’t be releasing sample code leveraging this attack, it could easily be added to the various PowerShell-based “Vulnerable Driver” techniques that @b33f has been creating.

Here’s a sample screenshot of the attack based on a C program, with me using the debugger to perform the 32-bit arbitrary write (vs. sending an IOCTL to a vulnerable driver).

It sits in a loop (after leaking and allocating the data that it needs) and attempts to execute the call gate every second, until the arbitrary write is performed.

Once successful, the Ring 0 payload merely reads SharedUserData->SystemTime (every second).

![](http://www.alex-ionescu.com/wp-content/uploads/ums-exploit.png)

## Conclusion: Windows 10 Anniversary Update Mitigations

In Windows 10 Anniversary Update (“Redstone 1”), a number of changes make these exploit techniques impossible to use:

-   All of the LDT-related fields and code in the kernel is removed. There is now no way of having an LDT through any Windows-supported mechanism.
-   PatchGuard now checks the LDTR register. If it’s non-zero, it crashes the system.

MSRC and the various security teams at Microsoft deserve kudos for thinking about — and plugging — the attack vector that LDTs provided, which is certainly not a coincidence

Further, the following generic mitigations make classes of such attacks much harder to exploit:

-   Randomization of the PTE base make it harder to bypass SMEP by making Ring 3 memory appear as Ring 0.
-   Technologies such as KCFG make it even harder to exploit control over arbitrary CS:RIP.

Finally, as described earlier, even on Windows 8.1, if the FSGSBASE feature is available in KeFeatureBits, the kernel will not allow the creation of an LDT, nor will it load the LDT during a context switch. You can easily verify this by calling (Ex/Rtl)IsProcessorFeaturePresent(PF_RDWRFSGSBASE_AVAILABLE).
