---
title: fetipop – kqx
source: https://kqx.io/post/fetipop/
source_host: kqx.io
clip_date: 2026-09-30T10:24:58+08:00
trace_id: fdeaf63c-a30f-4ba9-935a-66c50a4aa54e
content_hash: 6a45720a8012cf4d69ed38a1bac7db3f8c1bd7da5ba3737e8d0e7d44ce9af3b2
status: synced
tags:
  - 内核
  - 漏洞分析
series: null
feed_source: kqx·漏洞利用
ai_summary: 通过 zero_pfn 与脏页表下的 PTE 局部破坏，可在无任何物理泄漏的情况下可靠劫持 Linux 内核 IDT，并用新提出的"中断导向编程（IOP）"实现提权。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3eb75244-d011-812d-9cae-c5034fd086b6
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 通过 zero_pfn 与脏页表下的 PTE 局部破坏，可在无任何物理泄漏的情况下可靠劫持 Linux 内核 IDT，并用新提出的"中断导向编程（IOP）"实现提权。
> 
> - **zero_pfn 机制：** mmap 只创建 VMA 不分配物理页，只读访问先映射到零页，写入时才真正分配内存，因此映射零页即可泄漏内核镜像段的物理地址。
> - **泄漏与 IDT：** 映射 zero_pfn 免去物理 kASLR 暴力枚举；IDT 在所有内核版本中都紧随 zero_pfn，PTE 局部破坏即可获得对 IDT 的读写，进而 RIP 劫持。
> - **利用条件：** struct file UAF 或堆溢出下仅需改 2 字节（3 个 flag nibble + 1 个物理地址 nibble）就能把 zero_pfn 变成 IDT；物理 kASLR 按 THP 对齐、末位可预测，无需 feng shui，可靠性不降。
> - **IOP：** 用"以 fault/中断结尾"的 gadget 取代 ret 结尾的 ROP gadget，可串成通用链（div0→entry_SYSCALL_64→pagefault→double fault→entry_SYSRETQ_unsafe_stack→GP→set_memory_x→BUG→IDT 执行 shellcode）；中断只改 RIP/RSP/CS/SS，其余寄存器可控。
> - **SMAP 绕过与 ARM：** 用户态可置位 EFLAGS 的 AC 位，不执行真实处理程序即不触发 clac，SMAP 保持关闭，配合 mov rsp 类 gadget 得到简易 ROP；ARM 无 IDT，但 zero_pfn 后一页是一级页表，可重叠四级页表伪造并写入 ring0 shellcode。

## zero_pfn

When mmap gets called the physical address doesn’t get immediately mapped, instead a `VMA` is created: VMAs are structures that describe userspace virtual mappings.  
When a fetch on a non-mapped address happens a pagefault occurs and gets handled gracefully by the kernel which starts walking the VMAs. If the faulted address has a VMA then the physical page gets allocated and mapped and the process continues its execution.

What’s the point of this? Memory efficiency. There’s no need to consume memory until we have data to store.  
If the first access is a write then the page gets allocated, but if it’s a read then we don’t yet need to store data, thus no need to consume memory. However an address must still be mapped in order not to make the MMU fail the pagewalk. Zero_pfn will be used as a temp page for read-only accesses until a write is performed, which will result in the actual memory allocation.

## Phys kASLR leak

In dirty pagetable scenarios, attackers usually tend to bruteforce the physical base of the kernel which can be easily done with page-level UAFs, but results harder with partial corruptions of the PMDs.  
By mapping the zero_pfn we can immediately leak an address that belongs to the kernel memory section.

## zero_pfn to IDT

In every version of the linux kernel the IDT is mapped right after the zero_pfn, which means that with a partial corruption of a PTE we can get rw access on the IDT, which will lead to LPE.

> Usecases

There are various scenarios where we can get a partial corruption of a PTE, such as:

-   `struct file` UAF: as explained in the original dirty pagetable paper we can make a `struct file` overlap with a PMD and modify PTEs by `dup` ing the associated fd which will increase the refcount. By allocating shared memory, thus an unmoveable page, with enough feng shui we can get a page-level UAF. Feng shui could lead to unreliability and need of userns to spray the correct objects. Through zero_pfn we can skip the whole feng shui and still get LPE. Take as example this [blog](https://ptr-yudai.hatenablog.com/entry/2023/12/08/093606): the use of the dma_heap driver, phys kASLR leak through `0x9c000` physical address and page-level UAF could have been avoided.
-   heap BOFs: through a partial overwrite of a PTE, zero_pfn can be corrupted into IDT with just 2 bytes: 3 nibble for flags and 1 of physical address. Given that phys kASLR is THP-aligned there’s no need to bruteforce that last nibble as it will be predictable.

**This technique is useful for partial and/or restricted dirty pagetable scenarios without requiring any feng shui thus without losing any reliability and without ever needing any physical leaks.**

## IOP (Interrupt Oriented Programming)

IDT (Interrupt Descriptor Table) is a page that contains information about how the kernel should handle a fault or an interrupt.  
The information contained in an interrupt descriptor are [these](https://wiki.osdev.org/Interrupt_Descriptor_Table).  
One of the fields contains the address of the handler, where we can leak kASLR from and, by modifying it, get RIP hijacking.

Even though we hijacked the control flow, getting code execution could be difficult for these reasons:

-   RSP get modified when an interrupt occurs in ring 3, thus we don’t have an immediate ROPchain
-   if kPTI is enabled, we can only jump to gadgets in the kPTI trampoline, making it hard to pivot the stack to a controlled region

An advantage is that we have full control of the other registers, given that only RIP, RSP, CS and SS gets modified by interrupts.

Even though there aren’t useful ROP gagets in the kPTI trampoline, we do have IOP gadgets:  
We define an IOP gadget as any piece of code that, instead of ending with a ret instruction like in a ROP, it ends with a fault or interrupt, and given that we have full control of the handlers, we can chain such gadgets and get a full chain.  
This way we don’t need to control any data region to store a ROPchain, thus not needing further leaks such as the heap.

Most of the handlers are meant for handling faults, which doesn’t normally happen so corrupting them won’t crash anything. The only handlers that get trivially triggered are pagefaults and scheduling-related interrupts.

Through IOP we can build common chains that can lead to arbitrary code execution, an example could be:

-   div by 0 from userland to enter the chain -> offsetted `entry_SYSCALL_64` (kPTI pagetable swap) -> pagefault (on RSP gs-based fetch, given that user gs will be invalid) that throws ->
-   double fault (RSP gets overwritten with CR3 so the pagefault handler call fails) -> `entry_SYSRETQ_unsafe_stack` (swapgs; sysret) ->
-   general protection fault (sysret requires a canonical return address in RCX, and given that we have full control on registers we can make it fault) -> `set_memory_x` (pass IDT as address to make it executable) ->
-   invalid opcode (because of a check in `cpa_flush` a `BUG_ON` will be called) -> IDT to execute shellcode

This is more or less a universal IOPchain, given that the functions taken in account are consistent across all the recent kernel versions.

Special thanks to @prosti for finding the `set_memory_x` path <3

## bypassing SMAP

In the `EFLAGS` register there’s a bit called `AC` (Alignment Check) which, if set on, doesn’t allow unaligned memory movs; in kernelspace it although has a different meaning: it is used to temporarily disabling SMAP in order to copy data from/to userland.  
Fun fact: because of its duality, it can be set from userland. Ok but, how can we exploit this?  
Clearly linux is not this much broken to let you fuck up SMAP like this, (see IA32_FMASK MSR: `https://www.felixcloutier.com/x86/syscall`). In every ring 3 -> ring 0 context switch routine, `AC`, in a way or another, gets set off. For interrupts, every handler begins with the `clac` instruction.  
This leads to a SMAP bypass in IOP scenarios: by not executing the real handler, the `clac` instruction will never be run thus `AC` will remain set and SMAP disabled.

The idea is: enable `AC`, set up a fake stack in userland and redirect an interrupt to a `mov rsp, X; ret` gadget: ez ROP.  
If kPTI is off then it’s an easy win, but if it is enabled then we’ll probably still need IOP to swap pagetables. If you manage to find a ROP gadget in the kPTI trampoline to swap pagetables let us know:).

```
pushf
or qword ptr [rsp], 0x40000
popf
```

Thanks to **@Erge** for finding such path <3

## ARM

Despite the IDT being an x86 specification, thus not present in other architectures such as ARM, the zero_pfn is still a page belonging to the kernel image, which means that we can still hijack some sensible data.  
With a quick check through a debugger we can observe that the page right after the zero_pfn in ARM is the first level of the pagetables that map the kPTI trampoline.  
From here we can make the 4 levels of pagetables overlap on that same page by changing the various entries. This way we need no physical leaks to fake the pagetables. To map the actual code we can overlap the pages once more and write the ring 0 shellcode in the same page as the fake pagetables.

## Lore moment

fetipop should have been my challenge for [TRX CTF 2025](https://github.com/TheRomanXpl0it/TRX-CTF-2025) which I decided not to release in order not to leak the technique and give a shot to kctf.  
[Try it out;)](https://kqx.io/attachments/fetipop.zip) and don’t hesitate to hit us up to discuss the solve!

**what does the first “p” stand for in fetipop?**  
fetipop is a meme name we came up for the chall after writing it.  
Basically trying to name the technique (IOP) we were (as a joke) considering various options like “Fault OP”, “Exception OP”, “Trap OP” and, of course, “Interrupt OP”. We then merged them all together in `fetiop`, the last “p” was casually mentioned by **@Erge** because of an inside joke of ours, we only know what its real meaning is and we won’t elaborate any further.

Novel technique I found in the linux kernel useful to exploit restricted dirty pagetable scenarios in a completely reliable and leakless way, through a new kind of "Oriented Programming".

By leave, 2025-07-30

* * *

On this page:
