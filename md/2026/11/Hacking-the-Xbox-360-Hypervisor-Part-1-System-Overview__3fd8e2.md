---
title: "Hacking the Xbox 360 Hypervisor Part 1: System Overview"
source: https://icode4.coffee/?p=1047
source_host: icode4.coffee
clip_date: 2026-11-12T10:23:58+08:00
trace_id: 3236f0ca-b3c1-44f5-a2d7-6a02e1d88dab
content_hash: 1d45ff6413f8cea863aa1725b34b33e5fdc6802eba5fd329b639876711db10ba
status: synced
tags:
  - 硬件逆向
  - 漏洞分析
series: null
feed_source: icode4.coffee·逆向
ai_summary: Xbox 360 hypervisor 近 20 年几乎无软件漏洞，本篇详解其 CPU 硬件安全设计（内存加密、CRC 完整性校验、执行模式隔离），并以唯一已知漏洞"4548 系统调用 bug"说明其防护逻辑。
ai_summary_style: key-points
images_status:
  total: 13
  succeeded: 13
  failed_urls: []
notion_page_id: 41675244-d011-8109-bd44-cffff50000cd
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Xbox 360 hypervisor 近 20 年几乎无软件漏洞，本篇详解其 CPU 硬件安全设计（内存加密、CRC 完整性校验、执行模式隔离），并以唯一已知漏洞"4548 系统调用 bug"说明其防护逻辑。
> 
> - **CPU 安全设计：** Xenon 是 IBM 定制 PowerPC（3 核 6 线程、3.2GHz），片上集成 32KB 启动 ROM、64KB SRAM、768 个 eFuse（存密钥与撤销位）及"安全引擎"（加密/RNG）；安全引擎位置不明，需电子显微镜逆向，故中途代攻击者几乎无法分析。
> - **内存保护机制：** 实模式地址高位决定 4 条 MMU 通路：无保护、CPU SoC（仅 hypervisor 可用）、保护通路（加密 + 16 位 CRC）、加密通路（仅加密）；加密按 128 字节缓存行进行（疑似 AES ECB），混入每次开机随机的通路密钥、10 位 whitening 值与地址，密文不能跨重启/跨地址/跨 whitening 值复用。
> - **CRC 插槽设计：** 校验和存于 64KB SRAM，whitening 值高 6 位选槽，每槽覆盖 64KB 内存，因此最多只能同时保护 4MB 内存，专供 hypervisor 及其数据使用；不同槽使用不同 whitening 值，跨槽溢出会破坏 CRC。
> - **hypervisor 职责：** 256KB、4 段各 64KB（段间越界会挂死 CPU），主管代码认证（RSA 签名、路径/版本/撤销检查）、可执行内存分配（页不可同时可写可执行）与全部系统调用；kernel 代码存于加密内存，外部设备通信全部由 kernel 代理，hypervisor 从不直接接触外设数据。
> - **4548 bug（King Kong 漏洞）：** 系统调用序号校验用 32 位 cmplwi，但索引改用 64 位 sldi，传入 `0x200000000000003F` 左移后置上 HRMOR bypass 位，走无保护通路读取系统调用表，可覆写表项并借 "mtctr r4/bctr" 跳转执行 shellcode；作者推断这是 MSVC PowerPC 编译器优化引入的 bug 而非人工代码变更。

Welcome to part 1 of my series on hacking the Xbox 360 hypervisor. This part will give you an overview of the Xbox 360 system architecture, hypervisor, and security features it uses to prevent the console from being hacked. Consider this prerequisite material for understanding part 2, where I’ll dive into how I found and exploited a new vulnerability in the hypervisor.

## Setting the Stage

At the heart of the Xbox 360 security system lies the hypervisor, a small piece of code that has one job: preventing the console from being hacked. If you want to run your own code on the console or get full control of the CPU you’ll need to go through the hypervisor, and it won’t be easy. The Xbox 360 hypervisor is one of the most secure pieces of code Microsoft has ever written, and is near impenetrable to software based attacks. This may be hard to believe considering the Xbox 360 has been widely hacked for a long time now, but every hack released thus far requires you opened your console and use additional hardware to hack it.

The hypervisor has only had one known exploit to date, the “4548 system call handler bug” (also known as the King Kong exploit). But I have reason to believe this bug was introduced by a compiler optimization gone bad and not by a code change made to the hypervisor. Nearly 20 years since its release and there’s still no software only hack for the console, not even something “academic” or proof-of-concept level. In this post I’ll cover some of the security features of the console and hopefully give you a better understanding of why the hypervisor is so secure.

## Inside the Xbox 360

At a high level the design of the Xbox 360 was similar to the Original Xbox. However, Microsoft had learned from their past mistakes and triple downed on security. The CPU would be custom designed with on-die security features, system software had to be updatable and revocable, and ALL code must be encrypted at both runtime and at rest. If you’re interested in learning more about the mistakes made on the Original Xbox that led to these design changes I highly recommend you check out the [slides](https://events.ccc.de/congress/2005/fahrplan/attachments/674-slides_xbox.pdf) or [video](https://www.youtube.com/watch?v=9NqLljaHc80) for the “17 Mistakes Microsoft made in the Xbox Security System” talk which covers them in detail.

## The Xenon CPU

The Xbox 360 CPU was a custom made PowerPC chip from IBM known as the “Xenon” CPU. The cores in the Xenon CPU are likely based on the PowerPC 970 cores (what were used in the Power Mac G5s) with custom modifications made by IBM and Microsoft. At a high level it has the following specs:

-   Base clock speed of 3.2Ghz.
-   Three physical cores each with two hardware threads, for a total of six hardware threads.
-   Each of the three cores has 32 KB of L1 instruction cache (2-way) and 32 KB of L1 data cache (4-way).
-   All threads share 1 MB of L2 cache (8-way).

Additionally, it also has the following security features baked into the CPU silicon (on-die):

-   32 KB of ROM storage for the first stage bootloader.
-   64 KB of SRAM (known as secure RAM) for boot operations and memory integrity functionality.
-   768 eFuses (one time usable) for unique per-console crypto keys and bootloader/kernel revocation.
-   On-die cryptography and random number generation (RNG) support (known as the “security engine”) for memory encryption and integrity checks.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/af6b914f80930f44.png)

Figure 1: Die shot of the Xbox 360 Xenon CPU

The image above is a die shot of the Xbox 360 Xenon CPU and shows what the CPU looks like beneath the surface. Here we can see a rough layout of the different CPU cores, L2 cache, and other components that make up the CPU. You might notice there’s no block highlighting the “security engine” and that’s because its location is still unknown. The only way to find and understand exactly what the security engine is doing is to image the CPU with an electron microscope and reverse engineer the inner workings at the silicon level. This process is both extremely expensive and labor intensive, and would have been near impossible for hackers to do in the mid 2000s when the console was released. Hiding the security engine in the CPU die where it’s unable to be reverse engineered by attackers is part of what makes the memory encryption and integrity checks on the console so secure.

### Caching Behavior

The CPU had custom modifications around caching behavior to support some of the memory encryption functionality that had been added. These modifications also include: allowing the GPU and southbridge to access L2 cache, and custom CPU instructions to give developers more performance in their code. One of these custom instructions, the “xdcbt” instruction, is well known for having bugs that ultimately led to it being removed from the developer SDK. You can read more about in Bruce Dawson’s “ [Finding a CPU Design Bug in the Xbox 360](https://randomascii.wordpress.com/2018/01/07/finding-a-cpu-design-bug-in-the-xbox-360/) ” blog post. There’s other CPU bugs related to special load and store instructions (lwarx and stwcx) which were removed from the compiler.

While hacking on the console I’ve encountered some strange caching related behavior myself. I don’t have enough evidence (or knowledge) to say the behavior I experienced is a bug or not, but I think it’s reasonable to say that between the custom modifications made to the PowerPC CPU cores and how fast the CPU design was churned out there’s most likely additional bugs lurking beneath the surface.

### Execution Modes

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/18fbc45ebb8b66a6.png)

Figure 2: CPU privilege levels

The CPU supports 3 privilege levels known as hypervisor mode, kernel mode, and user mode. Hypervisor mode (also known as real mode) is where the bootloaders and hypervisor run and have full control over the CPU and hardware. Due to the bits set on various special purpose registers (SPRs) and the machine state register (MSR) the hypervisor is not subject to page protection checks on memory accesses and can read, write, and execute any valid memory address (with the exception of things like trying to write to memory mapped ROM).

Kernel mode is where the kernel and games run, having full access to peripheral devices but limited access to privileged CPU functionality. Code here is unable to allocate executable memory or access things like CPU ROM, SRAM, or eFuses. Lastly, user mode was the least privileged execution mode but from what I’ve seen wasn’t really used by anything important (so it’s safe to ignore).

### Addressing Modes

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/fe8b8dcc21c1315e.png)

Figure 3: Hypervisor mode vs. kernel mode address translation

When running in hypervisor mode the CPU would typically use 64-bit “real” addresses which don’t go through the normal address translation mechanisms such as the translation lookaside buffer (TLB) or page table searches. These addresses point directly to some physical location in RAM. When in kernel mode and user mode the CPU will use 32-bit virtual addresses which are backed by the TLB and software defined page tables managed by the hypervisor. These virtual addresses must go through one or more address translation steps to get converted into a real address that addresses some physical location of memory.

The Xbox 360 hypervisor doesn’t use hardware page tables that the MMU can access. Rather, it manages its own software page tables and preloads the TLB on the fly using the software page table entries. Understanding the intricacies of this isn’t very important (and it’s actually a lot more complicated than this), the important detail here is the page tables the hypervisor manages are software defined and not used by the MMU directly.

## Protected and Encrypted Memory

Now that I’ve sufficiently bored you with CPU architecture preamble lets actually look at some custom modifications made for the security features I listed above. The Xenon CPU supports 64-bit address modes and can use at least 52 bits for specifying the memory location which allows for addressing ~4096 TB of memory. However, the Xbox 360 only comes with 512 MB of RAM so many of these bits will never be used with real mode addressing. Instead, custom modifications were made to the MMU to use these bits to create different pathways for memory accesses which will apply encryption and/or CRC checksums to the memory being accessed. Given the real mode address `0x80000168.01F50000` the following diagram shows how the address is composed:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/941819da1e5e9ab2.png)

Figure 4: Real mode address composition

There are 4 pathways a real mode address can take to access memory depending on the value of P. Some of these pathways will add encryption and CRC checksums to protect memory from being sniffed or modified. The encryption and CRC checksums use cryptographic keys that are sourced from the security engine’s hardware RNG unit and are randomized each time the console is booted. This ensures that encrypted memory ciphertext and CRC checksums will change each boot and cannot be used in replay attacks. The following diagram shows each pathway and how the memory access is performed:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d7f59081514f3ce3.png)

Figure 5: MMU pathways to memory

Pathway 0 is the “unprotected” pathway, no additional encryption or integrity checks are performed on the memory access, whatever is in RAM is what you get in return. Pathway 2 is the “CPU SoC” pathway which allows access to components on the CPU die such as memory mapped GPIO registers, the security engine, eFuses, boot ROM, and SRAM. This pathway is only accessible from hypervisor mode and is never mapped into kernel space for access. Pathway 1 is the “protected” pathway which applies encryption and CRC checksums to memory accesses, and pathway 3 is the “encrypted” pathway which only applies encryption to memory accesses (no CRC checksums). Both of these pathways are explained in detail below.

### Encrypted Memory

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a7b8b4c5c1c2dbc9.png)

Figure 6: MMU encrypted pathway

Memory encryption works on a per-cache line basis where the size of a cache line is 128 bytes, and uses what I believe to be AES ECB. The encryption incorporates a per-boot per-pathway encryption key, 10-bit whitening value, and some part of the memory address for the cache line into the encryption scheme. This means the ciphertext for some address A using whitening value W:

-   Cannot be used across reboots.
-   Cannot be used at a different address B where A!= B.
-   Cannot be used at address A with a different whitening value.

Additionally, the pathway encryption key used for the encrypted pathway is different than the encryption key for the protected pathway, so ciphertext from one pathway cannot be used with another pathway (and vice versa).

#### Caching Behavior

Any time data is read from memory the entire cache line containing the data will be fetched, decrypted, and stored into L2 cache. Similarly, when the data is aged out of L2 cache or explicitly flushed from cache it will be encrypted and written back to memory. Accessing memory using the encrypted pathway requires that Real Mode Caching Inhibit (RMCI) is disabled. This is a custom addition to the Logical Partition Control Register (LPCR) in bit position 62 which is normally reserved. When RMCI is enabled caching is effectively disabled on that hardware thread, and vice versa for when RMCI is disabled.

Since this is a custom modification I don’t know to what extent caching is disabled, at the very least L2 cache is completely bypassed but I don’t know for sure if L1 cache is also bypassed or not. The encrypted pathway can only be accessed when RMCI is disabled, any attempt to access this pathway with RMCI enabled will cause the CPU thread to hang. I’m not sure if this is intended behavior or some side effect of the custom modifications made to the MMU. Interestingly enough RMCI does not need to be disabled for the protected pathway which uses the same encryption mechanism as the encrypted pathway.

### Protected Memory

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0761c7e944dc6f42.png)

Figure 7: MMU protected pathway

The protected pathway uses the same memory encryption scheme described above (except using the pathway #1 encryption key instead of pathway #3 key) but also adds a 16-bit CRC checksum to the cache line for integrity checks. Each CRC checksum protects a single cache line (128 bytes) of memory, and incorporates the ciphertext, plaintext, and pathway hashing key into the checksum. Incorporating both the ciphertext and plaintext into the checksum helps protect it from collision attacks where different blocks of ciphertext may have the same CRC checksum.

Every access performed on protected memory will fetch the entire cache line from RAM, decrypt the data, calculate the CRC checksum and verify it matches the CRC checksum stored in CPU SRAM. If the checksum does not match the hardware thread will be halted indefinitely. Similarly, when a write operation is performed the entire cache line will be encrypted and a new CRC checksum calculated for the data. Unlike encrypted memory RMCI does not need to be disabled to access protected memory, and is typically left enabled when used. It’s plausible that even with RMCI enabled the decrypted cache line data is store in L1 cache but I have no evidence prove this one way or the other.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/984cce91439b5e06.png)

Figure 8: CRC checksum storage

The checksums for protected memory are stored in CPU SRAM and are broken up into groups which I refer to as “slots”. The upper 6 bits of the whitening value for the address line designate the slot number for a maximum of 64 slots. Because the slot number and memory offset are distinct parts of the address value it allows any slot to be used for any location in memory. Each slot will consume 0x400 bytes of CPU SRAM to give 512 checksums per slot, each checksum covering a single cache line of memory, for a total of 64 KB of memory per slot. Because CPU SRAM is only 64 KB in size the console is only able to protect a maximum of 4 MB of memory at any time. Protected memory space is used exclusively by the hypervisor and data the hypervisor uses (page tables, cryptographic key storage, hypervisor extensions, etc.).

### The Secrets in the Patents

If you read my [Tony Hawk’s Pro Strcpy](https://icode4.coffee/?p=954) post you may recall me saying I’ve found interesting bits of information in patent filings. Well this is another example of what you can find if you dig around enough. Around 2004-2005 Microsoft filed multiple patents for this memory protection design which include detailed descriptions of the internal mechanisms and diagrams will illustrations. These patents don’t match the design used on the Xbox 360 one for one, but it does provide a lot of contextual information for how it works.

-   [US7822993B2 – System and method for using address bits to affect encryption](https://patents.google.com/patent/US7822993B2)
-   [US9141558B2 – Secure memory control parameters in table look aside buffer data fields and support memory array](https://patents.google.com/patent/US9141558B2)
-   [US7734926B2 – System and method for applying security to memory reads and writes](https://patents.google.com/patent/US7734926B2)
-   [US7356668B2 – System and method for using address bits to form an index into secure memory](https://patents.google.com/patent/US7356668B2)

## The Hypervisor

Now that we have a basic idea of the console’s security features let’s take a look at what the hypervisor actually does. The hypervisor image is 256 KB of code and data that’s broken up into 4 segments and resides in protected memory (encrypted + CRC integrity checks). The purpose of some of the segments have changed throughout the console’s lifecycle but in the later half there were three code segments and one data segment. Each segment spans 64 KB of memory and uses different whitening bits so trying to roll off the end of one segment (ex: with some sort of overflow attack) would result in the CPU hanging.

There’s also a number of 64 KB pages used to store miscellaneous data such as the page tables, cryptographic key stores, security data, and hypervisor extensions. All of this misc data is stored in protected memory and broken up into individual slots to prevent overflow attacks and attacks on the ciphertext itself. The following diagram gives an idea of how system memory is organized and what regions use what type of memory:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1b1c9617f8626849.png)

Figure 9: System memory map

The hypervisor’s main job is to oversee all security related operations (code authentication, revocation, anti-piracy, etc.), and to allocate executable memory. Only the hypervisor can load a new executable and it enforces strict security checks on all executable images. Some of these checks include: RSA code signing of the executable image, OS version checks, file path checks on the image file (ex: executable must be signed for the path and device it’s being loaded from, dvd, hdd, etc.), and special revocation/flag checks for more esoteric executables. Only Microsoft can sign an executable file and the tools used to sign them most likely perform sanity checks on the executable certificate to prevent dangerous configurations from being signed.

### Hypervisor Real Mode Offset Register

When running in real mode every memory access performed can add what’s called the Hypervisor Real Mode Offset Register (HRMOR) value to the effective address that’s calculated for the memory access. The HRMOR is a special purpose register that’s used as a “base address” value for all reads and writes for both data and instruction accesses. The inclusion of the HRMOR value can be bypassed by setting the HRMOR bypass bit (the upper most bit) in a 64-bit real address (see [Figure 1](#real-mode-address-composition)). During initialization the hypervisor sets the HRMOR value to `0x00000100.00000000` which then forces all memory accesses performed by the hypervisor to use the protected memory pathway and perform encryption + CRC checksum validation. This acts as a defense in depth measure to ensure that the only memory accesses that don’t perform integrity checks are ones done explicitly by setting the HRMOR bypass bit in the address being used. In short, the hypervisor will never perform a memory access that doesn’t do CRC integrity checks by accident.

### Executable Memory

The hypervisor also manages all executable memory for kernel mode. It will only allocate executable pages when loading an executable image and will never let a page be writable and executable at the same time. If kernel mode wants to execute some code, it must go through the hypervisor, the code must be RSA signed and validated successfully, and all memory used to load the executable image will be inaccessible to kernel mode until the image is completely loaded. All kernel mode code is stored in encrypted memory so it’s encrypted but not protected by CRC integrity checks.

```css
struct PAGE_TABLE_ENTRY
{
	DWORD ReadOnly : 1;			// Page is read-only
	DWORD Data : 1;
	DWORD NoExecute : 1;		// Page is executable
	DWORD Valid : 1;
	DWORD ImageStart : 1;		// First page of an executable image
	DWORD ImageEnd : 1;			// Last page of an executable image
	DWORD RealPageNumber : 14;	// Real page address
	DWORD WhiteningBits : 10;	// Whitening value for encryption
	DWORD Pathway : 2;			// MMU pathway to use
};
```

```css
struct PAGE_WHITENING_TABLE_ENTRY
{
	WORD WhiteningValue : 10;	// Next whitening value to use
	WORD WhiteningOverflow : 1;	// Overflow indicator
	WORD Valid : 1;
};
```

There are two blocks of memory used to manage page allocations: the page table which contains the page permissions, base address, and whitening value used for encryption, and the page whitening table which tracks what whitening values have already been used for that page. When a page of executable memory is allocated it will use the whitening value indicated by the page whitening table which will then be incremented by 1 until it reaches 1024 (the max value that can be stored using 10 bits). Once all 1024 whitening values have been used exactly once every subsequent allocation of the page will randomize the whitening value. This is done to introduce entropy for the ciphertext across page allocations even if the plaintext data is constant.

### System Calls

The hypervisor exposes a number of system calls to kernel mode to perform various operations such as loading new executable code, performing various crypto operations (encrypt/decrypt data, validate RSA signatures, etc.), revocation and licensing checks, DVD anti-piracy checks, and IP-TV DRM (though this last one was never used). All of these functions are written with extensive validation on all parameters from kernel mode: bounds checks, overflow/underflow checks, alignment checks, etc. In many cases failing validation is considered “fatal”, and the CPU hardware thread will be halted indefinitely.

The hypervisor will rarely ever operate on memory provided from kernel mode and when it does it’s usually relocated in-place to the protected memory alias (encrypted + CRC checks) to ensure kernel mode code can’t tamper with it asynchronously. These relocations use [SRAM CRC slots](#crc-checksum-storage) on a per-use-case basis, i.e.: one slot for loading executable files, one for loading hypervisor extensions, one for update data, one for key vault data, etc., and each slot is guarded with a spinlock. This ensures that only one thread can use the SRAM slot at a time (protecting from race attacks). Additionally, because each slot is using a different whitening value it’s not possible to overflow memory in slot A and overwrite memory in slot B without invalidating the CRC checksums for slot B.

### External Devices

The hypervisor doesn’t trust any other device on the console (ex: USB, DVD, HDD, etc.) and will never talk directly to them. Instead, all device communications are handled by the kernel which then asks the hypervisor to perform opaque operations such as creating/validating DVD drive anti-piracy challenges, performing encryption/decryption of USB device traffic, or validating the certificate for the HDD. When an external interrupt is triggered the hypervisor will dispatch it to the kernel for handling without ever touching any additional data related to it. The only exception is when a interrupt is triggered from the front side bus, in which case the hypervisor will analyze the error code to determine if the FSB is in a bad state.

### The 4548 System Call Handler Bug

Up until now there’s only been one bug found in the Xbox 360 hypervisor: [the 4548 system call handler bug](https://seclists.org/fulldisclosure/2007/Feb/613), also known as the [King Kong exploit](https://beta.ivc.no/wiki/index.php/Xbox_360_King_Kong_Shader_Exploit). This bug was found in the 4532 and 4548 versions of the hypervisor (circa October 2006) and existed in the system call interrupt handler. When any kernel mode code executes a system call instruction an interrupt will fire and the hypervisor will try to handle it. The system call interrupt handler will check that the system call ordinal specified by kernel mode is valid and within the range of the system call function table.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c572ae160e91796a.png)

Figure 10: Validation of the system call ordinal

As we can see from the disassembly if the ordinal value is less than 0 or greater than the number of system call functions (0x61) the validation will fail and the CPU thread will be halted. Note that while the lower bounds check uses a “cmpdi” compare double immediate instruction which works on 64-bit values, the upper bounds check uses a “cmplwi” compare logical word immediate instruction which works on 32-bits. This will be an important detail in a moment. If the ordinal validation is successful the hypervisor will use the ordinal to index into the system call function table. Up until the 4532 hypervisor version the code for indexing the system call function table looked like so:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e49f12d105664a82.png)

Figure 11: Indexing the system call function table pre-4532

The “slwi” shift left word immediate instruction will shift left the ordinal value in r0 by 2, effectively multiplying it by 4 (the size of an entry in the function table), and then discards the upper 32 bits of the result (truncating the 64-bit register value to 32-bits). The result is a 32-bit offset into the system call function table where the address of the specified system call function can be found. In the 4532 version hypervisor these instructions changed to the following:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a36ac9ae4e1a4e82.png)

Figure 12: Indexing the system call function table in 4532/4548

The “slwi” instruction was replaced with a “sldi” shift left double immediate instruction. This instruction works similarly to “slwi” except it keeps the entire 64-bit result. The bug here is that an attacker can provide a 64-bit value that passes the validation and when shifted left will set some of the upper 32-bits of the real address. For example, imagine you pass in an ordinal with the value `0x200000000000003F`. This value will pass the ordinal validation because only the lower 32-bits will be compared against the maximum number of system call functions (0x3F < 0x61). But when the value is shifted left by 2 it will produce a result of `0x80000000000000FC`. Notice how the upper most bit which is the HRMOR bypass bit is set (see [Hypervisor Real Mode Offset Register](#hypervisor-real-mode-offset-register)). When the hypervisor uses this “offset” to index into the system call function table it will skip adding the HRMOR value to the effective address that’s calculated and end up performing a read using the unprotected memory pathway.

This bug can be exploited from kernel mode by doing the following:

1.  Get the offset of some code in the first segment of the hypervisor you want to execute. For this attack we’ll choose the address of the instruction sequence “mtctr r4/bctr” which will jump to the address contained in r4.
2.  Set r4 to contain the address of some shell code we read into memory.
3.  Write the offset of this instruction sequence to the memory address for the 0x3F’th entry of the hypervisor system call function table using the unprotected pathway.
4.  Execute the system call instruction with the ordinal value set to `0x200000000000003F`.
5.  When the hypervisor validates the ordinal number the 32-bit comparison against the max ordinal number will pass successfully. When the ordinal is then shifted left by 2 to calculate the offset into the system call function table it will produce the value `0x80000000000000FC`.
6.  When the hypervisor tries to fetch the system call function address using this offset the effective address calculated will have the HRMOR bypass bit set and skip adding the HRMOR value to the effective address. This will perform the memory access using the unprotected pathway which bypasses encryption and CRC integrity checks, and will fetch the value we wrote in step 3 without halting the CPU thread.
7.  The hypervisor will jump to the “mtctr r4/bctr” instruction sequence and execute our shell code at the address contained in r4.

### How Did This Happen?

So why did this shift instruction suddenly change? Was it a code change made by Microsoft? While I don’t have a definitive answer I strongly believe this change was the result of a compiler optimization gone bad. The last version of the MSVC compiler with support for targeting PowerPC architecture was used during the development of Windows NT 4.0 in the mid to late 90s. Given that the development of the Xbox 360 started in late 2003 Microsoft would have had less than 2 years to get the PowerPC MSVC compiler up to date and ready for game developers to use. It’s actually even less time when you consider that the final version of the CPU likely wasn’t ready until very late in the development cycle.

By diff’ing each hypervisor build from the 1888 version that shipped at release to the 4532 version where the bug was first introduced you can find a few locations where instructions had changed for seemingly no reason. Comparing the 2241 version hypervisor against the 1888 version you can see that in certain locations the “rlwinm” instruction had been replaced with a “clrrwi” instruction:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d177a062c0c669a6.png)

Figure 13: Instruction changes between v2241 and v1888

There’s a few other instances of one instruction being switched out for another instruction in other hypervisor builds leading up to the 4548 build. Presumably Microsoft was making additional performance improvements to the compiler code gen post launch. I find it highly unlikely that Microsoft made this code change themselves. The interrupt handlers are one of the most critical pieces of code in the hypervisor and would’ve needed to be fleshed out very early in the development process. Furthermore, it’s clear Microsoft was doing very thorough security reviews of all the code in the hypervisor and I doubt they would have overlooked this.

## Conclusion

The Xbox 360 hypervisor is a very secure piece of code that’s backed by hardware security features and has a single purpose: preventing the console from being hacked. This presents the following challenges to attackers:

-   The hypervisor has very little attack surface for finding bugs in.
-   All communications with other devices on the motherboard are performed by the kernel.
-   Hypervisor memory is protected with encryption and integrity checks.

That does it for part 1, hopefully this post has given you a good overview of the security features of the Xbox 360. Stay tuned for part 2 where I’ll cover my work finding and exploiting a new vulnerability in the hypervisor.
