---
title: KASLR Leaks Restriction – Winsider Seminars & Solutions Inc.
source: https://windows-internals.com/kaslr-leaks-restriction/
source_host: windows-internals.com
clip_date: 2026-09-09T01:34:21+08:00
trace_id: a4d15838-6b5e-40fc-9280-7eb1647a4352
content_hash: 1e23c137627cc0dcbab298799c0189d9b4e4aa09c76e87245c3be140c6019faf
status: synced
tags:
  - 内核
  - 漏洞分析
series: null
feed_source: null
ai_summary: Windows 11/Server 24H2 起，未启用 SeDebugPrivilege 的进程调用泄露内核地址的 API 时，查询成功但地址字段被置 0。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 3d575244-d011-81c4-ab66-f65b001da031
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Windows 11/Server 24H2 起，未启用 SeDebugPrivilege 的进程调用泄露内核地址的 API 时，查询成功但地址字段被置 0。
> 
> - **背景动因：** 微软近年着力缓解漏洞利用，而几乎所有内存漏洞利用都需要先取得 ntoskrnl.exe 等内核模块或对象的地址；过去 Medium IL 以上进程只需调用若干公开 API 即可轻易获得这些地址。
> - **触发变化：** Windows 11 / Windows Server 2022 24H2 起，除非进程启用了仅管理员可用且默认关闭的 SeDebugPrivilege，这些 API 不再向用户态返回内核地址。
> - **实现细节：** 内核在 `ExIsRestrictedCaller` 中新增了标志检查进程是否启用 SeDebugPrivilege，结果通过未公开名称的参数（作者暂称之为 RestrictKernelAddressLeaks）返回给调用方，由调用方决定填充哪些内核数据。
> - **具体例子：** `NtQuerySystemInformation` 的 `SystemModuleInformation` 分支在受限时仍会列出已加载内核模块，但每个模块的 `DllBase` 基址字段一律被填为 0。
> - **影响范围与局限：** 所有已知会向用户态泄露内核地址的 API 都被套用同一检查；Medium IL 及以上调用者查询成功，但地址字段被置空。作者也指出这些 API 并非唯一泄漏途径，KASLR 泄漏尚未终结，将另文继续探讨。

In recent years, Microsoft has focused its efforts on mitigating bug classes and exploitation techniques. In latest Windows versions this includes another change that adds a significant challenge to attackers targeting the Windows kernel — restricting kernel address leaks to user mode. With almost any memory bugs, an attacker needs some kernel address leak to know which address will be read / written into / overflowed / corrupted. That address could be the address of ntoskrnl.exe or other kernel drivers, or the address of some object that the attacker targets. Until recently, getting those was very easy (for anyone running at medium integrity level or above). All you had to do was call one of [several known windows APIs](https://github.com/waleedassar/RestrictedKernelLeaks).

## 新机制与特权前提

But starting Windows 11 / Windows Server 2022 `24H2` edition, those APIs will no longer leak any kernel addresses, unless the requesting process has enabled [`SeDebugPrivilege`](https://devblogs.microsoft.com/oldnewthing/20080314-00/?p=23113), a powerful privilege which is only available to admin processes and not enabled by default. This check is implemented with a new flag passed to `ExIsRestrictedCaller`:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ddf57b287c568fa3.png)](https://windows-internals.com/wp-content/uploads/2023/11/ExIsRestrictedCaller.png)

## ExIsRestrictedCaller 检查机制

`ExIsRestrictedCaller` is called in various places in the kernel to check whether a process should receive access to a resource or be allowed to perform an operation. This is used to restrict processes running with an integrity level of `Low` or `Untrusted` from calling APIs that return kernel addresses, for example. Now, this API also checks if the process enables `SeDebugPrivilege` and uses the result to set the `RestrictKernelAddressLeaks` argument (name chosen by me, as the argument name is not public) and return it to the caller. This argument is then used by the caller to decide what kernel data can be returned to the user-mode caller.

## 示例：NtQuerySystemInformation

For example, when `NtQuerySystemInformation` (which calls the internal `ExpQuerySystemInformation`) is called with the `SystemModuleInformation` class, ExIsRestrictedCaller is called to determine what data the caller can receive. The output argument then gets passed into `ExpQueryModuleInformation`:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/57183bf36b9ce420.png)](https://windows-internals.com/wp-content/uploads/2023/11/ExpQuerySystemInformation.png)

Inside `ExpQueryModuleInformation`, the `RestrictKernelAddressLeaks` argument is used to decide whether the function will populate the `DllBase` field for every kernel module loaded in the system:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2bd1a198810f42f4.png)](https://windows-internals.com/wp-content/uploads/2023/11/ExpQueryModuleInformation_2.png)

## 受限调用的返回结果

If the argument is set, which means the process does not enable `SeDebugPrivilege`, the process will still be able to receive information about the loaded kernel modules. But that information will not include the base address of those modules – that field will be set to `0`.

This check is done in all other APIs known to leak kernel addresses to user-mode callers. In all cases, the query will succeed for callers running at Medium IL or above, but the fields that normally contain kernel addresses will be left empty. The full list of APIs which now restrict kernel address leaks are:

\[table id=1 /\]

## 局限：KASLR 泄漏未终结

Are these APIs the only ways to leak kernel addresses? Are KASLR leaks finally dead? Of course not. But more on that in another blog post 🙂

-   [Random Windows Things Part 2: Unexpected Clipboard Data Behavior](https://windows-internals.com/random-windows-things-part-2-unexpected-clipboard-data-behavior/)
-   [Random Windows Things Part 1: PreviousMode Mitigation](https://windows-internals.com/random-windows-things-part-1-previousmode-mitigation/)
-   [Goodbye Secure Pool, Hello KDP Pool](https://windows-internals.com/goodbye-secure-pool-hello-kdp-pool/)
-   [Secure Kernel Research with LiveCloudKd](https://windows-internals.com/secure-kernel-research-with-livecloudkd/)
-   [Troubleshooting a System Crash](https://windows-internals.com/troubleshooting-a-system-crash/)
-   [KASLR Leaks Restriction](https://windows-internals.com/kaslr-leaks-restriction/)
-   [Investigating Filter Communication Ports](https://windows-internals.com/investigating-filter-communication-ports/)
-   [An End to KASLR Bypasses?](https://windows-internals.com/an-end-to-kaslr-bypasses/)
-   [Understanding a New Mitigation: Module Tampering Protection](https://windows-internals.com/understanding-a-new-mitigation-module-tampering-protection/)
-   [One I/O Ring to Rule Them All: A Full Read/Write Exploit Primitive on Windows 11](https://windows-internals.com/one-i-o-ring-to-rule-them-all-a-full-read-write-exploit-primitive-on-windows-11/)
