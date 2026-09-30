---
title: "Safe in the sandbox: security hardening for Cloudflare Workers"
source: https://blog.cloudflare.com/safe-in-the-sandbox-security-hardening-for-cloudflare-workers/
source_host: blog.cloudflare.com
clip_date: 2026-09-30T10:31:06+08:00
trace_id: b5bcaa8f-5a85-44c8-b6e4-4e304b51098b
content_hash: 9df5ac821ec96d43e6c07d3cba1f3eb3f208b22e2d7227ce7c67f9e3712cb6db
status: synced
tags:
  - 沙箱安全
  - Linux安全
series: null
feed_source: Cloudflare·漏洞研究
ai_summary: Cloudflare 通过 V8 沙箱、内存保护键与自研隔离组，把 Workers 多租户内存攻击面限制在硬件/软件双重边界内。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3eb75244-d011-812c-8d38-cc1794089e4e
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Cloudflare 通过 V8 沙箱、内存保护键与自研隔离组，把 Workers 多租户内存攻击面限制在硬件/软件双重边界内。
> 
> - **硬件隔离：** 用 x64 内存保护键（PKU）给每个 isolate 随机键保护 V8 堆，跨 isolate 读会触发硬件陷阱，约 92% 覆盖。
> - **V8 沙箱：** 基于压缩指针构建 8 GiB 指针笼，堆内只存 32 位偏移，缓冲区偏移 33 位；破坏堆内数据也无法逃出沙箱。
> - **隔离组：** Cloudflare 委托 Igalia 为 V8 增加 isolate groups，使同一进程内多个 isolate 可各有沙箱，突破原先单沙箱 <4 GiB 限制。
> - **内存布局：** 每个沙箱占 8 GiB 虚拟地址并需 4 GiB 对齐；Linux 4 级页表 128 TiB 不够，改用 mprotect 紧密打包。
> - **最终防护：** 用轮转 PKU 键让相邻沙箱互为保护带，避免 32 GiB 常规 guard region；该威胁模型下防护率提升到 100%。

As a [serverless](https://www.cloudflare.com/learning/serverless/what-is-serverless/) cloud provider, we run your code on our globally distributed infrastructure. Being able to run customer code on our network means that anyone can take advantage of our global presence and low latency. Workers isn’t just efficient though, we also make it simple for our users. In short: [You write code. We handle the rest](https://workers.cloudflare.com/).

Part of 'handling the rest' is making Workers as secure as possible. We have previously written about our [security architecture](https://blog.cloudflare.com/mitigating-spectre-and-other-security-threats-the-cloudflare-workers-security-model/). Making Workers secure is an interesting problem because the whole point of Workers is that we are running third party code on our hardware. This is one of the hardest security problems there is: any attacker has the full power available of a programming language running on the victim's system when they are crafting their attacks.

This is why we are constantly updating and improving the Workers Runtime to take advantage of the latest improvements in both hardware and software. This post shares some of the latest work we have been doing to keep Workers secure.

Some background first: [Workers](https://www.cloudflare.com/developer-platform/products/workers/) is built around the [V8](https://v8.dev/) JavaScript runtime, originally developed for Chromium-based browsers like Chrome. This gives us a head start, because V8 was forged in an adversarial environment, where it has always been under intense attack and [scrutiny](https://github.blog/security/vulnerability-research/getting-rce-in-chrome-with-incorrect-side-effect-in-the-jit-compiler/). Like Workers, Chromium is built to run adversarial code safely. That's why V8 is constantly being tested against the best fuzzers and sanitizers, and over the years, it has been hardened with new technologies like [Oilpan/cppgc](https://v8.dev/blog/oilpan-library) and improved static analysis.

We use V8 in a slightly different way, though, so we will be describing in this post how we have been making some changes to V8 to improve security in our use case.

## Hardware-assisted security improvements from Memory Protection Keys

Modern CPUs from Intel, AMD, and ARM have support for [memory protection keys](https://man7.org/linux/man-pages/man7/pkeys.7.html), sometimes called *PKU*, Protection Keys for Userspace. This is a great security feature which increases the power of virtual memory and memory protection.

Traditionally, the memory protection features of the CPU in your PC or phone were mainly used to protect the kernel and to protect different processes from each other. Within each process, all threads had access to the same memory. Memory protection keys allow us to prevent specific threads from accessing memory regions they shouldn't have access to.

V8 already [uses memory protection keys](https://issues.chromium.org/issues/41480375) for the [JIT compilers](https://en.wikipedia.org/wiki/Just-in-time_compilation). The JIT compilers for a language like JavaScript generate optimized, specialized versions of your code as it runs. Typically, the compiler is running on its own thread, and needs to be able to write data to the code area in order to install its optimized code. However, the compiler thread doesn't need to be able to run this code. The regular execution thread, on the other hand, needs to be able to run, but not modify, the optimized code. Memory protection keys offer a way to give each thread the permissions it needs, but [no more](https://en.wikipedia.org/wiki/W%5EX). And the V8 team in the Chromium project certainly aren't standing still. They describe some of their future plans for memory protection keys [here](https://docs.google.com/document/d/1l3urJdk1M3JCLpT9HDvFQKOxuKxwINcXoYoFuKkfKcc/edit?tab=t.0#heading=h.gpz70vgxo7uc).

In Workers, we have some different requirements than Chromium. [The security architecture for Workers](https://developers.cloudflare.com/workers/reference/security-model/) uses V8 isolates to separate different scripts that are running on our servers. (In addition, we have [extra mitigations](https://blog.cloudflare.com/spectre-research-with-tu-graz/) to harden the system against [Spectre](https://en.wikipedia.org/wiki/Spectre_\(security_vulnerability\)) attacks). If V8 is working as intended, this should be enough, but we believe in *defense in depth*: multiple, overlapping layers of security controls.

That's why we have deployed internal modifications to V8 to use memory protection keys to isolate the isolates from each other. There are up to 15 different keys available on a modern x64 CPU and a few are used for other purposes in V8, so we have about 12 to work with. We give each isolate a random key which is used to protect its V8 *heap data*, the memory area containing the JavaScript objects a script creates as it runs. This means security bugs that might previously have allowed an attacker to read data from a different isolate would now hit a hardware trap in 92% of cases. (Assuming 12 keys, 92% is about 11/12.)

The illustration shows an attacker attempting to read from a different isolate. Most of the time this is detected by the mismatched memory protection key, which kills their script and notifies us, so we can investigate and remediate. The red arrow represents the case where the attacker got lucky by hitting an isolate with the same memory protection key, represented by the isolates having the same colors.

However, we can further improve on a 92% protection rate. In the last part of this blog post we'll explain how we can lift that to 100% for a particular common scenario. But first, let's look at a software hardening feature in V8 that we are taking advantage of.

## The V8 sandbox, a software-based security boundary

Over the past few years, V8 has been gaining another defense in depth feature: the V8 sandbox. (Not to be confused with the [layer 2 sandbox](https://blog.cloudflare.com/sandboxing-in-linux-with-zero-lines-of-code/) which Workers have been using since the beginning.) The V8 sandbox has been a multi-year project that has been gaining [maturity](https://v8.dev/blog/sandbox) for a while. The sandbox project stems from the observation that many V8 security vulnerabilities start by corrupting objects in the V8 heap memory. Attackers then leverage this corruption to reach other parts of the process, giving them the opportunity to escalate and gain more access to the victim's browser, or even the entire system.

V8's sandbox project is an ambitious software security mitigation that aims to thwart that escalation: to make it impossible for the attacker to progress from a corruption on the V8 heap to a compromise of the rest of the process. This means, among other things, removing all pointers from the heap. But first, let's explain in as simple terms as possible, what a memory corruption attack is.

### Memory corruption attacks

A memory corruption attack tricks a program into misusing its own memory. Computer memory is just a store of integers, where each integer is stored in a location. The locations each have an *address*, which is also just a number. Programs interpret the data in these locations in different ways, such as text, pixels, or *pointers*. Pointers are addresses that identify a different memory location, so they act as a sort of arrow that points to some other piece of data.

Here's a concrete example, which uses a buffer overflow. This is a form of attack that was historically common and relatively simple to understand: Imagine a program has a small buffer (like a 16-character text field) followed immediately by an 8-byte pointer to some ordinary data. An attacker might send the program a 24-character string, causing a "buffer overflow." Because of a vulnerability in the program, the first 16 characters fill the intended buffer, but the remaining 8 characters spill over and overwrite the adjacent pointer.

*See below for how such an attack would now be thwarted.*

Now the pointer has been redirected to point at sensitive data of the attacker's choosing, rather than the normal data it was originally meant to access. When the program tries to use what it believes is its normal pointer, it's actually accessing sensitive data chosen by the attacker.

This type of attack works in steps: first create a small confusion (like the buffer overflow), then use that confusion to create bigger problems, eventually gaining access to data or capabilities the attacker shouldn't have. The attacker can eventually use the misdirection to either steal information or plant malicious data that the program will treat as legitimate.

This was a somewhat abstract description of memory corruption attacks using a buffer overflow, one of the simpler techniques. For some much more detailed and recent examples, see [this description from Google](https://googleprojectzero.blogspot.com/2015/06/what-is-good-memory-corruption.html), or this [breakdown of a V8 vulnerability](https://medium.com/@INTfinitySG/miscellaneous-series-2-a-script-kiddie-diary-in-v8-exploit-research-part-1-5b0bab211f5a).

### Compressed pointers in V8

Many attacks are based on corrupting pointers, so ideally we would remove all pointers from the memory of the program. Since an object-oriented language's heap is absolutely full of pointers, that would seem, on its face, to be a hopeless task, but it is enabled by an earlier development. Starting in 2020, V8 has offered the option of saving memory by using [compressed pointers](https://v8.dev/blog/pointer-compression). This means that, on a 64-bit system, the heap uses only 32 bit offsets, relative to a base address. This limits the total heap to maximally 4 GiB, a limitation that is acceptable for a browser, and also fine for individual scripts running in a V8 isolate on Cloudflare Workers.

*An artificial object with various fields, showing how the layout differs in a compressed vs. an uncompressed heap. The boxes are 64 bits wide.*

If the whole of the heap is in a single 4 GiB area then the first 32 bits of all pointers will be the same, and we don't need to store them in every pointer field in every object. In the diagram we can see that the object pointers all start with 0x12345678, which is therefore redundant and doesn't need to be stored. This means that object pointer fields and integer fields can be reduced from 64 to 32 bits.

We still need 64 bit fields for some fields like double precision floats and for the sandbox offsets of buffers, which are typically used by the script for input and output data. See below for details.

Integers in an uncompressed heap are stored in the high 32 bits of a 64 bit field. In the compressed heap, the top 31 bits of a 32 bit field are used. In both cases the lowest bit is set to 0 to indicate integers (as opposed to pointers or offsets).

Conceptually, we have two methods for compressing and decompressing, using a base address that is divisible by 4 GiB:

This pointer compression feature, originally primarily designed to save memory, can be used as the basis of a sandbox.

### From compressed pointers to the sandbox

The biggest 32-bit unsigned integer is about 4 billion, so the `Decompress()` function cannot generate any pointer that is outside the range \[base, base + 4 GiB\]. You could say the pointers are trapped in this area, so it is sometimes called the *pointer cage*. V8 can reserve 4 GiB of virtual address space for the pointer cage so that only V8 objects appear in this range. By eliminating *all* pointers from this range, and following some other strict rules, V8 can contain any memory corruption by an attacker to this cage. Even if an attacker corrupts a 32 bit offset within the cage, it is still only a 32 bit offset and can only be used to create new pointers that are still trapped within the pointer cage.

*The buffer overflow attack from earlier no longer works because only the attacker's own data is available in the pointer cage.*

To construct the sandbox, we take the 4 GiB pointer cage and add another 4 GiB for buffers and other data structures to make the 8 GiB sandbox. This is why the buffer offsets above are 33 bits, so they can reach buffers in the second half of the sandbox (40 bits in Chromium with larger sandboxes). V8 stores these buffer offsets in the high 33 bits and shifts down by 31 bits before use, in case an attacker corrupted the low bits.

Cloudflare Workers have made use of compressed pointers in V8 for a while, but for us to get the full power of the sandbox we had to make some changes. Until recently, all isolates in a process had to be one single sandbox if you were using the sandboxed configuration of V8. This would have limited the total size of all V8 heaps to be less than 4 GiB, far too little for our architecture, which relies on serving 1000s of scripts at once.

That's why we commissioned [Igalia](https://www.igalia.com/) to add [isolate groups](https://dbezhetskov.dev/multi-sandboxes/) to V8. Each isolate group has its own sandbox and can have 1 or more isolates within it. Building on this change we have been able to start using the sandbox, eliminating a whole class of potential security issues in one stroke. Although we can place multiple isolates in the same sandbox, we are currently only putting a single isolate in each sandbox.

*The layout of the sandbox. In the sandbox there can be more than one isolate, but all their heap pages must be in the pointer cage: the first 4 GiB of the sandbox. Instead of pointers between the objects, we use 32 bit offsets. The offsets for the buffers are 33 bits, so they can reach the whole sandbox, but not outside it.*

## Virtual memory isn't infinite, there's a lot going on in a Linux process

At this point, we were not quite done, though. Each sandbox reserves 8 GiB of space in the virtual memory map of the process, and it must be 4 GiB aligned [for efficiency](https://v8.dev/blog/pointer-compression). It uses much less physical memory, but the sandbox mechanism requires this much virtual space for its security properties. This presents us with a problem, since a Linux process 'only' has 128 TiB of virtual address space in a 4-level page table (another 128 TiB are reserved for the kernel, not available to user space).

At Cloudflare, we want to run Workers as efficiently as possible to keep costs and prices down, and to offer a generous free tier. That means that on each machine we have so many isolates running (one per sandbox) that it becomes hard to place them all in a 128 TiB space.

Knowing this, we have to place the sandboxes carefully in memory. Unfortunately, the Linux syscall, [mmap](https://man7.org/linux/man-pages/man2/mmap.2.html), does not allow us to specify the alignment of an allocation unless you can guess a free location to request. To get an 8 GiB area that is 4 GiB aligned, we have to ask for 12 GiB, then find the aligned 8 GiB area that must exist within that, and return the unused (hatched) edges to the OS:

If we allow the Linux kernel to place sandboxes randomly, we end up with a layout like this with gaps. Especially after running for a while, there can be both 8 GiB and 4 GiB gaps between sandboxes:

Sadly, because of our 12 GiB alignment trick, we can't even make use of the 8 GiB gaps. If we ask the OS for 12 GiB, it will never give us a gap like the 8 GiB gap between the green and blue sandboxes above. In addition, there are a host of other things going on in the virtual address space of a Linux process: the malloc implementation may want to grab pages at particular addresses, the executable and libraries are mapped at a random location by ASLR, and V8 has allocations outside the sandbox.

The latest generation of x64 CPUs supports a much bigger address space, which solves both problems, and Linux kernels are able to make use of the extra bits with [five level page tables](https://en.wikipedia.org/wiki/Intel_5-level_paging). A process has to [opt into this](https://lwn.net/Articles/717293/), which is done by a single mmap call suggesting an address outside the 47 bit area. The reason this needs an opt-in is that some programs can't cope with such high addresses. Curiously, V8 is one of them.

This isn't hard to fix in V8, but not all of our fleet has been upgraded yet to have the necessary hardware. So for now, we need a solution that works with the existing hardware. We have modified V8 to be able to grab huge memory areas and then use [mprotect syscalls](https://man7.org/linux/man-pages/man2/mprotect.2.html) to create tightly packed 8 GiB spaces for sandboxes, bypassing the inflexible mmap API.

## Putting it all together

Taking control of the sandbox placement like this actually gives us a security benefit, but first we need to describe a particular threat model.

We assume for the purposes of this threat model that an attacker has an arbitrary way to corrupt data within the sandbox. This is historically the first step in many V8 exploits. So much so that there is a [special tier](https://bughunters.google.com/about/rules/chrome-friends/5745167867576320/chrome-vulnerability-reward-program-rules#v8-sandbox-bypass-rewards) in Google's V8 bug bounty program where you may *assume* you have this ability to corrupt memory, and they will pay out if you can leverage that to a more serious exploit.

However, we assume that the attacker does not have the ability to execute arbitrary machine code. If they did, they could [disable memory protection keys](https://www.usenix.org/system/files/sec20fall_connor_prepub.pdf). Having access to the in-sandbox memory only gives the attacker access to their own data. So the attacker must attempt to escalate, by corrupting data inside the sandbox to access data outside the sandbox.

You will recall that the compressed, sandboxed V8 heap only contains 32 bit offsets. Therefore, no corruption there can reach outside the pointer cage. But there are also arrays in the sandbox — vectors of data with a given size that can be accessed with an index. In our threat model, the attacker can modify the sizes recorded for those arrays and the indexes used to access elements in the arrays. That means an attacker could potentially turn an array in the sandbox into a tool for accessing memory incorrectly. For this reason, the V8 sandbox normally has *guard regions* around it: These are 32 GiB virtual address ranges that have no virtual-to-physical address mappings. This helps guard against the worst case scenario: Indexing an array where the elements are 8 bytes in size (e.g. an array of double precision floats) using a maximal 32 bit index. Such an access could reach a distance of up to 32 GiB outside the sandbox: 8 times the maximal 32 bit index of four billion.

We want such accesses to trigger an alarm, rather than letting an attacker access nearby memory. This happens automatically with guard regions, but we don't have space for conventional 32 GiB guard regions around every sandbox.

Instead of using conventional guard regions, we can make use of memory protection keys. By carefully controlling which isolate group uses which key, we can ensure that no sandbox within 32 GiB has the same protection key. Essentially, the sandboxes are acting as each other's guard regions, protected by memory protection keys. Now we only need a wasted 32 GiB guard region at the start and end of the huge packed sandbox areas.

With the new sandbox layout, we use strictly rotating memory protection keys. Because we are not using randomly chosen memory protection keys, for this threat model the 92% problem described above disappears. Any in-sandbox security issue is unable to reach a sandbox with the same memory protection key. In the diagram, we show that there is no memory within 32 GiB of a given sandbox that has the same memory protection key. Any attempt to access memory within 32 GiB of a sandbox will trigger an alarm, just like it would with unmapped guard regions.

## The future

In a way, this whole blog post is about things our customers *don't* need to do. They don't need to upgrade their server software to get the latest patches, we do that for them. They don't need to worry whether they are using the most secure or efficient configuration. So there's no call to action here, except perhaps to sleep easy.

However, if you find work like this interesting, and especially if you have experience with the implementation of V8 or similar language runtimes, then you should consider coming to work for us. [We are recruiting both in the US and in Europe](https://job-boards.greenhouse.io/cloudflare/jobs/6718312?gh_jid=6718312). It's a great place to work, and Cloudflare is going from strength to strength.
