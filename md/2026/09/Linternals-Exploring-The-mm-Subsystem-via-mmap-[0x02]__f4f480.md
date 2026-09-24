---
title: "Linternals: Exploring The mm Subsystem via mmap [0x02]"
source: https://sam4k.com/linternals-exploring-the-mm-subsystem-part-2/
source_host: sam4k.com
clip_date: 2026-09-24T10:29:02+08:00
trace_id: f982e492-ac14-4ae7-a5e8-80ce11589681
content_hash: 04596579ec4f4282dd270eacc88de45b57c65888ea0ce66cb654333cf9d9cac9
status: synced
tags:
  - Linux安全
  - 内核
series: null
feed_source: sam4k·Linux内核利用
ai_summary: "`mmap()` 的私有匿名映射在 x86_64 上最终由 `mmap_region()` 在 `mm->mm_mt`（maple tree）中插入一个新 `vm_area_struct`，地址与标志的处理都在 `do_mmap()` 完成。"
ai_summary_style: key-points
images_status:
  total: 8
  succeeded: 8
  failed_urls: []
notion_page_id: 3e575244-d011-8174-ad65-d017e0db1b19
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> `mmap()` 的私有匿名映射在 x86_64 上最终由 `mmap_region()` 在 `mm->mm_mt`（maple tree）中插入一个新 `vm_area_struct`，地址与标志的处理都在 `do_mmap()` 完成。
> 
> - **6.1 起的 VMA 管理：** 每个内存区域由 `struct vm_area_struct`（vm_start/vm_end、vm_mm、vm_flags、vm_page_prot）描述，进程的所有 VMA 存在 `mm->mm_mt` 中；该字段已由红黑树改为 maple tree，专门存放非重叠区间并能表示区间间的空洞。
> - **地址选择两种情形：** 带 `MAP_FIXED` 时直接用用户地址并解除重叠映射（`MAP_FIXED_NOREPLACE` 冲突则返回 `-EEXIST`）；否则用户 `addr` 只是提示，先经 `round_hint_to_min()` 对齐（`addr==0` 时会调整），再走 `__get_unmapped_area()` → THP/`mm_get_unmapped_area`；x86_64 因 `MMF_TOPDOWN` 走 `arch_get_unmapped_area_topdown_vmflags()`，以 `mm->mmap_base` 为 high_limit 自顶向下搜索。
> - **搜索实现：** `unmapped_area_topdown()` 用 `VMA_ITERATOR` 遍历，实际查找由 `vma_iter_area_highest()` 封装 maple tree 的 `mas_empty_area_rev()` 完成；`vm_unmapped_area_info` 携带 length/low_limit/high_limit/align_mask/start_gap。
> - **合并优先：** `mmap_region()` 先做 `may_expand_vm` 资源上限检查和 `do_vmi_munmap` 清理重叠（被 seal 的映射会失败），然后尝试与相邻的 next、prev VMA 合并——要求地址相邻、NUMA 策略一致、flags/file 兼容、非从父进程克隆的匿名 VMA，`VM_SPECIAL` 不可合并。
> - **新建 VMA 的关键步骤：** `vm_area_alloc` → `vma_set_range`/`vm_flags_init`/`vm_get_page_prot` → 匿名私有映射调用 `vma_set_anonymous()` 置 `vm_ops = NULL`（即 `vma_is_anonymous()` 的判据）；`map_deny_write_exec()` 在 `MMF_HAS_MDWE` 下阻止 W+X；随后 `vma_iter_prealloc`、`vma_start_write`（仅 `CONFIG_PER_VMA_LOCK`，随 mmap 写锁一起释放）、`vma_iter_store` 插入并 `map_count++`，最后 `vm_stat_account` 记账、设置 `VM_SOFTDIRTY`、`validate_mm`（调试配置）并返回 addr。

Welcome back! [Last time](https://sam4k.com/linternals-exploring-the-mm-subsystem-part-1/) I left us on a bit of a cliffhanger, rolling the credits just as we were getting into the thick of it, so I’ll keep the intro brief.

The aim of this series is to explore the inner workings of the Linux kernel’s memory management (mm) subsystem by examining how this simple program is implemented:

```c
#include <sys/mman.h>

int main()
{
    void *addr;

    addr = mmap(NULL, 0x1000, PROT_READ | PROT_WRITE, MAP_ANONYMOUS | MAP_PRIVATE, -1, 0);
    *(long*)addr = 0x4142434445464748;

    munmap(addr, 0x1000);
    return 0;
}
```

While I’m making up the scope of this series as I go (seems fine), the general idea is to cover the mapping, writing and unmapping of memory in detail as the kernel sees it.

In the [first part](https://sam4k.com/linternals-exploring-the-mm-subsystem-part-1/) of the series we covered:

-   What memory management is and a brief overview of the kernel’s mm subsystem
-   What our simple program does from the user’s perspective and how it interacts with the kernel (it’s only like 2 syscalls, how much could there be to cover…)
-   The start of our journey: how memory is mapped via the `mmap()` system call - argument marshalling, fetching the `mm_struct`, a bit of security, locking - right up until the actual implementation in `do_mmap()` anyway (sorry, that really was a cliffhanger)

So without further ado, let’s dive back into how (anonymous) memory is mapped via `mmap()`!

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/13c1525a2d5c4a14.gif)

## Contents

-   [Mapping Memory (cont.)](#mapping-memory-cont)
    -   [What Are Mappings?](#what-are-mappings)
        -   [`struct vm_area_struct`](#struct-vmareastruct)
        -   [`mm->mm_mt`](#mm-mmmt)
    -   [`do_mmap()`](#dommap)
        -   [Finding A Suitable `addr`](#finding-a-suitable-addr)
    -   [`mmap_region()`](#mmapregion)
        -   [VMA Merging](#vma-merging)
        -   [VMA Allocation](#vma-allocation)
    -   [Final Bits](#final-bits)
    -   [Summary](#summary)
-   [Next Time](#next-time)

## Mapping Memory (cont.)

Broadly speaking, there are 3 things happening in our program: mapping some anonymous memory, writing to it and then unmapping it. Currently, we’re digging into the first part:

```c
addr = mmap(NULL, 0x1000, PROT_READ | PROT_WRITE, MAP_ANONYMOUS | MAP_PRIVATE, -1, 0);
```

Let’s quickly recap how deep in the mm subsystem we are, since making our `mmap(2)` system call from our userspace program. Using gdb we can set a breakpoint on `do_mmap()`, which is where we left off, and check the backtrace:

```fallback
(gdb) bt
#0  do_mmap (file=file@entry=0x0 <fixed_percpu_data>, addr=0, len=4096, prot=3, flags=34, vm_flags=vm_flags@entry=0, pgoff=0, 
    populate=0xffffc90001a17e80, uf=0xffffc90001a17ea0) at mm/mmap.c:1215
#1  0xffffffff8162aabc in vm_mmap_pgoff (file=file@entry=0x0 <fixed_percpu_data>, addr=<optimized out>, len=<optimized out>, 
    prot=<optimized out>, flag=<optimized out>, pgoff=<optimized out>) at mm/util.c:556
#2  0xffffffff816a4d7c in ksys_mmap_pgoff (addr=0, len=4096, prot=3, flags=34, fd=<optimized out>, pgoff=0) at mm/mmap.c:1427
#3  0xffffffff810a894f in __do_sys_mmap (addr=0, off=<optimized out>, len=<optimized out>, prot=<optimized out>, flags=<optimized out>, 
    fd=<optimized out>) at arch/x86/kernel/sys_x86_64.c:93
#4  0xffffffff8100507f in x64_sys_call (regs=regs@entry=0xffffc90001a17f58, nr=nr@entry=9) at arch/x86/entry/syscall_64.c:29
#5  0xffffffff844328b1 in do_syscall_x64 (regs=0xffffc90001a17f58, nr=<optimized out>) at arch/x86/entry/common.c:51
#6  do_syscall_64 (regs=0xffffc90001a17f58, nr=<optimized out>) at arch/x86/entry/common.c:81
#7  0xffffffff84600130 in entry_SYSCALL_64 () at arch/x86/entry/entry_64.S:121
```

backtrace for our program’s mmap() call (on a 6.11.5 kernel)

So far these functions have mostly been sanitisting arguments, doing necessary security checks and taking the all important [`mmap_write_lock_killable(mm)`](https://elixir.bootlin.com/linux/v6.11.5/source/include/linux/mmap_lock.h#L117).

Before we continue where we left off, about to dive into [`do_mmap()`](https://elixir.bootlin.com/linux/v6.11.5/source/include/linux/mm.h#L3410), I’m going to touch on some key background which will provide important context for the rest of the post!

### What Are Mappings?

We probably shouldn’t go much further down the memory mapping rabbit hole without first covering what a mapping is, or at least how the kernel represents them.

When we call [`mmap()`](https://man7.org/linux/man-pages/man2/mmap.2.html) in our userspace program, we’re looking to “map” some memory into our virtual address space. This could be a file or some anonymous memory (aka physical memory allocated for us to use), which can then be accessed via a virtual address in our processes’ virtual address space.

So a mapping in this context is essentially a virtual address range which is mapped to some physical memory. We can explore a processes mappings via `procfs`. Let’s see if we can find our programs `0x1000` byte mapping:

```gdscript3
$ cat /proc/91280/maps
00400000-00401000 r--p 00000000 00:2b 12253872                           mm_example
00401000-0047c000 r-xp 00001000 00:2b 12253872                           mm_example
0047c000-004a4000 r--p 0007c000 00:2b 12253872                           mm_example
004a4000-004a9000 r--p 000a3000 00:2b 12253872                           mm_example
004a9000-004ab000 rw-p 000a8000 00:2b 12253872                           mm_example
004ab000-004b1000 rw-p 00000000 00:00 0 
15b3e000-15b60000 rw-p 00000000 00:00 0                                  [heap]
7f556e60a000-7f556e60b000 rw-p 00000000 00:00 0 
7f556e60b000-7f556e60d000 r--p 00000000 00:00 0                          [vvar]
7f556e60d000-7f556e60f000 r--p 00000000 00:00 0                          [vvar_vclock]
7f556e60f000-7f556e611000 r-xp 00000000 00:00 0                          [vdso]
7ffd933f4000-7ffd93415000 rw-p 00000000 00:00 0                          [stack]
ffffffffff600000-ffffffffff601000 --xp 00000000 00:00 0                  [vsyscall]
```

We can see even our simple program has quite a few mappings, but let’s not get distracted! There, at `7f556e60a000`, we can see our anonymous mapping! It spans `0x1000` bytes and has the `rw` permissions we expect, neat!

So now we have a general idea of what a mapping is, how exactly does the kernel represent and manage our processes mappings? Queue [`struct vm_area_struct`](https://elixir.bootlin.com/linux/v6.11.5/source/include/linux/mm_types.h#L664)!

#### struct vm_area_struct

```gdscript3
/*
 * This struct describes a virtual memory area. There is one of these
 * per VM-area/task. A VM area is any part of the process virtual memory
 * space that has a special rule for the page-fault handlers (ie a shared
 * library, the executable area etc).
 */
struct vm_area_struct {
	union {
		struct {
			/* VMA covers [vm_start; vm_end) addresses within mm */
			unsigned long vm_start;
			unsigned long vm_end;
		};
#ifdef CONFIG_PER_VMA_LOCK
		struct rcu_head vm_rcu;	/* Used for deferred freeing. */
#endif
	};

	struct mm_struct *vm_mm;	/* The address space we belong to. */
	pgprot_t vm_page_prot;          /* Access permissions of this VMA. */

	union {
		const vm_flags_t vm_flags;
		vm_flags_t __private __vm_flags;
	};

#ifdef CONFIG_PER_VMA_LOCK
	/* Flag to indicate areas detached from the mm->mm_mt tree */
	bool detached;

	int vm_lock_seq;
	struct vma_lock *vm_lock;
#endif

	/*
	 * For areas with an address space and backing store,
	 * linkage into the address_space->i_mmap interval tree.
	 *
	 */
	struct {
		struct rb_node rb;
		unsigned long rb_subtree_last;
	} shared;

	/*
	 * A file's MAP_PRIVATE vma can be in both i_mmap tree and anon_vma
	 * list, after a COW of one of the file pages.	A MAP_SHARED vma
	 * can only be in the i_mmap tree.  An anonymous MAP_PRIVATE, stack
	 * or brk vma (with NULL file) can only be in an anon_vma list.
	 */
	struct list_head anon_vma_chain; /* Serialized by mmap_lock &
					  * page_table_lock */
	struct anon_vma *anon_vma;	/* Serialized by page_table_lock */

	/* Function pointers to deal with this struct. */
	const struct vm_operations_struct *vm_ops;

	/* Information about our backing store: */
	unsigned long vm_pgoff;		/* Offset (within vm_file) in PAGE_SIZE
					   units */
	struct file * vm_file;		/* File we map to (can be NULL). */
	void * vm_private_data;		/* was vm_pte (shared mem) */

#ifdef CONFIG_ANON_VMA_NAME
	/*
	 * For private and shared anonymous mappings, a pointer to a null
	 * terminated string containing the name given to the vma, or NULL if
	 * unnamed. Serialized by mmap_lock. Use anon_vma_name to access.
	 */
	struct anon_vma_name *anon_name;
#endif
#ifdef CONFIG_SWAP
	atomic_long_t swap_readahead_info;
#endif
#ifndef CONFIG_MMU
	struct vm_region *vm_region;	/* NOMMU mapping region */
#endif
#ifdef CONFIG_NUMA
	struct mempolicy *vm_policy;	/* NUMA policy for the VMA */
#endif
#ifdef CONFIG_NUMA_BALANCING
	struct vma_numab_state *numab_state;	/* NUMA Balancing state */
#endif
	struct vm_userfaultfd_ctx vm_userfaultfd_ctx;
} __randomize_layout;
```

Perhaps understandably, there’s a lot going on here! But this is the structure, referred to as a `vma`, that describes the virtual memory areas of a process. For example, you can see at the top `vm_start` and `vm_end` define the star and end addresses of the vma; just below that `vm_mm` holds a reference to the `mm` the vma belongs etc.

We’ll touch more on each field as it becomes relevant, but I just wanted to introduce the structure here rather than trying to wedge it in when it crops up down the line.

#### mm->mm_mt

Okay, so a vma describes a single memory area, but as we saw, even our little program has quite a few memory areas - how are these all managed? Good question!

Each process is responsible for tracking its memory areas, and as we know, each process’s memory is managed by a [`mm_struct`](https://elixir.bootlin.com/linux/v6.11.5/source/include/linux/mm_types.h#L779)! So this is where we’ll find our answer:

```fallback
struct mm_struct {
		// SNIP
		struct maple_tree mm_mt;
```

[include/linux/mm_types.h](https://elixir.bootlin.com/linux/v6.11.5/source/include/linux/mm_types.h#L779)

Previously, this would have been `struct rb_root mm_rb;`, but since 6.1 the kernel moved from red-black trees to the [`maple_tree`](https://elixir.bootlin.com/linux/v6.11.5/source/include/linux/maple_tree.h#L219) data structure for vma management.

I’m but a humble researcher, so if you’re interested in diving more into maple tree internals, this [LWN article](https://lwn.net/Articles/845507/) does a great job introducing maple trees (alternatively, head straight to the [kernel docs](https://docs.kernel.org/core-api/maple_tree.html)). Suffice it to say it’s a cache-optimised, low memory footprint data structure ideal for storing non-overlapping ranges - perfect for vmas!

The key details to highlight are that:

-   `mm_mt` is the tree of vmas belonging to the `mm_struct` ’s process,
-   A VMA is represented as a node within the tree, but the tree is also able to track gaps between these VMAs (i.e. gaps in the virtual address space)
-   The maple tree data structure comes with its own normal and advanced API, but there are also a set of wrapper functions specifically for handling vma maple tree usage

### do_mmap()

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c9fa4ed62380ae3c.gif)

```c
/*
 * The caller must write-lock current->mm->mmap_lock.
 */
unsigned long do_mmap(struct file *file, unsigned long addr,
			unsigned long len, unsigned long prot,
			unsigned long flags, vm_flags_t vm_flags,
			unsigned long pgoff, unsigned long *populate,
			struct list_head *uf)
{
```

[mm/mmap.c](https://elixir.bootlin.com/linux/v6.11.5/source/mm/mmap.c#L1255)

Okay, let’s get back to it! For some context, upon entering [`do_mmap()`](https://elixir.bootlin.com/linux/v6.11.5/source/mm/mmap.c#L1255):

-   `file` is NULL as we’re mapping anonymous memory ([`MAP_ANONYMOUS`](https://elixir.bootlin.com/linux/v6.11.5/source/include/uapi/asm-generic/mman-common.h#L23)), i.e. we’re not mapping a file into our userspace process, but a chunk of “anonymous” physical memory.
-   `vm_flags` stores the flags used for the virtual memory mapping we’re creating. In this case, the caller [`vm_mmap_pgoff()`](https://elixir.bootlin.com/linux/v6.11.5/source/mm/util.c#L575) does not specify any flags.
-   `populate` is an `unsigned long*` initialised by `do_mmap()` and read by the caller, to determine if the mapping should be “populated” before returning to userspace. We’ll touch more on the significance of that later, just know that a mapping is populated when `MAP_POPULATE` is set and `MAP_NONBLOCK` is not (so not our case study).
-   `uf`, which relates to [`userfaultfd(2)`](https://man7.org/linux/man-pages/man2/userfaultfd.2.html), is a linked list initialised by the caller. It’s not touched in `do_mmap()` and probably out of scope for this series anyway, so we’ll ignore it for now.
-   `addr`, `len`, `prot`, `flags`, `pgoff` all correspond to the same values we passed into `mmap(2)` from our userspace program.

Okay, so what’s the goal of this function? We know from exploring the previous functions in the call stack that the return value is the value that `mmap(2)` returns to userspace: on success, the userspace address of the mapping; on error, the `MAP_FAILED` value (`(void *) -1`). So where does `do_mmap(2)` ’s return value come from?

```c
unsigned long do_mmap(struct file *file, unsigned long addr,
			unsigned long len, unsigned long prot,
			unsigned long flags, vm_flags_t vm_flags,
			unsigned long pgoff, unsigned long *populate,
			struct list_head *uf)
{
	// SNIP
	addr = mmap_region(file, addr, len, vm_flags, pgoff, uf);
	// SNIP
	return addr;
}
```

[mm/mmap.c](https://elixir.bootlin.com/linux/v6.11.5/source/mm/mmap.c#L1255)

Hm, so it looks like the rabbit hole goes deeper! `do_mmap(2)` ’s job is to process and sanitise its arguments so that they can be passed to `mmap_region(2)` which sets up up the actual memory mapping (right??? surely there’s no more calls).

More specifically, `do_mmap()` has a few responsibilities, including:

-   Sanitising values and performing any necessary checks, such as preventing overflows or stopping the user exceeding the maximum mapping count defined by [`sysctl_max_map_count`](https://elixir.bootlin.com/linux/v6.11.5/source/include/linux/mm.h#L202).
-   Calculating the correct `vm_flags`, which are later applied to the `struct vm_area_struct` created for this mapping, based off of various factors such as `prot`, `flags`, `mm->def_flags` etc.
-   Determining what userspace virtual address, stored in `addr`, is passed to [`mmap_region()`](https://elixir.bootlin.com/linux/v6.11.5/source/mm/mmap.c#L2849).

#### Finding A Suitable addr

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/25d480d33358a9e4.gif)

In order to find a suitable `addr` for our new memory mapping, broadly speaking, there’s two general cases for `do_mmap()` to consider:

-   Case A: `flags` includes `MAP_FIXED | MAP_FIXED_NOREPLACE`
-   Case B: `flags` doesn’t include `MAP_FIXED | MAP_FIXED_NOREPLACE` (our case)

For Case A, the fixed `addr` specified by the user is passed to `mmap_region()`. However, the virtual address range spanned by this new mapping (`addr` to `addr + len`) might overlap existing ones. The default behaviour is to unmap the overlapped part. If `MAP_FIXED_NOREPLACE` is set though, `do_mmap()` will return `-EEXIST` if the new mapping will end up overlapping any existing ones.

Otherwise, in case B, the kernel will determine the `addr`. The value of `addr` passed by the user is actually used as a hint about where to place the mapping. Note the “hint” `addr` is page aligned and rounded to a minimum value of `mmap_min_addr` \[1\] by [`round_hint_to_min()`](https://elixir.bootlin.com/linux/v6.11.5/source/mm/mmap.c#L1194) (which will happen in our case, as `addr == 0`).

In either case, [`__get_unmapped_area()`](https://elixir.bootlin.com/linux/v6.11.5/source/mm/mmap.c#L1923) is called to determine an appropriate `addr`:

```c
	/* Obtain the address to map to. we verify (or select) it and ensure
	 * that it represents a valid section of the address space.
	 */
	addr = __get_unmapped_area(file, addr, len, pgoff, flags, vm_flags);
	if (IS_ERR_VALUE(addr))
		return addr;
```

[mm/mmap.c](https://elixir.bootlin.com/linux/v6.11.5/source/mm/mmap.c#L1325)

To avoid getting to lost in the sauce, we’ll skim over this function. Essentially it does some more sanitisation and checks. This includes another LSM hook (`mmap_addr`) on the `addr` yielded at the end of this function, as well as an arch specific check (`arch_mmap_check()`) which is currently only used by `arm` and `sparc`.

The approach used to get the unmapped area depends on a few factors:

-   If its a file, some file types may implement their own method to get an area.
-   If it’s a shared anonymous mapping, rather than directly allocating physical memory it actually uses a special shmem (shared memory) file (maybe we’ll touch on this later)
-   Finally, if neither case (i.e. `MAP_PRIVATE | MAP_ANON`), it will use either [`thp_get_unmapped_area_vmflags()`](https://elixir.bootlin.com/linux/v6.11.5/source/mm/huge_memory.c#L926) (if `CONFIG_TRANSPARENT_HUGEPAGE=y`) or [`mm_get_unmapped_area_vmflags()`](https://elixir.bootlin.com/linux/v6.11.5/source/mm/mmap.c#L1911) - this is the case we’re interested in!

Transparent Huge Pages (THPs) are a kernel feature for … you guessed it! Enabling huge pages, transparently! Currently for anonymous memory mappings and tmpfs/shmem.

If we recall our [page primer](https://sam4k.com/linternals-memory-allocators-part-1/#page-primer), pages are typically defined as 4KB (`0x1000` bytes) chunks of physical memory. A “huge page” here is 2M (`0x200000` bytes) in size. So the tl;dr here is that `thp_get_unmapped_area_vmflags()` will try and align the `addr` to a 2M boundary so that it can be used as a huge page automatically (AKA transparently!). It’s okay if this doesn’t make total sense yet, as we’ll cover paging in more detail soon!

Either way it will end up using `mm_get_unmapped_area_vmflags()`, so that’s where we’ll go next! Well, briefly. Because this function will then call into an arch specific function depending on if the `MMF_TOPDOWN` bit is set in our processes’ `mm->flags`. This determines whether we’ll search from the top or bottom of our address space for an unmapped area.

On x86_64 this is set, which leads us to [`arch_get_unmapped_area_topdown_vmflags()`](https://elixir.bootlin.com/linux/v6.11.5/source/arch/x86/kernel/sys_x86_64.c#L161):

```fallback
(gdb) bt
#0  arch_get_unmapped_area_topdown_vmflags (filp=0x0 <fixed_percpu_data>, addr0=0, len=4096, pgoff=0, flags=34, vm_flags=115)
    at arch/x86/kernel/sys_x86_64.c:164
#1  0xffffffff81244143 in mm_get_unmapped_area_vmflags (mm=<optimized out>, filp=filp@entry=0x0 <fixed_percpu_data>, addr=addr@entry=0, 
    len=len@entry=4096, pgoff=pgoff@entry=0, flags=flags@entry=34, vm_flags=115) at mm/mmap.c:1917
#2  0xffffffff81294a5d in thp_get_unmapped_area_vmflags (filp=0x0 <fixed_percpu_data>, addr=0, len=4096, pgoff=0, flags=34, vm_flags=115)
    at mm/huge_memory.c:937
#3  thp_get_unmapped_area_vmflags (filp=0x0 <fixed_percpu_data>, addr=0, len=len@entry=4096, pgoff=0, flags=34, vm_flags=115)
    at mm/huge_memory.c:926
#4  0xffffffff81244284 in __get_unmapped_area (file=file@entry=0x0 <fixed_percpu_data>, addr=<optimized out>, len=len@entry=4096, 
    pgoff=<optimized out>, pgoff@entry=0, flags=flags@entry=34, vm_flags=vm_flags@entry=115) at mm/mmap.c:1957
#5  0xffffffff8124725d in do_mmap (file=file@entry=0x0 <fixed_percpu_data>, addr=<optimized out>, addr@entry=0, len=len@entry=4096, 
    prot=prot@entry=3, flags=flags@entry=34, vm_flags=115, vm_flags@entry=0, pgoff=0, populate=0xffffc9000076bee8, uf=0xffffc9000076bef0)
    at mm/mmap.c:1325
#6  0xffffffff812160c7 in vm_mmap_pgoff (file=0x0 <fixed_percpu_data>, addr=0, len=4096, prot=3, flag=34, pgoff=0) at mm/util.c:588
#7  0xffffffff81f8e8fe in do_syscall_x64 (regs=0xffffc9000076bf58, nr=<optimized out>) at arch/x86/entry/common.c:52
#8  do_syscall_64 (regs=0xffffc9000076bf58, nr=<optimized out>) at arch/x86/entry/common.c:83
#9  0xffffffff82000130 in entry_SYSCALL_64 () at arch/x86/entry/entry_64.S:121
```

We made it! Okay, let’s dig into how the address is fetched by walking through the function. There are various checks but for brevity I will focus on the addr finding:

```c
unsigned long
arch_get_unmapped_area_topdown_vmflags(struct file *filp, unsigned long addr0,
			  unsigned long len, unsigned long pgoff,
			  unsigned long flags, vm_flags_t vm_flags)
{
	struct vm_area_struct *vma;
	struct mm_struct *mm = current->mm;
	unsigned long addr = addr0;
	struct vm_unmapped_area_info info = {};
    
	// SNIP
    
	if (flags & MAP_FIXED)
		return addr;
```

[arch/x86/kernel/sys_x86_64.c](https://elixir.bootlin.com/linux/v6.11.5/source/arch/x86/kernel/sys_x86_64.c#L161)

If `MAP_FIXED` is set, `addr` is returned as-is, no questions asked.

```c
	if (addr) {
		addr &= PAGE_MASK;                              [0]
		if (!mmap_address_hint_valid(addr, len))        [1]
			goto get_unmapped_area;

		vma = find_vma(mm, addr);                       [2]
		if (!vma || addr + len <= vm_start_gap(vma))
			return addr;                            [3]
	}
```

[arch/x86/kernel/sys_x86_64.c](https://elixir.bootlin.com/linux/v6.11.5/source/arch/x86/kernel/sys_x86_64.c#L161)

If a hint is set (i.e. `addr != 0`) then the function will check if that address range is free. It does this by first making sure the `addr` is page aligned \[0\] and does *another* validation check on the `addr` \[1\]. The comment for [`mmap_address_hint_valid()`](https://elixir.bootlin.com/linux/v6.11.5/source/arch/x86/mm/mmap.c#L209) does a good job describing why this check is needed!

To check if the address range our new mapping will use is free, it calls [`find_vma()`](https://elixir.bootlin.com/linux/v6.11.5/source/mm/mmap.c#L2014) \[2\] - this function returns the first memory region at or AFTER `addr` in our `mm`. If no mapping is returned (`!vma`) then the address space after `addr` is free and we’re good to go.

However, if there is a mapping somewhere at or after `addr`, we need to make sure it starts AFTER the end of our new mapping. It does this by comparing where our new mapping will end (`addr + len`) and the start address of the `vma` ([`vm_start_gap(vma)`](https://elixir.bootlin.com/linux/v6.11.5/source/include/linux/mm.h#L3513); the `gap` part is because the function factors in any potential padding). If there’s no overlap, our mapping’s area is unmapped and we can use the hint! \[3\]

```c
struct vm_unmapped_area_info {
	unsigned long flags;        // informs search behaviour
	unsigned long length;       // length of the mapping in bytes
	unsigned long low_limit;    // lowest vaddr to start at
	unsigned long high_limit;   // highest vaddr to end at
	unsigned long align_mask;   // alignment mask the addr must satisfy
	unsigned long align_offset; // 
	unsigned long start_gap;    // minimum gap required before mapping
};
```

[include/linux/mm.h](https://elixir.bootlin.com/linux/v6.11.5/source/include/linux/mm.h#L3443)

If the hint isn’t valid or overlaps an existing mapping, the function will proceed to the `get_unmapped_area` label which will populate the [`struct vm_unmapped_area_info`](https://elixir.bootlin.com/linux/v6.11.5/source/include/linux/mm.h#L3443), which describes the properties and constraints of our new mapping.

Remember, as we’re searching topdown, `high_limit` defines the start point (base) for our search. So how is this calculated? By default, the function will use the value that is handily stored in `mm->mmap_base` (the base user vaddr for topdown allocations). But what is this?

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e36a49fe1ef3b150.png)

From [these slides](https://www.slideshare.net/slideshow/process-address-space-the-way-to-create-virtual-address-page-table-of-userspace-application-251425396/251425396#3) by Adrian Huang

Let’s remind ourselves of the x86_64 process virtual address space. We can see that `mm->mmap_base` sits at the upper end of the address space, just below the stack (and its guard gap). This diagram is the “canonical” address space and assumes a typical 47-bits (out of the 64, on a 64-bit system) are used for the virtual address.

However, more bits may be used for the virtual address on some systems. So while the implementation defaults to `mmap_base` as the `high_limit`, if the hint is outside of this window, then the `high_limit` will instead be set to the true upper bounds of the user virtual address space (where `TASK_SIZE_MAX` defines the size virtual user address space).

```c
	info.high_limit = get_mmap_base(0);
	// SNIP

	/*
	 * If hint address is above DEFAULT_MAP_WINDOW, look for unmapped area
	 * in the full address space.
	 *
	 * !in_32bit_syscall() check to avoid high addresses for x32
	 * (and make it no op on native i386).
	 */
	if (addr > DEFAULT_MAP_WINDOW && !in_32bit_syscall())
		info.high_limit += TASK_SIZE_MAX - DEFAULT_MAP_WINDOW;
```

[arch/x86/kernel/sys_x86_64.c](https://elixir.bootlin.com/linux/v6.11.5/source/arch/x86/kernel/sys_x86_64.c#L161)

The `info` structure is then passed to [`vm_unmapped_area(&info)`](https://elixir.bootlin.com/linux/v6.11.5/source/mm/mmap.c#L1765) which will do the search. As we specify `VM_UNMAPPED_AREA_TOPDOWN` in `flags`, it uses the [`unmapped_area_topdown(info)`](https://elixir.bootlin.com/linux/v6.11.5/source/mm/mmap.c#L1714) implementation.

Using the magic of gdb, we can set a breakpoint to examine the `info` structure for our program’s mapping to make sure everything aligns with our understanding:

```fallback
(gdb) p/x *((struct vm_unmapped_area_info*)info)
$2 = {
  flags = VM_UNMAPPED_AREA_TOPDOWN, 
  length = 0x1000,                  // our mapping len
  low_limit = 0x1000,               // default low_limit
  high_limit = 0x7f4bc62a3000,      // mmap_base (highest bit set is 47)
  align_mask = 0x0, 
  align_offset = 0x0, 
  start_gap = 0x0
}
```

Now `unmapped_area_topdown()` has all the information it needs to search the address space from `high_limit` to `low_limit`, looking for a gap that fits our mapping of `len` (taking into account any alignment or gaps required before the mapping):

```fallback
static unsigned long unmapped_area_topdown(struct vm_unmapped_area_info *info)
{
	// SNIP
	VMA_ITERATOR(vmi, current->mm, 0);
		
	// SNIP
    
	if (vma_iter_area_highest(&vmi, low_limit, high_limit, length))
		return -ENOMEM;

	gap = vma_iter_end(&vmi) - info->length;
	gap -= (gap - info->align_offset) & info->align_mask;
	gap_end = vma_iter_end(&vmi);
```

[mm/mmap.c](https://elixir.bootlin.com/linux/v6.11.5/source/mm/mmap.c#L1714)

Remember those maples trees we spoke about at the beginning? Well now it’s all going to come in handy! [`VMA_ITERATOR()`](https://elixir.bootlin.com/linux/v6.11.5/source/include/linux/mm_types.h#L1114) is a macro used to initialise an iterator, `vmi`, for iterating (!) the vmas of a process (our `current->mm` in this case).

The main logic is then handled by the handy [`vma_iter_area_highest()`](https://elixir.bootlin.com/linux/v6.11.5/source/mm/internal.h#L1411). This function wraps the advanced maple tree API, `mas_empty_area_rev()`, to find the first gap (i.e. a range not spanned by a node/vma) of `length` bytes, working from `high_limit` down to `low_limit`. And just like that we’ve done our topdown search!

There are then some additional checks to make sure it conforms with the supplied `info` plus some additional error cases but that’s the general gist of it. We did it! That’s how we find an unused virtual address for our mapping … at least for the default topdown case on an x86_64 system …

For context, this is where we are in the callstack at this point:

```fallback
#0  0xffffffff81243e86 in unmapped_area_topdown (info=<optimized out>) at mm/mmap.c:1719
#1  vm_unmapped_area (info=info@entry=0xffffc900004b7d80) at mm/mmap.c:1770
#2  0xffffffff81037ce5 in arch_get_unmapped_area_topdown_vmflags (filp=0x0 <fixed_percpu_data>, addr0=0, len=4096, pgoff=0, flags=34, 
    vm_flags=<optimized out>) at arch/x86/kernel/sys_x86_64.c:219
#3  0xffffffff81244143 in mm_get_unmapped_area_vmflags (mm=<optimized out>, filp=filp@entry=0x0 <fixed_percpu_data>, addr=addr@entry=0, 
    len=len@entry=4096, pgoff=pgoff@entry=0, flags=flags@entry=34, vm_flags=115) at mm/mmap.c:1917
#4  0xffffffff81294a5d in thp_get_unmapped_area_vmflags (filp=0x0 <fixed_percpu_data>, addr=0, len=4096, pgoff=0, flags=34, vm_flags=115)
    at mm/huge_memory.c:937
#5  thp_get_unmapped_area_vmflags (filp=0x0 <fixed_percpu_data>, addr=0, len=len@entry=4096, pgoff=0, flags=34, vm_flags=115)
    at mm/huge_memory.c:926
#6  0xffffffff81244284 in __get_unmapped_area (file=file@entry=0x0 <fixed_percpu_data>, addr=<optimized out>, len=len@entry=4096, 
    pgoff=<optimized out>, pgoff@entry=0, flags=flags@entry=34, vm_flags=vm_flags@entry=115) at mm/mmap.c:1957
#7  0xffffffff8124725d in do_mmap (file=file@entry=0x0 <fixed_percpu_data>, addr=<optimized out>, addr@entry=0, len=len@entry=4096, 
    prot=prot@entry=3, flags=flags@entry=34, vm_flags=115, vm_flags@entry=0, pgoff=0, populate=0xffffc900004b7ee8, uf=0xffffc900004b7ef0)
    at mm/mmap.c:1325
#8  0xffffffff812160c7 in vm_mmap_pgoff (file=0x0 <fixed_percpu_data>, addr=0, len=4096, prot=3, flag=34, pgoff=0) at mm/util.c:588
#9  0xffffffff81f8e8fe in do_syscall_x64 (regs=0xffffc900004b7f58, nr=<optimized out>) at arch/x86/entry/common.c:52
#10 do_syscall_64 (regs=0xffffc900004b7f58, nr=<optimized out>) at arch/x86/entry/common.c:83
```

We’re going to head back up to `do_mmap()` and cover the final bit of logic for the mapping process: `mmap_region()`.

### mmap_region()

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/913d50c82e55ff2a.gif)

```fallback
	addr = mmap_region(file, addr, len, vm_flags, pgoff, uf);
```

[mm/mmap.c](https://elixir.bootlin.com/linux/v6.11.5/source/mm/mmap.c#L1468)

Okay! Can you believe we’re still on the first system call of our “simple” program?! There’s not long left now though! We’re back in `do_mmap()` and the pieces are set:

-   `file` is NULL as we’re mapping anonymous memory, not a file, in our address space
-   `addr`, as we’ve just painstakingly discovered, now contains a suitable virtual address for our mapping
-   `len` is the length of our mapping in bytes
-   `vm_flags` has been populated in `do_mmap()` from a combination of the `prot` and `flags` we passed to `mmap()` as well as the `mm->def_flags`
-   `pgoff` is zero, right? hah, well … for anonymous `MAP_PRIVATE` mappings, `do_mmap()` will set `pgoff = addr >> PAGE_SHIFT;`. But `pgoff` is for file offsets, and we’re not mapping a file?! The tl;dr here is this acts as an identifier for anonymous vmas (I’m sure we’ll touch on this later).
-   `uf`, the userfault list stuff, is still untouched and probably still out of scope for the post

Now we’re ready to jump into `mmap_region()`! The goal of this function is to do the actual “mapping” part of `mmap()`, which essentially means making sure our mapping (`len` bytes at `addr` with `vm_flags` properties) is represented by a `struct vm_area_struct` and stored in the `mm->mm_mt`. Sounds simple enough, right?

Well … as you might expect, there are a lot of cases, edge cases and validation that needs to be done to do this correctly. For now we’ll continue to focus on those relating specifically to anonymous mappings and our case study.

```fallback
unsigned long mmap_region(struct file *file, unsigned long addr,
		unsigned long len, vm_flags_t vm_flags, unsigned long pgoff,
		struct list_head *uf)
{
	struct mm_struct *mm = current->mm;
	struct vm_area_struct *vma = NULL;
	struct vm_area_struct *next, *prev, *merge;
// SNIP
	VMA_ITERATOR(vmi, mm, addr);
```

[mm/mmap.c](https://elixir.bootlin.com/linux/v6.11.5/source/mm/mmap.c#L2849)

Right off the bat we can see the `VMA_ITERATOR()` macro again, which will be doing a lot of heavy lifting in this function for navigating the `mm->mm_t` maple tree. Note that it’s initialised with our `addr`, so the iterator will be initialised with `addr` as its index.

```fallback
	/* Check against address space limit. */
	if (!may_expand_vm(mm, vm_flags, len >> PAGE_SHIFT)) {
		unsigned long nr_pages;
		// SNIP     
	}

	/* Unmap any existing mapping in the area */
	error = do_vmi_munmap(&vmi, mm, addr, len, uf, false);
	// SNIP
```

[mm/mmap.c](https://elixir.bootlin.com/linux/v6.11.5/source/mm/mmap.c#L2849)

Next we do some housekeeping. First is a check to make sure “the calling process may expand its vm space by the passed number of pages” ( `len >> PAGE_SHIFT` is a quick way to convert `len` bytes to the page count equivalent). This involves checking against any resource limits.

Then, we hit a quirk of `MAP_FIXED` behaviour we touched one earlier. Notably, when looking for an unmapped area, by default we’ll get an `addr` that does not overlap any existing mappings for `len` bytes. However, if `MAP_FIXED` is passed, it will just use the `addr` passed by the user (as long as its valid), regardless of overlaps.

If it does overlap any existing mappings, these will get unmapped. This behaviour is implemented by `do_vmi_munmap()`, which uses the vma iterator to unmap any vmas whose start address lies in `addr` to `addr + len`. Note mappings can be “sealed” [\[2\]](https://www.kernel.org/doc/html/next/userspace-api/mseal.html) and can’t be unmapped like this, causing the current `mmap()` to fail.

```c
	next = vma_next(&vmi);
	prev = vma_prev(&vmi);
```

[mm/mmap.c](https://elixir.bootlin.com/linux/v6.11.5/source/mm/mmap.c#L2849)

Next, the iterator is used to fetch first vma from where the iterator starts (i.e. the next vma after `addr`) and the first vma prior to where the iterator stars (i.e. the first vma before `addr`). `mmap_region()` will then check the following cases:

-   Can we merge the new mapping with the `next` vma instead of creating a new `vma`?
-   Can we merge the new OR merged mapping with the `prev` vma?
-   Some mappings, denoted by `VM_SPECIAL`, can’t be merged.
-   If no merging is possible, allocate a new `vma`, initialise it and insert it into the `mm->mm_mt`

#### VMA Merging

```fallback
	/* Attempt to expand an old mapping */
	/* Check next */
	if (next && next->vm_start == end && !vma_policy(next) &&
	    can_vma_merge_before(next, vm_flags, NULL, file, pgoff+pglen,
				 NULL_VM_UFFD_CTX, NULL)) {
```

[mm/mmap.c](https://elixir.bootlin.com/linux/v6.11.5/source/mm/mmap.c#L2849)

A few things need to be checked to determine if we can expand an existing vma, instead of allocating a new `struct vm_area_struct` for our new mapping.

Let’s look at the first case: can we merge the new mapping with the `next` vma? First, there needs to be a `next` mapping and it needs to be adjacent to where our new mapping would go (i.e. the end of our new mapping, is the start of `next`).

Then `!`[`vma_policy(next)`](https://elixir.bootlin.com/linux/v6.11.5/source/include/linux/mm_types.h#L765) makes sure `next` doesn’t have it’s own specific NUMA policy (memory stuff, stored in `vma->vm_policy`). Finally [`can_vma_merge_before()`](https://elixir.bootlin.com/linux/v6.11.5/source/mm/mmap.c#L813) carries out this remaining checks, which basically involves:

-   Checking if the `vm_flags`, `file` etc. are compatible. Also, if it has it’s own `vma->vm_ops->close` to be called when the vma is closed, it won’t be merged.
-   If `next` is an anonymous vma cloned from a parent process, it won’t be merged.

If these checks are passed, `next` will be expanded to include our new mapping. Either way, similar checks will then be made for `prev`. If those checks pass, either:

-   `next` didn’t merge, in which case we’ll expand `prev` to include the new mapping
-   `next` did merge, in which case `prev` will be expanded to include the new mapping AND `next`.

If these checks fail a vma will be allocated for our new mapping.

#### VMA Allocation

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a4c124c1468de580.gif)

So, there’s no one for our mapping to merge with. In this case, a new vma will be allocated, initialised and insert into the `mm->mm_mt` tree:

```c
	vma = vm_area_alloc(mm);                           [0]
	// SNIP

	vma_iter_config(&vmi, addr, end);                  [1]
	vma_set_range(vma, addr, end, pgoff);              [2]
	vm_flags_init(vma, vm_flags);                      [3]
	vma->vm_page_prot = vm_get_page_prot(vm_flags);    [4]

	if (file) {                                        [5]
		// SNIP
	} else if (vm_flags & VM_SHARED) {                 [6]
		// SNIP
	} else {                                           [7]
		vma_set_anonymous(vma);
	}

	if (map_deny_write_exec(vma, vma->vm_flags)) {     [8]
		error = -EACCES;
		goto close_and_free_vma;
	}

	/* Allow architectures to sanity-check the vm_flags */
	error = -EINVAL;
	if (!arch_validate_flags(vma->vm_flags))
		goto close_and_free_vma;

	error = -ENOMEM;
	if (vma_iter_prealloc(&vmi, vma))                  [9]
		goto close_and_free_vma;

	/* Lock the VMA since it is modified after insertion into VMA tree */
	vma_start_write(vma);                              [10]
	vma_iter_store(&vmi, vma);                         [11]
	mm->map_count++;                                   [12]
```

[mm/mmap.c](https://elixir.bootlin.com/linux/v6.11.5/source/mm/mmap.c#L2849)

Most of this is fairly straightforward: we allocate a new `struct vm_area_struct` \[0\], update the iterator \[1\], update the `vma` start/end/pgoff \[2\], its flags and protections \[3\]\[4\].

Next, there’s some mapping type specific initialisation depending on if its a file-backed \[5\], shared anonymous \[6\] or private anonymous mapping \[7\]. In this case, [`vma_set_anonymous()`](https://elixir.bootlin.com/linux/v6.11.5/source/include/linux/mm.h#L909) simply sets `vma->vm_ops = NULL`. This field being NULL is what determines it as (private) anonymous vma (as seen by the equivalent [`vma_is_anonymous()`](https://elixir.bootlin.com/linux/v6.11.5/source/include/linux/mm.h#L914) check).

There is then a security check \[8\], [`map_deny_write_exec()`](https://elixir.bootlin.com/linux/v6.11.5/source/include/linux/mman.h#L192), which will prevent the creation of mapping with write and execute permissions if the `mm` has the `MMF_HAS_MDWE` flag set (note a similar check is also done by selinux via the `mmap_file` hook).

Finally, our `vma` is ready to be inserted into the `mm->mm_mt`, this is done by first preallocating enough nodes for the insertion (store) \[9\].

Then, if `CONFIG_PER_VMA_LOCK=y`, the per-vma write lock will be taken \[10\], which acts as a r/w semaphore in practice. This is interesting, because you might notice there is no subsequent [`vma_start_write()`](https://elixir.bootlin.com/linux/v6.11.5/source/include/linux/mm.h#L740). That’s because all vma write locks are unlocked automatically when the mmap write lock is released, [read more here](https://docs.kernel.org/mm/process_addrs.html#locking).

Finally our new mapping is inserted into the `mm->mm_mt` tree via the iterator \[11\], using [`vma_iter_store()`](https://elixir.bootlin.com/linux/v6.11.5/source/mm/internal.h#L1437), and the processes’ total mapping count is updated \[12\].

### Final Bits

```c
	vm_stat_account(mm, vm_flags, len >> PAGE_SHIFT);
	// SNIP
    
	/*
	 * New (or expanded) vma always get soft dirty status.
	 * Otherwise user-space soft-dirty page tracker won't
	 * be able to distinguish situation when vma area unmapped,
	 * then new mapped in-place (which must be aimed as
	 * a completely new data area).
	 */
	vm_flags_set(vma, VM_SOFTDIRTY);

	vma_set_page_prot(vma);

	validate_mm(mm);
	return addr;
```

[mm/mmap.c](https://elixir.bootlin.com/linux/v6.11.5/source/mm/mmap.c#L2849)

There’s some bits we’ve skipped related to files or huge pages, but eventually we’ll get here to the end of the function (we’re almost there!!). So what’s left to do?

Some accounting of course! [`vm_stat_account()`](https://elixir.bootlin.com/linux/v6.11.5/source/mm/mmap.c#L3612) updates various `mm` stat fields tracking the types of mappings, including: `mm->total_vm` (total pages), `mm->exec_vm`, `mm->stack_vm` and `mm->data_vm` (private, writable, not stack).

Now, regardless of whether this is a new or expanded vma, the `VM_SOFTDIRTY` flag is set. Dirty is memory management speech for “this has been modified btw!”. Typically this is in the context of changes to a file in memory that aren’t written to disk yet. Here, if `CONFIG_MEM_SOFT_DIRTY=y`, is used this bit is set to indicate that that the vma has been modified (as I understand it, the “soft” part means it doesn’t require immediate action by the kernel, but will be checked when the next relevant action is taken). We’ll touch more on what these “actions” are in the next section when we cover paging.

[`vma_set_page_prot()`](https://elixir.bootlin.com/linux/v6.11.5/source/mm/mmap.c#L90) will update `vma->vm_page_prot` to reflect `vma->vm_flags`. Next is [`validate_mm()`](https://elixir.bootlin.com/linux/v6.11.5/source/mm/mmap.c#L322), which is a debugging function that validates the state of the memory mappings. This is only enabled on debug builds with `CONFIG_DEBUG_VM_MAPLE_TREE=y`.

And last, but not least, we return the `addr` of our new mapping, which will propagate back, if all is valid, to the return value of the userspace `mmap()` call.

```fallback
#0  mmap_region (file=file@entry=0x0 <fixed_percpu_data>, addr=addr@entry=140379443372032, len=len@entry=4096, vm_flags=vm_flags@entry=115, 
    pgoff=pgoff@entry=34272325042, uf=uf@entry=0xffffc900006bbef0) at mm/mmap.c:2852
#1  0xffffffff81247544 in do_mmap (file=file@entry=0x0 <fixed_percpu_data>, addr=140379443372032, addr@entry=0, len=len@entry=4096, 
    prot=<optimized out>, prot@entry=3, flags=flags@entry=34, vm_flags=<optimized out>, vm_flags@entry=0, pgoff=<optimized out>, 
    populate=0xffffc900006bbee8, uf=0xffffc900006bbef0) at mm/mmap.c:1468
#2  0xffffffff812160c7 in vm_mmap_pgoff (file=0x0 <fixed_percpu_data>, addr=0, len=4096, prot=3, flag=34, pgoff=0) at mm/util.c:588
#3  0xffffffff81f8e8fe in do_syscall_x64 (regs=0xffffc900006bbf58, nr=<optimized out>) at arch/x86/entry/common.c:52
#4  do_syscall_64 (regs=0xffffc900006bbf58, nr=<optimized out>) at arch/x86/entry/common.c:83
#5  0xffffffff82000130 in entry_SYSCALL_64 () at arch/x86/entry/entry_64.S:121
```

Not much happens when we return back to `do_mmap()`, other than deciding how many pages, if any, need to be populated, before returning to `vm_mmap_pgoff()`. This function will then drop the mmap write lock and do any relevant userfaultfd and population bits.

Although out of scope, populating a mapping essentially involves doing what we’re going to cover in the next section (writing to memory) now, instead of waiting to access it.

Then we’re pretty much back in userspace, with a shiny new (or merged) mapping!

### Summary

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/48e6710e611c8f4f.gif)

It’s only been, uh, 6000 words or so but just like that we’ve covered this line of code:

```fallback
addr = mmap(NULL, 0x1000, PROT_READ | PROT_WRITE, MAP_ANONYMOUS | MAP_PRIVATE, -1, 0);
```

We did a whistle-stop (?!) tour of the `mmap()` system call, focusing on how private, anonymous mappings are created and managed by the kernel.

We got some first hand experience of how the `struct mm_struct` helps manages a processes memory, including the `mm->mm_mt` tree which tracks the memory areas within the processes virtual address space, which are represented by `struct vm_area_struct`.

We also dived into some implementation details, covering some of the security mechanisms and checks, how unused addresses for new mappings are found and the different cases that need to be considered when mapping a new region.

* * *

1.  If you’re curious why `mmap_min_addr` is a thing, this mitigation was added way back in 2009 for 2.X kernels. For context then, [check out this post from 2009](https://blog.cr0.org/2009/06/bypassing-linux-null-pointer.html) on bypassing it. For a bonus, there was [a semi recent P0 post](https://googleprojectzero.blogspot.com/2023/01/exploiting-null-dereferences-in-linux.html) about modern NULL ptr deref exploitation.
2.  [https://www.kernel.org/doc/html/next/userspace-api/mseal.html](https://www.kernel.org/doc/html/next/userspace-api/mseal.html)

## Next Time

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/34601ca86a37c75a.gif)

Wow, I may have got a bit lost in the sauce for this one (sorry)… Hopefully this is useful for someone. This time we covered the first portion of our simple program: mapping memory. Next time, we’ll move onto writing to memory. Buckle up, as that’ll involve a deep dive into how the kernel does all things (\*specifically pertaining to our case study) paging, starting with page faults and going from there (wish me luck).

That said, I think my next post might be more exploitation focused, both for my own sanity after this 6000 word linternals dump and also as it’s been a while since I published some security stuff. Anyways, like I said, I’m hoping this post bordered more on the “in depth but verbose walkthrough of linux internals” and not “mad ramblings of someone who overcommitted to an ambitious series”.

As always feel free to @me (on [X](https://twitter.com/sam4k1), [Bluesky](https://bsky.app/profile/sam4k.com) or less commonly used [Mastodon](https://infosec.exchange/@sam4k)) if you have any questions, suggestions or corrections:)
