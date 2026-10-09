---
title: "VED 2026: after CFI - data only"
source: https://hardenedvault.net/blog/2025-09-17-dfi-security/
source_host: hardenedvault.net
clip_date: 2026-10-07T10:18:46+08:00
trace_id: a8f7417f-aa72-40f3-b829-d577791d2f8d
content_hash: f1145bcd11b7b95fad37f85bcc2317cdc0036495dc893e9f4fe02fac89c9501b
status: synced
tags:
  - 内核
  - 漏洞分析
series: null
feed_source: HardenedVault·Linux内核利用/加固
ai_summary: 随着 CFI 成为常态，内核提权正从控制流操纵转向纯数据篡改，而 VED 在漏洞利用阶段用多种检测手段拦截这类攻击。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3f475244-d011-8107-82b6-de00ecfa37b4
ioc:
  cves:
    - CVE-2021-26708
    - CVE-2022-0847
    - CVE-2022-2588
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 随着 CFI 成为常态，内核提权正从控制流操纵转向纯数据篡改，而 VED 在漏洞利用阶段用多种检测手段拦截这类攻击。
> 
> - **攻击演进：** DirtyPipe、cred-jar spray、pipe_primitive 等纯数据破坏技术因更隐蔽稳定而流行，堆风水与 page UAF 进一步降低可检测性；Black Hat 2025 的协程框架编程与 HITCON CTF 2025 题目亦属此类 CFI 绕过方向。
> - **VED/LKRG 局限：** 内核函数钩子无法完整追踪对象读写，pCFI/wCFI 也构不成完整校验链；但攻击者多复用内核函数以提稳，故对关键函数的检查仍能挡住一般 ROP。
> - **检测手段取舍：** 影子数据可精确定位但耗资源（LKRG cred、VED RO guard）；哈希省资源但只能判断是否被改（kern_integ、VED msg/core pattern）；slab poison 仅适用于专用 slab（VED poison cred）；合理性检查准确却高度个案化。
> - **core pattern 与 cred：** 污染 core pattern 可绕过 CFI 提权，VED 在 coredump 时校验其哈希来阻断；poison-cred 监控 cred_jar 的任意 free 与堆喷，比 LKRG 的事后检测更早介入，且避免强杀进程导致 panic。
> - **pipe 与 CPU pinning：** VED 在 pipe 读写钩子处校验 buffer 内存属性以阻断 page UAF；限制 CPU pinning（仅豁免 GID 可调用）长期可降低约 20%-30% 利用成功率，代价是特定场景的灵活性。

![VED 2026: after CFI - data only](https://hardenedvault.net/images/blog/dfi_hubc669fd09cf48f735fe4f1d098c290ef_50675_1110x0_resize_q100_h2_box.webp)

## VED 2026: after CFI - data only

## after CFI - data only

The exploitation techniques and mitigation has been evolving rapidly since the paper “Smash the Stack for Fun and Profit” released in Phrack Issue 49. The PaX team’s document “pax-future.txt” from 2003 ( [https://pax.grsecurity.net/docs/pax-future.txt](https://pax.grsecurity.net/docs/pax-future.txt) ) is still effective today, especially as the Control Flow Integrity (CFI) become the norm against the second type of attack. In the meantime, CFI bypasses have gradually become the new normal as well.

-   [https://i.blackhat.com/BH-USA-25/Presentations/USA-25-Bajo-Coroutine-Frame-Oriented-Programming-Breaking.pdf](https://i.blackhat.com/BH-USA-25/Presentations/USA-25-Bajo-Coroutine-Frame-Oriented-Programming-Breaking.pdf)
    
-   [https://bruce30262.github.io/hitcon-ctf-2025-calc/](https://bruce30262.github.io/hitcon-ctf-2025-calc/)
    

Data-only attack is getting popular. In the niche world of kernel exploitation, the evolution of privilege escalation methods reflects the continuous advancement of attack techniques and the adaptability of defense mechanisms. In the past, control flow manipulation techniques, such as Return-Oriented Programming (ROP), were the most commonly used means of privilege escalation. However, with the emergence of Control Flow Integrity (CFI) technologies, researchers have gradually shifted towards pure data corruption methods to achieve privilege escalation. This transition not only enhances the stealthiness of attacks but also improves their stability. The typical techniques are:

\* DirtyPipe [https://github.com/AlexisAhmed/CVE-2022-0847-DirtyPipe-Exploits](https://github.com/AlexisAhmed/CVE-2022-0847-DirtyPipe-Exploits)

\* cred-jar spray [https://hardenedvault.net/blog/2022-03-01-poc-cve-2021-26708/](https://hardenedvault.net/blog/2022-03-01-poc-cve-2021-26708/)

\* pipe_primitive [https://github.com/veritas501/pipe-primitive](https://github.com/veritas501/pipe-primitive)

The stealthiness and stability of these techniques have made them increasingly popular in modern attacks. Researchers have proposed lower-level attack methods, such as heap feng shui and page Use-After-Free (UAF), making pure data corruption attacks even harder to detect. For defensive side, the development of data structure-based classification heaps (such as PaX/GRsecurity [AUTOSLAB/KERNSEAL](https://grsecurity.net/how_autoslab_changes_the_memory_unsafety_game), [kalloc](https://security.apple.com/blog/towards-the-next-generation-of-xnu-memory-safety/)) and Memory Tagging Extension (MTE),

## Limitations of VED and LKRG

VED is a kernel loadable module based on LKRG, it has certain limitations in implementing Data Flow Integrity (DFI). The main reason is that hooks based on kernel functions cannot fully track the usage of objects. In contrast, compiler-based sanitizers or other custom compiler features can perform instruction-level instrumentation, providing more comprehensive monitoring. Similarly, the pCFI of LKRG and the wCFI of VED theoretically cannot construct a complete chain of checks. However, in practice, attackers often choose to reuse kernel functions to enhance stability rather than constructing pure instruction ROP chains. Therefore, performing checks on certain critical functions can still effectively defend against general ROP attacks.

Although pure data corruption methods for privilege escalation are complex and varied, such as credential corruption and arbitrary file read/write, there are still some sensitive key data structures that require integrity checks. Both LKRG and VED attempt to implement data integrity checks on these sensitive data structures (such as credentials). Important data structures typically have independent and well-designed structures along with corresponding APIs, and the read and write operations in these code areas are referred to as authorized modifications. By tracking the read and write behaviors of these areas through function hooks, if a change in data is detected that was not tracked by the hook functions, it can be determined that unauthorized modifications have occurred, thereby identifying instances of data corruption.

## How to detect unauthorized modifications

In kernel security, detecting unauthorized modifications is a crucial aspect of ensuring data integrity. Currently, VED (a kernel loadable module) employs various mitigation measures to address data corruption. Below is an analysis of these methods, including their advantages, disadvantages, and specific application cases.

| Mitigation type | Pros | Cons | Mitigation case |
| --- | --- | --- | --- |
| maintain a shadow | precisely track what is corrupted | calculate/store resource | LKRG’s cred, VED RO guard |
| maintain hash | save calculate/store resource | check if data is corrupt only | kern_integ/msg/core pattern |
| slab poison | detect arbitary free(heap bucket can’t) | specialized slab only | VED poison cred |
| reasonable check | accurate, easy to check | uncommon, case by case | VED msg/pipe_buffer pretecting |

## Shadow data

### Mitigation

Shadow data refers to the technique of hooking the alloc/write/read/free code for protected data to maintain corresponding data copies. When the data is corrupted by other code (unauthorized modification), the specific circumstances of the data corruption can be traced by comparing the copies. This method is very intuitive and effective; for instance, LKRG’s privilege escalation defense uses this approach to check credentials. However, the challenges of this method include the need to store data redundantly to some extent and to rewrite similar read and write access code. Additionally, some data may require corresponding lock designs due to high-frequency access to eliminate race condition issues. Therefore, the engineering design demands are relatively high, and there is considerable waste of computational resources.

## core pattern overwrite and VED core pattern protection

### Mitigation

Using data hashes to track unauthorized modifications is very common and effective. The principle is similar to that of shadow data, except that hashes are stored instead of data copies. LKRG itself has many applications, such as kern integ. Unlike directly maintaining data copies, storing data hashes requires less space, and comparing hashes can sometimes be more convenient than comparing data copies. This is particularly useful for integrity checks involving large amounts of data, and not storing copies is also significant for preventing information leaks caused by the security module itself. In addition to LKRG’s kern integ, VED also employs this method in security features like msg [https://hardenedvault.net/blog/2022-11-13-msg_msg-recon-mitigation-ved/](https://hardenedvault.net/blog/2022-11-13-msg_msg-recon-mitigation-ved/) and core pattern to prevent data corruption.

Although core pattern is not the most typical application of this type of mitigation, we still introduced this newly supported security feature in VED due to its repeated appearances in the Google KernelCTF.

### Vulnerability

Although contaminating the core pattern ultimately achieves privilege escalation by controlling the kernel to execute the attacker’s desired code, such as in this PoC ([https://github.com/google/security-research/blob/master/pocs/linux/kernelctf/CVE-2023-52447_cos/exploit/cos-105-17412.294.10/exploit.c](https://github.com/google/security-research/blob/master/pocs/linux/kernelctf/CVE-2023-52447_cos/exploit/cos-105-17412.294.10/exploit.c)) that demonstrates how to contaminate the core pattern and trigger a crash to run a privilege escalation binary, control flow integrity (CFI) cannot detect such attacks since the execution flow control points to the binary through the contaminated core pattern.

To address this type of attack, we implement hash tracking for the core pattern. Whenever the kernel uses the normal execution flow for the core pattern, VED updates the hash of the core pattern. Each time the kernel triggers a coredump (when a user-space process crashes), VED checks the hash value of the core pattern to determine if it has been illegally modified, thereby blocking privilege escalation through core pattern contamination.

## cred-jar heap spray and VED poison-cred

### Mitigation

Slab poisoning is also an important method for protecting objects from data corruption. Unlike focusing on read and write contamination of objects, it primarily tracks the allocation and deallocation of objects by setting and checking the slab cache’s poison to prevent Use-After-Free (UAF) issues caused by arbitrary frees. As long as the slab type is independent, it is possible to implement slab cache poisoning for kernel objects and their corresponding API designs. The poison-cred developed by VED to ensure the security of credentials is based on this principle.

### Vulnerability

cred are the most commonly attacked data structures, and contaminating cred can directly achieve privilege escalation. Unlike being subjected to UAF contamination from other objects in the slab cache, the cred-jar has its own independent slab cache and does not share the same page with other types of objects. Some cred contamination requires first performing an arbitrary free to carry out a heap spray on the cred-jar, followed by the actual data contamination of the cred.

``` 
vuln object corruption -> out-bound-access/arbitary write -> arbitary free -> cred_jar heap spary -> cred overwrite
```

This vulnerability exploit ([https://hardenedvault.net/blog/2022-03-01-poc-cve-2021-26708/](https://hardenedvault.net/blog/2022-03-01-poc-cve-2021-26708/)) is such an example. Our developed poison-cred sets and checks the poison on the cred’s slab cache to track whether cred has been subjected to arbitrary frees from other vulnerable objects, thereby protecting the data of cred from contamination.

You may notice that this feature overlaps with the cred functionality used by the framework LKRG employed by VED. Indeed, LKRG can detect the last step in the aforementioned chain: data contamination. However, poison-cred can intervene during the heap spray phase. LKRG focuses on post-exploitation detection, while poison-cred is designed for detection at the exploit stage. Due to LKRG’s good design, past experiments have shown that even if cred contamination leads to privilege escalation, the process can only exist in a very limited capacity, making it difficult to sustain further exploitation, such as creating new processes or reading and writing files.

However, privilege escalation does occur, and poison-cred can detect it before it happens. This not only reduces the risk of privilege escalation but also makes handling such malicious processes more manageable. Handling a process that has already escalated privileges may trigger a kernel panic, while poison-cred ensures that the victim object will not be reused for privilege escalation. Other objects in the entire slab can continue to function normally, preventing panic caused by forcibly killing processes, thus enhancing security and stability.

## Page-level UAF and VED pipe-buffer protect

### Mitigation

Checking for data contamination based on code content has been addressed in our previous protections for msg_msg [https://hardenedvault.net/blog/2022-11-13-msg_msg-recon-mitigation-ved/](https://hardenedvault.net/blog/2022-11-13-msg_msg-recon-mitigation-ved/), where we verify whether the length of the message matches the length of the target memory, allowing for convenient and effective detection of out-of-bounds reads and writes using messages. Here, we will introduce a newer exploit technique known as Page Use-After-Free (UAF) and the measures we have implemented to address this situation.

### Vulnerability

The steps for Page Use-After-Free (UAF) are as follows:

-   There is a vulnerable object that contaminates the page pointer of the pipe_buffer through out-of-bounds (OOB) or UAF.
    
-   Achieve UAF on the page of the pipe_buffer.
    
-   Allocate the target object onto the page that can be UAFed, implementing the contamination.
    

Page UAF has several advantages:

-   It breaks the limitations of type-based heap restrictions.
    
-   It allows for carefully laid-out object pages, overcoming the limitations of the writable range between different types of objects.
    
-   It is difficult to detect even with compiler-based tools like KASAN.
    

However, there are not many exploitation methods for Page UAF, particularly through the pipe_buffer’s page to overwrite credentials. Therefore, in response to this issue with pipes, VED has added checking code (at the hook level) to ensure that the memory properties of the buffer during pipe read and write operations prevent the pipe buffer from contaminating other slabs.

From the perspective of the attack chain, there can be many variants of Page UAF, and they can be more stealthy. Our hardening measures for pipes do not address all Page UAF instances but are specifically designed to defend against this particular case. It is precisely this type of code logic-based checking that, while having low performance overhead and accurate checks, often targets very specific examples and lacks strong generality. Therefore, it can only provide case-by-case analysis and hardening. Let us await the disclosure of more exploit vectors of this type.

Page-level UAF [https://ctf-wiki.org/pwn/linux/kernel-mode/exploitation/heap/buddy/page-uaf/](https://ctf-wiki.org/pwn/linux/kernel-mode/exploitation/heap/buddy/page-uaf/)

A novel page-UAF exploit strategy for privilege escalation in Linux systems [https://phrack.org/issues/71/13](https://phrack.org/issues/71/13)

## CPU Pinning

By binding critical protection processes to specific CPU cores, the likelihood of successfully implementing heap shaping attacks can be reduced. This approach avoids exploitation opportunities arising from inter-core communication during memory allocation and scheduling processes. To some extent, this measure decreases the kernel’s exposure to memory heterogeneity attacks. VED’s CPU pinning strategy only allows system interfaces to be called by GIDs with exemption permissions.

This design is based on the following considerations:

-   In scenarios such as servers, industrial gateways, and crypto custody, the actual need for CPU pinning is relatively rare. Even when configuring exempt GIDs, it does not significantly increase operational costs.
    
-   Most exploitation techniques leverage the characteristics of CPU pinning to enhance heap spray success rates. Disabling this feature can reduce the success rate of exploits to some extent.
    
-   Certain exploitation methods (such as the CVE-2022-2588 vulnerability) have a high dependency on CPU pinning. If the relevant CPU pinning control statements are commented out or removed in the exploit code, it may directly trigger a kernel oops or even a panic.
    

Overall, while VED already includes heap spray detection features like msg_recon and is developing other security functions, disabling CPU pinning remains crucial. Given the continuous emergence of heap spray exploitation techniques, this action can reduce the success rate of exploits by approximately 20%-30% in the long term, striking a balance between performance, operations, and security.
