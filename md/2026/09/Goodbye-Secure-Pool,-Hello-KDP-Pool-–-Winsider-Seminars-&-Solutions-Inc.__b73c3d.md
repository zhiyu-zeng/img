---
title: Goodbye Secure Pool, Hello KDP Pool – Winsider Seminars & Solutions Inc.
source: https://windows-internals.com/goodbye-secure-pool-hello-kdp-pool/?utm_source=rss&utm_medium=rss&utm_campaign=goodbye-secure-pool-hello-kdp-pool
source_host: windows-internals.com
clip_date: 2026-09-09T01:15:50+08:00
trace_id: 51592a97-86d9-4e20-8f8a-fb836100de00
content_hash: 4c9a466375cc4da7f111e8373541cf7a39cd62d0c8b08058b586d988c5c6d198
status: synced
tags:
  - Windows内核安全
  - KDP
series: null
feed_source: Yarden Shafir·Windows Internals
ai_summary: Windows 11 26H2 移除 Secure Pool，以全新 KDP Pool 取代：通过专用 KDPRO 节和 Hyper-V SLAT 只读保护 SeDebugPrivilege、SIDs、DACLs 等安全数据。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3d575244-d011-8100-9b03-e97f8461ceff
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Windows 11 26H2 移除 Secure Pool，以全新 KDP Pool 取代：通过专用 KDPRO 节和 Hyper-V SLAT 只读保护 SeDebugPrivilege、SIDs、DACLs 等安全数据。
> 
> - **背景变迁：** Secure Pool 在 26H2 被移除；KDP Pool 目前是 ntoskrnl 内部特性，实现类似静态 KDP，开发者可在驱动里自行复刻，无需新增内核或虚拟机管理程序能力。
> - **分配模型：** KDPRO 节大小 0x2000，紧跟 CFGRO；动态数据经 ExKdproPoolAllocate 从 ExKdpPool 起始连续分配，按 0x10 对齐，累计须小于 0x1000，且无释放 API；无随机化，但只在早期启动期由 nt 写入，攻击面小。
> - **保护流程：** 启动 phase 1 完成初始化后，MiProtectKernelRoDataSectionsSlat/Va 经 MiProtectDriverSectionPte → KeSetPagePrivilege(0x80) → VslRegisterProtectedPage 先将 KDPRO/CFGRO 页注册到安全内核并建立 NTE，再以 SECURESERVICE_PROTECT_KERNEL_DATA_PAGE 请求通过 SLAT 将页设为只读；PTE 写位被改不影响 SLAT 保护。
> - **典型攻击场景：** 若 SeDebugPrivilege 可写，攻击者用任意内核写把其值从 22 改成 23（SeChangeNotifyPrivilege），可令标准用户 token 的权限检查返回“已启用调试特权”，从而实现调试、内存转储等提权效果；同类手法也适用于 SIDs、DACLs 等数据。
> - **当前覆盖/边界：** 26H2 预览版中仅 security library 使用 KDP pool 存 well-known SIDs、DACLs、ACEs、权限值和默认安全描述符；token 和动态安全描述符仍在普通池，其它库的部分默认描述符（如 WmipDefaultAccessSd）尚未移入。

Kernel Data Protection (KDP) is a Windows 11 VBS feature that allows drivers to protect their data from being modified by other kernel drivers or malware that achieved kernel write access. It actually contains two separate features: static and dynamic KDP. Static KDP, that allows drivers to enforce read-only protection on a data section be enforced through Hyper-V SLAT, was [documented](https://techcommunity.microsoft.com/blog/windowsosplatform/introducing-kernel-data-protection-a-new-security-technology-for-preventing-data/1508098) in 2020 but is still only used by very few drivers. Dynamic KDP, also called the [secure pool](https://windows-internals.com/secure-pool/), was never officially documented by Microsoft and was mainly (ab)used by Alex Ionescu and me to [leak](https://www.quaxio.com/files/2024/pagedout/PagedOut_004_beta1.pdf) (see Paged Out #4 page 43 and vulnerabilities described [here](https://windows-internals.com/secure-pool/)) data from VTL1 or cause VTL1 data corruption.

Sadly, the secure pool was removed in 26H2. In future builds it is replaced by another feature that is much closer in its implementation to static KDP but allows more flexibility. The feature doesn’t have a public name yet, but some functions and variables use the term “KDP Pool” so I will use it here too.

Unlike the secure pool which was available to any driver, KDP Pool is currently an internal feature in ntoskrnl.exe. But since its design (that I’ll describe in the next section) doesn’t add any new kernel or hypervisor functionality, developers can easily recreate it in their own driver if they choose to.

## Design

KDP Pool works on the same principal as static KDP: a dedicated driver section named “KDPRO” is initialized with data that should be protected, and a call to the secure kernel enables read-only enforcement through the hypervisor SLAT. The main difference is that in this new data section the variables and their sizes don’t have to be declared in advance.

The KDPRO section is found immediately after the CFGRO section, which contains a pointer to the KCFG bitmap and other data related to management of KCFG, and is protected in a similar way. At the moment the KDPRO section is sized 0x2000 bytes (2 pages) but it could grow in future versions if more data is added to it. Most of the first page contains pre-defined variables – hard-coded strings, function tables and variables such as pointers to SIDs and DACLs that will be initialized by the kernel. The rest of the section is empty and leaves room for dynamically sized data.

When the kernel first loads, neither the KDPRO or CFGRO sections are protected. The kernel needs to initialize all the data inside those sections, which it does during phase 1 of kernel initiation. At the end of this phase, calls to `MiProtectKernelRoDataSectionsSlat` and `MiProtectKernelRoDataSectionsVa` request that the hypervisor make both these sections read-only, so their contents can’t be modified, even by a ring 0 attacker (unless they can execute kernel-mode code).

## Allocation

As mentioned above, there are two types of data stored in the KDPRO section: pre-defined variables, that get set like any others, and dynamically sized data that is not known at compile time. To handle the second type, the end of the pre-defined data in KDPRO has a `ExKdpPool` variable followed by an unnamed variable I chose to call `ExKdpPoolCurrentSize`. `ExKdpPool` is treated as the beginning of a new pool type, where data can be allocated using the new internal function `ExKdproPoolAllocate`:

[![](https://windows-internals.com/wp-content/uploads/2026/04/image-1024x345.png)](https://windows-internals.com/wp-content/uploads/2026/04/image.png)

Since this is not a real pool, allocation is much simpler than “real” pool allocations. `ExKdproPoolAllocate` receives the requested size, aligns it to `0x10` and adds it to `ExKdpPoolCurrentSize`, which always stores the number of bytes currently allocated in the KDP “pool”. The current limitation is that the total number of allocated bytes must be less than `0x1000`. The function returns a pointer to the end of the last block allocated in the “pool” (the first allocation is at `ExKdpPool + 0x10`, so `0x10` bytes are always added to the current byte count).

Unlike normal kernel pools, this pool has no randomization – all blocks are allocated one after the other. But since this “pool” is only written to by ntoskrnl, and only during early boot phases, it is not at risk for the same types of attacks that affect real pools so randomization and extra mitigations are not needed.

Also, since this “pool” is used for data that needs to be initialized once and then remain resident for the entire lifetime of the system, there is no API to free individual KDP pool blocks.

## Protection

After all the data has been allocated in KDPRO, the kernel needs to make a call to the secure kernel to protect the section. This is done through calls to `MiProtectKernelRoDataSectionsSlat` and `MiProtectKernelRoDataSectionsVa`, which will protect both KDPRO and CFGRO sections. Internally, `MiProtectDriverSectionPte` (the same function used to protect a data section in static KDP) will call `KeSetPagePrivilege` with flag `0x80` to call `VslRegisterProtectedPage` and register the sections pages as protected pages. Like all `Vsl*` functions, `VslRegisterProtectedPage` is a wrapper around a secure call (you can read about secure calls in [this](https://connormcgarr.github.io/secure-calls-and-skbridge/) excellent writeup by Connor McGarr).

This secure call, with code `SECURESERVICE_REGISTER_PROTECTED_PAGE` (262 on preview build 29531), registers each page in the protected section with the secure kernel so an [NTE](https://connormcgarr.github.io/km-shadow-stacks/#:~:text=An%20NTE%2C%20for%20the%20unfamiliar%20reader%2C%20is,with%20every%20%E2%80%9Cpage%20of%20interest%E2%80%9D%20that%20the) is created for it.

(A very brief intro to NTEs: The secure kernel has its own address space, separate from the VTL0 address space. It has page tables that represent its own virtual address space, but it is not “aware” of VTL0 pages unless it is “told” about their existence and identity. VTL0 can register pages with the secure kernel to make it aware of them — that allows the secure kernel to monitor the pages or manage their protection. To manage VTL0 pages, the secure kernel uses a table of NTEs (Normal Table Entry) – a data structure similar to a PTE (Page Table Entry). The secure kernel can’t manage VTL0 pages that do not have a corresponding NTE, so registration is a required step.)

After a page has been registered, the kernel makes another secure call, this time with code `SECURESERVICE_PROTECT_KERNEL_DATA_PAGE` (274 on preview build 29531) to request that the secure kernel sets the page’s protection as read-only in the SLAT.

This protects the section pages from being modified by a VTL0 attacker with kernel write primitive – setting the “write” bit in the PTE will not change the SLAT protection. Only an attacker with kernel code execution can issue a secure call to unprotect the page and make the section writeable again – but at that point they hardly need to change any of the variables stored there.

## What Data is in the KDP Pool?

In current preview (26H2) builds, the only kernel library that allocates data in the KDP pool is the security library. This library is responsible for managing tokens, users, security descriptors, access checks, AppContainers, silos, etc. It uses the KDP pool to store data that is at high risk of being overwritten by an attacker with a kernel arbitrary write vulnerability: well known SIDs, DACLs, ACEs, privilege values and default security descriptors:

[![](https://windows-internals.com/wp-content/uploads/2026/04/image-1-1024x690.png)](https://windows-internals.com/wp-content/uploads/2026/04/image-1.png)

Imagine an attacker with an arbitrary kernel write primitive, using it to overwrite the global variable `SeDebugPrivilege`. This privilege is normally only granted to admin tokens, and must be enabled by the process. Processes with debug privileges can debug any process, attach a kernel debugger to the system (if Debug mode is enabled at boot), generate a memory dump and leak kernel pointers ([since 24H2](https://windows-internals.com/kaslr-leaks-restriction/)). But what if an attacker doesn’t modify its own token (or steal the SYSTEM process token, as many exploits do) but instead modify the value of `SeDebugPrivilege`? By default, the standard user token contains five privileges: `SeShutdownPrivilege` (19), `SeChangeNotifyPrivilege` (23 – enabled by default), `SeUndockPrivilege` (25), `SeIncreaseWorkingSetPrivilege` (33), `SeTimeZonePrivilege` (34). If an attacker overwrites `SeDebugPrivileg` to change it from 22 (its normal value) to 23 (`SeChangeNotifyPrivilege`), all kernel paths that check if `SeDebugPrivilege` is enabled in the process token will return TRUE, allowing unprivileged processes to access powerful capabilities.

The same method can be applied to other privilege values, SIDs, DACLs, etc, to bypass security checks and receive access to resources and capabilities.

To protect from these types of attacks, the security library moved `SeDebugPrivilege` and many other variables to the KDPRO section. Default ACLs, such as `SePublicDefaultDacl`, `SeSystemDefaultDacl` and `SeMediumSacl`, that have a size which is not known at compile time, get allocated during boot using `ExKdproPoolAllocate`. SIDs (well known, user SIDs, trust SIDs and capability SIDs) also get allocated in the KDP pool and pointed to by variable in the first page of the KDPRO section.

Of course, not all security-related data is protected this way. Tokens are still allocated in the normal kernel pools, as are dynamic security descriptors. There are also default security descriptors that are managed by other libraries and were not moved to KDPRO, like `WmipDefaultAccessSd` (that points to `WmipDefaultAccessSecurityDescriptor`) that is used as a default security descriptor for WMI and ETW objects.
