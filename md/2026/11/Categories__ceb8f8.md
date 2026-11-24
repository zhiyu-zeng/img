---
title: Categories
source: https://blog.randorisec.fr/conference-offensivecon-2026/
source_host: blog.randorisec.fr
clip_date: 2026-11-24T10:55:44+08:00
trace_id: 78d8ba49-c620-472d-aa19-e02d1ae7e9ac
content_hash: 4dd88eef80b512cb71b9209dcd95ef7801bfb87c6f68cc8f174321577b71b09d
status: synced
tags: []
series: null
feed_source: RandoriSec·移动/漏洞研究
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 42275244-d011-8133-9745-dea06d77086b
ioc:
  cves:
    - CVE-2025-47394
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

### RandoriSec 6 min

For the third time, we attended the famous OffensiveCon and, as usual, you can find a quick review of what we liked. We attended the talks and a quite demanding training and we also won the first place of a CTF: a ticket to OffensiveCon 2027. So see you next year OffensiveCon!

## Navigating the MTE Landscape - Patrick Ventuzelo & Atlan Pinabel

This talk introduced Apple’s implementation of the (enhanced) memory tagging extension ((e)MTE) and the other memory hardening techniques they have implemented as part of their Memory Integrity Enforcement project.

We were interested in the following two parts of the presentation.

The first one was the presentation of the `zalloc` memory allocator used in the kernel. This is a fixed-size allocator that uses ‘zones’, each of which serves allocations for a single element size. With MTE support added, each slot inside a zone has a tag assigned when the zone is expanded or initialized. The position parity of the slot is used to select the tag. Consequently, adjacent slots will never have the same tag. MTE will catch linear overflow and most of the time, it will catch OOB access to other samry parity slot. To prevent UAF, when a slot is freed, the slot is re-taged when freed.

The second part was about the `xzone` allocator used in userland. At the time of the presentation, it was the only one that MTE. Each allocation uses slab selected by the requested size and a type descriptor. The compiler infers the type descriptor, which indicates the object shapes and the types of fields inside. The allows for the separation of pure-data objects,Objective-C objects and objects with pointer fields. For example, a pure data allocation will not have previously served an allocationg containing pointers. MTE tagging is enabled for all allocation except for large ones.

This talk was very interesting. It offered a clear presentation of the hardening done by Apple’s MIE and the corner cases not caught by MTE.

## Exploiting Android Apps with Counterfeit Art - Philipp Mao & Rokhaya Fall

Philipp Mao and Rokhaya Fall have first explained the `.art` file format and, then, a bug they have discovered in it and how they have managed to exploit it.

The `.art` file format is a somewhat strange file format which contains, among other things, a dump of C++ objects, including **native pointers**. The C++ objects which are located in it are the result of the jit-ing of Java function. Its goal is to speed-up the loading of applications in memory.

During the decompression in memory of the `.art` file, a range is not checked, leading to an arbitrary write if we craft a custom file.

One of the objects which are “dumped” in the file is `ArtMethod`. This object contains 2 pointers, one point to native code (the interpreter entrypoint or the compiled method) and another one to data (the dex bytecode to interpret). By overwriting the code pointers of a method, they can hijack the control flow of the process. They demonstrated us the exploitation of the bug in a “local” context where they have an ASLR leak thanks to Zygote.

Then they demonstrated us how they managed to abuse the relocation process of this file format to hijack the data pointers of an `ArtMethod` with controlled Dex code, transforming the bug into a blind, and persistent code execution.

## From Zero To Root: Attacking Qualcomm DSP Driver - Xiling Gong

Interesting talk from the Android Red Team, by Xiling Gong.

The surface explored was the FastRPC driver, used to communicate with the aDSP on Qualcomm SoC, like SnapDragon one. The aDSP is the Audio peripheral, running on an Hexagon core. The FastRPC driver is responsible for the communication and code loading on the aDSP, many bugs where found by Seth Jenkins and Xiling Gong on this driver. The neat trick is that the driver is normaly not exposed to low-priviledged userland application like `untrusted_app`, however, throught a service reachable via simple transaction, it is possible to grab a fd to the vulnerable driver. This is the key to obtains a direct path to the bug from any applications. Xiling Gong did not spend a lot of time discussing the bug in itself, the `CVE-2025-47394`, he mostly described the leveraged primitive, which was a linear overflow in DMA pages. The exploit strategy relies on a process/thread sprays, in order to smash the saved context, using a another primitive allowing to pauses a process. From there, the speaker explained the various strategies he employed to bypass all the mitigation in place and obtains a successful root shell with SELinux disabled. Bye bye the rooting tool.

## MalOpSec -> EDR: The EDR Crusade training - Silvio La Porta & Antonio Villani

In 3 days we went from the introduction to the use of ROP in kernel drivers to tamper with ETW before competing in a CTF.

The introduction was fast: some reminders about C and windows internals, among other things.

Our trainers then quickly meant business and introduced us (or refreshed our memory on):

```
- minifilters, how they work, how they use altitude to prioritize execution, and callback they used,
- hooking / strategies, APC (Async Procedure Calls) and different hooking libraries / implementations (openEDR in particular),
- unhooking methods like restoring NTDLL (from disk, or better from memory), patching NTDLL in memory to remove hooks, call gates and indirect syscalls.
```

Quite an appetizer, indeed.

After that we reviewed some persistence techniques, classics like DLL hijacking, COM hijacking or WMI before diving into Windows authentication internals, like credential providers, tokens, and handles.

Then Silvio and Antonio presented us the inner working of ETW (Event Tracing for Windows), how providers publish events through sessions that are then consumed by… Well consumers. And how to use logman to create session in order to trace such events. After studying the specifics of Microsoft-Windows-Threat-Intelligence, we’ve seen some simple (but suspicious) and some more sophisticated ways to avoid being snitched on by ETW from user space.

In order to tamper with ETW in kernel space, we needed to study the next topic: ROP and especially how to use it in order to exploit vulnerable drivers and use primitives to tamper with kernel space stuff. Not a simple topic, but certainly an interesting one.

We finished with some AD-related topics, like MS-RPC, NTLM authentication/relay/reflection and, of course, Kerberos, to end on a lighter topic.

For the fourth and final day, we competed in a full-day hands-on CTF where each student receives a dedicated live lab environment: a domain-joined Windows 11 23H2 workstation, a server, and a real OpenEDR instance that we must enumerate, bypass, and dismantle it end to end.

Unlike classic flag-based CTFs, every offensive module had to be injected live into a Pico implant running on the Revo C2 framework and reviewed in real time by mentors, who validated execution and asked questions about implementation choices and internals.

The CTF covered the full offensive kill chain across seven labs: EDR userland hook enumeration and removal, local privilege escalation, process injection without the standard memory-write APIs, lateral movement through a reverse-engineered obfuscated RPC service, kernel-level defense evasion via a vulnerable signed driver, event-driven persistence through the Windows logon pipeline, and in-process execution of a ported network recon tool on a constrained host with no runtime available.

Two prizes were awarded: one for the best Red team and one for the best Blue, each a ticket to OffensiveCon 2027. We won first place on the Red side!

In conclusion: we learned a lot but some work is still necessary in order to understand and digest everything.

## Categories

[0day (15)](https://blog.randorisec.fr/categories/0day)

[Bugbounty (2)](https://blog.randorisec.fr/categories/bugbounty)

[Conference (44)](https://blog.randorisec.fr/categories/conference)

[Ctf (5)](https://blog.randorisec.fr/categories/ctf)

[General (7)](https://blog.randorisec.fr/categories/general)

[Gestion de crise (1)](https://blog.randorisec.fr/categories/gestion-de-crise)

[Pentest (30)](https://blog.randorisec.fr/categories/pentest)

[Publications (18)](https://blog.randorisec.fr/categories/publications)

[Red team (1)](https://blog.randorisec.fr/categories/red_team)

[Responsible disclosure (18)](https://blog.randorisec.fr/categories/responsible_disclosure)

[Spyware (1)](https://blog.randorisec.fr/categories/spyware)

[Sstic (1)](https://blog.randorisec.fr/categories/sstic)

[Swift (1)](https://blog.randorisec.fr/categories/swift)

[Training (15)](https://blog.randorisec.fr/categories/training)

[Workshop (1)](https://blog.randorisec.fr/categories/workshop)

[Writeup (2)](https://blog.randorisec.fr/categories/writeup)
